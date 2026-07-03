import { describe, expect, test } from "vitest";
import {
  schemaToJsonSchema,
  t,
  toJsonSchema,
  type Guard,
  type JsonSchemaObject,
  type Schema
} from "../src/index.js";

const UUID_PATTERN_SOURCE =
  "^(?:00000000-0000-0000-0000-000000000000|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$";

describe("JSON Schema export", () => {
  test("exports representable schemas without losing optional-key semantics", () => {
    const User = t.strictObject({
      id: t.string.uuid(),
      age: t.number.int().gte(0).lte(150),
      role: t.union(t.literal("admin"), t.literal("user")),
      nickname: t.optional(t.string.min(1)),
      score: t.nullable(t.number.gte(0)),
      tags: t.array(t.string.min(1)),
      meta: t.record(t.union(t.string, t.number.int(), t.boolean)),
      point: t.tuple([t.number, t.number])
    });

    const result = toJsonSchema(User, {
      schemaId: "https://json-schema.org/draft/2020-12/schema"
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          id: {
            type: "string",
            format: "uuid",
            pattern: UUID_PATTERN_SOURCE
          },
          age: {
            type: "integer",
            minimum: 0,
            maximum: 150
          },
          role: {
            anyOf: [
              { const: "admin" },
              { const: "user" }
            ]
          },
          nickname: {
            type: "string",
            minLength: 1
          },
          score: {
            anyOf: [
              {
                type: "number",
                minimum: 0
              },
              {
                type: "null"
              }
            ]
          },
          tags: {
            type: "array",
            items: {
              type: "string",
              minLength: 1
            }
          },
          meta: {
            type: "object",
            additionalProperties: {
              anyOf: [
                { type: "string" },
                { type: "integer" },
                { type: "boolean" }
              ]
            }
          },
          point: {
            type: "array",
            prefixItems: [
              { type: "number" },
              { type: "number" }
            ],
            minItems: 2,
            maxItems: 2
          }
        },
        required: ["id", "age", "role", "score", "tags", "meta", "point"],
        additionalProperties: false
      });
    }
  });

  test("returns explicit errors for schemas JSON Schema cannot represent", () => {
    const Schema = t.object({
      ok: t.string,
      missing: t.undefinedable(t.string),
      token: t.symbol,
      amount: t.bigint,
      refined: t.number.refine((value) => value > 0, "positive")
    });

    const result = toJsonSchema(Schema);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.map((issue) => [issue.path, issue.code])).toEqual([
        [["missing"], "unsupported_undefined"],
        [["missing"], "unsupported_child"],
        [["token"], "unsupported_symbol"],
        [["token"], "unsupported_child"],
        [["amount"], "unsupported_bigint"],
        [["amount"], "unsupported_child"],
        [["refined"], "unsupported_refine"],
        [["refined"], "unsupported_child"]
      ]);
    }
  });

  test("reports unsupported nested child paths at the failed child slot", () => {
    const Schema = t.object({
      list: t.array(t.union(t.string, t.symbol)),
      tuple: t.tuple([t.number, t.literal(undefined)]),
      bag: t.record(t.nullable(t.bigint)),
      nope: t.nullable(t.refine(t.string, (value) => value.length > 0, "non_empty"))
    });

    const result = toJsonSchema(Schema);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.map((issue) => [issue.path, issue.code])).toEqual([
        [["list", "items", 1], "unsupported_symbol"],
        [["list", "items", 1], "unsupported_child"],
        [["list", "items"], "unsupported_child"],
        [["list"], "unsupported_child"],
        [["tuple", 1], "unsupported_undefined"],
        [["tuple", 1], "unsupported_child"],
        [["tuple"], "unsupported_child"],
        [["bag", "additionalProperties", "nullable"], "unsupported_bigint"],
        [["bag", "additionalProperties", "nullable"], "unsupported_child"],
        [["bag", "additionalProperties"], "unsupported_child"],
        [["bag"], "unsupported_child"],
        [["nope", "nullable"], "unsupported_refine"],
        [["nope", "nullable"], "unsupported_child"],
        [["nope"], "unsupported_child"]
      ]);
    }
  });

  test("validates direct schema export inputs and options", () => {
    const looseSchemaToJsonSchema = schemaToJsonSchema as unknown as (
      schema: unknown,
      options?: unknown
    ) => unknown;
    const looseToJsonSchema = toJsonSchema as unknown as (
      guard: unknown,
      options?: unknown
    ) => unknown;
    const discriminatedTag = t.discriminatedUnion("kind", {
      user: t.object({
        kind: t.literal("user")
      })
    }).schema.tag;
    const invalidDiscriminatedUnionSchema = {
      tag: discriminatedTag,
      key: "kind",
      cases: [
        {
          literal: "user",
          schema: t.object({
            kind: t.literal("order")
          }).schema
        }
      ]
    };
    const invalidNumericDiscriminatedUnionSchema = {
      tag: discriminatedTag,
      key: "kind",
      cases: [
        {
          literal: 1,
          schema: t.object({
            kind: t.literal(1)
          }).schema
        }
      ]
    };

    expect(() => looseSchemaToJsonSchema({ tag: 999 })).toThrow(TypeError);
    expect(() => looseSchemaToJsonSchema(invalidDiscriminatedUnionSchema))
      .toThrow(TypeError);
    expect(() => looseSchemaToJsonSchema(invalidNumericDiscriminatedUnionSchema))
      .toThrow(TypeError);
    expect(() => looseSchemaToJsonSchema(t.string.schema, 1)).toThrow(TypeError);
    expect(() => looseSchemaToJsonSchema(t.string.schema, { schemaId: 1 }))
      .toThrow(TypeError);
    expect(() => looseToJsonSchema({})).toThrow(TypeError);
    expect(() => looseToJsonSchema({
      schema: {
        tag: 999
      }
    })).toThrow(TypeError);
    expect(() => looseSchemaToJsonSchema({
      get tag(): unknown {
        return t.string.schema.tag;
      },
      checks: []
    })).toThrow(TypeError);

    const externalSchema = {
      tag: t.string.schema.tag,
      checks: []
    } as unknown as Schema;
    const result = schemaToJsonSchema(externalSchema);
    const externalView = externalSchema as unknown as {
      readonly checks: readonly unknown[];
    };

    expect(result.ok).toBe(true);
    expect(Object.isFrozen(externalSchema)).toBe(true);
    expect(Object.isFrozen(externalView.checks)).toBe(true);

    const externalGuard = {
      schema: {
        tag: t.number.schema.tag,
        checks: []
      }
    } as unknown as Guard<number>;
    const guarded = toJsonSchema(externalGuard);
    expect(guarded.ok).toBe(true);
    expect(Object.isFrozen(externalGuard.schema)).toBe(true);
  });

  test("returns frozen JSON Schema export values and issues", () => {
    const User = t.strictObject({
      id: t.string,
      score: t.number
    });
    const result = toJsonSchema(User);

    expect(result.ok).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    if (result.ok) {
      const schema = result.value as JsonSchemaObject;
      const properties = schema.properties;
      const required = schema.required;

      expect(Object.isFrozen(schema)).toBe(true);
      expect(properties).not.toBeUndefined();
      expect(required).not.toBeUndefined();
      if (properties !== undefined) {
        expect(Object.isFrozen(properties)).toBe(true);
        expect(Object.isFrozen(properties["id"])).toBe(true);
      }
      if (required !== undefined) {
        expect(Object.isFrozen(required)).toBe(true);
      }
    }

    const failed = toJsonSchema(t.object({
      token: t.symbol
    }));

    expect(failed.ok).toBe(false);
    expect(Object.isFrozen(failed)).toBe(true);
    if (!failed.ok) {
      const issue = failed.error[0];
      expect(Object.isFrozen(failed.error)).toBe(true);
      expect(issue).not.toBeUndefined();
      if (issue !== undefined) {
        expect(Object.isFrozen(issue)).toBe(true);
        expect(Object.isFrozen(issue.path)).toBe(true);
      }
    }
  });
});
