/**
 * @file schema-predicate.ts
 * @brief Schema-specialized predicate kernels for validation plans.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 */

import {
    ArrayCheckTag,
    BigIntCheckTag,
    DateCheckTag,
    FileCheckTag,
    KeyRuleTag,
    NumberCheckTag,
    ObjectModeTag,
    PresenceTag,
    SchemaTag,
    StringCheckTag
} from "../kind/index.js";
import {
    EMAIL_PATTERN,
    IPV4_PATTERN,
    IPV6_PATTERN,
    ISO_DATETIME_PATTERN,
    ISO_DATE_PATTERN,
    KSUID_PATTERN,
    ULID_PATTERN,
    URL_PATTERN,
    UUID_PATTERN,
    XID_PATTERN,
    objectEntryCanBeOmitted,
    recordKeyInput,
    resolveLazySchema,
    schemaCanAcceptUndefined,
    type DiscriminatedUnionCase,
    type Schema
} from "../schema/index.js";
import type { Issue } from "../issue/index.js";
import {
    findDiscriminatedUnionCase,
    hasObjectKey,
    isArrayIndexKey,
    isDataPropertyDescriptor,
    isValidDateObject,
    isPlainRecord,
    ordinaryHasInstance,
    readDateTime,
    readFileInfo,
    readMapEntries,
    readMapSize,
    readOwnDataProperty,
    readSetSize,
    readSetValues,
    type DataPropertyDescriptor
} from "../evaluate/shared.js";
import type { ValidationState } from "../evaluate/state.js";

const EMPTY_ISSUES: readonly Issue[] = Object.freeze([]);

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
        case SchemaTag.Date:
            return isDateSchema(schema, value);
        case SchemaTag.BigInt:
            return isBigIntSchema(schema, value);
        case SchemaTag.Symbol:
            return typeof value === "symbol";
        case SchemaTag.Boolean:
            return typeof value === "boolean";
        case SchemaTag.Literal:
            return Object.is(value, schema.value);
        case SchemaTag.Array:
            return isArraySchema(schema, value, state, runChild);
        case SchemaTag.Tuple:
            return isTupleSchema(schema, value, state, runChild);
        case SchemaTag.Record:
            return isRecordSchema(schema, value, state, runChild);
        case SchemaTag.Map:
            return isMapSchema(schema, value, state, runChild);
        case SchemaTag.Set:
            return isSetSchema(schema, value, state, runChild);
        case SchemaTag.File:
            return isFileSchema(schema, value);
        case SchemaTag.InstanceOf:
            return ordinaryHasInstance(value, schema.constructor);
        case SchemaTag.Property:
            return isPropertySchema(schema, value, state, runChild);
        case SchemaTag.Object:
            return isObjectSchema(schema, value, state, runChild);
        case SchemaTag.Union:
            return isUnionSchema(schema.options, value, state, runChild);
        case SchemaTag.Xor:
            return isXorSchema(schema.options, value, state, runChild);
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
        case SchemaTag.Metadata:
        case SchemaTag.Message:
            return runChild(schema.inner, value, state);
        case SchemaTag.KeyedObject:
            return runChild(schema.inner, value, state) &&
                isKeyedObjectSchema(schema.keys, schema.rule, value);
        case SchemaTag.PropertyCount:
            return runChild(schema.inner, value, state) &&
                isPropertyCountSchema(schema.min, schema.max, value);
        case SchemaTag.PropertyNames:
            return runChild(schema.inner, value, state) &&
                isPropertyNamesSchema(schema.key, value, state, runChild);
        case SchemaTag.PatternProperties:
            return runChild(schema.inner, value, state) &&
                isPatternPropertiesSchema(schema, value, state, runChild);
        case SchemaTag.Readonly:
            return runChild(schema.inner, value, state);
        case SchemaTag.Lazy:
            return runChild(resolveLazySchema(schema, state.resolving), value, state);
        case SchemaTag.Refine:
            if (!runChild(schema.inner, value, state)) {
                return false;
            }
            if (!shouldRunRefinement(schema, value)) {
                return true;
            }
            return isStrictTrue(schema.predicate(value));
    }
}

