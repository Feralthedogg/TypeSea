/**
 * @file read.ts
 * @brief Input normalization for JSON Schema export.
 */

import {
    freezeSchema,
    isSchemaValue,
    type Schema
} from "../schema/index.js";
import {
    isSchemaRegistryValue,
    type GlobalRegistryMetadata,
    type SchemaRegistry
} from "../registry/index.js";
import type {
    JsonSchemaCyclesMode,
    JsonSchemaDialect,
    JsonSchemaOverride,
    JsonSchemaOutputTarget,
    JsonSchemaReusedMode,
    JsonSchemaTarget,
    JsonSchemaUnrepresentableMode,
    JsonSchemaUriMapper
} from "./types.js";

interface ResolvedJsonSchemaOptions {
    readonly dialect: JsonSchemaDialect;
    readonly target: JsonSchemaOutputTarget;
    readonly unrepresentable: JsonSchemaUnrepresentableMode;
    readonly uri: JsonSchemaUriMapper;
    readonly reused: JsonSchemaReusedMode;
    readonly cycles: JsonSchemaCyclesMode;
    readonly override: JsonSchemaOverride | undefined;
    readonly metadata: SchemaRegistry<GlobalRegistryMetadata> | undefined;
    readonly schemaId: string | undefined;
}

/** @brief Sentinel spelling that opens unrepresentable domains during export. */
export const JSON_SCHEMA_UNREPRESENTABLE_OPEN = "ANY".toLowerCase() as JsonSchemaUnrepresentableMode;
/** @brief Strict policy that reports unrepresentable schema domains. */
export const JSON_SCHEMA_UNREPRESENTABLE_THROW = "throw";
/** @brief Default URI mapper preserving registry identifiers verbatim. */
export const JSON_SCHEMA_IDENTITY_URI: JsonSchemaUriMapper = (id: string): string => id;

/**
 * @brief draft 04 schema id.
 * @invariant The value selects the legacy draft-04 keyword set.
 */
export const JSON_SCHEMA_DRAFT_04_ID = "http://json-schema.org/draft-04/schema#";

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
 * @brief Read the schema carried by a guard for JSON Schema export.
 * @param guard Candidate guard-like value.
 * @returns Frozen schema accepted by the exporter.
 * @throws TypeError when the receiver does not expose a valid TypeSea schema.
 * @details Export can be used at package or build boundaries, so forged
 * prototype schema fields are rejected before conversion begins.
 */
export function readJsonSchemaGuardSchema(guard: unknown): Schema {
    if (!isObjectLike(guard)) {
        throw new TypeError("JSON Schema guard must be a TypeSea guard");
    }
    return readJsonSchemaSchema(readOwnDataProperty(guard, "schema"));
}

/**
 * @brief Validate and freeze a direct schema export input.
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
export function readJsonSchemaOptions(options: unknown): ResolvedJsonSchemaOptions {
    if (options === undefined) {
        return {
            dialect: "draft-07",
            target: "draft-07",
            unrepresentable: JSON_SCHEMA_UNREPRESENTABLE_THROW,
            uri: JSON_SCHEMA_IDENTITY_URI,
            reused: "inline",
            cycles: "ref",
            override: undefined,
            metadata: undefined,
            schemaId: undefined
        };
    }
    if (!isRecord(options)) {
        throw new TypeError("JSON Schema options must be an object");
    }
    const schemaId = readOwnDataProperty(options, "schemaId");
    const target = readJsonSchemaTarget(readOwnDataProperty(options, "target"));
    const dialect = readJsonSchemaDialect(
        readOwnDataProperty(options, "dialect"),
        target,
        schemaId
    );
    if (schemaId !== undefined && typeof schemaId !== "string") {
        throw new TypeError("JSON Schema schemaId must be a string");
    }
    const unrepresentable = readJsonSchemaUnrepresentable(
        readOwnDataProperty(options, "unrepresentable")
    );
    const uri = readJsonSchemaUri(readOwnDataProperty(options, "uri"));
    const reused = readJsonSchemaReused(readOwnDataProperty(options, "reused"));
    const cycles = readJsonSchemaCycles(readOwnDataProperty(options, "cycles"));
    const override = readJsonSchemaOverride(readOwnDataProperty(options, "override"));
    const metadata = readJsonSchemaMetadata(readOwnDataProperty(options, "metadata"));
    const outputTarget = target ?? dialect;
    if (outputTarget === "openapi-3.0" && schemaId !== undefined) {
        throw new TypeError("JSON Schema schemaId is not supported for OpenAPI 3.0 target");
    }
    return {
        dialect,
        target: outputTarget,
        unrepresentable,
        uri,
        reused,
        cycles,
        override,
        metadata,
        schemaId
    };
}

/**
 * @brief Normalize the requested JSON Schema dialect.
 * @param value Candidate dialect option.
 * @param target Candidate target alias option.
 * @param schemaId Schema id used as a compatibility hint.
 * @returns Normalized JSON Schema dialect.
 * @throws TypeError when the dialect string is outside the supported set.
 */
function readJsonSchemaDialect(
    value: unknown,
    target: JsonSchemaOutputTarget | undefined,
    schemaId: unknown
): JsonSchemaDialect {
    if (value === undefined) {
        if (target !== undefined && target !== "openapi-3.0") {
            return target;
        }
        return inferJsonSchemaDialect(schemaId);
    }
    if (value === "draft-04" || value === "draft-07" || value === "2020-12") {
        if (target !== undefined && target !== value) {
            throw new TypeError("JSON Schema dialect and target must agree");
        }
        return value;
    }
    throw new TypeError("JSON Schema dialect must be draft-04, draft-07, or 2020-12");
}

