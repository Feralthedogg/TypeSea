/**
 * @file async-validation/index.ts
 * @brief Cooperative async validation entry points.
 * @details Async validation is deliberately separate from compiled hot paths.
 * Large arrays, records, maps, sets, tuples, and object graphs can yield back to
 * the event loop while normal compiled guards stay synchronous and monomorphic.
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
import type { CheckResult } from "../issue/index.js";
import { ok } from "../result/index.js";
import type {
    CompileOptions,
    CompiledBaseGuard
} from "../compile/index.js";
import { compile } from "../compile/index.js";
import type {
    Guard,
    Presence,
    RuntimeValue
} from "../guard/index.js";
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
import {
    findDiscriminatedUnionCase,
    hasObjectKey,
    isArrayIndexKey,
    isDataPropertyDescriptor,
    isPlainRecord,
    isValidDateObject,
    ordinaryHasInstance,
    readDateTime,
    readFileInfo,
    readMapEntries,
    readMapSize,
    readOwnDataProperty,
    readSetSize,
    readSetValues,
    type DataPropertyDescriptor,
    type UnknownRecord
} from "../evaluate/shared.js";
import {
    enterValidation,
    leaveValidation,
    makeValidationState,
    type ValidationState
} from "../evaluate/state.js";

const DEFAULT_YIELD_EVERY = 4096;
const DEFAULT_YIELD_TIMEOUT_MS = 5;

/**
 * @brief Async validation scheduler options.
 * @details `yieldEvery` caps node-count bursts. `yieldTimeout` caps wall-clock
 * bursts for very expensive scalar checks or hostile object layouts.
 */
export interface AsyncValidationOptions {
    /**
     * @brief Maximum schema visits between scheduler checks.
     * @details Lower values improve event-loop fairness for huge payloads. Higher
     * values preserve synchronous throughput when the process is already isolated.
     */
    readonly yieldEvery: number | undefined;

    /**
     * @brief Maximum uninterrupted validation burst in milliseconds.
     * @details The deadline is checked at scheduler points so scalar hot paths do
     * not pay a clock-read cost at every primitive comparison.
     */
    readonly yieldTimeout: number | undefined;
}

/**
 * @brief Options accepted by compileAsync().
 * @details Compile options control the synchronous diagnostic guard; async
 * options control cooperative boolean validation.
 */
export interface CompileAsyncOptions extends CompileOptions, AsyncValidationOptions {}

/**
 * @brief Async guard wrapper.
 * @details The sync field exposes the compiled guard used for diagnostics after
 * async boolean validation reports a failure.
 */
export interface AsyncCompiledGuard<
    TValue,
    TPresence extends Presence = "required"
> {
    /**
     * @brief Synchronous compiled guard retained for diagnostics.
     * @details Async boolean validation delegates to this guard only after failure,
     * which keeps successful large-payload validation focused on fairness instead
     * of diagnostic construction.
     */
    readonly sync: CompiledBaseGuard<TValue, TPresence>;

    /**
     * @brief Validate with cooperative event-loop yields.
     * @param value Candidate runtime value.
     * @returns Promise resolving to the boolean validation result.
     */
    is(value: unknown): Promise<boolean>;

    /**
     * @brief Validate with yields and return diagnostics on failure.
     * @param value Candidate runtime value.
     * @returns Promise resolving to a public CheckResult.
     */
    check(value: unknown): Promise<CheckResult<RuntimeValue<TValue, TPresence>>>;
}

interface AsyncValidationState {
    /**
     * @brief Shared cycle and recursion-budget tracker.
     */
    readonly validation: ValidationState;

    /**
     * @brief Step interval for scheduler checks.
     */
    readonly yieldEvery: number;

    /**
     * @brief Wall-clock burst limit in milliseconds.
     */
    readonly yieldTimeout: number;

    /**
     * @brief Number of schema visits since the last scheduler decision.
     */
    steps: number;

    /**
     * @brief Absolute timestamp for the next forced host yield.
     */
    deadline: number;
}

/**
 * @brief Validate with cooperative event-loop yielding.
 * @param guard Guard whose schema validates the input.
 * @param value Candidate runtime value.
 * @param options Optional scheduler controls.
 * @returns Promise resolving to the boolean validation result.
 */
export async function isAsync<TValue, TPresence extends Presence>(
    guard: Guard<TValue, TPresence>,
    value: unknown,
    options?: Partial<AsyncValidationOptions>
): Promise<boolean> {
    return isSchemaAsync(readAsyncSchema(guard), value, makeAsyncState(options));
}

