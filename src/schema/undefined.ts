/**
 * @file undefined.ts
 * @brief Conservative undefined-acceptance analysis for schema slots.
 * @details Schema helpers enforce construction-time invariants before values reach
 * validation, compilation, or export.
 */

import { SchemaTag } from "../kind/index.js";
import type { Schema } from "./types.js";

/**
 * @brief Return whether `undefined` may satisfy a schema.
 * @details This is intentionally conservative for lazy and refine schemas because
 * the caller may not have a recursion state or a safe way to run user predicates.
 * @param schema Schema node whose static acceptance set is inspected.
 * @returns True when an absent array slot can be treated as already accepted.
 * @invariant This routine never executes user predicates or lazy factories.
 */
export function schemaCanAcceptUndefined(schema: Schema): boolean {
    switch (schema.tag) {
        case SchemaTag.Unknown:
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
            return true;
        case SchemaTag.Lazy:
        case SchemaTag.Refine:
            /*
             * Opaque child logic may reject undefined. A sparse hole must flow
             * through the child validator instead of being skipped up front.
             */
            return false;
        case SchemaTag.Literal:
            return schema.value === undefined;
        case SchemaTag.Union:
            return schemaArrayCanAcceptUndefined(schema.options);
        case SchemaTag.Intersection:
            /*
             * Intersections require both branches to accept the same value. If
             * either branch rejects undefined, a sparse hole must stay visible.
             */
            return schemaCanAcceptUndefined(schema.left) &&
                schemaCanAcceptUndefined(schema.right);
        case SchemaTag.Nullable:
        case SchemaTag.Brand:
            return schemaCanAcceptUndefined(schema.inner);
        case SchemaTag.Never:
        case SchemaTag.String:
        case SchemaTag.Number:
        case SchemaTag.Date:
        case SchemaTag.BigInt:
        case SchemaTag.Symbol:
        case SchemaTag.Boolean:
        case SchemaTag.Array:
        case SchemaTag.Map:
        case SchemaTag.Set:
        case SchemaTag.InstanceOf:
        case SchemaTag.Property:
        case SchemaTag.Object:
        case SchemaTag.DiscriminatedUnion:
        case SchemaTag.Tuple:
        case SchemaTag.Record:
            return false;
    }
}

/**
 * @brief Return whether `undefined` is statically rejected by a schema.
 * @details This is the dual proof used by compiled safe predicates. When this
 * returns true, an accessor descriptor can be read as `undefined` without
 * executing the getter because the child validator is guaranteed to fail that
 * value. Opaque lazy/refine schemas only return true when their inner schema
 * proves the rejection before user code can run.
 * @param schema Schema node whose static rejection set is inspected.
 * @returns True when `undefined` cannot satisfy the schema.
 * @invariant This routine never executes user predicates or lazy factories.
 */
export function schemaMustRejectUndefined(schema: Schema): boolean {
    switch (schema.tag) {
        case SchemaTag.Never:
        case SchemaTag.String:
        case SchemaTag.Number:
        case SchemaTag.Date:
        case SchemaTag.BigInt:
        case SchemaTag.Symbol:
        case SchemaTag.Boolean:
        case SchemaTag.Array:
        case SchemaTag.Map:
        case SchemaTag.Set:
        case SchemaTag.InstanceOf:
        case SchemaTag.Property:
        case SchemaTag.Object:
        case SchemaTag.DiscriminatedUnion:
        case SchemaTag.Tuple:
        case SchemaTag.Record:
            return true;
        case SchemaTag.Unknown:
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
        case SchemaTag.Lazy:
            return false;
        case SchemaTag.Literal:
            return schema.value !== undefined;
        case SchemaTag.Union:
            return schemaArrayMustRejectUndefined(schema.options);
        case SchemaTag.Intersection:
            return schemaMustRejectUndefined(schema.left) ||
                schemaMustRejectUndefined(schema.right);
        case SchemaTag.Nullable:
        case SchemaTag.Brand:
        case SchemaTag.Refine:
            return schemaMustRejectUndefined(schema.inner);
    }
}

/**
 * @brief Return whether at least one schema in a closed array may accept undefined.
 * @details Schema helpers enforce construction-time invariants before values reach
 * validation, compilation, or export.
 * @param schemas Closed schema list owned by a union-like node.
 * @returns True when one member admits undefined without evaluating input data.
 */
function schemaArrayCanAcceptUndefined(schemas: readonly Schema[]): boolean {
    for (let index = 0; index < schemas.length; index += 1) {
        const schema = schemas[index];
        if (schema !== undefined && schemaCanAcceptUndefined(schema)) {
            return true;
        }
    }
    return false;
}

/**
 * @brief Return whether every schema in a closed array rejects undefined.
 * @param schemas Closed schema list owned by a union-like node.
 * @returns True when no member admits undefined.
 */
function schemaArrayMustRejectUndefined(schemas: readonly Schema[]): boolean {
    for (let index = 0; index < schemas.length; index += 1) {
        const schema = schemas[index];
        if (schema === undefined || !schemaMustRejectUndefined(schema)) {
            return false;
        }
    }
    return true;
}
