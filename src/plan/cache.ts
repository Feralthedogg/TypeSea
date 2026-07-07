/**
 * @file cache.ts
 * @brief Validation plan cache.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
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
 * @brief Build or reuse the optimized validation plan for a schema identity.
 * @details Lowers a schema into Sea-of-Nodes IR, runs the optimizer, and caches
 * the resulting graph for all runtime users of the schema. Schema objects are
 * immutable after construction, so identity is a stable cache key.
 * @param schema Schema whose execution plan is requested.
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
 * @brief Decide whether validation needs active schema/value pair tracking.
 * @details Returns true only for schemas that can recurse through `lazy`.
 * Non-recursive schemas can skip the WeakMap bookkeeping on the hot path.
 * @param schema Schema being analyzed.
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
 * @brief Walk a schema tree looking for lazy recursion boundaries.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 * @param schema Current schema node.
 * @param seen Schema identities already visited in this walk.
 * @returns True when a reachable node can re-enter validation recursively.
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
            return schemaArrayRequiresTracking(schema.items, seen) ||
                (schema.rest !== undefined &&
                    schemaRequiresTrackingInner(schema.rest, seen));
        case SchemaTag.Record:
            return (schema.key !== undefined &&
                schemaRequiresTrackingInner(schema.key, seen)) ||
                schemaRequiresTrackingInner(schema.value, seen);
        case SchemaTag.Map:
            return schemaRequiresTrackingInner(schema.key, seen) ||
                schemaRequiresTrackingInner(schema.value, seen);
        case SchemaTag.Set:
            return schemaRequiresTrackingInner(schema.item, seen);
        case SchemaTag.Property:
            return schemaRequiresTrackingInner(schema.base, seen) ||
                schemaRequiresTrackingInner(schema.value, seen);
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
        case SchemaTag.Xor:
            return schemaArrayRequiresTracking(schema.options, seen);
        case SchemaTag.Intersection:
            return schemaRequiresTrackingInner(schema.left, seen) ||
                schemaRequiresTrackingInner(schema.right, seen);
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
        case SchemaTag.Nullable:
        case SchemaTag.Brand:
        case SchemaTag.Metadata:
        case SchemaTag.Message:
        case SchemaTag.KeyedObject:
        case SchemaTag.PropertyCount:
            return schemaRequiresTrackingInner(schema.inner, seen);
        case SchemaTag.PropertyNames:
            return schemaRequiresTrackingInner(schema.inner, seen) ||
                schemaRequiresTrackingInner(schema.key, seen);
        case SchemaTag.PatternProperties:
            return schemaRequiresTrackingInner(schema.inner, seen) ||
                patternPropertiesRequireTracking(schema, seen);
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
        case SchemaTag.Readonly:
            return schemaRequiresTrackingInner(schema.inner, seen);
        case SchemaTag.Unknown:
        case SchemaTag.Never:
        case SchemaTag.String:
        case SchemaTag.Number:
        case SchemaTag.Date:
        case SchemaTag.File:
        case SchemaTag.InstanceOf:
        case SchemaTag.BigInt:
        case SchemaTag.Symbol:
        case SchemaTag.Boolean:
        case SchemaTag.Literal:
            return false;
    }
}

/**
 * @brief Scan pattern-property children for recursion tracking needs.
 */
function patternPropertiesRequireTracking(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.PatternProperties }>,
    seen: WeakSet<object>
): boolean {
    for (let index = 0; index < schema.entries.length; index += 1) {
        const entry = schema.entries[index];
        if (entry !== undefined &&
            schemaRequiresTrackingInner(entry.schema, seen)) {
            return true;
        }
    }
    return schema.additional !== undefined &&
        schemaRequiresTrackingInner(schema.additional, seen);
}

/**
 * @brief Scan a vector of child schemas for recursion tracking needs.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 * @param schemas Child schema vector.
 * @param seen Schema identities already visited in this walk.
 * @returns True when at least one child requires active-pair tracking.
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
