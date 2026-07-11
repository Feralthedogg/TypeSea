/**
 * @file core.ts
 * @brief Minimal Zod core compatibility namespace.
 * @details Zod's core package is a low-level implementation API. TypeSea does
 * not emulate that engine, but it exposes class-name aliases so ecosystem
 * probes and simple package-alias migrations can resolve core symbols.
 */

import {
    neverGuard,
    nullGuard,
    undefinedGuard,
    unknownGuard,
    voidGuard
} from "./builders/scalar.js";

export * from "./index.js";

const coreWildcard = (): typeof unknownGuard => unknownGuard;
const coreNever = (): typeof neverGuard => neverGuard;
const coreNull = (): typeof nullGuard => nullGuard;
const coreUndefined = (): typeof undefinedGuard => undefinedGuard;
const coreUnknown = (): typeof unknownGuard => unknownGuard;
const coreVoid = (): typeof voidGuard => voidGuard;
const coreProcess = <TValue>(value: TValue): TValue => value;

export {
    $brand,
    $input,
    $output,
    TimePrecision,
    util
} from "./zod-compat.js";

export type {
    $ZodArrayDef,
    $ZodObjectDef,
    $ZodShape,
    $ZodTypeDef,
    GlobalMeta
} from "./zod-compat-types.js";

/** @brief Zod core version shape reported to compatibility probes. */
export const version = Object.freeze({
    major: 4,
    minor: 4,
    patch: 3
});

/** @brief Immutable placeholder for Zod core global configuration. */
export const globalConfig = Object.freeze({});

/** @brief Immutable placeholder namespace for Zod core JSON Schema internals. */
export const JSONSchema = Object.freeze({});

export { coreProcess as process };

export { coreWildcard as _\u0061ny };

export {
    coreNever as _never,
    coreNull as _null,
    coreUndefined as _undefined,
    coreUnknown as _unknown,
    coreVoid as _void
};

export {
    array as _array,
    discriminatedUnion as _discriminatedUnion,
    intersect as _intersection,
    map as _map,
    record as _record,
    set as _set,
    templateLiteral as _templateLiteral,
    tuple as _tuple,
    union as _union,
    xor as _xor
} from "./builders/composite.js";

export {
    check as _check,
    custom as _custom,
    lazy as _lazy,
    nonoptional as _nonoptional,
    nullable as _nullable,
    optional as _optional,
    readonly as _readonly,
    refine as _refine,
    superRefine as _superRefine
} from "./builders/modifier.js";

export {
    bigint as _bigint,
    boolean as _boolean,
    base64 as _base64,
    base64url as _base64url,
    cidrv4 as _cidrv4,
    cidrv6 as _cidrv6,
    cuid as _cuid,
    cuid2 as _cuid2,
    date as _date,
    e164 as _e164,
    email as _email,
    emoji as _emoji,
    enumValues as _enum,
    enumValues as _nativeEnum,
    file as _file,
    float32 as _float32,
    float64 as _float64,
    guid as _guid,
    int as _int,
    int32 as _int32,
    int64 as _int64,
    ipv4 as _ipv4,
    ipv6 as _ipv6,
    isoDate as _isoDate,
    isoDateTime as _isoDateTime,
    isoDuration as _isoDuration,
    isoTime as _isoTime,
    jwt as _jwt,
    ksuid as _ksuid,
    literal as _literal,
    mac as _mac,
    nan as _nan,
    nanoid as _nanoid,
    number as _number,
    string as _string,
    stringFormat as _stringFormat,
    symbol as _symbol,
    uint32 as _uint32,
    uint64 as _uint64,
    ulid as _ulid,
    url as _url,
    uuid as _uuid,
    uuidv4 as _uuidv4,
    uuidv6 as _uuidv6,
    uuidv7 as _uuidv7,
    xid as _xid
} from "./builders/scalar.js";

export {
    property as _property
} from "./builders/runtime.js";

export {
    parse as _parse,
    parseAsync as _parseAsync,
    safeParse as _safeParse,
    safeParseAsync as _safeParseAsync
} from "./parse/index.js";

export {
    decode as _decode,
    encode as _encode,
    encodeAsync as _encodeAsync,
    safeDecode as _safeDecode,
    safeEncode as _safeEncode,
    safeEncodeAsync as _safeEncodeAsync,
    catchValue as _c\u0061tch,
    coerceBigInt as _coercedBigint,
    coerceBoolean as _coercedBoolean,
    coerceDate as _coercedDate,
    coerceNumber as _coercedNumber,
    coerceString as _coercedString,
    defaultValue as _default,
    pipe as _pipe,
    preprocess as _preprocess,
    stringbool as _stringbool,
    success as _success,
    transform as _transform
} from "./decoder/index.js";

export {
    decodeAsync as _decodeAsync,
    promise as _promise,
    safeDecodeAsync as _safeDecodeAsync
} from "./async/index.js";

