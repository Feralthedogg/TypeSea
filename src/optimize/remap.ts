/**
 * @file optimize-remap.ts
 * @brief Dense node-id remapping helpers for graph compaction.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 */

import type {
    GraphNode,
    NodeId
} from "../ir/index.js";
import { mapNodeIds } from "./map-node.js";

/**
 * @brief remap node.
 * @details Applies a compacted id table to one graph node and its dependencies.
 * @param node Borrowed graph node from the old dense graph.
 * @param remap Borrowed old-id to new-id table.
 * @returns Graph node rewritten into the compacted id space.
 */
export function remapNode(
    node: GraphNode,
    remap: readonly NodeId[]
): GraphNode {
    return mapNodeIds(
        node,
        (value: NodeId): NodeId => remapId(value, remap),
        remapId(node.id, remap)
    );
}

/**
 * @brief remap id.
 * @details Reads one mandatory entry from the compacted id table.
 * @param value Borrowed old node id.
 * @param remap Borrowed old-id to new-id table.
 * @returns New node id for the compacted graph.
 */
export function remapId(value: NodeId, remap: readonly NodeId[]): NodeId {
    const mapped = remap[value];
    if (mapped === undefined) {
        throw new Error("Unreachable dependency escaped graph optimization");
    }
    return mapped;
}

/**
 * @brief remap ids.
 * @details Applies a compacted id table to a dense node-id vector.
 * @param values Borrowed old-id vector.
 * @param remap Borrowed old-id to new-id table.
 * @returns New dense vector in compacted id space.
 */
export function remapIds(values: readonly NodeId[], remap: readonly NodeId[]): NodeId[] {
    const remapped = new Array<NodeId>(values.length);
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value !== undefined) {
            remapped[index] = remapId(value, remap);
        }
    }
    return remapped;
}
