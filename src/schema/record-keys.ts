/**
 * @file record-keys.ts
 * @brief Closed record-key domain analysis.
 * @details Exhaustive record semantics are only sound when the key schema is a
 * finite set of string literals. Pattern, numeric, symbol, and broad string
 * domains keep present-key record behavior.
 */

import { SchemaTag } from "../kind/index.js";
import type { Schema } from "./types.js";

/**
 * @brief Extract the finite string-key domain of a record key schema.
 * @param schema Record key schema supplied by a public builder.
 * @returns Frozen required key list, or undefined when the key domain is open.
 */
export function closedStringRecordKeys(schema: Schema): readonly string[] | undefined {
    const keys: string[] = [];
    if (!appendClosedStringRecordKeys(schema, keys)) {
        return undefined;
    }
    return Object.freeze(keys);
}

/**
 * @brief Append closed string keys from one schema.
 * @param schema Candidate key schema.
 * @param keys Mutable destination preserving declaration order.
 * @returns True when the schema is a finite string-key domain.
 */
function appendClosedStringRecordKeys(schema: Schema, keys: string[]): boolean {
    switch (schema.tag) {
        case SchemaTag.Never:
            return true;
        case SchemaTag.Literal:
            return appendLiteralRecordKey(schema.value, keys);
        case SchemaTag.Union:
            return appendUnionRecordKeys(schema.options, keys);
        default:
            return false;
    }
}

/**
 * @brief Append one literal key.
 * @param value Literal payload from the key schema.
 * @param keys Mutable destination preserving declaration order.
 * @returns True when the literal is a string key.
 */
function appendLiteralRecordKey(value: unknown, keys: string[]): boolean {
    if (typeof value !== "string") {
        return false;
    }
    if (!keys.includes(value)) {
        keys.push(value);
    }
    return true;
}

/**
 * @brief Append every branch of a literal-union key schema.
 * @param options Normalized union options.
 * @param keys Mutable destination preserving declaration order.
 * @returns True when every option is a finite string-key schema.
 */
function appendUnionRecordKeys(options: readonly Schema[], keys: string[]): boolean {
    for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        if (option === undefined || !appendClosedStringRecordKeys(option, keys)) {
            return false;
        }
    }
    return true;
}
