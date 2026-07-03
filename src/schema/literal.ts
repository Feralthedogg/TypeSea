/**
 * @file schema/literal.ts
 * @brief Literal-value boundary checks.
 */

import type { LiteralValue } from "./types.js";

/**
 * @brief is literal value function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is literal value; ownership of newly created aggregates is transferred to the caller.
 */
export function isLiteralValue(value: unknown): value is LiteralValue {
  const valueType = typeof value;
  return (
    value === null ||
    valueType === "string" ||
    valueType === "number" ||
    valueType === "bigint" ||
    valueType === "boolean" ||
    valueType === "symbol" ||
    valueType === "undefined"
  );
}
