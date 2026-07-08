/**
 * @file serialize.ts
 * @brief SeaBreeze arena serialization helpers.
 * @details These helpers keep cache/AOT callers away from arena internals while
 * preserving the typed-array payload shape.
 */

import {
    SeaBreezeArena,
    type SeaBreezeSnapshot
} from "./sea-breeze.js";

/**
 * @brief Serialize an inference arena into typed-array tables.
 * @param arena Arena whose live nodes should be copied.
 * @returns Snapshot suitable for cache storage or later load().
 */
export function serializeSeaBreezeArena(arena: SeaBreezeArena): SeaBreezeSnapshot {
    return arena.snapshot();
}

/**
 * @brief Load a typed-array snapshot into an existing arena.
 * @param arena Destination arena with sufficient capacity.
 * @param snapshot Snapshot produced by serializeSeaBreezeArena().
 */
export function loadSeaBreezeSnapshot(
    arena: SeaBreezeArena,
    snapshot: SeaBreezeSnapshot
): void {
    arena.load(snapshot);
}
