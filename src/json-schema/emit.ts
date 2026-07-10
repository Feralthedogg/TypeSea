/**
 * @file emit.ts
 * @brief TypeSea schema to JSON Schema emitter dispatcher.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
 */

import { KeyRuleTag, SchemaTag } from "../kind/index.js";
import type { PathSegment } from "../issue/index.js";
import {
    readRegistrySchemaMetadata
} from "../registry/index.js";
import {
    freezeSchema,
    isSchemaValue,
    type Schema,
    type SchemaMetadata
} from "../schema/index.js";
import {
    emitDiscriminatedUnion,
    emitIntersection,
    emitNullable,
    emitUnion,
    emitXor
} from "./emit-combinator.js";
import {
    emitArray,
    emitObject,
    emitRecord,
    emitTuple
} from "./emit-composite.js";
import {
    emitFile,
    emitLiteral,
    emitNumber,
    emitString
} from "./emit-scalar.js";
import {
    jsonSchemaIndexContext,
    jsonSchemaMemberContext
} from "./emit-context.js";
import type { JsonSchemaEmitContext } from "./emit-types.js";
import {
    emitUnrepresentableJsonSchema,
    pushJsonSchemaIssue
} from "./issue.js";
import { applyGlobalRegistryMetadata } from "./metadata.js";
import type {
    JsonSchema,
    JsonSchemaExportIssue,
    JsonSchemaOutputTarget,
    JsonSchemaUnrepresentableMode,
    JsonSchemaUriMapper,
    MutableJsonSchemaObject
} from "./types.js";

/**
 * @brief Dispatch one TypeSea schema node to the matching JSON Schema emitter.
 * @details Unsupported runtime-only features are reported as structured export
 * issues instead of being erased. That fail-closed policy prevents the exporter
 * from producing a schema that appears equivalent while accepting a different
 * value set.
 * @param schema Schema node currently being emitted.
 * @param path Mutable issue path stack owned by the export walk.
 * @param issues Mutable export issue buffer.
 * @param target Target JSON Schema dialect or OpenAPI profile.
 * @returns JSON Schema fragment, boolean schema, or undefined on failure.
 */
export function emitSchema(
    schema: Schema,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    target: JsonSchemaOutputTarget,
    unrepresentable: JsonSchemaUnrepresentableMode,
    uri: JsonSchemaUriMapper,
    context: JsonSchemaEmitContext
): JsonSchema | undefined {
    const cycleRef = context.cycleRefs.get(schema);
    if (cycleRef !== undefined) {
        if (context.cycles === "ref") {
            return {
                $ref: cycleRef
            };
        }
        return emitUnrepresentableJsonSchema(
            path,
            issues,
            unrepresentable,
            "unsupported_lazy",
            "JSON Schema cycle references are disabled"
        );
    }
    const ref = context.refs.get(schema);
    if (ref !== undefined && context.active !== schema) {
        return {
            $ref: ref
        };
    }
    context.cycleRefs.set(schema, context.location);
    const emitted = emitSchemaInner(schema, path, issues, target, unrepresentable, uri, context);
    context.cycleRefs.delete(schema);
    const annotated = applyExternalRegistryMetadata(schema, emitted, target, uri, context);
    return applyJsonSchemaOverride(schema, annotated, path, target, context);
}

/**
 * @brief Emit a schema after recursion guards have been installed.
 */
