/**
 * @file typesea-transform.ts
 * @brief Profile-guided object-field lowering for TypeSea predicate graphs.
 * @details The planner sees immutable candidates while private WeakMap payloads
 * retain compiler-specific permutations. Lowering is control-plane work and
 * never adds a branch or allocation to the promoted predicate.
 */

import {
    estimateGraphCost,
    isSchedulableObjectShapeEntry,
    scheduleObjectShapeEntries
} from "../compile/object-order.js";
import type { PresenceTag } from "../kind/index.js";
import { NodeTag } from "../kind/index.js";
import {
    freezeGraph,
    isGraphValue,
    type Graph,
    type GraphNode,
    type ObjectShapeEntry,
    type ObjectShapeNode
} from "../ir/index.js";
import type {
    SeaCurrentDependenceGraph,
    SeaCurrentProgramPlan,
    SeaCurrentRegionProfile,
    SeaCurrentSchedule,
    SeaCurrentTransformationAdapter,
    SeaCurrentTransformationContext,
    SeaCurrentTransformCandidate
} from "./types.js";
import type {
    TypeSeaCurrentAdapter,
    TypeSeaCurrentRegion
} from "./typesea-adapter.js";

const TRANSFORM_ID = "typesea.profile-guided-object-order.v1";
const DEFAULT_MIN_SAMPLES = 64;
const DEFAULT_REJECTION_PRIOR = 0.01;
const MIN_REJECTION_PROBABILITY = 1e-9;

/** @brief Controls for conservative profile-guided field reordering. */
export interface TypeSeaCurrentTransformationOptions {
    /** Minimum complete child-region evaluations needed before one field moves. */
    readonly minSamples?: number | undefined;

    /** Minimum modeled work reduction required to expose a candidate. */
    readonly minExpectedImprovement?: number | undefined;
}

/** @brief One transform materialized into a promoted TypeSea graph. */
export interface TypeSeaCurrentAppliedTransform {
    readonly region: string;
    readonly candidate: string;
}

/** @brief Validated graph and immutable record returned by lowering. */
export interface TypeSeaCurrentLoweringResult {
    readonly graph: Graph;
    readonly applied: readonly TypeSeaCurrentAppliedTransform[];
}

/**
 * @brief TypeSea transformation provider that can also lower selected plans.
 * @details Custom universal planner adapters may propose candidates without
 * implementing this payload-specific boundary; the bridge then emits baseline
 * code and reports no applied transformations.
 */
export interface TypeSeaCurrentTransformationAdapter extends
SeaCurrentTransformationAdapter<TypeSeaCurrentRegion> {
    lower(
        program: Graph,
        adapter: TypeSeaCurrentAdapter,
        plan: SeaCurrentProgramPlan
    ): TypeSeaCurrentLoweringResult;
}

interface NormalizedTransformationOptions {
    readonly minSamples: number;
    readonly minExpectedImprovement: number;
}

interface EntryMeasurement {
    readonly entry: ObjectShapeEntry;
    readonly probability: number;
    readonly score: number;
    readonly observed: boolean;
}

interface ObjectOrderDirective {
    readonly node: number;
    readonly keys: readonly string[];
}

interface TransformPayload {
    readonly graph: Graph;
    readonly region: string;
    readonly candidate: string;
    readonly directives: readonly ObjectOrderDirective[];
}

/**
 * @brief Build the default TypeSea profile transformation and lowering adapter.
 * @details Candidate payloads remain unreachable from public plans, preventing
 * callers from forging graph permutations by editing a candidate identifier.
 */
export function createTypeSeaCurrentTransformationAdapter(
    options: TypeSeaCurrentTransformationOptions = {}
): TypeSeaCurrentTransformationAdapter {
    return new TypeSeaCurrentTransformationAdapterCore(options);
}

/** @brief Detect the optional compiler-specific lowering capability. */
export function isTypeSeaCurrentTransformationAdapter(
    value: SeaCurrentTransformationAdapter<TypeSeaCurrentRegion> | undefined
): value is TypeSeaCurrentTransformationAdapter {
    const candidate = value as {
        readonly lower?: unknown;
    } | undefined;
    return typeof candidate?.lower === "function";
}

