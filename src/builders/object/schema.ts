/**
 * @file schema.ts
 * @brief Object schema construction and shape rewrites.
 */

import {
  ObjectModeTag,
  PresenceTag,
  SchemaTag
} from "../../kind/index.js";
import {
  includesString,
  isRecord,
  isUnknownArray,
  readGuardSchema
} from "../../internal/index.js";
import type {
  ObjectEntry,
  ObjectKeyLookup,
  ObjectSchema,
  Schema
} from "../../schema/index.js";
import { isSchemaValue } from "../../schema/index.js";
import type { ObjectShape } from "./types.js";

/**
 * @brief normalized object entry schema interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
interface NormalizedObjectEntrySchema {

  /**
   * @brief schema field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly schema: Schema;

  /**
   * @brief presence field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly presence: PresenceTag;
}

/**
 * @brief object schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param shape Borrowed input slot named shape; validation or normalization happens before stored state changes.
 * @param mode Borrowed input slot named mode; validation or normalization happens before stored state changes.
 * @returns Result for object schema; ownership of newly created aggregates is transferred to the caller.
 */
export function objectSchema(
  shape: ObjectShape,
  mode: ObjectModeTag
): ObjectSchema {
  if (!isRecord(shape)) {
    throw new TypeError("object shape must be an object");
  }
  const keys = Object.keys(shape);
  const entries = new Array<ObjectEntry>(keys.length);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === undefined) {
      throw new TypeError("Object key disappeared during construction");
    }
    const guard = shape[key];
    const entrySchema = normalizeObjectEntrySchema(
      readGuardSchema(guard, `object property ${key}`)
    );
    entries[index] = {
      key,
      schema: entrySchema.schema,
      presence: entrySchema.presence
    };
  }
  return objectSchemaFromEntries(entries, mode);
}

/**
 * @brief object schema from entries function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param sourceEntries Borrowed input slot named sourceEntries; validation or normalization happens before stored state changes.
 * @param mode Borrowed input slot named mode; validation or normalization happens before stored state changes.
 * @returns Result for object schema from entries; ownership of newly created aggregates is transferred to the caller.
 */
export function objectSchemaFromEntries(
  sourceEntries: readonly ObjectEntry[],
  mode: ObjectModeTag
): ObjectSchema {
  const entries = new Array<ObjectEntry>(sourceEntries.length);
  const keys = new Array<string>(sourceEntries.length);
  const keyLookup = makeObjectKeyLookup();
  for (let index = 0; index < sourceEntries.length; index += 1) {
    const entry = sourceEntries[index];
    if (entry === undefined) {
      throw new TypeError("object entry disappeared during construction");
    }
    if (hasObjectKey(keyLookup, entry.key)) {
      throw new TypeError(`object key ${entry.key} is duplicated`);
    }
    defineObjectKey(keyLookup, entry.key);
    entries[index] = entry;
    keys[index] = entry.key;
  }
  return {
    tag: SchemaTag.Object,
    entries,
    keys,
    keyLookup,
    mode
  };
}

/**
 * @brief read object constructor schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @returns Result for read object constructor schema; ownership of newly created aggregates is transferred to the caller.
 */
export function readObjectConstructorSchema(schema: unknown): ObjectSchema {
  if (!isSchemaValue(schema) || schema.tag !== SchemaTag.Object) {
    throw new TypeError("ObjectGuard constructor requires an object schema");
  }
  return schema;
}

/**
 * @brief read object method schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @param label Borrowed input slot named label; validation or normalization happens before stored state changes.
 * @returns Result for read object method schema; ownership of newly created aggregates is transferred to the caller.
 */
export function readObjectMethodSchema(guard: unknown, label: string): ObjectSchema {
  const schema = readGuardSchema(guard, label);
  if (schema.tag !== SchemaTag.Object) {
    throw new TypeError(`${label} must be an object TypeSea guard`);
  }
  return schema;
}

