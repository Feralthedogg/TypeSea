/**
 * @file compile/check-composite.ts
 * @brief Composite diagnostic validator snippets.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 */

import {
    ArrayCheckTag,
    ObjectModeTag,
    PresenceTag,
    SchemaTag
} from "../kind/index.js";
import {
    schemaCanAcceptUndefined,
    type DiscriminatedUnionCase,
    type Schema
} from "../schema/index.js";
import {
    pushLiteral,
    stringRef
} from "./context.js";
import {
    emitIssue,
    emitIssueAtSegment,
    emitIssueAtTwoSegments,
    emitIssueExprAtSegment
} from "./issue.js";
import {
    emitLeafCheckAtSegment,
    emitLeafCheckAtTwoSegments,
    emitUndefinedLeafCheckAtTwoSegments,
    emitUndefinedLeafCheckAtSegment
} from "./check-scalar.js";
import { stringLiteral } from "./names.js";
import type { EmitContext } from "./types.js";

/**
 * @brief check function emitter.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 */
export type CheckFunctionEmitter = (
    schema: Schema,
    context: EmitContext
) => string;

/**
 * @brief emit array check.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param item Schema applied to each logical array slot.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the mutable diagnostic path.
 * @param issues Generated expression for the diagnostic buffer.
 * @param context Shared code-generation context.
 * @param emitChild Fallback emitter for non-leaf child validators.
 * @returns JavaScript source for array diagnostics.
 */
export function emitArrayCheck(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Array }>,
    value: string,
    path: string,
    issues: string,
    context: EmitContext,
    emitChild: CheckFunctionEmitter
): string {
    if (isUnsafeMode(context)) {
        return emitUnsafeArrayCheck(schema, value, path, issues, context, emitChild);
    }
    const item = schema.item;
    const itemValue = "av";
    const itemLeaf = emitLeafCheckAtSegment(
        item,
        itemValue,
        path,
        "i",
        issues,
        context
    );
    const missingLeaf = itemLeaf === undefined
        ? undefined
        : emitUndefinedLeafCheckAtSegment(item, path, "i", issues, context);
    let missingCheck: string;
    let itemCheck: string;
    if (itemLeaf === undefined || missingLeaf === undefined) {
        const itemFunction = emitChild(item, context);
        missingCheck = `${path}.push(i);${itemFunction}(undefined,${path},${issues});${path}.pop();`;
        itemCheck = `${path}.push(i);${itemFunction}(${itemValue},${path},${issues});${path}.pop();`;
    } else {
        missingCheck = missingLeaf;
        itemCheck = itemLeaf;
    }
    const presentCheck = itemCheck === ""
        ? ""
        : `const ${itemValue}=d.value;${itemCheck}`;
    if (schemaCanAcceptUndefined(item)) {
        /*
         * Generated diagnostics mirror the interpreter: holes are valid only
         * after the item schema admits undefined, while present accessors still
         * produce a data-property issue instead of executing.
         */
        return [
            `if(!Array.isArray(${value})){${emitIssue(
                issues,
                path,
                "expected_array",
                "array",
                `a(${value})`
            )}return;}`,
            emitArrayLengthIssues(schema, value, path, issues),
            `const xs=Object.getOwnPropertyNames(${value});`,
            "for(let xi=0;xi<xs.length;xi+=1){",
            "const key=xs[xi];",
            `if(!ai(key,${value}.length))continue;`,
            "const i=Number(key);",
            `const d=gp(${value},key);`,
            `if(d!==undefined&&!h.call(d,"value")){${emitIssueAtSegment(
                issues,
                path,
                "i",
                "expected_array",
                "data property",
                stringLiteral("accessor")
            )}}else if(d!==undefined){${presentCheck}}`,
            "}"
        ].join("");
    }
    return [
        `if(!Array.isArray(${value})){${emitIssue(
            issues,
            path,
            "expected_array",
            "array",
            `a(${value})`
        )}return;}`,
        emitArrayLengthIssues(schema, value, path, issues),
        `for(let i=0;i<${value}.length;i+=1){`,
        `const d=gp(${value},i);`,
        `if(d===undefined){${missingCheck}}else if(!h.call(d,"value")){${emitIssueAtSegment(
            issues,
            path,
            "i",
            "expected_array",
            "data property",
            stringLiteral("accessor")
        )}}else{${presentCheck}}`,
        "}"
    ].join("");
}

/**
 * @brief emit tuple check.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 */
