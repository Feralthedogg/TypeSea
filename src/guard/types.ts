/**
 * @file types.ts
 * @brief Public guard type contracts.
 */

import type { CheckResult } from "../issue/index.js";
import type { Graph } from "../ir/index.js";
import type { Schema } from "../schema/index.js";
import type { BaseGuard } from "./base.js";

/**
 * @brief type symbol constant contract.
 * @details Module-scope storage with stable identity, created once and reused by callers.
 * @invariant Initialization happens during module load and later code treats the binding as fixed.
 */
export declare const TypeSymbol: unique symbol;

/**
 * @brief presence symbol constant contract.
 * @details Module-scope storage with stable identity, created once and reused by callers.
 * @invariant Initialization happens during module load and later code treats the binding as fixed.
 */
export declare const PresenceSymbol: unique symbol;

/**
 * @brief brand symbol constant contract.
 * @details Module-scope storage with stable identity, created once and reused by callers.
 * @invariant Initialization happens during module load and later code treats the binding as fixed.
 */
export declare const BrandSymbol: unique symbol;

/**
 * @brief presence type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type Presence = "required" | "optional";

/**
 * @brief runtime value type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type RuntimeValue<TValue, TPresence extends Presence> =
  TPresence extends "optional" ? TValue | undefined : TValue;

/**
 * @brief infer type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type Infer<TGuard> =
  TGuard extends Guard<infer TValue, infer TPresence>
    ? RuntimeValue<TValue, TPresence>
    : never;

/**
 * @brief guard value type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type GuardValue<TGuard> =
  TGuard extends Guard<infer TValue, Presence> ? TValue : never;

/**
 * @brief guard presence type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type GuardPresence<TGuard> =
  TGuard extends Guard<unknown, infer TPresence> ? TPresence : never;

/**
 * @brief brand type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type Brand<TValue, TBrand extends string> = TValue & {
  readonly [BrandSymbol]: TBrand;
};

/**
 * @brief guard interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface Guard<TValue, TPresence extends Presence = "required"> {

  /**
   * @brief type symbol field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly [TypeSymbol]: TValue;

  /**
   * @brief presence symbol field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly [PresenceSymbol]: TPresence;

  /**
   * @brief schema field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly schema: Schema;

  /**
   * @brief is routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for is; ownership of newly created aggregates is transferred to the caller.
   */
  is(value: unknown): value is RuntimeValue<TValue, TPresence>;

  /**
   * @brief check routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for check; ownership of newly created aggregates is transferred to the caller.
   */
  check(value: unknown): CheckResult<RuntimeValue<TValue, TPresence>>;

  /**
   * @brief assert routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @post No result value is produced; effects are limited to the documented receiver or output buffer.
   */
  assert(value: unknown): asserts value is RuntimeValue<TValue, TPresence>;

  /**
   * @brief graph routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @returns Result for graph; ownership of newly created aggregates is transferred to the caller.
   */
  graph(): Graph;

  /**
   * @brief optional routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @returns Result for optional; ownership of newly created aggregates is transferred to the caller.
   */
  optional(): BaseGuard<TValue, "optional">;

  /**
   * @brief undefinedable routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @returns Result for undefinedable; ownership of newly created aggregates is transferred to the caller.
   */
  undefinedable(): BaseGuard<TValue | undefined, TPresence>;

  /**
   * @brief nullable routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @returns Result for nullable; ownership of newly created aggregates is transferred to the caller.
   */
  nullable(): BaseGuard<TValue | null, TPresence>;

  /**
   * @brief array routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @returns Result for array; ownership of newly created aggregates is transferred to the caller.
   */
  array(): BaseGuard<RuntimeValue<TValue, TPresence>[]>;

  /**
   * @brief brand routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @returns Result for brand; ownership of newly created aggregates is transferred to the caller.
   */
  brand<TBrand extends string>(): BaseGuard<Brand<TValue, TBrand>, TPresence>;

  /**
   * @brief refine routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param predicate Borrowed input slot named predicate; validation or normalization happens before stored state changes.
   * @param name Borrowed input slot named name; validation or normalization happens before stored state changes.
   * @returns Result for refine; ownership of newly created aggregates is transferred to the caller.
   */
  refine(
    predicate: (value: RuntimeValue<TValue, TPresence>) => boolean,
    name: string
  ): BaseGuard<TValue, TPresence>;

  /**
   * @brief or routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param other Borrowed input slot named other; validation or normalization happens before stored state changes.
   * @returns Result for or; ownership of newly created aggregates is transferred to the caller.
   */
  or<TOther extends Guard<unknown, Presence>>(
    other: TOther
  ): BaseGuard<RuntimeValue<TValue, TPresence> | Infer<TOther>>;

  /**
   * @brief intersect routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param other Borrowed input slot named other; validation or normalization happens before stored state changes.
   * @returns Result for intersect; ownership of newly created aggregates is transferred to the caller.
   */
  intersect<TOther extends Guard<unknown, Presence>>(
    other: TOther
  ): BaseGuard<RuntimeValue<TValue, TPresence> & Infer<TOther>>;
}
