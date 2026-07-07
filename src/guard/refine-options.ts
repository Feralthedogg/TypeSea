/**
 * @file refine-options.ts
 * @brief Runtime normalization for boolean refinement options.
 * @details The parser keeps legacy string labels and Zod-style option objects
 * on one internal representation.
 */

import type { PathSegment } from "../issue/index.js";
import type {
    RefineParams,
    RefineWhenPayload,
    RefineWhenPredicate
} from "./types.js";

const EMPTY_PATH: readonly PathSegment[] = Object.freeze([]);

export interface NormalizedRefineOptions {
    readonly name: string;
    readonly path: readonly PathSegment[];
    readonly message: string | undefined;
    readonly abort: boolean;
    readonly when: RefineWhenPredicate | undefined;
}

/**
 * @brief Normalize the second argument accepted by boolean refinements.
 * @param value Legacy label string or option object.
 * @returns Immutable options consumed by schema builders.
 * @throws TypeError when option fields have invalid runtime types.
 */
export function readRefineOptions<TValue>(
    value: RefineParams<TValue> | undefined
): NormalizedRefineOptions {
    if (value === undefined) {
        return Object.freeze({
            name: "refinement",
            path: EMPTY_PATH,
            message: undefined,
            abort: false,
            when: undefined
        });
    }
    if (typeof value === "string") {
        return Object.freeze({
            name: value,
            path: EMPTY_PATH,
            message: undefined,
            abort: false,
            when: undefined
        });
    }
    if (!isRecord(value)) {
        throw new TypeError("refinement options must be a string or object");
    }
    const error = readOptionalString(value["error"], "refinement error");
    const path = readOptionalPath(value["path"], "refinement path");
    const abort = readOptionalBoolean(value["abort"], "refinement abort");
    const rawWhen = readOptionalWhen<TValue>(value["when"], "refinement when");
    const when: RefineWhenPredicate | undefined = rawWhen === undefined
        ? undefined
        : (payload: RefineWhenPayload): boolean =>
            rawWhen(payload as RefineWhenPayload<TValue>);
    return Object.freeze({
        name: error ?? "refinement",
        path,
        message: error,
        abort,
        when
    });
}

/**
 * @brief Validate an optional string option.
 * @param value Candidate field value.
 * @param label Field label used in diagnostics.
 * @returns String field or undefined.
 */
function readOptionalString(value: unknown, label: string): string | undefined {
    if (value === undefined || typeof value === "string") {
        return value;
    }
    throw new TypeError(`${label} must be a string`);
}

/**
 * @brief Validate an optional boolean option.
 * @param value Candidate field value.
 * @param label Field label used in diagnostics.
 * @returns Boolean field with false as the omitted value.
 */
function readOptionalBoolean(value: unknown, label: string): boolean {
    if (value === undefined) {
        return false;
    }
    if (typeof value === "boolean") {
        return value;
    }
    throw new TypeError(`${label} must be a boolean`);
}

/**
 * @brief Validate an optional refinement execution predicate.
 * @param value Candidate field value.
 * @param label Field label used in diagnostics.
 * @returns Function field or undefined.
 */
function readOptionalWhen<TValue>(
    value: unknown,
    label: string
): RefineWhenPredicate<TValue> | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value === "function") {
        return value as RefineWhenPredicate<TValue>;
    }
    throw new TypeError(`${label} must be a function`);
}

/**
 * @brief Copy a relative diagnostic path.
 * @param value Candidate path field.
 * @param label Field label used in diagnostics.
 * @returns Frozen empty path or copied path.
 */
function readOptionalPath(value: unknown, label: string): readonly PathSegment[] {
    if (value === undefined) {
        return EMPTY_PATH;
    }
    if (!Array.isArray(value)) {
        throw new TypeError(`${label} must be an array`);
    }
    const path = value as readonly unknown[];
    if (path.length === 0) {
        return EMPTY_PATH;
    }
    const copied = new Array<PathSegment>(path.length);
    for (let index = 0; index < path.length; index += 1) {
        const segment = path[index];
        if (typeof segment === "string") {
            copied[index] = segment;
            continue;
        }
        if (typeof segment === "number" &&
            Number.isInteger(segment) &&
            segment >= 0) {
            copied[index] = segment;
            continue;
        }
        throw new TypeError(`${label} segment must be a string or non-negative integer`);
    }
    return Object.freeze(copied);
}

/**
 * @brief Check whether a value can carry named fields.
 * @param value Candidate options value.
 * @returns True for non-null non-array objects.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
