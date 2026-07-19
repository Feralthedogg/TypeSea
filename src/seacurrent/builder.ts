/**
 * @file builder.ts
 * @brief Ergonomic TypeSea-specific facade over the SeaCurrent planner.
 * @details Construction normalizes adapter, target, tuner, and planner state
 * once. Planning without a profile forwards one stable options object, while
 * validation and generated predicates never retain or call this facade.
 */

import { readGuardSchema } from "../internal/index.js";
import type { Graph } from "../ir/index.js";
import { makeValidationPlan } from "../plan/index.js";
import {
    freezeSchema,
    isSchemaValue,
    type Schema
} from "../schema/index.js";
import {
    SeaCurrentAutoTuner,
    type SeaCurrentAutoTunerOptions,
    type SeaCurrentAutoTunerSnapshot,
    type SeaCurrentTargetTuningState
} from "./auto-tuner.js";
import { SeaCurrentPlanner } from "./planner.js";
import {
    createTypeSeaCurrentTransformationAdapter,
    type TypeSeaCurrentTransformationOptions
} from "./typesea-transform.js";
import type {
    SeaCurrentBenefitFeatures,
    SeaCurrentPlannerBudget,
    SeaCurrentPlannerOptions,
    SeaCurrentPriorityFeatures,
    SeaCurrentProgramPlan,
    SeaCurrentRegionProfile,
    SeaCurrentTargetModel,
    SeaCurrentTransformationAdapter
} from "./types.js";
import {
    createTypeSeaCurrentAdapter,
    createTypeSeaV8TargetModel,
    type TypeSeaCurrentAdapter,
    type TypeSeaCurrentAdapterOptions,
    type TypeSeaCurrentRegion
} from "./typesea-adapter.js";

/**
 * @brief Minimal guard-like input accepted by the SeaCurrent facade.
 * @details Admission reads the schema from an own data property, matching the
 * hostile-input boundary used by the rest of TypeSea's tooling.
 */
export interface SeaCurrentGuardSource {
    readonly schema: Schema;
}

/** @brief TypeSea schema or schema-backed guard accepted by plan methods. */
export type SeaCurrentSource = Schema | SeaCurrentGuardSource;

/**
 * @brief Target-local feedback accepted without a repeated target key.
 * @details The builder injects the target selected at construction time.
 */
export type SeaCurrentObservation =
    | {
        readonly kind: "priority";
        readonly features: SeaCurrentPriorityFeatures;
        readonly actualValue: number;
    }
    | {
        readonly kind: "benefit";
        readonly features: SeaCurrentBenefitFeatures;
        readonly actualValue: number;
    };

/** @brief One-time configuration for the TypeSea-specific SeaCurrent facade. */
export interface SeaCurrentBuilderOptions {
    /** @brief Custom target model. Omit it to use the conservative V8 model. */
    readonly target?: SeaCurrentTargetModel | undefined;

    /** @brief Key assigned to the default V8 target when `target` is omitted. */
    readonly targetKey?: string | undefined;

    /** @brief Static TypeSea graph-adapter assumptions. */
    readonly adapter?: TypeSeaCurrentAdapterOptions | undefined;

    /** @brief Initial auto-tuner parameters. */
    readonly tuning?: SeaCurrentAutoTunerOptions | undefined;

    /** @brief Maximum structural region analyses retained by the planner LRU. */
    readonly maxCacheEntries?: number | undefined;

    /** @brief Work limits reused by every plan call on this builder. */
    readonly budget?: Partial<SeaCurrentPlannerBudget> | undefined;

    /** @brief Emit verified CDC checksum plans when profiles are uncertain. */
    readonly checksums?: boolean | undefined;

    /** @brief Optional TypeSea-region transformation provider. */
    readonly transformations?:
        | SeaCurrentTransformationAdapter<TypeSeaCurrentRegion>
        | false
        | undefined;

    /** @brief Controls for the default profile-guided object-order adapter. */
    readonly transformation?: TypeSeaCurrentTransformationOptions | undefined;
}

