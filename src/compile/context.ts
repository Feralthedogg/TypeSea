/**
 * @file compile/context.ts
 * @brief Generated-source emitter side-table context.
 */

import type { LiteralValue, Schema } from "../schema/index.js";
import type {
    CompileMode,
    EmitContext,
    GraphInstrumentation,
    ObjectEntryOrder
} from "./types.js";

/**
 * @brief Create one mutable source-emission context.
 * @param mode Compile mode that controls safety and allocation tradeoffs.
 * @returns Fresh side-table context consumed by predicate and diagnostic emitters.
 * @invariant Side tables are append-only during one bundle emission.
 */
export function createEmitContext(
    mode: CompileMode,
    instrumentation?: GraphInstrumentation,
    objectEntryOrder: ObjectEntryOrder = "static"
): EmitContext {
    return {
        mode,
        instrumentation,
        objectEntryOrder,
        literals: [],
        regexps: [],
        keysets: [],
        strings: [],
        schemas: [],
        functions: [],
        functionNames: new Map<Schema, string>(),
        checkFunctions: [],
        checkFunctionNames: new Map<Schema, string>(),
        firstFunctions: [],
        firstFunctionNames: new Map<Schema, string>(),
        stringIndexes: new Map<string, number>()
    };
}

/**
 * @brief Append a literal to the generated factory side table.
 * @param context Mutable emission context.
 * @param value Literal value referenced by generated source.
 * @returns Index used by generated code to read `l[index]`.
 */
export function pushLiteral(context: EmitContext, value: LiteralValue): number {
    const index = context.literals.length;
    context.literals.push(value);
    return index;
}

/**
 * @brief Append a regular expression to the generated factory side table.
 * @param context Mutable emission context.
 * @param value Source RegExp from the schema.
 * @returns Index used by generated code to read `r[index]`.
 * @post The stored RegExp is cloned so generated validation does not mutate user state.
 */
export function pushRegex(context: EmitContext, value: RegExp): number {
    const index = context.regexps.length;
    context.regexps.push(new RegExp(value.source, value.flags));
    return index;
}

/**
 * @brief Append a keyset to the generated factory side table.
 * @param context Mutable emission context.
 * @param value Frozen or caller-owned key list used by object checks.
 * @returns Index used by generated code to read `k[index]`.
 */
export function pushKeyset(context: EmitContext, value: readonly string[]): number {
    const index = context.keysets.length;
    context.keysets.push(value);
    return index;
}

/**
 * @brief Return a generated expression for a string side-table entry.
 * @param context Mutable emission context.
 * @param value String value to intern.
 * @returns Generated expression of the form `u[index]`.
 */
export function stringRef(context: EmitContext, value: string): string {
    return `u[${String(pushString(context, value))}]`;
}

/**
 * @brief Intern a string in the generated factory side table.
 * @param context Mutable emission context.
 * @param value String value referenced by generated source.
 * @returns Stable side-table index for the string.
 */
export function pushString(context: EmitContext, value: string): number {
    const cached = context.stringIndexes.get(value);
    if (cached !== undefined) {
        return cached;
    }
    /*
     * String interning keeps generated source small and lets repeated object
     * keys reuse the same frozen path segment cache.
     */
    const index = context.strings.length;
    context.strings.push(value);
    context.stringIndexes.set(value, index);
    return index;
}

/**
 * @brief Append a dynamic schema to the generated factory side table.
 * @param context Mutable emission context.
 * @param value Schema used by fallback or lazy generated paths.
 * @returns Index used by generated code to read `d[index]`.
 */
export function pushSchema(context: EmitContext, value: Schema): number {
    const index = context.schemas.length;
    context.schemas.push(value);
    return index;
}
