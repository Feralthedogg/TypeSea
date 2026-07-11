/**
 * @file zod-compat-types.ts
 * @brief Type-only compatibility contracts for observed Zod declarations.
 * @details These structures make package-alias migrations compile without
 * exposing TypeSea's schema or IR ownership. They emit no JavaScript.
 */

import type {
    Input,
    Output,
    TypeSource
} from "./decoder/index.js";
import type { TypeSeaAssertionError } from "./guard/error.js";
import type { Presence, ZodDef } from "./guard/types.js";
import type { PathSegment } from "./issue/index.js";
import type { ZodIssue } from "./message/index.js";

/** @brief Broad Zod-compatible source used by compatibility-only type aliases. */
export type CompatZodType = TypeSource<unknown, unknown, Presence>;

/** @brief Zod-compatible object shape mapping field names to schema sources. */
export type ZodRawShape = Readonly<Record<string, CompatZodType>>;

/** @brief Decoded object output inferred from a compatibility shape. */
export type CompatObjectOutput<TShape extends ZodRawShape> = {
    readonly [TKey in keyof TShape]: Output<TShape[TKey]>;
};

/** @brief Structural Zod object contract exposed to ecosystem generic bounds. */
export type CompatZodObject<
    TShape extends ZodRawShape = ZodRawShape
> = TypeSource<CompatObjectOutput<TShape>> & {
    readonly shape: TShape;
};

/** @brief Structural Zod array contract inferred from one element source. */
export type CompatZodArray<
    TSource extends CompatZodType = CompatZodType
> = TypeSource<readonly Output<TSource>[]>;

/** @brief Structural Zod Date contract. */
export type CompatZodDate = TypeSource<Date>;

/** @brief Structural nullable wrapper over a compatibility source. */
export type CompatZodNullable<
    TSource extends CompatZodType = CompatZodType
> = TypeSource<Output<TSource> | null>;

/** @brief TypeSea definition metadata exposed under Zod's type name. */
export type ZodTypeDef = ZodDef;

/** @brief Optional-schema definition carrying its inner compatibility source. */
export interface ZodOptionalDef<
    TInner extends CompatZodType = CompatZodType
> extends ZodTypeDef {
    readonly innerType: TInner;
}

/** @brief Nullable-schema definition carrying its inner compatibility source. */
export interface ZodNullableDef<
    TInner extends CompatZodType = CompatZodType
> extends ZodTypeDef {
    readonly innerType: TInner;
}

/** @brief Broad object source accepted by Zod ecosystem helpers. */
export type SomeZodObject = TypeSource<
    Readonly<Record<string, unknown>>,
    Readonly<Record<string, unknown>>
>;

/** @brief Union placeholder for Zod first-party compatibility sources. */
export type ZodFirstPartySchemaTypes = CompatZodType;

/** @brief Object input inference matching Zod's lower-case helper name. */
export type objectInputType<TShape extends ZodRawShape> = {
    readonly [TKey in keyof TShape]: Input<TShape[TKey]>;
};

/** @brief Object output inference matching Zod's lower-case helper name. */
export type objectOutputType<TShape extends ZodRawShape> = {
    readonly [TKey in keyof TShape]: Output<TShape[TKey]>;
};

/** @brief Failed safe-parse branch carrying a TypeSea assertion error. */
export interface SafeParseError<TInput> {
    readonly success: false;
    readonly error: TypeSeaAssertionError;
    readonly input?: TInput | undefined;
}

/** @brief Successful safe-parse branch carrying decoded data. */
export interface SafeParseSuccess<TOutput> {
    readonly success: true;
    readonly data: TOutput;
}

/** @brief Zod-compatible discriminated safe-parse result. */
export type SafeParseReturnType<TInput, TOutput> =
    | SafeParseSuccess<TOutput>
    | SafeParseError<TInput>;

/** @brief Refinement issue input with an optional relative path. */
export type IssueData = Omit<ZodIssue, "path"> & {
    readonly path?: readonly PathSegment[] | undefined;
};

/** @brief Minimal refinement context accepted by ecosystem callbacks. */
export interface RefinementCtx {
    addIssue(issue?: IssueData): void;
}

/** @brief Type-only Zod brand marker. */
export type BRAND<TName extends PropertyKey = PropertyKey> = Readonly<
    Record<TName, true>
>;

/** @brief Minimal Zod v4 core definition record used by introspection code. */
export interface $ZodTypeDef {
    readonly type: string;
    readonly error?: unknown;
    readonly checks?: readonly unknown[] | undefined;
}

/** @brief Broad Zod v4 core schema source. */
export type $ZodType = CompatZodType;

/** @brief Zod v4 core array definition with its element source. */
export interface $ZodArrayDef<
    TElement extends $ZodType = $ZodType
> extends $ZodTypeDef {
    readonly type: "array";
    readonly element: TElement;
}

/** @brief Zod v4 core object shape. */
export type $ZodShape = Readonly<Record<string, $ZodType>>;

/** @brief Zod v4 core object definition with shape and optional catchall. */
export interface $ZodObjectDef<
    TShape extends $ZodShape = $ZodShape
> extends $ZodTypeDef {
    readonly type: "object";
    readonly shape: TShape;
    readonly catchall?: $ZodType | undefined;
}

/** @brief Metadata fields recognized by Zod-compatible registries. */
export interface GlobalMeta {
    readonly id?: string | undefined;
    readonly title?: string | undefined;
    readonly description?: string | undefined;
    readonly deprecated?: boolean | undefined;
    readonly [key: string]: unknown;
}
