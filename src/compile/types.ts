/**
 * @file compile/types.ts
 * @brief Shared compile-time data contracts.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 */

import type { Guard, Presence } from "../guard/index.js";
import type { LiteralValue, Schema } from "../schema/index.js";

/**
 * @brief emit context.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 */
export interface EmitContext {
    readonly mode: CompileMode;
    readonly literals: LiteralValue[];
    readonly regexps: RegExp[];
    readonly keysets: (readonly string[])[];
    readonly strings: string[];
    readonly schemas: Schema[];
    readonly functions: FunctionSource[];
    readonly functionNames: Map<Schema, string>;
    readonly checkFunctions: FunctionSource[];
    readonly checkFunctionNames: Map<Schema, string>;
    readonly stringIndexes: Map<string, number>;
}

/**
 * @brief compile mode.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 */
export type CompileMode = "safe" | "unsafe" | "unchecked";

/**
 * @brief function source.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 */
export interface FunctionSource {
    readonly name: string;
    body: string;
}

/**
 * @brief compiled source bundle.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 */
export interface CompiledSourceBundle {
    readonly source: string;
    readonly literals: readonly LiteralValue[];
    readonly regexps: readonly RegExp[];
    readonly keysets: readonly (readonly string[])[];
    readonly strings: readonly string[];
    readonly dynamicSchemas: readonly Schema[];
}

/**
 * @brief compiled guard.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 */
export interface CompiledGuard<
    TValue,
    TPresence extends Presence = "required"
> extends Guard<TValue, TPresence> {
    readonly source: string;
}

/**
 * @brief compile options.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 */
export interface CompileOptions {
    readonly name: string | undefined;
    readonly mode: CompileMode | undefined;
}
