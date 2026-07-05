/**
 * @file first.ts
 * @brief First-fault diagnostic validator function table emitter.
 * @details Generated first-fault helpers return one frozen issue immediately,
 * keeping hot rejection diagnostics out of the full issue collector.
 */

import {
    ArrayCheckTag,
    DateCheckTag,
    NumberCheckTag,
    ObjectModeTag,
    PresenceTag,
    SchemaTag,
    StringCheckTag
} from "../kind/index.js";
import {
    EMAIL_PATTERN,
    IPV4_PATTERN,
    IPV6_PATTERN,
    ISO_DATETIME_PATTERN,
    ISO_DATE_PATTERN,
    ULID_PATTERN,
    URL_PATTERN,
    UUID_PATTERN,
    schemaCanAcceptUndefined,
    type DiscriminatedUnionCase,
    type LiteralValue,
    type Schema
} from "../schema/index.js";
import {
    pushLiteral,
    pushRegex,
    pushSchema,
    stringRef
} from "./context.js";
import { stringLiteral } from "./names.js";
import { emitUnion } from "./union-preflight.js";
import type { EmitContext, FunctionSource } from "./types.js";

/**
 * @brief Emit or reuse a first-fault diagnostic function.
 * @details Each schema identity maps to one generated first-fault function so
 * recursive and shared schemas keep stable function identities in source.
 * @param schema Schema whose first diagnostic should be emitted.
 * @param context Shared code-generation context.
 * @returns Generated first-fault function name.
 */
export function emitFirstFunction(schema: Schema, context: EmitContext): string {
    const cached = context.firstFunctionNames.get(schema);
    if (cached !== undefined) {
        return cached;
    }
    const name = `f${String(context.firstFunctions.length)}`;
    const source: FunctionSource = {
        name,
        body: ""
    };
    context.firstFunctionNames.set(schema, name);
    context.firstFunctions.push(source);
    source.body = emitFirstBody(schema, "v", "p", context);
    return name;
}

/**
 * @brief Emit all first-fault diagnostic functions.
 * @details Generated functions return undefined on success or one frozen issue
 * on failure. They never allocate an issue array.
 * @param context Shared code-generation context with accumulated sources.
 * @returns Concatenated JavaScript function declarations.
 */
export function emitFirstFunctions(context: EmitContext): string {
    const chunks = new Array<string>(context.firstFunctions.length);
    for (let index = 0; index < context.firstFunctions.length; index += 1) {
        const source = context.firstFunctions[index];
        if (source !== undefined) {
            chunks[index] = `function ${source.name}(v,p){${source.body}}`;
        }
    }
    return chunks.join("");
}

/**
 * @brief Emit the first-fault body for one schema.
 * @details The body mirrors check() diagnostic order but returns as soon as the
 * first machine-readable issue is known.
 * @param schema Schema represented by this function.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the mutable path stack.
 * @param context Shared code-generation context.
 * @returns JavaScript source for first-fault diagnostic collection.
 */
function emitFirstBody(
    schema: Schema,
    value: string,
    path: string,
    context: EmitContext
): string {
    switch (schema.tag) {
        case SchemaTag.Unknown:
            return "return;";
        case SchemaTag.Never:
            return emitFirstIssue(path, "expected_never", "never", `a(${value})`);
        case SchemaTag.String:
            return emitStringFirst(schema, value, path, context);
        case SchemaTag.Number:
            return emitNumberFirst(schema, value, path);
        case SchemaTag.Date:
            return emitDateFirst(schema, value, path);
        case SchemaTag.BigInt:
            return `if(typeof ${value}!=="bigint")${emitFirstIssue(path, "expected_bigint", "bigint", `a(${value})`)}`;
        case SchemaTag.Symbol:
            return `if(typeof ${value}!=="symbol")${emitFirstIssue(path, "expected_symbol", "symbol", `a(${value})`)}`;
        case SchemaTag.Boolean:
            return `if(typeof ${value}!=="boolean")${emitFirstIssue(path, "expected_boolean", "boolean", `a(${value})`)}`;
        case SchemaTag.Literal:
            return emitLiteralFirst(schema.value, value, path, context);
        case SchemaTag.Array:
            return emitArrayFirst(schema, value, path, context);
        case SchemaTag.Tuple:
            if (schema.rest !== undefined) {
                return emitDynamicFirst(schema, value, path, context);
            }
            return emitTupleFirst(schema.items, value, path, context);
        case SchemaTag.Record:
            return emitRecordFirst(schema.value, value, path, context);
        case SchemaTag.Map:
        case SchemaTag.Set:
        case SchemaTag.InstanceOf:
        case SchemaTag.Property:
            return emitDynamicFirst(schema, value, path, context);
        case SchemaTag.Object:
            return emitObjectFirst(schema, value, path, context);
        case SchemaTag.Union:
            return `if(!${emitUnion(schema.options, value, context)})${emitFirstIssue(path, "expected_union", "union", `a(${value})`)}`;
        case SchemaTag.Intersection:
            return [
                emitChildFirst(schema.left, value, path, context),
                emitChildFirst(schema.right, value, path, context)
            ].join("");
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
            return `if(${value}!==undefined){${emitChildFirst(schema.inner, value, path, context)}}`;
        case SchemaTag.Nullable:
            return `if(${value}!==null){${emitChildFirst(schema.inner, value, path, context)}}`;
        case SchemaTag.DiscriminatedUnion:
            return emitDiscriminatedUnionFirst(
                schema.key,
                schema.cases,
                value,
                path,
                context
            );
        case SchemaTag.Brand:
            return emitChildFirst(schema.inner, value, path, context);
        case SchemaTag.Lazy:
        case SchemaTag.Refine:
            return emitDynamicFirst(schema, value, path, context);
    }
}

