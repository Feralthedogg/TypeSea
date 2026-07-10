/**
 * @file schema/freeze.ts
 * @brief Schema freezing and collection hardening.
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
 */
export function freezeSchema(schema: Schema): Schema {
    return freezeSchemaInner(schema, new WeakSet<object>());
}

/**
 * @brief freeze schema inner.
 */
function freezeSchemaInner(schema: Schema, frozen: WeakSet<object>): Schema {
    if (frozen.has(schema)) {
        return schema;
    }
    frozen.add(schema);
    if (freezeScalarSchemaChildren(schema, frozen)) {
        return Object.freeze(schema);
    }
    if (freezeCompositeSchemaChildren(schema, frozen)) {
        return Object.freeze(schema);
    }
    freezeWrapperSchemaChildren(schema, frozen);
    return Object.freeze(schema);
}

/**
 * @brief Freeze child data owned by scalar schema records.
 * @param schema Schema node being hardened.
 * @param frozen Object identities already hardened in this traversal.
 * @returns True when this helper handled the schema tag.
 */
function freezeScalarSchemaChildren(schema: Schema, frozen: WeakSet<object>): boolean {
    switch (schema.tag) {
        case SchemaTag.String:
            freezeStringChecks(schema.checks, frozen);
            return true;
        case SchemaTag.Number:
        case SchemaTag.Date:
            freezeArray(schema.checks, frozen);
            return true;
        case SchemaTag.File:
            freezeFileChecks(schema.checks, frozen);
            return true;
        case SchemaTag.Unknown:
        case SchemaTag.Never:
        case SchemaTag.Symbol:
        case SchemaTag.Boolean:
        case SchemaTag.InstanceOf:
        case SchemaTag.Literal:
        case SchemaTag.Lazy:
            return true;
        case SchemaTag.BigInt:
            Object.freeze(schema.checks);
            return true;
        default:
            return false;
    }
}

/**
 * @brief Freeze child data owned by composite schema records.
 * @param schema Schema node being hardened.
 * @param frozen Object identities already hardened in this traversal.
 * @returns True when this helper handled the schema tag.
 */
function freezeCompositeSchemaChildren(schema: Schema, frozen: WeakSet<object>): boolean {
    switch (schema.tag) {
        case SchemaTag.Array:
            freezeSchemaInner(schema.item, frozen);
            freezeArray(schema.checks, frozen);
            return true;
        case SchemaTag.Tuple:
            freezeSchemaArray(schema.items, frozen);
            if (schema.rest !== undefined) {
                freezeSchemaInner(schema.rest, frozen);
            }
            return true;
        case SchemaTag.Record:
            if (schema.key !== undefined) {
                freezeSchemaInner(schema.key, frozen);
            }
            if (schema.requiredKeys !== undefined) {
                Object.freeze(schema.requiredKeys);
            }
            freezeSchemaInner(schema.value, frozen);
            return true;
        case SchemaTag.Map:
            freezeSchemaInner(schema.key, frozen);
            freezeSchemaInner(schema.value, frozen);
            freezeArray(schema.checks, frozen);
            return true;
        case SchemaTag.Set:
            freezeSchemaInner(schema.item, frozen);
            freezeArray(schema.checks, frozen);
            return true;
        case SchemaTag.Property:
            freezeSchemaInner(schema.base, frozen);
            freezeSchemaInner(schema.value, frozen);
            return true;
        case SchemaTag.Object:
            freezeObjectEntries(schema.entries, frozen);
            if (schema.catchall !== undefined) {
                freezeSchemaInner(schema.catchall, frozen);
            }
            Object.freeze(schema.keys);
            Object.freeze(schema.keyLookup);
            return true;
        case SchemaTag.Union:
        case SchemaTag.Xor:
            freezeSchemaArray(schema.options, frozen);
            return true;
        case SchemaTag.Intersection:
            freezeSchemaInner(schema.left, frozen);
            freezeSchemaInner(schema.right, frozen);
            return true;
        case SchemaTag.DiscriminatedUnion:
            freezeDiscriminatedUnionCases(schema.cases, frozen);
            return true;
        default:
            return false;
    }
}

/**
 * @brief Freeze child data owned by wrapper and policy schema records.
 * @param schema Schema node being hardened.
 * @param frozen Object identities already hardened in this traversal.
 * @returns True when this helper handled the schema tag.
 */
function freezeWrapperSchemaChildren(schema: Schema, frozen: WeakSet<object>): boolean {
    switch (schema.tag) {
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
        case SchemaTag.Nullable:
        case SchemaTag.Brand:
        case SchemaTag.Message:
        case SchemaTag.Readonly:
        case SchemaTag.PropertyCount:
            freezeSchemaInner(schema.inner, frozen);
            return true;
        case SchemaTag.Metadata:
            freezeSchemaInner(schema.inner, frozen);
            if (schema.metadata.examples !== undefined) {
                Object.freeze(schema.metadata.examples);
            }
            Object.freeze(schema.metadata);
            return true;
        case SchemaTag.KeyedObject:
            freezeSchemaInner(schema.inner, frozen);
            Object.freeze(schema.keys);
            return true;
        case SchemaTag.PropertyNames:
            freezeSchemaInner(schema.inner, frozen);
            freezeSchemaInner(schema.key, frozen);
            return true;
        case SchemaTag.PatternProperties:
            freezeSchemaInner(schema.inner, frozen);
            freezePatternPropertyEntries(schema.entries, frozen);
            Object.freeze(schema.keys);
            Object.freeze(schema.keyLookup);
            if (schema.additional !== undefined) {
                freezeSchemaInner(schema.additional, frozen);
            }
            return true;
        case SchemaTag.Refine:
            freezeSchemaInner(schema.inner, frozen);
            if (schema.path !== undefined) {
                Object.freeze(schema.path);
            }
            return true;
        default:
            return false;
    }
}

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
