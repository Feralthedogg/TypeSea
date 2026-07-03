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
  EqualsNode,
  GetPropNode,
  Graph,
  GraphNode,
  HasOwnNode,
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
} from "./types.js";
