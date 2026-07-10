/**
 * @file compile/check.ts
 * @brief Diagnostic validator function table emitter.
 */

import { KeyRuleTag, SchemaTag } from "../kind/index.js";
import type { Schema } from "../schema/index.js";
import {
    emitArrayCheck,
    emitDiscriminatedUnionCheck,
    emitObjectCheck,
    emitRecordCheck,
    emitTupleCheck
} from "./check-composite.js";
import {
    emitBigIntCheck,
    emitDateCheck,
    emitLiteralCheck,
    emitNumberCheck,
    emitStringCheck
} from "./check-scalar.js";
import { pushSchema, stringRef } from "./context.js";
import { emitIssue, emitIssueExpr } from "./issue.js";
import { emitUnion } from "./union-preflight.js";
import type { EmitContext, FunctionSource } from "./types.js";

/**
 * @brief emit check function.
 * @param schema Schema whose diagnostics should be emitted.
 * @param context Shared code-generation context.
 * @returns Generated diagnostic function name.
 * @invariant The same schema object maps to one diagnostic function per bundle.
 */
export function emitCheckFunction(schema: Schema, context: EmitContext): string {
    const cached = context.checkFunctionNames.get(schema);
    if (cached !== undefined) {
        return cached;
    }
    /*
     * Insert the placeholder before emitting the body. Recursive schemas can
     * request this same function while the current body is still being built.
     */
    const name = `c${String(context.checkFunctions.length)}`;
    const source: FunctionSource = {
        name,
        body: ""
    };
    context.checkFunctionNames.set(schema, name);
    context.checkFunctions.push(source);
    source.body = emitCheckBody(schema, "v", "p", "s", context);
    return name;
}

/**
 * @brief emit check functions.
 * @param context Shared code-generation context with accumulated check sources.
 * @returns Concatenated JavaScript function declarations.
 */
export function emitCheckFunctions(context: EmitContext): string {
    const chunks = new Array<string>(context.checkFunctions.length);
    for (let index = 0; index < context.checkFunctions.length; index += 1) {
        const source = context.checkFunctions[index];
        if (source === undefined) {
            continue;
        }
        chunks[index] = `function ${source.name}(v,p,s){${source.body}}`;
    }
    return chunks.join("");
}

/**
 * @brief emit check body.
 * @param schema Schema represented by this diagnostic body.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the mutable path stack.
 * @param issues Generated expression for the issue buffer.
 * @param context Shared code-generation context.
 * @returns JavaScript source for diagnostic collection.
 */
