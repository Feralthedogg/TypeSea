/**
 * @file types.ts
 * @brief Object builder type algebra.
 */

import type {
  BaseGuard,
  Guard,
  GuardPresence,
  GuardValue,
  Infer,
  Presence
} from "../../guard/index.js";
import type { ObjectModeTag } from "../../kind/index.js";

/**
 * @brief object shape type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type ObjectShape = Readonly<Record<string, Guard<unknown, Presence>>>;

/**
 * @brief object guard mode type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type ObjectGuardMode =
  | typeof ObjectModeTag.Passthrough
  | typeof ObjectModeTag.Strict;

/**
 * @brief optional keys type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type OptionalKeys<TShape extends ObjectShape> = {
  [TKey in keyof TShape]-?: GuardPresence<TShape[TKey]> extends "optional"
    ? TKey
    : never;
}[keyof TShape];

/**
 * @brief required keys type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type RequiredKeys<TShape extends ObjectShape> = {
  [TKey in keyof TShape]-?: GuardPresence<TShape[TKey]> extends "optional"
    ? never
    : TKey;
}[keyof TShape];

/**
 * @brief infer object type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type InferObject<TShape extends ObjectShape> = Simplify<
  {
    readonly [TKey in RequiredKeys<TShape>]: Infer<TShape[TKey]>;
  } & {
    readonly [TKey in OptionalKeys<TShape>]?: GuardValue<TShape[TKey]>;
  }
>;

/**
 * @brief simplify type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type Simplify<TValue> = {
  readonly [TKey in keyof TValue]: TValue[TKey];
} & {};

/**
 * @brief merge object shapes type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type MergeObjectShapes<
  TBase extends ObjectShape,
  TExtension extends ObjectShape
> = Simplify<Omit<TBase, keyof TExtension> & TExtension>;

/**
 * @brief partial object shape type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type PartialObjectShape<TShape extends ObjectShape> = {
  readonly [TKey in keyof TShape]: BaseGuard<GuardValue<TShape[TKey]>, "optional">;
};

/**
 * @brief pick object shape type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type PickObjectShape<
  TShape extends ObjectShape,
  TKey extends string
> = Pick<TShape, Extract<keyof TShape, TKey>>;

/**
 * @brief omit object shape type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type OmitObjectShape<
  TShape extends ObjectShape,
  TKey extends string
> = Omit<TShape, Extract<keyof TShape, TKey>>;

/**
 * @brief string key of type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type StringKeyOf<TValue> = Extract<keyof TValue, string>;
