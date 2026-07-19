/**
 * @file typesea-adapter.ts
 * @brief TypeSea Sea-of-Nodes adapter for the universal SeaCurrent planner.
 */

import { NodeTag } from "../kind/index.js";
import {
    appendControlPath,
    ROOT_CONTROL_PATH
} from "../compile/control-path.js";
import type {
    Graph,
    GraphNode,
    NodeId
} from "../ir/index.js";
import type {
    SeaCurrentControlEdge,
    SeaCurrentControlFlowGraph,
    SeaCurrentCounterSite,
    SeaCurrentDependenceGraph,
    SeaCurrentGraphAdapter,
    SeaCurrentOperation,
    SeaCurrentResourceUse,
    SeaCurrentTargetModel,
    SeaCurrentTransformCandidate
} from "./types.js";

/** @brief One graph region discovered from a root and its nested child graphs. */
export interface TypeSeaCurrentRegion {
    readonly id: string;
    readonly graph: Graph;
}

/** @brief Static assumptions used only for planning cost, never correctness. */
export interface TypeSeaCurrentAdapterOptions {
    readonly predicateSuccessProbability?: number | undefined;
    readonly counterCost?: number | undefined;
    readonly maxExpandedNodes?: number | undefined;
}

/** @brief One path-stable atomic predicate in a TypeSea control program. */
export interface TypeSeaCurrentControlBranch {
    readonly path: string;
    readonly node: NodeId;
    readonly trueEdge: string;
    readonly falseEdge: string;
}

/**
 * @brief Shared control representation consumed by planning and instrumentation.
 * @details The CFG remains adapter-independent while branch paths preserve the
 * exact structured short-circuit locations used by the predicate emitter.
 */
export interface TypeSeaCurrentControlProgram {
    readonly cfg: SeaCurrentControlFlowGraph;
    readonly entryEdge: string;
    readonly branches: readonly TypeSeaCurrentControlBranch[];
}

interface NormalizedTypeSeaAdapterOptions {
    readonly predicateSuccessProbability: number;
    readonly counterCost: number;
    readonly maxExpandedNodes: number;
}

interface ControlBuildState {
    readonly graph: Graph;
    readonly nodes: { readonly id: string }[];
    readonly edges: SeaCurrentControlEdge[];
    readonly branches: TypeSeaCurrentControlBranch[];
    readonly options: NormalizedTypeSeaAdapterOptions;
}

/**
 * @brief Adapt TypeSea predicate graphs without changing runtime compilation.
 * @details Boolean folds become a continuation CFG matching emitter short
 * circuit order. Composite loops and dispatches remain atomic branch sites;
 * their child graphs are independently enumerated as incremental regions.
 */
export class TypeSeaCurrentAdapter implements SeaCurrentGraphAdapter<Graph, TypeSeaCurrentRegion> {
    public readonly key = "typesea-sea-of-nodes-v1";
    readonly #options: NormalizedTypeSeaAdapterOptions;
    readonly #functionIds = new WeakMap<object, number>();
    readonly #graphHashes = new WeakMap<Graph, string>();
    readonly #controlPrograms = new WeakMap<Graph, TypeSeaCurrentControlProgram>();
    #nextFunctionId = 1;

