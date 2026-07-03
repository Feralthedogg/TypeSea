/**
 * @file schema/types.ts
 * @brief Schema tags and structural TypeSea schema records.
 */

import {
  NumberCheckTag,
  ObjectModeTag,
  PresenceTag,
  SchemaTag,
  StringCheckTag
} from "../kind/index.js";

/**
 * @brief literal value.
 */
export type LiteralValue =
  | string
  | number
  | bigint
  | boolean
  | symbol
  | null
  | undefined;

/**
 * @brief schema.
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

/**
 * @brief unknown schema.
 */
export interface UnknownSchema {
  readonly tag: typeof SchemaTag.Unknown;
}

/**
 * @brief never schema.
 */
export interface NeverSchema {
  readonly tag: typeof SchemaTag.Never;
}

/**
 * @brief string schema.
 */
export interface StringSchema {
  readonly tag: typeof SchemaTag.String;
  readonly checks: readonly StringCheck[];
}

/**
 * @brief string check.
 */
export type StringCheck =
  | StringMinCheck
  | StringMaxCheck
  | StringRegexCheck
  | StringUuidCheck;

/**
 * @brief string min check.
 */
export interface StringMinCheck {
  readonly tag: typeof StringCheckTag.Min;
  readonly value: number;
}

/**
 * @brief string max check.
 */
export interface StringMaxCheck {
  readonly tag: typeof StringCheckTag.Max;
  readonly value: number;
}

/**
 * @brief string regex check.
 */
export interface StringRegexCheck {
  readonly tag: typeof StringCheckTag.Regex;
  readonly regex: RegExp;
  readonly name: string;
}

/**
 * @brief string uuid check.
 */
export interface StringUuidCheck {
  readonly tag: typeof StringCheckTag.Uuid;
}

/**
 * @brief number schema.
 */
export interface NumberSchema {
  readonly tag: typeof SchemaTag.Number;
  readonly checks: readonly NumberCheck[];
}

/**
 * @brief big int schema.
 */
export interface BigIntSchema {
  readonly tag: typeof SchemaTag.BigInt;
}

/**
 * @brief symbol schema.
 */
export interface SymbolSchema {
  readonly tag: typeof SchemaTag.Symbol;
}

/**
 * @brief number check.
 */
export type NumberCheck =
  | NumberIntegerCheck
  | NumberGteCheck
  | NumberLteCheck;

/**
 * @brief number integer check.
 */
export interface NumberIntegerCheck {
  readonly tag: typeof NumberCheckTag.Integer;
}

/**
 * @brief number gte check.
 */
export interface NumberGteCheck {
  readonly tag: typeof NumberCheckTag.Gte;
  readonly value: number;
}

/**
 * @brief number lte check.
 */
export interface NumberLteCheck {
  readonly tag: typeof NumberCheckTag.Lte;
  readonly value: number;
}

/**
 * @brief boolean schema.
 */
export interface BooleanSchema {
  readonly tag: typeof SchemaTag.Boolean;
}

/**
 * @brief literal schema.
 */
export interface LiteralSchema {
  readonly tag: typeof SchemaTag.Literal;
  readonly value: LiteralValue;
}

/**
 * @brief array schema.
 */
export interface ArraySchema {
  readonly tag: typeof SchemaTag.Array;
  readonly item: Schema;
}

/**
 * @brief tuple schema.
 */
export interface TupleSchema {
  readonly tag: typeof SchemaTag.Tuple;
  readonly items: readonly Schema[];
}

/**
 * @brief record schema.
 */
export interface RecordSchema {
  readonly tag: typeof SchemaTag.Record;
  readonly value: Schema;
}

/**
 * @brief object schema.
 */
export interface ObjectSchema {
  readonly tag: typeof SchemaTag.Object;
  readonly entries: readonly ObjectEntry[];
  readonly keys: readonly string[];
  readonly keyLookup: ObjectKeyLookup;
  readonly mode: ObjectModeTag;
}

/**
 * @brief object key lookup.
 */
export type ObjectKeyLookup = Readonly<Record<string, true>>;

/**
 * @brief object entry.
 */
export interface ObjectEntry {
  readonly key: string;
  readonly schema: Schema;
  readonly presence: PresenceTag;
}

/**
 * @brief union schema.
 */
export interface UnionSchema {
  readonly tag: typeof SchemaTag.Union;
  readonly options: readonly Schema[];
}

/**
 * @brief intersection schema.
 */
export interface IntersectionSchema {
  readonly tag: typeof SchemaTag.Intersection;
  readonly left: Schema;
  readonly right: Schema;
}

/**
 * @brief optional schema.
 */
export interface OptionalSchema {
  readonly tag: typeof SchemaTag.Optional;
  readonly inner: Schema;
}

/**
 * @brief undefinedable schema.
 */
export interface UndefinedableSchema {
  readonly tag: typeof SchemaTag.Undefinedable;
  readonly inner: Schema;
}

/**
 * @brief nullable schema.
 */
export interface NullableSchema {
  readonly tag: typeof SchemaTag.Nullable;
  readonly inner: Schema;
}

/**
 * @brief discriminated union schema.
 */
export interface DiscriminatedUnionSchema {
  readonly tag: typeof SchemaTag.DiscriminatedUnion;
  readonly key: string;
  readonly cases: readonly DiscriminatedUnionCase[];
}

/**
 * @brief discriminated union case.
 */
export interface DiscriminatedUnionCase {
  readonly literal: string;
  readonly schema: Schema;
}

/**
 * @brief brand schema.
 */
export interface BrandSchema {
  readonly tag: typeof SchemaTag.Brand;
  readonly inner: Schema;
  readonly brand: string;
}

/**
 * @brief lazy schema.
 */
export interface LazySchema {
  readonly tag: typeof SchemaTag.Lazy;
  readonly get: () => Schema;
}

/**
 * @brief refine schema.
 */
export interface RefineSchema {
  readonly tag: typeof SchemaTag.Refine;
  readonly inner: Schema;
  readonly predicate: (value: unknown) => boolean;
  readonly name: string;
}

/**
 * @brief uuid pattern.
 */
export const UUID_PATTERN =
  /^(?:00000000-0000-0000-0000-000000000000|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu;
