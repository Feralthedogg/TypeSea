import { describe, expect, expectTypeOf, test } from "vitest";
import { NodeTag } from "../src/kind/index.js";
import type { Graph } from "../src/ir/index.js";
import {
    checkAsync,
    compile,
    compileAsync,
    compileBoolean,
    compileCached,
    createCompileCache,
    isAsync,
    t,
    TypeSeaAssertionError,
    warmup,
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
