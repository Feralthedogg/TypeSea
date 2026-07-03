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
 * @brief unknown record type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type UnknownRecord = Readonly<Record<string, unknown>>;

/**
 * @brief data property descriptor type alias contract.
 * @details Defines the subset of descriptors whose value is stable for one validation read.
 * @invariant Accessor descriptors never match this contract.
 */
export interface DataPropertyDescriptor {

  /**
   * @brief value field contract.
   * @details The captured data slot is unknown until the schema-specific validator consumes it.
   * @invariant Accessing this field does not execute user getter code.
   */
  readonly value: unknown;
}

/**
 * @brief has object key function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param keyLookup Borrowed input slot named keyLookup; validation or normalization happens before stored state changes.
 * @param key Borrowed input slot named key; validation or normalization happens before stored state changes.
 * @returns Result for has object key; ownership of newly created aggregates is transferred to the caller.
 */
export function hasObjectKey(keyLookup: ObjectKeyLookup, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(keyLookup, key);
}

/**
 * @brief read own data property function contract.
 * @details Reads one own property through its descriptor so getters are not executed.
 * @param record Borrowed input slot named record; validation happens before descriptor values are trusted.
 * @param key Borrowed input slot named key; validation happens before descriptor values are trusted.
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
 * @brief find discriminated union case function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param cases Borrowed input slot named cases; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for find discriminated union case; ownership of newly created aggregates is transferred to the caller.
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
 * @brief is strict true function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is strict true; ownership of newly created aggregates is transferred to the caller.
 */
export function isStrictTrue(value: unknown): boolean {
  return value === true;
}

/**
 * @brief is plain record function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is plain record; ownership of newly created aggregates is transferred to the caller.
 */
export function isPlainRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief is data property descriptor function contract.
 * @details Checks that a descriptor contains a data value instead of getter/setter code.
 * @param descriptor Borrowed input slot named descriptor; no user code is executed while checking it.
 * @returns True when the descriptor has a stable value slot.
 */
export function isDataPropertyDescriptor(
  descriptor: PropertyDescriptor
): descriptor is DataPropertyDescriptor {
  return Object.prototype.hasOwnProperty.call(descriptor, "value");
}

/**
 * @brief actual type function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for actual type; ownership of newly created aggregates is transferred to the caller.
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
 * @brief literal to expected function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for literal to expected; ownership of newly created aggregates is transferred to the caller.
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
