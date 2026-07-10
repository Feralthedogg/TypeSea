/**
 * @file schema.ts
 * @brief Object schema construction and shape rewrites.
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
 */
interface NormalizedObjectEntrySchema {
    readonly schema: Schema;
    readonly presence: PresenceTag;
}

/**
 * @brief Normalize an object shape into ordered entries and lookup metadata.
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
        const descriptor = Object.getOwnPropertyDescriptor(shape, key);
        if (descriptor === undefined) {
            throw new TypeError(`object property ${key} disappeared during construction`);
        }
        const entrySchema = readObjectShapeEntrySchema(shape, key, descriptor);
        entries[index] = {
            key,
            schema: entrySchema.schema,
            presence: entrySchema.presence
        };
    }
    return objectSchemaFromEntries(entries, mode, undefined);
}

/**
 * @brief Read one object-shape entry without forcing recursive getters.
 * @details Data slots keep the historical eager validation path. Accessor slots
 * are treated as schema thunks so Zod-style recursive object getters can refer
 * to the guard that is still being initialized.
 * @param shape User-supplied object shape.
 * @param key Shape key currently being normalized.
 * @param descriptor Own property descriptor for the shape entry.
 * @returns Schema stored by the entry or a lazy schema that resolves it later.
 */
function readObjectShapeEntrySchema(
    shape: ObjectShape,
    key: string,
    descriptor: PropertyDescriptor
): NormalizedObjectEntrySchema {
    if (Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        return normalizeObjectEntrySchema(
            readGuardSchema(descriptor.value, `object property ${key}`)
        );
    }
    const get = descriptor.get?.bind(shape) as (() => unknown) | undefined;
    if (get === undefined) {
        throw new TypeError(`object property ${key} must be a TypeSea guard`);
    }
    return objectShapeGetterSchema(key, get);
}

/**
 * @brief Convert a recursive shape getter into a cached lazy schema.
 * @details The getter belongs to the schema definition object, not to runtime
 * input data. Validation still rejects input accessors; this path only defers
 * developer-authored schema lookup until the recursive binding exists.
 * @param key Shape key associated with the getter.
 * @param get Getter function returning a TypeSea guard.
 * @returns Lazy schema whose first successful resolution is cached.
 */
function objectShapeGetterSchema(
    key: string,
    get: () => unknown
): NormalizedObjectEntrySchema {
    let cached: NormalizedObjectEntrySchema | undefined;
    const read = (): NormalizedObjectEntrySchema => {
        cached ??= normalizeObjectEntrySchema(
            readGuardSchema(get(), `object property ${key}`)
        );
        return cached;
    };
    return {
        schema: {
            tag: SchemaTag.Lazy,
            get: (): Schema => read().schema,
            objectPresence: (): PresenceTag => read().presence
        },
        presence: PresenceTag.Deferred
    };
}

/**
 * @brief Rebuild object metadata after shape transformations.
 * @details Duplicate keys are rejected here so pick/omit/extend cannot create
 * a schema that disagrees with its strict-key lookup table.
 */
export function objectSchemaFromEntries(
    sourceEntries: readonly ObjectEntry[],
    mode: ObjectModeTag,
    catchall: Schema | undefined
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
        mode,
        catchall
    };
}

/**
 * @brief Rebuild an object schema with a different unknown-key mode.
 * @param schema Source object schema.
 * @param mode Unknown-key policy for the rebuilt schema.
 * @returns Object schema with identical entries and catchall policy.
 */
export function objectSchemaWithMode(
    schema: ObjectSchema,
    mode: ObjectModeTag
): ObjectSchema {
    return objectSchemaFromEntries(schema.entries, mode, schema.catchall);
}

/**
 * @brief Rebuild an object schema with an unknown-key validator.
 * @param schema Source object schema.
 * @param catchall Schema applied to every undeclared own key.
 * @returns Object schema that validates extra keys with the supplied schema.
 */
export function objectSchemaWithCatchall(
    schema: ObjectSchema,
    catchall: Schema
): ObjectSchema {
    return objectSchemaFromEntries(schema.entries, schema.mode, catchall);
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
    return objectSchemaFromEntries(
        entries,
        base.mode,
        extension.catchall ?? base.catchall
    );
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
    return objectSchemaFromEntries(entries, schema.mode, schema.catchall);
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
    return objectSchemaFromEntries(entries, schema.mode, schema.catchall);
}

/**
 * @brief Convert every object entry to optional presence.
 * @details The child schemas are not wrapped or cloned; only field presence is
 * rewritten. This keeps value-domain wrappers such as nullable and brand exactly
 * as they were on the original entries.
 * @param schema Source object schema.
 * @returns Rebuilt object schema with optional entries.
 */
export function partialObjectSchema(
    schema: ObjectSchema,
    selection?: readonly string[]
): ObjectSchema {
    const selected = selection === undefined ? undefined : makeSelectionLookup(selection);
    const entries = new Array<ObjectEntry>(schema.entries.length);
    for (let index = 0; index < schema.entries.length; index += 1) {
        const entry = schema.entries[index];
        if (entry !== undefined) {
            entries[index] = {
                key: entry.key,
                schema: entry.schema,
                presence: selected === undefined || selected[entry.key] === true
                    ? PresenceTag.Optional
                    : entry.presence
            };
        }
    }
    return objectSchemaFromEntries(entries, schema.mode, schema.catchall);
}

