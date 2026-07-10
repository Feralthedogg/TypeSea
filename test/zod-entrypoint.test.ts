import { describe, expect, expectTypeOf, test } from "vitest";
import * as ActualZod from "zod";
import * as ActualZodV3 from "zod/v3";
import ZodDefaultFacade, * as TypeSeaZod from "../src/zod.js";
import * as TypeSeaZodV3 from "../src/v3.js";
import ZodV4DefaultFacade, * as TypeSeaZodV4 from "../src/v4.js";
import * as TypeSeaLocales from "../src/locales.js";
import * as TypeSeaZodV4Core from "../src/v4/core.js";
import TypeSeaZodV4DefaultLocale from "../src/v4/locales.js";
import * as TypeSeaZodV4Locales from "../src/v4/locales.js";
import * as TypeSeaZodV4Mini from "../src/v4-mini.js";
import * as TypeSeaZodV4NestedMini from "../src/v4/mini.js";

interface IssueLike {
    readonly code: string;
    readonly path: readonly (string | number)[];
    readonly message: string;
}

interface ResultLike {
    readonly success: boolean;
    readonly data?: unknown;
    readonly error?: {
        readonly issues: readonly IssueLike[];
    };
}

interface SchemaLike {
    safeParse(value: unknown, options?: unknown): unknown;
}

interface ParityCase {
    readonly name: string;
    readonly sea: SchemaLike;
    readonly zod: SchemaLike;
    readonly valid: readonly unknown[];
    readonly invalid: readonly unknown[];
}

