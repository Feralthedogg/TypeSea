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
 * @brief optimize graph function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param graph Borrowed input slot named graph; validation or normalization happens before stored state changes.
 * @returns Result for optimize graph; ownership of newly created aggregates is transferred to the caller.
 */
export function optimizeGraph(graph: Graph): Graph {
  const input = readGraph(graph);
  return freezeGraph(compactReachable(foldConstants(input)));
}

/**
 * @brief read graph function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for read graph; ownership of newly created aggregates is transferred to the caller.
 */
function readGraph(value: unknown): Graph {
  if (!isGraphValue(value)) {
    throw new TypeError("optimizeGraph requires a valid TypeSea graph");
  }
  return freezeGraph(value);
}