    public constructor(options: TypeSeaCurrentAdapterOptions = {}) {
        this.#options = Object.freeze({
            predicateSuccessProbability: boundedProbability(
                options.predicateSuccessProbability ?? 0.95
            ),
            counterCost: finiteNonNegative(options.counterCost ?? 1),
            maxExpandedNodes: Math.max(8, Math.floor(options.maxExpandedNodes ?? 16_384))
        });
    }

    /** @brief Enumerate the root and each identity-distinct nested child graph. */
    public enumerateRegions(program: Graph): readonly TypeSeaCurrentRegion[] {
        const regions: TypeSeaCurrentRegion[] = [];
        const seen = new WeakSet<object>();
        const visit = (graph: Graph, id: string): void => {
            if (seen.has(graph)) {
                return;
            }
            seen.add(graph);
            regions.push(Object.freeze({ id, graph }));
            let childIndex = 0;
            for (const node of graph.nodes) {
                for (const child of childGraphs(node)) {
                    visit(child, `${id}/child:${String(childIndex)}`);
                    childIndex += 1;
                }
            }
        };
        visit(program, "root");
        return Object.freeze(regions);
    }

    /** @brief Return the traversal-stable region id assigned by enumeration. */
    public regionId(region: TypeSeaCurrentRegion): string {
        return region.id;
    }

    /**
     * @brief Hash graph structure without invoking accessors or serializing code.
     * @details Function-valued opaque checks receive process-local identities;
     * replacing such a callback therefore forces a conservative cache miss.
     */
    public structuralHash(region: TypeSeaCurrentRegion): string {
        const cached = this.#graphHashes.get(region.graph);
        if (cached !== undefined) {
            return cached;
        }
        const hasher = new StructuralHasher(this.#functionIds, (): number => {
            const id = this.#nextFunctionId;
            this.#nextFunctionId += 1;
            return id;
        });
        const hash = hasher.hash(region.graph);
        this.#graphHashes.set(region.graph, hash);
        return hash;
    }

    /** @brief Build a continuation CFG matching TypeSea boolean short circuit. */
    public buildCFG(region: TypeSeaCurrentRegion): SeaCurrentControlFlowGraph {
        return this.controlProgram(region).cfg;
    }

    /**
     * @brief Build or reuse the path-stable control program for one graph.
     * @returns CFG plus exact emitter paths for every atomic predicate branch.
     */
    public controlProgram(region: TypeSeaCurrentRegion): TypeSeaCurrentControlProgram {
        const cached = this.#controlPrograms.get(region.graph);
        if (cached !== undefined) {
            return cached;
        }
        const state: ControlBuildState = {
            graph: region.graph,
            nodes: [{ id: "entry" }, { id: "accept" }, { id: "reject" }],
            edges: [],
            branches: [],
            options: this.#options
        };
        const first = emitControl(
            state,
            region.graph.result,
            "accept",
            "reject",
            0,
            ROOT_CONTROL_PATH
        );
        const entryEdge = pushEdge(state, "entry", first, "entry", 1);
        const cfg = Object.freeze({
            nodes: Object.freeze(state.nodes),
            edges: Object.freeze(state.edges),
            entry: "entry",
            exits: Object.freeze(["accept", "reject"])
        });
        const program = Object.freeze({
            cfg,
            entryEdge: entryEdge.id,
            branches: Object.freeze(state.branches)
        });
        this.#controlPrograms.set(region.graph, program);
        return program;
    }

    /** @brief Preserve every directed graph dependency as an operation edge. */
    public buildDependenceGraph(region: TypeSeaCurrentRegion): SeaCurrentDependenceGraph {
        const operations = region.graph.nodes.map((node) => Object.freeze({
            id: `n:${String(node.id)}`,
            opcode: nodeOpcode(node)
        }));
        const dependences = [];
        for (const node of region.graph.nodes) {
            for (const dependency of node.deps) {
                dependences.push(Object.freeze({
                    source: `n:${String(dependency)}`,
                    destination: `n:${String(node.id)}`,
                    kind: node.tag === NodeTag.And || node.tag === NodeTag.Or
                        ? "control" as const
                        : "raw" as const,
                    latency: operationLatency(node),
                    distance: 0,
                    confidence: 1,
                    reorderable: node.tag !== NodeTag.SchemaCheck &&
                        node.tag !== NodeTag.ArrayEvery &&
                        node.tag !== NodeTag.RecordEvery
                }));
            }
        }
        return Object.freeze({
            operations: Object.freeze(operations),
            dependences: Object.freeze(dependences)
        });
    }

    /** @brief Return a logical emitter site for future counter lowering. */
    public legalCounterSites(
        region: TypeSeaCurrentRegion,
        edge: SeaCurrentControlEdge
    ): readonly SeaCurrentCounterSite[] {
        return Object.freeze([Object.freeze({
            id: `${region.id}:before:${edge.destination}`,
            edge: edge.id,
            cost: edge.counterCost
        })]);
    }
}

/** @brief Create the default adapter without importing it from TypeSea's root. */
export function createTypeSeaCurrentAdapter(
    options?: TypeSeaCurrentAdapterOptions
): TypeSeaCurrentAdapter {
    return new TypeSeaCurrentAdapter(options);
}

/**
 * @brief Abstract V8 target for profile selection without machine scheduling.
 * @details V8 owns instruction scheduling and register allocation, so this
 * model deliberately disables modulo scheduling while retaining branch costs.
 */
export function createTypeSeaV8TargetModel(key = "v8-generic"): SeaCurrentTargetModel {
    const noResources: readonly SeaCurrentResourceUse[] = Object.freeze([]);
    return Object.freeze({
        key,
        supportsScheduling: false,
        operationLatency: (operation: SeaCurrentOperation): number =>
            operation.opcode.includes("regex") || operation.opcode.includes("schema") ? 8 : 1,
        resources: (): readonly SeaCurrentResourceUse[] => noResources,
        resourceCapacity: (): number => Number.MAX_SAFE_INTEGER,
        branchCost: (edge: SeaCurrentControlEdge): number => edge.counterCost,
        codeSizeCost: (candidate: SeaCurrentTransformCandidate): number => candidate.sizeIncrease,
        registerPressure: (): number => 0,
        registerCapacity: (): number => Number.MAX_SAFE_INTEGER
    });
}

