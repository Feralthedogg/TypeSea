/**
 * @file schema/types.ts
 * @brief Schema tags and structural TypeSea schema records.
 * @details Schema helpers enforce construction-time invariants before values reach
 * validation, compilation, or export.
 */

import {
    NumberCheckTag,
    ObjectModeTag,
    PresenceTag,
    SchemaTag,
    StringCheckTag
} from "../kind/index.js";

export type LiteralValue =
    | string
    | number
    | bigint
    | boolean
    | symbol
    | null
    | undefined;

/**
 * @brief Frozen schema tree consumed by interpreters, IR lowering, and codegen.
 * @details These records are deliberately data-only. Builder methods normalize
 * unsafe inputs before they enter this representation.
 */
export type Schema =
    | UnknownSchema
    | NeverSchema
    | StringSchema
    | NumberSchema
    | BigIntSchema
    | SymbolSchema
    | BooleanSchema
    | LiteralSchema
    | ArraySchema
    | ObjectSchema
    | UnionSchema
    | IntersectionSchema
    | OptionalSchema
    | UndefinedableSchema
    | NullableSchema
    | DiscriminatedUnionSchema
    | BrandSchema
    | TupleSchema
    | RecordSchema
    | LazySchema
    | RefineSchema;

export interface UnknownSchema {
    readonly tag: typeof SchemaTag.Unknown;
}

export interface NeverSchema {
    readonly tag: typeof SchemaTag.Never;
}

export interface StringSchema {
    readonly tag: typeof SchemaTag.String;
    readonly checks: readonly StringCheck[];
}

export type StringCheck =
    | StringMinCheck
    | StringMaxCheck
    | StringRegexCheck
    | StringUuidCheck;

export interface StringMinCheck {
    readonly tag: typeof StringCheckTag.Min;
    readonly value: number;
}

export interface StringMaxCheck {
    readonly tag: typeof StringCheckTag.Max;
    readonly value: number;
}

export interface StringRegexCheck {
    readonly tag: typeof StringCheckTag.Regex;
    readonly regex: RegExp;
    readonly name: string;
}

export interface StringUuidCheck {
    readonly tag: typeof StringCheckTag.Uuid;
}

export interface NumberSchema {
    readonly tag: typeof SchemaTag.Number;
    readonly checks: readonly NumberCheck[];
}

export interface BigIntSchema {
    readonly tag: typeof SchemaTag.BigInt;
}

export interface SymbolSchema {
    readonly tag: typeof SchemaTag.Symbol;
}

export type NumberCheck =
    | NumberIntegerCheck
    | NumberGteCheck
    | NumberLteCheck;

export interface NumberIntegerCheck {
    readonly tag: typeof NumberCheckTag.Integer;
}

export interface NumberGteCheck {
    readonly tag: typeof NumberCheckTag.Gte;
    readonly value: number;
}

export interface NumberLteCheck {
    readonly tag: typeof NumberCheckTag.Lte;
    readonly value: number;
}

export interface BooleanSchema {
    readonly tag: typeof SchemaTag.Boolean;
}

export interface LiteralSchema {
    readonly tag: typeof SchemaTag.Literal;
    readonly value: LiteralValue;
}

export interface ArraySchema {
    readonly tag: typeof SchemaTag.Array;
    readonly item: Schema;
}

export interface TupleSchema {
    readonly tag: typeof SchemaTag.Tuple;
    readonly items: readonly Schema[];
}

export interface RecordSchema {
    readonly tag: typeof SchemaTag.Record;
    readonly value: Schema;
}

/**
 * @brief Object schema with both ordered entries and an O(1) key lookup.
 * @details Codegen uses entries for stable field order and keyLookup for strict
 * unknown-key checks.
 */
export interface ObjectSchema {
    readonly tag: typeof SchemaTag.Object;
    readonly entries: readonly ObjectEntry[];
    readonly keys: readonly string[];
    readonly keyLookup: ObjectKeyLookup;
    readonly mode: ObjectModeTag;
}

export type ObjectKeyLookup = Readonly<Record<string, true>>;

export interface ObjectEntry {
    readonly key: string;
    readonly schema: Schema;
    readonly presence: PresenceTag;
}

export interface UnionSchema {
    readonly tag: typeof SchemaTag.Union;
    readonly options: readonly Schema[];
}

export interface IntersectionSchema {
    readonly tag: typeof SchemaTag.Intersection;
    readonly left: Schema;
    readonly right: Schema;
}

export interface OptionalSchema {
    readonly tag: typeof SchemaTag.Optional;
    readonly inner: Schema;
}

export interface UndefinedableSchema {
    readonly tag: typeof SchemaTag.Undefinedable;
    readonly inner: Schema;
}

export interface NullableSchema {
    readonly tag: typeof SchemaTag.Nullable;
    readonly inner: Schema;
}

/**
 * @brief Tagged union schema whose cases share one discriminant key.
 * @details Schema helpers enforce construction-time invariants before values reach
 * validation, compilation, or export.
 */
export interface DiscriminatedUnionSchema {
    readonly tag: typeof SchemaTag.DiscriminatedUnion;
    readonly key: string;
    readonly cases: readonly DiscriminatedUnionCase[];
}

export interface DiscriminatedUnionCase {
    readonly literal: string;
    readonly schema: Schema;
}

export interface BrandSchema {
    readonly tag: typeof SchemaTag.Brand;
    readonly inner: Schema;
    readonly brand: string;
}

/**
 * @brief Lazy schema thunk for recursive shapes.
 * @details Builders cache resolved schemas before validation so recursion does
 * not allocate a fresh schema tree per input node.
 */
export interface LazySchema {
    readonly tag: typeof SchemaTag.Lazy;
    readonly get: () => Schema;
}

/**
 * @brief User predicate fallback.
 * @details Refinements are intentionally opaque to IR optimization; codegen can
 * only call the predicate after the inner schema succeeds.
 */
export interface RefineSchema {
    readonly tag: typeof SchemaTag.Refine;
    readonly inner: Schema;
    readonly predicate: (value: unknown) => boolean;
    readonly name: string;
}

/**
 * @brief UUID pattern shared by interpreter and generated validators.
 * @details Schema helpers enforce construction-time invariants before values reach
 * validation, compilation, or export.
 */
export const UUID_PATTERN =
    /^(?:00000000-0000-0000-0000-000000000000|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu;
