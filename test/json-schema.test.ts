import { describe, expect, test } from "vitest";
import {
    compile,
    compileAsync,
    fromJSONSchema,
    fromJsonSchema,
    registry,
    schemaToJsonSchema,
    t,
    toJSONSchema,
    toJsonSchema,
    type Guard,
    type GlobalRegistryMetadata,
    type JsonSchemaObject,
    type JsonSchemaRegistryDocument,
    type JsonSchemaUnrepresentableMode,
    type Schema
} from "../src/index.js";
import { SchemaTag } from "../src/kind/index.js";

const UUID_PATTERN_SOURCE =
    "^(?:00000000-0000-0000-0000-000000000000|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$";
const XID_PATTERN_SOURCE = "^[0-9a-vA-V]{20}$";
const KSUID_PATTERN_SOURCE = "^[A-Za-z0-9]{27}$";
const OPEN_UNREPRESENTABLE = "ANY".toLowerCase() as JsonSchemaUnrepresentableMode;

interface JsonSchemaNode {
    readonly value: string;
    readonly children: readonly JsonSchemaNode[];
}

describe("JSON Schema export", () => {
    test("imports representable JSON Schema fragments as guards", () => {
        const imported = fromJsonSchema({
            type: "object",
            properties: {
                id: {
                    type: "string",
                    format: "uuid"
                },
                xid: {
                    type: "string",
                    format: "xid"
                },
                ksuid: {
                    type: "string",
                    format: "ksuid"
                },
                age: {
                    type: "integer",
                    minimum: 0
                },
                role: {
                    enum: ["admin", "user"]
                },
                tags: {
                    type: "array",
                    items: {
                        type: "string",
                        minLength: 1
                    },
                    minItems: 1
                }
            },
            required: ["id", "xid", "ksuid", "age", "role", "tags"],
            additionalProperties: false
        });

        expect(imported.ok).toBe(true);
        if (!imported.ok) {
            return;
        }
        expect(imported.value.is({
            id: "550e8400-e29b-41d4-a716-446655440000",
            xid: "9m4e2mr0ui3e8a215n4g",
            ksuid: "0ujtsYcgvSTl8PAuAdqWYSMnLOv",
            age: 42,
            role: "admin",
            tags: ["core"]
        })).toBe(true);
        expect(imported.value.is({
            id: "not-a-uuid",
            age: -1,
            role: "guest",
            tags: [],
            extra: true
        })).toBe(false);
        expect(fromJSONSchema(true)).toEqual({
            ok: true,
            value: t.unknown
        });
        expect(t.fromJsonSchema(false)).toEqual({
            ok: true,
            value: t.never
        });
    });

    test("returns import issues instead of weakening unsupported JSON Schema", () => {
        const pattern = fromJsonSchema({
            type: "string",
            pattern: "["
        });
        const external = fromJsonSchema({
            $ref: "https://example.com/user.schema.json"
        });
        const sibling = fromJsonSchema({
            $ref: "#/$defs/Text",
            minLength: 1,
            $defs: {
                Text: {
                    type: "string"
                }
            }
        });

        expect(pattern.ok).toBe(false);
        if (!pattern.ok) {
            expect(pattern.error.map((issue) => [issue.path, issue.code])).toEqual([
                [["pattern"], "invalid_schema"]
            ]);
        }
        expect(external.ok).toBe(false);
        if (!external.ok) {
            expect(external.error.map((issue) => [issue.path, issue.code])).toEqual([
                [["$ref"], "unsupported_keyword"]
            ]);
        }
        expect(sibling.ok).toBe(false);
        if (!sibling.ok) {
            expect(sibling.error.map((issue) => [issue.path, issue.code])).toEqual([
                [["minLength"], "unsupported_keyword"]
            ]);
        }
    });

    test("imports JSON Schema string patterns", () => {
        const Code = fromJsonSchema({
            type: "string",
            pattern: "^TS-[0-9]+$",
            minLength: 4
        });
        const Emailish = fromJsonSchema({
            type: "string",
            format: "email",
            pattern: "@example\\.com$"
        });

        expect(Code.ok).toBe(true);
        if (Code.ok) {
            expect(Code.value.is("TS-42")).toBe(true);
            expect(Code.value.is("JS-42")).toBe(false);
            expect(Code.value.is("TS-")).toBe(false);
        }
        expect(Emailish.ok).toBe(true);
        if (Emailish.ok) {
            expect(Emailish.value.is("ada@example.com")).toBe(true);
            expect(Emailish.value.is("ada@other.test")).toBe(false);
            expect(Emailish.value.is("@example.com")).toBe(false);
        }
    });

    test("rejects malformed JSON Schema string patterns", () => {
        const sources = [
            "[",
            "[z-a]",
            "a{2,1}",
            "(?",
            "\\",
            "\\b*",
            "(?i:abc)"
        ];

        for (let index = 0; index < sources.length; index += 1) {
            const source = sources[index];
            const imported = fromJsonSchema({
                type: "string",
                pattern: source
            });

            expect(imported.ok).toBe(false);
            if (!imported.ok) {
                expect(imported.error).toContainEqual({
                    path: ["pattern"],
                    code: "invalid_schema",
                    message: "pattern must be a valid RegExp source"
                });
            }
        }
    });

    test("imports JSON Schema object property-count bounds", () => {
        const imported = fromJsonSchema({
            type: "object",
            properties: {
                id: { type: "string" },
                name: { type: "string" },
                active: { type: "boolean" }
            },
            minProperties: 2,
            maxProperties: 3,
            additionalProperties: true
        });

        expect(imported.ok).toBe(true);
        if (!imported.ok) {
            return;
        }

        const Fast = compile(imported.value);
        const valid = {
            id: "u_1",
            name: "Ada"
        };
        const tooSmall = {
            id: "u_1"
        };
        const tooLarge = {
            id: "u_1",
            name: "Ada",
            active: true,
            extra: 1
        };
        const exported = toJsonSchema(imported.value);

        expect(imported.value.is(valid)).toBe(true);
        expect(Fast.is(valid)).toBe(true);
        expect(imported.value.is(tooSmall)).toBe(false);
        expect(Fast.is(tooSmall)).toBe(false);
        expect(imported.value.is(tooLarge)).toBe(false);
        expect(Fast.is(tooLarge)).toBe(false);
        expect(imported.value.check(tooSmall)).toMatchObject({
            ok: false,
            error: [
                {
                    code: "expected_key_count",
                    expected: "at least 2 properties",
                    actual: "1 properties"
                }
            ]
        });
        expect(exported.ok).toBe(true);
        if (exported.ok) {
            expect(exported.value).toMatchObject({
                type: "object",
                minProperties: 2,
                maxProperties: 3
            });
        }
    });

    test("imports JSON Schema object property-name schemas", () => {
        const imported = fromJsonSchema({
            type: "object",
            propertyNames: {
                type: "string",
                pattern: "^[a-z_]+$",
                minLength: 2
            },
            additionalProperties: {
                type: "number"
            }
        });

        expect(imported.ok).toBe(true);
        if (!imported.ok) {
            return;
        }

        const Fast = compile(imported.value, { name: "jsonSchemaPropertyNames" });
        const valid = {
            user_id: 1,
            score: 2
        };
        const badName = {
            A: 1
        };
        const badValue = {
            score: "2"
        };
        const exported = toJsonSchema(imported.value);

        expect(imported.value.is(valid)).toBe(true);
        expect(Fast.is(valid)).toBe(true);
        expect(imported.value.is(badName)).toBe(false);
        expect(Fast.is(badName)).toBe(false);
        expect(imported.value.is(badValue)).toBe(false);
        expect(Fast.is(badValue)).toBe(false);
        const slowCheck = imported.value.check(badName);
        const fastCheck = Fast.check(badName);
        expect(slowCheck.ok).toBe(false);
        if (!slowCheck.ok) {
            expect(slowCheck.error).toContainEqual(expect.objectContaining({
                path: ["A"]
            }));
        }
        expect(fastCheck.ok).toBe(false);
        if (!fastCheck.ok) {
            expect(fastCheck.error).toContainEqual(expect.objectContaining({
                path: ["A"]
            }));
        }
        expect(exported.ok).toBe(true);
        if (exported.ok) {
            expect(exported.value).toMatchObject({
                type: "object",
                propertyNames: {
                    type: "string",
                    minLength: 2
                }
            });
        }
    });

    test("imports JSON Schema object pattern-property schemas", () => {
        const imported = fromJsonSchema({
            type: "object",
            properties: {
                fixed: { type: "string" }
            },
            required: ["fixed"],
            patternProperties: {
                "^s_": { type: "string" },
                "^n_": { type: "number" }
            },
            additionalProperties: false
        });

        expect(imported.ok).toBe(true);
        if (!imported.ok) {
            return;
        }

        const Fast = compile(imported.value, { name: "jsonSchemaPatternProperties" });
        const valid = {
            fixed: "ok",
            s_name: "Ada",
            n_score: 1
        };
        const invalidPatternValue = {
            fixed: "ok",
            s_name: 1
        };
        const invalidExtra = {
            fixed: "ok",
            other: true
        };
        const exported = toJsonSchema(imported.value);

        expect(imported.value.is(valid)).toBe(true);
        expect(Fast.is(valid)).toBe(true);
        expect(imported.value.is(invalidPatternValue)).toBe(false);
        expect(Fast.is(invalidPatternValue)).toBe(false);
        expect(imported.value.is(invalidExtra)).toBe(false);
        expect(Fast.is(invalidExtra)).toBe(false);
        expect(imported.value.check(invalidPatternValue)).toMatchObject({
            ok: false,
            error: [
                {
                    path: ["s_name"],
                    code: "expected_string"
                }
            ]
        });
        expect(imported.value.check(invalidExtra)).toMatchObject({
            ok: false,
            error: [
                {
                    path: ["other"],
                    code: "unrecognized_key"
                }
            ]
        });
        expect(exported.ok).toBe(true);
        if (exported.ok) {
            expect(exported.value).toMatchObject({
                type: "object",
                patternProperties: {
                    "^s_": {
                        type: "string"
                    },
                    "^n_": {
                        type: "number"
                    }
                },
                additionalProperties: false
            });
        }
    });

    test("applies JSON Schema pattern properties before additionalProperties schemas", () => {
        const imported = fromJsonSchema({
            type: "object",
            patternProperties: {
                "^id_": { type: "string", minLength: 2 }
            },
            additionalProperties: {
                type: "boolean"
            }
        });

        expect(imported.ok).toBe(true);
        if (!imported.ok) {
            return;
        }

        expect(imported.value.is({
            id_user: "ab",
            active: true
        })).toBe(true);
        expect(imported.value.is({
            id_user: true
        })).toBe(false);
        expect(imported.value.is({
            count: 1
        })).toBe(false);
    });

    test("composes object count, property-name, and pattern-property rules", () => {
        const imported = fromJsonSchema({
            type: "object",
            minProperties: 1,
            maxProperties: 2,
            propertyNames: {
                type: "string",
                pattern: "^x_"
            },
            patternProperties: {
                "^x_": { type: "number" }
            },
            additionalProperties: false
        });

        expect(imported.ok).toBe(true);
        if (!imported.ok) {
            return;
        }
        const Fast = compile(imported.value, { name: "composedObjectKeywords" });
        const valid = { x_id: 1 };
        const values: readonly unknown[] = [
            valid,
            {},
            { bad: 1 },
            { x_id: "1" },
            { x_a: 1, x_b: 2, x_c: 3 }
        ];

        expect(imported.value.is(valid)).toBe(true);
        expect(Fast.is(valid)).toBe(true);
        for (let index = 1; index < values.length; index += 1) {
            expect(imported.value.is(values[index])).toBe(false);
            expect(Fast.is(values[index])).toBe(false);
        }
        const exported = toJsonSchema(imported.value);
        expect(exported.ok).toBe(true);
        if (exported.ok) {
            expect(exported.value).toMatchObject({
                minProperties: 1,
                maxProperties: 2,
                propertyNames: { pattern: "^x_" },
                patternProperties: {
                    "^x_": { type: "number" }
                },
                additionalProperties: false
            });
        }
    });

    test("treats decimal JSON Schema multiples mathematically", async () => {
        const imported = fromJsonSchema({
            type: "number",
            multipleOf: 0.1
        });

        expect(imported.ok).toBe(true);
        if (!imported.ok) {
            return;
        }
        const Fast = compile(imported.value, { name: "decimalMultiple" });
        const Async = compileAsync(imported.value, {
            name: "asyncDecimalMultiple",
            yieldEvery: 1,
            yieldTimeout: 0
        });
        const Nested = compile(t.object({
            value: t.number.multipleOf(0.1)
        }), { name: "nestedDecimalMultiple" });
        const Deep = compile(t.array(t.object({
            value: t.number.multipleOf(0.1)
        })), { name: "deepDecimalMultiple" });

        expect(imported.value.is(0.3)).toBe(true);
        expect(Fast.is(0.3)).toBe(true);
        expect(imported.value.check(0.3).ok).toBe(true);
        expect(Fast.check(0.3).ok).toBe(true);
        expect(Fast.checkFirst(0.3).ok).toBe(true);
        expect(await Async.is(0.3)).toBe(true);
        expect((await Async.check(0.3)).ok).toBe(true);
        expect(Nested.check({ value: 0.3 }).ok).toBe(true);
        expect(Nested.checkFirst({ value: 0.3 }).ok).toBe(true);
        expect(Deep.check([{ value: 0.3 }]).ok).toBe(true);
        expect(Deep.checkFirst([{ value: 0.3 }]).ok).toBe(true);
        expect(imported.value.is(0.31)).toBe(false);
        expect(Fast.is(0.31)).toBe(false);
    });

    test("rejects invalid JSON Schema object property-count bounds", () => {
        const negative = fromJsonSchema({
            type: "object",
            minProperties: -1
        });
        const inverted = fromJsonSchema({
            type: "object",
            minProperties: 3,
            maxProperties: 2
        });

        expect(negative.ok).toBe(false);
        if (!negative.ok) {
            expect(negative.error.map((issue) => [issue.path, issue.code])).toEqual([
                [["minProperties"], "invalid_schema"]
            ]);
        }
        expect(inverted.ok).toBe(false);
        if (!inverted.ok) {
            expect(inverted.error.map((issue) => [issue.path, issue.code])).toEqual([
                [["minProperties"], "invalid_schema"]
            ]);
        }
    });

    test("rejects invalid JSON Schema object pattern-property schemas", () => {
        const imported = fromJsonSchema({
            type: "object",
            patternProperties: {
                "[": {
                    type: "string"
                }
            }
        });

        expect(imported.ok).toBe(false);
        if (!imported.ok) {
            expect(imported.error.map((issue) => [issue.path, issue.code])).toEqual([
                [["patternProperties", "["], "invalid_schema"]
            ]);
        }
    });

    test("rejects invalid JSON Schema object property-name schemas", () => {
        const imported = fromJsonSchema({
            type: "object",
            propertyNames: {
                type: "string",
                pattern: "["
            }
        });

        expect(imported.ok).toBe(false);
        if (!imported.ok) {
            expect(imported.error.map((issue) => [issue.path, issue.code])).toEqual([
                [["propertyNames", "pattern"], "invalid_schema"]
            ]);
        }
    });

    test("imports internal JSON Schema refs and recursive defs", () => {
        const User = fromJsonSchema({
            $ref: "#/$defs/User",
            $defs: {
                User: {
                    type: "object",
                    properties: {
                        id: {
                            type: "string",
                            minLength: 1
                        }
                    },
                    required: ["id"],
                    additionalProperties: false
                }
            }
        });
        const Node = fromJsonSchema({
            $ref: "#/$defs/Node",
            $defs: {
                Node: {
                    type: "object",
                    properties: {
                        value: {
                            type: "string"
                        },
                        next: {
                            anyOf: [
                                { $ref: "#/$defs/Node" },
                                { type: "null" }
                            ]
                        }
                    },
                    required: ["value"],
                    additionalProperties: false
                }
            }
        });

        expect(User.ok).toBe(true);
        if (User.ok) {
            expect(User.value.is({ id: "u_1" })).toBe(true);
            expect(User.value.is({ id: "" })).toBe(false);
            expect(User.value.is({ id: "u_1", extra: true })).toBe(false);
        }
        expect(Node.ok).toBe(true);
        if (Node.ok) {
            expect(Node.value.is({
                value: "a",
                next: {
                    value: "b",
                    next: null
                }
            })).toBe(true);
            expect(Node.value.is({
                value: "a",
                next: {
                    value: 1
                }
            })).toBe(false);
        }
    });

    test("exports representable schemas without losing optional-key semantics", () => {
        const User = t.strictObject({
            id: t.string.uuid(),
            xid: t.xid(),
            ksuid: t.ksuid(),
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
                    xid: {
                        type: "string",
                        format: "xid",
                        pattern: XID_PATTERN_SOURCE
                    },
                    ksuid: {
                        type: "string",
                        format: "ksuid",
                        pattern: KSUID_PATTERN_SOURCE
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
                required: ["id", "xid", "ksuid", "age", "role", "score", "tags", "meta", "point"],
                additionalProperties: false
            });
        }
    });

    test("accepts Zod-style JSON Schema target aliases", () => {
        const Tuple = t.tuple([t.string, t.number]);
        const latest = toJsonSchema(Tuple, {
            target: "draft-2020-12"
        });
        const latestAlias = toJSONSchema(Tuple, {
            target: "draft-2020-12"
        });
        const draft7 = toJsonSchema(Tuple, {
            target: "draft-7"
        });
        const draft4 = toJsonSchema(Tuple, {
            target: "draft-4"
        });

        expect(latest.ok).toBe(true);
        expect(latestAlias).toEqual(latest);
        if (latest.ok) {
            expect(latest.value).toEqual({
                $schema: "https://json-schema.org/draft/2020-12/schema",
                type: "array",
                prefixItems: [
                    { type: "string" },
                    { type: "number" }
                ],
                minItems: 2,
                maxItems: 2
            });
        }
        expect(draft7.ok).toBe(true);
        if (draft7.ok) {
            expect(draft7.value).toEqual({
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
        }
        expect(draft4.ok).toBe(true);
        if (draft4.ok) {
            expect(draft4.value).toEqual({
                $schema: "http://json-schema.org/draft-04/schema#",
                type: "array",
                items: [
                    { type: "string" },
                    { type: "number" }
                ],
                additionalItems: false,
                minItems: 2,
                maxItems: 2
            });
        }
        expect(() => toJsonSchema(Tuple, {
            dialect: "draft-07",
            target: "draft-2020-12"
        })).toThrow(TypeError);
    });

    test("emits draft-04 JSON Schema keywords losslessly", () => {
        const Role = toJsonSchema(t.union(t.literal("admin"), t.literal("user")), {
            target: "draft-04"
        });
        const Score = toJsonSchema(t.number.gte(10).gt(5).lt(20).lte(30), {
            target: "draft-04"
        });
        const Never = toJsonSchema(t.never, {
            target: "draft-04"
        });

        expect(Role.ok).toBe(true);
        if (Role.ok) {
            expect(Role.value).toEqual({
                $schema: "http://json-schema.org/draft-04/schema#",
                anyOf: [
                    { enum: ["admin"] },
                    { enum: ["user"] }
                ]
            });
        }
        expect(Score.ok).toBe(true);
        if (Score.ok) {
            expect(Score.value).toEqual({
                $schema: "http://json-schema.org/draft-04/schema#",
                type: "number",
                minimum: 10,
                maximum: 20,
                exclusiveMaximum: true
            });
        }
        expect(Never.ok).toBe(true);
        if (Never.ok) {
            expect(Never.value).toEqual({
                $schema: "http://json-schema.org/draft-04/schema#",
                not: {}
            });
        }
    });

    test("imports draft-04 boolean exclusive bounds and false schemas", () => {
        const NumberSchema = fromJsonSchema({
            type: "number",
            minimum: 1,
            exclusiveMinimum: true,
            maximum: 5,
            exclusiveMaximum: true
        });
        const FalseSchema = fromJsonSchema({
            not: {}
        });

        expect(NumberSchema.ok).toBe(true);
        if (NumberSchema.ok) {
            expect(NumberSchema.value.is(1)).toBe(false);
            expect(NumberSchema.value.is(3)).toBe(true);
            expect(NumberSchema.value.is(5)).toBe(false);
        }
        expect(FalseSchema.ok).toBe(true);
        if (FalseSchema.ok) {
            expect(FalseSchema.value.is(null)).toBe(false);
        }
    });

    test("rejects draft-04 exports that would lose semantics", () => {
        const KeyedRecord = toJsonSchema(t.record(t.string.min(1), t.number), {
            target: "draft-04"
        });

        expect(KeyedRecord.ok).toBe(false);
        if (!KeyedRecord.ok) {
            expect(KeyedRecord.error[0]?.code).toBe("unsupported_target");
        }
        expect(() => toJsonSchema(t.string, {
            dialect: "draft-07",
            target: "draft-04"
        })).toThrow(TypeError);
    });

    test("emits the lossless OpenAPI 3.0 subset", () => {
        const User = t.strictObject({
            id: t.string.uuid(),
            role: t.literal("admin"),
            nickname: t.optional(t.nullable(t.string.min(1))),
            score: t.nullable(t.number.gte(0))
        });
        const result = toJsonSchema(User, {
            target: "openapi-3.0"
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.value).toEqual({
            type: "object",
            properties: {
                id: {
                    type: "string",
                    format: "uuid",
                    pattern: UUID_PATTERN_SOURCE
                },
                role: {
                    enum: ["admin"]
                },
                nickname: {
                    type: "string",
                    minLength: 1,
                    nullable: true
                },
                score: {
                    type: "number",
                    minimum: 0,
                    nullable: true
                }
            },
            required: ["id", "role", "score"],
            additionalProperties: false
        });
    });

    test("rejects OpenAPI 3.0 exports that would lose semantics", () => {
        const Tuple = toJsonSchema(t.tuple([t.string, t.number]), {
            target: "openapi-3.0"
        });
        const KeyedRecord = toJsonSchema(t.record(t.string.min(1), t.number), {
            target: "openapi-3.0"
        });
        const Never = toJsonSchema(t.never, {
            target: "openapi-3.0"
        });

        expect(Tuple.ok).toBe(false);
        if (!Tuple.ok) {
            expect(Tuple.error[0]?.code).toBe("unsupported_target");
        }
        expect(KeyedRecord.ok).toBe(false);
        if (!KeyedRecord.ok) {
            expect(KeyedRecord.error[0]?.code).toBe("unsupported_target");
        }
        expect(Never.ok).toBe(false);
        if (!Never.ok) {
            expect(Never.error[0]?.code).toBe("unsupported_target");
        }
        expect(() => toJsonSchema(t.string, {
            schemaId: "https://example.com/schema",
            target: "openapi-3.0"
        })).toThrow(TypeError);
    });

    test("preserves repeated scalar constraints as intersections", () => {
        const Schema = t.strictObject({
            name: t.string.min(5).min(1).max(10).max(7),
            token: t.string.regex(/^A+$/, "letters").regex(/^.{6,}$/, "length"),
            count: t.number.gte(10).gte(1).lte(20).lte(12)
        });
        const result = toJsonSchema(Schema);

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.value).toEqual({
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
                name: {
                    type: "string",
                    minLength: 5,
                    maxLength: 7
                },
                token: {
                    type: "string",
                    allOf: [
                        { pattern: "^A+$" },
                        { pattern: "^.{6,}$" }
                    ]
                },
                count: {
                    type: "number",
                    minimum: 10,
                    maximum: 12
                }
            },
            required: ["name", "token", "count"],
            additionalProperties: false
        });
    });

    test("exports record key schemas as propertyNames", () => {
        const result = toJsonSchema(
            t.record(t.string.min(3), t.number.int())
        );

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.value).toEqual({
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            additionalProperties: {
                type: "integer"
            },
            propertyNames: {
                type: "string",
                minLength: 3
            }
        });
    });

    test("exports exhaustive literal record keys as required properties", () => {
        const result = toJsonSchema(
            t.record(t.literal(["id", "name"] as const), t.string)
        );

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.value).toEqual({
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            additionalProperties: {
                type: "string"
            },
            required: ["id", "name"],
            propertyNames: {
                anyOf: [
                    { const: "id" },
                    { const: "name" }
                ]
            }
        });
    });

    test("exports file schemas as OpenAPI-friendly binary string schemas", () => {
        const Upload = t.file()
            .min(1)
            .max(1_048_576)
            .mime("image/png");
        const result = toJsonSchema(Upload);

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.value).toEqual({
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "string",
            format: "binary",
            contentEncoding: "binary",
            contentMediaType: "image/png",
            minLength: 1,
            maxLength: 1_048_576
        });
    });

    test("exports multiple file MIME annotations as binary alternatives", () => {
        const Upload = t.file()
            .max(8)
            .mime(["text/plain", "image/*"]);
        const result = toJsonSchema(Upload);

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.value).toEqual({
            $schema: "http://json-schema.org/draft-07/schema#",
            anyOf: [
                {
                    type: "string",
                    format: "binary",
                    contentEncoding: "binary",
                    maxLength: 8,
                    contentMediaType: "text/plain"
                },
                {
                    type: "string",
                    format: "binary",
                    contentEncoding: "binary",
                    maxLength: 8,
                    contentMediaType: "image/*"
                }
            ]
        });
    });

    test("returns explicit errors for schemas JSON Schema cannot represent", () => {
        const Schema = t.object({
            ok: t.string,
            missing: t.undefinedable(t.string),
            token: t.symbol,
            amount: t.bigint,
            refined: t.number.refine((value) => value > 0, "positive"),
            frozen: t.object({ name: t.string }).readonly(),
            upload: t.file().max(1024).mime("text/plain"),
            superRefined: t.string.superRefine((value, context) => {
                if (value.length === 0) {
                    context.addIssue();
                }
            }, "non_empty")
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
                [["refined"], "unsupported_child"],
                [["frozen"], "unsupported_readonly"],
                [["frozen"], "unsupported_child"],
                [["superRefined"], "unsupported_refine"],
                [["superRefined"], "unsupported_child"]
            ]);
        }
    });

    test("can lower unrepresentable schemas to open JSON Schema fragments", () => {
        const Schema = t.strictObject({
            ok: t.string.min(1),
            token: t.symbol,
            list: t.array(t.union(t.string, t.symbol)),
            refined: t.number.refine((value) => value > 0, "positive"),
            missing: t.undefinedable(t.string)
        });

        const result = toJsonSchema(Schema, {
            unrepresentable: OPEN_UNREPRESENTABLE
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.value).toEqual({
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
                ok: {
                    type: "string",
                    minLength: 1
                },
                token: {},
                list: {
                    type: "array",
                    items: {
                        anyOf: [
                            { type: "string" },
                            {}
                        ]
                    }
                },
                refined: {},
                missing: {}
            },
            required: ["ok", "token", "list", "refined", "missing"],
            additionalProperties: false
        });
    });

    test("allows JSON Schema override callbacks to mutate emitted fragments", () => {
        const result = toJsonSchema(t.object({
            name: t.string.min(1)
        }), {
            override: (context) => {
                if (context.path.length === 0) {
                    context.jsonSchema.description = "root schema";
                    context.jsonSchema["x-typesea-target"] = context.target;
                }
                if (context.path[0] === "name") {
                    context.jsonSchema.title = "Display name";
                }
            }
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.value).toEqual({
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            description: "root schema",
            "x-typesea-target": "draft-07",
            properties: {
                name: {
                    type: "string",
                    minLength: 1,
                    title: "Display name"
                }
            },
            required: ["name"],
            additionalProperties: true
        });
    });

    test("can override explicitly weakened unrepresentable fragments", () => {
        const result = toJsonSchema(t.object({
            createdAt: t.date
        }), {
            unrepresentable: OPEN_UNREPRESENTABLE,
            override: (context) => {
                if (context.path[0] === "createdAt") {
                    context.jsonSchema.type = "string";
                    context.jsonSchema.format = "date-time";
                }
            }
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.value).toEqual({
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
                createdAt: {
                    type: "string",
                    format: "date-time"
                }
            },
            required: ["createdAt"],
            additionalProperties: true
        });
    });

    test("exports id-bearing registry entries as an interlinked schema bundle", () => {
        const docs = registry<GlobalRegistryMetadata>();
        const User = t.object({
            name: t.string.min(1)
        });
        const Post = t.object({
            title: t.string,
            author: User
        });
        const Unnamed = t.object({
            ignored: t.boolean
        });
        docs.add(User, {
            id: "User",
            title: "User",
            description: "Application user"
        });
        docs.add(Post, {
            id: "Post",
            title: "Post"
        });
        docs.add(Unnamed, {
            title: "No id"
        });

        const result = toJSONSchema(docs, {
            uri: (id) => `https://schemas.example/${id}.json`
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.value).toEqual({
            schemas: {
                User: {
                    $id: "https://schemas.example/User.json",
                    type: "object",
                    title: "User",
                    description: "Application user",
                    properties: {
                        name: {
                            type: "string",
                            minLength: 1
                        }
                    },
                    required: ["name"],
                    additionalProperties: true
                },
                Post: {
                    $id: "https://schemas.example/Post.json",
                    type: "object",
                    title: "Post",
                    properties: {
                        title: {
                            type: "string"
                        },
                        author: {
                            $ref: "https://schemas.example/User.json"
                        }
                    },
                    required: ["title", "author"],
                    additionalProperties: true
                }
            }
        } satisfies JsonSchemaRegistryDocument);
    });

    test("uses registry metadata while exporting one JSON Schema document", () => {
        const docs = registry<GlobalRegistryMetadata>();
        const SharedName = t.string.min(1);
        const User = t.object({
            first: SharedName,
            last: SharedName
        });
        docs.add(User, {
            id: "User",
            title: "User",
            deprecated: true,
            "x-kind": "entity"
        });
        docs.add(SharedName, {
            id: "SharedName",
            title: "Shared name"
        });

        const result = toJsonSchema(User, {
            metadata: docs,
            uri: (id) => `https://schemas.example/${id}.json`
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.value).toEqual({
            $schema: "http://json-schema.org/draft-07/schema#",
            $id: "https://schemas.example/User.json",
            type: "object",
            title: "User",
            deprecated: true,
            "x-kind": "entity",
            properties: {
                first: {
                    $ref: "#/definitions/SharedName"
                },
                last: {
                    $ref: "#/definitions/SharedName"
                }
            },
            required: ["first", "last"],
            additionalProperties: true,
            definitions: {
                SharedName: {
                    $id: "https://schemas.example/SharedName.json",
                    type: "string",
                    title: "Shared name",
                    minLength: 1
                }
            }
        });
    });

    test("rejects duplicate registry ids and can clear registry entries", () => {
        const docs = registry<GlobalRegistryMetadata>();
        const First = t.string;
        const Second = t.number;

        docs.add(First, {
            id: "Duplicate"
        });

        expect(() => docs.add(Second, {
            id: "Duplicate"
        })).toThrow("Registry metadata id Duplicate is already registered");

        expect(docs.entries()).toHaveLength(1);
        docs.clear();
        expect(docs.entries()).toEqual([]);
        expect(docs.has(First)).toBe(false);

        docs.add(Second, {
            id: "Duplicate"
        });
        expect(docs.has(Second)).toBe(true);
    });

    test("keeps target-incompatible exports fail-closed with unrepresentable fallback", () => {
        const result = toJsonSchema(t.tuple([t.string, t.number]), {
            target: "openapi-3.0",
            unrepresentable: OPEN_UNREPRESENTABLE
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error[0]?.code).toBe("unsupported_target");
        }
    });

    test("can lower decoder exports to an open document when explicitly requested", () => {
        const Decoder = t.string.transform((value) => value.length);
        const result = toJsonSchema(Decoder, {
            unrepresentable: OPEN_UNREPRESENTABLE
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value).toEqual({
                $schema: "http://json-schema.org/draft-07/schema#"
            });
        }
    });

    test("maps metadata ids through the JSON Schema uri option", () => {
        const User = t.object({
            id: t.string.uuid().meta({ id: "UserId" })
        }).meta({ id: "User" });
        const result = toJSONSchema(User, {
            uri: (id) => `https://schemas.example/${id}.json`
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.value).toEqual({
            $schema: "http://json-schema.org/draft-07/schema#",
            $id: "https://schemas.example/User.json",
            type: "object",
            properties: {
                id: {
                    $id: "https://schemas.example/UserId.json",
                    type: "string",
                    format: "uuid",
                    pattern: UUID_PATTERN_SOURCE
                }
            },
            required: ["id"],
            additionalProperties: true
        });
    });

    test("extracts reused schema identities as draft definitions", () => {
        const Name = t.string.min(1).meta({ id: "Name" });
        const User = t.object({
            first: Name,
            last: Name
        });
        const result = toJSONSchema(User, {
            reused: "ref",
            uri: (id) => `https://schemas.example/${id}.json`
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.value).toEqual({
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
                first: {
                    $ref: "#/definitions/Name"
                },
                last: {
                    $ref: "#/definitions/Name"
                }
            },
            required: ["first", "last"],
            additionalProperties: true,
            definitions: {
                Name: {
                    $id: "https://schemas.example/Name.json",
                    type: "string",
                    minLength: 1
                }
            }
        });
    });

    test("uses $defs for reused schema identities on draft 2020-12", () => {
        const Token = t.string.max(8).meta({ id: "Token" });
        const Pair = t.tuple([Token, Token]);
        const result = toJsonSchema(Pair, {
            target: "draft-2020-12",
            reused: "ref"
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.value).toEqual({
            $schema: "https://json-schema.org/draft/2020-12/schema",
            type: "array",
            prefixItems: [
                {
                    $ref: "#/$defs/Token"
                },
                {
                    $ref: "#/$defs/Token"
                }
            ],
            minItems: 2,
            maxItems: 2,
            $defs: {
                Token: {
                    $id: "Token",
                    type: "string",
                    maxLength: 8
                }
            }
        });
    });

    test("keeps reused refs fail-closed for OpenAPI targets", () => {
        const Shared = t.string.min(1);
        const result = toJsonSchema(t.object({
            left: Shared,
            right: Shared
        }), {
            target: "openapi-3.0",
            reused: "ref"
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toEqual([
                {
                    path: [],
                    code: "unsupported_target",
                    message: "OpenAPI 3.0 cannot represent extracted schema references losslessly"
                }
            ]);
        }
    });

    test("emits recursive lazy schemas with local cycle refs", () => {
        const Node: Guard<JsonSchemaNode> = t.lazy((): Guard<JsonSchemaNode> =>
            t.object({
                value: t.string.min(1),
                children: t.array(Node)
            })
        );
        const result = toJsonSchema(Node);

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.value).toEqual({
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
                value: {
                    type: "string",
                    minLength: 1
                },
                children: {
                    type: "array",
                    items: {
                        $ref: "#"
                    }
                }
            },
            required: ["value", "children"],
            additionalProperties: true
        });
    });

    test("emits nested recursive lazy schemas with JSON Pointer refs", () => {
        const Node: Guard<JsonSchemaNode> = t.lazy((): Guard<JsonSchemaNode> =>
            t.object({
                value: t.string,
                children: t.array(Node)
            })
        );
        const Forest = t.object({
            root: Node
        });
        const result = toJsonSchema(Forest);

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.value).toEqual({
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
                root: {
                    type: "object",
                    properties: {
                        value: {
                            type: "string"
                        },
                        children: {
                            type: "array",
                            items: {
                                $ref: "#/properties/root"
                            }
                        }
                    },
                    required: ["value", "children"],
                    additionalProperties: true
                }
            },
            required: ["root"],
            additionalProperties: true
        });
    });

    test("keeps lazy JSON Schema export fail-closed when cycle refs are disabled", () => {
        const Node: Guard<JsonSchemaNode> = t.lazy((): Guard<JsonSchemaNode> =>
            t.object({
                value: t.string,
                children: t.array(Node)
            })
        );
        const result = toJsonSchema(Node, {
            cycles: "throw"
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toEqual([
                {
                    path: [],
                    code: "unsupported_lazy",
                    message: "Lazy schemas require JSON Schema cycle references"
                }
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

    test("restores patternProperties export paths after unsupported entries", () => {
        const schema = {
            tag: SchemaTag.PatternProperties,
            inner: t.object({}).schema,
            entries: [
                {
                    source: "^x_",
                    regex: /^x_/,
                    schema: t.symbol.schema
                },
                {
                    source: "^y_",
                    regex: /^y_/,
                    schema: t.symbol.schema
                }
            ],
            keys: [],
            keyLookup: Object.freeze(Object.create(null)) as Record<string, true>,
            additional: undefined,
            allowAdditional: true
        } as unknown as Schema;

        const result = schemaToJsonSchema(schema);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.map((issue) => [issue.path, issue.code])).toEqual([
                [["patternProperties", "^x_"], "unsupported_symbol"],
                [["patternProperties", "^y_"], "unsupported_symbol"]
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
        const numericDiscriminatedUnionSchema = {
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
        expect(() => looseSchemaToJsonSchema(numericDiscriminatedUnionSchema))
            .not.toThrow();
        expect(() => looseSchemaToJsonSchema(t.string.schema, 1)).toThrow(TypeError);
        expect(() => looseSchemaToJsonSchema(t.string.schema, { schemaId: 1 }))
            .toThrow(TypeError);
        expect(() => looseSchemaToJsonSchema(t.string.schema, { uri: 1 }))
            .toThrow(TypeError);
        expect(() => looseSchemaToJsonSchema(t.string.schema, { reused: "bad" }))
            .toThrow(TypeError);
        expect(() => looseSchemaToJsonSchema(t.string.schema, { cycles: "bad" }))
            .toThrow(TypeError);
        expect(() => looseSchemaToJsonSchema(t.string.schema, { override: 1 }))
            .toThrow(TypeError);
        expect(() => looseSchemaToJsonSchema(t.string.meta({ id: "Bad" }).schema, {
            uri: () => 1
        })).toThrow(TypeError);
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
