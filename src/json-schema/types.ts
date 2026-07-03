/**
 * @file types.ts
 * @brief JSON Schema export data contracts.
 */

import type { PathSegment } from "../issue/index.js";

/**
 * @brief json schema.
 */
export type JsonSchema = boolean | JsonSchemaObject;

/**
 * @brief json schema primitive.
 */
export type JsonSchemaPrimitive = string | number | boolean | null;

/**
 * @brief json schema type name.
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
 * @brief json schema dialect.
 * @details Defines the keyword set selected for emitted schemas.
 * @invariant Each dialect maps to one stable tuple representation.
 */
export type JsonSchemaDialect =
  | "draft-07"
  | "2020-12";

/**
 * @brief json schema object.
 */
export interface JsonSchemaObject {
  readonly $schema?: string;
  readonly type?: JsonSchemaTypeName | readonly JsonSchemaTypeName[];
  readonly const?: JsonSchemaPrimitive;
  readonly format?: string;
  readonly pattern?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly items?: JsonSchema | readonly JsonSchema[];

  /**
   * @brief additional items.
   * @details Documents draft-07 tuple tail validation so older validators do not silently skip tuple element schemas.
   * @invariant When `items` is an array, this field controls values past the fixed tuple length.
   */
  readonly additionalItems?: JsonSchema;
  readonly prefixItems?: readonly JsonSchema[];
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: JsonSchema;
  readonly anyOf?: readonly JsonSchema[];
  readonly allOf?: readonly JsonSchema[];
}

/**
 * @brief json schema export code.
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
 * @brief json schema export issue.
 */
export interface JsonSchemaExportIssue {
  readonly path: readonly PathSegment[];
  readonly code: JsonSchemaExportCode;
  readonly message: string;
}

/**
 * @brief json schema options.
 */
export interface JsonSchemaOptions {

  /**
   * @brief dialect.
   * @details Selects the JSON Schema keyword set before emission begins.
   * @invariant Tuple schemas use `items` arrays for draft-07 and `prefixItems` for 2020-12.
   */
  readonly dialect: JsonSchemaDialect;
  readonly schemaId: string | undefined;
}

/**
 * @brief mutable json schema object.
 */
export interface MutableJsonSchemaObject {
  $schema?: string;
  type?: JsonSchemaTypeName | readonly JsonSchemaTypeName[];
  const?: JsonSchemaPrimitive;
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  items?: JsonSchema | readonly JsonSchema[];

  /**
   * @brief additional items.
   * @details Documents draft-07 tuple tail validation so older validators do not silently skip tuple element schemas.
   * @invariant When `items` is an array, this field controls values past the fixed tuple length.
   */
  additionalItems?: JsonSchema;
  prefixItems?: readonly JsonSchema[];
  minItems?: number;
  maxItems?: number;
  properties?: Readonly<Record<string, JsonSchema>>;
  required?: readonly string[];
  additionalProperties?: JsonSchema;
  anyOf?: readonly JsonSchema[];
  allOf?: readonly JsonSchema[];
}
