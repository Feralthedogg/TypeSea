/**
 * @file state.ts
 * @brief Recursive validation state for cyclic input graphs.
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
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
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
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
 * @details Bundles recursion guards, lazy-resolution guards, and reusable graph
 * frames so interpreter and IR execution observe the same limits.
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
 * @brief Allocate recursion and graph-frame state for one validation run.
 * @returns Fresh validation state for one top-level validation operation.
 * @details State is allocated per call so cycle tracking cannot leak between
 * unrelated inputs.
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
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
 * @param schema Schema being entered.
 * @param value Candidate runtime value.
 * @param state Shared validation state.
 * @returns Enter result describing cycle, budget, or admitted recursion.
 * @post `state.depth` is incremented only for the entered result.
 */
export function enterValidation(
    schema: Schema,
    value: unknown,
    state: ValidationState
): ValidationEnterResult {
    const cached = isReferenceValue(value) ? state.active.get(value) : undefined;
    if (cached?.has(schema) === true) {
        /*
         * The same schema/value pair is already active. Returning cycle prevents
         * infinite recursion on cyclic object graphs while preserving success for
         * the already-open branch.
         */
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
        /*
         * WeakSet membership is per object identity. Adding the schema marks this
         * exact pair as active until leaveValidation removes it.
         */
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
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
 * @param schema Schema leaving validation.
 * @param value Candidate runtime value.
 * @param state Shared validation state.
 * @post Reverses the depth and active-pair effects of `enterValidation`.
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
 * @brief Test whether a value can participate in object graph cycles.
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
 * @param value Candidate runtime value.
 * @returns True for objects and functions that can participate in cycles.
 */
function isReferenceValue(value: unknown): value is object {
    return (typeof value === "object" && value !== null) || typeof value === "function";
}
