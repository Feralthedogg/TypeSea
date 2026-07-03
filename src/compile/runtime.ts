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
 * @brief boolean predicate type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type BooleanPredicate = (value: unknown) => boolean;

/**
 * @brief issue collector root type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type IssueCollectorRoot = (value: unknown) => readonly Issue[];

/**
 * @brief dynamic check type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type DynamicCheck = (schemaIndex: number, value: unknown) => boolean;

/**
 * @brief dynamic issue check type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type DynamicIssueCheck = (
  schemaIndex: number,
  value: unknown,
  path: readonly PathSegment[],
  issues: Issue[]
) => void;

/**
 * @brief strict keys check type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type StrictKeysCheck = (
  value: unknown,
  keys: readonly string[]
) => boolean;

/**
 * @brief runtime bundle interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface RuntimeBundle {

  /**
   * @brief is field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly is: BooleanPredicate;

  /**
   * @brief check field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly check: IssueCollectorRoot;
}

/**
 * @brief is factory type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
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
 * @brief make dynamic check function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schemas Borrowed input slot named schemas; validation or normalization happens before stored state changes.
 * @returns Result for make dynamic check; ownership of newly created aggregates is transferred to the caller.
 */
export function makeDynamicCheck(schemas: readonly Schema[]): DynamicCheck {
  return (schemaIndex: number, value: unknown): boolean => {
    const schema = schemas[schemaIndex];
    return schema !== undefined && isSchema(schema, value);
  };
}

/**
 * @brief make dynamic issue check function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schemas Borrowed input slot named schemas; validation or normalization happens before stored state changes.
 * @returns Result for make dynamic issue check; ownership of newly created aggregates is transferred to the caller.
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
 * @brief strict keys function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param keys Borrowed input slot named keys; validation or normalization happens before stored state changes.
 * @returns Result for strict keys; ownership of newly created aggregates is transferred to the caller.
 */
export function strictKeys(
  value: unknown,
  keys: readonly string[]
): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Readonly<Record<string, unknown>>;
  const present = Object.keys(record);
  for (let index = 0; index < present.length; index += 1) {
    const key = present[index];
    if (key === undefined || !keys.includes(key)) {
      return false;
    }
  }
  return true;
}
