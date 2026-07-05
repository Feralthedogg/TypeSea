/**
 * @file modifier.ts
 * @brief Presence, lazy, and refinement guard builders.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */

import { SchemaTag } from "../kind/index.js";
import {
    BaseGuard,
    type Guard,
    type GuardPresence,
    type GuardValue,
    type Infer,
    type Presence
} from "../guard/index.js";
import type { Schema } from "../schema/index.js";
import { isStrictTrue, readGuardSchema } from "../internal/index.js";

/**
 * @brief Mark a guard optional for object shape construction.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 * @param guard Guard whose value type is preserved.
 * @returns Fresh optional guard.
 */
export function optional<TGuard extends Guard<unknown, Presence>>(
    guard: TGuard
): BaseGuard<GuardValue<TGuard>, "optional"> {
    return new BaseGuard<GuardValue<TGuard>, "optional">({
        tag: SchemaTag.Optional,
        inner: readGuardSchema(guard, "optional inner")
    });
}

/**
 * @brief Allow explicit undefined as a value.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 * @param guard Guard to wrap.
 * @returns Fresh undefinedable guard preserving original presence.
 */
export function undefinedable<TGuard extends Guard<unknown, Presence>>(
    guard: TGuard
): BaseGuard<GuardValue<TGuard> | undefined, GuardPresence<TGuard>> {
    return new BaseGuard<GuardValue<TGuard> | undefined, GuardPresence<TGuard>>({
        tag: SchemaTag.Undefinedable,
        inner: readGuardSchema(guard, "undefinedable inner")
    });
}

/**
 * @brief Allow explicit null as a value.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 * @param guard Guard to wrap.
 * @returns Fresh nullable guard preserving original presence.
 */
export function nullable<TGuard extends Guard<unknown, Presence>>(
    guard: TGuard
): BaseGuard<GuardValue<TGuard> | null, GuardPresence<TGuard>> {
    return new BaseGuard<GuardValue<TGuard> | null, GuardPresence<TGuard>>({
        tag: SchemaTag.Nullable,
        inner: readGuardSchema(guard, "nullable inner")
    });
}

/**
 * @brief Allow null, undefined, and absent object keys.
 * @param guard Guard to wrap.
 * @returns Fresh optional guard whose value domain also includes null.
 */
export function nullish<TGuard extends Guard<unknown, Presence>>(
    guard: TGuard
): BaseGuard<GuardValue<TGuard> | null, "optional"> {
    return new BaseGuard<GuardValue<TGuard> | null, "optional">({
        tag: SchemaTag.Optional,
        inner: {
            tag: SchemaTag.Nullable,
            inner: readGuardSchema(guard, "nullish inner")
        }
    });
}

/**
 * @brief Resolve recursive schemas once and reuse the frozen schema handle.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 * @param get Resolver returning the recursive guard.
 * @returns Fresh lazy guard.
 * @throws TypeError when the resolver is not callable.
 */
export function lazy<TGuard extends Guard<unknown, Presence>>(
    get: () => TGuard
): BaseGuard<Infer<TGuard>> {
    if (typeof get !== "function") {
        throw new TypeError("lazy resolver must be a function");
    }
    let cached: Schema | undefined;
    return new BaseGuard<Infer<TGuard>>({
        tag: SchemaTag.Lazy,
        get: (): Schema => {
            /*
             * Cache the resolved schema rather than the guard wrapper. This keeps
             * recursive validation stable after the first successful resolution.
             */
            cached ??= readGuardSchema(get(), "lazy result");
            return cached;
        }
    });
}

/**
 * @brief Attach a boolean refinement while preserving TypeSea's strict true contract.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 * @param guard Guard that must pass before the predicate runs.
 * @param predicate User predicate that must return the boolean literal true.
 * @param name Diagnostic name for refinement failures.
 * @returns Fresh refined guard.
 */
export function refine<TGuard extends Guard<unknown, Presence>>(
    guard: TGuard,
    predicate: (value: Infer<TGuard>) => boolean,
    name: string
): BaseGuard<GuardValue<TGuard>, GuardPresence<TGuard>> {
    if (typeof predicate !== "function") {
        throw new TypeError("refinement predicate must be a function");
    }
    if (typeof name !== "string") {
        throw new TypeError("refinement name must be a string");
    }
    return new BaseGuard<GuardValue<TGuard>, GuardPresence<TGuard>>({
        tag: SchemaTag.Refine,
        inner: readGuardSchema(guard, "refine inner"),
        /*
         * Truthy non-boolean values are rejected. This keeps refinement behavior
         * identical between interpreted and compiled validation paths.
         */
        predicate: (value: unknown): boolean =>
            isStrictTrue(predicate(value as Infer<TGuard>)),
        name
    });
}
