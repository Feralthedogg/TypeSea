import { describe, expect, test } from "vitest";
import { Ajv } from "ajv/dist/ajv.js";
import {
  t,
  toJsonSchema,
  type Guard,
  type JsonSchema,
  type JsonSchemaObject,
  type JsonSchemaTypeName,
  type Presence
} from "../src/index.js";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | JsonObject;

interface JsonObject {
  readonly [key: string]: JsonValue;
}

class Rng {
  private state: number;

  public constructor(seed: number) {
    this.state = seed >>> 0;
  }

  public nextInt(max: number): number {
    this.state = (Math.imul(this.state, 1_664_525) + 1_013_904_223) >>> 0;
    return this.state % max;
  }

  public nextBool(): boolean {
    return this.nextInt(2) === 0;
  }
}

describe("JSON Schema semantic export", () => {
  test("emits draft-07 tuple schemas by default for default Ajv", () => {
    const Tuple = t.tuple([t.string, t.number]);
    const exported = toJsonSchema(Tuple);

    expect(exported.ok).toBe(true);
    if (!exported.ok) {
      return;
    }
    expect(exported.value).toEqual({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "array",
      items: [
        { type: "string" },
        { type: "number" }
      ],
      additionalItems: false,
      minItems: 2,
      maxItems: 2
    });

    const ajv = new Ajv();
    const validate = ajv.compile(exported.value);
    expect(validate(["ok", 1])).toBe(true);
    expect(validate([1, "bad"])).toBe(false);
  });

  test("matches TypeSea guards over JSON-compatible values", () => {
    const guards: readonly Guard<unknown, Presence>[] = [
      t.unknown,
      t.never,
      t.string.min(1).max(3),
      t.string.regex(/^[ab]+$/, "ab_word"),
      t.number,
      t.number.int().gte(-2).lte(4),
      t.boolean,
      t.literal("alpha"),
      t.literal(2),
      t.nullable(t.string),
      t.array(t.number.int()),
      t.tuple([t.string, t.number]),
      t.record(t.union(t.string, t.number.int(), t.boolean)),
      t.object({
        id: t.string.min(1),
        count: t.number.int().gte(0),
        label: t.optional(t.nullable(t.string))
      }),
      t.object({
        id: t.string,
        count: t.number
      }).partial(),
      t.intersect(
        t.object({
          id: t.string.min(1)
        }),
        t.object({
          count: t.number.int().gte(0)
        })
      ),
      t.strictObject({
        kind: t.literal("point"),
        x: t.number,
        y: t.number
      }),
      t.discriminatedUnion("kind", {
        text: t.object({
          kind: t.literal("text"),
          value: t.string
        }),
        count: t.object({
          kind: t.literal("count"),
          value: t.number.int()
        })
      })
    ];
    const values = makeJsonValues();

    for (let guardIndex = 0; guardIndex < guards.length; guardIndex += 1) {
      const guard = guards[guardIndex];
      expect(guard, `guard ${String(guardIndex)}`).toBeDefined();
      if (guard === undefined) {
        continue;
      }
      const exported = toJsonSchema(guard);
      expect(exported.ok, `guard ${String(guardIndex)}`).toBe(true);
      if (!exported.ok) {
        continue;
      }

      for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
        const value = values[valueIndex];
        if (value === undefined) {
          continue;
        }
        expect(
          matchesJsonSchema(exported.value, value),
          `guard ${String(guardIndex)} value ${String(valueIndex)}`
        ).toBe(guard.is(value));
      }
    }
  });
});

