/**
 * @file index.ts
 * @brief Public JSON Schema export module.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
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
 * @brief Export the schema behind a guard or decoder as JSON Schema.
 * @details Decoder values are rejected before emission because transform logic
 * has no lossless JSON Schema representation. This keeps the exporter honest:
 * it returns a schema only when the runtime validator can be expressed without
 * hidden TypeSea execution.
 * @param guard Guard or decoder value provided by public callers.
 * @param options Optional dialect and schema id configuration.
 * @returns Export result with either a frozen JSON Schema document or issues.
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
 * @brief Export a raw TypeSea schema into a JSON Schema document.
 * @details This internal-facing helper skips guard extraction but still routes
 * through the same emitter and issue accumulator as the public guard API.
 * @param schema Schema value that already passed TypeSea construction checks.
 * @param options Optional dialect and schema id configuration.
 * @returns Export result with a frozen JSON Schema document or diagnostics.
 */
export function schemaToJsonSchema(
    schema: Schema,
    options?: Partial<JsonSchemaOptions>
): Result<JsonSchema, readonly JsonSchemaExportIssue[]> {
    return exportJsonSchema(readJsonSchemaSchema(schema), options);
}

/**
 * @brief Run the JSON Schema emitter and attach the dialect marker.
 * @details The emitter writes structural failures into `issues` instead of
 * throwing so callers can inspect every unsupported node discovered during the
 * walk. Boolean schemas are wrapped to preserve a document-shaped top level.
 * @param schema TypeSea schema selected for export.
 * @param options User supplied export options, still unresolved.
 * @returns Frozen JSON Schema document on success, or frozen export issues.
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
 * @brief default json schema schema id.
 * @details Maps each TypeSea emitter dialect to the matching `$schema` marker.
 * @returns Stable schema identifier for the selected dialect.
 */
function defaultJsonSchemaSchemaId(dialect: JsonSchemaDialect): string {
    if (dialect === "2020-12") {
        return JSON_SCHEMA_2020_12_ID;
    }
    return JSON_SCHEMA_DRAFT_07_ID;
}