export function emitTupleCheck(
    items: readonly Schema[],
    value: string,
    path: string,
    issues: string,
    context: EmitContext,
    emitChild: CheckFunctionEmitter
): string {
    if (isUnsafeMode(context)) {
        return emitUnsafeTupleCheck(items, value, path, issues, context, emitChild);
    }
    const parts: string[] = [
        `if(!Array.isArray(${value})){${emitIssue(
            issues,
            path,
            "expected_tuple",
            "tuple",
            `a(${value})`
        )}return;}`,
        `if(${value}.length!==${String(items.length)}){${emitIssue(
            issues,
            path,
            "expected_tuple_length",
            `length ${String(items.length)}`,
            `"length "+String(${value}.length)`
        )}}`,
        `const n=${value}.length<${String(items.length)}?${value}.length:${String(items.length)};`
    ];
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (item === undefined) {
            continue;
        }
        const indexExpression = String(index);
        const itemValue = `tv${indexExpression}`;
        const itemLeaf = emitLeafCheckAtSegment(
            item,
            itemValue,
            path,
            indexExpression,
            issues,
            context
        );
        const missingLeaf = itemLeaf === undefined
            ? undefined
            : emitUndefinedLeafCheckAtSegment(
                item,
                path,
                indexExpression,
                issues,
                context
            );
        let missingCheck: string;
        let itemCheck: string;
        if (itemLeaf === undefined || missingLeaf === undefined) {
            const itemFunction = emitChild(item, context);
            missingCheck = `${path}.push(${indexExpression});${itemFunction}(undefined,${path},${issues});${path}.pop();`;
            itemCheck = `${path}.push(${indexExpression});${itemFunction}(${itemValue},${path},${issues});${path}.pop();`;
        } else {
            missingCheck = missingLeaf;
            itemCheck = itemLeaf;
        }
        const presentCheck = itemCheck === ""
            ? ""
            : `const ${itemValue}=d.value;${itemCheck}`;
        parts.push(`if(${indexExpression}<n){const d=gp(${value},${indexExpression});if(d===undefined){${missingCheck}}else if(!h.call(d,"value")){${emitIssueAtSegment(
            issues,
            path,
            indexExpression,
            "expected_tuple",
            "data property",
            stringLiteral("accessor")
        )}}else{${presentCheck}}}`);
    }
    return parts.join("");
}

/**
 * @brief Execute emit unsafe array check.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function emitUnsafeArrayCheck(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Array }>,
    value: string,
    path: string,
    issues: string,
    context: EmitContext,
    emitChild: CheckFunctionEmitter
): string {
    const item = schema.item;
    const itemValue = "av";
    const itemLeaf = emitLeafCheckAtSegment(
        item,
        itemValue,
        path,
        "i",
        issues,
        context
    );
    let itemCheck: string;
    if (itemLeaf === undefined) {
        const itemFunction = emitChild(item, context);
        itemCheck = `${path}.push(i);${itemFunction}(${itemValue},${path},${issues});${path}.pop();`;
    } else {
        itemCheck = itemLeaf;
    }
    const parts = [
        `if(!Array.isArray(${value})){${emitIssue(
            issues,
            path,
            "expected_array",
            "array",
            `a(${value})`
            )}return;}`
    ];
    parts.push(emitArrayLengthIssues(schema, value, path, issues));
    if (itemCheck !== "") {
        parts.push(
            `for(let i=0;i<${value}.length;i+=1){`,
            `const ${itemValue}=${value}[i];`,
            itemCheck,
            "}"
        );
    }
    return parts.join("");
}

/**
 * @brief Emit root-level array length diagnostics.
 * @param schema Array schema with normalized checks.
 * @param value Generated expression for the candidate array.
 * @param path Generated expression for the current diagnostic path.
 * @param issues Generated expression for the issue buffer.
 * @returns JavaScript source that appends zero or more length issues.
 */
function emitArrayLengthIssues(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Array }>,
    value: string,
    path: string,
    issues: string
): string {
    const chunks: string[] = [];
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case ArrayCheckTag.Min:
                chunks.push(`if(${value}.length<${String(check.value)}){${emitIssue(
                    issues,
                    path,
                    "expected_min_length",
                    `length >= ${String(check.value)}`,
                    `"length "+String(${value}.length)`
                )}}`);
                break;
            case ArrayCheckTag.Max:
                chunks.push(`if(${value}.length>${String(check.value)}){${emitIssue(
                    issues,
                    path,
                    "expected_max_length",
                    `length <= ${String(check.value)}`,
                    `"length "+String(${value}.length)`
                )}}`);
                break;
        }
    }
    return chunks.join("");
}

/**
 * @brief Emit one-segment array length diagnostics.
 * @param schema Array schema with normalized checks.
 * @param value Generated expression for the candidate array.
 * @param path Generated expression for the current diagnostic path.
 * @param segmentExpression Generated path segment for the array field.
 * @param issues Generated expression for the issue buffer.
 * @returns JavaScript source that appends zero or more length issues.
 */
function emitArrayLengthIssuesAtSegment(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Array }>,
    value: string,
    path: string,
    segmentExpression: string,
    issues: string
): string {
    const chunks: string[] = [];
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case ArrayCheckTag.Min:
                chunks.push(`if(${value}.length<${String(check.value)}){${emitIssueAtSegment(
                    issues,
                    path,
                    segmentExpression,
                    "expected_min_length",
                    `length >= ${String(check.value)}`,
                    `"length "+String(${value}.length)`
                )}}`);
                break;
            case ArrayCheckTag.Max:
                chunks.push(`if(${value}.length>${String(check.value)}){${emitIssueAtSegment(
                    issues,
                    path,
                    segmentExpression,
                    "expected_max_length",
                    `length <= ${String(check.value)}`,
                    `"length "+String(${value}.length)`
                )}}`);
                break;
        }
    }
    return chunks.join("");
}

