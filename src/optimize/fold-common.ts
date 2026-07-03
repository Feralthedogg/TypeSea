/**
 * @file fold-common.ts
 * @brief Shared constant-folding helpers.
 */

import { NodeTag } from "../kind/index.js";
import type { GraphNode, NodeId } from "../ir/index.js";
import type { LiteralValue } from "../schema/index.js";

/**
 * @brief const read.
 */
export interface ConstRead {
  readonly found: boolean;
  readonly value: LiteralValue | undefined;
}

/**
 * @brief fold result.
 */
export interface FoldResult {
  readonly node: GraphNode;
  readonly replacement: NodeId | undefined;
}

/**
 * @brief ensure const.
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
 * @brief read const.
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
 * @brief keep.
 */
export function keep(node: GraphNode): FoldResult {
  return {
    node,
    replacement: undefined
  };
}

/**
 * @brief replace.
 */
export function replace(node: GraphNode, replacement: NodeId): FoldResult {
  return {
    node,
    replacement
  };
}

/**
 * @brief is finite number.
 */
export function isFiniteNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * @brief is plain record.
 */
export function isPlainRecord(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
