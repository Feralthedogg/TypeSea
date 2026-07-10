/**
 * @file emit-composite.ts
 * @brief Container TypeSea schema to JSON Schema emitters.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
 */

import {
    ArrayCheckTag,
    ObjectModeTag,
    PresenceTag,
    SchemaTag
} from "../kind/index.js";
import type { PathSegment } from "../issue/index.js";
import {
    resolveObjectEntryPresence,
    type Schema
} from "../schema/index.js";
import type {
    JsonSchemaEmitContext,
    JsonSchemaEmitter
} from "./emit-types.js";
import {
    jsonSchemaIndexContext,
    jsonSchemaMemberContext
} from "./emit-context.js";
import {
    emitUnrepresentableJsonSchema,
    pushJsonSchemaIssue
} from "./issue.js";
import type {
    JsonSchema,
    JsonSchemaExportIssue,
    JsonSchemaOutputTarget,
    JsonSchemaUnrepresentableMode,
    JsonSchemaUriMapper,
    MutableJsonSchemaObject
} from "./types.js";

/**
 * @brief Emit an array schema with item and length constraints.
 */
export function emitArray(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Array }>,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    emitChild: JsonSchemaEmitter,
    target: JsonSchemaOutputTarget,
    unrepresentable: JsonSchemaUnrepresentableMode,
    uri: JsonSchemaUriMapper,
    context: JsonSchemaEmitContext
): JsonSchema | undefined {
    const item = schema.item;
    path.push("items");
    const emitted = emitChild(
        item,
        path,
        issues,
        target,
        unrepresentable,
        uri,
        jsonSchemaMemberContext(context, "items")
    );
    if (emitted === undefined) {
        pushJsonSchemaIssue(path, issues, "unsupported_child", "Array item schema is unsupported");
        path.pop();
        return undefined;
    }
    path.pop();
    const result: MutableJsonSchemaObject = {
        type: "array",
        items: emitted
    };
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case ArrayCheckTag.Min:
                result.minItems = result.minItems === undefined
                    ? check.value
                    : Math.max(result.minItems, check.value);
                break;
            case ArrayCheckTag.Max:
                result.maxItems = result.maxItems === undefined
                    ? check.value
                    : Math.min(result.maxItems, check.value);
                break;
        }
    }
    return result;
}

/**
 * @brief Emit a fixed/rest tuple schema without weakening positional semantics.
 */
export function emitTuple(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Tuple }>,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    emitChild: JsonSchemaEmitter,
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
            "OpenAPI 3.0 cannot represent positional tuple schemas losslessly"
        );
        return undefined;
    }
    const items = schema.items;
    const emitted = new Array<JsonSchema>(items.length);
    let failed = false;
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (item === undefined) {
            continue;
        }
        path.push(index);
        const itemListKey = target === "2020-12" ? "prefixItems" : "items";
        const child = emitChild(
            item,
            path,
            issues,
            target,
            unrepresentable,
            uri,
            jsonSchemaIndexContext(jsonSchemaMemberContext(context, itemListKey), index)
        );
        if (child === undefined) {
            pushJsonSchemaIssue(path, issues, "unsupported_child", "Tuple item schema is unsupported");
            failed = true;
            path.pop();
            continue;
        }
        path.pop();
        emitted[index] = child;
    }
    if (failed) {
        return undefined;
    }
    let restSchema: JsonSchema | undefined;
    if (schema.rest !== undefined) {
        path.push("rest");
        const restKey = target === "2020-12" ? "items" : "additionalItems";
        restSchema = emitChild(
            schema.rest,
            path,
            issues,
            target,
            unrepresentable,
            uri,
            jsonSchemaMemberContext(context, restKey)
        );
        if (restSchema === undefined) {
            pushJsonSchemaIssue(path, issues, "unsupported_child", "Tuple rest schema is unsupported");
            path.pop();
            return undefined;
        }
        path.pop();
    }
    if (target === "2020-12") {
        const result: MutableJsonSchemaObject = {
            type: "array",
            prefixItems: emitted,
            minItems: items.length
        };
        if (restSchema === undefined) {
            result.maxItems = items.length;
        } else {
            result.items = restSchema;
        }
        return result;
    }
    const result: MutableJsonSchemaObject = {
        type: "array",
        items: emitted,
        additionalItems: restSchema ?? false,
        minItems: items.length
    };
    if (restSchema === undefined) {
        result.maxItems = items.length;
    }
    return result;
}

/**
 * @brief Emit an enumerable-string record schema and its key constraints.
 */
