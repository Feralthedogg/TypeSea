/**
 * @file emit-context.ts
 * @brief JSON Schema emitter traversal context helpers.
 * @details Reference emission needs the JSON Pointer location of the schema
 * fragment currently being produced, so recursive lazy schemas can point back
 * to the active fragment without guessing from TypeSea issue paths.
 */

import type { JsonSchemaEmitContext } from "./emit-types.js";

/**
 * @brief Derive a child context at one JSON Schema object member.
 */
export function jsonSchemaMemberContext(
    context: JsonSchemaEmitContext,
    key: string
): JsonSchemaEmitContext {
    return {
        ...context,
        location: context.location + "/" + escapeJsonPointerToken(key)
    };
}

/**
 * @brief Derive a child context at one JSON Schema array index.
 */
export function jsonSchemaIndexContext(
    context: JsonSchemaEmitContext,
    index: number
): JsonSchemaEmitContext {
    return {
        ...context,
        location: context.location + "/" + String(index)
    };
}

/**
 * @brief Escape one JSON Pointer token.
 */
export function escapeJsonPointerToken(value: string): string {
    return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
