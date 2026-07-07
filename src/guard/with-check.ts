/**
 * @file with-check.ts
 * @brief Zod-style callback refinement execution.
 * @details `guard.with()` accepts a payload object with an issue sink. This file
 * keeps that compatibility layer separate from the older `superRefine` context
 * API while sharing the same issue normalization code.
 */

import type { RefinementIssue } from "../schema/index.js";
import type {
    Guard,
    Presence,
    SuperRefineIssueInput,
    WithCheckCallback,
    WithCheckInput,
    WithCheckIssueSink,
    WithCheckPayload,
    WithCheckSource
} from "./types.js";
import { readSuperRefineIssue } from "./super-refine.js";

const sourceCallbacks = new WeakMap<object, unknown>();
const sourceAppliers = new WeakMap<object, unknown>();

export interface WithCheckSourceOptions {
    readonly apply?: (source: Guard<unknown, Presence>) => unknown;
    readonly zodDef?: Readonly<Record<string, unknown>>;
}

/**
 * @brief Create a reusable Zod-style semantic check source.
 * @param callback Callback receiving `{ value, issues }`.
 * @returns Frozen source accepted by `guard.with()`.
 */
export function createWithCheckSource<TValue>(
    callback: WithCheckCallback<TValue>
): WithCheckSource<TValue> {
    return registerWithCheckSource({}, callback);
}

/**
 * @brief Register an existing object as a reusable check source.
 * @param source Object or function receiving the check-source identity.
 * @param callback Validation callback used by `guard.with(source)`.
 * @param options Optional schema applier and Zod-style metadata.
 * @returns Frozen source carrying the TypeSea check identity.
 */
export function registerWithCheckSource<
    TValue,
    TSource extends object
>(
    source: TSource,
    callback: WithCheckCallback<TValue>,
    options?: WithCheckSourceOptions
): TSource & WithCheckSource<TValue> {
    if (typeof callback !== "function") {
        throw new TypeError("check callback must be a function");
    }
    sourceCallbacks.set(source, callback);
    if (options?.apply !== undefined) {
        sourceAppliers.set(source, options.apply);
    }
    if (options?.zodDef !== undefined) {
        Object.defineProperty(source, "_zod", {
            configurable: false,
            enumerable: false,
            value: Object.freeze({
                def: Object.freeze({
                    ...options.zodDef
                })
            }),
            writable: false
        });
    }
    return Object.freeze(source) as TSource & WithCheckSource<TValue>;
}

/**
 * @brief Test whether a value is a registered check source.
 * @param value Candidate value.
 * @returns True when TypeSea registered the identity in the source table.
 */
export function isWithCheckSource(value: unknown): value is WithCheckSource {
    return isObjectLike(value) && sourceCallbacks.has(value);
}

/**
 * @brief Apply a registered source to a guard when it has schema-transform behavior.
 * @param source Registered source passed to `guard.check(source)`.
 * @param guard Guard receiving the source.
 * @returns Applied guard/decoder when the source has an applier, otherwise undefined.
 */
export function applyWithCheckSource(
    source: WithCheckSource,
    guard: Guard<unknown, Presence>
): unknown {
    const applier = sourceAppliers.get(source);
    if (isSourceApplier(applier)) {
        return applier(guard);
    }
    if (typeof source === "function") {
        const callable = source as unknown as (value: Guard<unknown, Presence>) => unknown;
        return callable(guard);
    }
    return undefined;
}

/**
 * @brief Normalize `guard.with()` inputs into callbacks.
 * @param checks Callback functions or sources created by `t.check()`.
 * @returns Copied callback vector.
 */
export function readWithCheckInputs<TValue>(
    checks: readonly WithCheckInput[]
): readonly WithCheckCallback<TValue>[] {
    const callbacks = new Array<WithCheckCallback<TValue>>(checks.length);
    for (let index = 0; index < checks.length; index += 1) {
        callbacks[index] = readWithCheckInput(checks[index]);
    }
    return callbacks;
}

/**
 * @brief Read one callback or registered check source.
 * @param check Candidate `with()` argument.
 * @returns Callback stored by the source registry or the direct callback.
 */
function readWithCheckInput<TValue>(
    check: WithCheckInput<TValue> | undefined
): WithCheckCallback<TValue> {
    if (isObjectLike(check)) {
        const callback = sourceCallbacks.get(check);
        if (typeof callback === "function") {
            return callback as WithCheckCallback<TValue>;
        }
    }
    if (typeof check === "function") {
        return check;
    }
    throw new TypeError("with input must be a function or TypeSea check source");
}

/**
 * @brief Execute Zod-style callbacks as a boolean predicate.
 * @param callbacks User callbacks attached by `guard.with()`.
 * @param value Value accepted by the inner schema.
 * @returns True when no callback pushed an issue.
 */
export function runWithChecks<TValue>(
    callbacks: readonly WithCheckCallback<TValue>[],
    value: TValue
): boolean {
    let count = 0;
    const issues: WithCheckIssueSink = {
        get length(): number {
            return count;
        },
        push: (...items: (SuperRefineIssueInput | undefined)[]): number => {
            for (let index = 0; index < items.length; index += 1) {
                readSuperRefineIssue(items[index]);
                count += 1;
            }
            return count;
        }
    };
    const payload: WithCheckPayload<TValue> = {
        value,
        issues
    };
    for (const callback of callbacks) {
        callback(payload);
    }
    return count === 0;
}

/**
 * @brief Execute Zod-style callbacks and collect diagnostic issues.
 * @param callbacks User callbacks attached by `guard.with()`.
 * @param value Value accepted by the inner schema.
 * @returns Relative issues, or undefined when all callbacks accept.
 */
export function collectWithCheckIssues<TValue>(
    callbacks: readonly WithCheckCallback<TValue>[],
    value: TValue
): readonly RefinementIssue[] | undefined {
    const collected: RefinementIssue[] = [];
    const issues: WithCheckIssueSink = {
        get length(): number {
            return collected.length;
        },
        push: (...items: (SuperRefineIssueInput | undefined)[]): number => {
            for (let index = 0; index < items.length; index += 1) {
                collected.push(readSuperRefineIssue(items[index]));
            }
            return collected.length;
        }
    };
    const payload: WithCheckPayload<TValue> = {
        value,
        issues
    };
    for (const callback of callbacks) {
        callback(payload);
    }
    return collected.length === 0 ? undefined : collected;
}

/**
 * @brief Check object or function identity.
 */
function isObjectLike(value: unknown): value is object {
    return (typeof value === "object" && value !== null) ||
        typeof value === "function";
}

/**
 * @brief Check for a registered source applier function.
 */
function isSourceApplier(
    value: unknown
): value is (guard: Guard<unknown, Presence>) => unknown {
    return typeof value === "function";
}
