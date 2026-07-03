/**
 * @file index.ts
 * @brief Public guard module aggregation.
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
