/**
 * @file sample.ts
 * @brief Deterministic valid-value synthesis for SeaFlow.
 */

import {
    BigIntCheckTag,
    DateCheckTag,
    FileCheckTag,
    NumberCheckTag,
    PresenceTag,
    SchemaTag,
    StringCheckTag
} from "../kind/index.js";
import type {
    BigIntCheck,
    DateCheck,
    FileCheck,
    NumberCheck,
    Schema,
    StringCheck
} from "../schema/index.js";
import type { SeaFlowContext } from "./types.js";
import { childContext, descendContext } from "./case.js";
import { defineSeaFlowDataProperty } from "./record.js";

/**
 * @brief Synthesize one deterministic value expected to satisfy a schema.
 * @remarks Composite solvers use this as the stable base object before they
 * remove keys, corrupt fields, or inject hostile properties. Lazy recursion is
 * capped by `maxDepth` so recursive schemas terminate without global state.
 */
export function sampleValidValue(
    schema: Schema,
    context: SeaFlowContext
): unknown {
    if (context.depth >= context.config.maxDepth && schema.tag === SchemaTag.Lazy) {
        return undefined;
    }
    switch (schema.tag) {
        case SchemaTag.Unknown:
            return "typesea";
        case SchemaTag.Never:
            return undefined;
        case SchemaTag.String:
            return sampleString(schema.checks);
        case SchemaTag.Number:
            return sampleNumber(schema.checks);
        case SchemaTag.BigInt:
            return sampleBigInt(schema.checks);
        case SchemaTag.Date:
            return sampleDate(schema.checks);
        case SchemaTag.Symbol:
            return Symbol("typesea");
        case SchemaTag.Boolean:
            return true;
        case SchemaTag.Literal:
            return schema.value;
        case SchemaTag.Array:
            return [sampleValidValue(schema.item, childContext(context, 0))];
        case SchemaTag.Tuple:
            return schema.items.map((item, index) =>
                sampleValidValue(item, childContext(context, index)));
        case SchemaTag.Record:
            return sampleRecord(schema, context);
        case SchemaTag.Map:
            return new Map([[
                sampleValidValue(schema.key, childContext(context, "key")),
                sampleValidValue(schema.value, childContext(context, "value"))
            ]]);
        case SchemaTag.Set:
            return new Set([sampleValidValue(schema.item, childContext(context, 0))]);
        case SchemaTag.File:
            return sampleFile(schema.checks);
        case SchemaTag.InstanceOf:
            return Object.create(readConstructorPrototype(schema.constructor));
        case SchemaTag.Property:
            return sampleProperty(schema, context);
        case SchemaTag.Object:
            return sampleObject(schema, context);
        case SchemaTag.Union:
        case SchemaTag.Xor:
            return schema.options[0] === undefined
                ? undefined
                : sampleValidValue(schema.options[0], descendContext(context));
        case SchemaTag.Intersection:
            return mergeSamples(
                sampleValidValue(schema.left, descendContext(context)),
                sampleValidValue(schema.right, descendContext(context))
            );
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
            return sampleValidValue(schema.inner, descendContext(context));
        case SchemaTag.Nullable:
            return sampleValidValue(schema.inner, descendContext(context));
        case SchemaTag.DiscriminatedUnion:
            return schema.cases[0] === undefined
                ? undefined
                : sampleValidValue(schema.cases[0].schema, descendContext(context));
        case SchemaTag.Brand:
        case SchemaTag.Metadata:
        case SchemaTag.Message:
        case SchemaTag.Readonly:
        case SchemaTag.Refine:
            return sampleValidValue(schema.inner, descendContext(context));
        case SchemaTag.KeyedObject:
        case SchemaTag.PropertyCount:
        case SchemaTag.PropertyNames:
            return sampleValidValue(schema.inner, descendContext(context));
        case SchemaTag.PatternProperties:
            return samplePatternProperties(schema, context);
        case SchemaTag.Lazy:
            return sampleValidValue(schema.get(), descendContext(context));
    }
}

/**
 * @brief Select a string that satisfies length and known format checks.
 * @remarks Regex handling is intentionally seed-based. SeaFlow should stay
 * small and dependency-free; complete regex synthesis belongs in a separate
 * optional layer if the project ever needs it.
 */
