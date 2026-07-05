/**
 * @file types.ts
 * @brief Public guard type contracts.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
 */

import type { CheckResult } from "../issue/index.js";
import type { Graph } from "../ir/index.js";
import type { Schema } from "../schema/index.js";
import type { BaseGuard } from "./base.js";

export declare const TypeSymbol: unique symbol;

export declare const PresenceSymbol: unique symbol;

export declare const BrandSymbol: unique symbol;

/**
 * @brief Object-property presence mode carried by a guard.
 * @details Presence is a type-level property of guards, not a runtime schema
 * wrapper by itself. Object builders use it to decide required versus optional
 * field semantics during shape construction.
 */
export type Presence = "required" | "optional";

/**
 * @brief Runtime value accepted by a guard after presence is applied.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
 */
export type RuntimeValue<TValue, TPresence extends Presence> =
    TPresence extends "optional" ? TValue | undefined : TValue;

/**
 * @brief Infer the runtime value type accepted by a guard.
 * @details Optional guards add undefined at the type level so object shape
 * inference and standalone guard usage agree on accepted values.
 */
export type Infer<TGuard> =
    TGuard extends Guard<infer TValue, infer TPresence>
        ? RuntimeValue<TValue, TPresence>
        : never;

/**
 * @brief Extract the raw value type carried by a guard.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
 */
export type GuardValue<TGuard> =
    TGuard extends Guard<infer TValue, Presence> ? TValue : never;

/**
 * @brief Extract the presence mode carried by a guard.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
 */
export type GuardPresence<TGuard> =
    TGuard extends Guard<unknown, infer TPresence> ? TPresence : never;

/**
 * @brief Phantom intersection used for compile-time nominal brands.
 * @details No runtime field is materialized; validators keep the same data
 * representation as the unbranded value.
 */
export type Brand<TValue, TBrand extends string> = TValue & {
    readonly [BrandSymbol]: TBrand;
};

/**
 * @brief Public structural guard contract.
 * @details The symbols carry inference-only type state. The schema property is
 * the runtime handle used by interpreters, compilers, and graph introspection.
 */
export interface Guard<TValue, TPresence extends Presence = "required"> {
    readonly [TypeSymbol]: TValue;
    readonly [PresenceSymbol]: TPresence;
    readonly schema: Schema;

    /**
     * @brief Test whether a runtime value is accepted.
     * @details This is the boolean hot path. It avoids diagnostic allocation and
     * is the method used by compiled predicates for tight validation loops.
     * @param value Candidate runtime value.
     * @returns True when the guard accepts the value.
     */
    is(value: unknown): value is RuntimeValue<TValue, TPresence>;

    /**
     * @brief Validate a runtime value and return explicit issues on failure.
     * @details Use this path when callers need structured diagnostics. Success
     * returns the original value with the guard's inferred runtime type.
     * @param value Candidate runtime value.
     * @returns Check result with either the accepted value or frozen issues.
     */
    check(value: unknown): CheckResult<RuntimeValue<TValue, TPresence>>;

    /**
     * @brief Validate a runtime value and keep only the first issue.
     * @details This diagnostic path is intended for hot rejection checks where
     * callers need one machine-readable failure and do not want full-tree issue
     * collection. Success returns the original value with the guard's inferred type.
     * @param value Candidate runtime value.
     * @returns Check result with at most one frozen issue on failure.
     */
    checkFirst(value: unknown): CheckResult<RuntimeValue<TValue, TPresence>>;

    /**
     * @brief Validate a runtime value or throw TypeSeaAssertionError.
     * @details This convenience wrapper is intentionally explicit in the method
     * name because most TypeSea APIs prefer Result-based control flow.
     * @param value Candidate runtime value.
     */
    assert(value: unknown): asserts value is RuntimeValue<TValue, TPresence>;

    /**
     * @brief Return the optimized validation graph for introspection.
     * @details The graph is immutable and may be reused by tooling, debugging,
     * or code generation without exposing schema internals directly.
     * @returns Optimized Sea-of-Nodes validation graph.
     */
    graph(): Graph;

    /**
     * @brief Mark this guard optional for object shape usage.
     * @details Optionality changes object field presence and standalone
     * inference by adding undefined; it does not mutate the source guard.
     * @returns New guard carrying optional presence.
     */
    optional(): BaseGuard<TValue, "optional">;

    /**
     * @brief Allow the explicit undefined value.
     * @details This widens the value domain while preserving the field presence
     * mode. In object shapes, an undefinedable required field still has to be
     * present.
     * @returns New guard whose value type includes undefined.
     */
    undefinedable(): BaseGuard<TValue | undefined, TPresence>;

    /**
     * @brief Allow the explicit null value.
     * @details Nullability is modeled as a value-domain wrapper rather than an
     * object-presence change, so it composes predictably with optional fields.
     * @returns New guard whose value type includes null.
     */
    nullable(): BaseGuard<TValue | null, TPresence>;

    /**
     * @brief Build an array guard from this guard.
     * @details The item schema is the current guard's runtime value domain after
     * presence has been applied, matching direct `is` semantics.
     * @returns Guard that accepts arrays of values accepted by this guard.
     */
    array(): BaseGuard<RuntimeValue<TValue, TPresence>[]>;

    /**
     * @brief Apply a compile-time brand without changing runtime data.
     * @details Brands are phantom types. Validation behavior and emitted IR stay
     * identical to the unbranded guard.
     * @returns New guard carrying the requested nominal brand.
     */
    brand<TBrand extends string>(): BaseGuard<Brand<TValue, TBrand>, TPresence>;

    /**
     * @brief Append a user refinement predicate.
     * @details Refinements run after the base schema accepts the value. They are
     * intentionally opaque to JSON Schema and AOT export because the predicate is
     * arbitrary user code.
     * @param predicate Function that returns literal true for success.
     * @param name Diagnostic name for failed refinements.
     * @returns New guard with the refinement appended.
     */
    refine(
        predicate: (value: RuntimeValue<TValue, TPresence>) => boolean,
        name: string
    ): BaseGuard<TValue, TPresence>;

    /**
     * @brief Build a union with another guard.
     * @details Union order is preserved so diagnostics and generated code follow
     * the same branch precedence as the fluent call chain.
     * @param other Guard accepted as the second union arm.
     * @returns Guard accepting values accepted by either guard.
     */
    or<TOther extends Guard<unknown, Presence>>(
        other: TOther
    ): BaseGuard<RuntimeValue<TValue, TPresence> | Infer<TOther>>;

    /**
     * @brief Build an intersection with another guard.
     * @details Both guards must accept the same value. The resulting type is the
     * TypeScript intersection of their inferred runtime domains.
     * @param other Guard accepted as the second intersection arm.
     * @returns Guard accepting only values accepted by both guards.
     */
    intersect<TOther extends Guard<unknown, Presence>>(
        other: TOther
    ): BaseGuard<RuntimeValue<TValue, TPresence> & Infer<TOther>>;

    /**
     * @brief Require one own data property after this guard succeeds.
     * @details This is a safe property proof: only own data descriptors are
     * accepted, so validation does not execute getters.
     * @param key Own string property key to inspect.
     * @param value Guard applied to the property value.
     * @returns Guard carrying the base type plus the property proof.
     */
    property<
        const TKey extends string,
        TGuard extends Guard<unknown, Presence>
    >(
        key: TKey,
        value: TGuard
    ): BaseGuard<
        RuntimeValue<TValue, TPresence> & Readonly<Record<TKey, Infer<TGuard>>>
    >;
}
