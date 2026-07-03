/**
 * @file schema/freeze.ts
 * @brief Schema freezing and collection hardening.
 */

import { SchemaTag, StringCheckTag } from "../kind/index.js";
import { isPlainRegExp } from "./common.js";
import type {
  DiscriminatedUnionCase,
  ObjectEntry,
  Schema,
  StringCheck,
  StringRegexCheck
} from "./types.js";

/**
 * @brief freeze schema.
 */
export function freezeSchema(schema: Schema): Schema {
  return freezeSchemaInner(schema, new WeakSet<object>());
}

/**
 * @brief freeze schema inner.
 */
function freezeSchemaInner(schema: Schema, frozen: WeakSet<object>): Schema {
  if (frozen.has(schema)) {
    return schema;
  }
  frozen.add(schema);
  switch (schema.tag) {
    case SchemaTag.String:
      freezeStringChecks(schema.checks, frozen);
      return Object.freeze(schema);
    case SchemaTag.Number:
      freezeArray(schema.checks, frozen);
      return Object.freeze(schema);
    case SchemaTag.Array:
      freezeSchemaInner(schema.item, frozen);
      return Object.freeze(schema);
    case SchemaTag.Tuple:
      freezeSchemaArray(schema.items, frozen);
      return Object.freeze(schema);
    case SchemaTag.Record:
      freezeSchemaInner(schema.value, frozen);
      return Object.freeze(schema);
    case SchemaTag.Object:
      freezeObjectEntries(schema.entries, frozen);
      Object.freeze(schema.keys);
      Object.freeze(schema.keyLookup);
      return Object.freeze(schema);
    case SchemaTag.Union:
      freezeSchemaArray(schema.options, frozen);
      return Object.freeze(schema);
    case SchemaTag.Intersection:
      freezeSchemaInner(schema.left, frozen);
      freezeSchemaInner(schema.right, frozen);
      return Object.freeze(schema);
    case SchemaTag.Optional:
    case SchemaTag.Undefinedable:
    case SchemaTag.Nullable:
      freezeSchemaInner(schema.inner, frozen);
      return Object.freeze(schema);
    case SchemaTag.DiscriminatedUnion:
      freezeDiscriminatedUnionCases(schema.cases, frozen);
      return Object.freeze(schema);
    case SchemaTag.Brand:
      freezeSchemaInner(schema.inner, frozen);
      return Object.freeze(schema);
    case SchemaTag.Refine:
      freezeSchemaInner(schema.inner, frozen);
      return Object.freeze(schema);
    case SchemaTag.Unknown:
    case SchemaTag.Never:
    case SchemaTag.BigInt:
    case SchemaTag.Symbol:
    case SchemaTag.Boolean:
    case SchemaTag.Literal:
    case SchemaTag.Lazy:
      return Object.freeze(schema);
  }
}

/**
 * @brief freeze array.
 */
function freezeArray(
  values: readonly object[],
  frozen: WeakSet<object>
): void {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value !== undefined && !frozen.has(value)) {
      frozen.add(value);
      Object.freeze(value);
    }
  }
  Object.freeze(values);
}

/**
 * @brief freeze string checks.
 */
function freezeStringChecks(
  values: readonly StringCheck[],
  frozen: WeakSet<object>
): void {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === undefined || frozen.has(value)) {
      continue;
    }
    if (value.tag === StringCheckTag.Regex) {
      freezeRegexCheck(value);
    }
    frozen.add(value);
    Object.freeze(value);
  }
  Object.freeze(values);
}

/**
 * @brief freeze regex check.
 */
function freezeRegexCheck(check: StringRegexCheck): void {
  const regex = check.regex;
  if (!isPlainRegExp(regex)) {
    throw new TypeError("regex check must use a plain RegExp");
  }
  if (Object.isFrozen(check)) {
    if (Object.isExtensible(regex)) {
      throw new TypeError("frozen regex check must contain a non-extensible RegExp");
    }
    return;
  }
  const cloned = new RegExp(regex.source, regex.flags);
  Object.preventExtensions(cloned);
  Object.defineProperty(check, "regex", {
    configurable: false,
    enumerable: true,
    value: cloned,
    writable: false
  });
}

/**
 * @brief freeze schema array.
 */
function freezeSchemaArray(
  values: readonly Schema[],
  frozen: WeakSet<object>
): void {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value !== undefined) {
      freezeSchemaInner(value, frozen);
    }
  }
  Object.freeze(values);
}

/**
 * @brief freeze object entries.
 */
function freezeObjectEntries(
  entries: readonly ObjectEntry[],
  frozen: WeakSet<object>
): void {
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry !== undefined) {
      freezeSchemaInner(entry.schema, frozen);
      Object.freeze(entry);
    }
  }
  Object.freeze(entries);
}

/**
 * @brief freeze discriminated union cases.
 */
function freezeDiscriminatedUnionCases(
  cases: readonly DiscriminatedUnionCase[],
  frozen: WeakSet<object>
): void {
  for (let index = 0; index < cases.length; index += 1) {
    const unionCase = cases[index];
    if (unionCase !== undefined) {
      freezeSchemaInner(unionCase.schema, frozen);
      Object.freeze(unionCase);
    }
  }
  Object.freeze(cases);
}
