/**
 * @file emit-scalar.ts
 * @brief Scalar TypeSea schema to JSON Schema emitters.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
 */

import {
    FileCheckTag,
    NumberCheckTag,
    SchemaTag,
    StringCheckTag
} from "../kind/index.js";
import type { PathSegment } from "../issue/index.js";
import {
    EMAIL_PATTERN,
    IPV4_PATTERN,
    IPV6_PATTERN,
    ISO_DATETIME_PATTERN,
    ISO_DATE_PATTERN,
    KSUID_PATTERN,
    URL_PATTERN,
    UUID_PATTERN,
    type LiteralValue,
    type Schema
} from "../schema/index.js";
import { emitUnrepresentableJsonSchema } from "./issue.js";
import type {
    JsonSchema,
    JsonSchemaExportIssue,
    JsonSchemaOutputTarget,
    JsonSchemaUnrepresentableMode,
    MutableJsonSchemaObject
} from "./types.js";

/**
 * @brief Emit TypeSea string checks into JSON Schema string keywords.
 * @details Repeated min and max checks collapse to the strongest bounds.
 * Regular expressions are emitted only when their flags can be preserved by the
 * JSON Schema `pattern` keyword; unsupported flags are reported as issues.
 * @param schema String schema to emit.
 * @param path Mutable issue path stack owned by the export walk.
 * @param issues Mutable export issue buffer.
 * @returns JSON Schema string object.
 */
export function emitString(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.String }>,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    unrepresentable: JsonSchemaUnrepresentableMode
): JsonSchema | undefined {
    const result: MutableJsonSchemaObject = { type: "string" };
    const patterns: string[] = [];
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case StringCheckTag.Min:
                result.minLength = result.minLength === undefined
                    ? check.value
                    : Math.max(result.minLength, check.value);
                break;
            case StringCheckTag.Max:
                result.maxLength = result.maxLength === undefined
                    ? check.value
                    : Math.min(result.maxLength, check.value);
                break;
            case StringCheckTag.Regex:
                if (check.regex.flags.length !== 0) {
                    return emitUnrepresentableJsonSchema(
                        path,
                        issues,
                        unrepresentable,
                        "unsupported_regex_flags",
                        "JSON Schema pattern cannot preserve RegExp flags"
                    );
                } else {
                    patterns.push(check.regex.source);
                }
                break;
            case StringCheckTag.Uuid:
                result.format = "uuid";
                patterns.push(UUID_PATTERN.source);
                break;
            case StringCheckTag.Email:
                result.format = "email";
                patterns.push(EMAIL_PATTERN.source);
                break;
            case StringCheckTag.Url:
                result.format = "uri";
                patterns.push(URL_PATTERN.source);
                break;
            case StringCheckTag.IsoDate:
                result.format = "date";
                patterns.push(ISO_DATE_PATTERN.source);
                break;
            case StringCheckTag.IsoDateTime:
                result.format = "date-time";
                patterns.push(ISO_DATETIME_PATTERN.source);
                break;
            case StringCheckTag.Ulid:
                patterns.push("^[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25}$");
                break;
            case StringCheckTag.Xid:
                result.format = "xid";
                patterns.push("^[0-9a-vA-V]{20}$");
                break;
            case StringCheckTag.Ksuid:
                result.format = "ksuid";
                patterns.push(KSUID_PATTERN.source);
                break;
            case StringCheckTag.Ipv4:
                result.format = "ipv4";
                patterns.push(IPV4_PATTERN.source);
                break;
            case StringCheckTag.Ipv6:
                result.format = "ipv6";
                patterns.push(IPV6_PATTERN.source);
                break;
        }
    }
    appendStringPatterns(result, patterns);
    return result;
}

/**
 * @brief Emit TypeSea number checks into JSON Schema number keywords.
 * @details Integer checks narrow the emitted type, while finite lower and upper
 * bounds collapse to the strongest minimum and maximum. Non-finite bounds are
 * rejected because JSON Schema cannot preserve them portably.
 * @param schema Number schema to emit.
 * @param path Mutable issue path stack owned by the export walk.
 * @param issues Mutable export issue buffer.
 * @returns JSON Schema number object, or undefined when bounds are unsupported.
 */
