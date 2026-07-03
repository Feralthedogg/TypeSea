/**
 * @file read.ts
 * @brief Guard receiver and constructor validation.
 */

import { SchemaTag } from "../kind/index.js";
import type { NumberSchema, Schema, StringSchema } from "../schema/index.js";
import { freezeSchema, isSchemaValue } from "../schema/index.js";
import { isRecord } from "./props.js";
import { isConstructedGuard } from "./registry.js";

/**
 * @brief read guard schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @param label Borrowed input slot named label; validation or normalization happens before stored state changes.
 * @returns Result for read guard schema; ownership of newly created aggregates is transferred to the caller.
 */
export function readGuardSchema(
  guard: unknown,
  label: string
): Schema {
  if (isConstructedGuard(guard)) {
    return guard.schema;
  }
  if (!isRecord(guard)) {
    throw new TypeError(`${label} must be a TypeSea guard`);
  }
  const schema = guard["schema"];
  if (!isSchemaValue(schema)) {
    throw new TypeError(`${label} must contain a valid TypeSea schema`);
  }
  return schema;
}

/**
 * @brief read string method schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @param label Borrowed input slot named label; validation or normalization happens before stored state changes.
 * @returns Result for read string method schema; ownership of newly created aggregates is transferred to the caller.
 */
export function readStringMethodSchema(guard: unknown, label: string): StringSchema {
  if (isConstructedGuard(guard)) {
    const schema = guard.schema;
    if (schema.tag !== SchemaTag.String) {
      throw new TypeError(`${label} must be a string TypeSea guard`);
    }
    return schema;
  }
  const schema = readGuardSchema(guard, label);
  if (schema.tag !== SchemaTag.String) {
    throw new TypeError(`${label} must be a string TypeSea guard`);
  }
  return schema;
}

/**
 * @brief read number method schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @param label Borrowed input slot named label; validation or normalization happens before stored state changes.
 * @returns Result for read number method schema; ownership of newly created aggregates is transferred to the caller.
 */
export function readNumberMethodSchema(guard: unknown, label: string): NumberSchema {
  if (isConstructedGuard(guard)) {
    const schema = guard.schema;
    if (schema.tag !== SchemaTag.Number) {
      throw new TypeError(`${label} must be a number TypeSea guard`);
    }
    return schema;
  }
  const schema = readGuardSchema(guard, label);
  if (schema.tag !== SchemaTag.Number) {
    throw new TypeError(`${label} must be a number TypeSea guard`);
  }
  return schema;
}

/**
 * @brief read constructor schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @returns Result for read constructor schema; ownership of newly created aggregates is transferred to the caller.
 */
export function readConstructorSchema(schema: unknown): Schema {
  if (!isSchemaValue(schema)) {
    throw new TypeError("guard constructor requires a valid TypeSea schema");
  }
  return freezeSchema(schema);
}

/**
 * @brief read string constructor schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @returns Result for read string constructor schema; ownership of newly created aggregates is transferred to the caller.
 */
export function readStringConstructorSchema(schema: unknown): StringSchema {
  if (!isSchemaValue(schema) || schema.tag !== SchemaTag.String) {
    throw new TypeError("StringGuard constructor requires a string schema");
  }
  return schema;
}

/**
 * @brief read number constructor schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @returns Result for read number constructor schema; ownership of newly created aggregates is transferred to the caller.
 */
export function readNumberConstructorSchema(schema: unknown): NumberSchema {
  if (!isSchemaValue(schema) || schema.tag !== SchemaTag.Number) {
    throw new TypeError("NumberGuard constructor requires a number schema");
  }
  return schema;
}

/**
 * @brief check refinement input function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param predicate Borrowed input slot named predicate; validation or normalization happens before stored state changes.
 * @param name Borrowed input slot named name; validation or normalization happens before stored state changes.
 * @post No result value is produced; effects are limited to the documented receiver or output buffer.
 */
export function checkRefinementInput(
  predicate: unknown,
  name: unknown
): asserts predicate is (value: unknown) => boolean {
  if (typeof predicate !== "function") {
    throw new TypeError("refinement predicate must be a function");
  }
  if (typeof name !== "string") {
    throw new TypeError("refinement name must be a string");
  }
}

/**
 * @brief check string length bound function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param label Borrowed input slot named label; validation or normalization happens before stored state changes.
 * @returns Result for check string length bound; ownership of newly created aggregates is transferred to the caller.
 */
export function checkStringLengthBound(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} length bound must be a non-negative integer`);
  }
  return value;
}

/**
 * @brief check finite number bound function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param label Borrowed input slot named label; validation or normalization happens before stored state changes.
 * @returns Result for check finite number bound; ownership of newly created aggregates is transferred to the caller.
 */
export function checkFiniteNumberBound(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(`${label} numeric bound must be finite`);
  }
  return value;
}
