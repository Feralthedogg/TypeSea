/**
 * @file types.ts
 * @brief Public SeaFlow fuzzer types.
 * @details SeaFlow is intentionally detached from validator hot paths. It reads
 * frozen schema records and emits bounded edge-case samples for tests, router
 * smoke checks, and hostile-input probes.
 */

import type { PathSegment } from "../issue/index.js";
import type { Schema } from "../schema/index.js";

/** @brief Preset controlling the breadth and hostility of generated cases. */
export type SeaFlowIntensity = "low" | "high" | "extreme";

/**
 * @brief Classification attached to one generated fuzzer value.
 * @details `security` is kept separate from ordinary invalid data so callers
 * can run structural fuzzing in unit tests and reserve hostile probes for
 * integration or route-level smoke tests.
 */
export type SeaFlowCaseKind = "valid" | "invalid" | "security";

/**
 * @brief User-tunable bounds for one SeaFlow run.
 * @details The fuzzer is deterministic and deliberately quota-bound. Recursive
 * lazy schemas and composite child generators must obey these limits so a test
 * runner can consume the iterator without a scheduler watchdog.
 */
export interface SeaFlowOptions {
    /** Payload breadth selector; `extreme` enables rare numeric and structural probes. */
    readonly intensity?: SeaFlowIntensity | undefined;

    /** Maximum lazy/composite descent depth before recursion emits a stop case. */
    readonly maxDepth?: number | undefined;

    /** Maximum number of yielded cases after filtering. */
    readonly maxYields?: number | undefined;

    /** Set to false when a caller wants only values expected to pass validation. */
    readonly includeInvalid?: boolean | undefined;

    /** Set to false when route tests should exclude hostile-key and injection probes. */
    readonly includeSecurity?: boolean | undefined;
}

/**
 * @brief Structured output from `fuzzCases()`.
 * @details The `valid` bit is reconciled against the executable schema. It is
 * stored beside the value so tests can assert
 * `guard.is(case.value) === case.valid` without rebuilding solver state.
 */
export interface SeaFlowCase {
    /** Candidate payload to feed into a guard, parser, adapter, or route. */
    readonly value: unknown;

    /** Expected boolean verdict for the generated value. */
    readonly valid: boolean;

    /** Broad bucket used by test harnesses for filtering. */
    readonly kind: SeaFlowCaseKind;

    /** Stable machine-readable reason such as `object.requiredKey`. */
    readonly reason: string;

    /** Schema-relative location that produced the case. */
    readonly path: readonly PathSegment[];
}

/**
 * @brief Minimal guard-like shape accepted by SeaFlow.
 * @details The concrete guard class is not required; input admission still
 * verifies that `schema` is an own data field carrying a valid frozen schema.
 */
export interface SeaFlowGuardSource {
    readonly schema: Schema;
}

/**
 * @brief Source accepted by `fuzz()` and `fuzzCases()`.
 * @details Direct schema input keeps build-time tooling free from constructing
 * guard objects solely to generate edge cases.
 */
export type SeaFlowSource = Schema | SeaFlowGuardSource;

/**
 * @brief Normalized, non-optional configuration used inside solvers.
 * @details Keeping this separate from `SeaFlowOptions` avoids repeated default
 * checks inside hot generator loops and makes quota decisions local and stable.
 */
export interface SeaFlowConfig {
    readonly intensity: SeaFlowIntensity;
    readonly maxDepth: number;
    readonly maxYields: number;
    readonly includeInvalid: boolean;
    readonly includeSecurity: boolean;
}

/**
 * @brief Per-node traversal state passed through all solvers.
 * @details `path` is diagnostic metadata. `depth` is a structural recursion
 * guard and must be advanced even when path does not change, such as wrapper
 * schemas.
 */
export interface SeaFlowContext {
    readonly config: SeaFlowConfig;
    readonly depth: number;
    readonly path: readonly PathSegment[];
}

/**
 * @brief Recursive generator callback shared by composite solvers.
 * @details Passing the callback explicitly keeps composite modules acyclic and
 * makes it clear when a solver delegates to the central quota-aware dispatcher.
 */
export type SeaFlowEmitter =
    (schema: Schema, context: SeaFlowContext) => IterableIterator<SeaFlowCase>;
