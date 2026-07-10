/**
 * @file compact.ts
 * @brief Reachability compaction for optimized graphs.
 */

import type { Graph, GraphNode, NodeId } from "../ir/index.js";
import { remapId, remapNode } from "./remap.js";

/**
 * @brief Remove unreachable IR nodes and remap the remaining node ids densely.
 * @details Earlier optimizer passes may leave replaced nodes in the arena so
 * alias bookkeeping stays simple. This pass is the boundary that rewrites the
 * graph back into the dense id space expected by codegen and public graph reads.
 * @param graph Graph produced by earlier optimizer passes.
 * @returns Graph containing only nodes reachable from entry and result.
 */
export function compactReachable(graph: Graph): Graph {
    const reachable = markReachable(graph);
    const remap = new Array<NodeId>(graph.nodes.length);
    const nodes: GraphNode[] = [];
    for (let index = 0; index < graph.nodes.length; index += 1) {
        if (reachable[index] === true) {
            remap[index] = nodes.length;
            const node = graph.nodes[index];
            if (node !== undefined) {
                nodes.push(node);
            }
        }
    }
    const compacted = new Array<GraphNode>(nodes.length);
    for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        if (node !== undefined) {
            compacted[index] = remapNode(node, remap);
        }
    }
    return {
        nodes: compacted,
        entry: remapId(graph.entry, remap),
        result: remapId(graph.result, remap)
    };
}

/**
 * @brief Mark graph nodes reachable from the entry and result roots.
 * @details The scan walks dependency edges with an explicit stack to avoid
 * recursion limits on large generated schemas.
 * @param graph Graph to scan.
 * @returns Boolean reachability bitmap aligned with the original node table.
 */
function markReachable(graph: Graph): readonly boolean[] {
    const reachable = new Array<boolean>(graph.nodes.length).fill(false);
    const stack: NodeId[] = [graph.result, graph.entry];
    while (stack.length !== 0) {
        const id = stack.pop();
        if (id === undefined || reachable[id] === true) {
            continue;
        }
        reachable[id] = true;
        const node = graph.nodes[id];
        if (node === undefined) {
            continue;
        }
        const deps = node.deps;
        for (let index = 0; index < deps.length; index += 1) {
            const dep = deps[index];
            if (dep !== undefined) {
                stack.push(dep);
            }
        }
    }
    return reachable;
}
