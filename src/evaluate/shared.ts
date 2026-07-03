/**
 * @file shared.ts
 * @brief Shared scalar helpers for schema evaluation.
 */

import type {
  DiscriminatedUnionCase,
  LiteralValue,
  ObjectKeyLookup,
  Schema
} from "../schema/index.js";

/**
 * @brief unknown record.
 */
export type UnknownRecord = Readonly<Record<string, unknown>>;

/**
 * @brief data property descriptor.
 * @details Defines the subset of descriptors whose value is stable for one validation read.
 * @invariant Accessor descriptors never match this contract.
 */
export interface DataPropertyDescriptor {

  /**
   * @brief value.
   * @details The captured data slot is unknown until the schema-specific validator consumes it.
   * @invariant Accessing this field does not execute user getter code.
   */
  readonly value: unknown;
}

/**
 * @brief has object key.
 */
export function hasObjectKey(keyLookup: ObjectKeyLookup, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(keyLookup, key);
}

/**
 * @brief read own data property.
 * @details Reads one own property through its descriptor so getters are not executed.
 * @returns Own data descriptor, or undefined for missing/accessor properties.
 */
export function readOwnDataProperty(
  record: UnknownRecord,
  key: string
): DataPropertyDescriptor | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (descriptor === undefined || !isDataPropertyDescriptor(descriptor)) {
    return undefined;
  }
  return descriptor;
}

/**
 * @brief find discriminated union case.
 */
export function findDiscriminatedUnionCase(
  cases: readonly DiscriminatedUnionCase[],
  value: string
): Schema | undefined {
  for (let index = 0; index < cases.length; index += 1) {
    const unionCase = cases[index];
    if (unionCase !== undefined && Object.is(unionCase.literal, value)) {
      return unionCase.schema;
    }
  }
  return undefined;
}

/**
 * @brief is strict true.
 */
export function isStrictTrue(value: unknown): boolean {
  return value === true;
}

/**
 * @brief is plain record.
 */
export function isPlainRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief is data property descriptor.
 * @details Checks that a descriptor contains a data value instead of getter/setter code.
 * @returns True when the descriptor has a stable value slot.
 */
export function isDataPropertyDescriptor(
  descriptor: PropertyDescriptor
): descriptor is DataPropertyDescriptor {
  return Object.prototype.hasOwnProperty.call(descriptor, "value");
}

/**
 * @brief actual type.
 */
export function actualType(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (typeof value === "bigint") {
    return "bigint";
  }
  if (typeof value === "symbol") {
    return "symbol";
  }
  if (typeof value === "number" && Number.isNaN(value)) {
    return "nan";
  }
  return typeof value;
}

/**
 * @brief literal to expected.
 */
export function literalToExpected(value: LiteralValue): string {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Object.is(value, -0)) {
    return "-0";
  }
  if (typeof value === "symbol") {
    return String(value);
  }
  return String(value);
}
