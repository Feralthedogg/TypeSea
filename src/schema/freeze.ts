/**
 * @file schema/freeze.ts
 * @brief Schema freezing and collection hardening.
 * @details Freezing hardens builder output before execution engines or exporters rely on
 * schema identity and shape stability.
 */

import { SchemaTag, StringCheckTag } from "../kind/index.js";
import { isPlainRegExp } from "./common.js";
import type {
    DiscriminatedUnionCase,
    ObjectEntry,
    PatternPropertyEntry,
    Schema,
    StringCheck,
    StringRegexCheck
} from "./types.js";

/**
 * @brief freeze schema.
 * @details Freezing hardens builder output before execution engines or exporters rely on
 * schema identity and shape stability.
 */
export function freezeSchema(schema: Schema): Schema {
    return freezeSchemaInner(schema, new WeakSet<object>());
}

/**
 * @brief freeze schema inner.
 * @details Freezing hardens builder output before execution engines or exporters rely on
 * schema identity and shape stability.
 */
function freezeSchemaInner(schema: Schema, frozen: WeakSet<object>): Schema {
    if (frozen.has(schema)) {
        return schema;
    }
    frozen.add(schema);
    switch (schema.tag) {
        case SchemaTag.String:
            freezeStringChecks(schema.checks, frozen);
            return Object.freeze(schema);
        case SchemaTag.Number:
            freezeArray(schema.checks, frozen);
            return Object.freeze(schema);
        case SchemaTag.Date:
            freezeArray(schema.checks, frozen);
            return Object.freeze(schema);
        case SchemaTag.Array:
            freezeSchemaInner(schema.item, frozen);
            freezeArray(schema.checks, frozen);
            return Object.freeze(schema);
        case SchemaTag.Tuple:
            freezeSchemaArray(schema.items, frozen);
            if (schema.rest !== undefined) {
                freezeSchemaInner(schema.rest, frozen);
            }
            return Object.freeze(schema);
        case SchemaTag.Record:
            if (schema.key !== undefined) {
                freezeSchemaInner(schema.key, frozen);
            }
            if (schema.requiredKeys !== undefined) {
                Object.freeze(schema.requiredKeys);
            }
            freezeSchemaInner(schema.value, frozen);
            return Object.freeze(schema);
        case SchemaTag.Map:
            freezeSchemaInner(schema.key, frozen);
            freezeSchemaInner(schema.value, frozen);
            freezeArray(schema.checks, frozen);
            return Object.freeze(schema);
        case SchemaTag.Set:
            freezeSchemaInner(schema.item, frozen);
            freezeArray(schema.checks, frozen);
            return Object.freeze(schema);
        case SchemaTag.File:
            freezeFileChecks(schema.checks, frozen);
            return Object.freeze(schema);
        case SchemaTag.Property:
            freezeSchemaInner(schema.base, frozen);
            freezeSchemaInner(schema.value, frozen);
            return Object.freeze(schema);
        case SchemaTag.Object:
            freezeObjectEntries(schema.entries, frozen);
            if (schema.catchall !== undefined) {
                freezeSchemaInner(schema.catchall, frozen);
            }
            Object.freeze(schema.keys);
            Object.freeze(schema.keyLookup);
            return Object.freeze(schema);
        case SchemaTag.Union:
        case SchemaTag.Xor:
            freezeSchemaArray(schema.options, frozen);
            return Object.freeze(schema);
        case SchemaTag.Intersection:
            freezeSchemaInner(schema.left, frozen);
            freezeSchemaInner(schema.right, frozen);
            return Object.freeze(schema);
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
        case SchemaTag.Nullable:
            freezeSchemaInner(schema.inner, frozen);
            return Object.freeze(schema);
        case SchemaTag.DiscriminatedUnion:
            freezeDiscriminatedUnionCases(schema.cases, frozen);
            return Object.freeze(schema);
        case SchemaTag.Brand:
            freezeSchemaInner(schema.inner, frozen);
            return Object.freeze(schema);
        case SchemaTag.Metadata:
            freezeSchemaInner(schema.inner, frozen);
            if (schema.metadata.examples !== undefined) {
                Object.freeze(schema.metadata.examples);
            }
            Object.freeze(schema.metadata);
            return Object.freeze(schema);
        case SchemaTag.Message:
            freezeSchemaInner(schema.inner, frozen);
            return Object.freeze(schema);
        case SchemaTag.Readonly:
            freezeSchemaInner(schema.inner, frozen);
            return Object.freeze(schema);
        case SchemaTag.KeyedObject:
            freezeSchemaInner(schema.inner, frozen);
            Object.freeze(schema.keys);
            return Object.freeze(schema);
        case SchemaTag.PropertyCount:
            freezeSchemaInner(schema.inner, frozen);
            return Object.freeze(schema);
        case SchemaTag.PropertyNames:
            freezeSchemaInner(schema.inner, frozen);
            freezeSchemaInner(schema.key, frozen);
            return Object.freeze(schema);
        case SchemaTag.PatternProperties:
            freezeSchemaInner(schema.inner, frozen);
            freezePatternPropertyEntries(schema.entries, frozen);
            Object.freeze(schema.keys);
            Object.freeze(schema.keyLookup);
            if (schema.additional !== undefined) {
                freezeSchemaInner(schema.additional, frozen);
            }
            return Object.freeze(schema);
        case SchemaTag.Refine:
            freezeSchemaInner(schema.inner, frozen);
            if (schema.path !== undefined) {
                Object.freeze(schema.path);
            }
            return Object.freeze(schema);
        case SchemaTag.Unknown:
        case SchemaTag.Never:
        case SchemaTag.Symbol:
        case SchemaTag.Boolean:
        case SchemaTag.InstanceOf:
        case SchemaTag.Literal:
        case SchemaTag.Lazy:
            return Object.freeze(schema);
        case SchemaTag.BigInt:
            Object.freeze(schema.checks);
            return Object.freeze(schema);
    }
}

