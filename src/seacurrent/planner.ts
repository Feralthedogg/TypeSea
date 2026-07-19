/**
 * @file planner.ts
 * @brief Adapter-independent SeaCurrent orchestration.
 */

import { makeSeaCurrentChecksumPlan, planSeaCurrentCover } from "./cdc.js";
import {
    makeSeaCurrentCacheKey,
    SeaCurrentIncrementalCache,
    type SeaCurrentCachedRegionAnalysis
} from "./cache.js";
import { planExactEdgeProfile } from "./exact-profile.js";
import { planBallLarusPaths } from "./path-profile.js";
import { buildSeaCurrentSchedule } from "./schedule.js";
import type {
    SeaCurrentBenefitFeatures,
    SeaCurrentGraphAdapter,
    SeaCurrentPlannerBudget,
    SeaCurrentPlannerOptions,
    SeaCurrentPriorityFeatures,
    SeaCurrentProgramPlan,
    SeaCurrentRegionPlan,
    SeaCurrentRegionProfile,
    SeaCurrentTargetModel,
    SeaCurrentTransformationContext,
    SeaCurrentTransformationRegion,
    SeaCurrentTransformPlan
} from "./types.js";
import { validateSeaCurrentCFG, validateSeaCurrentDependences } from "./validate.js";

const DEFAULT_BUDGET: SeaCurrentPlannerBudget = Object.freeze({
    maxCounterCost: 50_000,
    maxPathRegions: 32,
    maxPathBuckets: 4_096,
    maxCdcSearchSteps: 100_000,
    maxCdcCycles: 256,
    maxScheduleII: 128
});

/** @brief Construction options for a reusable planner instance. */
export interface SeaCurrentPlannerConstructionOptions {
    readonly cache?: SeaCurrentIncrementalCache | undefined;
    readonly maxCacheEntries?: number | undefined;
}

interface RegionWork<Region> {
    readonly region: Region;
    readonly id: string;
    readonly hash: string;
    readonly cacheStatus: "hit" | "miss";
    readonly analysis: SeaCurrentCachedRegionAnalysis;
    readonly profile: SeaCurrentRegionProfile;
    readonly features: SeaCurrentPriorityFeatures;
    readonly priority: number;
    readonly pathCost: number;
}

/**
 * @brief Universal CDC-guided adaptive profiling and scheduling planner.
 * @details Instances retain only bounded structural analysis state. Program IR,
 * emitted counters, and transformed payloads remain owned by adapters.
 */
export class SeaCurrentPlanner {
    readonly #cache: SeaCurrentIncrementalCache;

    public constructor(options: SeaCurrentPlannerConstructionOptions = {}) {
        this.#cache = options.cache ?? new SeaCurrentIncrementalCache(options.maxCacheEntries);
    }

    /**
     * @brief Plan one program without mutating adapter-owned regions.
     * @details Unchanged structural hashes reuse exact-profile and CDC analysis;
     * profiles and learned target weights are rescored on every invocation.
     */
    public plan<Program, Region>(
        program: Program,
        adapter: SeaCurrentGraphAdapter<Program, Region>,
        options: SeaCurrentPlannerOptions<Region>
    ): SeaCurrentProgramPlan {
        const budget = normalizeBudget(options.budget);
        const evictionsBefore = this.#cache.evictions;
        const rebuilt: string[] = [];
        let hits = 0;
        let misses = 0;
        const work: RegionWork<Region>[] = [];
        for (const region of adapter.enumerateRegions(program)) {
            const id = adapter.regionId(region);
            const hash = adapter.structuralHash(region);
            const analysisKey = `${String(budget.maxCdcSearchSteps)}:${String(budget.maxCdcCycles)}`;
            const key = makeSeaCurrentCacheKey(
                adapter.key,
                options.target.key,
                id,
                hash,
                analysisKey
            );
            let analysis = this.#cache.get(key);
            let cacheStatus: "hit" | "miss" = "hit";
            if (analysis === undefined) {
                analysis = analyzeRegion(region, adapter, options, budget);
                this.#cache.set(key, analysis);
                cacheStatus = "miss";
                misses += 1;
                rebuilt.push(id);
            } else {
                hits += 1;
            }
            const profile = options.profiles?.[id] ?? DEFAULT_PROFILE;
            const features = priorityFeatures(analysis, profile, options.target);
            const priority = finiteScore(options.costModel.priority(features));
            work.push({
                region,
                id,
                hash,
                cacheStatus,
                analysis,
                profile,
                features,
                priority,
                pathCost: analysis.valid
                    ? analysis.cfg.edges.reduce((sum, edge) => sum + edge.counterCost, 0)
                    : 0
            });
        }
        const selectedPaths = selectPathRegions(work, budget);
        const transformationRegions = Object.freeze(work.map((item):
        SeaCurrentTransformationRegion<Region> => Object.freeze({
            region: item.region,
            id: item.id,
            profile: item.profile
        })));
        const plans = work.map((item): SeaCurrentRegionPlan => {
            const pathProfile = item.analysis.valid
                ? planBallLarusPaths(
                    item.analysis.cfg,
                    item.priority,
                    budget.maxPathBuckets,
                    selectedPaths.has(item.id)
                )
                : invalidPathPlan(item.priority, item.analysis.invalidReason ?? "invalid region");
            const transform = selectTransform(
                item,
                adapter,
                options,
                budget,
                transformationRegions
            );
            return Object.freeze({
                region: item.id,
                structuralHash: item.hash,
                cache: item.cacheStatus,
                exactProfile: item.analysis.exactProfile,
                cover: item.analysis.cover,
                checksums: options.enableChecksums === true && item.profile.uncertainty > 0
                    ? makeSeaCurrentChecksumPlan(item.analysis.cover)
                    : undefined,
                pathProfile,
                transform
            });
        });
        return Object.freeze({
            target: options.target.key,
            regions: Object.freeze(plans),
            cache: Object.freeze({
                hits,
                misses,
                evictions: this.#cache.evictions - evictionsBefore,
                rebuiltRegions: Object.freeze(rebuilt)
            })
        });
    }

