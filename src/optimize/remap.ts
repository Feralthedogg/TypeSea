/**
 * @file optimize-remap.ts
 * @brief Dense node-id remapping helpers for graph compaction.
 *
 * @section contract Remap contract
 * The caller supplies a mapping from old node slots to compacted slots. Missing
 * slots are programmer faults after reachability has been computed.
 */

import { NodeTag } from "../kind/index.js";
import type {
  ArrayEveryNode,
  BooleanFoldNode,
  ConstNode,
  EqualsNode,
  GetPropNode,
  GraphNode,
  HasOwnNode,
  IssueNode,
  LengthNode,
  NodeId,
  NumericCompareNode,
  ParamNode,
  RegexNode,
  ReturnNode,
  SchemaCheckNode,
  StartNode,
  StrictKeysNode,
  StringBoundNode,
  UnaryPredicateNode
} from "../ir/index.js";

/**
 * @brief remap node function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param remap Borrowed input slot named remap; validation or normalization happens before stored state changes.
 * @returns Result for remap node; ownership of newly created aggregates is transferred to the caller.
 */
export function remapNode(
  node: GraphNode,
  remap: readonly NodeId[]
): GraphNode {
  switch (node.tag) {
    case NodeTag.Start:
      return remapStart(node, remap);
    case NodeTag.Param:
      return remapParam(node, remap);
    case NodeTag.Const:
      return remapConst(node, remap);
    case NodeTag.GetProp:
      return remapGetProp(node, remap);
    case NodeTag.Length:
      return remapLength(node, remap);
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
      return remapUnary(node, remap);
    case NodeTag.Equals:
      return remapEquals(node, remap);
    case NodeTag.Gte:
    case NodeTag.Lte:
      return remapNumeric(node, remap);
    case NodeTag.StringMin:
    case NodeTag.StringMax:
      return remapStringBound(node, remap);
    case NodeTag.Regex:
      return remapRegex(node, remap);
    case NodeTag.HasOwn:
      return remapHasOwn(node, remap);
    case NodeTag.StrictKeys:
      return remapStrictKeys(node, remap);
    case NodeTag.ArrayEvery:
      return remapArrayEvery(node, remap);
    case NodeTag.SchemaCheck:
      return remapSchemaCheck(node, remap);
    case NodeTag.And:
    case NodeTag.Or:
      return remapBooleanFold(node, remap);
    case NodeTag.Return:
      return remapReturn(node, remap);
    case NodeTag.Issue:
      return remapIssue(node, remap);
  }
}

/**
 * @brief remap id function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param remap Borrowed input slot named remap; validation or normalization happens before stored state changes.
 * @returns Result for remap id; ownership of newly created aggregates is transferred to the caller.
 */
export function remapId(value: NodeId, remap: readonly NodeId[]): NodeId {
  const mapped = remap[value];
  if (mapped === undefined) {
    throw new Error("Unreachable dependency escaped graph optimization");
  }
  return mapped;
}

/**
 * @brief remap start function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param remap Borrowed input slot named remap; validation or normalization happens before stored state changes.
 * @returns Result for remap start; ownership of newly created aggregates is transferred to the caller.
 */
function remapStart(node: StartNode, remap: readonly NodeId[]): StartNode {
  return {
    id: remapId(node.id, remap),
    tag: node.tag,
    deps: []
  };
}

/**
 * @brief remap param function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param remap Borrowed input slot named remap; validation or normalization happens before stored state changes.
 * @returns Result for remap param; ownership of newly created aggregates is transferred to the caller.
 */
function remapParam(node: ParamNode, remap: readonly NodeId[]): ParamNode {
  return {
    id: remapId(node.id, remap),
    tag: node.tag,
    deps: [],
    name: node.name
  };
}

/**
 * @brief remap const function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param remap Borrowed input slot named remap; validation or normalization happens before stored state changes.
 * @returns Result for remap const; ownership of newly created aggregates is transferred to the caller.
 */