export function sampleString(checks: readonly StringCheck[]): string {
    const base = selectStringBase(checks);
    const min = readStringMin(checks);
    const max = readStringMax(checks);
    if (max !== undefined && max < base.length) {
        return "a".repeat(Math.max(0, max));
    }
    if (base.length >= min) {
        return base;
    }
    return `${base}${"a".repeat(min - base.length)}`;
}

/**
 * @brief Select a finite number inside the strongest known bounds.
 * @remarks The solver favors simple integer candidates because they exercise
 * V8's monomorphic number paths while still respecting integer and multiple-of
 * constraints when those checks are present.
 */
export function sampleNumber(checks: readonly NumberCheck[]): number {
    const integer = numberHasIntegerCheck(checks);
    const lower = readNumberLower(checks);
    const upper = readNumberUpper(checks);
    const multiple = readNumberMultiple(checks);
    let candidate = lower === undefined
        ? 0
        : lower.exclusive
            ? lower.value + 1
            : lower.value;
    if (integer) {
        candidate = lower?.exclusive === true
            ? Math.floor(lower.value) + 1
            : Math.ceil(candidate);
    }
    if (multiple !== undefined && multiple !== 0) {
        candidate = Math.ceil(candidate / multiple) * multiple;
    }
    if (upper !== undefined && violatesUpper(candidate, upper.value, upper.exclusive)) {
        candidate = upper.exclusive
            ? upper.value - 1
            : upper.value;
        if (integer) {
            candidate = Math.floor(candidate);
        }
        if (multiple !== undefined && multiple !== 0) {
            candidate = Math.floor(candidate / multiple) * multiple;
        }
    }
    if (Object.is(candidate, -0)) {
        return 0;
    }
    return candidate;
}

/**
 * @brief Select a BigInt inside the strongest known bounds.
 * @remarks BigInt modulo adjustment mirrors the number multiple-of path but
 * avoids conversion through Number so large bounds remain exact.
 */
export function sampleBigInt(checks: readonly BigIntCheck[]): bigint {
    const lower = readBigIntLower(checks);
    const upper = readBigIntUpper(checks);
    const multiple = readBigIntMultiple(checks);
    let candidate = lower === undefined
        ? 0n
        : lower.exclusive
            ? lower.value + 1n
            : lower.value;
    if (multiple !== undefined && multiple !== 0n) {
        const remainder = candidate % multiple;
        if (remainder !== 0n) {
            candidate += multiple - remainder;
        }
    }
    if (upper !== undefined &&
        (candidate > upper.value || (upper.exclusive && candidate === upper.value))) {
        candidate = upper.exclusive
            ? upper.value - 1n
            : upper.value;
    }
    return candidate;
}

/**
 * @brief Select a Date at the strongest lower bound, clamped by the upper bound.
 */
export function sampleDate(checks: readonly DateCheck[]): Date {
    const lower = readDateLower(checks);
    const upper = readDateUpper(checks);
    let millis = lower ?? 0;
    if (upper !== undefined && millis > upper) {
        millis = upper;
    }
    return new Date(millis);
}

/**
 * @brief Numeric interval endpoint used by finite number synthesis.
 */
interface NumericBound {
    readonly value: number;
    readonly exclusive: boolean;
}

/**
 * @brief BigInt interval endpoint used by exact integer synthesis.
 */
interface BigIntBound {
    readonly value: bigint;
    readonly exclusive: boolean;
}

/**
 * @brief Build the canonical valid object used by object attack cases.
 * @remarks Required fields are always populated. Optional fields are added only
 * above low intensity so small runs do not explode in width.
 */
function sampleObject(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    context: SeaFlowContext
): Record<string, unknown> {
    const output: Record<string, unknown> = {};
    for (let index = 0; index < schema.entries.length; index += 1) {
        const entry = schema.entries[index];
        if (entry === undefined) {
            continue;
        }
        if (entry.presence === PresenceTag.Required ||
            (context.config.intensity !== "low" &&
                context.depth + 1 < context.config.maxDepth)) {
            defineSeaFlowDataProperty(
                output,
                entry.key,
                sampleValidValue(entry.schema, childContext(context, entry.key))
            );
        }
    }
    return output;
}

