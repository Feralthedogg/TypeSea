import { describe, expect, expectTypeOf, test } from "vitest";
import {
  BaseGuard,
  compile,
  CompiledBaseGuard,
  NumberGuard,
  StringGuard,
  t,
  TypeSeaAssertionError,
  toJsonSchema,
  type Brand,
  type Guard,
  type Infer,
  type Issue,
  type Schema
} from "../src/index.js";

interface ObjectSchemaRuntimeView {
  readonly entries: readonly unknown[];
  readonly keys: readonly string[];
  readonly keyLookup: Readonly<Record<string, true>>;
}

interface UnionCaseRuntimeView {
  readonly literal: unknown;
  readonly schema: unknown;
}

interface DiscriminatedUnionRuntimeView {
  readonly cases: readonly UnionCaseRuntimeView[];
}

interface CheckListRuntimeView {
  readonly checks: readonly unknown[];
}

interface NumericCheckRuntimeView {
  value: number;
}

interface RegexCheckRuntimeView {
  readonly regex: RegExp;
}

interface TaggedCheckRuntimeView {
  readonly tag: unknown;
}

describe("edge-case runtime semantics", () => {
  test("preserves Object.is literal semantics for NaN and negative zero", () => {
    const NanLiteral = t.literal(Number.NaN);
    const NegativeZero = t.literal(-0);
    const FastNan = compile(NanLiteral, { name: "nanLiteral" });
    const FastNegativeZero = compile(NegativeZero, { name: "negativeZero" });

    expect(NanLiteral.is(Number.NaN)).toBe(true);
    expect(FastNan.is(Number.NaN)).toBe(true);
    expect(NegativeZero.is(-0)).toBe(true);
    expect(NegativeZero.is(0)).toBe(false);
    expect(FastNegativeZero.is(-0)).toBe(true);
    expect(FastNegativeZero.is(0)).toBe(false);

    const interpreted = NegativeZero.check(0);
    const compiled = FastNegativeZero.check(0);
    expect(interpreted).toEqual(compiled);
    expect(interpreted.ok).toBe(false);
    if (!interpreted.ok) {
      expect(interpreted.error[0]?.expected).toBe("-0");
    }
  });

  test("rejects non-finite number values", () => {
    const NumberGuard = t.number;
    const FastNumber = compile(NumberGuard, { name: "finiteNumber" });

    expect(NumberGuard.is(1)).toBe(true);
    expect(FastNumber.is(1)).toBe(true);
    expect(NumberGuard.is(Number.NaN)).toBe(false);
    expect(FastNumber.is(Number.NaN)).toBe(false);
    expect(NumberGuard.is(Number.POSITIVE_INFINITY)).toBe(false);
    expect(FastNumber.is(Number.POSITIVE_INFINITY)).toBe(false);
    expect(NumberGuard.is(Number.NEGATIVE_INFINITY)).toBe(false);
    expect(FastNumber.check(Number.NEGATIVE_INFINITY))
      .toEqual(NumberGuard.check(Number.NEGATIVE_INFINITY));
  });

  test("keeps optional keys distinct from undefinedable values", () => {
    const Shape = t.object({
      optionalString: t.optional(t.string),
      requiredUndefinedable: t.undefinedable(t.string),
      optionalUndefinedable: t.optional(t.undefinedable(t.string))
    });
    const FastShape = compile(Shape, { name: "optionalSemantics" });

    type Shape = Infer<typeof Shape>;
    expectTypeOf<Shape>().toEqualTypeOf<{
      readonly optionalString?: string;
      readonly requiredUndefinedable: string | undefined;
      readonly optionalUndefinedable?: string | undefined;
    }>();

    const valid = {
      requiredUndefinedable: undefined,
      optionalUndefinedable: undefined
    };
    const missingRequired = {
      optionalString: "x"
    };
    const presentOptionalUndefined = {
      optionalString: undefined,
      requiredUndefinedable: "x"
    };

    expect(Shape.is(valid)).toBe(true);
    expect(FastShape.is(valid)).toBe(true);
    expect(Shape.is(missingRequired)).toBe(false);
    expect(FastShape.check(missingRequired)).toEqual(Shape.check(missingRequired));
    expect(Shape.is(presentOptionalUndefined)).toBe(false);
    expect(FastShape.check(presentOptionalUndefined))
      .toEqual(Shape.check(presentOptionalUndefined));
  });

  test("normalizes optional presence through preserving wrappers", () => {
    const Shape = t.object({
      maybeString: t.optional(t.optional(t.string)),
      maybeUndefined: t.undefinedable(t.optional(t.string)),
      maybeNull: t.nullable(t.optional(t.string)),
      maybeRefined: t.refine(
        t.optional(t.string),
        (value) => value === undefined || value.length > 0,
        "present_non_empty"
      ),
      maybeBranded: t.optional(t.string).brand<"Name">()
    });
    const FastShape = compile(Shape, { name: "wrappedOptionalSemantics" });

    type Shape = Infer<typeof Shape>;
    expectTypeOf<Shape>().toEqualTypeOf<{
      readonly maybeString?: string;
      readonly maybeUndefined?: string | undefined;
      readonly maybeNull?: string | null;
      readonly maybeRefined?: string;
      readonly maybeBranded?: Brand<string, "Name">;
    }>();

    expect(Shape.is({})).toBe(true);
    expect(FastShape.is({})).toBe(true);
    expect(Shape.is({ maybeUndefined: undefined })).toBe(true);
    expect(FastShape.is({ maybeUndefined: undefined })).toBe(true);
    expect(Shape.is({ maybeNull: null })).toBe(true);
    expect(FastShape.is({ maybeNull: null })).toBe(true);

    const presentUndefined = {
      maybeString: undefined,
      maybeNull: undefined,
      maybeRefined: undefined,
      maybeBranded: undefined
    };
    const emptyRefined = {
      maybeRefined: ""
    };

    expect(Shape.is(presentUndefined)).toBe(false);
    expect(FastShape.check(presentUndefined)).toEqual(Shape.check(presentUndefined));
    expect(Shape.is(emptyRefined)).toBe(false);
    expect(FastShape.check(emptyRefined)).toEqual(Shape.check(emptyRefined));
  });

  test("resets stateful regex flags and rejects unsupported regex flags in JSON Schema", () => {
    const Word = t.string.regex(/^a+$/gu, "a_word");
    const FastWord = compile(Word, { name: "word" });

    expect(Word.is("aaa")).toBe(true);
    expect(Word.is("aaa")).toBe(true);
    expect(FastWord.is("aaa")).toBe(true);
    expect(FastWord.is("aaa")).toBe(true);
    expect(FastWord.check("bbb")).toEqual(Word.check("bbb"));

    const json = toJsonSchema(Word);
    expect(json.ok).toBe(false);
    if (!json.ok) {
      expect(json.error.map((issue) => issue.code)).toEqual(["unsupported_regex_flags"]);
    }
  });

  test("reports discriminated union diagnostics precisely", () => {
    const Event = t.discriminatedUnion("kind", {
      user: t.object({
        kind: t.literal("user"),
        id: t.string.min(1)
      }),
      order: t.object({
        kind: t.literal("order"),
        total: t.number.gte(0)
      })
    });
    const FastEvent = compile(Event, { name: "event" });

    expect(FastEvent.check({ kind: "missing" })).toEqual(Event.check({ kind: "missing" }));
    expect(FastEvent.check({ kind: 1 })).toEqual(Event.check({ kind: 1 }));
    expect(FastEvent.check({ kind: "user", id: "" }))
      .toEqual(Event.check({ kind: "user", id: "" }));

    const missing = Event.check({ kind: "missing" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error[0]?.path).toEqual(["kind"]);
      expect(missing.error[0]?.code).toBe("expected_discriminant");
      expect(missing.error[0]?.actual).toBe("\"missing\"");
    }
    const wrongKindType = Event.check({ kind: 1 });
    expect(wrongKindType.ok).toBe(false);
    if (!wrongKindType.ok) {
      expect(wrongKindType.error[0]?.path).toEqual(["kind"]);
      expect(wrongKindType.error[0]?.code).toBe("expected_discriminant");
      expect(wrongKindType.error[0]?.expected).toBe("string discriminant");
      expect(wrongKindType.error[0]?.actual).toBe("number");
    }
  });

  test("rejects invalid discriminated union case schemas", () => {
    const looseDiscriminatedUnion = t.discriminatedUnion as unknown as (
      key: string,
      cases: Readonly<Record<string, Guard<unknown>>>
    ) => Guard<unknown>;

    expect(() => looseDiscriminatedUnion("kind", {
      user: t.object({
        kind: t.literal("order"),
        id: t.string
      })
    })).toThrow(TypeError);
    expect(() => looseDiscriminatedUnion("kind", {
      user: t.object({
        id: t.string
      })
    })).toThrow(TypeError);
    expect(() => looseDiscriminatedUnion("kind", {
      user: t.object({
        kind: t.optional(t.literal("user")),
        id: t.string
      })
    })).toThrow(TypeError);
    expect(() => looseDiscriminatedUnion("kind", {
      user: t.string
    })).toThrow(TypeError);
    expect(() => t.discriminatedUnion("kind", {
      user: t.object({
        kind: t.refine(t.literal("user"), () => true, "same_user"),
        id: t.string
      })
    })).not.toThrow();
    expect(() => t.discriminatedUnion("kind", {
      user: t.intersect(
        t.object({
          kind: t.literal("user")
        }),
        t.object({
          id: t.string
        })
      )
    })).not.toThrow();
  });

  test("rejects invalid construction bounds before schemas reach runtime paths", () => {
    expect(() => t.string.min(-1)).toThrow(RangeError);
    expect(() => t.string.min(1.5)).toThrow(RangeError);
    expect(() => t.string.max(Number.NaN)).toThrow(RangeError);
    expect(() => t.number.gte(Number.NaN)).toThrow(RangeError);
    expect(() => t.number.gte(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
    expect(() => t.number.lte(Number.POSITIVE_INFINITY)).toThrow(RangeError);

    const Text = t.string.min(0).max(2);
    const Count = t.number.gte(-1).lte(1);

    expect(Text.is("")).toBe(true);
    expect(Text.is("abc")).toBe(false);
    expect(Count.is(0)).toBe(true);
    expect(Count.is(2)).toBe(false);
  });

  test("supports intersection and shape-preserving object combinators", () => {
    const User = t.strictObject({
      id: t.string.min(1),
      name: t.string,
      nick: t.optional(t.string)
    }).extend({
      age: t.number.int().gte(0)
    }).omit(["name"]);
    const PublicUser = User.pick(["id", "age"]);
    const PatchUser = User.partial();
    const Profile = t.intersect(
      t.object({
        id: t.string.min(1)
      }),
      t.object({
        age: t.number.gte(0)
      })
    );
    const MethodProfile = t.object({
      id: t.string
    }).intersect(t.object({
      active: t.boolean
    }));
    const FastUser = compile(User, { name: "combinedUser" });
    const FastPublicUser = compile(PublicUser, { name: "publicUser" });
    const FastPatchUser = compile(PatchUser, { name: "patchUser" });
    const FastProfile = compile(Profile, { name: "profileIntersection" });

    expect(User.is({ id: "u", age: 1 })).toBe(true);
    expect(User.is({ id: "u", age: 1, name: "Ada" })).toBe(false);
    expect(FastUser.check({ id: "u", age: 1, name: "Ada" }))
      .toEqual(User.check({ id: "u", age: 1, name: "Ada" }));
    expect(PublicUser.is({ id: "u", age: 1 })).toBe(true);
    expect(FastPublicUser.is({ id: "u", age: 1, nick: "n" })).toBe(false);
    expect(PatchUser.is({})).toBe(true);
    expect(FastPatchUser.is({ extra: true })).toBe(false);
    expect(Profile.is({ id: "u", age: 1, extra: true })).toBe(true);
    expect(FastProfile.is({ id: "u", age: 1, extra: true })).toBe(true);
    expect(FastProfile.check({ id: "", age: -1 })).toEqual(
      Profile.check({ id: "", age: -1 })
    );
    expect(MethodProfile.is({ id: "u", active: true })).toBe(true);

    const looseUser = User as unknown as {
      extend(shape: unknown): Guard<unknown>;
      pick(keys: readonly unknown[]): Guard<unknown>;
      omit(keys: readonly unknown[]): Guard<unknown>;
    };
    expect(() => looseUser.extend(null)).toThrow(TypeError);
    expect(() => looseUser.pick(["missing"])).toThrow(TypeError);
    expect(() => looseUser.pick(["id", "id"])).toThrow(TypeError);
    expect(() => looseUser.omit([1])).toThrow(TypeError);
  });

  test("rejects structurally forged guards at builder boundaries", () => {
    const missingSchema = {} as unknown as Guard<unknown>;
    const invalidSchema = {
      schema: {
        tag: 999
      }
    } as unknown as Guard<unknown>;
    const directCycleSchema: Record<string, unknown> = {
      tag: t.optional(t.string).schema.tag
    };
    directCycleSchema["inner"] = directCycleSchema;
    const directCycle = {
      schema: directCycleSchema
    } as unknown as Guard<unknown>;
    const invalidLazySchema = {
      schema: {
        tag: t.lazy(() => t.string).schema.tag,
        get: (): unknown => ({
          tag: 999
        })
      }
    } as unknown as Guard<unknown>;
    const looseUnion = t.union as unknown as (
      ...guards: Guard<unknown>[]
    ) => Guard<unknown>;
    const looseObject = t.object as unknown as (
      shape: unknown
    ) => Guard<unknown>;
    const looseDiscriminatedUnion = t.discriminatedUnion as unknown as (
      key: unknown,
      cases: unknown
    ) => Guard<unknown>;

    expect(() => t.array(missingSchema)).toThrow(TypeError);
    expect(() => t.record(invalidSchema)).toThrow(TypeError);
    expect(() => t.array(directCycle)).toThrow(TypeError);
    expect(() => t.tuple([invalidSchema])).toThrow(TypeError);
    expect(() => t.object({ broken: invalidSchema })).toThrow(TypeError);
    expect(() => t.optional(invalidSchema)).toThrow(TypeError);
    expect(() => t.undefinedable(invalidSchema)).toThrow(TypeError);
    expect(() => t.nullable(invalidSchema)).toThrow(TypeError);
    expect(() => t.refine(invalidSchema, () => true, "forged")).toThrow(TypeError);
    expect(() => looseUnion()).toThrow(TypeError);
    expect(() => looseObject(null)).toThrow(TypeError);
    expect(() => looseDiscriminatedUnion(1, {})).toThrow(TypeError);
    expect(() => looseDiscriminatedUnion("kind", null)).toThrow(TypeError);

    const Lazy = t.lazy((): Guard<unknown> => invalidSchema);
    expect(() => Lazy.is("value")).toThrow(TypeError);

    const LazyArray = t.array(invalidLazySchema);
    const FastLazyArray = compile(LazyArray, { name: "invalidLazyArray" });

    expect(() => LazyArray.is(["value"])).toThrow(TypeError);
    expect(() => LazyArray.check(["value"])).toThrow(TypeError);
    expect(() => FastLazyArray.is(["value"])).toThrow(TypeError);
    expect(() => FastLazyArray.check(["value"])).toThrow(TypeError);
  });

  test("rejects lazy schemas that resolve only to lazy cycles", () => {
    const slot: {
      value: Guard<unknown> | undefined;
    } = {
      value: undefined
    };
    const Bad = t.lazy((): Guard<unknown> => {
      const guard = slot.value;
      if (guard === undefined) {
        return t.never;
      }
      return guard;
    });
    slot.value = Bad;
    const AlsoBad = t.lazy((): Guard<unknown> => Bad);
    const FastBad = compile(Bad, { name: "badLazyCycle" });
    const FastAlsoBad = compile(AlsoBad, { name: "alsoBadLazyCycle" });

    expect(() => Bad.is({})).toThrow(TypeError);
    expect(() => Bad.check({})).toThrow(TypeError);
    expect(() => FastBad.is({})).toThrow(TypeError);
    expect(() => FastBad.check({})).toThrow(TypeError);
    expect(() => AlsoBad.is({})).toThrow(TypeError);
    expect(() => FastAlsoBad.check({})).toThrow(TypeError);
  });

  test("rejects malformed functional construction inputs", () => {
    const looseLiteral = t.literal as unknown as (value: unknown) => Guard<unknown>;
    const looseLazy = t.lazy as unknown as (
      get: unknown
    ) => Guard<unknown>;
    const looseTuple = t.tuple as unknown as (
      shape: unknown
    ) => Guard<unknown>;
    const looseRefine = t.refine as unknown as (
      guard: Guard<unknown>,
      predicate: unknown,
      name: unknown
    ) => Guard<unknown>;
    const looseCompile = compile as unknown as (
      guard: unknown,
      options?: unknown
    ) => Guard<unknown>;
    const looseIntersect = t.intersect as unknown as (
      left: unknown,
      right: unknown
    ) => Guard<unknown>;
    const looseString = t.string as unknown as {
      regex(pattern: unknown, name: unknown): Guard<string>;
      refine(predicate: unknown, name: unknown): Guard<string>;
      or(other: Guard<unknown>): Guard<unknown>;
    };
    const looseDiscriminatedUnion = t.discriminatedUnion as unknown as (
      key: string,
      cases: Readonly<Record<string, Guard<unknown>>>
    ) => Guard<unknown>;

    expect(() => looseLiteral({ value: 1 })).toThrow(TypeError);
    expect(() => looseString.regex("abc", "word")).toThrow(TypeError);
    expect(() => looseString.regex(/abc/u, 1)).toThrow(TypeError);
    const poisonedPattern = /abc/u;
    Object.defineProperty(poisonedPattern, "exec", {
      configurable: true,
      value: (): RegExpExecArray | null => null
    });
    expect(() => looseString.regex(poisonedPattern, "word")).toThrow(TypeError);
    expect(() => looseString.refine("not_fn", "named")).toThrow(TypeError);
    expect(() => looseString.refine(() => true, 1)).toThrow(TypeError);
    expect(() => looseString.or({} as unknown as Guard<unknown>)).toThrow(TypeError);
    expect(() => looseTuple(null)).toThrow(TypeError);
    expect(() => looseTuple({ length: 1 })).toThrow(TypeError);
    expect(() => looseRefine(t.string, "not_fn", "named")).toThrow(TypeError);
    expect(() => looseRefine(t.string, () => true, 1)).toThrow(TypeError);
    expect(() => looseLazy(undefined)).toThrow(TypeError);
    expect(() => looseDiscriminatedUnion("kind", {})).toThrow(TypeError);
    expect(() => looseIntersect(t.string, {})).toThrow(TypeError);
    expect(() => looseCompile({})).toThrow(TypeError);
    expect(() => looseCompile(t.string, 1)).toThrow(TypeError);
    expect(() => looseCompile(t.string, { name: 1 })).toThrow(TypeError);
  });

  test("rejects malformed direct public class construction", () => {
    const invalidSchema = {
      tag: 999
    } as unknown as Schema;
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
    } as unknown as Schema;
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
    } as unknown as Schema;
    const intersectionTag = t.intersect(t.string, t.number).schema.tag;
    const invalidIntersectionSchema = {
      tag: intersectionTag,
      left: t.string.schema,
      right: invalidSchema
    } as unknown as Schema;
    const looseCompiledBaseGuard = CompiledBaseGuard as unknown as new (
      schema: Schema,
      test: unknown,
      collect: unknown,
      source: unknown
    ) => Guard<unknown>;
    const looseStringGuard = StringGuard as unknown as new (
      schema: Schema
    ) => Guard<string>;
    const looseNumberGuard = NumberGuard as unknown as new (
      schema: Schema
    ) => Guard<number>;

    expect(() => new BaseGuard(invalidSchema)).toThrow(TypeError);
    expect(() => new BaseGuard(invalidDiscriminatedUnionSchema)).toThrow(TypeError);
    expect(() => new BaseGuard(invalidNumericDiscriminatedUnionSchema))
      .toThrow(TypeError);
    expect(() => new BaseGuard(invalidIntersectionSchema)).toThrow(TypeError);
    expect(() => new looseStringGuard(invalidSchema)).toThrow(TypeError);
    expect(() => new looseNumberGuard(invalidSchema)).toThrow(TypeError);
    expect(() => new looseStringGuard(t.number.schema)).toThrow(TypeError);
    expect(() => new looseNumberGuard(t.string.schema)).toThrow(TypeError);
    expect(() => new CompiledBaseGuard(
      invalidSchema,
      () => true,
      () => [],
      "source"
    )).toThrow(TypeError);
    expect(() => new CompiledBaseGuard(
      invalidDiscriminatedUnionSchema,
      () => true,
      () => [],
      "source"
    )).toThrow(TypeError);
    expect(() => new CompiledBaseGuard(
      invalidNumericDiscriminatedUnionSchema,
      () => true,
      () => [],
      "source"
    )).toThrow(TypeError);
    expect(() => new CompiledBaseGuard(
      invalidIntersectionSchema,
      () => true,
      () => [],
      "source"
    )).toThrow(TypeError);
    expect(() => new looseCompiledBaseGuard(t.string.schema, "not_fn", () => [], "source"))
      .toThrow(TypeError);
    expect(() => new looseCompiledBaseGuard(t.string.schema, () => true, "not_fn", "source"))
      .toThrow(TypeError);
    expect(() => new looseCompiledBaseGuard(t.string.schema, () => true, () => [], 1))
      .toThrow(TypeError);
  });

  test("validates direct compiled guard collector diagnostics", () => {
    const looseCompiledBaseGuard = CompiledBaseGuard as unknown as new (
      schema: Schema,
      test: (value: unknown) => boolean,
      collect: (value: unknown) => unknown,
      source: string
    ) => Guard<unknown>;
    const nonArray = new looseCompiledBaseGuard(
      t.string.schema,
      () => false,
      () => "not_issues",
      "source"
    );
    const badIssue = new looseCompiledBaseGuard(
      t.string.schema,
      () => false,
      () => [
        {
          path: [],
          code: "unknown_code",
          expected: undefined,
          actual: undefined,
          message: undefined
        }
      ],
      "source"
    );
    const badPathSegment = new looseCompiledBaseGuard(
      t.string.schema,
      () => false,
      () => [
        {
          path: [1.5],
          code: "expected_string",
          expected: undefined,
          actual: undefined,
          message: undefined
        }
      ],
      "source"
    );
    const path = ["value"];
    const issues: Issue[] = [
      {
        path,
        code: "expected_string",
        expected: "string",
        actual: "number",
        message: undefined
      }
    ];
    const copiedIssue = new looseCompiledBaseGuard(
      t.string.schema,
      () => false,
      () => issues,
      "source"
    );

    expect(() => nonArray.check(1)).toThrow(TypeError);
    expect(() => badIssue.check(1)).toThrow(TypeError);
    expect(() => badPathSegment.check(1)).toThrow(TypeError);

    const result = copiedIssue.check(1);
    path[0] = "mutated";
    issues[0] = {
      path: ["other"],
      code: "expected_number",
      expected: "number",
      actual: "string",
      message: undefined
    };

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error[0]?.path).toEqual(["value"]);
      expect(result.error[0]?.code).toBe("expected_string");
      expect(Object.isFrozen(result.error)).toBe(true);
      expect(Object.isFrozen(result.error[0])).toBe(true);
      expect(Object.isFrozen(result.error[0]?.path)).toBe(true);
    }
  });

  test("requires public predicates to return strict true", () => {
    const looseRefine = t.refine as unknown as (
      guard: Guard<unknown>,
      predicate: (value: unknown) => unknown,
      name: string
    ) => Guard<unknown>;
    const looseString = t.string as unknown as {
      refine(predicate: (value: unknown) => unknown, name: string): Guard<string>;
    };
    const looseCompiledBaseGuard = CompiledBaseGuard as unknown as new (
      schema: Schema,
      test: (value: unknown) => unknown,
      collect: (value: unknown) => readonly Issue[],
      source: string
    ) => Guard<unknown>;
    const refineTag = t.refine(t.string, () => false, "false").schema.tag;
    const forgedRefine = new BaseGuard({
      tag: refineTag,
      inner: t.string.schema,
      predicate: (): unknown => "yes",
      name: "truthy"
    } as unknown as Schema);
    const compiled = new looseCompiledBaseGuard(
      t.string.schema,
      () => "yes",
      () => [],
      "source"
    );

    expect(looseRefine(t.string, () => "yes", "truthy").is("value")).toBe(false);
    expect(looseString.refine(() => "yes", "truthy").is("value")).toBe(false);
    expect(forgedRefine.is("value")).toBe(false);
    expect(compiled.is("value")).toBe(false);

    const result = forgedRefine.check("value");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error[0]?.code).toBe("expected_refinement");
    }
  });

  test("rejects accessor-backed object properties without executing getters", () => {
    const Shape = t.object({
      name: t.string
    });
    const FastShape = compile(Shape, { name: "accessor_backed_object" });
    let reads = 0;
    const value = {};
    Object.defineProperty(value, "name", {
      configurable: true,
      enumerable: true,
      get(): string {
        reads += 1;
        return "Ada";
      }
    });

    expect(Shape.is(value)).toBe(false);
    expect(FastShape.is(value)).toBe(false);
    expect(reads).toBe(0);

    const interpreted = Shape.check(value);
    const compiled = FastShape.check(value);
    expect(reads).toBe(0);
    expect(interpreted.ok).toBe(false);
    expect(compiled).toEqual(interpreted);
    if (!interpreted.ok) {
      expect(interpreted.error[0]?.code).toBe("expected_required_key");
    }
  });

  test("freezes public guard registry and core guard fields", () => {
    const Shape = t.object({
      id: t.string
    });
    const FastShape = compile(Shape, { name: "frozenGuardFields" });
    const mutableRegistry = t as unknown as {
      string: unknown;
    };
    const mutableShape = Shape as unknown as {
      schema: Schema;
    };
    const mutableFastShape = FastShape as unknown as {
      schema: Schema;
      source: string;
    };

    expect(Object.isFrozen(t)).toBe(true);
    expect(Object.isFrozen(t.string)).toBe(true);
    expect(Object.isFrozen(t.number)).toBe(true);
    expect(Object.isFrozen(Shape)).toBe(true);
    expect(Object.isFrozen(FastShape)).toBe(true);

    expect(() => {
      mutableRegistry.string = t.number;
    }).toThrow(TypeError);
    expect(() => {
      mutableShape.schema = t.number.schema;
    }).toThrow(TypeError);
    expect(() => {
      mutableFastShape.schema = t.number.schema;
    }).toThrow(TypeError);
    expect(() => {
      mutableFastShape.source = "source";
    }).toThrow(TypeError);

    expect(Shape.is({ id: "a" })).toBe(true);
    expect(FastShape.is({ id: "a" })).toBe(true);
  });

  test("rejects detached public method receivers", () => {
    const readDetached = (target: object, key: string): unknown =>
      Reflect.get(target, key);
    const baseIs = readDetached(BaseGuard.prototype, "is") as (
      this: unknown,
      value: unknown
    ) => boolean;
    const baseCheck = readDetached(BaseGuard.prototype, "check") as (
      this: unknown,
      value: unknown
    ) => unknown;
    const baseAssert = readDetached(BaseGuard.prototype, "assert") as (
      this: unknown,
      value: unknown
    ) => void;
    const baseGraph = readDetached(BaseGuard.prototype, "graph") as (
      this: unknown
    ) => unknown;
    const baseOptional = readDetached(BaseGuard.prototype, "optional") as (
      this: unknown
    ) => Guard<unknown>;
    const baseUndefinedable = readDetached(
      BaseGuard.prototype,
      "undefinedable"
    ) as (
      this: unknown
    ) => Guard<unknown>;
    const baseNullable = readDetached(BaseGuard.prototype, "nullable") as (
      this: unknown
    ) => Guard<unknown>;
    const baseArray = readDetached(BaseGuard.prototype, "array") as (
      this: unknown
    ) => Guard<unknown>;
    const baseBrand = readDetached(BaseGuard.prototype, "brand") as (
      this: unknown
    ) => Guard<unknown>;
    const baseRefine = readDetached(BaseGuard.prototype, "refine") as (
      this: unknown,
      predicate: (value: unknown) => boolean,
      name: string
    ) => Guard<unknown>;
    const baseOr = readDetached(BaseGuard.prototype, "or") as (
      this: unknown,
      other: Guard<unknown>
    ) => Guard<unknown>;
    const stringMin = readDetached(t.string, "min") as (
      this: unknown,
      value: number
    ) => Guard<string>;
    const stringMax = readDetached(t.string, "max") as (
      this: unknown,
      value: number
    ) => Guard<string>;
    const stringRegex = readDetached(t.string, "regex") as (
      this: unknown,
      pattern: RegExp,
      name: string
    ) => Guard<string>;
    const stringUuid = readDetached(t.string, "uuid") as (
      this: unknown
    ) => Guard<string>;
    const numberInt = readDetached(t.number, "int") as (
      this: unknown
    ) => Guard<number>;
    const numberGte = readDetached(t.number, "gte") as (
      this: unknown,
      value: number
    ) => Guard<number>;
    const numberLte = readDetached(t.number, "lte") as (
      this: unknown,
      value: number
    ) => Guard<number>;
    const FastString = compile(t.string, { name: "detachedReceiver" });
    const forgedPrototypeReceiver = Object.create(BaseGuard.prototype) as {
      schema: unknown;
    };
    Object.defineProperty(forgedPrototypeReceiver, "schema", {
      configurable: true,
      enumerable: true,
      value: {
        tag: 999
      },
      writable: true
    });
    const compiledIs = readDetached(FastString, "is") as (
      this: unknown,
      value: unknown
    ) => boolean;
    const compiledCheck = readDetached(FastString, "check") as (
      this: unknown,
      value: unknown
    ) => unknown;
    const compiledAssert = readDetached(FastString, "assert") as (
      this: unknown,
      value: unknown
    ) => void;

    expect(() => Reflect.apply(baseIs, null, ["x"])).toThrow(TypeError);
    expect(() => Reflect.apply(baseCheck, null, ["x"])).toThrow(TypeError);
    expect(() => {
      Reflect.apply(baseAssert, null, ["x"]);
    }).toThrow(TypeError);
    expect(() => Reflect.apply(baseGraph, null, [])).toThrow(TypeError);
    expect(() => Reflect.apply(baseOptional, null, [])).toThrow(TypeError);
    expect(() => Reflect.apply(baseUndefinedable, null, [])).toThrow(TypeError);
    expect(() => Reflect.apply(baseNullable, null, [])).toThrow(TypeError);
    expect(() => Reflect.apply(baseArray, null, [])).toThrow(TypeError);
    expect(() => Reflect.apply(baseBrand, null, [])).toThrow(TypeError);
    expect(() => Reflect.apply(baseRefine, null, [(): boolean => true, "ok"]))
      .toThrow(TypeError);
    expect(() => Reflect.apply(baseOr, null, [t.string])).toThrow(TypeError);
    expect(() => Reflect.apply(baseIs, forgedPrototypeReceiver, ["x"]))
      .toThrow(TypeError);
    expect(() => Reflect.apply(stringMin, null, [1])).toThrow(TypeError);
    expect(() => Reflect.apply(stringMin, t.number, [1])).toThrow(TypeError);
    expect(() => Reflect.apply(stringMax, null, [1])).toThrow(TypeError);
    expect(() => Reflect.apply(stringRegex, null, [/x/u, "x"])).toThrow(TypeError);
    expect(() => Reflect.apply(stringUuid, t.number, [])).toThrow(TypeError);
    expect(() => Reflect.apply(numberInt, t.string, [])).toThrow(TypeError);
    expect(() => Reflect.apply(numberGte, null, [0])).toThrow(TypeError);
    expect(() => Reflect.apply(numberLte, null, [0])).toThrow(TypeError);
    expect(() => Reflect.apply(compiledIs, null, ["x"])).toThrow(TypeError);
    expect(() => Reflect.apply(compiledIs, { collect: (): readonly Issue[] => [] }, ["x"]))
      .toThrow(TypeError);
    expect(() => Reflect.apply(compiledCheck, { test: (): boolean => true }, ["x"]))
      .toThrow(TypeError);
    expect(() => {
      Reflect.apply(compiledAssert, null, ["x"]);
    }).toThrow(TypeError);
  });

  test("validates and copies public assertion error issues", () => {
    const path = ["id"];
    const issues: Issue[] = [
      {
        path,
        code: "expected_string",
        expected: "string",
        actual: "number",
        message: undefined
      }
    ];
    const error = new TypeSeaAssertionError(issues);
    const looseAssertionError = TypeSeaAssertionError as unknown as new (
      issues: unknown
    ) => TypeSeaAssertionError;
    const mutableError = error as unknown as {
      issues: readonly Issue[];
    };

    path[0] = "mutated";
    issues[0] = {
      path: ["other"],
      code: "expected_number",
      expected: "number",
      actual: "string",
      message: undefined
    };

    expect(error.issues[0]?.path).toEqual(["id"]);
    expect(error.issues[0]?.code).toBe("expected_string");
    expect(Object.isFrozen(error.issues)).toBe(true);
    expect(Object.isFrozen(error.issues[0])).toBe(true);
    expect(Object.isFrozen(error.issues[0]?.path)).toBe(true);
    expect(() => {
      mutableError.issues = [];
    }).toThrow(TypeError);
    expect(() => new looseAssertionError(null)).toThrow(TypeError);
    expect(() => new looseAssertionError([
      {
        path: [],
        code: "unknown_code",
        expected: undefined,
        actual: undefined,
        message: undefined
      }
    ])).toThrow(TypeError);
    expect(() => new looseAssertionError([
      {
        path: [Number.NaN],
        code: "expected_string",
        expected: undefined,
        actual: undefined,
        message: undefined
      }
    ])).toThrow(TypeError);
    expect(() => new looseAssertionError([
      {
        path: [-1],
        code: "expected_string",
        expected: undefined,
        actual: undefined,
        message: undefined
      }
    ])).toThrow(TypeError);
    expect(() => new looseAssertionError([
      {
        path: [1.5],
        code: "expected_string",
        expected: undefined,
        actual: undefined,
        message: undefined
      }
    ])).toThrow(TypeError);
  });

  test("returns frozen diagnostics from interpreted and compiled checks", () => {
    const Shape = t.strictObject({
      id: t.string,
      count: t.number.gte(1)
    });
    const FastShape = compile(Shape, { name: "frozenDiagnostics" });
    const value = {
      id: 1,
      count: 0,
      extra: true
    };

    const slow = Shape.check(value);
    const fast = FastShape.check(value);

    expect(slow.ok).toBe(false);
    expect(fast.ok).toBe(false);
    if (!slow.ok) {
      const first = slow.error[0];
      expect(Object.isFrozen(slow.error)).toBe(true);
      expect(first).not.toBeUndefined();
      if (first !== undefined) {
        expect(Object.isFrozen(first)).toBe(true);
        expect(Object.isFrozen(first.path)).toBe(true);
      }
    }
    if (!fast.ok) {
      const first = fast.error[0];
      expect(Object.isFrozen(fast.error)).toBe(true);
      expect(first).not.toBeUndefined();
      if (first !== undefined) {
        expect(Object.isFrozen(first)).toBe(true);
        expect(Object.isFrozen(first.path)).toBe(true);
      }
    }
  });

  test("freezes public schema collection surfaces", () => {
    const Strict = t.strictObject({
      id: t.string,
      count: t.number
    });
    const FastStrict = compile(Strict, { name: "frozenSchemaCollections" });
    const objectSchema = Strict.schema as unknown as ObjectSchemaRuntimeView;
    const mutableEntries = objectSchema.entries as unknown as unknown[];
    const mutableKeys = objectSchema.keys as unknown as string[];
    const writableLookup = objectSchema.keyLookup as Record<string, true>;

    expect(Object.isFrozen(Strict.schema)).toBe(true);
    expect(Object.isFrozen(objectSchema.entries)).toBe(true);
    expect(Object.isFrozen(objectSchema.keys)).toBe(true);
    expect(Object.isFrozen(objectSchema.keyLookup)).toBe(true);
    expect("keySet" in objectSchema).toBe(false);
    expect(() => {
      mutableEntries.push({});
    }).toThrow(TypeError);
    expect(() => {
      mutableKeys.push("extra");
    }).toThrow(TypeError);
    expect(() => {
      writableLookup["extra"] = true;
    }).toThrow(TypeError);
    expect(Strict.is({ id: "a", count: 1, extra: true })).toBe(false);
    expect(FastStrict.is({ id: "a", count: 1, extra: true })).toBe(false);

    const Event = t.discriminatedUnion("kind", {
      user: t.object({
        kind: t.literal("user"),
        id: t.string
      }),
      order: t.object({
        kind: t.literal("order"),
        total: t.number
      })
    });
    const unionSchema = Event.schema as unknown as DiscriminatedUnionRuntimeView;
    const firstCase = unionSchema.cases[0];
    const mutableCases = unionSchema.cases as unknown as unknown[];

    expect(Object.isFrozen(Event.schema)).toBe(true);
    expect(Object.isFrozen(unionSchema.cases)).toBe(true);
    expect(unionSchema.cases).not.toBeInstanceOf(Map);
    expect(firstCase).not.toBeUndefined();
    if (firstCase !== undefined) {
      expect(Object.isFrozen(firstCase)).toBe(true);
    }
    expect(() => {
      mutableCases.push({});
    }).toThrow(TypeError);
    expect(Event.is({ kind: "user", id: "u_1" })).toBe(true);
    expect(Event.is({ kind: "order", id: "u_1" })).toBe(false);

    const externalStringSchema = {
      tag: t.string.schema.tag,
      checks: []
    } as unknown as Schema;
    const externalGuard = {
      schema: externalStringSchema
    } as unknown as Guard<string>;
    const FastExternal = compile(externalGuard, { name: "externalFrozenSchema" });
    const externalView = externalStringSchema as unknown as {
      readonly checks: readonly unknown[];
    };

    expect(FastExternal.is("value")).toBe(true);
    expect(Object.isFrozen(externalStringSchema)).toBe(true);
    expect(Object.isFrozen(externalView.checks)).toBe(true);
  });

  test("freezes public scalar check surfaces without retaining regex inputs", () => {
    const originalPattern = /^a+$/gu;
    const RegexOnly = t.string.regex(originalPattern, "letters_only");
    const Text = t.string.min(1).max(3).regex(originalPattern, "letters").uuid();
    const Count = t.number.int().gte(1).lte(3);
    const regexOnlySchema = RegexOnly.schema as unknown as CheckListRuntimeView;
    const textSchema = Text.schema as unknown as CheckListRuntimeView;
    const countSchema = Count.schema as unknown as CheckListRuntimeView;
    const textChecks = textSchema.checks as unknown as unknown[];
    const countChecks = countSchema.checks as unknown as unknown[];
    const regexOnlyCheck = regexOnlySchema.checks[0] as
      | RegexCheckRuntimeView
      | undefined;
    const minCheck = textSchema.checks[0] as NumericCheckRuntimeView | undefined;
    const regexCheck = textSchema.checks[2] as RegexCheckRuntimeView | undefined;
    const gteCheck = countSchema.checks[1] as NumericCheckRuntimeView | undefined;

    expect(Object.isFrozen(Text.schema)).toBe(true);
    expect(Object.isFrozen(RegexOnly.schema)).toBe(true);
    expect(Object.isFrozen(Count.schema)).toBe(true);
    expect(Object.isFrozen(regexOnlySchema.checks)).toBe(true);
    expect(Object.isFrozen(textSchema.checks)).toBe(true);
    expect(Object.isFrozen(countSchema.checks)).toBe(true);
    expect(regexOnlyCheck).not.toBeUndefined();
    expect(minCheck).not.toBeUndefined();
    expect(regexCheck).not.toBeUndefined();
    expect(gteCheck).not.toBeUndefined();
    if (regexOnlyCheck !== undefined &&
      minCheck !== undefined &&
      regexCheck !== undefined &&
      gteCheck !== undefined) {
      expect(Object.isFrozen(regexOnlyCheck)).toBe(true);
      expect(Object.isFrozen(minCheck)).toBe(true);
      expect(Object.isFrozen(regexCheck)).toBe(true);
      expect(Object.isFrozen(gteCheck)).toBe(true);
      expect(regexOnlyCheck.regex).not.toBe(originalPattern);
      expect(regexCheck.regex).not.toBe(originalPattern);
      expect(() => {
        minCheck.value = 0;
      }).toThrow(TypeError);
      expect(() => {
        gteCheck.value = -1;
      }).toThrow(TypeError);
    }
    expect(() => {
      textChecks.push({});
    }).toThrow(TypeError);
    expect(() => {
      countChecks.push({});
    }).toThrow(TypeError);
    originalPattern.lastIndex = 1;
    expect(RegexOnly.is("aaa")).toBe(true);
    expect(Text.is("aaa")).toBe(false);
    expect(Count.is(2)).toBe(true);
  });

  test("sanitizes direct regex schemas before storing public guards", () => {
    const regexCheck = (t.string.regex(/^x$/u, "x").schema as unknown as
      CheckListRuntimeView).checks[0] as TaggedCheckRuntimeView | undefined;
    expect(regexCheck).not.toBeUndefined();
    if (regexCheck === undefined) {
      return;
    }

    const externalPattern = /^a+$/gu;
    const externalRegexSchema = {
      tag: t.string.schema.tag,
      checks: [
        {
          tag: regexCheck.tag,
          regex: externalPattern,
          name: "direct_regex"
        }
      ]
    } as unknown as Schema;
    const DirectRegex = new BaseGuard<string>(externalRegexSchema);
    const sanitizedSchema = DirectRegex.schema as unknown as CheckListRuntimeView;
    const sanitizedCheck = sanitizedSchema.checks[0] as
      | RegexCheckRuntimeView
      | undefined;

    expect(sanitizedCheck).not.toBeUndefined();
    if (sanitizedCheck !== undefined) {
      expect(sanitizedCheck.regex).not.toBe(externalPattern);
      expect(Object.isExtensible(sanitizedCheck.regex)).toBe(false);
    }
    Object.defineProperty(externalPattern, "exec", {
      configurable: true,
      value: (): RegExpExecArray | null => null
    });
    expect(DirectRegex.is("aaa")).toBe(true);

    const poisonedPattern = /^a+$/u;
    Object.defineProperty(poisonedPattern, "exec", {
      configurable: true,
      value: (): RegExpExecArray | null => null
    });
    const poisonedRegexSchema = {
      tag: t.string.schema.tag,
      checks: [
        {
          tag: regexCheck.tag,
          regex: poisonedPattern,
          name: "poisoned_regex"
        }
      ]
    } as unknown as Schema;

    expect(() => new BaseGuard<string>(poisonedRegexSchema)).toThrow(TypeError);
  });

  test("handles special object keys and null-prototype records", () => {
    const shape = Object.create(null) as Record<string, Guard<unknown>>;
    defineRecordValue(shape, "__proto__", t.string);
    defineRecordValue(shape, "constructor", t.number);
    defineRecordValue(shape, "hasOwnProperty", t.boolean);
    const Special = t.strictObject(shape);
    const FastSpecial = compile(Special, { name: "specialKeys" });
    const valid = Object.create(null) as Record<string, unknown>;
    defineRecordValue(valid, "__proto__", "safe");
    defineRecordValue(valid, "constructor", 1);
    defineRecordValue(valid, "hasOwnProperty", false);
    const extra = Object.create(null) as Record<string, unknown>;
    defineRecordValue(extra, "__proto__", "safe");
    defineRecordValue(extra, "constructor", 1);
    defineRecordValue(extra, "hasOwnProperty", false);
    defineRecordValue(extra, "extra", true);

    expect(Special.is(valid)).toBe(true);
    expect(FastSpecial.is(valid)).toBe(true);
    expect(Special.check(valid)).toEqual(FastSpecial.check(valid));
    expect(Special.is(extra)).toBe(false);
    expect(FastSpecial.is(extra)).toBe(false);
    expect(Special.check(extra)).toEqual(FastSpecial.check(extra));
  });
});