/**
 * @brief Execute emit unsafe tuple check.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function emitUnsafeTupleCheck(
    items: readonly Schema[],
    value: string,
    path: string,
    issues: string,
    context: EmitContext,
    emitChild: CheckFunctionEmitter
): string {
    const parts: string[] = [
        `if(!Array.isArray(${value})){${emitIssue(
            issues,
            path,
            "expected_tuple",
            "tuple",
            `a(${value})`
        )}return;}`,
        `if(${value}.length!==${String(items.length)}){${emitIssue(
            issues,
            path,
            "expected_tuple_length",
            `length ${String(items.length)}`,
            `"length "+String(${value}.length)`
        )}}`,
        `const n=${value}.length<${String(items.length)}?${value}.length:${String(items.length)};`
    ];
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (item === undefined) {
            continue;
        }
        const indexExpression = String(index);
        const itemValue = `tv${indexExpression}`;
        const itemLeaf = emitLeafCheckAtSegment(
            item,
            itemValue,
            path,
            indexExpression,
            issues,
            context
        );
        let itemCheck: string;
        if (itemLeaf === undefined) {
            const itemFunction = emitChild(item, context);
            itemCheck = `${path}.push(${indexExpression});${itemFunction}(${itemValue},${path},${issues});${path}.pop();`;
        } else {
            itemCheck = itemLeaf;
        }
        if (itemCheck !== "") {
            parts.push(`if(${indexExpression}<n){const ${itemValue}=${value}[${indexExpression}];${itemCheck}}`);
        }
    }
    return parts.join("");
}

/**
 * @brief emit array check at one appended object-field segment.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param item Schema applied to each logical array slot.
 * @param value Generated expression for the candidate value.
 * @param path Generated expression for the mutable diagnostic path.
 * @param segmentExpression Generated parent path segment.
 * @param issues Generated expression for the diagnostic buffer.
 * @param context Shared code-generation context.
 * @returns JavaScript source, or undefined when the caller must fall back.
 */
function emitArrayCheckAtSegment(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Array }>,
    value: string,
    path: string,
    segmentExpression: string,
    issues: string,
    context: EmitContext
): string | undefined {
    if (isUnsafeMode(context)) {
        return emitUnsafeArrayCheckAtSegment(
            schema,
            value,
            path,
            segmentExpression,
            issues,
            context
        );
    }
    const item = schema.item;
    const itemValue = "av";
    const itemLeaf = emitLeafCheckAtTwoSegments(
        item,
        itemValue,
        path,
        segmentExpression,
        "i",
        issues,
        context
    );
    const missingLeaf = itemLeaf === undefined
        ? undefined
        : emitUndefinedLeafCheckAtTwoSegments(
            item,
            path,
            segmentExpression,
            "i",
            issues,
            context
        );
    if (itemLeaf === undefined || missingLeaf === undefined) {
        return undefined;
    }
    const presentCheck = itemLeaf === ""
        ? ""
        : `const ${itemValue}=vd.value;${itemLeaf}`;
    if (schemaCanAcceptUndefined(item)) {
        /*
         * The two-segment variant is used inside object fields. It keeps the
         * parent key and array index inline so diagnostics avoid path-stack churn.
         */
        return [
            `if(!Array.isArray(${value})){${emitIssueAtSegment(
                issues,
                path,
                segmentExpression,
                "expected_array",
                "array",
                `a(${value})`
            )}}else{`,
            emitArrayLengthIssuesAtSegment(schema, value, path, segmentExpression, issues),
            `const xs=Object.getOwnPropertyNames(${value});`,
            "for(let xi=0;xi<xs.length;xi+=1){",
            "const key=xs[xi];",
            `if(!ai(key,${value}.length))continue;`,
            "const i=Number(key);",
            `const vd=gp(${value},key);`,
            `if(vd!==undefined&&!h.call(vd,"value")){${emitIssueAtTwoSegments(
                issues,
                path,
                segmentExpression,
                "i",
                "expected_array",
                "data property",
                stringLiteral("accessor")
            )}}else if(vd!==undefined){${presentCheck}}`,
            "}",
            "}"
        ].join("");
    }
    return [
        `if(!Array.isArray(${value})){${emitIssueAtSegment(
            issues,
            path,
            segmentExpression,
            "expected_array",
            "array",
            `a(${value})`
        )}}else{`,
        emitArrayLengthIssuesAtSegment(schema, value, path, segmentExpression, issues),
        `for(let i=0;i<${value}.length;i+=1){`,
        `const vd=gp(${value},i);`,
        `if(vd===undefined){${missingLeaf}}else if(!h.call(vd,"value")){${emitIssueAtTwoSegments(
            issues,
            path,
            segmentExpression,
            "i",
            "expected_array",
            "data property",
            stringLiteral("accessor")
        )}}else{${presentCheck}}`,
        "}",
        "}"
    ].join("");
}