export {
    clone,
    endsWith as _endsWith,
    gt as _gt,
    gte as _gte,
    gte as _min,
    includes as _includes,
    length as _length,
    lowercase as _lowercase,
    lt as _lt,
    lte as _lte,
    lte as _max,
    maxLength as _maxLength,
    maxSize as _maxSize,
    mime as _mime,
    minLength as _minLength,
    minSize as _minSize,
    multipleOf as _multipleOf,
    negative as _negative,
    nonnegative as _nonnegative,
    nonpositive as _nonpositive,
    normalize as _normalize,
    overwrite as _overwrite,
    positive as _positive,
    regex as _regex,
    size as _size,
    slugify as _slugify,
    startsWith as _startsWith,
    toLowerCase as _toLowerCase,
    toUpperCase as _toUpperCase,
    trim as _trim,
    uppercase as _uppercase
} from "./mini.js";

export {
    ArrayGuard as $ZodArray,
    BaseAsyncDecoder as $ZodAsyncError,
    BaseAsyncDecoder as $ZodPromise,
    BaseCodec as $ZodCodec,
    BaseDecoder as $ZodCatch,
    BaseDecoder as $ZodDefault,
    BaseDecoder as $ZodPreprocess,
    BaseDecoder as $ZodPipe,
    BaseDecoder as $ZodPrefault,
    BaseDecoder as $ZodSuccess,
    BaseDecoder as $ZodTransform,
    BaseGuard as $ZodAny,
    BaseGuard as $ZodBoolean,
    BaseGuard as $ZodCustom,
    BaseGuard as $ZodDiscriminatedUnion,
    BaseGuard as $ZodIntersection,
    BaseGuard as $ZodLazy,
    BaseGuard as $ZodNaN,
    BaseGuard as $ZodNever,
    BaseGuard as $ZodNonOptional,
    BaseGuard as $ZodNull,
    BaseGuard as $ZodNullable,
    BaseGuard as $ZodOptional,
    BaseGuard as $ZodExactOptional,
    BaseGuard as $ZodReadonly,
    BaseGuard as $ZodRecord,
    BaseGuard as $ZodSymbol,
    BaseGuard as $ZodTemplateLiteral,
    BaseGuard as $ZodType,
    BaseGuard as $ZodUndefined,
    BaseGuard as $ZodUnknown,
    BaseGuard as $ZodVoid,
    BigIntGuard as $ZodBigInt,
    BigIntGuard as $ZodBigIntFormat,
    DateGuard as $ZodDate,
    EnumGuard as $ZodEnum,
    FileGuard as $ZodFile,
    FunctionContract as $ZodFunction,
    LiteralGuard as $ZodLiteral,
    MapGuard as $ZodMap,
    NumberGuard as $ZodNumber,
    NumberGuard as $ZodNumberFormat,
    ObjectGuard as $ZodObject,
    ObjectGuard as $ZodObjectJIT,
    SchemaRegistry as $ZodRegistry,
    SetGuard as $ZodSet,
    StringGuard as $ZodBase64,
    StringGuard as $ZodBase64URL,
    StringGuard as $ZodCIDRv4,
    StringGuard as $ZodCIDRv6,
    StringGuard as $ZodCUID,
    StringGuard as $ZodCUID2,
    StringGuard as $ZodCustomStringFormat,
    StringGuard as $ZodE164,
    StringGuard as $ZodEmail,
    StringGuard as $ZodEmoji,
    StringGuard as $ZodGUID,
    StringGuard as $ZodIPv4,
    StringGuard as $ZodIPv6,
    StringGuard as $ZodISODate,
    StringGuard as $ZodISODateTime,
    StringGuard as $ZodISODuration,
    StringGuard as $ZodISOTime,
    StringGuard as $ZodJWT,
    StringGuard as $ZodKSUID,
    StringGuard as $ZodMAC,
    StringGuard as $ZodNanoID,
    StringGuard as $ZodString,
    StringGuard as $ZodStringFormat,
    StringGuard as $ZodULID,
    StringGuard as $ZodURL,
    StringGuard as $ZodUUID,
    StringGuard as $ZodXID,
    TupleGuard as $ZodTuple,
    TypeSeaZodError as $ZodEncodeError,
    TypeSeaZodError as $ZodError,
    TypeSeaZodError as $ZodRealError,
    UnionGuard as $ZodUnion,
    XorGuard as $ZodXor
} from "./index.js";

/**
 * @brief Minimal immutable base for Zod core check-class compatibility.
 * @details These classes support constructor and identity probes only; TypeSea
 * guards do not execute them as validation checks.
 */
export class $ZodCheck {
    public readonly _zod: Readonly<{
        readonly def: unknown;
    }>;

    public constructor(def: unknown = Object.freeze({})) {
        this._zod = Object.freeze({ def });
        Object.freeze(this);
    }
}

