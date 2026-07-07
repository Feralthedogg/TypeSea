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
    BigIntCheck,
    BigIntGtCheck,
    BigIntGteCheck,
    BigIntLtCheck,
    BigIntLteCheck,
    BigIntMultipleOfCheck,
    BigIntSchema,
    BooleanSchema,
    BrandSchema,
    DateCheck,
    DateMaxCheck,
    DateMinCheck,
    DateSchema,
    DiscriminatedUnionCase,
    DiscriminatedUnionSchema,
    FileCheck,
    FileMaxCheck,
    FileMimeCheck,
    FileMinCheck,
    FileSchema,
    IntersectionSchema,
    KeyedObjectSchema,
    LazySchema,
    LiteralSchema,
    LiteralValue,
    MessageSchema,
    MetadataSchema,
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
    PatternPropertiesSchema,
    PatternPropertyEntry,
    PropertyCountSchema,
    PropertyNamesSchema,
    PropertySchema,
    RecordSchema,
    RefinementIssue,
    RefinementIssueCollector,
    RefinementWhenPayload,
    RefinementWhenPredicate,
    RefineSchema,
    ReadonlySchema,
    Schema,
    SchemaMetadata,
    SetSchema,
    StringCheck,
    StringEmailCheck,
    StringIsoDateCheck,
    StringIsoDateTimeCheck,
    StringIpv4Check,
    StringIpv6Check,
    StringKsuidCheck,
    StringMaxCheck,
    StringMinCheck,
    StringRegexCheck,
    StringSchema,
    StringUlidCheck,
    StringUrlCheck,
    StringUuidCheck,
    StringXidCheck,
    SymbolSchema,
    TupleSchema,
    UndefinedableSchema,
    UnionSchema,
    UnknownSchema,
    XorSchema
} from "./types.js";
export {
    EMAIL_PATTERN,
    IPV4_PATTERN,
    IPV6_PATTERN,
    ISO_DATETIME_PATTERN,
    ISO_DATE_PATTERN,
    KSUID_PATTERN,
    ULID_PATTERN,
    URL_PATTERN,
    UUID_PATTERN,
    XID_PATTERN
} from "./types.js";
export { isLiteralValue } from "./literal.js";
export { isSchemaValue } from "./validate.js";
export { freezeSchema } from "./freeze.js";
export { resolveLazySchema } from "./lazy.js";
export {
    objectEntryCanBeOmitted,
    resolveObjectEntryPresence,
    schemaCanAcceptUndefined,
    schemaMustRejectUndefined
} from "./undefined.js";
export {
    nonoptionalSchema,
    unwrapSchema
} from "./unwrap.js";
export { normalizeUnionSchema } from "./union.js";
export { recordKeyInput } from "./record-key.js";
export {
    descriptionMetadata,
    exampleMetadata,
    mergeSchemaMetadata,
    readSchemaMetadata,
    titleMetadata,
    type SchemaMetadataInput
} from "./metadata.js";
