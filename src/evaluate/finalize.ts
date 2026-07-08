/**
 * @file finalize.ts
 * @brief Successful-value finalization for output-affecting wrappers.
 * @details Validation remains side-effect free until the full schema has
 * accepted. Readonly wrappers freeze accepted values only at publication
 * boundaries such as check(), parse(), safeParse(), and assert().
 */

import { ObjectModeTag, SchemaTag } from "../kind/index.js";
import {
    recordKeyInput,
    resolveLazySchema,
    type DiscriminatedUnionCase,
    type ObjectEntry,
    type Schema
} from "../schema/index.js";
import { isSchema } from "./predicate.js";
import {
    readMapEntries,
    readSetValues
} from "./shared.js";

const finalizationCache = new WeakMap<object, boolean>();

interface CachedFinalizedValue {
    readonly found: boolean;
    readonly value: unknown;
}

interface FinalizeState {
    readonly pairs: WeakMap<object, WeakSet<object>>;
    readonly outputs: WeakMap<object, WeakMap<object, unknown>>;
}

/**
 * @brief Return whether a schema tree contains a readonly wrapper.
 * @param schema Schema tree to inspect without executing user code.
 * @returns True when successful validation must freeze at least one value.
 */
export function schemaNeedsFinalization(schema: Schema): boolean {
    const cached = finalizationCache.get(schema);
    if (cached !== undefined) {
        return cached;
    }
    const value = schemaNeedsFinalizationInner(schema, new WeakSet<object>());
    finalizationCache.set(schema, value);
    return value;
}

/**
 * @brief Finalize values accepted through output-affecting wrappers.
 * @param schema Schema that accepted the value.
 * @param value Accepted runtime value.
 * @returns Finalized publication value.
 */
export function finalizeAcceptedValue<TValue>(
    schema: Schema,
    value: TValue
): TValue {
    if (!schemaNeedsFinalization(schema)) {
        return value;
    }
    return finalizeValue(schema, value, {
        pairs: new WeakMap<object, WeakSet<object>>(),
        outputs: new WeakMap<object, WeakMap<object, unknown>>()
    }) as TValue;
}

/**
 * @brief Inspect output-affecting wrappers without resolving lazy schemas.
 */
function schemaNeedsFinalizationInner(schema: Schema, seen: WeakSet<object>): boolean {
    if (seen.has(schema)) {
        return false;
    }
    seen.add(schema);
    switch (schema.tag) {
        case SchemaTag.Readonly:
            return true;
        case SchemaTag.Array:
            return schemaNeedsFinalizationInner(schema.item, seen);
        case SchemaTag.Tuple:
            return schemaArrayNeedsFinalization(schema.items, seen) ||
                (
                    schema.rest !== undefined &&
                    schemaNeedsFinalizationInner(schema.rest, seen)
                );
        case SchemaTag.Record:
            return (
                schema.key !== undefined &&
                schemaNeedsFinalizationInner(schema.key, seen)
            ) ||
                schemaNeedsFinalizationInner(schema.value, seen);
        case SchemaTag.Map:
            return schemaNeedsFinalizationInner(schema.key, seen) ||
                schemaNeedsFinalizationInner(schema.value, seen);
        case SchemaTag.Set:
            return schemaNeedsFinalizationInner(schema.item, seen);
        case SchemaTag.Property:
            return schemaNeedsFinalizationInner(schema.base, seen) ||
                schemaNeedsFinalizationInner(schema.value, seen);
        case SchemaTag.Object:
            return schema.mode === ObjectModeTag.Strip ||
                objectEntriesNeedFinalization(schema.entries, seen) ||
                (schema.catchall !== undefined &&
                    schemaNeedsFinalizationInner(schema.catchall, seen));
        case SchemaTag.Union:
        case SchemaTag.Xor:
            return schemaArrayNeedsFinalization(schema.options, seen);
        case SchemaTag.Intersection:
            return schemaNeedsFinalizationInner(schema.left, seen) ||
                schemaNeedsFinalizationInner(schema.right, seen);
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
        case SchemaTag.Nullable:
        case SchemaTag.Brand:
        case SchemaTag.Metadata:
        case SchemaTag.Message:
        case SchemaTag.KeyedObject:
        case SchemaTag.PropertyCount:
        case SchemaTag.PropertyNames:
        case SchemaTag.PatternProperties:
        case SchemaTag.Refine:
            return schemaNeedsFinalizationInner(schema.inner, seen);
        case SchemaTag.DiscriminatedUnion:
            return unionCasesNeedFinalization(schema.cases, seen);
        case SchemaTag.Lazy:
            return false;
        case SchemaTag.Unknown:
        case SchemaTag.Never:
        case SchemaTag.String:
        case SchemaTag.Number:
        case SchemaTag.Date:
        case SchemaTag.BigInt:
        case SchemaTag.Symbol:
        case SchemaTag.Boolean:
        case SchemaTag.Literal:
        case SchemaTag.File:
        case SchemaTag.InstanceOf:
            return false;
    }
}