describe("typesea/zod entrypoint", () => {
    test("accepts Zod-style regex calls without a diagnostic name", () => {
        const sea = TypeSeaZod.string().regex(/^x$/u);
        const zod = ActualZod.string().regex(/^x$/u);

        expect(sea.safeParse("x").success).toBe(zod.safeParse("x").success);
        expect(sea.safeParse("y").success).toBe(zod.safeParse("y").success);
    });

    test("merges Zod-style intersection parse outputs", () => {
        const sea = TypeSeaZod.intersection(
            TypeSeaZod.object({ id: TypeSeaZod.string() }),
            TypeSeaZod.object({ age: TypeSeaZod.number() })
        );
        const zod = ActualZod.intersection(
            ActualZod.object({ id: ActualZod.string() }),
            ActualZod.object({ age: ActualZod.number() })
        );
        const input = { id: "u1", age: 42, extra: true };

        expect(sea.safeParse(input)).toEqual(zod.safeParse(input));
    });

    test("exposes Zod v3 package-alias subpath", () => {
        expect(TypeSeaZodV3.getParsedType(NaN)).toBe(ActualZodV3.ZodParsedType.nan);
        expect(TypeSeaZodV3.getParsedType(new Map())).toBe(ActualZodV3.ZodParsedType.map);
        expect(TypeSeaZodV3.OK("x").status).toBe(ActualZodV3.OK("x").status);
        expect(TypeSeaZodV3.DIRTY("x").status).toBe(ActualZodV3.DIRTY("x").status);
        expect(TypeSeaZodV3.isValid(TypeSeaZodV3.OK("x"))).toBe(true);
        expect(TypeSeaZodV3.isDirty(TypeSeaZodV3.DIRTY("x"))).toBe(true);
        expect(TypeSeaZodV3.isAborted(TypeSeaZodV3.INVALID)).toBe(true);
        expect(TypeSeaZodV3.ostring().is(undefined)).toBe(true);
        expect(TypeSeaZodV3.onumber().is(1)).toBe(true);
        expect(TypeSeaZodV3.oboolean().is(false)).toBe(true);
        expect(TypeSeaZodV3.objectUtil.mergeShapes({ a: 1 }, { b: 2 })).toEqual({
            a: 1,
            b: 2
        });
        expect(TypeSeaZodV3.ZodNativeEnum).toBe(TypeSeaZod.EnumGuard);
        expect(TypeSeaZodV3.ZodTransformer).toBe(TypeSeaZod.BaseDecoder);
    });

    test("exposes Zod v4 package-alias subpaths", () => {
        const MiniText = TypeSeaZodV4Mini.apply(
            TypeSeaZodV4Mini.string(),
            TypeSeaZodV4Mini.minLength(2)
        );
        const NestedMiniText = TypeSeaZodV4NestedMini.apply(
            TypeSeaZodV4NestedMini.string(),
            TypeSeaZodV4NestedMini.maxLength(4)
        );

        expect(TypeSeaZodV4.string().is("TypeSea")).toBe(true);
        expect(ZodV4DefaultFacade.string().is("TypeSea")).toBe(true);
        expect(MiniText.is("ok")).toBe(true);
        expect(MiniText.is("x")).toBe(false);
        expect(NestedMiniText.is("sea")).toBe(true);
        expect(NestedMiniText.is("TypeSea")).toBe(false);
        expect(TypeSeaZod.core.$ZodString).toBe(TypeSeaZod.ZodString);
        expect(TypeSeaZodV4Core.$ZodString).toBe(TypeSeaZod.ZodString);
        expect(TypeSeaZodV4.core.$ZodString).toBe(TypeSeaZod.ZodString);
        expect(TypeSeaZodV4Mini.ZodMiniString).toBe(TypeSeaZod.StringGuard);
        expect(TypeSeaZodV4NestedMini.ZodMiniString).toBe(TypeSeaZod.StringGuard);
        expect(TypeSeaZodV4Mini.z.string().is("TypeSea")).toBe(true);
        expect(TypeSeaZodV4NestedMini.z.string().is("TypeSea")).toBe(true);
        expect(TypeSeaZodV4Mini.core.$ZodString).toBe(TypeSeaZod.ZodString);
        expect(TypeSeaZodV4NestedMini.core.$ZodString).toBe(TypeSeaZod.ZodString);
        expect(typeof TypeSeaZod.$brand).toBe("symbol");
        expect(typeof TypeSeaZod.$input).toBe("symbol");
        expect(typeof TypeSeaZod.$output).toBe("symbol");
        expect(TypeSeaZod._ZodString).toBe(TypeSeaZod.ZodString);
        expect(TypeSeaZodV4Core._safeParse(
            TypeSeaZodV4Core._string(),
            "TypeSea"
        ).success).toBe(true);
        expect(new TypeSeaZodV4Core.$ZodCheck({ check: "probe" })._zod.def)
            .toEqual({ check: "probe" });
        expect(TypeSeaZodV4Core.version.major).toBe(4);
        expect(TypeSeaZodV4Mini.ZodMiniTuple).toBe(TypeSeaZod.TupleGuard);
        expect(TypeSeaZodV4Mini.TimePrecision.Millisecond).toBe(3);
        expect(typeof TypeSeaLocales.en().customError).toBe("function");
        expect(typeof TypeSeaLocales.ko().customError).toBe("function");
        expect(typeof TypeSeaZodV4Locales.en().customError).toBe("function");
        expect(typeof TypeSeaZodV4Locales.fr().customError).toBe("function");
        expect(typeof TypeSeaZodV4Locales.fr().localeError).toBe("function");
        expect(typeof TypeSeaZodV4DefaultLocale().customError).toBe("function");
    });

    test("exports Zod-shaped top-level constructors", () => {
        const Wildcard = TypeSeaZod.\u0061ny();
        const Unknown = TypeSeaZod.unknown();
        const Missing = TypeSeaZod.never();
        const Nothing = TypeSeaZod.null();
        const Empty = TypeSeaZod.undefined();
        const Void = TypeSeaZod.void();
        const Native = TypeSeaZod.nativeEnum({
            Active: "active",
            Disabled: "disabled"
        } as const);
        const Choice = TypeSeaZod.union([
            TypeSeaZod.literal("left"),
            TypeSeaZod.literal("right")
        ]);
        const Combined = TypeSeaZod.intersection(
            TypeSeaZod.object({ id: TypeSeaZod.string().min(1) }),
            TypeSeaZod.object({ count: TypeSeaZod.number().int() })
        );
        const DateInstance = TypeSeaZod.instanceof(Date);
        const ObjectKeys = TypeSeaZod.keyof(TypeSeaZod.object({
            id: TypeSeaZod.string(),
            name: TypeSeaZod.string()
        }));
        const FunctionalText = TypeSeaZod.minLength(2)(TypeSeaZod.string());
        const SuffixedText = TypeSeaZod.endsWith("Sea")(TypeSeaZod.string());
        const PositiveCount = TypeSeaZod.positive()(TypeSeaZod.number());
        const SizedTags = TypeSeaZod.size(2)(TypeSeaZod.array(TypeSeaZod.string()));
        const Trimmed = TypeSeaZod.trim()(TypeSeaZod.string());
        const Lower = TypeSeaZod.toLowerCase()(TypeSeaZod.string());
        const Slug = TypeSeaZod.slugify()(TypeSeaZod.string());
        const Length = TypeSeaZod.overwrite<string, number>(
            (value) => value === undefined ? 0 : value.length
        )(TypeSeaZod.string());
        const CheckLength = TypeSeaZod.string().check(TypeSeaZod.minLength(2));
        const CheckTrimmed = TypeSeaZod.string().check(TypeSeaZod.trim());
        const WithSuffix = TypeSeaZod.string().with(TypeSeaZod.endsWith("Sea"));
        const CheckPositive = TypeSeaZod.number().check(TypeSeaZod.positive());
        const Upload = TypeSeaZod.mime("text/plain")(TypeSeaZod.file());

        expect(Wildcard.is(Symbol("value"))).toBe(true);
        expect(Unknown.is({ value: 1 })).toBe(true);
        expect(Missing.is("never")).toBe(false);
        expect(Nothing.is(null)).toBe(true);
        expect(Empty.is(undefined)).toBe(true);
        expect(Void.is(undefined)).toBe(true);
        expect(Native.is("active")).toBe(true);
        expect(Choice.is("left")).toBe(true);
        expect(Choice.is("middle")).toBe(false);
        expect(Combined.is({ id: "row", count: 1 })).toBe(true);
        expect(DateInstance.is(new Date())).toBe(true);
        expect(ObjectKeys.is("id")).toBe(true);
        expect(ObjectKeys.is("missing")).toBe(false);
        expect(FunctionalText.is("go")).toBe(true);
        expect(FunctionalText.is("x")).toBe(false);
        expect(SuffixedText.is("TypeSea")).toBe(true);
        expect(SuffixedText.is("TypeScript")).toBe(false);
        expect(PositiveCount.is(1)).toBe(true);
        expect(PositiveCount.is(0)).toBe(false);
        expect(SizedTags.is(["a", "b"])).toBe(true);
        expect(SizedTags.is(["a"])).toBe(false);
        expect(readData(Trimmed, " TypeSea ")).toBe("TypeSea");
        expect(readData(Lower, "TYPESEA")).toBe("typesea");
        expect(readData(Slug, "Type Sea!")).toBe("type-sea");
        expect(readData(Length, "TypeSea")).toBe(7);
        expect(CheckLength.is("go")).toBe(true);
        expect(CheckLength.is("x")).toBe(false);
        expect(readData(CheckTrimmed, " TypeSea ")).toBe("TypeSea");
        expect(TypeSeaZod.string().decode("TypeSea")).toBe("TypeSea");
        expect(TypeSeaZod.string().safeDecode(1).success).toBe(false);
        expect(TypeSeaZod.string().encode("TypeSea")).toBe("TypeSea");
        expect(TypeSeaZod.string().safeEncode(1).success).toBe(false);
        expect(TypeSeaZod.string().exactOptional().is(undefined)).toBe(false);
        expect(WithSuffix.is("TypeSea")).toBe(true);
        expect(WithSuffix.is("SeaType")).toBe(false);
        expect(CheckPositive.is(1)).toBe(true);
        expect(CheckPositive.is(0)).toBe(false);
        expect(Upload.is(new File(["ok"], "ok.txt", { type: "text/plain" }))).toBe(true);
        expect(Upload.is(new File(["ok"], "ok.bin", { type: "application/octet-stream" })))
            .toBe(false);
        expect(TypeSeaZod.clone(FunctionalText)).toBe(FunctionalText);
        expect(TypeSeaZod.TimePrecision.Millisecond).toBe(3);
        expect(ZodDefaultFacade.minLength(2)(ZodDefaultFacade.string()).is("go")).toBe(true);
        expect(ZodDefaultFacade.string().decode("sea")).toBe("sea");
        expect(ZodDefaultFacade.string().is("sea")).toBe(true);
        expect(TypeSeaZod.c\u0061tch(TypeSeaZod.string().min(2), "fallback")
            .safeParse("x")).toEqual({
            success: true,
            data: "fallback"
        });
    });

    test("exposes Zod-shaped metadata properties", () => {
        const Count = TypeSeaZod.bigint().gte(1n).lte(9n);
        const DateRange = TypeSeaZod.date()
            .min(new Date("2020-01-01T00:00:00.000Z"))
            .max(new Date("2030-01-01T00:00:00.000Z"));
        const Tags = TypeSeaZod.array(TypeSeaZod.string());
        const Row = TypeSeaZod.object({ id: TypeSeaZod.string() });
        const Entry = TypeSeaZod.record(TypeSeaZod.string(), TypeSeaZod.number());
        const Mapping = TypeSeaZod.map(TypeSeaZod.string(), TypeSeaZod.number());
        const SingleLiteral = TypeSeaZod.literal("ready");
        const MultiLiteral = TypeSeaZod.literal(["ready", "done"]);
        const SizedMapping = TypeSeaZod.map(TypeSeaZod.string(), TypeSeaZod.number())
            .min(1)
            .max(2)
            .size(1)
            .nonempty();

        expect(TypeSeaZod.string().type).toBe(ActualZod.string().type);
        expect(TypeSeaZod.number().type).toBe(ActualZod.number().type);
        expect(Count.type).toBe(ActualZod.bigint().type);
        expect(Count.format).toBe(ActualZod.bigint().format);
        expect(Count.minValue).toBe(ActualZod.bigint().gte(1n).minValue);
        expect(Count.maxValue).toBe(ActualZod.bigint().lte(9n).maxValue);
        expect(TypeSeaZod.bigint().gt(1n).minValue)
            .toBe(ActualZod.bigint().gt(1n).minValue);
        expect(DateRange.type).toBe(ActualZod.date().type);
        expect(DateRange.minDate?.toISOString()).toBe("2020-01-01T00:00:00.000Z");
        expect(DateRange.maxDate?.toISOString()).toBe("2030-01-01T00:00:00.000Z");
        expect(Tags.type).toBe(ActualZod.array(ActualZod.string()).type);
        expect(Tags.element.type).toBe(ActualZod.array(ActualZod.string()).element.type);
        expect(Row.type).toBe(ActualZod.object({ id: ActualZod.string() }).type);
        expect(Entry.type).toBe(ActualZod.record(ActualZod.string(), ActualZod.number()).type);
        expect((Entry.keyType as TypeSeaZod.Guard<unknown>).type).toBe("string");
        expect((Entry.valueType as TypeSeaZod.Guard<unknown>).type).toBe("number");
        expect(Mapping.type).toBe(ActualZod.map(ActualZod.string(), ActualZod.number()).type);
        expect((Mapping.keyType as TypeSeaZod.Guard<unknown>).type).toBe("string");
        expect((Mapping.valueType as TypeSeaZod.Guard<unknown>).type).toBe("number");
        expect(SizedMapping.is(new Map([["a", 1]]))).toBe(true);
        expect(SizedMapping.is(new Map())).toBe(false);
        expect(TypeSeaZod.string()._zod.def.type).toBe(ActualZod.string()._zod.def.type);
        expect(TypeSeaZod.string()._zod.traits.has("ZodString")).toBe(true);
        expect(TypeSeaZod.string()._zod.traits.has("$ZodString")).toBe(true);
        expect(TypeSeaZod.string()._zod.version.major).toBe(4);
        expect(SingleLiteral.value).toBe(ActualZod.literal("ready").value);
        expect(() => MultiLiteral.value).toThrow("Use `.values` instead");
    });

    test("exposes Zod-shaped inference aliases", () => {
        const User = TypeSeaZod.strictObject({
            id: TypeSeaZod.uuid(),
            status: TypeSeaZod.union([
                TypeSeaZod.literal("active"),
                TypeSeaZod.literal("disabled")
            ]),
            nickname: TypeSeaZod.exactOptional(TypeSeaZod.string().min(1)),
            score: TypeSeaZod.number().int().gte(0)
        });
        const ExactName = TypeSeaZod.exactOptional(TypeSeaZod.string());

        expectTypeOf<TypeSeaZod.infer<typeof User>>().toEqualTypeOf<Readonly<{
            id: string;
            status: "active" | "disabled";
            nickname?: string;
            score: number;
        }>>();
        expectTypeOf<TypeSeaZod.infer<typeof ExactName>>().toEqualTypeOf<string>();
        expectTypeOf<TypeSeaZod.input<typeof User>>()
            .toEqualTypeOf<TypeSeaZod.infer<typeof User>>();
        expectTypeOf<TypeSeaZod.output<typeof User>>()
            .toEqualTypeOf<TypeSeaZod.infer<typeof User>>();
        expect(User.is({
            id: "550e8400-e29b-41d4-a716-446655440000",
            status: "active",
            score: 1
        })).toBe(true);
        expect(User.is({
            id: "550e8400-e29b-41d4-a716-446655440000",
            status: "active",
            nickname: undefined,
            score: 1
        })).toBe(false);
        expect(ExactName.is(undefined)).toBe(false);
    });

    test("matches Zod pass/fail decisions on migration-safe schemas", () => {
        const cases: readonly ParityCase[] = [
            {
                name: "string checks",
                sea: TypeSeaZod.string().min(2).max(5).regex(/^[a-z]+$/u, "lowercase"),
                zod: ActualZod.string().min(2).max(5).regex(/^[a-z]+$/u),
                valid: ["sea", "type"],
                invalid: ["", "TypeSea", 1, null]
            },
            {
                name: "number checks",
                sea: TypeSeaZod.number().int().gte(1).lte(9).multipleOf(2),
                zod: ActualZod.number().int().gte(1).lte(9).multipleOf(2),
                valid: [2, 8],
                invalid: [0, 3, 10, 2.5, Number.POSITIVE_INFINITY]
            },
            {
                name: "strict object",
                sea: TypeSeaZod.strictObject({
                    id: TypeSeaZod.uuid(),
                    tags: TypeSeaZod.array(TypeSeaZod.string().min(1)).min(1)
                }),
                zod: ActualZod.object({
                    id: ActualZod.uuid(),
                    tags: ActualZod.array(ActualZod.string().min(1)).min(1)
                }).strict(),
                valid: [{
                    id: "550e8400-e29b-41d4-a716-446655440000",
                    tags: ["runtime"]
                }],
                invalid: [
                    {
                        id: "bad",
                        tags: ["runtime"]
                    },
                    {
                        id: "550e8400-e29b-41d4-a716-446655440000",
                        tags: []
                    },
                    {
                        id: "550e8400-e29b-41d4-a716-446655440000",
                        tags: ["runtime"],
                        extra: true
                    }
                ]
            },
            {
                name: "tuple with rest",
                sea: TypeSeaZod.tuple(
                    [TypeSeaZod.string(), TypeSeaZod.number().int()],
                    TypeSeaZod.boolean()
                ),
                zod: ActualZod.tuple(
                    [ActualZod.string(), ActualZod.number().int()],
                    ActualZod.boolean()
                ),
                valid: [["id", 1], ["id", 1, true, false]],
                invalid: [["id"], ["id", 1, "yes"]]
            },
            {
                name: "discriminated union",
                sea: TypeSeaZod.discriminatedUnion("kind", [
                    TypeSeaZod.object({
                        kind: TypeSeaZod.literal("created"),
                        id: TypeSeaZod.string().min(1)
                    }),
                    TypeSeaZod.object({
                        kind: TypeSeaZod.literal("deleted"),
                        id: TypeSeaZod.string().min(1),
                        hard: TypeSeaZod.boolean()
                    })
                ]),
                zod: ActualZod.discriminatedUnion("kind", [
                    ActualZod.object({
                        kind: ActualZod.literal("created"),
                        id: ActualZod.string().min(1)
                    }),
                    ActualZod.object({
                        kind: ActualZod.literal("deleted"),
                        id: ActualZod.string().min(1),
                        hard: ActualZod.boolean()
                    })
                ]),
                valid: [
                    {
                        kind: "created",
                        id: "1"
                    },
                    {
                        kind: "deleted",
                        id: "1",
                        hard: false
                    }
                ],
                invalid: [
                    {
                        kind: "deleted",
                        id: "1"
                    },
                    {
                        kind: "updated",
                        id: "1"
                    }
                ]
            },
            {
                name: "template literal",
                sea: TypeSeaZod.templateLiteral([
                    TypeSeaZod.number().int(),
                    TypeSeaZod.enum(["px", "em"])
                ]),
                zod: ActualZod.templateLiteral([
                    ActualZod.number().int(),
                    ActualZod.enum(["px", "em"])
                ]),
                valid: ["12px", "-1em"],
                invalid: ["12rem", "1.5px", 12]
            },
            {
                name: "object keyof",
                sea: TypeSeaZod.keyof(TypeSeaZod.object({
                    id: TypeSeaZod.string(),
                    name: TypeSeaZod.string()
                })),
                zod: ActualZod.keyof(ActualZod.object({
                    id: ActualZod.string(),
                    name: ActualZod.string()
                })),
                valid: ["id", "name"],
                invalid: ["missing", 1]
            },
            {
                name: "exact optional object field",
                sea: TypeSeaZod.object({
                    nickname: TypeSeaZod.exactOptional(TypeSeaZod.string().min(1))
                }),
                zod: ActualZod.object({
                    nickname: ActualZod.exactOptional(ActualZod.string().min(1))
                }),
                valid: [{}, { nickname: "Ada" }],
                invalid: [{ nickname: "" }, { nickname: undefined }]
            }
        ];

        for (let caseIndex = 0; caseIndex < cases.length; caseIndex += 1) {
            const item = cases[caseIndex];
            if (item === undefined) {
                continue;
            }
            assertParity(item, item.valid, true);
            assertParity(item, item.invalid, false);
        }
    });

    test("matches Zod coercion decisions", () => {
        const objectNumber = {
            valueOf(): number {
                return 9;
            }
        };
        const objectString = {
            toString(): string {
                return " object-name ";
            }
        };
        const objectBigInt = {
            valueOf(): number {
                return 9;
            }
        };
        const hostileCoercion = {
            [Symbol.toPrimitive](): never {
                throw new Error("boom");
            }
        };
        const cases: readonly ParityCase[] = [
            {
                name: "coerce number",
                sea: TypeSeaZod.coerce.number().int().gte(0),
                zod: ActualZod.coerce.number().int().gte(0),
                valid: [" 42 ", 7, "", false, null, objectNumber],
                invalid: ["x", 1.5, Number.POSITIVE_INFINITY, hostileCoercion]
            },
            {
                name: "coerce string",
                sea: TypeSeaZod.coerce.string().trim().min(1),
                zod: ActualZod.coerce.string().trim().min(1),
                valid: ["sea", 42, true, 1n, Number.NaN, undefined, null, objectString],
                invalid: ["", "   ", [], hostileCoercion]
            },
            {
                name: "coerce boolean",
                sea: TypeSeaZod.coerce.boolean(),
                zod: ActualZod.coerce.boolean(),
                valid: [true, false, "true", "false", 0, 1, undefined, null],
                invalid: []
            },
            {
                name: "coerce bigint",
                sea: TypeSeaZod.coerce.bigint().gte(0n),
                zod: ActualZod.coerce.bigint().gte(0n),
                valid: ["42", "", "   ", 7, true, false, 1n, objectBigInt],
                invalid: ["1.5", 1.5, hostileCoercion]
            }
        ];

        for (let caseIndex = 0; caseIndex < cases.length; caseIndex += 1) {
            const item = cases[caseIndex];
            if (item === undefined) {
                continue;
            }
            assertParity(item, item.valid, true);
            assertParity(item, item.invalid, false);
        }
        expect(readData(TypeSeaZod.coerce.boolean(), "false")).toBe(true);
        expect(readData(ActualZod.coerce.boolean(), "false")).toBe(true);
        const objectDateValue = {
            valueOf(): number {
                return Date.parse("2026-07-06T00:00:00.000Z");
            }
        };
        expectDateResult(
            TypeSeaZod.coerce.date()
                .min(new Date("2020-01-01T00:00:00.000Z"))
                .safeParse("2026-07-06T00:00:00.000Z"),
            "2026-07-06T00:00:00.000Z"
        );
        expectDateResult(
            ActualZod.coerce.date()
                .min(new Date("2020-01-01T00:00:00.000Z"))
                .safeParse("2026-07-06T00:00:00.000Z"),
            "2026-07-06T00:00:00.000Z"
        );
        expectDateResult(
            TypeSeaZod.coerce.date()
                .min(new Date("2020-01-01T00:00:00.000Z"))
                .safeParse(objectDateValue),
            "2026-07-06T00:00:00.000Z"
        );
        expectDateResult(
            ActualZod.coerce.date()
                .min(new Date("2020-01-01T00:00:00.000Z"))
                .safeParse(objectDateValue),
            "2026-07-06T00:00:00.000Z"
        );
        expect(TypeSeaZod.coerce.date()
            .min(new Date("2020-01-01T00:00:00.000Z"))
            .safeParse("2019-12-31T00:00:00.000Z").success).toBe(false);
        expect(ActualZod.coerce.date()
            .min(new Date("2020-01-01T00:00:00.000Z"))
            .safeParse("2019-12-31T00:00:00.000Z").success).toBe(false);
        expect(TypeSeaZod.coerce.date()
            .min(new Date("2020-01-01T00:00:00.000Z"))
            .safeParse(hostileCoercion).success).toBe(false);
        expect(ActualZod.coerce.date()
            .min(new Date("2020-01-01T00:00:00.000Z"))
            .safeParse(hostileCoercion).success).toBe(false);
    });

    test("matches Zod decoder output surfaces", () => {
        const seaDefault = TypeSeaZod.string().min(2).default("ok");
        const zodDefault = ActualZod.string().min(2).default("ok");
        const seaPrefault = TypeSeaZod.string().min(2).prefault("ok");
        const zodPrefault = ActualZod.string().min(2).prefault("ok");
        const seaRecovered = TypeSeaZod.c\u0061tch(TypeSeaZod.string().min(2), "fallback");
        const zodRecovered = ActualZod.c\u0061tch(ActualZod.string().min(2), "fallback");
        const seaPiped = TypeSeaZod.pipe(
            TypeSeaZod.coerce.number(),
            TypeSeaZod.number().int().gte(0)
        );
        const zodPiped = ActualZod.pipe(
            ActualZod.coerce.number(),
            ActualZod.number().int().gte(0)
        );
        const seaLength = TypeSeaZod.string().transform((value) => value.length);
        const zodLength = ActualZod.string().transform((value) => value.length);

        expect(readData(seaDefault, undefined)).toBe("ok");
        expect(readData(zodDefault, undefined)).toBe("ok");
        expect(readResult(seaDefault, "x").success).toBe(false);
        expect(readResult(zodDefault, "x").success).toBe(false);
        expect(readData(seaPrefault, undefined)).toBe("ok");
        expect(readData(zodPrefault, undefined)).toBe("ok");
        expect(readData(seaRecovered, "x")).toBe("fallback");
        expect(readData(zodRecovered, "x")).toBe("fallback");
        expect(readData(seaPiped, "42")).toBe(42);
        expect(readData(zodPiped, "42")).toBe(42);
        expect(readResult(seaPiped, "1.5").success).toBe(false);
        expect(readResult(zodPiped, "1.5").success).toBe(false);
        expect(readData(seaLength, "TypeSea")).toBe(7);
        expect(readData(zodLength, "TypeSea")).toBe(7);
    });

    test("matches Zod top-level wrapper decisions", () => {
        const ExactUser = TypeSeaZod.object({
            nickname: TypeSeaZod.exactOptional(TypeSeaZod.string().min(1))
        });
        const FastExactUser = TypeSeaZod.compile(ExactUser, {
            name: "exactOptionalUser"
        });
        const cases: readonly ParityCase[] = [
            {
                name: "optional wrapper",
                sea: TypeSeaZod.optional(TypeSeaZod.string().min(1)),
                zod: ActualZod.optional(ActualZod.string().min(1)),
                valid: ["sea", undefined],
                invalid: ["", null]
            },
            {
                name: "nullable wrapper",
                sea: TypeSeaZod.nullable(TypeSeaZod.string().min(1)),
                zod: ActualZod.nullable(ActualZod.string().min(1)),
                valid: ["sea", null],
                invalid: ["", undefined]
            },
            {
                name: "nullish wrapper",
                sea: TypeSeaZod.nullish(TypeSeaZod.string().min(1)),
                zod: ActualZod.nullish(ActualZod.string().min(1)),
                valid: ["sea", null, undefined],
                invalid: [""]
            },
            {
                name: "nonoptional wrapper",
                sea: TypeSeaZod.nonoptional(TypeSeaZod.string().min(1).optional()),
                zod: ActualZod.nonoptional(ActualZod.string().min(1).optional()),
                valid: ["sea"],
                invalid: ["", undefined]
            },
            {
                name: "readonly wrapper",
                sea: TypeSeaZod.readonly(TypeSeaZod.object({
                    id: TypeSeaZod.string().min(1)
                })),
                zod: ActualZod.readonly(ActualZod.object({
                    id: ActualZod.string().min(1)
                })),
                valid: [{ id: "sea" }],
                invalid: [{ id: "" }]
            },
            {
                name: "exact optional wrapper",
                sea: TypeSeaZod.exactOptional(TypeSeaZod.string().min(1)),
                zod: ActualZod.exactOptional(ActualZod.string().min(1)),
                valid: ["sea"],
                invalid: ["", undefined]
            }
        ];

        for (let caseIndex = 0; caseIndex < cases.length; caseIndex += 1) {
            const item = cases[caseIndex];
            if (item === undefined) {
                continue;
            }
            assertParity(item, item.valid, true);
            assertParity(item, item.invalid, false);
        }
        expect(FastExactUser.is({})).toBe(true);
        expect(FastExactUser.is({ nickname: "Ada" })).toBe(true);
        expect(FastExactUser.is({ nickname: undefined })).toBe(false);
    });

    test("matches Zod object modifier decisions", () => {
        const seaBase = TypeSeaZod.object({
            id: TypeSeaZod.string().min(1),
            name: TypeSeaZod.string().min(1),
            active: TypeSeaZod.boolean()
        });
        const zodBase = ActualZod.object({
            id: ActualZod.string().min(1),
            name: ActualZod.string().min(1),
            active: ActualZod.boolean()
        });
        const cases: readonly ParityCase[] = [
            {
                name: "object extend",
                sea: seaBase.extend({ count: TypeSeaZod.number().int() }),
                zod: zodBase.extend({ count: ActualZod.number().int() }),
                valid: [{ id: "u1", name: "Ada", active: true, count: 1 }],
                invalid: [{ id: "u1", name: "Ada", active: true, count: 1.5 }]
            },
            {
                name: "object pick",
                sea: seaBase.pick({ id: true, active: true }),
                zod: zodBase.pick({ id: true, active: true }),
                valid: [{ id: "u1", active: true }],
                invalid: [{ id: "", active: true }, { id: "u1", active: "yes" }]
            },
            {
                name: "object omit",
                sea: seaBase.omit({ name: true }),
                zod: zodBase.omit({ name: true }),
                valid: [{ id: "u1", active: true }],
                invalid: [{ id: "u1", active: "yes" }]
            },
            {
                name: "object partial",
                sea: seaBase.partial(),
                zod: zodBase.partial(),
                valid: [{ id: "u1" }, {}],
                invalid: [{ id: "" }, { active: "yes" }]
            },
            {
                name: "object required",
                sea: seaBase.partial().required(),
                zod: zodBase.partial().required(),
                valid: [{ id: "u1", name: "Ada", active: true }],
                invalid: [{ id: "u1", active: true }]
            },
            {
                name: "object strict",
                sea: seaBase.strict(),
                zod: zodBase.strict(),
                valid: [{ id: "u1", name: "Ada", active: true }],
                invalid: [{ id: "u1", name: "Ada", active: true, extra: 1 }]
            },
            {
                name: "object loose",
                sea: seaBase.loose(),
                zod: zodBase.loose(),
                valid: [{ id: "u1", name: "Ada", active: true, extra: 1 }],
                invalid: [{ id: "u1", name: "Ada", active: "yes", extra: 1 }]
            }
        ];

        for (let caseIndex = 0; caseIndex < cases.length; caseIndex += 1) {
            const item = cases[caseIndex];
            if (item === undefined) {
                continue;
            }
            assertParity(item, item.valid, true);
            assertParity(item, item.invalid, false);
        }
    });

    test("keeps Zod-style parse error precedence", () => {
        const sea = TypeSeaZod.object({
            name: TypeSeaZod.string().min(2, "schema message wins"),
            email: TypeSeaZod.email()
        });
        const zod = ActualZod.object({
            name: ActualZod.string().min(2, "schema message wins"),
            email: ActualZod.email()
        });
        const input = {
            name: "",
            email: "bad"
        };

        const seaResult = readResult(sea, input, { error: () => "parse fallback" });
        const zodResult = readResult(zod, input, { error: () => "parse fallback" });

        expect(seaResult.success).toBe(false);
        expect(zodResult.success).toBe(false);
        expect(readIssueMessage(seaResult, "name")).toBe("schema message wins");
        expect(readIssueMessage(zodResult, "name")).toBe("schema message wins");
        expect(readIssueMessage(seaResult, "email")).toBe("parse fallback");
        expect(readIssueMessage(zodResult, "email")).toBe("parse fallback");
    });
});

