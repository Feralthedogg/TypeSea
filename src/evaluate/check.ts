/**
 * @file check.ts
 * @brief Diagnostic schema interpreter dispatcher.
 */

import { KeyRuleTag, SchemaTag } from "../kind/index.js";
import type { CheckResult, Issue, PathSegment } from "../issue/index.js";
import { freezeIssueArray } from "../issue/index.js";
import { err, ok } from "../result/index.js";
import {
    resolveLazySchema,
    type Schema
} from "../schema/index.js";
import {
    collectArrayIssues,
    collectDiscriminatedUnionIssues,
    collectInstanceOfIssues,
    collectMapIssues,
    collectObjectIssues,
    collectPropertyIssues,
    collectRecordIssues,
    collectRefineIssues,
    collectSetIssues,
    collectTupleIssues
} from "./check-composite.js";
import {
    collectBigIntIssues,
    collectDateIssues,
    collectFileIssues,
    collectNumberIssues,
    collectStringIssues
} from "./check-scalar.js";
import { pushIssue } from "./issue.js";
import { finalizeAcceptedValue } from "./finalize.js";
import { isSchemaWithState, isUnionSchema, isXorSchema } from "./predicate.js";
import {
    actualType,
    hasObjectKey,
    isInspectableValue,
    isPlainRecord,
    literalToExpected,
    readOwnDataProperty
} from "./shared.js";
import {
    enterValidation,
    leaveValidation,
    makeValidationState,
    type ValidationState
} from "./state.js";

/**
 * @brief check schema.
 * @param schema Schema used to validate the input.
 * @param value Candidate runtime value.
 * @returns Frozen success or diagnostic failure result.
 */
export function checkSchema<TValue>(
    schema: Schema,
    value: unknown
): CheckResult<TValue> {
    // eslint-disable-next-line no-restricted-syntax
    try {
        if (isSchemaWithState(schema, value, makeValidationState())) {
            return ok(finalizeAcceptedValue(schema, value) as TValue);
        }
    } catch {
        if (isInspectableValue(value)) {
            throw new TypeError("schema predicate failed");
        }
        const issues: Issue[] = [];
        pushIssue([], issues, "expected_object", "inspectable value", "hostile object");
        return err(freezeIssueArray(issues));
    }
    /*
     * The boolean predicate runs first to keep the valid path allocation-light.
     * Diagnostics are collected only after failure, matching compiled check().
     */
    const issues: Issue[] = [];
    const path: PathSegment[] = [];
    // eslint-disable-next-line no-restricted-syntax
    try {
        collectIssues(schema, value, path, issues, makeValidationState());
    } catch {
        if (isInspectableValue(value)) {
            throw new TypeError("schema diagnostics failed");
        }
        pushIssue(path, issues, "expected_object", "inspectable value", "hostile object");
    }
    if (issues.length === 0) {
        /*
         * Refine predicates can fail without emitting a structural issue. Add a
         * conservative fallback so callers never receive an empty failure.
         */
        pushIssue(path, issues, "expected_refinement", "matching schema", actualType(value));
    }
    return err(freezeIssueArray(issues));
}

/**
 * @brief collect issues.
 * @param schema Schema node being diagnosed.
 * @param value Candidate runtime value.
 * @param path Mutable path stack shared by recursive diagnostic calls.
 * @param issues Output issue buffer.
 * @param state Shared recursion, cycle, and graph execution state.
 * @post Calls `leaveValidation` only when `enterValidation` returned entered.
 */
function collectIssues(
    schema: Schema,
    value: unknown,
    path: PathSegment[],
    issues: Issue[],
    state: ValidationState
): void {
    const entered = enterValidation(schema, value, state);
    if (entered === "cycle") {
        /*
         * A repeated schema/value pair means the recursive structure is already
         * being validated higher on the stack. Treat it as provisionally valid
         * to break cycles without fabricating duplicate diagnostics.
         */
        return;
    }
    if (entered === "budget") {
        pushIssue(
            path,
            issues,
            "expected_depth_limit",
            `depth <= ${String(state.maxDepth)}`,
            "depth or work limit exceeded"
        );
        return;
    }
    collectIssuesInner(schema, value, path, issues, state);
    leaveValidation(schema, value, state);
}

/**
 * @brief Dispatch diagnostics after recursion admission has been established.
 * @param schema Schema node being diagnosed after entry admission.
 * @param value Candidate runtime value.
 * @param path Mutable path stack shared by recursive diagnostic calls.
 * @param issues Output issue buffer.
 * @param state Shared recursion, cycle, and graph execution state.
 */
