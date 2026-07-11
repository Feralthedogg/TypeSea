/**
 * @file zod-compat.ts
 * @brief Small Zod-compatible marker exports.
 * @details These values support package-alias migrations and ecosystem probes
 * without pulling Zod into the runtime dependency graph.
 */

/** @brief Runtime symbol used by Zod-compatible nominal brands. */
export const $brand: unique symbol = Symbol("zod_brand");
/** @brief Runtime symbol used by Zod-compatible input type slots. */
export const $input: unique symbol = Symbol("ZodInput");
/** @brief Runtime symbol used by Zod-compatible output type slots. */
export const $output: unique symbol = Symbol("ZodOutput");

/** @brief Precision constants consumed by Zod-compatible time helpers. */
export const TimePrecision = Object.freeze({
    Any: null,
    Minute: -1,
    Second: 0,
    Millisecond: 3,
    Microsecond: 6
});

/** @brief Immutable placeholder for Zod's broad utility namespace. */
export const util = Object.freeze({});
