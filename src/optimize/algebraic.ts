/**
 * @file algebraic.ts
 * @brief Boolean algebra simplification for validation predicates.
 */

import { NodeTag } from "../kind/index.js";
import type {
    GraphNode,
    NodeId
} from "../ir/index.js";

/** @brief One algebraic rewrite candidate and its replacement node id. */
export interface AlgebraicFold {
    /**
     * @brief True when an And fold has proven false.
     * @details The caller replaces the whole conjunction with a constant false node.
     */
    readonly contradiction: boolean;

    /**
     * @brief True when an Or fold has proven true.
     * @details The caller replaces the whole disjunction with a constant true node.
     */
    readonly tautology: boolean;

    /**
     * @brief Remaining operand ids after algebraic simplification.
     * @details Operand order is preserved so generated code keeps stable branch ordering.
     */
    readonly values: readonly NodeId[];
}

/**
 * @brief Flatten nested boolean folds of the same kind.
 * @param values Input operand ids.
 * @param nodes Graph node table used to inspect nested folds.
 * @param tag Boolean fold kind to flatten.
 * @returns Operand list with same-kind nested folds expanded in place.
 */
export function flattenBooleanValues(
    values: readonly NodeId[],
    nodes: readonly GraphNode[],
    tag: typeof NodeTag.And | typeof NodeTag.Or
): readonly NodeId[] {
    const flattened: NodeId[] = [];
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value === undefined) {
            continue;
        }
        const node = nodes[value];
        if (node?.tag === tag) {
            /*
             * And(And(a,b),c) and Or(Or(a,b),c) are associative. Flattening
             * reduces later duplicate and complement checks to one linear pass.
             */
            appendFlattenedBooleanValues(flattened, node.values, nodes, tag);
        } else {
            flattened.push(value);
        }
    }
    return flattened;
}

/**
 * @brief Simplify operands of an And fold.
 * @param values Input operand ids.
 * @param nodes Graph node table used to inspect nested complement forms.
 * @returns Simplification result with contradiction status and kept operands.
 */
export function simplifyAndValues(
    values: readonly NodeId[],
    nodes: readonly GraphNode[]
): AlgebraicFold {
    const kept: NodeId[] = [];
    const seen = new Set<NodeId>();
    const positive = new Set<NodeId>();
    const negative = new Set<NodeId>();

    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value === undefined || seen.has(value)) {
            continue;
        }
        if (isAbsorbedAndValue(value, nodes, seen)) {
            /*
             * a && (a || b) is equivalent to a. The Or branch cannot make the
             * validation stricter once the shared value is already required.
             */
            continue;
        }
        if (hasComplementConflict(value, nodes, positive, negative)) {
            /*
             * a && !a is impossible for side-effect-free predicate nodes. Only
             * complement-safe nodes are allowed into the positive/negative sets.
             */
            return {
                contradiction: true,
                tautology: false,
                values: []
            };
        }
        rememberComplementValue(value, nodes, positive, negative);
        seen.add(value);
        kept.push(value);
    }

    return {
        contradiction: false,
        tautology: false,
        values: kept
    };
}

/**
 * @brief Simplify operands of an Or fold.
 * @param values Input operand ids.
 * @param nodes Graph node table used to inspect nested complement forms.
 * @returns Simplification result with tautology status and kept operands.
 */
export function simplifyOrValues(
    values: readonly NodeId[],
    nodes: readonly GraphNode[]
): AlgebraicFold {
    const kept: NodeId[] = [];
    const seen = new Set<NodeId>();
    const positive = new Set<NodeId>();
    const negative = new Set<NodeId>();

    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value === undefined || seen.has(value)) {
            continue;
        }
        if (isAbsorbedOrValue(value, nodes, seen)) {
            /*
             * a || (a && b) is equivalent to a. The And branch cannot widen the
             * accepted set once the shared value already passes.
             */
            continue;
        }
        if (hasComplementConflict(value, nodes, positive, negative)) {
            /*
             * a || !a is always true for complement-safe predicates, so the Or
             * fold can collapse to a tautology.
             */
            return {
                contradiction: false,
                tautology: true,
                values: []
            };
        }
        rememberComplementValue(value, nodes, positive, negative);
        seen.add(value);
        kept.push(value);
    }

    return {
        contradiction: false,
        tautology: false,
        values: kept
    };
}

/**
 * @brief Recursively append flattened operands.
 * @param output Destination operand list.
 * @param values Source operand ids.
 * @param nodes Graph node table used to inspect nested folds.
 * @param tag Boolean fold kind to flatten.
 */
function appendFlattenedBooleanValues(
    output: NodeId[],
    values: readonly NodeId[],
    nodes: readonly GraphNode[],
    tag: typeof NodeTag.And | typeof NodeTag.Or
): void {
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value === undefined) {
            continue;
        }
        const node = nodes[value];
        if (node?.tag === tag) {
            appendFlattenedBooleanValues(output, node.values, nodes, tag);
        } else {
            output.push(value);
        }
    }
}

