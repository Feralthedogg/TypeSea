import { describe, expect, test } from "vitest";
import { isSchema } from "../src/evaluate/index.js";
import {
    GraphBuilder,
    type Graph,
    type GraphNode,
    type ObjectShapeEntry,
    type RegexNode
} from "../src/ir/index.js";
import { NodeTag, ObjectModeTag, PresenceTag } from "../src/kind/index.js";
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
    test("rejects graph records backed by prototype state", () => {
        const graph = t.string.graph();
        let rootReads = 0;
        const inheritedRoot = Object.create({
            get nodes(): unknown {
                rootReads += 1;
                return graph.nodes;
            },
            entry: graph.entry,
            result: graph.result
        }) as unknown as Graph;

        expect(() => optimizeGraph(inheritedRoot)).toThrow(TypeError);
        expect(rootReads).toBe(0);

        let nodeReads = 0;
        const inheritedNode: unknown = Object.create({
            id: 0,
            get tag(): unknown {
                nodeReads += 1;
                return NodeTag.Start;
            },
            deps: []
        });
        const nodes = graph.nodes.slice() as unknown[];
        nodes[0] = inheritedNode;
        const inheritedNodeGraph = {
            nodes,
            entry: graph.entry,
            result: graph.result
        } as unknown as Graph;

        expect(() => optimizeGraph(inheritedNodeGraph)).toThrow(TypeError);
        expect(nodeReads).toBe(0);
    });

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

        expect(graph.nodes.some((node) => node.tag === NodeTag.ObjectShape)).toBe(true);
        expect(graph.nodes.some((node) => node.tag === NodeTag.StrictKeys)).toBe(false);
        expect(graph.nodes.some((node) => node.tag === NodeTag.GetProp)).toBe(false);
        expect(graph.nodes.some((node) => node.tag === NodeTag.HasOwnData)).toBe(false);
        const shape = graph.nodes.find((node) => node.tag === NodeTag.ObjectShape);
        if (shape?.tag === NodeTag.ObjectShape) {
            expect(shape.entries).toHaveLength(2);
            const nameEntry = shape.entries[0];
            const countEntry = shape.entries[1];
            expect(nameEntry).toBeDefined();
            expect(countEntry).toBeDefined();
            if (nameEntry !== undefined && countEntry !== undefined) {
                expect(evaluateGraph(nameEntry.graph, "x")).toBe(true);
                expect(evaluateGraph(countEntry.graph, 1)).toBe(true);
            }
        }
        expect(evaluateGraph(graph, { name: "x", count: 1 })).toBe(true);
        expect(evaluateGraph(graph, { name: "x", count: 1, extra: true })).toBe(false);
    });

    test("lowers tuple and record schemas into native IR nodes", () => {
        const ArrayGuard = t.array(t.string.min(1));
        const Tuple = t.tuple([t.literal("point"), t.number]);
        const Record = t.record(t.string);
        const arrayGraph = ArrayGuard.graph();
        const tupleGraph = Tuple.graph();
        const recordGraph = Record.graph();
        const arrayNode = arrayGraph.nodes.find(
            (node) => node.tag === NodeTag.ArrayEvery
        );
        const tupleNode = tupleGraph.nodes.find(
            (node) => node.tag === NodeTag.TupleItems
        );
        const recordNode = recordGraph.nodes.find(
            (node) => node.tag === NodeTag.RecordEvery
        );

        expect(arrayNode?.tag).toBe(NodeTag.ArrayEvery);
        expect(tupleGraph.nodes.some((node) => node.tag === NodeTag.TupleItems)).toBe(true);
        expect(recordGraph.nodes.some((node) => node.tag === NodeTag.RecordEvery)).toBe(true);
        expect(tupleGraph.nodes.some((node) => node.tag === NodeTag.SchemaCheck)).toBe(false);
        expect(recordGraph.nodes.some((node) => node.tag === NodeTag.SchemaCheck)).toBe(false);
        if (arrayNode?.tag === NodeTag.ArrayEvery) {
            expect(arrayNode.itemGraph.nodes.some((node) => node.tag === NodeTag.StringMin))
                .toBe(true);
            expect(evaluateGraph(arrayNode.itemGraph, "")).toBe(false);
            expect(evaluateGraph(arrayNode.itemGraph, "x")).toBe(true);
        }
        if (tupleNode?.tag === NodeTag.TupleItems) {
            expect(tupleNode.itemGraphs).toHaveLength(2);
            const literalGraph = tupleNode.itemGraphs[0];
            const numberGraph = tupleNode.itemGraphs[1];
            expect(literalGraph).toBeDefined();
            expect(numberGraph).toBeDefined();
            if (literalGraph !== undefined && numberGraph !== undefined) {
                expect(evaluateGraph(literalGraph, "point")).toBe(true);
                expect(evaluateGraph(numberGraph, 1)).toBe(true);
            }
        }
        if (recordNode?.tag === NodeTag.RecordEvery) {
            expect(evaluateGraph(recordNode.itemGraph, "x")).toBe(true);
            expect(evaluateGraph(recordNode.itemGraph, 1)).toBe(false);
        }
        expect(evaluateGraph(arrayGraph, ["x", "y"])).toBe(true);
        expect(evaluateGraph(arrayGraph, [""])).toBe(false);
        expect(evaluateGraph(tupleGraph, ["point", 1])).toBe(true);
        expect(evaluateGraph(recordGraph, { a: "x", b: "y" })).toBe(true);
    });

    test("lowers discriminated unions into dispatch IR nodes", () => {
        const Union = t.discriminatedUnion("kind", {
            point: t.object({
                kind: t.literal("point"),
                x: t.number
            }),
            label: t.object({
                kind: t.literal("label"),
                text: t.string
            })
        });
        const graph = Union.graph();

        expect(graph.nodes.some((node) => node.tag === NodeTag.DiscriminantDispatch))
            .toBe(true);
        expect(graph.nodes.some((node) => node.tag === NodeTag.Or)).toBe(false);
        expect(evaluateGraph(graph, { kind: "point", x: 1 })).toBe(true);
        expect(evaluateGraph(graph, { kind: "label", text: "x" })).toBe(true);
        expect(evaluateGraph(graph, { kind: "point", text: "x" })).toBe(false);
    });

    test("freezes graph outputs and rejects malformed optimizer inputs", () => {
        const Strict = t.strictObject({
            name: t.string,
            count: t.number
        });
        const graph = Strict.graph();
        const shapeNode = graph.nodes.find((node) => node.tag === NodeTag.ObjectShape);
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
        expect(shapeNode).not.toBeUndefined();
        if (shapeNode?.tag === NodeTag.ObjectShape) {
            const keys = shapeNode.keys as unknown as string[];
            const entries = shapeNode.entries as unknown as object[];
            expect(Object.isFrozen(shapeNode.keys)).toBe(true);
            expect(Object.isFrozen(shapeNode.entries)).toBe(true);
            expect(Object.isFrozen(shapeNode.entries[0])).toBe(true);
            expect(() => {
                keys.push("extra");
            }).toThrow(TypeError);
            expect(() => {
                entries.push({});
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

    test("applies algebraic boolean simplification before compaction", () => {
        const absorbedAnd = optimizeGraph(makeAbsorbedAndGraph());
        const absorbedOr = optimizeGraph(makeAbsorbedOrGraph());
        const contradiction = optimizeGraph(makeContradictionGraph());
        const tautology = optimizeGraph(makeTautologyGraph());
        const values: readonly unknown[] = ["x", "y", 1];

        assertDenseGraph(absorbedAnd);
        assertDenseGraph(absorbedOr);
        assertDenseGraph(contradiction);
        assertDenseGraph(tautology);
        expect(absorbedAnd.nodes.some((node) => node.tag === NodeTag.Regex))
            .toBe(false);
        expect(absorbedAnd.nodes.some((node) => node.tag === NodeTag.Or))
            .toBe(false);
        expect(absorbedOr.nodes.some((node) => node.tag === NodeTag.Regex))
            .toBe(false);
        expect(absorbedOr.nodes.some((node) => node.tag === NodeTag.And))
            .toBe(false);
        expect(hasConstFalseResult(contradiction)).toBe(true);
        expect(hasConstTrueResult(tautology)).toBe(true);

        for (let index = 0; index < values.length; index += 1) {
            const value = values[index];
            expect(evaluateGraph(absorbedAnd, value)).toBe(typeof value === "string");
            expect(evaluateGraph(absorbedOr, value)).toBe(typeof value === "string");
            expect(evaluateGraph(contradiction, value)).toBe(false);
            expect(evaluateGraph(tautology, value)).toBe(true);
        }
    });

    test("preserves lowered schema semantics while folding identities", () => {
        const Guard = t.union(t.never, t.literal("x"));
        const raw = lowerSchema(Guard.schema);
        const optimized = optimizeGraph(raw);
        const values: readonly unknown[] = ["x", "y", undefined, null];

        assertDenseGraph(optimized);
        expect(raw.nodes.some((node) => node.tag === NodeTag.PrimitiveUnion)).toBe(true);
        expect(optimized.nodes.some((node) => node.tag === NodeTag.Or)).toBe(false);
        const primitive = optimized.nodes.find(
            (node) => node.tag === NodeTag.PrimitiveUnion
        );
        expect(primitive?.tag).toBe(NodeTag.PrimitiveUnion);
        if (primitive?.tag === NodeTag.PrimitiveUnion) {
            expect(primitive.graphs).toHaveLength(1);
            expect(primitive.masks).toHaveLength(1);
            expect(primitive.masks[0]).not.toBe(0);
        }

        for (let index = 0; index < values.length; index += 1) {
            const value = values[index];
            expect(evaluateGraph(optimized, value), `value ${String(index)}`)
                .toBe(evaluateGraph(raw, value));
            expect(evaluateGraph(optimized, value), `guard ${String(index)}`)
                .toBe(Guard.is(value));
        }
    });

    test("collapses union dispatches with only dead arms", () => {
        const Guard = t.union(t.never, t.never);
        const graph = Guard.graph();

        assertDenseGraph(graph);
        expect(hasConstFalseResult(graph)).toBe(true);
        expect(graph.nodes.some((node) => node.tag === NodeTag.UnionDispatch))
            .toBe(false);
        expect(graph.nodes.some((node) => node.tag === NodeTag.PrimitiveUnion))
            .toBe(false);
        expect(evaluateGraph(graph, "x")).toBe(false);
        expect(evaluateGraph(graph, undefined)).toBe(false);
    });

    test("lowers pure primitive unions to primitive dispatch", () => {
        const Guard = t.union(
            t.string.min(1),
            t.number.int(),
            t.boolean
        );
        const graph = Guard.graph();
        const values: readonly unknown[] = ["x", "", 1, 1.5, true, null, {}];

        assertDenseGraph(graph);
        expect(graph.nodes.some((node) => node.tag === NodeTag.PrimitiveUnion))
            .toBe(true);
        expect(graph.nodes.some((node) => node.tag === NodeTag.UnionDispatch))
            .toBe(false);

        for (let index = 0; index < values.length; index += 1) {
            const value = values[index];
            expect(evaluateGraph(graph, value), `value ${String(index)}`)
                .toBe(Guard.is(value));
        }
    });

    test("specializes union child graphs with dispatch-domain facts", () => {
        const Guard = t.union(
            t.string,
            t.boolean,
            t.number
        );
        const graph = Guard.graph();
        const primitive = graph.nodes.find(
            (node) => node.tag === NodeTag.PrimitiveUnion
        );
        const callable = (): string => "x";

        expect(primitive?.tag).toBe(NodeTag.PrimitiveUnion);
        if (primitive?.tag === NodeTag.PrimitiveUnion) {
            const stringGraph = primitive.graphs[0];
            const booleanGraph = primitive.graphs[1];
            const numberGraph = primitive.graphs[2];

            expect(stringGraph).toBeDefined();
            expect(booleanGraph).toBeDefined();
            expect(numberGraph).toBeDefined();
            if (stringGraph !== undefined &&
                booleanGraph !== undefined &&
                numberGraph !== undefined) {
                expect(hasConstTrueResult(stringGraph)).toBe(true);
                expect(hasConstTrueResult(booleanGraph)).toBe(true);
                expect(hasConstTrueResult(numberGraph)).toBe(false);
            }
        }

        expect(evaluateGraph(graph, "x")).toBe(true);
        expect(evaluateGraph(graph, true)).toBe(true);
        expect(evaluateGraph(graph, 1)).toBe(true);
        expect(evaluateGraph(graph, Number.NaN)).toBe(false);
        expect(evaluateGraph(graph, callable)).toBe(false);
        expect(Guard.is(callable)).toBe(false);
    });

    test("absorbs container guards into iteration-domain nodes", () => {
        const ArrayGuard = t.array(t.string);
        const TupleGuard = t.tuple([t.string, t.number]);
        const RecordGuard = t.record(t.string);
        const arrayGraph = ArrayGuard.graph();
        const tupleGraph = TupleGuard.graph();
        const recordGraph = RecordGuard.graph();
        const values: readonly unknown[] = [
            ["x"],
            ["x", 1],
            [1],
            [],
            { name: "x" },
            { name: 1 },
            "x",
            null
        ];

        expect(arrayGraph.nodes.some((node) => node.tag === NodeTag.IsArray))
            .toBe(false);
        expect(tupleGraph.nodes.some((node) => node.tag === NodeTag.IsArray))
            .toBe(false);
        expect(recordGraph.nodes.some((node) => node.tag === NodeTag.IsObject))
            .toBe(false);
        expect(arrayGraph.nodes.some((node) => node.tag === NodeTag.ArrayEvery))
            .toBe(true);
        expect(tupleGraph.nodes.some((node) => node.tag === NodeTag.TupleItems))
            .toBe(true);
        expect(recordGraph.nodes.some((node) => node.tag === NodeTag.RecordEvery))
            .toBe(true);

        for (let index = 0; index < values.length; index += 1) {
            const value = values[index];
            expect(evaluateGraph(arrayGraph, value), `array ${String(index)}`)
                .toBe(ArrayGuard.is(value));
            expect(evaluateGraph(tupleGraph, value), `tuple ${String(index)}`)
                .toBe(TupleGuard.is(value));
            expect(evaluateGraph(recordGraph, value), `record ${String(index)}`)
                .toBe(RecordGuard.is(value));
        }
    });

    test("specializes raw iteration-domain graphs without changing semantics", () => {
        const arrayGraph = makeArrayIterationDomainGraph();
        const tupleGraph = makeTupleIterationDomainGraph();
        const recordGraph = makeRecordIterationDomainGraph();
        const optimizedArray = optimizeGraph(arrayGraph);
        const optimizedTuple = optimizeGraph(tupleGraph);
        const optimizedRecord = optimizeGraph(recordGraph);
        const values: readonly unknown[] = [
            ["x"],
            ["x", 1],
            [1],
            [],
            { name: "x" },
            { name: 1 },
            "x",
            null
        ];

        expect(optimizedArray.nodes.some((node) => node.tag === NodeTag.IsArray))
            .toBe(false);
        expect(optimizedTuple.nodes.some((node) => node.tag === NodeTag.IsArray))
            .toBe(false);
        expect(optimizedRecord.nodes.some((node) => node.tag === NodeTag.IsObject))
            .toBe(false);
        expect(optimizedArray.nodes.some((node) => node.tag === NodeTag.ArrayEvery))
            .toBe(true);
        expect(optimizedTuple.nodes.some((node) => node.tag === NodeTag.TupleItems))
            .toBe(true);
        expect(optimizedRecord.nodes.some((node) => node.tag === NodeTag.RecordEvery))
            .toBe(true);

        for (let index = 0; index < values.length; index += 1) {
            const value = values[index];
            expect(evaluateGraph(optimizedArray, value), `array ${String(index)}`)
                .toBe(evaluateGraph(arrayGraph, value));
            expect(evaluateGraph(optimizedTuple, value), `tuple ${String(index)}`)
                .toBe(evaluateGraph(tupleGraph, value));
            expect(evaluateGraph(optimizedRecord, value), `record ${String(index)}`)
                .toBe(evaluateGraph(recordGraph, value));
        }
    });

    test("canonicalizes dominated scalar bounds for V8-friendly predicates", () => {
        const StringGuard = t.string.min(1).min(4).max(16).max(8);
        const NumberGuard = t.number.gte(0).gte(5).lte(16).lte(8).int();
        const stringGraph = StringGuard.graph();
        const numberGraph = NumberGuard.graph();

        expect(readStringMinBounds(stringGraph)).toEqual([4]);
        expect(readStringMaxBounds(stringGraph)).toEqual([8]);
        expect(readNumericBounds(numberGraph, NodeTag.Gte)).toEqual([5]);
        expect(readNumericBounds(numberGraph, NodeTag.Lte)).toEqual([8]);
        expect(numberGraph.nodes.some((node) => node.tag === NodeTag.IsNumber))
            .toBe(false);
        expect(numberGraph.nodes.some((node) => node.tag === NodeTag.IsInteger))
            .toBe(true);

        expect(evaluateGraph(stringGraph, "abc")).toBe(false);
        expect(evaluateGraph(stringGraph, "abcd")).toBe(true);
        expect(evaluateGraph(stringGraph, "abcdefghi")).toBe(false);
        expect(evaluateGraph(numberGraph, 4)).toBe(false);
        expect(evaluateGraph(numberGraph, 5)).toBe(true);
        expect(evaluateGraph(numberGraph, 8)).toBe(true);
        expect(evaluateGraph(numberGraph, 9)).toBe(false);
    });

    test("folds impossible scalar ranges to false", () => {
        const StringGuard = t.string.min(5).max(2);
        const NumberGuard = t.number.gte(9).lte(3);
        const stringGraph = StringGuard.graph();
        const numberGraph = NumberGuard.graph();

        assertDenseGraph(stringGraph);
        assertDenseGraph(numberGraph);
        expect(hasConstFalseResult(stringGraph)).toBe(true);
        expect(hasConstFalseResult(numberGraph)).toBe(true);
        expect(stringGraph.nodes.some((node) => node.tag === NodeTag.StringMin))
            .toBe(false);
        expect(stringGraph.nodes.some((node) => node.tag === NodeTag.StringMax))
            .toBe(false);
        expect(numberGraph.nodes.some((node) => node.tag === NodeTag.Gte))
            .toBe(false);
        expect(numberGraph.nodes.some((node) => node.tag === NodeTag.Lte))
            .toBe(false);
        expect(evaluateGraph(stringGraph, "abcdef")).toBe(false);
        expect(evaluateGraph(numberGraph, 10)).toBe(false);
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

/**
 * @brief Build recursive guard.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Build values.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Read string min bounds.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function readStringMinBounds(graph: Graph): readonly number[] {
    return readStringBounds(graph, NodeTag.StringMin);
}

/**
 * @brief Read string max bounds.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function readStringMaxBounds(graph: Graph): readonly number[] {
    return readStringBounds(graph, NodeTag.StringMax);
}

/**
 * @brief Read string bounds.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function readStringBounds(
    graph: Graph,
    tag: typeof NodeTag.StringMin | typeof NodeTag.StringMax
): readonly number[] {
    const bounds: number[] = [];
    for (let index = 0; index < graph.nodes.length; index += 1) {
        const node = graph.nodes[index];
        if (node?.tag === tag) {
            bounds.push(node.bound);
        }
    }
    return bounds;
}

/**
 * @brief Read numeric bounds.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function readNumericBounds(
    graph: Graph,
    tag: typeof NodeTag.Gte | typeof NodeTag.Lte
): readonly number[] {
    const bounds: number[] = [];
    for (let index = 0; index < graph.nodes.length; index += 1) {
        const node = graph.nodes[index];
        if (node?.tag !== tag) {
            continue;
        }
        const right = graph.nodes[node.right];
        if (right?.tag === NodeTag.Const && typeof right.value === "number") {
            bounds.push(right.value);
        }
    }
    return bounds;
}

/**
 * @brief Check const false result.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function hasConstFalseResult(graph: Graph): boolean {
    const result = graph.nodes[graph.result];
    if (result?.tag !== NodeTag.Return) {
        return false;
    }
    const value = graph.nodes[result.value];
    return value?.tag === NodeTag.Const && value.value === false;
}

/**
 * @brief Check const true result.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function hasConstTrueResult(graph: Graph): boolean {
    const result = graph.nodes[graph.result];
    if (result?.tag !== NodeTag.Return) {
        return false;
    }
    const value = graph.nodes[result.value];
    return value?.tag === NodeTag.Const && value.value === true;
}

/**
 * @brief Build absorbed and graph.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function makeAbsorbedAndGraph(): Graph {
    const builder = new GraphBuilder();
    const entry = builder.start();
    const input = builder.param("input");
    const string = builder.isString(input);
    const dead = builder.regex(input, /^x$/u, "dead_and");
    const result = builder.and([
        string,
        builder.or([string, dead])
    ]);
    return builder.finish(entry, builder.ret(entry, result));
}

/**
 * @brief Build absorbed or graph.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function makeAbsorbedOrGraph(): Graph {
    const builder = new GraphBuilder();
    const entry = builder.start();
    const input = builder.param("input");
    const string = builder.isString(input);
    const dead = builder.regex(input, /^x$/u, "dead_or");
    const result = builder.or([
        string,
        builder.and([string, dead])
    ]);
    return builder.finish(entry, builder.ret(entry, result));
}

/**
 * @brief Build contradiction graph.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function makeContradictionGraph(): Graph {
    const builder = new GraphBuilder();
    const entry = builder.start();
    const input = builder.param("input");
    const string = builder.isString(input);
    const result = builder.and([string, builder.not(string)]);
    return builder.finish(entry, builder.ret(entry, result));
}

/**
 * @brief Build tautology graph.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function makeTautologyGraph(): Graph {
    const builder = new GraphBuilder();
    const entry = builder.start();
    const input = builder.param("input");
    const string = builder.isString(input);
    const result = builder.or([string, builder.not(string)]);
    return builder.finish(entry, builder.ret(entry, result));
}

/**
 * @brief Build array iteration domain graph.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function makeArrayIterationDomainGraph(): Graph {
    const builder = new GraphBuilder();
    const entry = builder.start();
    const input = builder.param("input");
    const guard = builder.isArray(input);
    const iteration = builder.arrayEvery(input, t.string.schema, t.string.graph());
    const result = builder.and([guard, iteration]);
    return builder.finish(entry, builder.ret(entry, result));
}

/**
 * @brief Build tuple iteration domain graph.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function makeTupleIterationDomainGraph(): Graph {
    const builder = new GraphBuilder();
    const entry = builder.start();
    const input = builder.param("input");
    const guard = builder.isArray(input);
    const iteration = builder.tupleItems(
        input,
        [t.string.schema, t.number.schema],
        [t.string.graph(), t.number.graph()]
    );
    const result = builder.and([guard, iteration]);
    return builder.finish(entry, builder.ret(entry, result));
}

/**
 * @brief Build record iteration domain graph.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function makeRecordIterationDomainGraph(): Graph {
    const builder = new GraphBuilder();
    const entry = builder.start();
    const input = builder.param("input");
    const guard = builder.isObject(input);
    const iteration = builder.recordEvery(input, t.string.schema, t.string.graph());
    const result = builder.and([guard, iteration]);
    return builder.finish(entry, builder.ret(entry, result));
}

/**
 * @brief Execute evaluate graph.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function evaluateGraph(graph: Graph, input: unknown): boolean {
    const state: EvalState = {
        graph,
        input,
        values: new Array<unknown>(graph.nodes.length),
        computed: new Array<boolean>(graph.nodes.length).fill(false)
    };
    return evaluateNode(state, graph.result) === true;
}

/**
 * @brief Execute evaluate node.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Execute evaluate graph node.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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
        case NodeTag.HasOwnData:
            return hasOwnData(evaluateNode(state, node.object), node.key);
        case NodeTag.StrictKeys:
            return hasOnlyKnownKeys(evaluateNode(state, node.object), node.keys);
        case NodeTag.ArrayEvery:
            return arrayEvery(evaluateNode(state, node.value), node.itemGraph);
        case NodeTag.TupleItems:
            return tupleItems(evaluateNode(state, node.value), node.itemGraphs);
        case NodeTag.RecordEvery:
            return recordEvery(evaluateNode(state, node.value), node.itemGraph);
        case NodeTag.DiscriminantDispatch:
            return discriminantDispatch(
                evaluateNode(state, node.value),
                node.key,
                node.graphs,
                node.lookup
            );
        case NodeTag.ObjectShape:
            return objectShape(
                evaluateNode(state, node.value),
                node.entries,
                node.keys,
                node.mode,
                node.allRequired
            );
        case NodeTag.UnionDispatch:
            return unionDispatch(
                evaluateNode(state, node.value),
                node.graphs,
                node.masks
            );
        case NodeTag.PrimitiveUnion:
            return unionDispatch(
                evaluateNode(state, node.value),
                node.graphs,
                node.masks
            );
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

/**
 * @brief Check finite number.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function isFiniteNumber(value: unknown): boolean {
    return typeof value === "number" && Number.isFinite(value);
}

/**
 * @brief Check plain object.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Read property.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function readProperty(value: unknown, key: string): unknown {
    if ((typeof value === "object" && value !== null) || typeof value === "function") {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor !== undefined &&
            Object.prototype.hasOwnProperty.call(descriptor, "value")) {
            return descriptor.value;
        }
    }
    return undefined;
}

/**
 * @brief Execute compare numbers.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function compareNumbers(left: unknown, right: unknown, mode: "gte" | "lte"): boolean {
    if (typeof left !== "number" || typeof right !== "number") {
        return false;
    }
    if (mode === "gte") {
        return left >= right;
    }
    return left <= right;
}

/**
 * @brief Execute string length at least.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function stringLengthAtLeast(value: unknown, bound: number): boolean {
    return typeof value === "string" && value.length >= bound;
}

/**
 * @brief Execute string length at most.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function stringLengthAtMost(value: unknown, bound: number): boolean {
    return typeof value === "string" && value.length <= bound;
}

/**
 * @brief Execute regex matches.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function regexMatches(value: unknown, regex: RegExp): boolean {
    if (typeof value !== "string") {
        return false;
    }
    regex.lastIndex = 0;
    return regex.test(value);
}

/**
 * @brief Check own.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function hasOwn(value: unknown, key: string): boolean {
    if ((typeof value !== "object" || value === null) && typeof value !== "function") {
        return false;
    }
    return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * @brief Check own data.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function hasOwnData(value: unknown, key: string): boolean {
    if ((typeof value !== "object" || value === null) && typeof value !== "function") {
        return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined &&
        Object.prototype.hasOwnProperty.call(descriptor, "value");
}

/**
 * @brief Check only known keys.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Execute array every.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function arrayEvery(value: unknown, graph: Graph): boolean {
    if (!Array.isArray(value)) {
        return false;
    }
    for (let index = 0; index < value.length; index += 1) {
        const slot = readArraySlot(value, index);
        if (slot.accessor || !evaluateGraph(graph, slot.value)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Execute tuple items.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function tupleItems(
    value: unknown,
    graphs: readonly Graph[]
): boolean {
    if (!Array.isArray(value) || value.length !== graphs.length) {
        return false;
    }
    for (let index = 0; index < graphs.length; index += 1) {
        const graph = graphs[index];
        if (graph === undefined) {
            return false;
        }
        const slot = readArraySlot(value, index);
        if (slot.accessor || !evaluateGraph(graph, slot.value)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Execute record every.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function recordEvery(value: unknown, graph: Graph): boolean {
    if (!isPlainObject(value)) {
        return false;
    }
    const keys = Object.keys(value);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined) {
            return false;
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined ||
            !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
            !evaluateGraph(graph, descriptor.value)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Execute discriminant dispatch.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function discriminantDispatch(
    value: unknown,
    key: string,
    graphs: readonly Graph[],
    lookup: Readonly<Record<string, number>>
): boolean {
    if (!isPlainObject(value)) {
        return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
        typeof descriptor.value !== "string") {
        return false;
    }
    const index = Object.prototype.hasOwnProperty.call(lookup, descriptor.value)
        ? lookup[descriptor.value]
        : undefined;
    if (index === undefined) {
        return false;
    }
    const graph = graphs[index];
    return graph !== undefined && evaluateGraph(graph, value);
}

/**
 * @brief Execute object shape.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function objectShape(
    value: unknown,
    entries: readonly ObjectShapeEntry[],
    keys: readonly string[],
    mode: ObjectModeTag,
    allRequired: boolean
): boolean {
    if (!isPlainObject(value)) {
        return false;
    }
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
            return false;
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, entry.key);
        if (descriptor === undefined) {
            if (entry.presence === PresenceTag.Optional &&
                !Object.prototype.hasOwnProperty.call(value, entry.key)) {
                continue;
            }
            return false;
        }
        if (!Object.prototype.hasOwnProperty.call(descriptor, "value") ||
            !evaluateGraph(entry.graph, descriptor.value)) {
            return false;
        }
    }
    if (mode !== ObjectModeTag.Strict) {
        return true;
    }
    if (allRequired) {
        return Object.getOwnPropertyNames(value).length === entries.length &&
            Object.getOwnPropertySymbols(value).length === 0;
    }
    return hasOnlyKnownKeys(value, keys);
}


/**
 * @brief Execute union dispatch.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function unionDispatch(
    value: unknown,
    graphs: readonly Graph[],
    masks: readonly number[]
): boolean {
    const valueMask = valueUnionMask(value);
    for (let index = 0; index < graphs.length; index += 1) {
        const graph = graphs[index];
        const mask = masks[index];
        if (graph === undefined || mask === undefined ||
            (mask & valueMask) === 0) {
            continue;
        }
        if (evaluateGraph(graph, value)) {
            return true;
        }
    }
    return false;
}


/**
 * @brief Execute value union mask.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function valueUnionMask(value: unknown): number {
    if (value === null) {
        return 1 << 6;
    }
    if (Array.isArray(value)) {
        return 1 << 7;
    }
    switch (typeof value) {
        case "string":
            return 1 << 0;
        case "number":
            return 1 << 1;
        case "boolean":
            return 1 << 2;
        case "bigint":
            return 1 << 3;
        case "symbol":
            return 1 << 4;
        case "undefined":
            return 1 << 5;
        case "object":
            return 1 << 8;
        case "function":
            return 1 << 9;
        default:
            return (1 << 10) - 1;
    }
}


/**
 * @brief Read array slot.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function readArraySlot(
    value: readonly unknown[],
    index: number
): { readonly accessor: boolean; readonly value: unknown } {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined) {
        return {
            accessor: false,
            value: undefined
        };
    }
    if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        return {
            accessor: true,
            value: undefined
        };
    }
    return {
        accessor: false,
        value: descriptor.value
    };
}

/**
 * @brief Execute evaluate and.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function evaluateAnd(state: EvalState, values: readonly number[]): boolean {
    for (let index = 0; index < values.length; index += 1) {
        const id = values[index];
        if (id === undefined || evaluateNode(state, id) !== true) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Execute evaluate or.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function evaluateOr(state: EvalState, values: readonly number[]): boolean {
    for (let index = 0; index < values.length; index += 1) {
        const id = values[index];
        if (id !== undefined && evaluateNode(state, id) === true) {
            return true;
        }
    }
    return false;
}

/**
 * @brief Execute assert dense graph.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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
