/**
 * @file fold-scalar.ts
 * @brief Constant folding for scalar graph nodes.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 */

import { NodeTag } from "../kind/index.js";
import type {
    ArrayEveryNode,
    DiscriminantDispatchNode,
    EqualsNode,
    GetPropNode,
    GraphNode,
    HasOwnDataNode,
    HasOwnNode,
    NodeId,
    NumericCompareNode,
    RecordEveryNode,
    RegexNode,
    StrictKeysNode,
    StringBoundNode,
    TupleItemsNode,
    UnaryPredicateNode
} from "../ir/index.js";
import {
    ensureConst,
    isFiniteNumber,
    isPlainRecord,
    keep,
    readConst,
    replace,
    type FoldResult
} from "./fold-common.js";

/**
 * @brief Fold property reads whose receiver is already a literal constant.
 * @details Lowered graphs never materialize object literals as safe Const data,
 * so a constant receiver cannot provide a trustworthy property slot. The node
 * folds to undefined instead of executing user accessors during optimization.
 * @param node Property-read node to fold.
 * @param nodes Mutable graph node table for constant interning.
 * @param aliases Mutable alias table updated when a constant is inserted.
 * @returns Fold result for the property read.
 */
export function foldGetProp(
    node: GetPropNode,
    nodes: GraphNode[],
    aliases: NodeId[]
): FoldResult {
    const value = readConst(nodes, node.object);
    if (value.found) {
        return replace(node, ensureConst(nodes, aliases, undefined));
    }
    return keep(node);
}

/**
 * @brief Fold unary predicate nodes when their subject is constant.
 * @details Each predicate mirrors the runtime validator's exact primitive test,
 * including finite-number and plain-record semantics, so compile-time folding
 * cannot widen the accepted value set.
 * @param node Unary predicate node to fold.
 * @param nodes Mutable graph node table for constant interning.
 * @param aliases Mutable alias table updated when a constant is inserted.
 * @returns Fold result for the predicate.
 */
export function foldUnary(
    node: UnaryPredicateNode,
    nodes: GraphNode[],
    aliases: NodeId[]
): FoldResult {
    const value = readConst(nodes, node.value);
    if (!value.found) {
        return keep(node);
    }
    switch (node.tag) {
        case NodeTag.IsString:
            return replace(node, ensureConst(nodes, aliases, typeof value.value === "string"));
        case NodeTag.IsNumber:
            return replace(node, ensureConst(nodes, aliases, isFiniteNumber(value.value)));
        case NodeTag.IsBoolean:
            return replace(node, ensureConst(nodes, aliases, typeof value.value === "boolean"));
        case NodeTag.IsObject:
            return replace(node, ensureConst(nodes, aliases, isPlainRecord(value.value)));
        case NodeTag.IsArray:
            return replace(node, ensureConst(nodes, aliases, Array.isArray(value.value)));
        case NodeTag.IsUndefined:
            return replace(node, ensureConst(nodes, aliases, value.value === undefined));
        case NodeTag.IsNull:
            return replace(node, ensureConst(nodes, aliases, value.value === null));
        case NodeTag.IsInteger:
            return replace(node, ensureConst(nodes, aliases, Number.isInteger(value.value)));
        case NodeTag.Not:
            return replace(node, ensureConst(nodes, aliases, value.value !== true));
        case NodeTag.IsBigInt:
            return replace(node, ensureConst(nodes, aliases, typeof value.value === "bigint"));
        case NodeTag.IsSymbol:
            return replace(node, ensureConst(nodes, aliases, typeof value.value === "symbol"));
    }
}

/**
 * @brief Fold literal equality when both operands are constants.
 * @details `Object.is` is used so NaN and negative zero follow TypeSea literal
 * equality semantics instead of JavaScript `===` corner cases.
 * @param node Equality node to fold.
 * @param nodes Mutable graph node table for constant interning.
 * @param aliases Mutable alias table updated when a constant is inserted.
 * @returns Fold result for the equality node.
 */
