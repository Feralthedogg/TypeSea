/**
 * @file control-path.ts
 * @brief Stable predicate-control paths shared by planning and source emission.
 */

/** @brief Root path assigned to one graph-region invocation. */
export const ROOT_CONTROL_PATH = "r";

/** @brief Structural control segment used below boolean folds. */
export type ControlPathSegment = "a" | "o" | "n";

/**
 * @brief Append one structural boolean-control segment.
 * @param parent Existing region-local path.
 * @param segment And, or, or not discriminator.
 * @param index Child index for ordered boolean folds.
 * @returns Stable path shared by the adapter and instrumented emitter.
 */
export function appendControlPath(
    parent: string,
    segment: ControlPathSegment,
    index?: number
): string {
    return index === undefined
        ? `${parent}/${segment}`
        : `${parent}/${segment}${String(index)}`;
}
