/**
 * @file issue.ts
 * @brief Runtime validation issue construction.
 */

import type { Issue, PathSegment } from "../issue/index.js";
import { makeIssue } from "../issue/index.js";

/**
 * @brief push issue.
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
