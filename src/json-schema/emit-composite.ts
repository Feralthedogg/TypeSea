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
import type { Schema } from "../schema/index.js";
import type { JsonSchemaEmitter } from "./emit-types.js";
import { pushJsonSchemaIssue } from "./issue.js";
import type {
    JsonSchema,
    JsonSchemaDialect,
    JsonSchemaExportIssue,
    MutableJsonSchemaObject
} from "./types.js";

/**
 * @brief emit array.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
 */
export function emitArray(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Array }>,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    emitChild: JsonSchemaEmitter,
    dialect: JsonSchemaDialect
): JsonSchema | undefined {
    const item = schema.item;
    path.push("items");
    const emitted = emitChild(item, path, issues, dialect);
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
 * @brief emit tuple.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
 */
export function emitTuple(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Tuple }>,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    emitChild: JsonSchemaEmitter,
    dialect: JsonSchemaDialect
): JsonSchema | undefined {
    const items = schema.items;
    const emitted = new Array<JsonSchema>(items.length);
    let failed = false;
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (item === undefined) {
            continue;
        }
        path.push(index);
        const child = emitChild(item, path, issues, dialect);
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
        restSchema = emitChild(schema.rest, path, issues, dialect);
        if (restSchema === undefined) {
            pushJsonSchemaIssue(path, issues, "unsupported_child", "Tuple rest schema is unsupported");
            path.pop();
            return undefined;
        }
        path.pop();
    }
    if (dialect === "2020-12") {
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
 * @brief emit record.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
 */
export function emitRecord(
    value: Schema,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    emitChild: JsonSchemaEmitter,
    dialect: JsonSchemaDialect
): JsonSchema | undefined {
    path.push("additionalProperties");
    const emitted = emitChild(value, path, issues, dialect);
    if (emitted === undefined) {
        pushJsonSchemaIssue(path, issues, "unsupported_child", "Record value schema is unsupported");
        path.pop();
        return undefined;
    }
    path.pop();
    return {
        type: "object",
        additionalProperties: emitted
    };
}

/**
 * @brief emit object.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
 */
export function emitObject(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    emitChild: JsonSchemaEmitter,
    dialect: JsonSchemaDialect
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
        const emitted = emitChild(entry.schema, path, issues, dialect);
        if (emitted === undefined) {
            pushJsonSchemaIssue(path, issues, "unsupported_child", "Object property schema is unsupported");
            failed = true;
            path.pop();
            continue;
        }
        path.pop();
        properties[entry.key] = emitted;
        if (entry.presence === PresenceTag.Required) {
            required.push(entry.key);
        }
    }
    if (failed) {
        return undefined;
    }
    let additionalProperties: JsonSchema = schema.mode !== ObjectModeTag.Strict;
    if (schema.catchall !== undefined) {
        path.push("additionalProperties");
        const emittedCatchall = emitChild(schema.catchall, path, issues, dialect);
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