function collectIssuesInner(
    schema: Schema,
    value: unknown,
    path: PathSegment[],
    issues: Issue[],
    state: ValidationState
): void {
    if (collectScalarSchemaIssues(schema, value, path, issues)) {
        return;
    }
    if (collectCompositeSchemaIssues(schema, value, path, issues, state)) {
        return;
    }
    collectWrapperSchemaIssues(schema, value, path, issues, state);
}

/**
 * @brief Collect diagnostics for scalar and leaf schema tags.
 * @param schema Schema node being diagnosed.
 * @param value Candidate runtime value.
 * @param path Mutable issue path stack.
 * @param issues Output issue buffer.
 * @returns True when the schema tag was handled by this family.
 */
function collectScalarSchemaIssues(
    schema: Schema,
    value: unknown,
    path: PathSegment[],
    issues: Issue[]
): boolean {
    switch (schema.tag) {
        case SchemaTag.Unknown:
            return true;
        case SchemaTag.Never:
            pushIssue(path, issues, "expected_never", "never", actualType(value));
            return true;
        case SchemaTag.String:
            collectStringIssues(schema, value, path, issues);
            return true;
        case SchemaTag.Number:
            collectNumberIssues(schema, value, path, issues);
            return true;
        case SchemaTag.Date:
            collectDateIssues(schema, value, path, issues);
            return true;
        case SchemaTag.BigInt:
            collectBigIntIssues(schema, value, path, issues);
            return true;
        case SchemaTag.Symbol:
            if (typeof value !== "symbol") {
                pushIssue(
                    path,
                    issues,
                    "expected_symbol",
                    "symbol",
                    actualType(value),
                    schema.message
                );
            }
            return true;
        case SchemaTag.Boolean:
            if (typeof value !== "boolean") {
                pushIssue(
                    path,
                    issues,
                    "expected_boolean",
                    "boolean",
                    actualType(value),
                    schema.message
                );
            }
            return true;
        case SchemaTag.Literal:
            if (!Object.is(value, schema.value)) {
                pushIssue(
                    path,
                    issues,
                    "expected_literal",
                    literalToExpected(schema.value),
                    actualType(value)
                );
            }
            return true;
        case SchemaTag.File:
            collectFileIssues(schema, value, path, issues);
            return true;
        case SchemaTag.InstanceOf:
            collectInstanceOfIssues(schema, value, path, issues);
            return true;
        default:
            return false;
    }
}

/**
 * @brief Collect diagnostics for schema tags with child collections or branches.
 * @param schema Schema node being diagnosed.
 * @param value Candidate runtime value.
 * @param path Mutable issue path stack.
 * @param issues Output issue buffer.
 * @param state Shared recursion, cycle, and graph execution state.
 * @returns True when the schema tag was handled by this family.
 */
function collectCompositeSchemaIssues(
    schema: Schema,
    value: unknown,
    path: PathSegment[],
    issues: Issue[],
    state: ValidationState
): boolean {
    switch (schema.tag) {
        case SchemaTag.Array:
            collectArrayIssues(schema, value, path, issues, state, collectIssues);
            return true;
        case SchemaTag.Tuple:
            collectTupleIssues(schema, value, path, issues, state, collectIssues);
            return true;
        case SchemaTag.Record:
            collectRecordIssues(schema, value, path, issues, state, collectIssues);
            return true;
        case SchemaTag.Map:
            collectMapIssues(schema, value, path, issues, state, collectIssues);
            return true;
        case SchemaTag.Set:
            collectSetIssues(schema, value, path, issues, state, collectIssues);
            return true;
        case SchemaTag.Property:
            collectPropertyIssues(schema, value, path, issues, state, collectIssues);
            return true;
        case SchemaTag.Object:
            collectObjectIssues(schema, value, path, issues, state, collectIssues);
            return true;
        case SchemaTag.Union:
            if (!isUnionSchema(schema.options, value, state)) {
                pushIssue(path, issues, "expected_union", "union", actualType(value));
            }
            return true;
        case SchemaTag.Xor:
            if (!isXorSchema(schema.options, value, state)) {
                pushIssue(
                    path,
                    issues,
                    "expected_union",
                    "exclusive union",
                    actualType(value)
                );
            }
            return true;
        case SchemaTag.Intersection:
            /*
             * Intersections accumulate diagnostics from both sides because both
             * schemas must accept the same value.
             */
            collectIssues(schema.left, value, path, issues, state);
            collectIssues(schema.right, value, path, issues, state);
            return true;
        case SchemaTag.DiscriminatedUnion:
            collectDiscriminatedUnionIssues(
                schema.key,
                schema.cases,
                value,
                path,
                issues,
                state,
                collectIssues
            );
            return true;
        default:
            return false;
    }
}

