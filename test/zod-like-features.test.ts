import { describe, expect, expectTypeOf, test } from "vitest";
import {
    compile,
    parse,
    parseAsync,
    safeParse,
    safeParseAsync,
    spa,
    t,
    toJsonSchema,
    TypeSeaAssertionError,
    ZodFirstPartyTypeKind,
    z,
    type CheckResult,
    type Infer,
    type InferDecoder,
    type JsonSchemaObject
} from "../src/index.js";

describe("Zod-like public features", () => {
    test("exposes Zod-style definition metadata", () => {
        const User = t.strictObject({
            name: t.string.min(1),
            tags: t.array(t.string)
        });
        const List = t.array(t.number.int());
        const Choice = t.union(t.string, t.number);
        const Mode = t.enum(["on", "off"]);
        const OptionalName = t.string.optional();

        const userDef = User.def;
        const shape = userDef.shape?.();
        const listElement = List._def.element as { is(value: unknown): boolean };
        const choiceOptions = Choice._def.options as readonly { is(value: unknown): boolean }[];
        const modeOptions = Mode._def.options as readonly string[];
        const optionalInner = OptionalName._def.innerType as { is(value: unknown): boolean };

        expect(userDef.typeName).toBe(ZodFirstPartyTypeKind.ZodObject);
        expect(User._def.type).toBe("object");
        expect(User._def.unknownKeys).toBe("strict");
        expect(shape?.["name"]).toBe(User.shape.name);
        expect(shape?.["tags"]).toBe(User.shape.tags);
        expect(List._def.typeName).toBe(ZodFirstPartyTypeKind.ZodArray);
        expect(listElement.is(1)).toBe(true);
        expect(Choice._def.typeName).toBe(ZodFirstPartyTypeKind.ZodUnion);
        expect(choiceOptions).toHaveLength(2);
        expect(choiceOptions[0]?.is("sea")).toBe(true);
        expect(choiceOptions[1]?.is(3)).toBe(true);
        expect(Mode._def.typeName).toBe(ZodFirstPartyTypeKind.ZodEnum);
        expect(modeOptions).toEqual(["on", "off"]);
        expect(OptionalName._def.typeName).toBe(ZodFirstPartyTypeKind.ZodOptional);
        expect(optionalInner.is("Ada")).toBe(true);
        expect(Object.isFrozen(User._def)).toBe(true);
    });

    test("supports top-level parse helpers across sync and async sources", async () => {
        const User = t.strictObject({
            name: t.string.min(1)
        });
        const CountText = t.stringToInt();
        const EvenCount = t.asyncPipe(
            t.coerce.number(),
            t.asyncRefine(
                t.number.int().gte(0),
                async (value) => await Promise.resolve(value % 2 === 0),
                "even"
            )
        );
        const validUser = {
            name: "Ada"
        };
        const parsedUser = parse(User, validUser);
        const parsedCount = parse(CountText, "42");
        const safeCount = safeParse(CountText, "42");
        const invalidCount = safeParse(CountText, "x", {
            error: "integer text expected"
        });
        const parsedAsync = parseAsync(EvenCount, "42");
        const safeParsedAsync = safeParseAsync(EvenCount, "3", {
            error: "even count expected"
        });
        const zParsedCount = z.parse(CountText, "7");
        const zSafeUser = z.safeParse(User, validUser);
        const zSafeInvalidUser = z.safeParse(User, { name: "" }, {
            error: "name required"
        });
        const zParsedAsync = z.parseAsync(EvenCount, "44");
        const zSafeParsedAsync = z.safeParseAsync(EvenCount, "5");
        const zSyncSpa = z.spa(User, validUser);
        const syncSpa = spa(User, validUser);

        expect(parsedUser).toBe(validUser);
        expect(parsedCount).toBe(42);
        expect(zParsedCount).toBe(7);
        expect(safeCount).toEqual({
            success: true,
            data: 42
        });
        expect(zSafeUser).toEqual({
            success: true,
            data: validUser
        });
        expect(zSafeInvalidUser.success).toBe(false);
        if (!zSafeInvalidUser.success) {
            expect(zSafeInvalidUser.error.issues[0]?.message).toBe("name required");
        }
        expect(invalidCount.success).toBe(false);
        if (!invalidCount.success) {
            expect(invalidCount.error).toBeInstanceOf(TypeSeaAssertionError);
            expect(invalidCount.error.issues[0]?.message).toBe("integer text expected");
        }
        expect(() => parse(User, { name: "" })).toThrow(TypeSeaAssertionError);
        await expect(parsedAsync).resolves.toBe(42);
        await expect(zParsedAsync).resolves.toBe(44);
        await expect(safeParsedAsync).resolves.toMatchObject({
            success: false
        });
        await expect(zSafeParsedAsync).resolves.toMatchObject({
            success: false
        });
        const failedAsync = await safeParsedAsync;
        if (!failedAsync.success) {
            expect(failedAsync.error.issues[0]?.message).toBe("even count expected");
        }
        await expect(zSyncSpa).resolves.toEqual({
            success: true,
            data: validUser
        });
        await expect(syncSpa).resolves.toEqual({
            success: true,
            data: validUser
        });
    });

    test("wraps functions with input and output validation", async () => {
        const NameLength = t.function({
            input: [t.string.trim().pipe(t.string.min(1))],
            output: t.number.int().nonnegative()
        });
        const lengthOfName = NameLength.implement((name) => name.length);
        const invalidInput = lengthOfName as (...args: unknown[]) => unknown;
        const BadOutput = t.function({
            input: [t.string],
            output: t.number
        });
        const badOutput = BadOutput.implement((value) =>
            value.length === 0 ? "bad" : value.length);
        const AsyncDouble = t.function({
            input: [t.number],
            output: t.number.int()
        }).implementAsync((value) => Promise.resolve(value * 2));

        expect(lengthOfName(" Ada ")).toBe(3);
        expect(() => invalidInput("   ")).toThrow(TypeSeaAssertionError);
        expect(() => invalidInput()).toThrow(TypeSeaAssertionError);
        expect(badOutput("sea")).toBe(3);
        expect(() => badOutput("")).toThrow(TypeSeaAssertionError);
        await expect(AsyncDouble(2)).resolves.toBe(4);
        await expect(AsyncDouble(1.25)).rejects.toBeInstanceOf(TypeSeaAssertionError);
    });

    test("supports Zod chain function builder syntax", async () => {
        const InputName = t.string.trim().pipe(t.string.min(1));
        const OutputLength = t.number.int().nonnegative();
        const NameLength = z.function()
            .args(InputName)
            .returns(OutputLength);
        const lengthOfName = NameLength.implement((name) => name.length);
        const invalidInput = lengthOfName as (...args: unknown[]) => unknown;
        const AsyncLength = z.function()
            .args(t.string.min(1))
            .returns(t.number.int())
            .implementAsync((name) => Promise.resolve(name.length));
        const BadOutput = z.function()
            .args(t.string)
            .returns(t.number)
            .implement((value) => value.length === 0 ? "bad" : value.length);
        const ObjectStyle = t.function({
            input: [InputName] as const,
            output: OutputLength
        });

        expect(lengthOfName(" Ada ")).toBe(3);
        expect(() => invalidInput("   ")).toThrow(TypeSeaAssertionError);
        expect(() => invalidInput()).toThrow(TypeSeaAssertionError);
        await expect(AsyncLength("sea")).resolves.toBe(3);
        await expect(AsyncLength("")).rejects.toBeInstanceOf(TypeSeaAssertionError);
        expect(() => BadOutput("")).toThrow(TypeSeaAssertionError);
        expect(NameLength.parameters()[0]).toBe(InputName);
        expect(NameLength.returnType()).toBe(OutputLength);
        expect(Object.isFrozen(NameLength.parameters())).toBe(true);
        expect(ObjectStyle.parameters()[0]).toBe(InputName);
        expect(ObjectStyle.returnType()).toBe(OutputLength);
        expect(Object.isFrozen(ObjectStyle.parameters())).toBe(true);
    });

    test("validates built-in string formats across interpreted and compiled guards", () => {
        const Formats = t.object({
            email: t.string.email(),
            url: t.string.url(),
            date: t.string.isoDate(),
            dateTime: t.string.isoDateTime(),
            xid: t.string.xid(),
            ksuid: t.string.ksuid(),
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
            xid: "9m4e2mr0ui3e8a215n4g",
            ksuid: "0ujtsYcgvSTl8PAuAdqWYSMnLOv",
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

    test("supports Zod-style metadata and alias surfaces", () => {
        const Name = t.string.min(2).max(5);
        const ExactName = t.string.length(3);
        const DescribedName = t.string.describe("Display name");
        const ClonedName = DescribedName.clone();
        const OverwrittenName = DescribedName.overwrite((value) => value.trim());
        const WrappedDescription = DescribedName.optional();
        const OuterDescription = t.string.optional().describe("Optional display name");
        const Names = t.array(t.string.min(1));
        const Timeline = t.object({
            date: t.string.date(),
            dateTime: t.string.datetime(),
            time: t.string.time(),
            duration: t.string.duration()
        });
        const FastTimeline = compile(Timeline, { name: "zodAliasTimeline" });
        const Count = t.number.int().gte(2).lte(5);
        const Positive = t.number.positive();
        const LooseUser = t.strictObject({
            name: t.string
        }).loose();
        const validTimeline = {
            date: "2026-07-06",
            dateTime: "2026-07-06T03:15:00Z",
            time: "03:15:00.999",
            duration: "P3Y6M4DT12H30M5S"
        };
        const exportedName = DescribedName.toJSONSchema();

        expect(Name.minLength).toBe(2);
        expect(Name.maxLength).toBe(5);
        expect(ExactName.minLength).toBe(3);
        expect(ExactName.maxLength).toBe(3);
        expect(t.string.type).toBe("string");
        expect(t.string.format).toBeNull();
        expect(Name.format).toBeNull();
        expect(t.email().format).toBe("email");
        expect(t.string.email().uuidv7().format).toBe("uuid");
        expect(t.string.uuidv7().email().format).toBe("email");
        expect(t.string.regex(/^x$/u, "letters").format).toBe("regex");
        expect(t.string.email().startsWith("a").format).toBe("email");
        expect(t.string.startsWith("a").format).toBeNull();
        expect(t.string.lowercase().format).toBe("lowercase");
        expect(t.hash("sha256", { enc: "hex" }).format).toBe("sha256_hex");
        expect(t.iso.datetime().format).toBe("datetime");
        expect(t.iso.duration().format).toBe("duration");
        expect(t.string.minLength).toBeNull();
        expect(t.string.maxLength).toBeNull();
        expect(DescribedName.description).toBe("Display name");
        expect(ClonedName.description).toBe("Display name");
        expect(ClonedName.is("Ada")).toBe(true);
        expect(OverwrittenName.decode(" Ada ")).toEqual({
            ok: true,
            value: "Ada"
        });
        expect(WrappedDescription.description).toBeUndefined();
        expect(OuterDescription.description).toBe("Optional display name");
        expect(Names.element.is("Ada")).toBe(true);
        expect(Names.element.is("")).toBe(false);
        expect(exportedName.ok).toBe(true);
        if (exportedName.ok && typeof exportedName.value === "object") {
            expect(exportedName.value.description).toBe("Display name");
        }
        expect(Timeline.is(validTimeline)).toBe(true);
        expect(FastTimeline.is(validTimeline)).toBe(true);
        expect(Timeline.is({
            ...validTimeline,
            dateTime: "2026-07-06 03:15"
        })).toBe(false);
        expect(Count.isInt).toBe(true);
        expect(Count.isFinite).toBe(true);
        expect(Count.minValue).toBe(2);
        expect(Count.maxValue).toBe(5);
        expect(t.number.type).toBe("number");
        expect(t.number.format).toBeNull();
        expect(t.number.int().format).toBeNull();
        expect(t.int().format).toBe("safeint");
        expect(t.int32().format).toBe("int32");
        expect(t.uint32().format).toBe("uint32");
        expect(t.float32().format).toBe("float32");
        expect(t.float64().format).toBe("float64");
        expect(Positive.minValue).toBe(0);
        expect(t.number.isInt).toBe(false);
        expect(t.number.isFinite).toBe(true);
        expect(t.number.minValue).toBe(Number.NEGATIVE_INFINITY);
        expect(t.number.maxValue).toBe(Number.POSITIVE_INFINITY);
        expect(LooseUser.is({ name: "Ada", extra: true })).toBe(true);
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
        const Scores = t.map(t.string, t.number.int().gte(0))
            .min(1)
            .max(2)
            .nonempty();
        const PairScores = Scores.size(2);
        const Tags = t.set(t.string.nonempty());
        const FastScores = compile(Scores, { name: "score_map" });
        const FastPairScores = compile(PairScores, { name: "score_pair_map" });
        const FastTags = compile(Tags, { name: "tag_set" });

        expectTypeOf<Infer<typeof Scores>>()
            .toEqualTypeOf<ReadonlyMap<string, number>>();
        expectTypeOf<Infer<typeof Tags>>()
            .toEqualTypeOf<ReadonlySet<string>>();
        expect(Scores.is(new Map([["a", 1]]))).toBe(true);
        expect(FastScores.is(new Map([["a", 1]]))).toBe(true);
        expect(Scores.is(new Map())).toBe(false);
        expect(FastScores.is(new Map())).toBe(false);
        expect(PairScores.is(new Map([["a", 1], ["b", 2]]))).toBe(true);
        expect(FastPairScores.is(new Map([["a", 1]]))).toBe(false);
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

    test("supports Zod-style property check sources", () => {
        const LongText = t.string.with(t.property("length", t.number.gte(3)));
        const HttpsUrl = t.instanceOf(URL).with(
            z.property("protocol", t.literal("https:"))
        );
        const FirstTag = t.array(t.string).with(
            t.property(0, t.string.min(1))
        );
        const FastLongText = compile(LongText, { name: "long_text_property" });
        const FastHttpsUrl = compile(HttpsUrl, { name: "https_url_property" });

        expect(LongText.is("sea")).toBe(true);
        expect(FastLongText.is("sea")).toBe(true);
        expect(LongText.is("go")).toBe(false);
        expect(FastLongText.is("go")).toBe(false);
        const tooShort = LongText.check("go");
        expect(tooShort.ok).toBe(false);
        if (!tooShort.ok) {
            expect(tooShort.error[0]?.path).toEqual(["length"]);
        }
        expect(HttpsUrl.is(new URL("https://example.com"))).toBe(true);
        expect(FastHttpsUrl.is(new URL("https://example.com"))).toBe(true);
        expect(HttpsUrl.is(new URL("http://example.com"))).toBe(false);
        expect(FirstTag.is(["alpha"])).toBe(true);
        const badFirstTag = FirstTag.check([""]);
        expect(badFirstTag.ok).toBe(false);
        if (!badFirstTag.ok) {
            expect(badFirstTag.error[0]?.path).toEqual([0]);
        }
    });

    test("supports null, undefined, void, nullish, JSON, and string decoder sugar", () => {
        const MaybeName = t.nullish(t.string.min(1));
        const Json = t.json();
        const TrimmedLower = t.string.trim().pipe(t.string.min(1)).transform((value) =>
            value.toLowerCase());
        const Slug = t.string.slugify();

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
        expect(Slug.decode("  TypeSea: Zero Dependency Validator  ")).toEqual({
            ok: true,
            value: "typesea-zero-dependency-validator"
        });
    });

    test("supports guard-level decoder sugar without changing is semantics", () => {
        const Name = t.string.min(1)
            .transform((value) => value.trim())
            .pipe(t.string.min(1))
            .default("anonymous")
            .catch("anonymous");
        const Count = t.number.int()
            .nonnegative()
            .default(0)
            .catch(() => 0);
        const Prefaulted = t.string.min(1).prefault("fallback");

        expectTypeOf<InferDecoder<typeof Name>>().toEqualTypeOf<string>();
        expect(t.string.min(1).is(undefined)).toBe(false);
        expect(t.number.int().nonnegative().is(undefined)).toBe(false);
        expect(Name.decode(" Ada ")).toEqual({
            ok: true,
            value: "Ada"
        });
        expect(Name.decode(undefined)).toEqual({
            ok: true,
            value: "anonymous"
        });
        expect(Name.decode("   ")).toEqual({
            ok: true,
            value: "anonymous"
        });
        expect(Count.decode(undefined)).toEqual({
            ok: true,
            value: 0
        });
        expect(Count.decode(-1)).toEqual({
            ok: true,
            value: 0
        });
        expect(Prefaulted.decode(undefined)).toEqual({
            ok: true,
            value: "fallback"
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

    test("supports Zod-style apply helpers in fluent chains", () => {
        const Percent = t.number.apply((schema) =>
            schema.int().gte(0).lte(100));
        const TrimmedName = t.string.apply((schema) =>
            schema.trim().pipe(t.string.min(1)));
        const FastPercent = compile(Percent, { name: "applied_percent" });

        expectTypeOf<Infer<typeof Percent>>().toEqualTypeOf<number>();
        expectTypeOf<InferDecoder<typeof TrimmedName>>().toEqualTypeOf<string>();
        expect(Percent.is(50)).toBe(true);
        expect(FastPercent.is(100)).toBe(true);
        expect(Percent.is(100.5)).toBe(false);
        expect(FastPercent.is(-1)).toBe(false);
        expect(TrimmedName.decode(" Ada ")).toEqual({
            ok: true,
            value: "Ada"
        });
        expect(TrimmedName.decode("   ").ok).toBe(false);
        expect(() => t.string.apply(
            null as unknown as (guard: typeof t.string) => typeof t.string
        )).toThrow(TypeError);
    });

    test("supports Zod-style with callback refinements", () => {
        const LengthCheck = t.check<string>(({ value, issues }) => {
            if (value.length <= 3) {
                issues.push({
                    code: "custom",
                    input: value,
                    message: "Must be longer than 3"
                });
            }
        });
        const LongName = t.string.with(({ value, issues }) => {
            if (value.length <= 3) {
                issues.push({
                    code: "custom",
                    input: value,
                    message: "Must be longer than 3"
                });
            }
        });
        const ReusedLongName = t.string.with(LengthCheck);
        const SmallEven = t.number.with(
            ({ value, issues }) => {
                if (!Number.isInteger(value)) {
                    issues.push("Expected an integer");
                }
            },
            ({ value, issues }) => {
                if (value % 2 !== 0) {
                    issues.push({
                        path: ["parity"],
                        message: "Expected an even number"
                    });
                }
            }
        );
        const FastLongName = compile(LongName, { name: "long_name_with" });
        const FastReusedLongName = compile(ReusedLongName, { name: "reused_long_name_with" });
        const FastSmallEven = compile(SmallEven, { name: "small_even_with" });

        expectTypeOf<Infer<typeof LongName>>().toEqualTypeOf<string>();
        expect(LongName.is("Ada Lovelace")).toBe(true);
        expect(FastLongName.is("Ada Lovelace")).toBe(true);
        expect(ReusedLongName.is("Ada Lovelace")).toBe(true);
        expect(FastReusedLongName.is("Ada Lovelace")).toBe(true);
        expect(LongName.safeParse("Ada").success).toBe(false);
        expect(FastLongName.safeParse("Ada").success).toBe(false);
        expect(ReusedLongName.safeParse("Ada").success).toBe(false);
        expect(FastReusedLongName.safeParse("Ada").success).toBe(false);
        expect(SmallEven.is(4)).toBe(true);
        expect(FastSmallEven.is(4)).toBe(true);
        expect(SmallEven.check(3).ok).toBe(false);
        expect(FastSmallEven.check(3).ok).toBe(false);
        const result = SmallEven.check(3);
        expect(result.ok ? [] : result.error).toMatchObject([
            {
                path: ["parity"],
                message: "Expected an even number"
            }
        ]);
        expect(() => t.string.with(
            "bad" as unknown as Parameters<typeof t.string.with>[0]
        )).toThrow(TypeError);
        expect(() => t.string.with(
            Object.freeze({}) as unknown as Parameters<typeof t.string.with>[0]
        )).toThrow(TypeError);
        expect(() => t.check(
            "bad" as unknown as Parameters<typeof t.check>[0]
        )).toThrow(TypeError);
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
        const SelectiveRequired = Extended.required({
            name: true
        });
        const SelectivePartial = Extended.partial({
            active: true
        });

        expectTypeOf<Infer<typeof Required>>().toEqualTypeOf<{
            readonly id: string;
            readonly name: string;
            readonly active: boolean;
        }>();
        expectTypeOf<Infer<typeof SelectiveRequired>>().toEqualTypeOf<{
            readonly id: string;
            readonly name: string;
            readonly active: boolean;
        }>();
        expectTypeOf<Infer<typeof SelectivePartial>>().toEqualTypeOf<{
            readonly id: string;
            readonly name?: string;
            readonly active?: boolean;
        }>();
        expect(Extended.is({ id: "u1", active: true })).toBe(true);
        expect(Required.is({ id: "u1", active: true })).toBe(false);
        expect(Required.is({ id: "u1", name: "Ada", active: true })).toBe(true);
        expect(SelectiveRequired.is({ id: "u1", active: true })).toBe(false);
        expect(SelectivePartial.is({ id: "u1" })).toBe(true);
        expect(t.required(Extended).is({ id: "u1", name: "Ada", active: true })).toBe(true);
        expect(t.partial(Extended, { active: true }).is({ id: "u1" })).toBe(true);
    });

    test("supports object merge, mode rewrites, and catchall validation", () => {
        const Base = t.object({
            id: t.string
        });
        const Strict = Base.strict();
        const Passthrough = Strict.passthrough();
        const Loose = Strict.loose();
        const Nonstrict = Strict.nonstrict();
        const Nonpassthrough = Passthrough.nonpassthrough();
        const Stripped = Strict.strip();
        const FastStripped = compile(Stripped, { name: "stripped_shape" });
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
        expect(Loose.is({ id: "u1", extra: true })).toBe(true);
        expect(Nonstrict.is({ id: "u1", extra: true })).toBe(true);
        expect(Nonpassthrough.is({ id: "u1", extra: true })).toBe(false);
        expect(t.loose(Strict).is({ id: "u1", extra: true })).toBe(true);
        expect(t.nonstrict(Strict).is({ id: "u1", extra: true })).toBe(true);
        expect(t.nonpassthrough(Passthrough).is({ id: "u1", extra: true })).toBe(false);
        expect(Stripped.is({ id: "u1", extra: true })).toBe(true);
        const strippedInput = { id: "u1", extra: true };
        const stripped = Stripped.check(strippedInput);
        const fastStripped = FastStripped.check({
            id: "u1",
            extra: true
        });
        expect(stripped.ok).toBe(true);
        expect(fastStripped.ok).toBe(true);
        if (stripped.ok && fastStripped.ok) {
            expect(stripped.value).toEqual({ id: "u1" });
            expect(fastStripped.value).toEqual({ id: "u1" });
            expect(stripped.value).not.toBe(strippedInput);
        }
        expect(strippedInput).toEqual({ id: "u1", extra: true });
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

    test("projects nested strip objects on parse-like output paths", () => {
        const Nested = t.object({
            users: t.array(t.object({
                id: t.string
            }).strip())
        }).strip();
        const FastNested = compile(Nested, { name: "nested_strip_shape" });
        const input = {
            users: [
                {
                    id: "u1",
                    role: "admin"
                }
            ],
            trace: "request"
        };

        expect(Nested.is(input)).toBe(true);
        expect(input.users[0]).toEqual({
            id: "u1",
            role: "admin"
        });
        expect(Nested.parse(input)).toEqual({
            users: [
                {
                    id: "u1"
                }
            ]
        });
        expect(FastNested.parse(input)).toEqual({
            users: [
                {
                    id: "u1"
                }
            ]
        });
        expect(input).toEqual({
            users: [
                {
                    id: "u1",
                    role: "admin"
                }
            ],
            trace: "request"
        });
    });

    test("uses Zod-style strip output for z.object by default", () => {
        const User = z.object({
            id: z.string
        });
        const input = {
            id: "u1",
            extra: true
        };

        expect(User.is(input)).toBe(true);
        expect(User.parse(input)).toEqual({ id: "u1" });
        expect(input).toEqual({
            id: "u1",
            extra: true
        });
        expect(User.passthrough().parse(input)).toEqual(input);
    });

    test("supports non-string discriminants in Zod-style case arrays", () => {
        const Event = z.discriminatedUnion("kind", [
            z.object({
                kind: z.literal(1),
                value: z.string
            }),
            z.object({
                kind: z.literal(false),
                reason: z.string
            })
        ] as const);
        const FastEvent = compile(Event, {
            name: "non_string_discriminants"
        });
        const invalidCase = {
            kind: true
        };
        const invalidBranch = {
            kind: false,
            reason: 1
        };

        expectTypeOf<Infer<typeof Event>>().toEqualTypeOf<
            | {
                readonly kind: 1;
                readonly value: string;
            }
            | {
                readonly kind: false;
                readonly reason: string;
            }
        >();
        expect(Event.is({ kind: 1, value: "ok" })).toBe(true);
        expect(FastEvent.is({ kind: 1, value: "ok" })).toBe(true);
        expect(Event.is({ kind: false, reason: "disabled" })).toBe(true);
        expect(FastEvent.is({ kind: false, reason: "disabled" })).toBe(true);
        expect(Event.is(invalidCase)).toBe(false);
        expect(FastEvent.is(invalidCase)).toBe(false);
        expect(FastEvent.check(invalidCase)).toEqual(Event.check(invalidCase));
        expect(FastEvent.checkFirst(invalidBranch)).toEqual(Event.checkFirst(invalidBranch));
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

    test("supports default, prefault, and codecs in decoder pipelines", async () => {
        const DefaultName = t.default(t.string.min(2), "anonymous");
        const PrefaultName = t.prefault(t.string.min(2), "anonymous");
        const NumericRecord = t.record(
            t.number.int().gte(0),
            t.stringToInt()
        );
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
        const decodedNumericRecord = NumericRecord.decode({
            0: "10",
            2: "20"
        });
        const failedNumericRecord = NumericRecord.decode({
            1.5: "15"
        });
        const parsedDefault = DefaultName.parse(undefined);
        const safeParsedDefault = DefaultName.safeParse(undefined);
        const parsedNumberText = NumberText.parse("42");
        const safeParsedNumberText = NumberText.safeParse("42");
        const failedNumberText = NumberText.safeParse("x", {
            error: "number text expected"
        });

        expectTypeOf<InferDecoder<typeof DefaultName>>().toEqualTypeOf<string>();
        expectTypeOf<InferDecoder<typeof NumericRecord>>()
            .toEqualTypeOf<Readonly<Record<number, number>>>();
        expectTypeOf<typeof decoded>().toEqualTypeOf<CheckResult<number>>();
        expectTypeOf<typeof parsedNumberText>().toEqualTypeOf<number>();
        expect(defaulted).toEqual({ ok: true, value: "anonymous" });
        expect(prefaulted).toEqual({ ok: true, value: "anonymous" });
        expect(t.prefault(t.string.min(2), "x").decode(undefined).ok).toBe(false);
        expect(decoded).toEqual({ ok: true, value: 42 });
        expect(encoded).toEqual({ ok: true, value: "42" });
        expect(caught).toEqual({ ok: true, value: 7 });
        expect(methodCaught).toEqual({ ok: true, value: 9 });
        expect(decodedNumericRecord).toEqual({
            ok: true,
            value: {
                0: 10,
                2: 20
            }
        });
        expect(failedNumericRecord.ok).toBe(false);
        expect(parsedDefault).toBe("anonymous");
        expect(safeParsedDefault).toEqual({
            success: true,
            data: "anonymous"
        });
        expect(parsedNumberText).toBe(42);
        expect(safeParsedNumberText).toEqual({
            success: true,
            data: 42
        });
        expect(failedNumberText.success).toBe(false);
        if (!failedNumberText.success) {
            expect(failedNumberText.error.issues[0]?.message)
                .toBe("number text expected");
        }
        expect(NumberText.decode("x").ok).toBe(false);
        expect(() => NumberText.parse("x")).toThrow(TypeSeaAssertionError);
        await expect(NumberText.parseAsync("42")).resolves.toBe(42);
        await expect(NumberText.parseAsync("x")).rejects
            .toBeInstanceOf(TypeSeaAssertionError);
        await expect(NumberText.safeParseAsync("42")).resolves.toEqual({
            success: true,
            data: 42
        });
        await expect(NumberText.spa("42")).resolves.toEqual({
            success: true,
            data: 42
        });
    });

    test("exports new constraints to JSON Schema", () => {
        const Schema = t.object({
            email: t.string.email(),
            tags: t.array(t.string).min(1).max(3),
            score: t.number.gt(0).lt(10).multipleOf(2),
            uint32: t.uint32(),
            float32: t.float32()
        }).catchall(t.string);
        const StrictSchema = t.strictObject({
            id: t.string
        });
        const DateSchema = toJsonSchema(t.date);
        const Int64Schema = toJsonSchema(t.int64());
        const exported = toJsonSchema(Schema);
        const strictExported = toJsonSchema(StrictSchema);

        expect(exported.ok).toBe(true);
        expect(strictExported.ok).toBe(true);
        expect(DateSchema.ok).toBe(false);
        expect(Int64Schema.ok).toBe(false);
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
            expect(properties["uint32"]).toMatchObject({
                type: "integer",
                minimum: 0,
                maximum: 4294967295
            });
            expect(properties["float32"]).toMatchObject({
                type: "number",
                minimum: -3.4028234663852886e38,
                maximum: 3.4028234663852886e38
            });
            expect(root.additionalProperties).toMatchObject({ type: "string" });
        }
        if (strictExported.ok) {
            expect((strictExported.value as JsonSchemaObject).additionalProperties)
                .toBe(false);
        }
    });
});
