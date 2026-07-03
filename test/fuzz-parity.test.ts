import { describe, expect, test } from "vitest";
import { NodeTag } from "../src/kind/index.js";
import {
  compile,
  t,
  type Graph,
  type Guard,
  type Presence
} from "../src/index.js";

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

interface FuzzContext {
  readonly marker: symbol;
}

describe("deterministic schema fuzzing", () => {
  test("keeps generated validators and IR graphs aligned", () => {
    const context: FuzzContext = {
      marker: Symbol("fuzz_marker")
    };
    const schemaRng = new Rng(0x745eaf00);
    const values = makeValues(context);

    for (let schemaIndex = 0; schemaIndex < 64; schemaIndex += 1) {
      const guard = randomGuard(schemaRng, context, 0);
      const name = `fuzz_${String(schemaIndex)}`;
      const fast = compile(guard, { name });

      assertGraphInvariants(name, guard.graph());
      expect(fast.source, name).toContain(`function ${name}`);
      expect(fast.source, name).toContain(`function ${name}_check`);

      for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
        const value = values[valueIndex];
        const label = `${name} value ${String(valueIndex)}`;

        expect(fast.is(value), label).toBe(guard.is(value));
        expect(fast.check(value), label).toEqual(guard.check(value));
      }
    }
  });
});

function randomGuard(
  rng: Rng,
  context: FuzzContext,
  depth: number
): Guard<unknown, Presence> {
  if (depth >= 3) {
    return randomLeafGuard(rng, context);
  }

  switch (rng.nextInt(18)) {
    case 0:
    case 1:
    case 2:
      return randomLeafGuard(rng, context);
    case 3:
      return t.array(randomGuard(rng, context, depth + 1));
    case 4:
      return t.record(randomGuard(rng, context, depth + 1));
    case 5:
      return t.tuple([
        randomGuard(rng, context, depth + 1),
        randomGuard(rng, context, depth + 1)
      ]);
    case 6:
      return randomObjectGuard(rng, context, depth);
    case 7:
      return randomStrictObjectGuard(rng, context, depth);
    case 8:
      return t.union(
        randomGuard(rng, context, depth + 1),
        randomGuard(rng, context, depth + 1)
      );
    case 9:
      return t.optional(randomGuard(rng, context, depth + 1));
    case 10:
      return t.undefinedable(randomGuard(rng, context, depth + 1));
    case 11:
      return t.nullable(randomGuard(rng, context, depth + 1));
    case 12:
      return randomOptionalWrapper(rng);
    case 13:
      return randomDiscriminatedUnion(rng, context, depth);
    case 14:
      return t.intersect(
        randomGuard(rng, context, depth + 1),
        randomGuard(rng, context, depth + 1)
      );
    case 15:
      return t.object({
        a: randomGuard(rng, context, depth + 1),
        b: randomGuard(rng, context, depth + 1)
      }).partial();
    case 16:
      return t.strictObject({
        a: randomGuard(rng, context, depth + 1),
        b: randomGuard(rng, context, depth + 1),
        c: randomGuard(rng, context, depth + 1)
      }).pick(["a", "c"]);
    default:
      return t.number.int().refine((value) => value !== 0, "non_zero");
  }
}

function randomLeafGuard(rng: Rng, context: FuzzContext): Guard<unknown, Presence> {
  switch (rng.nextInt(14)) {
    case 0:
      return t.unknown;
    case 1:
      return t.never;
    case 2:
      return t.string;
    case 3:
      return t.string.min(rng.nextInt(3)).max(3 + rng.nextInt(4));
    case 4:
      return t.string.regex(/^[ab]*$/u, "ab_word");
    case 5:
      return t.string.uuid();
    case 6:
      return t.number;
    case 7:
      return t.number.int().gte(-2).lte(5);
    case 8:
      return t.bigint;
    case 9:
      return t.symbol;
    case 10:
      return t.boolean;
    default:
      return t.literal(randomLiteral(rng, context));
  }
}