/**
 * @brief Collect diagnostics for schema wrappers and executable refinements.
 * @param schema Schema node being diagnosed.
 * @param value Candidate runtime value.
 * @param path Mutable issue path stack.
 * @param issues Output issue buffer.
 * @param state Shared recursion, cycle, and graph execution state.
 * @returns True when the schema tag was handled by this family.
 */
function collectWrapperSchemaIssues(
    schema: Schema,
    value: unknown,
    path: PathSegment[],
    issues: Issue[],
    state: ValidationState
): boolean {
    switch (schema.tag) {
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
            if (value !== undefined) {
                collectIssues(schema.inner, value, path, issues, state);
            }
            return true;
        case SchemaTag.Nullable:
            if (value !== null) {
                collectIssues(schema.inner, value, path, issues, state);
            }
            return true;
        case SchemaTag.Brand:
            collectIssues(schema.inner, value, path, issues, state);
            return true;
        case SchemaTag.Metadata:
            collectIssues(schema.inner, value, path, issues, state);
            return true;
        case SchemaTag.Message: {
            const start = issues.length;
            collectIssues(schema.inner, value, path, issues, state);
            applyIssueMessage(issues, start, schema.message);
            return true;
        }
        case SchemaTag.KeyedObject:
            if (isSchemaWithState(schema.inner, value, state)) {
                collectKeyedObjectIssue(schema.keys, schema.rule, value, path, issues);
            } else {
                collectIssues(schema.inner, value, path, issues, state);
            }
            return true;
        case SchemaTag.PropertyCount:
            if (isSchemaWithState(schema.inner, value, state)) {
                collectPropertyCountIssue(schema.min, schema.max, value, path, issues);
            } else {
                collectIssues(schema.inner, value, path, issues, state);
            }
            return true;
        case SchemaTag.PropertyNames:
            if (isSchemaWithState(schema.inner, value, state)) {
                collectPropertyNamesIssues(schema.key, value, path, issues, state);
            } else {
                collectIssues(schema.inner, value, path, issues, state);
            }
            return true;
        case SchemaTag.PatternProperties:
            if (isSchemaWithState(schema.inner, value, state)) {
                collectPatternPropertiesIssues(schema, value, path, issues, state);
            } else {
                collectIssues(schema.inner, value, path, issues, state);
            }
            return true;
        case SchemaTag.Readonly:
            collectIssues(schema.inner, value, path, issues, state);
            return true;
        case SchemaTag.Lazy:
            /*
             * Lazy schemas resolve through the shared state so recursive lazy
             * references are tracked consistently with predicate evaluation.
             */
            collectIssues(resolveLazySchema(schema, state.resolving), value, path, issues, state);
            return true;
        case SchemaTag.Refine:
            collectRefineIssues(
                schema.inner,
                schema.predicate,
                schema.collect,
                schema.path,
                schema.message,
                schema.abort,
                schema.when,
                schema.name,
                value,
                path,
                issues,
                state,
                collectIssues
            );
            return true;
        default:
            return false;
    }
}

/**
 * @brief Attach a schema-local message to newly collected issues.
 * @param issues Mutable issue buffer owned by the current diagnostic pass.
 * @param start First issue index produced by the wrapped schema.
 * @param message Message override stored on the wrapper.
 * @details Existing issue-local messages win. That lets deeper wrappers and
 * callback refinements report more specific text than an outer wrapper.
 */
function applyIssueMessage(
    issues: Issue[],
    start: number,
    message: string
): void {
    for (let index = start; index < issues.length; index += 1) {
        const issue = issues[index];
        if (issue !== undefined && issue.message === undefined) {
            issues[index] = {
                path: issue.path,
                code: issue.code,
                expected: issue.expected,
                actual: issue.actual,
                message
            };
        }
    }
}

/**
 * @brief Emit the semantic issue for one keyed-object wrapper.
 * @param keys Keys participating in the key-count rule.
 * @param rule Rule applied to the selected keys.
 * @param value Candidate runtime value.
 * @param path Current issue path.
 * @param issues Mutable issue buffer.
 */
function collectKeyedObjectIssue(
    keys: readonly string[],
    rule: KeyRuleTag,
    value: unknown,
    path: PathSegment[],
    issues: Issue[]
): void {
    if (!isPlainRecord(value)) {
        pushIssue(path, issues, "expected_object", "object", actualType(value));
        return;
    }
    const count = countOwnDataKeys(value, keys);
    if (rule === KeyRuleTag.AtLeastOne) {
        if (count === 0) {
            pushIssue(
                path,
                issues,
                "expected_key_count",
                `at least one of ${formatKeyList(keys)}`,
                "0 matching keys"
            );
        }
        return;
    }
    if (count !== 1) {
        pushIssue(
            path,
            issues,
            "expected_key_count",
            `exactly one of ${formatKeyList(keys)}`,
            `${String(count)} matching keys`
        );
    }
}

