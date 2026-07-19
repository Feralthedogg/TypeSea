/**
 * @file exact-profile.ts
 * @brief Minimum exact edge-counter planning with a maximum-weight tree.
 */

import type {
    SeaCurrentControlEdge,
    SeaCurrentControlFlowGraph,
    SeaCurrentCounterSite,
    SeaCurrentExactProfilePlan
} from "./types.js";

const VIRTUAL_PREFIX = "@seacurrent:";

/** @brief Counter-site resolver used after the tree has selected its chords. */
export type SeaCurrentCounterSiteResolver = (
    edge: SeaCurrentControlEdge
) => readonly SeaCurrentCounterSite[];

/** @brief Target-specific weight for keeping one edge uninstrumented. */
export type SeaCurrentEdgeWeightEstimator = (edge: SeaCurrentControlEdge) => number;

interface IndexedEdge {
    readonly edge: SeaCurrentControlEdge;
    readonly source: number;
    readonly destination: number;
    readonly virtual: boolean;
    readonly weight: number;
}

/**
 * @brief Build an exact edge profile from tree-complement counters.
 * @details A conceptual super-exit closes flow back to entry. Its edges carry
 * dominant tree weights, so no virtual counter can escape into the result. A
 * connected spanning-tree certificate proves rank exactly without a cubic
 * floating-point matrix elimination on very large regions.
 * @pre `graph` has passed the planner's CFG admission check.
 */
export function planExactEdgeProfile(
    graph: SeaCurrentControlFlowGraph,
    resolveSites: SeaCurrentCounterSiteResolver,
    estimateWeight: SeaCurrentEdgeWeightEstimator = defaultEdgeWeight
): SeaCurrentExactProfilePlan {
    const closed = closeFlowGraph(graph, estimateWeight);
    const ordered = closed.edges.slice().sort(compareTreeWeight);
    const sets = new DisjointSets(closed.nodeCount);
    const tree = new Set<string>();
    for (const edge of ordered) {
        if (sets.union(edge.source, edge.destination)) {
            tree.add(edge.edge.id);
        }
    }
    const connected = sets.componentCount === 1;
    const cycleRank = connected
        ? closed.edges.length - closed.nodeCount + 1
        : 0;
    const counters = [];
    for (const indexed of closed.edges) {
        if (tree.has(indexed.edge.id)) {
            continue;
        }
        if (indexed.virtual) {
            return unavailable(
                "a virtual closure edge escaped the spanning tree",
                publicTreeEdges(tree),
                counters,
                cycleRank,
                closed.nodeCount - sets.componentCount + counters.length
            );
        }
        const sites = resolveSites(indexed.edge);
        const site = cheapestSite(sites);
        if (site === undefined) {
            return unavailable(
                `edge ${indexed.edge.id} has no legal counter site`,
                publicTreeEdges(tree),
                counters,
                cycleRank,
                closed.nodeCount - sets.componentCount + counters.length
            );
        }
        counters.push({ edge: indexed.edge.id, site });
    }
    const rank = closed.nodeCount - sets.componentCount + counters.length;
    if (!connected || tree.size !== closed.nodeCount - 1) {
        return unavailable(
            "CFG shadow graph is disconnected",
            publicTreeEdges(tree),
            counters,
            cycleRank,
            rank
        );
    }
    if (counters.length !== cycleRank || rank !== closed.edges.length) {
        return unavailable(
            "tree-complement measurements do not satisfy the rank certificate",
            publicTreeEdges(tree),
            counters,
            cycleRank,
            rank
        );
    }
    return Object.freeze({
        status: "exact",
        treeEdges: Object.freeze(publicTreeEdges(tree)),
        counters: Object.freeze(counters),
        cycleRank,
        rank
    });
}

/** @brief Add one super-exit and uninstrumented closure edges. */
function closeFlowGraph(
    graph: SeaCurrentControlFlowGraph,
    estimateWeight: SeaCurrentEdgeWeightEstimator
): {
    readonly nodeCount: number;
    readonly edges: readonly IndexedEdge[];
} {
    const indexes = new Map<string, number>();
    for (let index = 0; index < graph.nodes.length; index += 1) {
        const node = graph.nodes[index];
        if (node !== undefined) {
            indexes.set(node.id, index);
        }
    }
    const superExit = graph.nodes.length;
    const entry = indexes.get(graph.entry) ?? 0;
    const edges = new Array<IndexedEdge>();
    for (const edge of graph.edges) {
        edges.push({
            edge,
            source: indexes.get(edge.source) ?? 0,
            destination: indexes.get(edge.destination) ?? 0,
            virtual: false,
            weight: finiteWeight(estimateWeight(edge)) * (1 + edge.probability)
        });
    }
    for (let index = 0; index < graph.exits.length; index += 1) {
        const exit = graph.exits[index];
        edges.push(virtualEdge(
            `${VIRTUAL_PREFIX}exit:${String(index)}`,
            indexes.get(exit ?? "") ?? 0,
            superExit
        ));
    }
    edges.push(virtualEdge(`${VIRTUAL_PREFIX}entry`, superExit, entry));
    return {
        nodeCount: graph.nodes.length + 1,
        edges
    };
}

