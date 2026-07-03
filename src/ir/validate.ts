/**
 * @file validate.ts
 * @brief Runtime validation for graph objects.
 */

import { NodeTag } from "../kind/index.js";
import {
  isLiteralValue,
  isSchemaValue
} from "../schema/index.js";
import { isPlainRegExp } from "./regexp.js";
import type { Graph, GraphNode, NodeId } from "./types.js";

/**
 * @brief is graph value.
 */
export function isGraphValue(value: unknown): value is Graph {
  if (!isRecord(value)) {
    return false;
  }
  const nodes = value["nodes"];
  if (!isUnknownArray(nodes)) {
    return false;
  }
  if (!isNodeId(value["entry"], nodes.length) ||
    !isNodeId(value["result"], nodes.length)) {
    return false;
  }
  for (let index = 0; index < nodes.length; index += 1) {
    if (!isGraphNodeValue(nodes[index], index, nodes.length)) {
      return false;
    }
  }
  const entry = nodes[value["entry"]];
  const result = nodes[value["result"]];
  return isRecord(entry) && entry["tag"] === NodeTag.Start &&
    isRecord(result) && result["tag"] === NodeTag.Return;
}

/**
 * @brief is graph node value.
 */
function isGraphNodeValue(
  value: unknown,
  index: number,
  nodeCount: number
): value is GraphNode {
  if (!isRecord(value) || value["id"] !== index) {
    return false;
  }
  const deps = value["deps"];
  if (!isNodeIdArray(deps, nodeCount)) {
    return false;
  }
  switch (value["tag"]) {
    case NodeTag.Start:
    case NodeTag.Param:
    case NodeTag.Const:
      return isLeafNodeValue(value, deps);
    case NodeTag.GetProp:
      return typeof value["key"] === "string" &&
        isSingleDepNode(value, deps, "object", nodeCount);
    case NodeTag.IsString:
    case NodeTag.IsNumber:
    case NodeTag.IsBoolean:
    case NodeTag.IsBigInt:
    case NodeTag.IsSymbol:
    case NodeTag.IsObject:
    case NodeTag.IsArray:
    case NodeTag.IsUndefined:
    case NodeTag.IsNull:
    case NodeTag.IsInteger:
    case NodeTag.Not:
      return isSingleDepNode(value, deps, "value", nodeCount);
    case NodeTag.Equals:
    case NodeTag.Gte:
    case NodeTag.Lte:
      return isTwoDepNode(value, deps, "left", "right", nodeCount);
    case NodeTag.StringMin:
    case NodeTag.StringMax:
      return typeof value["bound"] === "number" &&
        Number.isInteger(value["bound"]) &&
        value["bound"] >= 0 &&
        isSingleDepNode(value, deps, "value", nodeCount);
    case NodeTag.Regex:
      return isPlainRegExp(value["regex"]) &&
        typeof value["name"] === "string" &&
        isSingleDepNode(value, deps, "value", nodeCount);
    case NodeTag.HasOwn:
    case NodeTag.HasOwnData:
      return typeof value["key"] === "string" &&
        isSingleDepNode(value, deps, "object", nodeCount);
    case NodeTag.StrictKeys:
      return isStringArray(value["keys"]) &&
        isSingleDepNode(value, deps, "object", nodeCount);
    case NodeTag.ArrayEvery:
      return isSchemaValue(value["item"]) &&
        isSingleDepNode(value, deps, "value", nodeCount);
    case NodeTag.TupleItems:
      return isSchemaArray(value["items"]) &&
        isSingleDepNode(value, deps, "value", nodeCount);
    case NodeTag.RecordEvery:
      return isSchemaValue(value["item"]) &&
        isSingleDepNode(value, deps, "value", nodeCount);
    case NodeTag.DiscriminantDispatch:
      return typeof value["key"] === "string" &&
        isStringArray(value["literals"]) &&
        isSchemaArray(value["schemas"]) &&
        isDiscriminantLookup(value["lookup"], value["literals"]) &&
        value["literals"].length === value["schemas"].length &&
        isSingleDepNode(value, deps, "value", nodeCount);
    case NodeTag.SchemaCheck:
      return isSchemaValue(value["schema"]) &&
        isSingleDepNode(value, deps, "value", nodeCount);
    case NodeTag.And:
    case NodeTag.Or:
      return isNodeIdArray(value["values"], nodeCount) &&
        sameNodeIds(deps, value["values"]);
    case NodeTag.Return:
      return isTwoDepNode(value, deps, "control", "value", nodeCount);
    default:
      return false;
  }
}

