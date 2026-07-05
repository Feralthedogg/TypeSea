/**
 * @file peephole.ts
 * @brief Local graph rewrites that remove dead dispatch arms.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 */

import { NodeTag } from "../kind/index.js";
import type {
    DiscriminantDispatchLookup,
    DiscriminantDispatchNode,
    Graph,
    GraphNode,
    NodeId,
    PresenceDispatchNode,
    PrimitiveUnionNode,
    UnionDispatchNode
} from "../ir/index.js";
import type { Schema } from "../schema/index.js";
import { ensureConst, keep, replace, type FoldResult } from "./fold-common.js";
import { resolveAlias, rewriteNodeDeps } from "./rewrite.js";

/**
 * @brief Run local dispatch compaction over one graph.
 * @details This pass removes child arms that already fold to false and rewrites
 * aliases after each replacement so later nodes see the simplified ids.
 * @param graph Graph to optimize.
 * @returns Graph with compacted dispatch nodes and resolved aliases.
 */
export function peepholeGraph(graph: Graph): Graph {
    const originalLength = graph.nodes.length;
    const nodes = graph.nodes.slice();
    const aliases = new Array<NodeId>(nodes.length);
    for (let index = 0; index < aliases.length; index += 1) {
        aliases[index] = index;
    }

    for (let index = 0; index < originalLength; index += 1) {
        const node = nodes[index];
        if (node === undefined) {
            continue;
        }
        /*
         * Each node is rewritten through aliases before the peephole rule runs.
         * That lets a removal near the front of the graph feed later dispatch
         * compaction in the same pass.
         */
        const rewritten = rewriteNodeDeps(node, aliases);
        const result = peepholeNode(rewritten, nodes, aliases);
        nodes[index] = result.node;
        if (result.replacement !== undefined) {
            aliases[index] = result.replacement;
        }
    }

    for (let index = 0; index < aliases.length; index += 1) {
        /*
         * Aliases may point through other aliases. Resolve the chain once before
         * rebuilding the graph so every dependency points at the final target.
         */
        aliases[index] = resolveAlias(index, aliases);
    }

    const rewritten = new Array<GraphNode>(nodes.length);
    for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        if (node !== undefined) {
            rewritten[index] = rewriteNodeDeps(node, aliases);
        }
    }

    return {
        nodes: rewritten,
        entry: resolveAlias(graph.entry, aliases),
        result: resolveAlias(graph.result, aliases)
    };
}

/**
 * @brief Apply the local peephole rule for one node.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param node Node with dependencies already alias-rewritten.
 * @param nodes Mutable graph node table.
 * @param aliases Alias table updated by replacements.
 * @returns Fold decision for the node.
 */
function peepholeNode(
    node: GraphNode,
    nodes: GraphNode[],
    aliases: NodeId[]
): FoldResult {
    switch (node.tag) {
        case NodeTag.DiscriminantDispatch:
            return compactDiscriminantDispatch(node, nodes, aliases);
        case NodeTag.UnionDispatch:
            return compactUnionDispatch(node, nodes, aliases);
        case NodeTag.PresenceDispatch:
            return compactPresenceDispatch(node, nodes, aliases);
        case NodeTag.PrimitiveUnion:
            return compactPrimitiveUnion(node, nodes, aliases);
        default:
            return keep(node);
    }
}

/**
 * @brief Remove impossible discriminant dispatch arms.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param node Discriminant dispatch node to compact.
 * @param nodes Mutable graph node table used for replacement constants.
 * @param aliases Alias table updated by replacements.
 * @returns Compacted dispatch node or constant false when no arm remains.
 */
function compactDiscriminantDispatch(
    node: DiscriminantDispatchNode,
    nodes: GraphNode[],
    aliases: NodeId[]
): FoldResult {
    const literals: string[] = [];
    const schemas: Schema[] = [];
    const graphs: Graph[] = [];
    let changed = false;

    for (let index = 0; index < node.graphs.length; index += 1) {
        const graph = node.graphs[index];
        const literal = node.literals[index];
        const schema = node.schemas[index];
        if (graph === undefined || literal === undefined || schema === undefined ||
            readGraphResultBoolean(graph) === false) {
            /*
             * A dispatch arm whose child graph is already false can never accept
             * input for that discriminant literal, so it is removed from lookup.
             */
            changed = true;
            continue;
        }
        literals.push(literal);
        schemas.push(schema);
        graphs.push(graph);
        changed = changed || literals.length - 1 !== index;
    }

    if (graphs.length === 0) {
        return replace(node, ensureConst(nodes, aliases, false));
    }
    if (!changed) {
        return keep(node);
    }
    return keep({
        id: node.id,
        tag: node.tag,
        deps: node.deps,
        value: node.value,
        key: node.key,
        literals,
        schemas,
        graphs,
        lookup: makeDiscriminantLookup(literals)
    });
}

/**
 * @brief Remove impossible general union dispatch arms.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param node Union dispatch node to compact.
 * @param nodes Mutable graph node table used for replacement constants.
 * @param aliases Alias table updated by replacements.
 * @returns Compacted dispatch node or constant false when no arm remains.
 */
