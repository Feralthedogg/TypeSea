/**
 * @file rewrite.ts
 * @brief Node dependency rewrite utilities.
 */

import { NodeTag } from "../kind/index.js";
import type {
  GraphNode,
  NodeId
} from "../ir/index.js";

/**
 * @brief rewrite node deps function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param aliases Borrowed input slot named aliases; validation or normalization happens before stored state changes.
 * @returns Result for rewrite node deps; ownership of newly created aggregates is transferred to the caller.
 */
export function rewriteNodeDeps(
  node: GraphNode,
  aliases: readonly NodeId[]
): GraphNode {
  switch (node.tag) {
    case NodeTag.Start:
    case NodeTag.Param:
    case NodeTag.Const:
      return node;
    case NodeTag.GetProp:
      return {
        id: node.id,
        tag: node.tag,
        deps: [resolveAlias(node.object, aliases)],
        object: resolveAlias(node.object, aliases),
        key: node.key
      };
    case NodeTag.Length:
      return {
        id: node.id,
        tag: node.tag,
        deps: [resolveAlias(node.value, aliases)],
        value: resolveAlias(node.value, aliases)
      };
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
      return {
        id: node.id,
        tag: node.tag,
        deps: [resolveAlias(node.value, aliases)],
        value: resolveAlias(node.value, aliases)
      };
    case NodeTag.Equals:
      return {
        id: node.id,
        tag: node.tag,
        deps: [resolveAlias(node.left, aliases), resolveAlias(node.right, aliases)],
        left: resolveAlias(node.left, aliases),
        right: resolveAlias(node.right, aliases)
      };
    case NodeTag.Gte:
    case NodeTag.Lte:
      return {
        id: node.id,
        tag: node.tag,
        deps: [resolveAlias(node.left, aliases), resolveAlias(node.right, aliases)],
        left: resolveAlias(node.left, aliases),
        right: resolveAlias(node.right, aliases)
      };
    case NodeTag.StringMin:
    case NodeTag.StringMax:
      return {
        id: node.id,
        tag: node.tag,
        deps: [resolveAlias(node.value, aliases)],
        value: resolveAlias(node.value, aliases),
        bound: node.bound
      };
    case NodeTag.Regex:
      return {
        id: node.id,
        tag: node.tag,
        deps: [resolveAlias(node.value, aliases)],
        value: resolveAlias(node.value, aliases),
        regex: node.regex,
        name: node.name
      };
    case NodeTag.HasOwn:
      return {
        id: node.id,
        tag: node.tag,
        deps: [resolveAlias(node.object, aliases)],
        object: resolveAlias(node.object, aliases),
        key: node.key
      };
    case NodeTag.StrictKeys:
      return {
        id: node.id,
        tag: node.tag,
        deps: [resolveAlias(node.object, aliases)],
        object: resolveAlias(node.object, aliases),
        keys: node.keys
      };
    case NodeTag.ArrayEvery:
      return {
        id: node.id,
        tag: node.tag,
        deps: [resolveAlias(node.value, aliases)],
        value: resolveAlias(node.value, aliases),
        item: node.item
      };
    case NodeTag.SchemaCheck:
      return {
        id: node.id,
        tag: node.tag,
        deps: [resolveAlias(node.value, aliases)],
        value: resolveAlias(node.value, aliases),
        schema: node.schema
      };
    case NodeTag.And:
    case NodeTag.Or: {
      const values = resolveAliases(node.values, aliases);
      return {
        id: node.id,
        tag: node.tag,
        deps: values,
        values
      };
    }
    case NodeTag.Return:
      return {
        id: node.id,
        tag: node.tag,
        deps: [resolveAlias(node.control, aliases), resolveAlias(node.value, aliases)],
        control: resolveAlias(node.control, aliases),
        value: resolveAlias(node.value, aliases)
      };
    case NodeTag.Issue:
      return {
        id: node.id,
        tag: node.tag,
        deps: [resolveAlias(node.condition, aliases)],
        condition: resolveAlias(node.condition, aliases),
        path: node.path,
        code: node.code
      };
  }
}

/**
 * @brief resolve aliases function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param values Borrowed input slot named values; validation or normalization happens before stored state changes.
 * @param aliases Borrowed input slot named aliases; validation or normalization happens before stored state changes.
 * @returns Result for resolve aliases; ownership of newly created aggregates is transferred to the caller.
 */
function resolveAliases(
  values: readonly NodeId[],
  aliases: readonly NodeId[]
): NodeId[] {
  const resolved = new Array<NodeId>(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value !== undefined) {
      resolved[index] = resolveAlias(value, aliases);
    }
  }
  return resolved;
}

/**
 * @brief resolve alias function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param aliases Borrowed input slot named aliases; validation or normalization happens before stored state changes.
 * @returns Result for resolve alias; ownership of newly created aggregates is transferred to the caller.
 */
export function resolveAlias(value: NodeId, aliases: readonly NodeId[]): NodeId {
  let current = value;
  let next = aliases[current];
  while (next !== undefined && next !== current) {
    current = next;
    next = aliases[current];
  }
  if (next === undefined) {
    throw new Error("Graph alias points outside graph");
  }
  return current;
}
