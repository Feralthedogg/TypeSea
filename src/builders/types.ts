/**
 * @file types.ts
 * @brief Shared builder type algebra.
 */

import type {
  Guard,
  Infer,
  Presence
} from "../guard/index.js";

/**
 * @brief tuple shape type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type TupleShape = readonly Guard<unknown, Presence>[];

/**
 * @brief infer tuple type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type InferTuple<TShape extends TupleShape> = {
  readonly [TKey in keyof TShape]: Infer<TShape[TKey]>;
};

/**
 * @brief union input type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type UnionInput =
  readonly [Guard<unknown, Presence>, ...Guard<unknown, Presence>[]];

/**
 * @brief discriminated union cases type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type DiscriminatedUnionCases<
  TKey extends string,
  TCases extends Readonly<Record<string, Guard<unknown, Presence>>>
> = string extends TKey
  ? TCases
  : {
      readonly [TCase in keyof TCases]: TCase extends string
        ? Infer<TCases[TCase]> extends Readonly<Record<TKey, TCase>>
          ? TCases[TCase]
          : never
      : never;
    };
