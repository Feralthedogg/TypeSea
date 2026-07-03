/**
 * @file index.ts
 * @brief Public object builder aggregation.
 */

export {
  ObjectGuard,
  extend,
  object,
  omit,
  partial,
  pick,
  strictObject
} from "./guard.js";
export type {
  InferObject,
  MergeObjectShapes,
  ObjectGuardMode,
  ObjectShape,
  OmitObjectShape,
  PartialObjectShape,
  PickObjectShape
} from "./types.js";
