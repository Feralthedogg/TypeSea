/**
 * @file check-message.ts
 * @brief Static diagnostic messages for schema check builders.
 * @details Builder-level messages must stay plain data because schemas are
 * consumed by interpreters, generated validators, AOT emitters, and exporters.
 */

import type { CheckMessageInput } from "./types.js";

/**
 * @brief Normalize an optional builder message argument.
 * @param value Optional string shorthand or object with `error`/`message`.
 * @returns Static message string or undefined.
 */
export function readCheckMessage(
    value: CheckMessageInput | undefined
): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value === "string") {
        return value;
    }
    if (!isRecord(value)) {
        throw new TypeError("check message options must be a string or object");
    }
    const error = value["error"];
    const message = value["message"];
    const requiredError = value["required_error"];
    const invalidTypeError = value["invalid_type_error"];
    if (error !== undefined && typeof error !== "string") {
        throw new TypeError("check error option must be a string");
    }
    if (message !== undefined && typeof message !== "string") {
        throw new TypeError("check message option must be a string");
    }
    if (requiredError !== undefined && typeof requiredError !== "string") {
        throw new TypeError("check required_error option must be a string");
    }
    if (invalidTypeError !== undefined && typeof invalidTypeError !== "string") {
        throw new TypeError("check invalid_type_error option must be a string");
    }
    return error ?? message ?? requiredError ?? invalidTypeError;
}

/**
 * @brief Accept non-array objects before structured field reads.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
