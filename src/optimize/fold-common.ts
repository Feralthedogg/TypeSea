/**
 * @file fold-common.ts
 * @brief Shared constant-folding helpers.
 */

import { NodeTag } from "../kind/index.js";
import type { GraphNode, NodeId } from "../ir/index.js";
import type { LiteralValue } from "../schema/index.js";

/**
 * @brief const read interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface ConstRead {

  /**
   * @brief found field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly found: boolean;

  /**
   * @brief value field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly value: LiteralValue | undefined;
}

/**
 * @brief fold result interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface FoldResult {

  /**
   * @brief node field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly node: GraphNode;

  /**
   * @brief replacement field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly replacement: NodeId | undefined;
}

/**
 * @brief ensure const function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param nodes Borrowed input slot named nodes; validation or normalization happens before stored state changes.
 * @param aliases Borrowed input slot named aliases; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for ensure const; ownership of newly created aggregates is transferred to the caller.
 */
export function ensureConst(
  nodes: GraphNode[],
  aliases: NodeId[],
  value: LiteralValue
): NodeId {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node?.tag === NodeTag.Const && Object.is(node.value, value)) {
      return index;
    }
  }
  const id = nodes.length;
  nodes.push({
    id,
    tag: NodeTag.Const,
    deps: [],
    value
  });
  aliases[id] = id;
  return id;
}

/**
 * @brief read const function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param nodes Borrowed input slot named nodes; validation or normalization happens before stored state changes.
 * @param id Borrowed input slot named id; validation or normalization happens before stored state changes.
 * @returns Result for read const; ownership of newly created aggregates is transferred to the caller.
 */
export function readConst(nodes: readonly GraphNode[], id: NodeId): ConstRead {
  const node = nodes[id];
  if (node?.tag === NodeTag.Const) {
    return {
      found: true,
      value: node.value
    };
  }
  return {
    found: false,
    value: undefined
  };
}

/**
 * @brief keep function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @returns Result for keep; ownership of newly created aggregates is transferred to the caller.
 */
export function keep(node: GraphNode): FoldResult {
  return {
    node,
    replacement: undefined
  };
}

/**
 * @brief replace function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param replacement Borrowed input slot named replacement; validation or normalization happens before stored state changes.
 * @returns Result for replace; ownership of newly created aggregates is transferred to the caller.
 */
export function replace(node: GraphNode, replacement: NodeId): FoldResult {
  return {
    node,
    replacement
  };
}

/**
 * @brief is finite number function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is finite number; ownership of newly created aggregates is transferred to the caller.
 */
export function isFiniteNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * @brief is plain record function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is plain record; ownership of newly created aggregates is transferred to the caller.
 */
export function isPlainRecord(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
