/**
 * @file registry.ts
 * @brief Constructed guard receiver registry.
 */

import type { BaseGuard } from "./base.js";
import type { Presence } from "./types.js";
import { isRecord } from "./props.js";

/**
 * @brief constructed guards constant contract.
 * @details Module-scope storage with stable identity, created once and reused by callers.
 * @invariant Initialization happens during module load and later code treats the binding as fixed.
 */
const constructedGuards = new WeakSet<object>();

/**
 * @brief register constructed guard function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @post No result value is produced; effects are limited to the documented receiver or output buffer.
 */
export function registerConstructedGuard(value: object): void {
  constructedGuards.add(value);
}

/**
 * @brief is constructed guard function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is constructed guard; ownership of newly created aggregates is transferred to the caller.
 */
export function isConstructedGuard(
  value: unknown
): value is BaseGuard<unknown, Presence> {
  return isRecord(value) && constructedGuards.has(value);
}
