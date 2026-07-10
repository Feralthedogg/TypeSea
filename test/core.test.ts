import { describe, expect, expectTypeOf, test } from "vitest";
import * as zod from "../src/index.js";
import { NodeTag } from "../src/kind/index.js";
import type { Graph } from "../src/ir/index.js";
import {
    BaseGuard,
    checkAsync,
    compile,
    compileAsync,
    compileBoolean,
    compileCached,
    config,
    createCompileCache,
    getErrorMap,
    isAsync,
    locales,
    regexes,
    resetErrorMap,
    setErrorMap,
    t,
    TypeSeaAssertionError,
    TypeSeaZodError,
    warmup,
    z,
    ZodError,
    ZodSchema,
    ZodType,
    type Guard,
    type Infer,
    type Issue,
    type ParseErrorResult,
    type StringGuard,
    type TypeSeaConfigIssue
} from "../src/index.js";

describe("TypeSea core guards", () => {
    test("supports Zod-style root aliases", () => {
        const User = z.object({
            id: z.string.uuid(),
            age: z.number.int().gte(0)
        });
        const Status = z.nativeEnum({
            Draft: "draft",
            Published: "published"
        });
        const Intersected = z.intersection(
            z.object({ id: z.string }),
            z.object({ active: z.boolean })
        );
        const StringOrNumber = z.union([z.string, z.number] as const);
        const StringXorNumber = z.xor([z.string, z.number] as const);
        const DateValue = z.instanceof(Date);
        const CallableName = z.string().min(1);
        const CallableAge = z.number().int().nonnegative();
        const CallableFlag = z.boolean();
        const CallableDate = z.date();
        const CallableCount = z.bigint();
        const CallableMarker = z.symbol();
        const OptionalShortcuts = z.object({
            name: z.ostring(),
            age: z.onumber(),
            active: z.oboolean(),
            at: z.odate(),
            serial: z.obigint(),
            marker: z.osymbol()
        });
        type ZodWildcardPrefix = "an";
        type ZodWildcardKey = `${ZodWildcardPrefix}y`;
        const zodWildcardKey = ("an" + "y") as ZodWildcardKey;
        const WildcardValue = z[zodWildcardKey]();
        const SuccessfulString = z.success(z.string.min(1));
        const TableSuccessfulString = t.success(t.string.min(1));
        const Event = z.discriminatedUnion("kind", [
            z.object({
                kind: z.literal("user"),
                id: z.string
            }),
            z.object({
                kind: z.literal("order"),
                total: z.number
            })
        ] as const);
        type User = zod.infer<typeof User>;
        type UserInput = zod.input<typeof User>;
        type UserOutput = zod.output<typeof User>;
        type WildcardValue = zod.infer<typeof WildcardValue>;

        const valid: User = {
            id: "550e8400-e29b-41d4-a716-446655440000",
            age: 42
        };

        expectTypeOf<UserInput>().toEqualTypeOf<User>();
        expectTypeOf<UserOutput>().toEqualTypeOf<User>();
        expectTypeOf<WildcardValue>().toEqualTypeOf<unknown>();
        expect(User.is(valid)).toBe(true);
        expect(z.object).not.toBe(t.object);
        expect(z.object({ id: z.string }).parse({ id: "u1", extra: true }))
            .toEqual({ id: "u1" });
        expect(z.string()).toBe(t.string());
        expect(z.null().is(null)).toBe(true);
        expect(z.undefined().is(undefined)).toBe(true);
        expect(z.void().is(undefined)).toBe(true);
        expect(z.unknown().is(Symbol("value"))).toBe(true);
        expect(z.never().is(undefined)).toBe(false);
        expect(Status.is("draft")).toBe(true);
        expect(Intersected.is({ id: "user", active: true })).toBe(true);
        expect(StringOrNumber.is("value")).toBe(true);
        expect(StringOrNumber.is(1)).toBe(true);
        expect(StringOrNumber.is(false)).toBe(false);
        expect(StringXorNumber.is("value")).toBe(true);
        expect(DateValue.is(new Date("2026-07-07T00:00:00.000Z"))).toBe(true);
        expect(DateValue.is("2026-07-07T00:00:00.000Z")).toBe(false);
        expect(CallableName.is("Ada")).toBe(true);
        expect(CallableAge.is(42)).toBe(true);
        expect(CallableFlag.is(true)).toBe(true);
        expect(CallableDate.is(new Date("2026-07-07T00:00:00.000Z"))).toBe(true);
        expect(CallableCount.is(1n)).toBe(true);
        expect(CallableMarker.is(Symbol("value"))).toBe(true);
        expect(z.ostring().is(undefined)).toBe(true);
        expect(z.onumber().is(1)).toBe(true);
        expect(z.oboolean().is(false)).toBe(true);
        expect(z.odate().is(new Date("2026-07-07T00:00:00.000Z"))).toBe(true);
        expect(z.obigint().is(1n)).toBe(true);
        expect(z.osymbol().is(Symbol("value"))).toBe(true);
        expect(OptionalShortcuts.is({})).toBe(true);
        expect(OptionalShortcuts.is({
            name: "Ada",
            age: 42,
            active: true,
            at: new Date("2026-07-07T00:00:00.000Z"),
            serial: 1n,
            marker: Symbol("value")
        })).toBe(true);
        expect(WildcardValue.is({ hostile: true })).toBe(true);
        expect(SuccessfulString.decode("ok")).toEqual({ ok: true, value: true });
        expect(SuccessfulString.decode("")).toMatchObject({ ok: false });
        expect(TableSuccessfulString.decode("ok")).toEqual({ ok: true, value: true });
        expect(Event.is({ kind: "user", id: "u_1" })).toBe(true);
        expect(Event.is({ kind: "order", total: 10 })).toBe(true);
        expect(Event.is({ kind: "user", total: 10 })).toBe(false);
        expect(ZodError).toBe(TypeSeaZodError);
        expect(ZodType).toBe(BaseGuard);
        expect(ZodSchema).toBe(BaseGuard);
        expect(new ZodError([])).toBeInstanceOf(TypeSeaZodError);
    });

    test("supports unknown, never, bigint, and symbol primitives", () => {
        const marker = Symbol("marker");
        const Status = t.literal(["draft", "published"]);
        const MaybeLiteral = t.literal([undefined, null]);

        expectTypeOf<Infer<typeof t.unknown>>().toEqualTypeOf<unknown>();
        expectTypeOf<Infer<typeof t.never>>().toEqualTypeOf<never>();
        expectTypeOf<Infer<typeof t.bigint>>().toEqualTypeOf<bigint>();
        expectTypeOf<Infer<typeof t.symbol>>().toEqualTypeOf<symbol>();
        expectTypeOf<Infer<typeof Status>>()
            .toEqualTypeOf<"draft" | "published">();

        expect(t.unknown.is({ value: marker })).toBe(true);
        expect(t.never.is(undefined)).toBe(false);
        expect(t.bigint.is(1n)).toBe(true);
        expect(t.bigint.is(1)).toBe(false);
        expect(t.symbol.is(marker)).toBe(true);
        expect(t.literal(marker).is(marker)).toBe(true);
        expect(t.literal(1n).is(1n)).toBe(true);
        expect(Status.is("draft")).toBe(true);
        expect(Status.is("archived")).toBe(false);
        expect(Status.values.has("published")).toBe(true);
        expect(Status.values.size).toBe(2);
        expect([...Status.values]).toEqual(["draft", "published"]);
        expect(MaybeLiteral.is(undefined)).toBe(true);
        expect(MaybeLiteral.is(null)).toBe(true);
        expect([...MaybeLiteral.values]).toEqual([undefined, null]);
    });

    test("supports Zod-style enum metadata and subset helpers", () => {
        const Fish = t.enum(["Salmon", "Tuna", "Trout"]);
        const TunaOnly = Fish.extract(["Tuna"]);
        const WithoutTuna = Fish.exclude(["Tuna"]);
        const Status = t.enum({
            Ok: 200,
            NotFound: 404
        } as const);
        enum NumericFish {
            Salmon = 0,
            Tuna = 1
        }
        const NumericFishGuard = t.enum(NumericFish);

        expect(Fish.options).toEqual(["Salmon", "Tuna", "Trout"]);
        expect(Fish.enum).toEqual({
            Salmon: "Salmon",
            Tuna: "Tuna",
            Trout: "Trout"
        });
        expect(Fish.is("Salmon")).toBe(true);
        expect(Fish.is("Swordfish")).toBe(false);
        expect(TunaOnly.options).toEqual(["Tuna"]);
        expect(TunaOnly.is("Tuna")).toBe(true);
        expect(TunaOnly.is("Salmon")).toBe(false);
        expect(WithoutTuna.options).toEqual(["Salmon", "Trout"]);
        expect(WithoutTuna.is("Trout")).toBe(true);
        expect(WithoutTuna.is("Tuna")).toBe(false);
        expect(Status.is(200)).toBe(true);
        expect(Status.is(500)).toBe(false);
        expect(Status.enum).toEqual({
            Ok: 200,
            NotFound: 404
        });
        expect(NumericFishGuard.options).toEqual([0, 1]);
        expect(NumericFishGuard.enum).toEqual({
            Salmon: 0,
            Tuna: 1
        });
        expect(NumericFishGuard.is(0)).toBe(true);
        expect(NumericFishGuard.is("Salmon")).toBe(false);
        expect(() => Fish.extract(["Swordfish" as "Tuna"])).toThrow(TypeError);
        expect(() => Fish.exclude(["Salmon", "Tuna", "Trout"])).toThrow(TypeError);
        expect(() => t.enum([] as unknown as ["never"])).toThrow(TypeError);
    });

    test("supports BigInt scalar checks across runtime paths", async () => {
        const Count = t.bigint.gte(5n).lte(20n).multipleOf(5n);
        const Positive = t.bigint.positive();
        const NonPositive = t.bigint.nonpositive();
        const Int64 = t.int64();
        const UInt64 = t.uint64();
        const FastCount = compile(Count, { name: "bigintCount" });
        const FastInt64 = compile(Int64, { name: "bigintInt64" });
        const AsyncCount = compileAsync(Count, { name: "asyncBigintCount" });

        expectTypeOf<Infer<typeof Count>>().toEqualTypeOf<bigint>();
        expect(Count.is(5n)).toBe(true);
        expect(Count.is(10n)).toBe(true);
        expect(Count.is(21n)).toBe(false);
        expect(Count.is(6n)).toBe(false);
        expect(Positive.is(1n)).toBe(true);
        expect(Positive.is(0n)).toBe(false);
        expect(NonPositive.is(0n)).toBe(true);
        expect(NonPositive.is(1n)).toBe(false);
        expect(Int64.is(-9223372036854775808n)).toBe(true);
        expect(Int64.is(-9223372036854775809n)).toBe(false);
        expect(UInt64.is(18446744073709551615n)).toBe(true);
        expect(UInt64.is(-1n)).toBe(false);
        expect(FastCount.is(20n)).toBe(true);
        expect(FastCount.is(6n)).toBe(false);
        expect(FastInt64.is(9223372036854775807n)).toBe(true);
        expect(FastInt64.is(9223372036854775808n)).toBe(false);
        expect(await isAsync(Count, 10n)).toBe(true);
        expect(await isAsync(Count, 6n)).toBe(false);
        expect(await AsyncCount.is(10n)).toBe(true);
        expect(await AsyncCount.is(6n)).toBe(false);

        const result = FastCount.check(6n);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error[0]).toMatchObject({
                code: "expected_multiple_of",
                expected: "multiple of 5n",
                actual: "6n"
            });
        }
        const first = FastCount.checkFirst(21n);
        expect(first.ok).toBe(false);
        if (!first.ok) {
            expect(first.error[0]).toMatchObject({
                code: "expected_lte",
                expected: "<= 20n",
                actual: "21n"
            });
        }
        expect(() => t.bigint.multipleOf(0n)).toThrow(RangeError);
        expect(() => t.bigint.step(0n)).toThrow(RangeError);
    });

    test("respects BigInt constraints inside compiled union diagnostics", () => {
        const CountOrName = t.union(
            t.bigint.gte(5n).multipleOf(5n),
            t.string.min(2)
        );
        const FastCountOrName = compile(CountOrName, { name: "bigintUnion" });

        expect(CountOrName.options).toHaveLength(2);
        expect(CountOrName.options[0].is(10n)).toBe(true);
        expect(CountOrName.options[1].is("Ada")).toBe(true);
        expect(Object.isFrozen(CountOrName.options)).toBe(true);
        expect(CountOrName.is(10n)).toBe(true);
        expect(CountOrName.is(6n)).toBe(false);
        expect(FastCountOrName.is(10n)).toBe(true);
        expect(FastCountOrName.is(6n)).toBe(false);

        const result = FastCountOrName.check(6n);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error[0]?.code).toBe("expected_union");
        }
    });

    test("narrows object values and preserves exact optional semantics", () => {
        const User = t.object({
            id: t.string.uuid(),
            name: t.string.min(1),
            age: t.number.int().gte(0),
            nickname: t.optional(t.string),
            title: t.undefinedable(t.string)
        });

        type User = Infer<typeof User>;

        expectTypeOf<User>().toEqualTypeOf<{
            readonly id: string;
            readonly name: string;
            readonly age: number;
            readonly nickname?: string;
            readonly title: string | undefined;
        }>();

        const value: unknown = {
            id: "550e8400-e29b-41d4-a716-446655440000",
            name: "Ada",
            age: 37,
            title: undefined
        };

        expect(User.is(value)).toBe(true);
        if (User.is(value)) {
            expect(value.name).toBe("Ada");
        }

        expect(User.is({ id: value, name: "Ada", age: 37, title: undefined })).toBe(
            false
        );
        expect(User.is({ id: value, name: "Ada", age: 37 })).toBe(false);
        expect(
            User.is({
                id: "550e8400-e29b-41d4-a716-446655440000",
                name: "Ada",
                age: 37,
                nickname: undefined,
                title: undefined
            })
        ).toBe(false);
    });

    test("supports unwrap and nonoptional wrapper ergonomics", () => {
        const OptionalName = t.string.min(2).optional().describe("display name");
        const Name = OptionalName.unwrap();
        const NameFromBuilder = t.unwrap(OptionalName);
        const MaybeName = t.nullish(t.string.min(2)).nonoptional();
        const MaybeNameFromBuilder = t.nonoptional(t.nullish(t.string.min(2)));
        const FastMaybeName = compile(MaybeName, { name: "maybeName" });
        const Item = t.array(t.number.int().gte(0)).unwrap();
        const ItemFromBuilder = t.unwrap(t.array(t.number.int().gte(0)));
        const RequiredTitle = t.nonoptional(t.undefinedable(t.string.min(1)));

        expect(Name.is("Ada")).toBe(true);
        expect(Name.is("A")).toBe(false);
        expect(Name.is(undefined)).toBe(false);
        expect(NameFromBuilder.is("Grace")).toBe(true);
        expect(MaybeName.is("Ada")).toBe(true);
        expect(MaybeName.is(null)).toBe(true);
        expect(MaybeName.is(undefined)).toBe(false);
        expect(MaybeNameFromBuilder.is(null)).toBe(true);
        expect(MaybeNameFromBuilder.is(undefined)).toBe(false);
        expect(FastMaybeName.is(null)).toBe(true);
        expect(FastMaybeName.is(undefined)).toBe(false);
        expect(Item.is(3)).toBe(true);
        expect(Item.is(3.5)).toBe(false);
        expect(Item.is([3])).toBe(false);
        expect(ItemFromBuilder.is(4)).toBe(true);
        expect(RequiredTitle.is("Doc")).toBe(true);
        expect(RequiredTitle.is(undefined)).toBe(false);
        expect(() => t.string.unwrap()).toThrow(TypeError);
    });

    test("returns Result-shaped diagnostics instead of expected failure throws", () => {
        const Config = t.strictObject({
            port: t.number.int().gte(1).lte(65535),
            host: t.string.min(1)
        });

        const result = Config.check({ port: 0, host: "", extra: true });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.map((issue) => issue.code)).toEqual([
                "expected_gte",
                "expected_min_length",
                "unrecognized_key"
            ]);
        }
    });

    test("supports Zod-style parse and safeParse surfaces", async () => {
        const User = t.object({
            id: t.string.uuid(),
            name: t.string.min(1)
        });
        const FastUser = compile(User, { name: "parseUser" });
        const valid = {
            id: "550e8400-e29b-41d4-a716-446655440000",
            name: "Ada"
        };
        const invalid = {
            id: "not-a-uuid",
            name: ""
        };

        expect(User.parse(valid)).toBe(valid);
        expect(FastUser.parse(valid)).toBe(valid);
        expect(User.safeParse(valid)).toEqual({
            success: true,
            data: valid
        });
        expect(FastUser.safeParse(valid)).toEqual({
            success: true,
            data: valid
        });
        expect(await User.parseAsync(valid)).toBe(valid);
        await expect(User.spa(valid)).resolves.toEqual({
            success: true,
            data: valid
        });
        await expect(FastUser.spa(invalid)).resolves.toMatchObject({
            success: false
        });
        await expect(FastUser.parseAsync(invalid)).rejects.toBeInstanceOf(
            TypeSeaAssertionError
        );

        expect(() => User.parse(invalid)).toThrow(TypeSeaAssertionError);
        const parsed = FastUser.safeParse(invalid);
        expect(parsed.success).toBe(false);
        if (!parsed.success) {
            expect(parsed.error).toBeInstanceOf(TypeSeaAssertionError);
            expect(parsed.error.issues.map((issue) => issue.code)).toEqual([
                "expected_pattern",
                "expected_min_length"
            ]);
            expect(parsed.error.flatten().fieldErrors).toMatchObject({
                id: ["Expected pattern uuid at $[\"id\"]; received string."],
                name: ["Expected length >= 1 at $[\"name\"]; received length 0."]
            });
            expect(parsed.error.format()).toMatchObject({
                id: {
                    _errors: ["Expected pattern uuid at $[\"id\"]; received string."]
                },
                name: {
                    _errors: ["Expected length >= 1 at $[\"name\"]; received length 0."]
                }
            });
        }
    });

    test("supports Zod-style optional and nullable probes", () => {
        const OptionalName = t.optional(t.string);
        const NullableName = t.nullable(t.string);
        const NullishName = t.nullish(t.string);
        const FluentNullishName = t.string.nullish();
        const FastNullishName = compile(NullishName, { name: "nullishProbe" });

        expect(t.string.isOptional()).toBe(false);
        expect(t.string.isNullable()).toBe(false);
        expect(OptionalName.isOptional()).toBe(true);
        expect(OptionalName.isNullable()).toBe(false);
        expect(NullableName.isOptional()).toBe(false);
        expect(NullableName.isNullable()).toBe(true);
        expect(NullishName.isOptional()).toBe(true);
        expect(NullishName.isNullable()).toBe(true);
        expect(FluentNullishName.is(undefined)).toBe(true);
        expect(FluentNullishName.is(null)).toBe(true);
        expect(FluentNullishName.is("Ada")).toBe(true);
        expect(FluentNullishName.is(1)).toBe(false);
        expect(FluentNullishName.isOptional()).toBe(true);
        expect(FluentNullishName.isNullable()).toBe(true);
        expect(FastNullishName.isOptional()).toBe(true);
        expect(FastNullishName.isNullable()).toBe(true);
    });

    test("supports Zod-style and alias for intersections", () => {
        const Named = t.object({
            name: t.string.min(1)
        });
        const Aged = t.object({
            age: t.number.int().gte(0)
        });
        const User = Named.and(Aged);

        expect(User.is({ name: "Ada", age: 37 })).toBe(true);
        expect(User.is({ name: "Ada" })).toBe(false);
        expect(User.is({ age: 37 })).toBe(false);
        expectTypeOf<Infer<typeof User>>().toEqualTypeOf<
            Readonly<{ readonly name: string }> & Readonly<{ readonly age: number }>
        >();
    });

    test("supports Zod-style parse error customization", async () => {
        const User = t.object({
            id: t.string.uuid(),
            name: t.string.min(1)
        });
        const FastUser = compile(User, { name: "customParseUser" });
        const invalid = {
            id: "not-a-uuid",
            name: ""
        };
        const options = {
            error: (issue: Issue): ParseErrorResult => issue.code === "expected_pattern"
                ? {
                    message: `bad pattern at ${issue.path.join(".")}`
                }
                : undefined
        };

        const interpreted = User.safeParse(invalid, {
            error: "custom failure"
        });
        const compiled = FastUser.safeParse(invalid, options);
        const checked = User.check(invalid, options);
        const first = FastUser.checkFirst(invalid, {
            error: (issue) => `${issue.code}:first`
        });

        expect(interpreted.success).toBe(false);
        if (!interpreted.success) {
            expect(interpreted.error.issues.map((issue) => issue.message)).toEqual([
                "custom failure",
                "custom failure"
            ]);
        }

        expect(compiled.success).toBe(false);
        if (!compiled.success) {
            expect(compiled.error.issues[0]?.message).toBe("bad pattern at id");
            expect(compiled.error.issues[1]?.message).toBeUndefined();
        }

        expect(checked.ok).toBe(false);
        if (!checked.ok) {
            expect(checked.error[0]?.message).toBe("bad pattern at id");
            expect(checked.error[1]?.message).toBeUndefined();
        }

        expect(first.ok).toBe(false);
        if (!first.ok) {
            expect(first.error).toHaveLength(1);
            expect(first.error[0]?.message).toBe("expected_pattern:first");
        }

        await expect(User.parseAsync(invalid, {
            error: "async failure"
        })).rejects.toMatchObject({
            issues: [
                {
                    message: "async failure"
                },
                {
                    message: "async failure"
                }
            ]
        });
        expect((): void => {
            FastUser.parse(invalid, {
                error: "throw failure"
            });
        }).toThrow(TypeSeaAssertionError);
        expect((): void => {
            User.check(invalid, {
                error: 1 as unknown as string
            });
        }).toThrow(TypeError);
    });

    test("supports Zod-style global error maps", async () => {
        const User = t.object({
            id: t.string.uuid(),
            name: t.string.min(1)
        });
        const FastUser = compile(User, { name: "globalErrorMapUser" });
        const invalid = {
            id: "not-a-uuid",
            name: ""
        };
        const mapper = (issue: Issue): ParseErrorResult => ({
            message: `global:${issue.code}:${issue.path.join(".")}`
        });

        expect(getErrorMap()).toBeUndefined();
        expect(setErrorMap(mapper)).toBeUndefined();
        expect(getErrorMap()).toBe(mapper);

        const interpreted = User.safeParse(invalid);
        const compiled = FastUser.safeParse(invalid);
        const first = FastUser.checkFirst(invalid);

        expect(interpreted.success).toBe(false);
        if (!interpreted.success) {
            expect(interpreted.error.issues[0]?.message)
                .toBe("global:expected_pattern:id");
            expect(interpreted.error.issues[1]?.message)
                .toBe("global:expected_min_length:name");
        }
        expect(compiled.success).toBe(false);
        if (!compiled.success) {
            expect(compiled.error.issues[0]?.message)
                .toBe("global:expected_pattern:id");
        }
        expect(first.ok).toBe(false);
        if (!first.ok) {
            expect(first.error[0]?.message).toBe("global:expected_pattern:id");
        }
        expect(User.safeParse(invalid, { error: "local failure" })).toMatchObject({
            success: false,
            error: {
                issues: [
                    {
                        message: "local failure"
                    },
                    {
                        message: "local failure"
                    }
                ]
            }
        });
        await expect(User.parseAsync(invalid)).rejects.toMatchObject({
            issues: [
                {
                    message: "global:expected_pattern:id"
                },
                {
                    message: "global:expected_min_length:name"
                }
            ]
        });
        expect(resetErrorMap()).toBe(mapper);
        expect(getErrorMap()).toBeUndefined();
        expect(() => setErrorMap("bad" as unknown as typeof mapper)).toThrow(TypeError);
    });

    test("keeps schema-level messages above per-parse and global maps", () => {
        const User = t.object({
            name: t.string.min(2, "schema name wins"),
            email: t.string.email()
        });
        const invalid = {
            name: "",
            email: "bad"
        };
        let localCalls = 0;
        let globalCalls = 0;

        expect(setErrorMap(() => {
            globalCalls += 1;
            return "global failure";
        })).toBeUndefined();

        const global = User.safeParse(invalid);
        const local = User.safeParse(invalid, {
            error: () => {
                localCalls += 1;
                return "local failure";
            }
        });
        const staticLocal = User.safeParse(invalid, {
            error: "static local failure"
        });

        expect(global.success).toBe(false);
        expect(local.success).toBe(false);
        expect(staticLocal.success).toBe(false);
        if (!global.success && !local.success && !staticLocal.success) {
            expect(global.error.issues[0]?.message).toBe("schema name wins");
            expect(global.error.issues[1]?.message).toBe("global failure");
            expect(local.error.issues[0]?.message).toBe("schema name wins");
            expect(local.error.issues[1]?.message).toBe("local failure");
            expect(staticLocal.error.issues[0]?.message).toBe("schema name wins");
            expect(staticLocal.error.issues[1]?.message).toBe("static local failure");
        }
        expect(globalCalls).toBe(1);
        expect(localCalls).toBe(1);
        expect(resetErrorMap()).toBeTypeOf("function");
        expect(getErrorMap()).toBeUndefined();
    });

    test("supports Zod-style config and locale helpers", () => {
        const Name = t.object({
            name: t.string.min(3)
        });
        const invalid = {
            name: ""
        };

        expect(config(z.locales.ko())).toBeUndefined();
        const korean = z.safeParse(Name, invalid);

        expect(korean.success).toBe(false);
        if (!korean.success) {
            expect(korean.error.issues[0]?.message)
                .toBe("$[\"name\"]에서 length >= 3이 필요하지만 length 0을 받았습니다.");
        }

        expect(config({
            customError: (issue: TypeSeaConfigIssue) =>
                [
                    issue.code,
                    issue.path.join("."),
                    typeof issue.input,
                    String(issue.minimum),
                    String(issue.inclusive)
                ].join(":")
        })).not.toBeUndefined();

        const custom = Name.safeParse(invalid);
        expect(custom.success).toBe(false);
        if (!custom.success) {
            expect(custom.error.issues[0]?.message)
                .toBe("expected_min_length:name:object:3:true");
        }

        expect(locales.en().customError).toBeTypeOf("function");
        expect(config({})).not.toBeUndefined();
        expect(getErrorMap()).toBeUndefined();
        expect(() => config(1 as unknown as Parameters<typeof config>[0]))
            .toThrow(TypeError);
    });

    test("supports Zod-style reportInput without invoking accessors", () => {
        const User = t.object({
            profile: t.object({
                name: t.string.min(2)
            })
        });
        const invalid = {
            profile: {
                name: ""
            }
        };
        const reported = User.safeParse(invalid, {
            reportInput: true
        });

        expect(reported.success).toBe(false);
        if (!reported.success) {
            const first = reported.error.issues[0];
            expect(first?.input).toBe("");
            expect(z.toZodIssues(reported.error)[0]?.input).toBe("");
        }

        expect(config({
            customError: (issue: TypeSeaConfigIssue) =>
                typeof issue.input === "string"
                    ? `reported:${String(issue.input.length)}`
                    : "missing"
        })).toBeUndefined();
        const mapped = User.safeParse(invalid, {
            reportInput: true
        });
        expect(mapped.success).toBe(false);
        if (!mapped.success) {
            expect(mapped.error.issues[0]?.message).toBe("reported:0");
        }
        expect(config({})).not.toBeUndefined();

        const MissingName = t.object({
            name: t.string
        });
        const missing = MissingName.safeParse({}, {
            reportInput: true
        });
        expect(missing.success).toBe(false);
        if (!missing.success) {
            const first = missing.error.issues[0];
            expect(Object.prototype.hasOwnProperty.call(first, "input")).toBe(true);
            expect(first?.input).toBeUndefined();
        }

        let getterCalls = 0;
        const hostile = {};
        Object.defineProperty(hostile, "name", {
            configurable: true,
            enumerable: true,
            get() {
                getterCalls += 1;
                return "Ada";
            }
        });
        const hostileResult = MissingName.safeParse(hostile, {
            reportInput: true
        });
        expect(hostileResult.success).toBe(false);
        expect(getterCalls).toBe(0);
        if (!hostileResult.success) {
            const first = hostileResult.error.issues[0];
            expect(Object.prototype.hasOwnProperty.call(first, "input")).toBe(false);
        }
    });

    test("supports Zod-style static messages on scalar and length checks", () => {
        const Name = t.string.min(3, { error: "name is too short" });
        const Code = t.string.length(2, "code must have two characters");
        const Count = t.number.int("whole number required").gt(0, {
            error: "count must be positive"
        });
        const Tags = t.array(t.string).nonempty("at least one tag required");
        const Flags = t.set(t.string).nonempty("at least one flag required");
        const FastName = compile(Name, { name: "messageName" });
        const FastCount = compile(Count, { name: "messageCount" });
        const FastTags = compile(Tags, { name: "messageTags" });
        const FastFlags = compile(Flags, { name: "messageFlags" });

        const nameResult = Name.check("");
        const fastNameResult = FastName.check("");
        const codeResult = Code.check("x");
        const countResult = Count.check(-1.5);
        const fastCountFirst = FastCount.checkFirst(-1.5);
        const tagsResult = Tags.check([]);
        const fastTagsResult = FastTags.check([]);
        const flagsResult = FastFlags.check(new Set<string>());

        expect(nameResult.ok).toBe(false);
        expect(fastNameResult).toEqual(nameResult);
        if (!nameResult.ok) {
            expect(nameResult.error[0]?.message).toBe("name is too short");
        }
        expect(codeResult.ok).toBe(false);
        if (!codeResult.ok) {
            expect(codeResult.error[0]?.message).toBe("code must have two characters");
        }
        expect(countResult.ok).toBe(false);
        if (!countResult.ok) {
            expect(countResult.error.map((issue) => issue.message)).toEqual([
                "whole number required",
                "count must be positive"
            ]);
        }
        expect(fastCountFirst.ok).toBe(false);
        if (!fastCountFirst.ok) {
            expect(fastCountFirst.error[0]?.message).toBe("whole number required");
        }
        expect(tagsResult.ok).toBe(false);
        expect(fastTagsResult).toEqual(tagsResult);
        if (!tagsResult.ok) {
            expect(tagsResult.error[0]?.message).toBe("at least one tag required");
        }
        expect(flagsResult.ok).toBe(false);
        if (!flagsResult.ok) {
            expect(flagsResult.error[0]?.message).toBe("at least one flag required");
        }
        expect(() => t.string.min(1, { error: 1 as unknown as string }))
            .toThrow(TypeError);
    });

    test("supports static messages on formats, dates, bigints, and files", () => {
        const Pattern = t.string.regex(/^ts_/u, "ts_prefix", "must start with ts_");
        const Email = t.string.email({ error: "email is invalid" });
        const Uuid = t.string.uuid("uuid is invalid");
        const DateValue = t.date.min(new Date("2026-01-01T00:00:00.000Z"), {
            error: "date is too early"
        });
        const BigCount = t.bigint.multipleOf(4n, "count must align to four");
        const Upload = t.file().max(4, "file is too large").mime("text/plain", {
            error: "file must be plain text"
        });
        const Shape = t.strictObject({
            email: Email,
            uuid: Uuid,
            count: BigCount
        });
        const FastPattern = compile(Pattern, { name: "messagePattern" });
        const FastDate = compile(DateValue, { name: "messageDate" });
        const FastShape = compile(Shape, { name: "messageShape" });
        const FastUpload = compile(Upload, { name: "messageUpload" });

        const patternResult = Pattern.check("js_value");
        const fastPatternFirst = FastPattern.checkFirst("js_value");
        const dateResult = DateValue.check(new Date("2025-01-01T00:00:00.000Z"));
        const fastDateResult = FastDate.check(new Date("2025-01-01T00:00:00.000Z"));
        const shapeValue = {
            email: "not email",
            uuid: "not uuid",
            count: 6n
        };
        const shapeResult = Shape.check(shapeValue);
        const fastShapeResult = FastShape.check(shapeValue);
        const upload = new File(["hello"], "note.bin", {
            type: "application/octet-stream"
        });
        const uploadResult = Upload.check(upload);
        const fastUploadFirst = FastUpload.checkFirst(upload);

        expect(patternResult.ok).toBe(false);
        if (!patternResult.ok) {
            expect(patternResult.error[0]?.message).toBe("must start with ts_");
        }
        expect(fastPatternFirst.ok).toBe(false);
        if (!fastPatternFirst.ok) {
            expect(fastPatternFirst.error[0]?.message).toBe("must start with ts_");
        }
        expect(dateResult.ok).toBe(false);
        expect(fastDateResult).toEqual(dateResult);
        if (!dateResult.ok) {
            expect(dateResult.error[0]?.message).toBe("date is too early");
        }
        expect(shapeResult.ok).toBe(false);
        expect(fastShapeResult).toEqual(shapeResult);
        if (!shapeResult.ok) {
            expect(shapeResult.error.map((issue) => issue.message)).toEqual([
                "email is invalid",
                "uuid is invalid",
                "count must align to four"
            ]);
        }
        expect(uploadResult.ok).toBe(false);
        if (!uploadResult.ok) {
            expect(uploadResult.error.map((issue) => issue.message)).toEqual([
                "file is too large",
                "file must be plain text"
            ]);
        }
        expect(fastUploadFirst.ok).toBe(false);
        if (!fastUploadFirst.ok) {
            expect(fastUploadFirst.error[0]?.message).toBe("file is too large");
        }
        expect(() => t.string.uuid({ error: 1 as unknown as string }))
            .toThrow(TypeError);
    });

    test("supports Zod-style constructor messages on primitive type failures", () => {
        const Name = t.string({ error: "name must be text" }).min(2);
        const Count = t.number("count must be numeric").int();
        const Flag = t.boolean({ error: "flag must be boolean" });
        const Marker = t.symbol("marker must be symbol");
        const DateValue = t.date({ error: "date must be valid" });
        const BigCount = t.bigint("count must be bigint");
        const Upload = t.file({ error: "upload must be a File" });
        const Shape = t.strictObject({
            name: Name,
            count: Count,
            flag: Flag,
            marker: Marker,
            date: DateValue,
            bigCount: BigCount
        });
        const FastName = compile(Name, { name: "constructorMessageName" });
        const FastShape = compile(Shape, { name: "constructorMessageShape" });
        const FastUpload = compile(Upload, { name: "constructorMessageUpload" });

        const nameType = Name.check(1);
        const nameLength = Name.check("");
        const fastNameType = FastName.check(1);
        const fastNameFirst = FastName.checkFirst(1);
        const uploadType = Upload.check(1);
        const fastUploadType = FastUpload.check(1);
        const shapeResult = Shape.check({
            name: 1,
            count: "1",
            flag: "yes",
            marker: "marker",
            date: "2026-01-01",
            bigCount: 1
        });
        const fastShapeResult = FastShape.check({
            name: 1,
            count: "1",
            flag: "yes",
            marker: "marker",
            date: "2026-01-01",
            bigCount: 1
        });

        expect(Name.is("ok")).toBe(true);
        expect(t.string().schema).toEqual(t.string.schema);
        expect(nameType.ok).toBe(false);
        expect(fastNameType).toEqual(nameType);
        if (!nameType.ok) {
            expect(nameType.error[0]?.message).toBe("name must be text");
        }
        expect(nameLength.ok).toBe(false);
        if (!nameLength.ok) {
            expect(nameLength.error[0]?.message).toBeUndefined();
        }
        expect(fastNameFirst.ok).toBe(false);
        if (!fastNameFirst.ok) {
            expect(fastNameFirst.error[0]?.message).toBe("name must be text");
        }
        expect(uploadType.ok).toBe(false);
        expect(fastUploadType).toEqual(uploadType);
        if (!uploadType.ok) {
            expect(uploadType.error[0]?.message).toBe("upload must be a File");
        }
        expect(shapeResult.ok).toBe(false);
        expect(fastShapeResult).toEqual(shapeResult);
        if (!shapeResult.ok) {
            expect(shapeResult.error.map((issue) => issue.message)).toEqual([
                "name must be text",
                "count must be numeric",
                "flag must be boolean",
                "marker must be symbol",
                "date must be valid",
                "count must be bigint"
            ]);
        }
        expect(() => t.number({ error: 1 as unknown as string }))
            .toThrow(TypeError);
    });

    test("supports readonly output freezing on parse-like surfaces", () => {
        const User = t.object({
            name: t.string,
            settings: t.object({
                theme: t.string
            }).readonly(),
            tags: t.array(t.string).readonly()
        });
        const ReadonlyUser = User.readonly();
        const FastReadonlyUser = compile(ReadonlyUser, { name: "readonlyUser" });
        const value = {
            name: "Ada",
            settings: {
                theme: "dark"
            },
            tags: ["admin"]
        };

        expect(ReadonlyUser.is(value)).toBe(true);
        expect(Object.isFrozen(value)).toBe(false);
        expect(Object.isFrozen(value.settings)).toBe(false);
        expect(Object.isFrozen(value.tags)).toBe(false);

        const checked = ReadonlyUser.check(value);
        expect(checked.ok).toBe(true);
        expect(Object.isFrozen(value)).toBe(true);
        expect(Object.isFrozen(value.settings)).toBe(true);
        expect(Object.isFrozen(value.tags)).toBe(true);

        const compiledValue = {
            name: "Grace",
            settings: {
                theme: "light"
            },
            tags: ["ops"]
        };
        expect(FastReadonlyUser.parse(compiledValue)).toBe(compiledValue);
        expect(Object.isFrozen(compiledValue)).toBe(true);
        expect(Object.isFrozen(compiledValue.settings)).toBe(true);
        expect(Object.isFrozen(compiledValue.tags)).toBe(true);

        const safeValue = {
            name: "Lin",
            settings: {
                theme: "contrast"
            },
            tags: ["reader"]
        };
        const parsed = t.readonly(User).safeParse(safeValue);
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data).toBe(safeValue);
            expect(Object.isFrozen(parsed.data)).toBe(true);
        }
    });

    test("finalizes output wrappers reached through lazy schemas", () => {
        const LazyStrip = t.lazy(() => t.object({
            id: t.string
        }).strip());
        const LazyReadonly = t.lazy(() => t.object({
            id: t.string
        }).readonly());
        const FastStrip = compile(LazyStrip, { name: "lazyStripFinalization" });
        const FastReadonly = compile(LazyReadonly, { name: "lazyReadonlyFinalization" });
        const interpretedStrip = LazyStrip.check({ id: "slow", extra: true });
        const compiledStrip = FastStrip.check({ id: "fast", extra: true });
        const interpretedReadonly = LazyReadonly.check({ id: "slow" });
        const compiledReadonly = FastReadonly.check({ id: "fast" });

        expect(interpretedStrip).toEqual({
            ok: true,
            value: { id: "slow" }
        });
        expect(compiledStrip).toEqual({
            ok: true,
            value: { id: "fast" }
        });
        expect(interpretedReadonly.ok).toBe(true);
        expect(compiledReadonly.ok).toBe(true);
        if (interpretedReadonly.ok && compiledReadonly.ok) {
            expect(Object.isFrozen(interpretedReadonly.value)).toBe(true);
            expect(Object.isFrozen(compiledReadonly.value)).toBe(true);
        }
    });

    test("supports additional Zod-style string formats", () => {
        const formats = [
            [t.email(), "ada@example.com", "not-an-email"],
            [t.email({ pattern: /^[^@]+@example\.com$/u }), "ada@example.com", "ada@other.test"],
            [t.email({ pattern: regexes.html5Email }), "ada@example.com", "not-an-email"],
            [t.uuid(), "550e8400-e29b-41d4-a716-446655440000", "not-a-uuid"],
            [t.uuid({ version: "v7" }), "01890f5c-7f6b-7cc2-98c4-dc0c0c07398f", "550e8400-e29b-41d4-a716-446655440000"],
            [t.guid(), "550e8400-e29b-41d4-a716-446655440000", "not-a-guid"],
            [t.uuidv4(), "550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-71d4-a716-446655440000"],
            [t.uuidv6(), "1ec9414c-232a-6b00-b3c8-9e6bdeced846", "550e8400-e29b-41d4-a716-446655440000"],
            [t.uuidv7(), "01890f5c-7f6b-7cc2-98c4-dc0c0c07398f", "550e8400-e29b-41d4-a716-446655440000"],
            [t.url(), "https://example.com/a?q=1", "not a url"],
            [t.url({ protocol: /^https?$/u, hostname: /^example\.com$/u }), "https://example.com/a?q=1", "https://other.test/a"],
            [t.url({ hostname: t.regexes.domain }), "https://example.com/a?q=1", "https://localhost/a"],
            [t.httpUrl(), "https://example.com/a?q=1", "ftp://example.com"],
            [t.hostname(), "api.example.com", "-bad.example.com"],
            [t.e164(), "+14155552671", "4155552671"],
            [t.emoji(), "✅", "ok"],
            [t.base64(), "Zm9v", "Zm9v?"],
            [t.base64url(), "Zm9v-L8", "Zm9v/L8"],
            [t.hex(), "deadBEEF", "abc"],
            [t.jwt(), "aaa.bbb.ccc", "aaa.bbb"],
            [t.jwt({ alg: "HS256" }), "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.sig", "eyJhbGciOiJub25lIn0.e30.sig"],
            [t.nanoid(), "0123456789abcdefghijk", "too-short"],
            [t.cuid(), "ckcjyb1250000mjs6iv0ki8q5", "bad-cuid"],
            [t.cuid2(), "tz4a98xxat96iws9zmbrgj3a", "1bad"],
            [t.xid(), "9m4e2mr0ui3e8a215n4g", "bad-xid"],
            [t.ksuid(), "0ujtsYcgvSTl8PAuAdqWYSMnLOv", "bad-ksuid"],
            [t.ulid(), "01ARZ3NDEKTSV4RRFFQ69G5FAV", "91ARZ3NDEKTSV4RRFFQ69G5FAV"],
            [t.ipv4(), "192.168.0.1", "999.168.0.1"],
            [t.ipv6(), "2001:db8::1", "not-ipv6"],
            [t.mac(), "00:1A:2B:3C:4D:5E", "00-1A-2B-3C-4D-5E"],
            [t.mac("-"), "00-1A-2B-3C-4D-5E", "00:1A:2B:3C:4D:5E"],
            [t.mac({ delimiter: "-" }), "00-1A-2B-3C-4D-5E", "00:1A:2B:3C:4D:5E"],
            [t.cidrv4(), "192.168.0.0/24", "192.168.0.0/33"],
            [t.cidrv6(), "2001:db8::/32", "2001:db8::/129"],
            [t.isoDate(), "2026-07-06", "2026-99-99"],
            [t.isoDateTime(), "2026-07-06T03:15:00Z", "2026-07-06 03:15"],
            [t.isoDateTime({ offset: true }), "2026-07-06T03:15:00+02:00", "2026-07-06T03:15:00+0200"],
            [t.isoTime(), "03:15:00.999", "24:00"],
            [t.isoTime({ precision: 3 }), "03:15:00.999", "03:15:00.99"],
            [t.isoDuration(), "P3Y6M4DT12H30M5S", "3 years"],
            [t.iso.date(), "2026-07-06", "2026-99-99"],
            [t.iso.datetime(), "2026-07-06T03:15:00Z", "2026-07-06 03:15"],
            [t.iso.time(), "03:15:00.999", "24:00"],
            [t.iso.duration(), "P3Y6M4DT12H30M5S", "3 years"],
            [t.string.httpUrl(), "https://example.com/a?q=1", "ftp://example.com"],
            [t.string.hostname(), "api.example.com", "-bad.example.com"],
            [t.string.e164(), "+14155552671", "4155552671"],
            [t.string.emoji(), "✅", "ok"],
            [t.string.base64(), "Zm9v", "Zm9v?"],
            [t.string.base64url(), "Zm9v-L8", "Zm9v/L8"],
            [t.string.hex(), "deadBEEF", "abc"],
            [t.string.jwt(), "aaa.bbb.ccc", "aaa.bbb"],
            [t.string.nanoid(), "0123456789abcdefghijk", "too-short"],
            [t.string.cuid(), "ckcjyb1250000mjs6iv0ki8q5", "bad-cuid"],
            [t.string.cuid2(), "tz4a98xxat96iws9zmbrgj3a", "1bad"],
            [t.string.xid(), "9m4e2mr0ui3e8a215n4g", "bad-xid"],
            [t.string.ksuid(), "0ujtsYcgvSTl8PAuAdqWYSMnLOv", "bad-ksuid"],
            [t.string.mac(), "00:1A:2B:3C:4D:5E", "00-1A-2B-3C-4D-5E"],
            [t.string.mac("-"), "00-1A-2B-3C-4D-5E", "00:1A:2B:3C:4D:5E"],
            [t.string.cidrv4(), "192.168.0.0/24", "192.168.0.0/33"],
            [t.string.cidrv6(), "2001:db8::/32", "2001:db8::/129"],
            [t.string.isoTime(), "03:15:00.999", "24:00"],
            [t.string.isoDuration(), "P3Y6M4DT12H30M5S", "3 years"]
        ] as const;

        for (let index = 0; index < formats.length; index += 1) {
            const row = formats[index];
            if (row === undefined) {
                continue;
            }
            const [guard, valid, invalid] = row;
            const Fast = compile(guard, { name: `stringFormat${String(index)}` });

            expect(guard.is(valid)).toBe(true);
            expect(guard.is(invalid)).toBe(false);
            expect(Fast.is(valid)).toBe(true);
            expect(Fast.is(invalid)).toBe(false);
            expect(Fast.safeParse(invalid).success).toBe(false);
        }
    });

    test("supports Set size checks", async () => {
        const Tags = t.set(t.string).min(1).max(2);
        const ExactTags = t.set(t.string).size(2);
        const FastTags = compile(Tags, { name: "setSizeTags" });

        expect(Tags.is(new Set(["a"]))).toBe(true);
        expect(Tags.is(new Set<string>())).toBe(false);
        expect(Tags.is(new Set(["a", "b", "c"]))).toBe(false);
        expect(ExactTags.is(new Set(["a", "b"]))).toBe(true);
        expect(ExactTags.is(new Set(["a"]))).toBe(false);
        expect(FastTags.is(new Set(["a", "b"]))).toBe(true);
        expect(FastTags.is(new Set(["a", "b", "c"]))).toBe(false);
        expect(await isAsync(Tags, new Set(["a"]))).toBe(true);
        expect(await isAsync(Tags, new Set<string>())).toBe(false);

        const result = Tags.check(new Set<string>());
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error[0]?.code).toBe("expected_min_length");
        }
    });

    test("supports File size and MIME checks", async () => {
        const Upload = t.file().min(2).max(8).mime(["text/plain", "image/*"]);
        const FastUpload = compile(Upload, { name: "fileUpload" });
        const AsyncUpload = compileAsync(Upload, { name: "asyncFileUpload" });
        const text = new File(["hello"], "note.txt", { type: "text/plain" });
        const image = new File(["data"], "image.png", { type: "image/png" });
        const empty = new File([""], "empty.txt", { type: "text/plain" });
        const json = new File(["hello"], "data.json", { type: "application/json" });
        const large = new File(["0123456789"], "large.txt", { type: "text/plain" });

        expectTypeOf<Infer<typeof Upload>>().toEqualTypeOf<File>();
        expect(Upload.is(text)).toBe(true);
        expect(Upload.is(image)).toBe(true);
        expect(Upload.is(empty)).toBe(false);
        expect(Upload.is(json)).toBe(false);
        expect(Upload.is(large)).toBe(false);
        expect(Upload.is({ size: 5, type: "text/plain" })).toBe(false);
        expect(FastUpload.is(text)).toBe(true);
        expect(FastUpload.is(json)).toBe(false);
        expect(await isAsync(Upload, text)).toBe(true);
        expect(await AsyncUpload.is(text)).toBe(true);
        expect(await AsyncUpload.is(json)).toBe(false);

        const result = Upload.check(json);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error[0]?.code).toBe("expected_pattern");
        }
    });

    test("supports exclusive unions", async () => {
        const ByEmail = t.object({
            email: t.string.email()
        });
        const ByPhone = t.object({
            phone: t.string.min(1)
        });
        const Contact = t.xor(ByEmail, ByPhone);
        const Overlap = t.xor(
            t.object({
                id: t.string
            }),
            t.object({
                id: t.string,
                name: t.optional(t.string)
            })
        );
        const FastContact = compile(Contact, { name: "xorContact" });

        expect(Contact.options).toEqual([ByEmail, ByPhone]);
        expect(Object.isFrozen(Contact.options)).toBe(true);
        expect(Contact.is({ email: "ada@example.com" })).toBe(true);
        expect(Contact.is({ phone: "555-0100" })).toBe(true);
        expect(Contact.is({ email: "ada@example.com", phone: "555-0100" }))
            .toBe(false);
        expect(Overlap.is({ id: "u_1" })).toBe(false);
        expect(FastContact.is({ email: "ada@example.com" })).toBe(true);
        expect(FastContact.is({})).toBe(false);
        expect(await isAsync(Contact, { phone: "555-0100" })).toBe(true);
        expect(await isAsync(Contact, {})).toBe(false);

        const result = Contact.check({});
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error[0]?.expected).toBe("exclusive union");
        }
    });

    test("supports template literal string guards", () => {
        const OrderId = t.templateLiteral([
            "order_",
            t.union(t.literal("prod"), t.literal("dev")),
            "_",
            t.number.int()
        ]);
        const FastOrderId = compile(OrderId, { name: "templateOrderId" });

        expect(OrderId.is("order_prod_42")).toBe(true);
        expect(OrderId.is("order_dev_-7")).toBe(true);
        expect(OrderId.is("order_prod_1.5")).toBe(false);
        expect(OrderId.is("order_stage_42")).toBe(false);
        expect(OrderId.is("order_prod_value")).toBe(false);
        expect(FastOrderId.is("order_prod_42")).toBe(true);
        expect(FastOrderId.is("order_stage_42")).toBe(false);
        expect(() => t.templateLiteral(["user_", t.object({ id: t.string })]))
            .toThrow(TypeError);
    });

    test("supports Zod-style template literal parts", () => {
        const Greeting = t.templateLiteral(["email: ", t.string]);
        const HighFive = t.templateLiteral(["high", t.literal(5)]);
        const NullableGrass = t.templateLiteral([t.nullable(t.literal("grassy"))]);
        const Size = t.templateLiteral([t.number, t.enum(["px", "em", "rem"])]);
        const Tagged = t.templateLiteral(["tag:", t.string.min(2).max(4), "!"]);
        const EmojiLength = t.templateLiteral(["emoji:", t.string.length(2)]);
        const FastSize = compile(Size, { name: "templateSize" });
        const FastTagged = compile(Tagged, { name: "templateTagged" });

        expect(Greeting.is("email: ")).toBe(true);
        expect(Greeting.is("email: ada")).toBe(true);
        expect(Greeting.is("email: \n")).toBe(true);
        expect(HighFive.is("high5")).toBe(true);
        expect(HighFive.is("high6")).toBe(false);
        expect(NullableGrass.is("grassy")).toBe(true);
        expect(NullableGrass.is("null")).toBe(true);
        expect(NullableGrass.is("undefined")).toBe(false);
        expect(Size.is("12px")).toBe(true);
        expect(Size.is("-1.5rem")).toBe(true);
        expect(Size.is("12vh")).toBe(false);
        expect(FastSize.is("12em")).toBe(true);
        expect(FastSize.is("12vh")).toBe(false);
        expect(Tagged.is("tag:ab!")).toBe(true);
        expect(Tagged.is("tag:abcd!")).toBe(true);
        expect(Tagged.is("tag:a!")).toBe(false);
        expect(Tagged.is("tag:abcde!")).toBe(false);
        expect(FastTagged.is("tag:abc!")).toBe(true);
        expect(FastTagged.is("tag:a!")).toBe(false);
        expect(EmojiLength.is("emoji:🙂")).toBe(true);
        expect(EmojiLength.is("emoji:a")).toBe(false);
    });

    test("supports Zod-style string format convenience guards", () => {
        const Guid = t.guid();
        const V4 = t.uuidv4();
        const V6 = t.string.uuidv6();
        const V7 = t.string.uuidv7();
        const Upper = t.string.uppercase();
        const Lower = t.string.lowercase();
        const Sha256 = t.hash("sha256");
        const Sha256Base64Url = t.string.hash("sha256", { enc: "base64url" });
        const HexColor = t.stringFormat("hex_color", /^#[0-9a-f]{6}$/iu);
        const EvenLength = t.stringFormat("even_length", (value) => value.length % 2 === 0);
        const FastSha256 = compile(Sha256, { name: "sha256Hex" });

        expect(Guid.is("01890f5c-7f6b-7cc2-18c4-dc0c0c07398f")).toBe(true);
        expect(V4.is("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
        expect(V4.is("01890f5c-7f6b-7cc2-98c4-dc0c0c07398f")).toBe(false);
        expect(V6.is("1ec9414c-232a-6b00-b3c8-9e6bdeced846")).toBe(true);
        expect(V7.is("01890f5c-7f6b-7cc2-98c4-dc0c0c07398f")).toBe(true);
        expect(Upper.is("ABC_123")).toBe(true);
        expect(Upper.is("ABC_def")).toBe(false);
        expect(Lower.is("abc_123")).toBe(true);
        expect(Lower.is("abc_DEF")).toBe(false);
        expect(Sha256.is("a".repeat(64))).toBe(true);
        expect(Sha256.is("a".repeat(63))).toBe(false);
        expect(Sha256Base64Url.is("a".repeat(43))).toBe(true);
        expect(Sha256Base64Url.is("a".repeat(44))).toBe(false);
        expect(HexColor.is("#aabbcc")).toBe(true);
        expect(EvenLength.is("abcd")).toBe(true);
        expect(EvenLength.is("abc")).toBe(false);
        expect(FastSha256.is("f".repeat(64))).toBe(true);
        expect(() => t.hash("sha3" as "sha256")).toThrow(TypeError);
        expect(() => t.string.hash("sha256", { enc: "binary" as "hex" }))
            .toThrow(TypeError);
    });

    test("supports Zod-style number convenience guards", () => {
        const NaNOnly = t.nan();
        const SafeInt = t.int();
        const Int32 = t.int32();
        const MethodInt32 = t.number.int32();
        const UInt32 = t.uint32();
        const Float32 = t.float32();
        const Float64 = t.float64();
        const Stepped = t.number.step(0.5);
        const FastInt32 = compile(Int32, { name: "int32Value" });
        const FastFloat32 = compile(Float32, { name: "float32Value" });

        expect(NaNOnly.is(Number.NaN)).toBe(true);
        expect(NaNOnly.is(0)).toBe(false);
        expect(SafeInt.is(42)).toBe(true);
        expect(SafeInt.is(1.5)).toBe(false);
        expect(SafeInt.is(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
        expect(Int32.is(2147483647)).toBe(true);
        expect(Int32.is(2147483648)).toBe(false);
        expect(MethodInt32.is(-2147483648)).toBe(true);
        expect(UInt32.is(4294967295)).toBe(true);
        expect(UInt32.is(-1)).toBe(false);
        expect(Float32.is(3.4028234663852886e38)).toBe(true);
        expect(Float32.is(3.4028234663852886e39)).toBe(false);
        expect(Float64.is(Number.MAX_VALUE)).toBe(true);
        expect(Float64.is(Number.POSITIVE_INFINITY)).toBe(false);
        expect(Stepped.is(1.5)).toBe(true);
        expect(Stepped.is(1.25)).toBe(false);
        expect(FastInt32.is(-2147483648)).toBe(true);
        expect(FastFloat32.is(-3.4028234663852886e38)).toBe(true);
        expect(FastFloat32.is(-3.4028234663852886e39)).toBe(false);
    });

    test("supports record key schemas", async () => {
        const Scores = t.record(t.string.startsWith("score_"), t.number.int());
        const NumberKeys = t.record(
            t.number.int().gte(0).lte(10),
            t.string.min(1)
        );
        const LooseNumberKeys = t.looseRecord(
            t.number.int().gte(0).lte(10),
            t.string.min(1)
        );
        const FastScores = compile(Scores, { name: "recordKeyScores" });
        const FastNumberKeys = compile(NumberKeys, { name: "numericRecordKeys" });

        expect(Scores.is({ score_math: 10 })).toBe(true);
        expect(Scores.is({ math: 10 })).toBe(false);
        expect(Scores.is({ score_math: 1.5 })).toBe(false);
        expect(FastScores.is({ score_math: 10 })).toBe(true);
        expect(FastScores.is({ math: 10 })).toBe(false);
        expect(await isAsync(Scores, { score_math: 10 })).toBe(true);
        expect(await isAsync(Scores, { math: 10 })).toBe(false);
        expect(NumberKeys.is({ 0: "zero", 10: "ten" })).toBe(true);
        expect(NumberKeys.is({ 1.5: "fraction" })).toBe(false);
        expect(NumberKeys.is({ 12: "too high" })).toBe(false);
        expect(NumberKeys.is({ abc: "word" })).toBe(false);
        expect(FastNumberKeys.is({ 0: "zero", 10: "ten" })).toBe(true);
        expect(FastNumberKeys.is({ 1.5: "fraction" })).toBe(false);
        expect(await isAsync(NumberKeys, { 2: "two" })).toBe(true);
        expect(await isAsync(NumberKeys, { 12: "too high" })).toBe(false);
        expect(LooseNumberKeys.is({ 2: "two", abc: 1 })).toBe(true);
        expect(LooseNumberKeys.is({ 2: "" })).toBe(false);

        const result = Scores.check({ math: 10 });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error[0]?.path).toEqual(["math"]);
            expect(result.error[0]?.code).toBe("expected_pattern");
        }
        const numericResult = NumberKeys.check({ 1.5: "fraction" });
        expect(numericResult.ok).toBe(false);
        if (!numericResult.ok) {
            expect(numericResult.error[0]?.path).toEqual(["1.5"]);
            expect(numericResult.error[0]?.code).toBe("expected_integer");
        }
    });

    test("requires closed literal record keys exhaustively", async () => {
        const Statuses = t.record(
            t.enum(["draft", "published"]),
            t.number.int().nonnegative()
        );
        const Pair = t.record(
            t.union(t.literal("left"), t.literal("right")),
            t.string.min(1)
        );
        const FastStatuses = compile(Statuses, { name: "statusRecord" });
        const FastPair = compile(Pair, { name: "pairRecord" });
        const valid = {
            draft: 1,
            published: 2
        };
        const missing = {
            draft: 1
        };
        const extra = {
            draft: 1,
            published: 2,
            archived: 3
        };
        const hidden = {
            draft: 1
        } as Record<string, unknown>;
        Object.defineProperty(hidden, "published", {
            value: 2,
            enumerable: false
        });

        expect(Statuses.is(valid)).toBe(true);
        expect(Statuses.is(missing)).toBe(false);
        expect(Statuses.is(extra)).toBe(false);
        expect(Statuses.is(hidden)).toBe(false);
        expect(FastStatuses.is(valid)).toBe(true);
        expect(FastStatuses.is(missing)).toBe(false);
        expect(FastStatuses.is(extra)).toBe(false);
        expect(FastStatuses.is(hidden)).toBe(false);
        expect(Pair.is({ left: "l", right: "r" })).toBe(true);
        expect(Pair.is({ left: "l" })).toBe(false);
        expect(FastPair.is({ left: "l", right: "r" })).toBe(true);
        expect(FastPair.is({ left: "l" })).toBe(false);
        expect(await isAsync(Statuses, valid)).toBe(true);
        expect(await isAsync(Statuses, missing)).toBe(false);

        const result = FastStatuses.check(missing);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error[0]).toMatchObject({
                path: ["published"],
                code: "expected_record"
            });
        }
        const first = FastStatuses.checkFirst(hidden);
        expect(first.ok).toBe(false);
        if (!first.ok) {
            expect(first.error[0]).toMatchObject({
                path: ["published"],
                code: "expected_record"
            });
        }
    });

    test("supports partial record key schemas", async () => {
        const Metrics = t.partialRecord(
            t.union(t.literal("latency"), t.literal("throughput")),
            t.number.nonnegative()
        );
        const FastMetrics = compile(Metrics, { name: "partialRecordMetrics" });

        expect(Metrics.is({})).toBe(true);
        expect(Metrics.is({ latency: 12 })).toBe(true);
        expect(Metrics.is({ throughput: 0 })).toBe(true);
        expect(Metrics.is({ latency: -1 })).toBe(false);
        expect(Metrics.is({ errors: 1 })).toBe(false);
        expect(FastMetrics.is({ latency: 12 })).toBe(true);
        expect(FastMetrics.is({ errors: 1 })).toBe(false);
        expect(await isAsync(Metrics, { throughput: 1 })).toBe(true);
        expect(await isAsync(Metrics, { errors: 1 })).toBe(false);
    });

    test("builds key guards from object shapes", () => {
        const sourceShape = {
            id: t.string,
            email: t.string.email()
        };
        const User = t.object(sourceShape);
        const LooseUser = t.looseObject({
            id: t.string
        });
        sourceShape.id = t.number as unknown as typeof sourceShape.id;
        const PartialUser = User.partial();
        const UserKey = User.keyof();
        const UserKeyFromTable = t.keyof(User);
        const EmptyKey = t.object({}).keyof();
        const FastUserKey = compile(UserKey, { name: "userKey" });

        expect(User.shape.id.is("u_1")).toBe(true);
        expect(User.shape.id.is(1)).toBe(false);
        expect(User.shape.email.is("ada@example.com")).toBe(true);
        expect(Object.isFrozen(User.shape)).toBe(true);
        expect(LooseUser.is({ id: "u_1", extra: true })).toBe(true);
        expect(PartialUser.shape.id.is(undefined)).toBe(true);
        expectTypeOf<Infer<typeof UserKey>>().toEqualTypeOf<"id" | "email">();
        expect(UserKey.is("id")).toBe(true);
        expect(UserKey.is("email")).toBe(true);
        expect(UserKey.is("name")).toBe(false);
        expect(UserKeyFromTable.is("id")).toBe(true);
        expect(EmptyKey.is("id")).toBe(false);
        expect(FastUserKey.is("email")).toBe(true);
    });

    test("returns frozen Result containers from interpreted and compiled checks", () => {
        const Name = t.string.min(1);
        const FastName = compile(Name, { name: "resultContainer" });
        const interpretedOk = Name.check("Ada");
        const interpretedErr = Name.check("");
        const compiledOk = FastName.check("Ada");
        const compiledErr = FastName.check("");

        expect(Object.isFrozen(interpretedOk)).toBe(true);
        expect(Object.isFrozen(interpretedErr)).toBe(true);
        expect(Object.isFrozen(compiledOk)).toBe(true);
        expect(Object.isFrozen(compiledErr)).toBe(true);

        const mutableOk = interpretedOk as unknown as {
            ok: false;
        };
        expect(() => {
            mutableOk.ok = false;
        }).toThrow(TypeError);
    });

    test("supports discriminated unions with indexed dispatch", () => {
        const Event = t.discriminatedUnion("kind", {
            user: t.object({
                kind: t.literal("user"),
                id: t.string
            }),
            order: t.object({
                kind: t.literal("order"),
                total: t.number.gte(0)
            })
        });

        expect(Event.is({ kind: "user", id: "u_1" })).toBe(true);
        expect(Event.is({ kind: "order", total: 10 })).toBe(true);
        expect(Event.is({ kind: "order", total: -1 })).toBe(false);
        expect(Event.is({ kind: "other" })).toBe(false);
    });

    test("assert is explicit and carries issues", () => {
        const UserId: StringGuard = t.string.uuid();

        expect(() => {
            UserId.assert("not-a-uuid");
        }).toThrow(TypeSeaAssertionError);
    });

    test("accepts modern UUID variants and nil UUID", () => {
        const UserId: StringGuard = t.string.uuid();

        expect(UserId.is("00000000-0000-0000-0000-000000000000")).toBe(true);
        expect(UserId.is("1ec9414c-232a-6b00-b3c8-9e6bdeced846")).toBe(true);
        expect(UserId.is("01890f5c-7f6b-7cc2-98c4-dc0c0c07398f")).toBe(true);
        expect(UserId.is("01890f5c-7f6b-8cc2-98c4-dc0c0c07398f")).toBe(true);
        expect(UserId.is("01890f5c-7f6b-7cc2-18c4-dc0c0c07398f")).toBe(false);
    });

    test("supports tuple and record schemas", () => {
        const Pair = t.tuple([t.string, t.number.int()]);
        const Row = t.tuple([t.literal("row")]).rest(t.number.int());
        const RowWithTextRest = Row.rest(t.string.min(1));
        const FastRow = compile(Row, { name: "tuple_rest_fluent_row" });
        const Scores = t.record(t.number.gte(0));

        type Pair = Infer<typeof Pair>;
        type Row = Infer<typeof Row>;
        type RowWithTextRest = Infer<typeof RowWithTextRest>;
        type Scores = Infer<typeof Scores>;

        expectTypeOf<Pair>().toEqualTypeOf<readonly [string, number]>();
        expectTypeOf<Row>().toEqualTypeOf<readonly ["row", ...number[]]>();
        expectTypeOf<RowWithTextRest>().toEqualTypeOf<readonly ["row", ...string[]]>();
        expectTypeOf<Scores>().toEqualTypeOf<Readonly<Record<string, number>>>();

        expect(Pair.items[0].is("version")).toBe(true);
        expect(Pair.items[1].is(1)).toBe(true);
        expect(Pair.items[1].is(1.5)).toBe(false);
        expect(Object.isFrozen(Pair.items)).toBe(true);
        expect(Pair.is(["version", 1])).toBe(true);
        expect(Pair.is(["version", 1, "extra"])).toBe(false);
        expect(Row.is(["row"])).toBe(true);
        expect(Row.is(["row", 1, 2])).toBe(true);
        expect(Row.is(["row", 1.5])).toBe(false);
        expect(Row.items[0].is("row")).toBe(true);
        expect(RowWithTextRest.is(["row", "a", "b"])).toBe(true);
        expect(RowWithTextRest.is(["row", 1])).toBe(false);
        expect(FastRow.is(["row", 1, 2])).toBe(true);
        expect(FastRow.is(["row", "bad"])).toBe(false);
        expect(Scores.is({ ada: 100, grace: 95 })).toBe(true);
        expect(Scores.is({ ada: -1 })).toBe(false);
    });

    test("supports lazy recursion and refinement", () => {
        interface Tree {
            readonly value: string;
            readonly children: Tree[];
        }

        const TreeGuard: Guard<Tree> = t.lazy((): Guard<Tree> =>
            t.object({
                value: t.string.min(1),
                children: t.array(TreeGuard)
            })
        );

        const NonZero = t.number.int().refine((value) => value !== 0, "non_zero");

        expect(
            TreeGuard.is({
                value: "root",
                children: [{ value: "leaf", children: [] }]
            })
        ).toBe(true);
        expect(TreeGuard.is({ value: "root", children: [{ value: "", children: [] }] }))
            .toBe(false);
        expect(NonZero.is(1)).toBe(true);
        expect(NonZero.is(0)).toBe(false);

        const cyclic: Tree = {
            value: "root",
            children: []
        };
        cyclic.children.push(cyclic);

        const invalidChild: Tree = {
            value: "",
            children: []
        };
        invalidChild.children.push(invalidChild);
        const invalidRoot: Tree = {
            value: "root",
            children: [invalidChild]
        };

        const FastTree = compile(TreeGuard, { name: "isTree" });

        expect(TreeGuard.is(cyclic)).toBe(true);
        expect(TreeGuard.check(cyclic).ok).toBe(true);
        expect(FastTree.is(cyclic)).toBe(true);
        expect(FastTree.check(cyclic).ok).toBe(true);
        expect(TreeGuard.is(invalidRoot)).toBe(false);
        expect(FastTree.is(invalidRoot)).toBe(false);
        expect(FastTree.check(invalidRoot)).toEqual(TreeGuard.check(invalidRoot));
    });

    test("supports Zod-style refinement options", () => {
        const PasswordForm = t.object({
            password: t.string,
            confirm: t.string
        }).refine(
            (value) => value.password === value.confirm,
            {
                error: "passwords must match",
                path: ["confirm"],
                abort: true
            }
        );
        const FunctionalPasswordForm = t.refine(
            t.object({
                password: t.string,
                confirm: t.string
            }),
            (value) => value.password === value.confirm,
            {
                error: "passwords must match",
                path: ["confirm"]
            }
        );
        const FastPasswordForm = compile(PasswordForm, {
            name: "passwordForm"
        });
        const invalid = {
            password: "sea",
            confirm: "land"
        };

        expect(PasswordForm.is(invalid)).toBe(false);
        expect(FunctionalPasswordForm.is(invalid)).toBe(false);
        expect(PasswordForm.check(invalid)).toEqual({
            ok: false,
            error: [
                {
                    path: ["confirm"],
                    code: "expected_refinement",
                    expected: "passwords must match",
                    actual: "object",
                    message: "passwords must match"
                }
            ]
        });
        expect(FunctionalPasswordForm.check(invalid))
            .toEqual(PasswordForm.check(invalid));
        expect(FastPasswordForm.check(invalid))
            .toEqual(PasswordForm.check(invalid));
    });

    test("supports Zod-style custom guard options", () => {
        const OpaqueUser = t.custom<{ readonly id: string }>();
        const PositiveNumber = t.custom<number>(
            (value): value is number => typeof value === "number" && value > 0,
            {
                error: "positive number expected",
                path: ["value"],
                abort: true
            }
        );
        const LegacyNamed = t.custom<URLSearchParams>(
            (value): value is URLSearchParams => value instanceof URLSearchParams,
            "url_search_params"
        );
        const FastPositiveNumber = compile(PositiveNumber, {
            name: "positiveCustom"
        });

        expect(OpaqueUser.is({ id: "u_1" })).toBe(true);
        expect(OpaqueUser.is(1)).toBe(true);
        expect(PositiveNumber.is(1)).toBe(true);
        expect(PositiveNumber.is(0)).toBe(false);
        expect(LegacyNamed.check({})).toEqual({
            ok: false,
            error: [
                {
                    path: [],
                    code: "expected_refinement",
                    expected: "url_search_params",
                    actual: "object",
                    message: undefined
                }
            ]
        });
        expect(PositiveNumber.check("1")).toEqual({
            ok: false,
            error: [
                {
                    path: ["value"],
                    code: "expected_refinement",
                    expected: "positive number expected",
                    actual: "string",
                    message: "positive number expected"
                }
            ]
        });
        expect(FastPositiveNumber.check("1")).toEqual(PositiveNumber.check("1"));
    });

    test("allows omitted Zod-style refinement parameters", () => {
        const NonEmpty = t.string.refine((value) => value.length > 0);
        const Positive = t.refine(t.number, (value) => value > 0);
        const NamedPositive = t.number.refine((value) => value > 0, "positive");
        const LabelFreeRange = t.object({
            min: t.number,
            max: t.number
        }).superRefine((value, context) => {
            if (value.min > value.max) {
                context.addIssue({
                    path: ["max"],
                    message: "max must be greater than or equal to min"
                });
            }
        });
        const FunctionalRange = t.superRefine(
            t.object({
                min: t.number,
                max: t.number
            }),
            (value, context) => {
                if (value.min > value.max) {
                    context.addIssue("range is not ordered");
                }
            }
        );
        const FastNonEmpty = compile(NonEmpty, { name: "nonEmptyString" });
        const FastRange = compile(LabelFreeRange, { name: "labelFreeRange" });

        expect(NonEmpty.check("")).toEqual({
            ok: false,
            error: [
                {
                    path: [],
                    code: "expected_refinement",
                    expected: "refinement",
                    actual: "string",
                    message: undefined
                }
            ]
        });
        expect(Positive.is(1)).toBe(true);
        expect(Positive.is(0)).toBe(false);
        expect(NamedPositive.check(0)).toEqual({
            ok: false,
            error: [
                {
                    path: [],
                    code: "expected_refinement",
                    expected: "positive",
                    actual: "number",
                    message: undefined
                }
            ]
        });
        expect(LabelFreeRange.check({ min: 3, max: 2 })).toEqual({
            ok: false,
            error: [
                {
                    path: ["max"],
                    code: "expected_refinement",
                    expected: "refinement",
                    actual: "object",
                    message: "max must be greater than or equal to min"
                }
            ]
        });
        expect(FunctionalRange.check({ min: 3, max: 2 })).toEqual({
            ok: false,
            error: [
                {
                    path: [],
                    code: "expected_refinement",
                    expected: "refinement",
                    actual: "object",
                    message: "range is not ordered"
                }
            ]
        });
        expect(FastNonEmpty.check("")).toEqual(NonEmpty.check(""));
        expect(FastRange.check({ min: 3, max: 2 }))
            .toEqual(LabelFreeRange.check({ min: 3, max: 2 }));
    });

    test("supports conditional refinement execution", () => {
        const RelevantFields = t.object({
            password: t.string,
            confirmPassword: t.string
        });
        let observedPayload = false;
        const PasswordForm = t.object({
            password: t.string,
            confirmPassword: t.string,
            anotherField: t.string
        }).refine(
            (value) => value.password === value.confirmPassword,
            {
                error: "Passwords do not match",
                path: ["confirmPassword"],
                when: (payload) => {
                    observedPayload =
                        Object.isFrozen(payload) &&
                        Object.isFrozen(payload.issues) &&
                        payload.issues[0]?.path[0] === "anotherField";
                    return RelevantFields.safeParse(payload.value).success;
                }
            }
        );
        const Skipped = t.string.refine(
            () => false,
            {
                error: "should not run",
                when: () => false
            }
        );
        const FastSkipped = compile(Skipped, { name: "skippedRefinement" });

        const invalid = {
            password: "abcdefgh",
            confirmPassword: "different",
            anotherField: 123
        };
        const result = PasswordForm.check(invalid);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toEqual([
                {
                    path: ["anotherField"],
                    code: "expected_string",
                    expected: "string",
                    actual: "number",
                    message: undefined
                },
                {
                    path: ["confirmPassword"],
                    code: "expected_refinement",
                    expected: "Passwords do not match",
                    actual: "object",
                    message: "Passwords do not match"
                }
            ]);
        }
        expect(observedPayload).toBe(true);
        expect(Skipped.is("value")).toBe(true);
        expect(Skipped.check("value")).toEqual({
            ok: true,
            value: "value"
        });
        expect(FastSkipped.is("value")).toBe(true);
    });

    test("supports callback-style super refinement", () => {
        const Range = t.object({
            min: t.number,
            max: t.number
        }).superRefine((value, context) => {
            if (value.min > value.max) {
                context.addIssue({
                    path: ["max"],
                    message: "max must be greater than or equal to min"
                });
            }
        }, "ordered_range");
        const FunctionalRange = t.superRefine(
            t.object({
                min: t.number,
                max: t.number
            }),
            (value, context) => {
                if (value.min > value.max) {
                    context.addIssue("range is not ordered");
                }
            },
            "ordered_range"
        );
        const FastRange = compile(Range, { name: "superRefinedRange" });

        expect(Range.is({ min: 1, max: 2 })).toBe(true);
        expect(Range.is({ min: 3, max: 2 })).toBe(false);
        expect(FunctionalRange.is({ min: 3, max: 2 })).toBe(false);
        expect(Range.check({ min: 3, max: 2 })).toEqual({
            ok: false,
            error: [
                {
                    path: ["max"],
                    code: "expected_refinement",
                    expected: "ordered_range",
                    actual: "object",
                    message: "max must be greater than or equal to min"
                }
            ]
        });
        expect(FunctionalRange.check({ min: 3, max: 2 })).toEqual({
            ok: false,
            error: [
                {
                    path: [],
                    code: "expected_refinement",
                    expected: "ordered_range",
                    actual: "object",
                    message: "range is not ordered"
                }
            ]
        });
        expect(Range.checkFirst({ min: 3, max: 2 })).toEqual(
            Range.check({ min: 3, max: 2 })
        );
        expect(FastRange.check({ min: 3, max: 2 }))
            .toEqual(Range.check({ min: 3, max: 2 }));
        expect(FastRange.checkFirst({ min: 3, max: 2 }))
            .toEqual(Range.checkFirst({ min: 3, max: 2 }));
    });

    test("caches compiled guards with explicit semantic keys", () => {
        const cache = createCompileCache();
        let builds = 0;
        const first = cache.compile("user:v1", () => {
            builds += 1;
            return t.object({
                id: t.string
            });
        }, { name: "cachedUser" });
        const second = cache.compile("user:v1", () => {
            throw new Error("cache miss");
        }, { name: "cachedUser" });
        const unsafe = cache.compile("user:v1", () => {
            builds += 1;
            return t.object({
                id: t.string
            });
        }, {
            name: "cachedUser",
            mode: "unsafe"
        });
        const globalFirst = compileCached("global-user:v1", () => {
            builds += 1;
            return t.object({
                id: t.string
            });
        }, { name: "globalCachedUser" });
        const globalSecond = compileCached("global-user:v1", () => {
            throw new Error("global cache miss");
        }, { name: "globalCachedUser" });

        expect(first).toBe(second);
        expect(first).not.toBe(unsafe);
        expect(globalFirst).toBe(globalSecond);
        expect(builds).toBe(3);
        expect(cache.size).toBe(2);
        expect(cache.delete("user:v1", { name: "cachedUser" })).toBe(true);
        expect(cache.size).toBe(1);
        cache.clear();
        expect(cache.size).toBe(0);
    });

    test("warms guards before first request paths", () => {
        const cache = createCompileCache();
        const User = t.object({
            id: t.string
        });
        let builds = 0;
        const compiled = warmup([
            User,
            {
                key: "warm:user",
                factory: (): typeof User => {
                    builds += 1;
                    return User;
                },
                options: { name: "warmUser" }
            }
        ], {
            cache,
            namePrefix: "warm_"
        });
        const cached = cache.compile("warm:user", () => {
            throw new Error("warm cache miss");
        }, { name: "warmUser" });

        expect(compiled).toHaveLength(2);
        expect(compiled[0]?.is({ id: "u1" })).toBe(true);
        expect(compiled[1]).toBe(cached);
        expect(builds).toBe(1);
    });

    test("emits predicate-only boolean guards for fail-fast paths", () => {
        const User = t.strictObject({
            id: t.string,
            score: t.number.int()
        });
        const FastUser = compileBoolean(User, { name: "booleanUser" });
        const Again = compileBoolean(User, { name: "booleanUser" });

        expect(FastUser).toBe(Again);
        expect(FastUser.is({ id: "u1", score: 1 })).toBe(true);
        expect(FastUser.is({ id: "u1", score: 1.5 })).toBe(false);
        expect(FastUser.source).toContain("return booleanUser");
        expect(FastUser.source).not.toContain("_check");
        expect("check" in FastUser).toBe(false);
    });

    test("validates large values cooperatively through async guards", async () => {
        const Numbers = t.array(t.number.int());
        const values = new Array<number>(8192).fill(7);
        let yielded = false;
        const marker = new Promise<void>((resolve) => {
            setImmediate(() => {
                yielded = true;
                resolve();
            });
        });
        const valid = await isAsync(Numbers, values, {
            yieldEvery: 1,
            yieldTimeout: 0
        });
        await marker;
        const result = await checkAsync(Numbers, values, {
            yieldEvery: 16,
            yieldTimeout: 0
        });
        const Pair = t.object({
            count: t.number,
            name: t.string
        });
        const invalidPair = await checkAsync(Pair, {
            count: "bad",
            name: 7
        }, {
            yieldEvery: 1,
            yieldTimeout: 0
        });
        const AsyncNumbers = compileAsync(Numbers, {
            name: "asyncNumbers",
            yieldEvery: 16,
            yieldTimeout: 0
        });

        expect(yielded).toBe(true);
        expect(valid).toBe(true);
        expect(result.ok).toBe(true);
        expect(invalidPair.ok).toBe(false);
        expect(invalidPair.ok ? 0 : invalidPair.error.length).toBe(2);
        expect(await AsyncNumbers.is(values)).toBe(true);
        expect((await AsyncNumbers.check([1, 2.5])).ok).toBe(false);
        expect(AsyncNumbers.sync.is(values)).toBe(true);
    }, 15_000);

    test("finalizes successful cooperative validation outputs", async () => {
        const StripUser = t.object({
            id: t.string
        }).strip();
        const ReadonlyUser = t.object({
            id: t.string
        }).readonly();
        const stripped = await checkAsync(StripUser, {
            id: "user",
            extra: true
        }, {
            yieldEvery: 1,
            yieldTimeout: 0
        });
        const asyncReadonly = compileAsync(ReadonlyUser, {
            name: "asyncReadonlyFinalization",
            yieldEvery: 1,
            yieldTimeout: 0
        });
        const readonlyValue = { id: "user" };
        const readonlyResult = await asyncReadonly.check(readonlyValue);

        expect(stripped).toEqual({
            ok: true,
            value: { id: "user" }
        });
        expect(readonlyResult.ok).toBe(true);
        expect(Object.isFrozen(readonlyValue)).toBe(true);
    });

    test("reuses compiled output for the same guard instance and options", () => {
        const User = t.object({
            id: t.string
        });
        const first = compile(User, { name: "sameGuardUser" });
        const second = compile(User, { name: "sameGuardUser" });
        const debug = compile(User, {
            name: "sameGuardUser",
            debugSource: true
        });

        expect(first).toBe(second);
        expect(first).not.toBe(debug);
        expect(debug.source).toContain("TypeSea generated validator");
    });

    test("compiled guards match interpreter semantics", () => {
        const User = t.strictObject({
            id: t.string.uuid(),
            age: t.number.int().gte(0),
            pair: t.tuple([t.literal("age"), t.number])
        });
        const FastUser = compile(User, { name: "isUser" });
        const valid = {
            id: "550e8400-e29b-41d4-a716-446655440000",
            age: 37,
            pair: ["age", 37]
        };
        const invalid = {
            id: "550e8400-e29b-41d4-a716-446655440000",
            age: 37,
            pair: ["age", 37],
            extra: true
        };

        expect(FastUser.source).toContain("function isUser");
        expect(FastUser.is(valid)).toBe(User.is(valid));
        expect(FastUser.is(invalid)).toBe(User.is(invalid));
    });
});

