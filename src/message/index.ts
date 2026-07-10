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
 * @brief Nested issue message tree.
 * @details The shape mirrors nested input paths: object keys appear in
 * properties, array indexes appear in items, and each node owns its local errors.
 */
export interface TreeifiedIssueMessages {
    readonly errors: readonly string[];
    readonly properties: Readonly<Record<string, TreeifiedIssueMessages>> | undefined;
    readonly items: readonly (TreeifiedIssueMessages | undefined)[] | undefined;
}

/**
 * @brief Deprecated Zod-style formatted error view.
 * @details The `_errors` key follows Zod's legacy `formatError()` shape. Prefer
 * treeifyError() for new code because it avoids reserved-key ambiguity.
 */
export interface FormattedIssueMessages {
    readonly _errors: readonly string[];
    readonly [key: string]: readonly string[] | FormattedIssueMessages;
}

/**
 * @brief Error-like shape accepted by prettifyError().
 */
export interface IssueListError {
    readonly issues: readonly Issue[];
}

/**
 * @brief Issue container accepted by error-formatting helpers.
 * @details Zod exposes top-level helpers that consume an error object. TypeSea
 * also accepts raw issue arrays so low-level callers can format diagnostics
 * without constructing an error wrapper.
 */
export type IssueSource = readonly Issue[] | IssueListError;

/**
 * @brief Zod v4 issue codes emitted by the TypeSea compatibility adapter.
 */
export type ZodIssueCode =
    | "invalid_type"
    | "too_big"
    | "too_small"
    | "invalid_format"
    | "not_multiple_of"
    | "unrecognized_keys"
    | "invalid_union"
    | "invalid_key"
    | "invalid_element"
    | "invalid_value"
    | "custom";

/**
 * @brief Runtime constants for Zod v4 issue code migration.
 * @details The type alias above is the compile-time contract; this frozen
 * object supports code that imports `ZodIssueCode.invalid_type` as a value.
 */
export const ZodIssueCode = Object.freeze({
    invalid_type: "invalid_type",
    too_big: "too_big",
    too_small: "too_small",
    invalid_format: "invalid_format",
    not_multiple_of: "not_multiple_of",
    unrecognized_keys: "unrecognized_keys",
    invalid_union: "invalid_union",
    invalid_key: "invalid_key",
    invalid_element: "invalid_element",
    invalid_value: "invalid_value",
    custom: "custom"
} as const);

/**
 * @brief Bound value shape exposed on Zod-style issues.
 */
export type ZodIssueBoundValue = number | bigint | string;

/**
 * @brief Structured Zod-style metadata reconstructed from TypeSea issues.
 * @details The fields are present only when TypeSea can derive them from the
 * immutable issue text without reading the candidate value again.
 */
export interface ZodIssueDetails {
    readonly minimum?: ZodIssueBoundValue | undefined;
    readonly maximum?: ZodIssueBoundValue | undefined;
    readonly inclusive?: boolean | undefined;
    readonly exact?: boolean | undefined;
    readonly origin?: string | undefined;
    readonly divisor?: ZodIssueBoundValue | undefined;
    readonly format?: string | undefined;
}

/**
 * @brief Zod-style issue projected from one TypeSea issue.
 * @details `typeseaCode` preserves the original machine-readable code so
 * callers can migrate gradually without losing TypeSea-specific detail.
 */
export interface ZodIssue extends ZodIssueDetails {
    readonly code: ZodIssueCode;
    readonly path: readonly PathSegment[];
    readonly message: string;
    readonly expected: string | undefined;
    readonly received: string | undefined;
    readonly keys: readonly string[] | undefined;
    readonly input?: unknown;
    readonly typeseaCode: IssueCode;
}

/**
 * @brief Error-like shape used by Zod-facing integration code.
 */
export interface ZodErrorLike {
    readonly name: "ZodError";
    readonly message: string;
    readonly issues: readonly ZodIssue[];
    flatten(): FlattenedIssueMessages;
    format(): FormattedIssueMessages;
}

/**
 * @brief Error wrapper whose public shape matches the useful ZodError surface.
 */
