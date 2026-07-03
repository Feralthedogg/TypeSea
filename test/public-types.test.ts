import { describe, expect, expectTypeOf, test } from "vitest";
import {
  compile,
  t,
  type Brand,
  type CheckResult,
  type GuardPresence,
  type GuardValue,
  type Infer,
  type InferAsyncDecoder,
  type InferDecoder,
  type RuntimeValue
} from "../src/index.js";

describe("public type contracts", () => {
  test("preserves object presence, wrappers, brands, arrays, and tuples", () => {
    const UserId = t.string.brand<"UserId">();
    const Shape = t.object({
      id: UserId,
      nickname: t.optional(t.string),
      title: t.undefinedable(t.string),
      maybeTitle: t.undefinedable(t.optional(t.string)),
      maybeNull: t.nullable(t.optional(t.string)),
      maybeRefined: t.refine(
        t.optional(t.string),
        (value) => value === undefined || value.length > 0,
        "present_non_empty"
      ),
      tags: t.array(t.optional(t.number.int())),
      pair: t.tuple([t.literal("id"), UserId])
    });

    type Shape = Infer<typeof Shape>;
    expectTypeOf<Shape>().toEqualTypeOf<{
      readonly id: Brand<string, "UserId">;
      readonly nickname?: string;
      readonly title: string | undefined;
      readonly maybeTitle?: string | undefined;
      readonly maybeNull?: string | null;
      readonly maybeRefined?: string;
      readonly tags: (number | undefined)[];
      readonly pair: readonly ["id", Brand<string, "UserId">];
    }>();
  });

  test("keeps guard helper types and compiled presence stable", () => {
    const OptionalName = t.optional(t.string);
    const FastOptionalName = compile(OptionalName, { name: "optionalName" });
    const result = FastOptionalName.check("Ada");

    expectTypeOf<GuardValue<typeof OptionalName>>().toEqualTypeOf<string>();
    expectTypeOf<GuardPresence<typeof OptionalName>>().toEqualTypeOf<"optional">();
    expectTypeOf<Infer<typeof OptionalName>>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Infer<typeof FastOptionalName>>().toEqualTypeOf<string | undefined>();
    expectTypeOf<typeof result>().toEqualTypeOf<CheckResult<string | undefined>>();
    expectTypeOf<RuntimeValue<string, "optional">>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<RuntimeValue<string, "required">>().toEqualTypeOf<string>();
    expect(result.ok).toBe(true);
  });

  test("preserves union and discriminated union inference", () => {
    const Mixed = t.string.or(t.number.int()).or(t.boolean);
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

    expectTypeOf<Infer<typeof Mixed>>().toEqualTypeOf<string | number | boolean>();
    expectTypeOf<Infer<typeof Event>>().toEqualTypeOf<
      | {
          readonly kind: "user";
          readonly id: string;
        }
      | {
          readonly kind: "order";
          readonly total: number;
        }
    >();
    expect(Mixed.is(true)).toBe(true);
    expect(Event.is({ kind: "order", total: 1 })).toBe(true);
  });

  test("preserves object combinator and intersection inference", () => {
    const Base = t.strictObject({
      id: t.string,
      count: t.number,
      label: t.optional(t.string)
    });
    const Extended = Base.extend({
      count: t.number.int().gte(0),
      active: t.boolean
    });
    const Picked = Extended.pick(["id", "active"]);
    const Omitted = Extended.omit(["label"]);
    const Partial = t.partial(Extended);
    const Intersected = t.intersect(
      t.object({
        id: t.string
      }),
      t.object({
        active: t.boolean
      })
    );

    expectTypeOf<Infer<typeof Extended>>().toEqualTypeOf<{
      readonly id: string;
      readonly count: number;
      readonly label?: string;
      readonly active: boolean;
    }>();
    expectTypeOf<Infer<typeof Picked>>().toEqualTypeOf<{
      readonly id: string;
      readonly active: boolean;
    }>();
    expectTypeOf<Infer<typeof Omitted>>().toEqualTypeOf<{
      readonly id: string;
      readonly count: number;
      readonly active: boolean;
    }>();
    expectTypeOf<Infer<typeof Partial>>().toEqualTypeOf<{
      readonly id?: string;
      readonly count?: number;
      readonly label?: string;
      readonly active?: boolean;
    }>();
    expectTypeOf<Infer<typeof Intersected>>().toEqualTypeOf<
      {
        readonly id: string;
      } & {
        readonly active: boolean;
      }
    >();

    expect(Picked.is({ id: "u", active: true })).toBe(true);
    expect(Omitted.is({ id: "u", count: 1, active: true })).toBe(true);
    expect(Partial.is({})).toBe(true);
    expect(Intersected.is({ id: "u", active: true })).toBe(true);
  });

  test("preserves decoder transform, pipe, and coerce inference", () => {
    const Length = t.transform(t.string.min(1), (value) => value.length);
    const PositiveLength = Length.pipe(t.number.int().gte(1));
    const CoercedCount = t.pipe(t.coerce.number(), t.number.int().gte(0));
    const ParsedFlag = t.coerce.boolean();
    const lengthResult = Length.decode("sea");
    const positiveResult = PositiveLength.decode("sea");
    const countResult = CoercedCount.decode("42");
    const flagResult = ParsedFlag.decode("true");

    expectTypeOf<InferDecoder<typeof Length>>().toEqualTypeOf<number>();
    expectTypeOf<InferDecoder<typeof PositiveLength>>().toEqualTypeOf<number>();
    expectTypeOf<InferDecoder<typeof CoercedCount>>().toEqualTypeOf<number>();
    expectTypeOf<InferDecoder<typeof ParsedFlag>>().toEqualTypeOf<boolean>();
    expectTypeOf<typeof lengthResult>().toEqualTypeOf<CheckResult<number>>();
    expectTypeOf<typeof countResult>().toEqualTypeOf<CheckResult<number>>();

    expect(lengthResult.ok).toBe(true);
    expect(positiveResult.ok).toBe(true);
    expect(countResult.ok).toBe(true);
    expect(flagResult.ok).toBe(true);
  });

  test("preserves async decoder inference", async () => {
    const KnownUser = t.asyncRefine(
      t.string,
      async (value) => await Promise.resolve(value.length > 0),
      "known_user"
    );
    const Length = t.asyncTransform(
      KnownUser,
      async (value) => await Promise.resolve(value.length)
    );
    const PositiveLength = t.asyncPipe(Length, t.number.int().gte(1));
    const result = await PositiveLength.decodeAsync("ada");

    expectTypeOf<InferAsyncDecoder<typeof KnownUser>>().toEqualTypeOf<string>();
    expectTypeOf<InferAsyncDecoder<typeof Length>>().toEqualTypeOf<number>();
    expectTypeOf<InferAsyncDecoder<typeof PositiveLength>>()
      .toEqualTypeOf<number>();
    expectTypeOf<typeof result>().toEqualTypeOf<CheckResult<number>>();
    expect(result.ok).toBe(true);
  });

  test("keeps brands nominal at compile time", () => {
    const UserId = t.string.brand<"UserId">();
    type UserId = Infer<typeof UserId>;
    const branded = "user_1" as UserId;
    const plain: string = branded;

    // @ts-expect-error rejected public type contract: plain string is not a branded UserId.
    const rejected: UserId = "user_1";

    expect(plain).toBe("user_1");
    expect(rejected).toBe("user_1");
  });

  test("rejects invalid builder inputs at compile time", () => {
    const runRejectedExamples = Date.now() < 0;

    if (runRejectedExamples) {
      // @ts-expect-error rejected public API call: union requires one or more guards.
      t.union();

      // @ts-expect-error rejected public API call: literal accepts only primitive literal values.
      t.literal({ value: 1 });

      // @ts-expect-error rejected public API call: array item must be a guard.
      t.array(t.string.schema);

      // @ts-expect-error rejected public API call: object properties must be guards.
      t.object({ broken: undefined });

      // @ts-expect-error rejected public API call: picked keys must exist.
      t.object({ id: t.string }).pick(["missing"]);

      // @ts-expect-error rejected public API call: transform mapper must accept narrowed input.
      t.transform(t.string, (value: number) => value);

      // @ts-expect-error rejected public API call: async predicate must accept narrowed input.
      t.asyncRefine(
        t.string,
        async (value: number) => await Promise.resolve(value > 0),
        "positive"
      );

      t.discriminatedUnion("kind", {
        // @ts-expect-error rejected public API call: case literal must match the case key.
        user: t.object({
          kind: t.literal("order")
        })
      });

      t.discriminatedUnion("kind", {
        // @ts-expect-error rejected public API call: each case must require the discriminant.
        user: t.object({
          id: t.string
        })
      });

      t.discriminatedUnion("kind", {
        // @ts-expect-error rejected public API call: optional discriminants are not dispatch-safe.
        user: t.object({
          kind: t.optional(t.literal("user"))
        })
      });

      t.discriminatedUnion("kind", {
        // @ts-expect-error rejected public API call: each case must infer an object with the discriminant.
        user: t.string
      });
    }

    expect(runRejectedExamples).toBe(false);
  });
});