/**
 * @brief Execute a keyed-object semantic rule.
 * @param keys Selected own data keys.
 * @param rule Key-count rule.
 * @param value Candidate runtime value.
 * @returns True when the selected keys satisfy the rule.
 */
function isKeyedObjectSchema(
    keys: readonly string[],
    rule: KeyRuleTag,
    value: unknown
): boolean {
    if (!isPlainRecord(value)) {
        return false;
    }
    const count = countOwnDataKeys(value, keys);
    if (rule === KeyRuleTag.AtLeastOne) {
        return count > 0;
    }
    return count === 1;
}

/**
 * @brief Execute a JSON Schema property-count rule.
 */
function isPropertyCountSchema(
    min: number | undefined,
    max: number | undefined,
    value: unknown
): boolean {
    if (!isPlainRecord(value)) {
        return false;
    }
    const count = Object.keys(value).length;
    return (min === undefined || count >= min) &&
        (max === undefined || count <= max);
}

/**
 * @brief Execute a JSON Schema property-name rule.
 */
function isPropertyNamesSchema(
    keySchema: Schema,
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
        if (key !== undefined && !runChild(keySchema, key, state)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Execute JSON Schema pattern-property rules.
 */
function isPatternPropertiesSchema(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.PatternProperties }>,
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
        if (key === undefined ||
            !isPatternPropertyKey(schema, value, key, state, runChild)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Execute pattern-property rules for one key.
 */
function isPatternPropertyKey(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.PatternProperties }>,
    value: Readonly<Record<string, unknown>>,
    key: string,
    state: ValidationState,
    runChild: ChildPredicateRunner
): boolean {
    let matched = false;
    for (let index = 0; index < schema.entries.length; index += 1) {
        const entry = schema.entries[index];
        if (entry === undefined || !testRegex(entry.regex, key)) {
            continue;
        }
        matched = true;
        const property = readOwnDataProperty(value, key);
        if (property === undefined ||
            !runChild(entry.schema, property.value, state)) {
            return false;
        }
    }
    if (matched || hasObjectKey(schema.keyLookup, key)) {
        return true;
    }
    if (schema.additional !== undefined) {
        const property = readOwnDataProperty(value, key);
        return property !== undefined &&
            runChild(schema.additional, property.value, state);
    }
    return schema.allowAdditional;
}

/**
 * @brief Test a regular expression without leaking lastIndex state.
 */
function testRegex(regex: RegExp, value: string): boolean {
    regex.lastIndex = 0;
    const accepted = regex.test(value);
    regex.lastIndex = 0;
    return accepted;
}

/**
 * @brief Count selected own data properties without running getters.
 */
function countOwnDataKeys(
    value: Readonly<Record<string, unknown>>,
    keys: readonly string[]
): number {
    let count = 0;
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key !== undefined && readOwnDataProperty(value, key) !== undefined) {
            count += 1;
        }
    }
    return count;
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
            case StringCheckTag.Email:
                EMAIL_PATTERN.lastIndex = 0;
                if (!EMAIL_PATTERN.test(value)) {
                    return false;
                }
                EMAIL_PATTERN.lastIndex = 0;
                break;
            case StringCheckTag.Url:
                URL_PATTERN.lastIndex = 0;
                if (!URL_PATTERN.test(value)) {
                    return false;
                }
                URL_PATTERN.lastIndex = 0;
                break;
            case StringCheckTag.IsoDate:
                ISO_DATE_PATTERN.lastIndex = 0;
                if (!ISO_DATE_PATTERN.test(value)) {
                    return false;
                }
                ISO_DATE_PATTERN.lastIndex = 0;
                break;
            case StringCheckTag.IsoDateTime:
                ISO_DATETIME_PATTERN.lastIndex = 0;
                if (!ISO_DATETIME_PATTERN.test(value)) {
                    return false;
                }
                ISO_DATETIME_PATTERN.lastIndex = 0;
                break;
            case StringCheckTag.Ulid:
                ULID_PATTERN.lastIndex = 0;
                if (!ULID_PATTERN.test(value)) {
                    return false;
                }
                ULID_PATTERN.lastIndex = 0;
                break;
            case StringCheckTag.Xid:
                XID_PATTERN.lastIndex = 0;
                if (!XID_PATTERN.test(value)) {
                    return false;
                }
                XID_PATTERN.lastIndex = 0;
                break;
            case StringCheckTag.Ksuid:
                KSUID_PATTERN.lastIndex = 0;
                if (!KSUID_PATTERN.test(value)) {
                    return false;
                }
                KSUID_PATTERN.lastIndex = 0;
                break;
            case StringCheckTag.Ipv4:
                IPV4_PATTERN.lastIndex = 0;
                if (!IPV4_PATTERN.test(value)) {
                    return false;
                }
                IPV4_PATTERN.lastIndex = 0;
                break;
            case StringCheckTag.Ipv6:
                IPV6_PATTERN.lastIndex = 0;
                if (!IPV6_PATTERN.test(value)) {
                    return false;
                }
                IPV6_PATTERN.lastIndex = 0;
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
            case NumberCheckTag.Gt:
                if (value <= check.value) {
                    return false;
                }
                break;
            case NumberCheckTag.Lt:
                if (value >= check.value) {
                    return false;
                }
                break;
            case NumberCheckTag.MultipleOf:
                if (value % check.value !== 0) {
                    return false;
                }
                break;
        }
    }
    return true;
}