export function foldEquals(
    node: EqualsNode,
    nodes: GraphNode[],
    aliases: NodeId[]
): FoldResult {
    const left = readConst(nodes, node.left);
    const right = readConst(nodes, node.right);
    if (!left.found || !right.found) {
        return keep(node);
    }
    return replace(node, ensureConst(nodes, aliases, Object.is(left.value, right.value)));
}

/**
 * @brief Fold numeric comparisons with two constant operands.
 * @details Non-number operands fold to false, matching the runtime predicate
 * path where numeric schema checks require number values before comparison.
 * @param node Numeric comparison node to fold.
 * @param nodes Mutable graph node table for constant interning.
 * @param aliases Mutable alias table updated when a constant is inserted.
 * @returns Fold result for the comparison node.
 */
export function foldNumeric(
    node: NumericCompareNode,
    nodes: GraphNode[],
    aliases: NodeId[]
): FoldResult {
    const left = readConst(nodes, node.left);
    const right = readConst(nodes, node.right);
    if (!left.found || !right.found) {
        return keep(node);
    }
    const valid = (
        typeof left.value === "number" && typeof right.value === "number"
    ) || (
        typeof left.value === "bigint" && typeof right.value === "bigint"
    );
    const result = valid && (node.tag === NodeTag.Gte
        ? left.value >= right.value
        : left.value <= right.value);
    return replace(node, ensureConst(nodes, aliases, result));
}

/**
 * @brief Fold string length predicates with a constant subject.
 * @details Non-string subjects fold to false because the separate string guard
 * may later be removed or reordered by boolean simplification.
 * @param node String bound node to fold.
 * @param nodes Mutable graph node table for constant interning.
 * @param aliases Mutable alias table updated when a constant is inserted.
 * @returns Fold result for the string bound node.
 */
export function foldStringBound(
    node: StringBoundNode,
    nodes: GraphNode[],
    aliases: NodeId[]
): FoldResult {
    const value = readConst(nodes, node.value);
    if (!value.found) {
        return keep(node);
    }
    const result = typeof value.value === "string" && (node.tag === NodeTag.StringMin
        ? value.value.length >= node.bound
        : value.value.length <= node.bound);
    return replace(node, ensureConst(nodes, aliases, result));
}

/**
 * @brief Fold regular expression checks with a constant string subject.
 * @details `lastIndex` is reset before and after the test so global or sticky
 * expressions cannot leak state across optimizer and runtime use.
 * @param node Regex node to fold.
 * @param nodes Mutable graph node table for constant interning.
 * @param aliases Mutable alias table updated when a constant is inserted.
 * @returns Fold result for the regex node.
 */
export function foldRegex(
    node: RegexNode,
    nodes: GraphNode[],
    aliases: NodeId[]
): FoldResult {
    const value = readConst(nodes, node.value);
    if (!value.found) {
        return keep(node);
    }
    if (typeof value.value !== "string") {
        return replace(node, ensureConst(nodes, aliases, false));
    }
    node.regex.lastIndex = 0;
    const result = node.regex.test(value.value);
    node.regex.lastIndex = 0;
    return replace(node, ensureConst(nodes, aliases, result));
}

/**
 * @brief Fold own-property presence checks on constant receivers.
 * @details Const nodes do not carry safe object identity, so the optimizer never
 * inspects properties here. A constant receiver means the object check cannot be
 * satisfied through this IR path and folds to false.
 * @param node Own-property check node to fold.
 * @param nodes Mutable graph node table for constant interning.
 * @param aliases Mutable alias table updated when a constant is inserted.
 * @returns Fold result for the own-property check.
 */
export function foldHasOwn(
    node: HasOwnNode,
    nodes: GraphNode[],
    aliases: NodeId[]
): FoldResult {
    const value = readConst(nodes, node.object);
    if (value.found) {
        return replace(node, ensureConst(nodes, aliases, false));
    }
    return keep(node);
}

/**
 * @brief Fold own-data-property checks on constant receivers.
 * @details The optimizer refuses to execute descriptors or getters. Constant
 * receivers therefore fold to false instead of probing runtime object state.
 * @param node Own-data-property check node to fold.
 * @param nodes Mutable graph node table for constant interning.
 * @param aliases Mutable alias table updated when a constant is inserted.
 * @returns Fold result for the data-property check.
 */