/**
 * @brief Emit diagnostics for one object property-count rule.
 */
function collectPropertyCountIssue(
    min: number | undefined,
    max: number | undefined,
    value: unknown,
    path: PathSegment[],
    issues: Issue[]
): void {
    if (!isPlainRecord(value)) {
        pushIssue(path, issues, "expected_object", "object", actualType(value));
        return;
    }
    const count = Object.keys(value).length;
    if (min !== undefined && count < min) {
        pushIssue(
            path,
            issues,
            "expected_key_count",
            `at least ${String(min)} properties`,
            `${String(count)} properties`
        );
    }
    if (max !== undefined && count > max) {
        pushIssue(
            path,
            issues,
            "expected_key_count",
            `at most ${String(max)} properties`,
            `${String(count)} properties`
        );
    }
}

/**
 * @brief Emit diagnostics for one object property-name rule.
 */
function collectPropertyNamesIssues(
    keySchema: Schema,
    value: unknown,
    path: PathSegment[],
    issues: Issue[],
    state: ValidationState
): void {
    if (!isPlainRecord(value)) {
        pushIssue(path, issues, "expected_object", "object", actualType(value));
        return;
    }
    const keys = Object.keys(value);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined || isSchemaWithState(keySchema, key, state)) {
            continue;
        }
        path.push(key);
        collectIssues(keySchema, key, path, issues, state);
        path.pop();
    }
}

/**
 * @brief Emit diagnostics for JSON Schema pattern-property rules.
 */
function collectPatternPropertiesIssues(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.PatternProperties }>,
    value: unknown,
    path: PathSegment[],
    issues: Issue[],
    state: ValidationState
): void {
    if (!isPlainRecord(value)) {
        pushIssue(path, issues, "expected_object", "object", actualType(value));
        return;
    }
    const keys = Object.keys(value);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key !== undefined) {
            collectPatternPropertyKeyIssues(schema, value, key, path, issues, state);
        }
    }
}

/**
 * @brief Emit diagnostics for one pattern-property key.
 */
function collectPatternPropertyKeyIssues(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.PatternProperties }>,
    value: Readonly<Record<string, unknown>>,
    key: string,
    path: PathSegment[],
    issues: Issue[],
    state: ValidationState
): void {
    let matched = false;
    for (let index = 0; index < schema.entries.length; index += 1) {
        const entry = schema.entries[index];
        if (entry === undefined || !testRegex(entry.regex, key)) {
            continue;
        }
        matched = true;
        collectPatternPropertyValueIssues(entry.schema, value, key, path, issues, state);
    }
    if (matched || hasObjectKey(schema.keyLookup, key)) {
        return;
    }
    if (schema.additional !== undefined) {
        collectPatternPropertyValueIssues(schema.additional, value, key, path, issues, state);
        return;
    }
    if (!schema.allowAdditional) {
        path.push(key);
        pushIssue(path, issues, "unrecognized_key", "known or pattern-matched key", "extra key");
        path.pop();
    }
}

/**
 * @brief Emit value diagnostics for one pattern-property schema.
 */
function collectPatternPropertyValueIssues(
    schema: Schema,
    value: Readonly<Record<string, unknown>>,
    key: string,
    path: PathSegment[],
    issues: Issue[],
    state: ValidationState
): void {
    const property = readOwnDataProperty(value, key);
    path.push(key);
    if (property === undefined) {
        pushIssue(path, issues, "expected_object", "data property", "accessor");
    } else {
        collectIssues(schema, property.value, path, issues, state);
    }
    path.pop();
}

/**
 * @brief Test a regular expression without leaking lastIndex state.
 */
function testRegex(regex: RegExp, value: string): boolean {
    regex.lastIndex = 0;
    const accepted = regex.test(value);
    regex.lastIndex = 0;
    return accepted;
}

/**
 * @brief Count selected own data properties without invoking accessors.
 * @param value Plain record already accepted by object validation.
 * @param keys Selected string keys.
 * @returns Number of selected keys present as data properties.
 */
function countOwnDataKeys(
    value: Readonly<Record<string, unknown>>,
    keys: readonly string[]
): number {
    let count = 0;
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key !== undefined && readOwnDataProperty(value, key) !== undefined) {
            count += 1;
        }
    }
    return count;
}

/**
 * @brief Format a key selection for diagnostics.
 * @param keys Selected string keys.
 * @returns Stable comma-separated key list.
 */
function formatKeyList(keys: readonly string[]): string {
    return keys.join(", ");
}
