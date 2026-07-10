/**
 * @file check-scalar.ts
 * @brief Scalar diagnostic schema interpreters.
 */

import {
    BigIntCheckTag,
    DateCheckTag,
    FileCheckTag,
    NumberCheckTag,
    SchemaTag,
    StringCheckTag
} from "../kind/index.js";
import type { Issue, PathSegment } from "../issue/index.js";
import {
    EMAIL_PATTERN,
    IPV4_PATTERN,
    IPV6_PATTERN,
    ISO_DATETIME_PATTERN,
    ISO_DATE_PATTERN,
    KSUID_PATTERN,
    ULID_PATTERN,
    URL_PATTERN,
    UUID_PATTERN,
    XID_PATTERN,
    type Schema
} from "../schema/index.js";
import { pushIssue } from "./issue.js";
import {
    actualType,
    isNumberMultipleOf,
    isValidDateObject,
    readDateTime,
    readFileInfo
} from "./shared.js";

/**
 * @brief collect string issues.
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
        pushIssue(path, issues, "expected_string", "string", actualType(value), schema.message);
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
                        `length ${String(value.length)}`,
                        check.message
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
                        `length ${String(value.length)}`,
                        check.message
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
                    pushIssue(
                        path,
                        issues,
                        "expected_pattern",
                        check.name,
                        "string",
                        check.message
                    );
                }
                break;
            case StringCheckTag.Uuid:
                /*
                 * UUID uses the shared library pattern but follows the same reset
                 * discipline as user regexps.
                 */
                UUID_PATTERN.lastIndex = 0;
                if (!UUID_PATTERN.test(value)) {
                    pushIssue(path, issues, "expected_pattern", "uuid", "string", check.message);
                }
                break;
            case StringCheckTag.Email:
                EMAIL_PATTERN.lastIndex = 0;
                if (!EMAIL_PATTERN.test(value)) {
                    pushIssue(path, issues, "expected_pattern", "email", "string", check.message);
                }
                break;
            case StringCheckTag.Url:
                URL_PATTERN.lastIndex = 0;
                if (!URL_PATTERN.test(value)) {
                    pushIssue(path, issues, "expected_pattern", "url", "string", check.message);
                }
                break;
            case StringCheckTag.IsoDate:
                ISO_DATE_PATTERN.lastIndex = 0;
                if (!ISO_DATE_PATTERN.test(value)) {
                    pushIssue(path, issues, "expected_pattern", "iso_date", "string", check.message);
                }
                break;
            case StringCheckTag.IsoDateTime:
                ISO_DATETIME_PATTERN.lastIndex = 0;
                if (!ISO_DATETIME_PATTERN.test(value)) {
                    pushIssue(
                        path,
                        issues,
                        "expected_pattern",
                        "iso_datetime",
                        "string",
                        check.message
                    );
                }
                break;
            case StringCheckTag.Ulid:
                ULID_PATTERN.lastIndex = 0;
                if (!ULID_PATTERN.test(value)) {
                    pushIssue(path, issues, "expected_pattern", "ulid", "string", check.message);
                }
                break;
            case StringCheckTag.Xid:
                XID_PATTERN.lastIndex = 0;
                if (!XID_PATTERN.test(value)) {
                    pushIssue(path, issues, "expected_pattern", "xid", "string", check.message);
                }
                break;
            case StringCheckTag.Ksuid:
                KSUID_PATTERN.lastIndex = 0;
                if (!KSUID_PATTERN.test(value)) {
                    pushIssue(path, issues, "expected_pattern", "ksuid", "string", check.message);
                }
                break;
            case StringCheckTag.Ipv4:
                IPV4_PATTERN.lastIndex = 0;
                if (!IPV4_PATTERN.test(value)) {
                    pushIssue(path, issues, "expected_pattern", "ipv4", "string", check.message);
                }
                break;
            case StringCheckTag.Ipv6:
                IPV6_PATTERN.lastIndex = 0;
                if (!IPV6_PATTERN.test(value)) {
                    pushIssue(path, issues, "expected_pattern", "ipv6", "string", check.message);
                }
                break;
        }
    }
}

/**
 * @brief Collect Date issues.
 * @param value Candidate runtime value.
 * @param path Current diagnostic path.
 * @param issues Output issue buffer.
 */
export function collectDateIssues(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Date }>,
    value: unknown,
    path: PathSegment[],
    issues: Issue[]
): void {
    if (!isValidDateObject(value)) {
        pushIssue(path, issues, "expected_date", "valid Date", actualType(value), schema.message);
        return;
    }
    const time = readDateTime(value);
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case DateCheckTag.Min:
                if (time < check.value) {
                    pushIssue(
                        path,
                        issues,
                        "expected_gte",
                        `>= ${new Date(check.value).toISOString()}`,
                        new Date(time).toISOString(),
                        check.message
                    );
                }
                break;
            case DateCheckTag.Max:
                if (time > check.value) {
                    pushIssue(
                        path,
                        issues,
                        "expected_lte",
                        `<= ${new Date(check.value).toISOString()}`,
                        new Date(time).toISOString(),
                        check.message
                    );
                }
                break;
        }
    }
}

