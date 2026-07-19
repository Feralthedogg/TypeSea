/**
 * @file layout.ts
 * @brief Lower SeaCurrent region plans into graph-emitter instrumentation slots.
 */

import type {
    Graph,
    NodeId
} from "../../ir/index.js";
import type {
    GraphInstrumentation,
    GraphInstrumentationOutcome,
    GraphInstrumentationRegion
} from "../../compile/types.js";
import type { SeaCurrentBuilder } from "../builder.js";
import type { SeaCurrentProgramPlan } from "../types.js";
import type {
    TypeSeaCurrentControlBranch,
    TypeSeaCurrentRegion
} from "../typesea-adapter.js";
import type {
    SeaCurrentChecksumManifest,
    SeaCurrentCounterManifest,
    SeaCurrentInstrumentationManifest,
    SeaCurrentRegionManifest
} from "./types.js";

/** @brief Generated counter table identifier reserved by the bridge. */
export const COUNTER_TABLE = "__ts_sc_c";

/** @brief Generated region-frequency table identifier reserved by the bridge. */
export const FREQUENCY_TABLE = "__ts_sc_f";

/** @brief Generated checksum table identifier reserved by the bridge. */
export const CHECKSUM_TABLE = "__ts_sc_s";

/** @brief Generated overflow flag identifier reserved by the bridge. */
export const OVERFLOW_TABLE = "__ts_sc_o";

/** @brief Internal bridge state paired with one public manifest. */
export interface SeaCurrentInstrumentationLayout {
    readonly manifest: SeaCurrentInstrumentationManifest;
    readonly instrumentation: GraphInstrumentation;
}

interface BranchEdges {
    readonly node: NodeId;
    readonly trueEdge: string;
    readonly falseEdge: string;
}

/**
 * @brief Build one emitter instrumentation lookup from a completed program plan.
 * @param current Retained TypeSea-specific planner facade.
 * @param graph Optimized root graph shared with predicate emission.
 * @param plan Plan produced from the same graph identity.
 * @returns Frozen slot manifest and graph instrumentation resolver.
 */
export function buildSeaCurrentInstrumentationLayout(
    current: SeaCurrentBuilder,
    graph: Graph,
    plan: SeaCurrentProgramPlan
): SeaCurrentInstrumentationLayout {
    const planById = new Map(plan.regions.map((region) => [region.region, region]));
    const instrumentationByGraph = new WeakMap<Graph, GraphInstrumentationRegion>();
    const manifests: SeaCurrentRegionManifest[] = [];
    let counterSlot = 0;
    let checksumSlot = 0;
    const regions = current.adapter.enumerateRegions(graph);
    for (let regionIndex = 0; regionIndex < regions.length; regionIndex += 1) {
        const region = regions[regionIndex];
        if (region === undefined) {
            continue;
        }
        const regionPlan = planById.get(region.id);
        if (regionPlan === undefined) {
            continue;
        }
        const program = current.adapter.controlProgram(region);
        const edgeActions = new Map<string, string[]>();
        const counters: SeaCurrentCounterManifest[] = [];
        if (regionPlan.exactProfile.status === "exact") {
            for (const counter of regionPlan.exactProfile.counters) {
                const descriptor = Object.freeze({
                    edge: counter.edge,
                    slot: counterSlot
                });
                counters.push(descriptor);
                appendEdgeAction(
                    edgeActions,
                    counter.edge,
                    emitSaturatingIncrement(COUNTER_TABLE, counterSlot)
                );
                counterSlot += 1;
            }
        }
        const checksums = buildChecksumLayout(
            regionPlan.checksums,
            edgeActions,
            checksumSlot
        );
        checksumSlot += checksums.length;
        const acceptedSlot = counterSlot;
        counterSlot += 1;
        const rejectedSlot = counterSlot;
        counterSlot += 1;
        const frequencySlot = manifests.length;
        const manifest = Object.freeze({
            id: region.id,
            structuralHash: regionPlan.structuralHash,
            frequencySlot,
            acceptedSlot,
            rejectedSlot,
            counters: Object.freeze(counters),
            checksums: Object.freeze(checksums)
        });
        manifests.push(manifest);
        instrumentationByGraph.set(
            region.graph,
            makeRegionInstrumentation(
                region,
                program.entryEdge,
                program.branches,
                edgeActions,
                frequencySlot,
                acceptedSlot,
                rejectedSlot
            )
        );
    }
    const frozenRegions = Object.freeze(manifests);
    const manifest = Object.freeze({
        version: 1 as const,
        profileId: profileIdentity(plan.target, frozenRegions),
        targetKey: plan.target,
        regions: frozenRegions,
        counterSlots: counterSlot,
        checksumSlots: checksumSlot
    });
    return Object.freeze({
        manifest,
        instrumentation: Object.freeze({
            region: (candidate: Graph): GraphInstrumentationRegion | undefined =>
                instrumentationByGraph.get(candidate)
        })
    });
}