export class TypeSeaZodError extends Error implements ZodErrorLike {
    public declare readonly name: "ZodError";
    public declare readonly issues: readonly ZodIssue[];

    /**
     * @brief Construct a Zod-style error from Zod-style issues.
     * @param issues Issues produced by toZodIssues().
     */
    public constructor(issues: readonly ZodIssue[]) {
        const copied = copyZodIssueArray(issues);
        super(makeZodErrorMessage(copied));
        defineReadonlyValue(this, "name", "ZodError", false);
        defineReadonlyValue(this, "issues", copied, true);
    }

    /**
     * @brief Return Zod-style shallow field buckets.
     * @returns Frozen form and field error arrays built from this error's messages.
     */
    public flatten(): FlattenedIssueMessages {
        return flattenIssues(zodIssuesToTypeSeaIssues(this.issues));
    }

    /**
     * @brief Return Zod-style legacy nested `_errors` formatting.
     * @returns Frozen nested error tree built from this error's messages.
     */
    public format(): FormattedIssueMessages {
        return formatError(zodIssuesToTypeSeaIssues(this.issues));
    }
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

interface MutableZodIssue {
    code: ZodIssueCode;
    path: readonly PathSegment[];
    message: string;
    expected: string | undefined;
    received: string | undefined;
    keys: readonly string[] | undefined;
    typeseaCode: IssueCode;
    minimum?: ZodIssueBoundValue | undefined;
    maximum?: ZodIssueBoundValue | undefined;
    inclusive?: boolean | undefined;
    exact?: boolean | undefined;
    origin?: string | undefined;
    divisor?: ZodIssueBoundValue | undefined;
    format?: string | undefined;
    input?: unknown;
}

/**
 * @brief Freeze a user catalog after validating its keys and templates.
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
    value: IssueSource,
    options?: Partial<IssueMessageOptions>
): FlattenedIssueMessages {
    const copied = readIssueList(value, "flattenIssues");
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
 * @brief Zod-compatible alias for flattenIssues().
 * @param value Issue array or error object with an issues array.
 * @param options Optional locale, catalog, and path formatter.
 * @returns Frozen flattened message object.
 */
export function flattenError(
    value: IssueSource,
    options?: Partial<IssueMessageOptions>
): FlattenedIssueMessages {
    return flattenIssues(value, options);
}

/**
 * @brief Deprecated Zod-compatible nested formatter.
 * @param value Issue array or error object with an issues array.
 * @param options Optional locale, catalog, and path formatter.
 * @returns Frozen object with `_errors` arrays at every path node.
 * @details This exists for migration from Zod's legacy format. New code should
 * use treeifyError(), which keeps object properties separate from local errors.
 */
export function formatError(
    value: IssueSource,
    options?: Partial<IssueMessageOptions>
): FormattedIssueMessages {
    const copied = readIssueList(value, "formatError");
    const config = readOptions(options);
    const root = makeMutableFormattedNode();
    for (let index = 0; index < copied.length; index += 1) {
        const issue = copied[index];
        if (issue !== undefined) {
            insertFormattedIssue(root, issue.path, renderIssue(issue, config), 0);
        }
    }
    return freezeFormattedNode(root);
}

/**
 * @brief Treeify issues into nested path-indexed message buckets.
 * @param value Issue array or error object with an issues array.
 * @param options Optional locale, catalog, and path formatter.
 * @returns Frozen tree with local errors plus property and item children.
 */
export function treeifyIssues(
    value: IssueSource,
    options?: Partial<IssueMessageOptions>
): TreeifiedIssueMessages {
    const copied = readIssueList(value, "treeifyIssues");
    const config = readOptions(options);
    const root = makeMutableTreeNode();
    for (let index = 0; index < copied.length; index += 1) {
        const issue = copied[index];
        if (issue !== undefined) {
            insertTreeIssue(root, issue.path, renderIssue(issue, config), 0);
        }
    }
    return freezeTreeNode(root);
}

/**
 * @brief Zod-compatible alias for treeifyIssues().
 * @param value Issue array or error object with an issues array.
 * @param options Optional locale, catalog, and path formatter.
 * @returns Frozen tree with local errors plus property and item children.
 */
export function treeifyError(
    value: IssueSource,
    options?: Partial<IssueMessageOptions>
): TreeifiedIssueMessages {
    return treeifyIssues(value, options);
}

/**
 * @brief Render issues as one multi-line diagnostic string.
 * @param value Issue array or error object with an issues array.
 * @param options Optional locale, catalog, and path formatter.
 * @returns Human-readable diagnostic block.
 */
export function prettifyError(
    value: IssueSource,
    options?: Partial<IssueMessageOptions>
): string {
    const issues = readIssueList(value, "prettifyError");
    if (issues.length === 0) {
        return "Validation succeeded.";
    }
    const messages = formatIssues(issues, options);
    let output = "Validation failed:";
    for (let index = 0; index < messages.length; index += 1) {
        const message = messages[index];
        if (message !== undefined) {
            output += `\n- ${message}`;
        }
    }
    return output;
}

/**
 * @brief Convert one TypeSea issue into a Zod-style issue.
 * @param issue TypeSea issue to project.
 * @param options Optional locale, catalog, and path formatter for message text.
 * @returns Frozen Zod-style issue.
 */
export function toZodIssue(
    issue: Issue,
    options?: Partial<IssueMessageOptions>
): ZodIssue {
    const copied = copyIssueArray([issue]);
    const first = copied[0];
    if (first === undefined) {
        throw new TypeError("issue must be present");
    }
    return makeZodIssue(first, renderIssue(first, readOptions(options)));
}

/**
 * @brief Convert TypeSea issues into Zod-style issues.
 * @param value Issue array or error object with an issues array.
 * @param options Optional locale, catalog, and path formatter for message text.
 * @returns Frozen Zod-style issue array.
 */
export function toZodIssues(
    value: IssueSource,
    options?: Partial<IssueMessageOptions>
): readonly ZodIssue[] {
    const copied = readIssueList(value, "toZodIssues");
    const config = readOptions(options);
    const issues = new Array<ZodIssue>(copied.length);
    for (let index = 0; index < copied.length; index += 1) {
        const issue = copied[index];
        if (issue !== undefined) {
            issues[index] = makeZodIssue(issue, renderIssue(issue, config));
        }
    }
    return Object.freeze(issues);
}

/**
 * @brief Convert TypeSea issues into a Zod-style error object.
 * @param value Issue array or error object with an issues array.
 * @param options Optional locale, catalog, and path formatter for message text.
 * @returns Error object with `name: "ZodError"` and Zod-style `issues`.
 */
export function toZodError(
    value: IssueSource,
    options?: Partial<IssueMessageOptions>
): TypeSeaZodError {
    return new TypeSeaZodError(toZodIssues(value, options));
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
 * @brief Mutable tree node used before the public tree is frozen.
 */
interface MutableTreeifiedIssueMessages {
    readonly errors: string[];
    properties: Record<string, MutableTreeifiedIssueMessages> | undefined;
    items: (MutableTreeifiedIssueMessages | undefined)[] | undefined;
}

/**
 * @brief Create one mutable tree node.
 */
function makeMutableTreeNode(): MutableTreeifiedIssueMessages {
    return {
        errors: [],
        properties: undefined,
        items: undefined
    };
}

/**
 * @brief Insert one rendered issue message into the tree path.
 */
function insertTreeIssue(
    node: MutableTreeifiedIssueMessages,
    path: readonly PathSegment[],
    message: string,
    index: number
): void {
    const segment = path[index];
    if (segment === undefined) {
        node.errors.push(message);
        return;
    }
    if (typeof segment === "number") {
        const child = readTreeItem(node, segment);
        insertTreeIssue(child, path, message, index + 1);
        return;
    }
    const child = readTreeProperty(node, segment);
    insertTreeIssue(child, path, message, index + 1);
}

/**
 * @brief Read or create an object-property child node.
 */
function readTreeProperty(
    node: MutableTreeifiedIssueMessages,
    key: string
): MutableTreeifiedIssueMessages {
    const properties = node.properties ?? (
        node.properties = Object.create(null) as Record<string, MutableTreeifiedIssueMessages>
    );
    const existing = properties[key];
    if (existing !== undefined) {
        return existing;
    }
    const created = makeMutableTreeNode();
    properties[key] = created;
    return created;
}

/**
 * @brief Read or create an array-index child node.
 */
function readTreeItem(
    node: MutableTreeifiedIssueMessages,
    index: number
): MutableTreeifiedIssueMessages {
    const items = node.items ?? (node.items = []);
    const existing = items[index];
    if (existing !== undefined) {
        return existing;
    }
    const created = makeMutableTreeNode();
    items[index] = created;
    return created;
}

/**
 * @brief Freeze one tree node and all descendants.
 */
function freezeTreeNode(
    node: MutableTreeifiedIssueMessages
): TreeifiedIssueMessages {
    return Object.freeze({
        errors: Object.freeze(node.errors),
        properties: node.properties === undefined
            ? undefined
            : freezeTreeProperties(node.properties),
        items: node.items === undefined
            ? undefined
            : freezeTreeItems(node.items)
    });
}

/**
 * @brief Freeze object-property tree children.
 */
function freezeTreeProperties(
    value: Record<string, MutableTreeifiedIssueMessages>
): Readonly<Record<string, TreeifiedIssueMessages>> {
    const keys = Object.keys(value);
    const frozen: Record<string, TreeifiedIssueMessages> = Object.create(null) as Record<
        string,
        TreeifiedIssueMessages
    >;
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key !== undefined) {
            const child = value[key];
            if (child !== undefined) {
                frozen[key] = freezeTreeNode(child);
            }
        }
    }
    return Object.freeze(frozen);
}

