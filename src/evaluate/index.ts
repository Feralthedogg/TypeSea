/**
 * @file index.ts
 * @brief Public evaluation module aggregation.
 * @details This barrel keeps public import paths stable while implementation files remain
 * split by responsibility.
 */

export { checkSchema } from "./check.js";
export { isSchema } from "./predicate.js";