function randomOptionalWrapper(rng: Rng): Guard<unknown, Presence> {
  switch (rng.nextInt(7)) {
    case 0:
      return t.optional(t.optional(t.string));
    case 1:
      return t.undefinedable(t.optional(t.string));
    case 2:
      return t.nullable(t.optional(t.string));
    case 3:
      return t.optional(t.undefinedable(t.string));
    case 4:
      return t.optional(t.nullable(t.string));
    case 5:
      return t.optional(t.string).brand<"FuzzBrand">();
    default:
      return t.refine(
        t.optional(t.string),
        (value) => value?.length !== 0,
        "present_non_empty"
      );
  }
}

function randomObjectGuard(
  rng: Rng,
  context: FuzzContext,
  depth: number
): Guard<unknown, Presence> {
  return t.object(randomShape(rng, context, depth));
}

function randomStrictObjectGuard(
  rng: Rng,
  context: FuzzContext,
  depth: number
): Guard<unknown, Presence> {
  return t.strictObject(randomShape(rng, context, depth));
}

function randomShape(
  rng: Rng,
  context: FuzzContext,
  depth: number
): Record<string, Guard<unknown, Presence>> {
  const keys = ["a", "b", "c", "flag"] as const;
  const count = 1 + rng.nextInt(keys.length);
  const shape: Record<string, Guard<unknown, Presence>> = {};
  for (let index = 0; index < count; index += 1) {
    const key = keys[index];
    if (key !== undefined) {
      shape[key] = rng.nextInt(4) === 0
        ? randomOptionalWrapper(rng)
        : randomGuard(rng, context, depth + 1);
    }
  }
  return shape;
}

function randomDiscriminatedUnion(
  rng: Rng,
  context: FuzzContext,
  depth: number
): Guard<unknown, Presence> {
  return t.discriminatedUnion("kind", {
    alpha: t.object({
      kind: t.literal("alpha"),
      value: randomGuard(rng, context, depth + 1)
    }),
    beta: t.object({
      kind: t.literal("beta"),
      flag: t.boolean
    })
  });
}

function randomLiteral(rng: Rng, context: FuzzContext): string | number | bigint | boolean | symbol | null | undefined {
  switch (rng.nextInt(13)) {
    case 0:
      return undefined;
    case 1:
      return null;
    case 2:
      return true;
    case 3:
      return false;
    case 4:
      return "";
    case 5:
      return "alpha";
    case 6:
      return -0;
    case 7:
      return Number.NaN;
    case 8:
      return rng.nextInt(9) - 4;
    case 9:
      return 1n;
    case 10:
      return context.marker;
    default:
      return "beta";
  }
}

function makeValues(context: FuzzContext): readonly unknown[] {
  const rng = new Rng(0x51ea0001);
  const values: unknown[] = [
    undefined,
    null,
    true,
    false,
    "",
    "a",
    "ab",
    "alpha",
    "550e8400-e29b-41d4-a716-446655440000",
    -0,
    0,
    1,
    6,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    1n,
    context.marker,
    Symbol("other"),
    [],
    makeSparseArray(),
    makeAccessorArray(),
    ["a", 1],
    ["alpha", "beta"],
    makeNonEnumerableExtraRecord(),
    makeSymbolExtraRecord(),
    makeAccessorRecord(),
    { kind: "alpha", value: "a" },
    { kind: "alpha", value: undefined },
    { kind: "beta", flag: true },
    { kind: "beta", flag: "true" },
    { a: "a", b: 1, c: null },
    { a: undefined, b: "b" },
    { a: "a", b: 1, extra: true }
  ];

  for (let index = 0; index < 128; index += 1) {
    values.push(randomValue(rng, context, 0));
  }
  return values;
}