/**
 * @brief Freeze array-index tree children while preserving sparse holes.
 */
function freezeTreeItems(
    value: readonly (MutableTreeifiedIssueMessages | undefined)[]
): readonly (TreeifiedIssueMessages | undefined)[] {
    const frozen = new Array<TreeifiedIssueMessages | undefined>(value.length);
    for (let index = 0; index < value.length; index += 1) {
        const item = value[index];
        if (item !== undefined) {
            frozen[index] = freezeTreeNode(item);
        }
    }
    return Object.freeze(frozen);
}

/**
 * @brief Mutable node for the legacy formatted error shape.
 */
interface MutableFormattedIssueMessages {
    readonly _errors: string[];
    [key: string]: string[] | MutableFormattedIssueMessages;
}

/**
 * @brief Allocate one legacy formatted error node.
 */
function makeMutableFormattedNode(): MutableFormattedIssueMessages {
    const node = Object.create(null) as MutableFormattedIssueMessages;
    Object.defineProperty(node, "_errors", {
        configurable: false,
        enumerable: true,
        value: [],
        writable: false
    });
    return node;
}

/**
 * @brief Insert one rendered issue into the legacy `_errors` tree.
 */
function insertFormattedIssue(
    node: MutableFormattedIssueMessages,
    path: readonly PathSegment[],
    message: string,
    index: number
): void {
    const segment = path[index];
    if (segment === undefined) {
        node._errors.push(message);
        return;
    }
    if (segment === "_errors") {
        node._errors.push(message);
        return;
    }
    const child = readFormattedChild(node, String(segment));
    insertFormattedIssue(child, path, message, index + 1);
}

