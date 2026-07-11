/**
 * @file types.ts
 * @brief Sea-of-Nodes graph value model.
 */

import { NodeTag, type ObjectModeTag, type PresenceTag } from "../kind/index.js";
import type { ArrayCheck, LiteralValue, Schema } from "../schema/index.js";

/**
 * @brief Dense index into Graph.nodes.
 * @details Node ids are arena-local and may change after graph rewrites.
 */
export type NodeId = number;

/** @brief Closed union of operations stored in a validation graph arena. */
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
    | PresenceDispatchNode
    | ObjectShapeNode
    | UnionDispatchNode
    | PrimitiveUnionNode
    | SchemaCheckNode
    | BooleanFoldNode
    | ReturnNode;

/**
 * @brief Immutable validation graph.
 * @details entry is the control anchor, result is the boolean value consumed by
 * compiled predicates and introspection tools.
 */
export interface Graph {
    readonly nodes: readonly GraphNode[];
    readonly entry: NodeId;
    readonly result: NodeId;
}

/** @brief Control anchor that owns no value dependencies. */
export interface StartNode {
    readonly id: NodeId;
    readonly tag: typeof NodeTag.Start;
    readonly deps: readonly [];
}

/** @brief External graph input identified by a diagnostic name. */
export interface ParamNode {
    readonly id: NodeId;
    readonly tag: typeof NodeTag.Param;
    readonly deps: readonly [];
    readonly name: string;
}

/** @brief Literal value embedded directly in the graph. */
export interface ConstNode {
    readonly id: NodeId;
    readonly tag: typeof NodeTag.Const;
    readonly deps: readonly [];
    readonly value: LiteralValue;
}

/** @brief Own-property load candidate lowered from an object field. */
export interface GetPropNode {
    readonly id: NodeId;
    readonly tag: typeof NodeTag.GetProp;
    readonly deps: readonly [NodeId];
    readonly object: NodeId;
    readonly key: string;
}

/** @brief Single-input type, nullability, integer, or negation predicate. */
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

/** @brief Identity comparison between two graph values. */
export interface EqualsNode {
    readonly id: NodeId;
    readonly tag: typeof NodeTag.Equals;
    readonly deps: readonly [NodeId, NodeId];
    readonly left: NodeId;
    readonly right: NodeId;
}

/** @brief Inclusive numeric comparison between graph values. */
export interface NumericCompareNode {
    readonly id: NodeId;
    readonly tag: typeof NodeTag.Gte | typeof NodeTag.Lte;
    readonly deps: readonly [NodeId, NodeId];
    readonly left: NodeId;
    readonly right: NodeId;
}

/** @brief String length comparison against a compile-time bound. */
export interface StringBoundNode {
    readonly id: NodeId;
    readonly tag: typeof NodeTag.StringMin | typeof NodeTag.StringMax;
    readonly deps: readonly [NodeId];
    readonly value: NodeId;
    readonly bound: number;
}

/** @brief Regular-expression test retaining its diagnostic name. */
export interface RegexNode {
    readonly id: NodeId;
    readonly tag: typeof NodeTag.Regex;
    readonly deps: readonly [NodeId];
    readonly value: NodeId;
    readonly regex: RegExp;
    readonly name: string;
}

/** @brief Own-property presence test that does not inspect the value slot. */
export interface HasOwnNode {
    readonly id: NodeId;
    readonly tag: typeof NodeTag.HasOwn;
    readonly deps: readonly [NodeId];
    readonly object: NodeId;
    readonly key: string;
}

/** @brief Own data-property proof that rejects accessor descriptors. */
export interface HasOwnDataNode {
    readonly id: NodeId;
    readonly tag: typeof NodeTag.HasOwnData;
    readonly deps: readonly [NodeId];
    readonly object: NodeId;
    readonly key: string;
}

/** @brief Exact own-key-set check for strict object validation. */
export interface StrictKeysNode {
    readonly id: NodeId;
    readonly tag: typeof NodeTag.StrictKeys;
    readonly deps: readonly [NodeId];
    readonly object: NodeId;
    readonly keys: readonly string[];
}

/**
 * @brief Homogeneous array loop with a lowered child graph for each item.
 * @details The original schema is retained for diagnostics and opaque fallback;
 * boolean compilation consumes itemGraph first.
 */
export interface ArrayEveryNode {
    readonly id: NodeId;
    readonly tag: typeof NodeTag.ArrayEvery;
    readonly deps: readonly [NodeId];
    readonly value: NodeId;
    readonly item: Schema;
    readonly checks: readonly ArrayCheck[];
    readonly itemGraph: Graph;
}

/**
 * @brief Fixed-index tuple check with one child graph per item.
 * @details Codegen can emit straight-line descriptor reads because the item
 * count is known at lowering time.
 */
export interface TupleItemsNode {
    readonly id: NodeId;
    readonly tag: typeof NodeTag.TupleItems;
    readonly deps: readonly [NodeId];
    readonly value: NodeId;
    readonly items: readonly Schema[];
    readonly itemGraphs: readonly Graph[];
}