/**
 * @brief emit tuple check at one appended object-field segment.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 */
function emitTupleCheckAtSegment(
    items: readonly Schema[],
    value: string,
    path: string,
    segmentExpression: string,
    issues: string,
    context: EmitContext
): string | undefined {
    if (isUnsafeMode(context)) {
        return emitUnsafeTupleCheckAtSegment(
            items,
            value,
            path,
            segmentExpression,
            issues,
            context
        );
    }
    const parts: string[] = [
        `if(!Array.isArray(${value})){${emitIssueAtSegment(
            issues,
            path,
            segmentExpression,
            "expected_tuple",
            "tuple",
            `a(${value})`
        )}}else{`,
        `if(${value}.length!==${String(items.length)}){${emitIssueAtSegment(
            issues,
            path,
            segmentExpression,
            "expected_tuple_length",
            `length ${String(items.length)}`,
            `"length "+String(${value}.length)`
        )}}`,
        `const n=${value}.length<${String(items.length)}?${value}.length:${String(items.length)};`
    ];
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (item === undefined) {
            continue;
        }
        const indexExpression = String(index);
        const itemValue = `tv${indexExpression}`;
        const itemLeaf = emitLeafCheckAtTwoSegments(
            item,
            itemValue,
            path,
            segmentExpression,
            indexExpression,
            issues,
            context
        );
        const missingLeaf = itemLeaf === undefined
            ? undefined
            : emitUndefinedLeafCheckAtTwoSegments(
                item,
                path,
                segmentExpression,
                indexExpression,
                issues,
                context
            );
        if (itemLeaf === undefined || missingLeaf === undefined) {
            return undefined;
        }
        const presentCheck = itemLeaf === ""
            ? ""
            : `const ${itemValue}=td.value;${itemLeaf}`;
        parts.push(`if(${indexExpression}<n){const td=gp(${value},${indexExpression});if(td===undefined){${missingLeaf}}else if(!h.call(td,"value")){${emitIssueAtTwoSegments(
            issues,
            path,
            segmentExpression,
            indexExpression,
            "expected_tuple",
            "data property",
            stringLiteral("accessor")
        )}}else{${presentCheck}}}`);
    }
    parts.push("}");
    return parts.join("");
}

/**
 * @brief Execute emit unsafe array check at segment.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function emitUnsafeArrayCheckAtSegment(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Array }>,
    value: string,
    path: string,
    segmentExpression: string,
    issues: string,
    context: EmitContext
): string | undefined {
    const item = schema.item;
    const itemLeaf = emitLeafCheckAtTwoSegments(
        item,
        "av",
        path,
        segmentExpression,
        "i",
        issues,
        context
    );
    if (itemLeaf === undefined) {
        return undefined;
    }
    const parts = [
        `if(!Array.isArray(${value})){${emitIssueAtSegment(
            issues,
            path,
            segmentExpression,
            "expected_array",
            "array",
            `a(${value})`
        )}}`
    ];
    parts.push(
        "else{",
        emitArrayLengthIssuesAtSegment(schema, value, path, segmentExpression, issues)
    );
    if (itemLeaf !== "") {
        parts.push(
            `for(let i=0;i<${value}.length;i+=1){`,
            `const av=${value}[i];`,
            itemLeaf,
            "}",
        );
    }
    parts.push("}");
    return parts.join("");
}

/**
 * @brief Execute emit unsafe tuple check at segment.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function emitUnsafeTupleCheckAtSegment(
    items: readonly Schema[],
    value: string,
    path: string,
    segmentExpression: string,
    issues: string,
    context: EmitContext
): string | undefined {
    const parts: string[] = [
        `if(!Array.isArray(${value})){${emitIssueAtSegment(
            issues,
            path,
            segmentExpression,
            "expected_tuple",
            "tuple",
            `a(${value})`
        )}}else{`,
        `if(${value}.length!==${String(items.length)}){${emitIssueAtSegment(
            issues,
            path,
            segmentExpression,
            "expected_tuple_length",
            `length ${String(items.length)}`,
            `"length "+String(${value}.length)`
        )}}`,
        `const n=${value}.length<${String(items.length)}?${value}.length:${String(items.length)};`
    ];
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (item === undefined) {
            continue;
        }
        const indexExpression = String(index);
        const itemValue = `tv${indexExpression}`;
        const itemLeaf = emitLeafCheckAtTwoSegments(
            item,
            itemValue,
            path,
            segmentExpression,
            indexExpression,
            issues,
            context
        );
        if (itemLeaf === undefined) {
            return undefined;
        }
        if (itemLeaf !== "") {
            parts.push(`if(${indexExpression}<n){const ${itemValue}=${value}[${indexExpression}];${itemLeaf}}`);
        }
    }
    parts.push("}");
    return parts.join("");
}

/**
 * @brief emit record check.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 */
