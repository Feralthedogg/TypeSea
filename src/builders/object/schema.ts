/**
 * @file schema.ts
 * @brief Object schema construction and shape rewrites.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */

import {
    ObjectModeTag,
    PresenceTag,
    SchemaTag
} from "../../kind/index.js";
import {
    includesString,
    isRecord,
    isUnknownArray,
    readGuardSchema
} from "../../internal/index.js";
import type {
    ObjectEntry,
    ObjectKeyLookup,
    ObjectSchema,
    Schema
} from "../../schema/index.js";
import { isSchemaValue } from "../../schema/index.js";
import type { ObjectShape } from "./types.js";

/**
 * @brief normalized object entry schema.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */
interface NormalizedObjectEntrySchema {
    readonly schema: Schema;
    readonly presence: PresenceTag;
}

/**
 * @brief Normalize an object shape into ordered entries and lookup metadata.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */
export function objectSchema(
    shape: ObjectShape,
    mode: ObjectModeTag
): ObjectSchema {
    if (!isRecord(shape)) {
        throw new TypeError("object shape must be an object");
    }
    const keys = Object.keys(shape);
    const entries = new Array<ObjectEntry>(keys.length);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined) {
            throw new TypeError("Object key disappeared during construction");
        }
        const guard = shape[key];
        const entrySchema = normalizeObjectEntrySchema(
            readGuardSchema(guard, `object property ${key}`)
        );
        entries[index] = {
            key,
            schema: entrySchema.schema,
            presence: entrySchema.presence
        };
    }
    return objectSchemaFromEntries(entries, mode);
}

/**
 * @brief Rebuild object metadata after shape transformations.
 * @details Duplicate keys are rejected here so pick/omit/extend cannot create
 * a schema that disagrees with its strict-key lookup table.
 */
export function objectSchemaFromEntries(
    sourceEntries: readonly ObjectEntry[],
    mode: ObjectModeTag
): ObjectSchema {
    const entries = new Array<ObjectEntry>(sourceEntries.length);
    const keys = new Array<string>(sourceEntries.length);
    const keyLookup = makeObjectKeyLookup();
    for (let index = 0; index < sourceEntries.length; index += 1) {
        const entry = sourceEntries[index];
        if (entry === undefined) {
            throw new TypeError("object entry disappeared during construction");
        }
        if (hasObjectKey(keyLookup, entry.key)) {
            throw new TypeError(`object key ${entry.key} is duplicated`);
        }
        defineObjectKey(keyLookup, entry.key);
        entries[index] = entry;
        keys[index] = entry.key;
    }
    return {
        tag: SchemaTag.Object,
        entries,
        keys,
        keyLookup,
        mode
    };
}

/**
 * @brief Validate the schema value handed to an ObjectGuard constructor.
 * @details Constructors are public JavaScript entry points, so the guard checks
 * both the TypeSea schema marker and the object-schema tag before storing the
 * value. This prevents forged objects from bypassing builder invariants.
 * @param schema Candidate schema supplied to the constructor.
 * @returns Object schema accepted by the constructor.
 */
export function readObjectConstructorSchema(schema: unknown): ObjectSchema {
    if (!isSchemaValue(schema) || schema.tag !== SchemaTag.Object) {
        throw new TypeError("ObjectGuard constructor requires an object schema");
    }
    return schema;
}

/**
 * @brief Extract an object schema from another guard for object-only methods.
 * @details Methods such as merge and extension compose object shapes. Accepting
 * a scalar guard here would build an impossible schema, so the check is kept at
 * the API edge with the caller-facing label in the error message.
 * @param guard Candidate TypeSea guard.
 * @param label Human-readable API label used in thrown errors.
 * @returns Object schema owned by the supplied guard.
 */
export function readObjectMethodSchema(guard: unknown, label: string): ObjectSchema {
    const schema = readGuardSchema(guard, label);
    if (schema.tag !== SchemaTag.Object) {
        throw new TypeError(`${label} must be an object TypeSea guard`);
    }
    return schema;
}

/**
 * @brief Merge two object schemas while letting extension keys override base keys.
 * @details Existing base order is preserved for stable diagnostics and codegen.
 * Extension-only keys are appended afterward, and the base strict/open mode is
 * retained so shape extension does not silently change excess-key policy.
 * @param base Source object schema being extended.
 * @param extension Object schema whose matching keys replace base entries.
 * @returns Rebuilt object schema with fresh lookup metadata.
 */