/**
 * @brief Emit first-fault Date diagnostics.
 * @param schema Date schema with normalized checks.
 * @param value Generated expression for the candidate value.
 * @param path Generated path expression.
 * @returns JavaScript source returning one Date issue on failure.
 */
function emitDateFirst(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Date }>,
    value: string,
    path: string
): string {
    const parts = [
        `if(!dg(${value}))${emitFirstIssue(path, "expected_date", "valid Date", `a(${value})`)}`
    ];
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        const actual = `new Date(dt(${value})).toISOString()`;
        switch (check.tag) {
            case DateCheckTag.Min:
                parts.push(`if(dt(${value})<${String(check.value)})${emitFirstIssue(path, "expected_gte", `>= ${new Date(check.value).toISOString()}`, actual)}`);
                break;
            case DateCheckTag.Max:
                parts.push(`if(dt(${value})>${String(check.value)})${emitFirstIssue(path, "expected_lte", `<= ${new Date(check.value).toISOString()}`, actual)}`);
                break;
        }
    }
    return parts.join("");
}

/**
 * @brief Emit a first-fault fallback call for runtime-only schema nodes.
 * @param schema Schema captured in the dynamic side table.
 * @param value Generated candidate value expression.
 * @param path Generated path expression.
 * @param context Shared emission context.
 * @returns JavaScript source delegating first-fault diagnostics to the interpreter.
 */
function emitDynamicFirst(
    schema: Schema,
    value: string,
    path: string,
    context: EmitContext
): string {
    return `return mf(${String(pushSchema(context, schema))},${value},${path});`;
}

/**
 * @brief Emit first-fault string diagnostics.
 * @details String constraints run only after the type guard succeeds, matching
 * the full collector while avoiding later checks after the first issue.
 * @param schema String schema with scalar checks.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current path.
 * @param context Shared code-generation context.
 * @returns JavaScript source for string first-fault diagnostics.
 */
function emitStringFirst(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.String }>,
    value: string,
    path: string,
    context: EmitContext
): string {
    const parts: string[] = [
        `if(typeof ${value}!=="string")${emitFirstIssue(path, "expected_string", "string", `a(${value})`)}`
    ];
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case StringCheckTag.Min:
                parts.push(`if(${value}.length<${String(check.value)})${emitFirstIssue(
                    path,
                    "expected_min_length",
                    `length >= ${String(check.value)}`,
                    `"length "+String(${value}.length)`
                )}`);
                break;
            case StringCheckTag.Max:
                parts.push(`if(${value}.length>${String(check.value)})${emitFirstIssue(
                    path,
                    "expected_max_length",
                    `length <= ${String(check.value)}`,
                    `"length "+String(${value}.length)`
                )}`);
                break;
            case StringCheckTag.Regex:
                parts.push(emitPatternFirst(value, path, check.regex, check.name, context));
                break;
            case StringCheckTag.Uuid:
                parts.push(emitPatternFirst(value, path, UUID_PATTERN, "uuid", context));
                break;
            case StringCheckTag.Email:
                parts.push(emitPatternFirst(value, path, EMAIL_PATTERN, "email", context));
                break;
            case StringCheckTag.Url:
                parts.push(emitPatternFirst(value, path, URL_PATTERN, "url", context));
                break;
            case StringCheckTag.IsoDate:
                parts.push(emitPatternFirst(value, path, ISO_DATE_PATTERN, "iso_date", context));
                break;
            case StringCheckTag.IsoDateTime:
                parts.push(emitPatternFirst(value, path, ISO_DATETIME_PATTERN, "iso_datetime", context));
                break;
            case StringCheckTag.Ulid:
                parts.push(emitPatternFirst(value, path, ULID_PATTERN, "ulid", context));
                break;
            case StringCheckTag.Ipv4:
                parts.push(emitPatternFirst(value, path, IPV4_PATTERN, "ipv4", context));
                break;
            case StringCheckTag.Ipv6:
                parts.push(emitPatternFirst(value, path, IPV6_PATTERN, "ipv6", context));
                break;
        }
    }
    return parts.join("");
}

/**
 * @brief Emit first-fault number diagnostics.
 * @details Finite-number proof is checked once before integer or bound checks.
 * @param schema Number schema with scalar checks.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current path.
 * @returns JavaScript source for number first-fault diagnostics.
 */
