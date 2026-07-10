/**
 * @file fold-constraints.ts
 * @brief Boolean constraint canonicalization for pure predicate runs.
 */

import { NodeTag } from "../kind/index.js";
import type {
    GraphNode,
    NodeId
} from "../ir/index.js";
import { readConst } from "./fold-common.js";

/**
 * @brief Canonicalized input list for a boolean fold node.
 * @details Contradictions are represented separately from an empty value list so
 * callers can distinguish a provably false conjunction from a fold that simply
 * had no surviving children.
 */
export interface ConstraintFold {
    readonly contradiction: boolean;
    readonly values: readonly NodeId[];
}

/**
 * @brief Numeric tags for runtime type facts extracted from predicate nodes.
 * @details Numeric tags keep fact comparisons cheap and avoid string switching
 * in the tight canonicalization scan.
 */
const TypeFactTag = {
    String: 1,
    Number: 2,
    Boolean: 3,
    BigInt: 4,
    Symbol: 5,
    Object: 6,
    Array: 7,
    Undefined: 8,
    Null: 9
} as const;

/**
 * @brief Closed numeric domain for type fact tags.
 */
type TypeFactTag = (typeof TypeFactTag)[keyof typeof TypeFactTag];

/**
 * @brief Primitive type proof recorded for one value node.
 * @details The original predicate index is stored so weaker or duplicate
 * predicates can be omitted without disturbing the order of surviving checks.
 */
interface TypeFact {
    readonly tag: TypeFactTag;
    readonly value: NodeId;
    readonly integer: boolean;
    readonly index: number;
}

/**
 * @brief Scalar bound paired with the predicate position that produced it.
 * @details Retaining the index lets the pass mark the dominated predicate in
 * the original value vector instead of rebuilding the scan state.
 */
interface IndexedBound {
    readonly index: number;
    readonly bound: number;
}

/**
 * @brief Accumulated string-length limits for one value node.
 * @details Min and max are tracked separately so the pass can keep the strongest
 * surviving side and still detect an impossible range.
 */
interface StringBounds {
    min: IndexedBound | undefined;
    max: IndexedBound | undefined;
}

/**
 * @brief Accumulated numeric comparison limits for one value node.
 * @details Only finite constant comparisons enter this record; dynamic
 * comparisons are left in place for runtime evaluation.
 */
interface NumericBounds {
    gte: IndexedBound | undefined;
    lte: IndexedBound | undefined;
}

/**
 * @brief canonicalize and values.
 * @details Removes duplicate predicates and dominated scalar bounds while keeping
 * the first observable execution order intact. Only the pure prefix may collapse
 * the whole conjunction to `false`.
 * @returns Canonical node id vector or a contradiction marker.
 */
export function canonicalizeAndValues(
    values: readonly NodeId[],
    nodes: readonly GraphNode[]
): ConstraintFold {
    const omitted = new Array<boolean>(values.length).fill(false);
    const seen = new Set<NodeId>();
    const pureEnd = findPurePrefixEnd(values, nodes);

    omitDuplicateIds(values, omitted, seen);
    if (canonicalizeTypeFacts(values, nodes, omitted, pureEnd)) {
        return {
            contradiction: true,
            values: []
        };
    }
    if (canonicalizeStringBounds(values, nodes, omitted, pureEnd)) {
        return {
            contradiction: true,
            values: []
        };
    }
    if (canonicalizeNumericBounds(values, nodes, omitted, pureEnd)) {
        return {
            contradiction: true,
            values: []
        };
    }

    return {
        contradiction: false,
        values: collectKeptValues(values, omitted)
    };
}

/**
 * @brief canonicalize or values.
 * @details Removes repeated node ids. Repeated ids are already memoized by graph
 * execution, so this only shrinks emitted boolean expressions.
 * @returns Canonical node id vector.
 */
export function canonicalizeOrValues(values: readonly NodeId[]): readonly NodeId[] {
    const kept: NodeId[] = [];
    const seen = new Set<NodeId>();
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value === undefined || seen.has(value)) {
            continue;
        }
        seen.add(value);
        kept.push(value);
    }
    return kept;
}

/**
 * @brief Mark repeated node ids as omitted while preserving first occurrence.
 * @details Graph execution memoizes node results, so repeated ids inside the
 * same boolean fold only inflate generated expressions.
 * @param values Original fold input node ids.
 * @param omitted Mutable omission bitmap aligned with `values`.
 * @param seen Mutable set used by the caller for duplicate tracking.
 */
function omitDuplicateIds(
    values: readonly NodeId[],
    omitted: boolean[],
    seen: Set<NodeId>
): void {
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value === undefined) {
            omitted[index] = true;
            continue;
        }
        if (seen.has(value)) {
            omitted[index] = true;
            continue;
        }
        seen.add(value);
    }
}

