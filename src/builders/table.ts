/**
 * @file table.ts
 * @brief Frozen public builder table.
 */

import { asyncDecoder, asyncPipe, asyncRefine, asyncTransform } from "../async/index.js";
import { coerce, decoder, pipe, transform } from "../decoder/index.js";
import {
  array,
  discriminatedUnion,
  intersect,
  record,
  tuple,
  union
} from "./composite.js";
import {
  lazy,
  nullable,
  optional,
  refine,
  undefinedable
} from "./modifier.js";
import {
  extend,
  object,
  omit,
  partial,
  pick,
  strictObject
} from "./object/index.js";
import {
  bigintGuard,
  booleanGuard,
  literal,
  neverGuard,
  numberGuard,
  stringGuard,
  symbolGuard,
  unknownGuard
} from "./scalar.js";

/**
 * @brief t constant contract.
 * @details Module-scope storage with stable identity, created once and reused by callers.
 * @invariant Initialization happens during module load and later code treats the binding as fixed.
 */
export const t = Object.freeze({
  unknown: unknownGuard,
  never: neverGuard,
  string: stringGuard,
  number: numberGuard,
  bigint: bigintGuard,
  symbol: symbolGuard,
  boolean: booleanGuard,
  literal,
  array,
  tuple,
  record,
  decoder,
  object,
  strictObject,
  extend,
  pick,
  omit,
  partial,
  union,
  intersect,
  discriminatedUnion,
  optional,
  undefinedable,
  nullable,
  lazy,
  refine,
  transform,
  pipe,
  coerce,
  asyncDecoder,
  asyncRefine,
  asyncTransform,
  asyncPipe
} as const);
