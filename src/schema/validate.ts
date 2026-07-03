/**
 * @file schema/validate.ts
 * @brief Runtime validators for direct schema objects.
 */

import {
  NumberCheckTag,
  ObjectModeTag,
  PresenceTag,
  SchemaTag,
  StringCheckTag
} from "../kind/index.js";
import { isLiteralValue } from "./literal.js";
import {
  includesString,
  isObjectKeyLookup,
  isPlainRegExp,
  isRecord,
  isStringArray,
  isUnknownArray
} from "./common.js";
import type {
  NumberCheck,
  Schema,
  StringCheck
} from "./types.js";

/**
 * @brief is schema value function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is schema value; ownership of newly created aggregates is transferred to the caller.
 */
export function isSchemaValue(value: unknown): value is Schema {
  return isSchemaValueInner(value, {
    validated: new WeakSet<object>(),
    visiting: new WeakSet<object>()
  });
}

/**
 * @brief schema validation state interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
interface SchemaValidationState {

  /**
   * @brief validated field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly validated: WeakSet<object>;

  /**
   * @brief visiting field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly visiting: WeakSet<object>;
}

/**
 * @brief is schema value inner function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param state Borrowed input slot named state; validation or normalization happens before stored state changes.
 * @returns Result for is schema value inner; ownership of newly created aggregates is transferred to the caller.
 */
function isSchemaValueInner(
  value: unknown,
  state: SchemaValidationState
): value is Schema {
  if (!isRecord(value)) {
    return false;
  }
  if (state.validated.has(value)) {
    return true;
  }
  if (state.visiting.has(value)) {
    return false;
  }
  state.visiting.add(value);

  const valid = isSchemaRecord(value, state);
  state.visiting.delete(value);
  if (valid) {
    state.validated.add(value);
  }
  return valid;
}

/**
 * @brief is schema record function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param state Borrowed input slot named state; validation or normalization happens before stored state changes.
 * @returns Result for is schema record; ownership of newly created aggregates is transferred to the caller.
 */
function isSchemaRecord(
  value: Readonly<Record<string, unknown>>,
  state: SchemaValidationState
): boolean {
  switch (value["tag"]) {
    case SchemaTag.Unknown:
    case SchemaTag.Never:
    case SchemaTag.BigInt:
    case SchemaTag.Symbol:
    case SchemaTag.Boolean:
      return true;
    case SchemaTag.String:
      return isStringChecks(value["checks"]);
    case SchemaTag.Number:
      return isNumberChecks(value["checks"]);
    case SchemaTag.Literal:
      return isLiteralValue(value["value"]);
    case SchemaTag.Array:
      return isSchemaValueInner(value["item"], state);
    case SchemaTag.Tuple:
      return isSchemaArray(value["items"], state);
    case SchemaTag.Record:
      return isSchemaValueInner(value["value"], state);
    case SchemaTag.Object:
      return isObjectSchemaValue(value, state);
    case SchemaTag.Union:
      return isSchemaArray(value["options"], state);
    case SchemaTag.Intersection:
      return isSchemaValueInner(value["left"], state) &&
        isSchemaValueInner(value["right"], state);
    case SchemaTag.Optional:
    case SchemaTag.Undefinedable:
    case SchemaTag.Nullable:
      return isSchemaValueInner(value["inner"], state);
    case SchemaTag.DiscriminatedUnion:
      return isDiscriminatedUnionSchemaValue(value, state);
    case SchemaTag.Brand:
      return typeof value["brand"] === "string" &&
        isSchemaValueInner(value["inner"], state);
    case SchemaTag.Lazy:
      return typeof value["get"] === "function";
    case SchemaTag.Refine:
      return typeof value["name"] === "string" &&
        typeof value["predicate"] === "function" &&
        isSchemaValueInner(value["inner"], state);
    default:
      return false;
  }
}

/**
 * @brief is string checks function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is string checks; ownership of newly created aggregates is transferred to the caller.
 */
function isStringChecks(value: unknown): value is readonly StringCheck[] {
  if (!isUnknownArray(value)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const check = value[index];
    if (!isRecord(check)) {
      return false;
    }
    switch (check["tag"]) {
      case StringCheckTag.Min:
      case StringCheckTag.Max: {
        const bound = check["value"];
        if (typeof bound !== "number" || !Number.isInteger(bound) || bound < 0) {
          return false;
        }
        break;
      }
      case StringCheckTag.Regex:
        if (!isPlainRegExp(check["regex"]) || typeof check["name"] !== "string") {
          return false;
        }
        break;
      case StringCheckTag.Uuid:
        break;
      default:
        return false;
    }
  }
  return true;
}

/**
 * @brief is number checks function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is number checks; ownership of newly created aggregates is transferred to the caller.
 */
function isNumberChecks(value: unknown): value is readonly NumberCheck[] {
  if (!isUnknownArray(value)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const check = value[index];
    if (!isRecord(check)) {
      return false;
    }
    switch (check["tag"]) {
      case NumberCheckTag.Integer:
        break;
      case NumberCheckTag.Gte:
      case NumberCheckTag.Lte: {
        const bound = check["value"];
        if (typeof bound !== "number" || !Number.isFinite(bound)) {
          return false;
        }
        break;
      }
      default:
        return false;
    }
  }
  return true;
}

