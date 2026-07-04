/**
 * @file predicate.ts
 * @brief Compatibility entry points for IR-backed predicate execution.
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
 */

import {
    executeSchemaPredicate,
    executeSchemaPredicateWithState
} from "../plan/index.js";
import type { Schema } from "../schema/index.js";
import type { ValidationState } from "./state.js";

/**
 * @brief Execute a schema predicate through its optimized validation plan.
 * @details This is the compatibility entry point used by guards that need a
 * boolean answer without diagnostics.
 * @param schema Schema used to validate the input.
 * @param value Candidate runtime value.
 * @returns True when the input satisfies the schema.
 */
export function isSchema(schema: Schema, value: unknown): boolean {
    return executeSchemaPredicate(schema, value);
}

/**
 * @brief Execute a schema predicate with caller-owned recursion state.
 * @details Shares recursion and cycle tracking with nested IR nodes.
 * @param schema Schema used to validate the input.
 * @param value Candidate runtime value.
 * @param state Validation state from an outer diagnostic or predicate run.
 * @returns True when the input satisfies the schema under the shared state.
 */
export function isSchemaWithState(
    schema: Schema,
    value: unknown,
    state: ValidationState
): boolean {
    return executeSchemaPredicateWithState(schema, value, state);
}

/**
 * @brief Execute union probing with shared recursion state.
 * @details Preserves the historical helper used by diagnostic generation while
 * routing each union option through IR-backed validation.
 * @param options Union option schemas.
 * @param value Candidate runtime value.
 * @param state Validation state shared across option probes.
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
            /*
             * Union diagnostics only need to know whether at least one branch
             * accepts. Detailed branch diagnostics would allocate on a hot helper.
             */
            return true;
        }
    }
    return false;
}
