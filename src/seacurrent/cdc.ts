/**
 * @file cdc.ts
 * @brief Bounded cycle-double-cover search and independent verification.
 */

import type {
    SeaCurrentChecksumPlan,
    SeaCurrentChecksumTerm,
    SeaCurrentControlEdge,
    SeaCurrentControlFlowGraph,
    SeaCurrentCoverPlan,
    SeaCurrentCycle
} from "./types.js";

const CDC_LABELS = 8;
const CHECKSUM_MODULUS = 2_147_483_647;

interface ShadowEdge {
    readonly index: number;
    readonly edge: SeaCurrentControlEdge;
    readonly source: number;
    readonly destination: number;
}

interface CycleCandidate {
    readonly edges: readonly number[];
    readonly key: string;
}

interface CdcSearchBudget {
    remaining: number;
}

/**
 * @brief Search for a CDC certificate within explicit work limits.
 * @details The search is deliberately incomplete. Failure disables checksums;
 * no unverified cover can influence profiling or transformation decisions.
 * @pre `graph` has passed the planner's CFG admission check.
 */
export function planSeaCurrentCover(
    graph: SeaCurrentControlFlowGraph,
    maxSearchSteps: number,
    maxCycles: number
): SeaCurrentCoverPlan {
    const shadow = buildShadow(graph);
    const bridgeIndexes = findBridges(graph.nodes.length, shadow);
    const covered = shadow
        .filter((edge) => !bridgeIndexes.has(edge.index))
        .map((edge, index): ShadowEdge => ({ ...edge, index }));
    const coveredIds = covered.map((edge) => edge.edge.id).sort();
    if (covered.length === 0) {
        return Object.freeze({
            status: "verified",
            cycles: Object.freeze([]),
            coveredEdges: Object.freeze([])
        });
    }
    const searchBudget: CdcSearchBudget = {
        remaining: Math.max(1, Math.floor(maxSearchSteps))
    };
    const candidates = enumerateCandidates(
        graph.nodes.length,
        covered,
        Math.max(1, Math.floor(maxCycles)),
        searchBudget
    );
    const selected = selectDoubleCover(
        covered,
        candidates,
        searchBudget.remaining,
        Math.max(1, Math.floor(maxCycles))
    );
    if (selected === undefined) {
        return unavailable("bounded CDC search found no exact double cover", coveredIds);
    }
    const labels = colorCycles(selected, CDC_LABELS);
    if (labels === undefined) {
        return unavailable("CDC candidate requires more than eight conflict layers", coveredIds);
    }
    const cycles = selected.map((candidate, index): SeaCurrentCycle => ({
        label: labels[index] ?? 0,
        edges: Object.freeze(candidate.edges.map((edge) => covered[edge]?.edge.id ?? ""))
    }));
    const result: SeaCurrentCoverPlan = Object.freeze({
        status: "verified",
        cycles: Object.freeze(cycles),
        coveredEdges: Object.freeze(coveredIds)
    });
    const verified = verifySeaCurrentCover(graph, result);
    return verified.ok ? result : unavailable(verified.reason, coveredIds);
}

/** @brief Result of independently checking a supplied CDC certificate. */
export type SeaCurrentCoverVerification =
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: string };

/**
 * @brief Verify cycle connectivity, degree, labels, and exact edge multiplicity.
 * @details Directed edge ids are never reconstructed from endpoint pairs; this
 * preserves direction and provenance even though the shadow search is undirected.
 */
