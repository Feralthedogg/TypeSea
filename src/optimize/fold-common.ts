/**
 * @file fold-common.ts
 * @brief Shared constant-folding helpers.
 */

import { NodeTag } from "../kind/index.js";
import type { GraphNode, NodeId } from "../ir/index.js";
import type { LiteralValue } from "../schema/index.js";

/**
 * @brief Result of probing a node slot for a constant value.
 * @details `found` is separate from `value` because `undefined` is itself a
 * valid literal constant in the graph.
 */
export interface ConstRead {
    readonly found: boolean;
    readonly value: LiteralValue | undefined;
}

/**
 * @brief Node rewrite result returned by scalar folding helpers.
 * @details The node carries the possibly edited payload while `replacement`
 * records aliasing information for later dependency rewrites.
 */
export interface FoldResult {
    readonly node: GraphNode;
    readonly replacement: NodeId | undefined;
}

/**
 * @brief Reuse or append a constant node for a literal value.
 * @details Constants are interned with `Object.is` so NaN, -0, and undefined
 * keep JavaScript literal identity semantics. The alias table is updated
 * immediately because later folders may depend on the new node id.
 * @param nodes Mutable graph node table for the folding pass.
 * @param aliases Mutable node alias table kept in step with `nodes`.
 * @param value Literal value that must exist in the graph.
 * @returns Node id of the existing or newly appended constant.
 */
export function ensureConst(
    nodes: GraphNode[],
    aliases: NodeId[],
    value: LiteralValue
): NodeId {
    for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        if (node?.tag === NodeTag.Const && Object.is(node.value, value)) {
            return index;
        }
    }
    const id = nodes.length;
    nodes.push({
        id,
        tag: NodeTag.Const,
        deps: [],
        value
    });
    aliases[id] = id;
    return id;
}

/**
 * @brief Probe a node id for an IR constant without conflating misses.
 * @param nodes Graph node table being optimized.
 * @param id Node id to inspect.
 * @returns Const probe result with an explicit found bit.
 */
export function readConst(nodes: readonly GraphNode[], id: NodeId): ConstRead {
    const node = nodes[id];
    if (node?.tag === NodeTag.Const) {
        return {
            found: true,
            value: node.value
        };
    }
    return {
        found: false,
        value: undefined
    };
}

/**
 * @brief Return a fold result that keeps the node in place.
 * @param node Node after local payload edits.
 * @returns Fold result without an alias replacement.
 */
export function keep(node: GraphNode): FoldResult {
    return {
        node,
        replacement: undefined
    };
}

/**
 * @brief Return a fold result that aliases this node to another node id.
 * @param node Original node retained for pass bookkeeping.
 * @param replacement Node id that should replace references to `node`.
 * @returns Fold result carrying the alias replacement.
 */
export function replace(node: GraphNode, replacement: NodeId): FoldResult {
    return {
        node,
        replacement
    };
}

/**
 * @brief Check whether a value is a finite JavaScript number.
 * @details Numeric bound folding excludes NaN and infinities because order
 * comparisons against those values do not form useful closed validation ranges.
 * @param value Candidate literal value.
 * @returns True when the value is a finite number.
 */
export function isFiniteNumber(value: unknown): boolean {
    return typeof value === "number" && Number.isFinite(value);
}

/**
 * @brief Check whether a value is an object-like record for fold metadata.
 * @details Arrays are excluded because optimizer metadata objects use named
 * fields, and accepting arrays would hide malformed pass state.
 * @param value Candidate metadata value.
 * @returns True when the value is a non-array object.
 */
export function isPlainRecord(value: unknown): boolean {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
