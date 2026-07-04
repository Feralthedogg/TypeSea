/**
 * @file types.ts
 * @brief Shared builder type algebra.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */

import type {
    Guard,
    Infer,
    Presence
} from "../guard/index.js";

/**
 * @brief Tuple builder input shape.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */
export type TupleShape = readonly Guard<unknown, Presence>[];

/**
 * @brief Infer tuple runtime value from a tuple guard shape.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */
export type InferTuple<TShape extends TupleShape> = {
    readonly [TKey in keyof TShape]: Infer<TShape[TKey]>;
};

/**
 * @brief Non-empty union builder input.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */
export type UnionInput =
    readonly [Guard<unknown, Presence>, ...Guard<unknown, Presence>[]];

/**
 * @brief Compile-time guard that each case owns the requested literal tag.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
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
