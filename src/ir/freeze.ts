/**
 * @file freeze.ts
 * @brief Immutable graph finalization.
 */

import { NodeTag } from "../kind/index.js";
import { freezeSchema } from "../schema/index.js";
import { isPlainRegExp } from "./regexp.js";
import type { Graph, GraphNode, RegexNode } from "./types.js";

/**
 * @brief freeze graph function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param graph Borrowed input slot named graph; validation or normalization happens before stored state changes.
 * @returns Result for freeze graph; ownership of newly created aggregates is transferred to the caller.
 */
export function freezeGraph(graph: Graph): Graph {
  for (let index = 0; index < graph.nodes.length; index += 1) {
    const node = graph.nodes[index];
    if (node !== undefined) {
      freezeGraphNode(node);
    }
  }
  Object.freeze(graph.nodes);
  return Object.freeze(graph);
}

/**
 * @brief freeze graph node function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @post No result value is produced; effects are limited to the documented receiver or output buffer.
 */
function freezeGraphNode(node: GraphNode): void {
  Object.freeze(node.deps);
  switch (node.tag) {
    case NodeTag.StrictKeys:
      Object.freeze(node.keys);
      break;
    case NodeTag.Regex:
      freezeRegexNode(node);
      break;
    case NodeTag.ArrayEvery:
      freezeSchema(node.item);
      break;
    case NodeTag.SchemaCheck:
      freezeSchema(node.schema);
      break;
    case NodeTag.And:
    case NodeTag.Or:
      Object.freeze(node.values);
      break;
    case NodeTag.Issue:
      Object.freeze(node.path);
      break;
    default:
      break;
  }
  Object.freeze(node);
}

/**
 * @brief freeze regex node function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @post No result value is produced; effects are limited to the documented receiver or output buffer.
 */
function freezeRegexNode(node: RegexNode): void {
  const regex = node.regex;
  if (!isPlainRegExp(regex)) {
    throw new TypeError("regex node must use a plain RegExp");
  }
  if (Object.isFrozen(node)) {
    if (Object.isExtensible(regex)) {
      throw new TypeError("frozen regex node must contain a non-extensible RegExp");
    }
    return;
  }
  if (!Object.isExtensible(regex)) {
    return;
  }
  Object.defineProperty(node, "regex", {
    configurable: false,
    enumerable: true,
    value: cloneGraphRegExp(regex),
    writable: false
  });
}

/**
 * @brief clone graph reg exp function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param regex Borrowed input slot named regex; validation or normalization happens before stored state changes.
 * @returns Result for clone graph reg exp; ownership of newly created aggregates is transferred to the caller.
 */
function cloneGraphRegExp(regex: RegExp): RegExp {
  const cloned = new RegExp(regex.source, regex.flags);
  Object.preventExtensions(cloned);
  return cloned;
}
