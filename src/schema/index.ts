/**
 * @file schema/index.ts
 * @brief Schema module aggregate.
 * @details Schema helpers enforce construction-time invariants before values reach
 * validation, compilation, or export.
 */

export type {
    ArrayCheck,
    ArrayMaxCheck,
    ArrayMinCheck,
    ArraySchema,
    BigIntSchema,
    BooleanSchema,
    BrandSchema,
    DateCheck,
    DateMaxCheck,
    DateMinCheck,
    DateSchema,
    DiscriminatedUnionCase,
    DiscriminatedUnionSchema,
    IntersectionSchema,
    LazySchema,
    LiteralSchema,
    LiteralValue,
    NeverSchema,
    NullableSchema,
    NumberCheck,
    NumberGtCheck,
    NumberGteCheck,
    NumberIntegerCheck,
    NumberLtCheck,
    NumberLteCheck,
    NumberMultipleOfCheck,
    NumberSchema,
    ObjectEntry,
    ObjectKeyLookup,
    ObjectSchema,
    OptionalSchema,
    InstanceOfSchema,
    MapSchema,
    PropertySchema,
    RecordSchema,
    RefinementIssue,
    RefinementIssueCollector,
    RefineSchema,
    Schema,
    SetSchema,
    StringCheck,
    StringEmailCheck,
    StringIsoDateCheck,
    StringIsoDateTimeCheck,
    StringIpv4Check,
    StringIpv6Check,
    StringMaxCheck,
    StringMinCheck,
    StringRegexCheck,
    StringSchema,
    StringUlidCheck,
    StringUrlCheck,
    StringUuidCheck,
    SymbolSchema,
    TupleSchema,
    UndefinedableSchema,
    UnionSchema,
    UnknownSchema
} from "./types.js";
export {
    EMAIL_PATTERN,
    IPV4_PATTERN,
    IPV6_PATTERN,
    ISO_DATETIME_PATTERN,
    ISO_DATE_PATTERN,
    ULID_PATTERN,
    URL_PATTERN,
    UUID_PATTERN
} from "./types.js";
export { isLiteralValue } from "./literal.js";
export { isSchemaValue } from "./validate.js";
export { freezeSchema } from "./freeze.js";
export { resolveLazySchema } from "./lazy.js";
export {
    schemaCanAcceptUndefined,
    schemaMustRejectUndefined
} from "./undefined.js";
export { normalizeUnionSchema } from "./union.js";
