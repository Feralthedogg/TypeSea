/**
 * @file scalar.ts
 * @brief Primitive and literal guard builders.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */

import { SchemaTag } from "../kind/index.js";
import type { BaseDecoder } from "../decoder/index.js";
import {
    BaseGuard,
    BigIntGuard,
    type CheckMessageInput,
    DateGuard,
    EnumGuard,
    type EnumLiteralValue,
    FileGuard,
    LiteralGuard,
    NumberGuard,
    StringGuard,
    type StringEmailOptions,
    type StringHashAlgorithm,
    type StringHashOptions,
    type StringIsoDateTimeOptions,
    type StringIsoTimeOptions,
    type StringJwtOptions,
    type StringMacDelimiter,
    type StringMacOptions,
    type StringUrlOptions,
    type StringUuidOptions
} from "../guard/index.js";
import { readCheckMessage } from "../guard/check-message.js";
import { defineReadonlyProperty } from "../guard/props.js";
import { registerConstructedGuard } from "../guard/registry.js";
import type { LiteralValue, Schema } from "../schema/index.js";
import { isLiteralValue, normalizeUnionSchema } from "../schema/index.js";

export type {
    StringEmailOptions,
    StringIsoDateTimeOptions,
    StringIsoTimeOptions,
    StringJwtOptions,
    StringMacDelimiter,
    StringMacOptions,
    StringUrlOptions,
    StringUuidOptions,
    StringUuidVersion
} from "../guard/index.js";

export type EnumValues = readonly [string, ...string[]];
export type EnumLikeInput = Readonly<Record<string, string | number>>;
export type EnumLikeValue<TEnum extends EnumLikeInput> =
    TEnum[keyof TEnum] & EnumLiteralValue;
export type LiteralValues = readonly [LiteralValue, ...LiteralValue[]];
export interface IsoNamespace {
    readonly date: () => StringGuard;
    readonly datetime: (options?: Partial<StringIsoDateTimeOptions>) => StringGuard;
    readonly time: (options?: Partial<StringIsoTimeOptions>) => StringGuard;
    readonly duration: () => StringGuard;
}

export type CallableStringGuard =
    StringGuard & ((options?: CheckMessageInput) => StringGuard);

export type CallableNumberGuard =
    NumberGuard & ((options?: CheckMessageInput) => NumberGuard);

export type CallableDateGuard =
    DateGuard & ((options?: CheckMessageInput) => DateGuard);

export type CallableBigIntGuard =
    BigIntGuard & ((options?: CheckMessageInput) => BigIntGuard);

export type CallableSymbolGuard =
    BaseGuard<symbol> & ((options?: CheckMessageInput) => BaseGuard<symbol>);

export type CallableBooleanGuard =
    BaseGuard<boolean> & ((options?: CheckMessageInput) => BaseGuard<boolean>);

/**
 * @brief Shared string guard singleton.
 * @details Primitive guards are immutable, so exporting one instance avoids
 * allocation for the common `t.string` path.
 */
export const stringGuard = new StringGuard({
    tag: SchemaTag.String,
    checks: []
});

export const string: CallableStringGuard = makeCallableGuard<StringGuard>(
    stringGuard,
    (options?: CheckMessageInput): StringGuard =>
        options === undefined
            ? stringGuard
            : new StringGuard({
                tag: SchemaTag.String,
                checks: [],
                message: readCheckMessage(options)
            })
);

/**
 * @brief Shared unknown guard singleton.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */
export const unknownGuard = new BaseGuard<unknown>({
    tag: SchemaTag.Unknown
});

/**
 * @brief Shared never guard singleton.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */
export const neverGuard = new BaseGuard<never>({
    tag: SchemaTag.Never
});

/**
 * @brief Shared finite number guard singleton.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */
export const numberGuard = new NumberGuard({
    tag: SchemaTag.Number,
    checks: []
});

