/**
 * @file scalar.ts
 * @brief Scalar payload solvers for SeaFlow.
 */

import {
    BigIntCheckTag,
    DateCheckTag,
    FileCheckTag,
    NumberCheckTag,
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
    type BigIntCheck,
    type DateCheck,
    type FileCheck,
    type LiteralValue,
    type NumberCheck,
    type Schema,
    type StringCheck
} from "../schema/index.js";
import {
    isExtreme,
    isHighOrExtreme,
    makeSeaFlowCase
} from "./case.js";
import {
    sampleBigInt,
    sampleDate,
    sampleNumber,
    sampleString
} from "./sample.js";
import type {
    SeaFlowCase,
    SeaFlowContext
} from "./types.js";

/**
 * @brief Dispatch one scalar schema into deterministic SeaFlow probes.
 * @remarks Scalars own the cheapest high-signal failures: wrong runtime type,
 * adjacent boundary value, format miss, and well-known injection string.
 */
export function* emitScalarCases(
    schema: Schema,
    context: SeaFlowContext
): IterableIterator<SeaFlowCase> {
    switch (schema.tag) {
        case SchemaTag.Unknown:
            yield makeSeaFlowCase(context, "typesea", true, "valid", "unknown.sample");
            yield makeSeaFlowCase(context, null, true, "valid", "unknown.null");
            break;
        case SchemaTag.Never:
            yield makeSeaFlowCase(context, undefined, false, "invalid", "never.undefined");
            break;
        case SchemaTag.String:
            yield* emitStringCases(schema.checks, context);
            break;
        case SchemaTag.Number:
            yield* emitNumberCases(schema.checks, context);
            break;
        case SchemaTag.BigInt:
            yield* emitBigIntCases(schema.checks, context);
            break;
        case SchemaTag.Date:
            yield* emitDateCases(schema.checks, context);
            break;
        case SchemaTag.Symbol:
            yield makeSeaFlowCase(context, Symbol("typesea"), true, "valid", "symbol.sample");
            yield makeSeaFlowCase(context, "symbol", false, "invalid", "symbol.string");
            break;
        case SchemaTag.Boolean:
            yield makeSeaFlowCase(context, true, true, "valid", "boolean.true");
            yield makeSeaFlowCase(context, false, true, "valid", "boolean.false");
            yield makeSeaFlowCase(context, 1, false, "invalid", "boolean.number");
            break;
        case SchemaTag.Literal:
            yield* emitLiteralCases(schema.value, context);
            break;
        case SchemaTag.File:
            yield makeSeaFlowCase(context, sampleFileValue(schema.checks), true, "valid", "file.sample");
            yield makeSeaFlowCase(context, { size: 0 }, false, "invalid", "file.object");
            break;
        case SchemaTag.InstanceOf:
            yield makeSeaFlowCase(
                context,
                Object.create(readConstructorPrototype(schema.constructor)),
                true,
                "valid",
                "instance.sample"
            );
            yield makeSeaFlowCase(context, {}, false, "invalid", "instance.plain");
            break;
        default:
            break;
    }
}

/**
 * @brief Emit string payloads that hit type, length, format, and injection edges.
 * @remarks SeaFlow keeps this solver deterministic so failures can be copied
 * into regression tests without a seed log. Format probes use known bad values
 * instead of a regex generator to preserve the zero-dependency runtime shape.
 */
function* emitStringCases(
    checks: readonly StringCheck[],
    context: SeaFlowContext
): IterableIterator<SeaFlowCase> {
    const valid = sampleString(checks);
    yield makeSeaFlowCase(context, valid, true, "valid", "string.sample");
    yield makeSeaFlowCase(context, 42, false, "invalid", "string.number");
    const min = readStringMin(checks);
    const max = readStringMax(checks);
    if (min > 0) {
        yield makeSeaFlowCase(
            context,
            "a".repeat(min - 1),
            false,
            "invalid",
            "string.min.boundary"
        );
    }
    if (max !== undefined) {
        yield makeSeaFlowCase(
            context,
            "a".repeat(max + 1),
            false,
            "invalid",
            "string.max.boundary"
        );
    }
    yield* emitStringFormatCases(checks, context);
    if (isHighOrExtreme(context)) {
        yield makeSeaFlowCase(
            context,
            "' OR 1=1 --",
            matchesStringChecks("' OR 1=1 --", checks),
            "security",
            "string.sqli"
        );
        yield makeSeaFlowCase(
            context,
            "<script>alert(1)</script>",
            matchesStringChecks("<script>alert(1)</script>", checks),
            "security",
            "string.xss"
        );
    }
}

