/**
 * @file types.ts
 * @brief JSON Schema export data contracts.
 */

import type { PathSegment } from "../issue/index.js";
import type { GlobalRegistryMetadata, SchemaRegistry } from "../registry/index.js";
import type { Schema } from "../schema/index.js";

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
    | "draft-04"
    | "draft-07"
    | "2020-12";

export type JsonSchemaOutputTarget =
    | JsonSchemaDialect
    | "openapi-3.0";

type JsonSchemaUnrepresentableOpen = Lowercase<"ANY">;

export type JsonSchemaUnrepresentableMode =
    | "throw"
    | JsonSchemaUnrepresentableOpen;

export type JsonSchemaUriMapper = (id: string) => string;

export type JsonSchemaReusedMode =
    | "inline"
    | "ref";

export type JsonSchemaCyclesMode =
    | "ref"
    | "throw";

export type JsonSchemaOverrideObject =
    MutableJsonSchemaObject & Record<string, unknown>;

export interface JsonSchemaOverrideContext {
    readonly schema: Schema;
    readonly jsonSchema: JsonSchemaOverrideObject;
    readonly path: readonly PathSegment[];
    readonly target: JsonSchemaOutputTarget;
}

export type JsonSchemaOverride =
    (context: JsonSchemaOverrideContext) => void;

/**
 * @brief User-facing JSON Schema target aliases.
 * @details Zod migration code often names the option `target` and spells the
 * latest dialect as `draft-2020-12`. TypeSea normalizes those aliases before
 * emission so the exporter still has one internal dialect switch.
 */
export type JsonSchemaTarget =
    | "draft-4"
    | "draft-04"
    | "draft-7"
    | "draft-07"
    | "2020-12"
    | "draft-2020-12"
    | "openapi-3.0";

/**
 * @brief Readonly JSON Schema object shape returned from public APIs.
 * @details The interface contains only keywords emitted by TypeSea. Keeping the
 * shape narrow catches accidental exporter drift in TypeScript before release.
 */
export interface JsonSchemaObject {
    readonly [key: string]: unknown;

    readonly $schema?: string;
    readonly $id?: string;
    readonly $ref?: string;
    readonly title?: string;
    readonly description?: string;
    readonly examples?: readonly unknown[];
    readonly type?: JsonSchemaTypeName | readonly JsonSchemaTypeName[];
    readonly const?: JsonSchemaPrimitive;
    readonly enum?: readonly JsonSchemaPrimitive[];
    readonly format?: string;
    readonly contentEncoding?: string;
    readonly contentMediaType?: string;
    readonly pattern?: string;
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly minimum?: number;
    readonly maximum?: number;
    readonly exclusiveMinimum?: number | boolean;
    readonly exclusiveMaximum?: number | boolean;
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
    readonly patternProperties?: Readonly<Record<string, JsonSchema>>;
    readonly propertyNames?: JsonSchema;
    readonly minProperties?: number;
    readonly maxProperties?: number;
    readonly required?: readonly string[];
    readonly additionalProperties?: JsonSchema;
    readonly nullable?: boolean;
    readonly anyOf?: readonly JsonSchema[];
    readonly oneOf?: readonly JsonSchema[];
    readonly allOf?: readonly JsonSchema[];
    readonly not?: JsonSchema;
    readonly $defs?: Readonly<Record<string, JsonSchema>>;
    readonly definitions?: Readonly<Record<string, JsonSchema>>;
}

export interface JsonSchemaRegistryDocument {
    readonly schemas: Readonly<Record<string, JsonSchema>>;
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
    | "unsupported_target"
    | "unsupported_lazy"
    | "unsupported_refine"
    | "unsupported_readonly"
    | "unsupported_record"
    | "unsupported_decoder"
    | "unsupported_async_decoder"
    | "duplicate_registry_id"
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

export type JsonSchemaImportCode =
    | "invalid_schema"
    | "unsupported_keyword"
    | "unsupported_type"
    | "unsupported_pattern"
    | "unsupported_empty_union";

export interface JsonSchemaImportIssue {
    readonly path: readonly PathSegment[];
    readonly code: JsonSchemaImportCode;
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
     * @details Tuple schemas use `items` arrays for draft-04/draft-07 and
     * `prefixItems` for 2020-12.
     * @invariant Tuple schemas use `items` arrays for draft-04/draft-07 and `prefixItems` for 2020-12.
     */
    readonly dialect: JsonSchemaDialect;

    /**
     * @brief Zod-style alias for selecting the emitted JSON Schema dialect.
     * @details `target` and `dialect` may be supplied together only when they
     * normalize to the same dialect.
     */
    readonly target?: JsonSchemaTarget | undefined;

    readonly unrepresentable?: JsonSchemaUnrepresentableMode | undefined;

    readonly uri?: JsonSchemaUriMapper | undefined;

    readonly reused?: JsonSchemaReusedMode | undefined;

    readonly cycles?: JsonSchemaCyclesMode | undefined;

    readonly override?: JsonSchemaOverride | undefined;

    readonly metadata?: SchemaRegistry<GlobalRegistryMetadata> | undefined;

    readonly schemaId: string | undefined;
}

/**
 * @brief Internal mutable JSON Schema object used during emission.
 * @details Emitters fill this shape in local loops, then `freezeJsonSchema`
 * hardens it before the value crosses the public API boundary.
 */
export interface MutableJsonSchemaObject {
    [key: string]: unknown;

    $schema?: string;
    $id?: string;
    $ref?: string;
    title?: string;
    description?: string;
    examples?: readonly unknown[];
    type?: JsonSchemaTypeName | readonly JsonSchemaTypeName[];
    const?: JsonSchemaPrimitive;
    enum?: readonly JsonSchemaPrimitive[];
    format?: string;
    contentEncoding?: string;
    contentMediaType?: string;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number | boolean;
    exclusiveMaximum?: number | boolean;
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
    patternProperties?: Readonly<Record<string, JsonSchema>>;
    propertyNames?: JsonSchema;
    minProperties?: number;
    maxProperties?: number;
    required?: readonly string[];
    additionalProperties?: JsonSchema;
    nullable?: boolean;
    anyOf?: readonly JsonSchema[];
    oneOf?: readonly JsonSchema[];
    allOf?: readonly JsonSchema[];
    not?: JsonSchema;
    $defs?: Readonly<Record<string, JsonSchema>>;
    definitions?: Readonly<Record<string, JsonSchema>>;
}