/**
 * @brief Own-key record loop with a lowered graph for each value.
 * @details The loop must skip inherited enumerable properties even when user
 * input has a hostile prototype.
 */
export interface RecordEveryNode {
    readonly id: NodeId;
    readonly tag: typeof NodeTag.RecordEvery;
    readonly deps: readonly [NodeId];
    readonly value: NodeId;
    readonly item: Schema;
    readonly itemGraph: Graph;
}

/** @brief Immutable discriminant-to-branch index table. */
export type DiscriminantDispatchLookup = Readonly<Record<string, number>>;

/**
 * @brief Object union dispatch keyed by one literal property.
 * @details The lookup table lets codegen choose a branch before validating the
 * whole object, avoiding linear scans on tagged unions.
 */
export interface DiscriminantDispatchNode {
    readonly id: NodeId;
    readonly tag: typeof NodeTag.DiscriminantDispatch;
    readonly deps: readonly [NodeId];
    readonly value: NodeId;
    readonly key: string;
    readonly literals: readonly string[];
    readonly schemas: readonly Schema[];
    readonly graphs: readonly Graph[];
    readonly lookup: DiscriminantDispatchLookup;
}

/**
 * @brief Object union dispatch gated by required field presence.
 * @details The key vector is aligned with the source union options. A string key
 * lets codegen skip that branch when the candidate object cannot satisfy the
 * required field. Undefined keeps ordinary branch probing for fallback arms.
 */
export interface PresenceDispatchNode {
    readonly id: NodeId;
    readonly tag: typeof NodeTag.PresenceDispatch;
    readonly deps: readonly [NodeId];
    readonly value: NodeId;
    readonly keys: readonly (string | undefined)[];
    readonly options: readonly Schema[];
    readonly graphs: readonly Graph[];
    readonly masks: readonly UnionDispatchMask[];
}

/**
 * @brief Object field schema paired with its lowered validation graph.
 * @details Presence is stored beside the graph so object compilation can choose
 * between required fast paths and optional descriptor checks.
 */
export interface ObjectShapeEntry {
    readonly key: string;
    readonly schema: Schema;
    readonly graph: Graph;
    readonly presence: PresenceTag;
}

/**
 * @brief Structured object check after lowering a declared shape.
 * @details allRequired enables strict object fast paths that avoid optional
 * property branching when every field must exist.
 */
export interface ObjectShapeNode {
    readonly id: NodeId;
    readonly tag: typeof NodeTag.ObjectShape;
    readonly deps: readonly [NodeId];
    readonly value: NodeId;
    readonly entries: readonly ObjectShapeEntry[];
    readonly keys: readonly string[];
    readonly mode: ObjectModeTag;
    readonly catchall: Schema | undefined;
    readonly catchallGraph: Graph | undefined;
    readonly allRequired: boolean;
}

/**
 * @brief Bit mask of possible root JavaScript kinds for a union arm.
 */
export type UnionDispatchMask = number;

/**
 * @brief General union dispatch with coarse root-kind partitioning.
 * @details Masks let codegen skip arms whose root type cannot match before
 * entering their child graphs.
 */
export interface UnionDispatchNode {
    readonly id: NodeId;
    readonly tag: typeof NodeTag.UnionDispatch;
    readonly deps: readonly [NodeId];
    readonly value: NodeId;
    readonly options: readonly Schema[];
    readonly graphs: readonly Graph[];
    readonly masks: readonly UnionDispatchMask[];
}

/**
 * @brief Union specialized to primitive arms only.
 * @details This node avoids object/array bookkeeping and emits a compact
 * typeof/switch style predicate.
 */
export interface PrimitiveUnionNode {
    readonly id: NodeId;
    readonly tag: typeof NodeTag.PrimitiveUnion;
    readonly deps: readonly [NodeId];
    readonly value: NodeId;
    readonly graphs: readonly Graph[];
    readonly masks: readonly UnionDispatchMask[];
}

/**
 * @brief Opaque schema fallback retained when lowering cannot express a rule.
 * @details New optimizations should reduce the number of SchemaCheck nodes on
 * hot paths, not teach consumers to reinterpret arbitrary schema trees.
 */
export interface SchemaCheckNode {
    readonly id: NodeId;
    readonly tag: typeof NodeTag.SchemaCheck;
    readonly deps: readonly [NodeId];
    readonly value: NodeId;
    readonly schema: Schema;
}

/**
 * @brief Variadic boolean combiner.
 * @details Optimization passes flatten nested folds so codegen can emit one
 * predictable branch chain.
 */
export interface BooleanFoldNode {
    readonly id: NodeId;
    readonly tag: typeof NodeTag.And | typeof NodeTag.Or;
    readonly deps: readonly NodeId[];
    readonly values: readonly NodeId[];
}

/** @brief Graph return joining one control anchor and one boolean result. */
export interface ReturnNode {
    readonly id: NodeId;
    readonly tag: typeof NodeTag.Return;
    readonly deps: readonly [NodeId, NodeId];
    readonly control: NodeId;
    readonly value: NodeId;
}