/**
 * @brief Read or allocate one child in the legacy formatted error tree.
 */
function readFormattedChild(
    node: MutableFormattedIssueMessages,
    key: string
): MutableFormattedIssueMessages {
    const existing = node[key];
    if (isMutableFormattedNode(existing)) {
        return existing;
    }
    const created = makeMutableFormattedNode();
    node[key] = created;
    return created;
}

/**
 * @brief Freeze one legacy formatted error node and its descendants.
 */
function freezeFormattedNode(
    node: MutableFormattedIssueMessages
): FormattedIssueMessages {
    const frozen: Record<string, readonly string[] | FormattedIssueMessages> =
        Object.create(null) as Record<string, readonly string[] | FormattedIssueMessages>;
    frozen["_errors"] = Object.freeze(node._errors);
    const keys = Object.keys(node);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined || key === "_errors") {
            continue;
        }
        const child = node[key];
        if (isMutableFormattedNode(child)) {
            frozen[key] = freezeFormattedNode(child);
        }
    }
    return Object.freeze(frozen) as FormattedIssueMessages;
}

/**
 * @brief Check whether a value is a mutable legacy formatted node.
 */
function isMutableFormattedNode(value: unknown): value is MutableFormattedIssueMessages {
    return isRecord(value) && Array.isArray(value["_errors"]);
}

