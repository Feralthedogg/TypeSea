/**
 * @file freeze.ts
 * @brief Immutable JSON Schema export results.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
 */

import type {
    JsonSchema,
    JsonSchemaExportIssue,
    JsonSchemaObject,
    JsonSchemaRegistryDocument
} from "./types.js";

/**
 * @brief Deep-freeze a JSON Schema export result before publication.
 * @details Exported schemas may be shared across framework adapters. Freezing
 * prevents later mutation from changing validation semantics after a schema was
 * handed to another subsystem.
 * @param schema JSON Schema fragment or boolean schema.
 * @returns The same schema value after recursive hardening.
 */
export function freezeJsonSchema(schema: JsonSchema): JsonSchema {
    if (typeof schema === "boolean") {
        return schema;
    }
    return freezeJsonSchemaInner(schema, new WeakSet<object>());
}

/**
 * @brief Deep-freeze a registry JSON Schema bundle.
 */
export function freezeJsonSchemaRegistryDocument(
    document: JsonSchemaRegistryDocument
): JsonSchemaRegistryDocument {
    const schemas = document.schemas;
    const keys = Object.keys(schemas);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key !== undefined) {
            freezeJsonSchema(schemas[key] ?? true);
        }
    }
    Object.freeze(schemas);
    return Object.freeze(document);
}

/**
 * @brief Recursively freeze one object-shaped JSON Schema fragment.
 * @details A WeakSet protects against repeated references introduced by callers
 * or future emitters. Current emission is tree-shaped, but this guard keeps the
 * hardener robust at the module boundary.
 * @param schema Object-shaped JSON Schema fragment.
 * @param frozen Objects already processed by this hardening walk.
 * @returns The same object after nested values are frozen.
 */
function freezeJsonSchemaInner(
    schema: JsonSchemaObject,
    frozen: WeakSet<object>
): JsonSchemaObject {
    if (frozen.has(schema)) {
        return schema;
    }
    frozen.add(schema);
    const type = schema.type;
    if (Array.isArray(type)) {
        Object.freeze(type);
    }
    if (schema.enum !== undefined) {
        Object.freeze(schema.enum);
    }
    if (schema.items !== undefined) {
        freezeJsonSchemaItems(schema.items, frozen);
    }
    if (schema.prefixItems !== undefined) {
        freezeJsonSchemaArray(schema.prefixItems, frozen);
    }
    if (schema.properties !== undefined) {
        freezeJsonSchemaProperties(schema.properties, frozen);
    }
    if (schema.propertyNames !== undefined &&
        typeof schema.propertyNames !== "boolean") {
        freezeJsonSchemaInner(schema.propertyNames, frozen);
    }
    if (schema.required !== undefined) {
        Object.freeze(schema.required);
    }
    if (schema.examples !== undefined) {
        Object.freeze(schema.examples);
    }
    if (schema.additionalProperties !== undefined &&
        typeof schema.additionalProperties !== "boolean") {
        freezeJsonSchemaInner(schema.additionalProperties, frozen);
    }
    if (schema.additionalItems !== undefined &&
        typeof schema.additionalItems !== "boolean") {
        freezeJsonSchemaInner(schema.additionalItems, frozen);
    }
    if (schema.anyOf !== undefined) {
        freezeJsonSchemaArray(schema.anyOf, frozen);
    }
    if (schema.oneOf !== undefined) {
        freezeJsonSchemaArray(schema.oneOf, frozen);
    }
    if (schema.allOf !== undefined) {
        freezeJsonSchemaArray(schema.allOf, frozen);
    }
    if (schema.not !== undefined &&
        typeof schema.not !== "boolean") {
        freezeJsonSchemaInner(schema.not, frozen);
    }
    if (schema.$defs !== undefined) {
        freezeJsonSchemaProperties(schema.$defs, frozen);
    }
    if (schema.definitions !== undefined) {
        freezeJsonSchemaProperties(schema.definitions, frozen);
    }
    return Object.freeze(schema);
}

/**
 * @brief Freeze the dialect-dependent `items` payload.
 * @details Draft-07 tuple output stores an array under `items`, while newer
 * dialects use object-shaped homogeneous item schemas. Both representations are
 * hardened here before the parent schema is frozen.
 * @param items JSON Schema `items` payload to harden.
 * @param frozen Objects already processed by this hardening walk.
 */
function freezeJsonSchemaItems(
    items: JsonSchema | readonly JsonSchema[],
    frozen: WeakSet<object>
): void {
    if (Array.isArray(items)) {
        freezeJsonSchemaArray(items, frozen);
        return;
    }
    const schema = items as JsonSchema;
    freezeJsonSchemaValue(schema, frozen);
}

/**
 * @brief Freeze one nested JSON Schema value when it is object-shaped.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
 * @param schema Boolean or object-shaped JSON Schema fragment.
 * @param frozen Objects already processed by this hardening walk.
 */
function freezeJsonSchemaValue(
    schema: JsonSchema,
    frozen: WeakSet<object>
): void {
    if (typeof schema !== "boolean") {
        freezeJsonSchemaInner(schema, frozen);
    }
}

/**
 * @brief Freeze an array of nested schema fragments.
 * @details Elements are hardened before the array itself so no mutable child is
 * reachable through the frozen container.
 * @param schemas Array of JSON Schema fragments.
 * @param frozen Objects already processed by this hardening walk.
 */
function freezeJsonSchemaArray(
    schemas: readonly JsonSchema[],
    frozen: WeakSet<object>
): void {
    for (let index = 0; index < schemas.length; index += 1) {
        const schema = schemas[index];
        if (schema !== undefined) {
            freezeJsonSchemaValue(schema, frozen);
        }
    }
    Object.freeze(schemas);
}

/**
 * @brief Freeze an object-property schema table.
 * @details Property tables are traversed by own enumerable keys because JSON
 * Schema object maps are data dictionaries, not prototype-based classes.
 * @param properties Property-name to schema table.
 * @param frozen Objects already processed by this hardening walk.
 */
function freezeJsonSchemaProperties(
    properties: Readonly<Record<string, JsonSchema>>,
    frozen: WeakSet<object>
): void {
    const keys = Object.keys(properties);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key !== undefined) {
            const schema = properties[key];
            if (schema !== undefined) {
                freezeJsonSchemaValue(schema, frozen);
            }
        }
    }
    Object.freeze(properties);
}

/**
 * @brief Freeze JSON Schema export issues and their path arrays.
 * @details Paths are mutable during traversal for stack efficiency, then frozen
 * at the boundary so callers cannot rewrite diagnostic locations later.
 * @param issues Export issues collected during emission.
 * @returns The same issue array after recursive hardening.
 */
export function freezeJsonSchemaIssues(
    issues: readonly JsonSchemaExportIssue[]
): readonly JsonSchemaExportIssue[] {
    for (let index = 0; index < issues.length; index += 1) {
        const issue = issues[index];
        if (issue !== undefined) {
            Object.freeze(issue.path);
            Object.freeze(issue);
        }
    }
    return Object.freeze(issues);
}
