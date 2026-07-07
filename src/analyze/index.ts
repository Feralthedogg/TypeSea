/**
 * @file analyze/index.ts
 * @brief Static schema analysis for performance and portability hints.
 * @details Analyzer output is advisory. It never changes validation behavior,
 * and it never executes user predicates, lazy resolvers, or runtime input code.
 */

import type { Guard, Presence } from "../guard/index.js";
import type { PathSegment } from "../issue/index.js";
import { PresenceTag, SchemaTag } from "../kind/index.js";
import { readGuardSchema } from "../internal/index.js";
import { isSchemaValue, type Schema } from "../schema/index.js";

/**
 * @brief Severity level assigned to an analyzer issue.
 */
export type SchemaAnalysisSeverity = "info" | "warning";

/**
 * @brief Closed set of analyzer issue codes.
 */
export type SchemaAnalysisCode =
    | "union_branch_scan"
    | "prefer_keyed_object"
    | "runtime_only_schema"
    | "json_schema_unsupported"
    | "aot_unsupported";

/**
 * @brief One static analysis observation.
 */
export interface SchemaAnalysisIssue {
    readonly path: readonly PathSegment[];
    readonly code: SchemaAnalysisCode;
    readonly severity: SchemaAnalysisSeverity;
    readonly message: string;
}

/**
 * @brief Complete analysis report for one schema root.
 */
export interface SchemaAnalysisReport {
    readonly issues: readonly SchemaAnalysisIssue[];
    readonly warnings: number;
    readonly infos: number;
}

const WIDE_UNION_THRESHOLD = 4;

/**
 * @brief Analyze a guard or raw schema for performance and export hints.
 * @param input Guard or schema to inspect.
 * @returns Frozen advisory report.
 * @throws TypeError when input is neither a TypeSea guard nor a valid schema.
 */
export function analyzeSchema(
    input: Guard<unknown, Presence> | Schema
): SchemaAnalysisReport {
    const schema = isSchemaValue(input)
        ? input
        : readGuardSchema(input, "analyzeSchema input");
    const issues: SchemaAnalysisIssue[] = [];
    analyzeSchemaInner(schema, [], issues, new WeakSet<object>());
    return freezeReport(issues);
}

/**
 * @brief Walk one schema node without executing dynamic user code.
 */