/**
 * @brief merge object schemas function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param base Borrowed input slot named base; validation or normalization happens before stored state changes.
 * @param extension Borrowed input slot named extension; validation or normalization happens before stored state changes.
 * @returns Result for merge object schemas; ownership of newly created aggregates is transferred to the caller.
 */
export function mergeObjectSchemas(
  base: ObjectSchema,
  extension: ObjectSchema
): ObjectSchema {
  const entries: ObjectEntry[] = [];
  for (let index = 0; index < base.entries.length; index += 1) {
    const entry = base.entries[index];
    if (entry !== undefined) {
      entries.push(findObjectEntry(extension.entries, entry.key) ?? entry);
    }
  }
  for (let index = 0; index < extension.entries.length; index += 1) {
    const entry = extension.entries[index];
    if (entry !== undefined && !hasObjectKey(base.keyLookup, entry.key)) {
      entries.push(entry);
    }
  }
  return objectSchemaFromEntries(entries, base.mode);
}

/**
 * @brief pick object schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param keys Borrowed input slot named keys; validation or normalization happens before stored state changes.
 * @returns Result for pick object schema; ownership of newly created aggregates is transferred to the caller.
 */
export function pickObjectSchema(
  schema: ObjectSchema,
  keys: readonly string[]
): ObjectSchema {
  const entries = new Array<ObjectEntry>(keys.length);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const entry = key === undefined
      ? undefined
      : findObjectEntry(schema.entries, key);
    if (entry === undefined) {
      throw new TypeError("picked object key disappeared during construction");
    }
    entries[index] = entry;
  }
  return objectSchemaFromEntries(entries, schema.mode);
}

/**
 * @brief omit object schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param keys Borrowed input slot named keys; validation or normalization happens before stored state changes.
 * @returns Result for omit object schema; ownership of newly created aggregates is transferred to the caller.
 */
export function omitObjectSchema(
  schema: ObjectSchema,
  keys: readonly string[]
): ObjectSchema {
  const entries: ObjectEntry[] = [];
  for (let index = 0; index < schema.entries.length; index += 1) {
    const entry = schema.entries[index];
    if (entry !== undefined && !includesString(keys, entry.key)) {
      entries.push(entry);
    }
  }
  return objectSchemaFromEntries(entries, schema.mode);
}

/**
 * @brief partial object schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @returns Result for partial object schema; ownership of newly created aggregates is transferred to the caller.
 */
export function partialObjectSchema(schema: ObjectSchema): ObjectSchema {
  const entries = new Array<ObjectEntry>(schema.entries.length);
  for (let index = 0; index < schema.entries.length; index += 1) {
    const entry = schema.entries[index];
    if (entry !== undefined) {
      entries[index] = {
        key: entry.key,
        schema: entry.schema,
        presence: PresenceTag.Optional
      };
    }
  }
  return objectSchemaFromEntries(entries, schema.mode);
}

/**
 * @brief read object key selection function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param keys Borrowed input slot named keys; validation or normalization happens before stored state changes.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param label Borrowed input slot named label; validation or normalization happens before stored state changes.
 * @returns Result for read object key selection; ownership of newly created aggregates is transferred to the caller.
 */
export function readObjectKeySelection(
  keys: unknown,
  schema: ObjectSchema,
  label: string
): readonly string[] {
  if (!isUnknownArray(keys)) {
    throw new TypeError(`${label} must be an array`);
  }
  const selected = new Array<string>(keys.length);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== "string") {
      throw new TypeError(`${label} must contain only strings`);
    }
    if (!hasObjectKey(schema.keyLookup, key)) {
      throw new TypeError(`${label} contains unknown object key ${key}`);
    }
    if (includesString(selected, key)) {
      throw new TypeError(`${label} contains duplicate object key ${key}`);
    }
    selected[index] = key;
  }
  return selected;
}

