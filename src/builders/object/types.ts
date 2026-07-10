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

export type ObjectShape = Readonly<Record<string, Guard<unknown, Presence>>>;

export type ObjectGuardMode =
    | typeof ObjectModeTag.Passthrough
    | typeof ObjectModeTag.Strict
    | typeof ObjectModeTag.Strip;

export type OptionalKeys<TShape extends ObjectShape> = {
    [TKey in keyof TShape]-?: GuardPresence<TShape[TKey]> extends "optional" | "exactOptional"
        ? TKey
        : never;
}[keyof TShape];

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

export type DeepPartialObjectShape<TShape extends ObjectShape> = {
    readonly [TKey in keyof TShape]: BaseGuard<
        DeepPartialValue<GuardValue<TShape[TKey]>>,
        "optional"
    >;
};

export type RequiredObjectShape<TShape extends ObjectShape> = {
    readonly [TKey in keyof TShape]: BaseGuard<GuardValue<TShape[TKey]>>;
};

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

export type ObjectKeyMask<TShape extends ObjectShape> = Partial<
    Readonly<Record<StringKeyOf<TShape>, true>>
>;

export type MaskSelectedKeys<
    TShape extends ObjectShape,
    TMask extends ObjectKeyMask<TShape>
> = {
    [TKey in keyof TMask]-?: TMask[TKey] extends true ? TKey : never;
}[keyof TMask];

export type PickObjectShape<
    TShape extends ObjectShape,
    TKey extends string
> = Pick<TShape, Extract<keyof TShape, TKey>>;

export type PickObjectShapeByMask<
    TShape extends ObjectShape,
    TMask extends ObjectKeyMask<TShape>
> = Pick<TShape, Extract<keyof TShape, MaskSelectedKeys<TShape, TMask>>>;

export type OmitObjectShape<
    TShape extends ObjectShape,
    TKey extends string
> = Omit<TShape, Extract<keyof TShape, TKey>>;

export type OmitObjectShapeByMask<
    TShape extends ObjectShape,
    TMask extends ObjectKeyMask<TShape>
> = Omit<TShape, Extract<keyof TShape, MaskSelectedKeys<TShape, TMask>>>;

export type StringKeyOf<TValue> = Extract<keyof TValue, string>;
