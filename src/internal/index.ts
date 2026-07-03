/**
 * @file internal.ts
 * @brief Private helpers shared across TypeSea translation units.
 *
 * @invariant Values crossing a module boundary stay `unknown` until a local
 * guard proves the shape needed by that module.
 */

import type { Guard, Presence } from "../guard/index.js";
import { isSchemaValue, type Schema } from "../schema/index.js";

/**
 * @brief read guard schema.
 */
export function readGuardSchema(
  guard: unknown,
  label: string
): Schema {
  if (!isRecord(guard)) {
    throw new TypeError(`${label} must be a TypeSea guard`);
  }
  const schema = guard["schema"];
  if (!isSchemaValue(schema)) {
    throw new TypeError(`${label} must contain a valid TypeSea schema`);
  }
  return schema;
}

/**
 * @brief is record.
 */
export function isRecord(
  value: unknown
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief is unknown array.
 */
export function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/**
 * @brief includes string.
 */
export function includesString(
  values: readonly string[],
  value: string
): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === value) {
      return true;
    }
  }
  return false;
}

/**
 * @brief is strict true.
 */
export function isStrictTrue(value: unknown): boolean {
  return value === true;
}

/**
 * @brief is guard value.
 */
export function isGuardValue(
  value: unknown
): value is Guard<unknown, Presence> {
  return isRecord(value) && isSchemaValue(value["schema"]);
}
