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
 * @brief issue collector.
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
 * @brief collect tuple issues.
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
 * @brief read array index data property.
 * @details Reads an array element through its descriptor so validation does not execute getters.
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
 * @brief collect record issues.
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
 * @brief collect object issues.
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
 * @brief collect refine issues.
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
