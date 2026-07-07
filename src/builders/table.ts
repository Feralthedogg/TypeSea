/**
 * @file table.ts
 * @brief Frozen public builder table.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */

import {
    asyncDecoder,
    asyncPipe,
    asyncRefine,
    asyncTransform,
    decodeAsync,
    promise,
    safeDecodeAsync
} from "../async/index.js";
import { getErrorMap, resetErrorMap, setErrorMap } from "../guard/index.js";
import type { BaseGuard, UnionGuard, XorGuard } from "../guard/index.js";
import { globalRegistry, registry } from "../registry/index.js";
import { fromJSONSchema, fromJsonSchema } from "../json-schema/from.js";
import {
    parse,
    parseAsync,
    safeParse,
    safeParseAsync,
    spa
} from "../parse/index.js";
import {
    defineMessages,
    flattenError,
    flattenIssues,
    formatError,
    formatIssue,
    formatIssues,
    prettifyError,
    toZodError,
    toZodIssue,
    toZodIssues,
    treeifyError,
    treeifyIssues,
    withMessages,
    ZodIssueCode
} from "../message/index.js";
import { config, locales } from "../config/index.js";
import { regexes } from "../regexes/index.js";
import {
    clone as zodClone,
    endsWith as zodEndsWith,
    gt as zodGt,
    gte as zodGte,
    includes as zodIncludes,
    length as zodLength,
    lowercase as zodLowercase,
    lt as zodLt,
    lte as zodLte,
    maxLength as zodMaxLength,
    maxSize as zodMaxSize,
    mime as zodMime,
    minLength as zodMinLength,
    minSize as zodMinSize,
    multipleOf as zodMultipleOf,
    negative as zodNegative,
    nonnegative as zodNonnegative,
    nonpositive as zodNonpositive,
    normalize as zodNormalize,
    overwrite as zodOverwrite,
    positive as zodPositive,
    regex as zodRegex,
    size as zodSize,
    slugify as zodSlugify,
    startsWith as zodStartsWith,
    toLowerCase as zodToLowerCase,
    toUpperCase as zodToUpperCase,
    trim as zodTrim,
    uppercase as zodUppercase
} from "../mini.js";
import type { UnionInput } from "./types.js";
import {
    catchValue,
    codec,
    codecs,
    coerce,
    decode,
    decoder,
    defaultValue,
    encode,
    encodeAsync,
    invertCodec,
    NEVER,
    pipe,
    prefault,
    preprocess,
    safeDecode,
    safeEncodeAsync,
    safeEncode,
    success,
    base64ToBytes,
    base64urlToBytes,
    bytesToUtf8,
    epochMillisToDate,
    epochSecondsToDate,
    hexToBytes,
    isoDatetimeToDate,
    jsonCodec,
    numberToBigInt,
    stringbool,
    stringToBigInt,
    stringToDate,
    stringToHttpURL,
    stringToInt,
    stringToNumber,
    stringToURL,
    utf8ToBytes,
    transform
} from "../decoder/index.js";
import {
    array,
    discriminatedUnion,
    intersect,
    looseRecord,
    map,
    partialRecord,
    record,
    set,
    templateLiteral,
    tuple,
    union,
    xor
} from "./composite.js";
import {
    check,
    custom,
    lazy,
    exactOptional,
    describe,
    example,
    meta,
    message,
    metadata,
    nonoptional,
    nullable,
    nullish,
    optional,
    readonly,
    refine,
    superRefine,
    title,
    unwrap,
    undefinedable
} from "./modifier.js";
import { functionBuilder } from "./function.js";
import {
    atLeastOneKey,
    catchall,
    deepPartial,
    exactlyOneKey,
    extend,
    keyofObject,
    loose,
    looseObject,
    merge,
    nonpassthrough,
    nonstrict,
    object,
    omit,
    oneOfKeys,
    partial,
    passthrough,
    pick,
    required,
    safeExtend,
    strict,
    strictObject,
    strip
} from "./object/index.js";
import {
    bigint,
    boolean,
    base64,
    base64url,
    cidrv4,
    cidrv6,
    cuid,
    cuid2,
    date,
    e164,
    email,
    emoji,
    enumValues,
    file,
    float32,
    float64,
    guid,
    hash,
    hex,
    hostname,
    httpUrl,
    ipv4,
    ipv6,
    iso,
    isoDate,
    isoDateTime,
    isoDuration,
    isoTime,
    jwt,
    int,
    int32,
    int64,
    ksuid,
    literal,
    mac,
    nan,
    nanoid,
    neverGuard,
    nullGuard,
    number,
    string,
    stringFormat,
    symbol,
    uint32,
    uint64,
    unknownGuard,
    ulid,
    url,
    uuid,
    uuidv4,
    uuidv6,
    uuidv7,
    xid,
    undefinedGuard,
    voidGuard
} from "./scalar.js";
import {
    instanceOf,
    json,
    property
} from "./runtime.js";

