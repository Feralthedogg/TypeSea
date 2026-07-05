/**
 * @file compile-runtime.ts
 * @brief Runtime support passed into generated validator factories.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 *
 * @section side_tables Side-table ABI
 * Generated validators receive literals, regexps, keysets, strings, and
 * dynamic schema fallbacks as indexed tables. The emitted source contains only
 * numeric table slots and compact helper names.
 */

import { checkSchema, isSchema } from "../evaluate/index.js";
import type { CheckResult, Issue, PathSegment } from "../issue/index.js";
import type { LiteralValue, Schema } from "../schema/index.js";

/**
 * @brief Allocation-lean validator root generated for `is` calls.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param value Candidate runtime value.
 * @returns True when the generated predicate accepts the value.
 */
export type BooleanPredicate = (value: unknown) => boolean;

/**
 * @brief Diagnostic collector generated for `check` calls.
 * @details Generated collectors return undefined for the successful fast path.
 * Hand-written collectors still have to return an issue array and are validated
 * before publication.
 * @param value Candidate runtime value.
 * @returns Undefined on success, otherwise the collected validation issues.
 */
export type IssueCollectorRoot = (value: unknown) => readonly Issue[] | undefined;

/**
 * @brief Result-producing wrapper generated beside every compiled predicate.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param value Candidate runtime value.
 * @returns TypeSea check result carrying the accepted value or issue list.
 */
export type CheckResultRoot = (value: unknown) => CheckResult<unknown>;

/**
 * @brief Boolean fallback for schemas that cannot be fully lowered.
 * @details Generated code stores only a schema table index. The helper keeps
 * recursive and user-refined branches out of the emitted source while retaining
 * the same boolean contract as the interpreter.
 * @param schemaIndex Slot in the side table supplied to the factory.
 * @param value Candidate value for that schema.
 * @returns True when the fallback schema accepts the value.
 */
export type DynamicCheck = (schemaIndex: number, value: unknown) => boolean;

/**
 * @brief Diagnostic fallback for non-lowered schema fragments.
 * @details The generated collector delegates here only at opaque graph leaves.
 * Nested issues are copied into the caller-owned buffer so the outer generated
 * path prefix remains in control.
 * @param schemaIndex Slot in the side table supplied to the factory.
 * @param value Candidate value for that schema.
 * @param path Path prefix owned by the generated collector.
 * @param issues Mutable issue buffer owned by the caller.
 */
export type DynamicIssueCheck = (
    schemaIndex: number,
    value: unknown,
    path: readonly PathSegment[],
    issues: Issue[]
) => void;

/**
 * @brief First-fault fallback for non-lowered schema fragments.
 * @details Opaque lazy and refine schemas use the interpreter for correctness,
 * then return only the first nested issue under the generated path prefix.
 * @param schemaIndex Slot in the side table supplied to the factory.
 * @param value Candidate value for that schema.
 * @param path Path prefix owned by the generated collector.
 * @returns First nested issue, or undefined when the fallback accepts the value.
 */
export type DynamicFirstIssueCheck = (
    schemaIndex: number,
    value: unknown,
    path: readonly PathSegment[]
) => Issue | undefined;

/**
 * @brief Runtime helper for strict-object excess key validation.
 * @details Code generation can choose safe or fast property access strategies,
 * but strict key counting remains centralized so the emitted source uses a
 * compact ABI.
 * @param value Candidate object.
 * @param keys Allowed string keys for the strict schema.
 * @returns True when no extra own string key is present.
 */
export type StrictKeysCheck = (
    value: unknown,
    keys: readonly string[]
) => boolean;

/**
 * @brief Published validator entry points returned by a compiled factory.
 * @details The three functions share side tables and generated helper code but
 * expose the distinct public contracts used by Guard methods.
 */
export interface RuntimeBundle {
    readonly is: BooleanPredicate;
    readonly check: IssueCollectorRoot;
    readonly result: CheckResultRoot;
    readonly first: CheckResultRoot;
}

/**
 * @brief Factory signature consumed by `new Function` compiled modules.
 * @details Generated source is pure JavaScript text. All runtime objects that
 * should not be serialized into source travel through these side tables, which
 * keeps emitted code small and friendly to V8 inline caches.
 * @param literals Literal constants referenced by emitted predicates.
 * @param regexps Precompiled regular expressions for string constraints.
 * @param keysets Strict-object key tables.
 * @param strings Shared string constants used by generated diagnostics.
 * @param dynamicCheck Boolean fallback for opaque schema fragments.
 * @param dynamicIssueCheck Diagnostic fallback for opaque schema fragments.
 * @param strictKeys Shared strict-object excess key helper.
 * @returns Runtime bundle exposed by the compiled guard.
 */
