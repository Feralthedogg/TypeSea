/**
 * @file schema-predicate.ts
 * @brief Schema-specialized predicate kernels for validation plans.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 */

import {
    NumberCheckTag,
    ObjectModeTag,
    PresenceTag,
    SchemaTag,
    StringCheckTag
} from "../kind/index.js";
import {
    UUID_PATTERN,
    resolveLazySchema,
    schemaCanAcceptUndefined,
    type DiscriminatedUnionCase,
    type Schema
} from "../schema/index.js";
import {
    findDiscriminatedUnionCase,
    hasObjectKey,
    isArrayIndexKey,
    isDataPropertyDescriptor,
    isPlainRecord,
    readOwnDataProperty,
    type DataPropertyDescriptor
} from "../evaluate/shared.js";
import type { ValidationState } from "../evaluate/state.js";

/**
 * @brief child predicate runner.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 */
export type ChildPredicateRunner = (
    schema: Schema,
    value: unknown,
    state: ValidationState
) => boolean;

/**
 * @brief execute schema kernel.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 */
export function executeSchemaKernel(
    schema: Schema,
    value: unknown,
    state: ValidationState,
    runChild: ChildPredicateRunner
): boolean {
    switch (schema.tag) {
        case SchemaTag.Unknown:
            return true;
        case SchemaTag.Never:
            return false;
        case SchemaTag.String:
            return isStringSchema(schema, value);
        case SchemaTag.Number:
            return isNumberSchema(schema, value);
        case SchemaTag.BigInt:
            return typeof value === "bigint";
        case SchemaTag.Symbol:
            return typeof value === "symbol";
        case SchemaTag.Boolean:
            return typeof value === "boolean";
        case SchemaTag.Literal:
            return Object.is(value, schema.value);
        case SchemaTag.Array:
            return isArraySchema(schema.item, value, state, runChild);
        case SchemaTag.Tuple:
            return isTupleSchema(schema.items, value, state, runChild);
        case SchemaTag.Record:
            return isRecordSchema(schema.value, value, state, runChild);
        case SchemaTag.Object:
            return isObjectSchema(schema, value, state, runChild);
        case SchemaTag.Union:
            return isUnionSchema(schema.options, value, state, runChild);
        case SchemaTag.Intersection:
            return runChild(schema.left, value, state) &&
                runChild(schema.right, value, state);
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
            return value === undefined || runChild(schema.inner, value, state);
        case SchemaTag.Nullable:
            return value === null || runChild(schema.inner, value, state);
        case SchemaTag.DiscriminatedUnion:
            return isDiscriminatedUnionSchema(
                schema.key,
                schema.cases,
                value,
                state,
                runChild
            );
        case SchemaTag.Brand:
            return runChild(schema.inner, value, state);
        case SchemaTag.Lazy:
            return runChild(resolveLazySchema(schema, state.resolving), value, state);
        case SchemaTag.Refine:
            return runChild(schema.inner, value, state) &&
                isStrictTrue(schema.predicate(value));
    }
}

/**
 * @brief Execute a string schema against one runtime value.
 * @param schema String schema with normalized checks.
 * @param value Candidate runtime value.
 * @returns True when the value is a string and every string check passes.
 * @details Regex state is reset around each test so global or sticky patterns do
 * not leak `lastIndex` across validation calls.
 */
function isStringSchema(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.String }>,
    value: unknown
): boolean {
    if (typeof value !== "string") {
        return false;
    }
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            return false;
        }
        switch (check.tag) {
            case StringCheckTag.Min:
                if (value.length < check.value) {
                    return false;
                }
                break;
            case StringCheckTag.Max:
                if (value.length > check.value) {
                    return false;
                }
                break;
            case StringCheckTag.Regex:
                check.regex.lastIndex = 0;
                if (!check.regex.test(value)) {
                    return false;
                }
                check.regex.lastIndex = 0;
                break;
            case StringCheckTag.Uuid:
                UUID_PATTERN.lastIndex = 0;
                if (!UUID_PATTERN.test(value)) {
                    return false;
                }
                UUID_PATTERN.lastIndex = 0;
                break;
        }
    }
    return true;
}

