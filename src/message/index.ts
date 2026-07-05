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
 * @brief Built-in locale identifiers accepted by the message renderer.
 * @details Message helpers keep structured issues separate from human-readable formatting
 * until callers request text.
 */
export type MessageLocale = "en" | "ko";

/**
 * @brief Render-time fields exposed to message templates.
 * @details The context is deliberately string-only so user formatters never
 * depend on internal issue object layout beyond the documented fields.
 */
export interface IssueMessageContext {
    readonly path: string;
    readonly code: IssueCode;
    readonly expected: string;
    readonly actual: string;
}

/**
 * @brief User supplied issue formatter callback.
 * @details Message helpers keep structured issues separate from human-readable formatting
 * until callers request text.
 * @param issue Frozen issue being rendered.
 * @param context Preformatted string fields for template authors.
 * @returns Final message text for that issue.
 */
export type IssueMessageFormatter = (
    issue: Issue,
    context: IssueMessageContext
) => string;

/**
 * @brief Message template accepted by a locale catalog.
 * @details String templates use `{path}`, `{code}`, `{expected}`, and
 * `{actual}` replacement tokens. Function templates are checked at runtime so
 * incorrect user callbacks fail at the API boundary.
 */
export type IssueMessageTemplate = string | IssueMessageFormatter;

/**
 * @brief Partial mapping from TypeSea issue codes to render templates.
 * @details Message helpers keep structured issues separate from human-readable formatting
 * until callers request text.
 */
export type IssueMessageCatalog = Partial<
    Readonly<Record<IssueCode, IssueMessageTemplate>>
>;

/**
 * @brief Optional message rendering configuration supplied by callers.
 * @details Every field is optional at the API edge; `readOptions` normalizes
 * this shape into a fully populated internal configuration.
 */
export interface IssueMessageOptions {
    readonly locale: MessageLocale | undefined;
    readonly catalog: IssueMessageCatalog | undefined;
    readonly pathFormatter:
        | ((path: readonly PathSegment[]) => string)
        | undefined;
}

/**
 * @brief Zod-style flattened message view.
 * @details Root issues go into formErrors. Field issues are grouped by the
 * first path segment so form adapters can attach messages to top-level fields.
 */
export interface FlattenedIssueMessages {
    readonly formErrors: readonly string[];
    readonly fieldErrors: Readonly<Record<string, readonly string[]>>;
}

/**
 * @brief Internal rendering configuration after option normalization.
 * @details Keeping this separate from the public type avoids repeated undefined
 * branches inside the hot issue rendering loop.
 */
interface ResolvedIssueMessageOptions {
    readonly locale: MessageLocale;
    readonly catalog: IssueMessageCatalog | undefined;
    readonly pathFormatter: (path: readonly PathSegment[]) => string;
}

/**
 * @brief Freeze a user catalog after validating its keys and templates.
 * @details Message helpers keep structured issues separate from human-readable formatting
 * until callers request text.
 * @param catalog Partial message catalog supplied by the application.
 * @returns Frozen catalog that can be reused across validations.
 */
export function defineMessages(catalog: IssueMessageCatalog): IssueMessageCatalog {
    return Object.freeze(copyCatalog(catalog));
}

/**
 * @brief Render one issue into a localized human-readable message.
 * @details The issue is copied before rendering so user callbacks cannot mutate
 * shared diagnostic objects through accidental aliasing.
 * @param issue Issue object to render.
 * @param options Optional locale, catalog, and path formatter.
 * @returns Rendered message text.
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
 * @brief Render a frozen list of issues into localized message strings.
 * @details The issue array is copied before rendering so caller-owned issue
 * objects cannot change while user path formatters or templates execute.
 * @param issues Issue list to render.
 * @param options Optional locale, catalog, and path formatter.
 * @returns Frozen list of rendered messages aligned with the input issue order.
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
 * @brief Flatten issues into root and top-level field message buckets.
 * @param issues Issue list returned by check-like APIs.
 * @param options Optional locale, catalog, and path formatter.
 * @returns Frozen flattened message object.
 * @details This mirrors the practical shape of Zod's `error.flatten()` without
 * changing TypeSea's allocation-free boolean path or array-based diagnostics.
 */