function makeJsonValues(): readonly JsonValue[] {
  const rng = new Rng(0x150ea);
  const values: JsonValue[] = [
    null,
    true,
    false,
    "",
    "a",
    "ab",
    "abcd",
    "alpha",
    -3,
    -2,
    -0,
    0,
    1,
    2,
    4,
    5,
    1.5,
    [],
    ["a", 1],
    ["a", 1, true],
    [1, 2, 3],
    { id: "u", count: 0 },
    { id: "u", count: 0, label: null },
    { id: "", count: 0 },
    { id: "u", count: -1 },
    { id: "u", count: 0, extra: true },
    { kind: "point", x: 0, y: 1 },
    { kind: "point", x: 0, y: 1, extra: true },
    { kind: "text", value: "body" },
    { kind: "count", value: 2 },
    { kind: "count", value: 2.5 },
    { a: "x", b: 1, c: false },
    { a: null }
  ];

  for (let index = 0; index < 96; index += 1) {
    values.push(randomJsonValue(rng, 0));
  }
  return values;
}

function randomJsonValue(rng: Rng, depth: number): JsonValue {
  const tag = rng.nextInt(depth >= 3 ? 5 : 7);
  switch (tag) {
    case 0:
      return null;
    case 1:
      return rng.nextBool();
    case 2:
      return randomString(rng);
    case 3:
      return rng.nextInt(17) - 8;
    case 4:
      return rng.nextInt(100) / 10;
    case 5:
      return randomJsonArray(rng, depth);
    default:
      return randomJsonObject(rng, depth);
  }
}

function randomString(rng: Rng): string {
  const alphabet = "abckindpointtextvalue";
  const length = rng.nextInt(8);
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += alphabet.charAt(rng.nextInt(alphabet.length));
  }
  return value;
}

function randomJsonArray(rng: Rng, depth: number): readonly JsonValue[] {
  const length = rng.nextInt(5);
  const value = new Array<JsonValue>(length);
  for (let index = 0; index < length; index += 1) {
    value[index] = randomJsonValue(rng, depth + 1);
  }
  return value;
}

function randomJsonObject(rng: Rng, depth: number): JsonObject {
  const keys = ["id", "count", "label", "kind", "value", "x", "y", "extra"] as const;
  const length = rng.nextInt(keys.length + 1);
  const value: Record<string, JsonValue> = {};
  for (let index = 0; index < length; index += 1) {
    const key = keys[index];
    if (key !== undefined) {
      value[key] = randomJsonValue(rng, depth + 1);
    }
  }
  return value;
}

function matchesJsonSchema(schema: JsonSchema, value: JsonValue): boolean {
  if (typeof schema === "boolean") {
    return schema;
  }
  if (!matchesType(schema.type, value)) {
    return false;
  }
  if (!matchesConst(schema, value)) {
    return false;
  }
  if (!matchesStringKeywords(schema, value)) {
    return false;
  }
  if (!matchesNumberKeywords(schema, value)) {
    return false;
  }
  if (!matchesArrayKeywords(schema, value)) {
    return false;
  }
  if (!matchesObjectKeywords(schema, value)) {
    return false;
  }
  return matchesAnyOf(schema, value) && matchesAllOf(schema, value);
}

function matchesType(
  type: JsonSchemaObject["type"],
  value: JsonValue
): boolean {
  if (type === undefined) {
    return true;
  }
  if (typeof type === "string") {
    return matchesTypeName(type, value);
  }
  for (let index = 0; index < type.length; index += 1) {
    const item = type[index];
    if (item !== undefined && matchesTypeName(item, value)) {
      return true;
    }
  }
  return false;
}

function matchesTypeName(type: JsonSchemaTypeName, value: JsonValue): boolean {
  switch (type) {
    case "null":
      return value === null;
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return isJsonObject(value);
    case "array":
      return Array.isArray(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "string":
      return typeof value === "string";
  }
}

function matchesConst(schema: JsonSchemaObject, value: JsonValue): boolean {
  if (!Object.prototype.hasOwnProperty.call(schema, "const")) {
    return true;
  }
  return value === schema.const;
}

function matchesStringKeywords(schema: JsonSchemaObject, value: JsonValue): boolean {
  if (typeof value !== "string") {
    return true;
  }
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    return false;
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    return false;
  }
  if (schema.pattern !== undefined) {
    const regex = new RegExp(schema.pattern, "u");
    regex.lastIndex = 0;
    return regex.test(value);
  }
  return true;
}