/**
 * @brief Emit one fixed failing value for each string format check.
 * @remarks These payloads are deliberately plain. The scalar fuzzer is meant
 * to prove that TypeSea routes format checks correctly, not to exhaustively
 * synthesize every string accepted by each external grammar.
 */
function* emitStringFormatCases(
    checks: readonly StringCheck[],
    context: SeaFlowContext
): IterableIterator<SeaFlowCase> {
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case StringCheckTag.Email:
                yield makeSeaFlowCase(context, "not-email", false, "invalid", "string.email");
                break;
            case StringCheckTag.Url:
                yield makeSeaFlowCase(context, "not url", false, "invalid", "string.url");
                break;
            case StringCheckTag.Uuid:
                yield makeSeaFlowCase(context, "not-a-uuid", false, "invalid", "string.uuid");
                break;
            case StringCheckTag.IsoDate:
                yield makeSeaFlowCase(context, "2026-99-99", false, "invalid", "string.isoDate");
                break;
            case StringCheckTag.IsoDateTime:
                yield makeSeaFlowCase(
                    context,
                    "2026-99-99T99:99:99Z",
                    false,
                    "invalid",
                    "string.isoDateTime"
                );
                break;
            case StringCheckTag.Ulid:
                yield makeSeaFlowCase(context, "not-ulid", false, "invalid", "string.ulid");
                break;
            case StringCheckTag.Xid:
                yield makeSeaFlowCase(context, "not-xid", false, "invalid", "string.xid");
                break;
            case StringCheckTag.Ksuid:
                yield makeSeaFlowCase(context, "not-ksuid", false, "invalid", "string.ksuid");
                break;
            case StringCheckTag.Ipv4:
                yield makeSeaFlowCase(context, "999.999.999.999", false, "invalid", "string.ipv4");
                break;
            case StringCheckTag.Ipv6:
                yield makeSeaFlowCase(context, "not:ipv6", false, "invalid", "string.ipv6");
                break;
            case StringCheckTag.Regex:
                yield makeSeaFlowCase(context, "___typesea___", false, "invalid", "string.regex");
                break;
            case StringCheckTag.Min:
            case StringCheckTag.Max:
                break;
        }
    }
}

/**
 * @brief Emit finite numeric samples, type-confusion values, and extreme floats.
 * @remarks Boundary values are derived from the schema checks so a single run
 * covers both the nearest invalid edge and the ordinary valid path.
 */
function* emitNumberCases(
    checks: readonly NumberCheck[],
    context: SeaFlowContext
): IterableIterator<SeaFlowCase> {
    yield makeSeaFlowCase(context, sampleNumber(checks), true, "valid", "number.sample");
    yield makeSeaFlowCase(context, "10", false, "invalid", "number.string");
    yield makeSeaFlowCase(context, [10], false, "invalid", "number.array");
    yield* emitNumberBoundaryCases(checks, context);
    if (isExtreme(context)) {
        yield makeSeaFlowCase(context, NaN, false, "invalid", "number.nan");
        yield makeSeaFlowCase(context, Infinity, false, "invalid", "number.infinity");
        yield makeSeaFlowCase(context, -Infinity, false, "invalid", "number.negativeInfinity");
        yield makeSeaFlowCase(context, -0, true, "valid", "number.negativeZero");
    }
}

/**
 * @brief Emit invalid numeric neighbors for each numeric predicate.
 * @remarks The generated values intentionally sit exactly on the rejected side
 * of each relation; this catches off-by-one and exclusive-bound lowering bugs.
 */
