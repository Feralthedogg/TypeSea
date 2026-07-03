/**
 * @file schema/common.ts
 * @brief Private schema shape predicates.
 */

import type { ObjectKeyLookup } from "./types.js";

/**
 * @brief is record.
 */
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    hasOnlyDataProperties(value);
}

/**
 * @brief is unknown array.
 */
export function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value) && hasOnlyDataProperties(value);
}

/**
 * @brief has only data properties.
 * @details Rejects accessor descriptors before schema internals read fields by key.
 * @returns True when every own property is backed by a data slot.
 */
function hasOnlyDataProperties(value: object): boolean {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const descriptorMap = descriptors as Record<PropertyKey, PropertyDescriptor | undefined>;
  const keys = Reflect.ownKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === undefined) {
      continue;
    }
    const descriptor = descriptorMap[key];
    if (descriptor === undefined ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
      return false;
    }
  }
  return true;
}

/**
 * @brief is plain reg exp.
 */
export function isPlainRegExp(value: unknown): value is RegExp {
  return value instanceof RegExp &&
    Object.getPrototypeOf(value) === RegExp.prototype &&
    !Object.prototype.hasOwnProperty.call(value, "exec") &&
    !Object.prototype.hasOwnProperty.call(value, "test") &&
    !Object.prototype.hasOwnProperty.call(value, "source") &&
    !Object.prototype.hasOwnProperty.call(value, "flags");
}

/**
 * @brief is string array.
 */
export function isStringArray(value: unknown): value is readonly string[] {
  if (!isUnknownArray(value)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== "string") {
      return false;
    }
  }
  return true;
}

/**
 * @brief is object key lookup.
 */
export function isObjectKeyLookup(
  value: unknown,
  keys: readonly string[]
): value is ObjectKeyLookup {
  if (!isRecord(value)) {
    return false;
  }
  const present = Object.keys(value);
  if (present.length !== keys.length) {
    return false;
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === undefined || value[key] !== true) {
      return false;
    }
  }
  for (let index = 0; index < present.length; index += 1) {
    const key = present[index];
    if (key === undefined || !includesString(keys, key)) {
      return false;
    }
  }
  return true;
}

/**
 * @brief includes string.
 */
export function includesString(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === value) {
      return true;
    }
  }
  return false;
}