export function emitRecordCheck(
    item: Schema,
    value: string,
    path: string,
    issues: string,
    context: EmitContext,
    emitChild: CheckFunctionEmitter
): string {
    if (isUnsafeMode(context)) {
        return emitUnsafeRecordCheck(item, value, path, issues, context, emitChild);
    }
    const itemValue = "rv";
    const itemLeaf = emitLeafCheckAtSegment(
        item,
        itemValue,
        path,
        "key",
        issues,
        context
    );
    let itemCheck: string;
    if (itemLeaf === undefined) {
        const itemFunction = emitChild(item, context);
        itemCheck = `${path}.push(key);${itemFunction}(${itemValue},${path},${issues});${path}.pop();`;
    } else {
        itemCheck = itemLeaf;
    }
    const presentCheck = itemCheck === ""
        ? ""
        : `const ${itemValue}=d.value;${itemCheck}`;
    return [
        `if(${objectRejectExpression(value)}){${emitIssue(
            issues,
            path,
            "expected_record",
            "record",
            `a(${value})`
        )}return;}`,
        `for(const key in ${value}){`,
        `if(!h.call(${value},key))continue;`,
        `const d=gp(${value},key);if(d===undefined||!h.call(d,"value")){${emitIssueAtSegment(
            issues,
            path,
            "key",
            "expected_record",
            "data property",
            stringLiteral("accessor or missing")
        )}}else{${presentCheck}}`,
        "}"
    ].join("");
}

/**
 * @brief emit record check at one appended object-field segment.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 */
function emitRecordCheckAtSegment(
    item: Schema,
    value: string,
    path: string,
    segmentExpression: string,
    issues: string,
    context: EmitContext
): string | undefined {
    if (isUnsafeMode(context)) {
        return emitUnsafeRecordCheckAtSegment(
            item,
            value,
            path,
            segmentExpression,
            issues,
            context
        );
    }
    const itemValue = "rv";
    const itemLeaf = emitLeafCheckAtTwoSegments(
        item,
        itemValue,
        path,
        segmentExpression,
        "key",
        issues,
        context
    );
    if (itemLeaf === undefined) {
        return undefined;
    }
    const presentCheck = itemLeaf === ""
        ? ""
        : `const ${itemValue}=rd.value;${itemLeaf}`;
    return [
        `if(${objectRejectExpression(value)}){${emitIssueAtSegment(
            issues,
            path,
            segmentExpression,
            "expected_record",
            "record",
            `a(${value})`
        )}}else{`,
        `for(const key in ${value}){`,
        `if(!h.call(${value},key))continue;`,
        `const rd=gp(${value},key);if(rd===undefined||!h.call(rd,"value")){${emitIssueAtTwoSegments(
            issues,
            path,
            segmentExpression,
            "key",
            "expected_record",
            "data property",
            stringLiteral("accessor or missing")
        )}}else{${presentCheck}}`,
        "}",
        "}"
    ].join("");
}

/**
 * @brief Execute emit unsafe record check.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function emitUnsafeRecordCheck(
    item: Schema,
    value: string,
    path: string,
    issues: string,
    context: EmitContext,
    emitChild: CheckFunctionEmitter
): string {
    const itemValue = "rv";
    const itemLeaf = emitLeafCheckAtSegment(
        item,
        itemValue,
        path,
        "key",
        issues,
        context
    );
    let itemCheck: string;
    if (itemLeaf === undefined) {
        const itemFunction = emitChild(item, context);
        itemCheck = `${path}.push(key);${itemFunction}(${itemValue},${path},${issues});${path}.pop();`;
    } else {
        itemCheck = itemLeaf;
    }
    const parts = [
        `if(${objectRejectExpression(value)}){${emitIssue(
            issues,
            path,
            "expected_record",
            "record",
            `a(${value})`
        )}return;}`
    ];
    if (itemCheck !== "") {
        parts.push(
            `for(const key in ${value}){`,
            isUncheckedMode(context) ? "" : `if(!h.call(${value},key))continue;`,
            `const ${itemValue}=${value}[key];`,
            itemCheck,
            "}"
        );
    }
    return parts.join("");
}

/**
 * @brief Execute emit unsafe record check at segment.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function emitUnsafeRecordCheckAtSegment(
    item: Schema,
    value: string,
    path: string,
    segmentExpression: string,
    issues: string,
    context: EmitContext
): string | undefined {
    const itemLeaf = emitLeafCheckAtTwoSegments(
        item,
        "rv",
        path,
        segmentExpression,
        "key",
        issues,
        context
    );
    if (itemLeaf === undefined) {
        return undefined;
    }
    const parts = [
        `if(${objectRejectExpression(value)}){${emitIssueAtSegment(
            issues,
            path,
            segmentExpression,
            "expected_record",
            "record",
            `a(${value})`
        )}}`
    ];
    if (itemLeaf !== "") {
        parts.push(
            "else{",
            `for(const key in ${value}){`,
            isUncheckedMode(context) ? "" : `if(!h.call(${value},key))continue;`,
            `const rv=${value}[key];`,
            itemLeaf,
            "}",
            "}"
        );
    }
    return parts.join("");
}

/**
 * @brief emit object check.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 */
