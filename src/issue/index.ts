import type { Result } from "../result/index.js";

/**
 * @brief One segment in a validation issue path.
 * @details Strings represent object keys and numbers represent array indexes.
 * The path formatter decides how those segments become user-facing text.
 */
export type PathSegment = string | number;

/**
 * @brief Closed set of validation issue codes emitted by TypeSea.
 * @details Codes are stable machine-readable diagnostics shared by interpreters,
 * compiled collectors, adapters, and message catalogs.
 */
export type IssueCode =
    | "expected_string"
    | "expected_number"
    | "expected_date"
    | "expected_bigint"
    | "expected_symbol"
    | "expected_boolean"
    | "expected_never"
    | "expected_literal"
    | "expected_array"
    | "expected_promise"
    | "expected_map"
    | "expected_set"
    | "expected_file"
    | "expected_instance"
    | "expected_tuple"
    | "expected_tuple_length"
    | "expected_object"
    | "expected_record"
    | "expected_integer"
    | "expected_min_length"
    | "expected_max_length"
    | "expected_pattern"
    | "expected_gte"
    | "expected_lte"
    | "expected_gt"
    | "expected_lt"
    | "expected_multiple_of"
    | "expected_required_key"
    | "expected_key_count"
    | "expected_union"
    | "expected_discriminant"
    | "expected_refinement"
    | "expected_depth_limit"
    | "unrecognized_key";

/**
 * @brief Immutable validation diagnostic.
 * @details The message field is optional so hot boolean validation and
 * low-level collectors can defer human-readable formatting until requested.
 */
export interface Issue {
    readonly path: readonly PathSegment[];
    readonly code: IssueCode;
    readonly expected: string | undefined;
    readonly actual: string | undefined;
    readonly message: string | undefined;
    readonly input?: unknown;
}

/**
 * @brief Result shape returned by diagnostic validation APIs.
 * @details Success carries the accepted value, failure carries a frozen issue
 * array suitable for message formatting or adapter conversion.
 */
export type CheckResult<TValue> = Result<TValue, readonly Issue[]>;

/**
 * @brief Shared success sentinel for compiled check() paths.
 * @details Reusing a frozen empty array avoids allocating diagnostics for
 * successful validation.
 */
const EMPTY_ISSUES: readonly Issue[] = Object.freeze([]);
const EMPTY_PATH: readonly PathSegment[] = Object.freeze([]);

/**
 * @brief Construct one issue record without freezing it.
 * @details Collectors use this helper while building mutable arrays, then
 * freeze the final array at the API boundary.
 * @param path Path to the failing value.
 * @param code Stable issue code.
 * @param expected Expected-value label, when available.
 * @param actual Actual-value label, when available.
 * @param message Pre-rendered human message, when available.
 * @returns Mutable issue record ready for collection.
 */
export function makeIssue(
    path: readonly PathSegment[],
    code: IssueCode,
    expected: string | undefined,
    actual: string | undefined,
    message: string | undefined,
    input?: unknown
): Issue {
    const issue: {
        path: readonly PathSegment[];
        code: IssueCode;
        expected: string | undefined;
        actual: string | undefined;
        message: string | undefined;
        input?: unknown;
    } = {
        path,
        code,
        expected,
        actual,
        message
    };
    if (arguments.length >= 6) {
        issue.input = input;
    }
    return issue;
}

/**
 * @brief Defensive-copy externally supplied issue arrays before publication.
 * @details Adapter and user callback boundaries may hand back mutable objects.
 * Copying revalidates shape and ensures TypeSea publishes frozen diagnostics.
 * @param value Candidate issue array.
 * @returns Frozen issue array with copied paths.
 */
export function copyIssueArray(value: unknown): readonly Issue[] {
    if (!isUnknownArray(value)) {
        throw new TypeError("issues must be an array");
    }
    const copied = new Array<Issue>(value.length);
    for (let index = 0; index < value.length; index += 1) {
        copied[index] = copyIssue(value[index]);
    }
    return freezeIssueArray(copied);
}

/**
 * @brief Normalize generated collector output into the public immutable shape.
 * @details Generated collectors return arrays only on failure. Empty arrays use
 * the shared sentinel so failed-but-empty states cannot allocate repeatedly.
 * @param value Candidate issue array from a collector.
 * @returns Frozen public issue array.
 */
export function finalizeIssueArray(value: unknown): readonly Issue[] {
    if (!isUnknownArray(value)) {
        throw new TypeError("issues must be an array");
    }
    if (value.length === 0) {
        return EMPTY_ISSUES;
    }
    return copyIssueArray(value);
}

