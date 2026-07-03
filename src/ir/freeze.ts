/**
 * @file freeze.ts
 * @brief Immutable graph finalization.
 */

import { NodeTag } from "../kind/index.js";
import { freezeSchema } from "../schema/index.js";
import { isPlainRegExp } from "./regexp.js";
import type { Graph, GraphNode, RegexNode } from "./types.js";

/**
 * @brief freeze graph.
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
 * @brief freeze graph node.
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
    default:
      break;
  }
  Object.freeze(node);
}

/**
 * @brief freeze regex node.
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
 * @brief clone graph reg exp.
 */
function cloneGraphRegExp(regex: RegExp): RegExp {
  const cloned = new RegExp(regex.source, regex.flags);
  Object.preventExtensions(cloned);
  return cloned;
}