    /** @brief Expose the bounded cache for explicit invalidation and metrics. */
    public get cache(): SeaCurrentIncrementalCache {
        return this.#cache;
    }
}

const DEFAULT_PROFILE: SeaCurrentRegionProfile = Object.freeze({
    frequency: 1,
    uncertainty: 1
});

/** @brief Build structural work that can be reused across profile generations. */
function analyzeRegion<Program, Region>(
    region: Region,
    adapter: SeaCurrentGraphAdapter<Program, Region>,
    options: SeaCurrentPlannerOptions<Region>,
    budget: SeaCurrentPlannerBudget
): SeaCurrentCachedRegionAnalysis {
    const cfg = adapter.buildCFG(region);
    const dependences = adapter.buildDependenceGraph(region);
    const cfgValidation = validateSeaCurrentCFG(cfg);
    const dependenceValidation = validateDependenceAdmission(dependences);
    const reason = !cfgValidation.ok
        ? cfgValidation.reason
        : !dependenceValidation.ok
            ? dependenceValidation.reason
            : undefined;
    if (reason !== undefined) {
        return Object.freeze({
            valid: false,
            invalidReason: reason,
            cfg,
            dependences,
            exactProfile: Object.freeze({
                status: "unavailable" as const,
                reason,
                treeEdges: Object.freeze([]),
                counters: Object.freeze([]),
                cycleRank: 0,
                rank: 0
            }),
            cover: Object.freeze({
                status: "unavailable" as const,
                reason,
                cycles: Object.freeze([]),
                coveredEdges: Object.freeze([])
            })
        });
    }
    return Object.freeze({
        valid: true,
        cfg,
        dependences,
        exactProfile: planExactEdgeProfile(
            cfg,
            (edge) => edge.instrumentable ? adapter.legalCounterSites(region, edge) : [],
            (edge) => edge.counterCost + options.target.branchCost(edge)
        ),
        cover: planSeaCurrentCover(cfg, budget.maxCdcSearchSteps, budget.maxCdcCycles)
    });
}

/** @brief Compute the adaptive region-selection feature vector. */
function priorityFeatures(
    analysis: SeaCurrentCachedRegionAnalysis,
    profile: SeaCurrentRegionProfile,
    target: SeaCurrentTargetModel
): SeaCurrentPriorityFeatures {
    if (!analysis.valid) {
        return Object.freeze({
            frequency: 0,
            pipelinePotential: 0,
            profileUncertainty: 0,
            instrumentationCost: 0,
            codeSizeCost: 0
        });
    }
    const dependences = analysis.dependences.dependences;
    let movable = 0;
    let loopCarried = 0;
    for (const dependence of dependences) {
        movable += dependence.reorderable ? dependence.confidence : 0;
        loopCarried += dependence.distance > 0 ? 1 : 0;
    }
    const operationCount = Math.max(1, analysis.dependences.operations.length);
    let targetLatency = 0;
    for (const operation of analysis.dependences.operations) {
        targetLatency += nonNegative(target.operationLatency(operation));
    }
    const latencyScale = targetLatency / operationCount;
    const pipelinePotential = target.supportsScheduling
        ? 1 + movable / operationCount + loopCarried / operationCount + latencyScale / 8
        : 1 + movable / (operationCount * 4);
    const instrumentationCost = analysis.exactProfile.counters.reduce(
        (sum, counter) => sum + counter.site.cost,
        0
    );
    return Object.freeze({
        frequency: nonNegative(profile.frequency),
        pipelinePotential,
        profileUncertainty: boundedUnit(profile.uncertainty),
        instrumentationCost,
        codeSizeCost: analysis.cfg.nodes.length + analysis.cfg.edges.length
    });
}