function emitNumberFirst(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Number }>,
    value: string,
    path: string
): string {
    const parts: string[] = [
        `if(typeof ${value}!=="number"||!Number.isFinite(${value}))${emitFirstIssue(path, "expected_number", "number", `a(${value})`)}`
    ];
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case NumberCheckTag.Integer:
                parts.push(`if(!Number.isInteger(${value}))${emitFirstIssueExpr(
                    path,
                    "expected_integer",
                    stringLiteral("integer"),
                    stringLiteral("number")
                )}`);
                break;
            case NumberCheckTag.Gte:
                parts.push(`if(${value}<${String(check.value)})${emitFirstIssue(
                    path,
                    "expected_gte",
                    `>= ${String(check.value)}`,
                    `String(${value})`
                )}`);
                break;
            case NumberCheckTag.Lte:
                parts.push(`if(${value}>${String(check.value)})${emitFirstIssue(
                    path,
                    "expected_lte",
                    `<= ${String(check.value)}`,
                    `String(${value})`
                )}`);
                break;
            case NumberCheckTag.Gt:
                parts.push(`if(${value}<=${String(check.value)})${emitFirstIssue(
                    path,
                    "expected_gt",
                    `> ${String(check.value)}`,
                    `String(${value})`
                )}`);
                break;
            case NumberCheckTag.Lt:
                parts.push(`if(${value}>=${String(check.value)})${emitFirstIssue(
                    path,
                    "expected_lt",
                    `< ${String(check.value)}`,
                    `String(${value})`
                )}`);
                break;
            case NumberCheckTag.MultipleOf:
                parts.push(`if(${value}%${String(check.value)}!==0)${emitFirstIssue(
                    path,
                    "expected_multiple_of",
                    `multiple of ${String(check.value)}`,
                    `String(${value})`
                )}`);
                break;
        }
    }
    return parts.join("");
}

/**
 * @brief Emit first-fault literal diagnostics.
 * @details Object.is preserves NaN and signed-zero semantics while literals stay
 * in the generated side table.
 * @param literal Literal value expected by the schema.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current path.
 * @param context Shared code-generation context.
 * @returns JavaScript source for literal first-fault diagnostics.
 */
function emitLiteralFirst(
    literal: LiteralValue,
    value: string,
    path: string,
    context: EmitContext
): string {
    const index = pushLiteral(context, literal);
    return `if(!Object.is(${value},l[${String(index)}]))${emitFirstIssueExpr(
        path,
        "expected_literal",
        `le(l[${String(index)}])`,
        `a(${value})`
    )}`;
}

/**
 * @brief Emit first-fault array diagnostics.
 * @details Safe mode keeps descriptor reads so accessors are reported without
 * executing user getters. Unsafe modes mirror the fast diagnostic contract.
 * @param item Schema applied to each array slot.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current path.
 * @param context Shared code-generation context.
 * @returns JavaScript source for array first-fault diagnostics.
 */
function emitArrayFirst(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Array }>,
    value: string,
    path: string,
    context: EmitContext
): string {
    if (isUnsafeMode(context)) {
        return emitUnsafeArrayFirst(schema, value, path, context);
    }
    const item = schema.item;
    const parts: string[] = [
        `if(!Array.isArray(${value}))${emitFirstIssue(path, "expected_array", "array", `a(${value})`)}`,
        emitArrayLengthFirst(schema, value, path)
    ];
    if (schemaCanAcceptUndefined(item)) {
        parts.push(
            `const xs=Object.getOwnPropertyNames(${value});`,
            "for(let xi=0;xi<xs.length;xi+=1){",
            "const key=xs[xi];",
            `if(!ai(key,${value}.length))continue;`,
            "const i=Number(key);",
            `const d=gp(${value},key);`,
            `if(d!==undefined&&!h.call(d,"value"))${emitFirstIssueAtSegment(
                path,
                "i",
                "expected_array",
                "data property",
                stringLiteral("accessor")
            )}`,
            `if(d!==undefined){${emitChildFirstAtSegment(item, "d.value", path, "i", context)}}`,
            "}"
        );
        return parts.join("");
    }
    parts.push(
        `for(let i=0;i<${value}.length;i+=1){`,
        `const d=gp(${value},i);`,
        `if(d===undefined){${emitChildFirstAtSegment(item, "undefined", path, "i", context)}}`,
        `else if(!h.call(d,"value"))${emitFirstIssueAtSegment(
            path,
            "i",
            "expected_array",
            "data property",
            stringLiteral("accessor")
        )}`,
        `else{${emitChildFirstAtSegment(item, "d.value", path, "i", context)}}`,
        "}"
    );
    return parts.join("");
}

/**
 * @brief Emit fast-mode first-fault array diagnostics.
 * @details Trusted arrays use direct indexed loads and skip descriptor checks.
 * @param item Schema applied to each array slot.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current path.
 * @param context Shared code-generation context.
 * @returns JavaScript source for unsafe array first-fault diagnostics.
 */
