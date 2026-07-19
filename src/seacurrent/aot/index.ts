/**
 * @file index.ts
 * @brief Public opt-in SeaCurrent JIT and AOT bridge subpath.
 */

export { createSeaCurrentAotBridge } from "./bridge.js";
export type {
    SeaCurrentAotBridge,
    SeaCurrentAotModule,
    SeaCurrentBridgeCompileOptions,
    SeaCurrentBridgeIssue,
    SeaCurrentBridgeIssueCode,
    SeaCurrentChecksumManifest,
    SeaCurrentCompiledPredicate,
    SeaCurrentCounterManifest,
    SeaCurrentInstrumentationManifest,
    SeaCurrentOptimizeOptions,
    SeaCurrentOptimizedAotIssue,
    SeaCurrentOptimizedAotModule,
    SeaCurrentOptimizedPredicate,
    SeaCurrentProfileArtifact,
    SeaCurrentProfileChecksum,
    SeaCurrentProfileEdge,
    SeaCurrentProfileIngestOptions,
    SeaCurrentProfileRegion,
    SeaCurrentRegionManifest,
    SeaCurrentTunedPredicate,
    SeaCurrentTuneOptions
} from "./types.js";
