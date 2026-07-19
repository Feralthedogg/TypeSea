/**
 * @file serialize.ts
 * @brief Internal standalone-source serializers shared by AOT emitters.
 */

import type { LiteralValue } from "../schema/index.js";

/** @brief Serialize literal side-table entries into standalone source. */
export function serializeAotLiteralArray(values: readonly LiteralValue[]): string {
    const parts = new Array<string>(values.length);
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value !== undefined || Object.prototype.hasOwnProperty.call(values, index)) {
            parts[index] = serializeLiteral(value);
        }
    }
    return `[${parts.join(",")}]`;
}

/** @brief Serialize one literal without losing non-finite and sentinel values. */
function serializeLiteral(value: LiteralValue): string {
    switch (typeof value) {
        case "string":
            return JSON.stringify(value);
        case "number":
            if (Number.isNaN(value)) {
                return "Number.NaN";
            }
            if (Object.is(value, -0)) {
                return "-0";
            }
            if (value === Number.POSITIVE_INFINITY) {
                return "Number.POSITIVE_INFINITY";
            }
            if (value === Number.NEGATIVE_INFINITY) {
                return "Number.NEGATIVE_INFINITY";
            }
            return String(value);
        case "bigint":
            return `${String(value)}n`;
        case "boolean":
            return value ? "true" : "false";
        case "undefined":
            return "undefined";
        case "symbol":
            throw new TypeError("symbol literals must be rejected before AOT serialization");
        default:
            return "null";
    }
}

/** @brief Serialize RegExp side-table entries with source and flags intact. */
export function serializeAotRegExpArray(values: readonly RegExp[]): string {
    const parts = new Array<string>(values.length);
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value !== undefined) {
            parts[index] = `new RegExp(${JSON.stringify(value.source)},${JSON.stringify(value.flags)})`;
        }
    }
    return `[${parts.join(",")}]`;
}
