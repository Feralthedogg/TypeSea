/**
 * @file compile-runtime.ts
 * @brief Runtime support passed into generated validator factories.
 *
 * @section side_tables Side-table ABI
 * Generated validators receive literals, regexps, keysets, strings, and
 * dynamic schema fallbacks as indexed tables. The emitted source contains only
 * numeric table slots and compact helper names.
 */

import { checkSchema, isSchema } from "../evaluate/index.js";
import type { Issue, PathSegment } from "../issue/index.js";
import type { LiteralValue, Schema } from "../schema/index.js";

/**
 * @brief boolean predicate.
 */
export type BooleanPredicate = (value: unknown) => boolean;

/**
 * @brief issue collector root.
 */
export type IssueCollectorRoot = (value: unknown) => readonly Issue[];

/**
 * @brief dynamic check.
 */
export type DynamicCheck = (schemaIndex: number, value: unknown) => boolean;

/**
 * @brief dynamic issue check.
 */
export type DynamicIssueCheck = (
  schemaIndex: number,
  value: unknown,
  path: readonly PathSegment[],
  issues: Issue[]
) => void;

/**
 * @brief strict keys check.
 */
export type StrictKeysCheck = (
  value: unknown,
  keys: readonly string[]
) => boolean;

/**
 * @brief runtime bundle.
 */
export interface RuntimeBundle {
  readonly is: BooleanPredicate;
  readonly check: IssueCollectorRoot;
}

/**
 * @brief is factory.
 */
export type IsFactory = (
  literals: readonly LiteralValue[],
  regexps: readonly RegExp[],
  keysets: readonly (readonly string[])[],
  strings: readonly string[],
  dynamicCheck: DynamicCheck,
  dynamicIssueCheck: DynamicIssueCheck,
  strictKeys: StrictKeysCheck
) => RuntimeBundle;

/**
 * @brief make dynamic check.
 */
export function makeDynamicCheck(schemas: readonly Schema[]): DynamicCheck {
  return (schemaIndex: number, value: unknown): boolean => {
    const schema = schemas[schemaIndex];
    return schema !== undefined && isSchema(schema, value);
  };
}

/**
 * @brief make dynamic issue check.
 */
export function makeDynamicIssueCheck(
  schemas: readonly Schema[]
): DynamicIssueCheck {
  return (
    schemaIndex: number,
    value: unknown,
    path: readonly PathSegment[],
    issues: Issue[]
  ): void => {
    const schema = schemas[schemaIndex];
    if (schema === undefined) {
      return;
    }
    const result = checkSchema<unknown>(schema, value);
    if (result.ok) {
      return;
    }
    const nested = result.error;
    for (let index = 0; index < nested.length; index += 1) {
      const issue = nested[index];
      if (issue !== undefined) {
        issues.push({
          path: path.concat(issue.path),
          code: issue.code,
          expected: issue.expected,
          actual: issue.actual,
          message: issue.message
        });
      }
    }
  };
}

/**
 * @brief strict keys.
 */
export function strictKeys(
  value: unknown,
  keys: readonly string[]
): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const present = Reflect.ownKeys(value);
  for (let index = 0; index < present.length; index += 1) {
    const key = present[index];
    if (typeof key !== "string" || !keys.includes(key)) {
      return false;
    }
  }
  return true;
}
