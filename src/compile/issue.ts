/**
 * @file compile/issue.ts
 * @brief Diagnostic issue source snippets.
 */

import { UUID_PATTERN } from "../schema/index.js";
import { pushRegex, stringRef } from "./context.js";
import { stringLiteral } from "./names.js";
import type { EmitContext } from "./types.js";

/**
 * @brief emit pattern issue.
 * @param value Generated expression for the string value.
 * @param path Generated expression for the current diagnostic path.
 * @param issues Generated expression for the diagnostic buffer.
 * @param regex Pattern used by the schema check.
 * @param name Human-readable pattern name stored in the issue.
 * @param context Shared code-generation context.
 * @returns JavaScript source that appends a pattern issue when the test fails.
 */
export function emitPatternIssue(
    value: string,
    path: string,
    issues: string,
    regex: RegExp,
    name: string,
    context: EmitContext,
    messageExpression?: string
): string {
    const source = regex === UUID_PATTERN ? UUID_PATTERN : regex;
    const index = pushRegex(context, source);
    const access = `r[${String(index)}]`;
    const test = regexNeedsLastIndexReset(source)
        ? `((${access}.lastIndex=0),!${access}.test(${value}))`
        : `!${access}.test(${value})`;
    /*
     * Pattern names live in the string side table. That keeps generated source
     * stable even when users provide long or escaped pattern descriptions.
     */
    return `if(${test}){${emitIssueExpr(
        issues,
        path,
        "expected_pattern",
        stringRef(context, name),
        stringLiteral("string"),
        messageExpression
    )}}`;
}

/**
 * @brief emit pattern issue at one appended path segment.
 * @param value Generated expression for the string value.
 * @param path Generated expression for the current diagnostic path.
 * @param segmentExpression Generated expression for the appended segment.
 * @param issues Generated expression for the diagnostic buffer.
 * @param regex Pattern used by the schema check.
 * @param name Human-readable pattern name stored in the issue.
 * @param context Shared code-generation context.
 * @returns JavaScript source that appends a one-segment pattern issue.
 */
export function emitPatternIssueAtSegment(
    value: string,
    path: string,
    segmentExpression: string,
    issues: string,
    regex: RegExp,
    name: string,
    context: EmitContext,
    messageExpression?: string
): string {
    const source = regex === UUID_PATTERN ? UUID_PATTERN : regex;
    const index = pushRegex(context, source);
    const access = `r[${String(index)}]`;
    const test = regexNeedsLastIndexReset(source)
        ? `((${access}.lastIndex=0),!${access}.test(${value}))`
        : `!${access}.test(${value})`;
    return `if(${test}){${emitIssueExprAtSegment(
        issues,
        path,
        segmentExpression,
        "expected_pattern",
        stringRef(context, name),
        stringLiteral("string"),
        messageExpression
    )}}`;
}

/**
 * @brief emit pattern issue at two appended path segments.
 * @param value Generated expression for the string value.
 * @param path Generated expression for the current diagnostic path.
 * @param firstSegmentExpression Generated expression for the first appended segment.
 * @param secondSegmentExpression Generated expression for the second appended segment.
 * @param issues Generated expression for the diagnostic buffer.
 * @param regex Pattern used by the schema check.
 * @param name Human-readable pattern name stored in the issue.
 * @param context Shared code-generation context.
 * @returns JavaScript source that appends a two-segment pattern issue.
 */
export function emitPatternIssueAtTwoSegments(
    value: string,
    path: string,
    firstSegmentExpression: string,
    secondSegmentExpression: string,
    issues: string,
    regex: RegExp,
    name: string,
    context: EmitContext,
    messageExpression?: string
): string {
    const source = regex === UUID_PATTERN ? UUID_PATTERN : regex;
    const index = pushRegex(context, source);
    const access = `r[${String(index)}]`;
    const test = regexNeedsLastIndexReset(source)
        ? `((${access}.lastIndex=0),!${access}.test(${value}))`
        : `!${access}.test(${value})`;
    return `if(${test}){${emitIssueExprAtTwoSegments(
        issues,
        path,
        firstSegmentExpression,
        secondSegmentExpression,
        "expected_pattern",
        stringRef(context, name),
        stringLiteral("string"),
        messageExpression
    )}}`;
}

/**
 * @brief Decide whether a RegExp must be reset before generated testing.
 * @param regex RegExp stored in the generated side table.
 * @returns True for stateful global or sticky expressions.
 */
function regexNeedsLastIndexReset(regex: RegExp): boolean {
    return regex.global || regex.sticky;
}

/**
 * @brief emit issue.
 * @param issues Generated expression for the diagnostic buffer.
 * @param path Generated expression for the current diagnostic path.
 * @param code Issue code string.
 * @param expected Expected type or condition text.
 * @param actualExpression Generated expression for actual type text.
 * @returns JavaScript source that appends an issue at the current path.
 */
export function emitIssue(
    issues: string,
    path: string,
    code: string,
    expected: string,
    actualExpression: string,
    messageExpression?: string
): string {
    return emitIssueExpr(
        issues,
        path,
        code,
        stringLiteral(expected),
        actualExpression,
        messageExpression
    );
}

/**
 * @brief emit issue at one appended path segment.
 * @param issues Generated expression for the diagnostic buffer.
 * @param path Generated expression for the current diagnostic path.
 * @param segmentExpression Generated expression for the appended segment.
 * @param code Issue code string.
 * @param expected Expected type or condition text.
 * @param actualExpression Generated expression for actual type text.
 * @returns JavaScript source that appends an issue under one extra segment.
 */
