/**
 * @file compile/types.ts
 * @brief Shared compile-time data contracts.
 */

import type { Guard, Presence } from "../guard/index.js";
import type { LiteralValue, Schema } from "../schema/index.js";

/**
 * @brief emit context.
 */
export interface EmitContext {
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
 * @brief function source.
 */
export interface FunctionSource {
  readonly name: string;
  body: string;
}

/**
 * @brief compiled source bundle.
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
 */
export interface CompiledGuard<
  TValue,
  TPresence extends Presence = "required"
> extends Guard<TValue, TPresence> {
  readonly source: string;
}

/**
 * @brief compile options.
 */
export interface CompileOptions {
  readonly name: string | undefined;
}
