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
import { foldConstants } from "./fold.js";

/**
 * @brief optimize graph.
 */
export function optimizeGraph(graph: Graph): Graph {
  const input = readGraph(graph);
  return freezeGraph(compactReachable(foldConstants(input)));
}

/**
 * @brief read graph.
 */
function readGraph(value: unknown): Graph {
  if (!isGraphValue(value)) {
    throw new TypeError("optimizeGraph requires a valid TypeSea graph");
  }
  return freezeGraph(value);
}
