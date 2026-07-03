/**
 * @file index.ts
 * @brief Public IR module aggregation.
 */

export { GraphBuilder } from "./builder.js";
export { freezeGraph } from "./freeze.js";
export { isGraphValue } from "./validate.js";
export type {
  ArrayEveryNode,
  BooleanFoldNode,
  ConstNode,
  DiscriminantDispatchLookup,
  DiscriminantDispatchNode,
  EqualsNode,
  GetPropNode,
  Graph,
  GraphNode,
  HasOwnDataNode,
  HasOwnNode,
  NodeId,
  NumericCompareNode,
  ParamNode,
  RecordEveryNode,
  RegexNode,
  ReturnNode,
  SchemaCheckNode,
  StartNode,
  StrictKeysNode,
  StringBoundNode,
  TupleItemsNode,
  UnaryPredicateNode
} from "./types.js";