/**
 * @brief find object entry function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param entries Borrowed input slot named entries; validation or normalization happens before stored state changes.
 * @param key Borrowed input slot named key; validation or normalization happens before stored state changes.
 * @returns Result for find object entry; ownership of newly created aggregates is transferred to the caller.
 */
function findObjectEntry(
  entries: readonly ObjectEntry[],
  key: string
): ObjectEntry | undefined {
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry?.key === key) {
      return entry;
    }
  }
  return undefined;
}

/**
 * @brief make object key lookup function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @returns Result for make object key lookup; ownership of newly created aggregates is transferred to the caller.
 */
function makeObjectKeyLookup(): Record<string, true> {
  return Object.create(null) as Record<string, true>;
}

/**
 * @brief define object key function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param target Borrowed input slot named target; validation or normalization happens before stored state changes.
 * @param key Borrowed input slot named key; validation or normalization happens before stored state changes.
 * @post No result value is produced; effects are limited to the documented receiver or output buffer.
 */
function defineObjectKey(target: Record<string, true>, key: string): void {
  Object.defineProperty(target, key, {
    configurable: false,
    enumerable: true,
    value: true,
    writable: false
  });
}

/**
 * @brief has object key function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param keyLookup Borrowed input slot named keyLookup; validation or normalization happens before stored state changes.
 * @param key Borrowed input slot named key; validation or normalization happens before stored state changes.
 * @returns Result for has object key; ownership of newly created aggregates is transferred to the caller.
 */
function hasObjectKey(keyLookup: ObjectKeyLookup, key: string): boolean {
  return keyLookup[key] === true;
}

/**
 * @brief normalize object entry schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @returns Result for normalize object entry schema; ownership of newly created aggregates is transferred to the caller.
 */
function normalizeObjectEntrySchema(schema: Schema): NormalizedObjectEntrySchema {
  switch (schema.tag) {
    case SchemaTag.Optional:
      return {
        schema: normalizeObjectEntrySchema(schema.inner).schema,
        presence: PresenceTag.Optional
      };
    case SchemaTag.Undefinedable:
      return normalizeWrappedObjectEntrySchema(
        schema.inner,
        (inner): Schema => ({
          tag: SchemaTag.Undefinedable,
          inner
        }),
        schema
      );
    case SchemaTag.Nullable:
      return normalizeWrappedObjectEntrySchema(
        schema.inner,
        (inner): Schema => ({
          tag: SchemaTag.Nullable,
          inner
        }),
        schema
      );
    case SchemaTag.Brand:
      return normalizeWrappedObjectEntrySchema(
        schema.inner,
        (inner): Schema => ({
          tag: SchemaTag.Brand,
          inner,
          brand: schema.brand
        }),
        schema
      );
    case SchemaTag.Refine:
      return normalizeWrappedObjectEntrySchema(
        schema.inner,
        (inner): Schema => ({
          tag: SchemaTag.Refine,
          inner,
          predicate: schema.predicate,
          name: schema.name
        }),
        schema
      );
    default:
      return {
        schema,
        presence: PresenceTag.Required
      };
  }
}

/**
 * @brief normalize wrapped object entry schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param inner Borrowed input slot named inner; validation or normalization happens before stored state changes.
 * @param wrap Borrowed input slot named wrap; validation or normalization happens before stored state changes.
 * @param original Borrowed input slot named original; validation or normalization happens before stored state changes.
 * @returns Result for normalize wrapped object entry schema; ownership of newly created aggregates is transferred to the caller.
 */
function normalizeWrappedObjectEntrySchema(
  inner: Schema,
  wrap: (schema: Schema) => Schema,
  original: Schema
): NormalizedObjectEntrySchema {
  const normalized = normalizeObjectEntrySchema(inner);
  if (normalized.presence === PresenceTag.Required) {
    return {
      schema: original,
      presence: PresenceTag.Required
    };
  }
  return {
    schema: wrap(normalized.schema),
    presence: PresenceTag.Optional
  };
}