export function foldHasOwnData(
    node: HasOwnDataNode,
    nodes: GraphNode[],
    aliases: NodeId[]
): FoldResult {
    const value = readConst(nodes, node.object);
    if (value.found) {
        return replace(node, ensureConst(nodes, aliases, false));
    }
    return keep(node);
}

/**
 * @brief Fold strict-key checks on constant receivers.
 * @details Strict-key validation depends on own property keys. The optimizer
 * does not enumerate runtime objects, so constant receivers fold to false and
 * non-constant receivers stay intact.
 * @param node Strict-key node to fold.
 * @param nodes Mutable graph node table for constant interning.
 * @param aliases Mutable alias table updated when a constant is inserted.
 * @returns Fold result for the strict-key node.
 */
export function foldStrictKeys(
    node: StrictKeysNode,
    nodes: GraphNode[],
    aliases: NodeId[]
): FoldResult {
    const value = readConst(nodes, node.object);
    if (value.found) {
        return replace(node, ensureConst(nodes, aliases, false));
    }
    return keep(node);
}

/**
 * @brief Fold array iteration nodes with constant receivers.
 * @details Iteration semantics require reading runtime indexes and child
 * schemas. Constants cannot safely stand in for arrays here, so the node folds
 * to false only when the receiver is already constant.
 * @param node Array iteration node to fold.
 * @param nodes Mutable graph node table for constant interning.
 * @param aliases Mutable alias table updated when a constant is inserted.
 * @returns Fold result for the array iteration node.
 */
export function foldArrayEvery(
    node: ArrayEveryNode,
    nodes: GraphNode[],
    aliases: NodeId[]
): FoldResult {
    const value = readConst(nodes, node.value);
    if (value.found) {
        return replace(node, ensureConst(nodes, aliases, false));
    }
    return keep(node);
}

/**
 * @brief Fold tuple item checks with constant receivers.
 * @details Tuple validation depends on array length and descriptor-backed item
 * reads, so the optimizer does not simulate it for constant receivers.
 * @param node Tuple item node to fold.
 * @param nodes Mutable graph node table for constant interning.
 * @param aliases Mutable alias table updated when a constant is inserted.
 * @returns Fold result for the tuple item node.
 */
export function foldTupleItems(
    node: TupleItemsNode,
    nodes: GraphNode[],
    aliases: NodeId[]
): FoldResult {
    const value = readConst(nodes, node.value);
    if (value.found) {
        return replace(node, ensureConst(nodes, aliases, false));
    }
    return keep(node);
}

/**
 * @brief Fold record iteration nodes with constant receivers.
 * @details Record validation must enumerate own keys at runtime. The optimizer
 * keeps non-constant records intact and folds constant receivers closed.
 * @param node Record iteration node to fold.
 * @param nodes Mutable graph node table for constant interning.
 * @param aliases Mutable alias table updated when a constant is inserted.
 * @returns Fold result for the record iteration node.
 */
export function foldRecordEvery(
    node: RecordEveryNode,
    nodes: GraphNode[],
    aliases: NodeId[]
): FoldResult {
    const value = readConst(nodes, node.value);
    if (value.found) {
        return replace(node, ensureConst(nodes, aliases, false));
    }
    return keep(node);
}

/**
 * @brief Fold discriminant dispatch nodes with constant receivers.
 * @details Dispatch requires an object tag read, which the optimizer does not
 * perform on constants. Non-constant receivers remain available for codegen.
 * @param node Discriminant dispatch node to fold.
 * @param nodes Mutable graph node table for constant interning.
 * @param aliases Mutable alias table updated when a constant is inserted.
 * @returns Fold result for the dispatch node.
 */
export function foldDiscriminantDispatch(
    node: DiscriminantDispatchNode,
    nodes: GraphNode[],
    aliases: NodeId[]
): FoldResult {
    const value = readConst(nodes, node.value);
    if (value.found) {
        return replace(node, ensureConst(nodes, aliases, false));
    }
    return keep(node);
}