/** @brief Retained adapter with private candidate-to-permutation ownership. */
class TypeSeaCurrentTransformationAdapterCore implements
TypeSeaCurrentTransformationAdapter {
    readonly #options: NormalizedTransformationOptions;
    readonly #payloads = new WeakMap<SeaCurrentTransformCandidate, TransformPayload>();

    public constructor(options: TypeSeaCurrentTransformationOptions) {
        this.#options = Object.freeze({
            minSamples: normalizeMinimumSamples(options.minSamples),
            minExpectedImprovement: normalizeImprovement(
                options.minExpectedImprovement
            )
        });
    }

    public supportedTransforms(
        region: TypeSeaCurrentRegion,
        context: SeaCurrentTransformationContext<TypeSeaCurrentRegion>
    ): readonly SeaCurrentTransformCandidate[] {
        const profileByGraph = indexProfilesByGraph(context);
        const directives: ObjectOrderDirective[] = [];
        let costBefore = 0;
        let costAfter = 0;
        for (let index = 0; index < region.graph.nodes.length; index += 1) {
            const node = region.graph.nodes[index];
            if (node?.tag !== NodeTag.ObjectShape) {
                continue;
            }
            const analysis = analyzeObjectOrder(node, profileByGraph, this.#options);
            if (analysis === undefined) {
                continue;
            }
            directives.push(Object.freeze({
                node: node.id,
                keys: Object.freeze(analysis.entries.map((entry) => entry.key))
            }));
            costBefore += analysis.costBefore;
            costAfter += analysis.costAfter;
        }
        if (directives.length === 0 ||
            costBefore - costAfter < this.#options.minExpectedImprovement) {
            return Object.freeze([]);
        }
        const candidateId = `${TRANSFORM_ID}:${region.id}`;
        const candidate = Object.freeze({
            id: candidateId,
            kind: "custom" as const,
            costBefore,
            costAfter,
            sizeIncrease: 0,
            semanticRisk: 0
        });
        this.#payloads.set(candidate, Object.freeze({
            graph: region.graph,
            region: region.id,
            candidate: candidateId,
            directives: Object.freeze(directives)
        }));
        return Object.freeze([candidate]);
    }

    public verify(
        region: TypeSeaCurrentRegion,
        candidate: SeaCurrentTransformCandidate,
        dependenceGraph: SeaCurrentDependenceGraph,
        schedule: SeaCurrentSchedule | undefined,
        context: SeaCurrentTransformationContext<TypeSeaCurrentRegion>
    ): boolean {
        const payload = this.#payloads.get(candidate);
        if (payload?.graph !== region.graph || schedule !== undefined ||
            context.current.region !== region ||
            dependenceGraph.operations.length !== region.graph.nodes.length ||
            candidate.kind !== "custom" || !candidate.id.startsWith(TRANSFORM_ID) ||
            !(candidate.costAfter < candidate.costBefore)) {
            return false;
        }
        return payload.directives.every((directive) =>
            verifyObjectOrderDirective(region.graph, directive));
    }

    public lower(
        program: Graph,
        adapter: TypeSeaCurrentAdapter,
        plan: SeaCurrentProgramPlan
    ): TypeSeaCurrentLoweringResult {
        const directiveByGraph = indexSelectedDirectives(
            program,
            adapter,
            plan,
            this.#payloads
        );
        const applied: TypeSeaCurrentAppliedTransform[] = [];
        const graph = rewriteGraph(
            program,
            directiveByGraph,
            applied,
            new WeakMap(),
            new WeakSet()
        );
        if (!isGraphValue(graph)) {
            return Object.freeze({ graph: program, applied: Object.freeze([]) });
        }
        return Object.freeze({
            graph: freezeGraph(graph),
            applied: Object.freeze(applied)
        });
    }
}

/** @brief Profile-guided order and expected cost for one object node. */
interface ObjectOrderAnalysis {
    readonly entries: readonly ObjectShapeEntry[];
    readonly costBefore: number;
    readonly costAfter: number;
}

