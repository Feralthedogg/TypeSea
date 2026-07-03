/**
 * @file fold.ts
 * @brief Constant folding pass driver.
 */

import { NodeTag } from "../kind/index.js";
import type {
  Graph,
  GraphNode,
  NodeId
} from "../ir/index.js";
import { foldAnd, foldOr } from "./fold-boolean.js";
import { keep, type FoldResult } from "./fold-common.js";
import {
  foldArrayEvery,
  foldEquals,
  foldGetProp,
  foldHasOwn,
  foldLength,
  foldNumeric,
  foldRegex,
  foldStrictKeys,
  foldStringBound,
  foldUnary
} from "./fold-scalar.js";
import { resolveAlias, rewriteNodeDeps } from "./rewrite.js";

/**
 * @brief fold constants function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param graph Borrowed input slot named graph; validation or normalization happens before stored state changes.
 * @returns Result for fold constants; ownership of newly created aggregates is transferred to the caller.
 */
export function foldConstants(graph: Graph): Graph {
  const originalLength = graph.nodes.length;
  const nodes = graph.nodes.slice();
  const aliases = new Array<NodeId>(nodes.length);
  for (let index = 0; index < aliases.length; index += 1) {
    aliases[index] = index;
  }

  for (let index = 0; index < originalLength; index += 1) {
    const node = nodes[index];
    if (node === undefined) {
      continue;
    }
    const rewritten = rewriteNodeDeps(node, aliases);
    const folded = foldNode(rewritten, nodes, aliases);
    nodes[index] = folded.node;
    if (folded.replacement !== undefined) {
      aliases[index] = folded.replacement;
    }
  }

  for (let index = 0; index < aliases.length; index += 1) {
    aliases[index] = resolveAlias(index, aliases);
  }

  const rewritten = new Array<GraphNode>(nodes.length);
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node !== undefined) {
      rewritten[index] = rewriteNodeDeps(node, aliases);
    }
  }

  return {
    nodes: rewritten,
    entry: resolveAlias(graph.entry, aliases),
    result: resolveAlias(graph.result, aliases)
  };
}

/**
 * @brief fold node function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param nodes Borrowed input slot named nodes; validation or normalization happens before stored state changes.
 * @param aliases Borrowed input slot named aliases; validation or normalization happens before stored state changes.
 * @returns Result for fold node; ownership of newly created aggregates is transferred to the caller.
 */
function foldNode(
  node: GraphNode,
  nodes: GraphNode[],
  aliases: NodeId[]
): FoldResult {
  switch (node.tag) {
    case NodeTag.Start:
    case NodeTag.Param:
    case NodeTag.Const:
    case NodeTag.Return:
    case NodeTag.Issue:
      return keep(node);
    case NodeTag.GetProp:
      return foldGetProp(node, nodes, aliases);
    case NodeTag.Length:
      return foldLength(node, nodes, aliases);
    case NodeTag.IsString:
    case NodeTag.IsNumber:
    case NodeTag.IsBoolean:
    case NodeTag.IsObject:
    case NodeTag.IsArray:
    case NodeTag.IsUndefined:
    case NodeTag.IsNull:
    case NodeTag.IsInteger:
    case NodeTag.Not:
    case NodeTag.IsBigInt:
    case NodeTag.IsSymbol:
      return foldUnary(node, nodes, aliases);
    case NodeTag.Equals:
      return foldEquals(node, nodes, aliases);
    case NodeTag.Gte:
    case NodeTag.Lte:
      return foldNumeric(node, nodes, aliases);
    case NodeTag.StringMin:
    case NodeTag.StringMax:
      return foldStringBound(node, nodes, aliases);
    case NodeTag.Regex:
      return foldRegex(node, nodes, aliases);
    case NodeTag.HasOwn:
      return foldHasOwn(node, nodes, aliases);
    case NodeTag.StrictKeys:
      return foldStrictKeys(node, nodes, aliases);
    case NodeTag.ArrayEvery:
      return foldArrayEvery(node, nodes, aliases);
    case NodeTag.SchemaCheck:
      return keep(node);
    case NodeTag.And:
      return foldAnd(node, nodes, aliases);
    case NodeTag.Or:
      return foldOr(node, nodes, aliases);
  }
}
