import type { Result } from "../result/index.js";

/**
 * @brief path segment type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type PathSegment = string | number;

/**
 * @brief issue code type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
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
 * @brief issue interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface Issue {

  /**
   * @brief path field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly path: readonly PathSegment[];

  /**
   * @brief code field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly code: IssueCode;

  /**
   * @brief expected field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly expected: string | undefined;

  /**
   * @brief actual field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly actual: string | undefined;

  /**
   * @brief message field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly message: string | undefined;
}

/**
 * @brief check result type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type CheckResult<TValue> = Result<TValue, readonly Issue[]>;

/**
 * @brief empty issues constant contract.
 * @details Module-scope storage with stable identity, created once and reused by callers.
 * @invariant Initialization happens during module load and later code treats the binding as fixed.
 */
const EMPTY_ISSUES: readonly Issue[] = Object.freeze([]);

/**
 * @brief make issue function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param code Borrowed input slot named code; validation or normalization happens before stored state changes.
 * @param expected Borrowed input slot named expected; validation or normalization happens before stored state changes.
 * @param actual Borrowed input slot named actual; validation or normalization happens before stored state changes.
 * @param message Borrowed input slot named message; validation or normalization happens before stored state changes.
 * @returns Result for make issue; ownership of newly created aggregates is transferred to the caller.
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
 * @brief copy issue array function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for copy issue array; ownership of newly created aggregates is transferred to the caller.
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
 * @brief finalize issue array function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for finalize issue array; ownership of newly created aggregates is transferred to the caller.
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
 * @brief freeze issue array function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @returns Result for freeze issue array; ownership of newly created aggregates is transferred to the caller.
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
 * @brief copy issue function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for copy issue; ownership of newly created aggregates is transferred to the caller.
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
 * @brief copy path function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for copy path; ownership of newly created aggregates is transferred to the caller.
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
 * @brief is issue code value function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is issue code value; ownership of newly created aggregates is transferred to the caller.
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
 * @brief is optional string function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is optional string; ownership of newly created aggregates is transferred to the caller.
 */
function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

/**
 * @brief is record function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is record; ownership of newly created aggregates is transferred to the caller.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief is unknown array function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is unknown array; ownership of newly created aggregates is transferred to the caller.
 */
function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}
