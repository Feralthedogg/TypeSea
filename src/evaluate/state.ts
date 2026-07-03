/**
 * @file state.ts
 * @brief Recursive validation state for cyclic input graphs.
 */

import type { Schema } from "../schema/index.js";

/**
 * @brief validation enter result.
 * @details Defines the control-flow result of entering a schema/value pair.
 * @invariant Only `entered` requires a matching leave operation.
 */
export type ValidationEnterResult =
  | "entered"
  | "cycle"
  | "budget";

/**
 * @brief default max validation depth.
 * @invariant The value stays below the V8 stack depth that recursive lazy schemas can exhaust.
 */
export const DEFAULT_MAX_VALIDATION_DEPTH = 1024;

/**
 * @brief validation state.
 */
export interface ValidationState {
  readonly active: WeakMap<object, WeakSet<Schema>>;
  readonly resolving: WeakSet<object>;

  /**
   * @brief depth.
   * @details Counts active recursive validator frames owned by this state object.
   * @invariant The value is incremented only after budget admission and decremented by `leaveValidation`.
   */
  depth: number;

  /**
   * @brief max depth.
   * @details Hard cap for recursive validator frames.
   * @invariant Entering past this limit returns `budget` instead of recursing.
   */
  readonly maxDepth: number;
}

/**
 * @brief make validation state.
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
 * @brief enter validation.
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
 * @brief leave validation.
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
 * @brief is reference value.
 */
function isReferenceValue(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}