/**
 * @brief Collect bigint issues.
 * @param schema BigInt schema with scalar checks.
 * @param value Candidate runtime value.
 * @param path Current diagnostic path.
 * @param issues Output issue buffer.
 */
export function collectBigIntIssues(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.BigInt }>,
    value: unknown,
    path: PathSegment[],
    issues: Issue[]
): void {
    if (typeof value !== "bigint") {
        pushIssue(path, issues, "expected_bigint", "bigint", actualType(value), schema.message);
        return;
    }
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case BigIntCheckTag.Gte:
                if (value < check.value) {
                    pushIssue(
                        path,
                        issues,
                        "expected_gte",
                        `>= ${String(check.value)}n`,
                        `${String(value)}n`,
                        check.message
                    );
                }
                break;
            case BigIntCheckTag.Lte:
                if (value > check.value) {
                    pushIssue(
                        path,
                        issues,
                        "expected_lte",
                        `<= ${String(check.value)}n`,
                        `${String(value)}n`,
                        check.message
                    );
                }
                break;
            case BigIntCheckTag.Gt:
                if (value <= check.value) {
                    pushIssue(
                        path,
                        issues,
                        "expected_gt",
                        `> ${String(check.value)}n`,
                        `${String(value)}n`,
                        check.message
                    );
                }
                break;
            case BigIntCheckTag.Lt:
                if (value >= check.value) {
                    pushIssue(
                        path,
                        issues,
                        "expected_lt",
                        `< ${String(check.value)}n`,
                        `${String(value)}n`,
                        check.message
                    );
                }
                break;
            case BigIntCheckTag.MultipleOf:
                if (value % check.value !== 0n) {
                    pushIssue(
                        path,
                        issues,
                        "expected_multiple_of",
                        `multiple of ${String(check.value)}n`,
                        `${String(value)}n`,
                        check.message
                    );
                }
                break;
        }
    }
}

/**
 * @brief Collect File issues.
 * @param schema File schema with size and MIME checks.
 * @param value Candidate runtime value.
 * @param path Current diagnostic path.
 * @param issues Output issue buffer.
 */
export function collectFileIssues(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.File }>,
    value: unknown,
    path: PathSegment[],
    issues: Issue[]
): void {
    const file = readFileInfo(value);
    if (file === undefined) {
        pushIssue(path, issues, "expected_file", "File", actualType(value), schema.message);
        return;
    }
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case FileCheckTag.Min:
                if (file.size < check.value) {
                    pushIssue(
                        path,
                        issues,
                        "expected_min_length",
                        `size >= ${String(check.value)} bytes`,
                        `size ${String(file.size)} bytes`,
                        check.message
                    );
                }
                break;
            case FileCheckTag.Max:
                if (file.size > check.value) {
                    pushIssue(
                        path,
                        issues,
                        "expected_max_length",
                        `size <= ${String(check.value)} bytes`,
                        `size ${String(file.size)} bytes`,
                        check.message
                    );
                }
                break;
            case FileCheckTag.Mime:
                if (!fileMimeMatches(file.type, check.values)) {
                    pushIssue(
                        path,
                        issues,
                        "expected_pattern",
                        `mime ${check.values.join("|")}`,
                        file.type.length === 0 ? "empty mime" : file.type,
                        check.message
                    );
                }
                break;
        }
    }
}

/**
 * @brief Match an exact MIME type or a top-level wildcard.
 */
function fileMimeMatches(type: string, patterns: readonly string[]): boolean {
    for (let index = 0; index < patterns.length; index += 1) {
        const pattern = patterns[index];
        if (pattern === undefined) {
            continue;
        }
        if (Object.is(pattern, type)) {
            return true;
        }
        if (pattern.endsWith("/*") && type.startsWith(pattern.slice(0, -1))) {
            return true;
        }
    }
    return false;
}

/**
 * @brief collect number issues.
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
        pushIssue(path, issues, "expected_number", "number", actualType(value), schema.message);
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
                    pushIssue(path, issues, "expected_integer", "integer", "number", check.message);
                }
                break;
            case NumberCheckTag.Gte:
                if (value < check.value) {
                    pushIssue(
                        path,
                        issues,
                        "expected_gte",
                        `>= ${String(check.value)}`,
                        String(value),
                        check.message
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
                        String(value),
                        check.message
                    );
                }
                break;
            case NumberCheckTag.Gt:
                if (value <= check.value) {
                    pushIssue(
                        path,
                        issues,
                        "expected_gt",
                        `> ${String(check.value)}`,
                        String(value),
                        check.message
                    );
                }
                break;
            case NumberCheckTag.Lt:
                if (value >= check.value) {
                    pushIssue(
                        path,
                        issues,
                        "expected_lt",
                        `< ${String(check.value)}`,
                        String(value),
                        check.message
                    );
                }
                break;
            case NumberCheckTag.MultipleOf:
                if (!isNumberMultipleOf(value, check.value)) {
                    pushIssue(
                        path,
                        issues,
                        "expected_multiple_of",
                        `multiple of ${String(check.value)}`,
                        String(value),
                        check.message
                    );
                }
                break;
        }
    }
}
