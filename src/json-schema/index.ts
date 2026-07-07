/**
 * @file index.ts
 * @brief Public JSON Schema export module.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
 */

import { isAsyncDecoderValue, type AsyncDecoder } from "../async/index.js";
import { isDecoderValue, type Decoder } from "../decoder/index.js";
import type { Guard, Presence } from "../guard/index.js";
import {
    isSchemaRegistryValue,
    type GlobalRegistryMetadata,
    type SchemaRegistry
} from "../registry/index.js";
import { err, type Result } from "../result/index.js";
import {
    freezeJsonSchemaIssues
} from "./freeze.js";
import {
    JSON_SCHEMA_UNREPRESENTABLE_OPEN,
    readJsonSchemaGuardSchema,
    readJsonSchemaOptions
} from "./read.js";
import {
    openSchemaToJsonSchema,
    schemaRegistryToJsonSchema,
    schemaToJsonSchema
} from "./export.js";
import type {
    JsonSchema,
    JsonSchemaExportIssue,
    JsonSchemaOptions,
    JsonSchemaRegistryDocument
} from "./types.js";

export {
    schemaRegistryToJsonSchema,
    schemaToJsonSchema
} from "./export.js";

export {
    fromJSONSchema,
    fromJsonSchema
} from "./from.js";

export type {
    JsonSchema,
    JsonSchemaCyclesMode,
    JsonSchemaDialect,
    JsonSchemaExportCode,
    JsonSchemaExportIssue,
    JsonSchemaImportCode,
    JsonSchemaImportIssue,
    JsonSchemaObject,
    JsonSchemaOptions,
    JsonSchemaOverride,
    JsonSchemaOverrideContext,
    JsonSchemaOverrideObject,
    JsonSchemaPrimitive,
    JsonSchemaRegistryDocument,
    JsonSchemaReusedMode,
    JsonSchemaTarget,
    JsonSchemaTypeName,
    JsonSchemaUnrepresentableMode,
    JsonSchemaUriMapper
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
): Result<JsonSchema, readonly JsonSchemaExportIssue[]>;

export function toJsonSchema(
    registry: SchemaRegistry<GlobalRegistryMetadata>,
    options?: Partial<JsonSchemaOptions>
): Result<JsonSchemaRegistryDocument, readonly JsonSchemaExportIssue[]>;

export function toJsonSchema<TValue>(
    source:
        | Guard<TValue, Presence>
        | Decoder<TValue>
        | AsyncDecoder<TValue>
        | SchemaRegistry<GlobalRegistryMetadata>,
    options?: Partial<JsonSchemaOptions>
): Result<JsonSchema | JsonSchemaRegistryDocument, readonly JsonSchemaExportIssue[]> {
    if (isSchemaRegistryValue(source)) {
        return schemaRegistryToJsonSchema(
            source,
            options
        );
    }
    if (isAsyncDecoderValue(source)) {
        const config = readJsonSchemaOptions(options);
        if (config.unrepresentable === JSON_SCHEMA_UNREPRESENTABLE_OPEN) {
            return openSchemaToJsonSchema(options);
        }
        return err(freezeJsonSchemaIssues([
            {
                path: Object.freeze([]),
                code: "unsupported_async_decoder",
                message: "Async decoders cannot be represented as JSON Schema"
            }
        ]));
    }
    if (isDecoderValue(source)) {
        const config = readJsonSchemaOptions(options);
        if (config.unrepresentable === JSON_SCHEMA_UNREPRESENTABLE_OPEN) {
            return openSchemaToJsonSchema(options);
        }
        return err(freezeJsonSchemaIssues([
            {
                path: Object.freeze([]),
                code: "unsupported_decoder",
                message: "Decoder transforms and coercions cannot be represented as JSON Schema"
            }
        ]));
    }
    return schemaToJsonSchema(readJsonSchemaGuardSchema(source), options);
}

export const toJSONSchema = toJsonSchema;
