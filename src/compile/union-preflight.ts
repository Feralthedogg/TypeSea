/**
 * @file union-preflight.ts
 * @brief Shared union predicate snippets for diagnostic emitters.
 * @details Diagnostics sometimes need a boolean preflight before they decide
 * whether to emit a container-level union issue. The preflight still goes
 * through graph-backed predicate functions so compile and AOT keep one
 * predicate substrate.
 */

import {
    BigIntCheckTag,
    NumberCheckTag,
    SchemaTag,
    StringCheckTag
} from "../kind/index.js";
import type { Schema } from "../schema/index.js";
import { emitGraphFunction } from "./graph-predicate.js";
import {
    pushLiteral
} from "./context.js";
import type { EmitContext } from "./types.js";

/**
 * @brief Emit a union predicate expression.
 * @param options Union option schemas.
 * @param value Generated expression for the candidate value.
 * @param context Shared code-generation context.
 * @returns JavaScript expression that accepts at least one union branch.
 */
export function emitUnion(
    options: readonly Schema[],
    value: string,
    context: EmitContext
): string {
    const parts: string[] = [];
    for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        if (option !== undefined) {
            parts.push(emitUnionOptionExpression(option, value, context));
        }
    }
    if (parts.length === 0) {
        return "false";
    }
    return `(${parts.join("||")})`;
}

/**
 * @brief Emit one branch expression for a diagnostic union preflight.
 * @details Scalar branches stay inline inside array, record, and object
 * diagnostic loops. Composite branches fall back to graph-backed predicate
 * functions so there is still a single complex predicate substrate.
 * @param schema Union branch schema.
 * @param value Generated expression for the candidate value.
 * @param context Shared code-generation context.
 * @returns JavaScript predicate expression for the branch.
 */
function emitUnionOptionExpression(
    schema: Schema,
    value: string,
    context: EmitContext
): string {
    switch (schema.tag) {
        case SchemaTag.Unknown:
            return "true";
        case SchemaTag.Never:
            return "false";
        case SchemaTag.String:
            return emitStringExpression(schema, value, context);
        case SchemaTag.Number:
            return emitNumberExpression(schema, value, context);
        case SchemaTag.BigInt:
            return emitBigIntExpression(schema, value);
        case SchemaTag.Symbol:
            return `(typeof ${value}==="symbol")`;
        case SchemaTag.Boolean:
            return `(typeof ${value}==="boolean")`;
        case SchemaTag.Literal:
            return `Object.is(${value},l[${String(pushLiteral(context, schema.value))}])`;
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
            return `(${value}===undefined||${emitUnionOptionExpression(
                schema.inner,
                value,
                context
            )})`;
        case SchemaTag.Nullable:
            return `(${value}===null||${emitUnionOptionExpression(
                schema.inner,
                value,
                context
            )})`;
        case SchemaTag.Brand:
        case SchemaTag.Metadata:
        case SchemaTag.Message:
        case SchemaTag.Readonly:
            return emitUnionOptionExpression(schema.inner, value, context);
        case SchemaTag.KeyedObject:
        case SchemaTag.PropertyCount:
        case SchemaTag.PropertyNames:
        case SchemaTag.PatternProperties:
            return `${emitGraphFunction(schema, context)}(${value})`;
        case SchemaTag.Union:
            return emitUnion(schema.options, value, context);
        case SchemaTag.Intersection:
            return `(${emitUnionOptionExpression(schema.left, value, context)}&&${emitUnionOptionExpression(
                schema.right,
                value,
                context
            )})`;
        default:
            return `${emitGraphFunction(schema, context)}(${value})`;
    }
}

/**
 * @brief Emit an inline string predicate expression.
 */
function emitStringExpression(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.String }>,
    value: string,
    context: EmitContext
): string {
    const parts = [`typeof ${value}==="string"`];
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case StringCheckTag.Min:
                parts.push(`${value}.length>=${String(check.value)}`);
                break;
            case StringCheckTag.Max:
                parts.push(`${value}.length<=${String(check.value)}`);
                break;
            case StringCheckTag.Regex:
            case StringCheckTag.Uuid:
            case StringCheckTag.Email:
            case StringCheckTag.Url:
            case StringCheckTag.IsoDate:
            case StringCheckTag.IsoDateTime:
            case StringCheckTag.Ulid:
            case StringCheckTag.Xid:
            case StringCheckTag.Ksuid:
            case StringCheckTag.Ipv4:
            case StringCheckTag.Ipv6:
                return `${emitGraphFunction(schema, context)}(${value})`;
        }
    }
    return `(${parts.join("&&")})`;
}

/**
 * @brief Emit an inline number predicate expression.
 */
function emitNumberExpression(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Number }>,
    value: string,
    context: EmitContext
): string {
    const checks = schema.checks;
    const parts = [`typeof ${value}==="number"&&Number.isFinite(${value})`];
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case NumberCheckTag.Integer:
                parts.push(`Number.isInteger(${value})`);
                break;
            case NumberCheckTag.Gte:
                parts.push(`${value}>=${String(check.value)}`);
                break;
            case NumberCheckTag.Lte:
                parts.push(`${value}<=${String(check.value)}`);
                break;
            case NumberCheckTag.Gt:
                parts.push(`${value}>${String(check.value)}`);
                break;
            case NumberCheckTag.Lt:
                parts.push(`${value}<${String(check.value)}`);
                break;
            case NumberCheckTag.MultipleOf:
                return `${emitGraphFunction(schema, context)}(${value})`;
        }
    }
    return `(${parts.join("&&")})`;
}

/**
 * @brief Emit an inline BigInt predicate expression.
 */
function emitBigIntExpression(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.BigInt }>,
    value: string
): string {
    const checks = schema.checks;
    const parts = [`typeof ${value}==="bigint"`];
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        const literal = bigintSource(check.value);
        switch (check.tag) {
            case BigIntCheckTag.Gte:
                parts.push(`${value}>=${literal}`);
                break;
            case BigIntCheckTag.Lte:
                parts.push(`${value}<=${literal}`);
                break;
            case BigIntCheckTag.Gt:
                parts.push(`${value}>${literal}`);
                break;
            case BigIntCheckTag.Lt:
                parts.push(`${value}<${literal}`);
                break;
            case BigIntCheckTag.MultipleOf:
                parts.push(`${value}%${literal}===0n`);
                break;
        }
    }
    return `(${parts.join("&&")})`;
}

/**
 * @brief Render a BigInt literal for generated JavaScript source.
 */
function bigintSource(value: bigint): string {
    return value < 0n ? `(${String(value)}n)` : `${String(value)}n`;
}