/** @brief Build label slots and edge updates for one verified checksum plan. */
function buildChecksumLayout(
    checksums: SeaCurrentProgramPlan["regions"][number]["checksums"],
    edgeActions: Map<string, string[]>,
    firstSlot: number
): SeaCurrentChecksumManifest[] {
    if (checksums === undefined) {
        return [];
    }
    const labels = Array.from(new Set(checksums.terms.map((term) => term.label)))
        .sort((left, right) => left - right);
    const slotByLabel = new Map<number, number>();
    const descriptors = labels.map((label, index) => {
        const slot = firstSlot + index;
        slotByLabel.set(label, slot);
        return Object.freeze({ label, slot, modulus: checksums.modulus });
    });
    for (const term of checksums.terms) {
        const slot = slotByLabel.get(term.label);
        if (slot !== undefined) {
            appendEdgeAction(
                edgeActions,
                term.edge,
                `${CHECKSUM_TABLE}[${String(slot)}]=(${CHECKSUM_TABLE}[${String(slot)}]+${String(term.coefficient)})%${String(checksums.modulus)};`
            );
        }
    }
    return descriptors;
}

/** @brief Create the graph-emitter resolver for one TypeSea region. */
function makeRegionInstrumentation(
    region: TypeSeaCurrentRegion,
    entryEdge: string,
    branches: readonly TypeSeaCurrentControlBranch[],
    edgeActions: ReadonlyMap<string, readonly string[]>,
    frequencySlot: number,
    acceptedSlot: number,
    rejectedSlot: number
): GraphInstrumentationRegion {
    const byPath = new Map<string, BranchEdges>();
    for (const branch of branches) {
        byPath.set(branch.path, Object.freeze({
            node: branch.node,
            trueEdge: branch.trueEdge,
            falseEdge: branch.falseEdge
        }));
    }
    const entry = emitSaturatingIncrement(FREQUENCY_TABLE, frequencySlot) +
        readEdgeAction(edgeActions, entryEdge);
    return Object.freeze({
        branch: (path: string, node: NodeId): boolean => byPath.get(path)?.node === node,
        statement: (path: string, outcome: GraphInstrumentationOutcome): string => {
            if (outcome === "entry") {
                return entry;
            }
            if (outcome === "accept") {
                return emitSaturatingIncrement(COUNTER_TABLE, acceptedSlot);
            }
            if (outcome === "reject") {
                return emitSaturatingIncrement(COUNTER_TABLE, rejectedSlot);
            }
            const branch = byPath.get(path);
            if (branch === undefined || region.graph.nodes[branch.node] === undefined) {
                return "";
            }
            return readEdgeAction(
                edgeActions,
                outcome === "true" ? branch.trueEdge : branch.falseEdge
            );
        }
    });
}

/** @brief Append one generated statement to an edge-owned action vector. */
function appendEdgeAction(
    actions: Map<string, string[]>,
    edge: string,
    statement: string
): void {
    const current = actions.get(edge);
    if (current === undefined) {
        actions.set(edge, [statement]);
    } else {
        current.push(statement);
    }
}

/** @brief Concatenate trusted bridge-owned statements for one edge. */
function readEdgeAction(
    actions: ReadonlyMap<string, readonly string[]>,
    edge: string
): string {
    return actions.get(edge)?.join("") ?? "";
}

/** @brief Emit one saturating integer increment with a shared overflow flag. */
function emitSaturatingIncrement(table: string, slot: number): string {
    const cell = `${table}[${String(slot)}]`;
    return `if(${cell}<9007199254740991){${cell}+=1;}else{${OVERFLOW_TABLE}[0]=1;}`;
}

/** @brief Hash complete public layout identity for stale-artifact rejection. */
function profileIdentity(
    target: string,
    regions: readonly SeaCurrentRegionManifest[]
): string {
    const chunks = [`target:${target};`];
    for (const region of regions) {
        chunks.push(`region:${region.id}:${region.structuralHash};`);
        chunks.push(`outcomes:${String(region.acceptedSlot)}:${String(region.rejectedSlot)};`);
        for (const counter of region.counters) {
            chunks.push(`counter:${counter.edge}:${String(counter.slot)};`);
        }
        for (const checksum of region.checksums) {
            chunks.push(`checksum:${String(checksum.label)}:${String(checksum.slot)}:${String(checksum.modulus)};`);
        }
    }

    const identity = chunks.join("");
    let hash = 2_166_136_261;
    for (let index = 0; index < identity.length; index += 1) {
        hash ^= identity.charCodeAt(index);
        hash = Math.imul(hash, 16_777_619) >>> 0;
    }

    return hash.toString(16).padStart(8, "0");
}
