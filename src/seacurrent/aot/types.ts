/**
 * @file types.ts
 * @brief Public contracts for the opt-in SeaCurrent JIT and AOT bridge.
 */

import type { AotIssue } from "../../aot/index.js";
import type { CompileMode } from "../../compile/index.js";
import type {
    Guard,
    Presence,
    RuntimeValue
} from "../../guard/index.js";
import type { Result } from "../../result/index.js";
import type {
    SeaCurrentBuilder,
    SeaCurrentSource
} from "../builder.js";
import type {
    SeaCurrentProgramPlan,
    SeaCurrentRegionProfile
} from "../types.js";
import type { TypeSeaCurrentAppliedTransform } from "../typesea-transform.js";

/** @brief One edge counter slot emitted into an instrumented predicate. */
export interface SeaCurrentCounterManifest {
    readonly edge: string;
    readonly slot: number;
}

/** @brief One modular checksum accumulator emitted for a CDC layer. */
export interface SeaCurrentChecksumManifest {
    readonly label: number;
    readonly slot: number;
    readonly modulus: number;
}

/** @brief Instrumentation layout for one graph region. */
export interface SeaCurrentRegionManifest {
    readonly id: string;
    readonly structuralHash: string;
    readonly frequencySlot: number;
    readonly acceptedSlot: number;
    readonly rejectedSlot: number;
    readonly counters: readonly SeaCurrentCounterManifest[];
    readonly checksums: readonly SeaCurrentChecksumManifest[];
}

/** @brief Immutable identity and slot layout embedded into profiled builds. */
export interface SeaCurrentInstrumentationManifest {
    readonly version: 1;
    readonly profileId: string;
    readonly targetKey: string;
    readonly regions: readonly SeaCurrentRegionManifest[];
    readonly counterSlots: number;
    readonly checksumSlots: number;
}

/** @brief One measured edge count in a serialized profile artifact. */
export interface SeaCurrentProfileEdge {
    readonly edge: string;
    readonly count: number;
}

/** @brief One measured CDC checksum in a serialized profile artifact. */
export interface SeaCurrentProfileChecksum {
    readonly label: number;
    readonly value: number;
    readonly modulus: number;
}

/** @brief Runtime measurements for one structurally identified region. */
export interface SeaCurrentProfileRegion {
    readonly id: string;
    readonly structuralHash: string;
    readonly frequency: number;
    readonly accepted: number;
    readonly rejected: number;
    readonly edges: readonly SeaCurrentProfileEdge[];
    readonly checksums: readonly SeaCurrentProfileChecksum[];
}

/** @brief JSON-safe profile generation returned by snapshot(). */
export interface SeaCurrentProfileArtifact {
    readonly version: 1;
    readonly profileId: string;
    readonly targetKey: string;
    readonly overflow: boolean;
    readonly regions: readonly SeaCurrentProfileRegion[];
}

/** @brief Compile controls for an instrumented JIT or AOT predicate. */
export interface SeaCurrentBridgeCompileOptions {
    readonly mode?: CompileMode | undefined;
}

/** @brief Profile-ingestion controls applied after artifact validation. */
export interface SeaCurrentProfileIngestOptions {
    readonly uncertainty?: number | undefined;
}

/** @brief Controls shared by profile lowering and optimized source emission. */
export interface SeaCurrentOptimizeOptions extends
SeaCurrentBridgeCompileOptions,
SeaCurrentProfileIngestOptions {}

/** @brief Explicit warmed benchmark and promotion controls. */
export interface SeaCurrentTuneOptions extends SeaCurrentOptimizeOptions {
    readonly warmupIterations?: number | undefined;
    readonly iterations?: number | undefined;
    readonly rounds?: number | undefined;
    readonly minSpeedup?: number | undefined;
}

/** @brief Closed issue codes for hostile or stale profile artifacts. */
export type SeaCurrentBridgeIssueCode =
    | "invalid_artifact"
    | "unsupported_version"
    | "profile_id_mismatch"
    | "target_mismatch"
    | "counter_overflow"
    | "region_mismatch"
    | "structural_hash_mismatch"
    | "counter_mismatch"
    | "outcome_mismatch"
    | "semantic_mismatch"
    | "invalid_samples"
    | "checksum_mismatch";

/** @brief Structured profile-ingestion failure. */
export interface SeaCurrentBridgeIssue {
    readonly code: SeaCurrentBridgeIssueCode;
    readonly message: string;
    readonly region?: string | undefined;
}

/** @brief Instrumented JIT predicate with explicit profile lifecycle methods. */
export interface SeaCurrentCompiledPredicate<TValue = unknown> {
    readonly is: (value: unknown) => value is TValue;
    readonly source: string;
    readonly plan: SeaCurrentProgramPlan;
    readonly manifest: SeaCurrentInstrumentationManifest;
    snapshot(): SeaCurrentProfileArtifact;
    reset(): void;
}