export function emitObjectCheck(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    value: string,
    path: string,
    issues: string,
    context: EmitContext,
    emitChild: CheckFunctionEmitter
): string {
    if (isUnsafeMode(context)) {
        return emitUnsafeObjectCheck(
            schema,
            value,
            path,
            issues,
            context,
            emitChild
        );
    }
    const parts: string[] = [
        `if(${objectRejectExpression(value)}){${emitIssue(
            issues,
            path,
            "expected_object",
            "object",
            `a(${value})`
        )}return;}`
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
        const itemValue = `v${String(index)}`;
        const leaf = emitLeafCheckAtSegment(
            entry.schema,
            itemValue,
            path,
            key,
            issues,
            context
        );
        const composite = leaf === undefined
            ? emitCompositeCheckAtSegment(
                entry.schema,
                itemValue,
                path,
                key,
                issues,
                context
            )
            : undefined;
        let childCheck = leaf ?? composite;
        if (childCheck === undefined) {
            const child = emitChild(entry.schema, context);
            childCheck = `${path}.push(${key});${child}(${itemValue},${path},${issues});${path}.pop();`;
        }
        const presentCheck = childCheck === ""
            ? ""
            : `const ${itemValue}=d.value;${childCheck}`;
        if (entry.presence === PresenceTag.Required) {
            parts.push(`{const d=gp(${value},${key});if(d===undefined||!h.call(d,"value")){${emitIssueAtSegment(
                issues,
                path,
                key,
                "expected_required_key",
                "present key",
                stringLiteral("missing")
            )}}else{${presentCheck}}}`);
        } else {
            parts.push(`if(h.call(${value},${key})){const d=gp(${value},${key});if(d===undefined||!h.call(d,"value")){${emitIssueAtSegment(
                issues,
                path,
                key,
                "expected_object",
                "data property",
                stringLiteral("accessor")
            )}}else{${presentCheck}}}`);
        }
    }
    if (schema.catchall !== undefined) {
        parts.push(emitObjectCatchallCheck(
            schema,
            value,
            path,
            issues,
            context,
            emitChild
        ));
    } else if (schema.mode === ObjectModeTag.Strict) {
        parts.push(`const xs=Object.getOwnPropertyNames(${value});const xn=xs.length;for(let i=0;i<xn;i+=1){const key=xs[i];if(!(${safeKeyMembershipExpression(
            "key",
            keyExpressions
        )})){${emitIssueAtSegment(
            issues,
            path,
            "key",
            "unrecognized_key",
            "known key",
            stringLiteral("extra key")
        )}}}const ys=Object.getOwnPropertySymbols(${value});const yn=ys.length;for(let i=0;i<yn;i+=1){const key=ys[i];if(key!==undefined){${emitIssueAtSegment(
            issues,
            path,
            "String(key)",
            "unrecognized_key",
            "known key",
            stringLiteral("extra key")
        )}}}`);
    }
    return parts.join("");
}

/**
 * @brief Emit diagnostic collection for object catchall keys.
 */
function emitObjectCatchallCheck(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    value: string,
    path: string,
    issues: string,
    context: EmitContext,
    emitChild: CheckFunctionEmitter
): string {
    const catchall = schema.catchall;
    if (catchall === undefined) {
        return "";
    }
    const child = emitChild(catchall, context);
    const membership = safeKeyMembershipExpression(
        "key",
        objectKeyExpressions(schema, context)
    );
    return [
        `const cx=Reflect.ownKeys(${value});`,
        "const cn=cx.length;",
        "for(let ci=0;ci<cn;ci+=1){",
        "const key=cx[ci];",
        `if(typeof key==="string"&&(${membership}))continue;`,
        "const pk=typeof key===\"string\"?key:String(key);",
        `const cd=gp(${value},key);`,
        `if(cd===undefined||!h.call(cd,"value")){${emitIssueAtSegment(
            issues,
            path,
            "pk",
            "expected_object",
            "data property",
            stringLiteral("accessor")
        )}}else{`,
        `${path}.push(pk);${child}(cd.value,${path},${issues});${path}.pop();`,
        "}}"
    ].join("");
}

/**
 * @brief Convert object schema keys into side-table source expressions.
 */
function objectKeyExpressions(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    context: EmitContext
): readonly string[] {
    const keys = new Array<string>(schema.keys.length);
    for (let index = 0; index < schema.keys.length; index += 1) {
        const key = schema.keys[index];
        if (key !== undefined) {
            keys[index] = stringRef(context, key);
        }
    }
    return keys;
}

