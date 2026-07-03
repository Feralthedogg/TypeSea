/**
 * @file check-composite.ts
 * @brief Composite diagnostic schema interpreters.
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
import { pushIssue } from "./issue.js";
import {
  actualType,
  findDiscriminatedUnionCase,
  hasObjectKey,
  isDataPropertyDescriptor,
  isPlainRecord,
  isStrictTrue,
  literalToExpected,
  readOwnDataProperty,
  type DataPropertyDescriptor
} from "./shared.js";
import type { ValidationState } from "./state.js";

/**
 * @brief issue collector type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type IssueCollector = (
  schema: Schema,
  value: unknown,
  path: PathSegment[],
  issues: Issue[],
  state: ValidationState
) => void;

/**
 * @brief collect array issues function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param item Borrowed input slot named item; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param state Borrowed input slot named state; validation or normalization happens before stored state changes.
 * @param collectChild Borrowed input slot named collectChild; validation or normalization happens before stored state changes.
 * @post No result value is produced; effects are limited to the documented receiver or output buffer.
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
 * @brief collect tuple issues function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param items Borrowed input slot named items; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param state Borrowed input slot named state; validation or normalization happens before stored state changes.
 * @param collectChild Borrowed input slot named collectChild; validation or normalization happens before stored state changes.
 * @post No result value is produced; effects are limited to the documented receiver or output buffer.
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
 * @brief read array index data property function contract.
 * @details Reads an array element through its descriptor so validation does not execute getters.
 * @param value Borrowed input slot named value; validation happens before descriptor values are trusted.
 * @param index Borrowed input slot named index; validation happens before descriptor values are trusted.
 * @returns Data descriptor for elements, undefined for holes, and null for accessors.
 */
function readArrayIndexDataProperty(
  value: readonly unknown[],
  index: number
): DataPropertyDescriptor | null | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(
    value,
    String(index)
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
 * @brief collect record issues function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param item Borrowed input slot named item; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param state Borrowed input slot named state; validation or normalization happens before stored state changes.
 * @param collectChild Borrowed input slot named collectChild; validation or normalization happens before stored state changes.
 * @post No result value is produced; effects are limited to the documented receiver or output buffer.
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
 * @brief collect object issues function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param state Borrowed input slot named state; validation or normalization happens before stored state changes.
 * @param collectChild Borrowed input slot named collectChild; validation or normalization happens before stored state changes.
 * @post No result value is produced; effects are limited to the documented receiver or output buffer.
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
    const keys = Object.keys(record);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (key !== undefined && !hasObjectKey(schema.keyLookup, key)) {
        path.push(key);
        pushIssue(path, issues, "unrecognized_key", "known key", "extra key");
        path.pop();
      }
    }
  }
}

/**
 * @brief collect discriminated union issues function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param key Borrowed input slot named key; validation or normalization happens before stored state changes.
 * @param cases Borrowed input slot named cases; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param state Borrowed input slot named state; validation or normalization happens before stored state changes.
 * @param collectChild Borrowed input slot named collectChild; validation or normalization happens before stored state changes.
 * @post No result value is produced; effects are limited to the documented receiver or output buffer.
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
 * @brief collect refine issues function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param inner Borrowed input slot named inner; validation or normalization happens before stored state changes.
 * @param predicate Borrowed input slot named predicate; validation or normalization happens before stored state changes.
 * @param name Borrowed input slot named name; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param state Borrowed input slot named state; validation or normalization happens before stored state changes.
 * @param collectChild Borrowed input slot named collectChild; validation or normalization happens before stored state changes.
 * @post No result value is produced; effects are limited to the documented receiver or output buffer.
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
    pushIssue(path, issues, "expected_refinement", name, actualType(value));
  }
}
