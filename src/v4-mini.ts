/**
 * @file v4-mini.ts
 * @brief Zod v4 Mini-shaped compatibility subpath.
 * @details The surface mirrors `zod/v4-mini` by exposing functional builders
 * without a default export.
 */

import * as mini from "./mini.js";

export * from "./mini.js";
export * as core from "./core.js";

export const z = mini;