/**
 * @brief Build a one-entry record using a required key or a synthesized key.
 */
function sampleRecord(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Record }>,
    context: SeaFlowContext
): Record<string, unknown> {
    const key = schema.requiredKeys?.[0] ?? sampleRecordKey(schema.key, context);
    return {
        [key]: sampleValidValue(schema.value, childContext(context, key))
    };
}

/**
 * @brief Materialize a property schema by mutating a sampled base when possible.
 * @remarks Reusing the base shape preserves intersections and wrapper
 * structure that would be lost if the property node always created a fresh
 * object.
 */
function sampleProperty(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Property }>,
    context: SeaFlowContext
): unknown {
    const base = sampleValidValue(schema.base, descendContext(context));
    if (isMutableRecord(base)) {
        defineSeaFlowDataProperty(
            base,
            schema.key,
            sampleValidValue(schema.value, childContext(context, schema.key))
        );
        return base;
    }
    return {
        [schema.key]: sampleValidValue(schema.value, childContext(context, schema.key))
    };
}

/**
 * @brief Attach one pattern-property sample to a sampled base object.
 */
function samplePatternProperties(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.PatternProperties }>,
    context: SeaFlowContext
): unknown {
    const base = sampleValidValue(schema.inner, descendContext(context));
    if (!isMutableRecord(base)) {
        return base;
    }
    const entry = schema.entries[0];
    if (entry !== undefined) {
        defineSeaFlowDataProperty(
            base,
            entry.source,
            sampleValidValue(entry.schema, childContext(context, entry.source))
        );
    }
    return base;
}

/**
 * @brief Convert a sampled key schema into a property name.
 * @remarks Records ultimately address string property slots, so non-string
 * finite numeric keys are normalized with the same runtime coercion users see
 * when writing object literals.
 */
function sampleRecordKey(
    schema: Schema | undefined,
    context: SeaFlowContext
): string {
    if (schema === undefined) {
        return "key";
    }
    const key = sampleValidValue(schema, childContext(context, "key"));
    if (typeof key === "string" && key.length !== 0) {
        return key;
    }
    if (typeof key === "number" && Number.isFinite(key)) {
        return String(key);
    }
    return "key";
}

/**
 * @brief Build a File-like value for the deterministic valid sample path.
 */
function sampleFile(checks: readonly FileCheck[]): unknown {
    const size = Math.max(0, readFileMin(checks));
    if (typeof File === "function") {
        return new File(["a".repeat(size)], "typesea.txt");
    }
    return Object.freeze({
        size,
        type: ""
    });
}

/**
 * @brief Merge object-shaped intersection samples without invoking user code.
 */
function mergeSamples(left: unknown, right: unknown): unknown {
    if (isMutableRecord(left) && isMutableRecord(right)) {
        return {
            ...left,
            ...right
        };
    }
    return left;
}

/**
 * @brief Choose a small valid seed for known string formats.
 */
function selectStringBase(checks: readonly StringCheck[]): string {
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case StringCheckTag.Email:
                return "a@b.co";
            case StringCheckTag.Url:
                return "https://typesea.dev";
            case StringCheckTag.Uuid:
                return "00000000-0000-0000-0000-000000000000";
            case StringCheckTag.IsoDate:
                return "2026-07-07";
            case StringCheckTag.IsoDateTime:
                return "2026-07-07T00:00:00Z";
            case StringCheckTag.Ulid:
                return "01J00000000000000000000000";
            case StringCheckTag.Xid:
                return "9m4e2mr0ui3e8a215n4g";
            case StringCheckTag.Ksuid:
                return "0ujsswThIGTUYm2K8FjOOfXtY1K";
            case StringCheckTag.Ipv4:
                return "127.0.0.1";
            case StringCheckTag.Ipv6:
                return "::1";
            case StringCheckTag.Regex:
                return selectRegexSeed(check.regex);
            case StringCheckTag.Min:
            case StringCheckTag.Max:
                break;
        }
    }
    return "typesea";
}

/**
 * @brief Pick the first built-in regex seed accepted by the schema pattern.
 */
