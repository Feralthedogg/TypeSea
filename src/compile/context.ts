/**
 * @file compile/context.ts
 * @brief Generated-source emitter side-table context.
 */

import type { LiteralValue, Schema } from "../schema/index.js";
import type { EmitContext } from "./types.js";

/**
 * @brief create emit context function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @returns Result for create emit context; ownership of newly created aggregates is transferred to the caller.
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
 * @brief push literal function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param context Borrowed input slot named context; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for push literal; ownership of newly created aggregates is transferred to the caller.
 */
export function pushLiteral(context: EmitContext, value: LiteralValue): number {
  const index = context.literals.length;
  context.literals.push(value);
  return index;
}

/**
 * @brief push regex function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param context Borrowed input slot named context; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for push regex; ownership of newly created aggregates is transferred to the caller.
 */
export function pushRegex(context: EmitContext, value: RegExp): number {
  const index = context.regexps.length;
  context.regexps.push(new RegExp(value.source, value.flags));
  return index;
}

/**
 * @brief push keyset function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param context Borrowed input slot named context; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for push keyset; ownership of newly created aggregates is transferred to the caller.
 */
export function pushKeyset(context: EmitContext, value: readonly string[]): number {
  const index = context.keysets.length;
  context.keysets.push(value);
  return index;
}

/**
 * @brief string ref function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param context Borrowed input slot named context; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for string ref; ownership of newly created aggregates is transferred to the caller.
 */
export function stringRef(context: EmitContext, value: string): string {
  return `u[${String(pushString(context, value))}]`;
}

/**
 * @brief push string function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param context Borrowed input slot named context; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for push string; ownership of newly created aggregates is transferred to the caller.
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
 * @brief push schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param context Borrowed input slot named context; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for push schema; ownership of newly created aggregates is transferred to the caller.
 */
export function pushSchema(context: EmitContext, value: Schema): number {
  const index = context.schemas.length;
  context.schemas.push(value);
  return index;
}
