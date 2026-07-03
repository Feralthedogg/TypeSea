/**
 * @file state.ts
 * @brief Recursive validation state for cyclic input graphs.
 */

import type { Schema } from "../schema/index.js";

/**
 * @brief validation enter result type alias contract.
 * @details Defines the control-flow result of entering a schema/value pair.
 * @invariant Only `entered` requires a matching leave operation.
 */
export type ValidationEnterResult =
  | "entered"
  | "cycle"
  | "budget";

/**
 * @brief default max validation depth constant contract.
 * @details Module-scope storage with stable identity, created once and reused by callers.
 * @invariant The value stays below the V8 stack depth that recursive lazy schemas can exhaust.
 */
export const DEFAULT_MAX_VALIDATION_DEPTH = 1024;

/**
 * @brief validation state interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface ValidationState {

  /**
   * @brief active field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly active: WeakMap<object, WeakSet<Schema>>;

  /**
   * @brief resolving field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly resolving: WeakSet<object>;

  /**
   * @brief depth field contract.
   * @details Counts active recursive validator frames owned by this state object.
   * @invariant The value is incremented only after budget admission and decremented by `leaveValidation`.
   */
  depth: number;

  /**
   * @brief max depth field contract.
   * @details Hard cap for recursive validator frames.
   * @invariant Entering past this limit returns `budget` instead of recursing.
   */
  readonly maxDepth: number;
}

/**
 * @brief make validation state function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @returns Result for make validation state; ownership of newly created aggregates is transferred to the caller.
 */
export function makeValidationState(): ValidationState {
  return {
    active: new WeakMap<object, WeakSet<Schema>>(),
    resolving: new WeakSet<object>(),
    depth: 0,
    maxDepth: DEFAULT_MAX_VALIDATION_DEPTH
  };
}

/**
 * @brief enter validation function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param state Borrowed input slot named state; validation or normalization happens before stored state changes.
 * @returns Result for enter validation; ownership of newly created aggregates is transferred to the caller.
 */
export function enterValidation(
  schema: Schema,
  value: unknown,
  state: ValidationState
): ValidationEnterResult {
  const cached = isReferenceValue(value) ? state.active.get(value) : undefined;
  if (cached?.has(schema) === true) {
    return "cycle";
  }
  if (state.depth >= state.maxDepth) {
    return "budget";
  }
  state.depth += 1;
  if (!isReferenceValue(value)) {
    return "entered";
  }
  if (cached !== undefined) {
    cached.add(schema);
    return "entered";
  }
  const schemas = new WeakSet<Schema>();
  schemas.add(schema);
  state.active.set(value, schemas);
  return "entered";
}

/**
 * @brief leave validation function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param state Borrowed input slot named state; validation or normalization happens before stored state changes.
 * @post No result value is produced; effects are limited to the documented receiver or output buffer.
 */
export function leaveValidation(
  schema: Schema,
  value: unknown,
  state: ValidationState
): void {
  if (!isReferenceValue(value)) {
    state.depth -= 1;
    return;
  }
  const cached = state.active.get(value);
  if (cached !== undefined) {
    cached.delete(schema);
  }
  state.depth -= 1;
}

/**
 * @brief is reference value function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is reference value; ownership of newly created aggregates is transferred to the caller.
 */
function isReferenceValue(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}
