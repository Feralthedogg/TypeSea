/**
 * @file compile/context.ts
 * @brief Generated-source emitter side-table context.
 */

import type { LiteralValue, Schema } from "../schema/index.js";
import type { EmitContext } from "./types.js";

/**
 * @brief create emit context.
 */
export function createEmitContext(): EmitContext {
  return {
    literals: [],
    regexps: [],
    keysets: [],
    strings: [],
    schemas: [],
    functions: [],
    functionNames: new Map<Schema, string>(),
    checkFunctions: [],
    checkFunctionNames: new Map<Schema, string>(),
    stringIndexes: new Map<string, number>()
  };
}

/**
 * @brief push literal.
 */
export function pushLiteral(context: EmitContext, value: LiteralValue): number {
  const index = context.literals.length;
  context.literals.push(value);
  return index;
}

/**
 * @brief push regex.
 */
export function pushRegex(context: EmitContext, value: RegExp): number {
  const index = context.regexps.length;
  context.regexps.push(new RegExp(value.source, value.flags));
  return index;
}

/**
 * @brief push keyset.
 */
export function pushKeyset(context: EmitContext, value: readonly string[]): number {
  const index = context.keysets.length;
  context.keysets.push(value);
  return index;
}

/**
 * @brief string ref.
 */
export function stringRef(context: EmitContext, value: string): string {
  return `u[${String(pushString(context, value))}]`;
}

/**
 * @brief push string.
 */
export function pushString(context: EmitContext, value: string): number {
  const cached = context.stringIndexes.get(value);
  if (cached !== undefined) {
    return cached;
  }
  const index = context.strings.length;
  context.strings.push(value);
  context.stringIndexes.set(value, index);
  return index;
}

/**
 * @brief push schema.
 */
export function pushSchema(context: EmitContext, value: Schema): number {
  const index = context.schemas.length;
  context.schemas.push(value);
  return index;
}