/** @brief Reorder only sampled positions inside pure, equal-presence runs. */
function analyzeObjectOrder(
    node: ObjectShapeNode,
    profiles: WeakMap<Graph, SeaCurrentRegionProfile>,
    options: NormalizedTransformationOptions
): ObjectOrderAnalysis | undefined {
    const baseline = scheduleObjectShapeEntries(node.entries);
    const entries = baseline.slice();
    let changed = false;
    let start = 0;
    while (start < entries.length) {
        const first = entries[start];
        if (first === undefined || !isSchedulableObjectShapeEntry(first)) {
            start += 1;
            continue;
        }
        const presence = first.presence;
        let end = start + 1;
        while (end < entries.length && sameMovableClass(entries[end], presence)) {
            end += 1;
        }
        changed = reorderObservedPositions(entries, start, end, profiles, options) || changed;
        start = end;
    }
    if (!changed) {
        return undefined;
    }
    const before = expectedObjectCost(baseline, profiles, options);
    const after = expectedObjectCost(entries, profiles, options);
    if (!(after < before)) {
        return undefined;
    }
    return Object.freeze({
        entries: Object.freeze(entries),
        costBefore: before,
        costAfter: after
    });
}

/** @brief Keep callback barriers and required/optional partitions immovable. */
function sameMovableClass(
    entry: ObjectShapeEntry | undefined,
    presence: PresenceTag
): boolean {
    return entry?.presence === presence &&
        isSchedulableObjectShapeEntry(entry);
}

/** @brief Sort measured fields in-place while leaving unsampled slots fixed. */
function reorderObservedPositions(
    entries: ObjectShapeEntry[],
    start: number,
    end: number,
    profiles: WeakMap<Graph, SeaCurrentRegionProfile>,
    options: NormalizedTransformationOptions
): boolean {
    const positions: number[] = [];
    const measured: EntryMeasurement[] = [];
    for (let index = start; index < end; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
            continue;
        }
        const measurement = measureEntry(entry, profiles.get(entry.graph), options);
        if (measurement.observed) {
            positions.push(index);
            measured.push(measurement);
        }
    }
    if (measured.length < 2) {
        return false;
    }
    measured.sort((left, right) => left.score - right.score ||
        left.entry.key.localeCompare(right.entry.key));
    let changed = false;
    for (let index = 0; index < positions.length; index += 1) {
        const position = positions[index];
        const measurement = measured[index];
        if (position !== undefined && measurement !== undefined) {
            changed = entries[position] !== measurement.entry || changed;
            entries[position] = measurement.entry;
        }
    }
    return changed;
}

/** @brief Convert complete region outcomes into an uncertainty-shrunk score. */
function measureEntry(
    entry: ObjectShapeEntry,
    profile: SeaCurrentRegionProfile | undefined,
    options: NormalizedTransformationOptions
): EntryMeasurement {
    const frequency = profile?.frequency ?? 0;
    const accepted = profile?.accepted;
    const rejected = profile?.rejected;
    if (profile === undefined || !Number.isSafeInteger(frequency) ||
        frequency < options.minSamples || accepted === undefined ||
        rejected === undefined || accepted + rejected !== frequency) {
        return Object.freeze({
            entry,
            probability: DEFAULT_REJECTION_PRIOR,
            score: Number.POSITIVE_INFINITY,
            observed: false
        });
    }
    const certainty = Math.max(0, Math.min(1, 1 - profile.uncertainty));
    const sampleWeight = frequency / (frequency + options.minSamples);
    const empirical = (rejected + 0.5) / (frequency + 1);
    const confidence = certainty * sampleWeight;
    const probability = Math.max(
        MIN_REJECTION_PROBABILITY,
        empirical * confidence + DEFAULT_REJECTION_PRIOR * (1 - confidence)
    );
    return Object.freeze({
        entry,
        probability,
        score: Math.max(1, estimateGraphCost(entry.graph)) / probability,
        observed: true
    });
}

/** @brief Estimate short-circuit work under measured conditional failures. */
function expectedObjectCost(
    entries: readonly ObjectShapeEntry[],
    profiles: WeakMap<Graph, SeaCurrentRegionProfile>,
    options: NormalizedTransformationOptions
): number {
    let reach = 1;
    let cost = 0;
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
            continue;
        }
        const measurement = measureEntry(entry, profiles.get(entry.graph), options);
        cost += reach * Math.max(1, estimateGraphCost(entry.graph));
        reach *= 1 - measurement.probability;
    }
    return cost;
}

/** @brief Associate nested graph identities with their admitted runtime profiles. */
function indexProfilesByGraph(
    context: SeaCurrentTransformationContext<TypeSeaCurrentRegion>
): WeakMap<Graph, SeaCurrentRegionProfile> {
    const result = new WeakMap<Graph, SeaCurrentRegionProfile>();
    for (let index = 0; index < context.regions.length; index += 1) {
        const item = context.regions[index];
        if (item !== undefined) {
            result.set(item.region.graph, item.profile);
        }
    }
    return result;
}