export function emitNumber(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Number }>,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    target: JsonSchemaOutputTarget,
    unrepresentable: JsonSchemaUnrepresentableMode
): JsonSchema | undefined {
    const before = issues.length;
    const result: MutableJsonSchemaObject = { type: "number" };
    const checks = schema.checks;
    let lower: NumberBound | undefined;
    let upper: NumberBound | undefined;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case NumberCheckTag.Integer:
                result.type = "integer";
                break;
            case NumberCheckTag.Gte:
                if (!Number.isFinite(check.value)) {
                    return emitUnrepresentableJsonSchema(
                        path,
                        issues,
                        unrepresentable,
                        "unsupported_number_bound",
                        "Number bounds must be finite"
                    );
                } else {
                    lower = selectLowerBound(lower, {
                        value: check.value,
                        exclusive: false
                    });
                }
                break;
            case NumberCheckTag.Lte:
                if (!Number.isFinite(check.value)) {
                    return emitUnrepresentableJsonSchema(
                        path,
                        issues,
                        unrepresentable,
                        "unsupported_number_bound",
                        "Number bounds must be finite"
                    );
                } else {
                    upper = selectUpperBound(upper, {
                        value: check.value,
                        exclusive: false
                    });
                }
                break;
            case NumberCheckTag.Gt:
                if (!Number.isFinite(check.value)) {
                    return emitUnrepresentableJsonSchema(
                        path,
                        issues,
                        unrepresentable,
                        "unsupported_number_bound",
                        "Number bounds must be finite"
                    );
                } else {
                    lower = selectLowerBound(lower, {
                        value: check.value,
                        exclusive: true
                    });
                }
                break;
            case NumberCheckTag.Lt:
                if (!Number.isFinite(check.value)) {
                    return emitUnrepresentableJsonSchema(
                        path,
                        issues,
                        unrepresentable,
                        "unsupported_number_bound",
                        "Number bounds must be finite"
                    );
                } else {
                    upper = selectUpperBound(upper, {
                        value: check.value,
                        exclusive: true
                    });
                }
                break;
            case NumberCheckTag.MultipleOf:
                if (!Number.isFinite(check.value) || check.value <= 0) {
                    return emitUnrepresentableJsonSchema(
                        path,
                        issues,
                        unrepresentable,
                        "unsupported_number_bound",
                        "multipleOf must be positive and finite"
                    );
                } else {
                    result.multipleOf = result.multipleOf ?? check.value;
                }
                break;
        }
    }
    if (issues.length !== before) {
        return undefined;
    }
    applyNumberBounds(result, lower, upper, target);
    return result;
}

/**
 * @brief Emit TypeSea File checks as OpenAPI-friendly binary string annotations.
 * @details Runtime validation still expects a JavaScript File object. JSON
 * Schema has no native File value, so export follows the OpenAPI convention of
 * representing file uploads as binary strings with optional size and media
 * annotations.
 */
export function emitFile(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.File }>
): JsonSchema {
    const result: MutableJsonSchemaObject = {
        type: "string",
        format: "binary",
        contentEncoding: "binary"
    };
    const mediaTypes: string[] = [];
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case FileCheckTag.Min:
                result.minLength = result.minLength === undefined
                    ? check.value
                    : Math.max(result.minLength, check.value);
                break;
            case FileCheckTag.Max:
                result.maxLength = result.maxLength === undefined
                    ? check.value
                    : Math.min(result.maxLength, check.value);
                break;
            case FileCheckTag.Mime:
                appendFileMediaTypes(mediaTypes, check.values);
                break;
        }
    }
    if (mediaTypes.length === 0) {
        return result;
    }
    if (mediaTypes.length === 1) {
        result.contentMediaType = mediaTypes[0] ?? "application/octet-stream";
        return result;
    }
    const alternatives = new Array<JsonSchema>(mediaTypes.length);
    for (let index = 0; index < mediaTypes.length; index += 1) {
        alternatives[index] = {
            ...result,
            contentMediaType: mediaTypes[index] ?? "application/octet-stream"
        };
    }
    return {
        anyOf: alternatives
    };
}

/**
 * @brief Append unique MIME annotations in declaration order.
 */
function appendFileMediaTypes(
    target: string[],
    values: readonly string[]
): void {
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value === undefined || target.includes(value)) {
            continue;
        }
        target.push(value);
    }
}

interface NumberBound {
    readonly value: number;
    readonly exclusive: boolean;
}

/**
 * @brief Keep the strongest lower number bound.
 * @details A larger value dominates; at the same value exclusive dominates
 * inclusive because it accepts a strict subset.
 */
function selectLowerBound(
    current: NumberBound | undefined,
    candidate: NumberBound
): NumberBound {
    if (current === undefined ||
        candidate.value > current.value ||
        (candidate.value === current.value && candidate.exclusive && !current.exclusive)) {
        return candidate;
    }
    return current;
}