export type IsFactory = (
    literals: readonly LiteralValue[],
    regexps: readonly RegExp[],
    keysets: readonly (readonly string[])[],
    strings: readonly string[],
    dynamicCheck: DynamicCheck,
    dynamicIssueCheck: DynamicIssueCheck,
    dynamicFirstIssueCheck: DynamicFirstIssueCheck,
    strictKeys: StrictKeysCheck
) => RuntimeBundle;

/**
 * @brief Build the boolean fallback table reader for generated validators.
 * @details Missing table slots fail closed. That preserves the security
 * invariant that malformed generated code cannot accidentally accept a value by
 * indexing outside the schema side table.
 * @param schemas Schema side table captured by the compiled guard.
 * @returns Boolean fallback callback used by emitted predicates.
 */
export function makeDynamicCheck(schemas: readonly Schema[]): DynamicCheck {
    return (schemaIndex: number, value: unknown): boolean => {
        const schema = schemas[schemaIndex];
        return schema !== undefined && isSchema(schema, value);
    };
}

/**
 * @brief Build the diagnostic fallback table reader for generated validators.
 * @details Nested interpreter issues are re-rooted under the path supplied by
 * generated code. This lets compiled object and array checks delegate complex
 * children without losing exact issue locations.
 * @param schemas Schema side table captured by the compiled guard.
 * @returns Issue fallback callback used by emitted collectors.
 */
export function makeDynamicIssueCheck(
    schemas: readonly Schema[]
): DynamicIssueCheck {
    return (
        schemaIndex: number,
        value: unknown,
        path: readonly PathSegment[],
        issues: Issue[]
    ): void => {
        const schema = schemas[schemaIndex];
        if (schema === undefined) {
            return;
        }
        const result = checkSchema<unknown>(schema, value);
        if (result.ok) {
            return;
        }
        const nested = result.error;
        for (let index = 0; index < nested.length; index += 1) {
            const issue = nested[index];
            if (issue !== undefined) {
                const nestedPath = Object.freeze(path.concat(issue.path));
                issues.push(Object.freeze({
                    path: nestedPath,
                    code: issue.code,
                    expected: issue.expected,
                    actual: issue.actual,
                    message: issue.message
                }));
            }
        }
    };
}

/**
 * @brief Build the first-fault fallback table reader for generated validators.
 * @details This path is entered only for opaque schema fragments that codegen
 * cannot inline. The nested interpreter result is re-rooted once and returned.
 * @param schemas Schema side table captured by the compiled guard.
 * @returns First-issue fallback callback used by emitted collectors.
 */
export function makeDynamicFirstIssueCheck(
    schemas: readonly Schema[]
): DynamicFirstIssueCheck {
    return (
        schemaIndex: number,
        value: unknown,
        path: readonly PathSegment[]
    ): Issue | undefined => {
        const schema = schemas[schemaIndex];
        if (schema === undefined) {
            return undefined;
        }
        const result = checkSchema<unknown>(schema, value);
        if (result.ok) {
            return undefined;
        }
        const issue = result.error[0];
        if (issue === undefined) {
            return undefined;
        }
        const nestedPath = Object.freeze(path.concat(issue.path));
        return Object.freeze({
            path: nestedPath,
            code: issue.code,
            expected: issue.expected,
            actual: issue.actual,
            message: issue.message
        });
    };
}

/**
 * @brief Safe strict-object key membership helper for generated validators.
 * @details The default compiled mode uses Reflect.ownKeys so symbol and
 * non-enumerable extras are rejected as strictly as the interpreter. Unsafe
 * modes may emit a cheaper loop, but this helper remains the conservative ABI.
 * @param value Candidate object value.
 * @param keys Allowed string keys for the strict object schema.
 * @returns True when every own key belongs to the schema key set.
 */
export function strictKeys(
    value: unknown,
    keys: readonly string[]
): boolean {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const present = Reflect.ownKeys(value);
    for (let index = 0; index < present.length; index += 1) {
        const key = present[index];
        if (typeof key !== "string" || !keys.includes(key)) {
            return false;
        }
    }
    return true;
}
