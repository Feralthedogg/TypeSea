/**
 * @file registry.ts
 * @brief Constructed guard receiver registry.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
 */

import type { BaseGuard } from "./base.js";
import type { Presence } from "./types.js";
/**
 * @brief Receiver identity table for guards constructed by TypeSea.
 * @details Weak membership proves that a receiver passed a TypeSea constructor
 * without adding public marker fields that user code could forge.
 */
const constructedGuards = new WeakSet<object>();

/**
 * @brief Mark a guard instance as constructor-owned.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
 * @param value Guard instance created by TypeSea constructors.
 * @post The value can use the fast receiver validation path.
 */
export function registerConstructedGuard(value: object): void {
    constructedGuards.add(value);
}

/**
 * @brief Test whether a receiver was built by a TypeSea guard constructor.
 * @param value Candidate receiver.
 * @returns True when the value was registered by a TypeSea guard constructor.
 * @details Public methods use this check to skip structural schema validation
 * only for receivers whose schema slot was already frozen during construction.
 */
export function isConstructedGuard(
    value: unknown
): value is BaseGuard<unknown, Presence> {
    return value !== null &&
        (typeof value === "object" || typeof value === "function") &&
        constructedGuards.has(value);
}
