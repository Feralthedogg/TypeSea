/**
 * @file compile/check-scalar.ts
 * @brief Scalar diagnostic validator snippets.
 */

import {
  NumberCheckTag,
  SchemaTag,
  StringCheckTag
} from "../kind/index.js";
import {
  UUID_PATTERN,
  type LiteralValue,
  type Schema
} from "../schema/index.js";
import { pushLiteral } from "./context.js";
import {
  emitIssue,
  emitIssueExpr,
  emitPatternIssue
} from "./issue.js";
import { stringLiteral } from "./names.js";
import type { EmitContext } from "./types.js";

/**
 * @brief emit string check function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param context Borrowed input slot named context; validation or normalization happens before stored state changes.
 * @returns Result for emit string check; ownership of newly created aggregates is transferred to the caller.
 */
export function emitStringCheck(
  schema: Extract<Schema, { readonly tag: typeof SchemaTag.String }>,
  value: string,
  path: string,
  issues: string,
  context: EmitContext
): string {
  const parts: string[] = [
    `if(typeof ${value}!=="string"){${emitIssue(
      issues,
      path,
      "expected_string",
      "string",
      `a(${value})`
    )}return;}`
  ];
  const checks = schema.checks;
  for (let index = 0; index < checks.length; index += 1) {
    const check = checks[index];
    if (check === undefined) {
      continue;
    }
    switch (check.tag) {
      case StringCheckTag.Min:
        parts.push(`if(${value}.length<${String(check.value)}){${emitIssue(
          issues,
          path,
          "expected_min_length",
          `length >= ${String(check.value)}`,
          `"length "+String(${value}.length)`
        )}}`);
        break;
      case StringCheckTag.Max:
        parts.push(`if(${value}.length>${String(check.value)}){${emitIssue(
          issues,
          path,
          "expected_max_length",
          `length <= ${String(check.value)}`,
          `"length "+String(${value}.length)`
        )}}`);
        break;
      case StringCheckTag.Regex:
        parts.push(emitPatternIssue(value, path, issues, check.regex, check.name, context));
        break;
      case StringCheckTag.Uuid:
        parts.push(emitPatternIssue(value, path, issues, UUID_PATTERN, "uuid", context));
        break;
    }
  }
  return parts.join("");
}

/**
 * @brief emit number check function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @returns Result for emit number check; ownership of newly created aggregates is transferred to the caller.
 */
export function emitNumberCheck(
  schema: Extract<Schema, { readonly tag: typeof SchemaTag.Number }>,
  value: string,
  path: string,
  issues: string
): string {
  const parts: string[] = [
    `if(typeof ${value}!=="number"||!Number.isFinite(${value})){${emitIssue(
      issues,
      path,
      "expected_number",
      "number",
      `a(${value})`
    )}return;}`
  ];
  const checks = schema.checks;
  for (let index = 0; index < checks.length; index += 1) {
    const check = checks[index];
    if (check === undefined) {
      continue;
    }
    switch (check.tag) {
      case NumberCheckTag.Integer:
        parts.push(`if(!Number.isInteger(${value})){${emitIssueExpr(
          issues,
          path,
          "expected_integer",
          stringLiteral("integer"),
          stringLiteral("number")
        )}}`);
        break;
      case NumberCheckTag.Gte:
        parts.push(`if(${value}<${String(check.value)}){${emitIssue(
          issues,
          path,
          "expected_gte",
          `>= ${String(check.value)}`,
          `String(${value})`
        )}}`);
        break;
      case NumberCheckTag.Lte:
        parts.push(`if(${value}>${String(check.value)}){${emitIssue(
          issues,
          path,
          "expected_lte",
          `<= ${String(check.value)}`,
          `String(${value})`
        )}}`);
        break;
    }
  }
  return parts.join("");
}

/**
 * @brief emit literal check function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param checked Borrowed input slot named checked; validation or normalization happens before stored state changes.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param context Borrowed input slot named context; validation or normalization happens before stored state changes.
 * @returns Result for emit literal check; ownership of newly created aggregates is transferred to the caller.
 */
export function emitLiteralCheck(
  value: LiteralValue,
  checked: string,
  path: string,
  issues: string,
  context: EmitContext
): string {
  const index = pushLiteral(context, value);
  return `if(!Object.is(${checked},l[${String(index)}])){${emitIssueExpr(
    issues,
    path,
    "expected_literal",
    `le(l[${String(index)}])`,
    `a(${checked})`
  )}}`;
}