/** @brief Expand one boolean expression into true/false continuations. */
function emitControl(
    state: ControlBuildState,
    nodeId: NodeId,
    onTrue: string,
    onFalse: string,
    depth: number,
    path: string
): string {
    const node = state.graph.nodes[nodeId];
    if (node === undefined || depth >= state.options.maxExpandedNodes) {
        return emitLeaf(state, nodeId, onTrue, onFalse, "opaque", path);
    }
    if (node.tag === NodeTag.Return) {
        return emitControl(state, node.value, onTrue, onFalse, depth + 1, path);
    }
    if (node.tag === NodeTag.Const) {
        return node.value === true ? onTrue : onFalse;
    }
    if (node.tag === NodeTag.Not) {
        return emitControl(
            state,
            node.value,
            onFalse,
            onTrue,
            depth + 1,
            appendControlPath(path, "n")
        );
    }
    if (node.tag === NodeTag.And) {
        let continuation = onTrue;
        for (let index = node.values.length - 1; index >= 0; index -= 1) {
            const value = node.values[index];
            if (value !== undefined) {
                continuation = emitControl(
                    state,
                    value,
                    continuation,
                    onFalse,
                    depth + 1,
                    appendControlPath(path, "a", index)
                );
            }
        }
        return continuation;
    }
    if (node.tag === NodeTag.Or) {
        let continuation = onFalse;
        for (let index = node.values.length - 1; index >= 0; index -= 1) {
            const value = node.values[index];
            if (value !== undefined) {
                continuation = emitControl(
                    state,
                    value,
                    onTrue,
                    continuation,
                    depth + 1,
                    appendControlPath(path, "o", index)
                );
            }
        }
        return continuation;
    }
    return emitLeaf(state, nodeId, onTrue, onFalse, nodeOpcode(node), path);
}

/** @brief Materialize one atomic predicate branch. */
function emitLeaf(
    state: ControlBuildState,
    nodeId: NodeId,
    onTrue: string,
    onFalse: string,
    opcode: string,
    path: string
): string {
    const id = `op:${String(nodeId)}:${path}:${opcode}`;
    state.nodes.push({ id });
    const trueEdge = pushEdge(
        state,
        id,
        onTrue,
        "true",
        state.options.predicateSuccessProbability
    );
    const falseEdge = pushEdge(
        state,
        id,
        onFalse,
        "false",
        1 - state.options.predicateSuccessProbability
    );
    state.branches.push(Object.freeze({
        path,
        node: nodeId,
        trueEdge: trueEdge.id,
        falseEdge: falseEdge.id
    }));
    return id;
}

/** @brief Append one stable directed control edge. */
function pushEdge(
    state: ControlBuildState,
    source: string,
    destination: string,
    predicate: string,
    probability: number
): SeaCurrentControlEdge {
    const id = `e:${String(state.edges.length)}:${source}->${destination}`;
    const edge = Object.freeze({
        id,
        source,
        destination,
        probability,
        counterCost: state.options.counterCost,
        effect: "normal",
        predicate,
        instrumentable: true
    });
    state.edges.push(edge);
    return edge;
}

/** @brief Enumerate embedded graphs without reading opaque schemas. */
function childGraphs(node: GraphNode): readonly Graph[] {
    switch (node.tag) {
        case NodeTag.ArrayEvery:
        case NodeTag.RecordEvery:
            return [node.itemGraph];
        case NodeTag.TupleItems:
            return node.itemGraphs;
        case NodeTag.DiscriminantDispatch:
        case NodeTag.PresenceDispatch:
        case NodeTag.UnionDispatch:
        case NodeTag.PrimitiveUnion:
            return node.graphs;
        case NodeTag.ObjectShape: {
            const graphs = node.entries.map((entry) => entry.graph);
            if (node.catchallGraph !== undefined) {
                graphs.push(node.catchallGraph);
            }
            return graphs;
        }
        default:
            return [];
    }
}

