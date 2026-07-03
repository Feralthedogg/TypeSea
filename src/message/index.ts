import {
  copyIssueArray,
  freezeIssueArray,
  isIssueCodeValue,
  makeIssue,
  type CheckResult,
  type Issue,
  type IssueCode,
  type PathSegment
} from "../issue/index.js";
import { err } from "../result/index.js";

/**
 * @brief message locale type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type MessageLocale = "en" | "ko";

/**
 * @brief issue message context interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface IssueMessageContext {

  /**
   * @brief path field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly path: string;

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
  readonly expected: string;

  /**
   * @brief actual field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly actual: string;
}

/**
 * @brief issue message formatter type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type IssueMessageFormatter = (
  issue: Issue,
  context: IssueMessageContext
) => string;

/**
 * @brief issue message template type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type IssueMessageTemplate = string | IssueMessageFormatter;

/**
 * @brief issue message catalog type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type IssueMessageCatalog = Partial<
  Readonly<Record<IssueCode, IssueMessageTemplate>>
>;

/**
 * @brief issue message options interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface IssueMessageOptions {

  /**
   * @brief locale field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly locale: MessageLocale | undefined;

  /**
   * @brief catalog field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly catalog: IssueMessageCatalog | undefined;

  /**
   * @brief path formatter field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly pathFormatter:
    | ((path: readonly PathSegment[]) => string)
    | undefined;
}

/**
 * @brief resolved issue message options interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
interface ResolvedIssueMessageOptions {

  /**
   * @brief locale field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly locale: MessageLocale;

  /**
   * @brief catalog field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly catalog: IssueMessageCatalog | undefined;

  /**
   * @brief path formatter field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly pathFormatter: (path: readonly PathSegment[]) => string;
}

/**
 * @brief define messages function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param catalog Borrowed input slot named catalog; validation or normalization happens before stored state changes.
 * @returns Result for define messages; ownership of newly created aggregates is transferred to the caller.
 */
export function defineMessages(catalog: IssueMessageCatalog): IssueMessageCatalog {
  return Object.freeze(copyCatalog(catalog));
}

/**
 * @brief format issue function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param issue Borrowed input slot named issue; validation or normalization happens before stored state changes.
 * @param options Borrowed input slot named options; validation or normalization happens before stored state changes.
 * @returns Result for format issue; ownership of newly created aggregates is transferred to the caller.
 */
export function formatIssue(
  issue: Issue,
  options?: Partial<IssueMessageOptions>
): string {
  const copied = copyIssueArray([issue]);
  const first = copied[0];
  if (first === undefined) {
    throw new TypeError("issue must be present");
  }
  return renderIssue(first, readOptions(options));
}

/**
 * @brief format issues function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param options Borrowed input slot named options; validation or normalization happens before stored state changes.
 * @returns Result for format issues; ownership of newly created aggregates is transferred to the caller.
 */
export function formatIssues(
  issues: readonly Issue[],
  options?: Partial<IssueMessageOptions>
): readonly string[] {
  const copied = copyIssueArray(issues);
  const config = readOptions(options);
  const messages = new Array<string>(copied.length);
  for (let index = 0; index < copied.length; index += 1) {
    const issue = copied[index];
    if (issue !== undefined) {
      messages[index] = renderIssue(issue, config);
    }
  }
  return Object.freeze(messages);
}

/**
 * @brief with messages function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param result Borrowed input slot named result; validation or normalization happens before stored state changes.
 * @param options Borrowed input slot named options; validation or normalization happens before stored state changes.
 * @returns Result for with messages; ownership of newly created aggregates is transferred to the caller.
 */
export function withMessages<TValue>(
  result: CheckResult<TValue>,
  options?: Partial<IssueMessageOptions>
): CheckResult<TValue> {
  if (result.ok) {
    return result;
  }
  const copied = copyIssueArray(result.error);
  const config = readOptions(options);
  const issues = new Array<Issue>(copied.length);
  for (let index = 0; index < copied.length; index += 1) {
    const issue = copied[index];
    if (issue !== undefined) {
      issues[index] = makeIssue(
        issue.path,
        issue.code,
        issue.expected,
        issue.actual,
        renderIssue(issue, config)
      );
    }
  }
  return err(freezeIssueArray(issues));
}

/**
 * @brief render issue function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param issue Borrowed input slot named issue; validation or normalization happens before stored state changes.
 * @param options Borrowed input slot named options; validation or normalization happens before stored state changes.
 * @returns Result for render issue; ownership of newly created aggregates is transferred to the caller.
 */
function renderIssue(
  issue: Issue,
  options: ResolvedIssueMessageOptions
): string {
  const context = makeContext(issue, options.pathFormatter);
  const customTemplate = options.catalog?.[issue.code];
  if (customTemplate !== undefined) {
    return renderTemplate(customTemplate, issue, context);
  }
  if (issue.message !== undefined) {
    return issue.message;
  }
  return renderTemplate(defaultCatalogs[options.locale][issue.code], issue, context);
}