export function verifySeaCurrentCover(
    graph: SeaCurrentControlFlowGraph,
    cover: SeaCurrentCoverPlan
): SeaCurrentCoverVerification {
    if (cover.status !== "verified") {
        return { ok: false, reason: cover.reason };
    }
    const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
    const counts = new Map<string, number>();
    const labels = new Map<string, Set<number>>();
    for (const cycle of cover.cycles) {
        if (!Number.isSafeInteger(cycle.label) || cycle.label < 0 || cycle.label >= CDC_LABELS) {
            return { ok: false, reason: "CDC cycle has an invalid layer label" };
        }
        if (cycle.edges.length < 2 || new Set(cycle.edges).size !== cycle.edges.length) {
            return { ok: false, reason: "CDC cycle must contain distinct graph edges" };
        }
        const degree = new Map<string, number>();
        for (const edgeId of cycle.edges) {
            const edge = edgeById.get(edgeId);
            if (edge === undefined) {
                return { ok: false, reason: `CDC references unknown edge ${edgeId}` };
            }
            degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
            degree.set(edge.destination, (degree.get(edge.destination) ?? 0) + 1);
            counts.set(edgeId, (counts.get(edgeId) ?? 0) + 1);
            const edgeLabels = labels.get(edgeId) ?? new Set<number>();
            edgeLabels.add(cycle.label);
            labels.set(edgeId, edgeLabels);
        }
        for (const value of degree.values()) {
            if (value !== 2) {
                return { ok: false, reason: "CDC cycle is not a connected degree-two subgraph" };
            }
        }
        if (!cycleIsConnected(cycle, edgeById)) {
            return { ok: false, reason: "CDC cycle contains disconnected components" };
        }
    }
    const covered = new Set(cover.coveredEdges);
    for (const edgeId of covered) {
        if ((counts.get(edgeId) ?? 0) !== 2 || (labels.get(edgeId)?.size ?? 0) !== 2) {
            return { ok: false, reason: `CDC edge ${edgeId} is not covered in two distinct layers` };
        }
    }
    for (const edgeId of counts.keys()) {
        if (!covered.has(edgeId)) {
            return { ok: false, reason: `CDC cycle includes undeclared edge ${edgeId}` };
        }
    }
    return { ok: true };
}

/** @brief Derive deterministic checksum coefficients from a verified cover. */
export function makeSeaCurrentChecksumPlan(cover: SeaCurrentCoverPlan): SeaCurrentChecksumPlan | undefined {
    if (cover.status !== "verified" || cover.cycles.length === 0) {
        return undefined;
    }
    const terms: SeaCurrentChecksumTerm[] = [];
    for (const cycle of cover.cycles) {
        for (const edge of cycle.edges) {
            terms.push({
                edge,
                label: cycle.label,
                coefficient: 1 + (stableHash(`${edge}:${String(cycle.label)}`) % (CHECKSUM_MODULUS - 1))
            });
        }
    }
    terms.sort((left, right) => left.label - right.label || left.edge.localeCompare(right.edge));
    return Object.freeze({
        modulus: CHECKSUM_MODULUS,
        terms: Object.freeze(terms)
    });
}

/** @brief Convert directed edges to indexed undirected shadow edges. */
function buildShadow(graph: SeaCurrentControlFlowGraph): readonly ShadowEdge[] {
    const nodes = new Map<string, number>();
    for (let index = 0; index < graph.nodes.length; index += 1) {
        const node = graph.nodes[index];
        if (node !== undefined) {
            nodes.set(node.id, index);
        }
    }
    return graph.edges.map((edge, index) => ({
        index,
        edge,
        source: nodes.get(edge.source) ?? 0,
        destination: nodes.get(edge.destination) ?? 0
    }));
}

