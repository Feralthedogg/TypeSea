/**
 * @file schema-predicate.ts
 * @brief Schema-specialized predicate kernels for validation plans.
 */

import {
  NumberCheckTag,
  ObjectModeTag,
  PresenceTag,
  SchemaTag,
  StringCheckTag
} from "../kind/index.js";
import {
  UUID_PATTERN,
  resolveLazySchema,
  type DiscriminatedUnionCase,
  type Schema
} from "../schema/index.js";
import {
  findDiscriminatedUnionCase,
  hasObjectKey,
  isDataPropertyDescriptor,
  isPlainRecord,
  readOwnDataProperty,
  type DataPropertyDescriptor
} from "../evaluate/shared.js";
import type { ValidationState } from "../evaluate/state.js";

/**
 * @brief child predicate runner.
 */
export type ChildPredicateRunner = (
  schema: Schema,
  value: unknown,
  state: ValidationState
) => boolean;

/**
 * @brief execute schema kernel.
 */
export function executeSchemaKernel(
  schema: Schema,
  value: unknown,
  state: ValidationState,
  runChild: ChildPredicateRunner
): boolean {
  switch (schema.tag) {
    case SchemaTag.Unknown:
      return true;
    case SchemaTag.Never:
      return false;
    case SchemaTag.String:
      return isStringSchema(schema, value);
    case SchemaTag.Number:
      return isNumberSchema(schema, value);
    case SchemaTag.BigInt:
      return typeof value === "bigint";
    case SchemaTag.Symbol:
      return typeof value === "symbol";
    case SchemaTag.Boolean:
      return typeof value === "boolean";
    case SchemaTag.Literal:
      return Object.is(value, schema.value);
    case SchemaTag.Array:
      return isArraySchema(schema.item, value, state, runChild);
    case SchemaTag.Tuple:
      return isTupleSchema(schema.items, value, state, runChild);
    case SchemaTag.Record:
      return isRecordSchema(schema.value, value, state, runChild);
    case SchemaTag.Object:
      return isObjectSchema(schema, value, state, runChild);
    case SchemaTag.Union:
      return isUnionSchema(schema.options, value, state, runChild);
    case SchemaTag.Intersection:
      return runChild(schema.left, value, state) &&
        runChild(schema.right, value, state);
    case SchemaTag.Optional:
    case SchemaTag.Undefinedable:
      return value === undefined || runChild(schema.inner, value, state);
    case SchemaTag.Nullable:
      return value === null || runChild(schema.inner, value, state);
    case SchemaTag.DiscriminatedUnion:
      return isDiscriminatedUnionSchema(
        schema.key,
        schema.cases,
        value,
        state,
        runChild
      );
    case SchemaTag.Brand:
      return runChild(schema.inner, value, state);
    case SchemaTag.Lazy:
      return runChild(resolveLazySchema(schema, state.resolving), value, state);
    case SchemaTag.Refine:
      return runChild(schema.inner, value, state) &&
        isStrictTrue(schema.predicate(value));
  }
}

/**
 * @brief is string schema.
 */
function isStringSchema(
  schema: Extract<Schema, { readonly tag: typeof SchemaTag.String }>,
  value: unknown
): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const checks = schema.checks;
  for (let index = 0; index < checks.length; index += 1) {
    const check = checks[index];
    if (check === undefined) {
      return false;
    }
    switch (check.tag) {
      case StringCheckTag.Min:
        if (value.length < check.value) {
          return false;
        }
        break;
      case StringCheckTag.Max:
        if (value.length > check.value) {
          return false;
        }
        break;
      case StringCheckTag.Regex:
        check.regex.lastIndex = 0;
        if (!check.regex.test(value)) {
          return false;
        }
        check.regex.lastIndex = 0;
        break;
      case StringCheckTag.Uuid:
        UUID_PATTERN.lastIndex = 0;
        if (!UUID_PATTERN.test(value)) {
          return false;
        }
        UUID_PATTERN.lastIndex = 0;
        break;
    }
  }
  return true;
}

/**
 * @brief is number schema.
 */
