import { describe, expect, test } from "vitest";
import {
    createSeaBreeze,
    emitSeaBreezeBooleanSourceBundle,
    lowerSeaBreezeToSchema,
    lowerSeaBreezeToGraph,
    seaBreezeReader,
    SeaBreezeArena,
    SeaBreezeKind,
    SeaBreezePresence,
    serializeSeaBreezeArena,
    loadSeaBreezeSnapshot,
    type SeaBreezeSnapshot,
    type SeaBreezeShape
} from "../src/seabreeze/index.js";
import {
    BaseGuard,
    compileBoolean
} from "../src/index.js";
import { emitCompiledGraphBooleanSourceBundle } from "../src/compile/index.js";
import { strictKeys } from "../src/compile/runtime.js";
import { makeValidationState } from "../src/evaluate/state.js";
import { executeGraphPredicate } from "../src/plan/index.js";
import type { CompiledSourceBundle } from "../src/compile/index.js";
import type { PredicateFactory } from "../src/compile/runtime.js";

function makePredicate(bundle: CompiledSourceBundle): (value: unknown) => boolean {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const factory = new Function(
        "l",
        "r",
        "k",
        "u",
        "d",
        "m",
        "mf",
        "sk",
        bundle.source
    ) as PredicateFactory;
    return factory(
        bundle.literals,
        bundle.regexps,
        bundle.keysets,
        bundle.strings,
        () => false,
        () => undefined,
        () => undefined,
        strictKeys
    );
}