/**
 * @brief Reusable SeaCurrent control-plane facade.
 * @details `plan()` covers the common root-profile case. `planRegions()` keeps
 * nested-region input explicit. Advanced components remain visible as stable
 * escape hatches without being re-created for each planning generation.
 */
export interface SeaCurrentBuilder {
    /** TypeSea graph adapter normalized at construction. */
    readonly adapter: TypeSeaCurrentAdapter;

    /** Target model used by every plan and observation. */
    readonly target: SeaCurrentTargetModel;

    /** Bounded planner retained across incremental generations. */
    readonly planner: SeaCurrentPlanner;

    /** Target-aware online tuner backing the stable cost-model view. */
    readonly tuner: SeaCurrentAutoTuner;

    /** Candidate provider retained for optional compiler lowering. */
    readonly transformations:
        SeaCurrentTransformationAdapter<TypeSeaCurrentRegion> | undefined;

    /**
     * @brief Return the cached optimized graph for one guard or schema.
     * @param source TypeSea guard or direct schema.
     * @returns Graph identity shared with planning and optional bridges.
     */
    graph(source: SeaCurrentSource): Graph;

    /**
     * @brief Plan a guard with an optional root-region profile.
     * @param source TypeSea guard or direct schema.
     * @param profile Runtime evidence for the root region.
     * @returns Immutable instrumentation and transformation plan.
     */
    plan(
        source: SeaCurrentSource,
        profile?: SeaCurrentRegionProfile
    ): SeaCurrentProgramPlan;

    /**
     * @brief Plan a guard with explicit profile data for every known region.
     * @param source TypeSea guard or direct schema.
     * @param profiles Region-id keyed profile generation.
     * @returns Immutable instrumentation and transformation plan.
     */
    planRegions(
        source: SeaCurrentSource,
        profiles: Readonly<Record<string, SeaCurrentRegionProfile>>
    ): SeaCurrentProgramPlan;

    /**
     * @brief Feed one measured outcome into the configured target.
     * @param observation Priority or transformation-benefit feedback.
     * @returns Updated immutable target state.
     */
    observe(observation: SeaCurrentObservation): SeaCurrentTargetTuningState;

    /** @brief Snapshot target-specific tuning state for build-cache storage. */
    snapshot(): SeaCurrentAutoTunerSnapshot;

    /** @brief Load validated tuning state while preserving the live cost model. */
    load(snapshot: SeaCurrentAutoTunerSnapshot): void;

    /** @brief Read the current immutable state for the configured target. */
    state(): SeaCurrentTargetTuningState;

    /** @brief Invalidate every cached generation of one logical region. */
    invalidate(regionId: string): number;

    /** @brief Clear structural analyses without discarding tuner state. */
    clear(): void;
}

/**
 * @brief Create a reusable SeaCurrent facade for TypeSea guards.
 * @param options Static target, adapter, tuning, and planner controls.
 * @returns Builder whose methods execute only in the planning control plane.
 */
export function createSeaCurrent(
    options: SeaCurrentBuilderOptions = {}
): SeaCurrentBuilder {
    return new SeaCurrentBuilderCore(options);
}

/** @brief Private implementation retaining normalized planning state. */
class SeaCurrentBuilderCore implements SeaCurrentBuilder {
    readonly #adapter: TypeSeaCurrentAdapter;
    readonly #target: SeaCurrentTargetModel;
    readonly #planner: SeaCurrentPlanner;
    readonly #tuner: SeaCurrentAutoTuner;
    readonly #transformations:
        SeaCurrentTransformationAdapter<TypeSeaCurrentRegion> | undefined;
    readonly #baseOptions: SeaCurrentPlannerOptions<TypeSeaCurrentRegion>;
    readonly #graphs = new WeakMap<object, Graph>();

