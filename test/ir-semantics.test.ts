import { describe, expect, test } from "vitest";
import { isSchema } from "../src/evaluate/index.js";
import { GraphBuilder, type Graph, type GraphNode, type RegexNode } from "../src/ir/index.js";
import { NodeTag } from "../src/kind/index.js";
import { lowerSchema } from "../src/lower/index.js";
import { optimizeGraph } from "../src/optimize/index.js";
import { t, type Guard, type Presence } from "../src/index.js";

interface EvalState {
  readonly graph: Graph;
  readonly input: unknown;
  readonly values: unknown[];
  readonly computed: boolean[];
}

describe("Sea-of-Nodes graph semantics", () => {
  test("matches guard predicates over representative schemas and values", () => {
    const marker = Symbol("marker");
    const recursive = makeRecursiveGuard();
    const schemas: readonly Guard<unknown, Presence>[] = [
      t.unknown,
      t.never,
      t.string.min(1).max(4),
      t.string.regex(/^[ab]+$/u, "ab_word"),
      t.number,
      t.number.int().gte(-2).lte(5),
      t.bigint,
      t.symbol,
      t.boolean,
      t.literal(Number.NaN),
      t.literal(-0),
      t.literal(marker),
      t.array(t.object({
        id: t.string.min(1),
        flag: t.optional(t.boolean)
      })),
      t.tuple([t.literal("point"), t.number, t.number]),
      t.record(t.union(t.string, t.number.int())),
      t.strictObject({
        kind: t.literal("user"),
        tags: t.array(t.string),
        meta: t.record(t.number.gte(0))
      }),
      t.discriminatedUnion("kind", {
        point: t.object({
          kind: t.literal("point"),
          x: t.number,
          y: t.number
        }),
        label: t.object({
          kind: t.literal("label"),
          text: t.string
        })
      }),
      t.undefinedable(t.optional(t.string)),
      t.nullable(t.optional(t.string)),
      t.number.int().refine((value) => value !== 0, "non_zero"),
      recursive
    ];
    const values = makeValues(marker);

    for (let schemaIndex = 0; schemaIndex < schemas.length; schemaIndex += 1) {
      const guard = schemas[schemaIndex];
      expect(guard, `schema ${String(schemaIndex)}`).toBeDefined();
      if (guard === undefined) {
        continue;
      }
      const graph = guard.graph();
      for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
        const value = values[valueIndex];
        expect(
          evaluateGraph(graph, value),
          `schema ${String(schemaIndex)} value ${String(valueIndex)}`
        ).toBe(guard.is(value));
      }
    }
  });

  test("represents strict object extra-key rejection explicitly", () => {
    const Strict = t.strictObject({
      name: t.string,
      count: t.number
    });
    const graph = Strict.graph();

    expect(graph.nodes.some((node) => node.tag === NodeTag.StrictKeys)).toBe(true);
    expect(evaluateGraph(graph, { name: "x", count: 1 })).toBe(true);
    expect(evaluateGraph(graph, { name: "x", count: 1, extra: true })).toBe(false);
  });

  test("freezes graph outputs and rejects malformed optimizer inputs", () => {
    const Strict = t.strictObject({
      name: t.string,
      count: t.number
    });
    const graph = Strict.graph();
    const strictNode = graph.nodes.find((node) => node.tag === NodeTag.StrictKeys);
    const firstNode = graph.nodes[0];
    const mutableNodes = graph.nodes as unknown as GraphNode[];

    expect(Object.isFrozen(graph)).toBe(true);
    expect(Object.isFrozen(graph.nodes)).toBe(true);
    expect(firstNode).not.toBeUndefined();
    if (firstNode !== undefined) {
      const writable = firstNode as unknown as {
        id: number;
      };
      const deps = firstNode.deps as unknown as number[];
      expect(Object.isFrozen(firstNode)).toBe(true);
      expect(Object.isFrozen(firstNode.deps)).toBe(true);
      expect(() => {
        writable.id = 99;
      }).toThrow(TypeError);
      expect(() => {
        deps.push(0);
      }).toThrow(TypeError);
      expect(() => {
        mutableNodes.push(firstNode);
      }).toThrow(TypeError);
    }
    expect(strictNode).not.toBeUndefined();
    if (strictNode?.tag === NodeTag.StrictKeys) {
      const keys = strictNode.keys as unknown as string[];
      expect(Object.isFrozen(strictNode.keys)).toBe(true);
      expect(() => {
        keys.push("extra");
      }).toThrow(TypeError);
    }
    const RegexGuard = t.string.regex(/^x+$/u, "x_word");
    const regexGraph = RegexGuard.graph();
    const regexNode = regexGraph.nodes.find(
      (node): node is RegexNode => node.tag === NodeTag.Regex
    );
    expect(regexNode).not.toBeUndefined();
    if (regexNode !== undefined) {
      expect(Object.isFrozen(regexNode)).toBe(true);
      expect(Object.isExtensible(regexNode.regex)).toBe(false);
      expect(() => {
        Object.defineProperty(regexNode.regex, "exec", {
          value: (): RegExpExecArray | null => null
        });
      }).toThrow(TypeError);
    }
    const looseOptimizeGraph = optimizeGraph as unknown as (
      graph: unknown
    ) => Graph;
    expect(() => looseOptimizeGraph({})).toThrow(TypeError);
    expect(() => looseOptimizeGraph({
      nodes: [],
      entry: 0,
      result: 0
    })).toThrow(TypeError);
    expect(() => looseOptimizeGraph({
      nodes: [
        {
          id: 0,
          tag: NodeTag.Start,
          deps: []
        },
        {
          id: 1,
          tag: NodeTag.Return,
          deps: [0, 2],
          control: 0,
          value: 2
        }
      ],
      entry: 0,
      result: 1
    })).toThrow(TypeError);
    const poisonedRegex = /^x+$/u;
    Object.defineProperty(poisonedRegex, "exec", {
      configurable: true,
      value: (): RegExpExecArray | null => null
    });
    expect(() => looseOptimizeGraph({
      nodes: [
        {
          id: 0,
          tag: NodeTag.Start,
          deps: []
        },
        {
          id: 1,
          tag: NodeTag.Param,
          deps: [],
          name: "input"
        },
        {
          id: 2,
          tag: NodeTag.Regex,
          deps: [1],
          value: 1,
          regex: poisonedRegex,
          name: "poisoned"
        },
        {
          id: 3,
          tag: NodeTag.Return,
          deps: [0, 2],
          control: 0,
          value: 2
        }
      ],
      entry: 0,
      result: 3
    })).toThrow(TypeError);

    const externalRegex = /^x+$/u;
    const validRegexExternal = {
      nodes: [
        {
          id: 0,
          tag: NodeTag.Start,
          deps: []
        },
        {
          id: 1,
          tag: NodeTag.Param,
          deps: [],
          name: "input"
        },
        {
          id: 2,
          tag: NodeTag.Regex,
          deps: [1],
          value: 1,
          regex: externalRegex,
          name: "external"
        },
        {
          id: 3,
          tag: NodeTag.Return,
          deps: [0, 2],
          control: 0,
          value: 2
        }
      ],
      entry: 0,
      result: 3
    } as unknown as Graph;
    const optimizedRegex = optimizeGraph(validRegexExternal);
    const frozenExternalRegexNode = validRegexExternal.nodes[2] as
      | RegexNode
      | undefined;
    const optimizedRegexNode = optimizedRegex.nodes.find(
      (node): node is RegexNode => node.tag === NodeTag.Regex
    );

    expect(frozenExternalRegexNode).not.toBeUndefined();
    if (frozenExternalRegexNode !== undefined) {
      expect(frozenExternalRegexNode.regex).not.toBe(externalRegex);
      expect(Object.isExtensible(frozenExternalRegexNode.regex)).toBe(false);
    }
    expect(optimizedRegexNode).not.toBeUndefined();
    if (optimizedRegexNode !== undefined) {
      expect(Object.isExtensible(optimizedRegexNode.regex)).toBe(false);
    }
    expect(evaluateGraph(optimizedRegex, "xxx")).toBe(true);
    expect(evaluateGraph(optimizedRegex, "yyy")).toBe(false);

    const validExternal = {
      nodes: [
        {
          id: 0,
          tag: NodeTag.Start,
          deps: []
        },
        {
          id: 1,
          tag: NodeTag.Const,
          deps: [],
          value: true
        },
        {
          id: 2,
          tag: NodeTag.Return,
          deps: [0, 1],
          control: 0,
          value: 1
        }
      ],
      entry: 0,
      result: 2
    } as unknown as Graph;
    const optimized = optimizeGraph(validExternal);

    expect(Object.isFrozen(validExternal)).toBe(true);
    expect(Object.isFrozen(validExternal.nodes)).toBe(true);
    expect(Object.isFrozen(validExternal.nodes[0])).toBe(true);
    expect(Object.isFrozen(optimized)).toBe(true);
    expect(Object.isFrozen(optimized.nodes)).toBe(true);
    assertDenseGraph(optimized);
  });

  test("folds constant boolean branches and removes dead predicates", () => {
    const builder = new GraphBuilder();
    const entry = builder.start();
    const input = builder.param("input");
    const deadPredicate = builder.regex(input, /^expensive$/u, "dead");
    const alwaysFalse = builder.or([
      builder.constant(false),
      builder.constant(false)
    ]);
    const result = builder.and([
      builder.constant(true),
      alwaysFalse,
      deadPredicate
    ]);
    const ret = builder.ret(entry, result);
    const optimized = optimizeGraph(builder.finish(entry, ret));

    assertDenseGraph(optimized);
    expect(evaluateGraph(optimized, "expensive")).toBe(false);
    expect(optimized.nodes.map((node) => node.tag)).toEqual([
      NodeTag.Start,
      NodeTag.Const,
      NodeTag.Return
    ]);
  });

  test("preserves lowered schema semantics while folding identities", () => {
    const Guard = t.union(t.never, t.literal("x"));
    const raw = lowerSchema(Guard.schema);
    const optimized = optimizeGraph(raw);
    const values: readonly unknown[] = ["x", "y", undefined, null];

    assertDenseGraph(optimized);
    expect(raw.nodes.some((node) => node.tag === NodeTag.Or)).toBe(true);
    expect(optimized.nodes.some((node) => node.tag === NodeTag.Or)).toBe(false);

    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      expect(evaluateGraph(optimized, value), `value ${String(index)}`)
        .toBe(evaluateGraph(raw, value));
      expect(evaluateGraph(optimized, value), `guard ${String(index)}`)
        .toBe(Guard.is(value));
    }
  });

  test("keeps delimiter-containing regex intern keys distinct", () => {
    const Guard = t.string.regex(/a/g, ":x").regex(/a:g/, "x");
    const graph = Guard.graph();
    const regexNodes = graph.nodes.filter(
      (node): node is RegexNode => node.tag === NodeTag.Regex
    );

    expect(regexNodes).toHaveLength(2);
    expect(Guard.is("a")).toBe(false);
    expect(evaluateGraph(graph, "a")).toBe(false);
    expect(evaluateGraph(graph, "a:g")).toBe(true);
  });

  test("rejects accessor-backed external graph nodes before optimization", () => {
    const looseOptimizeGraph = optimizeGraph as unknown as (
      graph: unknown
    ) => Graph;
    let reads = 0;
    const returnNode = {
      id: 2,
      tag: NodeTag.Return,
      deps: [0, 1],
      control: 0,
      get value(): number {
        reads += 1;
        return reads === 1 ? 1 : 0;
      }
    };

    expect(() => looseOptimizeGraph({
      nodes: [
        {
          id: 0,
          tag: NodeTag.Start,
          deps: []
        },
        {
          id: 1,
          tag: NodeTag.Const,
          deps: [],
          value: true
        },
        returnNode
      ],
      entry: 0,
      result: 2
    })).toThrow(TypeError);
    expect(reads).toBe(0);
  });
});

