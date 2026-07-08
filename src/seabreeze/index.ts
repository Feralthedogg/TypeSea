/**
 * @file index.ts
 * @brief Public SeaBreeze inference and lowering entry point.
 * @details This subpath is intentionally separate from the root export so
 * applications that only use validators pay no import cost for arena inference.
 */

export {
    createSeaBreeze,
    type SeaBreezeBuilder,
    type SeaBreezeBuilderCompileOptions,
    type SeaBreezeBuilderEmitOptions,
    type SeaBreezeBuilderGraphOptions,
    type SeaBreezeBuilderOptions,
    type SeaBreezeBuilderSchemaOptions,
    type SeaBreezeBuilderSnapshot,
    type SeaBreezeCompiledPredicate,
    type SeaBreezeOptionalField,
    type SeaBreezeShape,
    type SeaBreezeShapeValue
} from "./builder.js";
export {
    SeaBreezeArena,
    SeaBreezeKind,
    SeaBreezePresence,
    type SeaBreezeNodeId,
    type SeaBreezeOptions,
    type SeaBreezeSnapshot
} from "./sea-breeze.js";
export {
    lowerSeaBreezeToSchema,
    type SeaBreezeCyclePolicy,
    type SeaBreezeSchemaLoweringOptions,
    type SeaBreezeSchemaObjectMode,
    type SeaBreezeUnboundVarPolicy,
    type SeaBreezeUnionMode
} from "./lower-schema.js";
export {
    lowerSeaBreezeToGraph,
    type SeaBreezeGraphLoweringOptions
} from "./lower-graph.js";
export {
    emitSeaBreezeBooleanSourceBundle,
    type SeaBreezeEmitOptions
} from "./emit.js";
export {
    loadSeaBreezeSnapshot,
    serializeSeaBreezeArena
} from "./serialize.js";
export {
    seaBreezeReader,
    type SeaBreezeReader
} from "./reader.js";