export const number: CallableNumberGuard = makeCallableGuard<NumberGuard>(
    numberGuard,
    (options?: CheckMessageInput): NumberGuard =>
        options === undefined
            ? numberGuard
            : new NumberGuard({
                tag: SchemaTag.Number,
                checks: [],
                message: readCheckMessage(options)
            })
);

/**
 * @brief Shared valid Date guard singleton.
 * @details Date validation accepts Date objects whose time value is finite.
 * Invalid Date instances are rejected.
 */
export const dateGuard = new DateGuard({
    tag: SchemaTag.Date,
    checks: []
});

export const date: CallableDateGuard = makeCallableGuard<DateGuard>(
    dateGuard,
    (options?: CheckMessageInput): DateGuard =>
        options === undefined
            ? dateGuard
            : new DateGuard({
                tag: SchemaTag.Date,
                checks: [],
                message: readCheckMessage(options)
            })
);

/**
 * @brief Build a File guard without touching the ambient File constructor.
 * @returns Fresh FileGuard with no size or MIME constraints.
 * @details Runtime validation fails closed when the host environment has no
 * `File` constructor, but schema construction remains portable.
 */
export function file(options?: CheckMessageInput): FileGuard {
    const message = readCheckMessage(options);
    return new FileGuard({
        tag: SchemaTag.File,
        checks: [],
        message
    });
}

/**
 * @brief Shared bigint guard singleton.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */
export const bigintGuard = new BigIntGuard({
    tag: SchemaTag.BigInt,
    checks: []
});

export const bigint: CallableBigIntGuard = makeCallableGuard<BigIntGuard>(
    bigintGuard,
    (options?: CheckMessageInput): BigIntGuard =>
        options === undefined
            ? bigintGuard
            : new BigIntGuard({
                tag: SchemaTag.BigInt,
                checks: [],
                message: readCheckMessage(options)
            })
);

/**
 * @brief Shared symbol guard singleton.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */
export const symbolGuard = new BaseGuard<symbol>({
    tag: SchemaTag.Symbol
});

export const symbol: CallableSymbolGuard = makeCallableGuard<BaseGuard<symbol>>(
    symbolGuard,
    (options?: CheckMessageInput): BaseGuard<symbol> =>
        options === undefined
            ? symbolGuard
            : new BaseGuard<symbol>({
                tag: SchemaTag.Symbol,
                message: readCheckMessage(options)
            })
);

/**
 * @brief Shared boolean guard singleton.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */
export const booleanGuard = new BaseGuard<boolean>({
    tag: SchemaTag.Boolean
});

export const boolean: CallableBooleanGuard = makeCallableGuard<BaseGuard<boolean>>(
    booleanGuard,
    (options?: CheckMessageInput): BaseGuard<boolean> =>
        options === undefined
            ? booleanGuard
            : new BaseGuard<boolean>({
                tag: SchemaTag.Boolean,
                message: readCheckMessage(options)
            })
);

interface SchemaBackedGuard {
    readonly schema: Schema;
    readonly "~standard": unknown;
}

type CallableGuard<TGuard extends SchemaBackedGuard> =
    TGuard & ((options?: CheckMessageInput) => TGuard);

function makeCallableGuard<TGuard extends SchemaBackedGuard>(
    guard: TGuard,
    create: (options?: CheckMessageInput) => TGuard
): CallableGuard<TGuard> {
    const callable = ((options?: CheckMessageInput): TGuard =>
        create(options)) as unknown as CallableGuard<TGuard>;
    defineReadonlyProperty(callable, "schema", guard.schema, true);
    defineReadonlyProperty(callable, "~standard", guard["~standard"], false);
    copyGuardOwnProperties(callable, guard);
    copyGuardMethods(callable, guard);
    registerConstructedGuard(callable);
    return Object.freeze(callable);
}

