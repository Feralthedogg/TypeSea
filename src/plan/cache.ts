/**
 * @file cache.ts
 * @brief Validation plan cache.
 */

import { lowerSchema } from "../lower/index.js";
import { SchemaTag } from "../kind/index.js";
import { optimizeGraph } from "../optimize/index.js";
import type { Schema } from "../schema/index.js";
import type { ValidationPlan } from "./types.js";

/**
 * @brief plan cache.
 * @details Weakly keys plans by immutable schema identity without extending schema lifetime.
 * @invariant A cached plan always belongs to the exact schema object used as the key.
 */
const planCache = new WeakMap<Schema, ValidationPlan>();

/**
 * @brief tracking cache.
 * @details Stores whether a schema can re-enter itself through lazy recursion.
 * @invariant `true` means validation must use active schema/value pair tracking.
 */
const trackingCache = new WeakMap<Schema, boolean>();

/**
 * @brief make validation plan.
 * @details Lowers a schema into Sea-of-Nodes IR, runs the optimizer, and caches
 * the resulting graph for all runtime users of the schema.
 * @returns Cached or freshly built validation plan for the schema identity.
 */
export function makeValidationPlan(schema: Schema): ValidationPlan {
  const cached = planCache.get(schema);
  if (cached !== undefined) {
    return cached;
  }
  const plan: ValidationPlan = Object.freeze({
    schema,
    graph: optimizeGraph(lowerSchema(schema)),
    tracksRecursion: schemaRequiresTracking(schema)
  });
  planCache.set(schema, plan);
  return plan;
}

/**
 * @brief schema requires tracking.
 * @details Returns true only for schemas that can recurse through `lazy`.
 * @returns True when active schema/value pair tracking is required.
 */
export function schemaRequiresTracking(schema: Schema): boolean {
  const cached = trackingCache.get(schema);
  if (cached !== undefined) {
    return cached;
  }
  const result = schemaRequiresTrackingInner(schema, new WeakSet<object>());
  trackingCache.set(schema, result);
  return result;
}

/**
 * @brief schema requires tracking inner.
 */
function schemaRequiresTrackingInner(
  schema: Schema,
  seen: WeakSet<object>
): boolean {
  if (seen.has(schema)) {
    return false;
  }
  seen.add(schema);
  switch (schema.tag) {
    case SchemaTag.Lazy:
      return true;
    case SchemaTag.Array:
      return schemaRequiresTrackingInner(schema.item, seen);
    case SchemaTag.Tuple:
      return schemaArrayRequiresTracking(schema.items, seen);
    case SchemaTag.Record:
      return schemaRequiresTrackingInner(schema.value, seen);
    case SchemaTag.Object:
      for (let index = 0; index < schema.entries.length; index += 1) {
        const entry = schema.entries[index];
        if (entry !== undefined &&
          schemaRequiresTrackingInner(entry.schema, seen)) {
          return true;
        }
      }
      return false;
    case SchemaTag.Union:
      return schemaArrayRequiresTracking(schema.options, seen);
    case SchemaTag.Intersection:
      return schemaRequiresTrackingInner(schema.left, seen) ||
        schemaRequiresTrackingInner(schema.right, seen);
    case SchemaTag.Optional:
    case SchemaTag.Undefinedable:
    case SchemaTag.Nullable:
    case SchemaTag.Brand:
      return schemaRequiresTrackingInner(schema.inner, seen);
    case SchemaTag.DiscriminatedUnion:
      for (let index = 0; index < schema.cases.length; index += 1) {
        const unionCase = schema.cases[index];
        if (unionCase !== undefined &&
          schemaRequiresTrackingInner(unionCase.schema, seen)) {
          return true;
        }
      }
      return false;
    case SchemaTag.Refine:
      return schemaRequiresTrackingInner(schema.inner, seen);
    case SchemaTag.Unknown:
    case SchemaTag.Never:
    case SchemaTag.String:
    case SchemaTag.Number:
    case SchemaTag.BigInt:
    case SchemaTag.Symbol:
    case SchemaTag.Boolean:
    case SchemaTag.Literal:
      return false;
  }
}

/**
 * @brief schema array requires tracking.
 */
function schemaArrayRequiresTracking(
  schemas: readonly Schema[],
  seen: WeakSet<object>
): boolean {
  for (let index = 0; index < schemas.length; index += 1) {
    const schema = schemas[index];
    if (schema !== undefined && schemaRequiresTrackingInner(schema, seen)) {
      return true;
    }
  }
  return false;
}