function randomValue(
  rng: Rng,
  context: FuzzContext,
  depth: number
): unknown {
  const tag = rng.nextInt(depth >= 3 ? 10 : 15);
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
      return rng.nextInt(13) - 6;
    case 5:
      if (rng.nextInt(5) === 0) {
        return Number.NaN;
      }
      if (rng.nextInt(7) === 0) {
        return rng.nextBool() ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      }
      return rng.nextInt(100) / 10;
    case 6:
      return rng.nextInt(3) === 0 ? 1n : 0n;
    case 7:
      return rng.nextInt(2) === 0 ? context.marker : Symbol("generated");
    case 8:
      return randomArray(rng, context, depth);
    case 9:
      return randomRecord(rng, context, depth);
    case 10:
      return randomSparseArray(rng, context, depth);
    case 11:
      return randomAccessorArray(rng);
    case 12:
      return randomDescriptorRecord(rng, context, depth);
    case 13:
      return randomSymbolRecord(rng, context, depth);
    default:
      return randomTaggedRecord(rng, context, depth);
  }
}

function randomString(rng: Rng): string {
  const alphabet = "abckindalpha beta";
  const length = rng.nextInt(8);
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += alphabet.charAt(rng.nextInt(alphabet.length));
  }
  return value;
}

function randomArray(
  rng: Rng,
  context: FuzzContext,
  depth: number
): unknown[] {
  const length = rng.nextInt(5);
  const value = new Array<unknown>(length);
  for (let index = 0; index < length; index += 1) {
    if (rng.nextInt(7) === 0) {
      continue;
    }
    if (rng.nextInt(11) === 0) {
      Object.defineProperty(value, String(index), {
        configurable: true,
        enumerable: true,
        get(): never {
          throw new Error("fuzz array getter must not execute");
        }
      });
      continue;
    }
    value[index] = randomValue(rng, context, depth + 1);
  }
  return value;
}

function makeSparseArray(): unknown[] {
  const value = new Array<unknown>(3);
  value[1] = "alpha";
  return value;
}

function makeAccessorArray(): unknown[] {
  const value = new Array<unknown>(1);
  Object.defineProperty(value, "0", {
    configurable: true,
    enumerable: true,
    get(): never {
      throw new Error("fuzz fixed array getter must not execute");
    }
  });
  return value;
}

function randomSparseArray(
  rng: Rng,
  context: FuzzContext,
  depth: number
): unknown[] {
  const length = 1 + rng.nextInt(5);
  const value = new Array<unknown>(length);
  for (let index = 0; index < length; index += 1) {
    if (rng.nextBool()) {
      value[index] = randomValue(rng, context, depth + 1);
    }
  }
  return value;
}

function randomAccessorArray(rng: Rng): unknown[] {
  const length = 1 + rng.nextInt(5);
  const value = new Array<unknown>(length);
  const index = rng.nextInt(length);
  Object.defineProperty(value, String(index), {
    configurable: true,
    enumerable: rng.nextBool(),
    get(): never {
      throw new Error("fuzz random array getter must not execute");
    }
  });
  return value;
}

function randomRecord(
  rng: Rng,
  context: FuzzContext,
  depth: number
): Readonly<Record<string, unknown>> {
  const keys = ["a", "b", "c", "flag", "extra"] as const;
  const length = rng.nextInt(keys.length + 1);
  const value: Record<string, unknown> = {};
  for (let index = 0; index < length; index += 1) {
    const key = keys[index];
    if (key !== undefined) {
      value[key] = randomValue(rng, context, depth + 1);
    }
  }
  return value;
}

function makeNonEnumerableExtraRecord(): Readonly<Record<PropertyKey, unknown>> {
  const value: Record<PropertyKey, unknown> = {
    a: "alpha"
  };
  Object.defineProperty(value, "extra", {
    configurable: true,
    enumerable: false,
    value: true
  });
  return value;
}

function makeSymbolExtraRecord(): Readonly<Record<PropertyKey, unknown>> {
  return {
    a: "alpha",
    [Symbol("fuzz_extra")]: true
  };
}

