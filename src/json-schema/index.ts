/**
 * @file index.ts
 * @brief Public JSON Schema export module.
 */

import { isAsyncDecoderValue, type AsyncDecoder } from "../async/index.js";
import { isDecoderValue, type Decoder } from "../decoder/index.js";
import type { Guard, Presence } from "../guard/index.js";
import type { PathSegment } from "../issue/index.js";
import { err, ok, type Result } from "../result/index.js";
import type { Schema } from "../schema/index.js";
import { emitSchema } from "./emit.js";
import {
  freezeJsonSchema,
  freezeJsonSchemaIssues
} from "./freeze.js";
import {
  JSON_SCHEMA_2020_12_ID,
  JSON_SCHEMA_DRAFT_07_ID,
  readJsonSchemaGuardSchema,
  readJsonSchemaOptions,
  readJsonSchemaSchema
} from "./read.js";
import type {
  JsonSchema,
  JsonSchemaDialect,
  JsonSchemaExportIssue,
  JsonSchemaOptions
} from "./types.js";

export type {
  JsonSchema,
  JsonSchemaDialect,
  JsonSchemaExportCode,
  JsonSchemaExportIssue,
  JsonSchemaObject,
  JsonSchemaOptions,
  JsonSchemaPrimitive,
  JsonSchemaTypeName
} from "./types.js";

/**
 * @brief to json schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @param options Borrowed input slot named options; validation or normalization happens before stored state changes.
 * @returns Result for to json schema; ownership of newly created aggregates is transferred to the caller.
 */
export function toJsonSchema<TValue>(
  guard: Guard<TValue, Presence> | Decoder<TValue> | AsyncDecoder<TValue>,
  options?: Partial<JsonSchemaOptions>
): Result<JsonSchema, readonly JsonSchemaExportIssue[]> {
  if (isAsyncDecoderValue(guard)) {
    readJsonSchemaOptions(options);
    return err(freezeJsonSchemaIssues([
      {
        path: Object.freeze([]),
        code: "unsupported_async_decoder",
        message: "Async decoders cannot be represented as JSON Schema"
      }
    ]));
  }
  if (isDecoderValue(guard)) {
    readJsonSchemaOptions(options);
    return err(freezeJsonSchemaIssues([
      {
        path: Object.freeze([]),
        code: "unsupported_decoder",
        message: "Decoder transforms and coercions cannot be represented as JSON Schema"
      }
    ]));
  }
  return exportJsonSchema(readJsonSchemaGuardSchema(guard), options);
}

/**
 * @brief schema to json schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param options Borrowed input slot named options; validation or normalization happens before stored state changes.
 * @returns Result for schema to json schema; ownership of newly created aggregates is transferred to the caller.
 */
export function schemaToJsonSchema(
  schema: Schema,
  options?: Partial<JsonSchemaOptions>
): Result<JsonSchema, readonly JsonSchemaExportIssue[]> {
  return exportJsonSchema(readJsonSchemaSchema(schema), options);
}

/**
 * @brief export json schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param options Borrowed input slot named options; validation or normalization happens before stored state changes.
 * @returns Result for export json schema; ownership of newly created aggregates is transferred to the caller.
 */
function exportJsonSchema(
  schema: Schema,
  options: Partial<JsonSchemaOptions> | undefined
): Result<JsonSchema, readonly JsonSchemaExportIssue[]> {
  const config = readJsonSchemaOptions(options);
  const issues: JsonSchemaExportIssue[] = [];
  const path: PathSegment[] = [];
  const emitted = emitSchema(schema, path, issues, config.dialect);
  if (emitted === undefined || issues.length !== 0) {
    return err(freezeJsonSchemaIssues(issues));
  }
  const schemaId = config.schemaId ?? defaultJsonSchemaSchemaId(config.dialect);
  if (typeof emitted === "boolean") {
    return ok(freezeJsonSchema({
      $schema: schemaId,
      anyOf: [emitted]
    }));
  }
  return ok(freezeJsonSchema({
    ...emitted,
    $schema: schemaId
  }));
}

/**
 * @brief default json schema schema id function contract.
 * @details Maps each TypeSea emitter dialect to the matching `$schema` marker.
 * @param dialect Borrowed input slot named dialect; validation happens before it controls output shape.
 * @returns Stable schema identifier for the selected dialect.
 */
function defaultJsonSchemaSchemaId(dialect: JsonSchemaDialect): string {
  if (dialect === "2020-12") {
    return JSON_SCHEMA_2020_12_ID;
  }
  return JSON_SCHEMA_DRAFT_07_ID;
}