function defineRecordValue(
  target: Record<string, unknown>,
  key: string,
  value: unknown
): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  });
}

describe("edge-case JSON Schema export", () => {
  test("rejects number literals that JSON cannot preserve", () => {
    expect(toJsonSchema(t.literal(Number.NaN)).ok).toBe(false);
    expect(toJsonSchema(t.literal(-0)).ok).toBe(false);
    expect(toJsonSchema(t.literal(Number.POSITIVE_INFINITY)).ok).toBe(false);
  });

  test("aggregates unsupported sibling properties without poisoning valid siblings", () => {
    const Schema = t.object({
      bad: t.symbol,
      ok: t.number.gte(0)
    });

    const result = toJsonSchema(Schema);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.map((issue) => issue.code)).toEqual([
        "unsupported_symbol",
        "unsupported_child"
      ]);
      expect(result.error.map((issue) => issue.path)).toEqual([
        ["bad"],
        ["bad"]
      ]);
    }
  });

  test("marks undefinedable object properties as unsupported for JSON Schema", () => {
    const Schema = t.object({
      optionalUndefinedable: t.optional(t.undefinedable(t.string)),
      requiredUndefinedable: t.undefinedable(t.string)
    });

    const result = toJsonSchema(Schema);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.map((issue) => issue.code)).toEqual([
        "unsupported_undefined",
        "unsupported_child",
        "unsupported_undefined",
        "unsupported_child"
      ]);
      expect(result.error.map((issue) => issue.path)).toEqual([
        ["optionalUndefinedable"],
        ["optionalUndefinedable"],
        ["requiredUndefinedable"],
        ["requiredUndefinedable"]
      ]);
    }
  });

  test("exports special object keys as own JSON Schema properties", () => {
    const shape = Object.create(null) as Record<string, Guard<unknown>>;
    defineRecordValue(shape, "__proto__", t.string);
    defineRecordValue(shape, "constructor", t.number);
    defineRecordValue(shape, "hasOwnProperty", t.boolean);
    const Schema = t.strictObject(shape);

    const result = toJsonSchema(Schema);

    expect(result.ok).toBe(true);
    if (result.ok && typeof result.value !== "boolean") {
      const properties = result.value.properties;
      const constructorKey = "constructor";
      const hasOwnPropertyKey = "hasOwnProperty";
      expect(properties).not.toBeUndefined();
      if (properties !== undefined) {
        expect(Object.getPrototypeOf(properties)).toBe(null);
        expect(Object.prototype.hasOwnProperty.call(properties, "__proto__"))
          .toBe(true);
        expect(Object.prototype.hasOwnProperty.call(properties, constructorKey))
          .toBe(true);
        expect(Object.prototype.hasOwnProperty.call(properties, hasOwnPropertyKey))
          .toBe(true);
        expect(properties["__proto__"]).toEqual({ type: "string" });
        expect(properties[constructorKey]).toEqual({ type: "number" });
        expect(properties[hasOwnPropertyKey]).toEqual({ type: "boolean" });
      }
      expect(result.value.required).toEqual([
        "__proto__",
        "constructor",
        "hasOwnProperty"
      ]);
      expect(result.value.additionalProperties).toBe(false);
    }
  });

  test("exports optional presence normalized through nullable wrappers", () => {
    const Schema = t.object({
      maybeNull: t.nullable(t.optional(t.string))
    });

    const result = toJsonSchema(Schema);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {
          maybeNull: {
            anyOf: [
              {
                type: "string"
              },
              {
                type: "null"
              }
            ]
          }
        },
        additionalProperties: true
      });
    }
  });
});