export function flattenIssues(
    issues: readonly Issue[],
    options?: Partial<IssueMessageOptions>
): FlattenedIssueMessages {
    const copied = copyIssueArray(issues);
    const config = readOptions(options);
    const formErrors: string[] = [];
    const fieldErrors: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
    for (let index = 0; index < copied.length; index += 1) {
        const issue = copied[index];
        if (issue === undefined) {
            continue;
        }
        const message = renderIssue(issue, config);
        const first = issue.path[0];
        if (first === undefined) {
            formErrors.push(message);
            continue;
        }
        const key = String(first);
        const bucket = fieldErrors[key];
        if (bucket === undefined) {
            fieldErrors[key] = [message];
        } else {
            bucket.push(message);
        }
    }
    return Object.freeze({
        formErrors: Object.freeze(formErrors),
        fieldErrors: freezeFieldErrors(fieldErrors)
    });
}

/**
 * @brief Attach rendered messages to every issue in a failed check result.
 * @details Successful results are returned unchanged. Failed results are copied
 * into fresh issue objects so structured diagnostics keep their original fields
 * while gaining a stable human-readable message.
 * @param result Check result to decorate.
 * @param options Optional locale, catalog, and path formatter.
 * @returns Original success result or a failed result with rendered messages.
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
 * @brief Select the template source and render one normalized issue.
 * @details Custom catalogs take precedence, issue-local messages are respected
 * next, and built-in catalogs are the final fallback. That order lets adapters
 * inject precise messages without losing defaults.
 * @param issue Issue currently being rendered.
 * @param options Resolved message rendering configuration.
 * @returns Rendered message text.
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
 * @brief Freeze flattened field-error buckets.
 * @param value Mutable field-error table.
 * @returns Frozen table with frozen message arrays.
 */
function freezeFieldErrors(
    value: Record<string, string[]>
): Readonly<Record<string, readonly string[]>> {
    const keys = Object.keys(value);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key !== undefined) {
            Object.freeze(value[key]);
        }
    }
    return Object.freeze(value);
}

/**
 * @brief Build the stable template context for one issue.
 * @details Missing expected or actual fields become `"unknown"` so templates
 * can stay branch-free and every placeholder always has a string value.
 * @param issue Issue currently being rendered.
 * @param pathFormatter Formatter selected by resolved options.
 * @returns Context object passed to string and function templates.
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
 * @brief Render a string or callback template against one issue context.
 * @details Function templates are checked at runtime because they cross into
 * user code. String templates use fixed token replacement without regular
 * expressions, keeping the common path allocation pattern predictable.
 * @param template Template selected for this issue code.
 * @param issue Issue currently being rendered.
 * @param context Preformatted replacement context.
 * @returns Rendered message text.
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
 * @brief Normalize public rendering options into the internal shape.
 * @details Validation happens once at the entry point. The render loop then
 * works with concrete locale and formatter values without repeated guards.
 * @param options Optional user configuration.
 * @returns Resolved message rendering configuration.
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
 * @brief Validate and normalize the requested message locale.
 * @details Message helpers keep structured issues separate from human-readable formatting
 * until callers request text.
 * @param value Locale field from the public options object.
 * @returns Built-in locale identifier, defaulting to English.
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
 * @brief Validate the optional user path formatter.
 * @details The returned wrapper enforces the string return contract at the
 * boundary where user code is invoked, keeping downstream template replacement
 * code simple.
 * @param value Formatter value from public options.
 * @returns Safe formatter callback used by the renderer.
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
 * @brief Validate and copy a user message catalog.
 * @details The renderer stores only recognized issue-code keys and accepted
 * template forms. Copying also prevents later caller mutation from changing
 * messages during validation.
 * @param value Candidate catalog object.
 * @returns Catalog copy accepted by the renderer.
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
 * @brief Check whether a catalog value is an accepted template form.
 * @details Message helpers keep structured issues separate from human-readable formatting
 * until callers request text.
 * @param value Candidate catalog entry value.
 * @returns True for string templates or formatter functions.
 */
function isIssueMessageTemplate(value: unknown): value is IssueMessageTemplate {
    return typeof value === "string" || typeof value === "function";
}

/**
 * @brief Render a TypeSea issue path using JSON-like bracket segments.
 * @details The root is `$`, numeric segments render as indexes, and string
 * segments are JSON-escaped so dots or brackets in field names stay unambiguous.
 * @param path Issue path to render.
 * @returns Stable path string for message templates.
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
 * @brief Check record.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Built-in English issue message catalog.
 * @details Templates stay terse and token-based so the same renderer can handle
 * built-in and user-defined catalogs without locale-specific code paths.
 */