function analyzeSchemaInner(
    schema: Schema,
    path: readonly PathSegment[],
    issues: SchemaAnalysisIssue[],
    seen: WeakSet<object>
): void {
    if (seen.has(schema)) {
        return;
    }
    seen.add(schema);
    switch (schema.tag) {
        case SchemaTag.Array:
            analyzeSchemaInner(schema.item, path.concat("item"), issues, seen);
            return;
        case SchemaTag.Tuple:
            analyzeSchemaArray(schema.items, path.concat("items"), issues, seen);
            if (schema.rest !== undefined) {
                analyzeSchemaInner(schema.rest, path.concat("rest"), issues, seen);
            }
            return;
        case SchemaTag.Record:
            if (schema.key !== undefined) {
                analyzeSchemaInner(schema.key, path.concat("key"), issues, seen);
            }
            analyzeSchemaInner(schema.value, path.concat("value"), issues, seen);
            return;
        case SchemaTag.Map:
            pushIssue(path, issues, "json_schema_unsupported", "info", "Map validates JavaScript runtime objects and cannot be faithfully exported to JSON Schema.");
            analyzeSchemaInner(schema.key, path.concat("key"), issues, seen);
            analyzeSchemaInner(schema.value, path.concat("value"), issues, seen);
            return;
        case SchemaTag.Set:
            pushIssue(path, issues, "json_schema_unsupported", "info", "Set validates JavaScript runtime objects and cannot be faithfully exported to JSON Schema.");
            analyzeSchemaInner(schema.item, path.concat("item"), issues, seen);
            return;
        case SchemaTag.File:
            pushIssue(path, issues, "json_schema_unsupported", "info", "File validates JavaScript runtime objects and cannot be faithfully exported to JSON Schema.");
            pushIssue(path, issues, "aot_unsupported", "warning", "AOT modules cannot serialize host File object contracts yet.");
            return;
        case SchemaTag.InstanceOf:
        case SchemaTag.Property:
            pushIssue(path, issues, "json_schema_unsupported", "info", "This schema depends on JavaScript runtime object semantics and is not portable to JSON Schema.");
            return;
        case SchemaTag.Object:
            analyzeObjectEntries(schema.entries, path, issues, seen);
            if (schema.catchall !== undefined) {
                analyzeSchemaInner(
                    schema.catchall,
                    path.concat("catchall"),
                    issues,
                    seen
                );
            }
            return;
        case SchemaTag.Union:
            analyzeUnion(schema.options, path, issues, seen);
            return;
        case SchemaTag.Xor:
            analyzeSchemaArray(schema.options, path.concat("options"), issues, seen);
            return;
        case SchemaTag.Intersection:
            analyzeSchemaInner(schema.left, path.concat("left"), issues, seen);
            analyzeSchemaInner(schema.right, path.concat("right"), issues, seen);
            return;
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
        case SchemaTag.Nullable:
        case SchemaTag.Brand:
        case SchemaTag.Metadata:
        case SchemaTag.Message:
        case SchemaTag.KeyedObject:
        case SchemaTag.PropertyCount:
        case SchemaTag.Readonly:
            if (schema.tag === SchemaTag.KeyedObject) {
                pushIssue(path, issues, "prefer_keyed_object", "info", "This object uses a key-cardinality wrapper, so it avoids modeling key-count semantics as a wide union.");
            }
            if (schema.tag === SchemaTag.Readonly) {
                pushIssue(path, issues, "aot_unsupported", "warning", "Readonly wrappers freeze accepted values, which AOT cannot preserve yet.");
                pushIssue(path, issues, "json_schema_unsupported", "info", "JSON Schema cannot express Object.freeze output side effects.");
            }
            analyzeSchemaInner(schema.inner, path.concat("inner"), issues, seen);
            return;
        case SchemaTag.PropertyNames:
            analyzeSchemaInner(schema.inner, path.concat("inner"), issues, seen);
            analyzeSchemaInner(schema.key, path.concat("propertyNames"), issues, seen);
            return;
        case SchemaTag.PatternProperties:
            analyzeSchemaInner(schema.inner, path.concat("inner"), issues, seen);
            analyzePatternProperties(schema, path, issues, seen);
            return;
        case SchemaTag.DiscriminatedUnion:
            analyzeSchemaArray(
                readDiscriminatedUnionSchemas(schema.cases),
                path.concat("cases"),
                issues,
                seen
            );
            return;
        case SchemaTag.Lazy:
            pushIssue(path, issues, "runtime_only_schema", "warning", "Lazy schemas require runtime resolution and cannot be emitted as standalone AOT without support code.");
            return;
        case SchemaTag.Refine:
            pushIssue(path, issues, "runtime_only_schema", "warning", "Refinement predicates are user code; they remain runtime-only and block faithful JSON Schema/AOT export.");
            pushIssue(path, issues, "aot_unsupported", "warning", "AOT modules cannot serialize refinement predicates.");
            analyzeSchemaInner(schema.inner, path.concat("inner"), issues, seen);
            return;
        case SchemaTag.Date:
            pushIssue(path, issues, "json_schema_unsupported", "info", "Date validates JavaScript Date objects, not JSON date strings.");
            return;
        case SchemaTag.Unknown:
        case SchemaTag.Never:
        case SchemaTag.String:
        case SchemaTag.Number:
        case SchemaTag.BigInt:
        case SchemaTag.Symbol:
        case SchemaTag.Boolean:
        case SchemaTag.Literal:
            return;
    }
}

/**
 * @brief Analyze a union and then traverse its branches.
 */
function analyzeUnion(
    options: readonly Schema[],
    path: readonly PathSegment[],
    issues: SchemaAnalysisIssue[],
    seen: WeakSet<object>
): void {
    if (options.length >= WIDE_UNION_THRESHOLD && allOptionsAreObjectLike(options)) {
        pushIssue(
            path,
            issues,
            "union_branch_scan",
            "warning",
            "Wide object unions can force branch probing. Prefer discriminatedUnion when a literal tag exists, or keyed-object helpers when the union only encodes selected-key cardinality."
        );
        if (looksLikeKeyCardinalityUnion(options)) {
            pushIssue(
                path,
                issues,
                "prefer_keyed_object",
                "info",
                "This union has many single-required-key object branches. If the intent is key cardinality, model it with oneOfKeys(), exactlyOneKey(), or atLeastOneKey()."
            );
        }
    }
    analyzeSchemaArray(options, path.concat("options"), issues, seen);
}

/**
 * @brief Analyze a vector of child schemas.
 */
function analyzeSchemaArray(
    schemas: readonly Schema[],
    path: readonly PathSegment[],
    issues: SchemaAnalysisIssue[],
    seen: WeakSet<object>
): void {
    for (let index = 0; index < schemas.length; index += 1) {
        const schema = schemas[index];
        if (schema !== undefined) {
            analyzeSchemaInner(schema, path.concat(index), issues, seen);
        }
    }
}