/**
 * @brief Execute a bigint schema against one runtime value.
 */
function isBigIntSchema(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.BigInt }>,
    value: unknown
): boolean {
    if (typeof value !== "bigint") {
        return false;
    }
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            return false;
        }
        switch (check.tag) {
            case BigIntCheckTag.Gte:
                if (value < check.value) {
                    return false;
                }
                break;
            case BigIntCheckTag.Lte:
                if (value > check.value) {
                    return false;
                }
                break;
            case BigIntCheckTag.Gt:
                if (value <= check.value) {
                    return false;
                }
                break;
            case BigIntCheckTag.Lt:
                if (value >= check.value) {
                    return false;
                }
                break;
            case BigIntCheckTag.MultipleOf:
                if (value % check.value !== 0n) {
                    return false;
                }
                break;
        }
    }
    return true;
}

/**
 * @brief Execute a Date schema against one runtime value.
 * @param schema Date schema with normalized epoch-millisecond checks.
 * @param value Candidate runtime value.
 * @returns True when the value is a valid Date satisfying every bound.
 */
function isDateSchema(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Date }>,
    value: unknown
): boolean {
    if (!isValidDateObject(value)) {
        return false;
    }
    const time = readDateTime(value);
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            return false;
        }
        switch (check.tag) {
            case DateCheckTag.Min:
                if (time < check.value) {
                    return false;
                }
                break;
            case DateCheckTag.Max:
                if (time > check.value) {
                    return false;
                }
                break;
        }
    }
    return true;
}

/**
 * @brief Execute a File schema against one runtime value.
 * @param schema File schema with size and MIME checks.
 * @param value Candidate runtime value.
 * @returns True when value is a File satisfying all configured checks.
 */
function isFileSchema(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.File }>,
    value: unknown
): boolean {
    const file = readFileInfo(value);
    if (file === undefined) {
        return false;
    }
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            return false;
        }
        switch (check.tag) {
            case FileCheckTag.Min:
                if (file.size < check.value) {
                    return false;
                }
                break;
            case FileCheckTag.Max:
                if (file.size > check.value) {
                    return false;
                }
                break;
            case FileCheckTag.Mime:
                if (!isFileMime(file.type, check.values)) {
                    return false;
                }
                break;
        }
    }
    return true;
}

/**
 * @brief Match an exact MIME type or top-level wildcard.
 */
