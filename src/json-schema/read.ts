/**
 * @file read.ts
 * @brief Input normalization for JSON Schema export.
 */

import {
  freezeSchema,
  isSchemaValue,
  type Schema
} from "../schema/index.js";
import type {
  JsonSchemaDialect,
  JsonSchemaOptions
} from "./types.js";

/**
 * @brief draft 07 schema id.
 * @invariant The value is the default dialect marker for TypeSea JSON Schema output.
 */
export const JSON_SCHEMA_DRAFT_07_ID = "http://json-schema.org/draft-07/schema#";

/**
 * @brief draft 2020 12 schema id.
 * @invariant The value selects the `prefixItems` tuple keyword set.
 */
export const JSON_SCHEMA_2020_12_ID = "https://json-schema.org/draft/2020-12/schema";

/**
 * @brief read json schema guard schema.
 */
export function readJsonSchemaGuardSchema(guard: unknown): Schema {
  if (!isRecord(guard)) {
    throw new TypeError("JSON Schema guard must be a TypeSea guard");
  }
  return readJsonSchemaSchema(guard["schema"]);
}

/**
 * @brief read json schema schema.
 */
export function readJsonSchemaSchema(schema: unknown): Schema {
  if (!isSchemaValue(schema)) {
    throw new TypeError("JSON Schema export requires a valid TypeSea schema");
  }
  return freezeSchema(schema);
}

/**
 * @brief read json schema options.
 */
export function readJsonSchemaOptions(options: unknown): JsonSchemaOptions {
  if (options === undefined) {
    return {
      dialect: "draft-07",
      schemaId: undefined
    };
  }
  if (!isRecord(options)) {
    throw new TypeError("JSON Schema options must be an object");
  }
  const schemaId = options["schemaId"];
  const dialect = readJsonSchemaDialect(options["dialect"], schemaId);
  if (schemaId !== undefined && typeof schemaId !== "string") {
    throw new TypeError("JSON Schema schemaId must be a string");
  }
  return {
    dialect,
    schemaId
  };
}

/**
 * @brief read json schema dialect.
 * @details Derives the emitter keyword set from the requested JSON Schema dialect.
 * @returns Normalized JSON Schema dialect.
 */
function readJsonSchemaDialect(value: unknown, schemaId: unknown): JsonSchemaDialect {
  if (value === undefined) {
    return inferJsonSchemaDialect(schemaId);
  }
  if (value === "draft-07" || value === "2020-12") {
    return value;
  }
  throw new TypeError("JSON Schema dialect must be draft-07 or 2020-12");
}

/**
 * @brief infer json schema dialect.
 * @details Chooses a keyword set from well-known schema identifiers without trusting arbitrary strings.
 * @returns Normalized JSON Schema dialect.
 */
function inferJsonSchemaDialect(schemaId: unknown): JsonSchemaDialect {
  if (typeof schemaId === "string" && schemaId.includes("2020-12")) {
    return "2020-12";
  }
  return "draft-07";
}

/**
 * @brief is record.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
