/**
 * @file types.ts
 * @brief JSON Schema export data contracts.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
 */

import type { PathSegment } from "../issue/index.js";

/**
 * @brief Public JSON Schema fragment produced by the exporter.
 * @details JSON Schema allows boolean schemas at every position, so the TypeSea
 * model keeps that union explicit instead of wrapping boolean fragments in
 * object shells.
 */
export type JsonSchema = boolean | JsonSchemaObject;

/**
 * @brief Literal values that can be represented losslessly in JSON Schema.
 * @details Undefined, bigint, symbol, NaN, infinity, and negative zero are not
 * part of this type because the exporter reports them as unsupported instead of
 * weakening literal semantics.
 */
export type JsonSchemaPrimitive = string | number | boolean | null;

/**
 * @brief Type names accepted by the emitted JSON Schema `type` keyword.
 * @details The list is intentionally closed so emitters cannot spell dialect
 * keywords or runtime-only TypeSea domains as plain strings.
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
 * @brief JSON Schema dialects supported by TypeSea emission.
 * @details Defines the keyword set selected for emitted schemas.
 * @invariant Each dialect maps to one stable tuple representation.
 */
export type JsonSchemaDialect =
    | "draft-07"
    | "2020-12";

/**
 * @brief Readonly JSON Schema object shape returned from public APIs.
 * @details The interface contains only keywords emitted by TypeSea. Keeping the
 * shape narrow catches accidental exporter drift in TypeScript before release.
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
    readonly exclusiveMinimum?: number;
    readonly exclusiveMaximum?: number;
    readonly multipleOf?: number;
    readonly items?: JsonSchema | readonly JsonSchema[];

    /**
     * @brief Draft-07 tuple tail schema for values past fixed positions.
     * @details Older validators read this field when `items` is an array, so it
     * must be emitted for strict TypeSea tuple length semantics.
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
 * @brief Closed set of JSON Schema export failure codes.
 * @details Codes are stable machine-readable diagnostics. The human message may
 * change, but adapter logic can branch on these strings.
 */
export type JsonSchemaExportCode =
    | "unsupported_bigint"
    | "unsupported_symbol"
    | "unsupported_date"
    | "unsupported_runtime_object"
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
 * @brief Structured diagnostic produced when export would lose semantics.
 * @details Paths point into the TypeSea schema tree, not the emitted JSON
 * Schema, because failures occur before a complete output document exists.
 */
export interface JsonSchemaExportIssue {
    readonly path: readonly PathSegment[];
    readonly code: JsonSchemaExportCode;
    readonly message: string;
}

/**
 * @brief Configuration accepted by JSON Schema export APIs.
 * @details Options are normalized before emission so the lower-level emitters
 * can select dialect behavior without repeatedly checking optional fields.
 */
export interface JsonSchemaOptions {

    /**
     * @brief Keyword family selected for the emitted document.
     * @details Tuple schemas use `items` arrays for draft-07 and `prefixItems`
     * for 2020-12.
     * @invariant Tuple schemas use `items` arrays for draft-07 and `prefixItems` for 2020-12.
     */
    readonly dialect: JsonSchemaDialect;
    readonly schemaId: string | undefined;
}

/**
 * @brief Internal mutable JSON Schema object used during emission.
 * @details Emitters fill this shape in local loops, then `freezeJsonSchema`
 * hardens it before the value crosses the public API boundary.
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
    exclusiveMinimum?: number;
    exclusiveMaximum?: number;
    multipleOf?: number;
    items?: JsonSchema | readonly JsonSchema[];

    /**
     * @brief Draft-07 tuple tail schema for values past fixed positions.
     * @details Older validators read this field when `items` is an array, so it
     * must be emitted for strict TypeSea tuple length semantics.
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
