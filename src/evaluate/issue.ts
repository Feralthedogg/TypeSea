/**
 * @file issue.ts
 * @brief Runtime validation issue construction.
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
 */

import type { Issue, PathSegment } from "../issue/index.js";
import { makeIssue } from "../issue/index.js";

/**
 * @brief Append one runtime validation issue.
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
 * @param path Mutable path stack at the failing validation point.
 * @param issues Output issue buffer.
 * @param code Stable issue code.
 * @param expected Human-readable expected value, when available.
 * @param actual Human-readable actual value, when available.
 * @post Stores a copied path so later stack mutation cannot alter the issue.
 */
export function pushIssue(
    path: PathSegment[],
    issues: Issue[],
    code: Issue["code"],
    expected: string | undefined,
    actual: string | undefined,
    message?: string
): void {
    /*
     * Diagnostic walkers reuse one path stack for speed. Copying here gives each
     * issue immutable path semantics without forcing callers to allocate eagerly.
     */
    issues.push(makeIssue(path.slice(), code, expected, actual, message));
}

/**
 * @brief Append one runtime validation issue at a precomputed path.
 * @param path Final path for the failing validation point.
 * @param issues Output issue buffer.
 * @param code Stable issue code.
 * @param expected Human-readable expected value, when available.
 * @param actual Human-readable actual value, when available.
 * @param message Pre-rendered message supplied by a callback, when available.
 * @post Stores a copied path so callers can mutate their temporary arrays.
 */
export function pushIssueAtPath(
    path: readonly PathSegment[],
    issues: Issue[],
    code: Issue["code"],
    expected: string | undefined,
    actual: string | undefined,
    message: string | undefined
): void {
    issues.push(makeIssue(path.slice(), code, expected, actual, message));
}
