/**
 * @file read.ts
 * @brief Guard receiver and constructor validation.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
 */

import { SchemaTag } from "../kind/index.js";
import type {
    ArraySchema,
    DateSchema,
    NumberSchema,
    Schema,
    StringSchema
} from "../schema/index.js";
import { freezeSchema, isSchemaValue } from "../schema/index.js";
import { isRecord } from "./props.js";
import { isConstructedGuard } from "./registry.js";

/**
 * @brief Read schema from a verified guard receiver.
 * @details Constructed guards take the WeakSet fast path; forged structural
 * guards must expose a valid own data schema before use. The fallback exists
 * because public methods can be detached from their instance in JavaScript.
 * @param guard Candidate receiver or guard-like value.
 * @param label Human-readable label used in TypeError messages.
 * @returns Valid runtime schema carried by the guard.
 * @throws TypeError when the receiver is not a valid TypeSea guard.
 */
export function readGuardSchema(
    guard: unknown,
    label: string
): Schema {
    if (isConstructedGuard(guard)) {
        /*
         * Constructed guards have already frozen their schema, so the registry
         * path avoids repeating structural schema validation for normal calls.
         */
        return guard.schema;
    }
    if (!isRecord(guard)) {
        throw new TypeError(`${label} must be a TypeSea guard`);
    }
    const schema = readOwnDataProperty(guard, "schema");
    if (!isSchemaValue(schema)) {
        throw new TypeError(`${label} must contain a valid TypeSea schema`);
    }
    return schema;
}

/**
 * @brief Read and require a string schema from a method receiver.
 * @param guard Candidate receiver.
 * @param label Human-readable label used in TypeError messages.
 * @returns String schema carried by the receiver.
 * @throws TypeError when the receiver is not a string guard.
 * @details StringGuard methods share this gate so subtype-specific helpers do
 * not duplicate receiver validation or accept forged schemas.
 */
export function readStringMethodSchema(guard: unknown, label: string): StringSchema {
    if (isConstructedGuard(guard)) {
        const schema = guard.schema;
        if (schema.tag !== SchemaTag.String) {
            throw new TypeError(`${label} must be a string TypeSea guard`);
        }
        return schema;
    }
    const schema = readGuardSchema(guard, label);
    if (schema.tag !== SchemaTag.String) {
        throw new TypeError(`${label} must be a string TypeSea guard`);
    }
    return schema;
}

/**
 * @brief Read and require a number schema from a method receiver.
 * @param guard Candidate receiver.
 * @param label Human-readable label used in TypeError messages.
 * @returns Number schema carried by the receiver.
 * @throws TypeError when the receiver is not a number guard.
 * @details NumberGuard methods must fail before reading numeric check vectors
 * when a receiver is detached or structurally forged.
 */
export function readNumberMethodSchema(guard: unknown, label: string): NumberSchema {
    if (isConstructedGuard(guard)) {
        const schema = guard.schema;
        if (schema.tag !== SchemaTag.Number) {
            throw new TypeError(`${label} must be a number TypeSea guard`);
        }
        return schema;
    }
    const schema = readGuardSchema(guard, label);
    if (schema.tag !== SchemaTag.Number) {
        throw new TypeError(`${label} must be a number TypeSea guard`);
    }
    return schema;
}

/**
 * @brief Read and require a Date schema from a method receiver.
 * @param guard Candidate receiver.
 * @param label Human-readable label used in TypeError messages.
 * @returns Date schema carried by the receiver.
 * @throws TypeError when the receiver is not a Date guard.
 */
export function readDateMethodSchema(guard: unknown, label: string): DateSchema {
    if (isConstructedGuard(guard)) {
        const schema = guard.schema;
        if (schema.tag !== SchemaTag.Date) {
            throw new TypeError(`${label} must be a date TypeSea guard`);
        }
        return schema;
    }
    const schema = readGuardSchema(guard, label);
    if (schema.tag !== SchemaTag.Date) {
        throw new TypeError(`${label} must be a date TypeSea guard`);
    }
    return schema;
}

/**
 * @brief Read and require an array schema from a method receiver.
 * @param guard Candidate receiver.
 * @param label Human-readable label used in TypeError messages.
 * @returns Array schema carried by the receiver.
 * @throws TypeError when the receiver is not an array guard.
 * @details ArrayGuard methods share this gate so fluent length helpers cannot
 * be detached and applied to unrelated guard instances.
 */
export function readArrayMethodSchema(guard: unknown, label: string): ArraySchema {
    if (isConstructedGuard(guard)) {
        const schema = guard.schema;
        if (schema.tag !== SchemaTag.Array) {
            throw new TypeError(`${label} must be an array TypeSea guard`);
        }
        return schema;
    }
    const schema = readGuardSchema(guard, label);
    if (schema.tag !== SchemaTag.Array) {
        throw new TypeError(`${label} must be an array TypeSea guard`);
    }
    return schema;
}

/**
 * @brief Validate and freeze a generic guard constructor schema.
 * @param schema Candidate runtime schema.
 * @returns Frozen schema accepted by BaseGuard.
 * @throws TypeError when the schema is malformed.
 * @details Constructors are the only place that accepts mutable schema records.
 * Freezing here lets normal method calls use the registry fast path later.
 */
export function readConstructorSchema(schema: unknown): Schema {
    if (!isSchemaValue(schema)) {
        throw new TypeError("guard constructor requires a valid TypeSea schema");
    }
    return freezeSchema(schema);
}