/**
 * @brief Normalize issue-list input into a copied issue array.
 */
function readIssueList(
    value: IssueSource,
    label: string
): readonly Issue[] {
    if (Array.isArray(value)) {
        return copyIssueArray(value);
    }
    if (!isRecord(value)) {
        throw new TypeError(`${label} input must be issues or an error object`);
    }
    return copyIssueArray(value.issues);
}

/**
 * @brief Build one frozen Zod-style issue from one TypeSea issue.
 */
function makeZodIssue(issue: Issue, message: string): ZodIssue {
    const zodIssue: MutableZodIssue = {
        code: toZodIssueCode(issue.code),
        path: issue.path,
        message,
        expected: issue.expected,
        received: issue.actual,
        keys: readUnrecognizedKeys(issue),
        typeseaCode: issue.code
    };
    assignZodIssueDetails(zodIssue, readZodIssueDetails(issue));
    if (hasOwn(issue, "input")) {
        zodIssue.input = issue.input;
    }
    return Object.freeze(zodIssue);
}

/**
 * @brief Derive Zod-style issue metadata from one TypeSea issue.
 * @param issue Frozen TypeSea diagnostic.
 * @returns Structured metadata that can be safely reconstructed.
 */
export function readZodIssueDetails(issue: Issue): ZodIssueDetails {
    switch (issue.code) {
        case "expected_min_length":
            return readMinimumIssueDetails(issue, true, false);
        case "expected_max_length":
            return readMaximumIssueDetails(issue, true, false);
        case "expected_gte":
            return readMinimumIssueDetails(issue, true, false);
        case "expected_gt":
            return readMinimumIssueDetails(issue, false, false);
        case "expected_lte":
            return readMaximumIssueDetails(issue, true, false);
        case "expected_lt":
            return readMaximumIssueDetails(issue, false, false);
        case "expected_multiple_of":
            return readMultipleOfIssueDetails(issue);
        case "expected_tuple_length":
            return readExactLengthIssueDetails(issue, "array");
        case "expected_key_count":
            return readKeyCountIssueDetails(issue);
        case "expected_pattern":
            return issue.expected === undefined
                ? Object.freeze({})
                : Object.freeze({
                    format: issue.expected
                });
        default:
            return Object.freeze({});
    }
}

/**
 * @brief Convert TypeSea's closed issue code set to Zod v4 issue codes.
 */
function toZodIssueCode(code: IssueCode): ZodIssueCode {
    switch (code) {
        case "expected_string":
        case "expected_number":
        case "expected_date":
        case "expected_bigint":
        case "expected_symbol":
        case "expected_boolean":
        case "expected_never":
        case "expected_array":
        case "expected_promise":
        case "expected_map":
        case "expected_set":
        case "expected_file":
        case "expected_instance":
        case "expected_tuple":
        case "expected_object":
        case "expected_record":
        case "expected_integer":
        case "expected_required_key":
            return "invalid_type";
        case "expected_literal":
            return "invalid_value";
        case "expected_min_length":
        case "expected_gte":
        case "expected_gt":
            return "too_small";
        case "expected_max_length":
        case "expected_lte":
        case "expected_lt":
            return "too_big";
        case "expected_pattern":
            return "invalid_format";
        case "expected_multiple_of":
            return "not_multiple_of";
        case "expected_union":
        case "expected_discriminant":
            return "invalid_union";
        case "unrecognized_key":
            return "unrecognized_keys";
        case "expected_tuple_length":
        case "expected_key_count":
        case "expected_refinement":
        case "expected_depth_limit":
            return "custom";
    }
}

/**
 * @brief Extract the extra-key vector expected by Zod's unrecognized_keys issue.
 */
function readUnrecognizedKeys(issue: Issue): readonly string[] | undefined {
    if (issue.code !== "unrecognized_key") {
        return undefined;
    }
    const index = issue.path.length - 1;
    const key = issue.path[index];
    if (typeof key !== "string") {
        return undefined;
    }
    return Object.freeze([key]);
}

