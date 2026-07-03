/**
 * @file compact.ts
 * @brief Reachability compaction for optimized graphs.
 */

import type { Graph, GraphNode, NodeId } from "../ir/index.js";
import { remapId, remapNode } from "./remap.js";

/**
 * @brief compact reachable function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param graph Borrowed input slot named graph; validation or normalization happens before stored state changes.
 * @returns Result for compact reachable; ownership of newly created aggregates is transferred to the caller.
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
 * @brief mark reachable function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param graph Borrowed input slot named graph; validation or normalization happens before stored state changes.
 * @returns Result for mark reachable; ownership of newly created aggregates is transferred to the caller.
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