function emitSchemaInner(
    schema: Schema,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    target: JsonSchemaOutputTarget,
    unrepresentable: JsonSchemaUnrepresentableMode,
    uri: JsonSchemaUriMapper,
    context: JsonSchemaEmitContext
): JsonSchema | undefined {
    switch (schema.tag) {
        case SchemaTag.Unknown:
            return true;
        case SchemaTag.Never:
            return false;
        case SchemaTag.String:
            return emitString(schema, path, issues, unrepresentable);
        case SchemaTag.Number:
            return emitNumber(schema, path, issues, target, unrepresentable);
        case SchemaTag.Date:
            return emitUnrepresentableJsonSchema(
                path,
                issues,
                unrepresentable,
                "unsupported_date",
                "JSON Schema cannot represent JavaScript Date objects"
            );
        case SchemaTag.BigInt:
            return emitUnrepresentableJsonSchema(
                path,
                issues,
                unrepresentable,
                "unsupported_bigint",
                "JSON Schema has no bigint type"
            );
        case SchemaTag.Symbol:
            return emitUnrepresentableJsonSchema(
                path,
                issues,
                unrepresentable,
                "unsupported_symbol",
                "JSON Schema has no symbol type"
            );
        case SchemaTag.Boolean:
            return { type: "boolean" };
        case SchemaTag.Literal:
            return emitLiteral(schema.value, path, issues, target, unrepresentable);
        case SchemaTag.Array:
            return emitArray(schema, path, issues, emitSchema, target, unrepresentable, uri, context);
        case SchemaTag.Tuple:
            return emitTuple(schema, path, issues, emitSchema, target, unrepresentable, uri, context);
        case SchemaTag.Record:
            return emitRecord(schema, path, issues, emitSchema, target, unrepresentable, uri, context);
        case SchemaTag.Map:
        case SchemaTag.Set:
        case SchemaTag.InstanceOf:
        case SchemaTag.Property:
            return emitUnrepresentableJsonSchema(
                path,
                issues,
                unrepresentable,
                "unsupported_runtime_object",
                "JSON Schema cannot preserve this JavaScript runtime object contract"
            );
        case SchemaTag.File:
            return emitFile(schema);
        case SchemaTag.Object:
            return emitObject(schema, path, issues, emitSchema, target, unrepresentable, uri, context);
        case SchemaTag.Union:
            return emitUnion(schema.options, path, issues, emitSchema, target, unrepresentable, uri, context);
        case SchemaTag.Xor:
            return emitXor(schema.options, path, issues, emitSchema, target, unrepresentable, uri, context);
        case SchemaTag.Intersection:
            return emitIntersection(schema.left, schema.right, path, issues, emitSchema, target, unrepresentable, uri, context);
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
            return emitUnrepresentableJsonSchema(
                path,
                issues,
                unrepresentable,
                "unsupported_undefined",
                "JSON Schema cannot represent undefined as a value"
            );
        case SchemaTag.Nullable:
            return emitNullable(schema.inner, path, issues, emitSchema, target, unrepresentable, uri, context);
        case SchemaTag.DiscriminatedUnion:
            return emitDiscriminatedUnion(schema.cases, path, issues, emitSchema, target, unrepresentable, uri, context);
        case SchemaTag.Brand:
            return emitSchema(schema.inner, path, issues, target, unrepresentable, uri, context);
        case SchemaTag.Metadata:
            return emitMetadataSchema(
                schema.inner,
                schema.metadata,
                path,
                issues,
                target,
                unrepresentable,
                uri,
                context
            );
        case SchemaTag.Message:
            return emitSchema(schema.inner, path, issues, target, unrepresentable, uri, context);
        case SchemaTag.KeyedObject:
            return emitKeyedObjectSchema(
                schema.inner,
                schema.keys,
                schema.rule,
                path,
                issues,
                target,
                unrepresentable,
                uri,
                context
            );
        case SchemaTag.PropertyCount:
            return emitPropertyCountSchema(
                schema.inner,
                schema.min,
                schema.max,
                path,
                issues,
                target,
                unrepresentable,
                uri,
                context
            );
        case SchemaTag.PropertyNames:
            return emitPropertyNamesSchema(
                schema.inner,
                schema.key,
                path,
                issues,
                target,
                unrepresentable,
                uri,
                context
            );
        case SchemaTag.PatternProperties:
            return emitPatternPropertiesSchema(
                schema,
                path,
                issues,
                target,
                unrepresentable,
                uri,
                context
            );
        case SchemaTag.Readonly:
            return emitUnrepresentableJsonSchema(
                path,
                issues,
                unrepresentable,
                "unsupported_readonly",
                "JSON Schema cannot preserve readonly Object.freeze side effects"
            );
        case SchemaTag.Lazy:
            return emitLazySchema(schema, path, issues, target, unrepresentable, uri, context);
        case SchemaTag.Refine:
            return emitUnrepresentableJsonSchema(
                path,
                issues,
                unrepresentable,
                "unsupported_refine",
                "Refinement predicates cannot be represented as JSON Schema"
            );
    }
}

