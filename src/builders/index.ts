/**
 * @file index.ts
 * @brief Public builder module aggregation.
 * @details This barrel keeps public import paths stable while implementation files remain
 * split by responsibility.
 */

export {
    array,
    discriminatedUnion,
    intersect,
    map,
    record,
    set,
    tuple,
    union
} from "./composite.js";
export {
    lazy,
    nullable,
    nullish,
    optional,
    refine,
    superRefine,
    undefinedable
} from "./modifier.js";
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
    strip,
    type DeepPartialObjectShape,
    type DeepPartialValue,
    type InferObject,
    type MaskSelectedKeys,
    type MergeObjectShapes,
    type ObjectKeyMask,
    type ObjectGuardMode,
    type ObjectShape,
    type OmitObjectShape,
    type OmitObjectShapeByMask,
    type PartialObjectShape,
    type PickObjectShape,
    type PickObjectShapeByMask,
    type RequiredObjectShape
} from "./object/index.js";
export {
    bigintGuard,
    booleanGuard,
    dateGuard,
    enumValues,
    enumValues as enum,
    literal,
    neverGuard,
    nullGuard,
    numberGuard,
    symbolGuard,
    stringGuard,
    unknownGuard,
    undefinedGuard,
    voidGuard,
    type EnumValues
} from "./scalar.js";
export {
    instanceOf,
    json,
    property,
    type InstanceConstructor,
    type JsonValue
} from "./runtime.js";
export { t } from "./table.js";
export type {
    InferTuple,
    InferTupleWithRest,
    TupleShape
} from "./types.js";