/**
 * @brief Recursively convert object entries to optional presence.
 * @param schema Source object schema.
 * @returns Rebuilt object schema with nested object/container children partialized.
 * @details Lazy and refinement schemas are treated as semantic barriers because
 * their runtime callbacks may depend on the original exact value domain.
 */
export function deepPartialObjectSchema(schema: ObjectSchema): ObjectSchema {
    const entries = new Array<ObjectEntry>(schema.entries.length);
    for (let index = 0; index < schema.entries.length; index += 1) {
        const entry = schema.entries[index];
        if (entry !== undefined) {
            entries[index] = {
                key: entry.key,
                schema: deepPartialSchema(entry.schema),
                presence: PresenceTag.Optional
            };
        }
    }
    const catchall = schema.catchall === undefined
        ? undefined
        : deepPartialSchema(schema.catchall);
    return objectSchemaFromEntries(entries, schema.mode, catchall);
}

/**
 * @brief Convert every object entry to required presence.
 * @param schema Source object schema.
 * @returns Rebuilt object schema with required entries.
 * @details Object construction already stripped Optional wrappers into entry
 * presence metadata. Requiring a field therefore only needs to flip that
 * metadata back to Required while preserving each value-domain schema.
 */
export function requiredObjectSchema(
    schema: ObjectSchema,
    selection?: readonly string[]
): ObjectSchema {
    const selected = selection === undefined ? undefined : makeSelectionLookup(selection);
    const entries = new Array<ObjectEntry>(schema.entries.length);
    for (let index = 0; index < schema.entries.length; index += 1) {
        const entry = schema.entries[index];
        if (entry !== undefined) {
            entries[index] = {
                key: entry.key,
                schema: entry.schema,
                presence: selected === undefined || selected[entry.key] === true
                    ? PresenceTag.Required
                    : entry.presence
            };
        }
    }
    return objectSchemaFromEntries(entries, schema.mode, schema.catchall);
}

/**
 * @brief Build a fixed lookup for selected object keys.
 * @param selection Validated key list from the object API.
 * @returns Null-prototype lookup used while rewriting object entries.
 */
function makeSelectionLookup(selection: readonly string[]): Readonly<Record<string, true>> {
    const lookup: Record<string, true> = Object.create(null) as Record<string, true>;
    for (let index = 0; index < selection.length; index += 1) {
        const key = selection[index];
        if (key !== undefined) {
            lookup[key] = true;
        }
    }
    return Object.freeze(lookup);
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
    if (isRecord(keys)) {
        return readObjectKeyMask(keys, schema, label);
    }
    if (!isUnknownArray(keys)) {
        throw new TypeError(`${label} must be an array or key mask`);
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
 * @brief Validate a Zod-style object key mask.
 * @param mask Candidate object whose selected keys have value true.
 * @param schema Object schema whose keys define the valid selection domain.
 * @param label Human-readable API label used in thrown errors.
 * @returns Ordered key selection accepted by object pick and omit.
 */
function readObjectKeyMask(
    mask: Readonly<Record<string, unknown>>,
    schema: ObjectSchema,
    label: string
): readonly string[] {
    const keys = Object.keys(mask);
    const selected: string[] = [];
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined) {
            continue;
        }
        if (mask[key] !== true) {
            throw new TypeError(`${label} mask values must be true`);
        }
        if (!hasObjectKey(schema.keyLookup, key)) {
            throw new TypeError(`${label} contains unknown object key ${key}`);
        }
        selected.push(key);
    }
    return selected;
}

/**
 * @brief Recursively partialize pure schema containers.
 * @param schema Schema to rewrite.
 * @returns Schema with nested object fields made optional where safe.
 */
