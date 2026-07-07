/**
 * @file parse-options.ts
 * @brief Parse-time diagnostic customization.
 * @details The boolean guard path never enters this module. Custom messages are
 * applied only after diagnostic validation has already failed.
 */

import {
    copyIssueArray,
    freezeIssueArray,
    makeIssue,
    type Issue
} from "../issue/index.js";
import type {
    ParseErrorInput,
    ParseErrorMapper,
    ParseErrorResult,
    ParseIssueContext,
    ParseOptions
} from "./types.js";

interface ResolvedParseOptions {
    readonly error: ParseErrorInput | undefined;
    readonly reportInput: boolean;
}

interface ReportedInput {
    readonly found: boolean;
    readonly value: unknown;
}

let globalErrorMap: ParseErrorMapper | undefined;

/**
 * @brief Fast-path flag for compiled diagnostics.
 * @details Compiled check() can return generated results directly while this
 * flag is false. The live ESM binding lets hot methods avoid calling into the
 * parse-options module on successful no-options checks.
 */
export let hasGlobalErrorMap = false;

/**
 * @brief Install a process-wide Zod-style parse error mapper.
 * @param mapper Mapper used when a parse/check call has no local `error`.
 * @returns Previous mapper, if one was installed.
 */
export function setErrorMap(
    mapper: ParseErrorMapper
): ParseErrorMapper | undefined {
    if (typeof mapper !== "function") {
        throw new TypeError("error map must be a function");
    }
    const previous = globalErrorMap;
    globalErrorMap = mapper;
    hasGlobalErrorMap = true;
    return previous;
}

/**
 * @brief Read the current process-wide parse error mapper.
 * @returns Installed mapper, or undefined when none is active.
 */
export function getErrorMap(): ParseErrorMapper | undefined {
    return globalErrorMap;
}

/**
 * @brief Clear the process-wide parse error mapper.
 * @returns Previous mapper, if one was installed.
 */
export function resetErrorMap(): ParseErrorMapper | undefined {
    const previous = globalErrorMap;
    globalErrorMap = undefined;
    hasGlobalErrorMap = false;
    return previous;
}

/**
 * @brief Apply parse-time message customization to a failed issue list.
 * @param issues Frozen issues produced by validation.
 * @param input Root value supplied to the parse/check call.
 * @param options Optional Zod-style parse options.
 * @returns Original issues or a frozen issue copy with customized messages.
 */
export function applyParseOptions(
    issues: readonly Issue[],
    input: unknown,
    options: Partial<ParseOptions> | undefined
): readonly Issue[] {
    const config = readParseOptions(options);
    const error = config.error ?? globalErrorMap;
    if (issues.length === 0) {
        return issues;
    }
    if (error === undefined && !config.reportInput) {
        return issues;
    }
    const copied = config.reportInput
        ? reportIssueInputs(copyIssueArray(issues), input)
        : copyIssueArray(issues);
    if (typeof error === "string") {
        return rewriteIssueMessages(copied, error);
    }
    if (error === undefined) {
        return copied;
    }
    return mapIssueMessages(copied, input, error);
}

/**
 * @brief Normalize the optional parse configuration object.
 */
function readParseOptions(
    options: Partial<ParseOptions> | undefined
): ResolvedParseOptions {
    if (options === undefined) {
        return {
            error: undefined,
            reportInput: false
        };
    }
    if (!isRecord(options)) {
        throw new TypeError("parse options must be an object");
    }
    const error = options.error;
    const reportInput = options.reportInput;
    if (reportInput !== undefined && typeof reportInput !== "boolean") {
        throw new TypeError("parse reportInput option must be a boolean");
    }
    if (error === undefined || typeof error === "string" || typeof error === "function") {
        return {
            error,
            reportInput: reportInput === true
        };
    }
    throw new TypeError("parse error option must be a string or function");
}

/**
 * @brief Rewrite every issue with the same static message.
 */