/**
 * @brief Finalize one accepted value under one schema.
 */
function finalizeValue(
    schema: Schema,
    value: unknown,
    state: FinalizeState
): unknown {
    const cached = readFinalizedOutput(schema, value, state);
    if (cached.found) {
        return cached.value;
    }
    if (!enterFinalizePair(schema, value, state)) {
        return value;
    }
    switch (schema.tag) {
        case SchemaTag.Readonly: {
            const output = finalizeValue(schema.inner, value, state);
            freezeObjectLike(output);
            return output;
        }
        case SchemaTag.Array:
            return finalizeArray(schema.item, value, state);
        case SchemaTag.Tuple:
            return finalizeTuple(schema.items, schema.rest, value, state);
        case SchemaTag.Record:
            return finalizeRecord(schema.key, schema.value, schema.loose, value, state);
        case SchemaTag.Map:
            return finalizeMap(schema.key, schema.value, value, state);
        case SchemaTag.Set:
            return finalizeSet(schema.item, value, state);
        case SchemaTag.Property: {
            const base = finalizeValue(schema.base, value, state);
            return finalizeProperty(schema.key, schema.value, base, state);
        }
        case SchemaTag.Object:
            return finalizeObject(schema, value, state);
        case SchemaTag.Union:
            return finalizeFirstMatching(schema.options, value, state);
        case SchemaTag.Xor:
            return finalizeFirstMatching(schema.options, value, state);
        case SchemaTag.Intersection: {
            const left = finalizeValue(schema.left, value, state);
            return finalizeValue(schema.right, left, state);
        }
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
            if (value !== undefined) {
                return finalizeValue(schema.inner, value, state);
            }
            return value;
        case SchemaTag.Nullable:
            if (value !== null) {
                return finalizeValue(schema.inner, value, state);
            }
            return value;
        case SchemaTag.Brand:
        case SchemaTag.Metadata:
        case SchemaTag.Message:
        case SchemaTag.KeyedObject:
        case SchemaTag.PropertyCount:
        case SchemaTag.PropertyNames:
        case SchemaTag.PatternProperties:
        case SchemaTag.Refine:
            return finalizeValue(schema.inner, value, state);
        case SchemaTag.DiscriminatedUnion:
            return finalizeMatchingCase(schema.cases, value, state);
        case SchemaTag.Lazy:
            return finalizeValue(resolveLazySchema(schema, new WeakSet<object>()), value, state);
        case SchemaTag.Unknown:
        case SchemaTag.Never:
        case SchemaTag.String:
        case SchemaTag.Number:
        case SchemaTag.Date:
        case SchemaTag.BigInt:
        case SchemaTag.Symbol:
        case SchemaTag.Boolean:
        case SchemaTag.Literal:
        case SchemaTag.File:
        case SchemaTag.InstanceOf:
            return value;
    }
}

/**
 * @brief Record a schema/value pair to keep recursive finalization finite.
 */
function enterFinalizePair(
    schema: Schema,
    value: unknown,
    state: FinalizeState
): boolean {
    if (!isObjectLike(value)) {
        return true;
    }
    let schemas = state.pairs.get(value);
    if (schemas === undefined) {
        schemas = new WeakSet<object>();
        state.pairs.set(value, schemas);
    }
    if (schemas.has(schema)) {
        return false;
    }
    schemas.add(schema);
    return true;
}

/**
 * @brief Read a cached transformed output for recursive finalization.
 */
function readFinalizedOutput(
    schema: Schema,
    value: unknown,
    state: FinalizeState
): CachedFinalizedValue {
    if (!isObjectLike(value)) {
        return {
            found: false,
            value: undefined
        };
    }
    const schemas = state.outputs.get(value);
    if (schemas?.has(schema) !== true) {
        return {
            found: false,
            value: undefined
        };
    }
    return {
        found: true,
        value: schemas.get(schema)
    };
}

/**
 * @brief Cache a transformed output before recursive edges can re-enter it.
 */
