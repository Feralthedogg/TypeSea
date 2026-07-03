import type { Result } from "../result/index.js";

/**
 * @brief path segment.
 */
export type PathSegment = string | number;

/**
 * @brief issue code.
 */
export type IssueCode =
  | "expected_string"
  | "expected_number"
  | "expected_bigint"
  | "expected_symbol"
  | "expected_boolean"
  | "expected_never"
  | "expected_literal"
  | "expected_array"
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
  | "expected_required_key"
  | "expected_union"
  | "expected_discriminant"
  | "expected_refinement"
  | "expected_depth_limit"
  | "unrecognized_key";

/**
 * @brief issue.
 */
export interface Issue {
  readonly path: readonly PathSegment[];
  readonly code: IssueCode;
  readonly expected: string | undefined;
  readonly actual: string | undefined;
  readonly message: string | undefined;
}

/**
 * @brief check result.
 */
export type CheckResult<TValue> = Result<TValue, readonly Issue[]>;

/**
 * @brief empty issues.
 */
const EMPTY_ISSUES: readonly Issue[] = Object.freeze([]);

/**
 * @brief make issue.
 */
export function makeIssue(
  path: readonly PathSegment[],
  code: IssueCode,
  expected: string | undefined,
  actual: string | undefined,
  message: string | undefined
): Issue {
  return {
    path,
    code,
    expected,
    actual,
    message
  };
}

/**
 * @brief copy issue array.
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
 * @brief finalize issue array.
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
 * @brief freeze issue array.
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
 * @brief copy issue.
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
  if (!isIssueCodeValue(code)) {
    throw new TypeError("issue code is invalid");
  }
  if (!isOptionalString(expected) ||
    !isOptionalString(actual) ||
    !isOptionalString(message)) {
    throw new TypeError("issue text fields must be strings or undefined");
  }
  return makeIssue(path, code, expected, actual, message);
}

/**
 * @brief copy path.
 */
function copyPath(value: unknown): readonly PathSegment[] {
  if (!isUnknownArray(value)) {
    throw new TypeError("issue path must be an array");
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
 * @brief is issue code value.
 */
export function isIssueCodeValue(value: unknown): value is IssueCode {
  switch (value) {
    case "expected_string":
    case "expected_number":
    case "expected_bigint":
    case "expected_symbol":
    case "expected_boolean":
    case "expected_never":
    case "expected_literal":
    case "expected_array":
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
    case "expected_required_key":
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
 * @brief is optional string.
 */
function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

/**
 * @brief is record.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief is unknown array.
 */
function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}
