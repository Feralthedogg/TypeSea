/**
 * @file schema/types.ts
 * @brief Schema tags and structural TypeSea schema records.
 */

import {
    ArrayCheckTag,
    BigIntCheckTag,
    DateCheckTag,
    FileCheckTag,
    KeyRuleTag,
    NumberCheckTag,
    ObjectModeTag,
    PresenceTag,
    SchemaTag,
    StringCheckTag
} from "../kind/index.js";
import type { Issue, PathSegment } from "../issue/index.js";

/** @brief Primitive values representable by a literal schema node. */
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
    | DateSchema
    | BigIntSchema
    | SymbolSchema
    | BooleanSchema
    | LiteralSchema
    | ArraySchema
    | ObjectSchema
    | UnionSchema
    | XorSchema
    | IntersectionSchema
    | OptionalSchema
    | UndefinedableSchema
    | NullableSchema
    | DiscriminatedUnionSchema
    | BrandSchema
    | TupleSchema
    | RecordSchema
    | MapSchema
    | SetSchema
    | FileSchema
    | InstanceOfSchema
    | PropertySchema
    | MetadataSchema
    | MessageSchema
    | KeyedObjectSchema
    | PropertyCountSchema
    | PropertyNamesSchema
    | PatternPropertiesSchema
    | ReadonlySchema
    | LazySchema
    | RefineSchema;

/** @brief Schema node that accepts every runtime value. */
export interface UnknownSchema {
    readonly tag: typeof SchemaTag.Unknown;
}

/** @brief Schema node whose accepted value set is empty. */
export interface NeverSchema {
    readonly tag: typeof SchemaTag.Never;
}

/** @brief String schema with an ordered immutable constraint vector. */
export interface StringSchema {
    readonly tag: typeof SchemaTag.String;
    readonly checks: readonly StringCheck[];
    readonly message?: string | undefined;
}

/** @brief Closed union of normalized string constraints. */
export type StringCheck =
    | StringMinCheck
    | StringMaxCheck
    | StringRegexCheck
    | StringUuidCheck
    | StringEmailCheck
    | StringUrlCheck
    | StringIsoDateCheck
    | StringIsoDateTimeCheck
    | StringUlidCheck
    | StringXidCheck
    | StringKsuidCheck
    | StringIpv4Check
    | StringIpv6Check;

/** @brief Inclusive minimum UTF-16 code-unit length constraint. */
export interface StringMinCheck {
    readonly tag: typeof StringCheckTag.Min;
    readonly value: number;
    readonly message?: string | undefined;
}

/** @brief Inclusive maximum UTF-16 code-unit length constraint. */
export interface StringMaxCheck {
    readonly tag: typeof StringCheckTag.Max;
    readonly value: number;
    readonly message?: string | undefined;
}

/** @brief Regular-expression constraint with a stable diagnostic name. */
export interface StringRegexCheck {
    readonly tag: typeof StringCheckTag.Regex;
    readonly regex: RegExp;
    readonly name: string;
    readonly message?: string | undefined;
}

/** @brief UUID syntax constraint. */
export interface StringUuidCheck {
    readonly tag: typeof StringCheckTag.Uuid;
    readonly message?: string | undefined;
}

/** @brief Email-address syntax constraint. */
export interface StringEmailCheck {
    readonly tag: typeof StringCheckTag.Email;
    readonly message?: string | undefined;
}

/** @brief Absolute URL syntax constraint. */
export interface StringUrlCheck {
    readonly tag: typeof StringCheckTag.Url;
    readonly message?: string | undefined;
}

/** @brief ISO calendar-date syntax constraint. */
export interface StringIsoDateCheck {
    readonly tag: typeof StringCheckTag.IsoDate;
    readonly message?: string | undefined;
}

/** @brief UTC ISO date-time syntax constraint. */
export interface StringIsoDateTimeCheck {
    readonly tag: typeof StringCheckTag.IsoDateTime;
    readonly message?: string | undefined;
}

/** @brief ULID syntax constraint. */
export interface StringUlidCheck {
    readonly tag: typeof StringCheckTag.Ulid;
    readonly message?: string | undefined;
}

/** @brief XID syntax constraint. */
export interface StringXidCheck {
    readonly tag: typeof StringCheckTag.Xid;
    readonly message?: string | undefined;
}

