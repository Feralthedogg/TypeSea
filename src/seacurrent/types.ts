/**
 * @file types.ts
 * @brief Universal CDC-guided adaptive profiling and scheduling contracts.
 * @details The planner owns no compiler IR. Adapters translate their regions
 * into these immutable graphs and consume plans only after target verification.
 */

/** @brief Stable identifier for a planner region. */
export type SeaCurrentRegionId = string;

/** @brief Stable identifier for a control-flow node. */
export type SeaCurrentControlNodeId = string;

/** @brief Stable identifier for a directed control-flow edge. */
export type SeaCurrentControlEdgeId = string;

/** @brief Stable identifier for an operation in a dependence graph. */
export type SeaCurrentOperationId = string;

/** @brief Source location retained across adapter and planner boundaries. */
export interface SeaCurrentSourceProvenance {
    readonly source: string;
    readonly line?: number | undefined;
    readonly column?: number | undefined;
}

/** @brief One node in a normalized region CFG. */
export interface SeaCurrentControlNode {
    readonly id: SeaCurrentControlNodeId;
    readonly provenance?: SeaCurrentSourceProvenance | undefined;
}

/** @brief Exceptional behavior carried by a control-flow edge. */
export type SeaCurrentEdgeEffect = "normal" | "exception" | "trap" | "suspend";

/**
 * @brief Directed edge retained by exact profiling and path numbering.
 * @details `probability` and `counterCost` are static estimates in [0, 1] and
 * [0, +infinity). Correctness never depends on either estimate.
 */
export interface SeaCurrentControlEdge {
    readonly id: SeaCurrentControlEdgeId;
    readonly source: SeaCurrentControlNodeId;
    readonly destination: SeaCurrentControlNodeId;
    readonly probability: number;
    readonly counterCost: number;
    readonly effect: SeaCurrentEdgeEffect;
    readonly predicate?: string | undefined;
    readonly instrumentable: boolean;
    readonly provenance?: SeaCurrentSourceProvenance | undefined;
}

/**
 * @brief Directed region CFG with explicit entry and exits.
 * @invariant Node and edge identifiers are unique within the region.
 */
export interface SeaCurrentControlFlowGraph {
    readonly nodes: readonly SeaCurrentControlNode[];
    readonly edges: readonly SeaCurrentControlEdge[];
    readonly entry: SeaCurrentControlNodeId;
    readonly exits: readonly SeaCurrentControlNodeId[];
}

/** @brief Dependence class preserved by scheduling verification. */
export type SeaCurrentDependenceKind =
    | "raw"
    | "war"
    | "waw"
    | "control"
    | "memory"
    | "effect";

/** @brief Target-independent operation consumed by scheduling models. */
export interface SeaCurrentOperation {
    readonly id: SeaCurrentOperationId;
    readonly opcode: string;
    readonly provenance?: SeaCurrentSourceProvenance | undefined;
}

/**
 * @brief Directed operation dependence.
 * @details A non-zero distance denotes a loop-carried dependence. Unknown
 * aliasing or effects must be represented as non-reorderable edges.
 */
export interface SeaCurrentDependence {
    readonly source: SeaCurrentOperationId;
    readonly destination: SeaCurrentOperationId;
    readonly kind: SeaCurrentDependenceKind;
    readonly latency: number;
    readonly distance: number;
    readonly confidence: number;
    readonly reorderable: boolean;
    readonly predicate?: string | undefined;
}

/** @brief Directed operation graph for one region or specialized path. */
export interface SeaCurrentDependenceGraph {
    readonly operations: readonly SeaCurrentOperation[];
    readonly dependences: readonly SeaCurrentDependence[];
}

/** @brief Logical counter insertion site supplied by an instrumentation adapter. */
export interface SeaCurrentCounterSite {
    readonly id: string;
    readonly edge: SeaCurrentControlEdgeId;
    readonly cost: number;
}

/**
 * @brief Compiler-specific translation boundary.
 * @details Structural hashes must change whenever CFG, dependence, provenance,
 * instrumentation legality, or transformation semantics change.
 */
export interface SeaCurrentGraphAdapter<Program, Region> {
    readonly key: string;
    enumerateRegions(program: Program): readonly Region[];
    regionId(region: Region): SeaCurrentRegionId;
    structuralHash(region: Region): string;
    buildCFG(region: Region): SeaCurrentControlFlowGraph;
    buildDependenceGraph(
        region: Region,
        pathPredicate?: string
    ): SeaCurrentDependenceGraph;
    legalCounterSites(
        region: Region,
        edge: SeaCurrentControlEdge
    ): readonly SeaCurrentCounterSite[];
}

/** @brief Target resource demand for one operation. */
export interface SeaCurrentResourceUse {
    readonly resource: string;
    readonly units: number;
}

