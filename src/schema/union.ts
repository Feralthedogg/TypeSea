/**
 * @file union.ts
 * @brief Construction-time normalization for union schema nodes.
 * @details The helper only applies semantics-preserving rewrites that do not
 * depend on runtime branch profiling or generated-code shape.
 */

import { SchemaTag } from "../kind/index.js";
import type { Schema } from "./types.js";

/**
 * @brief Build the smallest schema that preserves union acceptance.
 * @details Nested unions are flattened, `never` options are removed, and an
 * `unknown` option absorbs the whole union. These rewrites are deliberately
 * conservative: they reduce IR noise without reordering branches or adding
 * hot-path dispatch heuristics.
 * @param options Source union options in public declaration order.
 * @returns Normalized schema preserving boolean acceptance.
 */
export function normalizeUnionSchema(options: readonly Schema[]): Schema {
    const normalized: Schema[] = [];
    for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        if (option !== undefined && appendUnionOption(normalized, option)) {
            return {
                tag: SchemaTag.Unknown
            };
        }
    }
    if (normalized.length === 0) {
        return {
            tag: SchemaTag.Never
        };
    }
    if (normalized.length === 1) {
        return normalized[0] ?? { tag: SchemaTag.Never };
    }
    return {
        tag: SchemaTag.Union,
        options: normalized
    };
}

/**
 * @brief Append one union option after local normalization.
 * @param normalized Mutable normalized option list.
 * @param option Source option schema.
 * @returns True when the caller should collapse the union to `unknown`.
 */
function appendUnionOption(normalized: Schema[], option: Schema): boolean {
    switch (option.tag) {
        case SchemaTag.Unknown:
            return true;
        case SchemaTag.Never:
            return false;
        case SchemaTag.Union:
            return appendUnionOptions(normalized, option.options);
        default:
            normalized.push(option);
            return false;
    }
}

/**
 * @brief Append every option from a nested union.
 * @param normalized Mutable normalized option list.
 * @param options Nested union options.
 * @returns True when a nested `unknown` absorbed the union.
 */
function appendUnionOptions(normalized: Schema[], options: readonly Schema[]): boolean {
    for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        if (option !== undefined && appendUnionOption(normalized, option)) {
            return true;
        }
    }
    return false;
}
