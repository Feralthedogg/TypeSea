/**
 * @file fold-boolean.ts
 * @brief Constant folding for boolean fold nodes.
 */

import type {
  BooleanFoldNode,
  GraphNode,
  NodeId
} from "../ir/index.js";
import {
  ensureConst,
  keep,
  readConst,
  replace,
  type FoldResult
} from "./fold-common.js";

/**
 * @brief fold and.
 */
export function foldAnd(
  node: BooleanFoldNode,
  nodes: GraphNode[],
  aliases: NodeId[]
): FoldResult {
  const values: NodeId[] = [];
  for (let index = 0; index < node.values.length; index += 1) {
    const value = node.values[index];
    if (value === undefined) {
      continue;
    }
    const constant = readConst(nodes, value);
    if (constant.found) {
      if (constant.value !== true) {
        return replace(node, ensureConst(nodes, aliases, false));
      }
      continue;
    }
    values.push(value);
  }
  if (values.length === 0) {
    return replace(node, ensureConst(nodes, aliases, true));
  }
  if (values.length === 1) {
    const only = values[0];
    if (only !== undefined) {
      return replace(node, only);
    }
  }
  return keep({
    id: node.id,
    tag: node.tag,
    deps: values,
    values
  });
}

/**
 * @brief fold or.
 */
export function foldOr(
  node: BooleanFoldNode,
  nodes: GraphNode[],
  aliases: NodeId[]
): FoldResult {
  const values: NodeId[] = [];
  for (let index = 0; index < node.values.length; index += 1) {
    const value = node.values[index];
    if (value === undefined) {
      continue;
    }
    const constant = readConst(nodes, value);
    if (constant.found) {
      if (constant.value === true) {
        return replace(node, ensureConst(nodes, aliases, true));
      }
      continue;
    }
    values.push(value);
  }
  if (values.length === 0) {
    return replace(node, ensureConst(nodes, aliases, false));
  }
  if (values.length === 1) {
    const only = values[0];
    if (only !== undefined) {
      return replace(node, only);
    }
  }
  return keep({
    id: node.id,
    tag: node.tag,
    deps: values,
    values
  });
}
