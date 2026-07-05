/**
 * @file index.ts
 * @brief Public object builder aggregation.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */

export {
    ObjectGuard,
    catchall,
    deepPartial,
    extend,
    merge,
    object,
    omit,
    partial,
    passthrough,
    pick,
    required,
    safeExtend,
    strict,
    strictObject,
    strip
} from "./guard.js";
export type {
    DeepPartialObjectShape,
    DeepPartialValue,
    InferObject,
    MaskSelectedKeys,
    MergeObjectShapes,
    ObjectKeyMask,
    ObjectGuardMode,
    ObjectShape,
    OmitObjectShape,
    OmitObjectShapeByMask,
    PartialObjectShape,
    PickObjectShape,
    PickObjectShapeByMask,
    RequiredObjectShape
} from "./types.js";
