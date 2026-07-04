/**
 * @file read.ts
 * @brief Input normalization for JSON Schema export.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
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
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
 * @invariant The value is the default dialect marker for TypeSea JSON Schema output.
 */
export const JSON_SCHEMA_DRAFT_07_ID = "http://json-schema.org/draft-07/schema#";

/**
 * @brief draft 2020 12 schema id.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
 * @invariant The value selects the `prefixItems` tuple keyword set.
 */
export const JSON_SCHEMA_2020_12_ID = "https://json-schema.org/draft/2020-12/schema";

/**
 * @brief Read the schema carried by a guard for JSON Schema export.
 * @param guard Candidate guard-like value.
 * @returns Frozen schema accepted by the exporter.
 * @throws TypeError when the receiver does not expose a valid TypeSea schema.
 * @details Export can be used at package or build boundaries, so forged
 * prototype schema fields are rejected before conversion begins.
 */
export function readJsonSchemaGuardSchema(guard: unknown): Schema {
    if (!isRecord(guard)) {
        throw new TypeError("JSON Schema guard must be a TypeSea guard");
    }
    return readJsonSchemaSchema(readOwnDataProperty(guard, "schema"));
}

/**
 * @brief Validate and freeze a direct schema export input.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
 * @param schema Candidate TypeSea schema.
 * @returns Frozen schema tree safe for traversal by emitters.
 * @throws TypeError when the schema shape is malformed.
 */
export function readJsonSchemaSchema(schema: unknown): Schema {
    if (!isSchemaValue(schema)) {
        throw new TypeError("JSON Schema export requires a valid TypeSea schema");
    }
    return freezeSchema(schema);
}

/**
 * @brief Normalize JSON Schema exporter options.
 * @param options Candidate options object.
 * @returns Dialect and schema id with defaults filled in.
 * @throws TypeError when option fields are not supported.
 * @details Options are read through own data slots so a caller cannot influence
 * export dialect through inherited getters or prototype state.
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
    const schemaId = readOwnDataProperty(options, "schemaId");
    const dialect = readJsonSchemaDialect(readOwnDataProperty(options, "dialect"), schemaId);
    if (schemaId !== undefined && typeof schemaId !== "string") {
        throw new TypeError("JSON Schema schemaId must be a string");
    }
    return {
        dialect,
        schemaId
    };
}

/**
 * @brief Normalize the requested JSON Schema dialect.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
 * @param value Candidate dialect option.
 * @param schemaId Schema id used as a compatibility hint.
 * @returns Normalized JSON Schema dialect.
 * @throws TypeError when the dialect string is outside the supported set.
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
 * @brief Infer the dialect from a well-known schema id marker.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
 * @param schemaId Candidate schema id.
 * @returns Draft 2020-12 when the id names that draft, otherwise draft-07.
 */
function inferJsonSchemaDialect(schemaId: unknown): JsonSchemaDialect {
    if (typeof schemaId === "string" && schemaId.includes("2020-12")) {
        return "2020-12";
    }
    return "draft-07";
}

/**
 * @brief Accept option records before descriptor-based reads.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
 * @param value Candidate options or guard object.
 * @returns True for non-array objects.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Read one own data option without consulting prototypes.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
 * @param value Object being normalized.
 * @param key Field name or symbol.
 * @returns Stored field value, or undefined when absent.
 */
function readOwnDataProperty(
    value: object,
    key: PropertyKey
): unknown {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        return undefined;
    }
    return descriptor.value;
}
