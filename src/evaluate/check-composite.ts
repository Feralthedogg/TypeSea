/**
 * @file check-composite.ts
 * @brief Composite diagnostic schema interpreters.
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
 */

import {
    ObjectModeTag,
    PresenceTag,
    SchemaTag
} from "../kind/index.js";
import type { Issue, PathSegment } from "../issue/index.js";
import type {
    DiscriminatedUnionCase,
    Schema
} from "../schema/index.js";
import { schemaCanAcceptUndefined } from "../schema/index.js";
import { pushIssue } from "./issue.js";
import {
    actualType,
    findDiscriminatedUnionCase,
    hasObjectKey,
    isArrayIndexKey,
    isDataPropertyDescriptor,
    isPlainRecord,
    isStrictTrue,
    literalToExpected,
    readOwnDataProperty,
    type DataPropertyDescriptor
} from "./shared.js";
import type { ValidationState } from "./state.js";

/**
 * @brief issue collector.
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
 */
export type IssueCollector = (
    schema: Schema,
    value: unknown,
    path: PathSegment[],
    issues: Issue[],
    state: ValidationState
) => void;

/**
 * @brief collect array issues.
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
 * @param item Schema applied to each logical array slot.
 * @param value Candidate value supplied by the caller.
 * @param path Mutable path stack reused by the diagnostic walker.
 * @param issues Output issue buffer.
 * @param state Shared recursion and cycle state.
 * @param collectChild Dispatcher for nested schema diagnostics.
 * @post Every pushed path segment is popped before return.
 */
export function collectArrayIssues(
    item: Schema,
    value: unknown,
    path: PathSegment[],
    issues: Issue[],
    state: ValidationState,
    collectChild: IssueCollector
): void {
    if (!Array.isArray(value)) {
        pushIssue(path, issues, "expected_array", "array", actualType(value));
        return;
    }
    if (schemaCanAcceptUndefined(item)) {
        /*
         * A sparse hole is observationally undefined for this item schema. Walking
         * present descriptors keeps huge sparse inputs proportional to stored
         * slots while preserving accessor rejection.
         */
        collectPresentArrayIssues(item, value, path, issues, state, collectChild);
        return;
    }
    /*
     * When undefined is not valid, each missing descriptor is a real validation
     * failure. The length loop keeps diagnostics tied to the failing index.
     */
    for (let index = 0; index < value.length; index += 1) {
        const itemProperty = readArrayIndexDataProperty(value, index);
        path.push(index);
        if (itemProperty === null) {
            pushIssue(path, issues, "expected_array", "data property", "accessor");
        } else {
            collectChild(
                item,
                itemProperty === undefined ? undefined : itemProperty.value,
                path,
                issues,
                state
            );
        }
        path.pop();
    }
}

/**
 * @brief collect present array issues.
 * @details Holes are equivalent to `undefined` when the item schema accepts it,
 * so only actual own index slots need descriptor checks and child validation.
 * @param item Schema applied to each present own index.
 * @param value Array already proven by the caller.
 * @param path Mutable path stack reused by the diagnostic walker.
 * @param issues Output issue buffer.
 * @param state Shared recursion and cycle state.
 * @param collectChild Dispatcher for nested schema diagnostics.
 * @post Non-index own properties are ignored to match normal array iteration.
 */
function collectPresentArrayIssues(
    item: Schema,
    value: readonly unknown[],
    path: PathSegment[],
    issues: Issue[],
    state: ValidationState,
    collectChild: IssueCollector
): void {
    const keys = Object.getOwnPropertyNames(value);
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
        const key = keys[keyIndex];
        if (key === undefined || !isArrayIndexKey(key, value.length)) {
            continue;
        }
        /*
         * Descriptor lookup is still mandatory on present indexes. It blocks
         * getter-backed slots without invoking user code during validation.
         */
        const itemProperty = readArrayKeyDataProperty(value, key);
        if (itemProperty === undefined) {
            continue;
        }
        const index = Number(key);
        path.push(index);
        if (itemProperty === null) {
            pushIssue(path, issues, "expected_array", "data property", "accessor");
        } else {
            collectChild(item, itemProperty.value, path, issues, state);
        }
        path.pop();
    }
}

