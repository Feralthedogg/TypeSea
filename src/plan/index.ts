/**
 * @file index.ts
 * @brief Validation plan module aggregation.
 * @details This barrel keeps public import paths stable while implementation files remain
 * split by responsibility.
 */

export { makeValidationPlan, schemaRequiresTracking } from "./cache.js";
export {
    executeGraphPredicate,
    executeSchemaPredicate,
    executeSchemaPredicateWithState
} from "./predicate.js";
export type { ValidationPlan } from "./types.js";