describe("Sea-of-Nodes lowering", () => {
    test("fuses object branches into shape predicates", () => {
        const Entity = t.union(
            t.object({
                kind: t.literal("user"),
                id: t.string
            }),
            t.object({
                kind: t.literal("order"),
                id: t.string
            })
        );

        const graph = Entity.graph();

        expect(countGraphTag(graph, NodeTag.DiscriminantDispatch)).toBe(1);
        expect(countGraphTag(graph, NodeTag.UnionDispatch)).toBe(0);
        expect(countGraphTag(graph, NodeTag.ObjectShape)).toBe(2);
        expect(countGraphTag(graph, NodeTag.IsObject)).toBe(0);
        expect(countGraphTag(graph, NodeTag.GetProp)).toBe(0);
    });

    test("returns compact reachable graphs with return result nodes", () => {
        const Schema = t.strictObject({
            ids: t.array(t.string),
            meta: t.record(t.union(t.string, t.number, t.boolean)),
            point: t.tuple([t.number, t.number])
        });

        const graph = Schema.graph();
        const result = graph.nodes[graph.result];

        expect(result?.tag).toBe(NodeTag.Return);
        for (let index = 0; index < graph.nodes.length; index += 1) {
            const node = graph.nodes[index];
            expect(node?.id).toBe(index);
            if (node === undefined) {
                continue;
            }
            for (let depIndex = 0; depIndex < node.deps.length; depIndex += 1) {
                const dep = node.deps[depIndex];
                expect(dep).not.toBeUndefined();
                if (dep !== undefined) {
                    expect(dep).toBeGreaterThanOrEqual(0);
                    expect(dep).toBeLessThan(graph.nodes.length);
                }
            }
        }
        expect(countReachable(graph)).toBe(graph.nodes.length);
    });
});

