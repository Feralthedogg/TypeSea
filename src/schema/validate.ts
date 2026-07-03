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
 * @brief is schema value.
 */
export function isSchemaValue(value: unknown): value is Schema {
  return isSchemaValueInner(value, {
    validated: new WeakSet<object>(),
    visiting: new WeakSet<object>()
  });
}

/**
 * @brief schema validation state.
 */
interface SchemaValidationState {
  readonly validated: WeakSet<object>;
  readonly visiting: WeakSet<object>;
}

/**
 * @brief is schema value inner.
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
 * @brief is schema record.
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
 * @brief is string checks.
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
 * @brief is number checks.
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
 * @brief is schema array.
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
 * @brief is object schema value.
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
 * @brief is discriminated union schema value.
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
 * @brief case requires discriminant.
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
 * @brief unwrap case object schema.
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
 * @brief schema requires literal.
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
