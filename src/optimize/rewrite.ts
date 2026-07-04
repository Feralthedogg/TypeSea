/**
 * @file rewrite.ts
 * @brief Node dependency rewrite utilities.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 */

import type {
    GraphNode,
    NodeId
} from "../ir/index.js";
import { mapNodeIds } from "./map-node.js";

/**
 * @brief Rewrite dependency ids through the current folding alias table.
 * @details The node keeps its original id so the folding pass can continue a
 * stable arena scan while all dependency edges point at canonical replacements.
 * @param node Graph node to rewrite.
 * @param aliases Alias table produced by the folding pass.
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
 * @brief Resolve one node id through a chain of folding aliases.
 * @details Alias chains appear when a node folds to another node that later
 * folds again. Resolving to the final stable id keeps dependency rewrites
 * single-valued before compaction.
 * @param value Node id to resolve.
 * @param aliases Alias table produced by the folding pass.
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