/**
 * @brief Validate a StringGuard constructor schema.
 * @param schema Candidate runtime schema.
 * @returns String schema accepted by StringGuard.
 * @throws TypeError when the schema is not a string schema.
 * @details Specialized guards keep their schema tag invariant at construction,
 * so hot method calls only need to verify receiver identity.
 */
export function readStringConstructorSchema(schema: unknown): StringSchema {
    if (!isSchemaValue(schema) || schema.tag !== SchemaTag.String) {
        throw new TypeError("StringGuard constructor requires a string schema");
    }
    return schema;
}

/**
 * @brief Validate a NumberGuard constructor schema.
 * @param schema Candidate runtime schema.
 * @returns Number schema accepted by NumberGuard.
 * @throws TypeError when the schema is not a number schema.
 * @details Rejecting non-number schemas at construction prevents mixed scalar
 * helper methods from observing incompatible check vectors.
 */
export function readNumberConstructorSchema(schema: unknown): NumberSchema {
    if (!isSchemaValue(schema) || schema.tag !== SchemaTag.Number) {
        throw new TypeError("NumberGuard constructor requires a number schema");
    }
    return schema;
}

/**
 * @brief Validate a DateGuard constructor schema.
 * @param schema Candidate runtime schema.
 * @returns Date schema accepted by DateGuard.
 * @throws TypeError when the schema is not a Date schema.
 */
export function readDateConstructorSchema(schema: unknown): DateSchema {
    if (!isSchemaValue(schema) || schema.tag !== SchemaTag.Date) {
        throw new TypeError("DateGuard constructor requires a date schema");
    }
    return schema;
}

/**
 * @brief Validate an ArrayGuard constructor schema.
 * @param schema Candidate runtime schema.
 * @returns Array schema accepted by ArrayGuard.
 * @throws TypeError when the schema is not an array schema.
 * @details The schema validator already checks the item tree and length-check
 * vector, so the specialized constructor only enforces the root tag.
 */
export function readArrayConstructorSchema(schema: unknown): ArraySchema {
    if (!isSchemaValue(schema) || schema.tag !== SchemaTag.Array) {
        throw new TypeError("ArrayGuard constructor requires an array schema");
    }
    return schema;
}

/**
 * @brief Validate refinement API inputs.
 * @param predicate Candidate refinement predicate.
 * @param name Candidate diagnostic name.
 * @throws TypeError when either input has the wrong runtime type.
 * @details Refinements execute user code by design. This gate narrows the call
 * target and diagnostic label before the schema stores them.
 */
export function checkRefinementInput(
    predicate: unknown,
    name: unknown
): asserts predicate is (value: unknown) => boolean {
    if (typeof predicate !== "function") {
        throw new TypeError("refinement predicate must be a function");
    }
    if (typeof name !== "string") {
        throw new TypeError("refinement name must be a string");
    }
}

/**
 * @brief Validate a non-negative string length bound.
 * @param value Candidate bound.
 * @param label Bound label used in RangeError messages.
 * @returns The validated bound.
 * @throws RangeError when the bound is negative or non-integer.
 * @details Bounds are checked once at builder time so generated validators can
 * emit straight comparisons without defensive range checks.
 */
export function checkStringLengthBound(value: number, label: string): number {
    if (!Number.isInteger(value) || value < 0) {
        throw new RangeError(`${label} length bound must be a non-negative integer`);
    }
    return value;
}

/**
 * @brief Validate a non-negative array length bound.
 * @param value Candidate bound.
 * @param label Bound label used in RangeError messages.
 * @returns The validated bound.
 * @throws RangeError when the bound is negative or non-integer.
 * @details Array bounds share the same integer contract as string length
 * bounds, but the separate helper keeps public error text precise.
 */
export function checkArrayLengthBound(value: number, label: string): number {
    if (!Number.isInteger(value) || value < 0) {
        throw new RangeError(`${label} array length bound must be a non-negative integer`);
    }
    return value;
}

/**
 * @brief Validate a finite numeric bound.
 * @param value Candidate bound.
 * @param label Bound label used in RangeError messages.
 * @returns The validated bound.
 * @throws RangeError when the bound is not finite.
 * @details Finite bounds keep interpreter, plan, and emitted code semantics
 * aligned for comparisons such as gte and lte.
 */
export function checkFiniteNumberBound(value: number, label: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new RangeError(`${label} numeric bound must be finite`);
    }
    return value;
}

/**
 * @brief Normalize a Date bound into a finite epoch millisecond value.
 * @param value Candidate Date bound.
 * @param label Bound label used in RangeError messages.
 * @returns Finite epoch millisecond value.
 * @throws RangeError when the bound is not a valid Date instance.
 */
export function checkDateBound(value: Date, label: string): number {
    if (!(value instanceof Date)) {
        throw new RangeError(`${label} date bound must be a Date`);
    }
    const time = Date.prototype.getTime.call(value);
    if (!Number.isFinite(time)) {
        throw new RangeError(`${label} date bound must be valid`);
    }
    return time;
}

/**
 * @brief Read one own data slot from a structural guard receiver.
 * @param value Candidate receiver.
 * @param key Field name or symbol.
 * @returns Stored field value, or undefined when the slot is absent.
 * @details Structural guard support is intentionally narrow: inherited schema
 * getters must not execute while validating detached method receivers.
 */
function readOwnDataProperty(
    value: object,
    key: PropertyKey
): unknown {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        return undefined;
    }
    return descriptor.value;
}
