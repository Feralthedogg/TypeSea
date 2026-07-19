/**
 * @file runtime.ts
 * @brief Fixed-table runtime state for opt-in SeaCurrent instrumentation.
 */

import type {
    SeaCurrentInstrumentationManifest,
    SeaCurrentProfileArtifact,
    SeaCurrentProfileChecksum,
    SeaCurrentProfileEdge,
    SeaCurrentProfileRegion
} from "./types.js";

/** @brief Typed tables captured once by an instrumented predicate. */
export interface SeaCurrentRuntimeTables {
    readonly counters: Float64Array;
    readonly frequencies: Float64Array;
    readonly checksums: Uint32Array;
    readonly overflow: Uint8Array;
}

/** @brief Allocate fixed instrumentation tables from a frozen manifest. */
export function createSeaCurrentRuntimeTables(
    manifest: SeaCurrentInstrumentationManifest
): SeaCurrentRuntimeTables {
    return Object.freeze({
        counters: new Float64Array(manifest.counterSlots),
        frequencies: new Float64Array(manifest.regions.length),
        checksums: new Uint32Array(manifest.checksumSlots),
        overflow: new Uint8Array(1)
    });
}

/** @brief Materialize a frozen, JSON-safe profile generation on demand. */
export function snapshotSeaCurrentProfile(
    manifest: SeaCurrentInstrumentationManifest,
    tables: SeaCurrentRuntimeTables
): SeaCurrentProfileArtifact {
    const regions = manifest.regions.map((region): SeaCurrentProfileRegion => {
        const edges = region.counters.map((counter): SeaCurrentProfileEdge =>
            Object.freeze({
                edge: counter.edge,
                count: tables.counters[counter.slot] ?? 0
            }));
        const checksums = region.checksums.map((checksum): SeaCurrentProfileChecksum =>
            Object.freeze({
                label: checksum.label,
                value: tables.checksums[checksum.slot] ?? 0,
                modulus: checksum.modulus
            }));
        return Object.freeze({
            id: region.id,
            structuralHash: region.structuralHash,
            frequency: tables.frequencies[region.frequencySlot] ?? 0,
            accepted: tables.counters[region.acceptedSlot] ?? 0,
            rejected: tables.counters[region.rejectedSlot] ?? 0,
            edges: Object.freeze(edges),
            checksums: Object.freeze(checksums)
        });
    });
    return Object.freeze({
        version: 1 as const,
        profileId: manifest.profileId,
        targetKey: manifest.targetKey,
        overflow: tables.overflow[0] === 1,
        regions: Object.freeze(regions)
    });
}

/** @brief Reset every instrumentation slot without reallocating tables. */
export function resetSeaCurrentProfile(tables: SeaCurrentRuntimeTables): void {
    tables.counters.fill(0);
    tables.frequencies.fill(0);
    tables.checksums.fill(0);
    tables.overflow.fill(0);
}