/**
 * @brief Allow callers to mutate one emitted JSON Schema object fragment.
 */
function applyJsonSchemaOverride(
    schema: Schema,
    emitted: JsonSchema | undefined,
    path: PathSegment[],
    target: JsonSchemaOutputTarget,
    context: JsonSchemaEmitContext
): JsonSchema | undefined {
    const override = context.override;
    if (override === undefined ||
        emitted === undefined ||
        typeof emitted === "boolean") {
        return emitted;
    }
    override({
        schema,
        jsonSchema: emitted,
        path: Object.freeze(path.slice()),
        target
    });
    return emitted;
}

/**
 * @brief Attach metadata supplied through the JSON Schema metadata option.
 */
function applyExternalRegistryMetadata(
    schema: Schema,
    emitted: JsonSchema | undefined,
    target: JsonSchemaOutputTarget,
    uri: JsonSchemaUriMapper,
    context: JsonSchemaEmitContext
): JsonSchema | undefined {
    if (emitted === undefined || context.metadata === undefined) {
        return emitted;
    }
    const metadata = readRegistrySchemaMetadata(context.metadata, schema);
    if (metadata === undefined) {
        return emitted;
    }
    return applyGlobalRegistryMetadata(emitted, metadata, target, uri);
}

/**
 * @brief Resolve and emit a lazy schema when recursive references are enabled.
 */
function emitLazySchema(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Lazy }>,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    target: JsonSchemaOutputTarget,
    unrepresentable: JsonSchemaUnrepresentableMode,
    uri: JsonSchemaUriMapper,
    context: JsonSchemaEmitContext
): JsonSchema | undefined {
    if (context.cycles === "throw") {
        return emitUnrepresentableJsonSchema(
            path,
            issues,
            unrepresentable,
            "unsupported_lazy",
            "Lazy schemas require JSON Schema cycle references"
        );
    }
    const resolved = resolveJsonSchemaLazySchema(schema, path, issues, context);
    if (resolved === undefined) {
        return undefined;
    }
    return emitSchema(resolved, path, issues, target, unrepresentable, uri, context);
}

/**
 * @brief Resolve a lazy schema chain without treating object recursion as invalid.
 */
function resolveJsonSchemaLazySchema(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Lazy }>,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    context: JsonSchemaEmitContext
): Schema | undefined {
    if (context.lazyResolving.has(schema)) {
        pushJsonSchemaIssue(
            path,
            issues,
            "unsupported_lazy",
            "Lazy schema chain must resolve to a concrete schema"
        );
        return undefined;
    }
    context.lazyResolving.add(schema);
    const resolved = schema.get();
    if (!isSchemaValue(resolved)) {
        pushJsonSchemaIssue(
            path,
            issues,
            "unsupported_lazy",
            "Lazy schema must resolve to a valid TypeSea schema"
        );
        context.lazyResolving.delete(schema);
        return undefined;
    }
    const concrete = resolved.tag === SchemaTag.Lazy
        ? resolveJsonSchemaLazySchema(resolved, path, issues, context)
        : freezeSchema(resolved);
    context.lazyResolving.delete(schema);
    return concrete;
}

/**
 * @brief Emit a schema wrapper carrying JSON Schema annotations.
 */
function emitMetadataSchema(
    inner: Schema,
    metadata: SchemaMetadata,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    target: JsonSchemaOutputTarget,
    unrepresentable: JsonSchemaUnrepresentableMode,
    uri: JsonSchemaUriMapper,
    context: JsonSchemaEmitContext
): JsonSchema | undefined {
    const emitted = emitSchema(inner, path, issues, target, unrepresentable, uri, context);
    if (emitted === undefined) {
        return undefined;
    }
    return applyMetadata(emitted, metadata, target, uri);
}

/**
 * @brief Attach TypeSea metadata as JSON Schema annotations.
 */
