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

/** @brief Immutable mapping from object keys to presence-aware guards. */
export type ObjectShape = Readonly<Record<string, Guard<unknown, Presence>>>;

/** @brief Closed unknown-key modes supported by object guards. */
export type ObjectGuardMode =
    | typeof ObjectModeTag.Passthrough
    | typeof ObjectModeTag.Strict
    | typeof ObjectModeTag.Strip;

/** @brief Keys whose guards permit the property to be absent. */
export type OptionalKeys<TShape extends ObjectShape> = {
    [TKey in keyof TShape]-?: GuardPresence<TShape[TKey]> extends "optional" | "exactOptional"
        ? TKey
        : never;
}[keyof TShape];

/** @brief Keys whose guards require an own property on accepted objects. */
export type RequiredKeys<TShape extends ObjectShape> = {
    [TKey in keyof TShape]-?: GuardPresence<TShape[TKey]> extends "optional" | "exactOptional"
        ? never
        : TKey;
}[keyof TShape];

/**
 * @brief Infer required and optional object fields from guard presence tags.
 */
export type InferObject<TShape extends ObjectShape> = Simplify<
    {
        readonly [TKey in RequiredKeys<TShape>]: Infer<TShape[TKey]>;
    } & {
        readonly [TKey in OptionalKeys<TShape>]?: GuardValue<TShape[TKey]>;
    }
>;

/** @brief Materialize an intersection as a readable object type. */
export type Simplify<TValue> = {
    readonly [TKey in keyof TValue]: TValue[TKey];
} & {};

/** @brief Replace base fields with extension fields at the type level. */
export type MergeObjectShapes<
    TBase extends ObjectShape,
    TExtension extends ObjectShape
> = Simplify<Omit<TBase, keyof TExtension> & TExtension>;

/** @brief Mark every field in an object shape optional. */
export type PartialObjectShape<TShape extends ObjectShape> = {
    readonly [TKey in keyof TShape]: BaseGuard<GuardValue<TShape[TKey]>, "optional">;
};

/** @brief Mark only mask-selected fields optional. */
export type PartialObjectShapeByMask<
    TShape extends ObjectShape,
    TMask extends ObjectKeyMask<TShape>
> = Simplify<
    Omit<TShape, Extract<keyof TShape, MaskSelectedKeys<TShape, TMask>>> &
    {
        readonly [TKey in Extract<
            keyof TShape,
            MaskSelectedKeys<TShape, TMask>
        >]: BaseGuard<GuardValue<TShape[TKey]>, "optional">;
    }
>;

/** @brief Recursively make object fields optional while preserving array mutability. */
export type DeepPartialValue<TValue> =
    TValue extends (infer TItem)[]
        ? DeepPartialValue<TItem>[]
        : TValue extends readonly (infer TItem)[]
        ? readonly DeepPartialValue<TItem>[]
        : TValue extends object
            ? {
                readonly [TKey in keyof TValue]?: DeepPartialValue<TValue[TKey]>;
            }
            : TValue;

/** @brief Apply recursive partial inference to every field guard in a shape. */
export type DeepPartialObjectShape<TShape extends ObjectShape> = {
    readonly [TKey in keyof TShape]: BaseGuard<
        DeepPartialValue<GuardValue<TShape[TKey]>>,
        "optional"
    >;
};

/** @brief Remove optional presence from every field in an object shape. */
export type RequiredObjectShape<TShape extends ObjectShape> = {
    readonly [TKey in keyof TShape]: BaseGuard<GuardValue<TShape[TKey]>>;
};

/** @brief Remove optional presence from mask-selected fields. */
export type RequiredObjectShapeByMask<
    TShape extends ObjectShape,
    TMask extends ObjectKeyMask<TShape>
> = Simplify<
    Omit<TShape, Extract<keyof TShape, MaskSelectedKeys<TShape, TMask>>> &
    {
        readonly [TKey in Extract<
            keyof TShape,
            MaskSelectedKeys<TShape, TMask>
        >]: BaseGuard<GuardValue<TShape[TKey]>>;
    }
>;

/** @brief Boolean key-selection record accepted by object derivation methods. */
export type ObjectKeyMask<TShape extends ObjectShape> = Partial<
    Readonly<Record<StringKeyOf<TShape>, true>>
>;

/** @brief Extract keys explicitly enabled in an object key mask. */
export type MaskSelectedKeys<
    TShape extends ObjectShape,
    TMask extends ObjectKeyMask<TShape>
> = {
    [TKey in keyof TMask]-?: TMask[TKey] extends true ? TKey : never;
}[keyof TMask];

/** @brief Retain named keys that actually exist in an object shape. */
export type PickObjectShape<
    TShape extends ObjectShape,
    TKey extends string
> = Pick<TShape, Extract<keyof TShape, TKey>>;

/** @brief Retain fields selected by a boolean object key mask. */
export type PickObjectShapeByMask<
    TShape extends ObjectShape,
    TMask extends ObjectKeyMask<TShape>
> = Pick<TShape, Extract<keyof TShape, MaskSelectedKeys<TShape, TMask>>>;

/** @brief Remove named keys that actually exist in an object shape. */
export type OmitObjectShape<
    TShape extends ObjectShape,
    TKey extends string
> = Omit<TShape, Extract<keyof TShape, TKey>>;

/** @brief Remove fields selected by a boolean object key mask. */
export type OmitObjectShapeByMask<
    TShape extends ObjectShape,
    TMask extends ObjectKeyMask<TShape>
> = Omit<TShape, Extract<keyof TShape, MaskSelectedKeys<TShape, TMask>>>;

/** @brief Restrict `keyof` to object keys representable by TypeSea paths. */
export type StringKeyOf<TValue> = Extract<keyof TValue, string>;