/** @brief Uninstrumented predicate emitted from a verified transformed graph. */
export interface SeaCurrentOptimizedPredicate<TValue = unknown> {
    readonly is: (value: unknown) => value is TValue;
    readonly source: string;
    readonly plan: SeaCurrentProgramPlan;
    readonly applied: readonly TypeSeaCurrentAppliedTransform[];
}

/** @brief Warmed baseline/candidate comparison with a promotion decision. */
export interface SeaCurrentTunedPredicate<TValue = unknown> {
    readonly is: (value: unknown) => value is TValue;
    readonly source: string;
    readonly selected: "baseline" | "optimized";
    readonly baselineHz: number;
    readonly optimizedHz: number;
    readonly speedup: number;
    readonly plan: SeaCurrentProgramPlan;
    readonly candidateTransforms: readonly TypeSeaCurrentAppliedTransform[];
}

/** @brief Standalone ESM source plus its planning and instrumentation metadata. */
export interface SeaCurrentAotModule {
    readonly source: string;
    readonly declarationSource: string;
    readonly plan: SeaCurrentProgramPlan;
    readonly manifest: SeaCurrentInstrumentationManifest;
}

/** @brief Standalone uninstrumented ESM emitted from a transformed graph. */
export interface SeaCurrentOptimizedAotModule {
    readonly source: string;
    readonly declarationSource: string;
    readonly plan: SeaCurrentProgramPlan;
    readonly applied: readonly TypeSeaCurrentAppliedTransform[];
}

/** @brief AOT portability or profile-admission failure during optimized emit. */
export type SeaCurrentOptimizedAotIssue = AotIssue | SeaCurrentBridgeIssue;

/**
 * @brief Optional bridge from SeaCurrent plans into instrumented predicates.
 * @details `compile()` executes in-process, `emit()` produces standalone ESM,
 * and `profiles()` admits only artifacts matching the current graph identity.
 */
export interface SeaCurrentAotBridge {
    readonly current: SeaCurrentBuilder;

    compile<TValue, TPresence extends Presence>(
        source: Guard<TValue, TPresence>,
        options?: SeaCurrentBridgeCompileOptions
    ): SeaCurrentCompiledPredicate<RuntimeValue<TValue, TPresence>>;

    compile(
        source: SeaCurrentSource,
        options?: SeaCurrentBridgeCompileOptions
    ): SeaCurrentCompiledPredicate;

    emit(
        source: SeaCurrentSource,
        options?: SeaCurrentBridgeCompileOptions
    ): Result<SeaCurrentAotModule, readonly AotIssue[]>;

    profiles(
        source: SeaCurrentSource,
        artifact: unknown,
        options?: SeaCurrentProfileIngestOptions
    ): Result<Readonly<Record<string, SeaCurrentRegionProfile>>, readonly SeaCurrentBridgeIssue[]>;

    replan(
        source: SeaCurrentSource,
        artifact: unknown,
        options?: SeaCurrentProfileIngestOptions
    ): Result<SeaCurrentProgramPlan, readonly SeaCurrentBridgeIssue[]>;

    optimize<TValue, TPresence extends Presence>(
        source: Guard<TValue, TPresence>,
        artifact: unknown,
        options?: SeaCurrentOptimizeOptions
    ): Result<SeaCurrentOptimizedPredicate<RuntimeValue<TValue, TPresence>>, readonly SeaCurrentBridgeIssue[]>;

    optimize(
        source: SeaCurrentSource,
        artifact: unknown,
        options?: SeaCurrentOptimizeOptions
    ): Result<SeaCurrentOptimizedPredicate, readonly SeaCurrentBridgeIssue[]>;

    emitOptimized(
        source: SeaCurrentSource,
        artifact: unknown,
        options?: SeaCurrentOptimizeOptions
    ): Result<SeaCurrentOptimizedAotModule, readonly SeaCurrentOptimizedAotIssue[]>;

    tune<TValue, TPresence extends Presence>(
        source: Guard<TValue, TPresence>,
        artifact: unknown,
        samples: readonly unknown[],
        options?: SeaCurrentTuneOptions
    ): Result<SeaCurrentTunedPredicate<RuntimeValue<TValue, TPresence>>, readonly SeaCurrentBridgeIssue[]>;

    tune(
        source: SeaCurrentSource,
        artifact: unknown,
        samples: readonly unknown[],
        options?: SeaCurrentTuneOptions
    ): Result<SeaCurrentTunedPredicate, readonly SeaCurrentBridgeIssue[]>;
}
