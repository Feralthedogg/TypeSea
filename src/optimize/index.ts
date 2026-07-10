/**
 * @file index.ts
 * @brief Public graph optimizer pipeline.
 */

import {
    freezeGraph,
    isGraphValue,
    type Graph
} from "../ir/index.js";
import { compactReachable } from "./compact.js";
import { specializeDomains } from "./domain.js";
import { foldConstants } from "./fold.js";
import { peepholeGraph } from "./peephole.js";

/**
 * @brief Run the public graph optimization pipeline.
 * @details Pass order is intentionally conservative: constant folding exposes
 * local identities, peephole rewriting removes adjacent graph noise, domain
 * specialization reasons about repeated validation loops, and compaction drops
 * nodes made unreachable by earlier replacements.
 * @param graph Frozen or mutable TypeSea graph to optimize.
 * @returns Frozen graph after all optimizer passes have completed.
 */
export function optimizeGraph(graph: Graph): Graph {
    const input = readGraph(graph);
    return freezeGraph(compactReachable(specializeDomains(peepholeGraph(foldConstants(input)))));
}

/**
 * @brief Validate optimizer input before mutating pass-local copies.
 * @details Public callers may pass arbitrary values through JavaScript module
 * boundaries. The optimizer fails at the edge rather than letting malformed IR
 * reach passes that assume node ids and dependency arrays are well formed.
 * @param value Candidate graph value.
 * @returns Frozen graph value accepted by the IR validator.
 */
function readGraph(value: unknown): Graph {
    if (!isGraphValue(value)) {
        throw new TypeError("optimizeGraph requires a valid TypeSea graph");
    }
    return freezeGraph(value);
}
