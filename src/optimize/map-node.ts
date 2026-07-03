/**
 * @file map-node.ts
 * @brief Shared graph node-id mapping utility.
 */

import { NodeTag } from "../kind/index.js";
import type {
  GraphNode,
  NodeId
} from "../ir/index.js";

/**
 * @brief node id mapper.
 * @details Converts one graph node id into the id visible in a rewritten graph.
 * @invariant The caller owns range validation for the returned id.
 */
export type NodeIdMapper = (value: NodeId) => NodeId;

/**
 * @brief map node ids.
 * @details Rebuilds one graph node with all dependency ids rewritten by the supplied mapper.
 * @param node Borrowed graph node; payload fields are reused when their ids do not change.
 * @param mapId Borrowed mapper applied to every dependency-bearing node id.
 * @param id Replacement id for the returned node.
 * @returns Graph node with rewritten id-bearing fields.
 */
export function mapNodeIds(
  node: GraphNode,
  mapId: NodeIdMapper,
  id: NodeId
): GraphNode {
  switch (node.tag) {
    case NodeTag.Start:
      return {
        id,
        tag: node.tag,
        deps: []
      };
    case NodeTag.Param:
      return {
        id,
        tag: node.tag,
        deps: [],
        name: node.name
      };
    case NodeTag.Const:
      return {
        id,
        tag: node.tag,
        deps: [],
        value: node.value
      };
    case NodeTag.GetProp: {
      const object = mapId(node.object);
      return {
        id,
        tag: node.tag,
        deps: [object],
        object,
        key: node.key
      };
    }
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
    case NodeTag.IsSymbol: {
      const value = mapId(node.value);
      return {
        id,
        tag: node.tag,
        deps: [value],
        value
      };
    }
    case NodeTag.Equals:
    case NodeTag.Gte:
    case NodeTag.Lte: {
      const left = mapId(node.left);
      const right = mapId(node.right);
      return {
        id,
        tag: node.tag,
        deps: [left, right],
        left,
        right
      };
    }
    case NodeTag.StringMin:
    case NodeTag.StringMax: {
      const value = mapId(node.value);
      return {
        id,
        tag: node.tag,
        deps: [value],
        value,
        bound: node.bound
      };
    }
    case NodeTag.Regex: {
      const value = mapId(node.value);
      return {
        id,
        tag: node.tag,
        deps: [value],
        value,
        regex: node.regex,
        name: node.name
      };
    }
    case NodeTag.HasOwn: {
      const object = mapId(node.object);
      return {
        id,
        tag: node.tag,
        deps: [object],
        object,
        key: node.key
      };
    }
    case NodeTag.HasOwnData: {
      const object = mapId(node.object);
      return {
        id,
        tag: node.tag,
        deps: [object],
        object,
        key: node.key
      };
    }
    case NodeTag.StrictKeys: {
      const object = mapId(node.object);
      return {
        id,
        tag: node.tag,
        deps: [object],
        object,
        keys: node.keys
      };
    }
    case NodeTag.ArrayEvery: {
      const value = mapId(node.value);
      return {
        id,
        tag: node.tag,
        deps: [value],
        value,
        item: node.item
      };
    }
    case NodeTag.TupleItems: {
      const value = mapId(node.value);
      return {
        id,
        tag: node.tag,
        deps: [value],
        value,
        items: node.items
      };
    }
    case NodeTag.RecordEvery: {
      const value = mapId(node.value);
      return {
        id,
        tag: node.tag,
        deps: [value],
        value,
        item: node.item
      };
    }
    case NodeTag.DiscriminantDispatch: {
      const value = mapId(node.value);
      return {
        id,
        tag: node.tag,
        deps: [value],
        value,
        key: node.key,
        literals: node.literals,
        schemas: node.schemas,
        lookup: node.lookup
      };
    }
    case NodeTag.SchemaCheck: {
      const value = mapId(node.value);
      return {
        id,
        tag: node.tag,
        deps: [value],
        value,
        schema: node.schema
      };
    }
    case NodeTag.And:
    case NodeTag.Or: {
      const values = mapNodeIdArray(node.values, mapId);
      return {
        id,
        tag: node.tag,
        deps: values,
        values
      };
    }
    case NodeTag.Return: {
      const control = mapId(node.control);
      const value = mapId(node.value);
      return {
        id,
        tag: node.tag,
        deps: [control, value],
        control,
        value
      };
    }
  }
}

/**
 * @brief map node id array.
 * @details Applies one mapper to a dense node-id vector.
 * @param values Borrowed input vector.
 * @param mapId Borrowed mapper applied to each slot.
 * @returns New dense vector with mapped ids.
 */
function mapNodeIdArray(
  values: readonly NodeId[],
  mapId: NodeIdMapper
): NodeId[] {
  const mapped = new Array<NodeId>(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value !== undefined) {
      mapped[index] = mapId(value);
    }
  }
  return mapped;
}