function emitCheckBody(
    schema: Schema,
    value: string,
    path: string,
    issues: string,
    context: EmitContext
): string {
    switch (schema.tag) {
        case SchemaTag.Unknown:
            return "return;";
        case SchemaTag.Never:
            return emitIssue(issues, path, "expected_never", "never", `a(${value})`);
        case SchemaTag.String:
            return emitStringCheck(schema, value, path, issues, context);
        case SchemaTag.Number:
            return emitNumberCheck(schema, value, path, issues, context);
        case SchemaTag.Date:
            return emitDateCheck(schema, value, path, issues, context);
        case SchemaTag.BigInt:
            return emitBigIntCheck(schema, value, path, issues, context);
        case SchemaTag.Symbol:
            return `if(typeof ${value}!=="symbol"){${emitIssue(
                issues,
                path,
                "expected_symbol",
                "symbol",
                `a(${value})`,
                checkMessageExpression(schema.message, context)
            )}}`;
        case SchemaTag.Boolean:
            return `if(typeof ${value}!=="boolean"){${emitIssue(
                issues,
                path,
                "expected_boolean",
                "boolean",
                `a(${value})`,
                checkMessageExpression(schema.message, context)
            )}}`;
        case SchemaTag.Literal:
            return emitLiteralCheck(schema.value, value, path, issues, context);
        case SchemaTag.Array:
            return emitArrayCheck(schema, value, path, issues, context, emitCheckFunction);
        case SchemaTag.Tuple:
            if (schema.rest !== undefined) {
                return emitDynamicCheck(schema, value, path, issues, context);
            }
            return emitTupleCheck(schema.items, value, path, issues, context, emitCheckFunction);
        case SchemaTag.Record:
            if (schema.key !== undefined) {
                return emitDynamicCheck(schema, value, path, issues, context);
            }
            return emitRecordCheck(schema.value, value, path, issues, context, emitCheckFunction);
        case SchemaTag.Map:
        case SchemaTag.Set:
        case SchemaTag.File:
        case SchemaTag.InstanceOf:
        case SchemaTag.Property:
            return emitDynamicCheck(schema, value, path, issues, context);
        case SchemaTag.Object:
            return emitObjectCheck(schema, value, path, issues, context, emitCheckFunction);
        case SchemaTag.Union:
            return `if(!${emitUnion(schema.options, value, context)}){${emitIssue(
                issues,
                path,
                "expected_union",
                "union",
                `a(${value})`
            )}}`;
        case SchemaTag.Xor:
            return emitDynamicCheck(schema, value, path, issues, context);
        case SchemaTag.Intersection:
            return [
                emitCheckCall(schema.left, value, path, issues, context),
                emitCheckCall(schema.right, value, path, issues, context)
            ].join("");
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
            return `if(${value}!==undefined){${emitCheckCall(
                schema.inner,
                value,
                path,
                issues,
                context
            )}}`;
        case SchemaTag.Nullable:
            return `if(${value}!==null){${emitCheckCall(
                schema.inner,
                value,
                path,
                issues,
                context
            )}}`;
        case SchemaTag.DiscriminatedUnion:
            return emitDiscriminatedUnionCheck(
                schema.key,
                schema.cases,
                value,
                path,
                issues,
                context,
                emitCheckFunction
            );
        case SchemaTag.Brand:
            return emitCheckCall(schema.inner, value, path, issues, context);
        case SchemaTag.Metadata:
            return emitCheckCall(schema.inner, value, path, issues, context);
        case SchemaTag.Message:
            return emitMessageCheck(schema.inner, schema.message, value, path, issues, context);
        case SchemaTag.KeyedObject:
            return emitKeyedObjectCheck(
                schema.inner,
                schema.keys,
                schema.rule,
                value,
                path,
                issues,
                context
            );
        case SchemaTag.PropertyCount:
            return emitPropertyCountCheck(
                schema.inner,
                schema.min,
                schema.max,
                value,
                path,
                issues,
                context
            );
        case SchemaTag.PropertyNames:
            return emitDynamicCheck(schema, value, path, issues, context);
        case SchemaTag.PatternProperties:
            return emitDynamicCheck(schema, value, path, issues, context);
        case SchemaTag.Readonly:
            return emitCheckCall(schema.inner, value, path, issues, context);
        case SchemaTag.Lazy:
        case SchemaTag.Refine:
            /*
             * Lazy and refine schemas execute runtime logic that cannot be safely
             * inlined into generated source. The `m` helper calls the interpreter
             * diagnostic path through the dynamic schema side table.
             */
            return emitDynamicCheck(schema, value, path, issues, context);
    }
}

/**
 * @brief Emit a diagnostic wrapper that applies a schema-local message.
 * @param inner Wrapped schema.
 * @param message Message assigned to child issues without their own message.
 * @param value Generated candidate expression.
 * @param path Generated path expression.
 * @param issues Generated issue buffer expression.
 * @param context Shared emission context.
 * @returns JavaScript source for the wrapped diagnostic collector.
 */
function emitMessageCheck(
    inner: Schema,
    message: string,
    value: string,
    path: string,
    issues: string,
    context: EmitContext
): string {
    const messageExpression = stringRef(context, message);
    return `{const n=${issues}.length;${emitCheckCall(
        inner,
        value,
        path,
        issues,
        context
    )}for(let i=n;i<${issues}.length;i+=1){const e=${issues}[i];if(e!==undefined&&e.message===undefined)${issues}[i]=Object.freeze({path:e.path,code:e.code,expected:e.expected,actual:e.actual,message:${messageExpression}});}}`;
}

/**
 * @brief Emit diagnostics for an object plus a selected-key rule.
 */
function emitKeyedObjectCheck(
    inner: Schema,
    keys: readonly string[],
    rule: KeyRuleTag,
    value: string,
    path: string,
    issues: string,
    context: EmitContext
): string {
    return `{const n=${issues}.length;${emitCheckCall(
        inner,
        value,
        path,
        issues,
        context
    )}if(${issues}.length===n){${emitKeyedObjectIssue(keys, rule, value, path, issues, context)}}}`;
}