/**
 * @brief Execute emit unsafe object check.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function emitUnsafeObjectCheck(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    value: string,
    path: string,
    issues: string,
    context: EmitContext,
    emitChild: CheckFunctionEmitter
): string {
    const parts: string[] = [
        `if(${objectRejectExpression(value)}){${emitIssue(
            issues,
            path,
            "expected_object",
            "object",
            `a(${value})`
        )}return;}`
    ];
    const entries = schema.entries;
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
            continue;
        }
        const key = unsafeStringLiteralExpression(entry.key);
        const itemValue = `v${String(index)}`;
        const childCheck = emitObjectFieldCheck(
            entry.schema,
            itemValue,
            path,
            key,
            issues,
            context,
            emitChild
        );
        parts.push(`{const ${itemValue}=${unsafePropertyReadExpression(value, entry.key)};`);
        if (entry.presence === PresenceTag.Optional) {
            parts.push(
                `if(${itemValue}!==undefined){${childCheck}}else if(h.call(${value},${key})){${childCheck}}`
            );
        } else if (schemaCanAcceptUndefined(entry.schema)) {
            parts.push(
                `if(${itemValue}===undefined&&!h.call(${value},${key})){${emitIssueAtSegment(
                    issues,
                    path,
                    key,
                    "expected_required_key",
                    "present key",
                    stringLiteral("missing")
                )}}else{${childCheck}}`
            );
        } else {
            parts.push(childCheck);
        }
        parts.push("}");
    }
    if (schema.catchall !== undefined) {
        parts.push(emitUnsafeObjectCatchallCheck(
            schema,
            value,
            path,
            issues,
            context,
            emitChild
        ));
    } else if (schema.mode === ObjectModeTag.Strict && !isUncheckedMode(context)) {
        const keys = new Array<string>(schema.entries.length);
        for (let index = 0; index < schema.entries.length; index += 1) {
            const entry = schema.entries[index];
            if (entry !== undefined) {
                keys[index] = entry.key;
            }
        }
        parts.push(
            `for(const key in ${value}){if(h.call(${value},key)&&!(${unsafeKeyMembershipExpression(
                "key",
                keys
            )})){${emitIssueAtSegment(
                issues,
                path,
                "key",
                "unrecognized_key",
                "known key",
                stringLiteral("extra key")
            )}}}`
        );
    }
    return parts.join("");
}

/**
 * @brief Emit unsafe diagnostic collection for object catchall keys.
 */
function emitUnsafeObjectCatchallCheck(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    value: string,
    path: string,
    issues: string,
    context: EmitContext,
    emitChild: CheckFunctionEmitter
): string {
    const catchall = schema.catchall;
    if (catchall === undefined) {
        return "";
    }
    const child = emitChild(catchall, context);
    const membership = unsafeKeyMembershipExpression("key", schema.keys);
    return [
        `const cx=Reflect.ownKeys(${value});`,
        "const cn=cx.length;",
        "for(let ci=0;ci<cn;ci+=1){",
        "const key=cx[ci];",
        `if(typeof key==="string"&&(${membership}))continue;`,
        "const pk=typeof key===\"string\"?key:String(key);",
        `${path}.push(pk);${child}(${value}[key],${path},${issues});${path}.pop();`,
        "}"
    ].join("");
}

/**
 * @brief Execute emit object field check.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function emitObjectFieldCheck(
    schema: Schema,
    value: string,
    path: string,
    segmentExpression: string,
    issues: string,
    context: EmitContext,
    emitChild: CheckFunctionEmitter
): string {
    const leaf = emitLeafCheckAtSegment(
        schema,
        value,
        path,
        segmentExpression,
        issues,
        context
    );
    if (leaf !== undefined) {
        return leaf;
    }
    const composite = emitCompositeCheckAtSegment(
        schema,
        value,
        path,
        segmentExpression,
        issues,
        context
    );
    if (composite !== undefined) {
        return composite;
    }
    const child = emitChild(schema, context);
    return `${path}.push(${segmentExpression});${child}(${value},${path},${issues});${path}.pop();`;
}

/**
 * @brief Execute emit composite check at segment.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function emitCompositeCheckAtSegment(
    schema: Schema,
    value: string,
    path: string,
    segmentExpression: string,
    issues: string,
    context: EmitContext
): string | undefined {
    switch (schema.tag) {
        case SchemaTag.Array:
            return emitArrayCheckAtSegment(
                schema,
                value,
                path,
                segmentExpression,
                issues,
                context
            );
        case SchemaTag.Tuple:
            if (schema.rest !== undefined) {
                return undefined;
            }
            return emitTupleCheckAtSegment(
                schema.items,
                value,
                path,
                segmentExpression,
                issues,
                context
            );
        case SchemaTag.Record:
            return emitRecordCheckAtSegment(
                schema.value,
                value,
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
 * @brief emit discriminated union check.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 */