function emitUnsafeArrayFirst(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Array }>,
    value: string,
    path: string,
    context: EmitContext
): string {
    const item = schema.item;
    return [
        `if(!Array.isArray(${value}))${emitFirstIssue(path, "expected_array", "array", `a(${value})`)}`,
        emitArrayLengthFirst(schema, value, path),
        `for(let i=0;i<${value}.length;i+=1){`,
        `const av=${value}[i];`,
        emitChildFirstAtSegment(item, "av", path, "i", context),
        "}"
    ].join("");
}

/**
 * @brief Emit first-fault array length diagnostics.
 * @param schema Array schema with normalized checks.
 * @param value Generated expression for the candidate array.
 * @param path Generated expression for the current path.
 * @returns JavaScript source returning the first length issue, or empty source.
 */
function emitArrayLengthFirst(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Array }>,
    value: string,
    path: string
): string {
    const parts: string[] = [];
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case ArrayCheckTag.Min:
                parts.push(`if(${value}.length<${String(check.value)})${emitFirstIssue(
                    path,
                    "expected_min_length",
                    `length >= ${String(check.value)}`,
                    `"length "+String(${value}.length)`
                )}`);
                break;
            case ArrayCheckTag.Max:
                parts.push(`if(${value}.length>${String(check.value)})${emitFirstIssue(
                    path,
                    "expected_max_length",
                    `length <= ${String(check.value)}`,
                    `"length "+String(${value}.length)`
                )}`);
                break;
        }
    }
    return parts.join("");
}

/**
 * @brief Emit first-fault tuple diagnostics.
 * @details Tuple length is reported before item diagnostics, matching the full
 * diagnostic collector's first issue ordering.
 * @param items Tuple item schemas.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current path.
 * @param context Shared code-generation context.
 * @returns JavaScript source for tuple first-fault diagnostics.
 */
function emitTupleFirst(
    items: readonly Schema[],
    value: string,
    path: string,
    context: EmitContext
): string {
    if (isUnsafeMode(context)) {
        return emitUnsafeTupleFirst(items, value, path, context);
    }
    const parts: string[] = [
        `if(!Array.isArray(${value}))${emitFirstIssue(path, "expected_tuple", "tuple", `a(${value})`)}`,
        `if(${value}.length!==${String(items.length)})${emitFirstIssue(
            path,
            "expected_tuple_length",
            `length ${String(items.length)}`,
            `"length "+String(${value}.length)`
        )}`,
        `const n=${value}.length<${String(items.length)}?${value}.length:${String(items.length)};`
    ];
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (item === undefined) {
            continue;
        }
        const segment = String(index);
        parts.push(
            `if(${segment}<n){`,
            `const d=gp(${value},${segment});`,
            `if(d===undefined){${emitChildFirstAtSegment(item, "undefined", path, segment, context)}}`,
            `else if(!h.call(d,"value"))${emitFirstIssueAtSegment(
                path,
                segment,
                "expected_tuple",
                "data property",
                stringLiteral("accessor")
            )}`,
            `else{${emitChildFirstAtSegment(item, "d.value", path, segment, context)}}`,
            "}"
        );
    }
    return parts.join("");
}

/**
 * @brief Emit fast-mode first-fault tuple diagnostics.
 * @details Trusted tuples use direct indexed reads after the length check.
 * @param items Tuple item schemas.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current path.
 * @param context Shared code-generation context.
 * @returns JavaScript source for unsafe tuple first-fault diagnostics.
 */
function emitUnsafeTupleFirst(
    items: readonly Schema[],
    value: string,
    path: string,
    context: EmitContext
): string {
    const parts: string[] = [
        `if(!Array.isArray(${value}))${emitFirstIssue(path, "expected_tuple", "tuple", `a(${value})`)}`,
        `if(${value}.length!==${String(items.length)})${emitFirstIssue(
            path,
            "expected_tuple_length",
            `length ${String(items.length)}`,
            `"length "+String(${value}.length)`
        )}`,
        `const n=${value}.length<${String(items.length)}?${value}.length:${String(items.length)};`
    ];
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (item !== undefined) {
            const segment = String(index);
            parts.push(
                `if(${segment}<n){`,
                `const tv=${value}[${segment}];`,
                emitChildFirstAtSegment(item, "tv", path, segment, context),
                "}"
            );
        }
    }
    return parts.join("");
}

/**
 * @brief Emit first-fault record diagnostics.
 * @details Safe mode validates own enumerable data slots through descriptors.
 * @param item Schema applied to each record value.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current path.
 * @param context Shared code-generation context.
 * @returns JavaScript source for record first-fault diagnostics.
 */
function emitRecordFirst(
    item: Schema,
    value: string,
    path: string,
    context: EmitContext
): string {
    if (isUnsafeMode(context)) {
        return emitUnsafeRecordFirst(item, value, path, context);
    }
    return [
        `if(${objectRejectExpression(value)})${emitFirstIssue(path, "expected_record", "record", `a(${value})`)}`,
        `for(const key in ${value}){`,
        `if(!h.call(${value},key))continue;`,
        `const d=gp(${value},key);`,
        `if(d===undefined||!h.call(d,"value"))${emitFirstIssueAtSegment(
            path,
            "key",
            "expected_record",
            "data property",
            stringLiteral("accessor or missing")
        )}`,
        emitChildFirstAtSegment(item, "d.value", path, "key", context),
        "}"
    ].join("");
}

