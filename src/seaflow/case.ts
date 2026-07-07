/**
 * @file case.ts
 * @brief SeaFlow case construction helpers.
 */

import type { PathSegment } from "../issue/index.js";
import type {
    SeaFlowCase,
    SeaFlowCaseKind,
    SeaFlowContext
} from "./types.js";

/**
 * @brief Freeze one generated case at the module boundary.
 * @param context Current traversal state.
 * @param value Candidate payload.
 * @param valid Expected boolean verdict.
 * @param kind Broad case classification.
 * @param reason Stable reason code for tests and reports.
 * @returns Immutable case descriptor.
 * @details Fuzzer output may be reused across adapters and route tests. Freezing
 * the descriptor protects the verdict metadata while leaving the payload itself
 * unmodified for validator realism.
 */
export function makeSeaFlowCase(
    context: SeaFlowContext,
    value: unknown,
    valid: boolean,
    kind: SeaFlowCaseKind,
    reason: string
): SeaFlowCase {
    return Object.freeze({
        value,
        valid,
        kind,
        reason,
        path: context.path
    });
}

/**
 * @brief Descend into a named child schema and extend the diagnostic path.
 * @param context Parent traversal state.
 * @param segment Object key or array index for the child.
 * @returns Child context with incremented depth and extended path.
 */
export function childContext(
    context: SeaFlowContext,
    segment: PathSegment
): SeaFlowContext {
    return {
        config: context.config,
        depth: context.depth + 1,
        path: [...context.path, segment]
    };
}

/**
 * @brief Descend through a wrapper that does not own a path segment.
 * @param context Parent traversal state.
 * @returns Child context with incremented depth and the same path.
 * @details Optional, nullable, metadata, and refinement wrappers still count
 * toward recursion depth even though they do not move through input structure.
 */
export function descendContext(context: SeaFlowContext): SeaFlowContext {
    return {
        config: context.config,
        depth: context.depth + 1,
        path: context.path
    };
}

/**
 * @brief Check whether non-minimal probes should be emitted.
 * @param context Current traversal state.
 * @returns True for `high` and `extreme` intensity.
 */
export function isHighOrExtreme(context: SeaFlowContext): boolean {
    return context.config.intensity === "high" ||
        context.config.intensity === "extreme";
}

/**
 * @brief Check whether rare edge probes should be emitted.
 * @param context Current traversal state.
 * @returns True only for `extreme` intensity.
 */
export function isExtreme(context: SeaFlowContext): boolean {
    return context.config.intensity === "extreme";
}
