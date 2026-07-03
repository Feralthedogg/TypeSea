/**
 * @file fold-scalar.ts
 * @brief Constant folding for scalar graph nodes.
 */

import { NodeTag } from "../kind/index.js";
import type {
  ArrayEveryNode,
  EqualsNode,
  GetPropNode,
  GraphNode,
  HasOwnNode,
  LengthNode,
  NodeId,
  NumericCompareNode,
  RegexNode,
  StrictKeysNode,
  StringBoundNode,
  UnaryPredicateNode
} from "../ir/index.js";
import {
  ensureConst,
  isFiniteNumber,
  isPlainRecord,
  keep,
  readConst,
  replace,
  type FoldResult
} from "./fold-common.js";

/**
 * @brief fold get prop function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param nodes Borrowed input slot named nodes; validation or normalization happens before stored state changes.
 * @param aliases Borrowed input slot named aliases; validation or normalization happens before stored state changes.
 * @returns Result for fold get prop; ownership of newly created aggregates is transferred to the caller.
 */
export function foldGetProp(
  node: GetPropNode,
  nodes: GraphNode[],
  aliases: NodeId[]
): FoldResult {
  const value = readConst(nodes, node.object);
  if (value.found) {
    return replace(node, ensureConst(nodes, aliases, undefined));
  }
  return keep(node);
}

/**
 * @brief fold length function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param nodes Borrowed input slot named nodes; validation or normalization happens before stored state changes.
 * @param aliases Borrowed input slot named aliases; validation or normalization happens before stored state changes.
 * @returns Result for fold length; ownership of newly created aggregates is transferred to the caller.
 */
export function foldLength(
  node: LengthNode,
  nodes: GraphNode[],
  aliases: NodeId[]
): FoldResult {
  const value = readConst(nodes, node.value);
  if (!value.found) {
    return keep(node);
  }
  if (typeof value.value === "string") {
    return replace(node, ensureConst(nodes, aliases, value.value.length));
  }
  return replace(node, ensureConst(nodes, aliases, undefined));
}

/**
 * @brief fold unary function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param nodes Borrowed input slot named nodes; validation or normalization happens before stored state changes.
 * @param aliases Borrowed input slot named aliases; validation or normalization happens before stored state changes.
 * @returns Result for fold unary; ownership of newly created aggregates is transferred to the caller.
 */
export function foldUnary(
  node: UnaryPredicateNode,
  nodes: GraphNode[],
  aliases: NodeId[]
): FoldResult {
  const value = readConst(nodes, node.value);
  if (!value.found) {
    return keep(node);
  }
  switch (node.tag) {
    case NodeTag.IsString:
      return replace(node, ensureConst(nodes, aliases, typeof value.value === "string"));
    case NodeTag.IsNumber:
      return replace(node, ensureConst(nodes, aliases, isFiniteNumber(value.value)));
    case NodeTag.IsBoolean:
      return replace(node, ensureConst(nodes, aliases, typeof value.value === "boolean"));
    case NodeTag.IsObject:
      return replace(node, ensureConst(nodes, aliases, isPlainRecord(value.value)));
    case NodeTag.IsArray:
      return replace(node, ensureConst(nodes, aliases, Array.isArray(value.value)));
    case NodeTag.IsUndefined:
      return replace(node, ensureConst(nodes, aliases, value.value === undefined));
    case NodeTag.IsNull:
      return replace(node, ensureConst(nodes, aliases, value.value === null));
    case NodeTag.IsInteger:
      return replace(node, ensureConst(nodes, aliases, Number.isInteger(value.value)));
    case NodeTag.Not:
      return replace(node, ensureConst(nodes, aliases, value.value !== true));
    case NodeTag.IsBigInt:
      return replace(node, ensureConst(nodes, aliases, typeof value.value === "bigint"));
    case NodeTag.IsSymbol:
      return replace(node, ensureConst(nodes, aliases, typeof value.value === "symbol"));
  }
}

/**
 * @brief fold equals function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param nodes Borrowed input slot named nodes; validation or normalization happens before stored state changes.
 * @param aliases Borrowed input slot named aliases; validation or normalization happens before stored state changes.
 * @returns Result for fold equals; ownership of newly created aggregates is transferred to the caller.
 */
export function foldEquals(
  node: EqualsNode,
  nodes: GraphNode[],
  aliases: NodeId[]
): FoldResult {
  const left = readConst(nodes, node.left);
  const right = readConst(nodes, node.right);
  if (!left.found || !right.found) {
    return keep(node);
  }
  return replace(node, ensureConst(nodes, aliases, Object.is(left.value, right.value)));
}

