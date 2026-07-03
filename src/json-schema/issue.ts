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
 * @brief push json schema issue function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param code Borrowed input slot named code; validation or normalization happens before stored state changes.
 * @param message Borrowed input slot named message; validation or normalization happens before stored state changes.
 * @post No result value is produced; effects are limited to the documented receiver or output buffer.
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