function copyGuardOwnProperties(target: object, guard: object): void {
    const names = Object.getOwnPropertyNames(guard);
    for (let index = 0; index < names.length; index += 1) {
        const name = names[index];
        if (name === undefined || name === "schema" || name === "~standard") {
            continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(guard, name);
        if (descriptor !== undefined) {
            Object.defineProperty(target, name, descriptor);
        }
    }
}

function copyGuardMethods(target: object, guard: object): void {
    let prototype = Object.getPrototypeOf(guard) as object | null;
    while (prototype !== null && prototype !== Object.prototype) {
        const names = Object.getOwnPropertyNames(prototype);
        for (let index = 0; index < names.length; index += 1) {
            const name = names[index];
            if (name === undefined || name === "constructor") {
                continue;
            }
            const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
            if (descriptor !== undefined) {
                Object.defineProperty(target, name, descriptor);
            }
        }
        prototype = Object.getPrototypeOf(prototype) as object | null;
    }
}

export const nullGuard = new BaseGuard<null>({
    tag: SchemaTag.Literal,
    value: null
});

export const undefinedGuard = new BaseGuard<undefined>({
    tag: SchemaTag.Literal,
    value: undefined
});

export const voidGuard = undefinedGuard;

/**
 * @brief Build a NaN literal guard.
 * @returns Fresh guard matching only NaN via Object.is.
 */
export function nan(): BaseGuard<number> {
    return new BaseGuard<number>({
        tag: SchemaTag.Literal,
        value: Number.NaN
    });
}

/**
 * @brief Build a safe integer number guard.
 * @returns Fresh guard constrained to Number.isSafeInteger domain.
 */
export function int(options?: CheckMessageInput): NumberGuard {
    return numberGuard.safe(options);
}

/**
 * @brief Build a signed 32-bit integer number guard.
 * @returns Fresh guard constrained to int32 range.
 */
export function int32(options?: CheckMessageInput): NumberGuard {
    return numberGuard.int32(options);
}

/**
 * @brief Build an unsigned 32-bit integer number guard.
 * @returns Fresh guard constrained to uint32 range.
 */
export function uint32(options?: CheckMessageInput): NumberGuard {
    return numberGuard.uint32(options);
}

/**
 * @brief Build a float32 finite-domain number guard.
 * @returns Fresh guard constrained to IEEE-754 float32 finite range.
 */
export function float32(options?: CheckMessageInput): NumberGuard {
    return numberGuard.float32(options);
}

/**
 * @brief Build a float64 finite-domain number guard.
 * @returns Fresh guard constrained to IEEE-754 float64 finite range.
 */
export function float64(options?: CheckMessageInput): NumberGuard {
    return numberGuard.float64(options);
}

/**
 * @brief Build a signed 64-bit bigint guard.
 * @returns Fresh guard constrained to int64 range.
 */
export function int64(options?: CheckMessageInput): BigIntGuard {
    return bigintGuard.int64(options);
}

/**
 * @brief Build an unsigned 64-bit bigint guard.
 * @returns Fresh guard constrained to uint64 range.
 */
export function uint64(options?: CheckMessageInput): BigIntGuard {
    return bigintGuard.uint64(options);
}

/**
 * @brief Build a top-level UUID string guard.
 */
export function uuid(options?: Partial<StringUuidOptions>): StringGuard {
    return stringGuard.uuid(options);
}

/**
 * @brief Build a top-level GUID string guard.
 */
export function guid(): StringGuard {
    return stringGuard.guid();
}

/**
 * @brief Build a top-level UUID v4 string guard.
 */
export function uuidv4(): StringGuard {
    return stringGuard.uuidv4();
}

/**
 * @brief Build a top-level UUID v6 string guard.
 */
export function uuidv6(): StringGuard {
    return stringGuard.uuidv6();
}

/**
 * @brief Build a top-level UUID v7 string guard.
 */
export function uuidv7(): StringGuard {
    return stringGuard.uuidv7();
}

/**
 * @brief Build a top-level email string guard.
 */
export function email(options?: Partial<StringEmailOptions>): StringGuard {
    return stringGuard.email(options);
}

/**
 * @brief Build a top-level URL string guard.
 */
export function url(
    options: Partial<StringUrlOptions> & { readonly normalize: true }
): BaseDecoder<string>;

export function url(options?: Partial<StringUrlOptions>): StringGuard;

export function url(
    options?: Partial<StringUrlOptions>
): StringGuard | BaseDecoder<string> {
    return stringGuard.url(options);
}

/**
 * @brief Build a top-level HTTP/HTTPS URL string guard.
 */
export function httpUrl(): StringGuard {
    return stringGuard.httpUrl();
}

/**
 * @brief Build a top-level hostname string guard.
 */
export function hostname(): StringGuard {
    return stringGuard.hostname();
}

/**
 * @brief Build a top-level E.164 phone number string guard.
 */
export function e164(): StringGuard {
    return stringGuard.e164();
}

/**
 * @brief Build a top-level single-emoji string guard.
 */
export function emoji(): StringGuard {
    return stringGuard.emoji();
}

/**
 * @brief Build a top-level base64 string guard.
 */
export function base64(): StringGuard {
    return stringGuard.base64();
}

/**
 * @brief Build a top-level URL-safe base64 string guard.
 */
export function base64url(): StringGuard {
    return stringGuard.base64url();
}

/**
 * @brief Build a top-level hexadecimal byte string guard.
 */
export function hex(): StringGuard {
    return stringGuard.hex();
}

/**
 * @brief Build a top-level compact JWT string guard.
 */
export function jwt(): StringGuard;

export function jwt(options: Partial<StringJwtOptions>): BaseGuard<string>;

export function jwt(options?: Partial<StringJwtOptions>): StringGuard | BaseGuard<string> {
    return options === undefined ? stringGuard.jwt() : stringGuard.jwt(options);
}

/**
 * @brief Build a top-level nanoid string guard.
 */
export function nanoid(): StringGuard {
    return stringGuard.nanoid();
}

/**
 * @brief Build a top-level CUID v1 string guard.
 */
export function cuid(): StringGuard {
    return stringGuard.cuid();
}

/**
 * @brief Build a top-level CUID2 string guard.
 */
export function cuid2(): StringGuard {
    return stringGuard.cuid2();
}

/**
 * @brief Build a top-level XID string guard.
 */
export function xid(): StringGuard {
    return stringGuard.xid();
}

/**
 * @brief Build a top-level KSUID string guard.
 */
export function ksuid(): StringGuard {
    return stringGuard.ksuid();
}

/**
 * @brief Build a top-level MAC address string guard.
 */
export function mac(
    delimiter: StringMacDelimiter | Partial<StringMacOptions> = ":"
): StringGuard {
    return stringGuard.mac(delimiter);
}

/**
 * @brief Build a top-level IPv4 CIDR string guard.
 */
export function cidrv4(): StringGuard {
    return stringGuard.cidrv4();
}

/**
 * @brief Build a top-level IPv6 CIDR string guard.
 */
export function cidrv6(): StringGuard {
    return stringGuard.cidrv6();
}

/**
 * @brief Build a top-level ISO date string guard.
 */
export function isoDate(): StringGuard {
    return stringGuard.isoDate();
}

/**
 * @brief Build a top-level ISO date-time string guard.
 */
export function isoDateTime(options?: Partial<StringIsoDateTimeOptions>): StringGuard {
    return stringGuard.isoDateTime(options);
}

/**
 * @brief Build a top-level ISO time string guard.
 */
export function isoTime(options?: Partial<StringIsoTimeOptions>): StringGuard {
    return stringGuard.isoTime(options);
}

/**
 * @brief Build a top-level ISO duration string guard.
 */
export function isoDuration(): StringGuard {
    return stringGuard.isoDuration();
}

/**
 * @brief Zod-style ISO string format namespace.
 * @details Methods delegate to the top-level helpers so all execution engines
 * consume the same string-check schema records.
 */
export const iso: IsoNamespace = Object.freeze({
    date: isoDate,
    datetime: isoDateTime,
    time: isoTime,
    duration: isoDuration
});

/**
 * @brief Build a top-level ULID string guard.
 */
export function ulid(): StringGuard {
    return stringGuard.ulid();
}

/**
 * @brief Build a top-level IPv4 string guard.
 */
export function ipv4(): StringGuard {
    return stringGuard.ipv4();
}

/**
 * @brief Build a top-level IPv6 string guard.
 */
export function ipv6(): StringGuard {
    return stringGuard.ipv6();
}

/**
 * @brief Build a top-level hash string guard.
 */
export function hash(
    algorithm: StringHashAlgorithm,
    options?: Partial<StringHashOptions>
): StringGuard {
    return stringGuard.hash(algorithm, options);
}

/**
 * @brief Build a named string format guard.
 * @param name Diagnostic name for failures.
 * @param check Regex or predicate used after string validation.
 * @returns String guard for regex checks or dynamic guard for predicate checks.
 */
export function stringFormat(
    name: string,
    check: RegExp
): StringGuard;

export function stringFormat(
    name: string,
    check: (value: string) => boolean
): BaseGuard<string>;

export function stringFormat(
    name: string,
    check: RegExp | ((value: string) => boolean)
): BaseGuard<string> {
    if (typeof name !== "string" || name.length === 0) {
        throw new TypeError("stringFormat name must be a non-empty string");
    }
    if (check instanceof RegExp) {
        return stringGuard.regex(check, name);
    }
    if (typeof check !== "function") {
        throw new TypeError("stringFormat check must be a RegExp or function");
    }
    return new BaseGuard<string>({
        tag: SchemaTag.Refine,
        inner: stringGuard.schema,
        name,
        predicate: (value: unknown): boolean => typeof value === "string" && check(value)
    });
}

export function literal<const TValue extends LiteralValue>(
    value: TValue
): LiteralGuard<TValue>;

export function literal<const TValues extends LiteralValues>(
    values: TValues
): LiteralGuard<TValues[number]>;

/**
 * @brief Build a literal guard after rejecting non-literal runtime values.
 * @param input Literal value or non-empty literal tuple.
 * @returns Fresh guard for exactly the supplied literal domain.
 * @throws TypeError when a value cannot be represented as a TypeSea literal.
 */
export function literal(
    input: LiteralValue | LiteralValues
): LiteralGuard<LiteralValue> {
    const rawInput: unknown = input;
    if (Array.isArray(rawInput)) {
        const values = readLiteralValues(rawInput, "literal values");
        return new LiteralGuard<LiteralValue>(literalUnionSchema(values), values);
    }
    return literalSingle(rawInput as LiteralValue);
}

/**
 * @brief Build one literal guard.
 */
function literalSingle<TValue extends LiteralValue>(
    value: TValue
): LiteralGuard<TValue> {
    if (!isLiteralValue(value)) {
        throw new TypeError("literal value must be a primitive literal");
    }
    /*
     * Literal schemas store the runtime value directly. Rejecting compound input
     * here keeps later equality checks side-effect free and serializable.
     */
    return new LiteralGuard<TValue>(
        {
            tag: SchemaTag.Literal,
            value
        },
        [value]
    );
}

/**
 * @brief Build a string literal enum guard.
 * @param values Non-empty tuple of string literals.
 * @returns Fresh guard accepting exactly one supplied enum member.
 * @throws TypeError when values are empty, non-strings, or duplicated.
 * @details The public export is aliased as `enum`; this internal name avoids
 * spelling a reserved word as a local binding.
 */
export function enumValues<const TValues extends EnumValues>(
    values: TValues
): EnumGuard<TValues[number]>;

export function enumValues<const TEnum extends EnumLikeInput>(
    values: TEnum
): EnumGuard<EnumLikeValue<TEnum>>;

export function enumValues(
    values: EnumValues | EnumLikeInput
): EnumGuard<EnumLiteralValue> {
    const rawValues: unknown = values;
    if (Array.isArray(rawValues)) {
        return enumFromArray(rawValues);
    }
    return enumFromObject(rawValues);
}

/**
 * @brief Build an enum guard from a string tuple.
 */
function enumFromArray(values: readonly unknown[]): EnumGuard<string> {
    if (values.length === 0) {
        throw new TypeError("enum values must be a non-empty string array");
    }
    const options = new Array<string>(values.length);
    const enumObject: Record<string, string> = {};
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (typeof value !== "string") {
            throw new TypeError("enum values must be strings");
        }
        appendEnumValue(options, index, value, "enum values");
        enumObject[value] = value;
    }
    return new EnumGuard<string>(options, enumObject);
}

