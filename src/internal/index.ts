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
 * @brief read guard schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @param label Borrowed input slot named label; validation or normalization happens before stored state changes.
 * @returns Result for read guard schema; ownership of newly created aggregates is transferred to the caller.
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
 * @brief is record function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is record; ownership of newly created aggregates is transferred to the caller.
 */
export function isRecord(
  value: unknown
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief is unknown array function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is unknown array; ownership of newly created aggregates is transferred to the caller.
 */
export function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/**
 * @brief includes string function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param values Borrowed input slot named values; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for includes string; ownership of newly created aggregates is transferred to the caller.
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
 * @brief is strict true function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is strict true; ownership of newly created aggregates is transferred to the caller.
 */
export function isStrictTrue(value: unknown): boolean {
  return value === true;
}

/**
 * @brief is guard value function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is guard value; ownership of newly created aggregates is transferred to the caller.
 */
export function isGuardValue(
  value: unknown
): value is Guard<unknown, Presence> {
  return isRecord(value) && isSchemaValue(value["schema"]);
}
