/**
 * @file issue.ts
 * @brief Runtime validation issue construction.
 */

import type { Issue, PathSegment } from "../issue/index.js";
import { makeIssue } from "../issue/index.js";

/**
 * @brief push issue function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param code Borrowed input slot named code; validation or normalization happens before stored state changes.
 * @param expected Borrowed input slot named expected; validation or normalization happens before stored state changes.
 * @param actual Borrowed input slot named actual; validation or normalization happens before stored state changes.
 * @post No result value is produced; effects are limited to the documented receiver or output buffer.
 */
export function pushIssue(
  path: PathSegment[],
  issues: Issue[],
  code: Issue["code"],
  expected: string | undefined,
  actual: string | undefined
): void {
  issues.push(makeIssue(path.slice(), code, expected, actual, undefined));
}
