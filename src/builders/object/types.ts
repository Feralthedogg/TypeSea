/**
 * @file types.ts
 * @brief Object builder type algebra.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
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

export type ObjectShape = Readonly<Record<string, Guard<unknown, Presence>>>;

export type ObjectGuardMode =
    | typeof ObjectModeTag.Passthrough
    | typeof ObjectModeTag.Strict;

export type OptionalKeys<TShape extends ObjectShape> = {
    [TKey in keyof TShape]-?: GuardPresence<TShape[TKey]> extends "optional"
        ? TKey
        : never;
}[keyof TShape];

export type RequiredKeys<TShape extends ObjectShape> = {
    [TKey in keyof TShape]-?: GuardPresence<TShape[TKey]> extends "optional"
        ? never
        : TKey;
}[keyof TShape];

/**
 * @brief Infer required and optional object fields from guard presence tags.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */
export type InferObject<TShape extends ObjectShape> = Simplify<
    {
        readonly [TKey in RequiredKeys<TShape>]: Infer<TShape[TKey]>;
    } & {
        readonly [TKey in OptionalKeys<TShape>]?: GuardValue<TShape[TKey]>;
    }
>;

export type Simplify<TValue> = {
    readonly [TKey in keyof TValue]: TValue[TKey];
} & {};

export type MergeObjectShapes<
    TBase extends ObjectShape,
    TExtension extends ObjectShape
> = Simplify<Omit<TBase, keyof TExtension> & TExtension>;

export type PartialObjectShape<TShape extends ObjectShape> = {
    readonly [TKey in keyof TShape]: BaseGuard<GuardValue<TShape[TKey]>, "optional">;
};

export type PickObjectShape<
    TShape extends ObjectShape,
    TKey extends string
> = Pick<TShape, Extract<keyof TShape, TKey>>;

export type OmitObjectShape<
    TShape extends ObjectShape,
    TKey extends string
> = Omit<TShape, Extract<keyof TShape, TKey>>;

export type StringKeyOf<TValue> = Extract<keyof TValue, string>;