const enCatalog: Readonly<Record<IssueCode, string>> = Object.freeze({
    expected_string: "Expected string at {path}; received {actual}.",
    expected_number: "Expected number at {path}; received {actual}.",
    expected_date: "Expected valid Date at {path}; received {actual}.",
    expected_bigint: "Expected bigint at {path}; received {actual}.",
    expected_symbol: "Expected symbol at {path}; received {actual}.",
    expected_boolean: "Expected boolean at {path}; received {actual}.",
    expected_never: "Expected never at {path}; received {actual}.",
    expected_literal: "Expected literal {expected} at {path}; received {actual}.",
    expected_array: "Expected array at {path}; received {actual}.",
    expected_map: "Expected Map at {path}; received {actual}.",
    expected_set: "Expected Set at {path}; received {actual}.",
    expected_instance: "Expected instance of {expected} at {path}; received {actual}.",
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
    expected_gt: "Expected value {expected} at {path}; received {actual}.",
    expected_lt: "Expected value {expected} at {path}; received {actual}.",
    expected_multiple_of: "Expected value {expected} at {path}; received {actual}.",
    expected_required_key: "Expected required key at {path}; received {actual}.",
    expected_union: "Expected union at {path}; received {actual}.",
    expected_discriminant: "Expected discriminant {expected} at {path}; received {actual}.",
    expected_refinement: "Expected refinement {expected} at {path}; received {actual}.",
    expected_depth_limit: "Expected validation depth within {expected} at {path}; received {actual}.",
    unrecognized_key: "Unrecognized key at {path}; expected {expected}."
});

/**
 * @brief Built-in Korean issue message catalog.
 * @details The catalog mirrors English issue-code coverage exactly so locale
 * switching cannot expose missing template keys at runtime.
 */
const koCatalog: Readonly<Record<IssueCode, string>> = Object.freeze({
    expected_string: "{path}에서 문자열이 필요하지만 {actual}을 받았습니다.",
    expected_number: "{path}에서 숫자가 필요하지만 {actual}을 받았습니다.",
    expected_date: "{path}에서 유효한 Date가 필요하지만 {actual}을 받았습니다.",
    expected_bigint: "{path}에서 bigint가 필요하지만 {actual}을 받았습니다.",
    expected_symbol: "{path}에서 symbol이 필요하지만 {actual}을 받았습니다.",
    expected_boolean: "{path}에서 boolean이 필요하지만 {actual}을 받았습니다.",
    expected_never: "{path}에서 never가 필요하지만 {actual}을 받았습니다.",
    expected_literal: "{path}에서 literal {expected}이 필요하지만 {actual}을 받았습니다.",
    expected_array: "{path}에서 배열이 필요하지만 {actual}을 받았습니다.",
    expected_map: "{path}에서 Map이 필요하지만 {actual}을 받았습니다.",
    expected_set: "{path}에서 Set이 필요하지만 {actual}을 받았습니다.",
    expected_instance: "{path}에서 {expected} 인스턴스가 필요하지만 {actual}을 받았습니다.",
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
    expected_gt: "{path}에서 값 {expected}이 필요하지만 {actual}을 받았습니다.",
    expected_lt: "{path}에서 값 {expected}이 필요하지만 {actual}을 받았습니다.",
    expected_multiple_of: "{path}에서 값 {expected}이 필요하지만 {actual}을 받았습니다.",
    expected_required_key: "{path}에 필수 키가 필요하지만 {actual}입니다.",
    expected_union: "{path}에서 유니온 값이 필요하지만 {actual}을 받았습니다.",
    expected_discriminant: "{path}에서 discriminant {expected}이 필요하지만 {actual}을 받았습니다.",
    expected_refinement: "{path}에서 refinement {expected}을 통과해야 하지만 {actual}을 받았습니다.",
    expected_depth_limit: "{path}에서 검증 깊이 {expected} 이내가 필요하지만 {actual}입니다.",
    unrecognized_key: "{path}에서 알 수 없는 키입니다. 기대값은 {expected}입니다."
});

/**
 * @brief Frozen lookup table for built-in message catalogs.
 * @details The table is keyed by normalized locale values, letting renderIssue
 * index without optional fallback logic after option resolution.
 */
const defaultCatalogs: Readonly<Record<MessageLocale, Readonly<Record<IssueCode, string>>>> =
    Object.freeze({
        en: enCatalog,
        ko: koCatalog
    });