/** @brief Tarjan bridge search over edge-indexed undirected adjacency. */
function findBridges(nodeCount: number, edges: readonly ShadowEdge[]): ReadonlySet<number> {
    const adjacency = new Array<number[]>(nodeCount);
    for (let index = 0; index < nodeCount; index += 1) {
        adjacency[index] = [];
    }
    for (const edge of edges) {
        adjacency[edge.source]?.push(edge.index);
        adjacency[edge.destination]?.push(edge.index);
    }
    const discovery = new Int32Array(nodeCount);
    discovery.fill(-1);
    const low = new Int32Array(nodeCount);
    const parentNode = new Int32Array(nodeCount);
    parentNode.fill(-1);
    const parentEdge = new Int32Array(nodeCount);
    parentEdge.fill(-1);
    const cursor = new Int32Array(nodeCount);
    const stack = new Int32Array(nodeCount);
    const bridges = new Set<number>();
    let clock = 0;

    for (let root = 0; root < nodeCount; root += 1) {
        if ((discovery[root] ?? -1) !== -1) {
            continue;
        }
        let depth = 0;
        stack[depth] = root;
        depth += 1;
        discovery[root] = clock;
        low[root] = clock;
        clock += 1;
        while (depth > 0) {
            const node = stack[depth - 1] ?? root;
            const incident = adjacency[node] ?? [];
            const position = cursor[node] ?? 0;
            if (position < incident.length) {
                const edgeIndex = incident[position];
                cursor[node] = position + 1;
                if (edgeIndex === (parentEdge[node] ?? -1)) {
                    continue;
                }
                const edge = edges[edgeIndex ?? -1];
                if (edge === undefined) {
                    continue;
                }
                const next = edge.source === node ? edge.destination : edge.source;
                if ((discovery[next] ?? -1) === -1) {
                    parentNode[next] = node;
                    parentEdge[next] = edge.index;
                    discovery[next] = clock;
                    low[next] = clock;
                    clock += 1;
                    stack[depth] = next;
                    depth += 1;
                } else {
                    low[node] = Math.min(low[node] ?? 0, discovery[next] ?? 0);
                }
                continue;
            }
            depth -= 1;
            const parent = parentNode[node] ?? -1;
            if (parent < 0) {
                continue;
            }
            low[parent] = Math.min(low[parent] ?? 0, low[node] ?? 0);
            if ((low[node] ?? 0) > (discovery[parent] ?? 0)) {
                bridges.add(parentEdge[node] ?? -1);
            }
        }
    }
    return bridges;
}

/** @brief Generate one shortest simple cycle per non-bridge edge. */
function enumerateCandidates(
    nodeCount: number,
    edges: readonly ShadowEdge[],
    maxCycles: number,
    budget: CdcSearchBudget
): readonly CycleCandidate[] {
    const candidates = new Map<string, CycleCandidate>();
    for (let excluded = 0;
        excluded < edges.length && candidates.size < maxCycles && budget.remaining > 0;
        excluded += 1) {
        const edge = edges[excluded];
        if (edge === undefined) {
            continue;
        }
        const path = shortestPath(
            nodeCount,
            edges,
            edge.source,
            edge.destination,
            excluded,
            budget
        );
        if (path === undefined) {
            continue;
        }
        const cycleEdges = path.concat(excluded).sort((left, right) => left - right);
        const key = cycleEdges.join(",");
        candidates.set(key, { edges: cycleEdges, key });
    }
    return Array.from(candidates.values()).sort((left, right) => left.key.localeCompare(right.key));
}

/** @brief BFS path in the shadow graph with one edge removed. */
function shortestPath(
    nodeCount: number,
    edges: readonly ShadowEdge[],
    source: number,
    destination: number,
    excluded: number,
    budget: CdcSearchBudget
): number[] | undefined {
    const adjacency = new Array<number[]>(nodeCount);
    for (let index = 0; index < nodeCount; index += 1) {
        adjacency[index] = [];
    }
    for (let index = 0; index < edges.length; index += 1) {
        if (!consumeSearchStep(budget)) {
            return undefined;
        }
        if (index === excluded) {
            continue;
        }
        const edge = edges[index];
        if (edge !== undefined) {
            adjacency[edge.source]?.push(index);
            adjacency[edge.destination]?.push(index);
        }
    }
    const previousNode = new Int32Array(nodeCount);
    const previousEdge = new Int32Array(nodeCount);
    previousNode.fill(-1);
    previousEdge.fill(-1);
    const queue = new Int32Array(nodeCount);
    let head = 0;
    let tail = 0;
    queue[tail] = source;
    tail += 1;
    previousNode[source] = source;
    while (head < tail) {
        const node = queue[head] ?? source;
        head += 1;
        if (node === destination) {
            break;
        }
        for (const edgeIndex of adjacency[node] ?? []) {
            if (!consumeSearchStep(budget)) {
                return undefined;
            }
            const edge = edges[edgeIndex];
            if (edge === undefined) {
                continue;
            }
            const next = edge.source === node ? edge.destination : edge.source;
            if ((previousNode[next] ?? -1) !== -1) {
                continue;
            }
            previousNode[next] = node;
            previousEdge[next] = edgeIndex;
            queue[tail] = next;
            tail += 1;
        }
    }
    if ((previousNode[destination] ?? -1) === -1) {
        return undefined;
    }
    const path: number[] = [];
    let cursor = destination;
    while (cursor !== source) {
        const edgeIndex = previousEdge[cursor] ?? -1;
        if (edgeIndex < 0) {
            return undefined;
        }
        path.push(edgeIndex);
        cursor = previousNode[cursor] ?? source;
    }
    return path;
}

