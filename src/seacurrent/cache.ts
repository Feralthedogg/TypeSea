/**
 * @file cache.ts
 * @brief Region-granular incremental cache for SeaCurrent structural analysis.
 */

import type {
    SeaCurrentControlFlowGraph,
    SeaCurrentCoverPlan,
    SeaCurrentDependenceGraph,
    SeaCurrentExactProfilePlan
} from "./types.js";

/** @brief Immutable structural work reused when a region hash is unchanged. */
export interface SeaCurrentCachedRegionAnalysis {
    readonly valid: boolean;
    readonly invalidReason?: string | undefined;
    readonly cfg: SeaCurrentControlFlowGraph;
    readonly dependences: SeaCurrentDependenceGraph;
    readonly exactProfile: SeaCurrentExactProfilePlan;
    readonly cover: SeaCurrentCoverPlan;
}

interface CacheEntry {
    readonly value: SeaCurrentCachedRegionAnalysis;
}

/**
 * @brief Bounded LRU cache keyed by adapter, target, region, and structure.
 * @details Cache hits skip CFG construction, dependence reconstruction, bridge
 * discovery, shadow-cycle enumeration, and exact-tree planning together.
 */
export class SeaCurrentIncrementalCache {
    readonly #entries = new Map<string, CacheEntry>();
    readonly #maxEntries: number;
    #evictions = 0;

    public constructor(maxEntries = 512) {
        this.#maxEntries = Math.max(1, Math.floor(maxEntries));
    }

    /** @brief Current number of reusable region analyses. */
    public get size(): number {
        return this.#entries.size;
    }

    /** @brief Lifetime number of LRU evictions. */
    public get evictions(): number {
        return this.#evictions;
    }

    /** @brief Read and promote one cache entry. */
    public get(key: string): SeaCurrentCachedRegionAnalysis | undefined {
        const entry = this.#entries.get(key);
        if (entry === undefined) {
            return undefined;
        }
        this.#entries.delete(key);
        this.#entries.set(key, entry);
        return entry.value;
    }

    /** @brief Store one immutable analysis and evict the oldest region if needed. */
    public set(key: string, value: SeaCurrentCachedRegionAnalysis): void {
        this.#entries.delete(key);
        this.#entries.set(key, { value: Object.freeze(value) });
        while (this.#entries.size > this.#maxEntries) {
            const oldest = this.#entries.keys().next().value;
            if (typeof oldest !== "string") {
                break;
            }
            this.#entries.delete(oldest);
            this.#evictions += 1;
        }
    }

    /** @brief Remove every cached generation of one logical region. */
    public invalidateRegion(adapterKey: string, regionId: string): number {
        const prefix = `${adapterKey}\u0000`;
        const marker = `\u0000${regionId}\u0000`;
        let removed = 0;
        for (const key of this.#entries.keys()) {
            if (key.startsWith(prefix) && key.includes(marker)) {
                this.#entries.delete(key);
                removed += 1;
            }
        }
        return removed;
    }

    /** @brief Drop all structural analyses while retaining lifetime metrics. */
    public clear(): void {
        this.#entries.clear();
    }
}

/** @brief Build a collision-resistant cache namespace from semantic identities. */
export function makeSeaCurrentCacheKey(
    adapterKey: string,
    targetKey: string,
    regionId: string,
    structuralHash: string,
    analysisKey: string
): string {
    return `${adapterKey}\u0000${targetKey}\u0000${regionId}\u0000${structuralHash}\u0000${analysisKey}`;
}