/**
 * @brief fold numeric function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param nodes Borrowed input slot named nodes; validation or normalization happens before stored state changes.
 * @param aliases Borrowed input slot named aliases; validation or normalization happens before stored state changes.
 * @returns Result for fold numeric; ownership of newly created aggregates is transferred to the caller.
 */
export function foldNumeric(
  node: NumericCompareNode,
  nodes: GraphNode[],
  aliases: NodeId[]
): FoldResult {
  const left = readConst(nodes, node.left);
  const right = readConst(nodes, node.right);
  if (!left.found || !right.found) {
    return keep(node);
  }
  const valid = typeof left.value === "number" && typeof right.value === "number";
  const result = valid && (node.tag === NodeTag.Gte
    ? left.value >= right.value
    : left.value <= right.value);
  return replace(node, ensureConst(nodes, aliases, result));
}

/**
 * @brief fold string bound function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param nodes Borrowed input slot named nodes; validation or normalization happens before stored state changes.
 * @param aliases Borrowed input slot named aliases; validation or normalization happens before stored state changes.
 * @returns Result for fold string bound; ownership of newly created aggregates is transferred to the caller.
 */
export function foldStringBound(
  node: StringBoundNode,
  nodes: GraphNode[],
  aliases: NodeId[]
): FoldResult {
  const value = readConst(nodes, node.value);
  if (!value.found) {
    return keep(node);
  }
  const result = typeof value.value === "string" && (node.tag === NodeTag.StringMin
    ? value.value.length >= node.bound
    : value.value.length <= node.bound);
  return replace(node, ensureConst(nodes, aliases, result));
}

/**
 * @brief fold regex function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param nodes Borrowed input slot named nodes; validation or normalization happens before stored state changes.
 * @param aliases Borrowed input slot named aliases; validation or normalization happens before stored state changes.
 * @returns Result for fold regex; ownership of newly created aggregates is transferred to the caller.
 */
export function foldRegex(
  node: RegexNode,
  nodes: GraphNode[],
  aliases: NodeId[]
): FoldResult {
  const value = readConst(nodes, node.value);
  if (!value.found) {
    return keep(node);
  }
  if (typeof value.value !== "string") {
    return replace(node, ensureConst(nodes, aliases, false));
  }
  node.regex.lastIndex = 0;
  const result = node.regex.test(value.value);
  node.regex.lastIndex = 0;
  return replace(node, ensureConst(nodes, aliases, result));
}

/**
 * @brief fold has own function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param nodes Borrowed input slot named nodes; validation or normalization happens before stored state changes.
 * @param aliases Borrowed input slot named aliases; validation or normalization happens before stored state changes.
 * @returns Result for fold has own; ownership of newly created aggregates is transferred to the caller.
 */
export function foldHasOwn(
  node: HasOwnNode,
  nodes: GraphNode[],
  aliases: NodeId[]
): FoldResult {
  const value = readConst(nodes, node.object);
  if (value.found) {
    return replace(node, ensureConst(nodes, aliases, false));
  }
  return keep(node);
}

/**
 * @brief fold strict keys function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param nodes Borrowed input slot named nodes; validation or normalization happens before stored state changes.
 * @param aliases Borrowed input slot named aliases; validation or normalization happens before stored state changes.
 * @returns Result for fold strict keys; ownership of newly created aggregates is transferred to the caller.
 */
export function foldStrictKeys(
  node: StrictKeysNode,
  nodes: GraphNode[],
  aliases: NodeId[]
): FoldResult {
  const value = readConst(nodes, node.object);
  if (value.found) {
    return replace(node, ensureConst(nodes, aliases, false));
  }
  return keep(node);
}

/**
 * @brief fold array every function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param nodes Borrowed input slot named nodes; validation or normalization happens before stored state changes.
 * @param aliases Borrowed input slot named aliases; validation or normalization happens before stored state changes.
 * @returns Result for fold array every; ownership of newly created aggregates is transferred to the caller.
 */
export function foldArrayEvery(
  node: ArrayEveryNode,
  nodes: GraphNode[],
  aliases: NodeId[]
): FoldResult {
  const value = readConst(nodes, node.value);
  if (value.found) {
    return replace(node, ensureConst(nodes, aliases, false));
  }
  return keep(node);
}
