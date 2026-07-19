/**
 * @file path-profile.ts
 * @brief Selective Ball-Larus path numbering and storage planning.
 */

import type {
    SeaCurrentControlEdge,
    SeaCurrentControlFlowGraph,
    SeaCurrentPathIncrement,
    SeaCurrentPathPlan
} from "./types.js";

/**
 * @brief Number acyclic paths and choose bounded storage.
 * @details Cyclic regions fail closed to edge profiling; loop adapters should
 * split SESE acyclic fragments before invoking this routine.
 * @pre `graph` has passed the planner's CFG admission check.
 */
export function planBallLarusPaths(
    graph: SeaCurrentControlFlowGraph,
    priority: number,
    maxBuckets: number,
    selected: boolean
): SeaCurrentPathPlan {
    const topology = topologicalOrder(graph);
    if (topology === undefined) {
        return fallback(priority, "cyclic CFG requires an acyclic SESE fragment");
    }
    const limit = Math.max(1, Math.floor(maxBuckets));
    const outgoing = outgoingEdges(graph.edges);
    const counts = countPaths(graph, topology, outgoing, limit * 64 + 1);
    const pathCount = counts.get(graph.entry) ?? 0;
    if (!selected) {
        return Object.freeze({
            selected: false,
            priority,
            pathCount,
            increments: Object.freeze([]),
            storage: {
                kind: "edge-fallback" as const,
                reason: "region was outside the path-profile budget"
            }
        });
    }
    const increments = buildIncrements(graph, counts, outgoing);
    return Object.freeze({
        selected: true,
        priority,
        pathCount,
        increments: Object.freeze(increments),
        storage: chooseStorage(pathCount, limit)
    });
}

/** @brief Return a stable Kahn topological order, or undefined for a cycle. */
function topologicalOrder(graph: SeaCurrentControlFlowGraph): readonly string[] | undefined {
    const indegree = new Map<string, number>();
    const outgoing = new Map<string, string[]>();
    for (const node of graph.nodes) {
        indegree.set(node.id, 0);
        outgoing.set(node.id, []);
    }
    for (const edge of graph.edges) {
        indegree.set(edge.destination, (indegree.get(edge.destination) ?? 0) + 1);
        outgoing.get(edge.source)?.push(edge.destination);
    }
    const ready = Array.from(indegree.entries())
        .filter((entry) => entry[1] === 0)
        .map((entry) => entry[0])
        .sort();
    const result: string[] = [];
    for (let cursor = 0; cursor < ready.length; cursor += 1) {
        const node = ready[cursor];
        if (node === undefined) {
            continue;
        }
        result.push(node);
        const destinations = outgoing.get(node) ?? [];
        destinations.sort();
        for (const destination of destinations) {
            const next = (indegree.get(destination) ?? 1) - 1;
            indegree.set(destination, next);
            if (next === 0) {
                ready.push(destination);
            }
        }
    }
    return result.length === graph.nodes.length ? result : undefined;
}

/** @brief Dynamic-programming path counts capped before integer explosion. */
function countPaths(
    graph: SeaCurrentControlFlowGraph,
    topology: readonly string[],
    outgoing: ReadonlyMap<string, readonly SeaCurrentControlEdge[]>,
    cap: number
): ReadonlyMap<string, number> {
    const exits = new Set(graph.exits);
    const counts = new Map<string, number>();
    for (let index = topology.length - 1; index >= 0; index -= 1) {
        const node = topology[index];
        if (node === undefined) {
            continue;
        }
        if (exits.has(node)) {
            counts.set(node, 1);
            continue;
        }
        let count = 0;
        for (const edge of outgoing.get(node) ?? []) {
            count = Math.min(cap, count + (counts.get(edge.destination) ?? 0));
        }
        counts.set(node, count);
    }
    return counts;
}

/** @brief Assign Ball-Larus increments in deterministic edge order. */
function buildIncrements(
    graph: SeaCurrentControlFlowGraph,
    counts: ReadonlyMap<string, number>,
    outgoing: ReadonlyMap<string, readonly SeaCurrentControlEdge[]>
): SeaCurrentPathIncrement[] {
    const increments: SeaCurrentPathIncrement[] = [];
    for (const node of graph.nodes) {
        let offset = 0;
        for (const edge of outgoing.get(node.id) ?? []) {
            increments.push({ edge: edge.id, increment: offset });
            offset += counts.get(edge.destination) ?? 0;
        }
    }
    return increments;
}

/** @brief Group and sort outgoing edges so numbering is reproducible. */
function outgoingEdges(
    edges: readonly SeaCurrentControlEdge[]
): ReadonlyMap<string, SeaCurrentControlEdge[]> {
    const outgoing = new Map<string, SeaCurrentControlEdge[]>();
    for (const edge of edges) {
        const bucket = outgoing.get(edge.source);
        if (bucket === undefined) {
            outgoing.set(edge.source, [edge]);
        } else {
            bucket.push(edge);
        }
    }
    for (const bucket of outgoing.values()) {
        bucket.sort((left, right) => left.id.localeCompare(right.id));
    }
    return outgoing;
}

/** @brief Bound memory while preserving exact numbering when practical. */
function chooseStorage(pathCount: number, maxBuckets: number): SeaCurrentPathPlan["storage"] {
    if (pathCount <= maxBuckets) {
        return { kind: "exact", buckets: Math.max(1, pathCount) };
    }
    if (pathCount <= maxBuckets * 64) {
        return { kind: "sparse", capacity: maxBuckets };
    }
    return {
        kind: "count-min",
        width: nextPowerOfTwo(maxBuckets * 2),
        depth: 4
    };
}

/** @brief Round a positive integer to a bounded power of two. */
function nextPowerOfTwo(value: number): number {
    let result = 1;
    const limit = Math.min(1 << 30, Math.max(1, Math.floor(value)));
    while (result < limit) {
        result *= 2;
    }
    return result;
}

/** @brief Build an immutable path fallback. */
function fallback(priority: number, reason: string): SeaCurrentPathPlan {
    return Object.freeze({
        selected: false,
        priority,
        pathCount: 0,
        increments: Object.freeze([]),
        storage: { kind: "edge-fallback" as const, reason }
    });
}
