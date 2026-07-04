/**
 * @file check-scalar.ts
 * @brief Scalar diagnostic schema interpreters.
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
 */

import {
    NumberCheckTag,
    SchemaTag,
    StringCheckTag
} from "../kind/index.js";
import type { Issue, PathSegment } from "../issue/index.js";
import {
    UUID_PATTERN,
    type Schema
} from "../schema/index.js";
import { pushIssue } from "./issue.js";
import { actualType } from "./shared.js";

/**
 * @brief collect string issues.
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
 * @param schema String schema with scalar checks.
 * @param value Candidate runtime value.
 * @param path Current diagnostic path.
 * @param issues Output issue buffer.
 * @post Pattern checks reset lastIndex before testing.
 */
export function collectStringIssues(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.String }>,
    value: unknown,
    path: PathSegment[],
    issues: Issue[]
): void {
    if (typeof value !== "string") {
        pushIssue(path, issues, "expected_string", "string", actualType(value));
        return;
    }
    const checks = schema.checks;
    /*
     * Length and pattern checks only run after the type guard. That keeps
     * diagnostics deterministic and avoids property reads on non-string values.
     */
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case StringCheckTag.Min:
                if (value.length < check.value) {
                    pushIssue(
                        path,
                        issues,
                        "expected_min_length",
                        `length >= ${String(check.value)}`,
                        `length ${String(value.length)}`
                    );
                }
                break;
            case StringCheckTag.Max:
                if (value.length > check.value) {
                    pushIssue(
                        path,
                        issues,
                        "expected_max_length",
                        `length <= ${String(check.value)}`,
                        `length ${String(value.length)}`
                    );
                }
                break;
            case StringCheckTag.Regex:
                /*
                 * User regexps may be global or sticky. Resetting lastIndex makes
                 * repeated validation calls independent from prior tests.
                 */
                check.regex.lastIndex = 0;
                if (!check.regex.test(value)) {
                    pushIssue(path, issues, "expected_pattern", check.name, "string");
                }
                break;
            case StringCheckTag.Uuid:
                /*
                 * UUID uses the shared library pattern but follows the same reset
                 * discipline as user regexps.
                 */
                UUID_PATTERN.lastIndex = 0;
                if (!UUID_PATTERN.test(value)) {
                    pushIssue(path, issues, "expected_pattern", "uuid", "string");
                }
                break;
        }
    }
}

/**
 * @brief collect number issues.
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
 * @param schema Number schema with scalar checks.
 * @param value Candidate runtime value.
 * @param path Current diagnostic path.
 * @param issues Output issue buffer.
 * @post Bound checks run only after the finite-number guard succeeds.
 */
export function collectNumberIssues(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Number }>,
    value: unknown,
    path: PathSegment[],
    issues: Issue[]
): void {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        pushIssue(path, issues, "expected_number", "number", actualType(value));
        return;
    }
    const checks = schema.checks;
    /*
     * Integer and bound diagnostics are separated so invalid values report all
     * failed number constraints after the base type has been proven.
     */
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case NumberCheckTag.Integer:
                if (!Number.isInteger(value)) {
                    pushIssue(path, issues, "expected_integer", "integer", "number");
                }
                break;
            case NumberCheckTag.Gte:
                if (value < check.value) {
                    pushIssue(
                        path,
                        issues,
                        "expected_gte",
                        `>= ${String(check.value)}`,
                        String(value)
                    );
                }
                break;
            case NumberCheckTag.Lte:
                if (value > check.value) {
                    pushIssue(
                        path,
                        issues,
                        "expected_lte",
                        `<= ${String(check.value)}`,
                        String(value)
                    );
                }
                break;
        }
    }
}
