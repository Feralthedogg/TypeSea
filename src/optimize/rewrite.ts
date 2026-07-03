/**
 * @file rewrite.ts
 * @brief Node dependency rewrite utilities.
 */

import type {
  GraphNode,
  NodeId
} from "../ir/index.js";
import { mapNodeIds } from "./map-node.js";

/**
 * @brief rewrite node deps.
 * @details Resolves dependency aliases while preserving the node's own id.
 * @param node Borrowed graph node to rewrite.
 * @param aliases Borrowed alias table produced by the folding pass.
 * @returns Graph node with dependency ids rewritten through the alias table.
 */
export function rewriteNodeDeps(
  node: GraphNode,
  aliases: readonly NodeId[]
): GraphNode {
  return mapNodeIds(
    node,
    (value: NodeId): NodeId => resolveAlias(value, aliases),
    node.id
  );
}

/**
 * @brief resolve alias.
 * @details Follows an alias chain until it reaches a stable node id.
 * @param value Borrowed node id to resolve.
 * @param aliases Borrowed alias table.
 * @returns Canonical node id for the current folding pass.
 */
export function resolveAlias(value: NodeId, aliases: readonly NodeId[]): NodeId {
  let current = value;
  let next = aliases[current];
  while (next !== undefined && next !== current) {
    current = next;
    next = aliases[current];
  }
  if (next === undefined) {
    throw new Error("Graph alias points outside graph");
  }
  return current;
}