function compactUnionDispatch(
    node: UnionDispatchNode,
    nodes: GraphNode[],
    aliases: NodeId[]
): FoldResult {
    const options: Schema[] = [];
    const graphs: Graph[] = [];
    const masks: number[] = [];
    let changed = false;

    for (let index = 0; index < node.graphs.length; index += 1) {
        const graph = node.graphs[index];
        const option = node.options[index];
        const mask = node.masks[index];
        if (graph === undefined || option === undefined || mask === undefined ||
            mask === 0 || readGraphResultBoolean(graph) === false) {
            /*
             * A zero mask or false child graph means the arm has no reachable
             * runtime domain after earlier folds.
             */
            changed = true;
            continue;
        }
        options.push(option);
        graphs.push(graph);
        masks.push(mask);
        changed = changed || graphs.length - 1 !== index;
    }

    if (graphs.length === 0) {
        return replace(node, ensureConst(nodes, aliases, false));
    }
    if (!changed) {
        return keep(node);
    }
    return keep({
        id: node.id,
        tag: node.tag,
        deps: node.deps,
        value: node.value,
        options,
        graphs,
        masks
    });
}

/**
 * @brief Remove impossible presence-dispatch arms.
 * @param node Presence dispatch node to compact.
 * @param nodes Mutable graph node table used for replacement constants.
 * @param aliases Alias table updated by replacements.
 * @returns Compacted dispatch node or constant false when no arm remains.
 */
function compactPresenceDispatch(
    node: PresenceDispatchNode,
    nodes: GraphNode[],
    aliases: NodeId[]
): FoldResult {
    const keys: (string | undefined)[] = [];
    const options: Schema[] = [];
    const graphs: Graph[] = [];
    const masks: number[] = [];
    let changed = false;

    for (let index = 0; index < node.graphs.length; index += 1) {
        const graph = node.graphs[index];
        const option = node.options[index];
        const mask = node.masks[index];
        if (graph === undefined || option === undefined || mask === undefined ||
            mask === 0 || readGraphResultBoolean(graph) === false) {
            changed = true;
            continue;
        }
        keys.push(node.keys[index]);
        options.push(option);
        graphs.push(graph);
        masks.push(mask);
        changed = changed || graphs.length - 1 !== index;
    }

    if (graphs.length === 0) {
        return replace(node, ensureConst(nodes, aliases, false));
    }
    if (!changed) {
        return keep(node);
    }
    return keep({
        id: node.id,
        tag: node.tag,
        deps: node.deps,
        value: node.value,
        keys,
        options,
        graphs,
        masks
    });
}

/**
 * @brief Remove impossible primitive-union dispatch arms.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param node Primitive union dispatch node to compact.
 * @param nodes Mutable graph node table used for replacement constants.
 * @param aliases Alias table updated by replacements.
 * @returns Compacted dispatch node or constant false when no arm remains.
 */
function compactPrimitiveUnion(
    node: PrimitiveUnionNode,
    nodes: GraphNode[],
    aliases: NodeId[]
): FoldResult {
    const graphs: Graph[] = [];
    const masks: number[] = [];
    let changed = false;

    for (let index = 0; index < node.graphs.length; index += 1) {
        const graph = node.graphs[index];
        const mask = node.masks[index];
        if (graph === undefined || mask === undefined ||
            mask === 0 || readGraphResultBoolean(graph) === false) {
            changed = true;
            continue;
        }
        graphs.push(graph);
        masks.push(mask);
        changed = changed || graphs.length - 1 !== index;
    }

    if (graphs.length === 0) {
        return replace(node, ensureConst(nodes, aliases, false));
    }
    if (!changed) {
        return keep(node);
    }
    return keep({
        id: node.id,
        tag: node.tag,
        deps: node.deps,
        value: node.value,
        graphs,
        masks
    });
}

/**
 * @brief Read whether a graph's result is a constant boolean.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param graph Child graph to inspect.
 * @returns Constant boolean result, or undefined for non-constant graphs.
 */
function readGraphResultBoolean(graph: Graph): boolean | undefined {
    const result = graph.nodes[graph.result];
    if (result?.tag !== NodeTag.Return) {
        return undefined;
    }
    const value = graph.nodes[result.value];
    if (value?.tag === NodeTag.Const && typeof value.value === "boolean") {
        return value.value;
    }
    return undefined;
}

/**
 * @brief Build a literal-to-arm lookup for discriminant dispatch.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param literals Remaining discriminant literals in arm order.
 * @returns Frozen null-prototype lookup from literal to compacted arm index.
 */
function makeDiscriminantLookup(
    literals: readonly string[]
): DiscriminantDispatchLookup {
    const lookup = Object.create(null) as Record<string, number>;
    for (let index = 0; index < literals.length; index += 1) {
        const literal = literals[index];
        if (literal !== undefined) {
            lookup[literal] = index;
        }
    }
    return Object.freeze(lookup);
}
