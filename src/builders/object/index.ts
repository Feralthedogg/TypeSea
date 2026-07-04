/**
 * @file index.ts
 * @brief Public object builder aggregation.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
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