/**
 * @brief Emit fast-mode first-fault record diagnostics.
 * @details Unsafe record checks use direct reads and optional own-key filtering.
 * @param item Schema applied to each record value.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current path.
 * @param context Shared code-generation context.
 * @returns JavaScript source for unsafe record first-fault diagnostics.
 */
function emitUnsafeRecordFirst(
    item: Schema,
    value: string,
    path: string,
    context: EmitContext
): string {
    return [
        `if(${objectRejectExpression(value)})${emitFirstIssue(path, "expected_record", "record", `a(${value})`)}`,
        `for(const key in ${value}){`,
        isUncheckedMode(context) ? "" : `if(!h.call(${value},key))continue;`,
        `const rv=${value}[key];`,
        emitChildFirstAtSegment(item, "rv", path, "key", context),
        "}"
    ].join("");
}

/**
 * @brief Emit first-fault object diagnostics.
 * @details Object fields keep schema diagnostic order. Strict-key diagnostics
 * run only after declared fields match, just like the full collector.
 * @param schema Object schema to emit.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current path.
 * @param context Shared code-generation context.
 * @returns JavaScript source for object first-fault diagnostics.
 */
function emitObjectFirst(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    value: string,
    path: string,
    context: EmitContext
): string {
    if (isUnsafeMode(context)) {
        return emitUnsafeObjectFirst(schema, value, path, context);
    }
    const parts: string[] = [
        `if(${objectRejectExpression(value)})${emitFirstIssue(path, "expected_object", "object", `a(${value})`)}`
    ];
    const entries = schema.entries;
    const keyExpressions: string[] = [];
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
            continue;
        }
        const key = stringRef(context, entry.key);
        keyExpressions.push(key);
        parts.push("{");
        if (entry.presence === PresenceTag.Required) {
            parts.push(
                `const d=gp(${value},${key});`,
                `if(d===undefined||!h.call(d,"value"))${emitFirstIssueAtSegment(
                    path,
                    key,
                    "expected_required_key",
                    "present key",
                    stringLiteral("missing")
                )}`,
                emitChildFirstAtSegment(entry.schema, "d.value", path, key, context)
            );
        } else {
            parts.push(
                `if(h.call(${value},${key})){`,
                `const d=gp(${value},${key});`,
                `if(d===undefined||!h.call(d,"value"))${emitFirstIssueAtSegment(
                    path,
                    key,
                    "expected_object",
                    "data property",
                    stringLiteral("accessor")
                )}`,
                emitChildFirstAtSegment(entry.schema, "d.value", path, key, context),
                "}"
            );
        }
        parts.push("}");
    }
    if (schema.catchall !== undefined) {
        parts.push(emitObjectCatchallFirst(schema, value, path, context));
    } else if (schema.mode === ObjectModeTag.Strict) {
        parts.push(
            `const xs=Object.getOwnPropertyNames(${value});`,
            "const xn=xs.length;",
            "for(let i=0;i<xn;i+=1){",
            "const key=xs[i];",
            `if(!(${safeKeyMembershipExpression("key", keyExpressions)}))${emitFirstIssueAtSegment(
                path,
                "key",
                "unrecognized_key",
                "known key",
                stringLiteral("extra key")
            )}`,
            "}",
            `const ys=Object.getOwnPropertySymbols(${value});`,
            "const yn=ys.length;",
            "for(let i=0;i<yn;i+=1){",
            "const key=ys[i];",
            `if(key!==undefined)${emitFirstIssueAtSegment(
                path,
                "String(key)",
                "unrecognized_key",
                "known key",
                stringLiteral("extra key")
            )}`,
            "}"
        );
    }
    return parts.join("");
}

/**
 * @brief Emit first-fault diagnostics for object catchall keys.
 */
function emitObjectCatchallFirst(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    value: string,
    path: string,
    context: EmitContext
): string {
    const catchall = schema.catchall;
    if (catchall === undefined) {
        return "";
    }
    const keyExpressions = new Array<string>(schema.keys.length);
    for (let index = 0; index < schema.keys.length; index += 1) {
        const key = schema.keys[index];
        if (key !== undefined) {
            keyExpressions[index] = stringRef(context, key);
        }
    }
    return [
        `const cx=Reflect.ownKeys(${value});`,
        "const cn=cx.length;",
        "for(let ci=0;ci<cn;ci+=1){",
        "const key=cx[ci];",
        `if(typeof key==="string"&&(${safeKeyMembershipExpression("key", keyExpressions)}))continue;`,
        "const pk=typeof key===\"string\"?key:String(key);",
        `const cd=gp(${value},key);`,
        `if(cd===undefined||!h.call(cd,"value"))${emitFirstIssueAtSegment(
            path,
            "pk",
            "expected_object",
            "data property",
            stringLiteral("accessor")
        )}`,
        emitChildFirstAtSegment(catchall, "cd.value", path, "pk", context),
        "}"
    ].join("");
}

