/**
 * @file index.ts
 * @brief Zod-style global configuration facade.
 * @details The facade reuses TypeSea's existing parse error map slot. Boolean
 * validation paths do not enter this module, so global diagnostics never slow
 * down allocation-light `is()` calls.
 */

import {
    type ParseErrorInput,
    type ParseErrorMapper,
    type ParseErrorResult,
    type ParseIssueContext
} from "../guard/types.js";
import type {
    Issue,
    IssueCode,
    PathSegment
} from "../issue/index.js";
import {
    formatIssue,
    readZodIssueDetails,
    type MessageLocale,
    type ZodIssueDetails
} from "../message/index.js";
import {
    resetErrorMap,
    setErrorMap
} from "../guard/parse-options.js";

/**
 * @brief Zod-style issue view supplied to config custom error callbacks.
 * @details The root input is exposed without traversing the failing path. This
 * preserves TypeSea's hostile-input rules while still giving migration code the
 * field names most Zod callbacks read.
 */
export interface TypeSeaConfigIssue extends ZodIssueDetails {
    readonly code: IssueCode;
    readonly path: readonly PathSegment[];
    readonly message: string | undefined;
    readonly expected: string | undefined;
    readonly actual: string | undefined;
    readonly received: string | undefined;
    readonly input: unknown;
    readonly issue: Issue;
}

/**
 * @brief Callback accepted by config({ customError }).
 */
export type TypeSeaCustomError = (
    issue: TypeSeaConfigIssue
) => ParseErrorResult;

/**
 * @brief Zod-compatible process-wide configuration object.
 */
export interface TypeSeaConfig {
    readonly customError?: ParseErrorInput | TypeSeaCustomError | undefined;
    readonly localeError?: ParseErrorInput | TypeSeaCustomError | undefined;
}

/**
 * @brief Locale helper namespace compatible with z.locales.
 */
export interface TypeSeaLocales {
    en(): TypeSeaConfig;
    ko(): TypeSeaConfig;
}

/**
 * @brief Install process-wide Zod-style configuration.
 * @param settings Configuration returned by locales.*() or supplied by callers.
 * @returns Previous TypeSea parse error mapper, if one was installed.
 */
export function config(
    settings: Partial<TypeSeaConfig>
): ParseErrorMapper | undefined {
    if (!isRecord(settings)) {
        throw new TypeError("config settings must be an object");
    }
    const customError = settings.customError ?? settings.localeError;
    if (customError === undefined) {
        return resetErrorMap();
    }
    if (typeof customError === "string") {
        return setErrorMap((): string => customError);
    }
    if (typeof customError !== "function") {
        throw new TypeError("config customError must be a string or function");
    }
    return setErrorMap(makeCustomErrorMapper(customError));
}

/**
 * @brief Built-in locale factories for z.config(z.locales.*()).
 */
export const locales: TypeSeaLocales = Object.freeze({
    en(): TypeSeaConfig {
        return makeLocaleConfig("en");
    },

    ko(): TypeSeaConfig {
        return makeLocaleConfig("ko");
    }
});

/**
 * @brief Wrap one custom error callback in TypeSea's mapper shape.
 */
function makeCustomErrorMapper(
    customError: ParseErrorMapper | TypeSeaCustomError
): ParseErrorMapper {
    return (issue: Issue, context: ParseIssueContext): ParseErrorResult => {
        if (isLegacyMapper(customError)) {
            return customError(issue, context);
        }
        return customError(makeConfigIssue(issue, context));
    };
}

/**
 * @brief Build one locale-backed config object.
 */
function makeLocaleConfig(locale: MessageLocale): TypeSeaConfig {
    const customError = (issue: TypeSeaConfigIssue): string =>
        formatIssue(issue.issue, { locale });
    return Object.freeze({
        customError,
        localeError: customError
    });
}

/**
 * @brief Build the Zod-style callback payload.
 */
function makeConfigIssue(
    issue: Issue,
    context: ParseIssueContext
): TypeSeaConfigIssue {
    return Object.freeze({
        ...readZodIssueDetails(issue),
        code: issue.code,
        path: issue.path,
        message: issue.message,
        expected: issue.expected,
        actual: issue.actual,
        received: issue.actual,
        input: Object.prototype.hasOwnProperty.call(issue, "input")
            ? issue.input
            : context.input,
        issue
    });
}

/**
 * @brief Detect the older TypeSea two-argument mapper shape.
 */
function isLegacyMapper(
    mapper: ParseErrorMapper | TypeSeaCustomError
): mapper is ParseErrorMapper {
    return mapper.length > 1;
}

/**
 * @brief Check record-like configuration input.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