function isFileMime(type: string, patterns: readonly string[]): boolean {
    for (let index = 0; index < patterns.length; index += 1) {
        const pattern = patterns[index];
        if (pattern === undefined) {
            return false;
        }
        if (Object.is(pattern, type)) {
            return true;
        }
        if (pattern.endsWith("/*") && type.startsWith(pattern.slice(0, -1))) {
            return true;
        }
    }
    return false;
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
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Array }>,
    value: unknown,
    state: ValidationState,
    runChild: ChildPredicateRunner
): boolean {
    if (!Array.isArray(value)) {
        return false;
    }
    if (!arrayLengthChecksPass(schema, value.length)) {
        return false;
    }
    const item = schema.item;
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
 * @brief Test array length checks after Array.isArray succeeds.
 * @param schema Array schema with normalized checks.
 * @param length Candidate array length.
 * @returns True when every configured length bound accepts the length.
 */
function arrayLengthChecksPass(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Array }>,
    length: number
): boolean {
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            return false;
        }
        switch (check.tag) {
            case ArrayCheckTag.Min:
                if (length < check.value) {
                    return false;
                }
                break;
            case ArrayCheckTag.Max:
                if (length > check.value) {
                    return false;
                }
                break;
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
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Tuple }>,
    value: unknown,
    state: ValidationState,
    runChild: ChildPredicateRunner
): boolean {
    if (!Array.isArray(value)) {
        return false;
    }
    const items = schema.items;
    const rest = schema.rest;
    if (rest === undefined && value.length !== items.length) {
        return false;
    }
    if (rest !== undefined && value.length < items.length) {
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
    if (rest !== undefined) {
        for (let index = items.length; index < value.length; index += 1) {
            const property = readArrayIndexDataProperty(value, index);
            if (property === null ||
                !runChild(rest, property === undefined ? undefined : property.value, state)) {
                return false;
            }
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
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Record }>,
    value: unknown,
    state: ValidationState,
    runChild: ChildPredicateRunner
): boolean {
    if (!isPlainRecord(value)) {
        return false;
    }
    if (!hasRequiredRecordKeys(schema.requiredKeys, value)) {
        return false;
    }
    const keys = Object.keys(value);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined) {
            return false;
        }
        const property = readOwnDataProperty(value, key);
        if (schema.key !== undefined) {
            const keyInput = recordKeyInput(schema.key, key);
            const keyAccepted = runChild(schema.key, keyInput, state);
            if (!keyAccepted) {
                if (schema.loose) {
                    continue;
                }
                return false;
            }
        }
        if (property === undefined || !runChild(schema.value, property.value, state)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Check exhaustive record keys without executing accessors.
 */
function hasRequiredRecordKeys(
    keys: readonly string[] | undefined,
    value: Readonly<Record<string, unknown>>
): boolean {
    if (keys === undefined) {
        return true;
    }
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined) {
            return false;
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor?.enumerable !== true ||
            !isDataPropertyDescriptor(descriptor)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Check Map schema.
 * @param schema Map schema with key and value validators.
 * @param value Candidate runtime value.
 * @param state Shared recursion and cycle state.
 * @param runChild Dispatcher for nested predicates.
 * @returns True when every entry key and value satisfies its schema.
 */
function isMapSchema(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Map }>,
    value: unknown,
    state: ValidationState,
    runChild: ChildPredicateRunner
): boolean {
    const iterator = readMapEntries(value);
    if (iterator === undefined) {
        return false;
    }
    if (!sizeChecksPass(schema.checks, readMapSize(value))) {
        return false;
    }
    for (;;) {
        const step = iterator.next();
        if (step.done === true) {
            return true;
        }
        const pair = step.value;
        if (!runChild(schema.key, pair[0], state) ||
            !runChild(schema.value, pair[1], state)) {
            return false;
        }
    }
}

/**
 * @brief Check Set size constraints.
 */
function setSizeChecksPass(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Set }>,
    value: unknown
): boolean {
    return sizeChecksPass(schema.checks, readSetSize(value));
}

/**
 * @brief Check collection size constraints.
 */
function sizeChecksPass(
    checks: Extract<Schema, { readonly tag: typeof SchemaTag.Array }>["checks"],
    size: number | undefined
): boolean {
    if (size === undefined) {
        return false;
    }
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case ArrayCheckTag.Min:
                if (size < check.value) {
                    return false;
                }
                break;
            case ArrayCheckTag.Max:
                if (size > check.value) {
                    return false;
                }
                break;
        }
    }
    return true;
}

/**
 * @brief Check Set schema.
 * @param schema Set schema with item validator.
 * @param value Candidate runtime value.
 * @param state Shared recursion and cycle state.
 * @param runChild Dispatcher for nested predicates.
 * @returns True when every Set item satisfies its schema.
 */