function selectRegexSeed(regex: RegExp): string {
    const seeds = ["", "a", "abc", "typesea", "123", "test@example.com"];
    for (let index = 0; index < seeds.length; index += 1) {
        const seed = seeds[index];
        if (seed !== undefined && regex.test(seed)) {
            return seed;
        }
    }
    return "typesea";
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

function numberHasIntegerCheck(checks: readonly NumberCheck[]): boolean {
    for (let index = 0; index < checks.length; index += 1) {
        if (checks[index]?.tag === NumberCheckTag.Integer) {
            return true;
        }
    }
    return false;
}

function readNumberLower(checks: readonly NumberCheck[]): NumericBound | undefined {
    let lower: NumericBound | undefined;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        if (check.tag === NumberCheckTag.Gte || check.tag === NumberCheckTag.Gt) {
            const candidate = {
                value: check.value,
                exclusive: check.tag === NumberCheckTag.Gt
            };
            if (lower === undefined ||
                candidate.value > lower.value ||
                (candidate.value === lower.value && candidate.exclusive)) {
                lower = candidate;
            }
        }
    }
    return lower;
}

function readNumberUpper(checks: readonly NumberCheck[]): NumericBound | undefined {
    let upper: NumericBound | undefined;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        if (check.tag === NumberCheckTag.Lte || check.tag === NumberCheckTag.Lt) {
            const candidate = {
                value: check.value,
                exclusive: check.tag === NumberCheckTag.Lt
            };
            if (upper === undefined ||
                candidate.value < upper.value ||
                (candidate.value === upper.value && candidate.exclusive)) {
                upper = candidate;
            }
        }
    }
    return upper;
}

function readNumberMultiple(checks: readonly NumberCheck[]): number | undefined {
    for (let index = checks.length - 1; index >= 0; index -= 1) {
        const check = checks[index];
        if (check?.tag === NumberCheckTag.MultipleOf) {
            return check.value;
        }
    }
    return undefined;
}

function violatesUpper(value: number, upper: number, exclusive: boolean): boolean {
    return value > upper || (exclusive && value === upper);
}

function readBigIntLower(checks: readonly BigIntCheck[]): BigIntBound | undefined {
    let lower: BigIntBound | undefined;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        if (check.tag === BigIntCheckTag.Gte || check.tag === BigIntCheckTag.Gt) {
            const candidate = {
                value: check.value,
                exclusive: check.tag === BigIntCheckTag.Gt
            };
            if (lower === undefined ||
                candidate.value > lower.value ||
                (candidate.value === lower.value && candidate.exclusive)) {
                lower = candidate;
            }
        }
    }
    return lower;
}

function readBigIntUpper(checks: readonly BigIntCheck[]): BigIntBound | undefined {
    let upper: BigIntBound | undefined;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        if (check.tag === BigIntCheckTag.Lte || check.tag === BigIntCheckTag.Lt) {
            const candidate = {
                value: check.value,
                exclusive: check.tag === BigIntCheckTag.Lt
            };
            if (upper === undefined ||
                candidate.value < upper.value ||
                (candidate.value === upper.value && candidate.exclusive)) {
                upper = candidate;
            }
        }
    }
    return upper;
}

function readBigIntMultiple(checks: readonly BigIntCheck[]): bigint | undefined {
    for (let index = checks.length - 1; index >= 0; index -= 1) {
        const check = checks[index];
        if (check?.tag === BigIntCheckTag.MultipleOf) {
            return check.value;
        }
    }
    return undefined;
}

function readDateLower(checks: readonly DateCheck[]): number | undefined {
    let lower: number | undefined;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check?.tag === DateCheckTag.Min) {
            lower = lower === undefined ? check.value : Math.max(lower, check.value);
        }
    }
    return lower;
}

function readDateUpper(checks: readonly DateCheck[]): number | undefined {
    let upper: number | undefined;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check?.tag === DateCheckTag.Max) {
            upper = upper === undefined ? check.value : Math.min(upper, check.value);
        }
    }
    return upper;
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

function readConstructorPrototype(
    constructor: abstract new (...args: never[]) => unknown
): object | null {
    const source = constructor as unknown as Readonly<Record<"prototype", unknown>>;
    const prototype = source.prototype;
    return typeof prototype === "object" && prototype !== null
        ? prototype
        : Object.prototype;
}

function isMutableRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