function isNumberSchema(
  schema: Extract<Schema, { readonly tag: typeof SchemaTag.Number }>,
  value: unknown
): boolean {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return false;
  }
  const checks = schema.checks;
  for (let index = 0; index < checks.length; index += 1) {
    const check = checks[index];
    if (check === undefined) {
      return false;
    }
    switch (check.tag) {
      case NumberCheckTag.Integer:
        if (!Number.isInteger(value)) {
          return false;
        }
        break;
      case NumberCheckTag.Gte:
        if (value < check.value) {
          return false;
        }
        break;
      case NumberCheckTag.Lte:
        if (value > check.value) {
          return false;
        }
        break;
    }
  }
  return true;
}

/**
 * @brief is array schema.
 */
function isArraySchema(
  item: Schema,
  value: unknown,
  state: ValidationState,
  runChild: ChildPredicateRunner
): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const property = readArrayIndexDataProperty(value, index);
    if (property === null ||
      !runChild(item, property === undefined ? undefined : property.value, state)) {
      return false;
    }
  }
  return true;
}

/**
 * @brief is tuple schema.
 */
function isTupleSchema(
  items: readonly Schema[],
  value: unknown,
  state: ValidationState,
  runChild: ChildPredicateRunner
): boolean {
  if (!Array.isArray(value) || value.length !== items.length) {
    return false;
  }
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const property = readArrayIndexDataProperty(value, index);
    if (item === undefined ||
      property === null ||
      !runChild(item, property === undefined ? undefined : property.value, state)) {
      return false;
    }
  }
  return true;
}

/**
 * @brief read array index data property.
 */
function readArrayIndexDataProperty(
  value: readonly unknown[],
  index: number
): DataPropertyDescriptor | null | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
  if (descriptor === undefined) {
    return undefined;
  }
  if (!isDataPropertyDescriptor(descriptor)) {
    return null;
  }
  return descriptor;
}

/**
 * @brief is record schema.
 */
function isRecordSchema(
  item: Schema,
  value: unknown,
  state: ValidationState,
  runChild: ChildPredicateRunner
): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  const keys = Object.keys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === undefined) {
      return false;
    }
    const property = readOwnDataProperty(value, key);
    if (property === undefined || !runChild(item, property.value, state)) {
      return false;
    }
  }
  return true;
}

/**
 * @brief is object schema.
 */
function isObjectSchema(
  schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
  value: unknown,
  state: ValidationState,
  runChild: ChildPredicateRunner
): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  const record = value;
  const entries = schema.entries;
  let allRequired = true;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) {
      return false;
    }
    if (entry.presence === PresenceTag.Optional) {
      allRequired = false;
    }
    const property = readOwnDataProperty(record, entry.key);
    if (property === undefined) {
      if (
        entry.presence === PresenceTag.Optional &&
        !Object.prototype.hasOwnProperty.call(record, entry.key)
      ) {
        continue;
      }
      return false;
    }
    if (!runChild(entry.schema, property.value, state)) {
      return false;
    }
  }
  if (schema.mode === ObjectModeTag.Strict) {
    if (allRequired) {
      return Object.getOwnPropertyNames(record).length === entries.length &&
        Object.getOwnPropertySymbols(record).length === 0;
    }
    const keys = Reflect.ownKeys(record);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key !== "string" || !hasObjectKey(schema.keyLookup, key)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * @brief is union schema.
 */
function isUnionSchema(
  options: readonly Schema[],
  value: unknown,
  state: ValidationState,
  runChild: ChildPredicateRunner
): boolean {
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option !== undefined && runChild(option, value, state)) {
      return true;
    }
  }
  return false;
}

/**
 * @brief is discriminated union schema.
 */
function isDiscriminatedUnionSchema(
  key: string,
  cases: readonly DiscriminatedUnionCase[],
  value: unknown,
  state: ValidationState,
  runChild: ChildPredicateRunner
): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  const discriminantProperty = readOwnDataProperty(value, key);
  if (discriminantProperty === undefined ||
    typeof discriminantProperty.value !== "string") {
    return false;
  }
  const selected = findDiscriminatedUnionCase(cases, discriminantProperty.value);
  return selected !== undefined && runChild(selected, value, state);
}

/**
 * @brief is strict true.
 */
function isStrictTrue(value: unknown): boolean {
  return value === true;
}
