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
    Intersection: 21
} as const;

export type SchemaTag = (typeof SchemaTag)[keyof typeof SchemaTag];

/**
 * @brief Object unknown-key policy tags.
 * @details This declaration records the local invariant that callers rely on after this
 * module boundary.
 */
export const ObjectModeTag = {
    Passthrough: 1,
    Strict: 2
} as const;

export type ObjectModeTag = (typeof ObjectModeTag)[keyof typeof ObjectModeTag];

/**
 * @brief Required/optional field presence tags for object entries.
 * @details This declaration is kept narrow so downstream code can rely on a closed set of
 * supported values.
 */
export const PresenceTag = {
    Required: 1,
    Optional: 2
} as const;

export type PresenceTag = (typeof PresenceTag)[keyof typeof PresenceTag];

export const StringCheckTag = {
    Min: 1,
    Max: 2,
    Regex: 3,
    Uuid: 4
} as const;

export type StringCheckTag =
    (typeof StringCheckTag)[keyof typeof StringCheckTag];

export const NumberCheckTag = {
    Integer: 1,
    Gte: 2,
    Lte: 3
} as const;

export type NumberCheckTag =
    (typeof NumberCheckTag)[keyof typeof NumberCheckTag];

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
    Not: 50,
    And: 51,
    Or: 52,
    Return: 70
} as const;

export type NodeTag = (typeof NodeTag)[keyof typeof NodeTag];