/**
 * @brief is schema array function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param state Borrowed input slot named state; validation or normalization happens before stored state changes.
 * @returns Result for is schema array; ownership of newly created aggregates is transferred to the caller.
 */
function isSchemaArray(value: unknown, state: SchemaValidationState): boolean {
  if (!isUnknownArray(value)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!isSchemaValueInner(value[index], state)) {
      return false;
    }
  }
  return true;
}

/**
 * @brief is object schema value function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param state Borrowed input slot named state; validation or normalization happens before stored state changes.
 * @returns Result for is object schema value; ownership of newly created aggregates is transferred to the caller.
 */
function isObjectSchemaValue(
  value: Readonly<Record<string, unknown>>,
  state: SchemaValidationState
): boolean {
  if (value["mode"] !== ObjectModeTag.Passthrough &&
    value["mode"] !== ObjectModeTag.Strict) {
    return false;
  }
  const entries = value["entries"];
  const keys = value["keys"];
  const keyLookup = value["keyLookup"];
  if (!isUnknownArray(entries) || !isStringArray(keys) ||
    !isObjectKeyLookup(keyLookup, keys) || entries.length !== keys.length) {
    return false;
  }
  const seen: string[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!isRecord(entry) ||
      typeof entry["key"] !== "string" ||
      entry["key"] !== keys[index] ||
      includesString(seen, entry["key"]) ||
      (entry["presence"] !== PresenceTag.Required &&
        entry["presence"] !== PresenceTag.Optional) ||
      !isSchemaValueInner(entry["schema"], state)) {
      return false;
    }
    seen.push(entry["key"]);
  }
  return true;
}

/**
 * @brief is discriminated union schema value function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param state Borrowed input slot named state; validation or normalization happens before stored state changes.
 * @returns Result for is discriminated union schema value; ownership of newly created aggregates is transferred to the caller.
 */
function isDiscriminatedUnionSchemaValue(
  value: Readonly<Record<string, unknown>>,
  state: SchemaValidationState
): boolean {
  const cases = value["cases"];
  const key = value["key"];
  if (typeof key !== "string" || !isUnknownArray(cases) || cases.length === 0) {
    return false;
  }
  const literals: string[] = [];
  for (let index = 0; index < cases.length; index += 1) {
    const unionCase = cases[index];
    if (!isRecord(unionCase) || typeof unionCase["literal"] !== "string" ||
      includesString(literals, unionCase["literal"]) ||
      !isSchemaValueInner(unionCase["schema"], state) ||
      !caseRequiresDiscriminant(unionCase["schema"], key, unionCase["literal"])) {
      return false;
    }
    literals.push(unionCase["literal"]);
  }
  return true;
}

/**
 * @brief case requires discriminant function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param key Borrowed input slot named key; validation or normalization happens before stored state changes.
 * @param literal Borrowed input slot named literal; validation or normalization happens before stored state changes.
 * @returns Result for case requires discriminant; ownership of newly created aggregates is transferred to the caller.
 */
function caseRequiresDiscriminant(
  schema: Schema,
  key: string,
  literal: string
): boolean {
  const objectSchema = unwrapCaseObjectSchema(schema);
  if (objectSchema === undefined) {
    return false;
  }
  const entries = objectSchema.entries;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry?.key !== key) {
      continue;
    }
    return entry.presence === PresenceTag.Required &&
      schemaRequiresLiteral(entry.schema, literal);
  }
  return false;
}

/**
 * @brief unwrap case object schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @returns Result for unwrap case object schema; ownership of newly created aggregates is transferred to the caller.
 */
function unwrapCaseObjectSchema(
  schema: Schema
): Extract<Schema, { readonly tag: typeof SchemaTag.Object }> | undefined {
  switch (schema.tag) {
    case SchemaTag.Object:
      return schema;
    case SchemaTag.Intersection:
      return unwrapCaseObjectSchema(schema.left) ?? unwrapCaseObjectSchema(schema.right);
    case SchemaTag.Brand:
    case SchemaTag.Refine:
      return unwrapCaseObjectSchema(schema.inner);
    default:
      return undefined;
  }
}

/**
 * @brief schema requires literal function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param literal Borrowed input slot named literal; validation or normalization happens before stored state changes.
 * @returns Result for schema requires literal; ownership of newly created aggregates is transferred to the caller.
 */
function schemaRequiresLiteral(schema: Schema, literal: string): boolean {
  switch (schema.tag) {
    case SchemaTag.Literal:
      return Object.is(schema.value, literal);
    case SchemaTag.Intersection:
      return schemaRequiresLiteral(schema.left, literal) ||
        schemaRequiresLiteral(schema.right, literal);
    case SchemaTag.Brand:
    case SchemaTag.Refine:
      return schemaRequiresLiteral(schema.inner, literal);
    default:
      return false;
  }
}
