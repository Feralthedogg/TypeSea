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
export const DEFAULT_MAX_VALIDATION_DEPTH = 256;

/**
 * @brief graph evaluation frame.
 * @details Owns scratch slots for one active Sea-of-Nodes graph execution.
 * @invariant `seen[id] === epoch` means `values[id]` belongs to the current run.
 */
export interface GraphEvaluationFrame {
  values: unknown[];
  seen: Uint32Array;
  epoch: number;
}

/**
 * @brief validation state.
 */
export interface ValidationState {
  readonly active: WeakMap<object, WeakSet<Schema>>;
  readonly graphFrames: GraphEvaluationFrame[];
  readonly resolving: WeakSet<object>;

  /**
   * @brief depth.
   * @details Counts active recursive validator frames owned by this state object.
   * @invariant The value is incremented only after budget admission and decremented by `leaveValidation`.
   */
  depth: number;

  /**
   * @brief graph depth.
   * @details Counts active nested graph executions using `graphFrames` as a stack.
   * @invariant Incremented by IR execution before frame use and decremented after it.
   */
  graphDepth: number;

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
    graphFrames: [],
    resolving: new WeakSet<object>(),
    depth: 0,
    graphDepth: 0,
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
