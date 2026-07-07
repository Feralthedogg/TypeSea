/**
 * @file record-key.ts
 * @brief Runtime record-key coercion helpers.
 * @details JavaScript object keys are strings at runtime. Zod-style numeric
 * record keys interpret those strings as finite JavaScript numbers before the
 * key schema is evaluated.
 */

import { SchemaTag } from "../kind/index.js";
import type { Schema } from "./types.js";

/**
 * @brief Prepare an enumerable object key for a record key schema.
 * @param schema Key schema supplied to record-like builders.
 * @param key Enumerable own string key read from the candidate record.
 * @returns The original key, or a finite number for numeric key schemas.
 */
export function recordKeyInput(schema: Schema | undefined, key: string): unknown {
    if (schema !== undefined && schemaReadsNumericRecordKey(schema)) {
        return finiteRecordKeyNumber(key);
    }
    return key;
}

/**
 * @brief Detect key schemas that should receive numeric key input.
 * @param schema Candidate key schema.
 * @returns True when the key should be parsed as a number before validation.
 */
function schemaReadsNumericRecordKey(schema: Schema): boolean {
    switch (schema.tag) {
        case SchemaTag.Number:
            return true;
        case SchemaTag.Brand:
        case SchemaTag.Metadata:
        case SchemaTag.Message:
        case SchemaTag.Readonly:
        case SchemaTag.Refine:
            return schemaReadsNumericRecordKey(schema.inner);
        default:
            return false;
    }
}

/**
 * @brief Convert a strict numeric object key into a finite number.
 * @param key Enumerable object key.
 * @returns Finite number when the key is numeric, otherwise the original key.
 */
function finiteRecordKeyNumber(key: string): string | number {
    if (key.length === 0 || key.trim() !== key) {
        return key;
    }
    const value = Number(key);
    return Number.isFinite(value) ? value : key;
}