describe("SeaBreeze arena solver", () => {
    test("binds Hindley-Milner variables without allocating result objects", () => {
        const arena = new SeaBreezeArena({
            maxNodes: 32,
            maxFields: 16
        });
        const variable = arena.allocVar(0);
        const before = arena.nodeLength;
        const joined = arena.principalJoin(variable, arena.number);

        expect(joined).toBe(arena.number);
        expect(arena.find(variable)).toBe(arena.number);
        expect(arena.nodeLength).toBe(before);
    });

    test("falls back to a compact union for incompatible scalar constructors", () => {
        const arena = new SeaBreezeArena({
            maxNodes: 32,
            maxFields: 16
        });
        const joined = arena.principalJoin(arena.string, arena.number);

        expect(arena.kindOf(joined)).toBe(SeaBreezeKind.Union);
        expect(new Set([arena.unionLeft(joined), arena.unionRight(joined)])).toEqual(
            new Set([arena.string, arena.number])
        );
    });

    test("computes an optimal common object shape with optional drift fields", () => {
        const arena = new SeaBreezeArena({
            maxNodes: 64,
            maxFields: 32
        });
        const left = arena.allocObject();
        arena.appendField(left, 1, arena.number, SeaBreezePresence.Required);
        arena.appendField(left, 2, arena.string, SeaBreezePresence.Required);
        const right = arena.allocObject();
        arena.appendField(right, 1, arena.string, SeaBreezePresence.Required);
        arena.appendField(right, 3, arena.boolean, SeaBreezePresence.Required);
        const joined = arena.principalJoin(left, right);

        expect(arena.kindOf(joined)).toBe(SeaBreezeKind.Object);
        expect(arena.fieldCount(joined)).toBe(3);
        expect(arena.fieldKeyAt(joined, 0)).toBe(1);
        expect(arena.fieldPresenceAt(joined, 0)).toBe(SeaBreezePresence.Required);
        expect(arena.kindOf(arena.fieldTypeAt(joined, 0))).toBe(SeaBreezeKind.Union);
        expect(arena.fieldKeyAt(joined, 1)).toBe(2);
        expect(arena.fieldPresenceAt(joined, 1)).toBe(SeaBreezePresence.Optional);
        expect(arena.fieldTypeAt(joined, 1)).toBe(arena.string);
        expect(arena.fieldKeyAt(joined, 2)).toBe(3);
        expect(arena.fieldPresenceAt(joined, 2)).toBe(SeaBreezePresence.Optional);
        expect(arena.fieldTypeAt(joined, 2)).toBe(arena.boolean);
    });

    test("joins array element variables through the same principal path", () => {
        const arena = new SeaBreezeArena({
            maxNodes: 32,
            maxFields: 16
        });
        const element = arena.allocVar(0);
        const left = arena.allocArray(element);
        const right = arena.allocArray(arena.number);
        const joined = arena.principalJoin(left, right);

        expect(arena.kindOf(joined)).toBe(SeaBreezeKind.Array);
        expect(arena.arrayElement(joined)).toBe(arena.number);
        expect(arena.find(element)).toBe(arena.number);
    });

    test("preserves fixed-capacity discipline", () => {
        const arena = new SeaBreezeArena({
            maxNodes: 10,
            maxFields: 1
        });
        const object = arena.allocObject();
        arena.appendField(object, 1, arena.string, SeaBreezePresence.Required);

        expect(() => {
            arena.appendField(object, 2, arena.number, SeaBreezePresence.Required);
        }).toThrow(RangeError);
        expect(() => new SeaBreezeArena({
            maxNodes: 0,
            maxFields: 1
        })).toThrow(RangeError);
    });

    test("lowers principal joins into schemas consumed by the JIT emitter", () => {
        const arena = new SeaBreezeArena({
            maxNodes: 96,
            maxFields: 32
        });
        const left = arena.allocObject();
        arena.appendField(left, 1, arena.number, SeaBreezePresence.Required);
        arena.appendField(left, 2, arena.string, SeaBreezePresence.Required);
        const right = arena.allocObject();
        arena.appendField(right, 1, arena.string, SeaBreezePresence.Required);
        arena.appendField(right, 3, arena.boolean, SeaBreezePresence.Required);
        const joined = arena.principalJoin(left, right);
        const schema = lowerSeaBreezeToSchema(arena, joined, {
            keyTable: ["", "id", "name", "flag"],
            objectMode: "strict"
        });
        const guard = new BaseGuard<unknown>(schema);
        const compiled = compileBoolean(guard, {
            name: "seaBreezeBridge"
        });

        expect(compiled.is({
            id: 1,
            name: "Ada"
        })).toBe(true);
        expect(compiled.is({
            id: "id-1",
            flag: true
        })).toBe(true);
        expect(compiled.is({
            id: true
        })).toBe(false);
        expect(compiled.is({
            id: 1,
            extra: "strict objects reject this"
        })).toBe(false);
    });

    test("rejects missing or duplicate key-table bridge entries", () => {
        const arena = new SeaBreezeArena({
            maxNodes: 32,
            maxFields: 8
        });
        const object = arena.allocObject();
        arena.appendField(object, 1, arena.number, SeaBreezePresence.Required);
        arena.appendField(object, 2, arena.string, SeaBreezePresence.Optional);

        expect(() => lowerSeaBreezeToSchema(arena, object, {
            keyTable: ["", "id"]
        })).toThrow(RangeError);
        expect(() => lowerSeaBreezeToSchema(arena, object, {
            keyTable: ["", "id", "id"]
        })).toThrow(TypeError);
    });

    test("serializes and reloads arena tables without losing principal shape", () => {
        const arena = new SeaBreezeArena({
            maxNodes: 64,
            maxFields: 16
        });
        const object = arena.allocObject();
        arena.appendField(object, 1, arena.number, SeaBreezePresence.Required);
        arena.appendField(object, 2, arena.string, SeaBreezePresence.Optional);
        const snapshot = serializeSeaBreezeArena(arena);
        const loaded = new SeaBreezeArena({
            maxNodes: 64,
            maxFields: 16
        });
        loadSeaBreezeSnapshot(loaded, snapshot);
        const schema = lowerSeaBreezeToSchema(loaded, object, {
            keyTable: ["", "id", "name"]
        });
        const guard = new BaseGuard<unknown>(schema);

        expect(guard.is({
            id: 1
        })).toBe(true);
        expect(guard.is({
            id: 1,
            name: "Ada"
        })).toBe(true);
        expect(guard.is({
            name: "Ada"
        })).toBe(false);
    });

    test("rejects malformed serialized arena tables before lowering", () => {
        const arena = new SeaBreezeArena({
            maxNodes: 64,
            maxFields: 16
        });
        const object = arena.allocObject();
        arena.appendField(object, 1, arena.number, SeaBreezePresence.Required);
        arena.allocArray(arena.string);
        const snapshot = serializeSeaBreezeArena(arena);

        const badPresence = cloneSeaBreezeSnapshot(snapshot);
        badPresence.fieldPresence[0] = 255;
        expect(() => {
            loadSeaBreezeSnapshot(new SeaBreezeArena({
                maxNodes: 64,
                maxFields: 16
            }), badPresence);
        }).toThrow(TypeError);

        const badKind = cloneSeaBreezeSnapshot(snapshot);
        badKind.kinds[object] = 255;
        expect(() => {
            loadSeaBreezeSnapshot(new SeaBreezeArena({
                maxNodes: 64,
                maxFields: 16
            }), badKind);
        }).toThrow(TypeError);

        const badParents = cloneSeaBreezeSnapshot(snapshot);
        badParents.parents[object] = object + 1;
        badParents.parents[object + 1] = object;
        expect(() => {
            loadSeaBreezeSnapshot(new SeaBreezeArena({
                maxNodes: 64,
                maxFields: 16
            }), badParents);
        }).toThrow(RangeError);

        const badCycle = cloneSeaBreezeSnapshot(snapshot);
        badCycle.left[object + 1] = object + 1;
        expect(() => {
            loadSeaBreezeSnapshot(new SeaBreezeArena({
                maxNodes: 64,
                maxFields: 16
            }), badCycle);
        }).toThrow(RangeError);
    });

    test("exposes a reader facade over arena typed arrays", () => {
        const arena = new SeaBreezeArena({
            maxNodes: 32,
            maxFields: 8
        });
        const object = arena.allocObject();
        arena.appendField(object, 1, arena.number, SeaBreezePresence.Required);
        const reader = seaBreezeReader(arena);

        expect(reader.nodeLength).toBe(arena.nodeLength);
        expect(reader.fieldLength).toBe(arena.fieldLength);
        expect(reader.kindOf(object)).toBe(SeaBreezeKind.Object);
        expect(reader.fieldKeyAt(object, 0)).toBe(1);
        expect(reader.fieldTypeAt(object, 0)).toBe(arena.number);
    });

    test("builds zod-like shapes without adding a runtime wrapper", () => {
        const sea = createSeaBreeze({
            maxNodes: 64,
            maxFields: 16
        });
        const user = sea.object({
            id: sea.string(),
            age: sea.optional(sea.number()),
            tags: sea.array(sea.string())
        });
        const compiled = sea.compile(user, {
            mode: "safe",
            name: "isSeaBreezeUser"
        });

        expect(sea.keyTable).toEqual(["", "id", "age", "tags"]);
        expect(compiled.source).toContain("function isSeaBreezeUser");
        expect(compiled.is({
            id: "u1",
            tags: ["fast", "typed"]
        })).toBe(true);
        expect(compiled.is({
            id: "u1",
            age: 42,
            tags: ["fast"]
        })).toBe(true);
        expect(compiled.is({
            id: "u1",
            tags: ["fast"],
            extra: true
        })).toBe(false);
        expect(compiled.is({
            id: "u1",
            tags: [1]
        })).toBe(false);

        const bundle = sea.emit(user, {
            mode: "safe",
            name: "isSeaBreezeUserSource"
        });

        expect(bundle.dynamicSchemas).toHaveLength(0);
        expect(bundle.source).toContain("function isSeaBreezeUserSource");
        expect(new BaseGuard<unknown>(sea.schema(user)).is({
            id: "u1",
            tags: []
        })).toBe(true);
    });

    test("joins builder object variants through the same principal solver", () => {
        const sea = createSeaBreeze({
            maxNodes: 96,
            maxFields: 32
        });
        const left = sea.object({
            id: sea.number(),
            name: sea.string()
        });
        const right = sea.object({
            id: sea.string(),
            flag: sea.boolean()
        });
        const joined = sea.union(left, right);
        const compiled = sea.compile(joined, {
            mode: "safe",
            name: "isJoinedSeaBreezeUser"
        });

        expect(compiled.is({
            id: 1,
            name: "Ada"
        })).toBe(true);
        expect(compiled.is({
            id: "u1",
            flag: true
        })).toBe(true);
        expect(compiled.is({
            id: false
        })).toBe(false);
    });

    test("rejects non-data shape fields before they reach the arena", () => {
        const sea = createSeaBreeze({
            maxNodes: 32,
            maxFields: 8
        });
        const accessorShape = {};
        Object.defineProperty(accessorShape, "id", {
            enumerable: true,
            get(): number {
                return sea.string();
            }
        });
        const symbolShape = {
            id: sea.string(),
            [Symbol("hidden")]: sea.number()
        };

        expect(() => sea.object(accessorShape as SeaBreezeShape)).toThrow(TypeError);
        expect(() => sea.object(symbolShape as SeaBreezeShape)).toThrow(TypeError);
    });

    test("lowers principal joins directly into graph IR and emitted predicate source", () => {
        const arena = new SeaBreezeArena({
            maxNodes: 96,
            maxFields: 32
        });
        const left = arena.allocObject();
        arena.appendField(left, 1, arena.number, SeaBreezePresence.Required);
        arena.appendField(left, 2, arena.string, SeaBreezePresence.Required);
        const right = arena.allocObject();
        arena.appendField(right, 1, arena.string, SeaBreezePresence.Required);
        arena.appendField(right, 3, arena.boolean, SeaBreezePresence.Required);
        const joined = arena.principalJoin(left, right);
        const graph = lowerSeaBreezeToGraph(arena, joined, {
            keyTable: ["", "id", "name", "flag"],
            objectMode: "strict"
        });

        expect(executeGraphPredicate(graph, {
            id: 1,
            name: "Ada"
        }, makeValidationState())).toBe(true);
        expect(executeGraphPredicate(graph, {
            id: "id-1",
            flag: true
        }, makeValidationState())).toBe(true);
        expect(executeGraphPredicate(graph, {
            id: true
        }, makeValidationState())).toBe(false);

        const bundle = emitCompiledGraphBooleanSourceBundle(
            graph,
            "seaBreezeGraphBridge",
            "safe"
        );
        const predicate = makePredicate(bundle);

        expect(predicate({
            id: 1,
            name: "Ada"
        })).toBe(true);
        expect(predicate({
            id: 1,
            extra: "nope"
        })).toBe(false);

        const directBundle = emitSeaBreezeBooleanSourceBundle(
            seaBreezeReader(arena),
            joined,
            {
                keyTable: ["", "id", "name", "flag"],
                objectMode: "strict",
                name: "seaBreezeDirectBridge",
                mode: "safe"
            }
        );
        const directPredicate = makePredicate(directBundle);

        expect(directBundle.dynamicSchemas).toHaveLength(0);
        expect(directBundle.source).toContain("function seaBreezeDirectBridge");
        expect(directPredicate({
            id: 1,
            name: "Ada"
        })).toBe(true);
        expect(directPredicate({
            id: "id-1",
            flag: true
        })).toBe(true);
        expect(directPredicate({
            id: true
        })).toBe(false);
        expect(directPredicate({
            id: 1,
            extra: "nope"
        })).toBe(false);
    });

    test("emits direct safe predicates without invoking hostile property access", () => {
        const arena = new SeaBreezeArena({
            maxNodes: 32,
            maxFields: 8
        });
        const object = arena.allocObject();
        arena.appendField(object, 1, arena.number, SeaBreezePresence.Required);
        const reader = seaBreezeReader(arena);
        const safePredicate = makePredicate(emitSeaBreezeBooleanSourceBundle(
            reader,
            object,
            {
                keyTable: ["", "id"],
                objectMode: "strict",
                mode: "safe"
            }
        ));
        const unsafePredicate = makePredicate(emitSeaBreezeBooleanSourceBundle(
            reader,
            object,
            {
                keyTable: ["", "id"],
                objectMode: "strict",
                mode: "unsafe"
            }
        ));
        const accessor = {};
        let getterCalls = 0;
        Object.defineProperty(accessor, "id", {
            enumerable: true,
            get(): number {
                getterCalls += 1;
                return 1;
            }
        });
        const inherited = Object.create({
            id: 1
        }) as unknown;
        const symbolExtra = {
            id: 1
        } as Record<PropertyKey, unknown>;
        symbolExtra[Symbol("extra")] = true;

        expect(safePredicate(accessor)).toBe(false);
        expect(getterCalls).toBe(0);
        expect(safePredicate(inherited)).toBe(false);
        expect(safePredicate(symbolExtra)).toBe(false);

        expect(unsafePredicate(accessor)).toBe(true);
        expect(getterCalls).toBe(1);
        expect(unsafePredicate(inherited)).toBe(true);
        expect(unsafePredicate(symbolExtra)).toBe(true);
    });

    test("emits direct array predicates with sparse-hole parity", () => {
        const arena = new SeaBreezeArena({
            maxNodes: 64,
            maxFields: 8
        });
        const numberArray = arena.allocArray(arena.number);
        const optionalNumber = arena.principalJoin(arena.number, arena.undefined);
        const optionalNumberArray = arena.allocArray(optionalNumber);
        const numberPredicate = makePredicate(emitSeaBreezeBooleanSourceBundle(
            seaBreezeReader(arena),
            numberArray,
            {
                keyTable: [""],
                mode: "safe"
            }
        ));
        const optionalPredicate = makePredicate(emitSeaBreezeBooleanSourceBundle(
            seaBreezeReader(arena),
            optionalNumberArray,
            {
                keyTable: [""],
                mode: "safe"
            }
        ));
        const sparse = new Array<unknown>(2);
        sparse[1] = 1;

        expect(numberPredicate([1, 2])).toBe(true);
        expect(numberPredicate(sparse)).toBe(false);
        expect(optionalPredicate(sparse)).toBe(true);
    });
});

function cloneSeaBreezeSnapshot(snapshot: SeaBreezeSnapshot): SeaBreezeSnapshot {
    return {
        nodeLength: snapshot.nodeLength,
        fieldLength: snapshot.fieldLength,
        parents: new Int32Array(snapshot.parents),
        ranks: new Uint8Array(snapshot.ranks),
        kinds: new Uint8Array(snapshot.kinds),
        left: new Int32Array(snapshot.left),
        right: new Int32Array(snapshot.right),
        fieldStarts: new Int32Array(snapshot.fieldStarts),
        fieldCounts: new Int32Array(snapshot.fieldCounts),
        fieldKeys: new Int32Array(snapshot.fieldKeys),
        fieldTypes: new Int32Array(snapshot.fieldTypes),
        fieldPresence: new Uint8Array(snapshot.fieldPresence)
    };
}
