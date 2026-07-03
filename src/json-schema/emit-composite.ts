/**
 * @file emit-composite.ts
 * @brief Container TypeSea schema to JSON Schema emitters.
 */

import {
  ObjectModeTag,
  PresenceTag,
  SchemaTag
} from "../kind/index.js";
import type { PathSegment } from "../issue/index.js";
import type { Schema } from "../schema/index.js";
import type { JsonSchemaEmitter } from "./emit-types.js";
import { pushJsonSchemaIssue } from "./issue.js";
import type {
  JsonSchema,
  JsonSchemaDialect,
  JsonSchemaExportIssue,
  MutableJsonSchemaObject
} from "./types.js";

/**
 * @brief emit array.
 */
export function emitArray(
  item: Schema,
  path: PathSegment[],
  issues: JsonSchemaExportIssue[],
  emitChild: JsonSchemaEmitter,
  dialect: JsonSchemaDialect
): JsonSchema | undefined {
  path.push("items");
  const emitted = emitChild(item, path, issues, dialect);
  if (emitted === undefined) {
    pushJsonSchemaIssue(path, issues, "unsupported_child", "Array item schema is unsupported");
    path.pop();
    return undefined;
  }
  path.pop();
  return {
    type: "array",
    items: emitted
  };
}

/**
 * @brief emit tuple.
 */
export function emitTuple(
  items: readonly Schema[],
  path: PathSegment[],
  issues: JsonSchemaExportIssue[],
  emitChild: JsonSchemaEmitter,
  dialect: JsonSchemaDialect
): JsonSchema | undefined {
  const emitted = new Array<JsonSchema>(items.length);
  let failed = false;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === undefined) {
      continue;
    }
    path.push(index);
    const child = emitChild(item, path, issues, dialect);
    if (child === undefined) {
      pushJsonSchemaIssue(path, issues, "unsupported_child", "Tuple item schema is unsupported");
      failed = true;
      path.pop();
      continue;
    }
    path.pop();
    emitted[index] = child;
  }
  if (failed) {
    return undefined;
  }
  if (dialect === "2020-12") {
    return {
      type: "array",
      prefixItems: emitted,
      minItems: items.length,
      maxItems: items.length
    };
  }
  return {
    type: "array",
    items: emitted,
    additionalItems: false,
    minItems: items.length,
    maxItems: items.length
  };
}

/**
 * @brief emit record.
 */
export function emitRecord(
  value: Schema,
  path: PathSegment[],
  issues: JsonSchemaExportIssue[],
  emitChild: JsonSchemaEmitter,
  dialect: JsonSchemaDialect
): JsonSchema | undefined {
  path.push("additionalProperties");
  const emitted = emitChild(value, path, issues, dialect);
  if (emitted === undefined) {
    pushJsonSchemaIssue(path, issues, "unsupported_child", "Record value schema is unsupported");
    path.pop();
    return undefined;
  }
  path.pop();
  return {
    type: "object",
    additionalProperties: emitted
  };
}

/**
 * @brief emit object.
 */
export function emitObject(
  schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
  path: PathSegment[],
  issues: JsonSchemaExportIssue[],
  emitChild: JsonSchemaEmitter,
  dialect: JsonSchemaDialect
): JsonSchema | undefined {
  const properties = makeJsonSchemaProperties();
  const required: string[] = [];
  const entries = schema.entries;
  let failed = false;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) {
      continue;
    }
    path.push(entry.key);
    const emitted = emitChild(entry.schema, path, issues, dialect);
    if (emitted === undefined) {
      pushJsonSchemaIssue(path, issues, "unsupported_child", "Object property schema is unsupported");
      failed = true;
      path.pop();
      continue;
    }
    path.pop();
    properties[entry.key] = emitted;
    if (entry.presence === PresenceTag.Required) {
      required.push(entry.key);
    }
  }
  if (failed) {
    return undefined;
  }
  const result: MutableJsonSchemaObject = {
    type: "object",
    properties,
    additionalProperties: schema.mode !== ObjectModeTag.Strict
  };
  if (required.length !== 0) {
    result.required = required;
  }
  return result;
}

/**
 * @brief make json schema properties.
 */
function makeJsonSchemaProperties(): Record<string, JsonSchema> {
  return Object.create(null) as Record<string, JsonSchema>;
}