/**
 * @brief Remove duplicate type predicates and detect impossible type pairs.
 * @details The scan is limited to the pure prefix so dynamic schema checks and
 * composite loops keep their original execution order. Conflicting facts turn
 * the whole conjunction into a contradiction.
 * @param values Original fold input node ids.
 * @param nodes Graph node table.
 * @param omitted Mutable omission bitmap aligned with `values`.
 * @param end Exclusive end of the pure scalar prefix.
 * @returns True when the facts prove the conjunction impossible.
 */
function canonicalizeTypeFacts(
    values: readonly NodeId[],
    nodes: readonly GraphNode[],
    omitted: boolean[],
    end: number
): boolean {
    const facts = new Map<NodeId, TypeFact>();
    for (let index = 0; index < end; index += 1) {
        if (omitted[index] === true) {
            continue;
        }
        const id = values[index];
        const node = id === undefined ? undefined : nodes[id];
        const fact = node === undefined ? undefined : readTypeFact(node, index);
        if (id === undefined || fact === undefined) {
            continue;
        }
        const previous = facts.get(fact.value);
        if (previous === undefined) {
            facts.set(fact.value, fact);
            continue;
        }
        if (previous.tag !== fact.tag) {
            return true;
        }
        if (previous.tag === TypeFactTag.Number && previous.integer !== fact.integer) {
            if (previous.integer) {
                omitted[index] = true;
            } else {
                omitted[previous.index] = true;
                facts.set(fact.value, fact);
            }
            continue;
        }
        omitted[index] = true;
    }
    return false;
}

/**
 * @brief Keep only the strongest string-length bounds in the pure prefix.
 * @details Weaker bounds are marked omitted, while crossing min/max bounds prove
 * the conjunction false before runtime.
 * @param values Original fold input node ids.
 * @param nodes Graph node table.
 * @param omitted Mutable omission bitmap aligned with `values`.
 * @param end Exclusive end of the pure scalar prefix.
 * @returns True when the bounds prove the conjunction impossible.
 */
function canonicalizeStringBounds(
    values: readonly NodeId[],
    nodes: readonly GraphNode[],
    omitted: boolean[],
    end: number
): boolean {
    const bounds = new Map<NodeId, StringBounds>();
    for (let index = 0; index < end; index += 1) {
        if (omitted[index] === true) {
            continue;
        }
        const id = values[index];
        const node = id === undefined ? undefined : nodes[id];
        if (node?.tag !== NodeTag.StringMin && node?.tag !== NodeTag.StringMax) {
            continue;
        }
        const slot = readStringBounds(bounds, node.value);
        if (node.tag === NodeTag.StringMin) {
            keepStrongestMin(omitted, slot, index, node.bound);
        } else {
            keepStrongestMax(omitted, slot, index, node.bound);
        }
        if (hasImpossibleBounds(slot)) {
            return true;
        }
    }
    return false;
}

/**
 * @brief Keep only the strongest finite numeric bounds in the pure prefix.
 * @details The pass ignores non-constant and non-finite comparisons because
 * those do not create stable static intervals.
 * @param values Original fold input node ids.
 * @param nodes Graph node table.
 * @param omitted Mutable omission bitmap aligned with `values`.
 * @param end Exclusive end of the pure scalar prefix.
 * @returns True when the bounds prove the conjunction impossible.
 */
function canonicalizeNumericBounds(
    values: readonly NodeId[],
    nodes: readonly GraphNode[],
    omitted: boolean[],
    end: number
): boolean {
    const bounds = new Map<NodeId, NumericBounds>();
    for (let index = 0; index < end; index += 1) {
        if (omitted[index] === true) {
            continue;
        }
        const id = values[index];
        const node = id === undefined ? undefined : nodes[id];
        if (node?.tag !== NodeTag.Gte && node?.tag !== NodeTag.Lte) {
            continue;
        }
        const right = readConst(nodes, node.right);
        if (!right.found || typeof right.value !== "number" ||
            !Number.isFinite(right.value)) {
            continue;
        }
        const slot = readNumericBounds(bounds, node.left);
        if (node.tag === NodeTag.Gte) {
            keepStrongestGte(omitted, slot, index, right.value);
        } else {
            keepStrongestLte(omitted, slot, index, right.value);
        }
        if (hasImpossibleNumericBounds(slot)) {
            return true;
        }
    }
    return false;
}

/**
 * @brief Convert a primitive predicate node into a type fact.
 * @details Constraint folding uses these facts to remove redundant checks and
 * to detect impossible type intersections. Nodes without direct type meaning
 * return undefined and remain under normal folding control.
 * @param node Graph node to classify.
 * @param index Node id currently being scanned.
 * @returns Type fact for primitive predicate nodes, otherwise undefined.
 */