function applyMetadata(
    schema: JsonSchema,
    metadata: SchemaMetadata,
    outputTarget: JsonSchemaOutputTarget,
    uri: JsonSchemaUriMapper
): JsonSchema {
    if (schema === false) {
        return false;
    }
    const target: MutableJsonSchemaObject = schema === true ? {} : { ...schema };
    if (metadata.id !== undefined && outputTarget !== "openapi-3.0") {
        target.$id = uri(metadata.id);
    }
    if (metadata.title !== undefined) {
        target.title = metadata.title;
    }
    if (metadata.description !== undefined) {
        target.description = metadata.description;
    }
    if (metadata.examples !== undefined) {
        target.examples = metadata.examples.slice();
    }
    return target;
}

/**
 * @brief Emit a keyed-object rule as JSON Schema required-key combinators.
 */
function emitKeyedObjectSchema(
    inner: Schema,
    keys: readonly string[],
    rule: KeyRuleTag,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    target: JsonSchemaOutputTarget,
    unrepresentable: JsonSchemaUnrepresentableMode,
    uri: JsonSchemaUriMapper,
    context: JsonSchemaEmitContext
): JsonSchema | undefined {
    const emitted = emitSchema(
        inner,
        path,
        issues,
        target,
        unrepresentable,
        uri,
        jsonSchemaIndexContext(jsonSchemaMemberContext(context, "allOf"), 0)
    );
    if (emitted === undefined) {
        return undefined;
    }
    const keyRule = rule === KeyRuleTag.AtLeastOne
        ? emitAtLeastOneKeyRule(keys)
        : emitExactlyOneKeyRule(keys);
    return {
        allOf: [emitted, keyRule]
    };
}

/**
 * @brief Emit object property-count bounds.
 */
function emitPropertyCountSchema(
    inner: Schema,
    min: number | undefined,
    max: number | undefined,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    target: JsonSchemaOutputTarget,
    unrepresentable: JsonSchemaUnrepresentableMode,
    uri: JsonSchemaUriMapper,
    context: JsonSchemaEmitContext
): JsonSchema | undefined {
    const emitted = emitSchema(
        inner,
        path,
        issues,
        target,
        unrepresentable,
        uri,
        context
    );
    if (emitted === undefined) {
        return undefined;
    }
    const countSchema = propertyCountJsonSchema(min, max);
    if (typeof emitted === "boolean") {
        return {
            allOf: [emitted, countSchema]
        };
    }
    const output: MutableJsonSchemaObject = { ...emitted };
    if (min !== undefined) {
        output.minProperties = min;
    }
    if (max !== undefined) {
        output.maxProperties = max;
    }
    return output;
}

/**
 * @brief Emit an object property-name rule.
 */
function emitPropertyNamesSchema(
    inner: Schema,
    key: Schema,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    target: JsonSchemaOutputTarget,
    unrepresentable: JsonSchemaUnrepresentableMode,
    uri: JsonSchemaUriMapper,
    context: JsonSchemaEmitContext
): JsonSchema | undefined {
    if (target === "draft-04") {
        pushJsonSchemaIssue(
            path,
            issues,
            "unsupported_target",
            "Draft-04 cannot represent property name schemas losslessly"
        );
        return undefined;
    }
    if (target === "openapi-3.0") {
        pushJsonSchemaIssue(
            path,
            issues,
            "unsupported_target",
            "OpenAPI 3.0 cannot represent property name schemas losslessly"
        );
        return undefined;
    }
    const emitted = emitSchema(
        inner,
        path,
        issues,
        target,
        unrepresentable,
        uri,
        context
    );
    if (emitted === undefined) {
        return undefined;
    }
    path.push("propertyNames");
    const propertyNames = emitSchema(
        key,
        path,
        issues,
        target,
        unrepresentable,
        uri,
        jsonSchemaMemberContext(context, "propertyNames")
    );
    path.pop();
    if (propertyNames === undefined) {
        return undefined;
    }
    const nameSchema: MutableJsonSchemaObject = {
        propertyNames
    };
    if (typeof emitted === "boolean") {
        return {
            allOf: [emitted, nameSchema]
        };
    }
    const output: MutableJsonSchemaObject = { ...emitted };
    output.propertyNames = propertyNames;
    return output;
}