/**
 * @brief Attach optional metadata fields to a mutable Zod issue.
 */
function assignZodIssueDetails(
    target: MutableZodIssue,
    details: ZodIssueDetails
): void {
    if (details.minimum !== undefined) {
        target.minimum = details.minimum;
    }
    if (details.maximum !== undefined) {
        target.maximum = details.maximum;
    }
    if (details.inclusive !== undefined) {
        target.inclusive = details.inclusive;
    }
    if (details.exact !== undefined) {
        target.exact = details.exact;
    }
    if (details.origin !== undefined) {
        target.origin = details.origin;
    }
    if (details.divisor !== undefined) {
        target.divisor = details.divisor;
    }
    if (details.format !== undefined) {
        target.format = details.format;
    }
}

/**
 * @brief Reconstruct a lower-bound issue detail object.
 */
function readMinimumIssueDetails(
    issue: Issue,
    inclusive: boolean,
    exact: boolean
): ZodIssueDetails {
    const value = readComparisonValue(issue.expected);
    if (value === undefined) {
        return Object.freeze({});
    }
    return Object.freeze({
        minimum: value,
        inclusive,
        exact,
        origin: readIssueOrigin(issue)
    });
}

/**
 * @brief Reconstruct an upper-bound issue detail object.
 */
function readMaximumIssueDetails(
    issue: Issue,
    inclusive: boolean,
    exact: boolean
): ZodIssueDetails {
    const value = readComparisonValue(issue.expected);
    if (value === undefined) {
        return Object.freeze({});
    }
    return Object.freeze({
        maximum: value,
        inclusive,
        exact,
        origin: readIssueOrigin(issue)
    });
}

/**
 * @brief Reconstruct an exact-length issue detail object.
 */
function readExactLengthIssueDetails(
    issue: Issue,
    origin: string
): ZodIssueDetails {
    const value = readComparisonValue(issue.expected);
    if (value === undefined) {
        return Object.freeze({
            exact: true,
            origin
        });
    }
    return Object.freeze({
        minimum: value,
        maximum: value,
        inclusive: true,
        exact: true,
        origin
    });
}

/**
 * @brief Reconstruct object property-count details.
 */
function readKeyCountIssueDetails(issue: Issue): ZodIssueDetails {
    if (issue.expected?.startsWith(">=") === true) {
        return readMinimumIssueDetails(issue, true, false);
    }
    if (issue.expected?.startsWith("<=") === true) {
        return readMaximumIssueDetails(issue, true, false);
    }
    return readExactLengthIssueDetails(issue, "object");
}

/**
 * @brief Reconstruct a multiple-of issue detail object.
 */
function readMultipleOfIssueDetails(issue: Issue): ZodIssueDetails {
    const divisor = readComparisonValue(issue.expected);
    if (divisor === undefined) {
        return Object.freeze({});
    }
    return Object.freeze({
        divisor,
        origin: readIssueOrigin(issue)
    });
}

/**
 * @brief Infer the broad origin category without re-reading input data.
 */
function readIssueOrigin(issue: Issue): string | undefined {
    const expected = issue.expected;
    if (expected === undefined) {
        return undefined;
    }
    if (expected.startsWith("length")) {
        return "string";
    }
    if (expected.endsWith("items")) {
        return "array";
    }
    if (issue.code === "expected_key_count") {
        return "object";
    }
    if (isDateComparison(expected)) {
        return "date";
    }
    if (issue.code === "expected_gte" ||
        issue.code === "expected_lte" ||
        issue.code === "expected_gt" ||
        issue.code === "expected_lt" ||
        issue.code === "expected_multiple_of") {
        return "number";
    }
    return undefined;
}

/**
 * @brief Parse the first bound token from TypeSea's expected label.
 */
function readComparisonValue(value: string | undefined): ZodIssueBoundValue | undefined {
    if (value === undefined) {
        return undefined;
    }
    const token = readComparisonToken(value);
    if (token === undefined) {
        return undefined;
    }
    return parseBoundToken(token);
}

/**
 * @brief Extract the numeric or textual comparison token.
 */