function remapConst(node: ConstNode, remap: readonly NodeId[]): ConstNode {
  return {
    id: remapId(node.id, remap),
    tag: node.tag,
    deps: [],
    value: node.value
  };
}

/**
 * @brief remap get prop function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param remap Borrowed input slot named remap; validation or normalization happens before stored state changes.
 * @returns Result for remap get prop; ownership of newly created aggregates is transferred to the caller.
 */
function remapGetProp(node: GetPropNode, remap: readonly NodeId[]): GetPropNode {
  return {
    id: remapId(node.id, remap),
    tag: node.tag,
    deps: [remapId(node.object, remap)],
    object: remapId(node.object, remap),
    key: node.key
  };
}

/**
 * @brief remap length function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param remap Borrowed input slot named remap; validation or normalization happens before stored state changes.
 * @returns Result for remap length; ownership of newly created aggregates is transferred to the caller.
 */
function remapLength(node: LengthNode, remap: readonly NodeId[]): LengthNode {
  return {
    id: remapId(node.id, remap),
    tag: node.tag,
    deps: [remapId(node.value, remap)],
    value: remapId(node.value, remap)
  };
}

/**
 * @brief remap unary function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param remap Borrowed input slot named remap; validation or normalization happens before stored state changes.
 * @returns Result for remap unary; ownership of newly created aggregates is transferred to the caller.
 */
function remapUnary(
  node: UnaryPredicateNode,
  remap: readonly NodeId[]
): UnaryPredicateNode {
  return {
    id: remapId(node.id, remap),
    tag: node.tag,
    deps: [remapId(node.value, remap)],
    value: remapId(node.value, remap)
  };
}

/**
 * @brief remap equals function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param remap Borrowed input slot named remap; validation or normalization happens before stored state changes.
 * @returns Result for remap equals; ownership of newly created aggregates is transferred to the caller.
 */
function remapEquals(node: EqualsNode, remap: readonly NodeId[]): EqualsNode {
  return {
    id: remapId(node.id, remap),
    tag: node.tag,
    deps: [remapId(node.left, remap), remapId(node.right, remap)],
    left: remapId(node.left, remap),
    right: remapId(node.right, remap)
  };
}

/**
 * @brief remap numeric function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param remap Borrowed input slot named remap; validation or normalization happens before stored state changes.
 * @returns Result for remap numeric; ownership of newly created aggregates is transferred to the caller.
 */
function remapNumeric(
  node: NumericCompareNode,
  remap: readonly NodeId[]
): NumericCompareNode {
  return {
    id: remapId(node.id, remap),
    tag: node.tag,
    deps: [remapId(node.left, remap), remapId(node.right, remap)],
    left: remapId(node.left, remap),
    right: remapId(node.right, remap)
  };
}

/**
 * @brief remap string bound function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param remap Borrowed input slot named remap; validation or normalization happens before stored state changes.
 * @returns Result for remap string bound; ownership of newly created aggregates is transferred to the caller.
 */
function remapStringBound(
  node: StringBoundNode,
  remap: readonly NodeId[]
): StringBoundNode {
  return {
    id: remapId(node.id, remap),
    tag: node.tag,
    deps: [remapId(node.value, remap)],
    value: remapId(node.value, remap),
    bound: node.bound
  };
}

/**
 * @brief remap regex function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param remap Borrowed input slot named remap; validation or normalization happens before stored state changes.
 * @returns Result for remap regex; ownership of newly created aggregates is transferred to the caller.
 */
function remapRegex(node: RegexNode, remap: readonly NodeId[]): RegexNode {
  return {
    id: remapId(node.id, remap),
    tag: node.tag,
    deps: [remapId(node.value, remap)],
    value: remapId(node.value, remap),
    regex: node.regex,
    name: node.name
  };
}

/**
 * @brief remap has own function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param remap Borrowed input slot named remap; validation or normalization happens before stored state changes.
 * @returns Result for remap has own; ownership of newly created aggregates is transferred to the caller.
 */
