/**
 * @file types.ts
 * @brief Public guard type contracts.
 */

import type { CheckResult } from "../issue/index.js";
import type { Graph } from "../ir/index.js";
import type { Schema } from "../schema/index.js";
import type { BaseGuard } from "./base.js";

/**
 * @brief type symbol.
 */
export declare const TypeSymbol: unique symbol;

/**
 * @brief presence symbol.
 */
export declare const PresenceSymbol: unique symbol;

/**
 * @brief brand symbol.
 */
export declare const BrandSymbol: unique symbol;

/**
 * @brief presence.
 */
export type Presence = "required" | "optional";

/**
 * @brief runtime value.
 */
export type RuntimeValue<TValue, TPresence extends Presence> =
  TPresence extends "optional" ? TValue | undefined : TValue;

/**
 * @brief infer.
 */
export type Infer<TGuard> =
  TGuard extends Guard<infer TValue, infer TPresence>
    ? RuntimeValue<TValue, TPresence>
    : never;

/**
 * @brief guard value.
 */
export type GuardValue<TGuard> =
  TGuard extends Guard<infer TValue, Presence> ? TValue : never;

/**
 * @brief guard presence.
 */
export type GuardPresence<TGuard> =
  TGuard extends Guard<unknown, infer TPresence> ? TPresence : never;

/**
 * @brief brand.
 */
export type Brand<TValue, TBrand extends string> = TValue & {
  readonly [BrandSymbol]: TBrand;
};

/**
 * @brief guard.
 */
export interface Guard<TValue, TPresence extends Presence = "required"> {
  readonly [TypeSymbol]: TValue;
  readonly [PresenceSymbol]: TPresence;
  readonly schema: Schema;

  /**
   * @brief is.
         */
  is(value: unknown): value is RuntimeValue<TValue, TPresence>;

  /**
   * @brief check.
         */
  check(value: unknown): CheckResult<RuntimeValue<TValue, TPresence>>;

  /**
   * @brief assert.
         */
  assert(value: unknown): asserts value is RuntimeValue<TValue, TPresence>;

  /**
   * @brief graph.
       */
  graph(): Graph;

  /**
   * @brief optional.
       */
  optional(): BaseGuard<TValue, "optional">;

  /**
   * @brief undefinedable.
       */
  undefinedable(): BaseGuard<TValue | undefined, TPresence>;

  /**
   * @brief nullable.
       */
  nullable(): BaseGuard<TValue | null, TPresence>;

  /**
   * @brief array.
       */
  array(): BaseGuard<RuntimeValue<TValue, TPresence>[]>;

  /**
   * @brief brand.
       */
  brand<TBrand extends string>(): BaseGuard<Brand<TValue, TBrand>, TPresence>;

  /**
   * @brief refine.
           */
  refine(
    predicate: (value: RuntimeValue<TValue, TPresence>) => boolean,
    name: string
  ): BaseGuard<TValue, TPresence>;

  /**
   * @brief or.
         */
  or<TOther extends Guard<unknown, Presence>>(
    other: TOther
  ): BaseGuard<RuntimeValue<TValue, TPresence> | Infer<TOther>>;

  /**
   * @brief intersect.
         */
  intersect<TOther extends Guard<unknown, Presence>>(
    other: TOther
  ): BaseGuard<RuntimeValue<TValue, TPresence> & Infer<TOther>>;
}