/**
 * @brief Architecture-specific cost and resource model.
 * @details A source-to-source adapter may return latency 1, no resources, and
 * disable machine scheduling while still using profiling plans.
 */
export interface SeaCurrentTargetModel {
    readonly key: string;
    readonly supportsScheduling: boolean;
    operationLatency(operation: SeaCurrentOperation): number;
    resources(operation: SeaCurrentOperation): readonly SeaCurrentResourceUse[];
    resourceCapacity(resource: string): number;
    branchCost(edge: SeaCurrentControlEdge): number;
    codeSizeCost(candidate: SeaCurrentTransformCandidate): number;
    registerPressure(schedule: SeaCurrentSchedule): number;
    registerCapacity(): number;
}

/** @brief Runtime evidence from an earlier instrumented build. */
export interface SeaCurrentRegionProfile {
    readonly frequency: number;
    /** Number of complete region evaluations that returned true. */
    readonly accepted?: number | undefined;
    /** Number of complete region evaluations that returned false. */
    readonly rejected?: number | undefined;
    readonly uncertainty: number;
    readonly edgeCounts?: Readonly<Record<string, number>> | undefined;
    readonly pathCounts?: Readonly<Record<string, number>> | undefined;
}

/** @brief Features used to select expensive path profiling. */
export interface SeaCurrentPriorityFeatures {
    readonly frequency: number;
    readonly pipelinePotential: number;
    readonly profileUncertainty: number;
    readonly instrumentationCost: number;
    readonly codeSizeCost: number;
}

/** @brief Features used to rank one target transformation. */
export interface SeaCurrentBenefitFeatures {
    readonly frequency: number;
    readonly costBefore: number;
    readonly costAfter: number;
    readonly sizeIncrease: number;
    readonly semanticRisk: number;
}

/**
 * @brief Target-calibrated scoring boundary used by the planner.
 * @details Implementations may learn parameters, but returned scores must be
 * finite and deterministic for a fixed state.
 */
export interface SeaCurrentCostModel {
    readonly targetKey: string;
    priority(features: SeaCurrentPriorityFeatures): number;
    benefit(features: SeaCurrentBenefitFeatures): number;
}

/** @brief Planner work and instrumentation limits. */
export interface SeaCurrentPlannerBudget {
    readonly maxCounterCost: number;
    readonly maxPathRegions: number;
    readonly maxPathBuckets: number;
    readonly maxCdcSearchSteps: number;
    readonly maxCdcCycles: number;
    readonly maxScheduleII: number;
}

/** @brief Approximate storage selected after exact path counts become too large. */
export type SeaCurrentPathStorage =
    | {
        readonly kind: "exact";
        readonly buckets: number;
    }
    | {
        readonly kind: "sparse";
        readonly capacity: number;
    }
    | {
        readonly kind: "count-min";
        readonly width: number;
        readonly depth: number;
    }
    | {
        readonly kind: "edge-fallback";
        readonly reason: string;
    };

/** @brief Ball-Larus edge increment for one acyclic region. */
export interface SeaCurrentPathIncrement {
    readonly edge: SeaCurrentControlEdgeId;
    readonly increment: number;
}

/** @brief Optional path profiling decision for one region. */
export interface SeaCurrentPathPlan {
    readonly selected: boolean;
    readonly priority: number;
    readonly pathCount: number;
    readonly increments: readonly SeaCurrentPathIncrement[];
    readonly storage: SeaCurrentPathStorage;
}

/** @brief One exact edge counter selected outside the spanning tree. */
export interface SeaCurrentEdgeCounter {
    readonly edge: SeaCurrentControlEdgeId;
    readonly site: SeaCurrentCounterSite;
}

/** @brief Exact edge-profile plan or a fail-closed reason. */
export type SeaCurrentExactProfilePlan =
    | {
        readonly status: "exact";
        readonly treeEdges: readonly SeaCurrentControlEdgeId[];
        readonly counters: readonly SeaCurrentEdgeCounter[];
        readonly cycleRank: number;
        readonly rank: number;
    }
    | {
        readonly status: "unavailable";
        readonly reason: string;
        readonly treeEdges: readonly SeaCurrentControlEdgeId[];
        readonly counters: readonly SeaCurrentEdgeCounter[];
        readonly cycleRank: number;
        readonly rank: number;
    };

/** @brief One verified cycle in an at-most-eight-layer CDC certificate. */
export interface SeaCurrentCycle {
    readonly label: number;
    readonly edges: readonly SeaCurrentControlEdgeId[];
}