/**
 * @brief make context function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param issue Borrowed input slot named issue; validation or normalization happens before stored state changes.
 * @param pathFormatter Borrowed input slot named pathFormatter; validation or normalization happens before stored state changes.
 * @returns Result for make context; ownership of newly created aggregates is transferred to the caller.
 */
function makeContext(
  issue: Issue,
  pathFormatter: (path: readonly PathSegment[]) => string
): IssueMessageContext {
  return {
    path: pathFormatter(issue.path),
    code: issue.code,
    expected: issue.expected ?? "unknown",
    actual: issue.actual ?? "unknown"
  };
}

/**
 * @brief render template function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param template Borrowed input slot named template; validation or normalization happens before stored state changes.
 * @param issue Borrowed input slot named issue; validation or normalization happens before stored state changes.
 * @param context Borrowed input slot named context; validation or normalization happens before stored state changes.
 * @returns Result for render template; ownership of newly created aggregates is transferred to the caller.
 */
function renderTemplate(
  template: IssueMessageTemplate,
  issue: Issue,
  context: IssueMessageContext
): string {
  if (typeof template === "function") {
    const rendered = template(issue, context);
    if (typeof rendered !== "string") {
      throw new TypeError("issue message formatter must return a string");
    }
    return rendered;
  }
  return template
    .split("{path}").join(context.path)
    .split("{code}").join(context.code)
    .split("{expected}").join(context.expected)
    .split("{actual}").join(context.actual);
}

/**
 * @brief read options function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param options Borrowed input slot named options; validation or normalization happens before stored state changes.
 * @returns Result for read options; ownership of newly created aggregates is transferred to the caller.
 */
function readOptions(
  options: Partial<IssueMessageOptions> | undefined
): ResolvedIssueMessageOptions {
  if (options === undefined) {
    return {
      locale: "en",
      catalog: undefined,
      pathFormatter: defaultPathFormatter
    };
  }
  if (!isRecord(options)) {
    throw new TypeError("message options must be an object");
  }
  const locale = readLocale(options.locale);
  const pathFormatter = readPathFormatter(options.pathFormatter);
  const catalog = options.catalog;
  return {
    locale,
    catalog: catalog === undefined ? undefined : copyCatalog(catalog),
    pathFormatter
  };
}

/**
 * @brief read locale function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for read locale; ownership of newly created aggregates is transferred to the caller.
 */
function readLocale(value: unknown): MessageLocale {
  if (value === undefined || value === "en") {
    return "en";
  }
  if (value === "ko") {
    return "ko";
  }
  throw new TypeError("message locale must be en or ko");
}

/**
 * @brief read path formatter function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for read path formatter; ownership of newly created aggregates is transferred to the caller.
 */
function readPathFormatter(
  value: unknown
): (path: readonly PathSegment[]) => string {
  if (value === undefined) {
    return defaultPathFormatter;
  }
  if (typeof value !== "function") {
    throw new TypeError("message path formatter must be a function");
  }
  const formatter = value as (path: readonly PathSegment[]) => unknown;
  return (path: readonly PathSegment[]): string => {
    const formatted = formatter(path);
    if (typeof formatted !== "string") {
      throw new TypeError("message path formatter must return a string");
    }
    return formatted;
  };
}

/**
 * @brief copy catalog function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for copy catalog; ownership of newly created aggregates is transferred to the caller.
 */
function copyCatalog(value: unknown): IssueMessageCatalog {
  if (!isRecord(value)) {
    throw new TypeError("message catalog must be an object");
  }
  const copied: Partial<Record<IssueCode, IssueMessageTemplate>> = {};
  const keys = Object.keys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === undefined) {
      continue;
    }
    if (!isIssueCodeValue(key)) {
      throw new TypeError("message catalog key must be an issue code");
    }
    const template = value[key];
    if (!isIssueMessageTemplate(template)) {
      throw new TypeError("message template must be a string or function");
    }
    copied[key] = template;
  }
  return copied;
}

/**
 * @brief is issue message template function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is issue message template; ownership of newly created aggregates is transferred to the caller.
 */
function isIssueMessageTemplate(value: unknown): value is IssueMessageTemplate {
  return typeof value === "string" || typeof value === "function";
}

/**
 * @brief default path formatter function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @returns Result for default path formatter; ownership of newly created aggregates is transferred to the caller.
 */