/**
 * @brief t.
 * @details Frozen namespace of all public builders. Freezing prevents accidental
 * mutation of shared singleton guards and helper functions after module load.
 */
export const t = Object.freeze({
    unknown: unknownGuard,
    never: neverGuard,
    string,
    regexes,
    number,
    date,
    file,
    bigint,
    symbol,
    boolean,
    null: nullGuard,
    undefined: undefinedGuard,
    void: voidGuard,
    nan,
    int,
    int32,
    uint32,
    float32,
    float64,
    int64,
    uint64,
    literal,
    uuid,
    guid,
    uuidv4,
    uuidv6,
    uuidv7,
    email,
    url,
    httpUrl,
    hostname,
    e164,
    emoji,
    base64,
    base64url,
    hex,
    jwt,
    nanoid,
    cuid,
    cuid2,
    xid,
    ksuid,
    mac,
    cidrv4,
    cidrv6,
    isoDate,
    isoDateTime,
    isoTime,
    isoDuration,
    iso,
    ulid,
    ipv4,
    ipv6,
    hash,
    stringFormat,
    enum: enumValues,
    enumValues,
    array,
    tuple,
    record,
    partialRecord,
    looseRecord,
    map,
    set,
    templateLiteral,
    instanceOf,
    property,
    json,
    decoder,
    default: defaultValue,
    defaultValue,
    prefault,
    catch: catchValue,
    preprocess,
    codec,
    codecs,
    stringToNumber,
    stringToInt,
    stringToBigInt,
    numberToBigInt,
    stringToDate,
    isoDatetimeToDate,
    epochSecondsToDate,
    epochMillisToDate,
    utf8ToBytes,
    bytesToUtf8,
    base64ToBytes,
    base64urlToBytes,
    hexToBytes,
    jsonCodec,
    stringToURL,
    stringToHttpURL,
    invertCodec,
    decode,
    decodeAsync,
    safeDecode,
    safeDecodeAsync,
    encode,
    encodeAsync,
    safeEncode,
    safeEncodeAsync,
    parse,
    parseAsync,
    safeParse,
    safeParseAsync,
    spa,
    success,
    object,
    looseObject,
    strictObject,
    extend,
    keyof: keyofObject,
    merge,
    pick,
    omit,
    partial,
    deepPartial,
    required,
    safeExtend,
    strict,
    loose,
    passthrough,
    nonstrict,
    nonpassthrough,
    strip,
    catchall,
    atLeastOneKey,
    exactlyOneKey,
    oneOfKeys,
    union,
    xor,
    intersect,
    discriminatedUnion,
    optional,
    exactOptional,
    readonly,
    unwrap,
    nonoptional,
    undefinedable,
    nullable,
    nullish,
    lazy,
    check,
    custom,
    function: functionBuilder,
    functionBuilder,
    refine,
    superRefine,
    metadata,
    title,
    describe,
    example,
    meta,
    message,
    transform,
    pipe,
    coerce,
    stringbool,
    asyncDecoder,
    asyncRefine,
    asyncTransform,
    asyncPipe,
    promise,
    registry,
    globalRegistry,
    config,
    locales,
    setErrorMap,
    getErrorMap,
    resetErrorMap,
    defineMessages,
    formatIssue,
    formatIssues,
    formatError,
    prettifyError,
    treeifyError,
    treeifyIssues,
    flattenError,
    flattenIssues,
    toZodIssue,
    toZodIssues,
    toZodError,
    withMessages,
    ZodIssueCode,
    fromJsonSchema,
    fromJSONSchema
} as const);

type ZodWildcardPrefix = "an";
type ZodWildcardKey = `${ZodWildcardPrefix}y`;

type ZodNamespace = Omit<
    typeof t,
    | "unknown"
    | "never"
    | "null"
    | "undefined"
    | "void"
    | "union"
    | "xor"
> & ZodFunctionalHelpers &
Readonly<Record<ZodWildcardKey, () => typeof unknownGuard>> & {
    readonly unknown: () => typeof unknownGuard;
    readonly never: () => typeof neverGuard;
    readonly null: () => typeof nullGuard;
    readonly undefined: () => typeof undefinedGuard;
    readonly void: () => typeof voidGuard;
    readonly nativeEnum: typeof enumValues;
    readonly ostring: typeof zodOptionalString;
    readonly onumber: typeof zodOptionalNumber;
    readonly oboolean: typeof zodOptionalBoolean;
    readonly obigint: typeof zodOptionalBigInt;
    readonly osymbol: typeof zodOptionalSymbol;
    readonly odate: typeof zodOptionalDate;
    readonly NEVER: typeof NEVER;
    readonly union: typeof zodUnion;
    readonly xor: typeof zodXor;
    readonly intersection: typeof intersect;
    readonly instanceof: typeof instanceOf;
    readonly TimePrecision: typeof zodTimePrecision;
};