    public constructor(options: SeaCurrentBuilderOptions) {
        this.#adapter = createTypeSeaCurrentAdapter(options.adapter);
        this.#target = options.target ?? createTypeSeaV8TargetModel(options.targetKey);
        this.#planner = new SeaCurrentPlanner({
            maxCacheEntries: options.maxCacheEntries
        });
        this.#tuner = new SeaCurrentAutoTuner(options.tuning);
        this.#transformations = options.transformations === false
            ? undefined
            : options.transformations ??
                createTypeSeaCurrentTransformationAdapter(options.transformation);
        const budget = options.budget === undefined
            ? undefined
            : Object.freeze({ ...options.budget });
        this.#baseOptions = Object.freeze({
            target: this.#target,
            costModel: this.#tuner.model(this.#target.key),
            budget,
            transformations: this.#transformations,
            enableChecksums: options.checksums === true
        });
    }

    public get adapter(): TypeSeaCurrentAdapter {
        return this.#adapter;
    }

    public get target(): SeaCurrentTargetModel {
        return this.#target;
    }

    public get planner(): SeaCurrentPlanner {
        return this.#planner;
    }

    public get tuner(): SeaCurrentAutoTuner {
        return this.#tuner;
    }

    public get transformations():
    SeaCurrentTransformationAdapter<TypeSeaCurrentRegion> | undefined {
        return this.#transformations;
    }

    public plan(
        source: SeaCurrentSource,
        profile?: SeaCurrentRegionProfile
    ): SeaCurrentProgramPlan {
        const graph = this.graph(source);
        if (profile === undefined) {
            return this.#planner.plan(graph, this.#adapter, this.#baseOptions);
        }
        return this.#planner.plan(
            graph,
            this.#adapter,
            this.optionsWithProfiles(Object.freeze({ root: profile }))
        );
    }

    public planRegions(
        source: SeaCurrentSource,
        profiles: Readonly<Record<string, SeaCurrentRegionProfile>>
    ): SeaCurrentProgramPlan {
        return this.#planner.plan(
            this.graph(source),
            this.#adapter,
            this.optionsWithProfiles(profiles)
        );
    }

    public observe(observation: SeaCurrentObservation): SeaCurrentTargetTuningState {
        if (observation.kind === "priority") {
            return this.#tuner.observe({
                kind: "priority",
                targetKey: this.#target.key,
                features: observation.features,
                actualValue: observation.actualValue
            });
        }
        return this.#tuner.observe({
            kind: "benefit",
            targetKey: this.#target.key,
            features: observation.features,
            actualValue: observation.actualValue
        });
    }

    public snapshot(): SeaCurrentAutoTunerSnapshot {
        return this.#tuner.snapshot();
    }

    public load(snapshot: SeaCurrentAutoTunerSnapshot): void {
        this.#tuner.load(snapshot);
    }

    public state(): SeaCurrentTargetTuningState {
        return this.#tuner.targetState(this.#target.key);
    }

    public invalidate(regionId: string): number {
        return this.#planner.cache.invalidateRegion(this.#adapter.key, regionId);
    }

    public clear(): void {
        this.#planner.cache.clear();
    }

    /** @brief Reuse the optimized graph associated with one source identity. */
    public graph(source: SeaCurrentSource): Graph {
        const cached = this.#graphs.get(source);
        if (cached !== undefined) {
            return cached;
        }
        const graph = readSeaCurrentGraph(source);
        this.#graphs.set(source, graph);
        return graph;
    }

    /** @brief Attach one caller-owned profile generation to stable options. */
    private optionsWithProfiles(
        profiles: Readonly<Record<string, SeaCurrentRegionProfile>>
    ): SeaCurrentPlannerOptions<TypeSeaCurrentRegion> {
        return Object.freeze({
            target: this.#baseOptions.target,
            costModel: this.#baseOptions.costModel,
            budget: this.#baseOptions.budget,
            profiles,
            transformations: this.#baseOptions.transformations,
            enableChecksums: this.#baseOptions.enableChecksums
        });
    }
}

/** @brief Lower a hostile-safe schema source through the cached graph planner. */
function readSeaCurrentGraph(source: SeaCurrentSource): Graph {
    const schema = isSchemaValue(source)
        ? freezeSchema(source)
        : readGuardSchema(source, "SeaCurrent source");
    return makeValidationPlan(schema).graph;
}