export function emitIssueAtSegment(
    issues: string,
    path: string,
    segmentExpression: string,
    code: string,
    expected: string,
    actualExpression: string,
    messageExpression?: string
): string {
    return emitIssueExprAtSegment(
        issues,
        path,
        segmentExpression,
        code,
        stringLiteral(expected),
        actualExpression,
        messageExpression
    );
}

/**
 * @brief emit issue at two appended path segments.
 * @param issues Generated expression for the diagnostic buffer.
 * @param path Generated expression for the current diagnostic path.
 * @param firstSegmentExpression Generated expression for the first appended segment.
 * @param secondSegmentExpression Generated expression for the second appended segment.
 * @param code Issue code string.
 * @param expected Expected type or condition text.
 * @param actualExpression Generated expression for actual type text.
 * @returns JavaScript source that appends an issue under two extra segments.
 */
export function emitIssueAtTwoSegments(
    issues: string,
    path: string,
    firstSegmentExpression: string,
    secondSegmentExpression: string,
    code: string,
    expected: string,
    actualExpression: string,
    messageExpression?: string
): string {
    return emitIssueExprAtTwoSegments(
        issues,
        path,
        firstSegmentExpression,
        secondSegmentExpression,
        code,
        stringLiteral(expected),
        actualExpression,
        messageExpression
    );
}

/**
 * @brief emit issue expr.
 * @param issues Generated expression for the diagnostic buffer.
 * @param path Generated expression for the current diagnostic path.
 * @param code Issue code string.
 * @param expectedExpression Generated expression for expected text.
 * @param actualExpression Generated expression for actual type text.
 * @returns JavaScript source that appends an issue using expression operands.
 */
export function emitIssueExpr(
    issues: string,
    path: string,
    code: string,
    expectedExpression: string,
    actualExpression: string,
    messageExpression?: string
): string {
    const args = issueArguments(
        issues,
        path,
        stringLiteral(code),
        expectedExpression,
        actualExpression,
        messageExpression
    );
    return `q(${args});`;
}

/**
 * @brief emit issue expr at one appended path segment.
 * @param issues Generated expression for the diagnostic buffer.
 * @param path Generated expression for the current diagnostic path.
 * @param segmentExpression Generated expression for the appended segment.
 * @param code Issue code string.
 * @param expectedExpression Generated expression for expected text.
 * @param actualExpression Generated expression for actual type text.
 * @returns JavaScript source using the most compact one-segment issue helper.
 */
export function emitIssueExprAtSegment(
    issues: string,
    path: string,
    segmentExpression: string,
    code: string,
    expectedExpression: string,
    actualExpression: string,
    messageExpression?: string
): string {
    const codeExpression = stringLiteral(code);
    const stringIndex = readStringRefIndex(segmentExpression);
    if (stringIndex !== undefined) {
        /*
         * q1s reuses the pre-frozen path segment cache for static string keys.
         * Dynamic segments still go through q1 because their value is known only
         * inside the generated validator.
         */
        const args = issueArguments(
            issues,
            path,
            stringIndex,
            codeExpression,
            expectedExpression,
            actualExpression,
            messageExpression
        );
        return `q1s(${args});`;
    }
    const args = issueArguments(
        issues,
        path,
        segmentExpression,
        codeExpression,
        expectedExpression,
        actualExpression,
        messageExpression
    );
    return `q1(${args});`;
}

/**
 * @brief emit issue expr at two appended path segments.
 * @param issues Generated expression for the diagnostic buffer.
 * @param path Generated expression for the current diagnostic path.
 * @param firstSegmentExpression Generated expression for the first appended segment.
 * @param secondSegmentExpression Generated expression for the second appended segment.
 * @param code Issue code string.
 * @param expectedExpression Generated expression for expected text.
 * @param actualExpression Generated expression for actual type text.
 * @returns JavaScript source using the two-segment issue helper.
 */
export function emitIssueExprAtTwoSegments(
    issues: string,
    path: string,
    firstSegmentExpression: string,
    secondSegmentExpression: string,
    code: string,
    expectedExpression: string,
    actualExpression: string,
    messageExpression?: string
): string {
    const args = issueArguments(
        issues,
        path,
        firstSegmentExpression,
        secondSegmentExpression,
        stringLiteral(code),
        expectedExpression,
        actualExpression,
        messageExpression
    );
    return `q2(${args});`;
}

function issueArguments(
    ...parts: readonly (string | undefined)[]
): string {
    const last = parts[parts.length - 1];
    const limit = last === undefined ? parts.length - 1 : parts.length;
    let result = "";
    for (let index = 0; index < limit; index += 1) {
        if (index !== 0) {
            result += ",";
        }
        result += parts[index] ?? "";
    }
    return result;
}

/**
 * @brief Extract the numeric side-table index from a generated string reference.
 * @param expression Candidate generated expression such as `u[3]`.
 * @returns Index text when the expression is a plain string-table read.
 */
function readStringRefIndex(expression: string): string | undefined {
    if (!expression.startsWith("u[") || !expression.endsWith("]")) {
        return undefined;
    }
    const value = expression.slice(2, -1);
    if (value.length === 0) {
        return undefined;
    }
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (code < 48 || code > 57) {
            return undefined;
        }
    }
    return value;
}
