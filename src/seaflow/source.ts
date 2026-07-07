/**
 * @file source.ts
 * @brief SeaFlow input admission.
 */

import { readGuardSchema } from "../internal/index.js";
import {
    freezeSchema,
    isSchemaValue,
    type Schema
} from "../schema/index.js";
import type { SeaFlowSource } from "./types.js";

/**
 * @brief Admit a guard-like value or direct schema into SeaFlow.
 * @param source Guard-like object with a schema slot, or a schema record.
 * @returns Frozen schema tree safe for solver traversal.
 * @details The same descriptor-based reader used by builders is reused here so
 * a forged prototype accessor cannot supply schema data to the fuzzer.
 */
export function readSeaFlowSchema(source: SeaFlowSource): Schema {
    if (isSchemaValue(source)) {
        return freezeSchema(source);
    }
    return readGuardSchema(source, "SeaFlow source");
}
