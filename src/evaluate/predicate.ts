/**
 * @file predicate.ts
 * @brief Allocation-free boolean schema interpreter.
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
  isStrictTrue,
  readOwnDataProperty,
  type DataPropertyDescriptor
} from "./shared.js";
import {
  enterValidation,
  leaveValidation,
  makeValidationState,
  type ValidationState
} from "./state.js";

/**
 * @brief is schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is schema; ownership of newly created aggregates is transferred to the caller.
 */
export function isSchema(schema: Schema, value: unknown): boolean {
  return isSchemaWithState(schema, value, makeValidationState());
}

/**
 * @brief is schema with state function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param state Borrowed input slot named state; validation or normalization happens before stored state changes.
 * @returns Result for is schema with state; ownership of newly created aggregates is transferred to the caller.
 */
export function isSchemaWithState(
  schema: Schema,
  value: unknown,
  state: ValidationState
): boolean {
  const entered = enterValidation(schema, value, state);
  if (entered === "cycle") {
    return true;
  }
  if (entered === "budget") {
    return false;
  }
  const result = isSchemaInner(schema, value, state);
  leaveValidation(schema, value, state);
  return result;
}

/**
 * @brief is schema inner function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param state Borrowed input slot named state; validation or normalization happens before stored state changes.
 * @returns Result for is schema inner; ownership of newly created aggregates is transferred to the caller.
 */
function isSchemaInner(
  schema: Schema,
  value: unknown,
  state: ValidationState
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
      return isArraySchema(schema.item, value, state);
    case SchemaTag.Tuple:
      return isTupleSchema(schema.items, value, state);
    case SchemaTag.Record:
      return isRecordSchema(schema.value, value, state);
    case SchemaTag.Object:
      return isObjectSchema(schema, value, state);
    case SchemaTag.Union:
      return isUnionSchema(schema.options, value, state);
    case SchemaTag.Intersection:
      return isSchemaWithState(schema.left, value, state) &&
        isSchemaWithState(schema.right, value, state);
    case SchemaTag.Optional:
    case SchemaTag.Undefinedable:
      return value === undefined || isSchemaWithState(schema.inner, value, state);
    case SchemaTag.Nullable:
      return value === null || isSchemaWithState(schema.inner, value, state);
    case SchemaTag.DiscriminatedUnion:
      return isDiscriminatedUnionSchema(schema.key, schema.cases, value, state);
    case SchemaTag.Brand:
      return isSchemaWithState(schema.inner, value, state);
    case SchemaTag.Lazy:
      return isSchemaWithState(resolveLazySchema(schema, state.resolving), value, state);
    case SchemaTag.Refine:
      return isSchemaWithState(schema.inner, value, state) &&
        isStrictTrue(schema.predicate(value));
  }
}

/**
 * @brief is string schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is string schema; ownership of newly created aggregates is transferred to the caller.
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
        break;
      case StringCheckTag.Uuid:
        UUID_PATTERN.lastIndex = 0;
        if (!UUID_PATTERN.test(value)) {
          return false;
        }
        break;
    }
  }
  return true;
}

/**
 * @brief is number schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is number schema; ownership of newly created aggregates is transferred to the caller.
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
 * @brief is array schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param item Borrowed input slot named item; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param state Borrowed input slot named state; validation or normalization happens before stored state changes.
 * @returns Result for is array schema; ownership of newly created aggregates is transferred to the caller.
 */
function isArraySchema(
  item: Schema,
  value: unknown,
  state: ValidationState
): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const property = readArrayIndexDataProperty(value, index);
    if (property === null) {
      return false;
    }
    const itemValue = property === undefined ? undefined : property.value;
    if (!isSchemaWithState(item, itemValue, state)) {
      return false;
    }
  }
  return true;
}

/**
 * @brief is tuple schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param items Borrowed input slot named items; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param state Borrowed input slot named state; validation or normalization happens before stored state changes.
 * @returns Result for is tuple schema; ownership of newly created aggregates is transferred to the caller.
 */
function isTupleSchema(
  items: readonly Schema[],
  value: unknown,
  state: ValidationState
): boolean {
  if (!Array.isArray(value) || value.length !== items.length) {
    return false;
  }
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const property = readArrayIndexDataProperty(value, index);
    if (item === undefined || property === null) {
      return false;
    }
    const itemValue = property === undefined ? undefined : property.value;
    if (!isSchemaWithState(item, itemValue, state)) {
      return false;
    }
  }
  return true;
}

/**
 * @brief is record schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param item Borrowed input slot named item; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param state Borrowed input slot named state; validation or normalization happens before stored state changes.
 * @returns Result for is record schema; ownership of newly created aggregates is transferred to the caller.
 */
function isRecordSchema(
  item: Schema,
  value: unknown,
  state: ValidationState
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
    if (property === undefined || !isSchemaWithState(item, property.value, state)) {
      return false;
    }
  }
  return true;
}

/**
 * @brief is object schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param state Borrowed input slot named state; validation or normalization happens before stored state changes.
 * @returns Result for is object schema; ownership of newly created aggregates is transferred to the caller.
 */
function isObjectSchema(
  schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
  value: unknown,
  state: ValidationState
): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  const record = value;
  const entries = schema.entries;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) {
      return false;
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
    if (!isSchemaWithState(entry.schema, property.value, state)) {
      return false;
    }
  }
  if (schema.mode === ObjectModeTag.Strict) {
    const keys = Object.keys(record);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (key === undefined || !hasObjectKey(schema.keyLookup, key)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * @brief read array index data property function contract.
 * @details Reads array index descriptors without invoking accessor code.
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
 * @brief is union schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param options Borrowed input slot named options; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param state Borrowed input slot named state; validation or normalization happens before stored state changes.
 * @returns Result for is union schema; ownership of newly created aggregates is transferred to the caller.
 */
export function isUnionSchema(
  options: readonly Schema[],
  value: unknown,
  state: ValidationState
): boolean {
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option !== undefined && isSchemaWithState(option, value, state)) {
      return true;
    }
  }
  return false;
}

/**
 * @brief is discriminated union schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param key Borrowed input slot named key; validation or normalization happens before stored state changes.
 * @param cases Borrowed input slot named cases; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param state Borrowed input slot named state; validation or normalization happens before stored state changes.
 * @returns Result for is discriminated union schema; ownership of newly created aggregates is transferred to the caller.
 */
function isDiscriminatedUnionSchema(
  key: string,
  cases: readonly DiscriminatedUnionCase[],
  value: unknown,
  state: ValidationState
): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  const discriminantProperty = readOwnDataProperty(value, key);
  if (discriminantProperty === undefined) {
    return false;
  }
  const discriminant = discriminantProperty.value;
  if (typeof discriminant !== "string") {
    return false;
  }
  const selected = findDiscriminatedUnionCase(cases, discriminant);
  if (selected === undefined) {
    return false;
  }
  return isSchemaWithState(selected, value, state);
}