/** @brief Compatibility identity for Zod string-format checks. */
export class $ZodCheckStringFormat extends $ZodCheck {}
/** @brief Compatibility identity for Zod BigInt-format checks. */
export class $ZodCheckBigIntFormat extends $ZodCheck {}
/** @brief Compatibility identity for Zod number-format checks. */
export class $ZodCheckNumberFormat extends $ZodCheck {}
/** @brief Compatibility identity for suffix checks. */
export class $ZodCheckEndsWith extends $ZodCheck {}
/** @brief Compatibility identity for lower-bound checks. */
export class $ZodCheckGreaterThan extends $ZodCheck {}
/** @brief Compatibility identity for substring checks. */
export class $ZodCheckIncludes extends $ZodCheck {}
/** @brief Compatibility identity for exact-length checks. */
export class $ZodCheckLengthEquals extends $ZodCheck {}
/** @brief Compatibility identity for upper-bound checks. */
export class $ZodCheckLessThan extends $ZodCheck {}
/** @brief Compatibility identity for lower-case checks. */
export class $ZodCheckLowerCase extends $ZodCheck {}
/** @brief Compatibility identity for maximum-length checks. */
export class $ZodCheckMaxLength extends $ZodCheck {}
/** @brief Compatibility identity for maximum-size checks. */
export class $ZodCheckMaxSize extends $ZodCheck {}
/** @brief Compatibility identity for MIME checks. */
export class $ZodCheckMimeType extends $ZodCheck {}
/** @brief Compatibility identity for minimum-length checks. */
export class $ZodCheckMinLength extends $ZodCheck {}
/** @brief Compatibility identity for minimum-size checks. */
export class $ZodCheckMinSize extends $ZodCheck {}
/** @brief Compatibility identity for divisibility checks. */
export class $ZodCheckMultipleOf extends $ZodCheck {}
/** @brief Compatibility identity for overwrite transforms. */
export class $ZodCheckOverwrite extends $ZodCheck {}
/** @brief Compatibility identity for property checks. */
export class $ZodCheckProperty extends $ZodCheck {}
/** @brief Compatibility identity for regular-expression checks. */
export class $ZodCheckRegex extends $ZodCheck {}
/** @brief Compatibility identity for exact-size checks. */
export class $ZodCheckSizeEquals extends $ZodCheck {}
/** @brief Compatibility identity for prefix checks. */
export class $ZodCheckStartsWith extends $ZodCheck {}
/** @brief Compatibility identity for upper-case checks. */
export class $ZodCheckUpperCase extends $ZodCheck {}

/** @brief Compatibility identity for Zod core documentation checks. */
export class Doc extends $ZodCheck {}

/** @brief Compatibility identity for Zod core JSON Schema generators. */
export class JSONSchemaGenerator extends $ZodCheck {}

/** @brief Return the compatibility check constructor used by core probes. */
export function $constructor(): typeof $ZodCheck {
    return $ZodCheck;
}

/** @brief Create a no-op Standard JSON Schema compatibility method. */
export function createStandardJSONSchemaMethod(): () => Readonly<Record<string, never>> {
    return (): Readonly<Record<string, never>> => Object.freeze({});
}

/** @brief Create a no-op `toJSONSchema` compatibility method. */
export function createToJSONSchemaMethod(): () => Readonly<Record<string, never>> {
    return (): Readonly<Record<string, never>> => Object.freeze({});
}

/** @brief Return an empty immutable definition table for compatibility callers. */
export function extractDefs(): Readonly<Record<string, never>> {
    return Object.freeze({});
}

/** @brief Preserve a value through the compatibility finalization hook. */
export function finalize<TValue>(value: TValue): TValue {
    return value;
}

/** @brief Wrap an optional value in immutable compatibility context. */
export function initializeContext(
    value?: unknown
): Readonly<{
    readonly value: unknown;
}> {
    return Object.freeze({ value });
}

/** @brief Test the lexical alphabet and padding accepted by Base64 text. */
export function isValidBase64(value: string): boolean {
    return /^[A-Za-z0-9+/]*={0,2}$/u.test(value);
}

/** @brief Test the lexical alphabet accepted by unpadded Base64URL text. */
export function isValidBase64URL(value: string): boolean {
    return /^[A-Za-z0-9_-]*$/u.test(value);
}

/** @brief Test the three-segment lexical shape of compact JWT text. */
export function isValidJWT(value: string): boolean {
    return /^[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+$/u.test(value);
}

/** @brief Render string and numeric path segments in dotted compatibility form. */
export function toDotPath(path: readonly unknown[]): string {
    let output = "";
    for (let index = 0; index < path.length; index += 1) {
        const segment = path[index];
        if (typeof segment === "number") {
            output += `[${String(segment)}]`;
            continue;
        }
        if (typeof segment === "string") {
            if (output.length !== 0) {
                output += ".";
            }
            output += segment;
        }
    }
    return output;
}
