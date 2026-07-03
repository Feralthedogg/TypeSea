/**
 * @file compile/issue.ts
 * @brief Diagnostic issue source snippets.
 */

import { UUID_PATTERN } from "../schema/index.js";
import { pushRegex, stringRef } from "./context.js";
import { stringLiteral } from "./names.js";
import type { EmitContext } from "./types.js";

/**
 * @brief emit pattern issue.
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
 * @brief emit issue.
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
 * @brief emit issue expr.
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