/**
 * @brief Test And absorption for `a && (a || b)`.
 * @param value Candidate operand id.
 * @param nodes Graph node table.
 * @param seen Operands already kept by the parent And.
 * @returns True when the candidate is redundant.
 */
function isAbsorbedAndValue(
    value: NodeId,
    nodes: readonly GraphNode[],
    seen: ReadonlySet<NodeId>
): boolean {
    const node = nodes[value];
    if (node?.tag !== NodeTag.Or) {
        return false;
    }
    return containsSeenValue(node.values, seen);
}

/**
 * @brief Test Or absorption for `a || (a && b)`.
 * @param value Candidate operand id.
 * @param nodes Graph node table.
 * @param seen Operands already kept by the parent Or.
 * @returns True when the candidate is redundant.
 */
function isAbsorbedOrValue(
    value: NodeId,
    nodes: readonly GraphNode[],
    seen: ReadonlySet<NodeId>
): boolean {
    const node = nodes[value];
    if (node?.tag !== NodeTag.And) {
        return false;
    }
    return containsSeenValue(node.values, seen);
}

/**
 * @brief Test whether a nested fold contains an operand already kept.
 * @param values Nested fold operand ids.
 * @param seen Parent fold operands already kept.
 * @returns True when the nested fold repeats a kept operand.
 */
function containsSeenValue(
    values: readonly NodeId[],
    seen: ReadonlySet<NodeId>
): boolean {
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value !== undefined && seen.has(value)) {
            return true;
        }
    }
    return false;
}

/**
 * @brief Detect a positive/negative complement conflict.
 * @param value Candidate operand id.
 * @param nodes Graph node table.
 * @param positive Complement-safe positive operands already seen.
 * @param negative Complement-safe negated operands already seen.
 * @returns True when the candidate conflicts with prior operands.
 */
function hasComplementConflict(
    value: NodeId,
    nodes: readonly GraphNode[],
    positive: ReadonlySet<NodeId>,
    negative: ReadonlySet<NodeId>
): boolean {
    const negated = readNegatedValue(value, nodes);
    if (negated !== undefined) {
        return isComplementSafe(negated, nodes) && positive.has(negated);
    }
    return isComplementSafe(value, nodes) && negative.has(value);
}

/**
 * @brief Record a complement-safe operand in positive or negative form.
 * @param value Candidate operand id.
 * @param nodes Graph node table.
 * @param positive Mutable set for positive operands.
 * @param negative Mutable set for negated operands.
 */
function rememberComplementValue(
    value: NodeId,
    nodes: readonly GraphNode[],
    positive: Set<NodeId>,
    negative: Set<NodeId>
): void {
    const negated = readNegatedValue(value, nodes);
    if (negated !== undefined) {
        if (isComplementSafe(negated, nodes)) {
            negative.add(negated);
        }
        return;
    }
    if (isComplementSafe(value, nodes)) {
        positive.add(value);
    }
}

/**
 * @brief Read the operand of a Not node.
 * @param value Candidate node id.
 * @param nodes Graph node table.
 * @returns Inner node id for Not, otherwise undefined.
 */
function readNegatedValue(
    value: NodeId,
    nodes: readonly GraphNode[]
): NodeId | undefined {
    const node = nodes[value];
    return node?.tag === NodeTag.Not ? node.value : undefined;
}

/**
 * @brief Decide whether a node is safe for complement algebra.
 * @details Only pure structural predicates are allowed. Nodes that inspect user
 * predicates or nested graph execution stay out of `a`/`!a` folding.
 * @param value Candidate node id.
 * @param nodes Graph node table.
 * @returns True when complement laws can be applied to the node.
 */
function isComplementSafe(
    value: NodeId,
    nodes: readonly GraphNode[]
): boolean {
    const node = nodes[value];
    if (node === undefined) {
        return false;
    }
    switch (node.tag) {
        case NodeTag.Const:
            return typeof node.value === "boolean";
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
        case NodeTag.Equals:
        case NodeTag.Gte:
        case NodeTag.Lte:
        case NodeTag.StringMin:
        case NodeTag.StringMax:
        case NodeTag.Regex:
        case NodeTag.HasOwn:
        case NodeTag.HasOwnData:
        case NodeTag.StrictKeys:
            return true;
        case NodeTag.Not:
            return isComplementSafe(node.value, nodes);
        case NodeTag.And:
        case NodeTag.Or:
            return areComplementSafeValues(node.values, nodes);
        default:
            return false;
    }
}

/**
 * @brief Decide whether every value in a boolean fold is complement-safe.
 * @param values Operand ids from a nested fold.
 * @param nodes Graph node table.
 * @returns True when the whole nested fold can participate in complement laws.
 */
function areComplementSafeValues(
    values: readonly NodeId[],
    nodes: readonly GraphNode[]
): boolean {
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value === undefined || !isComplementSafe(value, nodes)) {
            return false;
        }
    }
    return true;
}