function assertParity(
    item: ParityCase,
    values: readonly unknown[],
    expected: boolean
): void {
    for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
        const value = values[valueIndex];
        const seaResult = readResult(item.sea, value);
        const zodResult = readResult(item.zod, value);
        expect(seaResult.success, `${item.name} TypeSea ${String(valueIndex)}`)
            .toBe(expected);
        expect(zodResult.success, `${item.name} Zod ${String(valueIndex)}`)
            .toBe(expected);
        expect(seaResult.success, `${item.name} parity ${String(valueIndex)}`)
            .toBe(zodResult.success);
    }
}

function readResult(
    schema: SchemaLike,
    value: unknown,
    options?: unknown
): ResultLike {
    return schema.safeParse(value, options) as ResultLike;
}

function readIssueMessage(result: ResultLike, key: string): string | undefined {
    const issues = result.error?.issues ?? [];
    for (let index = 0; index < issues.length; index += 1) {
        const issue = issues[index];
        if (issue?.path[0] === key) {
            return issue.message;
        }
    }
    return undefined;
}

function readData(schema: SchemaLike, value: unknown): unknown {
    const result = readResult(schema, value);
    expect(result.success).toBe(true);
    return result.data;
}

function expectDateResult(value: unknown, iso: string): void {
    const result = value as ResultLike;
    expect(result.success).toBe(true);
    expect(result.data).toBeInstanceOf(Date);
    expect((result.data as Date).toISOString()).toBe(iso);
}
