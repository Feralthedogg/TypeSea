/**
 * @file emit-combinator.ts
 * @brief Combinator TypeSea schema to JSON Schema emitters.
 */

import { SchemaTag } from "../kind/index.js";
import type { PathSegment } from "../issue/index.js";
import type { Schema } from "../schema/index.js";
import type { JsonSchemaEmitter } from "./emit-types.js";
import { pushJsonSchemaIssue } from "./issue.js";
import type {
  JsonSchema,
  JsonSchemaDialect,
  JsonSchemaExportIssue
} from "./types.js";

/**
 * @brief emit union.
 */
export function emitUnion(
  options: readonly Schema[],
  path: PathSegment[],
  issues: JsonSchemaExportIssue[],
  emitChild: JsonSchemaEmitter,
  dialect: JsonSchemaDialect
): JsonSchema | undefined {
  const emitted = new Array<JsonSchema>(options.length);
  let failed = false;
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option === undefined) {
      continue;
    }
    path.push(index);
    const child = emitChild(option, path, issues, dialect);
    if (child === undefined) {
      pushJsonSchemaIssue(path, issues, "unsupported_child", "Union option schema is unsupported");
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
  return {
    anyOf: emitted
  };
}

/**
 * @brief emit intersection.
 */
export function emitIntersection(
  left: Schema,
  right: Schema,
  path: PathSegment[],
  issues: JsonSchemaExportIssue[],
  emitChild: JsonSchemaEmitter,
  dialect: JsonSchemaDialect
): JsonSchema | undefined {
  path.push("left");
  const leftSchema = emitChild(left, path, issues, dialect);
  if (leftSchema === undefined) {
    pushJsonSchemaIssue(path, issues, "unsupported_child", "Intersection left schema is unsupported");
    path.pop();
    return undefined;
  }
  path.pop();
  path.push("right");
  const rightSchema = emitChild(right, path, issues, dialect);
  if (rightSchema === undefined) {
    pushJsonSchemaIssue(path, issues, "unsupported_child", "Intersection right schema is unsupported");
    path.pop();
    return undefined;
  }
  path.pop();
  return {
    allOf: [
      leftSchema,
      rightSchema
    ]
  };
}

/**
 * @brief emit discriminated union.
 */
export function emitDiscriminatedUnion(
  cases: Extract<Schema, {
    readonly tag: typeof SchemaTag.DiscriminatedUnion
  }>["cases"],
  path: PathSegment[],
  issues: JsonSchemaExportIssue[],
  emitChild: JsonSchemaEmitter,
  dialect: JsonSchemaDialect
): JsonSchema | undefined {
  const options = new Array<Schema>(cases.length);
  for (let index = 0; index < cases.length; index += 1) {
    const unionCase = cases[index];
    if (unionCase !== undefined) {
      options[index] = unionCase.schema;
    }
  }
  return emitUnion(options, path, issues, emitChild, dialect);
}

/**
 * @brief emit nullable.
 */
export function emitNullable(
  inner: Schema,
  path: PathSegment[],
  issues: JsonSchemaExportIssue[],
  emitChild: JsonSchemaEmitter,
  dialect: JsonSchemaDialect
): JsonSchema | undefined {
  path.push("nullable");
  const emitted = emitChild(inner, path, issues, dialect);
  if (emitted === undefined) {
    pushJsonSchemaIssue(path, issues, "unsupported_child", "Nullable inner schema is unsupported");
    path.pop();
    return undefined;
  }
  path.pop();
  return {
    anyOf: [
      emitted,
      {
        type: "null"
      }
    ]
  };
}