function makeRecursiveGuard(): Guard<unknown, Presence> {
  interface Tree {
    readonly value: string;
    readonly children: readonly Tree[];
  }

  const TreeGuard: Guard<Tree> = t.lazy((): Guard<Tree> =>
    t.object({
      value: t.string.min(1),
      children: t.array(TreeGuard)
    })
  );
  return TreeGuard;
}

function makeValues(marker: symbol): readonly unknown[] {
  const cyclicTree: {
    value: string;
    children: unknown[];
  } = {
    value: "root",
    children: []
  };
  cyclicTree.children.push(cyclicTree);

  return [
    undefined,
    null,
    true,
    false,
    "",
    "a",
    "abcd",
    "abcde",
    -2,
    -0,
    0,
    1,
    5,
    6,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1n,
    marker,
    Symbol("other"),
    [],
    ["point", 1, 2],
    ["point", 1],
    { id: "x", flag: true },
    [{ id: "x" }, { id: "y", flag: false }],
    [{ id: "" }],
    { kind: "user", tags: ["x"], meta: { score: 1 } },
    { kind: "user", tags: ["x"], meta: { score: -1 } },
    { kind: "user", tags: ["x"], meta: { score: 1 }, extra: true },
    { kind: "point", x: 1, y: 2 },
    { kind: "label", text: "name" },
    { kind: "label", text: 1 },
    { a: "x", b: 1 },
    { a: null },
    cyclicTree
  ];
}