/**
 * @brief Keep the strongest upper number bound.
 * @details A smaller value dominates; at the same value exclusive dominates
 * inclusive because it accepts a strict subset.
 */
function selectUpperBound(
    current: NumberBound | undefined,
    candidate: NumberBound
): NumberBound {
    if (current === undefined ||
        candidate.value < current.value ||
        (candidate.value === current.value && candidate.exclusive && !current.exclusive)) {
        return candidate;
    }
    return current;
}

/**
 * @brief Emit number bounds using the selected JSON Schema target vocabulary.
 * @details Draft-04 encodes exclusive bounds as boolean flags attached to
 * `minimum` and `maximum`; newer drafts put the bound directly on the
 * exclusive keyword.
 */
function applyNumberBounds(
    result: MutableJsonSchemaObject,
    lower: NumberBound | undefined,
    upper: NumberBound | undefined,
    target: JsonSchemaOutputTarget
): void {
    if (target === "draft-04") {
        applyDraft04NumberBounds(result, lower, upper);
        return;
    }
    if (lower !== undefined) {
        if (lower.exclusive) {
            result.exclusiveMinimum = lower.value;
        } else {
            result.minimum = lower.value;
        }
    }
    if (upper !== undefined) {
        if (upper.exclusive) {
            result.exclusiveMaximum = upper.value;
        } else {
            result.maximum = upper.value;
        }
    }
}

/**
 * @brief Emit legacy draft-04 number bound keywords.
 */
function applyDraft04NumberBounds(
    result: MutableJsonSchemaObject,
    lower: NumberBound | undefined,
    upper: NumberBound | undefined
): void {
    if (lower !== undefined) {
        result.minimum = lower.value;
        if (lower.exclusive) {
            result.exclusiveMinimum = true;
        }
    }
    if (upper !== undefined) {
        result.maximum = upper.value;
        if (upper.exclusive) {
            result.exclusiveMaximum = true;
        }
    }
}

/**
 * @brief Emit a literal schema as a JSON Schema `const` value.
 * @details Only JSON-compatible literals are accepted. Undefined, bigint,
 * symbol, NaN, infinity, and negative zero have no faithful JSON Schema literal
 * encoding, so they become export issues instead of weakened output.
 * @param value Literal value carried by the TypeSea schema.
 * @param path Mutable issue path stack owned by the export walk.
 * @param issues Mutable export issue buffer.
 * @returns JSON Schema const object, or undefined for unsupported literals.
 */
export function emitLiteral(
    value: LiteralValue,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    target: JsonSchemaOutputTarget,
    unrepresentable: JsonSchemaUnrepresentableMode
): JsonSchema | undefined {
    if (value === undefined) {
        return emitUnrepresentableJsonSchema(
            path,
            issues,
            unrepresentable,
            "unsupported_undefined",
            "JSON Schema has no undefined literal"
        );
    }
    if (typeof value === "bigint") {
        return emitUnrepresentableJsonSchema(
            path,
            issues,
            unrepresentable,
            "unsupported_bigint",
            "JSON Schema has no bigint literal"
        );
    }
    if (typeof value === "symbol") {
        return emitUnrepresentableJsonSchema(
            path,
            issues,
            unrepresentable,
            "unsupported_symbol",
            "JSON Schema has no symbol literal"
        );
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value) || Object.is(value, -0)) {
            return emitUnrepresentableJsonSchema(
                path,
                issues,
                unrepresentable,
                "unsupported_number_literal",
                "JSON Schema number literals must be finite and cannot preserve negative zero"
            );
        }
    }
    if (target === "openapi-3.0" || target === "draft-04") {
        return {
            enum: [value]
        };
    }
    return { const: value };
}

/**
 * @brief Append JSON Schema pattern constraints without weakening repeated checks.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
 * @param result Mutable string schema output.
 * @param patterns Ordered TypeSea pattern sources.
 * @post One pattern stays inline; multiple patterns become an `allOf` chain.
 */
function appendStringPatterns(
    result: MutableJsonSchemaObject,
    patterns: readonly string[]
): void {
    if (patterns.length === 0) {
        return;
    }
    if (patterns.length === 1) {
        const pattern = patterns[0];
        if (pattern !== undefined) {
            result.pattern = pattern;
        }
        return;
    }
    const schemas = new Array<JsonSchema>(patterns.length);
    for (let index = 0; index < patterns.length; index += 1) {
        const pattern = patterns[index];
        if (pattern !== undefined) {
            schemas[index] = { pattern };
        }
    }
    result.allOf = schemas;
}
