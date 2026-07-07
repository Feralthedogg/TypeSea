/**
 * @file undefined.ts
 * @brief Conservative undefined-acceptance analysis for schema slots.
 * @details Schema helpers enforce construction-time invariants before values reach
 * validation, compilation, or export.
 */

import { PresenceTag, SchemaTag } from "../kind/index.js";
import type { ObjectEntry, Schema } from "./types.js";

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
        case SchemaTag.Xor:
            return schemaArrayUndefinedAcceptCount(schema.options) === 1;
        case SchemaTag.Intersection:
            /*
             * Intersections require both branches to accept the same value. If
             * either branch rejects undefined, a sparse hole must stay visible.
             */
            return schemaCanAcceptUndefined(schema.left) &&
                schemaCanAcceptUndefined(schema.right);
        case SchemaTag.Nullable:
        case SchemaTag.Brand:
        case SchemaTag.Metadata:
        case SchemaTag.Message:
        case SchemaTag.Readonly:
            return schemaCanAcceptUndefined(schema.inner);
        case SchemaTag.KeyedObject:
        case SchemaTag.PropertyCount:
        case SchemaTag.PropertyNames:
        case SchemaTag.PatternProperties:
            return false;
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
        case SchemaTag.File:
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
        case SchemaTag.File:
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
        case SchemaTag.Xor:
            return schemaArrayUndefinedAcceptCount(schema.options) !== 1;
        case SchemaTag.Intersection:
            return schemaMustRejectUndefined(schema.left) ||
                schemaMustRejectUndefined(schema.right);
        case SchemaTag.Nullable:
        case SchemaTag.Brand:
        case SchemaTag.Refine:
        case SchemaTag.Metadata:
        case SchemaTag.Message:
        case SchemaTag.Readonly:
            return schemaMustRejectUndefined(schema.inner);
        case SchemaTag.KeyedObject:
        case SchemaTag.PropertyCount:
        case SchemaTag.PropertyNames:
        case SchemaTag.PatternProperties:
            return true;
    }
}

/**
 * @brief Resolve object-field presence after deferred getter normalization.
 * @details Zod-style object shape getters cannot be executed while the object
 * guard is being constructed. Getter entries therefore carry a deferred
 * presence tag and resolve it only when execution needs missing-key semantics.
 * @param entry Object entry whose presence should be interpreted.
 * @returns Required or optional presence after resolving getter-backed entries.
 */
export function resolveObjectEntryPresence(entry: ObjectEntry): PresenceTag {
    if (entry.presence !== PresenceTag.Deferred) {
        return entry.presence;
    }
    if (entry.schema.tag !== SchemaTag.Lazy || entry.schema.objectPresence === undefined) {
        return PresenceTag.Required;
    }
    return entry.schema.objectPresence();
}

/**
 * @brief Return whether a missing own object key is accepted by an entry.
 * @param entry Object entry being checked.
 * @returns True when the field may be omitted.
 */
export function objectEntryCanBeOmitted(entry: ObjectEntry): boolean {
    return resolveObjectEntryPresence(entry) === PresenceTag.Optional;
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
 * @brief Count schemas that statically accept undefined.
 */
function schemaArrayUndefinedAcceptCount(schemas: readonly Schema[]): number {
    let count = 0;
    for (let index = 0; index < schemas.length; index += 1) {
        const schema = schemas[index];
        if (schema !== undefined && schemaCanAcceptUndefined(schema)) {
            count += 1;
        }
    }
    return count;
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