/** @brief Consume one shared candidate-generation or backtracking work unit. */
function consumeSearchStep(budget: CdcSearchBudget): boolean {
    if (budget.remaining <= 0) {
        return false;
    }
    budget.remaining -= 1;
    return true;
}

/** @brief Bounded exact-cover search with target multiplicity two per edge. */
function selectDoubleCover(
    edges: readonly ShadowEdge[],
    candidates: readonly CycleCandidate[],
    maxSteps: number,
    maxCycles: number
): readonly CycleCandidate[] | undefined {
    const containing = new Array<number[]>(edges.length);
    for (let edge = 0; edge < edges.length; edge += 1) {
        containing[edge] = [];
    }
    candidates.forEach((candidate, index) => {
        for (const edge of candidate.edges) {
            containing[edge]?.push(index);
        }
    });
    const counts = new Uint8Array(edges.length);
    const selected: CycleCandidate[] = [];
    const frames: {
        readonly choices: readonly number[];
        cursor: number;
        applied: number;
    }[] = [];
    let steps = 0;

    while (steps < maxSteps) {
        steps += 1;
        const target = nextCoverTarget(counts, containing);
        if (target === -1) {
            return selected.slice();
        }
        if (selected.length < maxCycles) {
            const frame = {
                choices: containing[target] ?? [],
                cursor: 0,
                applied: -1
            };
            frames.push(frame);
            if (advanceCoverFrame(frame, candidates, counts, selected)) {
                continue;
            }
            frames.pop();
        }
        if (!rewindCoverFrames(frames, candidates, counts, selected)) {
            return undefined;
        }
    }
    return undefined;
}

/** @brief Select the uncovered edge with the smallest candidate set. */
function nextCoverTarget(
    counts: Uint8Array,
    containing: readonly (readonly number[])[]
): number {
    let target = -1;
    let choices = Number.MAX_SAFE_INTEGER;
    for (let edge = 0; edge < counts.length; edge += 1) {
        if ((counts[edge] ?? 0) >= 2) {
            continue;
        }
        const count = containing[edge]?.length ?? 0;
        if (count < choices) {
            target = edge;
            choices = count;
        }
    }
    return target;
}

/** @brief Apply the next legal candidate represented by one backtracking frame. */
function advanceCoverFrame(
    frame: { readonly choices: readonly number[]; cursor: number; applied: number },
    candidates: readonly CycleCandidate[],
    counts: Uint8Array,
    selected: CycleCandidate[]
): boolean {
    while (frame.cursor < frame.choices.length) {
        const candidateIndex = frame.choices[frame.cursor];
        frame.cursor += 1;
        const candidate = candidates[candidateIndex ?? -1];
        if (candidate === undefined || candidate.edges.some((edge) => (counts[edge] ?? 0) >= 2)) {
            continue;
        }
        frame.applied = candidateIndex ?? -1;
        selected.push(candidate);
        for (const edge of candidate.edges) {
            counts[edge] = (counts[edge] ?? 0) + 1;
        }
        return true;
    }
    return false;
}

/** @brief Undo exhausted decisions until another legal branch is available. */
function rewindCoverFrames(
    frames: { readonly choices: readonly number[]; cursor: number; applied: number }[],
    candidates: readonly CycleCandidate[],
    counts: Uint8Array,
    selected: CycleCandidate[]
): boolean {
    while (frames.length > 0) {
        const frame = frames[frames.length - 1];
        if (frame === undefined) {
            return false;
        }
        if (frame.applied >= 0) {
            const candidate = candidates[frame.applied];
            if (candidate !== undefined) {
                for (const edge of candidate.edges) {
                    counts[edge] = (counts[edge] ?? 1) - 1;
                }
            }
            selected.pop();
            frame.applied = -1;
        }
        if (advanceCoverFrame(frame, candidates, counts, selected)) {
            return true;
        }
        frames.pop();
    }
    return false;
}

