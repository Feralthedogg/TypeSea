import { describe, expect, test } from "vitest";
import { compile, t, type Guard, type Presence } from "../src/index.js";

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

describe("compiled guard parity", () => {
  test("generated is() and check() match interpreter semantics", () => {
    const marker = Symbol("marker");
    const values = makeSamples(marker);

    assertParity("unknown", t.unknown, values);
    assertParity("never", t.never, values);
    assertParity("bigint", t.bigint, values);
    assertParity("symbol", t.symbol, values);
    assertParity("bigint literal", t.literal(1n), values);
    assertParity("symbol literal", t.literal(marker), values);
    assertParity("string bounds", t.string.min(1).max(5), values);
    assertParity("number bounds", t.number.int().gte(-3).lte(10), values);
    assertParity(
      "array object",
      t.array(t.object({
        id: t.string.min(1),
        flag: t.optional(t.boolean)
      })),
      values
    );
    assertParity(
      "record union",
      t.record(t.union(t.string, t.number.int())),
      values
    );
    assertParity("tuple", t.tuple([t.literal("point"), t.number, t.number]), values);
    assertParity(
      "strict nested object",
      t.strictObject({
        kind: t.literal("user"),
        tags: t.array(t.string),
        meta: t.record(t.number.gte(0))
      }),
      values
    );
    assertParity(
      "discriminated union",
      t.discriminatedUnion("kind", {
        a: t.object({ kind: t.literal("a"), value: t.number }),
        b: t.object({ kind: t.literal("b"), label: t.string })
      }),
      values
    );
    assertParity(
      "refinement fallback",
      t.number.int().refine(
        (value) => value % 2 === 0,
        "even"
      ),
      values
    );
  });

  test("rejects strict objects with non-enumerable required keys and enumerable extras", () => {
    const Shape = t.strictObject({
      id: t.string,
      name: t.string
    });
    const FastShape = compile(Shape, { name: "strict_descriptor_shape" });
    const value: Record<string, unknown> = {
      extra: true
    };

    Object.defineProperty(value, "id", {
      configurable: true,
      enumerable: false,
      value: "u-1"
    });
    Object.defineProperty(value, "name", {
      configurable: true,
      enumerable: false,
      value: "Ada"
    });

    expect(Shape.is(value)).toBe(false);
    expect(FastShape.is(value)).toBe(false);
    expect(FastShape.check(value)).toEqual(Shape.check(value));
  });

  test("matches sparse arrays and accessor-backed array slots", () => {
    const MaybeStringArray = t.array(t.undefinedable(t.string));
    const FastMaybeStringArray = compile(MaybeStringArray, {
      name: "maybe_sparse_array"
    });
    const sparse = new Array<unknown>(2);
    sparse[1] = "x";

    expect(MaybeStringArray.is(sparse)).toBe(true);
    expect(FastMaybeStringArray.is(sparse)).toBe(true);
    expect(FastMaybeStringArray.check(sparse)).toEqual(MaybeStringArray.check(sparse));

    const accessor = ["x"];
    Object.defineProperty(accessor, "0", {
      configurable: true,
      enumerable: true,
      get(): never {
        throw new Error("array getter must not execute");
      }
    });

    expect(MaybeStringArray.is(accessor)).toBe(false);
    expect(FastMaybeStringArray.is(accessor)).toBe(false);
    expect(FastMaybeStringArray.check(accessor)).toEqual(MaybeStringArray.check(accessor));
  });

  test("does not reject large valid arrays through an interpreter step budget", () => {
    const Values = t.array(t.string);
    const FastValues = compile(Values, { name: "large_string_array" });
    const value = new Array<string>(1_000_001).fill("x");

    expect(Values.is(value)).toBe(true);
    expect(FastValues.is(value)).toBe(true);
  });

  test("matches accessor-backed optional object keys", () => {
    const Shape = t.object({
      name: t.optional(t.string)
    });
    const FastShape = compile(Shape, { name: "optional_accessor_shape" });
    const value: Record<string, unknown> = {};

    Object.defineProperty(value, "name", {
      configurable: true,
      enumerable: true,
      get(): never {
        throw new Error("object getter must not execute");
      }
    });

    expect(Shape.is(value)).toBe(false);
    expect(FastShape.is(value)).toBe(false);
    expect(FastShape.check(value)).toEqual(Shape.check(value));
  });
});

