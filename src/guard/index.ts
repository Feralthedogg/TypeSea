/**
 * @file index.ts
 * @brief Public guard module aggregation.
 * @details This barrel keeps public import paths stable while implementation files remain
 * split by responsibility.
 */

export { BaseGuard } from "./base.js";
export { TypeSeaAssertionError } from "./error.js";
export { NumberGuard } from "./number.js";
export { StringGuard } from "./string.js";
export type {
    Brand,
    Guard,
    GuardPresence,
    GuardValue,
    Infer,
    Presence,
    RuntimeValue
} from "./types.js";