/** @brief Default architecture-neutral edge weight. */
function defaultEdgeWeight(edge: SeaCurrentControlEdge): number {
    return edge.counterCost;
}

/** @brief Keep malformed target estimates from destabilizing Kruskal ordering. */
function finiteWeight(value: number): number {
    return Number.isFinite(value) && value >= 0 ? value : 0;
}

/** @brief Construct one closure edge that must remain in the tree. */
function virtualEdge(id: string, source: number, destination: number): IndexedEdge {
    return {
        edge: {
            id,
            source: `${VIRTUAL_PREFIX}node:${String(source)}`,
            destination: `${VIRTUAL_PREFIX}node:${String(destination)}`,
            probability: 1,
            counterCost: Number.MAX_VALUE,
            effect: "normal",
            instrumentable: false
        },
        source,
        destination,
        virtual: true,
        weight: Number.MAX_VALUE
    };
}

/** @brief Prefer expensive and hot edges in the uninstrumented tree. */
function compareTreeWeight(left: IndexedEdge, right: IndexedEdge): number {
    if (left.weight !== right.weight) {
        return right.weight - left.weight;
    }
    if (left.edge.id < right.edge.id) {
        return -1;
    }
    return left.edge.id > right.edge.id ? 1 : 0;
}

/** @brief Select the cheapest legal insertion point with a stable tie break. */
function cheapestSite(sites: readonly SeaCurrentCounterSite[]): SeaCurrentCounterSite | undefined {
    let selected: SeaCurrentCounterSite | undefined;
    for (const site of sites) {
        if (!Number.isFinite(site.cost) || site.cost < 0) {
            continue;
        }
        if (selected === undefined || site.cost < selected.cost ||
            (site.cost === selected.cost && site.id < selected.id)) {
            selected = site;
        }
    }
    return selected;
}

/** @brief Hide conceptual closure edges from adapter-facing plans. */
function publicTreeEdges(tree: ReadonlySet<string>): string[] {
    return Array.from(tree).filter((edge) => !edge.startsWith(VIRTUAL_PREFIX)).sort();
}

/** @brief Build one immutable unavailable plan. */
function unavailable(
    reason: string,
    treeEdges: readonly string[],
    counters: readonly { readonly edge: string; readonly site: SeaCurrentCounterSite }[],
    cycleRank: number,
    rank: number
): SeaCurrentExactProfilePlan {
    return Object.freeze({
        status: "unavailable",
        reason,
        treeEdges: Object.freeze(treeEdges.slice()),
        counters: Object.freeze(counters.slice()),
        cycleRank,
        rank
    });
}

/** @brief Dense union-find used by Kruskal without object-per-node allocation. */
class DisjointSets {
    readonly #parent: Int32Array;
    readonly #rank: Uint8Array;
    #components: number;

    public constructor(size: number) {
        this.#parent = new Int32Array(size);
        this.#rank = new Uint8Array(size);
        this.#components = size;
        for (let index = 0; index < size; index += 1) {
            this.#parent[index] = index;
        }
    }

    public get componentCount(): number {
        return this.#components;
    }

    public union(left: number, right: number): boolean {
        let leftRoot = this.find(left);
        let rightRoot = this.find(right);
        if (leftRoot === rightRoot) {
            return false;
        }
        const leftRank = this.#rank[leftRoot] ?? 0;
        const rightRank = this.#rank[rightRoot] ?? 0;
        if (leftRank < rightRank) {
            const swap = leftRoot;
            leftRoot = rightRoot;
            rightRoot = swap;
        }
        this.#parent[rightRoot] = leftRoot;
        if (leftRank === rightRank) {
            this.#rank[leftRoot] = leftRank + 1;
        }
        this.#components -= 1;
        return true;
    }

    private find(value: number): number {
        let root = value;
        while ((this.#parent[root] ?? root) !== root) {
            root = this.#parent[root] ?? root;
        }
        let cursor = value;
        while ((this.#parent[cursor] ?? cursor) !== root) {
            const next = this.#parent[cursor] ?? root;
            this.#parent[cursor] = root;
            cursor = next;
        }
        return root;
    }
}
