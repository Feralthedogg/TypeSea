/**
 * @file internal.ts
 * @brief Private helpers shared across TypeSea translation units.
 * @details This declaration records the local invariant that callers rely on after this
 * module boundary.
 *
 * @invariant Values crossing a module boundary stay `unknown` until a local
 * guard proves the shape needed by that module.
 */

import type { Guard, Presence } from "../guard/index.js";
import { isSchemaValue, type Schema } from "../schema/index.js";

/**
 * @brief Read a guard schema after proving the receiver shape locally.
 * @param guard Candidate guard-like value.
 * @param label Message prefix for TypeError diagnostics.
 * @returns Valid schema stored in an own data slot.
 * @throws TypeError when the receiver is not structurally a TypeSea guard.
 * @details This helper is used by builders that accept guard-like values rather
 * than constructed guard instances. The schema field is read by descriptor so a
 * forged prototype cannot supply or mutate the schema after admission.
 */
export function readGuardSchema(
    guard: unknown,
    label: string
): Schema {
    if (!isObjectLike(guard)) {
        throw new TypeError(`${label} must be a TypeSea guard`);
    }
    const schema = readOwnDataProperty(guard, "schema");
    if (!isSchemaValue(schema)) {
        throw new TypeError(`${label} must contain a valid TypeSea schema`);
    }
    return schema;
}

/**
 * @brief Check record.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
export function isRecord(
    value: unknown
): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Accept an array before a caller performs local element validation.
 * @details This declaration records the local invariant that callers rely on after this
 * module boundary.
 * @param value Candidate vector.
 * @returns True when the value is an Array instance.
 */
export function isUnknownArray(value: unknown): value is readonly unknown[] {
    return Array.isArray(value);
}

/**
 * @brief Linear membership for short builder-owned string vectors.
 * @details This declaration records the local invariant that callers rely on after this
 * module boundary.
 * @param values Candidate set represented as an ordered vector.
 * @param value String being searched.
 * @returns True when the string is present.
 */
export function includesString(
    values: readonly string[],
    value: string
): boolean {
    for (let index = 0; index < values.length; index += 1) {
        if (values[index] === value) {
            return true;
        }
    }
    return false;
}

/**
 * @brief Accept only the literal boolean success value from user predicates.
 * @details This declaration records the local invariant that callers rely on after this
 * module boundary.
 * @param value Predicate return value.
 * @returns True only for `true`.
 */
export function isStrictTrue(value: unknown): boolean {
    return value === true;
}

/**
 * @brief Check whether a value structurally exposes a TypeSea schema.
 * @details This declaration records the local invariant that callers rely on after this
 * module boundary.
 * @param value Candidate guard-like object.
 * @returns True when a valid schema is stored directly on the object.
 */
export function isGuardValue(
    value: unknown
): value is Guard<unknown, Presence> {
    return isObjectLike(value) && isSchemaValue(readOwnDataProperty(value, "schema"));
}

/**
 * @brief Accept objects and function objects that can carry own schema slots.
 */
function isObjectLike(value: unknown): value is object {
    return value !== null && (typeof value === "object" || typeof value === "function");
}

/**
 * @brief Read one own data property without running getters.
 * @details This declaration records the local invariant that callers rely on after this
 * module boundary.
 * @param value Object being normalized.
 * @param key Field name or symbol.
 * @returns Stored field value, or undefined when the own data slot is absent.
 */
export function readOwnDataProperty(
    value: object,
    key: PropertyKey
): unknown {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        return undefined;
    }
    return descriptor.value;
}