/** @brief KSUID syntax constraint. */
export interface StringKsuidCheck {
    readonly tag: typeof StringCheckTag.Ksuid;
    readonly message?: string | undefined;
}

/** @brief IPv4 textual syntax constraint. */
export interface StringIpv4Check {
    readonly tag: typeof StringCheckTag.Ipv4;
    readonly message?: string | undefined;
}

/** @brief IPv6 textual syntax constraint. */
export interface StringIpv6Check {
    readonly tag: typeof StringCheckTag.Ipv6;
    readonly message?: string | undefined;
}

/** @brief Finite-number schema with normalized arithmetic constraints. */
export interface NumberSchema {
    readonly tag: typeof SchemaTag.Number;
    readonly checks: readonly NumberCheck[];
    readonly message?: string | undefined;
}

/** @brief Valid Date instance schema with timestamp bounds. */
export interface DateSchema {
    readonly tag: typeof SchemaTag.Date;
    readonly checks: readonly DateCheck[];
    readonly message?: string | undefined;
}

/** @brief Closed union of normalized date constraints. */
export type DateCheck =
    | DateMinCheck
    | DateMaxCheck;

/** @brief Inclusive minimum timestamp constraint. */
export interface DateMinCheck {
    readonly tag: typeof DateCheckTag.Min;
    readonly value: number;
    readonly message?: string | undefined;
}

/** @brief Inclusive maximum timestamp constraint. */
export interface DateMaxCheck {
    readonly tag: typeof DateCheckTag.Max;
    readonly value: number;
    readonly message?: string | undefined;
}

/** @brief BigInt schema with normalized arithmetic constraints. */
export interface BigIntSchema {
    readonly tag: typeof SchemaTag.BigInt;
    readonly checks: readonly BigIntCheck[];
    readonly message?: string | undefined;
}

/** @brief Closed union of normalized BigInt constraints. */
export type BigIntCheck =
    | BigIntGteCheck
    | BigIntLteCheck
    | BigIntGtCheck
    | BigIntLtCheck
    | BigIntMultipleOfCheck;

/** @brief Inclusive lower BigInt bound. */
export interface BigIntGteCheck {
    readonly tag: typeof BigIntCheckTag.Gte;
    readonly value: bigint;
    readonly message?: string | undefined;
}

/** @brief Inclusive upper BigInt bound. */
export interface BigIntLteCheck {
    readonly tag: typeof BigIntCheckTag.Lte;
    readonly value: bigint;
    readonly message?: string | undefined;
}

/** @brief Exclusive lower BigInt bound. */
export interface BigIntGtCheck {
    readonly tag: typeof BigIntCheckTag.Gt;
    readonly value: bigint;
    readonly message?: string | undefined;
}

/** @brief Exclusive upper BigInt bound. */
export interface BigIntLtCheck {
    readonly tag: typeof BigIntCheckTag.Lt;
    readonly value: bigint;
    readonly message?: string | undefined;
}

/** @brief Exact BigInt divisibility constraint. */
export interface BigIntMultipleOfCheck {
    readonly tag: typeof BigIntCheckTag.MultipleOf;
    readonly value: bigint;
    readonly message?: string | undefined;
}

/** @brief Symbol primitive schema record. */
export interface SymbolSchema {
    readonly tag: typeof SchemaTag.Symbol;
    readonly message?: string | undefined;
}

/** @brief Closed union of normalized number constraints. */
export type NumberCheck =
    | NumberIntegerCheck
    | NumberGteCheck
    | NumberLteCheck
    | NumberGtCheck
    | NumberLtCheck
    | NumberMultipleOfCheck;

/** @brief Integer-only number constraint. */
export interface NumberIntegerCheck {
    readonly tag: typeof NumberCheckTag.Integer;
    readonly message?: string | undefined;
}

/** @brief Inclusive lower finite-number bound. */
export interface NumberGteCheck {
    readonly tag: typeof NumberCheckTag.Gte;
    readonly value: number;
    readonly message?: string | undefined;
}

/** @brief Inclusive upper finite-number bound. */
export interface NumberLteCheck {
    readonly tag: typeof NumberCheckTag.Lte;
    readonly value: number;
    readonly message?: string | undefined;
}

/** @brief Exclusive lower finite-number bound. */
export interface NumberGtCheck {
    readonly tag: typeof NumberCheckTag.Gt;
    readonly value: number;
    readonly message?: string | undefined;
}

