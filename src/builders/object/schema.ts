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
 * @brief normalized object entry schema.
 */
interface NormalizedObjectEntrySchema {
  readonly schema: Schema;
  readonly presence: PresenceTag;
}

/**
 * @brief object schema.
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
 * @brief object schema from entries.
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
 * @brief read object constructor schema.
 */
export function readObjectConstructorSchema(schema: unknown): ObjectSchema {
  if (!isSchemaValue(schema) || schema.tag !== SchemaTag.Object) {
    throw new TypeError("ObjectGuard constructor requires an object schema");
  }
  return schema;
}

/**
 * @brief read object method schema.
 */
export function readObjectMethodSchema(guard: unknown, label: string): ObjectSchema {
  const schema = readGuardSchema(guard, label);
  if (schema.tag !== SchemaTag.Object) {
    throw new TypeError(`${label} must be an object TypeSea guard`);
  }
  return schema;
}

/**
 * @brief merge object schemas.
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
 * @brief pick object schema.
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
 * @brief omit object schema.
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
 * @brief partial object schema.
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
 * @brief read object key selection.
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
 * @brief find object entry.
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
 * @brief make object key lookup.
 */
function makeObjectKeyLookup(): Record<string, true> {
  return Object.create(null) as Record<string, true>;
}

/**
 * @brief define object key.
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
 * @brief has object key.
 */
function hasObjectKey(keyLookup: ObjectKeyLookup, key: string): boolean {
  return keyLookup[key] === true;
}

/**
 * @brief normalize object entry schema.
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
 * @brief normalize wrapped object entry schema.
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