/**
 * @brief Execute count graph tag.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function countGraphTag(
    graph: Graph,
    tag: number,
    visited: WeakSet<Graph> = new WeakSet<Graph>()
): number {
    if (visited.has(graph)) {
        return 0;
    }
    visited.add(graph);
    let count = 0;
    for (let index = 0; index < graph.nodes.length; index += 1) {
        const node = graph.nodes[index];
        if (node === undefined) {
            continue;
        }
        if (node.tag === tag) {
            count += 1;
        }
        switch (node.tag) {
            case NodeTag.ArrayEvery:
            case NodeTag.RecordEvery:
                count += countGraphTag(node.itemGraph, tag, visited);
                break;
            case NodeTag.TupleItems:
                for (let itemIndex = 0; itemIndex < node.itemGraphs.length; itemIndex += 1) {
                    const itemGraph = node.itemGraphs[itemIndex];
                    if (itemGraph !== undefined) {
                        count += countGraphTag(itemGraph, tag, visited);
                    }
                }
                break;
            case NodeTag.ObjectShape:
                for (let entryIndex = 0; entryIndex < node.entries.length; entryIndex += 1) {
                    const entry = node.entries[entryIndex];
                    if (entry !== undefined) {
                        count += countGraphTag(entry.graph, tag, visited);
                    }
                }
                break;
            case NodeTag.DiscriminantDispatch:
            case NodeTag.UnionDispatch:
                for (let graphIndex = 0; graphIndex < node.graphs.length; graphIndex += 1) {
                    const childGraph = node.graphs[graphIndex];
                    if (childGraph !== undefined) {
                        count += countGraphTag(childGraph, tag, visited);
                    }
                }
                break;
            default:
                break;
        }
    }
    return count;
}

/**
 * @brief Execute count reachable.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function countReachable(graph: ReturnType<typeof t.string.graph>): number {
    const reached = new Array<boolean>(graph.nodes.length).fill(false);
    const stack = [graph.entry, graph.result];
    while (stack.length !== 0) {
        const id = stack.pop();
        if (id === undefined || reached[id] === true) {
            continue;
        }
        reached[id] = true;
        const node = graph.nodes[id];
        if (node === undefined) {
            continue;
        }
        for (let index = 0; index < node.deps.length; index += 1) {
            const dep = node.deps[index];
            if (dep !== undefined) {
                stack.push(dep);
            }
        }
    }
    let count = 0;
    for (let index = 0; index < reached.length; index += 1) {
        if (reached[index] === true) {
            count += 1;
        }
    }
    return count;
}