function defaultPathFormatter(path: readonly PathSegment[]): string {
  if (path.length === 0) {
    return "$";
  }
  let result = "$";
  for (let index = 0; index < path.length; index += 1) {
    const segment = path[index];
    if (typeof segment === "number") {
      result += `[${String(segment)}]`;
    } else if (typeof segment === "string") {
      result += `[${JSON.stringify(segment)}]`;
    }
  }
  return result;
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
 * @brief en catalog constant contract.
 * @details Module-scope storage with stable identity, created once and reused by callers.
 * @invariant Initialization happens during module load and later code treats the binding as fixed.
 */
const enCatalog: Readonly<Record<IssueCode, string>> = Object.freeze({
  expected_string: "Expected string at {path}; received {actual}.",
  expected_number: "Expected number at {path}; received {actual}.",
  expected_bigint: "Expected bigint at {path}; received {actual}.",
  expected_symbol: "Expected symbol at {path}; received {actual}.",
  expected_boolean: "Expected boolean at {path}; received {actual}.",
  expected_never: "Expected never at {path}; received {actual}.",
  expected_literal: "Expected literal {expected} at {path}; received {actual}.",
  expected_array: "Expected array at {path}; received {actual}.",
  expected_tuple: "Expected tuple at {path}; received {actual}.",
  expected_tuple_length: "Expected tuple {expected} at {path}; received {actual}.",
  expected_object: "Expected object at {path}; received {actual}.",
  expected_record: "Expected record at {path}; received {actual}.",
  expected_integer: "Expected integer at {path}; received {actual}.",
  expected_min_length: "Expected {expected} at {path}; received {actual}.",
  expected_max_length: "Expected {expected} at {path}; received {actual}.",
  expected_pattern: "Expected pattern {expected} at {path}; received {actual}.",
  expected_gte: "Expected value {expected} at {path}; received {actual}.",
  expected_lte: "Expected value {expected} at {path}; received {actual}.",
  expected_required_key: "Expected required key at {path}; received {actual}.",
  expected_union: "Expected union at {path}; received {actual}.",
  expected_discriminant: "Expected discriminant {expected} at {path}; received {actual}.",
  expected_refinement: "Expected refinement {expected} at {path}; received {actual}.",
  expected_depth_limit: "Expected validation depth within {expected} at {path}; received {actual}.",
  unrecognized_key: "Unrecognized key at {path}; expected {expected}."
});

/**
 * @brief ko catalog constant contract.
 * @details Module-scope storage with stable identity, created once and reused by callers.
 * @invariant Initialization happens during module load and later code treats the binding as fixed.
 */
const koCatalog: Readonly<Record<IssueCode, string>> = Object.freeze({
  expected_string: "{path}에서 문자열이 필요하지만 {actual}을 받았습니다.",
  expected_number: "{path}에서 숫자가 필요하지만 {actual}을 받았습니다.",
  expected_bigint: "{path}에서 bigint가 필요하지만 {actual}을 받았습니다.",
  expected_symbol: "{path}에서 symbol이 필요하지만 {actual}을 받았습니다.",
  expected_boolean: "{path}에서 boolean이 필요하지만 {actual}을 받았습니다.",
  expected_never: "{path}에서 never가 필요하지만 {actual}을 받았습니다.",
  expected_literal: "{path}에서 literal {expected}이 필요하지만 {actual}을 받았습니다.",
  expected_array: "{path}에서 배열이 필요하지만 {actual}을 받았습니다.",
  expected_tuple: "{path}에서 튜플이 필요하지만 {actual}을 받았습니다.",
  expected_tuple_length: "{path}에서 튜플 {expected}이 필요하지만 {actual}을 받았습니다.",
  expected_object: "{path}에서 객체가 필요하지만 {actual}을 받았습니다.",
  expected_record: "{path}에서 record가 필요하지만 {actual}을 받았습니다.",
  expected_integer: "{path}에서 정수가 필요하지만 {actual}을 받았습니다.",
  expected_min_length: "{path}에서 {expected}이 필요하지만 {actual}을 받았습니다.",
  expected_max_length: "{path}에서 {expected}이 필요하지만 {actual}을 받았습니다.",
  expected_pattern: "{path}에서 패턴 {expected}이 필요하지만 {actual}을 받았습니다.",
  expected_gte: "{path}에서 값 {expected}이 필요하지만 {actual}을 받았습니다.",
  expected_lte: "{path}에서 값 {expected}이 필요하지만 {actual}을 받았습니다.",
  expected_required_key: "{path}에 필수 키가 필요하지만 {actual}입니다.",
  expected_union: "{path}에서 유니온 값이 필요하지만 {actual}을 받았습니다.",
  expected_discriminant: "{path}에서 discriminant {expected}이 필요하지만 {actual}을 받았습니다.",
  expected_refinement: "{path}에서 refinement {expected}을 통과해야 하지만 {actual}을 받았습니다.",
  expected_depth_limit: "{path}에서 검증 깊이 {expected} 이내가 필요하지만 {actual}입니다.",
  unrecognized_key: "{path}에서 알 수 없는 키입니다. 기대값은 {expected}입니다."
});

/**
 * @brief default catalogs constant contract.
 * @details Module-scope storage with stable identity, created once and reused by callers.
 * @invariant Initialization happens during module load and later code treats the binding as fixed.
 */
const defaultCatalogs: Readonly<Record<MessageLocale, Readonly<Record<IssueCode, string>>>> =
  Object.freeze({
    en: enCatalog,
    ko: koCatalog
  });
