/**
 * @file index.ts
 * @brief Public object builder aggregation.
 */

export {
    ObjectGuard,
    atLeastOneKey,
    catchall,
    deepPartial,
    exactlyOneKey,
    extend,
    keyofObject,
    loose,
    looseObject,
    merge,
    nonpassthrough,
    nonstrict,
    object,
    oneOfKeys,
    omit,
    partial,
    passthrough,
    patternPropertiesObject,
    pick,
    propertyCountObject,
    propertyNamesObject,
    required,
    safeExtend,
    strict,
    strictObject,
    strip
} from "./guard.js";
export type {
    PatternPropertyGuardInput
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
    PartialObjectShapeByMask,
    PickObjectShape,
    PickObjectShapeByMask,
    RequiredObjectShape,
    RequiredObjectShapeByMask
} from "./types.js";