/**
 * @brief is leaf node value.
 */
function isLeafNodeValue(
  value: Readonly<Record<string, unknown>>,
  deps: readonly NodeId[]
): boolean {
  if (deps.length !== 0) {
    return false;
  }
  switch (value["tag"]) {
    case NodeTag.Start:
      return true;
    case NodeTag.Param:
      return typeof value["name"] === "string";
    case NodeTag.Const:
      return isLiteralValue(value["value"]);
    default:
      return false;
  }
}

/**
 * @brief is single dep node.
 */
function isSingleDepNode(
  value: Readonly<Record<string, unknown>>,
  deps: readonly NodeId[],
  field: string,
  nodeCount: number
): boolean {
  return deps.length === 1 &&
    isNodeId(value[field], nodeCount) &&
    deps[0] === value[field];
}

/**
 * @brief is two dep node.
 */
function isTwoDepNode(
  value: Readonly<Record<string, unknown>>,
  deps: readonly NodeId[],
  leftField: string,
  rightField: string,
  nodeCount: number
): boolean {
  return deps.length === 2 &&
    isNodeId(value[leftField], nodeCount) &&
    isNodeId(value[rightField], nodeCount) &&
    deps[0] === value[leftField] &&
    deps[1] === value[rightField];
}

/**
 * @brief is node id.
 */
function isNodeId(value: unknown, nodeCount: number): value is NodeId {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value < nodeCount;
}

/**
 * @brief is node id array.
 */
function isNodeIdArray(
  value: unknown,
  nodeCount: number
): value is readonly NodeId[] {
  if (!isUnknownArray(value)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!isNodeId(value[index], nodeCount)) {
      return false;
    }
  }
  return true;
}

/**
 * @brief same node ids.
 */
function sameNodeIds(
  left: readonly NodeId[],
  right: readonly NodeId[]
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

/**
 * @brief is string array.
 */
function isStringArray(value: unknown): value is readonly string[] {
  if (!isUnknownArray(value)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== "string") {
      return false;
    }
  }
  return true;
}

/**
 * @brief is schema array.
 */
function isSchemaArray(value: unknown): value is readonly unknown[] {
  if (!isUnknownArray(value)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!isSchemaValue(value[index])) {
      return false;
    }
  }
  return true;
}

/**
 * @brief is discriminant lookup.
 */
function isDiscriminantLookup(
  value: unknown,
  literals: readonly unknown[]
): value is Readonly<Record<string, number>> {
  if (!isRecord(value)) {
    return false;
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== literals.length) {
    return false;
  }
  for (let index = 0; index < literals.length; index += 1) {
    const literal = literals[index];
    if (typeof literal !== "string" ||
      value[literal] !== index) {
      return false;
    }
  }
  return true;
}

/**
 * @brief is record.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    hasOnlyDataProperties(value);
}

/**
 * @brief is unknown array.
 */
function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value) && hasOnlyDataProperties(value);
}

/**
 * @brief has only data properties.
 * @details Rejects accessor descriptors before graph internals read fields by key.
 * @returns True when every own property is backed by a data slot.
 */
function hasOnlyDataProperties(value: object): boolean {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const descriptorMap = descriptors as Record<PropertyKey, PropertyDescriptor | undefined>;
  const keys = Reflect.ownKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === undefined) {
      continue;
    }
    const descriptor = descriptorMap[key];
    if (descriptor === undefined ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
      return false;
    }
  }
  return true;
}