/**
 * @brief Analyze object entry schemas.
 */
function analyzeObjectEntries(
    entries: readonly {
        readonly key: string;
        readonly schema: Schema;
    }[],
    path: readonly PathSegment[],
    issues: SchemaAnalysisIssue[],
    seen: WeakSet<object>
): void {
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry !== undefined) {
            analyzeSchemaInner(entry.schema, path.concat(entry.key), issues, seen);
        }
    }
}

/**
 * @brief Analyze pattern-property wrapper schemas.
 */
function analyzePatternProperties(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.PatternProperties }>,
    path: readonly PathSegment[],
    issues: SchemaAnalysisIssue[],
    seen: WeakSet<object>
): void {
    for (let index = 0; index < schema.entries.length; index += 1) {
        const entry = schema.entries[index];
        if (entry !== undefined) {
            analyzeSchemaInner(
                entry.schema,
                path.concat("patternProperties", entry.source),
                issues,
                seen
            );
        }
    }
    if (schema.additional !== undefined) {
        analyzeSchemaInner(
            schema.additional,
            path.concat("additionalProperties"),
            issues,
            seen
        );
    }
}

/**
 * @brief Extract schemas from discriminated-union cases.
 */
function readDiscriminatedUnionSchemas(
    cases: readonly {
        readonly schema: Schema;
    }[]
): readonly Schema[] {
    const schemas = new Array<Schema>(cases.length);
    for (let index = 0; index < cases.length; index += 1) {
        const unionCase = cases[index];
        if (unionCase !== undefined) {
            schemas[index] = unionCase.schema;
        }
    }
    return schemas;
}

/**
 * @brief Check whether every union option is object-shaped after wrappers.
 */
function allOptionsAreObjectLike(options: readonly Schema[]): boolean {
    for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        if (option === undefined || unwrapObjectSchema(option) === undefined) {
            return false;
        }
    }
    return options.length !== 0;
}

/**
 * @brief Heuristically detect unions that encode key cardinality.
 */
function looksLikeKeyCardinalityUnion(options: readonly Schema[]): boolean {
    let candidates = 0;
    for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        const object = option === undefined ? undefined : unwrapObjectSchema(option);
        if (object === undefined || countRequiredKeys(object.entries) !== 1) {
            return false;
        }
        candidates += 1;
    }
    return candidates >= WIDE_UNION_THRESHOLD;
}

/**
 * @brief Peel transparent wrappers down to an object schema.
 */
function unwrapObjectSchema(
    schema: Schema
): Extract<Schema, { readonly tag: typeof SchemaTag.Object }> | undefined {
    switch (schema.tag) {
        case SchemaTag.Object:
            return schema;
        case SchemaTag.Intersection:
            return unwrapObjectSchema(schema.left) ?? unwrapObjectSchema(schema.right);
        case SchemaTag.Brand:
        case SchemaTag.Metadata:
        case SchemaTag.Message:
        case SchemaTag.KeyedObject:
        case SchemaTag.PropertyCount:
        case SchemaTag.PropertyNames:
        case SchemaTag.PatternProperties:
        case SchemaTag.Refine:
            return unwrapObjectSchema(schema.inner);
        default:
            return undefined;
    }
}

/**
 * @brief Count required entries in an object schema.
 */
function countRequiredKeys(
    entries: readonly {
        readonly presence: number;
    }[]
): number {
    let count = 0;
    for (let index = 0; index < entries.length; index += 1) {
        if (entries[index]?.presence === PresenceTag.Required) {
            count += 1;
        }
    }
    return count;
}

/**
 * @brief Append one frozen analysis issue candidate.
 */
function pushIssue(
    path: readonly PathSegment[],
    issues: SchemaAnalysisIssue[],
    code: SchemaAnalysisCode,
    severity: SchemaAnalysisSeverity,
    message: string
): void {
    issues.push({
        path: path.slice(),
        code,
        severity,
        message
    });
}

/**
 * @brief Freeze the report and compute severity counts.
 */
function freezeReport(issues: readonly SchemaAnalysisIssue[]): SchemaAnalysisReport {
    let warnings = 0;
    let infos = 0;
    for (let index = 0; index < issues.length; index += 1) {
        const issue = issues[index];
        if (issue === undefined) {
            continue;
        }
        if (issue.severity === "warning") {
            warnings += 1;
        } else {
            infos += 1;
        }
        Object.freeze(issue.path);
        Object.freeze(issue);
    }
    return Object.freeze({
        issues: Object.freeze(issues.slice()),
        warnings,
        infos
    });
}