/**
 * @brief Freeze issues and their path arrays in-place.
 * @details Paths are built mutably for speed during collection, then hardened
 * before callers can retain or format the diagnostics.
 * @param issues Issue array to harden.
 * @returns The same issue array after freezing.
 */
export function freezeIssueArray(issues: readonly Issue[]): readonly Issue[] {
    for (let index = 0; index < issues.length; index += 1) {
        const issue = issues[index];
        if (issue !== undefined) {
            Object.freeze(issue.path);
            Object.freeze(issue);
        }
    }
    return Object.freeze(issues);
}

/**
 * @brief Copy and validate one issue-like object.
 * @details Only own data read syntax is used here because the candidate object
 * has already been reduced to a plain record by `isRecord`.
 * @param value Candidate issue object.
 * @returns Normalized mutable issue record.
 */
function copyIssue(value: unknown): Issue {
    if (!isRecord(value)) {
        throw new TypeError("issue must be an object");
    }
    const path = copyPath(value["path"]);
    const code = value["code"];
    const expected = value["expected"];
    const actual = value["actual"];
    const message = value["message"];
    const input = value["input"];
    if (!isIssueCodeValue(code)) {
        throw new TypeError("issue code is invalid");
    }
    if (!isOptionalString(expected) ||
        !isOptionalString(actual) ||
        !isOptionalString(message)) {
        throw new TypeError("issue text fields must be strings or undefined");
    }
    return hasOwn(value, "input")
        ? makeIssue(path, code, expected, actual, message, input)
        : makeIssue(path, code, expected, actual, message);
}

/**
 * @brief Copy and validate an issue path.
 * @details Negative and fractional numeric segments are rejected because TypeSea
 * only emits non-negative array indexes.
 * @param value Candidate path array.
 * @returns Copied path, or the shared empty-path sentinel.
 */
function copyPath(value: unknown): readonly PathSegment[] {
    if (!isUnknownArray(value)) {
        throw new TypeError("issue path must be an array");
    }
    if (value.length === 0) {
        return EMPTY_PATH;
    }
    const copied = new Array<PathSegment>(value.length);
    for (let index = 0; index < value.length; index += 1) {
        const segment = value[index];
        if (typeof segment === "string") {
            copied[index] = segment;
            continue;
        }
        if (typeof segment === "number" &&
            Number.isInteger(segment) &&
            segment >= 0) {
            copied[index] = segment;
            continue;
        }
        throw new TypeError("issue path segment must be a string or non-negative integer");
    }
    return copied;
}

/**
 * @brief Check whether a value is one of TypeSea's stable issue codes.
 * @details Issue helpers publish frozen diagnostics so adapters and callers cannot mutate
 * validation results later.
 * @param value Candidate issue code.
 * @returns True when the value belongs to the closed issue-code set.
 */
export function isIssueCodeValue(value: unknown): value is IssueCode {
    switch (value) {
        case "expected_string":
        case "expected_number":
        case "expected_date":
        case "expected_bigint":
        case "expected_symbol":
        case "expected_boolean":
        case "expected_never":
        case "expected_literal":
        case "expected_array":
        case "expected_promise":
        case "expected_map":
        case "expected_set":
        case "expected_file":
        case "expected_instance":
        case "expected_tuple":
        case "expected_tuple_length":
        case "expected_object":
        case "expected_record":
        case "expected_integer":
        case "expected_min_length":
        case "expected_max_length":
        case "expected_pattern":
        case "expected_gte":
        case "expected_lte":
        case "expected_gt":
        case "expected_lt":
        case "expected_multiple_of":
        case "expected_required_key":
        case "expected_key_count":
        case "expected_union":
        case "expected_discriminant":
        case "expected_refinement":
        case "expected_depth_limit":
        case "unrecognized_key":
            return true;
        default:
            return false;
    }
}

/**
 * @brief Accept optional text fields used by issue diagnostics.
 * @details Issue helpers publish frozen diagnostics so adapters and callers cannot mutate
 * validation results later.
 * @param value Candidate issue text field.
 * @returns True for string values and undefined.
 */
function isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === "string";
}

/**
 * @brief Check whether a value can be read as an issue-like record.
 * @details Issue helpers publish frozen diagnostics so adapters and callers cannot mutate
 * validation results later.
 * @param value Candidate runtime value.
 * @returns True for non-array object values.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Check own property membership without invoking user getters.
 */
function hasOwn(value: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * @brief Check whether a value is an array before indexed reads.
 * @details Issue helpers publish frozen diagnostics so adapters and callers cannot mutate
 * validation results later.
 * @param value Candidate runtime value.
 * @returns True when the value is an array.
 */
function isUnknownArray(value: unknown): value is readonly unknown[] {
    return Array.isArray(value);
}