/**
 * @brief collect tuple issues.
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
 * @param items Tuple item schemas.
 * @param value Candidate runtime value.
 * @param path Mutable path stack reused by the diagnostic walker.
 * @param issues Output issue buffer.
 * @param state Shared recursion and cycle state.
 * @param collectChild Dispatcher for nested schema diagnostics.
 * @post Every pushed tuple index is popped before return.
 */
export function collectTupleIssues(
    items: readonly Schema[],
    value: unknown,
    path: PathSegment[],
    issues: Issue[],
    state: ValidationState,
    collectChild: IssueCollector
): void {
    if (!Array.isArray(value)) {
        pushIssue(path, issues, "expected_tuple", "tuple", actualType(value));
        return;
    }
    if (value.length !== items.length) {
        pushIssue(
            path,
            issues,
            "expected_tuple_length",
            `length ${String(items.length)}`,
            `length ${String(value.length)}`
        );
    }
    const count = value.length < items.length ? value.length : items.length;
    /*
     * Length mismatch is reported once, then overlapping indexes are still
     * diagnosed so callers get useful nested errors for present slots.
     */
    for (let index = 0; index < count; index += 1) {
        const item = items[index];
        if (item === undefined) {
            continue;
        }
        const itemValue = readArrayIndexDataProperty(value, index);
        path.push(index);
        if (itemValue === null) {
            pushIssue(path, issues, "expected_tuple", "data property", "accessor");
        } else {
            collectChild(
                item,
                itemValue === undefined ? undefined : itemValue.value,
                path,
                issues,
                state
            );
        }
        path.pop();
    }
}

/**
 * @brief Read one array index for diagnostic collection.
 * @details Reads an array element through its descriptor so validation does not execute getters.
 * @param value Array being inspected.
 * @param index Numeric array index.
 * @returns Data descriptor for elements, undefined for holes, and null for accessors.
 */
function readArrayIndexDataProperty(
    value: readonly unknown[],
    index: number
): DataPropertyDescriptor | null | undefined {
    return readArrayKeyDataProperty(value, String(index));
}

/**
 * @brief Read one canonical array index key for diagnostic collection.
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
 * @param value Array being inspected.
 * @param key Canonical array index key.
 * @returns Data descriptor for elements, undefined for holes, and null for accessors.
 */
function readArrayKeyDataProperty(
    value: readonly unknown[],
    key: string
): DataPropertyDescriptor | null | undefined {
    const descriptor = Object.getOwnPropertyDescriptor(
        value,
        key
    );
    if (descriptor === undefined) {
        return undefined;
    }
    if (!isDataPropertyDescriptor(descriptor)) {
        return null;
    }
    return descriptor;
}

/**
 * @brief collect record issues.
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
 * @param item Schema applied to each own enumerable record value.
 * @param value Candidate runtime value.
 * @param path Mutable path stack reused by the diagnostic walker.
 * @param issues Output issue buffer.
 * @param state Shared recursion and cycle state.
 * @param collectChild Dispatcher for nested schema diagnostics.
 * @post Every pushed record key is popped before return.
 */
export function collectRecordIssues(
    item: Schema,
    value: unknown,
    path: PathSegment[],
    issues: Issue[],
    state: ValidationState,
    collectChild: IssueCollector
): void {
    if (!isPlainRecord(value)) {
        pushIssue(path, issues, "expected_record", "record", actualType(value));
        return;
    }
    const keys = Object.keys(value);
    /*
     * Records intentionally validate enumerable own string keys. Symbols and
     * non-enumerable slots are outside record value semantics.
     */
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined) {
            continue;
        }
        const property = readOwnDataProperty(value, key);
        path.push(key);
        if (property === undefined) {
            pushIssue(path, issues, "expected_record", "data property", "accessor or missing");
        } else {
            collectChild(item, property.value, path, issues, state);
        }
        path.pop();
    }
}

/**
 * @brief collect object issues.
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
 * @param schema Object schema with entries and object mode.
 * @param value Candidate runtime value.
 * @param path Mutable path stack reused by the diagnostic walker.
 * @param issues Output issue buffer.
 * @param state Shared recursion and cycle state.
 * @param collectChild Dispatcher for nested schema diagnostics.
 * @post Every pushed object key is popped before return.
 */