function evaluateGraph(graph: Graph, input: unknown): boolean {
  const state: EvalState = {
    graph,
    input,
    values: new Array<unknown>(graph.nodes.length),
    computed: new Array<boolean>(graph.nodes.length).fill(false)
  };
  return evaluateNode(state, graph.result) === true;
}

function evaluateNode(state: EvalState, id: number): unknown {
  if (state.computed[id] === true) {
    return state.values[id];
  }
  const node = state.graph.nodes[id];
  expect(node, `node ${String(id)}`).toBeDefined();
  if (node === undefined) {
    return undefined;
  }
  const value = evaluateGraphNode(state, node);
  state.values[id] = value;
  state.computed[id] = true;
  return value;
}

function evaluateGraphNode(state: EvalState, node: GraphNode): unknown {
  switch (node.tag) {
    case NodeTag.Start:
      return true;
    case NodeTag.Param:
      return state.input;
    case NodeTag.Const:
      return node.value;
    case NodeTag.GetProp:
      return readProperty(evaluateNode(state, node.object), node.key);
    case NodeTag.IsString:
      return typeof evaluateNode(state, node.value) === "string";
    case NodeTag.IsNumber:
      return isFiniteNumber(evaluateNode(state, node.value));
    case NodeTag.IsBoolean:
      return typeof evaluateNode(state, node.value) === "boolean";
    case NodeTag.IsBigInt:
      return typeof evaluateNode(state, node.value) === "bigint";
    case NodeTag.IsSymbol:
      return typeof evaluateNode(state, node.value) === "symbol";
    case NodeTag.IsObject:
      return isPlainObject(evaluateNode(state, node.value));
    case NodeTag.IsArray:
      return Array.isArray(evaluateNode(state, node.value));
    case NodeTag.IsUndefined:
      return evaluateNode(state, node.value) === undefined;
    case NodeTag.IsNull:
      return evaluateNode(state, node.value) === null;
    case NodeTag.IsInteger:
      return Number.isInteger(evaluateNode(state, node.value));
    case NodeTag.Not:
      return evaluateNode(state, node.value) !== true;
    case NodeTag.Equals:
      return Object.is(
        evaluateNode(state, node.left),
        evaluateNode(state, node.right)
      );
    case NodeTag.Gte:
      return compareNumbers(
        evaluateNode(state, node.left),
        evaluateNode(state, node.right),
        "gte"
      );
    case NodeTag.Lte:
      return compareNumbers(
        evaluateNode(state, node.left),
        evaluateNode(state, node.right),
        "lte"
      );
    case NodeTag.StringMin:
      return stringLengthAtLeast(evaluateNode(state, node.value), node.bound);
    case NodeTag.StringMax:
      return stringLengthAtMost(evaluateNode(state, node.value), node.bound);
    case NodeTag.Regex:
      return regexMatches(evaluateNode(state, node.value), node.regex);
    case NodeTag.HasOwn:
      return hasOwn(evaluateNode(state, node.object), node.key);
    case NodeTag.StrictKeys:
      return hasOnlyKnownKeys(evaluateNode(state, node.object), node.keys);
    case NodeTag.ArrayEvery:
      return arrayEvery(evaluateNode(state, node.value), node.item);
    case NodeTag.SchemaCheck:
      return isSchema(node.schema, evaluateNode(state, node.value));
    case NodeTag.And:
      return evaluateAnd(state, node.values);
    case NodeTag.Or:
      return evaluateOr(state, node.values);
    case NodeTag.Return:
      evaluateNode(state, node.control);
      return evaluateNode(state, node.value);
  }
}

function isFiniteNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readProperty(value: unknown, key: string): unknown {
  if ((typeof value === "object" && value !== null) || typeof value === "function") {
    return (value as Readonly<Record<string, unknown>>)[key];
  }
  return undefined;
}

function compareNumbers(left: unknown, right: unknown, mode: "gte" | "lte"): boolean {
  if (typeof left !== "number" || typeof right !== "number") {
    return false;
  }
  if (mode === "gte") {
    return left >= right;
  }
  return left <= right;
}

function stringLengthAtLeast(value: unknown, bound: number): boolean {
  return typeof value === "string" && value.length >= bound;
}

function stringLengthAtMost(value: unknown, bound: number): boolean {
  return typeof value === "string" && value.length <= bound;
}

function regexMatches(value: unknown, regex: RegExp): boolean {
  if (typeof value !== "string") {
    return false;
  }
  regex.lastIndex = 0;
  return regex.test(value);
}

function hasOwn(value: unknown, key: string): boolean {
  if ((typeof value !== "object" || value === null) && typeof value !== "function") {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasOnlyKnownKeys(value: unknown, keys: readonly string[]): boolean {
  if (!isPlainObject(value)) {
    return false;
  }
  const present = Reflect.ownKeys(value);
  for (let index = 0; index < present.length; index += 1) {
    const key = present[index];
    if (typeof key !== "string" || !keys.includes(key)) {
      return false;
    }
  }
  return true;
}

function arrayEvery(value: unknown, schema: Parameters<typeof isSchema>[0]): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!isSchema(schema, value[index])) {
      return false;
    }
  }
  return true;
}

