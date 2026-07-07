/**
 * @file namespace.ts
 * @brief Frozen SeaFlow namespace object.
 */

import {
    fuzz,
    fuzzCases
} from "./emit.js";

/**
 * @brief Namespace-style SeaFlow facade.
 * @details Root exports stay function-first for tree-shaking, while this frozen
 * object gives migration code one stable property bag for `SeaFlow.cases(...)`.
 */
export const SeaFlow = Object.freeze({
    fuzz,
    fuzzCases,
    cases: fuzzCases
});