function readTypeFact(node: GraphNode, index: number): TypeFact | undefined {
    switch (node.tag) {
        case NodeTag.IsString:
            return makeTypeFact(TypeFactTag.String, node.value, false, index);
        case NodeTag.IsNumber:
            return makeTypeFact(TypeFactTag.Number, node.value, false, index);
        case NodeTag.IsInteger:
            return makeTypeFact(TypeFactTag.Number, node.value, true, index);
        case NodeTag.IsBoolean:
            return makeTypeFact(TypeFactTag.Boolean, node.value, false, index);
        case NodeTag.IsBigInt:
            return makeTypeFact(TypeFactTag.BigInt, node.value, false, index);
        case NodeTag.IsSymbol:
            return makeTypeFact(TypeFactTag.Symbol, node.value, false, index);
        case NodeTag.IsObject:
            return makeTypeFact(TypeFactTag.Object, node.value, false, index);
        case NodeTag.IsArray:
            return makeTypeFact(TypeFactTag.Array, node.value, false, index);
        case NodeTag.IsUndefined:
            return makeTypeFact(TypeFactTag.Undefined, node.value, false, index);
        case NodeTag.IsNull:
            return makeTypeFact(TypeFactTag.Null, node.value, false, index);
        default:
            return undefined;
    }
}

/**
 * @brief Pack the normalized type fact used by the constraint pass.
 * @details The `integer` bit distinguishes `number` from `integer` predicates
 * without introducing a separate domain family, which keeps conflict checks
 * small and branch-free.
 * @param tag Runtime domain proven by the predicate.
 * @param value Node id whose type is constrained.
 * @param integer True when the predicate is the integer subtype check.
 * @param index Node id of the predicate that produced the fact.
 * @returns Type fact record used by later scans.
 */
function makeTypeFact(
    tag: TypeFactTag,
    value: NodeId,
    integer: boolean,
    index: number
): TypeFact {
    return {
        tag,
        value,
        integer,
        index
    };
}

/**
 * @brief Get or create the accumulated string-length bounds for a value node.
 * @details A mutable slot lets multiple `minLength` and `maxLength` predicates
 * compete while the pass marks weaker predicates for omission.
 * @param bounds Map from value node id to accumulated string bounds.
 * @param value Node id whose string bounds are being tracked.
 * @returns Mutable bounds slot for that value node.
 */
function readStringBounds(
    bounds: Map<NodeId, StringBounds>,
    value: NodeId
): StringBounds {
    const cached = bounds.get(value);
    if (cached !== undefined) {
        return cached;
    }
    const slot: StringBounds = {
        min: undefined,
        max: undefined
    };
    bounds.set(value, slot);
    return slot;
}

/**
 * @brief Get or create the accumulated numeric bounds for a value node.
 * @details The pass stores lower and upper numeric limits separately so it can
 * keep the strongest surviving predicate while also detecting impossible ranges.
 * @param bounds Map from value node id to accumulated numeric bounds.
 * @param value Node id whose numeric bounds are being tracked.
 * @returns Mutable bounds slot for that value node.
 */
function readNumericBounds(
    bounds: Map<NodeId, NumericBounds>,
    value: NodeId
): NumericBounds {
    const cached = bounds.get(value);
    if (cached !== undefined) {
        return cached;
    }
    const slot: NumericBounds = {
        gte: undefined,
        lte: undefined
    };
    bounds.set(value, slot);
    return slot;
}

/**
 * @brief Keep the strongest string lower bound in an accumulated slot.
 * @details A larger minimum dominates a smaller one. The dominated predicate is
 * marked in the original omission bitmap so final collection remains ordered.
 * @param omitted Mutable omission bitmap aligned with the fold inputs.
 * @param slot Accumulated bounds for one value node.
 * @param index Position of the candidate predicate.
 * @param bound Candidate minimum length.
 */
function keepStrongestMin(
    omitted: boolean[],
    slot: StringBounds,
    index: number,
    bound: number
): void {
    if (slot.min === undefined || bound >= slot.min.bound) {
        if (slot.min !== undefined) {
            omitted[slot.min.index] = true;
        }
        slot.min = {
            index,
            bound
        };
        return;
    }
    omitted[index] = true;
}

/**
 * @brief Keep the strongest string upper bound in an accumulated slot.
 * @details A smaller maximum dominates a larger one and preserves the same
 * runtime acceptance set.
 * @param omitted Mutable omission bitmap aligned with the fold inputs.
 * @param slot Accumulated bounds for one value node.
 * @param index Position of the candidate predicate.
 * @param bound Candidate maximum length.
 */