function writeFinalizedOutput(
    schema: Schema,
    value: unknown,
    output: unknown,
    state: FinalizeState
): void {
    if (!isObjectLike(value)) {
        return;
    }
    let schemas = state.outputs.get(value);
    if (schemas === undefined) {
        schemas = new WeakMap<object, unknown>();
        state.outputs.set(value, schemas);
    }
    schemas.set(schema, output);
}

/**
 * @brief Finalize array elements without executing accessor properties.
 */
function finalizeArray(item: Schema, value: unknown, state: FinalizeState): unknown {
    if (!Array.isArray(value)) {
        return value;
    }
    let overrides: Map<PropertyKey, unknown> | undefined;
    const keys = Object.getOwnPropertyNames(value);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key !== undefined && isArrayIndexKey(key)) {
            const itemValue = readOwnDataProperty(value, key);
            if (itemValue.found) {
                const finalized = finalizeValue(item, itemValue.value, state);
                if (finalized !== itemValue.value) {
                    overrides ??= new Map<PropertyKey, unknown>();
                    overrides.set(key, finalized);
                }
            }
        }
    }
    return overrides === undefined
        ? value
        : cloneArrayWithOverrides(value, overrides);
}

/**
 * @brief Finalize tuple elements and rest elements.
 */
function finalizeTuple(
    items: readonly Schema[],
    rest: Schema | undefined,
    value: unknown,
    state: FinalizeState
): unknown {
    if (!Array.isArray(value)) {
        return value;
    }
    let overrides: Map<PropertyKey, unknown> | undefined;
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (item === undefined) {
            continue;
        }
        const itemValue = readOwnDataProperty(value, String(index));
        if (itemValue.found) {
            const finalized = finalizeValue(item, itemValue.value, state);
            if (finalized !== itemValue.value) {
                overrides ??= new Map<PropertyKey, unknown>();
                overrides.set(String(index), finalized);
            }
        }
    }
    if (rest !== undefined) {
        for (let index = items.length; index < value.length; index += 1) {
            const key = String(index);
            const itemValue = readOwnDataProperty(value, key);
            if (itemValue.found) {
                const finalized = finalizeValue(rest, itemValue.value, state);
                if (finalized !== itemValue.value) {
                    overrides ??= new Map<PropertyKey, unknown>();
                    overrides.set(key, finalized);
                }
            }
        }
    }
    return overrides === undefined
        ? value
        : cloneArrayWithOverrides(value, overrides);
}

/**
 * @brief Finalize record keys and values.
 */
function finalizeRecord(
    key: Schema | undefined,
    item: Schema,
    loose: boolean,
    value: unknown,
    state: FinalizeState
): unknown {
    if (!isObjectLike(value) || Array.isArray(value)) {
        return value;
    }
    let overrides: Map<PropertyKey, unknown> | undefined;
    const keys = Object.getOwnPropertyNames(value);
    for (let index = 0; index < keys.length; index += 1) {
        const name = keys[index];
        if (name === undefined) {
            continue;
        }
        if (key !== undefined) {
            const keyInput = recordKeyInput(key, name);
            if (loose && !isSchema(key, keyInput)) {
                continue;
            }
            finalizeValue(key, keyInput, state);
        }
        const itemValue = readOwnDataProperty(value, name);
        if (itemValue.found) {
            const finalized = finalizeValue(item, itemValue.value, state);
            if (finalized !== itemValue.value) {
                overrides ??= new Map<PropertyKey, unknown>();
                overrides.set(name, finalized);
            }
        }
    }
    return overrides === undefined
        ? value
        : cloneObjectWithOverrides(value, overrides);
}

/**
 * @brief Finalize Map keys and values.
 */
function finalizeMap(
    key: Schema,
    item: Schema,
    value: unknown,
    state: FinalizeState
): unknown {
    const iterator = readMapEntries(value);
    if (iterator === undefined) {
        return value;
    }
    let output: Map<unknown, unknown> | undefined;
    for (;;) {
        const step = iterator.next();
        if (step.done === true) {
            return output ?? value;
        }
        const [entryKey, entryValue] = step.value;
        const finalizedKey = finalizeValue(key, entryKey, state);
        const finalizedValue = finalizeValue(item, entryValue, state);
        if (output !== undefined) {
            output.set(finalizedKey, finalizedValue);
            continue;
        }
        if (finalizedKey !== entryKey || finalizedValue !== entryValue) {
            output = new Map<unknown, unknown>();
            const copyIterator = readMapEntries(value);
            if (copyIterator === undefined) {
                return value;
            }
            for (;;) {
                const copyStep = copyIterator.next();
                if (copyStep.done === true) {
                    break;
                }
                const [copyKey, copyValue] = copyStep.value;
                if (Object.is(copyKey, entryKey) && Object.is(copyValue, entryValue)) {
                    break;
                }
                output.set(copyKey, copyValue);
            }
            output.set(finalizedKey, finalizedValue);
        }
    }
}