/** @brief Greedily color overlaps; failure leaves CDC disabled. */
function colorCycles(cycles: readonly CycleCandidate[], maxLabels: number): readonly number[] | undefined {
    const order = cycles.map((_, index) => index).sort((left, right) =>
        conflictCount(cycles, right) - conflictCount(cycles, left));
    const labels = new Int8Array(cycles.length);
    labels.fill(-1);
    for (const cycleIndex of order) {
        let assigned = false;
        for (let label = 0; label < maxLabels; label += 1) {
            if (hasLabelConflict(cycles, labels, cycleIndex, label)) {
                continue;
            }
            labels[cycleIndex] = label;
            assigned = true;
            break;
        }
        if (!assigned) {
            return undefined;
        }
    }
    return Array.from(labels);
}

/** @brief Count cycle intersections for stable most-constrained-first coloring. */
function conflictCount(cycles: readonly CycleCandidate[], index: number): number {
    let count = 0;
    for (let other = 0; other < cycles.length; other += 1) {
        if (other !== index && cyclesOverlap(cycles[index], cycles[other])) {
            count += 1;
        }
    }
    return count;
}

/** @brief Check whether one proposed label conflicts on a shared edge. */
function hasLabelConflict(
    cycles: readonly CycleCandidate[],
    labels: Int8Array,
    index: number,
    label: number
): boolean {
    for (let other = 0; other < cycles.length; other += 1) {
        if ((labels[other] ?? -1) === label && cyclesOverlap(cycles[index], cycles[other])) {
            return true;
        }
    }
    return false;
}

/** @brief Test cycle intersection without allocating temporary sets. */
function cyclesOverlap(
    left: CycleCandidate | undefined,
    right: CycleCandidate | undefined
): boolean {
    if (left === undefined || right === undefined) {
        return false;
    }
    for (const edge of left.edges) {
        if (right.edges.includes(edge)) {
            return true;
        }
    }
    return false;
}

/** @brief Verify that degree-two cycle edges form one connected component. */
function cycleIsConnected(
    cycle: SeaCurrentCycle,
    edgeById: ReadonlyMap<string, SeaCurrentControlEdge>
): boolean {
    const first = edgeById.get(cycle.edges[0] ?? "");
    if (first === undefined) {
        return false;
    }
    const adjacency = new Map<string, string[]>();
    for (const edgeId of cycle.edges) {
        const edge = edgeById.get(edgeId);
        if (edge === undefined) {
            return false;
        }
        const sourceEdges = adjacency.get(edge.source) ?? [];
        sourceEdges.push(edgeId);
        adjacency.set(edge.source, sourceEdges);
        const destinationEdges = adjacency.get(edge.destination) ?? [];
        destinationEdges.push(edgeId);
        adjacency.set(edge.destination, destinationEdges);
    }
    const visitedVertices = new Set<string>();
    const visitedEdges = new Set<string>();
    const stack = [first.source];
    while (stack.length > 0) {
        const vertex = stack.pop();
        if (vertex === undefined || visitedVertices.has(vertex)) {
            continue;
        }
        visitedVertices.add(vertex);
        for (const edgeId of adjacency.get(vertex) ?? []) {
            visitedEdges.add(edgeId);
            const edge = edgeById.get(edgeId);
            if (edge !== undefined) {
                stack.push(edge.source === vertex ? edge.destination : edge.source);
            }
        }
    }
    return visitedEdges.size === cycle.edges.length;
}

/** @brief Stable 32-bit FNV-1a hash for reproducible checksum coefficients. */
function stableHash(value: string): number {
    let hash = 2_166_136_261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16_777_619) >>> 0;
    }
    return hash;
}

/** @brief Construct one immutable CDC fallback. */
function unavailable(reason: string, coveredEdges: readonly string[]): SeaCurrentCoverPlan {
    return Object.freeze({
        status: "unavailable",
        reason,
        cycles: Object.freeze([]),
        coveredEdges: Object.freeze(coveredEdges.slice())
    });
}