function readComparisonToken(value: string): string | undefined {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return undefined;
    }
    if (trimmed.startsWith("length ")) {
        return readComparisonToken(trimmed.slice("length ".length));
    }
    if (trimmed.startsWith("multiple of ")) {
        return readComparisonToken(trimmed.slice("multiple of ".length));
    }
    if (trimmed.startsWith(">=") ||
        trimmed.startsWith("<=")) {
        return readFirstToken(trimmed.slice(2));
    }
    if (trimmed.startsWith(">") ||
        trimmed.startsWith("<")) {
        return readFirstToken(trimmed.slice(1));
    }
    return readFirstToken(trimmed);
}

/**
 * @brief Read the first whitespace-delimited token.
 */
function readFirstToken(value: string): string | undefined {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return undefined;
    }
    const space = trimmed.indexOf(" ");
    return space === -1 ? trimmed : trimmed.slice(0, space);
}

/**
 * @brief Convert a bound token into a stable primitive.
 */
function parseBoundToken(token: string): ZodIssueBoundValue {
    if (isIntegerToken(token)) {
        const numberValue = Number(token);
        if (Number.isSafeInteger(numberValue)) {
            return numberValue;
        }
        return BigInt(token);
    }
    const numberValue = Number(token);
    if (Number.isFinite(numberValue)) {
        return numberValue;
    }
    return token;
}

/**
 * @brief Test a decimal integer token.
 */
function isIntegerToken(value: string): boolean {
    return /^-?\d+$/u.test(value);
}

/**
 * @brief Test whether a comparison label carries an ISO date token.
 */
function isDateComparison(value: string): boolean {
    return value.includes("T") && value.endsWith("Z");
}

/**
 * @brief Copy externally supplied Zod-style issues for TypeSeaZodError.
 */
function copyZodIssueArray(value: unknown): readonly ZodIssue[] {
    if (!Array.isArray(value)) {
        throw new TypeError("Zod issues must be an array");
    }
    const copied = new Array<ZodIssue>(value.length);
    for (let index = 0; index < value.length; index += 1) {
        copied[index] = copyZodIssue(value[index]);
    }
    return Object.freeze(copied);
}

/**
 * @brief Convert projected Zod issues back to TypeSea issues for formatters.
 * @details TypeSeaZodError stores already rendered messages. Rehydrating the
 * original code keeps flatten() and format() aligned with existing message
 * helpers without requiring the source validation error to stay alive.
 */
function zodIssuesToTypeSeaIssues(value: readonly ZodIssue[]): readonly Issue[] {
    const copied = copyZodIssueArray(value);
    const issues = new Array<Issue>(copied.length);
    for (let index = 0; index < copied.length; index += 1) {
        const issue = copied[index];
        if (issue !== undefined) {
            issues[index] = makeIssue(
                issue.path,
                issue.typeseaCode,
                issue.expected,
                issue.received,
                issue.message
            );
        }
    }
    return freezeIssueArray(issues);
}

/**
 * @brief Copy one Zod-style issue.
 */
function copyZodIssue(value: unknown): ZodIssue {
    if (!isRecord(value)) {
        throw new TypeError("Zod issue must be an object");
    }
    const code = value["code"];
    const message = value["message"];
    const expected = value["expected"];
    const received = value["received"];
    const typeseaCode = value["typeseaCode"];
    const minimum = value["minimum"];
    const maximum = value["maximum"];
    const inclusive = value["inclusive"];
    const exact = value["exact"];
    const origin = value["origin"];
    const divisor = value["divisor"];
    const format = value["format"];
    if (!isZodIssueCodeValue(code)) {
        throw new TypeError("Zod issue code is invalid");
    }
    if (typeof message !== "string") {
        throw new TypeError("Zod issue message must be a string");
    }
    if (!isOptionalString(expected) ||
        !isOptionalString(received) ||
        !isIssueCodeValue(typeseaCode)) {
        throw new TypeError("Zod issue metadata is invalid");
    }
    if (!isOptionalBoundValue(minimum) ||
        !isOptionalBoundValue(maximum) ||
        !isOptionalBoolean(inclusive) ||
        !isOptionalBoolean(exact) ||
        !isOptionalString(origin) ||
        !isOptionalBoundValue(divisor) ||
        !isOptionalString(format)) {
        throw new TypeError("Zod issue detail metadata is invalid");
    }
    const copied: MutableZodIssue = {
        code,
        path: copyZodPath(value["path"]),
        message,
        expected,
        received,
        keys: copyOptionalStringArray(value["keys"]),
        typeseaCode
    };
    assignZodIssueDetails(copied, {
        minimum,
        maximum,
        inclusive,
        exact,
        origin,
        divisor,
        format
    });
    if (hasOwn(value, "input")) {
        copied.input = value["input"];
    }
    return Object.freeze(copied);
}