function* emitNumberBoundaryCases(
    checks: readonly NumberCheck[],
    context: SeaFlowContext
): IterableIterator<SeaFlowCase> {
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case NumberCheckTag.Integer:
                yield makeSeaFlowCase(context, 1.5, false, "invalid", "number.integer");
                break;
            case NumberCheckTag.Gte:
                yield makeSeaFlowCase(
                    context,
                    check.value - 1,
                    false,
                    "invalid",
                    "number.gte.boundary"
                );
                break;
            case NumberCheckTag.Gt:
                yield makeSeaFlowCase(context, check.value, false, "invalid", "number.gt.boundary");
                break;
            case NumberCheckTag.Lte:
                yield makeSeaFlowCase(
                    context,
                    check.value + 1,
                    false,
                    "invalid",
                    "number.lte.boundary"
                );
                break;
            case NumberCheckTag.Lt:
                yield makeSeaFlowCase(context, check.value, false, "invalid", "number.lt.boundary");
                break;
            case NumberCheckTag.MultipleOf:
                yield makeSeaFlowCase(
                    context,
                    check.value + 1,
                    false,
                    "invalid",
                    "number.multiple"
                );
                break;
        }
    }
}

/**
 * @brief Emit BigInt probes that mirror the number solver without float cases.
 * @remarks BigInt has no NaN or infinity states, so this solver focuses on
 * type confusion, inclusive bounds, exclusive bounds, and divisibility checks.
 */
function* emitBigIntCases(
    checks: readonly BigIntCheck[],
    context: SeaFlowContext
): IterableIterator<SeaFlowCase> {
    yield makeSeaFlowCase(context, sampleBigInt(checks), true, "valid", "bigint.sample");
    yield makeSeaFlowCase(context, 0, false, "invalid", "bigint.number");
    yield makeSeaFlowCase(context, "0", false, "invalid", "bigint.string");
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case BigIntCheckTag.Gte:
                yield makeSeaFlowCase(
                    context,
                    check.value - 1n,
                    false,
                    "invalid",
                    "bigint.gte.boundary"
                );
                break;
            case BigIntCheckTag.Gt:
                yield makeSeaFlowCase(
                    context,
                    check.value,
                    false,
                    "invalid",
                    "bigint.gt.boundary"
                );
                break;
            case BigIntCheckTag.Lte:
                yield makeSeaFlowCase(
                    context,
                    check.value + 1n,
                    false,
                    "invalid",
                    "bigint.lte.boundary"
                );
                break;
            case BigIntCheckTag.Lt:
                yield makeSeaFlowCase(
                    context,
                    check.value,
                    false,
                    "invalid",
                    "bigint.lt.boundary"
                );
                break;
            case BigIntCheckTag.MultipleOf:
                yield makeSeaFlowCase(
                    context,
                    check.value + 1n,
                    false,
                    "invalid",
                    "bigint.multiple"
                );
                break;
        }
    }
}

/**
 * @brief Emit Date probes around time bounds and invalid Date payloads.
 * @remarks Date validation is vulnerable to accidental string acceptance in
 * userland wrappers, so SeaFlow always emits both a string date and NaN Date.
 */
function* emitDateCases(
    checks: readonly DateCheck[],
    context: SeaFlowContext
): IterableIterator<SeaFlowCase> {
    yield makeSeaFlowCase(context, sampleDate(checks), true, "valid", "date.sample");
    yield makeSeaFlowCase(context, "2026-07-07", false, "invalid", "date.string");
    yield makeSeaFlowCase(context, new Date(Number.NaN), false, "invalid", "date.invalid");
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        if (check.tag === DateCheckTag.Min) {
            yield makeSeaFlowCase(
                context,
                new Date(check.value - 1),
                false,
                "invalid",
                "date.min.boundary"
            );
        }
        if (check.tag === DateCheckTag.Max) {
            yield makeSeaFlowCase(
                context,
                new Date(check.value + 1),
                false,
                "invalid",
                "date.max.boundary"
            );
        }
    }
}

/**
 * @brief Emit the literal itself and a guaranteed distinct literal value.
 * @remarks Distinct generation stays type-local where possible so literal
 * equality bugs are isolated from broader type-dispatch behavior.
 */
