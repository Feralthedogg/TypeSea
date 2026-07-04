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
    record,
    tuple,
    union
} from "./composite.js";
export {
    lazy,
    nullable,
    optional,
    refine,
    undefinedable
} from "./modifier.js";
export {
    ObjectGuard,
    extend,
    object,
    omit,
    partial,
    pick,
    strictObject,
    type InferObject,
    type MergeObjectShapes,
    type ObjectGuardMode,
    type ObjectShape,
    type OmitObjectShape,
    type PartialObjectShape,
    type PickObjectShape
} from "./object/index.js";
export {
    bigintGuard,
    literal,
    neverGuard,
    symbolGuard,
    unknownGuard
} from "./scalar.js";
export { t } from "./table.js";
export type {
    InferTuple,
    TupleShape
} from "./types.js";
