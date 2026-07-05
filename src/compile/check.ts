/**
 * @file compile/check.ts
 * @brief Diagnostic validator function table emitter.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 */

import { SchemaTag } from "../kind/index.js";
import type { Schema } from "../schema/index.js";
import {
    emitArrayCheck,
    emitDiscriminatedUnionCheck,
    emitObjectCheck,
    emitRecordCheck,
    emitTupleCheck
} from "./check-composite.js";
import {
    emitDateCheck,
    emitLiteralCheck,
    emitNumberCheck,
    emitStringCheck
} from "./check-scalar.js";
import { pushSchema } from "./context.js";
import { emitIssue } from "./issue.js";
import { emitUnion } from "./union-preflight.js";
import type { EmitContext, FunctionSource } from "./types.js";

/**
 * @brief emit check function.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
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
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
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
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
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
            return emitNumberCheck(schema, value, path, issues);
        case SchemaTag.Date:
            return emitDateCheck(schema, value, path, issues);
        case SchemaTag.BigInt:
            return `if(typeof ${value}!=="bigint"){${emitIssue(
                issues,
                path,
                "expected_bigint",
                "bigint",
                `a(${value})`
            )}}`;
        case SchemaTag.Symbol:
            return `if(typeof ${value}!=="symbol"){${emitIssue(
                issues,
                path,
                "expected_symbol",
                "symbol",
                `a(${value})`
            )}}`;
        case SchemaTag.Boolean:
            return `if(typeof ${value}!=="boolean"){${emitIssue(
                issues,
                path,
                "expected_boolean",
                "boolean",
                `a(${value})`
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
            return emitRecordCheck(schema.value, value, path, issues, context, emitCheckFunction);
        case SchemaTag.Map:
        case SchemaTag.Set:
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
 * @brief emit check call.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
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