/**
 * @brief Emit fast-mode first-fault object diagnostics.
 * @details Trusted object diagnostics share the direct-read contract used by
 * unsafe and unchecked predicates.
 * @param schema Object schema to emit.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current path.
 * @param context Shared code-generation context.
 * @returns JavaScript source for unsafe object first-fault diagnostics.
 */
function emitUnsafeObjectFirst(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    value: string,
    path: string,
    context: EmitContext
): string {
    const parts: string[] = [
        `if(${objectRejectExpression(value)})${emitFirstIssue(path, "expected_object", "object", `a(${value})`)}`
    ];
    const keys = new Array<string>(schema.entries.length);
    for (let index = 0; index < schema.entries.length; index += 1) {
        const entry = schema.entries[index];
        if (entry === undefined) {
            continue;
        }
        keys[index] = entry.key;
        const key = unsafeStringLiteralExpression(entry.key);
        const itemValue = `v${String(index)}`;
        parts.push(
            "{",
            `const ${itemValue}=${unsafePropertyReadExpression(value, entry.key)};`
        );
        if (entry.presence === PresenceTag.Optional) {
            parts.push(
                `if(${itemValue}!==undefined){${emitChildFirstAtSegment(entry.schema, itemValue, path, key, context)}}`,
                `else if(h.call(${value},${key})){${emitChildFirstAtSegment(entry.schema, itemValue, path, key, context)}}`
            );
        } else if (schemaCanAcceptUndefined(entry.schema)) {
            parts.push(
                `if(${itemValue}===undefined&&!h.call(${value},${key}))${emitFirstIssueAtSegment(
                    path,
                    key,
                    "expected_required_key",
                    "present key",
                    stringLiteral("missing")
                )}`,
                emitChildFirstAtSegment(entry.schema, itemValue, path, key, context)
            );
        } else {
            parts.push(emitChildFirstAtSegment(entry.schema, itemValue, path, key, context));
        }
        parts.push("}");
    }
    if (schema.catchall !== undefined) {
        parts.push(emitUnsafeObjectCatchallFirst(schema, value, path, context));
    } else if (schema.mode === ObjectModeTag.Strict && !isUncheckedMode(context)) {
        parts.push(
            `for(const key in ${value}){`,
            `if(h.call(${value},key)&&!(${unsafeKeyMembershipExpression("key", keys)}))${emitFirstIssueAtSegment(
                path,
                "key",
                "unrecognized_key",
                "known key",
                stringLiteral("extra key")
            )}`,
            "}"
        );
    }
    return parts.join("");
}

/**
 * @brief Emit unsafe first-fault diagnostics for object catchall keys.
 */
function emitUnsafeObjectCatchallFirst(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    value: string,
    path: string,
    context: EmitContext
): string {
    const catchall = schema.catchall;
    if (catchall === undefined) {
        return "";
    }
    return [
        `const cx=Reflect.ownKeys(${value});`,
        "const cn=cx.length;",
        "for(let ci=0;ci<cn;ci+=1){",
        "const key=cx[ci];",
        `if(typeof key==="string"&&(${unsafeKeyMembershipExpression("key", schema.keys)}))continue;`,
        "const pk=typeof key===\"string\"?key:String(key);",
        emitChildFirstAtSegment(catchall, `${value}[key]`, path, "pk", context),
        "}"
    ].join("");
}

/**
 * @brief Emit first-fault discriminated-union diagnostics.
 * @details The discriminant read stays descriptor-backed in safe mode and direct
 * in fast modes.
 * @param key Discriminant property name.
 * @param cases Union case table.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current path.
 * @param context Shared code-generation context.
 * @returns JavaScript source for discriminated-union first-fault diagnostics.
 */
function emitDiscriminatedUnionFirst(
    key: string,
    cases: readonly DiscriminatedUnionCase[],
    value: string,
    path: string,
    context: EmitContext
): string {
    if (isUnsafeMode(context)) {
        return emitUnsafeDiscriminatedUnionFirst(key, cases, value, path, context);
    }
    const keyRef = stringRef(context, key);
    const parts: string[] = [
        `if(${objectRejectExpression(value)})${emitFirstIssue(path, "expected_object", "object", `a(${value})`)}`,
        `const dd=gp(${value},${keyRef});`,
        `if(dd===undefined||!h.call(dd,"value"))${emitFirstIssueAtSegment(
            path,
            keyRef,
            "expected_discriminant",
            "data property",
            stringLiteral("missing or accessor")
        )}`,
        "const dv=dd.value;",
        `if(typeof dv!=="string")${emitFirstIssueAtSegment(
            path,
            keyRef,
            "expected_discriminant",
            "string discriminant",
            "a(dv)"
        )}`
    ];
    for (let index = 0; index < cases.length; index += 1) {
        const unionCase = cases[index];
        if (unionCase === undefined) {
            continue;
        }
        const literalIndex = pushLiteral(context, unionCase.literal);
        parts.push(`if(Object.is(dv,l[${String(literalIndex)}])){${emitChildFirst(unionCase.schema, value, path, context)}return;}`);
    }
    parts.push(emitFirstIssueExprAtSegment(
        path,
        keyRef,
        "expected_discriminant",
        stringLiteral("known discriminant"),
        "le(dv)"
    ));
    return parts.join("");
}

