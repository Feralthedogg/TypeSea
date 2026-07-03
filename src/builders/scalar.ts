/**
 * @file scalar.ts
 * @brief Primitive and literal guard builders.
 */

import { SchemaTag } from "../kind/index.js";
import {
  BaseGuard,
  NumberGuard,
  StringGuard
} from "../guard/index.js";
import type { LiteralValue } from "../schema/index.js";
import { isLiteralValue } from "../schema/index.js";

/**
 * @brief string guard constant contract.
 * @details Module-scope storage with stable identity, created once and reused by callers.
 * @invariant Initialization happens during module load and later code treats the binding as fixed.
 */
export const stringGuard = new StringGuard({
  tag: SchemaTag.String,
  checks: []
});

/**
 * @brief unknown guard constant contract.
 * @details Module-scope storage with stable identity, created once and reused by callers.
 * @invariant Initialization happens during module load and later code treats the binding as fixed.
 */
export const unknownGuard = new BaseGuard<unknown>({
  tag: SchemaTag.Unknown
});

/**
 * @brief never guard constant contract.
 * @details Module-scope storage with stable identity, created once and reused by callers.
 * @invariant Initialization happens during module load and later code treats the binding as fixed.
 */
export const neverGuard = new BaseGuard<never>({
  tag: SchemaTag.Never
});

/**
 * @brief number guard constant contract.
 * @details Module-scope storage with stable identity, created once and reused by callers.
 * @invariant Initialization happens during module load and later code treats the binding as fixed.
 */
export const numberGuard = new NumberGuard({
  tag: SchemaTag.Number,
  checks: []
});

/**
 * @brief bigint guard constant contract.
 * @details Module-scope storage with stable identity, created once and reused by callers.
 * @invariant Initialization happens during module load and later code treats the binding as fixed.
 */
export const bigintGuard = new BaseGuard<bigint>({
  tag: SchemaTag.BigInt
});

/**
 * @brief symbol guard constant contract.
 * @details Module-scope storage with stable identity, created once and reused by callers.
 * @invariant Initialization happens during module load and later code treats the binding as fixed.
 */
export const symbolGuard = new BaseGuard<symbol>({
  tag: SchemaTag.Symbol
});

/**
 * @brief boolean guard constant contract.
 * @details Module-scope storage with stable identity, created once and reused by callers.
 * @invariant Initialization happens during module load and later code treats the binding as fixed.
 */
export const booleanGuard = new BaseGuard<boolean>({
  tag: SchemaTag.Boolean
});

/**
 * @brief literal function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for literal; ownership of newly created aggregates is transferred to the caller.
 */
export function literal<const TValue extends LiteralValue>(
  value: TValue
): BaseGuard<TValue> {
  if (!isLiteralValue(value)) {
    throw new TypeError("literal value must be a primitive literal");
  }
  return new BaseGuard<TValue>({
    tag: SchemaTag.Literal,
    value
  });
}