function evaluateAnd(state: EvalState, values: readonly number[]): boolean {
  for (let index = 0; index < values.length; index += 1) {
    const id = values[index];
    if (id === undefined || evaluateNode(state, id) !== true) {
      return false;
    }
  }
  return true;
}

function evaluateOr(state: EvalState, values: readonly number[]): boolean {
  for (let index = 0; index < values.length; index += 1) {
    const id = values[index];
    if (id !== undefined && evaluateNode(state, id) === true) {
      return true;
    }
  }
  return false;
}

function assertDenseGraph(graph: Graph): void {
  expect(graph.nodes[graph.entry]?.tag).toBe(NodeTag.Start);
  expect(graph.nodes[graph.result]?.tag).toBe(NodeTag.Return);
  for (let index = 0; index < graph.nodes.length; index += 1) {
    const node = graph.nodes[index];
    expect(node, `node ${String(index)}`).toBeDefined();
    if (node === undefined) {
      continue;
    }
    expect(node.id, `node id ${String(index)}`).toBe(index);
    const deps = node.deps;
    for (let depIndex = 0; depIndex < deps.length; depIndex += 1) {
      const dep = deps[depIndex];
      expect(dep, `dep ${String(index)}:${String(depIndex)}`).toBeGreaterThanOrEqual(0);
      expect(dep, `dep ${String(index)}:${String(depIndex)}`).toBeLessThan(graph.nodes.length);
    }
  }
}
