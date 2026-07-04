/**
 * @file fold-boolean.ts
 * @brief Constant folding for boolean fold nodes.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 */

import type {
    BooleanFoldNode,
    GraphNode,
    NodeId
} from "../ir/index.js";
import {
    ensureConst,
    keep,
    readConst,
    replace,
    type FoldResult
} from "./fold-common.js";
import {
    flattenBooleanValues,
    simplifyAndValues,
    simplifyOrValues
} from "./algebraic.js";
import {
    canonicalizeAndValues,
    canonicalizeOrValues
} from "./fold-constraints.js";

/**
 * @brief Simplify an `And` fold node using boolean identities and constraints.
 * @details False annihilates the whole conjunction, true disappears, nested
 * conjunctions are flattened, and scalar constraints are canonicalized after
 * algebraic simplification.
 * @param node Boolean fold node to simplify.
 * @param nodes Mutable graph node table for constant interning.
 * @param aliases Mutable alias table updated when a constant is inserted.
 * @returns Fold result for the conjunction.
 */
export function foldAnd(
    node: BooleanFoldNode,
    nodes: GraphNode[],
    aliases: NodeId[]
): FoldResult {
    const values: NodeId[] = [];
    const flattened = flattenBooleanValues(node.values, nodes, node.tag);
    for (let index = 0; index < flattened.length; index += 1) {
        const value = flattened[index];
        if (value === undefined) {
            continue;
        }
        const constant = readConst(nodes, value);
        if (constant.found) {
            if (constant.value !== true) {
                return replace(node, ensureConst(nodes, aliases, false));
            }
            continue;
        }
        values.push(value);
    }
    if (values.length === 0) {
        return replace(node, ensureConst(nodes, aliases, true));
    }
    const algebraic = simplifyAndValues(values, nodes);
    if (algebraic.contradiction) {
        return replace(node, ensureConst(nodes, aliases, false));
    }
    if (algebraic.values.length === 0) {
        return replace(node, ensureConst(nodes, aliases, true));
    }
    const canonical = canonicalizeAndValues(algebraic.values, nodes);
    if (canonical.contradiction) {
        return replace(node, ensureConst(nodes, aliases, false));
    }
    const canonicalValues = canonical.values;
    if (canonicalValues.length === 0) {
        return replace(node, ensureConst(nodes, aliases, true));
    }
    if (canonicalValues.length === 1) {
        const only = canonicalValues[0];
        if (only !== undefined) {
            return replace(node, only);
        }
    }
    return keep({
        id: node.id,
        tag: node.tag,
        deps: canonicalValues,
        values: canonicalValues
    });
}

/**
 * @brief Simplify an `Or` fold node using boolean identities and tautologies.
 * @details True satisfies the whole disjunction, false disappears, nested
 * disjunctions are flattened, and duplicate surviving arms are removed.
 * @param node Boolean fold node to simplify.
 * @param nodes Mutable graph node table for constant interning.
 * @param aliases Mutable alias table updated when a constant is inserted.
 * @returns Fold result for the disjunction.
 */
export function foldOr(
    node: BooleanFoldNode,
    nodes: GraphNode[],
    aliases: NodeId[]
): FoldResult {
    const values: NodeId[] = [];
    const flattened = flattenBooleanValues(node.values, nodes, node.tag);
    for (let index = 0; index < flattened.length; index += 1) {
        const value = flattened[index];
        if (value === undefined) {
            continue;
        }
        const constant = readConst(nodes, value);
        if (constant.found) {
            if (constant.value === true) {
                return replace(node, ensureConst(nodes, aliases, true));
            }
            continue;
        }
        values.push(value);
    }
    if (values.length === 0) {
        return replace(node, ensureConst(nodes, aliases, false));
    }
    const algebraic = simplifyOrValues(values, nodes);
    if (algebraic.tautology) {
        return replace(node, ensureConst(nodes, aliases, true));
    }
    if (algebraic.values.length === 0) {
        return replace(node, ensureConst(nodes, aliases, false));
    }
    const canonicalValues = canonicalizeOrValues(algebraic.values);
    if (canonicalValues.length === 0) {
        return replace(node, ensureConst(nodes, aliases, false));
    }
    if (canonicalValues.length === 1) {
        const only = canonicalValues[0];
        if (only !== undefined) {
            return replace(node, only);
        }
    }
    return keep({
        id: node.id,
        tag: node.tag,
        deps: canonicalValues,
        values: canonicalValues
    });
}
