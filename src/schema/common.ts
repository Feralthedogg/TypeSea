/**
 * @file schema/common.ts
 * @brief Private schema shape predicates.
 */

import type { ObjectKeyLookup } from "./types.js";

/**
 * @brief Sentinel for a missing own data slot.
 * @details `undefined` is a valid schema literal, so absence needs a distinct
 * value that cannot collide with user-authored schema data.
 */
const missingDataProperty = Symbol("typesea.missingDataProperty");

/**
 * @brief Test whether a schema field read observed the sentinel.
 * @param value Candidate field value returned by readOwnDataProperty.
 * @returns True when the caller must treat the schema field as absent.
 */
export function isMissingDataProperty(
    value: unknown
): value is typeof missingDataProperty {
    return value === missingDataProperty;
}

/**
 * @brief Check that an object owns a concrete data descriptor.
 * @param value Object whose descriptor table is being inspected.
 * @param key Field name or symbol.
 * @returns True only when the field exists directly on the object as data.
 * @details Schema records are consumed across public boundaries. Descriptor
 * reads avoid invoking accessors and avoid accepting prototype-backed fields.
 */
export function hasOwnDataProperty(
    value: object,
    key: PropertyKey
): boolean {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined &&
        Object.prototype.hasOwnProperty.call(descriptor, "value");
}

/**
 * @brief Read one own schema data slot without consulting the prototype chain.
 * @param value Object carrying a schema record.
 * @param key Field name or symbol to read.
 * @returns The stored value, or the missing-data sentinel.
 * @details Callers must not use bracket reads on untrusted schema-like objects:
 * a forged prototype getter could execute code or change validation meaning.
 */
export function readOwnDataProperty(
    value: object,
    key: PropertyKey
): unknown {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        return missingDataProperty;
    }
    return descriptor.value;
}

/**
 * @brief Accept object records suitable for schema metadata traversal.
 * @param value Candidate schema record.
 * @returns True for non-array objects whose own fields are all data slots.
 */
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        hasOnlyDataProperties(value);
}

/**
 * @brief Accept dense arrays whose slots can be read without side effects.
 * @param value Candidate schema vector.
 * @returns True for arrays with only own data descriptors and no holes.
 * @details Schema vectors such as `checks`, `entries`, and `options` are arena
 * metadata. Holes and inherited slots would make validation depend on array
 * prototype state, so they are rejected at the boundary.
 */
export function isUnknownArray(value: unknown): value is readonly unknown[] {
    return Array.isArray(value) &&
        hasOnlyArrayDataProperties(value) &&
        hasDenseDataSlots(value);
}

/**
 * @brief Reject accessor descriptors before schema internals read fields.
 * @param value Object whose own descriptor table is inspected.
 * @returns True when every own property is backed by a data slot.
 */
function hasOnlyDataProperties(value: object): boolean {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const descriptorMap = descriptors as unknown as
        Record<PropertyKey, PropertyDescriptor | undefined>;
    const keys = Reflect.ownKeys(descriptors);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined) {
            continue;
        }
        const descriptor = descriptorMap[key];
        if (descriptor === undefined ||
            !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Reject non-index own properties on schema metadata arrays.
 * @param value Array whose descriptor table is inspected.
 * @returns True when only length and canonical index data slots are present.
 */
function hasOnlyArrayDataProperties(value: readonly unknown[]): boolean {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const descriptorMap = descriptors as unknown as
        Record<PropertyKey, PropertyDescriptor | undefined>;
    const keys = Reflect.ownKeys(descriptors);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === "length") {
            continue;
        }
        if (typeof key !== "string" || !isArrayIndexKey(key, value.length)) {
            return false;
        }
        const descriptor = descriptorMap[key];
        if (descriptor === undefined ||
            !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Require array indexes from 0 to length - 1 to be own data slots.
 * @param value Candidate schema vector.
 * @returns True when no sparse or prototype-backed index is present.
 */
function hasDenseDataSlots(value: readonly unknown[]): boolean {
    for (let index = 0; index < value.length; index += 1) {
        if (!hasOwnDataProperty(value, String(index))) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Accept only unmodified RegExp instances in schema records.
 * @param value Candidate pattern object.
 * @returns True for a plain RegExp with no own behavioral overrides.
 * @details Regex checks are copied into generated and interpreted validators.
 * Rejecting own overrides prevents later mutation of `exec`, `test`, `source`,
 * or `flags` from changing stored schema behavior.
 */
export function isPlainRegExp(value: unknown): value is RegExp {
    return value instanceof RegExp &&
        Object.getPrototypeOf(value) === RegExp.prototype &&
        !Object.prototype.hasOwnProperty.call(value, "exec") &&
        !Object.prototype.hasOwnProperty.call(value, "test") &&
        !Object.prototype.hasOwnProperty.call(value, "source") &&
        !Object.prototype.hasOwnProperty.call(value, "flags");
}

/**
 * @brief Validate a dense vector of object shape keys.
 * @param value Candidate key vector.
 * @returns True when every slot is a string.
 */
export function isStringArray(value: unknown): value is readonly string[] {
    if (!isUnknownArray(value)) {
        return false;
    }
    for (let index = 0; index < value.length; index += 1) {
        if (typeof value[index] !== "string") {
            return false;
        }
    }
    return true;
}

/**
 * @brief Validate the O(1) lookup table paired with object schema keys.
 * @param value Candidate null or plain object lookup.
 * @param keys Ordered key vector from the same object schema.
 * @returns True when the lookup contains exactly the listed keys mapped to true.
 * @details The lookup and key vector must agree so strict-object validation can
 * reject extra keys without rebuilding a membership set at runtime.
 */
export function isObjectKeyLookup(
    value: unknown,
    keys: readonly string[]
): value is ObjectKeyLookup {
    if (!isRecord(value)) {
        return false;
    }
    const present = Reflect.ownKeys(value);
    if (present.length !== keys.length) {
        return false;
    }
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined || readOwnDataProperty(value, key) !== true) {
            return false;
        }
    }
    for (let index = 0; index < present.length; index += 1) {
        const key = present[index];
        if (typeof key !== "string" || !includesString(keys, key)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Test for a canonical array index property key.
 * @param key Own array property name.
 * @param length Array length upper bound.
 * @returns True when key names an in-bounds element slot.
 */
function isArrayIndexKey(key: string, length: number): boolean {
    if (key.length === 0 || key === "length") {
        return false;
    }
    const index = Number(key);
    return Number.isInteger(index) &&
        index >= 0 &&
        index < length &&
        String(index) === key;
}

/**
 * @brief Linear membership check for short schema-owned string vectors.
 * @param values Trusted frozen vector.
 * @param value Candidate string.
 * @returns True when the candidate appears in the vector.
 * @details These vectors are small and validation-time only; a loop avoids
 * allocating transient Set objects while preserving deterministic order.
 */
export function includesString(values: readonly string[], value: string): boolean {
    for (let index = 0; index < values.length; index += 1) {
        if (values[index] === value) {
            return true;
        }
    }
    return false;
}