/**
 * @brief Validate asynchronously and return a public CheckResult.
 * @param guard Guard whose schema validates the input.
 * @param value Candidate runtime value.
 * @param options Optional scheduler controls.
 * @returns Success result or full diagnostic result.
 * @details The async pass answers the expensive boolean question with yields.
 * Diagnostics are collected only after failure so successful async validation
 * keeps the same allocation-light shape as synchronous is().
 */
export async function checkAsync<TValue, TPresence extends Presence>(
    guard: Guard<TValue, TPresence>,
    value: unknown,
    options?: Partial<AsyncValidationOptions>
): Promise<CheckResult<RuntimeValue<TValue, TPresence>>> {
    if (await isAsync(guard, value, options)) {
        return ok(value as RuntimeValue<TValue, TPresence>);
    }
    return guard.check(value);
}

/**
 * @brief Compile diagnostics and expose cooperative async validation methods.
 * @param guard Guard whose schema validates the input.
 * @param options Compile and async scheduler options.
 * @returns Async wrapper with sync compiled diagnostics attached.
 */
export function compileAsync<TValue, TPresence extends Presence>(
    guard: Guard<TValue, TPresence>,
    options?: Partial<CompileAsyncOptions>
): AsyncCompiledGuard<TValue, TPresence> {
    const sync = compile(guard, options);
    const asyncOptions = readAsyncValidationOptions(options);
    return Object.freeze({
        sync,

        is(value: unknown): Promise<boolean> {
            return isAsync(sync, value, asyncOptions);
        },

        check(value: unknown): Promise<CheckResult<RuntimeValue<TValue, TPresence>>> {
            return checkAsync(sync, value, asyncOptions);
        }
    });
}

/**
 * @brief Execute one schema node with cooperative scheduling.
 */
async function isSchemaAsync(
    schema: Schema,
    value: unknown,
    state: AsyncValidationState
): Promise<boolean> {
    await maybeYield(state);
    const entered = enterValidation(schema, value, state.validation);
    if (entered === "cycle") {
        return true;
    }
    if (entered === "budget") {
        return false;
    }
    const result = await isSchemaAsyncInner(schema, value, state);
    leaveValidation(schema, value, state.validation);
    return result;
}

/**
 * @brief Execute a schema after recursion admission.
 */
async function isSchemaAsyncInner(
    schema: Schema,
    value: unknown,
    state: AsyncValidationState
): Promise<boolean> {
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
            return isArraySchema(schema, value, state);
        case SchemaTag.Tuple:
            return isTupleSchema(schema, value, state);
        case SchemaTag.Record:
            return isRecordSchema(schema, value, state);
        case SchemaTag.Map:
            return isMapSchema(schema, value, state);
        case SchemaTag.Set:
            return isSetSchema(schema, value, state);
        case SchemaTag.File:
            return isFileSchema(schema, value);
        case SchemaTag.InstanceOf:
            return ordinaryHasInstance(value, schema.constructor);
        case SchemaTag.Property:
            return isPropertySchema(schema, value, state);
        case SchemaTag.Object:
            return isObjectSchema(schema, value, state);
        case SchemaTag.Union:
            return isUnionSchema(schema.options, value, state);
        case SchemaTag.Xor:
            return isXorSchema(schema.options, value, state);
        case SchemaTag.Intersection:
            return (await isSchemaAsync(schema.left, value, state)) &&
                await isSchemaAsync(schema.right, value, state);
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
            return value === undefined ||
                await isSchemaAsync(schema.inner, value, state);
        case SchemaTag.Nullable:
            return value === null ||
                await isSchemaAsync(schema.inner, value, state);
        case SchemaTag.DiscriminatedUnion:
            return isDiscriminatedUnionSchema(
                schema.key,
                schema.cases,
                value,
                state
            );
        case SchemaTag.Brand:
            return isSchemaAsync(schema.inner, value, state);
        case SchemaTag.Metadata:
        case SchemaTag.Message:
            return isSchemaAsync(schema.inner, value, state);
        case SchemaTag.KeyedObject:
            return (await isSchemaAsync(schema.inner, value, state)) &&
                isKeyedObjectSchema(schema.keys, schema.rule, value);
        case SchemaTag.PropertyCount:
            return (await isSchemaAsync(schema.inner, value, state)) &&
                isPropertyCountSchema(schema.min, schema.max, value);
        case SchemaTag.PropertyNames:
            return (await isSchemaAsync(schema.inner, value, state)) &&
                await isPropertyNamesSchema(schema.key, value, state);
        case SchemaTag.PatternProperties:
            return (await isSchemaAsync(schema.inner, value, state)) &&
                await isPatternPropertiesSchema(schema, value, state);
        case SchemaTag.Readonly:
            return isSchemaAsync(schema.inner, value, state);
        case SchemaTag.Lazy:
            return isSchemaAsync(
                resolveLazySchema(schema, state.validation.resolving),
                value,
                state
            );
        case SchemaTag.Refine:
            return (await isSchemaAsync(schema.inner, value, state)) &&
                schema.predicate(value);
    }
}

