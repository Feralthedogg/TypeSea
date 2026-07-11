/**
 * @file kind/index.ts
 * @brief Stable numeric tags for schema records, checks, and IR nodes.
 * @details Plain frozen tables avoid TypeScript enum emit and give generated
 * validators compact constants whose numeric identity is controlled here.
 */

/**
 * @brief Numeric schema tags used in frozen schema records.
 * @details Plain objects avoid TypeScript enum emit and keep runtime constants
 * stable for generated validators.
 */
export const SchemaTag = {
    String: 1,
    Number: 2,
    Boolean: 3,
    Literal: 4,
    Array: 5,
    Object: 6,
    Union: 7,
    Optional: 8,
    Undefinedable: 9,
    Nullable: 10,
    DiscriminatedUnion: 11,
    Brand: 12,
    Tuple: 13,
    Record: 14,
    Lazy: 15,
    Refine: 16,
    Unknown: 17,
    Never: 18,
    BigInt: 19,
    Symbol: 20,
    Intersection: 21,
    Date: 22,
    Map: 23,
    Set: 24,
    InstanceOf: 25,
    Property: 26,
    Metadata: 27,
    Message: 28,
    KeyedObject: 29,
    Xor: 30,
    File: 31,
    Readonly: 32,
    PropertyCount: 33,
    PropertyNames: 34,
    PatternProperties: 35
} as const;

/** @brief Numeric value union for all schema record tags. */
export type SchemaTag = (typeof SchemaTag)[keyof typeof SchemaTag];

/**
 * @brief Object unknown-key policy tags.
 */
export const ObjectModeTag = {
    Passthrough: 1,
    Strict: 2,
    Strip: 3
} as const;

/** @brief Numeric value union for object unknown-key modes. */
export type ObjectModeTag = (typeof ObjectModeTag)[keyof typeof ObjectModeTag];

/**
 * @brief Required/optional field presence tags for object entries.
 * @details This declaration is kept narrow so downstream code can rely on a closed set of
 * supported values.
 */
export const PresenceTag = {
    Required: 1,
    Optional: 2,
    Deferred: 3
} as const;

/** @brief Numeric value union for object field presence states. */
export type PresenceTag = (typeof PresenceTag)[keyof typeof PresenceTag];

/** @brief Cross-field object key cardinality rule tags. */
export const KeyRuleTag = {
    AtLeastOne: 1,
    ExactlyOne: 2
} as const;

/** @brief Numeric value union for object key cardinality rules. */
export type KeyRuleTag = (typeof KeyRuleTag)[keyof typeof KeyRuleTag];

/** @brief String constraint tags stored in normalized schema check vectors. */
export const StringCheckTag = {
    Min: 1,
    Max: 2,
    Regex: 3,
    Uuid: 4,
    Email: 5,
    Url: 6,
    IsoDate: 7,
    IsoDateTime: 8,
    Ulid: 9,
    Xid: 10,
    Ksuid: 11,
    Ipv4: 12,
    Ipv6: 13
} as const;

/** @brief Numeric value union for string constraint tags. */
export type StringCheckTag =
    (typeof StringCheckTag)[keyof typeof StringCheckTag];

/** @brief Number constraint tags stored in normalized schema check vectors. */
export const NumberCheckTag = {
    Integer: 1,
    Gte: 2,
    Lte: 3,
    Gt: 4,
    Lt: 5,
    MultipleOf: 6
} as const;

/** @brief Numeric value union for number constraint tags. */
export type NumberCheckTag =
    (typeof NumberCheckTag)[keyof typeof NumberCheckTag];

/** @brief BigInt constraint tags stored in normalized schema check vectors. */
export const BigIntCheckTag = {
    Gte: 1,
    Lte: 2,
    Gt: 3,
    Lt: 4,
    MultipleOf: 5
} as const;

/** @brief Numeric value union for BigInt constraint tags. */
export type BigIntCheckTag =
    (typeof BigIntCheckTag)[keyof typeof BigIntCheckTag];

/** @brief Date timestamp-bound tags stored in normalized schema check vectors. */
export const DateCheckTag = {
    Min: 1,
    Max: 2
} as const;

/** @brief Numeric value union for date constraint tags. */
export type DateCheckTag =
    (typeof DateCheckTag)[keyof typeof DateCheckTag];

/** @brief Array length-bound tags stored in normalized schema check vectors. */
export const ArrayCheckTag = {
    Min: 1,
    Max: 2
} as const;

/** @brief Numeric value union for array constraint tags. */
export type ArrayCheckTag =
    (typeof ArrayCheckTag)[keyof typeof ArrayCheckTag];

/** @brief File size and MIME constraint tags stored in schema check vectors. */
export const FileCheckTag = {
    Min: 1,
    Max: 2,
    Mime: 3
} as const;

/** @brief Numeric value union for file constraint tags. */
export type FileCheckTag =
    (typeof FileCheckTag)[keyof typeof FileCheckTag];

/**
 * @brief IR node tags with reserved numeric ranges by node family.
 * @details Sparse ranges make graph dumps easier to scan and leave room for
 * adding specialized nodes without renumbering old ones.
 */
export const NodeTag = {
    Start: 1,
    Param: 2,
    Const: 3,
    GetProp: 4,
    IsString: 20,
    IsNumber: 21,
    IsBoolean: 22,
    IsObject: 23,
    IsArray: 24,
    IsUndefined: 25,
    IsNull: 26,
    Equals: 27,
    StringMin: 28,
    StringMax: 29,
    Regex: 30,
    IsInteger: 31,
    Gte: 32,
    Lte: 33,
    HasOwn: 34,
    ArrayEvery: 35,
    SchemaCheck: 36,
    IsBigInt: 37,
    IsSymbol: 38,
    StrictKeys: 39,
    HasOwnData: 40,
    TupleItems: 41,
    RecordEvery: 42,
    DiscriminantDispatch: 43,
    ObjectShape: 44,
    UnionDispatch: 45,
    PrimitiveUnion: 46,
    PresenceDispatch: 47,
    Not: 50,
    And: 51,
    Or: 52,
    Return: 70
} as const;

/** @brief Numeric value union for all Sea-of-Nodes operation tags. */
export type NodeTag = (typeof NodeTag)[keyof typeof NodeTag];
