/**
 * @file schema/literal.ts
 * @brief Literal-value boundary checks.
 */

import type { LiteralValue } from "./types.js";

/**
 * @brief Validate values that TypeSea can store as exact literals.
 * @param value Candidate literal payload.
 * @returns True for JavaScript primitive literal values plus null and undefined.
 * @details Objects are excluded because literal matching uses `Object.is`.
 * Keeping literals primitive preserves stable interpreter and codegen behavior.
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