/**
 * @brief Execute a number schema against one runtime value.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 * @param schema Number schema with normalized checks.
 * @param value Candidate runtime value.
 * @returns True when the value is finite and satisfies every numeric check.
 */
function isNumberSchema(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Number }>,
    value: unknown
): boolean {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return false;
    }
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            return false;
        }
        switch (check.tag) {
            case NumberCheckTag.Integer:
                if (!Number.isInteger(value)) {
                    return false;
                }
                break;
            case NumberCheckTag.Gte:
                if (value < check.value) {
                    return false;
                }
                break;
            case NumberCheckTag.Lte:
                if (value > check.value) {
                    return false;
                }
                break;
        }
    }
    return true;
}

/**
 * @brief Execute array validation with sparse-slot semantics.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 * @param item Schema applied to each logical array slot.
 * @param value Candidate value supplied by the caller.
 * @param state Shared recursion and cycle state.
 * @param runChild Dispatcher for nested schema predicates.
 * @returns True when the value satisfies the array schema.
 */
function isArraySchema(
    item: Schema,
    value: unknown,
    state: ValidationState,
    runChild: ChildPredicateRunner
): boolean {
    if (!Array.isArray(value)) {
        return false;
    }
    if (schemaCanAcceptUndefined(item)) {
        /*
         * Undefined-valid item schemas make holes valid. Use the present-index
         * walker so sparse arrays do not pay for absent slots.
         */
        return isPresentArraySchema(item, value, state, runChild);
    }
    for (let index = 0; index < value.length; index += 1) {
        const property = readArrayIndexDataProperty(value, index);
        if (property === null ||
            !runChild(item, property === undefined ? undefined : property.value, state)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Validate only present indexes for undefined-accepting item schemas.
 * @details Skips holes only when `undefined` is already accepted by the item schema.
 * @param item Schema applied to each present own index.
 * @param value Array already proven by the caller.
 * @param state Shared recursion and cycle state.
 * @param runChild Dispatcher for nested schema predicates.
 * @returns True when every present own index satisfies the item schema.
 */
function isPresentArraySchema(
    item: Schema,
    value: readonly unknown[],
    state: ValidationState,
    runChild: ChildPredicateRunner
): boolean {
    const keys = Object.getOwnPropertyNames(value);
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
        const key = keys[keyIndex];
        if (key === undefined || !isArrayIndexKey(key, value.length)) {
            continue;
        }
        /*
         * Accessor-backed present indexes are rejected here because reading them
         * would run user code and break the safe validation boundary.
         */
        const property = readArrayKeyDataProperty(value, key);
        if (property === null ||
            (property !== undefined && !runChild(item, property.value, state))) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Execute fixed-arity tuple validation.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 * @param items Schema for each tuple index.
 * @param value Candidate runtime value.
 * @param state Shared recursion and cycle state.
 * @param runChild Dispatcher for nested schema predicates.
 * @returns True when length and every indexed item match exactly.
 */
function isTupleSchema(
    items: readonly Schema[],
    value: unknown,
    state: ValidationState,
    runChild: ChildPredicateRunner
): boolean {
    if (!Array.isArray(value) || value.length !== items.length) {
        return false;
    }
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const property = readArrayIndexDataProperty(value, index);
        if (item === undefined ||
            property === null ||
            !runChild(item, property === undefined ? undefined : property.value, state)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Read one tuple or dense-array index through a descriptor.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 * @param value Array being inspected.
 * @param index Numeric index.
 * @returns Data descriptor, undefined for a hole, or null for an accessor slot.
 */
function readArrayIndexDataProperty(
    value: readonly unknown[],
    index: number
): DataPropertyDescriptor | null | undefined {
    return readArrayKeyDataProperty(value, String(index));
}

/**
 * @brief Read one canonical array index key without executing accessors.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 * @param value Array being inspected.
 * @param key Canonical array index key.
 * @returns Data descriptor, undefined for a hole, or null for an accessor slot.
 */
function readArrayKeyDataProperty(
    value: readonly unknown[],
    key: string
): DataPropertyDescriptor | null | undefined {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) {
        return undefined;
    }
    if (!isDataPropertyDescriptor(descriptor)) {
        return null;
    }
    return descriptor;
}

/**
 * @brief Check record schema.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
function isRecordSchema(
    item: Schema,
    value: unknown,
    state: ValidationState,
    runChild: ChildPredicateRunner
): boolean {
    if (!isPlainRecord(value)) {
        return false;
    }
    const keys = Object.keys(value);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined) {
            return false;
        }
        const property = readOwnDataProperty(value, key);
        if (property === undefined || !runChild(item, property.value, state)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Execute object schema validation.
 * @param schema Object schema with ordered entries and strict-mode lookup.
 * @param value Candidate runtime value.
 * @param state Shared recursion and cycle state.
 * @param runChild Dispatcher for nested property schemas.
 * @returns True when required/optional fields and strict-key rules pass.
 * @details Required properties are read through descriptors. In strict mode, the
 * all-required path can compare own key counts; optional shapes must inspect
 * each key so extra symbol or undeclared string keys fail closed.
 */
function isObjectSchema(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    value: unknown,
    state: ValidationState,
    runChild: ChildPredicateRunner
): boolean {
    if (!isPlainRecord(value)) {
        return false;
    }
    const record = value;
    const entries = schema.entries;
    let allRequired = true;
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
            return false;
        }
        if (entry.presence === PresenceTag.Optional) {
            allRequired = false;
        }
        const property = readOwnDataProperty(record, entry.key);
        if (property === undefined) {
            if (
                entry.presence === PresenceTag.Optional &&
                !Object.prototype.hasOwnProperty.call(record, entry.key)
            ) {
                continue;
            }
            return false;
        }
        if (!runChild(entry.schema, property.value, state)) {
            return false;
        }
    }
    if (schema.mode === ObjectModeTag.Strict) {
        if (allRequired) {
            return Object.getOwnPropertyNames(record).length === entries.length &&
                Object.getOwnPropertySymbols(record).length === 0;
        }
        const keys = Reflect.ownKeys(record);
        for (let index = 0; index < keys.length; index += 1) {
            const key = keys[index];
            if (typeof key !== "string" || !hasObjectKey(schema.keyLookup, key)) {
                return false;
            }
        }
    }
    return true;
}

/**
 * @brief Execute a general union by probing options in order.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 * @param options Union option schemas.
 * @param value Candidate runtime value.
 * @param state Shared recursion and cycle state.
 * @param runChild Dispatcher for nested option schemas.
 * @returns True when at least one option accepts the value.
 */
function isUnionSchema(
    options: readonly Schema[],
    value: unknown,
    state: ValidationState,
    runChild: ChildPredicateRunner
): boolean {
    for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        if (option !== undefined && runChild(option, value, state)) {
            return true;
        }
    }
    return false;
}

/**
 * @brief Execute a discriminated union through its tag field.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 * @param key Discriminant property name.
 * @param cases Closed case table.
 * @param value Candidate runtime value.
 * @param state Shared recursion and cycle state.
 * @param runChild Dispatcher for selected case schema.
 * @returns True when the discriminant is a string and the selected case passes.
 */
function isDiscriminatedUnionSchema(
    key: string,
    cases: readonly DiscriminatedUnionCase[],
    value: unknown,
    state: ValidationState,
    runChild: ChildPredicateRunner
): boolean {
    if (!isPlainRecord(value)) {
        return false;
    }
    const discriminantProperty = readOwnDataProperty(value, key);
    if (discriminantProperty === undefined ||
        typeof discriminantProperty.value !== "string") {
        return false;
    }
    const selected = findDiscriminatedUnionCase(cases, discriminantProperty.value);
    return selected !== undefined && runChild(selected, value, state);
}

/**
 * @brief Check strict true.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
function isStrictTrue(value: unknown): boolean {
    return value === true;
}
