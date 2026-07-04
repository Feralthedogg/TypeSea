/**
 * @file index.ts
 * @brief Public IR module aggregation.
 * @details This barrel keeps public import paths stable while implementation files remain
 * split by responsibility.
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
    ObjectShapeEntry,
    ObjectShapeNode,
    NumericCompareNode,
    ParamNode,
    PrimitiveUnionNode,
    RecordEveryNode,
    RegexNode,
    ReturnNode,
    SchemaCheckNode,
    StartNode,
    StrictKeysNode,
    StringBoundNode,
    TupleItemsNode,
    UnionDispatchMask,
    UnionDispatchNode,
    UnaryPredicateNode
} from "./types.js";
