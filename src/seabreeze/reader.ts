/**
 * @file reader.ts
 * @brief Typed-reader facade for SeaBreeze arenas.
 * @details The reader is the contract needed by a future emitter path that
 * consumes typed-array inference data without first materializing GraphNode
 * objects.
 */

import type {
    SeaBreezeKind,
    SeaBreezeNodeId,
    SeaBreezePresence
} from "./sea-breeze.js";
import type { SeaBreezeArena } from "./sea-breeze.js";

/**
 * @brief Read-only arena projection consumed by lowering and direct emission.
 * @details Consumers operate on numeric ids and typed-array slots without
 * materializing per-node JavaScript objects.
 */
export interface SeaBreezeReader {
    /**
     * @brief Number of live nodes.
     */
    readonly nodeLength: number;

    /**
     * @brief Number of live field slots.
     */
    readonly fieldLength: number;

    /**
     * @brief Return the representative node for a type id.
     */
    find(node: SeaBreezeNodeId): SeaBreezeNodeId;

    /**
     * @brief Return a representative node's kind.
     */
    kindOf(node: SeaBreezeNodeId): SeaBreezeKind;

    /**
     * @brief Return an array node's element type.
     */
    arrayElement(node: SeaBreezeNodeId): SeaBreezeNodeId;

    /**
     * @brief Return an object node's field count.
     */
    fieldCount(node: SeaBreezeNodeId): number;

    /**
     * @brief Return an object field's interned key id.
     */
    fieldKeyAt(node: SeaBreezeNodeId, index: number): number;

    /**
     * @brief Return an object field's type id.
     */
    fieldTypeAt(node: SeaBreezeNodeId, index: number): SeaBreezeNodeId;

    /**
     * @brief Return an object field's required/optional presence.
     */
    fieldPresenceAt(node: SeaBreezeNodeId, index: number): SeaBreezePresence;

    /**
     * @brief Return a binary union's left arm.
     */
    unionLeft(node: SeaBreezeNodeId): SeaBreezeNodeId;

    /**
     * @brief Return a binary union's right arm.
     */
    unionRight(node: SeaBreezeNodeId): SeaBreezeNodeId;
}

/**
 * @brief Create a reader view over an existing arena.
 * @param arena Arena whose typed-array tables should be read.
 * @returns Reader facade without copying arena data.
 */
export function seaBreezeReader(arena: SeaBreezeArena): SeaBreezeReader {
    return Object.freeze({
        get nodeLength(): number {
            return arena.nodeLength;
        },
        get fieldLength(): number {
            return arena.fieldLength;
        },
        find: (node: SeaBreezeNodeId): SeaBreezeNodeId =>
            arena.find(node),
        kindOf: (node: SeaBreezeNodeId): SeaBreezeKind =>
            arena.kindOf(node),
        arrayElement: (node: SeaBreezeNodeId): SeaBreezeNodeId =>
            arena.arrayElement(node),
        fieldCount: (node: SeaBreezeNodeId): number =>
            arena.fieldCount(node),
        fieldKeyAt: (node: SeaBreezeNodeId, index: number): number =>
            arena.fieldKeyAt(node, index),
        fieldTypeAt: (node: SeaBreezeNodeId, index: number): SeaBreezeNodeId =>
            arena.fieldTypeAt(node, index),
        fieldPresenceAt: (node: SeaBreezeNodeId, index: number): SeaBreezePresence =>
            arena.fieldPresenceAt(node, index),
        unionLeft: (node: SeaBreezeNodeId): SeaBreezeNodeId =>
            arena.unionLeft(node),
        unionRight: (node: SeaBreezeNodeId): SeaBreezeNodeId =>
            arena.unionRight(node)
    });
}