/**
 * @brief Check Zod v4 issue code membership.
 */
function isZodIssueCodeValue(value: unknown): value is ZodIssueCode {
    switch (value) {
        case "invalid_type":
        case "too_big":
        case "too_small":
        case "invalid_format":
        case "not_multiple_of":
        case "unrecognized_keys":
        case "invalid_union":
        case "invalid_key":
        case "invalid_element":
        case "invalid_value":
        case "custom":
            return true;
        default:
            return false;
    }
}

/**
 * @brief Copy a Zod issue path.
 */
function copyZodPath(value: unknown): readonly PathSegment[] {
    if (!Array.isArray(value)) {
        throw new TypeError("Zod issue path must be an array");
    }
    const source = value as readonly unknown[];
    const copied = new Array<PathSegment>(source.length);
    for (let index = 0; index < source.length; index += 1) {
        const segment = source[index];
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
        throw new TypeError("Zod issue path segment must be a string or non-negative integer");
    }
    return Object.freeze(copied);
}

/**
 * @brief Copy an optional string vector.
 */
function copyOptionalStringArray(value: unknown): readonly string[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value)) {
        throw new TypeError("Zod issue keys must be an array");
    }
    const source = value as readonly unknown[];
    const copied = new Array<string>(source.length);
    for (let index = 0; index < source.length; index += 1) {
        const item = source[index];
        if (typeof item !== "string") {
            throw new TypeError("Zod issue key must be a string");
        }
        copied[index] = item;
    }
    return Object.freeze(copied);
}

/**
 * @brief Check optional string fields.
 */
function isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === "string";
}

/**
 * @brief Check optional boolean fields.
 */
function isOptionalBoolean(value: unknown): value is boolean | undefined {
    return value === undefined || typeof value === "boolean";
}

/**
 * @brief Check optional bound-value fields.
 */
function isOptionalBoundValue(
    value: unknown
): value is ZodIssueBoundValue | undefined {
    return value === undefined ||
        typeof value === "string" ||
        typeof value === "bigint" ||
        (typeof value === "number" && Number.isFinite(value));
}

/**
 * @brief Check own property membership.
 */
function hasOwn(value: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * @brief Render the Error message field for a Zod-style error.
 */
function makeZodErrorMessage(issues: readonly ZodIssue[]): string {
    return JSON.stringify(issues, undefined, 2);
}

/**
 * @brief Define one immutable own field.
 */
function defineReadonlyValue(
    target: object,
    key: string,
    value: unknown,
    enumerable: boolean
): void {
    Object.defineProperty(target, key, {
        configurable: false,
        enumerable,
        value,
        writable: false
    });
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
 * @brief Accept non-array objects before structured field reads.
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
    expected_promise: "Expected Promise at {path}; received {actual}.",
    expected_map: "Expected Map at {path}; received {actual}.",
    expected_set: "Expected Set at {path}; received {actual}.",
    expected_file: "Expected File at {path}; received {actual}.",
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
    expected_key_count: "Expected {expected} at {path}; received {actual}.",
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
    expected_promise: "{path}에서 Promise가 필요하지만 {actual}을 받았습니다.",
    expected_map: "{path}에서 Map이 필요하지만 {actual}을 받았습니다.",
    expected_set: "{path}에서 Set이 필요하지만 {actual}을 받았습니다.",
    expected_file: "{path}에서 File이 필요하지만 {actual}을 받았습니다.",
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
    expected_key_count: "{path}에서 {expected}이 필요하지만 {actual}입니다.",
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