function matchesNumberKeywords(schema: JsonSchemaObject, value: JsonValue): boolean {
  if (typeof value !== "number") {
    return true;
  }
  if (schema.minimum !== undefined && value < schema.minimum) {
    return false;
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    return false;
  }
  return true;
}

function matchesArrayKeywords(schema: JsonSchemaObject, value: JsonValue): boolean {
  if (!isJsonArray(value)) {
    return true;
  }
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    return false;
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    return false;
  }
  if (schema.prefixItems !== undefined) {
    for (let index = 0; index < schema.prefixItems.length; index += 1) {
      const itemSchema = schema.prefixItems[index];
      const item = value[index];
      if (itemSchema !== undefined && item !== undefined && !matchesJsonSchema(itemSchema, item)) {
        return false;
      }
    }
  }
  if (schema.items !== undefined) {
    if (Array.isArray(schema.items)) {
      const tupleItems = schema.items as readonly JsonSchema[];
      for (let index = 0; index < tupleItems.length; index += 1) {
        const itemSchema = tupleItems[index];
        const item = value[index];
        if (itemSchema !== undefined && item !== undefined && !matchesJsonSchema(itemSchema, item)) {
          return false;
        }
      }
      if (schema.additionalItems === false && value.length > tupleItems.length) {
        return false;
      }
    } else {
      const itemSchema = schema.items as JsonSchema;
      for (let index = 0; index < value.length; index += 1) {
        const item = value[index];
        if (item !== undefined && !matchesJsonSchema(itemSchema, item)) {
          return false;
        }
      }
    }
  }
  return true;
}

function matchesObjectKeywords(schema: JsonSchemaObject, value: JsonValue): boolean {
  if (!isJsonObject(value)) {
    return true;
  }
  const required = schema.required;
  if (required !== undefined) {
    for (let index = 0; index < required.length; index += 1) {
      const key = required[index];
      if (key !== undefined && !Object.prototype.hasOwnProperty.call(value, key)) {
        return false;
      }
    }
  }

  const properties = schema.properties;
  if (properties !== undefined) {
    const propertyKeys = Object.keys(properties);
    for (let index = 0; index < propertyKeys.length; index += 1) {
      const key = propertyKeys[index];
      if (key !== undefined && Object.prototype.hasOwnProperty.call(value, key)) {
        const propertySchema = properties[key];
        const propertyValue = value[key];
        if (
          propertySchema !== undefined &&
          propertyValue !== undefined &&
          !matchesJsonSchema(propertySchema, propertyValue)
        ) {
          return false;
        }
      }
    }
  }

  return matchesAdditionalProperties(schema, value);
}

function matchesAdditionalProperties(
  schema: JsonSchemaObject,
  value: JsonObject
): boolean {
  const additional = schema.additionalProperties;
  if (additional === undefined || additional === true) {
    return true;
  }

  const properties = schema.properties;
  const keys = Object.keys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === undefined) {
      continue;
    }
    const isKnown = properties !== undefined &&
      Object.prototype.hasOwnProperty.call(properties, key);
    if (isKnown) {
      continue;
    }
    if (additional === false) {
      return false;
    }
    const propertyValue = value[key];
    if (propertyValue !== undefined && !matchesJsonSchema(additional, propertyValue)) {
      return false;
    }
  }
  return true;
}

function matchesAnyOf(schema: JsonSchemaObject, value: JsonValue): boolean {
  const options = schema.anyOf;
  if (options === undefined) {
    return true;
  }
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option !== undefined && matchesJsonSchema(option, value)) {
      return true;
    }
  }
  return false;
}

function matchesAllOf(schema: JsonSchemaObject, value: JsonValue): boolean {
  const options = schema.allOf;
  if (options === undefined) {
    return true;
  }
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option !== undefined && !matchesJsonSchema(option, value)) {
      return false;
    }
  }
  return true;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}