function assertParity<TValue>(
  name: string,
  guard: Guard<TValue, Presence>,
  values: readonly unknown[]
): void {
  const fast = compile(guard, { name });
  expect(fast.source).not.toContain("ae(");
  expect(fast.source).not.toContain("re(");
  expect(fast.source).toContain(`function ${name.replace(/[^$_a-zA-Z0-9]/gu, "_")}_check`);
  for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
    const value = values[valueIndex];
    expect(fast.is(value), `${name} sample ${String(valueIndex)}`)
      .toBe(guard.is(value));
    expect(fast.check(value), `${name} check sample ${String(valueIndex)}`)
      .toEqual(guard.check(value));
  }
}

function makeSamples(marker: symbol): readonly unknown[] {
  const rng = new Rng(0x745ea);
  const values: unknown[] = [
    undefined,
    null,
    true,
    false,
    "",
    "a",
    "abcdef",
    -4,
    -3,
    0,
    2,
    10,
    11,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    0n,
    1n,
    marker,
    Symbol("other"),
    Number.NaN,
    [],
    ["point", 1, 2],
    ["point", 1],
    { kind: "a", value: 1 },
    { kind: "b", label: "x" },
    { kind: "b", label: 2 },
    { kind: "user", tags: ["x"], meta: { score: 1 } },
    { kind: "user", tags: ["x"], meta: { score: -1 } },
    { kind: "user", tags: ["x"], meta: { score: 1 }, extra: true }
  ];
  for (let index = 0; index < 160; index += 1) {
    values.push(randomValue(rng, 0));
  }
  return values;
}

function randomValue(rng: Rng, depth: number): unknown {
  const tag = rng.nextInt(depth > 2 ? 7 : 9);
  switch (tag) {
    case 0:
      return undefined;
    case 1:
      return null;
    case 2:
      return rng.nextBool();
    case 3:
      return randomString(rng);
    case 4:
      return rng.nextInt(21) - 10;
    case 5:
      if (rng.nextInt(5) === 0) {
        return Number.NaN;
      }
      if (rng.nextInt(7) === 0) {
        return rng.nextBool() ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      }
      return rng.nextInt(100) / 10;
    case 6:
      return randomArray(rng, depth);
    case 7:
      return randomRecord(rng, depth);
    default:
      return randomTaggedRecord(rng, depth);
  }
}

function randomString(rng: Rng): string {
  const alphabet = "abckinduserpoint";
  const length = rng.nextInt(8);
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += alphabet.charAt(rng.nextInt(alphabet.length));
  }
  return value;
}

function randomArray(rng: Rng, depth: number): unknown[] {
  const length = rng.nextInt(5);
  const value = new Array<unknown>(length);
  for (let index = 0; index < length; index += 1) {
    value[index] = randomValue(rng, depth + 1);
  }
  return value;
}

function randomRecord(rng: Rng, depth: number): Readonly<Record<string, unknown>> {
  const length = rng.nextInt(5);
  const value: Record<string, unknown> = {};
  for (let index = 0; index < length; index += 1) {
    value[`k${String(index)}`] = randomValue(rng, depth + 1);
  }
  return value;
}

function randomTaggedRecord(
  rng: Rng,
  depth: number
): Readonly<Record<string, unknown>> {
  const kind = rng.nextInt(3) === 0 ? "a" : rng.nextInt(2) === 0 ? "b" : "user";
  const value: Record<string, unknown> = {
    kind
  };
  if (kind === "a") {
    value["value"] = randomValue(rng, depth + 1);
  } else if (kind === "b") {
    value["label"] = randomValue(rng, depth + 1);
  } else {
    value["tags"] = randomArray(rng, depth + 1);
    value["meta"] = randomRecord(rng, depth + 1);
  }
  return value;
}