/**
 * @brief Execute a keyed-object rule in the cooperative interpreter.
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
 * @brief Execute a JSON Schema property-name rule in the cooperative interpreter.
 */
async function isPropertyNamesSchema(
    keySchema: Schema,
    value: unknown,
    state: AsyncValidationState
): Promise<boolean> {
    if (!isPlainRecord(value)) {
        return false;
    }
    const keys = Object.keys(value);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key !== undefined && !await isSchemaAsync(keySchema, key, state)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Execute JSON Schema pattern-property rules in the cooperative interpreter.
 */
async function isPatternPropertiesSchema(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.PatternProperties }>,
    value: unknown,
    state: AsyncValidationState
): Promise<boolean> {
    if (!isPlainRecord(value)) {
        return false;
    }
    const keys = Object.keys(value);
    for (let index = 0; index < keys.length; index += 1) {
        await maybeYield(state);
        const key = keys[index];
        if (key === undefined ||
            !await isPatternPropertyKey(schema, value, key, state)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Execute pattern-property rules for one key.
 */
async function isPatternPropertyKey(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.PatternProperties }>,
    value: Readonly<Record<string, unknown>>,
    key: string,
    state: AsyncValidationState
): Promise<boolean> {
    let matched = false;
    for (let index = 0; index < schema.entries.length; index += 1) {
        const entry = schema.entries[index];
        if (entry === undefined || !testPattern(entry.regex, key)) {
            continue;
        }
        matched = true;
        const property = readOwnDataProperty(value, key);
        if (property === undefined ||
            !await isSchemaAsync(entry.schema, property.value, state)) {
            return false;
        }
    }
    if (matched || hasObjectKey(schema.keyLookup, key)) {
        return true;
    }
    if (schema.additional !== undefined) {
        const property = readOwnDataProperty(value, key);
        return property !== undefined &&
            await isSchemaAsync(schema.additional, property.value, state);
    }
    return schema.allowAdditional;
}

/**
 * @brief Count selected own data properties without invoking accessors.
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
 * @brief Execute string checks without allocations.
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
                if (!testPattern(check.regex, value)) {
                    return false;
                }
                break;
            case StringCheckTag.Uuid:
                if (!testPattern(UUID_PATTERN, value)) {
                    return false;
                }
                break;
            case StringCheckTag.Email:
                if (!testPattern(EMAIL_PATTERN, value)) {
                    return false;
                }
                break;
            case StringCheckTag.Url:
                if (!testPattern(URL_PATTERN, value)) {
                    return false;
                }
                break;
            case StringCheckTag.IsoDate:
                if (!testPattern(ISO_DATE_PATTERN, value)) {
                    return false;
                }
                break;
            case StringCheckTag.IsoDateTime:
                if (!testPattern(ISO_DATETIME_PATTERN, value)) {
                    return false;
                }
                break;
            case StringCheckTag.Ulid:
                if (!testPattern(ULID_PATTERN, value)) {
                    return false;
                }
                break;
            case StringCheckTag.Xid:
                if (!testPattern(XID_PATTERN, value)) {
                    return false;
                }
                break;
            case StringCheckTag.Ksuid:
                if (!testPattern(KSUID_PATTERN, value)) {
                    return false;
                }
                break;
            case StringCheckTag.Ipv4:
                if (!testPattern(IPV4_PATTERN, value)) {
                    return false;
                }
                break;
            case StringCheckTag.Ipv6:
                if (!testPattern(IPV6_PATTERN, value)) {
                    return false;
                }
                break;
        }
    }
    return true;
}

/**
 * @brief Execute number checks without allocations.
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
 * @brief Execute bigint checks without coercing numbers.
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
 * @brief Execute date checks through Date intrinsics.
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
 * @brief Execute File checks without yielding.
 * @param schema File schema with size and MIME checks.
 * @param value Candidate runtime value.
 * @returns True when value is a host File satisfying every check.
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
                if (!fileMimeMatches(file.type, check.values)) {
                    return false;
                }
                break;
        }
    }
    return true;
}

/**
 * @brief Match exact MIME type or top-level wildcard.
 */
function fileMimeMatches(type: string, patterns: readonly string[]): boolean {
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
 * @brief Execute array validation with yield points in long loops.
 */
async function isArraySchema(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Array }>,
    value: unknown,
    state: AsyncValidationState
): Promise<boolean> {
    if (!Array.isArray(value) || !arrayLengthChecksPass(schema, value.length)) {
        return false;
    }
    const item = schema.item;
    if (schemaCanAcceptUndefined(item)) {
        return isPresentArraySchema(item, value, state);
    }
    for (let index = 0; index < value.length; index += 1) {
        await maybeYield(state);
        const property = readArrayIndexDataProperty(value, index);
        if (property === null ||
            !await isSchemaAsync(
                item,
                property === undefined ? undefined : property.value,
                state
            )) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Validate only present indexes for undefined-accepting arrays.
 */
async function isPresentArraySchema(
    item: Schema,
    value: readonly unknown[],
    state: AsyncValidationState
): Promise<boolean> {
    const keys = Object.getOwnPropertyNames(value);
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
        await maybeYield(state);
        const key = keys[keyIndex];
        if (key === undefined || !isArrayIndexKey(key, value.length)) {
            continue;
        }
        const property = readArrayKeyDataProperty(value, key);
        if (property === null ||
            (property !== undefined &&
                !await isSchemaAsync(item, property.value, state))) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Execute tuple validation with optional rest items.
 */
async function isTupleSchema(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Tuple }>,
    value: unknown,
    state: AsyncValidationState
): Promise<boolean> {
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
        await maybeYield(state);
        const item = items[index];
        const property = readArrayIndexDataProperty(value, index);
        if (item === undefined ||
            property === null ||
            !await isSchemaAsync(
                item,
                property === undefined ? undefined : property.value,
                state
            )) {
            return false;
        }
    }
    if (rest !== undefined) {
        for (let index = items.length; index < value.length; index += 1) {
            await maybeYield(state);
            const property = readArrayIndexDataProperty(value, index);
            if (property === null ||
                !await isSchemaAsync(
                    rest,
                    property === undefined ? undefined : property.value,
                    state
                )) {
                return false;
            }
        }
    }
    return true;
}

/**
 * @brief Execute record validation over enumerable own string keys.
 */
async function isRecordSchema(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Record }>,
    value: unknown,
    state: AsyncValidationState
): Promise<boolean> {
    if (!isPlainRecord(value)) {
        return false;
    }
    if (!hasRequiredRecordKeys(schema.requiredKeys, value)) {
        return false;
    }
    const keys = Object.keys(value);
    for (let index = 0; index < keys.length; index += 1) {
        await maybeYield(state);
        const key = keys[index];
        if (key === undefined) {
            return false;
        }
        const property = readOwnDataProperty(value, key);
        if (schema.key !== undefined) {
            const keyInput = recordKeyInput(schema.key, key);
            const keyAccepted = await isSchemaAsync(schema.key, keyInput, state);
            if (!keyAccepted) {
                if (schema.loose) {
                    continue;
                }
                return false;
            }
        }
        if (property === undefined ||
            !await isSchemaAsync(schema.value, property.value, state)) {
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
 * @brief Execute Map validation cooperatively.
 */
async function isMapSchema(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Map }>,
    value: unknown,
    state: AsyncValidationState
): Promise<boolean> {
    const iterator = readMapEntries(value);
    if (iterator === undefined) {
        return false;
    }
    if (!sizeChecksPass(schema.checks, readMapSize(value))) {
        return false;
    }
    for (;;) {
        await maybeYield(state);
        const step = iterator.next();
        if (step.done === true) {
            return true;
        }
        const pair = step.value;
        if (!await isSchemaAsync(schema.key, pair[0], state) ||
            !await isSchemaAsync(schema.value, pair[1], state)) {
            return false;
        }
    }
}

/**
 * @brief Check Set size constraints without executing user accessors.
 */
function setSizeChecksPass(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Set }>,
    value: unknown
): boolean {
    return sizeChecksPass(schema.checks, readSetSize(value));
}

/**
 * @brief Check collection size constraints without executing user accessors.
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
 * @brief Execute Set validation cooperatively.
 */
async function isSetSchema(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Set }>,
    value: unknown,
    state: AsyncValidationState
): Promise<boolean> {
    const iterator = readSetValues(value);
    if (iterator === undefined) {
        return false;
    }
    if (!setSizeChecksPass(schema, value)) {
        return false;
    }
    for (;;) {
        await maybeYield(state);
        const step = iterator.next();
        if (step.done === true) {
            return true;
        }
        if (!await isSchemaAsync(schema.item, step.value, state)) {
            return false;
        }
    }
}

/**
 * @brief Execute property schema validation.
 */
async function isPropertySchema(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Property }>,
    value: unknown,
    state: AsyncValidationState
): Promise<boolean> {
    if (!await isSchemaAsync(schema.base, value, state)) {
        return false;
    }
    if (((typeof value !== "object" && typeof value !== "function") || value === null)) {
        return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, schema.key);
    return descriptor !== undefined &&
        isDataPropertyDescriptor(descriptor) &&
        await isSchemaAsync(schema.value, descriptor.value, state);
}

/**
 * @brief Execute object validation with strict-key parity.
 */
async function isObjectSchema(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    value: unknown,
    state: AsyncValidationState
): Promise<boolean> {
    if (!isPlainRecord(value)) {
        return false;
    }
    const entries = schema.entries;
    let allRequired = true;
    for (let index = 0; index < entries.length; index += 1) {
        await maybeYield(state);
        const entry = entries[index];
        if (entry === undefined) {
            return false;
        }
        if (entry.presence !== PresenceTag.Required) {
            allRequired = false;
        }
        const property = readOwnDataProperty(value, entry.key);
        if (property === undefined) {
            if (!Object.prototype.hasOwnProperty.call(value, entry.key) &&
                objectEntryCanBeOmitted(entry)) {
                continue;
            }
            return false;
        }
        if (!await isSchemaAsync(entry.schema, property.value, state)) {
            return false;
        }
    }
    if (schema.mode === ObjectModeTag.Strict) {
        if (schema.catchall !== undefined) {
            return validateObjectCatchall(schema, value, state);
        }
        if (allRequired) {
            return Object.getOwnPropertyNames(value).length === entries.length &&
                Object.getOwnPropertySymbols(value).length === 0;
        }
        const keys = Reflect.ownKeys(value);
        for (let index = 0; index < keys.length; index += 1) {
            await maybeYield(state);
            const key = keys[index];
            if (typeof key !== "string" || !hasObjectKey(schema.keyLookup, key)) {
                return false;
            }
        }
    }
    if (schema.catchall !== undefined) {
        return validateObjectCatchall(schema, value, state);
    }
    return true;
}

/**
 * @brief Validate object catchall keys cooperatively.
 */
async function validateObjectCatchall(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    record: UnknownRecord,
    state: AsyncValidationState
): Promise<boolean> {
    const catchall = schema.catchall;
    if (catchall === undefined) {
        return true;
    }
    const keys = Reflect.ownKeys(record);
    for (let index = 0; index < keys.length; index += 1) {
        await maybeYield(state);
        const key = keys[index];
        if (key === undefined ||
            (typeof key === "string" && hasObjectKey(schema.keyLookup, key))) {
            continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(record, key);
        if (descriptor === undefined || !isDataPropertyDescriptor(descriptor)) {
            return false;
        }
        if (!await isSchemaAsync(catchall, descriptor.value, state)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Execute union validation in declaration order.
 */
async function isUnionSchema(
    options: readonly Schema[],
    value: unknown,
    state: AsyncValidationState
): Promise<boolean> {
    for (let index = 0; index < options.length; index += 1) {
        await maybeYield(state);
        const option = options[index];
        if (option !== undefined && await isSchemaAsync(option, value, state)) {
            return true;
        }
    }
    return false;
}

/**
 * @brief Execute exclusive union validation cooperatively.
 */
async function isXorSchema(
    options: readonly Schema[],
    value: unknown,
    state: AsyncValidationState
): Promise<boolean> {
    let matches = 0;
    for (let index = 0; index < options.length; index += 1) {
        await maybeYield(state);
        const option = options[index];
        if (option !== undefined && await isSchemaAsync(option, value, state)) {
            matches += 1;
            if (matches > 1) {
                return false;
            }
        }
    }
    return matches === 1;
}

/**
 * @brief Execute discriminant dispatch without prototype reads.
 */
async function isDiscriminatedUnionSchema(
    key: string,
    cases: readonly DiscriminatedUnionCase[],
    value: unknown,
    state: AsyncValidationState
): Promise<boolean> {
    if (!isPlainRecord(value)) {
        return false;
    }
    const discriminantProperty = readOwnDataProperty(value, key);
    if (discriminantProperty === undefined) {
        return false;
    }
    const selected = findDiscriminatedUnionCase(cases, discriminantProperty.value);
    return selected !== undefined && await isSchemaAsync(selected, value, state);
}

/**
 * @brief Test array length checks after Array.isArray succeeds.
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
 * @brief Read one numeric array index through a descriptor.
 */
function readArrayIndexDataProperty(
    value: readonly unknown[],
    index: number
): DataPropertyDescriptor | null | undefined {
    return readArrayKeyDataProperty(value, String(index));
}

/**
 * @brief Read one canonical array key without executing accessors.
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
 * @brief Reset regex state around a validation test.
 */
function testPattern(regex: RegExp, value: string): boolean {
    regex.lastIndex = 0;
    const result = regex.test(value);
    regex.lastIndex = 0;
    return result;
}

/**
 * @brief Build a fresh async validation state.
 */
function makeAsyncState(
    options: Partial<AsyncValidationOptions> | undefined
): AsyncValidationState {
    const config = readAsyncValidationOptions(options);
    return {
        validation: makeValidationState(),
        yieldEvery: config.yieldEvery,
        yieldTimeout: config.yieldTimeout,
        steps: 0,
        deadline: Date.now() + config.yieldTimeout
    };
}

interface ResolvedAsyncValidationOptions {
    readonly yieldEvery: number;
    readonly yieldTimeout: number;
}

/**
 * @brief Normalize async scheduler options.
 */
function readAsyncValidationOptions(
    options: Partial<AsyncValidationOptions> | undefined
): ResolvedAsyncValidationOptions {
    if (options === undefined) {
        return {
            yieldEvery: DEFAULT_YIELD_EVERY,
            yieldTimeout: DEFAULT_YIELD_TIMEOUT_MS
        };
    }
    if (!isRecord(options)) {
        throw new TypeError("async validation options must be an object");
    }
    const yieldEvery = options.yieldEvery;
    if (yieldEvery !== undefined &&
        (!Number.isInteger(yieldEvery) || yieldEvery <= 0)) {
        throw new TypeError("async validation yieldEvery must be a positive integer");
    }
    const yieldTimeout = options.yieldTimeout;
    if (yieldTimeout !== undefined &&
        (typeof yieldTimeout !== "number" ||
            !Number.isFinite(yieldTimeout) ||
            yieldTimeout < 0)) {
        throw new TypeError("async validation yieldTimeout must be a finite non-negative number");
    }
    return {
        yieldEvery: yieldEvery ?? DEFAULT_YIELD_EVERY,
        yieldTimeout: yieldTimeout ?? DEFAULT_YIELD_TIMEOUT_MS
    };
}

/**
 * @brief Yield when node-count or wall-clock budget is exhausted.
 */
async function maybeYield(state: AsyncValidationState): Promise<void> {
    state.steps += 1;
    if (state.steps % state.yieldEvery !== 0 && Date.now() < state.deadline) {
        return;
    }
    await yieldToEventLoop();
    state.deadline = Date.now() + state.yieldTimeout;
}

/**
 * @brief Let the host event loop process pending work once.
 */
function yieldToEventLoop(): Promise<void> {
    return new Promise<void>((resolve) => {
        const host = globalThis as {
            readonly setImmediate?: (callback: () => void) => unknown;
            readonly setTimeout: (callback: () => void, timeout: number) => unknown;
        };
        if (host.setImmediate !== undefined) {
            host.setImmediate(resolve);
            return;
        }
        host.setTimeout(resolve, 0);
    });
}

/**
 * @brief Read a TypeSea schema from a guard-like value.
 */
function readAsyncSchema(guard: unknown): Schema {
    if (!isObjectLike(guard)) {
        throw new TypeError("async validation guard must be a TypeSea guard");
    }
    const descriptor = Object.getOwnPropertyDescriptor(guard, "schema");
    if (descriptor === undefined ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        throw new TypeError("async validation guard must contain a schema");
    }
    return descriptor.value as Schema;
}

/**
 * @brief Accept only non-array records for option and guard normalization.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Accept objects and function objects that can carry own schema slots.
 */
function isObjectLike(value: unknown): value is object {
    return value !== null && (typeof value === "object" || typeof value === "function");
}