/**
 * @brief Emit fast-mode first-fault discriminated-union diagnostics.
 * @details Trusted discriminants use direct property reads and strict equality
 * against static case strings.
 * @param key Discriminant property name.
 * @param cases Union case table.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the current path.
 * @param context Shared code-generation context.
 * @returns JavaScript source for unsafe discriminated-union first-fault diagnostics.
 */
function emitUnsafeDiscriminatedUnionFirst(
    key: string,
    cases: readonly DiscriminatedUnionCase[],
    value: string,
    path: string,
    context: EmitContext
): string {
    const keyRef = unsafeStringLiteralExpression(key);
    const parts: string[] = [
        `if(${objectRejectExpression(value)})${emitFirstIssue(path, "expected_object", "object", `a(${value})`)}`,
        `const dv=${unsafePropertyReadExpression(value, key)};`,
        `if(typeof dv!=="string")${emitFirstIssueAtSegment(
            path,
            keyRef,
            "expected_discriminant",
            "string discriminant",
            "a(dv)"
        )}`
    ];
    for (let index = 0; index < cases.length; index += 1) {
        const unionCase = cases[index];
        if (unionCase !== undefined) {
            parts.push(`if(dv===${unsafeStringLiteralExpression(unionCase.literal)}){${emitChildFirst(unionCase.schema, value, path, context)}return;}`);
        }
    }
    parts.push(emitFirstIssueExprAtSegment(
        path,
        keyRef,
        "expected_discriminant",
        stringLiteral("known discriminant"),
        "le(dv)"
    ));
    return parts.join("");
}

/**
 * @brief Emit one child first-fault call at the current path.
 * @details The temporary issue local is scoped so repeated generated calls keep
 * monomorphic source without name collisions.
 * @param schema Child schema to invoke.
 * @param value Generated child value expression.
 * @param path Generated path expression.
 * @param context Shared code-generation context.
 * @returns JavaScript source that returns the child issue when present.
 */
function emitChildFirst(
    schema: Schema,
    value: string,
    path: string,
    context: EmitContext
): string {
    const child = emitFirstFunction(schema, context);
    return `{const e=${child}(${value},${path});if(e!==undefined)return e;}`;
}

/**
 * @brief Emit one child first-fault call under an appended segment.
 * @details The mutable path is restored before returning so sibling checks keep
 * the same path prefix even when a child succeeds.
 * @param schema Child schema to invoke.
 * @param value Generated child value expression.
 * @param path Generated path expression.
 * @param segment Generated path segment expression.
 * @param context Shared code-generation context.
 * @returns JavaScript source that returns the child issue when present.
 */
function emitChildFirstAtSegment(
    schema: Schema,
    value: string,
    path: string,
    segment: string,
    context: EmitContext
): string {
    const child = emitFirstFunction(schema, context);
    return `{${path}.push(${segment});const e=${child}(${value},${path});${path}.pop();if(e!==undefined)return e;}`;
}

/**
 * @brief Emit first-fault pattern diagnostics.
 * @details RegExp instances stay in the side table and stateful expressions get
 * the same lastIndex reset as the full collector.
 * @param value Generated string value expression.
 * @param path Generated path expression.
 * @param regex Pattern to test.
 * @param name Human-readable pattern name.
 * @param context Shared code-generation context.
 * @returns JavaScript source that returns a pattern issue on failure.
 */
function emitPatternFirst(
    value: string,
    path: string,
    regex: RegExp,
    name: string,
    context: EmitContext
): string {
    const source = regex === UUID_PATTERN ? UUID_PATTERN : regex;
    const index = pushRegex(context, source);
    const access = `r[${String(index)}]`;
    const test = regexNeedsLastIndexReset(source)
        ? `((${access}.lastIndex=0),!${access}.test(${value}))`
        : `!${access}.test(${value})`;
    return `if(${test})${emitFirstIssueExpr(
        path,
        "expected_pattern",
        stringRef(context, name),
        stringLiteral("string")
    )}`;
}

/**
 * @brief Emit a root-path first issue return.
 * @param path Generated path expression.
 * @param code Issue code string.
 * @param expected Expected label.
 * @param actualExpression Generated actual label expression.
 * @returns JavaScript return statement.
 */
function emitFirstIssue(
    path: string,
    code: string,
    expected: string,
    actualExpression: string
): string {
    return emitFirstIssueExpr(
        path,
        code,
        stringLiteral(expected),
        actualExpression
    );
}

/**
 * @brief Emit a root-path first issue return with expression operands.
 * @param path Generated path expression.
 * @param code Issue code string.
 * @param expectedExpression Generated expected label expression.
 * @param actualExpression Generated actual label expression.
 * @returns JavaScript return statement.
 */
function emitFirstIssueExpr(
    path: string,
    code: string,
    expectedExpression: string,
    actualExpression: string
): string {
    return `return fq(${path},${stringLiteral(code)},${expectedExpression},${actualExpression});`;
}

