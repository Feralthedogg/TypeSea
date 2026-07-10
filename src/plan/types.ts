/**
 * @file types.ts
 * @brief Optimized validation plan contracts.
 */

import type { Graph } from "../ir/index.js";
import type { Schema } from "../schema/index.js";

/**
 * @brief validation plan.
 * @details Binds one immutable schema object to the optimized Sea-of-Nodes graph
 * that is used by runtime boolean validation and generated predicate emission.
 * @invariant The graph is already lowered, optimized, validated, and frozen.
 */
export interface ValidationPlan {
    readonly schema: Schema;
    readonly graph: Graph;
    readonly tracksRecursion: boolean;
}