/** @brief Resolve selected planner candidates back to private graph directives. */
function indexSelectedDirectives(
    program: Graph,
    adapter: TypeSeaCurrentAdapter,
    plan: SeaCurrentProgramPlan,
    payloads: WeakMap<SeaCurrentTransformCandidate, TransformPayload>
): WeakMap<Graph, TransformPayload> {
    const result = new WeakMap<Graph, TransformPayload>();
    const graphByRegion = new Map(adapter.enumerateRegions(program).map((region) =>
        [region.id, region.graph] as const));
    for (let index = 0; index < plan.regions.length; index += 1) {
        const regionPlan = plan.regions[index];
        const candidate = regionPlan?.transform?.candidate;
        if (regionPlan === undefined || candidate === undefined) {
            continue;
        }
        const graph = graphByRegion.get(regionPlan.region);
        const payload = payloads.get(candidate);
        if (graph !== undefined && payload?.graph === graph) {
            result.set(graph, payload);
        }
    }
    return result;
}

/** @brief Verify that one private key permutation preserves legal run boundaries. */
function verifyObjectOrderDirective(
    graph: Graph,
    directive: ObjectOrderDirective
): boolean {
    const node = graph.nodes[directive.node];
    if (node?.tag !== NodeTag.ObjectShape || directive.keys.length !== node.entries.length) {
        return false;
    }
    const ordered = orderEntriesByKeys(scheduleObjectShapeEntries(node.entries), directive.keys);
    if (ordered === undefined) {
        return false;
    }
    for (let index = 0; index < ordered.length; index += 1) {
        const before = scheduleObjectShapeEntries(node.entries)[index];
        const after = ordered[index];
        if (before === undefined || after === undefined) {
            return false;
        }
        if (before !== after && (before.presence !== after.presence ||
            !isSchedulableObjectShapeEntry(before) ||
            !isSchedulableObjectShapeEntry(after))) {
            return false;
        }
    }
    return true;
}

/** @brief Recursively clone composite graph payloads and materialize permutations. */
function rewriteGraph(
    graph: Graph,
    directives: WeakMap<Graph, TransformPayload>,
    applied: TypeSeaCurrentAppliedTransform[],
    cache: WeakMap<Graph, Graph>,
    visited: WeakSet<Graph>
): Graph {
    const cached = cache.get(graph);
    if (cached !== undefined) {
        return cached;
    }
    if (visited.has(graph)) {
        return graph;
    }
    visited.add(graph);
    const payload = directives.get(graph);
    const orderByNode = new Map(payload?.directives.map((directive) =>
        [directive.node, directive.keys] as const));
    const nodes = new Array<GraphNode>(graph.nodes.length);
    let changed = false;
    for (let index = 0; index < graph.nodes.length; index += 1) {
        const node = graph.nodes[index];
        if (node === undefined) {
            continue;
        }
        const rewritten = rewriteNode(
            node,
            orderByNode,
            directives,
            applied,
            cache,
            visited
        );
        nodes[index] = rewritten;
        changed = rewritten !== node || changed;
    }
    if (payload !== undefined) {
        applied.push(Object.freeze({
            region: payload.region,
            candidate: payload.candidate
        }));
    }
    if (!changed) {
        visited.delete(graph);
        cache.set(graph, graph);
        return graph;
    }
    const rewritten = { nodes, entry: graph.entry, result: graph.result };
    visited.delete(graph);
    cache.set(graph, rewritten);
    return rewritten;
}

