/**
 * @file check-scalar.ts
 * @brief Scalar diagnostic schema interpreters.
 */

import {
  NumberCheckTag,
  SchemaTag,
  StringCheckTag
} from "../kind/index.js";
import type { Issue, PathSegment } from "../issue/index.js";
import {
  UUID_PATTERN,
  type Schema
} from "../schema/index.js";
import { pushIssue } from "./issue.js";
import { actualType } from "./shared.js";

/**
 * @brief collect string issues.
 */
export function collectStringIssues(
  schema: Extract<Schema, { readonly tag: typeof SchemaTag.String }>,
  value: unknown,
  path: PathSegment[],
  issues: Issue[]
): void {
  if (typeof value !== "string") {
    pushIssue(path, issues, "expected_string", "string", actualType(value));
    return;
  }
  const checks = schema.checks;
  for (let index = 0; index < checks.length; index += 1) {
    const check = checks[index];
    if (check === undefined) {
      continue;
    }
    switch (check.tag) {
      case StringCheckTag.Min:
        if (value.length < check.value) {
          pushIssue(
            path,
            issues,
            "expected_min_length",
            `length >= ${String(check.value)}`,
            `length ${String(value.length)}`
          );
        }
        break;
      case StringCheckTag.Max:
        if (value.length > check.value) {
          pushIssue(
            path,
            issues,
            "expected_max_length",
            `length <= ${String(check.value)}`,
            `length ${String(value.length)}`
          );
        }
        break;
      case StringCheckTag.Regex:
        check.regex.lastIndex = 0;
        if (!check.regex.test(value)) {
          pushIssue(path, issues, "expected_pattern", check.name, "string");
        }
        break;
      case StringCheckTag.Uuid:
        UUID_PATTERN.lastIndex = 0;
        if (!UUID_PATTERN.test(value)) {
          pushIssue(path, issues, "expected_pattern", "uuid", "string");
        }
        break;
    }
  }
}

/**
 * @brief collect number issues.
 */
export function collectNumberIssues(
  schema: Extract<Schema, { readonly tag: typeof SchemaTag.Number }>,
  value: unknown,
  path: PathSegment[],
  issues: Issue[]
): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    pushIssue(path, issues, "expected_number", "number", actualType(value));
    return;
  }
  const checks = schema.checks;
  for (let index = 0; index < checks.length; index += 1) {
    const check = checks[index];
    if (check === undefined) {
      continue;
    }
    switch (check.tag) {
      case NumberCheckTag.Integer:
        if (!Number.isInteger(value)) {
          pushIssue(path, issues, "expected_integer", "integer", "number");
        }
        break;
      case NumberCheckTag.Gte:
        if (value < check.value) {
          pushIssue(
            path,
            issues,
            "expected_gte",
            `>= ${String(check.value)}`,
            String(value)
          );
        }
        break;
      case NumberCheckTag.Lte:
        if (value > check.value) {
          pushIssue(
            path,
            issues,
            "expected_lte",
            `<= ${String(check.value)}`,
            String(value)
          );
        }
        break;
    }
  }
}
