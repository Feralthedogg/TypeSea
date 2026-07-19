/**
 * @file index.ts
 * @brief Public SeaCurrent planning subpath.
 * @details Kept outside the root entry so ordinary validation and compilation
 * pay no module initialization or bundle cost for profile planning.
 */

export {
    SeaCurrentAutoTuner,
    type SeaCurrentAutoTunerOptions,
    type SeaCurrentAutoTunerSnapshot,
    type SeaCurrentTargetTuningState,
    type SeaCurrentTuningObservation
} from "./auto-tuner.js";
export {
    createSeaCurrent,
    type SeaCurrentBuilder,
    type SeaCurrentBuilderOptions,
    type SeaCurrentGuardSource,
    type SeaCurrentObservation,
    type SeaCurrentSource
} from "./builder.js";
export {
    makeSeaCurrentCacheKey,
    SeaCurrentIncrementalCache,
    type SeaCurrentCachedRegionAnalysis
} from "./cache.js";
export {
    SeaCurrentPlanner,
    type SeaCurrentPlannerConstructionOptions
} from "./planner.js";
export {
    createTypeSeaCurrentAdapter,
    createTypeSeaV8TargetModel,
    TypeSeaCurrentAdapter,
    type TypeSeaCurrentAdapterOptions,
    type TypeSeaCurrentControlBranch,
    type TypeSeaCurrentControlProgram,
    type TypeSeaCurrentRegion
} from "./typesea-adapter.js";
export {
    createTypeSeaCurrentTransformationAdapter,
    isTypeSeaCurrentTransformationAdapter,
    type TypeSeaCurrentAppliedTransform,
    type TypeSeaCurrentLoweringResult,
    type TypeSeaCurrentTransformationAdapter,
    type TypeSeaCurrentTransformationOptions
} from "./typesea-transform.js";
export type {
    SeaCurrentBenefitFeatures,
    SeaCurrentCacheStats,
    SeaCurrentChecksumPlan,
    SeaCurrentChecksumTerm,
    SeaCurrentControlEdge,
    SeaCurrentControlEdgeId,
    SeaCurrentControlFlowGraph,
    SeaCurrentControlNode,
    SeaCurrentControlNodeId,
    SeaCurrentCostModel,
    SeaCurrentCounterSite,
    SeaCurrentCoverPlan,
    SeaCurrentCycle,
    SeaCurrentDependence,
    SeaCurrentDependenceGraph,
    SeaCurrentDependenceKind,
    SeaCurrentEdgeCounter,
    SeaCurrentEdgeEffect,
    SeaCurrentExactProfilePlan,
    SeaCurrentGraphAdapter,
    SeaCurrentOperation,
    SeaCurrentOperationId,
    SeaCurrentPathIncrement,
    SeaCurrentPathPlan,
    SeaCurrentPathStorage,
    SeaCurrentPlannerBudget,
    SeaCurrentPlannerOptions,
    SeaCurrentPriorityFeatures,
    SeaCurrentProgramPlan,
    SeaCurrentRegionId,
    SeaCurrentRegionPlan,
    SeaCurrentRegionProfile,
    SeaCurrentResourceUse,
    SeaCurrentSchedule,
    SeaCurrentSourceProvenance,
    SeaCurrentTargetModel,
    SeaCurrentTransformationAdapter,
    SeaCurrentTransformationContext,
    SeaCurrentTransformationRegion,
    SeaCurrentTransformCandidate,
    SeaCurrentTransformPlan
} from "./types.js";
