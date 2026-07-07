/**
 * @file unwrap.ts
 * @brief Wrapper schema normalization helpers.
 * @details These helpers rewrite schema shells only. They never evaluate user
 * predicates, resolve lazy thunks, or mutate the original frozen schema graph.
 */

import { SchemaTag } from "../kind/index.js";
import type { Schema } from "./types.js";

/**
 * @brief Return the payload schema carried by a wrapper or array schema.
 * @details Transparent annotation wrappers are skipped so `describe()` or
 * `message()` does not hide the underlying optional, nullable, or array node.
 * @param schema Schema whose direct validation payload should be exposed.
 * @returns Inner schema accepted by the wrapper.
 * @throws TypeError when no unwrappable node is reachable.
 */
export function unwrapSchema(schema: Schema): Schema {
    switch (schema.tag) {
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
        case SchemaTag.Nullable:
            return schema.inner;
        case SchemaTag.Array:
            return schema.item;
        case SchemaTag.Brand:
        case SchemaTag.Metadata:
        case SchemaTag.Message:
        case SchemaTag.Readonly:
            return unwrapSchema(schema.inner);
        case SchemaTag.Refine:
            return unwrapSchema(schema.inner);
        default:
            throw new TypeError("unwrap requires an optional, nullable, or array schema");
    }
}

/**
 * @brief Remove optional and explicit-undefined shells from a schema.
 * @details Nullable shells are preserved. This matches the useful Zod migration
 * meaning of "non optional": reject absent or undefined, but keep nullability.
 * @param schema Source schema to normalize.
 * @returns Schema with top-level undefined acceptance removed where possible.
 */
export function nonoptionalSchema(schema: Schema): Schema {
    switch (schema.tag) {
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
            return nonoptionalSchema(schema.inner);
        case SchemaTag.Nullable:
            return {
                tag: SchemaTag.Nullable,
                inner: nonoptionalSchema(schema.inner)
            };
        case SchemaTag.Brand:
            return {
                tag: SchemaTag.Brand,
                inner: nonoptionalSchema(schema.inner),
                brand: schema.brand
            };
        case SchemaTag.Metadata:
            return {
                tag: SchemaTag.Metadata,
                inner: nonoptionalSchema(schema.inner),
                metadata: schema.metadata
            };
        case SchemaTag.Message:
            return {
                tag: SchemaTag.Message,
                inner: nonoptionalSchema(schema.inner),
                message: schema.message
            };
        case SchemaTag.Readonly:
            return {
                tag: SchemaTag.Readonly,
                inner: nonoptionalSchema(schema.inner)
            };
        case SchemaTag.KeyedObject:
            return {
                tag: SchemaTag.KeyedObject,
                inner: nonoptionalSchema(schema.inner),
                keys: schema.keys,
                rule: schema.rule
            };
        case SchemaTag.PropertyCount:
            return {
                tag: SchemaTag.PropertyCount,
                inner: nonoptionalSchema(schema.inner),
                min: schema.min,
                max: schema.max
            };
        case SchemaTag.PropertyNames:
            return {
                tag: SchemaTag.PropertyNames,
                inner: nonoptionalSchema(schema.inner),
                key: schema.key
            };
        case SchemaTag.PatternProperties:
            return {
                tag: SchemaTag.PatternProperties,
                inner: nonoptionalSchema(schema.inner),
                entries: schema.entries,
                keys: schema.keys,
                keyLookup: schema.keyLookup,
                additional: schema.additional,
                allowAdditional: schema.allowAdditional
            };
        case SchemaTag.Refine:
            if (schema.collect === undefined) {
                return {
                    tag: SchemaTag.Refine,
                    inner: nonoptionalSchema(schema.inner),
                    predicate: schema.predicate,
                    path: schema.path,
                    message: schema.message,
                    abort: schema.abort,
                    when: schema.when,
                    name: schema.name
                };
            }
            return {
                tag: SchemaTag.Refine,
                inner: nonoptionalSchema(schema.inner),
                predicate: schema.predicate,
                collect: schema.collect,
                path: schema.path,
                message: schema.message,
                abort: schema.abort,
                when: schema.when,
                name: schema.name
            };
        default:
            return schema;
    }
}