/** @brief Rewrite only nodes that own nested graph payloads. */
function rewriteNode(
    node: GraphNode,
    orderByNode: ReadonlyMap<number, readonly string[]>,
    directives: WeakMap<Graph, TransformPayload>,
    applied: TypeSeaCurrentAppliedTransform[],
    cache: WeakMap<Graph, Graph>,
    visited: WeakSet<Graph>
): GraphNode {
    switch (node.tag) {
        case NodeTag.ArrayEvery:
        case NodeTag.RecordEvery: {
            const itemGraph = rewriteGraph(
                node.itemGraph,
                directives,
                applied,
                cache,
                visited
            );
            return itemGraph === node.itemGraph ? node : { ...node, itemGraph };
        }
        case NodeTag.TupleItems: {
            const itemGraphs = rewriteGraphArray(
                node.itemGraphs,
                directives,
                applied,
                cache,
                visited
            );
            return itemGraphs === node.itemGraphs ? node : { ...node, itemGraphs };
        }
        case NodeTag.DiscriminantDispatch:
        case NodeTag.PresenceDispatch:
        case NodeTag.UnionDispatch:
        case NodeTag.PrimitiveUnion: {
            const graphs = rewriteGraphArray(
                node.graphs,
                directives,
                applied,
                cache,
                visited
            );
            return graphs === node.graphs ? node : { ...node, graphs };
        }
        case NodeTag.ObjectShape:
            return rewriteObjectShape(
                node,
                orderByNode.get(node.id),
                directives,
                applied,
                cache,
                visited
            );
        default:
            return node;
    }
}

/** @brief Rewrite child graphs and freeze one object node's selected graph order. */
function rewriteObjectShape(
    node: ObjectShapeNode,
    selectedOrder: readonly string[] | undefined,
    directives: WeakMap<Graph, TransformPayload>,
    applied: TypeSeaCurrentAppliedTransform[],
    cache: WeakMap<Graph, Graph>,
    visited: WeakSet<Graph>
): ObjectShapeNode {
    const rewrittenEntries = node.entries.map((entry): ObjectShapeEntry => {
        const graph = rewriteGraph(entry.graph, directives, applied, cache, visited);
        return graph === entry.graph ? entry : { ...entry, graph };
    });
    const baseline = scheduleObjectShapeEntries(rewrittenEntries);
    const entries = selectedOrder === undefined
        ? baseline
        : orderEntriesByKeys(baseline, selectedOrder) ?? baseline;
    const catchallGraph = node.catchallGraph === undefined
        ? undefined
        : rewriteGraph(node.catchallGraph, directives, applied, cache, visited);
    if (sameEntryVector(node.entries, entries) && catchallGraph === node.catchallGraph) {
        return node;
    }
    return {
        ...node,
        entries,
        keys: entries.map((entry) => entry.key),
        catchallGraph
    };
}

/** @brief Rewrite a child graph vector while preserving identity on no-op paths. */
function rewriteGraphArray(
    graphs: readonly Graph[],
    directives: WeakMap<Graph, TransformPayload>,
    applied: TypeSeaCurrentAppliedTransform[],
    cache: WeakMap<Graph, Graph>,
    visited: WeakSet<Graph>
): readonly Graph[] {
    const result = new Array<Graph>(graphs.length);
    let changed = false;
    for (let index = 0; index < graphs.length; index += 1) {
        const graph = graphs[index];
        if (graph === undefined) {
            continue;
        }
        const rewritten = rewriteGraph(graph, directives, applied, cache, visited);
        result[index] = rewritten;
        changed = rewritten !== graph || changed;
    }
    return changed ? result : graphs;
}

/** @brief Materialize a complete key permutation without trusting duplicate keys. */
function orderEntriesByKeys(
    entries: readonly ObjectShapeEntry[],
    keys: readonly string[]
): readonly ObjectShapeEntry[] | undefined {
    if (entries.length !== keys.length) {
        return undefined;
    }
    const byKey = new Map(entries.map((entry) => [entry.key, entry] as const));
    if (byKey.size !== entries.length) {
        return undefined;
    }
    const result = new Array<ObjectShapeEntry>(keys.length);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined) {
            return undefined;
        }
        const entry = byKey.get(key);
        if (entry === undefined) {
            return undefined;
        }
        result[index] = entry;
        byKey.delete(key);
    }
    return byKey.size === 0 ? result : undefined;
}

/** @brief Compare object-entry vectors by identity without allocating keys. */
function sameEntryVector(
    left: readonly ObjectShapeEntry[],
    right: readonly ObjectShapeEntry[]
): boolean {
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) {
            return false;
        }
    }
    return true;
}

/** @brief Normalize the minimum complete sample count. */
function normalizeMinimumSamples(value: number | undefined): number {
    return value !== undefined && Number.isSafeInteger(value) && value >= 2
        ? value
        : DEFAULT_MIN_SAMPLES;
}

/** @brief Normalize the minimum modeled work reduction. */
function normalizeImprovement(value: number | undefined): number {
    return value !== undefined && Number.isFinite(value) && value >= 0
        ? value
        : 0.01;
}
