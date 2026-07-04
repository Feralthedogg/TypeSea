/**
 * @file issue.ts
 * @brief JSON Schema export issue construction.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
 */

import type { PathSegment } from "../issue/index.js";
import type {
    JsonSchemaExportCode,
    JsonSchemaExportIssue
} from "./types.js";

/**
 * @brief Execute push json schema issue.
 * @details This helper keeps a local invariant explicit at the module boundary.
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
