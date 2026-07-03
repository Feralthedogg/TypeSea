/**
 * @file emit-scalar.ts
 * @brief Scalar TypeSea schema to JSON Schema emitters.
 */

import {
  NumberCheckTag,
  SchemaTag,
  StringCheckTag
} from "../kind/index.js";
import type { PathSegment } from "../issue/index.js";
import {
  UUID_PATTERN,
  type LiteralValue,
  type Schema
} from "../schema/index.js";
import { pushJsonSchemaIssue } from "./issue.js";
import type {
  JsonSchema,
  JsonSchemaExportIssue,
  MutableJsonSchemaObject
} from "./types.js";

/**
 * @brief emit string.
 */
export function emitString(
  schema: Extract<Schema, { readonly tag: typeof SchemaTag.String }>,
  path: PathSegment[],
  issues: JsonSchemaExportIssue[]
): JsonSchema {
  const result: MutableJsonSchemaObject = { type: "string" };
  const checks = schema.checks;
  for (let index = 0; index < checks.length; index += 1) {
    const check = checks[index];
    if (check === undefined) {
      continue;
    }
    switch (check.tag) {
      case StringCheckTag.Min:
        result.minLength = check.value;
        break;
      case StringCheckTag.Max:
        result.maxLength = check.value;
        break;
      case StringCheckTag.Regex:
        if (check.regex.flags.length !== 0) {
          pushJsonSchemaIssue(
            path,
            issues,
            "unsupported_regex_flags",
            "JSON Schema pattern cannot preserve RegExp flags"
          );
        } else {
          result.pattern = check.regex.source;
        }
        break;
      case StringCheckTag.Uuid:
        result.format = "uuid";
        result.pattern = UUID_PATTERN.source;
        break;
    }
  }
  return result;
}

/**
 * @brief emit number.
 */
export function emitNumber(
  schema: Extract<Schema, { readonly tag: typeof SchemaTag.Number }>,
  path: PathSegment[],
  issues: JsonSchemaExportIssue[]
): JsonSchema | undefined {
  const before = issues.length;
  const result: MutableJsonSchemaObject = { type: "number" };
  const checks = schema.checks;
  for (let index = 0; index < checks.length; index += 1) {
    const check = checks[index];
    if (check === undefined) {
      continue;
    }
    switch (check.tag) {
      case NumberCheckTag.Integer:
        result.type = "integer";
        break;
      case NumberCheckTag.Gte:
        if (!Number.isFinite(check.value)) {
          pushJsonSchemaIssue(path, issues, "unsupported_number_bound", "Number bounds must be finite");
        } else {
          result.minimum = check.value;
        }
        break;
      case NumberCheckTag.Lte:
        if (!Number.isFinite(check.value)) {
          pushJsonSchemaIssue(path, issues, "unsupported_number_bound", "Number bounds must be finite");
        } else {
          result.maximum = check.value;
        }
        break;
    }
  }
  if (issues.length !== before) {
    return undefined;
  }
  return result;
}

/**
 * @brief emit literal.
 */
export function emitLiteral(
  value: LiteralValue,
  path: PathSegment[],
  issues: JsonSchemaExportIssue[]
): JsonSchema | undefined {
  if (value === undefined) {
    pushJsonSchemaIssue(path, issues, "unsupported_undefined", "JSON Schema has no undefined literal");
    return undefined;
  }
  if (typeof value === "bigint") {
    pushJsonSchemaIssue(path, issues, "unsupported_bigint", "JSON Schema has no bigint literal");
    return undefined;
  }
  if (typeof value === "symbol") {
    pushJsonSchemaIssue(path, issues, "unsupported_symbol", "JSON Schema has no symbol literal");
    return undefined;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      pushJsonSchemaIssue(
        path,
        issues,
        "unsupported_number_literal",
        "JSON Schema number literals must be finite and cannot preserve negative zero"
      );
      return undefined;
    }
  }
  return { const: value };
}