/**
 * @brief freeze array.
 * @details Freezing hardens builder output before execution engines or exporters rely on
 * schema identity and shape stability.
 */
function freezeArray(
    values: readonly object[],
    frozen: WeakSet<object>
): void {
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value !== undefined && !frozen.has(value)) {
            frozen.add(value);
            Object.freeze(value);
        }
    }
    Object.freeze(values);
}

/**
 * @brief Freeze file checks and nested MIME lists.
 */
function freezeFileChecks(
    values: readonly object[],
    frozen: WeakSet<object>
): void {
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value === undefined || frozen.has(value)) {
            continue;
        }
        const maybeMime = value as { readonly values?: readonly string[] };
        if (Array.isArray(maybeMime.values)) {
            Object.freeze(maybeMime.values);
        }
        frozen.add(value);
        Object.freeze(value);
    }
    Object.freeze(values);
}

/**
 * @brief freeze string checks.
 * @details Freezing hardens builder output before execution engines or exporters rely on
 * schema identity and shape stability.
 */
function freezeStringChecks(
    values: readonly StringCheck[],
    frozen: WeakSet<object>
): void {
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value === undefined || frozen.has(value)) {
            continue;
        }
        if (value.tag === StringCheckTag.Regex) {
            freezeRegexCheck(value);
        }
        frozen.add(value);
        Object.freeze(value);
    }
    Object.freeze(values);
}

/**
 * @brief freeze regex check.
 * @details Freezing hardens builder output before execution engines or exporters rely on
 * schema identity and shape stability.
 */
function freezeRegexCheck(check: StringRegexCheck): void {
    const regex = check.regex;
    if (!isPlainRegExp(regex)) {
        throw new TypeError("regex check must use a plain RegExp");
    }
    if (Object.isFrozen(check)) {
        if (Object.isExtensible(regex)) {
            throw new TypeError("frozen regex check must contain a non-extensible RegExp");
        }
        return;
    }
    const cloned = new RegExp(regex.source, regex.flags);
    Object.preventExtensions(cloned);
    Object.defineProperty(check, "regex", {
        configurable: false,
        enumerable: true,
        value: cloned,
        writable: false
    });
}

/**
 * @brief freeze schema array.
 * @details Freezing hardens builder output before execution engines or exporters rely on
 * schema identity and shape stability.
 */
function freezeSchemaArray(
    values: readonly Schema[],
    frozen: WeakSet<object>
): void {
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value !== undefined) {
            freezeSchemaInner(value, frozen);
        }
    }
    Object.freeze(values);
}

/**
 * @brief freeze object entries.
 * @details Freezing hardens builder output before execution engines or exporters rely on
 * schema identity and shape stability.
 */
function freezeObjectEntries(
    entries: readonly ObjectEntry[],
    frozen: WeakSet<object>
): void {
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry !== undefined) {
            freezeSchemaInner(entry.schema, frozen);
            Object.freeze(entry);
        }
    }
    Object.freeze(entries);
}

/**
 * @brief Freeze JSON Schema pattern-property entries.
 */
function freezePatternPropertyEntries(
    entries: readonly PatternPropertyEntry[],
    frozen: WeakSet<object>
): void {
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
            continue;
        }
        if (!isPlainRegExp(entry.regex)) {
            throw new TypeError("patternProperties entry must use a plain RegExp");
        }
        if (Object.isExtensible(entry.regex)) {
            Object.preventExtensions(entry.regex);
        }
        freezeSchemaInner(entry.schema, frozen);
        Object.freeze(entry);
    }
    Object.freeze(entries);
}

/**
 * @brief freeze discriminated union cases.
 * @details Freezing hardens builder output before execution engines or exporters rely on
 * schema identity and shape stability.
 */
function freezeDiscriminatedUnionCases(
    cases: readonly DiscriminatedUnionCase[],
    frozen: WeakSet<object>
): void {
    for (let index = 0; index < cases.length; index += 1) {
        const unionCase = cases[index];
        if (unionCase !== undefined) {
            freezeSchemaInner(unionCase.schema, frozen);
            Object.freeze(unionCase);
        }
    }
    Object.freeze(cases);
}
