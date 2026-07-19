/**
 * @file bridge.ts
 * @brief Optional SeaCurrent bridge into instrumented JIT and AOT predicates.
 */

import {
    emitAotModule,
    type AotIssue
} from "../../aot/index.js";
import {
    emitCompiledGraphBooleanSourceBundle,
    type CompileMode
} from "../../compile/index.js";
import {
    BaseGuard,
    type Guard,
    type Presence,
    type RuntimeValue
} from "../../guard/index.js";
import { readGuardSchema } from "../../internal/index.js";
import {
    err,
    ok,
    type Result
} from "../../result/index.js";
import {
    freezeSchema,
    isSchemaValue,
    type Schema
} from "../../schema/index.js";
import {
    isArrayValue,
    readOwnDataProperty
} from "../../evaluate/shared.js";
import type {
    SeaCurrentBuilder,
    SeaCurrentSource
} from "../builder.js";
import type {
    SeaCurrentBenefitFeatures,
    SeaCurrentProgramPlan,
    SeaCurrentRegionProfile
} from "../types.js";
import {
    isTypeSeaCurrentTransformationAdapter,
    type TypeSeaCurrentLoweringResult
} from "../typesea-transform.js";
import { buildSeaCurrentInstrumentationLayout } from "./layout.js";
import {
    emitSeaCurrentModuleSource,
    emitSeaCurrentOptimizedModuleSource
} from "./module.js";
import {
    instantiateSeaCurrentOptimizedPredicate,
    instantiateSeaCurrentPredicate
} from "./predicate.js";
import { ingestSeaCurrentProfile } from "./profile.js";
import {
    resetSeaCurrentProfile,
    snapshotSeaCurrentProfile
} from "./runtime.js";
import type {
    SeaCurrentAotBridge,
    SeaCurrentAotModule,
    SeaCurrentBridgeCompileOptions,
    SeaCurrentBridgeIssue,
    SeaCurrentCompiledPredicate,
    SeaCurrentOptimizeOptions,
    SeaCurrentOptimizedAotIssue,
    SeaCurrentOptimizedAotModule,
    SeaCurrentOptimizedPredicate,
    SeaCurrentProfileIngestOptions,
    SeaCurrentTunedPredicate,
    SeaCurrentTuneOptions
} from "./types.js";

const PROFILED_PREDICATE_NAME = "typesea_seacurrent_profiled";
const OPTIMIZED_PREDICATE_NAME = "typesea_seacurrent_optimized";
const BASELINE_PREDICATE_NAME = "typesea_seacurrent_baseline";
let benchmarkSink = 0;

interface PreparedOptimization {
    readonly predicate: (value: unknown) => boolean;
    readonly source: string;
    readonly plan: SeaCurrentProgramPlan;
    readonly lowering: TypeSeaCurrentLoweringResult;
}

/**
 * @brief Create an opt-in bridge over one retained SeaCurrent builder.
 * @param current Builder that owns target, tuner, adapter, and incremental cache.
 * @returns Bridge for profiled JIT, standalone AOT, and artifact ingestion.
 */
export function createSeaCurrentAotBridge(
    current: SeaCurrentBuilder
): SeaCurrentAotBridge {
    return new SeaCurrentAotBridgeCore(current);
}

/** @brief Private bridge implementation retaining no validation values. */
class SeaCurrentAotBridgeCore implements SeaCurrentAotBridge {
    readonly #current: SeaCurrentBuilder;

    public constructor(current: SeaCurrentBuilder) {
        this.#current = current;
    }

    public get current(): SeaCurrentBuilder {
        return this.#current;
    }

    public compile<TValue, TPresence extends Presence>(
        source: Guard<TValue, TPresence>,
        options?: SeaCurrentBridgeCompileOptions
    ): SeaCurrentCompiledPredicate<RuntimeValue<TValue, TPresence>>;

    public compile(
        source: SeaCurrentSource,
        options?: SeaCurrentBridgeCompileOptions
    ): SeaCurrentCompiledPredicate;