function deepPartialSchema(schema: Schema): Schema {
    switch (schema.tag) {
        case SchemaTag.Object:
            return deepPartialObjectSchema(schema);
        case SchemaTag.Array:
            return {
                tag: SchemaTag.Array,
                item: deepPartialSchema(schema.item),
                checks: schema.checks
            };
        case SchemaTag.Tuple:
            return {
                tag: SchemaTag.Tuple,
                items: mapDeepPartialSchemas(schema.items),
                rest: schema.rest === undefined
                    ? undefined
                    : deepPartialSchema(schema.rest)
            };
        case SchemaTag.Record:
            return {
                tag: SchemaTag.Record,
                key: schema.key,
                value: deepPartialSchema(schema.value),
                loose: schema.loose
            };
        case SchemaTag.Map:
            return {
                tag: SchemaTag.Map,
                key: deepPartialSchema(schema.key),
                value: deepPartialSchema(schema.value),
                checks: schema.checks
            };
        case SchemaTag.Set:
            return {
                tag: SchemaTag.Set,
                item: deepPartialSchema(schema.item),
                checks: schema.checks
            };
        case SchemaTag.Property:
            return {
                tag: SchemaTag.Property,
                base: deepPartialSchema(schema.base),
                key: schema.key,
                value: deepPartialSchema(schema.value)
            };
        case SchemaTag.Union:
        case SchemaTag.Xor:
            return {
                tag: schema.tag,
                options: mapDeepPartialSchemas(schema.options)
            };
        case SchemaTag.Intersection:
            return {
                tag: SchemaTag.Intersection,
                left: deepPartialSchema(schema.left),
                right: deepPartialSchema(schema.right)
            };
        case SchemaTag.Optional:
            return {
                tag: SchemaTag.Optional,
                inner: deepPartialSchema(schema.inner)
            };
        case SchemaTag.Undefinedable:
            return {
                tag: SchemaTag.Undefinedable,
                inner: deepPartialSchema(schema.inner)
            };
        case SchemaTag.Nullable:
            return {
                tag: SchemaTag.Nullable,
                inner: deepPartialSchema(schema.inner)
            };
        case SchemaTag.Brand:
            return {
                tag: SchemaTag.Brand,
                inner: deepPartialSchema(schema.inner),
                brand: schema.brand
            };
        case SchemaTag.Metadata:
            return {
                tag: SchemaTag.Metadata,
                inner: deepPartialSchema(schema.inner),
                metadata: schema.metadata
            };
        case SchemaTag.Message:
            return {
                tag: SchemaTag.Message,
                inner: deepPartialSchema(schema.inner),
                message: schema.message
            };
        case SchemaTag.KeyedObject:
            return {
                tag: SchemaTag.KeyedObject,
                inner: deepPartialSchema(schema.inner),
                keys: schema.keys,
                rule: schema.rule
            };
        case SchemaTag.PropertyCount:
            return {
                tag: SchemaTag.PropertyCount,
                inner: deepPartialSchema(schema.inner),
                min: schema.min,
                max: schema.max
            };
        case SchemaTag.PropertyNames:
            return {
                tag: SchemaTag.PropertyNames,
                inner: deepPartialSchema(schema.inner),
                key: schema.key
            };
        case SchemaTag.PatternProperties:
            return {
                tag: SchemaTag.PatternProperties,
                inner: deepPartialSchema(schema.inner),
                entries: schema.entries,
                keys: schema.keys,
                keyLookup: schema.keyLookup,
                additional: schema.additional,
                allowAdditional: schema.allowAdditional
            };
        default:
            return schema;
    }
}

/**
 * @brief Deep-partialize a schema vector.
 * @param schemas Source schema vector.
 * @returns New schema vector preserving index order.
 */
function mapDeepPartialSchemas(schemas: readonly Schema[]): readonly Schema[] {
    const mapped = new Array<Schema>(schemas.length);
    for (let index = 0; index < schemas.length; index += 1) {
        const schema = schemas[index];
        if (schema !== undefined) {
            mapped[index] = deepPartialSchema(schema);
        }
    }
    return mapped;
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
        case SchemaTag.Metadata:
            return normalizeWrappedObjectEntrySchema(
                schema.inner,
                (inner): Schema => ({
                    tag: SchemaTag.Metadata,
                    inner,
                    metadata: schema.metadata
                }),
                schema
            );
        case SchemaTag.Message:
            return normalizeWrappedObjectEntrySchema(
                schema.inner,
                (inner): Schema => ({
                    tag: SchemaTag.Message,
                    inner,
                    message: schema.message
                }),
                schema
            );
        case SchemaTag.KeyedObject:
            return normalizeWrappedObjectEntrySchema(
                schema.inner,
                (inner): Schema => ({
                    tag: SchemaTag.KeyedObject,
                    inner,
                    keys: schema.keys,
                    rule: schema.rule
                }),
                schema
            );
        case SchemaTag.PropertyCount:
            return normalizeWrappedObjectEntrySchema(
                schema.inner,
                (inner): Schema => ({
                    tag: SchemaTag.PropertyCount,
                    inner,
                    min: schema.min,
                    max: schema.max
                }),
                schema
            );
        case SchemaTag.PropertyNames:
            return normalizeWrappedObjectEntrySchema(
                schema.inner,
                (inner): Schema => ({
                    tag: SchemaTag.PropertyNames,
                    inner,
                    key: schema.key
                }),
                schema
            );
        case SchemaTag.PatternProperties:
            return normalizeWrappedObjectEntrySchema(
                schema.inner,
                (inner): Schema => ({
                    tag: SchemaTag.PatternProperties,
                    inner,
                    entries: schema.entries,
                    keys: schema.keys,
                    keyLookup: schema.keyLookup,
                    additional: schema.additional,
                    allowAdditional: schema.allowAdditional
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
                    collect: schema.collect,
                    path: schema.path,
                    message: schema.message,
                    abort: schema.abort,
                    when: schema.when,
                    name: schema.name
                }),
                schema
            );
        case SchemaTag.Lazy:
            if (schema.objectPresence !== undefined) {
                return {
                    schema,
                    presence: PresenceTag.Deferred
                };
            }
            return {
                schema,
                presence: PresenceTag.Required
            };
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
