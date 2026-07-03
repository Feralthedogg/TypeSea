/**
 * @file registry.ts
 * @brief Constructed guard receiver registry.
 */

import type { BaseGuard } from "./base.js";
import type { Presence } from "./types.js";
import { isRecord } from "./props.js";

/**
 * @brief constructed guards.
 */
const constructedGuards = new WeakSet<object>();

/**
 * @brief register constructed guard.
 */
export function registerConstructedGuard(value: object): void {
  constructedGuards.add(value);
}

/**
 * @brief is constructed guard.
 */
export function isConstructedGuard(
  value: unknown
): value is BaseGuard<unknown, Presence> {
  return isRecord(value) && constructedGuards.has(value);
}
