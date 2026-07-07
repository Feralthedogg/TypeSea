/**
 * @file options.ts
 * @brief SeaFlow option normalization.
 */

import type {
    SeaFlowConfig,
    SeaFlowIntensity,
    SeaFlowOptions
} from "./types.js";

const defaultIntensity: SeaFlowIntensity = "high";

/**
 * @brief Convert public SeaFlow options into a closed runtime configuration.
 * @param options Optional user-facing controls for breadth and quotas.
 * @returns Fully populated configuration consumed by all solver modules.
 * @details Invalid numeric limits fall back instead of throwing because fuzzing
 * is normally used inside test setup. The important invariant is bounded output,
 * not rejecting a mis-sized option object at the boundary.
 */
export function normalizeSeaFlowOptions(
    options?: SeaFlowOptions
): SeaFlowConfig {
    const intensity = normalizeIntensity(options?.intensity);
    return {
        intensity,
        maxDepth: clampPositiveInteger(options?.maxDepth, 4),
        maxYields: clampPositiveInteger(options?.maxYields, 256),
        includeInvalid: options?.includeInvalid !== false,
        includeSecurity: options?.includeSecurity !== false
    };
}

/**
 * @brief Normalize an intensity tag while preserving future extension safety.
 * @param value Candidate public intensity value.
 * @returns A supported intensity tag.
 */
function normalizeIntensity(
    value: SeaFlowIntensity | undefined
): SeaFlowIntensity {
    if (value === "low" || value === "high" || value === "extreme") {
        return value;
    }
    return defaultIntensity;
}

/**
 * @brief Clamp caller-supplied quotas to a finite positive range.
 * @param value Candidate numeric limit.
 * @param fallback Default used for absent or unusable values.
 * @returns Integer in the inclusive range `[1, 100000]`.
 * @details The high cap prevents accidental million-case generators while still
 * leaving enough headroom for broad integration fuzzing.
 */
function clampPositiveInteger(
    value: number | undefined,
    fallback: number
): number {
    if (value === undefined || !Number.isFinite(value) || value < 1) {
        return fallback;
    }
    return Math.max(1, Math.min(100_000, Math.trunc(value)));
}