/**
 * @brief Emit a one-segment first issue return.
 * @param path Generated path expression.
 * @param segment Generated appended segment expression.
 * @param code Issue code string.
 * @param expected Expected label.
 * @param actualExpression Generated actual label expression.
 * @returns JavaScript return statement.
 */
function emitFirstIssueAtSegment(
    path: string,
    segment: string,
    code: string,
    expected: string,
    actualExpression: string
): string {
    return emitFirstIssueExprAtSegment(
        path,
        segment,
        code,
        stringLiteral(expected),
        actualExpression
    );
}

/**
 * @brief Emit a one-segment first issue return with expression operands.
 * @param path Generated path expression.
 * @param segment Generated appended segment expression.
 * @param code Issue code string.
 * @param expectedExpression Generated expected label expression.
 * @param actualExpression Generated actual label expression.
 * @returns JavaScript return statement.
 */
function emitFirstIssueExprAtSegment(
    path: string,
    segment: string,
    code: string,
    expectedExpression: string,
    actualExpression: string
): string {
    const stringIndex = readStringRefIndex(segment);
    if (stringIndex !== undefined) {
        return `return fq1s(${path},${stringIndex},${stringLiteral(code)},${expectedExpression},${actualExpression});`;
    }
    return `return fq1(${path},${segment},${stringLiteral(code)},${expectedExpression},${actualExpression});`;
}

/**
 * @brief Test whether a RegExp must reset lastIndex before testing.
 * @param regex RegExp stored in the generated side table.
 * @returns True for global or sticky patterns.
 */
function regexNeedsLastIndexReset(regex: RegExp): boolean {
    return regex.global || regex.sticky;
}

/**
 * @brief Emit a plain-object rejection expression.
 * @param value Generated value expression.
 * @returns JavaScript expression that rejects arrays, null, and primitives.
 */
function objectRejectExpression(value: string): string {
    return `typeof ${value}!=="object"||${value}===null||Array.isArray(${value})`;
}

/**
 * @brief Emit safe strict-key membership expression.
 * @param key Generated key expression.
 * @param keyExpressions Allowed key expressions.
 * @returns JavaScript boolean expression.
 */
function safeKeyMembershipExpression(
    key: string,
    keyExpressions: readonly string[]
): string {
    if (keyExpressions.length === 0) {
        return "false";
    }
    const parts = new Array<string>(keyExpressions.length);
    for (let index = 0; index < keyExpressions.length; index += 1) {
        const value = keyExpressions[index];
        parts[index] = value === undefined ? "false" : `${key}===${value}`;
    }
    return `(${parts.join("||")})`;
}

/**
 * @brief Emit unsafe strict-key membership expression.
 * @param key Generated key expression.
 * @param keys Allowed static keys.
 * @returns JavaScript boolean expression.
 */
function unsafeKeyMembershipExpression(key: string, keys: readonly string[]): string {
    if (keys.length === 0) {
        return "false";
    }
    const parts = new Array<string>(keys.length);
    for (let index = 0; index < keys.length; index += 1) {
        const value = keys[index];
        parts[index] = value === undefined
            ? "false"
            : `${key}===${unsafeStringLiteralExpression(value)}`;
    }
    return `(${parts.join("||")})`;
}

/**
 * @brief Emit a fast-mode property read expression.
 * @param objectExpression Generated object expression.
 * @param key Static property key.
 * @returns Dot access for identifier keys, bracket access otherwise.
 */
function unsafePropertyReadExpression(objectExpression: string, key: string): string {
    if (isAsciiIdentifierName(key)) {
        return `${objectExpression}.${key}`;
    }
    return `${objectExpression}[${unsafeStringLiteralExpression(key)}]`;
}

/**
 * @brief Test whether a static key can be emitted after a dot.
 * @param value Candidate key string.
 * @returns True for ASCII identifier names.
 */
function isAsciiIdentifierName(value: string): boolean {
    return /^[A-Za-z_$][0-9A-Za-z_$]*$/u.test(value);
}

/**
 * @brief Escape one static string literal for unsafe-mode source.
 * @param value String value to serialize.
 * @returns JSON string literal safe for generated source text.
 */
function unsafeStringLiteralExpression(value: string): string {
    return JSON.stringify(value)
        .replace(/\u2028/gu, "\\u2028")
        .replace(/\u2029/gu, "\\u2029");
}

/**
 * @brief Check whether a compile mode uses direct reads.
 * @param context Shared code-generation context.
 * @returns True for unsafe or unchecked modes.
 */
function isUnsafeMode(context: EmitContext): boolean {
    return context.mode !== "safe";
}

/**
 * @brief Check whether a compile mode skips strict extras.
 * @param context Shared code-generation context.
 * @returns True for unchecked mode.
 */
function isUncheckedMode(context: EmitContext): boolean {
    return context.mode === "unchecked";
}

/**
 * @brief Extract the side-table index from a string reference expression.
 * @param expression Candidate expression such as `u[2]`.
 * @returns Numeric index text, or undefined for dynamic expressions.
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
