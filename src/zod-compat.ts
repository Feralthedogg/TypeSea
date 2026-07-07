/**
 * @file zod-compat.ts
 * @brief Small Zod-compatible marker exports.
 * @details These values support package-alias migrations and ecosystem probes
 * without pulling Zod into the runtime dependency graph.
 */

export const $brand: unique symbol = Symbol("zod_brand");
export const $input: unique symbol = Symbol("ZodInput");
export const $output: unique symbol = Symbol("ZodOutput");

export const TimePrecision = Object.freeze({
    Any: null,
    Minute: -1,
    Second: 0,
    Millisecond: 3,
    Microsecond: 6
});

export const util = Object.freeze({});