export function collectObjectIssues(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    value: unknown,
    path: PathSegment[],
    issues: Issue[],
    state: ValidationState,
    collectChild: IssueCollector
): void {
    if (!isPlainRecord(value)) {
        pushIssue(path, issues, "expected_object", "object", actualType(value));
        return;
    }
    const record = value;
    const entries = schema.entries;
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
            continue;
        }
        const property = readOwnDataProperty(record, entry.key);
        path.push(entry.key);
        if (property === undefined) {
            if (
                entry.presence === PresenceTag.Optional &&
                !Object.prototype.hasOwnProperty.call(record, entry.key)
            ) {
                /*
                 * Missing optional key is valid. An own accessor at the same key
                 * is not valid because readOwnDataProperty would have returned
                 * undefined while hasOwnProperty remains true.
                 */
                path.pop();
                continue;
            }
            if (entry.presence === PresenceTag.Required) {
                pushIssue(path, issues, "expected_required_key", "present key", "missing");
            } else {
                pushIssue(path, issues, "expected_object", "data property", "accessor");
            }
            path.pop();
            continue;
        }
        collectChild(entry.schema, property.value, path, issues, state);
        path.pop();
    }
    if (schema.mode === ObjectModeTag.Strict) {
        /*
         * Strict objects reject symbol and non-enumerable extras as well, so
         * Reflect.ownKeys is required instead of Object.keys.
         */
        const keys = Reflect.ownKeys(record);
        for (let index = 0; index < keys.length; index += 1) {
            const key = keys[index];
            if (key !== undefined &&
                (typeof key !== "string" || !hasObjectKey(schema.keyLookup, key))) {
                path.push(typeof key === "string" ? key : String(key));
                pushIssue(path, issues, "unrecognized_key", "known key", "extra key");
                path.pop();
            }
        }
    }
}

/**
 * @brief collect discriminated union issues.
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
 * @param key Discriminant property key.
 * @param cases Closed discriminated union cases.
 * @param value Candidate runtime value.
 * @param path Mutable path stack reused by the diagnostic walker.
 * @param issues Output issue buffer.
 * @param state Shared recursion and cycle state.
 * @param collectChild Dispatcher for nested schema diagnostics.
 */
export function collectDiscriminatedUnionIssues(
    key: string,
    cases: readonly DiscriminatedUnionCase[],
    value: unknown,
    path: PathSegment[],
    issues: Issue[],
    state: ValidationState,
    collectChild: IssueCollector
): void {
    if (!isPlainRecord(value)) {
        pushIssue(path, issues, "expected_object", "object", actualType(value));
        return;
    }
    const discriminantProperty = readOwnDataProperty(value, key);
    if (discriminantProperty === undefined) {
        /*
         * The discriminant must be an own data property. Prototype values and
         * accessors are rejected before branch selection.
         */
        path.push(key);
        pushIssue(path, issues, "expected_discriminant", "data property", "missing or accessor");
        path.pop();
        return;
    }
    const discriminant = discriminantProperty.value;
    if (typeof discriminant !== "string") {
        path.push(key);
        pushIssue(
            path,
            issues,
            "expected_discriminant",
            "string discriminant",
            actualType(discriminant)
        );
        path.pop();
        return;
    }
    const selected = findDiscriminatedUnionCase(cases, discriminant);
    if (selected === undefined) {
        path.push(key);
        pushIssue(
            path,
            issues,
            "expected_discriminant",
            "known discriminant",
            literalToExpected(discriminant)
        );
        path.pop();
        return;
    }
    collectChild(selected, value, path, issues, state);
}

/**
 * @brief collect refine issues.
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
 * @param inner Schema validated before the predicate runs.
 * @param predicate User predicate that must return true.
 * @param name Refinement name used in diagnostics.
 * @param value Candidate runtime value.
 * @param path Mutable path stack reused by the diagnostic walker.
 * @param issues Output issue buffer.
 * @param state Shared recursion and cycle state.
 * @param collectChild Dispatcher for nested schema diagnostics.
 */
export function collectRefineIssues(
    inner: Schema,
    predicate: (value: unknown) => boolean,
    name: string,
    value: unknown,
    path: PathSegment[],
    issues: Issue[],
    state: ValidationState,
    collectChild: IssueCollector
): void {
    const before = issues.length;
    collectChild(inner, value, path, issues, state);
    if (issues.length === before && !isStrictTrue(predicate(value))) {
        /*
         * Refinement predicates run only after the inner schema produced no new
         * issues. That keeps structural failures more specific than predicate
         * failures.
         */
        pushIssue(path, issues, "expected_refinement", name, actualType(value));
    }
}
