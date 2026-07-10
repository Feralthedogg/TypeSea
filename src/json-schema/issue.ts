/**
 * @file issue.ts
 * @brief JSON Schema export issue construction.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
 */

import type { PathSegment } from "../issue/index.js";
import type {
    JsonSchema,
    JsonSchemaExportCode,
    JsonSchemaExportIssue,
    JsonSchemaUnrepresentableMode
} from "./types.js";
import { JSON_SCHEMA_UNREPRESENTABLE_OPEN } from "./read.js";

/**
 * @brief Append a JSON Schema export issue with a defensive path copy.
 * @details Export traversal mutates one shared path stack, so diagnostics must
 * own their path snapshot before control returns to the caller.
 */
export function pushJsonSchemaIssue(
    path: readonly PathSegment[],
    issues: JsonSchemaExportIssue[],
    code: JsonSchemaExportCode,
    message: string
): void {
    issues.push({
        path: path.slice(),
        code,
        message
    });
}

/**
 * @brief Return an open schema when the caller selected permissive export.
 */
export function emitUnrepresentableJsonSchema(
    path: readonly PathSegment[],
    issues: JsonSchemaExportIssue[],
    mode: JsonSchemaUnrepresentableMode,
    code: JsonSchemaExportCode,
    message: string
): JsonSchema | undefined {
    if (mode === JSON_SCHEMA_UNREPRESENTABLE_OPEN) {
        return {};
    }
    pushJsonSchemaIssue(path, issues, code, message);
    return undefined;
}