/**
 * @brief Normalize the Zod-style JSON Schema target option.
 * @param value Candidate target value.
 * @returns Internal dialect, or undefined when no target was supplied.
 */
function readJsonSchemaTarget(value: unknown): JsonSchemaOutputTarget | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (value === "draft-4" || value === "draft-04") {
        return "draft-04";
    }
    if (value === "draft-7" || value === "draft-07") {
        return "draft-07";
    }
    if (value === "2020-12" || value === "draft-2020-12") {
        return "2020-12";
    }
    if (value === "openapi-3.0") {
        return "openapi-3.0";
    }
    assertNeverJsonSchemaTarget(value);
}

/**
 * @brief Reject unsupported target aliases with a focused message.
 * @param value Candidate target value.
 * @throws TypeError always.
 */
function assertNeverJsonSchemaTarget(value: unknown): never {
    const supported: readonly JsonSchemaTarget[] = [
        "draft-4",
        "draft-04",
        "draft-7",
        "draft-07",
        "2020-12",
        "draft-2020-12",
        "openapi-3.0"
    ];
    if (typeof value === "string") {
        throw new TypeError(`JSON Schema target must be ${supported.join(", ")}`);
    }
    throw new TypeError("JSON Schema target must be a string");
}

/**
 * @brief Normalize unrepresentable-type handling.
 */
function readJsonSchemaUnrepresentable(value: unknown): JsonSchemaUnrepresentableMode {
    if (value === undefined) {
        return JSON_SCHEMA_UNREPRESENTABLE_THROW;
    }
    if (value === JSON_SCHEMA_UNREPRESENTABLE_THROW) {
        return JSON_SCHEMA_UNREPRESENTABLE_THROW;
    }
    if (value === JSON_SCHEMA_UNREPRESENTABLE_OPEN) {
        return JSON_SCHEMA_UNREPRESENTABLE_OPEN;
    }
    if (typeof value === "string") {
        throw new TypeError("JSON Schema unrepresentable must be throw or a permissive fallback");
    }
    throw new TypeError("JSON Schema unrepresentable must be a string");
}

/**
 * @brief Normalize metadata-id URI mapping.
 */
function readJsonSchemaUri(value: unknown): JsonSchemaUriMapper {
    if (value === undefined) {
        return JSON_SCHEMA_IDENTITY_URI;
    }
    if (typeof value !== "function") {
        throw new TypeError("JSON Schema uri must be a function");
    }
    const mapper = value as (id: string) => unknown;
    return (id: string): string => {
        const mapped = mapper(id);
        if (typeof mapped !== "string") {
            throw new TypeError("JSON Schema uri must return a string");
        }
        return mapped;
    };
}

/**
 * @brief Normalize repeated schema identity handling.
 */
function readJsonSchemaReused(value: unknown): JsonSchemaReusedMode {
    if (value === undefined) {
        return "inline";
    }
    if (value === "inline" || value === "ref") {
        return value;
    }
    if (typeof value === "string") {
        throw new TypeError("JSON Schema reused must be inline or ref");
    }
    throw new TypeError("JSON Schema reused must be a string");
}

/**
 * @brief Normalize recursive schema handling.
 */
function readJsonSchemaCycles(value: unknown): JsonSchemaCyclesMode {
    if (value === undefined) {
        return "ref";
    }
    if (value === "ref" || value === "throw") {
        return value;
    }
    if (typeof value === "string") {
        throw new TypeError("JSON Schema cycles must be ref or throw");
    }
    throw new TypeError("JSON Schema cycles must be a string");
}

/**
 * @brief Normalize custom JSON Schema fragment override hook.
 */
function readJsonSchemaOverride(value: unknown): JsonSchemaOverride | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "function") {
        throw new TypeError("JSON Schema override must be a function");
    }
    return value as JsonSchemaOverride;
}

/**
 * @brief Normalize an optional external metadata registry.
 */
function readJsonSchemaMetadata(
    value: unknown
): SchemaRegistry<GlobalRegistryMetadata> | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!isSchemaRegistryValue(value)) {
        throw new TypeError("JSON Schema metadata must be a TypeSea registry");
    }
    return value as SchemaRegistry<GlobalRegistryMetadata>;
}

/**
 * @brief Infer the dialect from a well-known schema id marker.
 * @param schemaId Candidate schema id.
 * @returns A known draft when the id names one, otherwise draft-07.
 */
function inferJsonSchemaDialect(schemaId: unknown): JsonSchemaDialect {
    if (typeof schemaId !== "string") {
        return "draft-07";
    }
    if (schemaId.includes("draft-04")) {
        return "draft-04";
    }
    if (schemaId.includes("2020-12")) {
        return "2020-12";
    }
    return "draft-07";
}

/**
 * @brief Accept option records before descriptor-based reads.
 * @param value Candidate options or guard object.
 * @returns True for non-array objects.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Accept objects and function objects that can carry own schema slots.
 */
function isObjectLike(value: unknown): value is object {
    return value !== null && (typeof value === "object" || typeof value === "function");
}

/**
 * @brief Read one own data option without consulting prototypes.
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