/** @brief Verified CDC certificate or an explicit fallback. */
export type SeaCurrentCoverPlan =
    | {
        readonly status: "verified";
        readonly cycles: readonly SeaCurrentCycle[];
        readonly coveredEdges: readonly SeaCurrentControlEdgeId[];
    }
    | {
        readonly status: "unavailable";
        readonly reason: string;
        readonly cycles: readonly SeaCurrentCycle[];
        readonly coveredEdges: readonly SeaCurrentControlEdgeId[];
    };

/** @brief Deterministic modular checksum assignment derived from a CDC cover. */
export interface SeaCurrentChecksumTerm {
    readonly edge: SeaCurrentControlEdgeId;
    readonly label: number;
    readonly coefficient: number;
}

/** @brief Optional CDC redundancy measurements for profile validation. */
export interface SeaCurrentChecksumPlan {
    readonly modulus: number;
    readonly terms: readonly SeaCurrentChecksumTerm[];
}

/** @brief Lower bounds and start times for a candidate modulo schedule. */
export interface SeaCurrentSchedule {
    readonly initiationInterval: number;
    readonly recurrenceMII: number;
    readonly resourceMII: number;
    readonly starts: Readonly<Record<string, number>>;
}

/** @brief One adapter-proposed transformation considered by the planner. */
export interface SeaCurrentTransformCandidate {
    readonly id: string;
    readonly kind: "version" | "if-convert" | "unroll" | "vectorize" | "pipeline" | "custom";
    readonly pathPredicate?: string | undefined;
    readonly costBefore: number;
    readonly costAfter: number;
    readonly sizeIncrease: number;
    readonly semanticRisk: number;
}

/** @brief Profile evidence paired with the adapter-owned region that produced it. */
export interface SeaCurrentTransformationRegion<Region> {
    readonly region: Region;
    readonly id: SeaCurrentRegionId;
    readonly profile: SeaCurrentRegionProfile;
}

/**
 * @brief Immutable runtime evidence visible while an adapter proposes transforms.
 * @details Region values remain adapter-owned. The complete region vector lets
 * composite adapters associate nested payloads by identity without encoding
 * compiler-specific identities into the universal planner.
 */
export interface SeaCurrentTransformationContext<Region> {
    readonly current: SeaCurrentTransformationRegion<Region>;
    readonly regions: readonly SeaCurrentTransformationRegion<Region>[];
}

/**
 * @brief Transformation boundary kept separate from payload mutation.
 * @details The planner returns only candidates that pass this adapter verifier;
 * applying or rolling back payload IR remains the compiler's responsibility.
 */
export interface SeaCurrentTransformationAdapter<Region> {
    supportedTransforms(
        region: Region,
        context: SeaCurrentTransformationContext<Region>
    ): readonly SeaCurrentTransformCandidate[];
    verify(
        region: Region,
        candidate: SeaCurrentTransformCandidate,
        dependenceGraph: SeaCurrentDependenceGraph,
        schedule: SeaCurrentSchedule | undefined,
        context: SeaCurrentTransformationContext<Region>
    ): boolean;
}

/** @brief Scored and verified transformation recommendation. */
export interface SeaCurrentTransformPlan {
    readonly candidate: SeaCurrentTransformCandidate;
    readonly benefit: number;
    readonly schedule?: SeaCurrentSchedule | undefined;
}

/** @brief One immutable region plan. */
export interface SeaCurrentRegionPlan {
    readonly region: SeaCurrentRegionId;
    readonly structuralHash: string;
    readonly cache: "hit" | "miss";
    readonly exactProfile: SeaCurrentExactProfilePlan;
    readonly cover: SeaCurrentCoverPlan;
    readonly checksums: SeaCurrentChecksumPlan | undefined;
    readonly pathProfile: SeaCurrentPathPlan;
    readonly transform: SeaCurrentTransformPlan | undefined;
}

/** @brief Incremental analysis reuse metrics for one planner invocation. */
export interface SeaCurrentCacheStats {
    readonly hits: number;
    readonly misses: number;
    readonly evictions: number;
    readonly rebuiltRegions: readonly SeaCurrentRegionId[];
}

/** @brief Complete adapter-independent planning result. */
export interface SeaCurrentProgramPlan {
    readonly target: string;
    readonly regions: readonly SeaCurrentRegionPlan[];
    readonly cache: SeaCurrentCacheStats;
}

/** @brief Options controlling one planning invocation. */
export interface SeaCurrentPlannerOptions<Region> {
    readonly target: SeaCurrentTargetModel;
    readonly costModel: SeaCurrentCostModel;
    readonly budget?: Partial<SeaCurrentPlannerBudget> | undefined;
    readonly profiles?: Readonly<Record<string, SeaCurrentRegionProfile>> | undefined;
    readonly transformations?: SeaCurrentTransformationAdapter<Region> | undefined;
    readonly enableChecksums?: boolean | undefined;
}
