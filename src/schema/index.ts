/**
 * @file schema/index.ts
 * @brief Schema module aggregate.
 */

export type {
  ArraySchema,
  BigIntSchema,
  BooleanSchema,
  BrandSchema,
  DiscriminatedUnionCase,
  DiscriminatedUnionSchema,
  IntersectionSchema,
  LazySchema,
  LiteralSchema,
  LiteralValue,
  NeverSchema,
  NullableSchema,
  NumberCheck,
  NumberGteCheck,
  NumberIntegerCheck,
  NumberLteCheck,
  NumberSchema,
  ObjectEntry,
  ObjectKeyLookup,
  ObjectSchema,
  OptionalSchema,
  RecordSchema,
  RefineSchema,
  Schema,
  StringCheck,
  StringMaxCheck,
  StringMinCheck,
  StringRegexCheck,
  StringSchema,
  StringUuidCheck,
  SymbolSchema,
  TupleSchema,
  UndefinedableSchema,
  UnionSchema,
  UnknownSchema
} from "./types.js";
export { UUID_PATTERN } from "./types.js";
export { isLiteralValue } from "./literal.js";
export { isSchemaValue } from "./validate.js";
export { freezeSchema } from "./freeze.js";
export { resolveLazySchema } from "./lazy.js";
