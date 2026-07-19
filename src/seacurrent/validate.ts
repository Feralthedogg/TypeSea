/**
 * @file validate.ts
 * @brief Fail-closed validation for adapter-produced planner graphs.
 */

import type {
    SeaCurrentControlFlowGraph,
    SeaCurrentDependenceGraph
} from "./types.js";

/** @brief Validated CFG result without exception-based control flow. */
export type SeaCurrentCFGValidation =
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: string };

/** @brief Validated dependence-graph result without exception-based control flow. */
export type SeaCurrentDependenceValidation =
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: string };

/**
 * @brief Validate identifiers, endpoints, exits, probabilities, and costs.
 * @details Planner algorithms may allocate dense indexes only after this check.
 */
export function validateSeaCurrentCFG(graph: SeaCurrentControlFlowGraph): SeaCurrentCFGValidation {
    if (graph.nodes.length === 0) {
        return { ok: false, reason: "CFG has no nodes" };
    }
    const nodes = new Set<string>();
    for (const node of graph.nodes) {
        if (node.id.length === 0 || nodes.has(node.id)) {
            return { ok: false, reason: "CFG node identifiers must be non-empty and unique" };
        }
        nodes.add(node.id);
    }
    if (!nodes.has(graph.entry)) {
        return { ok: false, reason: "CFG entry does not name a node" };
    }
    if (graph.exits.length === 0) {
        return { ok: false, reason: "CFG has no exits" };
    }
    const exits = new Set<string>();
    for (const exit of graph.exits) {
        if (!nodes.has(exit) || exits.has(exit)) {
            return { ok: false, reason: "CFG exits must name distinct nodes" };
        }
        exits.add(exit);
    }
    const edges = new Set<string>();
    for (const edge of graph.edges) {
        if (edge.id.length === 0 || edges.has(edge.id)) {
            return { ok: false, reason: "CFG edge identifiers must be non-empty and unique" };
        }
        if (!nodes.has(edge.source) || !nodes.has(edge.destination)) {
            return { ok: false, reason: `CFG edge ${edge.id} has an unknown endpoint` };
        }
        if (!Number.isFinite(edge.probability) || edge.probability < 0 || edge.probability > 1) {
            return { ok: false, reason: `CFG edge ${edge.id} has an invalid probability` };
        }
        if (!Number.isFinite(edge.counterCost) || edge.counterCost < 0) {
            return { ok: false, reason: `CFG edge ${edge.id} has an invalid counter cost` };
        }
        edges.add(edge.id);
    }
    return { ok: true };
}

/** @brief Validate operation identities and directed dependence endpoints. */
export function validateSeaCurrentDependences(
    graph: SeaCurrentDependenceGraph
): SeaCurrentDependenceValidation {
    const operations = new Set<string>();
    for (const operation of graph.operations) {
        if (operation.id.length === 0 || operations.has(operation.id)) {
            return { ok: false, reason: "operation identifiers must be non-empty and unique" };
        }
        operations.add(operation.id);
    }
    for (const dependence of graph.dependences) {
        if (!operations.has(dependence.source) || !operations.has(dependence.destination)) {
            return { ok: false, reason: "dependence has an unknown endpoint" };
        }
        if (!Number.isFinite(dependence.latency) || dependence.latency < 0) {
            return { ok: false, reason: "dependence latency must be finite and non-negative" };
        }
        if (!Number.isSafeInteger(dependence.distance) || dependence.distance < 0) {
            return { ok: false, reason: "dependence distance must be a non-negative integer" };
        }
        if (!Number.isFinite(dependence.confidence) || dependence.confidence < 0 || dependence.confidence > 1) {
            return { ok: false, reason: "dependence confidence must be in [0, 1]" };
        }
    }
    return { ok: true };
}