function* emitLiteralCases(
    value: LiteralValue,
    context: SeaFlowContext
): IterableIterator<SeaFlowCase> {
    yield makeSeaFlowCase(context, value, true, "valid", "literal.sample");
    yield makeSeaFlowCase(context, distinctLiteral(value), false, "invalid", "literal.distinct");
}

/**
 * @brief Produce one value that cannot be equal to the supplied literal.
 */
function distinctLiteral(value: LiteralValue): LiteralValue {
    switch (typeof value) {
        case "string":
            return `${value}__typesea`;
        case "number":
            return value + 1;
        case "bigint":
            return value + 1n;
        case "boolean":
            return !value;
        case "symbol":
            return Symbol("typesea.distinct");
        case "undefined":
            return null;
        case "object":
            return undefined;
    }
}

/**
 * @brief Re-run string checks locally when security payload validity is schema-dependent.
 * @remarks Injection probes are marked with their actual expected verdict. A
 * schema such as `t.string.min(1)` should accept the payload, while
 * `t.string.email()` should reject it.
 */
function matchesStringChecks(value: string, checks: readonly StringCheck[]): boolean {
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        if (!matchesStringCheck(value, check)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Apply one string check using the same public patterns as validators.
 */
function matchesStringCheck(value: string, check: StringCheck): boolean {
    switch (check.tag) {
        case StringCheckTag.Min:
            return value.length >= check.value;
        case StringCheckTag.Max:
            return value.length <= check.value;
        case StringCheckTag.Regex:
            return check.regex.test(value);
        case StringCheckTag.Uuid:
            return UUID_PATTERN.test(value);
        case StringCheckTag.Email:
            return EMAIL_PATTERN.test(value);
        case StringCheckTag.Url:
            return URL_PATTERN.test(value);
        case StringCheckTag.IsoDate:
            return ISO_DATE_PATTERN.test(value);
        case StringCheckTag.IsoDateTime:
            return ISO_DATETIME_PATTERN.test(value);
        case StringCheckTag.Ulid:
            return ULID_PATTERN.test(value);
        case StringCheckTag.Xid:
            return XID_PATTERN.test(value);
        case StringCheckTag.Ksuid:
            return KSUID_PATTERN.test(value);
        case StringCheckTag.Ipv4:
            return IPV4_PATTERN.test(value);
        case StringCheckTag.Ipv6:
            return IPV6_PATTERN.test(value);
    }
}

function readStringMin(checks: readonly StringCheck[]): number {
    let min = 0;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check?.tag === StringCheckTag.Min && check.value > min) {
            min = check.value;
        }
    }
    return min;
}

function readStringMax(checks: readonly StringCheck[]): number | undefined {
    let max: number | undefined;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check?.tag === StringCheckTag.Max) {
            max = max === undefined ? check.value : Math.min(max, check.value);
        }
    }
    return max;
}

/**
 * @brief Build a File-like sample without requiring Node to expose File.
 * @remarks The object fallback is intentionally tiny; it gives tests a stable
 * structural value in older runtimes while preserving browser behavior where
 * the native constructor exists.
 */
function sampleFileValue(checks: readonly FileCheck[]): unknown {
    const size = readFileMin(checks);
    if (typeof File === "function") {
        return new File(["a".repeat(size)], "typesea.txt");
    }
    return Object.freeze({
        size,
        type: ""
    });
}

function readFileMin(checks: readonly FileCheck[]): number {
    let min = 0;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check?.tag === FileCheckTag.Min &&
            check.value > min) {
            min = check.value;
        }
    }
    return min;
}

/**
 * @brief Read the prototype used for an instance sample without constructing it.
 * @remarks Constructors may allocate, mutate globals, or require arguments.
 * Creating an object with the prototype is enough to satisfy `instanceof` while
 * keeping SeaFlow side-effect-light.
 */
function readConstructorPrototype(
    constructor: abstract new (...args: never[]) => unknown
): object | null {
    const source = constructor as unknown as Readonly<Record<"prototype", unknown>>;
    const prototype = source.prototype;
    return typeof prototype === "object" && prototype !== null
        ? prototype
        : Object.prototype;
}