function keepStrongestMax(
    omitted: boolean[],
    slot: StringBounds,
    index: number,
    bound: number
): void {
    if (slot.max === undefined || bound <= slot.max.bound) {
        if (slot.max !== undefined) {
            omitted[slot.max.index] = true;
        }
        slot.max = {
            index,
            bound
        };
        return;
    }
    omitted[index] = true;
}

/**
 * @brief Keep the strongest numeric lower bound in an accumulated slot.
 * @details A larger inclusive lower bound dominates a smaller one for the same
 * numeric value node.
 * @param omitted Mutable omission bitmap aligned with the fold inputs.
 * @param slot Accumulated bounds for one value node.
 * @param index Position of the candidate predicate.
 * @param bound Candidate inclusive lower bound.
 */
function keepStrongestGte(
    omitted: boolean[],
    slot: NumericBounds,
    index: number,
    bound: number
): void {
    if (slot.gte === undefined || bound >= slot.gte.bound) {
        if (slot.gte !== undefined) {
            omitted[slot.gte.index] = true;
        }
        slot.gte = {
            index,
            bound
        };
        return;
    }
    omitted[index] = true;
}

/**
 * @brief Keep the strongest numeric upper bound in an accumulated slot.
 * @details A smaller inclusive upper bound dominates a larger one for the same
 * numeric value node.
 * @param omitted Mutable omission bitmap aligned with the fold inputs.
 * @param slot Accumulated bounds for one value node.
 * @param index Position of the candidate predicate.
 * @param bound Candidate inclusive upper bound.
 */
function keepStrongestLte(
    omitted: boolean[],
    slot: NumericBounds,
    index: number,
    bound: number
): void {
    if (slot.lte === undefined || bound <= slot.lte.bound) {
        if (slot.lte !== undefined) {
            omitted[slot.lte.index] = true;
        }
        slot.lte = {
            index,
            bound
        };
        return;
    }
    omitted[index] = true;
}

/**
 * @brief Detect a statically impossible string-length interval.
 * @param slot Accumulated string bounds for one value node.
 * @returns True when minimum length exceeds maximum length.
 */
function hasImpossibleBounds(slot: StringBounds): boolean {
    return slot.min !== undefined &&
        slot.max !== undefined &&
        slot.min.bound > slot.max.bound;
}

/**
 * @brief Detect a statically impossible numeric interval.
 * @param slot Accumulated numeric bounds for one value node.
 * @returns True when lower bound exceeds upper bound.
 */
function hasImpossibleNumericBounds(slot: NumericBounds): boolean {
    return slot.gte !== undefined &&
        slot.lte !== undefined &&
        slot.gte.bound > slot.lte.bound;
}

/**
 * @brief Find the prefix of fold inputs that can be reordered semantically.
 * @details Pure scalar checks have no callbacks, loops, or schema recursion.
 * The pass stops before composite or dynamic nodes so optimization cannot hide
 * observable validation behavior.
 * @param values Original fold input node ids.
 * @param nodes Graph node table.
 * @returns Exclusive index where pure scalar processing must stop.
 */
function findPurePrefixEnd(
    values: readonly NodeId[],
    nodes: readonly GraphNode[]
): number {
    for (let index = 0; index < values.length; index += 1) {
        const id = values[index];
        const node = id === undefined ? undefined : nodes[id];
        if (node === undefined || !isPureScalarNode(node)) {
            return index;
        }
    }
    return values.length;
}

/**
 * @brief Decide whether a graph node is safe for scalar constraint folding.
 * @details Composite loops, union dispatch, and SchemaCheck may trigger dynamic
 * behavior or nested validation, so they form a barrier for this pass.
 * @param node Graph node to classify.
 * @returns True for scalar predicate nodes handled by local constraint folding.
 */
function isPureScalarNode(node: GraphNode): boolean {
    switch (node.tag) {
        case NodeTag.SchemaCheck:
        case NodeTag.ArrayEvery:
        case NodeTag.TupleItems:
        case NodeTag.RecordEvery:
        case NodeTag.DiscriminantDispatch:
        case NodeTag.ObjectShape:
        case NodeTag.UnionDispatch:
        case NodeTag.PresenceDispatch:
        case NodeTag.And:
        case NodeTag.Or:
            return false;
        default:
            return true;
    }
}

/**
 * @brief Rebuild the fold input vector after omission marks are applied.
 * @details Values are appended in their original order so generated code keeps
 * the same left-to-right scalar check sequence after simplification.
 * @param values Original fold input node ids.
 * @param omitted Omission bitmap aligned with `values`.
 * @returns Compact vector containing only surviving node ids.
 */
function collectKeptValues(
    values: readonly NodeId[],
    omitted: readonly boolean[]
): NodeId[] {
    const kept: NodeId[] = [];
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value !== undefined && omitted[index] !== true) {
            kept.push(value);
        }
    }
    return kept;
}
