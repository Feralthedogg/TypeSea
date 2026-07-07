/**
 * @file v3.ts
 * @brief Zod v3-shaped compatibility subpath.
 * @details This facade keeps package-alias migrations from failing when code
 * imports `zod/v3`. Runtime validation still uses TypeSea's guard engine.
 */

import * as zodFacade from "./zod.js";
import { object as objectBuilder } from "./builders/object/index.js";
import type { BaseGuard } from "./guard/index.js";

export * from "./zod.js";

export { $brand as BRAND } from "./zod-compat.js";
export { ZodSchema as Schema } from "./index.js";
export { EnumGuard as ZodNativeEnum } from "./index.js";
export { BaseDecoder as ZodTransformer } from "./index.js";

export const EMPTY_PATH: readonly [] = Object.freeze([]);

export const ZodParsedType = Object.freeze({
    string: "string",
    nan: "nan",
    number: "number",
    integer: "integer",
    float: "float",
    boolean: "boolean",
    date: "date",
    bigint: "bigint",
    symbol: "symbol",
    function: "function",
    undefined: "undefined",
    null: "null",
    array: "array",
    object: "object",
    unknown: "unknown",
    promise: "promise",
    void: "void",
    never: "never",
    map: "map",
    set: "set"
});

export const INVALID = Object.freeze({ status: "aborted" });

export function OK<TValue>(value: TValue): Readonly<{
    readonly status: "valid";
    readonly value: TValue;
}> {
    return Object.freeze({ status: "valid", value });
}

export function DIRTY<TValue>(value: TValue): Readonly<{
    readonly status: "dirty";
    readonly value: TValue;
}> {
    return Object.freeze({ status: "dirty", value });
}

export class ParseStatus {
    public value: "valid" | "dirty" | "aborted" = "valid";

    public dirty(): void {
        if (this.value === "valid") {
            this.value = "dirty";
        }
    }

    public abort(): void {
        this.value = "aborted";
    }

    public static mergeArray(
        status: ParseStatus,
        results: readonly unknown[]
    ): Readonly<{
        readonly status: "valid" | "dirty" | "aborted";
        readonly value: readonly unknown[];
    }> {
        return Object.freeze({
            status: status.value,
            value: Object.freeze(results.slice())
        });
    }

    public static mergeObjectSync(
        status: ParseStatus,
        pairs: readonly unknown[]
    ): Readonly<{
        readonly status: "valid" | "dirty" | "aborted";
        readonly value: readonly unknown[];
    }> {
        return ParseStatus.mergeArray(status, pairs);
    }
}

export function isValid(
    result: unknown
): boolean {
    return readStatus(result) === "valid";
}

export function isDirty(
    result: unknown
): boolean {
    return readStatus(result) === "dirty";
}

export function isAborted(
    result: unknown
): boolean {
    return readStatus(result) === "aborted";
}

export function isAsync(
    value: unknown
): boolean {
    return value instanceof Promise;
}

export function getParsedType(value: unknown): string {
    if (typeof value === "string") {
        return ZodParsedType.string;
    }
    if (typeof value === "number") {
        return Number.isNaN(value) ? ZodParsedType.nan : ZodParsedType.number;
    }
    if (typeof value === "boolean") {
        return ZodParsedType.boolean;
    }
    if (typeof value === "bigint") {
        return ZodParsedType.bigint;
    }
    if (typeof value === "symbol") {
        return ZodParsedType.symbol;
    }
    if (typeof value === "function") {
        return ZodParsedType.function;
    }
    if (value === undefined) {
        return ZodParsedType.undefined;
    }
    if (value === null) {
        return ZodParsedType.null;
    }
    if (Array.isArray(value)) {
        return ZodParsedType.array;
    }
    if (value instanceof Date) {
        return ZodParsedType.date;
    }
    if (value instanceof Map) {
        return ZodParsedType.map;
    }
    if (value instanceof Set) {
        return ZodParsedType.set;
    }
    return ZodParsedType.object;
}

export function defaultErrorMap(): Readonly<{
    readonly message: string;
}> {
    return Object.freeze({ message: "Invalid input" });
}

export function makeIssue(issue: unknown): unknown {
    return issue;
}

export function addIssueToContext(
    context: unknown,
    issue: unknown
): void {
    if (!isIssueContext(context)) {
        return;
    }
    context.common.issues.push(issue);
}

export function quotelessJson(value: unknown): string {
    return JSON.stringify(value);
}

export function datetimeRegex(
    options: Readonly<{
        readonly offset?: boolean;
        readonly local?: boolean;
    }> = Object.freeze({})
): RegExp {
    const zone = options.local === true
        ? "(Z)?"
        : "Z";
    const offset = options.offset === true
        ? "|([+-]\\d{2}:?\\d{2})"
        : "";
    return new RegExp(
        `^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:${zone}${offset})$`
    );
}

export const objectUtil = Object.freeze({
    mergeShapes<TLeft extends object, TRight extends object>(
        left: TLeft,
        right: TRight
    ): TLeft & TRight {
        return Object.freeze({
            ...left,
            ...right
        });
    }
});

export const late = Object.freeze({
    object: objectBuilder
});

export const ostring = (): BaseGuard<string, "optional"> =>
    zodFacade.string().optional();

export const onumber = (): BaseGuard<number, "optional"> =>
    zodFacade.number().optional();

export const oboolean = (): BaseGuard<boolean, "optional"> =>
    zodFacade.boolean().optional();

export const effect = zodFacade.transform;
export const transformer = zodFacade.transform;
export const pipeline = zodFacade.pipe;

const v3Default: Readonly<Record<string, unknown>> = Object.freeze({
    ...zodFacade,
    BRAND: zodFacade.$brand,
    DIRTY,
    EMPTY_PATH,
    INVALID,
    OK,
    ParseStatus,
    Schema: zodFacade.ZodSchema,
    ZodNativeEnum: zodFacade.ZodEnum,
    ZodParsedType,
    ZodTransformer: zodFacade.BaseDecoder,
    addIssueToContext,
    datetimeRegex,
    defaultErrorMap,
    effect,
    getParsedType,
    isAborted,
    isAsync,
    isDirty,
    isValid,
    late,
    makeIssue,
    objectUtil,
    oboolean,
    onumber,
    ostring,
    pipeline,
    quotelessJson,
    transformer
});

export default v3Default;

function readStatus(value: unknown): string | undefined {
    if (!isRecord(value)) {
        return undefined;
    }
    const status = value["status"];
    return typeof status === "string" ? status : undefined;
}

function isIssueContext(value: unknown): value is {
    readonly common: {
        readonly issues: unknown[];
    };
} {
    if (!isRecord(value) || !isRecord(value["common"])) {
        return false;
    }
    return Array.isArray(value["common"]["issues"]);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
