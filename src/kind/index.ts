/**
 * @brief schema tag.
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

/**
 * @brief schema tag.
 */
export type SchemaTag = (typeof SchemaTag)[keyof typeof SchemaTag];

/**
 * @brief object mode tag.
 */
export const ObjectModeTag = {
  Passthrough: 1,
  Strict: 2
} as const;

/**
 * @brief object mode tag.
 */
export type ObjectModeTag = (typeof ObjectModeTag)[keyof typeof ObjectModeTag];

/**
 * @brief presence tag.
 */
export const PresenceTag = {
  Required: 1,
  Optional: 2
} as const;

/**
 * @brief presence tag.
 */
export type PresenceTag = (typeof PresenceTag)[keyof typeof PresenceTag];

/**
 * @brief string check tag.
 */
export const StringCheckTag = {
  Min: 1,
  Max: 2,
  Regex: 3,
  Uuid: 4
} as const;

/**
 * @brief string check tag.
 */
export type StringCheckTag =
  (typeof StringCheckTag)[keyof typeof StringCheckTag];

/**
 * @brief number check tag.
 */
export const NumberCheckTag = {
  Integer: 1,
  Gte: 2,
  Lte: 3
} as const;

/**
 * @brief number check tag.
 */
export type NumberCheckTag =
  (typeof NumberCheckTag)[keyof typeof NumberCheckTag];

/**
 * @brief node tag.
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
  Not: 50,
  And: 51,
  Or: 52,
  Return: 70
} as const;

/**
 * @brief node tag.
 */
export type NodeTag = (typeof NodeTag)[keyof typeof NodeTag];