export function emitDiscriminatedUnionCheck(
    key: string,
    cases: readonly DiscriminatedUnionCase[],
    value: string,
    path: string,
    issues: string,
    context: EmitContext,
    emitChild: CheckFunctionEmitter
): string {
    if (isUnsafeMode(context)) {
        return emitUnsafeDiscriminatedUnionCheck(
            key,
            cases,
            value,
            path,
            issues,
            context,
            emitChild
        );
    }
    const keyRef = stringRef(context, key);
    const parts: string[] = [
        `if(${objectRejectExpression(value)}){${emitIssue(
            issues,
            path,
            "expected_object",
            "object",
            `a(${value})`
        )}return;}`,
        `const dd=gp(${value},${keyRef});`,
        `if(dd===undefined||!h.call(dd,"value")){${emitIssueAtSegment(
            issues,
            path,
            keyRef,
            "expected_discriminant",
            "data property",
            stringLiteral("missing or accessor")
        )}return;}`,
        "const dv=dd.value;",
        `if(typeof dv!=="string"){${emitIssueAtSegment(
            issues,
            path,
            keyRef,
            "expected_discriminant",
            "string discriminant",
            "a(dv)"
        )}return;}`
    ];
    for (let index = 0; index < cases.length; index += 1) {
        const unionCase = cases[index];
        if (unionCase === undefined) {
            continue;
        }
        const literal = unionCase.literal;
        const schema = unionCase.schema;
        const literalIndex = pushLiteral(context, literal);
        const check = emitChild(schema, context);
        parts.push(`if(Object.is(dv,l[${String(literalIndex)}])){${check}(${value},${path},${issues});return;}`);
    }
    parts.push(emitIssueExprAtSegment(
        issues,
        path,
        keyRef,
        "expected_discriminant",
        stringLiteral("known discriminant"),
        "le(dv)"
    ));
    return parts.join("");
}

/**
 * @brief Execute emit unsafe discriminated union check.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function emitUnsafeDiscriminatedUnionCheck(
    key: string,
    cases: readonly DiscriminatedUnionCase[],
    value: string,
    path: string,
    issues: string,
    context: EmitContext,
    emitChild: CheckFunctionEmitter
): string {
    const keyRef = unsafeStringLiteralExpression(key);
    const parts: string[] = [
        `if(${objectRejectExpression(value)}){${emitIssue(
            issues,
            path,
            "expected_object",
            "object",
            `a(${value})`
        )}return;}`,
        `const dv=${unsafePropertyReadExpression(value, key)};`,
        `if(typeof dv!=="string"){${emitIssueAtSegment(
            issues,
            path,
            keyRef,
            "expected_discriminant",
            "string discriminant",
            "a(dv)"
        )}return;}`
    ];
    for (let index = 0; index < cases.length; index += 1) {
        const unionCase = cases[index];
        if (unionCase === undefined) {
            continue;
        }
        const literal = unionCase.literal;
        const schema = unionCase.schema;
        const check = emitChild(schema, context);
        parts.push(`if(dv===${unsafeStringLiteralExpression(literal)}){${check}(${value},${path},${issues});return;}`);
    }
    parts.push(emitIssueExprAtSegment(
        issues,
        path,
        keyRef,
        "expected_discriminant",
        stringLiteral("known discriminant"),
        "le(dv)"
    ));
    return parts.join("");
}

/**
 * @brief Execute object reject expression.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function objectRejectExpression(value: string): string {
    return `typeof ${value}!=="object"||${value}===null||Array.isArray(${value})`;
}

/**
 * @brief Check unsafe mode.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function isUnsafeMode(context: EmitContext): boolean {
    return context.mode !== "safe";
}

/**
 * @brief Check unchecked mode.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function isUncheckedMode(context: EmitContext): boolean {
    return context.mode === "unchecked";
}

/**
 * @brief Execute unsafe property read expression.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function unsafePropertyReadExpression(
    objectExpression: string,
    key: string
): string {
    if (isAsciiIdentifierName(key)) {
        return `${objectExpression}.${key}`;
    }
    return `${objectExpression}[${unsafeStringLiteralExpression(key)}]`;
}

/**
 * @brief Execute unsafe key membership expression.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function unsafeKeyMembershipExpression(
    key: string,
    keys: readonly string[]
): string {
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
    return parts.join("||");
}

/**
 * @brief Execute safe key membership expression.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
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
        const expression = keyExpressions[index];
        parts[index] = expression === undefined
            ? "false"
            : `${key}===${expression}`;
    }
    return parts.join("||");
}

/**
 * @brief Check ascii identifier name.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function isAsciiIdentifierName(value: string): boolean {
    return /^[A-Za-z_$][0-9A-Za-z_$]*$/u.test(value);
}

/**
 * @brief Execute unsafe string literal expression.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function unsafeStringLiteralExpression(value: string): string {
    return JSON.stringify(value)
        .replace(/\u2028/gu, "\\u2028")
        .replace(/\u2029/gu, "\\u2029");
}