export function emitRecord(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Record }>,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    emitChild: JsonSchemaEmitter,
    target: JsonSchemaOutputTarget,
    unrepresentable: JsonSchemaUnrepresentableMode,
    uri: JsonSchemaUriMapper,
    context: JsonSchemaEmitContext
): JsonSchema | undefined {
    if (schema.loose && schema.key !== undefined) {
        return emitUnrepresentableJsonSchema(
            path,
            issues,
            unrepresentable,
            "unsupported_record",
            "Loose record key passthrough cannot be represented losslessly as JSON Schema"
        );
    }
    path.push("additionalProperties");
    const emitted = emitChild(
        schema.value,
        path,
        issues,
        target,
        unrepresentable,
        uri,
        jsonSchemaMemberContext(context, "additionalProperties")
    );
    if (emitted === undefined) {
        pushJsonSchemaIssue(path, issues, "unsupported_child", "Record value schema is unsupported");
        path.pop();
        return undefined;
    }
    path.pop();
    const result: MutableJsonSchemaObject = {
        type: "object",
        additionalProperties: emitted
    };
    if (schema.requiredKeys !== undefined && schema.requiredKeys.length !== 0) {
        result.required = schema.requiredKeys;
    }
    if (schema.key !== undefined) {
        if (target === "draft-04") {
            pushJsonSchemaIssue(
                path,
                issues,
                "unsupported_target",
                "Draft-04 cannot represent record key schemas losslessly"
            );
            return undefined;
        }
        if (target === "openapi-3.0") {
            pushJsonSchemaIssue(
                path,
                issues,
                "unsupported_target",
                "OpenAPI 3.0 cannot represent record key schemas losslessly"
            );
            return undefined;
        }
        path.push("propertyNames");
        const emittedKey = emitChild(
            schema.key,
            path,
            issues,
            target,
            unrepresentable,
            uri,
            jsonSchemaMemberContext(context, "propertyNames")
        );
        if (emittedKey === undefined) {
            pushJsonSchemaIssue(path, issues, "unsupported_child", "Record key schema is unsupported");
            path.pop();
            return undefined;
        }
        path.pop();
        result.propertyNames = emittedKey;
    }
    return result;
}

/**
 * @brief Emit object properties, required keys, mode, and catchall semantics.
 */
export function emitObject(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    emitChild: JsonSchemaEmitter,
    target: JsonSchemaOutputTarget,
    unrepresentable: JsonSchemaUnrepresentableMode,
    uri: JsonSchemaUriMapper,
    context: JsonSchemaEmitContext
): JsonSchema | undefined {
    const properties = makeJsonSchemaProperties();
    const required: string[] = [];
    const entries = schema.entries;
    let failed = false;
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
            continue;
        }
        path.push(entry.key);
        const emitted = emitChild(
            entry.schema,
            path,
            issues,
            target,
            unrepresentable,
            uri,
            jsonSchemaMemberContext(jsonSchemaMemberContext(context, "properties"), entry.key)
        );
        if (emitted === undefined) {
            pushJsonSchemaIssue(path, issues, "unsupported_child", "Object property schema is unsupported");
            failed = true;
            path.pop();
            continue;
        }
        path.pop();
        properties[entry.key] = emitted;
        if (resolveObjectEntryPresence(entry) === PresenceTag.Required) {
            required.push(entry.key);
        }
    }
    if (failed) {
        return undefined;
    }
    let additionalProperties: JsonSchema = schema.mode !== ObjectModeTag.Strict;
    if (schema.catchall !== undefined) {
        path.push("additionalProperties");
        const emittedCatchall = emitChild(
            schema.catchall,
            path,
            issues,
            target,
            unrepresentable,
            uri,
            jsonSchemaMemberContext(context, "additionalProperties")
        );
        if (emittedCatchall === undefined) {
            pushJsonSchemaIssue(path, issues, "unsupported_child", "Object catchall schema is unsupported");
            path.pop();
            return undefined;
        }
        path.pop();
        additionalProperties = emittedCatchall;
    }
    const result: MutableJsonSchemaObject = {
        type: "object",
        properties,
        additionalProperties
    };
    if (required.length !== 0) {
        result.required = required;
    }
    return result;
}

/**
 * @brief Allocate the JSON Schema property table with no prototype chain.
 * @details Object schema keys originate from user models. A null-prototype map
 * prevents names such as `constructor` from colliding with inherited object
 * members while keeping writes monomorphic for the emitter loop.
 * @returns Empty mutable property table for an object schema emission pass.
 */
function makeJsonSchemaProperties(): Record<string, JsonSchema> {
    return Object.create(null) as Record<string, JsonSchema>;
}