function makeAccessorRecord(): Readonly<Record<PropertyKey, unknown>> {
  const value: Record<PropertyKey, unknown> = {};
  Object.defineProperty(value, "a", {
    configurable: true,
    enumerable: true,
    get(): never {
      throw new Error("fuzz object getter must not execute");
    }
  });
  return value;
}

function randomDescriptorRecord(
  rng: Rng,
  context: FuzzContext,
  depth: number
): Readonly<Record<PropertyKey, unknown>> {
  const value: Record<PropertyKey, unknown> = {
    a: randomValue(rng, context, depth + 1)
  };
  const key = rng.nextBool() ? "extra" : "flag";
  Object.defineProperty(value, key, {
    configurable: true,
    enumerable: rng.nextBool(),
    value: randomValue(rng, context, depth + 1)
  });
  if (rng.nextInt(3) === 0) {
    Object.defineProperty(value, "b", {
      configurable: true,
      enumerable: rng.nextBool(),
      get(): never {
        throw new Error("fuzz descriptor getter must not execute");
      }
    });
  }
  return value;
}

function randomSymbolRecord(
  rng: Rng,
  context: FuzzContext,
  depth: number
): Readonly<Record<PropertyKey, unknown>> {
  const value: Record<PropertyKey, unknown> = {
    a: randomValue(rng, context, depth + 1)
  };
  value[Symbol("fuzz_extra")] = randomValue(rng, context, depth + 1);
  return value;
}

function randomTaggedRecord(
  rng: Rng,
  context: FuzzContext,
  depth: number
): Readonly<Record<string, unknown>> {
  const kind = rng.nextInt(3) === 0 ? "alpha" : rng.nextInt(2) === 0 ? "beta" : "other";
  const value: Record<string, unknown> = {
    kind
  };
  if (kind === "alpha") {
    value["value"] = randomValue(rng, context, depth + 1);
  } else if (kind === "beta") {
    value["flag"] = randomValue(rng, context, depth + 1);
  } else {
    value["extra"] = randomValue(rng, context, depth + 1);
  }
  return value;
}

function assertGraphInvariants(name: string, graph: Graph): void {
  expect(graph.nodes.length, name).toBeGreaterThan(0);
  expect(graph.nodes[graph.entry]?.tag, name).toBe(NodeTag.Start);
  expect(graph.nodes[graph.result]?.tag, name).toBe(NodeTag.Return);

  for (let index = 0; index < graph.nodes.length; index += 1) {
    const node = graph.nodes[index];
    expect(node, `${name} node ${String(index)}`).toBeDefined();
    if (node === undefined) {
      continue;
    }
    expect(node.id, `${name} node id ${String(index)}`).toBe(index);
    const deps = node.deps;
    for (let depIndex = 0; depIndex < deps.length; depIndex += 1) {
      const dep = deps[depIndex];
      expect(dep, `${name} dep ${String(index)}:${String(depIndex)}`).toBeGreaterThanOrEqual(0);
      expect(dep, `${name} dep ${String(index)}:${String(depIndex)}`).toBeLessThan(graph.nodes.length);
    }
  }

  const reachable = markReachable(graph);
  for (let index = 0; index < reachable.length; index += 1) {
    expect(reachable[index], `${name} reachable ${String(index)}`).toBe(true);
  }
}

function markReachable(graph: Graph): readonly boolean[] {
  const reachable = new Array<boolean>(graph.nodes.length).fill(false);
  const stack = [graph.result];
  while (stack.length !== 0) {
    const id = stack.pop();
    if (id === undefined || reachable[id] === true) {
      continue;
    }
    reachable[id] = true;
    const node = graph.nodes[id];
    if (node === undefined) {
      continue;
    }
    const deps = node.deps;
    for (let index = 0; index < deps.length; index += 1) {
      const dep = deps[index];
      if (dep !== undefined) {
        stack.push(dep);
      }
    }
  }
  return reachable;
}
