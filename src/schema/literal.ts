/**
 * @file schema/literal.ts
 * @brief Literal-value boundary checks.
 */

import type { LiteralValue } from "./types.js";

/**
 * @brief is literal value.
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