/** @brief Stable operation name used by target models and diagnostics. */
function nodeOpcode(node: GraphNode): string {
    switch (node.tag) {
        case NodeTag.Regex:
            return "regex";
        case NodeTag.SchemaCheck:
            return "schema-check";
        case NodeTag.ArrayEvery:
            return "array-every";
        case NodeTag.TupleItems:
            return "tuple-items";
        case NodeTag.RecordEvery:
            return "record-every";
        case NodeTag.ObjectShape:
            return "object-shape";
        case NodeTag.DiscriminantDispatch:
            return "discriminant-dispatch";
        case NodeTag.PresenceDispatch:
            return "presence-dispatch";
        case NodeTag.UnionDispatch:
        case NodeTag.PrimitiveUnion:
            return "union-dispatch";
        case NodeTag.And:
            return "and";
        case NodeTag.Or:
            return "or";
        case NodeTag.Not:
            return "not";
        default:
            return `node-${String(node.tag)}`;
    }
}

/** @brief Abstract latency for dependence planning. */
function operationLatency(node: GraphNode): number {
    switch (node.tag) {
        case NodeTag.Regex:
        case NodeTag.SchemaCheck:
            return 8;
        case NodeTag.ArrayEvery:
        case NodeTag.TupleItems:
        case NodeTag.RecordEvery:
        case NodeTag.ObjectShape:
            return 4;
        default:
            return 1;
    }
}

/** @brief Descriptor-only recursive hasher with callback identity fallback. */
class StructuralHasher {
    readonly #seen = new WeakMap<object, number>();
    readonly #functionIds: WeakMap<object, number>;
    readonly #nextFunctionId: () => number;
    #hash = 2_166_136_261;
    #nextObjectId = 1;

    public constructor(
        functionIds: WeakMap<object, number>,
        nextFunctionId: () => number
    ) {
        this.#functionIds = functionIds;
        this.#nextFunctionId = nextFunctionId;
    }

    public hash(value: unknown): string {
        const work: ({ readonly kind: "text"; readonly value: string } |
            { readonly kind: "value"; readonly value: unknown })[] = [
                { kind: "value", value }
            ];
        while (work.length > 0) {
            const frame = work.pop();
            if (frame === undefined) {
                continue;
            }
            if (frame.kind === "text") {
                this.write(frame.value);
            } else {
                this.appendValue(frame.value, work);
            }
        }
        return this.#hash.toString(16).padStart(8, "0");
    }

    private appendValue(
        value: unknown,
        work: ({ readonly kind: "text"; readonly value: string } |
            { readonly kind: "value"; readonly value: unknown })[]
    ): void {
        if (value === null || typeof value !== "object" && typeof value !== "function") {
            work.push({ kind: "text", value: `${typeof value}:${String(value)};` });
            return;
        }
        if (typeof value === "function") {
            let id = this.#functionIds.get(value);
            if (id === undefined) {
                id = this.#nextFunctionId();
                this.#functionIds.set(value, id);
            }
            work.push({ kind: "text", value: `function:${String(id)};` });
            return;
        }
        const seen = this.#seen.get(value);
        if (seen !== undefined) {
            work.push({ kind: "text", value: `ref:${String(seen)};` });
            return;
        }
        const objectId = this.#nextObjectId;
        this.#nextObjectId += 1;
        this.#seen.set(value, objectId);
        if (value instanceof RegExp) {
            work.push({ kind: "text", value: `regexp:${value.source}/${value.flags};` });
            return;
        }
        const descriptors = Object.getOwnPropertyDescriptors(value);
        const keys = Reflect.ownKeys(descriptors).sort((left, right) =>
            String(left).localeCompare(String(right)));
        work.push({ kind: "text", value: "};" });
        for (let index = keys.length - 1; index >= 0; index -= 1) {
            const key = keys[index];
            if (key === undefined) {
                continue;
            }
            const descriptor = Object.getOwnPropertyDescriptor(descriptors, key);
            if (descriptor !== undefined && "value" in descriptor) {
                const propertyDescriptor = descriptor.value as unknown;
                if (propertyDescriptor !== null && typeof propertyDescriptor === "object" &&
                    "value" in propertyDescriptor) {
                    work.push({ kind: "value", value: propertyDescriptor.value });
                } else {
                    work.push({ kind: "text", value: "accessor;" });
                }
            }
            work.push({ kind: "text", value: `key:${String(key)}=` });
        }
        work.push({ kind: "text", value: `object:${String(objectId)}{` });
    }

    private write(value: string): void {
        for (let index = 0; index < value.length; index += 1) {
            this.#hash ^= value.charCodeAt(index);
            this.#hash = Math.imul(this.#hash, 16_777_619) >>> 0;
        }
    }
}

/** @brief Normalize one static probability. */
function boundedProbability(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.95;
}

/** @brief Normalize one non-negative adapter cost. */
function finiteNonNegative(value: number): number {
    return Number.isFinite(value) ? Math.max(0, value) : 1;
}