/** @brief Exclusive upper finite-number bound. */
export interface NumberLtCheck {
    readonly tag: typeof NumberCheckTag.Lt;
    readonly value: number;
    readonly message?: string | undefined;
}

/** @brief Exact finite-number divisibility constraint. */
export interface NumberMultipleOfCheck {
    readonly tag: typeof NumberCheckTag.MultipleOf;
    readonly value: number;
    readonly message?: string | undefined;
}

/** @brief Boolean primitive schema record. */
export interface BooleanSchema {
    readonly tag: typeof SchemaTag.Boolean;
    readonly message?: string | undefined;
}

/** @brief Exact primitive identity schema record. */
export interface LiteralSchema {
    readonly tag: typeof SchemaTag.Literal;
    readonly value: LiteralValue;
}

/** @brief Homogeneous array schema with item and length constraints. */
export interface ArraySchema {
    readonly tag: typeof SchemaTag.Array;
    readonly item: Schema;
    readonly checks: readonly ArrayCheck[];
}

/** @brief Closed union of normalized collection length constraints. */
export type ArrayCheck =
    | ArrayMinCheck
    | ArrayMaxCheck;

/** @brief Inclusive minimum collection length constraint. */
export interface ArrayMinCheck {
    readonly tag: typeof ArrayCheckTag.Min;
    readonly value: number;
    readonly message?: string | undefined;
}

/** @brief Inclusive maximum collection length constraint. */
export interface ArrayMaxCheck {
    readonly tag: typeof ArrayCheckTag.Max;
    readonly value: number;
    readonly message?: string | undefined;
}

/** @brief Positional tuple schema with an optional homogeneous rest schema. */
export interface TupleSchema {
    readonly tag: typeof SchemaTag.Tuple;
    readonly items: readonly Schema[];
    readonly rest: Schema | undefined;
}

/** @brief String-keyed record schema with closed or passthrough key semantics. */
export interface RecordSchema {
    readonly tag: typeof SchemaTag.Record;
    readonly key: Schema | undefined;
    readonly value: Schema;
    readonly loose: boolean;
    readonly requiredKeys?: readonly string[] | undefined;
}

/** @brief Map schema whose entries validate independent key and value schemas. */
export interface MapSchema {
    readonly tag: typeof SchemaTag.Map;
    readonly key: Schema;
    readonly value: Schema;
    readonly checks: readonly ArrayCheck[];
}

/** @brief Set schema with item and cardinality constraints. */
export interface SetSchema {
    readonly tag: typeof SchemaTag.Set;
    readonly item: Schema;
    readonly checks: readonly ArrayCheck[];
}

/** @brief File-like value schema with size and MIME constraints. */
export interface FileSchema {
    readonly tag: typeof SchemaTag.File;
    readonly checks: readonly FileCheck[];
    readonly message?: string | undefined;
}

/** @brief Closed union of normalized file constraints. */
export type FileCheck =
    | FileMinCheck
    | FileMaxCheck
    | FileMimeCheck;

/** @brief Inclusive minimum file-size constraint in bytes. */
export interface FileMinCheck {
    readonly tag: typeof FileCheckTag.Min;
    readonly value: number;
    readonly message?: string | undefined;
}

/** @brief Inclusive maximum file-size constraint in bytes. */
export interface FileMaxCheck {
    readonly tag: typeof FileCheckTag.Max;
    readonly value: number;
    readonly message?: string | undefined;
}

/** @brief Allowlist of accepted file MIME types. */
export interface FileMimeCheck {
    readonly tag: typeof FileCheckTag.Mime;
    readonly values: readonly string[];
    readonly message?: string | undefined;
}

/** @brief Runtime constructor-identity schema. */
export interface InstanceOfSchema {
    readonly tag: typeof SchemaTag.InstanceOf;
    readonly constructor: abstract new (...args: never[]) => unknown;
    readonly name: string;
}

/** @brief Schema requiring one named property on an accepted base value. */
export interface PropertySchema {
    readonly tag: typeof SchemaTag.Property;
    readonly base: Schema;
    readonly key: string;
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
    readonly catchall: Schema | undefined;
}

/** @brief Frozen membership table used by strict object-key checks. */
export type ObjectKeyLookup = Readonly<Record<string, true>>;