function rewriteIssueMessages(
    issues: readonly Issue[],
    message: string
): readonly Issue[] {
    const mapped = new Array<Issue>(issues.length);
    for (let index = 0; index < issues.length; index += 1) {
        const issue = issues[index];
        if (issue !== undefined) {
            mapped[index] = copyIssueWithMessage(
                issue,
                issue.message ?? message
            );
        }
    }
    return freezeIssueArray(mapped);
}

/**
 * @brief Rewrite issues through a user supplied message mapper.
 */
function mapIssueMessages(
    issues: readonly Issue[],
    input: unknown,
    mapper: ParseErrorMapper
): readonly Issue[] {
    const mapped = new Array<Issue>(issues.length);
    for (let index = 0; index < issues.length; index += 1) {
        const issue = issues[index];
        if (issue !== undefined) {
            if (issue.message !== undefined) {
                mapped[index] = copyIssueWithMessage(issue, issue.message);
                continue;
            }
            const context: ParseIssueContext = Object.freeze({
                input,
                issue
            });
            mapped[index] = copyIssueWithMessage(
                issue,
                readParseErrorResult(mapper(issue, context), issue.message)
            );
        }
    }
    return freezeIssueArray(mapped);
}

/**
 * @brief Normalize one mapper return value.
 */
function readParseErrorResult(
    value: ParseErrorResult,
    fallback: string | undefined
): string | undefined {
    if (value === undefined) {
        return fallback;
    }
    if (typeof value === "string") {
        return value;
    }
    if (isRecord(value) && typeof value.message === "string") {
        return value.message;
    }
    throw new TypeError("parse error mapper must return a string, message object, or undefined");
}

/**
 * @brief Copy one issue while replacing its rendered message.
 */
function copyIssueWithMessage(issue: Issue, message: string | undefined): Issue {
    if (Object.prototype.hasOwnProperty.call(issue, "input")) {
        return makeIssue(
            issue.path,
            issue.code,
            issue.expected,
            issue.actual,
            message,
            issue.input
        );
    }
    return makeIssue(
        issue.path,
        issue.code,
        issue.expected,
        issue.actual,
        message
    );
}

/**
 * @brief Copy issues while attaching safely reachable path inputs.
 */
function reportIssueInputs(
    issues: readonly Issue[],
    input: unknown
): readonly Issue[] {
    const mapped = new Array<Issue>(issues.length);
    for (let index = 0; index < issues.length; index += 1) {
        const issue = issues[index];
        if (issue === undefined) {
            continue;
        }
        const reported = readReportedInput(input, issue.path);
        mapped[index] = reported.found
            ? makeIssue(
                issue.path,
                issue.code,
                issue.expected,
                issue.actual,
                issue.message,
                reported.value
            )
            : issue;
    }
    return freezeIssueArray(mapped);
}

/**
 * @brief Walk a failing path through own data properties only.
 */
function readReportedInput(
    root: unknown,
    path: readonly (string | number)[]
): ReportedInput {
    if (path.length === 0) {
        return {
            found: true,
            value: root
        };
    }
    let current = root;
    for (let index = 0; index < path.length; index += 1) {
        const segment = path[index];
        if (segment === undefined || !isObjectLike(current)) {
            return {
                found: false,
                value: undefined
            };
        }
        const descriptor = Object.getOwnPropertyDescriptor(current, segment);
        if (descriptor === undefined) {
            return {
                found: index === path.length - 1,
                value: undefined
            };
        }
        if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
            return {
                found: false,
                value: undefined
            };
        }
        current = descriptor.value;
    }
    return {
        found: true,
        value: current
    };
}

/**
 * @brief Check whether a path segment can be inspected with descriptors.
 */
function isObjectLike(value: unknown): value is object {
    return (typeof value === "object" && value !== null) || typeof value === "function";
}

/**
 * @brief Check record.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