function remapHasOwn(node: HasOwnNode, remap: readonly NodeId[]): HasOwnNode {
  return {
    id: remapId(node.id, remap),
    tag: node.tag,
    deps: [remapId(node.object, remap)],
    object: remapId(node.object, remap),
    key: node.key
  };
}

/**
 * @brief remap strict keys function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param remap Borrowed input slot named remap; validation or normalization happens before stored state changes.
 * @returns Result for remap strict keys; ownership of newly created aggregates is transferred to the caller.
 */
function remapStrictKeys(
  node: StrictKeysNode,
  remap: readonly NodeId[]
): StrictKeysNode {
  return {
    id: remapId(node.id, remap),
    tag: node.tag,
    deps: [remapId(node.object, remap)],
    object: remapId(node.object, remap),
    keys: node.keys
  };
}

/**
 * @brief remap array every function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param remap Borrowed input slot named remap; validation or normalization happens before stored state changes.
 * @returns Result for remap array every; ownership of newly created aggregates is transferred to the caller.
 */
function remapArrayEvery(
  node: ArrayEveryNode,
  remap: readonly NodeId[]
): ArrayEveryNode {
  return {
    id: remapId(node.id, remap),
    tag: node.tag,
    deps: [remapId(node.value, remap)],
    value: remapId(node.value, remap),
    item: node.item
  };
}

/**
 * @brief remap schema check function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param remap Borrowed input slot named remap; validation or normalization happens before stored state changes.
 * @returns Result for remap schema check; ownership of newly created aggregates is transferred to the caller.
 */
function remapSchemaCheck(
  node: SchemaCheckNode,
  remap: readonly NodeId[]
): SchemaCheckNode {
  return {
    id: remapId(node.id, remap),
    tag: node.tag,
    deps: [remapId(node.value, remap)],
    value: remapId(node.value, remap),
    schema: node.schema
  };
}

/**
 * @brief remap boolean fold function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param remap Borrowed input slot named remap; validation or normalization happens before stored state changes.
 * @returns Result for remap boolean fold; ownership of newly created aggregates is transferred to the caller.
 */
function remapBooleanFold(
  node: BooleanFoldNode,
  remap: readonly NodeId[]
): BooleanFoldNode {
  return {
    id: remapId(node.id, remap),
    tag: node.tag,
    deps: remapIds(node.deps, remap),
    values: remapIds(node.values, remap)
  };
}

/**
 * @brief remap return function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param remap Borrowed input slot named remap; validation or normalization happens before stored state changes.
 * @returns Result for remap return; ownership of newly created aggregates is transferred to the caller.
 */
function remapReturn(node: ReturnNode, remap: readonly NodeId[]): ReturnNode {
  return {
    id: remapId(node.id, remap),
    tag: node.tag,
    deps: [remapId(node.control, remap), remapId(node.value, remap)],
    control: remapId(node.control, remap),
    value: remapId(node.value, remap)
  };
}

/**
 * @brief remap issue function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param node Borrowed input slot named node; validation or normalization happens before stored state changes.
 * @param remap Borrowed input slot named remap; validation or normalization happens before stored state changes.
 * @returns Result for remap issue; ownership of newly created aggregates is transferred to the caller.
 */
function remapIssue(node: IssueNode, remap: readonly NodeId[]): IssueNode {
  return {
    id: remapId(node.id, remap),
    tag: node.tag,
    deps: [remapId(node.condition, remap)],
    condition: remapId(node.condition, remap),
    path: node.path,
    code: node.code
  };
}

/**
 * @brief remap ids function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param values Borrowed input slot named values; validation or normalization happens before stored state changes.
 * @param remap Borrowed input slot named remap; validation or normalization happens before stored state changes.
 * @returns Result for remap ids; ownership of newly created aggregates is transferred to the caller.
 */
function remapIds(values: readonly NodeId[], remap: readonly NodeId[]): NodeId[] {
  const result = new Array<NodeId>(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value !== undefined) {
      result[index] = remapId(value, remap);
    }
  }
  return result;
}