export function mergeObjectSchemas(
    base: ObjectSchema,
    extension: ObjectSchema
): ObjectSchema {
    const entries: ObjectEntry[] = [];
    for (let index = 0; index < base.entries.length; index += 1) {
        const entry = base.entries[index];
        if (entry !== undefined) {
            entries.push(findObjectEntry(extension.entries, entry.key) ?? entry);
        }
    }
    for (let index = 0; index < extension.entries.length; index += 1) {
        const entry = extension.entries[index];
        if (entry !== undefined && !hasObjectKey(base.keyLookup, entry.key)) {
            entries.push(entry);
        }
    }
    return objectSchemaFromEntries(entries, base.mode);
}

/**
 * @brief Build an object schema containing only a validated key selection.
 * @details The caller has already checked that keys are known and unique. This
 * function preserves selection order so user-requested projection order is also
 * the order used by diagnostics and generated object checks.
 * @param schema Source object schema.
 * @param keys Validated key selection.
 * @returns Rebuilt object schema containing only selected entries.
 */
export function pickObjectSchema(
    schema: ObjectSchema,
    keys: readonly string[]
): ObjectSchema {
    const entries = new Array<ObjectEntry>(keys.length);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        const entry = key === undefined
            ? undefined
            : findObjectEntry(schema.entries, key);
        if (entry === undefined) {
            throw new TypeError("picked object key disappeared during construction");
        }
        entries[index] = entry;
    }
    return objectSchemaFromEntries(entries, schema.mode);
}

/**
 * @brief Build an object schema with a validated key selection removed.
 * @details Entries not listed for removal keep their original relative order
 * and presence metadata. The object mode is preserved across the rewrite.
 * @param schema Source object schema.
 * @param keys Validated key selection to remove.
 * @returns Rebuilt object schema without the selected entries.
 */
export function omitObjectSchema(
    schema: ObjectSchema,
    keys: readonly string[]
): ObjectSchema {
    const entries: ObjectEntry[] = [];
    for (let index = 0; index < schema.entries.length; index += 1) {
        const entry = schema.entries[index];
        if (entry !== undefined && !includesString(keys, entry.key)) {
            entries.push(entry);
        }
    }
    return objectSchemaFromEntries(entries, schema.mode);
}

/**
 * @brief Convert every object entry to optional presence.
 * @details The child schemas are not wrapped or cloned; only field presence is
 * rewritten. This keeps value-domain wrappers such as nullable and brand exactly
 * as they were on the original entries.
 * @param schema Source object schema.
 * @returns Rebuilt object schema with optional entries.
 */
export function partialObjectSchema(schema: ObjectSchema): ObjectSchema {
    const entries = new Array<ObjectEntry>(schema.entries.length);
    for (let index = 0; index < schema.entries.length; index += 1) {
        const entry = schema.entries[index];
        if (entry !== undefined) {
            entries[index] = {
                key: entry.key,
                schema: entry.schema,
                presence: PresenceTag.Optional
            };
        }
    }
    return objectSchemaFromEntries(entries, schema.mode);
}

/**
 * @brief Validate the key list supplied to object pick and omit operations.
 * @details The returned array contains only known, unique string keys. This
 * preflight keeps later schema rewriting simple and prevents silently selecting
 * fields that were never part of the source object schema.
 * @param keys Candidate key list from public API calls.
 * @param schema Object schema whose keys define the valid selection domain.
 * @param label Human-readable API label used in thrown errors.
 * @returns Ordered key selection accepted by the object builder.
 */
export function readObjectKeySelection(
    keys: unknown,
    schema: ObjectSchema,
    label: string
): readonly string[] {
    if (!isUnknownArray(keys)) {
        throw new TypeError(`${label} must be an array`);
    }
    const selected = new Array<string>(keys.length);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (typeof key !== "string") {
            throw new TypeError(`${label} must contain only strings`);
        }
        if (!hasObjectKey(schema.keyLookup, key)) {
            throw new TypeError(`${label} contains unknown object key ${key}`);
        }
        if (includesString(selected, key)) {
            throw new TypeError(`${label} contains duplicate object key ${key}`);
        }
        selected[index] = key;
    }
    return selected;
}

/**
 * @brief Find an object entry by key using the ordered entry vector.
 * @details The ordered vector is the source of truth for diagnostic and codegen
 * order. The lookup table proves membership, while this helper recovers the
 * full entry payload.
 * @param entries Ordered object entries.
 * @param key Field name to locate.
 * @returns Matching object entry, or undefined when absent.
 */