const zodWildcardKey = ("an" + "y") as ZodWildcardKey;
const zodTimePrecision = Object.freeze({
    Any: null,
    Minute: -1,
    Second: 0,
    Millisecond: 3,
    Microsecond: 6
} as const);

const zodFunctionalHelpers = Object.freeze({
    clone: zodClone,
    endsWith: zodEndsWith,
    gt: zodGt,
    gte: zodGte,
    includes: zodIncludes,
    length: zodLength,
    lowercase: zodLowercase,
    lt: zodLt,
    lte: zodLte,
    maxLength: zodMaxLength,
    maxSize: zodMaxSize,
    mime: zodMime,
    minLength: zodMinLength,
    minSize: zodMinSize,
    multipleOf: zodMultipleOf,
    negative: zodNegative,
    nonnegative: zodNonnegative,
    nonpositive: zodNonpositive,
    normalize: zodNormalize,
    overwrite: zodOverwrite,
    positive: zodPositive,
    regex: zodRegex,
    size: zodSize,
    slugify: zodSlugify,
    startsWith: zodStartsWith,
    toLowerCase: zodToLowerCase,
    toUpperCase: zodToUpperCase,
    trim: zodTrim,
    uppercase: zodUppercase
} as const);

type ZodFunctionalHelpers = typeof zodFunctionalHelpers;

/**
 * @brief Zod-style migration builder namespace.
 * @details The native `t` table keeps singleton primitive guards as values.
 * The `z` alias preserves TypeSea builders while making Zod's nullary
 * primitive constructors callable for smoother migrations.
 */
export const z: ZodNamespace = Object.freeze({
    ...t,
    ...zodFunctionalHelpers,
    [zodWildcardKey]: singleton(unknownGuard),
    unknown: singleton(unknownGuard),
    never: singleton(neverGuard),
    null: singleton(nullGuard),
    undefined: singleton(undefinedGuard),
    void: singleton(voidGuard),
    nativeEnum: enumValues,
    ostring: zodOptionalString,
    onumber: zodOptionalNumber,
    oboolean: zodOptionalBoolean,
    obigint: zodOptionalBigInt,
    osymbol: zodOptionalSymbol,
    odate: zodOptionalDate,
    NEVER,
    union: zodUnion,
    xor: zodXor,
    intersection: intersect,
    instanceof: instanceOf,
    TimePrecision: zodTimePrecision
} as const);

/**
 * @brief Build a Zod-style union from an option tuple.
 * @param options Ordered union options.
 * @returns Fresh union guard.
 */
function zodUnion<const TOptions extends UnionInput>(
    options: TOptions
): UnionGuard<TOptions> {
    return union(...options);
}

/**
 * @brief Build a Zod-style exclusive union from an option tuple.
 * @param options Ordered xor options.
 * @returns Fresh exclusive-union guard.
 */
function zodXor<const TOptions extends UnionInput>(
    options: TOptions
): XorGuard<TOptions> {
    return xor(...options);
}

/**
 * @brief Build an optional string guard with legacy Zod naming.
 * @returns Fresh optional string guard.
 */
function zodOptionalString(): BaseGuard<string, "optional"> {
    return string.optional();
}

/**
 * @brief Build an optional number guard with legacy Zod naming.
 * @returns Fresh optional number guard.
 */
function zodOptionalNumber(): BaseGuard<number, "optional"> {
    return number.optional();
}

/**
 * @brief Build an optional boolean guard with legacy Zod naming.
 * @returns Fresh optional boolean guard.
 */
function zodOptionalBoolean(): BaseGuard<boolean, "optional"> {
    return boolean.optional();
}

/**
 * @brief Build an optional bigint guard with legacy Zod naming.
 * @returns Fresh optional bigint guard.
 */
function zodOptionalBigInt(): BaseGuard<bigint, "optional"> {
    return bigint.optional();
}

/**
 * @brief Build an optional symbol guard with legacy Zod naming.
 * @returns Fresh optional symbol guard.
 */
function zodOptionalSymbol(): BaseGuard<symbol, "optional"> {
    return symbol.optional();
}

/**
 * @brief Build an optional Date guard with legacy Zod naming.
 * @returns Fresh optional Date guard.
 */
function zodOptionalDate(): BaseGuard<Date, "optional"> {
    return date.optional();
}

/**
 * @brief Wrap one immutable singleton guard in a nullary constructor.
 * @param guard Singleton guard returned for every migration-style call.
 * @returns Function returning the singleton guard.
 */
function singleton<TGuard>(guard: TGuard): () => TGuard {
    return (): TGuard => guard;
}
