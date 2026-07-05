import { describe, expect, expectTypeOf, test } from "vitest";
import {
    compile,
    t,
    toJsonSchema,
    type CheckResult,
    type Infer,
    type InferDecoder,
    type JsonSchemaObject
} from "../src/index.js";

describe("Zod-like public features", () => {
    test("validates built-in string formats across interpreted and compiled guards", () => {
        const Formats = t.object({
            email: t.string.email(),
            url: t.string.url(),
            date: t.string.isoDate(),
            dateTime: t.string.isoDateTime(),
            ulid: t.string.ulid(),
            ipv4: t.string.ipv4(),
            ipv6: t.string.ipv6()
        });
        const FastFormats = compile(Formats, { name: "formats" });
        const valid = {
            email: "ada@example.com",
            url: "https://example.com/users/1",
            date: "2026-07-05",
            dateTime: "2026-07-05T10:30:45Z",
            ulid: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
            ipv4: "192.168.0.1",
            ipv6: "2001:db8::1"
        };
        const invalid = {
            ...valid,
            email: "not-an-email"
        };

        expect(Formats.is(valid)).toBe(true);
        expect(FastFormats.is(valid)).toBe(true);
        expect(Formats.is(invalid)).toBe(false);
        expect(FastFormats.is(invalid)).toBe(false);
        expect(Formats.check(invalid).ok).toBe(false);
    });

    test("validates Date objects across interpreted and compiled guards", () => {
        const Event = t.object({
            at: t.date
        });
        const Window = t.date
            .min(new Date("2026-01-01T00:00:00.000Z"))
            .max(new Date("2026-12-31T23:59:59.999Z"));
        const FastEvent = compile(Event, { name: "event_with_date" });
        const FastWindow = compile(Window, { name: "date_window" });
        const valid = {
            at: new Date("2026-07-05T00:00:00.000Z")
        };
        const invalid = {
            at: new Date(Number.NaN)
        };
        const hostile = new Date("2026-07-05T00:00:00.000Z");
        Object.defineProperty(hostile, "getTime", {
            value: () => Number.NaN
        });

        expect(Event.is(valid)).toBe(true);
        expect(FastEvent.is(valid)).toBe(true);
        expect(Window.is(valid.at)).toBe(true);
        expect(FastWindow.is(valid.at)).toBe(true);
        expect(Window.is(new Date("2025-12-31T23:59:59.999Z"))).toBe(false);
        expect(FastWindow.is(new Date("2027-01-01T00:00:00.000Z"))).toBe(false);
        expect(Event.is(invalid)).toBe(false);
        expect(FastEvent.is(invalid)).toBe(false);
        expect(Window.is(hostile)).toBe(true);
        expect(FastWindow.is(hostile)).toBe(true);
        expect(Event.check(invalid).ok).toBe(false);
        expect(FastEvent.checkFirst(invalid).ok).toBe(false);
    });

    test("supports tuple rest across interpreted, compiled, and JSON Schema paths", () => {
        const Row = t.tuple([t.literal("row")], t.number.int());
        const FastRow = compile(Row, { name: "tuple_rest_row" });
        const exported = toJsonSchema(Row);

        expectTypeOf<Infer<typeof Row>>()
            .toEqualTypeOf<readonly ["row", ...number[]]>();
        expect(Row.is(["row"])).toBe(true);
        expect(FastRow.is(["row", 1, 2, 3])).toBe(true);
        expect(Row.is([])).toBe(false);
        expect(FastRow.is(["row", 1.5])).toBe(false);
        expect(FastRow.check(["row", "bad"]).ok).toBe(false);
        expect(exported.ok).toBe(true);
        if (exported.ok) {
            expect(exported.value).toMatchObject({
                type: "array",
                minItems: 1
            });
        }
    });

    test("validates Map and Set containers with compiled fallback parity", () => {
        const Scores = t.map(t.string, t.number.int().gte(0));
        const Tags = t.set(t.string.nonempty());
        const FastScores = compile(Scores, { name: "score_map" });
        const FastTags = compile(Tags, { name: "tag_set" });

        expectTypeOf<Infer<typeof Scores>>()
            .toEqualTypeOf<ReadonlyMap<string, number>>();
        expectTypeOf<Infer<typeof Tags>>()
            .toEqualTypeOf<ReadonlySet<string>>();
        expect(Scores.is(new Map([["a", 1]]))).toBe(true);
        expect(FastScores.is(new Map([["a", 1]]))).toBe(true);
        expect(Scores.is(new Map([[1, 1]]))).toBe(false);
        expect(FastScores.is(new Map([["a", -1]]))).toBe(false);
        expect(Tags.is(new Set(["a", "b"]))).toBe(true);
        expect(FastTags.is(new Set(["a", "b"]))).toBe(true);
        expect(Tags.is(new Set([""]))).toBe(false);
        expect(FastTags.checkFirst(new Set([""])).ok).toBe(false);
    });

    test("supports instanceOf and own data property proofs", () => {
        class Box {
            public readonly id: string;

            public constructor(id: string) {
                this.id = id;
            }
        }

        const BoxGuard = t.instanceOf(Box).property("id", t.string.min(1));
        const FastBox = compile(BoxGuard, { name: "box_guard" });
        const good = new Box("b1");
        const bad = new Box("");
        const accessor = new Box("b1");
        Object.defineProperty(accessor, "id", {
            get: () => "b1"
        });

        expect(BoxGuard.is(good)).toBe(true);
        expect(FastBox.is(good)).toBe(true);
        expect(BoxGuard.is({ id: "b1" })).toBe(false);
        expect(FastBox.is(bad)).toBe(false);
        expect(BoxGuard.is(accessor)).toBe(false);
        expect(FastBox.check(accessor).ok).toBe(false);
    });

    test("supports null, undefined, void, nullish, JSON, and string decoder sugar", () => {
        const MaybeName = t.nullish(t.string.min(1));
        const Json = t.json();
        const TrimmedLower = t.string.trim().pipe(t.string.min(1)).transform((value) =>
            value.toLowerCase());

        expect(t.null.is(null)).toBe(true);
        expect(t.undefined.is(undefined)).toBe(true);
        expect(t.void.is(undefined)).toBe(true);
        expect(MaybeName.is(undefined)).toBe(true);
        expect(MaybeName.is(null)).toBe(true);
        expect(MaybeName.is("Ada")).toBe(true);
        expect(MaybeName.is("")).toBe(false);
        expect(Json.is({
            ok: true,
            values: [1, "two", null]
        })).toBe(true);
        expect(Json.is({
            bad: new Date()
        })).toBe(false);
        expect(TrimmedLower.decode("  ADA  ")).toEqual({
            ok: true,
            value: "ada"
        });
        expect(t.string.toUpperCase().decode("sea")).toEqual({
            ok: true,
            value: "SEA"
        });
    });

    test("validates exclusive number bounds and convenience aliases", () => {
        const Score = t.number.gt(0).lt(10).int();
        const Positive = t.number.positive();
        const Nonnegative = t.number.nonnegative();
        const EvenSafe = t.number.min(0).max(10).multipleOf(2).safe().finite();
        const Negative = t.number.negative();
        const Nonpositive = t.number.nonpositive();
        const FastScore = compile(Score, { name: "score" });
        const FastEvenSafe = compile(EvenSafe, { name: "even_safe" });

        expect(Score.is(5)).toBe(true);
        expect(FastScore.is(5)).toBe(true);
        expect(Score.check(0).ok).toBe(false);
        expect(Score.check(10).ok).toBe(false);
        expect(Positive.is(0)).toBe(false);
        expect(Positive.is(1)).toBe(true);
        expect(Nonnegative.is(0)).toBe(true);
        expect(EvenSafe.is(8)).toBe(true);
        expect(FastEvenSafe.is(8)).toBe(true);
        expect(EvenSafe.is(9)).toBe(false);
        expect(EvenSafe.check(9).ok && "unexpected").toBe(false);
        expect(FastEvenSafe.checkFirst(9).ok).toBe(false);
        expect(Negative.is(-1)).toBe(true);
        expect(Nonpositive.is(0)).toBe(true);
    });

    test("validates fixed string helpers across interpreted and compiled guards", () => {
        const Token = t.string
            .length(6)
            .startsWith("ts:")
            .includes(".")
            .endsWith("!");
        const FastToken = compile(Token, { name: "token" });

        expect(Token.is("ts:.x!")).toBe(true);
        expect(FastToken.is("ts:.x!")).toBe(true);
        expect(Token.is("js:.x!")).toBe(false);
        expect(FastToken.is("ts:xx!")).toBe(false);
        expect(t.string.nonempty().is("x")).toBe(true);
        expect(t.string.nonempty().is("")).toBe(false);
    });

    test("validates array length helpers across interpreted and compiled guards", () => {
        const Tags = t.array(t.string.min(1)).min(1).max(3);
        const Pair = t.array(t.number).length(2);
        const Nonempty = t.string.array().nonempty();
        const FastTags = compile(Tags, { name: "tags" });

        expect(Tags.is(["a", "b"])).toBe(true);
        expect(FastTags.is(["a", "b"])).toBe(true);
        expect(Tags.is([])).toBe(false);
        expect(FastTags.is([])).toBe(false);
        expect(Tags.is(["a", "b", "c", "d"])).toBe(false);
        expect(Pair.is([1, 2])).toBe(true);
        expect(Pair.is([1])).toBe(false);
        expect(Nonempty.is(["x"])).toBe(true);
        expect(Nonempty.is([])).toBe(false);
    });

    test("builds string enums with literal union inference", () => {
        const Role = t.enum(["admin", "user", "guest"]);
        const FastRole = compile(Role, { name: "role" });

        expectTypeOf<Infer<typeof Role>>().toEqualTypeOf<"admin" | "user" | "guest">();
        expect(Role.is("admin")).toBe(true);
        expect(FastRole.is("guest")).toBe(true);
        expect(Role.is("root")).toBe(false);
        expect(() => t.enum(["admin", "admin"])).toThrow(TypeError);
    });

    test("supports object safeExtend and required", () => {
        const Base = t.object({
            id: t.string,
            name: t.optional(t.string)
        });
        const Extended = Base.safeExtend({
            active: t.boolean
        });
        const Required = Extended.required();

        expectTypeOf<Infer<typeof Required>>().toEqualTypeOf<{
            readonly id: string;
            readonly name: string;
            readonly active: boolean;
        }>();
        expect(Extended.is({ id: "u1", active: true })).toBe(true);
        expect(Required.is({ id: "u1", active: true })).toBe(false);
        expect(Required.is({ id: "u1", name: "Ada", active: true })).toBe(true);
        expect(t.required(Extended).is({ id: "u1", name: "Ada", active: true })).toBe(true);
    });

    test("supports object merge, mode rewrites, and catchall validation", () => {
        const Base = t.object({
            id: t.string
        });
        const Strict = Base.strict();
        const Passthrough = Strict.passthrough();
        const Stripped = Strict.strip();
        const Catchall = Strict.catchall(t.number.int().multipleOf(2));
        const Merged = Base.merge(t.object({
            count: t.number.min(0)
        }));
        const FastCatchall = compile(Catchall, { name: "catchall_shape" });

        const valid = { id: "u1", score: 4 };
        const invalid = { id: "u1", score: 3 };
        const accessor = { id: "u1" } as { id: string; score?: number };
        Object.defineProperty(accessor, "score", {
            enumerable: true,
            get: () => 4
        });

        expect(Strict.is({ id: "u1", extra: true })).toBe(false);
        expect(Passthrough.is({ id: "u1", extra: true })).toBe(true);
        expect(Stripped.is({ id: "u1", extra: true })).toBe(true);
        expect(Catchall.is(valid)).toBe(true);
        expect(FastCatchall.is(valid)).toBe(true);
        expect(Catchall.is(invalid)).toBe(false);
        expect(FastCatchall.is(invalid)).toBe(false);
        expect(Catchall.is(accessor)).toBe(false);
        expect(FastCatchall.is(accessor)).toBe(false);
        expect(Catchall.checkFirst(invalid).ok).toBe(false);
        expect(FastCatchall.checkFirst(invalid).ok).toBe(false);
        expect(Merged.is({ id: "u1", count: 1 })).toBe(true);
        expect(t.merge(Base, t.object({ active: t.boolean })).is({
            id: "u1",
            active: true
        })).toBe(true);
        expect(t.catchall(Base, t.string).is({ id: "u1", tag: "ok" })).toBe(true);
    });

    test("supports mask pick, mask omit, and deepPartial", () => {
        const User = t.object({
            id: t.string,
            profile: t.object({
                name: t.string,
                address: t.object({
                    city: t.string
                })
            }),
            tags: t.array(t.object({
                label: t.string
            }))
        });
        const Picked = User.pick({
            id: true,
            profile: true
        });
        const Omitted = t.omit(User, {
            tags: true
        });
        const Deep = User.deepPartial();

        expectTypeOf<Infer<typeof Deep>>().toEqualTypeOf<{
            readonly id?: string;
            readonly profile?: {
                readonly name?: string;
                readonly address?: {
                    readonly city?: string;
                };
            };
            readonly tags?: {
                readonly label?: string;
            }[];
        }>();
        expect(Picked.is({
            id: "u1",
            profile: {
                name: "Ada",
                address: {
                    city: "Seoul"
                }
            }
        })).toBe(true);
        expect(Omitted.is({
            id: "u1",
            profile: {
                name: "Ada",
                address: {
                    city: "Seoul"
                }
            }
        })).toBe(true);
        expect(Deep.is({
            profile: {
                address: {}
            },
            tags: [{}]
        })).toBe(true);
        expect(() => User.pick({ missing: true } as unknown as { readonly id: true }))
            .toThrow(TypeError);
        expect(() => User.omit({ id: false } as unknown as { readonly id: true }))
            .toThrow(TypeError);
    });

    test("supports default, prefault, and codecs in decoder pipelines", () => {
        const DefaultName = t.default(t.string.min(2), "anonymous");
        const PrefaultName = t.prefault(t.string.min(2), "anonymous");
        const NumberText = t.codec(
            t.string.regex(/^\d+$/u, "digits"),
            t.number.int().gte(0),
            {
                decode: (value) => Number(value),
                encode: (value) => String(value)
            }
        );

        const defaulted = DefaultName.decode(undefined);
        const prefaulted = PrefaultName.decode(undefined);
        const decoded = NumberText.decode("42");
        const encoded = NumberText.encode(42);
        const caught = t.catch(t.number.int(), 7).decode("bad");
        const methodCaught = t.decoder(t.number.int()).catch(9).decode("bad");

        expectTypeOf<InferDecoder<typeof DefaultName>>().toEqualTypeOf<string>();
        expectTypeOf<typeof decoded>().toEqualTypeOf<CheckResult<number>>();
        expect(defaulted).toEqual({ ok: true, value: "anonymous" });
        expect(prefaulted).toEqual({ ok: true, value: "anonymous" });
        expect(t.prefault(t.string.min(2), "x").decode(undefined).ok).toBe(false);
        expect(decoded).toEqual({ ok: true, value: 42 });
        expect(encoded).toEqual({ ok: true, value: "42" });
        expect(caught).toEqual({ ok: true, value: 7 });
        expect(methodCaught).toEqual({ ok: true, value: 9 });
        expect(NumberText.decode("x").ok).toBe(false);
    });

    test("exports new constraints to JSON Schema", () => {
        const Schema = t.object({
            email: t.string.email(),
            tags: t.array(t.string).min(1).max(3),
            score: t.number.gt(0).lt(10).multipleOf(2)
        }).catchall(t.string);
        const StrictSchema = t.strictObject({
            id: t.string
        });
        const DateSchema = toJsonSchema(t.date);
        const exported = toJsonSchema(Schema);
        const strictExported = toJsonSchema(StrictSchema);

        expect(exported.ok).toBe(true);
        expect(strictExported.ok).toBe(true);
        expect(DateSchema.ok).toBe(false);
        if (exported.ok) {
            const root = exported.value as JsonSchemaObject;
            const properties = root.properties as Record<string, JsonSchemaObject>;
            expect(properties["email"]).toMatchObject({
                type: "string",
                format: "email"
            });
            expect(properties["tags"]).toMatchObject({
                type: "array",
                minItems: 1,
                maxItems: 3
            });
            expect(properties["score"]).toMatchObject({
                type: "number",
                exclusiveMinimum: 0,
                exclusiveMaximum: 10,
                multipleOf: 2
            });
            expect(root.additionalProperties).toMatchObject({ type: "string" });
        }
        if (strictExported.ok) {
            expect((strictExported.value as JsonSchemaObject).additionalProperties)
                .toBe(false);
        }
    });
});