/**
 * @brief Build an enum guard from an enum-like object.
 */
function enumFromObject(values: unknown): EnumGuard<EnumLiteralValue> {
    if (typeof values !== "object" || values === null) {
        throw new TypeError("enum values must be an array or enum-like object");
    }
    const enumValues = values as EnumLikeInput;
    const keys = Object.keys(enumValues);
    const options: EnumLiteralValue[] = [];
    const enumObject: Record<string, EnumLiteralValue> = {};
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined || isNumericEnumReverseKey(enumValues, key)) {
            continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(enumValues, key);
        if (descriptor === undefined || !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
            throw new TypeError("enum object values must be data properties");
        }
        const value: unknown = descriptor.value;
        if (typeof value !== "string" && typeof value !== "number") {
            throw new TypeError("enum object values must be strings or numbers");
        }
        appendEnumValue(options, options.length, value, "enum object values");
        enumObject[key] = value;
    }
    if (options.length === 0) {
        throw new TypeError("enum object must contain at least one value");
    }
    return new EnumGuard<EnumLiteralValue>(options, enumObject);
}

/**
 * @brief Append a unique enum value.
 */
function appendEnumValue<TValue extends EnumLiteralValue>(
    target: TValue[],
    index: number,
    value: TValue,
    label: string
): void {
    for (let seen = 0; seen < index; seen += 1) {
        if (Object.is(target[seen], value)) {
            throw new TypeError(`${label} must be unique`);
        }
    }
    target[index] = value;
}

