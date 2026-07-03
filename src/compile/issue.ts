/**
 * @file compile/issue.ts
 * @brief Diagnostic issue source snippets.
 */

import { UUID_PATTERN } from "../schema/index.js";
import { pushRegex, stringRef } from "./context.js";
import { stringLiteral } from "./names.js";
import type { EmitContext } from "./types.js";

/**
 * @brief emit pattern issue function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param regex Borrowed input slot named regex; validation or normalization happens before stored state changes.
 * @param name Borrowed input slot named name; validation or normalization happens before stored state changes.
 * @param context Borrowed input slot named context; validation or normalization happens before stored state changes.
 * @returns Result for emit pattern issue; ownership of newly created aggregates is transferred to the caller.
 */
export function emitPatternIssue(
  value: string,
  path: string,
  issues: string,
  regex: RegExp,
  name: string,
  context: EmitContext
): string {
  const source = regex === UUID_PATTERN ? UUID_PATTERN : regex;
  const index = pushRegex(context, source);
  const access = `r[${String(index)}]`;
  return `if(((${access}.lastIndex=0),!${access}.test(${value}))){${emitIssueExpr(
    issues,
    path,
    "expected_pattern",
    stringRef(context, name),
    stringLiteral("string")
  )}}`;
}

/**
 * @brief emit issue function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param code Borrowed input slot named code; validation or normalization happens before stored state changes.
 * @param expected Borrowed input slot named expected; validation or normalization happens before stored state changes.
 * @param actualExpression Borrowed input slot named actualExpression; validation or normalization happens before stored state changes.
 * @returns Result for emit issue; ownership of newly created aggregates is transferred to the caller.
 */
export function emitIssue(
  issues: string,
  path: string,
  code: string,
  expected: string,
  actualExpression: string
): string {
  return emitIssueExpr(
    issues,
    path,
    code,
    stringLiteral(expected),
    actualExpression
  );
}

/**
 * @brief emit issue expr function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param code Borrowed input slot named code; validation or normalization happens before stored state changes.
 * @param expectedExpression Borrowed input slot named expectedExpression; validation or normalization happens before stored state changes.
 * @param actualExpression Borrowed input slot named actualExpression; validation or normalization happens before stored state changes.
 * @returns Result for emit issue expr; ownership of newly created aggregates is transferred to the caller.
 */
export function emitIssueExpr(
  issues: string,
  path: string,
  code: string,
  expectedExpression: string,
  actualExpression: string
): string {
  return `q(${issues},${path},${stringLiteral(code)},${expectedExpression},${actualExpression});`;
}
