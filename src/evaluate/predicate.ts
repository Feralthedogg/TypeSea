/**
 * @file predicate.ts
 * @brief Compatibility entry points for IR-backed predicate execution.
 */

import {
  executeSchemaPredicate,
  executeSchemaPredicateWithState
} from "../plan/index.js";
import type { Schema } from "../schema/index.js";
import type { ValidationState } from "./state.js";

/**
 * @brief is schema.
 * @details Executes the schema through its optimized Sea-of-Nodes validation plan.
 * @returns True when the input satisfies the schema.
 */
export function isSchema(schema: Schema, value: unknown): boolean {
  return executeSchemaPredicate(schema, value);
}

/**
 * @brief is schema with state.
 * @details Shares recursion and cycle tracking with nested IR nodes.
 * @returns True when the input satisfies the schema under the borrowed state.
 */
export function isSchemaWithState(
  schema: Schema,
  value: unknown,
  state: ValidationState
): boolean {
  return executeSchemaPredicateWithState(schema, value, state);
}

/**
 * @brief is union schema.
 * @details Preserves the historical helper used by diagnostic generation while
 * routing each union option through IR-backed validation.
 * @returns True when at least one option accepts the value.
 */
export function isUnionSchema(
  options: readonly Schema[],
  value: unknown,
  state: ValidationState
): boolean {
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option !== undefined &&
      executeSchemaPredicateWithState(option, value, state)) {
      return true;
    }
  }
  return false;
}