/**
 * @brief Emit the selected-key diagnostic after the object schema passes.
 */
function emitKeyedObjectIssue(
    keys: readonly string[],
    rule: KeyRuleTag,
    value: string,
    path: string,
    issues: string,
    context: EmitContext
): string {
    const expected = rule === KeyRuleTag.AtLeastOne
        ? `at least one of ${keys.join(", ")}`
        : `exactly one of ${keys.join(", ")}`;
    const count = emitKeyCount(keys, value, context);
    if (rule === KeyRuleTag.AtLeastOne) {
        return `{let c=0;${count}if(c===0){${emitIssueExpr(
            issues,
            path,
            "expected_key_count",
            stringRef(context, expected),
            "\"0 matching keys\""
        )}}}`;
    }
    return `{let c=0;${count}if(c!==1){${emitIssueExpr(
        issues,
        path,
        "expected_key_count",
        stringRef(context, expected),
        "String(c)+\" matching keys\""
    )}}}`;
}

/**
 * @brief Emit selected own-data key counting snippets.
 */
function emitKeyCount(
    keys: readonly string[],
    value: string,
    context: EmitContext
): string {
    const parts = new Array<string>(keys.length);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key !== undefined) {
            parts[index] = `if(hd(${value},${stringRef(context, key)}))c+=1;`;
        }
    }
    return parts.join("");
}

/**
 * @brief Emit diagnostics for an object property-count rule.
 */
function emitPropertyCountCheck(
    inner: Schema,
    min: number | undefined,
    max: number | undefined,
    value: string,
    path: string,
    issues: string,
    context: EmitContext
): string {
    return `{const n=${issues}.length;${emitCheckCall(
        inner,
        value,
        path,
        issues,
        context
    )}if(${issues}.length===n){${emitPropertyCountIssue(min, max, value, path, issues, context)}}}`;
}

/**
 * @brief Emit the property-count diagnostic after object validation passes.
 */
function emitPropertyCountIssue(
    min: number | undefined,
    max: number | undefined,
    value: string,
    path: string,
    issues: string,
    context: EmitContext
): string {
    const parts: string[] = [`const c=Object.keys(${value}).length;`];
    if (min !== undefined) {
        parts.push(`if(c<${String(min)}){${emitIssueExpr(
            issues,
            path,
            "expected_key_count",
            stringRef(context, `at least ${String(min)} properties`),
            "String(c)+\" properties\""
        )}}`);
    }
    if (max !== undefined) {
        parts.push(`if(c>${String(max)}){${emitIssueExpr(
            issues,
            path,
            "expected_key_count",
            stringRef(context, `at most ${String(max)} properties`),
            "String(c)+\" properties\""
        )}}`);
    }
    return `{${parts.join("")}}`;
}

/**
 * @brief Emit a diagnostic fallback call for runtime-only schema nodes.
 * @param schema Schema captured in the dynamic side table.
 * @param value Generated candidate value expression.
 * @param path Generated path expression.
 * @param issues Generated issue buffer expression.
 * @param context Shared emission context.
 * @returns JavaScript source delegating diagnostics to the interpreter.
 */
function emitDynamicCheck(
    schema: Schema,
    value: string,
    path: string,
    issues: string,
    context: EmitContext
): string {
    return `m(${String(pushSchema(context, schema))},${value},${path},${issues});`;
}

/**
 * @brief Route child diagnostics through the identity-cached function table.
 * @param schema Child schema to dispatch to.
 * @param value Generated expression for the child value.
 * @param path Generated expression for the mutable path stack.
 * @param issues Generated expression for the issue buffer.
 * @param context Shared code-generation context.
 * @returns JavaScript source for invoking the child diagnostic function.
 */
function emitCheckCall(
    schema: Schema,
    value: string,
    path: string,
    issues: string,
    context: EmitContext
): string {
    return `${emitCheckFunction(schema, context)}(${value},${path},${issues});`;
}

/**
 * @brief Emit an optional static message side-table reference.
 */
function checkMessageExpression(
    message: string | undefined,
    context: EmitContext
): string | undefined {
    return message === undefined ? undefined : stringRef(context, message);
}