/**
 * @brief Detect TypeScript numeric enum reverse-map entries.
 */
function isNumericEnumReverseKey(values: EnumLikeInput, key: string): boolean {
    if (!/^(?:0|[1-9]\d*)$/u.test(key)) {
        return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(values, key);
    if (descriptor === undefined || typeof descriptor.value !== "string") {
        return false;
    }
    const forward = Object.getOwnPropertyDescriptor(values, descriptor.value);
    return forward !== undefined && Object.is(forward.value, Number(key));
}

/**
 * @brief Read and validate a non-empty literal tuple.
 */
function readLiteralValues(
    values: readonly unknown[],
    label: string
): readonly LiteralValue[] {
    if (values.length === 0) {
        throw new TypeError(`${label} must be a non-empty array`);
    }
    const checked = new Array<LiteralValue>(values.length);
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (!isLiteralValue(value)) {
            throw new TypeError(`${label} must contain primitive literals`);
        }
        for (let seen = 0; seen < index; seen += 1) {
            if (Object.is(checked[seen], value)) {
                throw new TypeError(`${label} must be unique`);
            }
        }
        checked[index] = value;
    }
    return Object.freeze(checked);
}

/**
 * @brief Build a normalized literal union schema.
 */
function literalUnionSchema(values: readonly LiteralValue[]): Schema {
    const options = new Array<Schema>(values.length);
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        options[index] = {
            tag: SchemaTag.Literal,
            value
        };
    }
    return normalizeUnionSchema(options);
}
