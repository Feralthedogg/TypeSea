import { describe, expect, expectTypeOf, test } from "vitest";
import { NodeTag } from "../src/kind/index.js";
import {
  compile,
  t,
  TypeSeaAssertionError,
  type Guard,
  type Infer,
  type StringGuard
} from "../src/index.js";

describe("TypeSea core guards", () => {
  test("supports unknown, never, bigint, and symbol primitives", () => {
    const marker = Symbol("marker");

    expectTypeOf<Infer<typeof t.unknown>>().toEqualTypeOf<unknown>();
    expectTypeOf<Infer<typeof t.never>>().toEqualTypeOf<never>();
    expectTypeOf<Infer<typeof t.bigint>>().toEqualTypeOf<bigint>();
    expectTypeOf<Infer<typeof t.symbol>>().toEqualTypeOf<symbol>();

    expect(t.unknown.is({ value: marker })).toBe(true);
    expect(t.never.is(undefined)).toBe(false);
    expect(t.bigint.is(1n)).toBe(true);
    expect(t.bigint.is(1)).toBe(false);
    expect(t.symbol.is(marker)).toBe(true);
    expect(t.literal(marker).is(marker)).toBe(true);
    expect(t.literal(1n).is(1n)).toBe(true);
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
    const Scores = t.record(t.number.gte(0));

    type Pair = Infer<typeof Pair>;
    type Scores = Infer<typeof Scores>;

    expectTypeOf<Pair>().toEqualTypeOf<readonly [string, number]>();
    expectTypeOf<Scores>().toEqualTypeOf<Readonly<Record<string, number>>>();

    expect(Pair.is(["version", 1])).toBe(true);
    expect(Pair.is(["version", 1, "extra"])).toBe(false);
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
  test("hash-conses repeated object predicates in union branches", () => {
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
    const objectTests = graph.nodes.filter((node) => node.tag === NodeTag.IsObject);
    const idLoads = graph.nodes.filter(
      (node) => node.tag === NodeTag.GetProp && node.key === "id"
    );

    expect(objectTests).toHaveLength(1);
    expect(idLoads).toHaveLength(1);
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
