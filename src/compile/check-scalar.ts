/**
 * @file compile/check-scalar.ts
 * @brief Scalar diagnostic validator snippets.
 */
import {
    BigIntCheckTag,
    DateCheckTag,
    NumberCheckTag,
    SchemaTag,
    StringCheckTag
} from "../kind/index.js";
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
    type LiteralValue,
    type Schema
} from "../schema/index.js";
import { pushLiteral, stringRef } from "./context.js";
import {
    emitIssue,
    emitIssueAtSegment,
    emitIssueAtTwoSegments,
    emitIssueExpr,
    emitIssueExprAtSegment,
    emitIssueExprAtTwoSegments,
    emitPatternIssueAtSegment,
    emitPatternIssueAtTwoSegments,
    emitPatternIssue
} from "./issue.js";
import { stringLiteral } from "./names.js";
import { numberMultipleOfExpression } from "./number.js";
import { emitUnion } from "./union-preflight.js";
import type { EmitContext } from "./types.js";

/**
 * @brief emit string check.
 * @param schema String schema with scalar checks.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current diagnostic path.
 * @param issues Generated expression for the issue buffer.
 * @param context Shared code-generation context.
 * @returns JavaScript source for root string diagnostics.
 */
export function emitStringCheck(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.String }>,
    value: string,
    path: string,
    issues: string,
    context: EmitContext
): string {
    const parts: string[] = [
        `if(typeof ${value}!=="string"){${emitIssue(
            issues,
            path,
            "expected_string",
            "string",
            `a(${value})`,
            checkMessageExpression(schema.message, context)
        )}return;}`
    ];
    const checks = schema.checks;
    /*
     * Constraint diagnostics run only after the type guard returns. This avoids
     * meaningless length or pattern reads on non-string values.
     */
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case StringCheckTag.Min:
                parts.push(`if(${value}.length<${String(check.value)}){${emitIssue(
                    issues,
                    path,
                    "expected_min_length",
                    `length >= ${String(check.value)}`,
                    `"length "+String(${value}.length)`,
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
            case StringCheckTag.Max:
                parts.push(`if(${value}.length>${String(check.value)}){${emitIssue(
                    issues,
                    path,
                    "expected_max_length",
                    `length <= ${String(check.value)}`,
                    `"length "+String(${value}.length)`,
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
            case StringCheckTag.Regex:
                parts.push(emitPatternIssue(
                    value,
                    path,
                    issues,
                    check.regex,
                    check.name,
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Uuid:
                parts.push(emitPatternIssue(
                    value,
                    path,
                    issues,
                    UUID_PATTERN,
                    "uuid",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Email:
                parts.push(emitPatternIssue(
                    value,
                    path,
                    issues,
                    EMAIL_PATTERN,
                    "email",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Url:
                parts.push(emitPatternIssue(
                    value,
                    path,
                    issues,
                    URL_PATTERN,
                    "url",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.IsoDate:
                parts.push(emitPatternIssue(
                    value,
                    path,
                    issues,
                    ISO_DATE_PATTERN,
                    "iso_date",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.IsoDateTime:
                parts.push(emitPatternIssue(
                    value,
                    path,
                    issues,
                    ISO_DATETIME_PATTERN,
                    "iso_datetime",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Ulid:
                parts.push(emitPatternIssue(
                    value,
                    path,
                    issues,
                    ULID_PATTERN,
                    "ulid",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Xid:
                parts.push(emitPatternIssue(
                    value,
                    path,
                    issues,
                    XID_PATTERN,
                    "xid",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Ksuid:
                parts.push(emitPatternIssue(
                    value,
                    path,
                    issues,
                    KSUID_PATTERN,
                    "ksuid",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Ipv4:
                parts.push(emitPatternIssue(
                    value,
                    path,
                    issues,
                    IPV4_PATTERN,
                    "ipv4",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Ipv6:
                parts.push(emitPatternIssue(
                    value,
                    path,
                    issues,
                    IPV6_PATTERN,
                    "ipv6",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
        }
    }
    return parts.join("");
}

/**
 * @brief Emit Date diagnostics.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current diagnostic path.
 * @param issues Generated expression for the issue buffer.
 * @returns JavaScript source for root Date diagnostics.
 */
export function emitDateCheck(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Date }>,
    value: string,
    path: string,
    issues: string,
    context: EmitContext
): string {
    const invalid = `!dg(${value})`;
    const checks = schema.checks;
    if (checks.length === 0) {
        return `if(${invalid}){${emitIssue(
            issues,
            path,
            "expected_date",
            "valid Date",
            `a(${value})`,
            checkMessageExpression(schema.message, context)
        )}}`;
    }
    const parts = [`if(${invalid}){${emitIssue(
        issues,
        path,
        "expected_date",
        "valid Date",
        `a(${value})`,
        checkMessageExpression(schema.message, context)
    )}}else{`];
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        const actual = `new Date(dt(${value})).toISOString()`;
        switch (check.tag) {
            case DateCheckTag.Min:
                parts.push(`if(dt(${value})<${String(check.value)}){${emitIssue(
                    issues,
                    path,
                    "expected_gte",
                    `>= ${new Date(check.value).toISOString()}`,
                    actual,
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
            case DateCheckTag.Max:
                parts.push(`if(dt(${value})>${String(check.value)}){${emitIssue(
                    issues,
                    path,
                    "expected_lte",
                    `<= ${new Date(check.value).toISOString()}`,
                    actual,
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
        }
    }
    parts.push("}");
    return parts.join("");
}

/**
 * @brief emit leaf check at one appended path segment.
 * @details This path is used by object-field diagnostics to avoid building a
 * mutable path frame and calling a child collector for scalar schemas.
 * @param schema Candidate leaf schema.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current diagnostic path.
 * @param segmentExpression Generated expression for the appended path segment.
 * @param issues Generated expression for the issue buffer.
 * @param context Shared code-generation context.
 * @returns Inline diagnostic source, or undefined when a full child collector is required.
 */
export function emitLeafCheckAtSegment(
    schema: Schema,
    value: string,
    path: string,
    segmentExpression: string,
    issues: string,
    context: EmitContext
): string | undefined {
    switch (schema.tag) {
        case SchemaTag.Unknown:
            return "";
        case SchemaTag.Never:
            return emitIssueAtSegment(
                issues,
                path,
                segmentExpression,
                "expected_never",
                "never",
                `a(${value})`
            );
        case SchemaTag.String:
            return emitStringCheckAtSegment(
                schema,
                value,
                path,
                segmentExpression,
                issues,
                context
            );
        case SchemaTag.Number:
            return emitNumberCheckAtSegment(
                schema,
                value,
                path,
                segmentExpression,
                issues,
                context
            );
        case SchemaTag.Date:
            if (schema.checks.length !== 0) {
                return undefined;
            }
            return `if(!dg(${value})){${emitIssueAtSegment(
                issues,
                path,
                segmentExpression,
                "expected_date",
                "valid Date",
                `a(${value})`,
                checkMessageExpression(schema.message, context)
            )}}`;
        case SchemaTag.BigInt:
            return emitBigIntCheckAtSegment(
                schema,
                value,
                path,
                segmentExpression,
                issues,
                context
            );
        case SchemaTag.Symbol:
            return `if(typeof ${value}!=="symbol"){${emitIssueAtSegment(
                issues,
                path,
                segmentExpression,
                "expected_symbol",
                "symbol",
                `a(${value})`,
                checkMessageExpression(schema.message, context)
            )}}`;
        case SchemaTag.Boolean:
            return `if(typeof ${value}!=="boolean"){${emitIssueAtSegment(
                issues,
                path,
                segmentExpression,
                "expected_boolean",
                "boolean",
                `a(${value})`,
                checkMessageExpression(schema.message, context)
            )}}`;
        case SchemaTag.Literal:
            return emitLiteralCheckAtSegment(
                schema.value,
                value,
                path,
                segmentExpression,
                issues,
                context
            );
        case SchemaTag.Union:
            /*
             * Primitive unions are cheap enough to inline. Complex union branches
             * already delegate through emitUnion and child predicate helpers.
             */
            return `if(!${emitUnion(schema.options, value, context)}){${emitIssueAtSegment(
                issues,
                path,
                segmentExpression,
                "expected_union",
                "union",
                `a(${value})`
            )}}`;
        default:
            return undefined;
    }
}

/**
 * @brief emit leaf check for a proven undefined value at one path segment.
 * @details Array and tuple holes are known to be undefined. Emitting only the
 * reachable type or literal issue keeps generated collectors smaller and avoids
 * cold constraint branches that V8 still has to parse.
 * @param schema Candidate leaf schema.
 * @param path Generated expression for the current diagnostic path.
 * @param segmentExpression Generated expression for the appended path segment.
 * @param issues Generated expression for the issue buffer.
 * @param context Shared code-generation context.
 * @returns Inline diagnostic source, or undefined when a full child collector is required.
 */
export function emitUndefinedLeafCheckAtSegment(
    schema: Schema,
    path: string,
    segmentExpression: string,
    issues: string,
    context: EmitContext
): string | undefined {
    switch (schema.tag) {
        case SchemaTag.Unknown:
            return "";
        case SchemaTag.Never:
            return emitIssueAtSegment(
                issues,
                path,
                segmentExpression,
                "expected_never",
                "never",
                stringLiteral("undefined")
            );
        case SchemaTag.String:
            return emitIssueAtSegment(
                issues,
                path,
                segmentExpression,
                "expected_string",
                "string",
                stringLiteral("undefined"),
                checkMessageExpression(schema.message, context)
            );
        case SchemaTag.Number:
            return emitIssueAtSegment(
                issues,
                path,
                segmentExpression,
                "expected_number",
                "number",
                stringLiteral("undefined"),
                checkMessageExpression(schema.message, context)
            );
        case SchemaTag.Date:
            return emitIssueAtSegment(
                issues,
                path,
                segmentExpression,
                "expected_date",
                "valid Date",
                stringLiteral("undefined"),
                checkMessageExpression(schema.message, context)
            );
        case SchemaTag.BigInt:
            return emitIssueAtSegment(
                issues,
                path,
                segmentExpression,
                "expected_bigint",
                "bigint",
                stringLiteral("undefined"),
                checkMessageExpression(schema.message, context)
            );
        case SchemaTag.Symbol:
            return emitIssueAtSegment(
                issues,
                path,
                segmentExpression,
                "expected_symbol",
                "symbol",
                stringLiteral("undefined"),
                checkMessageExpression(schema.message, context)
            );
        case SchemaTag.Boolean:
            return emitIssueAtSegment(
                issues,
                path,
                segmentExpression,
                "expected_boolean",
                "boolean",
                stringLiteral("undefined"),
                checkMessageExpression(schema.message, context)
            );
        case SchemaTag.Literal:
            return emitUndefinedLiteralCheckAtSegment(
                schema.value,
                path,
                segmentExpression,
                issues,
                context
            );
        default:
            return undefined;
    }
}

/**
 * @brief emit leaf check at two appended path segments.
 * @details Used by object-field array/record diagnostics to avoid push/pop path
 * mutation when both parent key and child key are known in generated source.
 * @param schema Candidate leaf schema.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current diagnostic path.
 * @param firstSegmentExpression Generated expression for the parent segment.
 * @param secondSegmentExpression Generated expression for the child segment.
 * @param issues Generated expression for the issue buffer.
 * @param context Shared code-generation context.
 * @returns Inline diagnostic source, or undefined when a full child collector is required.
 */
export function emitLeafCheckAtTwoSegments(
    schema: Schema,
    value: string,
    path: string,
    firstSegmentExpression: string,
    secondSegmentExpression: string,
    issues: string,
    context: EmitContext
): string | undefined {
    switch (schema.tag) {
        case SchemaTag.Unknown:
            return "";
        case SchemaTag.Never:
            return emitIssueAtTwoSegments(
                issues,
                path,
                firstSegmentExpression,
                secondSegmentExpression,
                "expected_never",
                "never",
                `a(${value})`
            );
        case SchemaTag.String:
            return emitStringCheckAtTwoSegments(
                schema,
                value,
                path,
                firstSegmentExpression,
                secondSegmentExpression,
                issues,
                context
            );
        case SchemaTag.Number:
            return emitNumberCheckAtTwoSegments(
                schema,
                value,
                path,
                firstSegmentExpression,
                secondSegmentExpression,
                issues,
                context
            );
        case SchemaTag.Date:
            if (schema.checks.length !== 0) {
                return undefined;
            }
            return `if(!dg(${value})){${emitIssueAtTwoSegments(
                issues,
                path,
                firstSegmentExpression,
                secondSegmentExpression,
                "expected_date",
                "valid Date",
                `a(${value})`,
                checkMessageExpression(schema.message, context)
            )}}`;
        case SchemaTag.BigInt:
            return emitBigIntCheckAtTwoSegments(
                schema,
                value,
                path,
                firstSegmentExpression,
                secondSegmentExpression,
                issues,
                context
            );
        case SchemaTag.Symbol:
            return `if(typeof ${value}!=="symbol"){${emitIssueAtTwoSegments(
                issues,
                path,
                firstSegmentExpression,
                secondSegmentExpression,
                "expected_symbol",
                "symbol",
                `a(${value})`,
                checkMessageExpression(schema.message, context)
            )}}`;
        case SchemaTag.Boolean:
            return `if(typeof ${value}!=="boolean"){${emitIssueAtTwoSegments(
                issues,
                path,
                firstSegmentExpression,
                secondSegmentExpression,
                "expected_boolean",
                "boolean",
                `a(${value})`,
                checkMessageExpression(schema.message, context)
            )}}`;
        case SchemaTag.Literal:
            return emitLiteralCheckAtTwoSegments(
                schema.value,
                value,
                path,
                firstSegmentExpression,
                secondSegmentExpression,
                issues,
                context
            );
        case SchemaTag.Union:
            return `if(!${emitUnion(schema.options, value, context)}){${emitIssueAtTwoSegments(
                issues,
                path,
                firstSegmentExpression,
                secondSegmentExpression,
                "expected_union",
                "union",
                `a(${value})`
            )}}`;
        default:
            return undefined;
    }
}

/**
 * @brief emit leaf check for a proven undefined value at two path segments.
 * @details Array and tuple holes under object fields are known to be undefined,
 * so the emitter can skip value reads and emit only reachable leaf issues.
 * @param schema Candidate leaf schema.
 * @param path Generated expression for the current diagnostic path.
 * @param firstSegmentExpression Generated expression for the parent segment.
 * @param secondSegmentExpression Generated expression for the child segment.
 * @param issues Generated expression for the issue buffer.
 * @param context Shared code-generation context.
 * @returns Inline diagnostic source, or undefined when a full child collector is required.
 */
export function emitUndefinedLeafCheckAtTwoSegments(
    schema: Schema,
    path: string,
    firstSegmentExpression: string,
    secondSegmentExpression: string,
    issues: string,
    context: EmitContext
): string | undefined {
    switch (schema.tag) {
        case SchemaTag.Unknown:
            return "";
        case SchemaTag.Never:
            return emitIssueAtTwoSegments(
                issues,
                path,
                firstSegmentExpression,
                secondSegmentExpression,
                "expected_never",
                "never",
                stringLiteral("undefined")
            );
        case SchemaTag.String:
            return emitIssueAtTwoSegments(
                issues,
                path,
                firstSegmentExpression,
                secondSegmentExpression,
                "expected_string",
                "string",
                stringLiteral("undefined"),
                checkMessageExpression(schema.message, context)
            );
        case SchemaTag.Number:
            return emitIssueAtTwoSegments(
                issues,
                path,
                firstSegmentExpression,
                secondSegmentExpression,
                "expected_number",
                "number",
                stringLiteral("undefined"),
                checkMessageExpression(schema.message, context)
            );
        case SchemaTag.Date:
            return emitIssueAtTwoSegments(
                issues,
                path,
                firstSegmentExpression,
                secondSegmentExpression,
                "expected_date",
                "valid Date",
                stringLiteral("undefined"),
                checkMessageExpression(schema.message, context)
            );
        case SchemaTag.BigInt:
            return emitIssueAtTwoSegments(
                issues,
                path,
                firstSegmentExpression,
                secondSegmentExpression,
                "expected_bigint",
                "bigint",
                stringLiteral("undefined"),
                checkMessageExpression(schema.message, context)
            );
        case SchemaTag.Symbol:
            return emitIssueAtTwoSegments(
                issues,
                path,
                firstSegmentExpression,
                secondSegmentExpression,
                "expected_symbol",
                "symbol",
                stringLiteral("undefined"),
                checkMessageExpression(schema.message, context)
            );
        case SchemaTag.Boolean:
            return emitIssueAtTwoSegments(
                issues,
                path,
                firstSegmentExpression,
                secondSegmentExpression,
                "expected_boolean",
                "boolean",
                stringLiteral("undefined"),
                checkMessageExpression(schema.message, context)
            );
        case SchemaTag.Literal:
            return emitUndefinedLiteralCheckAtTwoSegments(
                schema.value,
                path,
                firstSegmentExpression,
                secondSegmentExpression,
                issues,
                context
            );
        default:
            return undefined;
    }
}

/**
 * @brief emit string check at one appended path segment.
 * @param schema String schema with scalar checks.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current diagnostic path.
 * @param segmentExpression Generated expression for the appended path segment.
 * @param issues Generated expression for the issue buffer.
 * @param context Shared code-generation context.
 * @returns JavaScript source for one-segment string diagnostics.
 */
function emitStringCheckAtSegment(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.String }>,
    value: string,
    path: string,
    segmentExpression: string,
    issues: string,
    context: EmitContext
): string {
    const checks = schema.checks;
    if (checks.length === 0) {
        /*
         * No constraints means no else block is needed. The generated collector
         * stays as a single type branch.
         */
        return `if(typeof ${value}!=="string"){${emitIssueAtSegment(
            issues,
            path,
            segmentExpression,
            "expected_string",
            "string",
            `a(${value})`,
            checkMessageExpression(schema.message, context)
        )}}`;
    }
    const parts: string[] = [
        `if(typeof ${value}!=="string"){${emitIssueAtSegment(
            issues,
            path,
            segmentExpression,
            "expected_string",
            "string",
            `a(${value})`,
            checkMessageExpression(schema.message, context)
        )}}else{`
    ];
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case StringCheckTag.Min:
                parts.push(`if(${value}.length<${String(check.value)}){${emitIssueAtSegment(
                    issues,
                    path,
                    segmentExpression,
                    "expected_min_length",
                    `length >= ${String(check.value)}`,
                    `"length "+String(${value}.length)`,
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
            case StringCheckTag.Max:
                parts.push(`if(${value}.length>${String(check.value)}){${emitIssueAtSegment(
                    issues,
                    path,
                    segmentExpression,
                    "expected_max_length",
                    `length <= ${String(check.value)}`,
                    `"length "+String(${value}.length)`,
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
            case StringCheckTag.Regex:
                parts.push(emitPatternIssueAtSegment(
                    value,
                    path,
                    segmentExpression,
                    issues,
                    check.regex,
                    check.name,
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Uuid:
                parts.push(emitPatternIssueAtSegment(
                    value,
                    path,
                    segmentExpression,
                    issues,
                    UUID_PATTERN,
                    "uuid",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Email:
                parts.push(emitPatternIssueAtSegment(
                    value,
                    path,
                    segmentExpression,
                    issues,
                    EMAIL_PATTERN,
                    "email",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Url:
                parts.push(emitPatternIssueAtSegment(
                    value,
                    path,
                    segmentExpression,
                    issues,
                    URL_PATTERN,
                    "url",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.IsoDate:
                parts.push(emitPatternIssueAtSegment(
                    value,
                    path,
                    segmentExpression,
                    issues,
                    ISO_DATE_PATTERN,
                    "iso_date",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.IsoDateTime:
                parts.push(emitPatternIssueAtSegment(
                    value,
                    path,
                    segmentExpression,
                    issues,
                    ISO_DATETIME_PATTERN,
                    "iso_datetime",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Ulid:
                parts.push(emitPatternIssueAtSegment(
                    value,
                    path,
                    segmentExpression,
                    issues,
                    ULID_PATTERN,
                    "ulid",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Xid:
                parts.push(emitPatternIssueAtSegment(
                    value,
                    path,
                    segmentExpression,
                    issues,
                    XID_PATTERN,
                    "xid",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Ksuid:
                parts.push(emitPatternIssueAtSegment(
                    value,
                    path,
                    segmentExpression,
                    issues,
                    KSUID_PATTERN,
                    "ksuid",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Ipv4:
                parts.push(emitPatternIssueAtSegment(
                    value,
                    path,
                    segmentExpression,
                    issues,
                    IPV4_PATTERN,
                    "ipv4",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Ipv6:
                parts.push(emitPatternIssueAtSegment(
                    value,
                    path,
                    segmentExpression,
                    issues,
                    IPV6_PATTERN,
                    "ipv6",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
        }
    }
    parts.push("}");
    return parts.join("");
}

/**
 * @brief emit string check at two appended path segments.
 * @param schema String schema with scalar checks.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current diagnostic path.
 * @param firstSegmentExpression Generated expression for the parent segment.
 * @param secondSegmentExpression Generated expression for the child segment.
 * @param issues Generated expression for the issue buffer.
 * @param context Shared code-generation context.
 * @returns JavaScript source for two-segment string diagnostics.
 */
function emitStringCheckAtTwoSegments(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.String }>,
    value: string,
    path: string,
    firstSegmentExpression: string,
    secondSegmentExpression: string,
    issues: string,
    context: EmitContext
): string {
    const checks = schema.checks;
    if (checks.length === 0) {
        return `if(typeof ${value}!=="string"){${emitIssueAtTwoSegments(
            issues,
            path,
            firstSegmentExpression,
            secondSegmentExpression,
            "expected_string",
            "string",
            `a(${value})`,
            checkMessageExpression(schema.message, context)
        )}}`;
    }
    const parts: string[] = [
        `if(typeof ${value}!=="string"){${emitIssueAtTwoSegments(
            issues,
            path,
            firstSegmentExpression,
            secondSegmentExpression,
            "expected_string",
            "string",
            `a(${value})`,
            checkMessageExpression(schema.message, context)
        )}}else{`
    ];
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case StringCheckTag.Min:
                parts.push(`if(${value}.length<${String(check.value)}){${emitIssueAtTwoSegments(
                    issues,
                    path,
                    firstSegmentExpression,
                    secondSegmentExpression,
                    "expected_min_length",
                    `length >= ${String(check.value)}`,
                    `"length "+String(${value}.length)`,
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
            case StringCheckTag.Max:
                parts.push(`if(${value}.length>${String(check.value)}){${emitIssueAtTwoSegments(
                    issues,
                    path,
                    firstSegmentExpression,
                    secondSegmentExpression,
                    "expected_max_length",
                    `length <= ${String(check.value)}`,
                    `"length "+String(${value}.length)`,
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
            case StringCheckTag.Regex:
                parts.push(emitPatternIssueAtTwoSegments(
                    value,
                    path,
                    firstSegmentExpression,
                    secondSegmentExpression,
                    issues,
                    check.regex,
                    check.name,
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Uuid:
                parts.push(emitPatternIssueAtTwoSegments(
                    value,
                    path,
                    firstSegmentExpression,
                    secondSegmentExpression,
                    issues,
                    UUID_PATTERN,
                    "uuid",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Email:
                parts.push(emitPatternIssueAtTwoSegments(
                    value,
                    path,
                    firstSegmentExpression,
                    secondSegmentExpression,
                    issues,
                    EMAIL_PATTERN,
                    "email",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Url:
                parts.push(emitPatternIssueAtTwoSegments(
                    value,
                    path,
                    firstSegmentExpression,
                    secondSegmentExpression,
                    issues,
                    URL_PATTERN,
                    "url",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.IsoDate:
                parts.push(emitPatternIssueAtTwoSegments(
                    value,
                    path,
                    firstSegmentExpression,
                    secondSegmentExpression,
                    issues,
                    ISO_DATE_PATTERN,
                    "iso_date",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.IsoDateTime:
                parts.push(emitPatternIssueAtTwoSegments(
                    value,
                    path,
                    firstSegmentExpression,
                    secondSegmentExpression,
                    issues,
                    ISO_DATETIME_PATTERN,
                    "iso_datetime",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Ulid:
                parts.push(emitPatternIssueAtTwoSegments(
                    value,
                    path,
                    firstSegmentExpression,
                    secondSegmentExpression,
                    issues,
                    ULID_PATTERN,
                    "ulid",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Xid:
                parts.push(emitPatternIssueAtTwoSegments(
                    value,
                    path,
                    firstSegmentExpression,
                    secondSegmentExpression,
                    issues,
                    XID_PATTERN,
                    "xid",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Ksuid:
                parts.push(emitPatternIssueAtTwoSegments(
                    value,
                    path,
                    firstSegmentExpression,
                    secondSegmentExpression,
                    issues,
                    KSUID_PATTERN,
                    "ksuid",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Ipv4:
                parts.push(emitPatternIssueAtTwoSegments(
                    value,
                    path,
                    firstSegmentExpression,
                    secondSegmentExpression,
                    issues,
                    IPV4_PATTERN,
                    "ipv4",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
            case StringCheckTag.Ipv6:
                parts.push(emitPatternIssueAtTwoSegments(
                    value,
                    path,
                    firstSegmentExpression,
                    secondSegmentExpression,
                    issues,
                    IPV6_PATTERN,
                    "ipv6",
                    context,
                    checkMessageExpression(check.message, context)
                ));
                break;
        }
    }
    parts.push("}");
    return parts.join("");
}

/**
 * @brief emit number check.
 * @param schema Number schema with scalar checks.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current diagnostic path.
 * @param issues Generated expression for the issue buffer.
 * @returns JavaScript source for root number diagnostics.
 */
export function emitNumberCheck(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Number }>,
    value: string,
    path: string,
    issues: string,
    context: EmitContext
): string {
    const parts: string[] = [
        `if(typeof ${value}!=="number"||!Number.isFinite(${value})){${emitIssue(
            issues,
            path,
            "expected_number",
            "number",
            `a(${value})`,
            checkMessageExpression(schema.message, context)
        )}return;}`
    ];
    const checks = schema.checks;
    /*
     * Bounds and integer diagnostics are emitted only after the finite-number
     * guard, so generated code never compares non-number values to bounds.
     */
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case NumberCheckTag.Integer:
                parts.push(`if(!Number.isInteger(${value})){${emitIssueExpr(
                    issues,
                    path,
                    "expected_integer",
                    stringLiteral("integer"),
                    stringLiteral("number"),
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
            case NumberCheckTag.Gte:
                parts.push(`if(${value}<${String(check.value)}){${emitIssue(
                    issues,
                    path,
                    "expected_gte",
                    `>= ${String(check.value)}`,
                    `String(${value})`,
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
            case NumberCheckTag.Lte:
                parts.push(`if(${value}>${String(check.value)}){${emitIssue(
                    issues,
                    path,
                    "expected_lte",
                    `<= ${String(check.value)}`,
                    `String(${value})`,
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
            case NumberCheckTag.Gt:
                parts.push(`if(${value}<=${String(check.value)}){${emitIssue(
                    issues,
                    path,
                    "expected_gt",
                    `> ${String(check.value)}`,
                    `String(${value})`,
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
            case NumberCheckTag.Lt:
                parts.push(`if(${value}>=${String(check.value)}){${emitIssue(
                    issues,
                    path,
                    "expected_lt",
                    `< ${String(check.value)}`,
                    `String(${value})`,
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
            case NumberCheckTag.MultipleOf:
                parts.push(`if(!${numberMultipleOfExpression(value, check.value)}){${emitIssue(
                    issues,
                    path,
                    "expected_multiple_of",
                    `multiple of ${String(check.value)}`,
                    `String(${value})`,
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
        }
    }
    return parts.join("");
}

/**
 * @brief emit bigint check.
 * @details BigInt constraints use source-level BigInt literals so generated
 * validators do not need side-table reads for scalar bounds.
 * @param schema BigInt schema with scalar checks.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current diagnostic path.
 * @param issues Generated expression for the issue buffer.
 * @returns JavaScript source for root BigInt diagnostics.
 */
export function emitBigIntCheck(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.BigInt }>,
    value: string,
    path: string,
    issues: string,
    context: EmitContext
): string {
    const parts: string[] = [
        `if(typeof ${value}!=="bigint"){${emitIssue(
            issues,
            path,
            "expected_bigint",
            "bigint",
            `a(${value})`,
            checkMessageExpression(schema.message, context)
        )}return;}`
    ];
    emitBigIntConstraints(schema, value, (condition, code, expected, message) => {
        parts.push(`if(${condition}){${emitIssue(
            issues,
            path,
            code,
            expected,
            `String(${value})+"n"`,
            checkMessageExpression(message, context)
        )}}`);
    });
    return parts.join("");
}

/**
 * @brief emit bigint check at one appended path segment.
 * @param schema BigInt schema with scalar checks.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current diagnostic path.
 * @param segmentExpression Generated expression for the appended segment.
 * @param issues Generated expression for the issue buffer.
 * @returns JavaScript source for one-segment BigInt diagnostics.
 */
function emitBigIntCheckAtSegment(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.BigInt }>,
    value: string,
    path: string,
    segmentExpression: string,
    issues: string,
    context: EmitContext
): string {
    const checks = schema.checks;
    if (checks.length === 0) {
        return `if(typeof ${value}!=="bigint"){${emitIssueAtSegment(
            issues,
            path,
            segmentExpression,
            "expected_bigint",
            "bigint",
            `a(${value})`,
            checkMessageExpression(schema.message, context)
        )}}`;
    }
    const parts: string[] = [
        `if(typeof ${value}!=="bigint"){${emitIssueAtSegment(
            issues,
            path,
            segmentExpression,
            "expected_bigint",
            "bigint",
            `a(${value})`,
            checkMessageExpression(schema.message, context)
        )}}else{`
    ];
    emitBigIntConstraints(schema, value, (condition, code, expected, message) => {
        parts.push(`if(${condition}){${emitIssueAtSegment(
            issues,
            path,
            segmentExpression,
            code,
            expected,
            `String(${value})+"n"`,
            checkMessageExpression(message, context)
        )}}`);
    });
    parts.push("}");
    return parts.join("");
}

/**
 * @brief emit bigint check at two appended path segments.
 * @param schema BigInt schema with scalar checks.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current diagnostic path.
 * @param firstSegmentExpression Generated expression for the parent segment.
 * @param secondSegmentExpression Generated expression for the child segment.
 * @param issues Generated expression for the issue buffer.
 * @returns JavaScript source for two-segment BigInt diagnostics.
 */
function emitBigIntCheckAtTwoSegments(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.BigInt }>,
    value: string,
    path: string,
    firstSegmentExpression: string,
    secondSegmentExpression: string,
    issues: string,
    context: EmitContext
): string {
    const checks = schema.checks;
    if (checks.length === 0) {
        return `if(typeof ${value}!=="bigint"){${emitIssueAtTwoSegments(
            issues,
            path,
            firstSegmentExpression,
            secondSegmentExpression,
            "expected_bigint",
            "bigint",
            `a(${value})`,
            checkMessageExpression(schema.message, context)
        )}}`;
    }
    const parts: string[] = [
        `if(typeof ${value}!=="bigint"){${emitIssueAtTwoSegments(
            issues,
            path,
            firstSegmentExpression,
            secondSegmentExpression,
            "expected_bigint",
            "bigint",
            `a(${value})`,
            checkMessageExpression(schema.message, context)
        )}}else{`
    ];
    emitBigIntConstraints(schema, value, (condition, code, expected, message) => {
        parts.push(`if(${condition}){${emitIssueAtTwoSegments(
            issues,
            path,
            firstSegmentExpression,
            secondSegmentExpression,
            code,
            expected,
            `String(${value})+"n"`,
            checkMessageExpression(message, context)
        )}}`);
    });
    parts.push("}");
    return parts.join("");
}

/**
 * @brief Emit every BigInt scalar constraint through a small callback.
 * @details The callback keeps root, one-segment, and two-segment paths aligned
 * without duplicating the constraint switch.
 */
function emitBigIntConstraints(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.BigInt }>,
    value: string,
    emit: (
        condition: string,
        code: string,
        expected: string,
        message: string | undefined
    ) => void
): void {
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        const literal = bigintSource(check.value);
        const expectedValue = bigintDisplay(check.value);
        switch (check.tag) {
            case BigIntCheckTag.Gte:
                emit(`${value}<${literal}`, "expected_gte", `>= ${expectedValue}`, check.message);
                break;
            case BigIntCheckTag.Lte:
                emit(`${value}>${literal}`, "expected_lte", `<= ${expectedValue}`, check.message);
                break;
            case BigIntCheckTag.Gt:
                emit(`${value}<=${literal}`, "expected_gt", `> ${expectedValue}`, check.message);
                break;
            case BigIntCheckTag.Lt:
                emit(`${value}>=${literal}`, "expected_lt", `< ${expectedValue}`, check.message);
                break;
            case BigIntCheckTag.MultipleOf:
                emit(
                    `${value}%${literal}!==0n`,
                    "expected_multiple_of",
                    `multiple of ${expectedValue}`,
                    check.message
                );
                break;
        }
    }
}

/**
 * @brief Render a BigInt literal for generated JavaScript source.
 * @details Negative values are parenthesized so modulo and comparison sites do
 * not depend on unary precedence when snippets are concatenated.
 */
function bigintSource(value: bigint): string {
    return value < 0n ? `(${String(value)}n)` : `${String(value)}n`;
}

/**
 * @brief Render a BigInt for user-facing diagnostic text.
 */
function bigintDisplay(value: bigint): string {
    return `${String(value)}n`;
}

/**
 * @brief emit number check at one appended path segment.
 * @param schema Number schema with scalar checks.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current diagnostic path.
 * @param segmentExpression Generated expression for the appended path segment.
 * @param issues Generated expression for the issue buffer.
 * @returns JavaScript source for one-segment number diagnostics.
 */
function emitNumberCheckAtSegment(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Number }>,
    value: string,
    path: string,
    segmentExpression: string,
    issues: string,
    context: EmitContext
): string {
    const checks = schema.checks;
    if (checks.length === 0) {
        /*
         * Plain number schemas need only the finite-number guard. Emitting an
         * else block would add cold code with no diagnostic work.
         */
        return `if(typeof ${value}!=="number"||!Number.isFinite(${value})){${emitIssueAtSegment(
            issues,
            path,
            segmentExpression,
            "expected_number",
            "number",
            `a(${value})`,
            checkMessageExpression(schema.message, context)
        )}}`;
    }
    const parts: string[] = [
        `if(typeof ${value}!=="number"||!Number.isFinite(${value})){${emitIssueAtSegment(
            issues,
            path,
            segmentExpression,
            "expected_number",
            "number",
            `a(${value})`,
            checkMessageExpression(schema.message, context)
        )}}else{`
    ];
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case NumberCheckTag.Integer:
                parts.push(`if(!Number.isInteger(${value})){${emitIssueExprAtSegment(
                    issues,
                    path,
                    segmentExpression,
                    "expected_integer",
                    stringLiteral("integer"),
                    stringLiteral("number"),
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
            case NumberCheckTag.Gte:
                parts.push(`if(${value}<${String(check.value)}){${emitIssueAtSegment(
                    issues,
                    path,
                    segmentExpression,
                    "expected_gte",
                    `>= ${String(check.value)}`,
                    `String(${value})`,
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
            case NumberCheckTag.Lte:
                parts.push(`if(${value}>${String(check.value)}){${emitIssueAtSegment(
                    issues,
                    path,
                    segmentExpression,
                    "expected_lte",
                    `<= ${String(check.value)}`,
                    `String(${value})`,
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
            case NumberCheckTag.Gt:
                parts.push(`if(${value}<=${String(check.value)}){${emitIssueAtSegment(
                    issues,
                    path,
                    segmentExpression,
                    "expected_gt",
                    `> ${String(check.value)}`,
                    `String(${value})`,
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
            case NumberCheckTag.Lt:
                parts.push(`if(${value}>=${String(check.value)}){${emitIssueAtSegment(
                    issues,
                    path,
                    segmentExpression,
                    "expected_lt",
                    `< ${String(check.value)}`,
                    `String(${value})`,
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
            case NumberCheckTag.MultipleOf:
                parts.push(`if(!${numberMultipleOfExpression(value, check.value)}){${emitIssueAtSegment(
                    issues,
                    path,
                    segmentExpression,
                    "expected_multiple_of",
                    `multiple of ${String(check.value)}`,
                    `String(${value})`,
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
        }
    }
    parts.push("}");
    return parts.join("");
}

/**
 * @brief emit number check at two appended path segments.
 * @param schema Number schema with scalar checks.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current diagnostic path.
 * @param firstSegmentExpression Generated expression for the parent segment.
 * @param secondSegmentExpression Generated expression for the child segment.
 * @param issues Generated expression for the issue buffer.
 * @returns JavaScript source for two-segment number diagnostics.
 */
function emitNumberCheckAtTwoSegments(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Number }>,
    value: string,
    path: string,
    firstSegmentExpression: string,
    secondSegmentExpression: string,
    issues: string,
    context: EmitContext
): string {
    const checks = schema.checks;
    if (checks.length === 0) {
        return `if(typeof ${value}!=="number"||!Number.isFinite(${value})){${emitIssueAtTwoSegments(
            issues,
            path,
            firstSegmentExpression,
            secondSegmentExpression,
            "expected_number",
            "number",
            `a(${value})`,
            checkMessageExpression(schema.message, context)
        )}}`;
    }
    const parts: string[] = [
        `if(typeof ${value}!=="number"||!Number.isFinite(${value})){${emitIssueAtTwoSegments(
            issues,
            path,
            firstSegmentExpression,
            secondSegmentExpression,
            "expected_number",
            "number",
            `a(${value})`,
            checkMessageExpression(schema.message, context)
        )}}else{`
    ];
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case NumberCheckTag.Integer:
                parts.push(`if(!Number.isInteger(${value})){${emitIssueExprAtTwoSegments(
                    issues,
                    path,
                    firstSegmentExpression,
                    secondSegmentExpression,
                    "expected_integer",
                    stringLiteral("integer"),
                    stringLiteral("number"),
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
            case NumberCheckTag.Gte:
                parts.push(`if(${value}<${String(check.value)}){${emitIssueAtTwoSegments(
                    issues,
                    path,
                    firstSegmentExpression,
                    secondSegmentExpression,
                    "expected_gte",
                    `>= ${String(check.value)}`,
                    `String(${value})`,
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
            case NumberCheckTag.Lte:
                parts.push(`if(${value}>${String(check.value)}){${emitIssueAtTwoSegments(
                    issues,
                    path,
                    firstSegmentExpression,
                    secondSegmentExpression,
                    "expected_lte",
                    `<= ${String(check.value)}`,
                    `String(${value})`,
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
            case NumberCheckTag.Gt:
                parts.push(`if(${value}<=${String(check.value)}){${emitIssueAtTwoSegments(
                    issues,
                    path,
                    firstSegmentExpression,
                    secondSegmentExpression,
                    "expected_gt",
                    `> ${String(check.value)}`,
                    `String(${value})`,
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
            case NumberCheckTag.Lt:
                parts.push(`if(${value}>=${String(check.value)}){${emitIssueAtTwoSegments(
                    issues,
                    path,
                    firstSegmentExpression,
                    secondSegmentExpression,
                    "expected_lt",
                    `< ${String(check.value)}`,
                    `String(${value})`,
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
            case NumberCheckTag.MultipleOf:
                parts.push(`if(!${numberMultipleOfExpression(value, check.value)}){${emitIssueAtTwoSegments(
                    issues,
                    path,
                    firstSegmentExpression,
                    secondSegmentExpression,
                    "expected_multiple_of",
                    `multiple of ${String(check.value)}`,
                    `String(${value})`,
                    checkMessageExpression(check.message, context)
                )}}`);
                break;
        }
    }
    parts.push("}");
    return parts.join("");
}

/**
 * @brief emit literal check.
 * @param value Literal expected by the schema.
 * @param checked Generated expression for the candidate value.
 * @param path Generated expression for the current diagnostic path.
 * @param issues Generated expression for the issue buffer.
 * @param context Shared code-generation context.
 * @returns JavaScript source for root literal diagnostics.
 */
export function emitLiteralCheck(
    value: LiteralValue,
    checked: string,
    path: string,
    issues: string,
    context: EmitContext
): string {
    const index = pushLiteral(context, value);
    /*
     * Object.is preserves JavaScript literal edge cases such as NaN and -0.
     * The expected value stays in the literal side table rather than source text.
     */
    return `if(!Object.is(${checked},l[${String(index)}])){${emitIssueExpr(
        issues,
        path,
        "expected_literal",
        `le(l[${String(index)}])`,
        `a(${checked})`
    )}}`;
}

/**
 * @brief emit literal check at one appended path segment.
 * @param value Literal expected by the schema.
 * @param checked Generated expression for the candidate value.
 * @param path Generated expression for the current diagnostic path.
 * @param segmentExpression Generated expression for the appended path segment.
 * @param issues Generated expression for the issue buffer.
 * @param context Shared code-generation context.
 * @returns JavaScript source for one-segment literal diagnostics.
 */
function emitLiteralCheckAtSegment(
    value: LiteralValue,
    checked: string,
    path: string,
    segmentExpression: string,
    issues: string,
    context: EmitContext
): string {
    const index = pushLiteral(context, value);
    return `if(!Object.is(${checked},l[${String(index)}])){${emitIssueExprAtSegment(
        issues,
        path,
        segmentExpression,
        "expected_literal",
        `le(l[${String(index)}])`,
        `a(${checked})`
    )}}`;
}

/**
 * @brief emit literal check at two appended path segments.
 * @param value Literal expected by the schema.
 * @param checked Generated expression for the candidate value.
 * @param path Generated expression for the current diagnostic path.
 * @param firstSegmentExpression Generated expression for the parent segment.
 * @param secondSegmentExpression Generated expression for the child segment.
 * @param issues Generated expression for the issue buffer.
 * @param context Shared code-generation context.
 * @returns JavaScript source for two-segment literal diagnostics.
 */
function emitLiteralCheckAtTwoSegments(
    value: LiteralValue,
    checked: string,
    path: string,
    firstSegmentExpression: string,
    secondSegmentExpression: string,
    issues: string,
    context: EmitContext
): string {
    const index = pushLiteral(context, value);
    return `if(!Object.is(${checked},l[${String(index)}])){${emitIssueExprAtTwoSegments(
        issues,
        path,
        firstSegmentExpression,
        secondSegmentExpression,
        "expected_literal",
        `le(l[${String(index)}])`,
        `a(${checked})`
    )}}`;
}

/**
 * @brief emit undefined literal check at one appended path segment.
 * @param value Literal expected by the schema.
 * @param path Generated expression for the current diagnostic path.
 * @param segmentExpression Generated expression for the appended path segment.
 * @param issues Generated expression for the issue buffer.
 * @param context Shared code-generation context.
 * @returns Empty source when undefined is the expected literal, otherwise an issue.
 */
function emitUndefinedLiteralCheckAtSegment(
    value: LiteralValue,
    path: string,
    segmentExpression: string,
    issues: string,
    context: EmitContext
): string {
    if (value === undefined) {
        /*
         * A sparse hole has already produced the exact expected literal. There is
         * no diagnostic work left to emit.
         */
        return "";
    }
    const index = pushLiteral(context, value);
    return emitIssueExprAtSegment(
        issues,
        path,
        segmentExpression,
        "expected_literal",
        `le(l[${String(index)}])`,
        stringLiteral("undefined")
    );
}

/**
 * @brief emit undefined literal check at two appended path segments.
 * @param value Literal expected by the schema.
 * @param path Generated expression for the current diagnostic path.
 * @param firstSegmentExpression Generated expression for the parent segment.
 * @param secondSegmentExpression Generated expression for the child segment.
 * @param issues Generated expression for the issue buffer.
 * @param context Shared code-generation context.
 * @returns Empty source when undefined is the expected literal, otherwise an issue.
 */
function emitUndefinedLiteralCheckAtTwoSegments(
    value: LiteralValue,
    path: string,
    firstSegmentExpression: string,
    secondSegmentExpression: string,
    issues: string,
    context: EmitContext
): string {
    if (value === undefined) {
        return "";
    }
    const index = pushLiteral(context, value);
    return emitIssueExprAtTwoSegments(
        issues,
        path,
        firstSegmentExpression,
        secondSegmentExpression,
        "expected_literal",
        `le(l[${String(index)}])`,
        stringLiteral("undefined")
    );
}

/**
 * @brief Emit the message operand for a schema check.
 */
function checkMessageExpression(
    message: string | undefined,
    context: EmitContext
): string | undefined {
    return message === undefined ? undefined : stringRef(context, message);
}
