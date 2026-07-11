/**
 * @file zod.ts
 * @brief Zod-shaped public facade.
 * @details This entry point is intentionally thin: it reuses the hardened
 * TypeSea implementation while exposing the most migration-sensitive Zod
 * namespace constructors as top-level module exports.
 */

export * from "./index.js";
export * as core from "./core.js";

import { z as zod, type ZodNamespace } from "./builders/table.js";
import { catchValue as zodFallback } from "./decoder/index.js";
import type {
    AnyZodObject as TypeSeaAnyZodObject,
    BaseDecoder,
    BaseGuard,
    InferDecoder,
    Input,
    ObjectGuard,
    ObjectGuardMode,
    ObjectShape,
    SafeParseFailure,
    SafeParseSuccess,
    SuperRefineContext,
    TypeSource,
    TypeSeaZodError,
    ZodIssue as TypeSeaZodIssue,
    ZodNumber as TypeSeaZodNumber,
    ZodOptional as TypeSeaZodOptional,
    ZodString as TypeSeaZodString,
    ZodTypeAny as TypeSeaZodTypeAny,
} from "./index.js";
import type { ZodDef } from "./guard/index.js";

export {
    $brand,
    $input,
    $output,
    util
} from "./zod-compat.js";

export type {
    BRAND,
    IssueData,
    RefinementCtx,
    SafeParseError,
    SafeParseReturnType,
    SomeZodObject,
    ZodFirstPartySchemaTypes,
    ZodNullableDef,
    ZodOptionalDef,
    ZodRawShape,
    ZodTypeDef,
    objectInputType,
    objectOutputType
} from "./zod-compat-types.js";

export type {
    CompatZodArray as ZodArray,
    CompatZodDate as ZodDate,
    CompatZodNullable as ZodNullable,
    CompatZodObject as ZodObject
} from "./zod-compat-types.js";

/** @brief Runtime Zod-compatible namespace backed by TypeSea builders. */
export const z: ZodNamespace = zod;

/**
 * @brief Type-only namespace merged with the runtime Zod facade.
 * @details These aliases preserve common `z.infer` and `z.ZodType` source
 * forms without adding fields, branches, or allocations to the runtime table.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace -- Zod uses z as both a value and a type namespace.
export namespace z {
    export type infer<TSource> = InferDecoder<TSource>;
    export type output<TSource> = InferDecoder<TSource>;
    export type input<TSource> = Input<TSource>;
    export type TypeOf<TSource> = InferDecoder<TSource>;
    export interface ZodType<
        TOutput = unknown,
        TDef extends ZodDef = ZodDef,
        TInput = TOutput
    > extends TypeSource<TOutput, TInput, "required" | "optional" | "exactOptional"> {
        readonly _def: TDef;

        optional(): ZodType<TOutput | undefined, TDef, unknown>;
    }
    export type ZodTypeAny = ZodType<unknown, ZodDef, unknown>;
    export type ZodSchema<TOutput = unknown> = ZodType<TOutput>;
    export type Schema<TOutput = unknown> = ZodType<TOutput>;
    export type ZodString = TypeSeaZodString;
    export type ZodNumber = TypeSeaZodNumber;
    export type ZodBoolean = BaseGuard<boolean>;
    export type ZodDate = ZodType<Date, ZodDef, unknown>;
    export type ZodUnknown = BaseGuard<unknown>;
    export type ZodLiteral<TValue = unknown> = BaseGuard<TValue>;
    export type ZodEnum<TValue = string> = BaseGuard<TValue>;
    export type ZodOptional<TSource = TypeSeaZodTypeAny> =
        TypeSeaZodOptional<InferDecoder<TSource>>;
    export type ZodNullable<TSource = ZodTypeAny> = ZodType<
        InferDecoder<TSource> | null,
        ZodDef,
        unknown
    >;
    export type ZodDefault<TSource = TypeSeaZodTypeAny> =
        BaseDecoder<Exclude<InferDecoder<TSource>, undefined>>;
    export type ZodEffects<
        _TSource extends ZodTypeAny = ZodTypeAny,
        TOutput = unknown,
        TInput = unknown
    > = _TSource extends ZodTypeAny ? BaseDecoder<TOutput, TInput> : never;
    export type ZodPipe<
        _TInput extends ZodTypeAny = ZodTypeAny,
        TOutput extends ZodTypeAny = ZodTypeAny
    > = _TInput extends ZodTypeAny
        ? BaseDecoder<InferDecoder<TOutput>, Input<_TInput>>
        : never;
    export type ZodDiscriminatedUnion = BaseGuard<unknown>;
    export type ZodObject<
        TShape extends ObjectShape = ObjectShape,
        TMode extends ObjectGuardMode = ObjectGuardMode
    > = ObjectGuard<TShape, TMode>;
    export type AnyZodObject = TypeSeaAnyZodObject;
    export type ZodRawShape = ObjectShape;
    export type ZodFirstPartySchemaTypes = ZodTypeAny;
    export type ZodTypeDef = ZodDef;
    export type RefinementCtx = SuperRefineContext;
    export type ZodIssue = TypeSeaZodIssue;
    export type IssueData = TypeSeaZodIssue;
    export type ZodError = TypeSeaZodError;
    export type SafeParseReturnType<TInput, TOutput> =
        | SafeParseSuccess<TOutput>
        | (SafeParseFailure & { readonly input?: TInput | undefined });
    export interface BRAND<TName extends PropertyKey = PropertyKey> {
        readonly __brand: TName;
    }
}

export { StringGuard as _ZodString } from "./guard/index.js";
export { defaultValue as _default } from "./decoder/index.js";
export { functionBuilder as _function } from "./builders/function.js";

/** @brief Primitive builder aliases matching named Zod exports. */
export const string = zod.string,
    number = zod.number,
    date = zod.date,
    bigint = zod.bigint,
    symbol = zod.symbol,
    boolean = zod.boolean;

const zodWildcard = zod.\u0061ny;
const zodUnknown = zod.unknown;
const zodNever = zod.never;
const zodNull = zod.null;
const zodUndefined = zod.undefined;
const zodVoid = zod.void;
const zodNativeEnum = zod.nativeEnum;
const zodUnion = zod.union;
const zodXor = zod.xor;
const zodIntersection = zod.intersection;
const zodObject = zod.object;
const zodInstanceof = zod.instanceof;
const zodKeyof = zod.keyof;
const zodTimePrecision = zod.TimePrecision;

export {
    zodWildcard as \u0061ny,
    zodUnknown as unknown,
    zodNever as never,
    zodNull as null,
    zodUndefined as undefined,
    zodVoid as void,
    zodNativeEnum as nativeEnum,
    zodUnion as union,
    zodXor as xor,
    zodIntersection as intersection,
    zodObject as object,
    zodInstanceof as instanceof,
    zodKeyof as keyof,
    zodTimePrecision as TimePrecision,
    zodFallback as c\u0061tch
};

export {
    clone,
    endsWith,
    gt,
    gte,
    includes,
    length,
    lowercase,
    lt,
    lte,
    maxLength,
    maxSize,
    mime,
    minLength,
    minSize,
    multipleOf,
    negative,
    nonnegative,
    nonpositive,
    normalize,
    overwrite,
    positive,
    regex,
    size,
    slugify,
    startsWith,
    toLowerCase,
    toUpperCase,
    trim,
    uppercase
} from "./mini.js";

export default z;