function isSetSchema(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Set }>,
    value: unknown,
    state: ValidationState,
    runChild: ChildPredicateRunner
): boolean {
    const iterator = readSetValues(value);
    if (iterator === undefined) {
        return false;
    }
    if (!setSizeChecksPass(schema, value)) {
        return false;
    }
    for (;;) {
        const step = iterator.next();
        if (step.done === true) {
            return true;
        }
        if (!runChild(schema.item, step.value, state)) {
            return false;
        }
    }
}

/**
 * @brief Check property schema.
 * @param schema Property schema with base and own data property validators.
 * @param value Candidate runtime value.
 * @param state Shared recursion and cycle state.
 * @param runChild Dispatcher for nested predicates.
 * @returns True when base and property value both pass.
 */
function isPropertySchema(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Property }>,
    value: unknown,
    state: ValidationState,
    runChild: ChildPredicateRunner
): boolean {
    if (!runChild(schema.base, value, state)) {
        return false;
    }
    if (((typeof value !== "object" && typeof value !== "function") || value === null)) {
        return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, schema.key);
    return descriptor !== undefined &&
        isDataPropertyDescriptor(descriptor) &&
        runChild(schema.value, descriptor.value, state);
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
        if (entry.presence !== PresenceTag.Required) {
            allRequired = false;
        }
        const property = readOwnDataProperty(record, entry.key);
        if (property === undefined) {
            if (!Object.prototype.hasOwnProperty.call(record, entry.key) &&
                objectEntryCanBeOmitted(entry)) {
                continue;
            }
            return false;
        }
        if (!runChild(entry.schema, property.value, state)) {
            return false;
        }
    }
    if (schema.mode === ObjectModeTag.Strict) {
        if (schema.catchall !== undefined) {
            return validateObjectCatchall(schema, record, state, runChild);
        }
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
    if (schema.catchall !== undefined) {
        return validateObjectCatchall(schema, record, state, runChild);
    }
    return true;
}

/**
 * @brief Validate undeclared own object keys through a catchall schema.
 * @param schema Object schema carrying known-key metadata and catchall schema.
 * @param record Runtime object already proven to be a plain record.
 * @param state Shared recursion and cycle state.
 * @param runChild Dispatcher for the catchall schema.
 * @returns True when every extra own data property satisfies the catchall.
 */
function validateObjectCatchall(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    record: Readonly<Record<string, unknown>>,
    state: ValidationState,
    runChild: ChildPredicateRunner
): boolean {
    const catchall = schema.catchall;
    if (catchall === undefined) {
        return true;
    }
    const keys = Reflect.ownKeys(record);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined ||
            (typeof key === "string" && hasObjectKey(schema.keyLookup, key))) {
            continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(record, key);
        if (descriptor === undefined || !isDataPropertyDescriptor(descriptor)) {
            return false;
        }
        if (!runChild(catchall, descriptor.value, state)) {
            return false;
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
 * @brief Check exclusive union branches.
 */
function isXorSchema(
    options: readonly Schema[],
    value: unknown,
    state: ValidationState,
    runChild: ChildPredicateRunner
): boolean {
    let matches = 0;
    for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        if (option !== undefined && runChild(option, value, state)) {
            matches += 1;
            if (matches > 1) {
                return false;
            }
        }
    }
    return matches === 1;
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
 * @returns True when the discriminant selects a known case and that case passes.
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
    if (discriminantProperty === undefined) {
        return false;
    }
    const selected = findDiscriminatedUnionCase(cases, discriminantProperty.value);
    return selected !== undefined && runChild(selected, value, state);
}

/**
 * @brief Decide whether a boolean refinement should execute.
 * @param schema Refine schema whose inner predicate already accepted.
 * @param value Candidate runtime value.
 * @returns True when no gate exists or the gate returns literal true.
 */
function shouldRunRefinement(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Refine }>,
    value: unknown
): boolean {
    return schema.when === undefined ||
        isStrictTrue(schema.when(Object.freeze({
            value,
            issues: EMPTY_ISSUES
        })));
}

/**
 * @brief Check strict true.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
function isStrictTrue(value: unknown): boolean {
    return value === true;
}