/**
 * @brief Emit object pattern-property rules.
 */
function emitPatternPropertiesSchema(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.PatternProperties }>,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    target: JsonSchemaOutputTarget,
    unrepresentable: JsonSchemaUnrepresentableMode,
    uri: JsonSchemaUriMapper,
    context: JsonSchemaEmitContext
): JsonSchema | undefined {
    if (target === "openapi-3.0") {
        pushJsonSchemaIssue(
            path,
            issues,
            "unsupported_target",
            "OpenAPI 3.0 cannot represent pattern property schemas losslessly"
        );
        return undefined;
    }
    const emitted = emitSchema(
        schema.inner,
        path,
        issues,
        target,
        unrepresentable,
        uri,
        context
    );
    const patternSchema = emitPatternPropertiesFragment(
        schema,
        path,
        issues,
        target,
        unrepresentable,
        uri,
        context
    );
    if (emitted === undefined || patternSchema === undefined) {
        return undefined;
    }
    if (typeof emitted === "boolean") {
        return {
            allOf: [emitted, patternSchema]
        };
    }
    return {
        ...emitted,
        ...patternSchema
    };
}

/**
 * @brief Emit the JSON Schema fragment for pattern-property rules.
 */
function emitPatternPropertiesFragment(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.PatternProperties }>,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    target: JsonSchemaOutputTarget,
    unrepresentable: JsonSchemaUnrepresentableMode,
    uri: JsonSchemaUriMapper,
    context: JsonSchemaEmitContext
): MutableJsonSchemaObject | undefined {
    const patternProperties: Record<string, JsonSchema> = Object.create(null) as Record<string, JsonSchema>;
    let failed = false;
    for (let index = 0; index < schema.entries.length; index += 1) {
        const entry = schema.entries[index];
        if (entry === undefined) {
            continue;
        }
        path.push("patternProperties", entry.source);
        const emitted = emitSchema(
            entry.schema,
            path,
            issues,
            target,
            unrepresentable,
            uri,
            jsonSchemaMemberContext(context, "patternProperties")
        );
        path.pop();
        path.pop();
        if (emitted === undefined) {
            failed = true;
            continue;
        }
        patternProperties[entry.source] = emitted;
    }
    if (failed) {
        return undefined;
    }
    const output: MutableJsonSchemaObject = {
        patternProperties
    };
    if (schema.additional !== undefined) {
        path.push("additionalProperties");
        const additional = emitSchema(
            schema.additional,
            path,
            issues,
            target,
            unrepresentable,
            uri,
            jsonSchemaMemberContext(context, "additionalProperties")
        );
        path.pop();
        if (additional === undefined) {
            return undefined;
        }
        output.additionalProperties = additional;
    } else if (!schema.allowAdditional) {
        output.additionalProperties = false;
    }
    return output;
}

/**
 * @brief Build a JSON Schema fragment for property-count bounds.
 */
function propertyCountJsonSchema(
    min: number | undefined,
    max: number | undefined
): JsonSchema {
    const schema: MutableJsonSchemaObject = {};
    if (min !== undefined) {
        schema.minProperties = min;
    }
    if (max !== undefined) {
        schema.maxProperties = max;
    }
    return schema;
}

/**
 * @brief Emit JSON Schema for an at-least-one key rule.
 */
function emitAtLeastOneKeyRule(keys: readonly string[]): JsonSchema {
    return {
        anyOf: emitRequiredKeyAlternatives(keys)
    };
}

/**
 * @brief Emit JSON Schema for an exactly-one key rule.
 */
function emitExactlyOneKeyRule(keys: readonly string[]): JsonSchema {
    return {
        oneOf: emitRequiredKeyAlternatives(keys)
    };
}

/**
 * @brief Build required-key alternatives for anyOf/oneOf.
 */
function emitRequiredKeyAlternatives(keys: readonly string[]): readonly JsonSchema[] {
    const alternatives = new Array<JsonSchema>(keys.length);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        alternatives[index] = {
            required: key === undefined ? [] : [key]
        };
    }
    return alternatives;
}
