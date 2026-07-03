/**
 * @file types.ts
 * @brief Sea-of-Nodes graph value model.
 */

import { NodeTag } from "../kind/index.js";
import type { LiteralValue, Schema } from "../schema/index.js";

/**
 * @brief node id.
 */
export type NodeId = number;

/**
 * @brief graph node.
 */
export type GraphNode =
  | StartNode
  | ParamNode
  | ConstNode
  | GetPropNode
  | UnaryPredicateNode
  | EqualsNode
  | NumericCompareNode
  | StringBoundNode
  | RegexNode
  | HasOwnNode
  | HasOwnDataNode
  | StrictKeysNode
  | ArrayEveryNode
  | TupleItemsNode
  | RecordEveryNode
  | DiscriminantDispatchNode
  | SchemaCheckNode
  | BooleanFoldNode
  | ReturnNode;

/**
 * @brief graph.
 */
export interface Graph {
  readonly nodes: readonly GraphNode[];
  readonly entry: NodeId;
  readonly result: NodeId;
}

/**
 * @brief start node.
 */
export interface StartNode {
  readonly id: NodeId;
  readonly tag: typeof NodeTag.Start;
  readonly deps: readonly [];
}

/**
 * @brief param node.
 */
export interface ParamNode {
  readonly id: NodeId;
  readonly tag: typeof NodeTag.Param;
  readonly deps: readonly [];
  readonly name: string;
}

/**
 * @brief const node.
 */
export interface ConstNode {
  readonly id: NodeId;
  readonly tag: typeof NodeTag.Const;
  readonly deps: readonly [];
  readonly value: LiteralValue;
}

/**
 * @brief get prop node.
 */
export interface GetPropNode {
  readonly id: NodeId;
  readonly tag: typeof NodeTag.GetProp;
  readonly deps: readonly [NodeId];
  readonly object: NodeId;
  readonly key: string;
}

/**
 * @brief unary predicate node.
 */
export interface UnaryPredicateNode {
  readonly id: NodeId;
  readonly tag:
    | typeof NodeTag.IsString
    | typeof NodeTag.IsNumber
    | typeof NodeTag.IsBoolean
    | typeof NodeTag.IsBigInt
    | typeof NodeTag.IsSymbol
    | typeof NodeTag.IsObject
    | typeof NodeTag.IsArray
    | typeof NodeTag.IsUndefined
    | typeof NodeTag.IsNull
    | typeof NodeTag.IsInteger
    | typeof NodeTag.Not;
  readonly deps: readonly [NodeId];
  readonly value: NodeId;
}

/**
 * @brief equals node.
 */
export interface EqualsNode {
  readonly id: NodeId;
  readonly tag: typeof NodeTag.Equals;
  readonly deps: readonly [NodeId, NodeId];
  readonly left: NodeId;
  readonly right: NodeId;
}

/**
 * @brief numeric compare node.
 */
export interface NumericCompareNode {
  readonly id: NodeId;
  readonly tag: typeof NodeTag.Gte | typeof NodeTag.Lte;
  readonly deps: readonly [NodeId, NodeId];
  readonly left: NodeId;
  readonly right: NodeId;
}

/**
 * @brief string bound node.
 */
export interface StringBoundNode {
  readonly id: NodeId;
  readonly tag: typeof NodeTag.StringMin | typeof NodeTag.StringMax;
  readonly deps: readonly [NodeId];
  readonly value: NodeId;
  readonly bound: number;
}

/**
 * @brief regex node.
 */
export interface RegexNode {
  readonly id: NodeId;
  readonly tag: typeof NodeTag.Regex;
  readonly deps: readonly [NodeId];
  readonly value: NodeId;
  readonly regex: RegExp;
  readonly name: string;
}

/**
 * @brief has own node.
 */
export interface HasOwnNode {
  readonly id: NodeId;
  readonly tag: typeof NodeTag.HasOwn;
  readonly deps: readonly [NodeId];
  readonly object: NodeId;
  readonly key: string;
}

/**
 * @brief has own data node.
 */
export interface HasOwnDataNode {
  readonly id: NodeId;
  readonly tag: typeof NodeTag.HasOwnData;
  readonly deps: readonly [NodeId];
  readonly object: NodeId;
  readonly key: string;
}

/**
 * @brief strict keys node.
 */
export interface StrictKeysNode {
  readonly id: NodeId;
  readonly tag: typeof NodeTag.StrictKeys;
  readonly deps: readonly [NodeId];
  readonly object: NodeId;
  readonly keys: readonly string[];
}

/**
 * @brief array every node.
 */
export interface ArrayEveryNode {
  readonly id: NodeId;
  readonly tag: typeof NodeTag.ArrayEvery;
  readonly deps: readonly [NodeId];
  readonly value: NodeId;
  readonly item: Schema;
}

/**
 * @brief tuple items node.
 */
export interface TupleItemsNode {
  readonly id: NodeId;
  readonly tag: typeof NodeTag.TupleItems;
  readonly deps: readonly [NodeId];
  readonly value: NodeId;
  readonly items: readonly Schema[];
}

/**
 * @brief record every node.
 */
export interface RecordEveryNode {
  readonly id: NodeId;
  readonly tag: typeof NodeTag.RecordEvery;
  readonly deps: readonly [NodeId];
  readonly value: NodeId;
  readonly item: Schema;
}

/**
 * @brief discriminant dispatch lookup.
 */
export type DiscriminantDispatchLookup = Readonly<Record<string, number>>;

/**
 * @brief discriminant dispatch node.
 */
export interface DiscriminantDispatchNode {
  readonly id: NodeId;
  readonly tag: typeof NodeTag.DiscriminantDispatch;
  readonly deps: readonly [NodeId];
  readonly value: NodeId;
  readonly key: string;
  readonly literals: readonly string[];
  readonly schemas: readonly Schema[];
  readonly lookup: DiscriminantDispatchLookup;
}

/**
 * @brief schema check node.
 */
export interface SchemaCheckNode {
  readonly id: NodeId;
  readonly tag: typeof NodeTag.SchemaCheck;
  readonly deps: readonly [NodeId];
  readonly value: NodeId;
  readonly schema: Schema;
}

/**
 * @brief boolean fold node.
 */
export interface BooleanFoldNode {
  readonly id: NodeId;
  readonly tag: typeof NodeTag.And | typeof NodeTag.Or;
  readonly deps: readonly NodeId[];
  readonly values: readonly NodeId[];
}

/**
 * @brief return node.
 */
export interface ReturnNode {
  readonly id: NodeId;
  readonly tag: typeof NodeTag.Return;
  readonly deps: readonly [NodeId, NodeId];
  readonly control: NodeId;
  readonly value: NodeId;
}
