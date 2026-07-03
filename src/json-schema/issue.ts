/**
 * @file issue.ts
 * @brief JSON Schema export issue construction.
 */

import type { PathSegment } from "../issue/index.js";
import type {
  JsonSchemaExportCode,
  JsonSchemaExportIssue
} from "./types.js";

/**
 * @brief push json schema issue.
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