/** @brief Ordered object field entry with normalized presence semantics. */
export interface ObjectEntry {
    readonly key: string;
    readonly schema: Schema;
    readonly presence: PresenceTag;
}

/** @brief Inclusive union whose first accepting branch determines success. */
export interface UnionSchema {
    readonly tag: typeof SchemaTag.Union;
    readonly options: readonly Schema[];
}

/** @brief Exclusive union requiring exactly one accepting branch. */
export interface XorSchema {
    readonly tag: typeof SchemaTag.Xor;
    readonly options: readonly Schema[];
}

/** @brief Intersection requiring both child schemas to accept the same input. */
export interface IntersectionSchema {
    readonly tag: typeof SchemaTag.Intersection;
    readonly left: Schema;
    readonly right: Schema;
}

/** @brief Wrapper permitting field absence and explicit undefined. */
export interface OptionalSchema {
    readonly tag: typeof SchemaTag.Optional;
    readonly inner: Schema;
}

/** @brief Wrapper permitting explicit undefined without changing field presence. */
export interface UndefinedableSchema {
    readonly tag: typeof SchemaTag.Undefinedable;
    readonly inner: Schema;
}

/** @brief Wrapper permitting null in addition to the inner schema domain. */
export interface NullableSchema {
    readonly tag: typeof SchemaTag.Nullable;
    readonly inner: Schema;
}

/**
 * @brief Tagged union schema whose cases share one discriminant key.
 */
export interface DiscriminatedUnionSchema {
    readonly tag: typeof SchemaTag.DiscriminatedUnion;
    readonly key: string;
    readonly cases: readonly DiscriminatedUnionCase[];
}

/** @brief Literal dispatch entry for a discriminated union. */
export interface DiscriminatedUnionCase {
    readonly literal: LiteralValue;
    readonly schema: Schema;
}

/** @brief Nominal compile-time brand wrapper with unchanged runtime semantics. */
export interface BrandSchema {
    readonly tag: typeof SchemaTag.Brand;
    readonly inner: Schema;
    readonly brand: string;
}

/** @brief JSON Schema-facing annotations attached to a schema node. */
export interface SchemaMetadata {
    readonly id: string | undefined;
    readonly title: string | undefined;
    readonly description: string | undefined;
    readonly examples: readonly unknown[] | undefined;
}

/** @brief Wrapper carrying immutable schema annotations. */
export interface MetadataSchema {
    readonly tag: typeof SchemaTag.Metadata;
    readonly inner: Schema;
    readonly metadata: SchemaMetadata;
}

/** @brief Wrapper overriding diagnostics emitted by an inner schema. */
export interface MessageSchema {
    readonly tag: typeof SchemaTag.Message;
    readonly inner: Schema;
    readonly message: string;
}

/** @brief Object wrapper enforcing at-least-one or exactly-one key rules. */
export interface KeyedObjectSchema {
    readonly tag: typeof SchemaTag.KeyedObject;
    readonly inner: Schema;
    readonly keys: readonly string[];
    readonly rule: KeyRuleTag;
}

/** @brief Object wrapper enforcing own-property cardinality bounds. */
export interface PropertyCountSchema {
    readonly tag: typeof SchemaTag.PropertyCount;
    readonly inner: Schema;
    readonly min: number | undefined;
    readonly max: number | undefined;
}

/** @brief Object wrapper validating each own string property name. */
export interface PropertyNamesSchema {
    readonly tag: typeof SchemaTag.PropertyNames;
    readonly inner: Schema;
    readonly key: Schema;
}

/**
 * @brief Object wrapper dispatching values by regular-expression key domains.
 * @details Explicit object keys remain in a separate lookup so pattern and
 * additional-property behavior cannot override declared fields.
 */
export interface PatternPropertiesSchema {
    readonly tag: typeof SchemaTag.PatternProperties;
    readonly inner: Schema;
    readonly entries: readonly PatternPropertyEntry[];
    readonly keys: readonly string[];
    readonly keyLookup: ObjectKeyLookup;
    readonly additional: Schema | undefined;
    readonly allowAdditional: boolean;
}

/** @brief One regular-expression property domain and its value schema. */
export interface PatternPropertyEntry {
    readonly source: string;
    readonly regex: RegExp;
    readonly schema: Schema;
}