/**
 * @brief Finalize Set values.
 */
function finalizeSet(item: Schema, value: unknown, state: FinalizeState): unknown {
    const iterator = readSetValues(value);
    if (iterator === undefined) {
        return value;
    }
    let output: Set<unknown> | undefined;
    for (;;) {
        const step = iterator.next();
        if (step.done === true) {
            return output ?? value;
        }
        const entryValue = step.value;
        const finalized = finalizeValue(item, entryValue, state);
        if (output !== undefined) {
            output.add(finalized);
            continue;
        }
        if (finalized !== entryValue) {
            output = new Set<unknown>();
            const copyIterator = readSetValues(value);
            if (copyIterator === undefined) {
                return value;
            }
            for (;;) {
                const copyStep = copyIterator.next();
                if (copyStep.done === true) {
                    break;
                }
                const copyValue = copyStep.value;
                if (Object.is(copyValue, entryValue)) {
                    break;
                }
                output.add(copyValue);
            }
            output.add(finalized);
        }
    }
}

/**
 * @brief Finalize a property wrapper's owned data slot.
 */
function finalizeProperty(
    key: string,
    item: Schema,
    value: unknown,
    state: FinalizeState
): unknown {
    if (!isObjectLike(value)) {
        return value;
    }
    const itemValue = readOwnDataProperty(value, key);
    if (itemValue.found) {
        const finalized = finalizeValue(item, itemValue.value, state);
        if (finalized !== itemValue.value) {
            return cloneObjectWithOverrides(
                value,
                new Map<PropertyKey, unknown>([[key, finalized]])
            );
        }
    }
    return value;
}

/**
 * @brief Finalize declared object fields, catchall values, and strip outputs.
 */
function finalizeObject(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    value: unknown,
    state: FinalizeState
): unknown {
    if (!isObjectLike(value) || Array.isArray(value)) {
        return value;
    }
    if (schema.mode === ObjectModeTag.Strip) {
        return finalizeStrippedObject(schema, value, state);
    }
    let overrides: Map<PropertyKey, unknown> | undefined;
    for (let index = 0; index < schema.entries.length; index += 1) {
        const entry = schema.entries[index];
        if (entry === undefined) {
            continue;
        }
        const field = readOwnDataProperty(value, entry.key);
        if (field.found) {
            const finalized = finalizeValue(entry.schema, field.value, state);
            if (finalized !== field.value) {
                overrides ??= new Map<PropertyKey, unknown>();
                overrides.set(entry.key, finalized);
            }
        }
    }
    if (schema.catchall !== undefined) {
        const keys = Object.getOwnPropertyNames(value);
        for (let index = 0; index < keys.length; index += 1) {
            const key = keys[index];
            if (key === undefined || schema.keyLookup[key] === true) {
                continue;
            }
            const extra = readOwnDataProperty(value, key);
            if (extra.found) {
                const finalized = finalizeValue(schema.catchall, extra.value, state);
                if (finalized !== extra.value) {
                    overrides ??= new Map<PropertyKey, unknown>();
                    overrides.set(key, finalized);
                }
            }
        }
    }
    return overrides === undefined
        ? value
        : cloneObjectWithOverrides(value, overrides);
}

/**
 * @brief Project a strip-mode object to declared own data properties.
 */
function finalizeStrippedObject(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    value: object,
    state: FinalizeState
): object {
    const output: Record<PropertyKey, unknown> = {};
    writeFinalizedOutput(schema, value, output, state);
    for (let index = 0; index < schema.entries.length; index += 1) {
        const entry = schema.entries[index];
        if (entry === undefined) {
            continue;
        }
        const field = readOwnDataProperty(value, entry.key);
        if (field.found) {
            defineOutputDataProperty(
                output,
                entry.key,
                finalizeValue(entry.schema, field.value, state)
            );
        }
    }
    return output;
}

/**
 * @brief Finalize the first union branch that accepts the value.
 */
function finalizeFirstMatching(
    schemas: readonly Schema[],
    value: unknown,
    state: FinalizeState
): unknown {
    for (let index = 0; index < schemas.length; index += 1) {
        const schema = schemas[index];
        if (schema !== undefined && isSchema(schema, value)) {
            return finalizeValue(schema, value, state);
        }
    }
    return value;
}

