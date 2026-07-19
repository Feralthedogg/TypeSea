/**
 * @file object-order.ts
 * @brief Shared object-field legality and static cost model.
 * @details Ordinary predicate emission and SeaCurrent graph rewriting must use
 * one barrier definition. Divergent models could move an opaque callback in one
 * path while treating it as observable in another.
 */

import { NodeTag, PresenceTag } from "../kind/index.js";
import type {
    Graph,
    GraphNode,
    ObjectShapeEntry
} from "../ir/index.js";

/** @brief Object entry paired with its stable pre-sort position. */
interface ScheduledObjectShapeEntry {
    readonly entry: ObjectShapeEntry;
    readonly order: number;
}

/**
 * @brief Schedule pure object fields for predicate-only fast failure.
 * @details Opaque schema callbacks divide the vector into immovable runs.
 * Required fields and cheap scalar checks lead only inside each pure run.
 */
export function scheduleObjectShapeEntries(
    entries: readonly ObjectShapeEntry[]
): readonly ObjectShapeEntry[] {
    if (entries.length < 2) {
        return entries;
    }
    const scheduled: ObjectShapeEntry[] = [];
    let index = 0;
    while (index < entries.length) {
        const entry = entries[index];
        if (entry === undefined) {
            index += 1;
            continue;
        }
        if (!isSchedulableObjectShapeEntry(entry)) {
            scheduled.push(entry);
            index += 1;
            continue;
        }
        const run: ScheduledObjectShapeEntry[] = [];
        while (index < entries.length) {
            const candidate = entries[index];
            if (candidate === undefined || !isSchedulableObjectShapeEntry(candidate)) {
                break;
            }
            run.push({ entry: candidate, order: index });
            index += 1;
        }
        run.sort(compareScheduledObjectShapeEntries);
        for (let runIndex = 0; runIndex < run.length; runIndex += 1) {
            const scheduledEntry = run[runIndex];
            if (scheduledEntry !== undefined) {
                scheduled.push(scheduledEntry.entry);
            }
        }
    }
    return scheduled;
}

/**
 * @brief Prove that an object entry may move within a pure boolean run.
 * @details Refine and lazy fallback lower to SchemaCheck. Their callbacks can
 * expose execution order, so a nested occurrence makes the field a barrier.
 */
export function isSchedulableObjectShapeEntry(entry: ObjectShapeEntry): boolean {
    return !graphContainsSchemaCheck(entry.graph);
}

/**
 * @brief Estimate relative predicate work for one child graph.
 * @details Weights intentionally form coarse stable buckets. Runtime profiles
 * supply rejection probabilities; this estimate supplies only evaluation cost.
 */
export function estimateGraphCost(graph: Graph): number {
    let cost = 0;
    for (let index = 0; index < graph.nodes.length; index += 1) {
        const node = graph.nodes[index];
        if (node !== undefined) {
            cost += estimateNodeCost(node);
        }
    }
    return cost;
}

/** @brief Compare fields under the deterministic cold-start schedule. */
function compareScheduledObjectShapeEntries(
    left: ScheduledObjectShapeEntry,
    right: ScheduledObjectShapeEntry
): number {
    const leftPresence = objectShapePresenceCost(left.entry);
    const rightPresence = objectShapePresenceCost(right.entry);
    if (leftPresence !== rightPresence) {
        return leftPresence - rightPresence;
    }
    const leftCost = estimateGraphCost(left.entry.graph);
    const rightCost = estimateGraphCost(right.entry.graph);
    return leftCost - rightCost || left.order - right.order;
}

/** @brief Rank optional presence checks after required-key fast failures. */
function objectShapePresenceCost(entry: ObjectShapeEntry): number {
    return entry.presence === PresenceTag.Optional ? 1_000 : 0;
}

/** @brief Assign one node to a stable relative predicate-cost bucket. */
function estimateNodeCost(node: GraphNode): number {
    switch (node.tag) {
        case NodeTag.Start:
        case NodeTag.Param:
        case NodeTag.Const:
        case NodeTag.Return:
            return 0;
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
        case NodeTag.StringMin:
        case NodeTag.StringMax:
        case NodeTag.Gte:
        case NodeTag.Lte:
        case NodeTag.Equals:
            return 1;
        case NodeTag.Regex:
            return 8;
        case NodeTag.PrimitiveUnion:
        case NodeTag.UnionDispatch:
        case NodeTag.DiscriminantDispatch:
        case NodeTag.PresenceDispatch:
        case NodeTag.ObjectShape:
        case NodeTag.TupleItems:
            return 16;
        case NodeTag.ArrayEvery:
        case NodeTag.RecordEvery:
            return 64;
        case NodeTag.SchemaCheck:
            return 128;
        default:
            return 2;
    }
}

/** @brief Recursively find an opaque callback boundary in one graph. */
function graphContainsSchemaCheck(graph: Graph): boolean {
    for (let index = 0; index < graph.nodes.length; index += 1) {
        const node = graph.nodes[index];
        if (node?.tag === NodeTag.SchemaCheck ||
            node !== undefined && nodeContainsSchemaCheck(node)) {
            return true;
        }
    }
    return false;
}

/** @brief Inspect compiler-owned nested graphs for callback barriers. */
function nodeContainsSchemaCheck(node: GraphNode): boolean {
    switch (node.tag) {
        case NodeTag.ArrayEvery:
        case NodeTag.RecordEvery:
            return graphContainsSchemaCheck(node.itemGraph);
        case NodeTag.TupleItems:
            return graphArrayContainsSchemaCheck(node.itemGraphs);
        case NodeTag.ObjectShape:
            return objectEntriesContainSchemaCheck(node.entries);
        case NodeTag.DiscriminantDispatch:
        case NodeTag.PresenceDispatch:
        case NodeTag.UnionDispatch:
        case NodeTag.PrimitiveUnion:
            return graphArrayContainsSchemaCheck(node.graphs);
        default:
            return false;
    }
}

/** @brief Scan a child-graph vector without allocating an intermediate view. */
function graphArrayContainsSchemaCheck(graphs: readonly Graph[]): boolean {
    for (let index = 0; index < graphs.length; index += 1) {
        const graph = graphs[index];
        if (graph !== undefined && graphContainsSchemaCheck(graph)) {
            return true;
        }
    }
    return false;
}

/** @brief Scan nested object fields for opaque callback boundaries. */
function objectEntriesContainSchemaCheck(
    entries: readonly ObjectShapeEntry[]
): boolean {
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry !== undefined && graphContainsSchemaCheck(entry.graph)) {
            return true;
        }
    }
    return false;
}
