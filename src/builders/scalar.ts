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
 * @brief string guard.
 */
export const stringGuard = new StringGuard({
  tag: SchemaTag.String,
  checks: []
});

/**
 * @brief unknown guard.
 */
export const unknownGuard = new BaseGuard<unknown>({
  tag: SchemaTag.Unknown
});

/**
 * @brief never guard.
 */
export const neverGuard = new BaseGuard<never>({
  tag: SchemaTag.Never
});

/**
 * @brief number guard.
 */
export const numberGuard = new NumberGuard({
  tag: SchemaTag.Number,
  checks: []
});

/**
 * @brief bigint guard.
 */
export const bigintGuard = new BaseGuard<bigint>({
  tag: SchemaTag.BigInt
});

/**
 * @brief symbol guard.
 */
export const symbolGuard = new BaseGuard<symbol>({
  tag: SchemaTag.Symbol
});

/**
 * @brief boolean guard.
 */
export const booleanGuard = new BaseGuard<boolean>({
  tag: SchemaTag.Boolean
});

/**
 * @brief literal.
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