/**
 * @brief Finalize the discriminated union case that accepts the value.
 */
function finalizeMatchingCase(
    cases: readonly DiscriminatedUnionCase[],
    value: unknown,
    state: FinalizeState
): unknown {
    for (let index = 0; index < cases.length; index += 1) {
        const unionCase = cases[index];
        if (unionCase !== undefined && isSchema(unionCase.schema, value)) {
            return finalizeValue(unionCase.schema, value, state);
        }
    }
    return value;
}

/**
 * @brief Freeze an object-like accepted value.
 */
function freezeObjectLike(value: unknown): void {
    if (isObjectLike(value) && !Object.isFrozen(value)) {
        Object.freeze(value);
    }
}

/**
 * @brief Test whether a runtime value may be frozen or traversed.
 */
function isObjectLike(value: unknown): value is object {
    return (typeof value === "object" && value !== null) || typeof value === "function";
}

/**
 * @brief Read one own data property without invoking accessors.
 */
function readOwnDataProperty(
    value: object,
    key: PropertyKey
): { readonly found: true; readonly value: unknown } | { readonly found: false } {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        return { found: false };
    }
    return {
        found: true,
        value: descriptor.value
    };
}

/**
 * @brief Define an enumerable data slot without triggering prototype setters.
 */
function defineOutputDataProperty(
    output: object,
    key: PropertyKey,
    value: unknown
): void {
    Object.defineProperty(output, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true
    });
}

/**
 * @brief Clone array descriptors and replace finalized index values.
 */
function cloneArrayWithOverrides(
    value: readonly unknown[],
    overrides: ReadonlyMap<PropertyKey, unknown>
): unknown[] {
    const output = new Array<unknown>(value.length);
    copyOwnDescriptors(value, output, overrides, "length");
    return output;
}

/**
 * @brief Clone object descriptors and replace finalized property values.
 */
function cloneObjectWithOverrides(
    value: object,
    overrides: ReadonlyMap<PropertyKey, unknown>
): object {
    const prototype = Object.getPrototypeOf(value) as object | null;
    const output = Object.create(prototype) as object;
    copyOwnDescriptors(value, output, overrides, undefined);
    return output;
}

/**
 * @brief Copy descriptors without invoking source getters.
 */
function copyOwnDescriptors(
    source: object,
    output: object,
    overrides: ReadonlyMap<PropertyKey, unknown>,
    skipKey: PropertyKey | undefined
): void {
    const keys = Reflect.ownKeys(source);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined || key === skipKey) {
            continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(source, key);
        if (descriptor === undefined) {
            continue;
        }
        if (overrides.has(key) &&
            Object.prototype.hasOwnProperty.call(descriptor, "value")) {
            Object.defineProperty(output, key, {
                ...descriptor,
                value: overrides.get(key)
            });
            continue;
        }
        Object.defineProperty(output, key, descriptor);
    }
}

/**
 * @brief Check whether a string key names an array index.
 */
function isArrayIndexKey(value: string): boolean {
    if (value === "length" || value.length === 0) {
        return false;
    }
    const index = Number(value);
    return Number.isInteger(index) &&
        index >= 0 &&
        index <= 4294967294 &&
        String(index) === value;
}

/**
 * @brief Scan schema vectors for output finalization needs.
 */
function schemaArrayNeedsFinalization(
    schemas: readonly Schema[],
    seen: WeakSet<object>
): boolean {
    for (let index = 0; index < schemas.length; index += 1) {
        const schema = schemas[index];
        if (schema !== undefined && schemaNeedsFinalizationInner(schema, seen)) {
            return true;
        }
    }
    return false;
}

/**
 * @brief Scan object entries for output finalization needs.
 */
function objectEntriesNeedFinalization(
    entries: readonly ObjectEntry[],
    seen: WeakSet<object>
): boolean {
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry !== undefined && schemaNeedsFinalizationInner(entry.schema, seen)) {
            return true;
        }
    }
    return false;
}

/**
 * @brief Scan discriminated union cases for output finalization needs.
 */
function unionCasesNeedFinalization(
    cases: readonly DiscriminatedUnionCase[],
    seen: WeakSet<object>
): boolean {
    for (let index = 0; index < cases.length; index += 1) {
        const unionCase = cases[index];
        if (unionCase !== undefined &&
            schemaNeedsFinalizationInner(unionCase.schema, seen)) {
            return true;
        }
    }
    return false;
}
