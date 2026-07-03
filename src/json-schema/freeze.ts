/**
 * @file freeze.ts
 * @brief Immutable JSON Schema export results.
 */

import type {
  JsonSchema,
  JsonSchemaExportIssue,
  JsonSchemaObject
} from "./types.js";

/**
 * @brief freeze json schema.
 */
export function freezeJsonSchema(schema: JsonSchema): JsonSchema {
  if (typeof schema === "boolean") {
    return schema;
  }
  return freezeJsonSchemaInner(schema, new WeakSet<object>());
}

/**
 * @brief freeze json schema inner.
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
  if (schema.items !== undefined) {
    freezeJsonSchemaItems(schema.items, frozen);
  }
  if (schema.prefixItems !== undefined) {
    freezeJsonSchemaArray(schema.prefixItems, frozen);
  }
  if (schema.properties !== undefined) {
    freezeJsonSchemaProperties(schema.properties, frozen);
  }
  if (schema.required !== undefined) {
    Object.freeze(schema.required);
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
  if (schema.allOf !== undefined) {
    freezeJsonSchemaArray(schema.allOf, frozen);
  }
  return Object.freeze(schema);
}

/**
 * @brief freeze json schema items.
 * @details Handles both homogeneous `items` schemas and draft-07 tuple item arrays.
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
 * @brief freeze json schema value.
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
 * @brief freeze json schema array.
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
 * @brief freeze json schema properties.
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
 * @brief freeze json schema issues.
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