/** @brief Wrapper requesting shallow freezing of finalized output values. */
export interface ReadonlySchema {
    readonly tag: typeof SchemaTag.Readonly;
    readonly inner: Schema;
}

/**
 * @brief Lazy schema thunk for recursive shapes.
 * @details Builders cache resolved schemas before validation so recursion does
 * not allocate a fresh schema tree per input node.
 */
export interface LazySchema {
    readonly tag: typeof SchemaTag.Lazy;
    readonly get: () => Schema;
    readonly objectPresence?: () => PresenceTag;
}

/**
 * @brief Diagnostic payload emitted by callback-style refinements.
 * @details The path is relative to the refinement node. Diagnostic collectors
 * prepend their current path before publishing the final immutable Issue.
 */
export interface RefinementIssue {
    readonly path: readonly PathSegment[];
    readonly message: string | undefined;
}

/**
 * @brief Callback-style refinement diagnostic collector.
 * @details Boolean predicates stay allocation-light; collectors are called only
 * on diagnostic paths after the inner schema has accepted the value.
 */
export type RefinementIssueCollector =
    (value: unknown) => readonly RefinementIssue[] | undefined;

/** @brief Input and diagnostics exposed to conditional refinement scheduling. */
export interface RefinementWhenPayload {
    readonly value: unknown;
    readonly issues: readonly Issue[];
}

/** @brief Predicate deciding whether a refinement runs for the current payload. */
export type RefinementWhenPredicate =
    (payload: RefinementWhenPayload) => boolean;

/**
 * @brief User predicate fallback.
 * @details Refinements are intentionally opaque to IR optimization; codegen can
 * only call the predicate after the inner schema succeeds.
 */
export interface RefineSchema {
    readonly tag: typeof SchemaTag.Refine;
    readonly inner: Schema;
    readonly predicate: (value: unknown) => boolean;
    readonly collect?: RefinementIssueCollector | undefined;
    readonly path?: readonly PathSegment[] | undefined;
    readonly message?: string | undefined;
    readonly abort?: boolean | undefined;
    readonly when?: RefinementWhenPredicate | undefined;
    readonly name: string;
}

/**
 * @brief UUID pattern shared by interpreter and generated validators.
 */
export const UUID_PATTERN =
    /^(?:00000000-0000-0000-0000-000000000000|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu;

/** @brief Conservative email pattern shared by interpreter and codegen. */
export const EMAIL_PATTERN =
    /^(?!\.)(?!.*\.\.)[A-Z0-9!#$%&'*+/=?^_`{|}~.-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/iu;

/** @brief Absolute scheme URL pattern shared by interpreter and codegen. */
export const URL_PATTERN =
    /^[A-Z][A-Z0-9+.-]*:[^\s]+$/iu;

/** @brief ISO calendar-date pattern shared by interpreter and codegen. */
export const ISO_DATE_PATTERN =
    /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;

/** @brief UTC ISO date-time pattern shared by interpreter and codegen. */
export const ISO_DATETIME_PATTERN =
    /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?Z$/u;

/** @brief ULID pattern shared by interpreter and codegen. */
export const ULID_PATTERN =
    /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/iu;

/** @brief XID pattern shared by interpreter and codegen. */
export const XID_PATTERN =
    /^[0-9a-v]{20}$/iu;

/** @brief KSUID pattern shared by interpreter and codegen. */
export const KSUID_PATTERN =
    /^[A-Za-z0-9]{27}$/u;

/** @brief IPv4 pattern shared by interpreter and codegen. */
export const IPV4_PATTERN =
    /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/u;

/** @brief IPv6 pattern shared by interpreter and codegen. */
export const IPV6_PATTERN =
    /^(?:(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,7}:|(?:[0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,5}(?::[0-9a-f]{1,4}){1,2}|(?:[0-9a-f]{1,4}:){1,4}(?::[0-9a-f]{1,4}){1,3}|(?:[0-9a-f]{1,4}:){1,3}(?::[0-9a-f]{1,4}){1,4}|(?:[0-9a-f]{1,4}:){1,2}(?::[0-9a-f]{1,4}){1,5}|[0-9a-f]{1,4}:(?:(?::[0-9a-f]{1,4}){1,6})|:(?:(?::[0-9a-f]{1,4}){1,7}|:))$/iu;
