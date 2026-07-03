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
 * @brief tuple shape.
 */
export type TupleShape = readonly Guard<unknown, Presence>[];

/**
 * @brief infer tuple.
 */
export type InferTuple<TShape extends TupleShape> = {
  readonly [TKey in keyof TShape]: Infer<TShape[TKey]>;
};

/**
 * @brief union input.
 */
export type UnionInput =
  readonly [Guard<unknown, Presence>, ...Guard<unknown, Presence>[]];

/**
 * @brief discriminated union cases.
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