    public compile(
        source: SeaCurrentSource,
        options?: SeaCurrentBridgeCompileOptions
    ): SeaCurrentCompiledPredicate {
        const mode = readCompileMode(options);
        const graph = this.#current.graph(source);
        const plan = this.#current.plan(source);
        const layout = buildSeaCurrentInstrumentationLayout(this.#current, graph, plan);
        const bundle = emitCompiledGraphBooleanSourceBundle(
            graph,
            PROFILED_PREDICATE_NAME,
            mode,
            false,
            layout.instrumentation
        );
        const runtime = instantiateSeaCurrentPredicate(bundle, layout.manifest);
        return Object.freeze({
            is: runtime.predicate as SeaCurrentCompiledPredicate["is"],
            source: bundle.source,
            plan,
            manifest: layout.manifest,
            snapshot: () => snapshotSeaCurrentProfile(layout.manifest, runtime.tables),
            reset: (): void => {
                resetSeaCurrentProfile(runtime.tables);
            }
        });
    }

    public emit(
        source: SeaCurrentSource,
        options?: SeaCurrentBridgeCompileOptions
    ): Result<SeaCurrentAotModule, readonly AotIssue[]> {
        const mode = readCompileMode(options);
        const guard = makeAotGuard(source);
        const portability = emitAotModule(guard, {
            name: PROFILED_PREDICATE_NAME,
            mode
        });
        if (!portability.ok) {
            return err(portability.error);
        }
        const graph = this.#current.graph(source);
        const plan = this.#current.plan(source);
        const layout = buildSeaCurrentInstrumentationLayout(this.#current, graph, plan);
        const bundle = emitCompiledGraphBooleanSourceBundle(
            graph,
            PROFILED_PREDICATE_NAME,
            mode,
            false,
            layout.instrumentation
        );
        const module = emitSeaCurrentModuleSource(bundle, layout.manifest);
        return ok(Object.freeze({
            source: module.source,
            declarationSource: module.declarationSource,
            plan,
            manifest: layout.manifest
        }));
    }

    public profiles(
        source: SeaCurrentSource,
        artifact: unknown,
        options?: SeaCurrentProfileIngestOptions
    ): Result<Readonly<Record<string, SeaCurrentRegionProfile>>, readonly SeaCurrentBridgeIssue[]> {
        const graph = this.#current.graph(source);
        const plan = this.#current.plan(source);
        const layout = buildSeaCurrentInstrumentationLayout(this.#current, graph, plan);
        return ingestSeaCurrentProfile(layout.manifest, artifact, options);
    }

    public replan(
        source: SeaCurrentSource,
        artifact: unknown,
        options?: SeaCurrentProfileIngestOptions
    ): Result<SeaCurrentProgramPlan, readonly SeaCurrentBridgeIssue[]> {
        const profiles = this.profiles(source, artifact, options);
        return profiles.ok
            ? ok(this.#current.planRegions(source, profiles.value))
            : err(profiles.error);
    }

    public optimize<TValue, TPresence extends Presence>(
        source: Guard<TValue, TPresence>,
        artifact: unknown,
        options?: SeaCurrentOptimizeOptions
    ): Result<SeaCurrentOptimizedPredicate<RuntimeValue<TValue, TPresence>>, readonly SeaCurrentBridgeIssue[]>;

    public optimize(
        source: SeaCurrentSource,
        artifact: unknown,
        options?: SeaCurrentOptimizeOptions
    ): Result<SeaCurrentOptimizedPredicate, readonly SeaCurrentBridgeIssue[]>;

    public optimize(
        source: SeaCurrentSource,
        artifact: unknown,
        options?: SeaCurrentOptimizeOptions
    ): Result<SeaCurrentOptimizedPredicate, readonly SeaCurrentBridgeIssue[]> {
        const profiles = this.profiles(source, artifact, options);
        if (!profiles.ok) {
            return err(profiles.error);
        }
        const prepared = this.prepareOptimization(
            source,
            profiles.value,
            readCompileMode(options)
        );
        return ok(Object.freeze({
            is: prepared.predicate as SeaCurrentOptimizedPredicate["is"],
            source: prepared.source,
            plan: prepared.plan,
            applied: prepared.lowering.applied
        }));
    }

    public emitOptimized(
        source: SeaCurrentSource,
        artifact: unknown,
        options?: SeaCurrentOptimizeOptions
    ): Result<SeaCurrentOptimizedAotModule, readonly SeaCurrentOptimizedAotIssue[]> {
        const mode = readCompileMode(options);
        const portability = emitAotModule(makeAotGuard(source), {
            name: OPTIMIZED_PREDICATE_NAME,
            mode
        });
        if (!portability.ok) {
            return err(portability.error);
        }
        const profiles = this.profiles(source, artifact, options);
        if (!profiles.ok) {
            return err(profiles.error);
        }
        const graph = this.#current.graph(source);
        const plan = this.#current.planRegions(source, profiles.value);
        const lowering = lowerSelectedGraph(this.#current, graph, plan, mode);
        const bundle = emitCompiledGraphBooleanSourceBundle(
            lowering.graph,
            OPTIMIZED_PREDICATE_NAME,
            mode,
            false,
            undefined,
            useGraphObjectOrder(graph, lowering) ? "graph" : "static"
        );
        const module = emitSeaCurrentOptimizedModuleSource(bundle);
        return ok(Object.freeze({
            source: module.source,
            declarationSource: module.declarationSource,
            plan,
            applied: lowering.applied
        }));
    }

    public tune<TValue, TPresence extends Presence>(
        source: Guard<TValue, TPresence>,
        artifact: unknown,
        samples: readonly unknown[],
        options?: SeaCurrentTuneOptions
    ): Result<SeaCurrentTunedPredicate<RuntimeValue<TValue, TPresence>>, readonly SeaCurrentBridgeIssue[]>;

    public tune(
        source: SeaCurrentSource,
        artifact: unknown,
        samples: readonly unknown[],
        options?: SeaCurrentTuneOptions
    ): Result<SeaCurrentTunedPredicate, readonly SeaCurrentBridgeIssue[]>;

    public tune(
        source: SeaCurrentSource,
        artifact: unknown,
        samples: readonly unknown[],
        options?: SeaCurrentTuneOptions
    ): Result<SeaCurrentTunedPredicate, readonly SeaCurrentBridgeIssue[]> {
        const profiles = this.profiles(source, artifact, options);
        if (!profiles.ok) {
            return err(profiles.error);
        }
        const mode = readCompileMode(options);
        const prepared = this.prepareOptimization(source, profiles.value, mode);
        const graph = this.#current.graph(source);
        const baselineBundle = emitCompiledGraphBooleanSourceBundle(
            graph,
            BASELINE_PREDICATE_NAME,
            mode
        );
        const baseline = instantiateSeaCurrentOptimizedPredicate(baselineBundle);
        const admittedSamples = admitBenchmarkSamples(samples);
        if (admittedSamples === undefined) {
            return err(Object.freeze([Object.freeze({
                code: "invalid_samples" as const,
                message: "SeaCurrent tune samples must be a non-empty dense data array"
            })]));
        }
        if (!predicatesAgree(baseline, prepared.predicate, admittedSamples)) {
            return err(Object.freeze([Object.freeze({
                code: "semantic_mismatch" as const,
                message: "SeaCurrent transformed predicate disagrees with its baseline sample"
            })]));
        }
        const benchmark = comparePredicates(
            baseline,
            prepared.predicate,
            admittedSamples,
            options
        );
        observeMeasuredTransforms(
            this.#current,
            prepared.plan,
            profiles.value,
            benchmark.speedup
        );
        const minimum = normalizeFinite(options?.minSpeedup, 1.02, 0, 100);
        const selected = prepared.lowering.applied.length > 0 &&
            benchmark.speedup >= minimum
            ? "optimized" as const
            : "baseline" as const;
        const predicate = selected === "optimized" ? prepared.predicate : baseline;
        return ok(Object.freeze({
            is: predicate as SeaCurrentTunedPredicate["is"],
            source: selected === "optimized" ? prepared.source : baselineBundle.source,
            selected,
            baselineHz: benchmark.baselineHz,
            optimizedHz: benchmark.optimizedHz,
            speedup: benchmark.speedup,
            plan: prepared.plan,
            candidateTransforms: prepared.lowering.applied
        }));
    }

    /** @brief Lower admitted profiles and instantiate one uninstrumented candidate. */
    private prepareOptimization(
        source: SeaCurrentSource,
        profiles: Readonly<Record<string, SeaCurrentRegionProfile>>,
        mode: CompileMode
    ): PreparedOptimization {
        const graph = this.#current.graph(source);
        const plan = this.#current.planRegions(source, profiles);
        const lowering = lowerSelectedGraph(this.#current, graph, plan, mode);
        const bundle = emitCompiledGraphBooleanSourceBundle(
            lowering.graph,
            OPTIMIZED_PREDICATE_NAME,
            mode,
            false,
            undefined,
            useGraphObjectOrder(graph, lowering) ? "graph" : "static"
        );
        return Object.freeze({
            predicate: instantiateSeaCurrentOptimizedPredicate(bundle),
            source: bundle.source,
            plan,
            lowering
        });
    }
}

/** @brief Apply only the built-in safe-mode lowerer selected by the planner. */
function lowerSelectedGraph(
    current: SeaCurrentBuilder,
    graph: ReturnType<SeaCurrentBuilder["graph"]>,
    plan: SeaCurrentProgramPlan,
    mode: CompileMode
): TypeSeaCurrentLoweringResult {
    const transformations = current.transformations;
    if (mode !== "safe" || !isTypeSeaCurrentTransformationAdapter(transformations)) {
        return Object.freeze({ graph, applied: Object.freeze([]) });
    }
    return transformations.lower(graph, current.adapter, plan);
}

/** @brief Preserve materialized order when lowering changed identity or a directive. */
function useGraphObjectOrder(
    original: ReturnType<SeaCurrentBuilder["graph"]>,
    lowering: TypeSeaCurrentLoweringResult
): boolean {
    return lowering.graph !== original || lowering.applied.length !== 0;
}

/** @brief One warmed median comparison returned by the control-plane harness. */
interface PredicateComparison {
    readonly baselineHz: number;
    readonly optimizedHz: number;
    readonly speedup: number;
}

/** @brief Warm both predicates, alternate measurement order, and compare medians. */
function comparePredicates(
    baseline: (value: unknown) => boolean,
    optimized: (value: unknown) => boolean,
    samples: readonly unknown[],
    options: SeaCurrentTuneOptions | undefined
): PredicateComparison {
    const warmup = normalizeInteger(options?.warmupIterations, 20_000, 1, 10_000_000);
    const iterations = normalizeInteger(options?.iterations, 200_000, 1, 100_000_000);
    const rounds = normalizeInteger(options?.rounds, 5, 1, 31);
    runPredicateLoop(baseline, samples, warmup);
    runPredicateLoop(optimized, samples, warmup);
    const baselineSamples = new Array<number>(rounds);
    const optimizedSamples = new Array<number>(rounds);
    for (let round = 0; round < rounds; round += 1) {
        if ((round & 1) === 0) {
            baselineSamples[round] = measurePredicate(baseline, samples, iterations);
            optimizedSamples[round] = measurePredicate(optimized, samples, iterations);
        } else {
            optimizedSamples[round] = measurePredicate(optimized, samples, iterations);
            baselineSamples[round] = measurePredicate(baseline, samples, iterations);
        }
    }
    const baselineHz = median(baselineSamples);
    const optimizedHz = median(optimizedSamples);
    return Object.freeze({
        baselineHz,
        optimizedHz,
        speedup: baselineHz > 0 ? optimizedHz / baselineHz : 0
    });
}

/** @brief Measure one predicate without allocating inside the timed loop. */
function measurePredicate(
    predicate: (value: unknown) => boolean,
    samples: readonly unknown[],
    iterations: number
): number {
    const started = performance.now();
    runPredicateLoop(predicate, samples, iterations);
    const elapsed = performance.now() - started;
    return elapsed > 0 ? iterations * 1_000 / elapsed : Number.MAX_SAFE_INTEGER;
}

/** @brief Cycle a dense sample vector while retaining observable result use. */
function runPredicateLoop(
    predicate: (value: unknown) => boolean,
    samples: readonly unknown[],
    iterations: number
): void {
    let accepted = 0;
    let sampleIndex = 0;
    for (let index = 0; index < iterations; index += 1) {
        accepted += predicate(samples[sampleIndex]) ? 1 : 0;
        sampleIndex += 1;
        if (sampleIndex === samples.length) {
            sampleIndex = 0;
        }
    }
    benchmarkSink = (benchmarkSink + accepted) % Number.MAX_SAFE_INTEGER;
}

/** @brief Copy a dense benchmark corpus so accessors cannot run in timed loops. */
function admitBenchmarkSamples(
    samples: readonly unknown[]
): readonly unknown[] | undefined {
    if (!isArrayValue(samples)) {
        return undefined;
    }
    const length = readOwnDataProperty(samples, "length")?.value;
    if (typeof length !== "number" || !Number.isSafeInteger(length) ||
        length === 0 || length > 1_000_000) {
        return undefined;
    }
    const result = new Array<unknown>(length);
    for (let index = 0; index < length; index += 1) {
        const descriptor = readOwnDataProperty(samples, index);
        if (descriptor === undefined) {
            return undefined;
        }
        result[index] = descriptor.value;
    }
    return Object.freeze(result);
}

/** @brief Prove sample-level parity before timing or promotion. */
function predicatesAgree(
    baseline: (value: unknown) => boolean,
    optimized: (value: unknown) => boolean,
    samples: readonly unknown[]
): boolean {
    for (let index = 0; index < samples.length; index += 1) {
        const value = samples[index];
        if (baseline(value) !== optimized(value)) {
            return false;
        }
    }
    return true;
}

/** @brief Feed measured speedup back into target-local benefit observations. */
function observeMeasuredTransforms(
    current: SeaCurrentBuilder,
    plan: SeaCurrentProgramPlan,
    profiles: Readonly<Record<string, SeaCurrentRegionProfile>>,
    speedup: number
): void {
    const measuredSpeedup = Number.isFinite(speedup) && speedup > 0 ? speedup : 1;
    for (let index = 0; index < plan.regions.length; index += 1) {
        const region = plan.regions[index];
        const candidate = region?.transform?.candidate;
        if (region === undefined || candidate === undefined) {
            continue;
        }
        const frequency = profiles[region.region]?.frequency ?? 0;
        const features: SeaCurrentBenefitFeatures = {
            frequency,
            costBefore: candidate.costBefore,
            costAfter: candidate.costAfter,
            sizeIncrease: current.target.codeSizeCost(candidate),
            semanticRisk: candidate.semanticRisk
        };
        const measuredAfter = candidate.costBefore / measuredSpeedup;
        current.observe({
            kind: "benefit",
            features,
            actualValue: frequency * (candidate.costBefore - measuredAfter)
        });
    }
}

/** @brief Return the median of one finite non-empty measurement vector. */
function median(values: readonly number[]): number {
    const ordered = values.slice().sort((left, right) => left - right);
    return ordered[Math.floor(ordered.length / 2)] ?? 0;
}

/** @brief Normalize bounded integer benchmark controls. */
function normalizeInteger(
    value: number | undefined,
    fallback: number,
    minimum: number,
    maximum: number
): number {
    return Math.floor(normalizeFinite(value, fallback, minimum, maximum));
}

/** @brief Normalize one finite benchmark option to a closed interval. */
function normalizeFinite(
    value: number | undefined,
    fallback: number,
    minimum: number,
    maximum: number
): number {
    return value !== undefined && Number.isFinite(value)
        ? Math.max(minimum, Math.min(maximum, value))
        : fallback;
}

/** @brief Convert a direct schema or guard source into the public AOT contract. */
function makeAotGuard(source: SeaCurrentSource): BaseGuard<unknown> {
    const schema: Schema = isSchemaValue(source)
        ? freezeSchema(source)
        : readGuardSchema(source, "SeaCurrent AOT source");
    return new BaseGuard<unknown>(schema);
}

/** @brief Normalize the optional bridge compile mode. */
function readCompileMode(options: SeaCurrentBridgeCompileOptions | undefined): CompileMode {
    return options?.mode ?? "safe";
}
