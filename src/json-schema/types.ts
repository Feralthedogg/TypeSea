/**
 * @file types.ts
 * @brief JSON Schema export data contracts.
 */

import type { PathSegment } from "../issue/index.js";

/**
 * @brief json schema type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type JsonSchema = boolean | JsonSchemaObject;

/**
 * @brief json schema primitive type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type JsonSchemaPrimitive = string | number | boolean | null;

/**
 * @brief json schema type name type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type JsonSchemaTypeName =
  | "null"
  | "boolean"
  | "object"
  | "array"
  | "number"
  | "integer"
  | "string";

/**
 * @brief json schema dialect type alias contract.
 * @details Defines the keyword set selected for emitted schemas.
 * @invariant Each dialect maps to one stable tuple representation.
 */
export type JsonSchemaDialect =
  | "draft-07"
  | "2020-12";

/**
 * @brief json schema object interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface JsonSchemaObject {

  /**
   * @brief $schema field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly $schema?: string;

  /**
   * @brief type field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly type?: JsonSchemaTypeName | readonly JsonSchemaTypeName[];

  /**
   * @brief const field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly const?: JsonSchemaPrimitive;

  /**
   * @brief format field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly format?: string;

  /**
   * @brief pattern field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly pattern?: string;

  /**
   * @brief min length field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly minLength?: number;

  /**
   * @brief max length field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly maxLength?: number;

  /**
   * @brief minimum field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly minimum?: number;

  /**
   * @brief maximum field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly maximum?: number;

  /**
   * @brief items field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly items?: JsonSchema | readonly JsonSchema[];

  /**
   * @brief additional items field contract.
   * @details Documents draft-07 tuple tail validation so older validators do not silently skip tuple element schemas.
   * @invariant When `items` is an array, this field controls values past the fixed tuple length.
   */
  readonly additionalItems?: JsonSchema;

  /**
   * @brief prefix items field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly prefixItems?: readonly JsonSchema[];

  /**
   * @brief min items field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly minItems?: number;

  /**
   * @brief max items field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly maxItems?: number;

  /**
   * @brief properties field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly properties?: Readonly<Record<string, JsonSchema>>;

  /**
   * @brief required field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly required?: readonly string[];

  /**
   * @brief additional properties field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly additionalProperties?: JsonSchema;

  /**
   * @brief union branch list field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly anyOf?: readonly JsonSchema[];

  /**
   * @brief all of field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly allOf?: readonly JsonSchema[];
}

/**
 * @brief json schema export code type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type JsonSchemaExportCode =
  | "unsupported_bigint"
  | "unsupported_symbol"
  | "unsupported_undefined"
  | "unsupported_number_literal"
  | "unsupported_number_bound"
  | "unsupported_regex_flags"
  | "unsupported_lazy"
  | "unsupported_refine"
  | "unsupported_decoder"
  | "unsupported_async_decoder"
  | "unsupported_child";

/**
 * @brief json schema export issue interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface JsonSchemaExportIssue {

  /**
   * @brief path field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly path: readonly PathSegment[];

  /**
   * @brief code field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly code: JsonSchemaExportCode;

  /**
   * @brief message field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly message: string;
}

/**
 * @brief json schema options interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface JsonSchemaOptions {

  /**
   * @brief dialect field contract.
   * @details Selects the JSON Schema keyword set before emission begins.
   * @invariant Tuple schemas use `items` arrays for draft-07 and `prefixItems` for 2020-12.
   */
  readonly dialect: JsonSchemaDialect;

  /**
   * @brief schema id field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly schemaId: string | undefined;
}

/**
 * @brief mutable json schema object interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface MutableJsonSchemaObject {

  /**
   * @brief $schema field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  $schema?: string;

  /**
   * @brief type field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  type?: JsonSchemaTypeName | readonly JsonSchemaTypeName[];

  /**
   * @brief const field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  const?: JsonSchemaPrimitive;

  /**
   * @brief format field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  format?: string;

  /**
   * @brief pattern field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  pattern?: string;

  /**
   * @brief min length field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  minLength?: number;

  /**
   * @brief max length field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  maxLength?: number;

  /**
   * @brief minimum field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  minimum?: number;

  /**
   * @brief maximum field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  maximum?: number;

  /**
   * @brief items field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  items?: JsonSchema | readonly JsonSchema[];

  /**
   * @brief additional items field contract.
   * @details Documents draft-07 tuple tail validation so older validators do not silently skip tuple element schemas.
   * @invariant When `items` is an array, this field controls values past the fixed tuple length.
   */
  additionalItems?: JsonSchema;

  /**
   * @brief prefix items field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  prefixItems?: readonly JsonSchema[];

  /**
   * @brief min items field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  minItems?: number;

  /**
   * @brief max items field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  maxItems?: number;

  /**
   * @brief properties field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  properties?: Readonly<Record<string, JsonSchema>>;

  /**
   * @brief required field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  required?: readonly string[];

  /**
   * @brief additional properties field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  additionalProperties?: JsonSchema;

  /**
   * @brief union branch list field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  anyOf?: readonly JsonSchema[];

  /**
   * @brief all of field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  allOf?: readonly JsonSchema[];
}