function findObjectEntry(
    entries: readonly ObjectEntry[],
    key: string
): ObjectEntry | undefined {
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry?.key === key) {
            return entry;
        }
    }
    return undefined;
}

/**
 * @brief Allocate a null-prototype lookup table for object schema keys.
 * @details User field names may overlap with Object.prototype properties. A
 * null-prototype table keeps membership checks data-only and avoids inherited
 * keys participating in schema construction.
 * @returns Empty key lookup table used by object schemas.
 */
function makeObjectKeyLookup(): Record<string, true> {
    return Object.create(null) as Record<string, true>;
}

/**
 * @brief Install one immutable key marker into an object-schema lookup table.
 * @details Object keys are defined as own data properties so membership checks
 * cannot be influenced by prototype state or later mutation of the table.
 * @param target Null-prototype key lookup table.
 * @param key Field name to mark as present.
 */
function defineObjectKey(target: Record<string, true>, key: string): void {
    Object.defineProperty(target, key, {
        configurable: false,
        enumerable: true,
        value: true,
        writable: false
    });
}

/**
 * @brief Test object-schema key membership through the prepared lookup table.
 * @details The table stores immutable true values, so direct indexed access is
 * sufficient and avoids repeated descriptor allocation during builder work.
 * @param keyLookup Null-prototype lookup table from the object schema.
 * @param key Candidate field name.
 * @returns True when the key belongs to the object schema.
 */
function hasObjectKey(keyLookup: ObjectKeyLookup, key: string): boolean {
    return keyLookup[key] === true;
}

/**
 * @brief Split object-field presence from value-domain schema wrappers.
 * @details Optional is the only wrapper that changes field presence. Other
 * wrappers are rebuilt around the normalized inner schema so optionality can
 * propagate outward without losing nullable, brand, or refinement behavior.
 * @param schema Field schema supplied by the object builder.
 * @returns Normalized child schema and required/optional presence tag.
 */
function normalizeObjectEntrySchema(schema: Schema): NormalizedObjectEntrySchema {
    switch (schema.tag) {
        case SchemaTag.Optional:
            return {
                schema: normalizeObjectEntrySchema(schema.inner).schema,
                presence: PresenceTag.Optional
            };
        case SchemaTag.Undefinedable:
            return normalizeWrappedObjectEntrySchema(
                schema.inner,
                (inner): Schema => ({
                    tag: SchemaTag.Undefinedable,
                    inner
                }),
                schema
            );
        case SchemaTag.Nullable:
            return normalizeWrappedObjectEntrySchema(
                schema.inner,
                (inner): Schema => ({
                    tag: SchemaTag.Nullable,
                    inner
                }),
                schema
            );
        case SchemaTag.Brand:
            return normalizeWrappedObjectEntrySchema(
                schema.inner,
                (inner): Schema => ({
                    tag: SchemaTag.Brand,
                    inner,
                    brand: schema.brand
                }),
                schema
            );
        case SchemaTag.Refine:
            return normalizeWrappedObjectEntrySchema(
                schema.inner,
                (inner): Schema => ({
                    tag: SchemaTag.Refine,
                    inner,
                    predicate: schema.predicate,
                    name: schema.name
                }),
                schema
            );
        default:
            return {
                schema,
                presence: PresenceTag.Required
            };
    }
}

/**
 * @brief Rebuild a wrapper after normalizing its inner object-field schema.
 * @details When the inner schema stays required, the original wrapper can be
 * kept unchanged. When optionality is discovered inside, the wrapper is rebuilt
 * around the normalized child and the field presence becomes optional.
 * @param inner Inner schema carried by the wrapper.
 * @param wrap Function that rebuilds the same wrapper around a new child.
 * @param original Original wrapper schema.
 * @returns Normalized schema and presence tag for the object field.
 */
function normalizeWrappedObjectEntrySchema(
    inner: Schema,
    wrap: (schema: Schema) => Schema,
    original: Schema
): NormalizedObjectEntrySchema {
    const normalized = normalizeObjectEntrySchema(inner);
    if (normalized.presence === PresenceTag.Required) {
        return {
            schema: original,
            presence: PresenceTag.Required
        };
    }
    return {
        schema: wrap(normalized.schema),
        presence: PresenceTag.Optional
    };
}