/** @brief Select globally valuable regions without exceeding path budgets. */
function selectPathRegions<Region>(
    work: readonly RegionWork<Region>[],
    budget: SeaCurrentPlannerBudget
): ReadonlySet<string> {
    const ordered = work.slice().sort((left, right) =>
        right.priority - left.priority || left.id.localeCompare(right.id));
    const selected = new Set<string>();
    let cost = 0;
    for (const item of ordered) {
        if (selected.size >= budget.maxPathRegions || item.priority <= 0) {
            break;
        }
        if (item.analysis.exactProfile.status !== "exact" ||
            cost + item.pathCost > budget.maxCounterCost) {
            continue;
        }
        selected.add(item.id);
        cost += item.pathCost;
    }
    return selected;
}

/** @brief Score adapter candidates and retain only positive verified plans. */
function selectTransform<Program, Region>(
    item: RegionWork<Region>,
    adapter: SeaCurrentGraphAdapter<Program, Region>,
    options: SeaCurrentPlannerOptions<Region>,
    budget: SeaCurrentPlannerBudget,
    regions: readonly SeaCurrentTransformationRegion<Region>[]
): SeaCurrentTransformPlan | undefined {
    const transformations = options.transformations;
    if (transformations === undefined || !item.analysis.valid) {
        return undefined;
    }
    const current = regions.find((entry) => entry.region === item.region);
    if (current === undefined) {
        return undefined;
    }
    const context: SeaCurrentTransformationContext<Region> = Object.freeze({
        current,
        regions
    });
    let selected: SeaCurrentTransformPlan | undefined;
    for (const candidate of transformations.supportedTransforms(item.region, context)) {
        const features: SeaCurrentBenefitFeatures = {
            frequency: nonNegative(item.profile.frequency),
            costBefore: candidate.costBefore,
            costAfter: candidate.costAfter,
            sizeIncrease: nonNegative(options.target.codeSizeCost(candidate)),
            semanticRisk: candidate.semanticRisk
        };
        const benefit = finiteScore(options.costModel.benefit(features));
        if (benefit <= 0 || (selected !== undefined && benefit <= selected.benefit)) {
            continue;
        }
        const dependences = adapter.buildDependenceGraph(item.region, candidate.pathPredicate);
        const schedule = candidate.kind === "pipeline"
            ? buildSeaCurrentSchedule(dependences, options.target, budget.maxScheduleII)
            : undefined;
        if (candidate.kind === "pipeline" && options.target.supportsScheduling && schedule === undefined) {
            continue;
        }
        if (!transformations.verify(
            item.region,
            candidate,
            dependences,
            schedule,
            context
        )) {
            continue;
        }
        selected = Object.freeze({ candidate, benefit, schedule });
    }
    return selected;
}

/** @brief Keep hostile dependence admission at one context-sensitive callsite. */
function validateDependenceAdmission(
    graph: SeaCurrentCachedRegionAnalysis["dependences"]
): ReturnType<typeof validateSeaCurrentDependences> {
    return validateSeaCurrentDependences(graph);
}

/** @brief Return path fallback without reading rejected adapter CFG fields. */
function invalidPathPlan(priority: number, reason: string): SeaCurrentRegionPlan["pathProfile"] {
    return Object.freeze({
        selected: false,
        priority,
        pathCount: 0,
        increments: Object.freeze([]),
        storage: Object.freeze({
            kind: "edge-fallback" as const,
            reason
        })
    });
}

/** @brief Normalize partial budgets while preserving finite non-negative limits. */
function normalizeBudget(source: Partial<SeaCurrentPlannerBudget> | undefined): SeaCurrentPlannerBudget {
    return Object.freeze({
        maxCounterCost: finiteLimit(source?.maxCounterCost, DEFAULT_BUDGET.maxCounterCost),
        maxPathRegions: integerLimit(source?.maxPathRegions, DEFAULT_BUDGET.maxPathRegions),
        maxPathBuckets: integerLimit(source?.maxPathBuckets, DEFAULT_BUDGET.maxPathBuckets),
        maxCdcSearchSteps: integerLimit(source?.maxCdcSearchSteps, DEFAULT_BUDGET.maxCdcSearchSteps),
        maxCdcCycles: integerLimit(source?.maxCdcCycles, DEFAULT_BUDGET.maxCdcCycles),
        maxScheduleII: integerLimit(source?.maxScheduleII, DEFAULT_BUDGET.maxScheduleII)
    });
}

/** @brief Normalize an integer work budget to at least one. */
function integerLimit(value: number | undefined, fallback: number): number {
    return Math.max(1, Math.floor(finiteLimit(value, fallback)));
}

/** @brief Normalize one finite non-negative planner limit. */
function finiteLimit(value: number | undefined, fallback: number): number {
    return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** @brief Prevent learned-model NaN from entering ordering decisions. */
function finiteScore(value: number): number {
    return Number.isFinite(value) ? value : 0;
}

/** @brief Normalize profile counts to a finite non-negative value. */
function nonNegative(value: number): number {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** @brief Normalize uncertainty to a probability. */
function boundedUnit(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}
