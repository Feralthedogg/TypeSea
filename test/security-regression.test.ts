import { describe, expect, test } from "vitest";
import {
    ArrayGuard,
    BaseGuard,
    NumberGuard,
    compile,
    formatIssues,
    optimizeGraph,
    t,
    toJsonSchema,
    type Guard,
    type JsonSchemaObject
} from "../src/index.js";
import {
    NodeTag,
    ObjectModeTag,
    PresenceTag,
    SchemaTag
} from "../src/kind/index.js";

describe("security regression coverage", () => {
    test("compiled safe validators reject accessor-backed slots", () => {
        const arrayValue: unknown[] = [];
        Object.defineProperty(arrayValue, "0", {
            configurable: true,
            enumerable: true,
            get(): string {
                return "hidden";
            }
        });
        arrayValue.length = 1;

        const objectValue = {};
        Object.defineProperty(objectValue, "name", {
            configurable: true,
            enumerable: true,
            get(): string {
                return "ada";
            }
        });

        const ArraySchema = t.array(t.unknown);
        const TupleSchema = t.tuple([t.unknown]);
        const ObjectSchema = t.object({
            name: t.unknown
        });
        const RecordSchema = t.record(t.unknown);

        expect(ArraySchema.is(arrayValue)).toBe(false);
        expect(compile(ArraySchema, { name: "safe_accessor_array" }).is(arrayValue))
            .toBe(false);
        expect(TupleSchema.is(arrayValue)).toBe(false);
        expect(compile(TupleSchema, { name: "safe_accessor_tuple" }).is(arrayValue))
            .toBe(false);
        expect(ObjectSchema.is(objectValue)).toBe(false);
        expect(compile(ObjectSchema, { name: "safe_accessor_object" }).is(objectValue))
            .toBe(false);
        expect(RecordSchema.is(objectValue)).toBe(false);
        expect(compile(RecordSchema, { name: "safe_accessor_record" }).is(objectValue))
            .toBe(false);
    });

    test("compiled union preflight does not coerce hostile number-like objects", () => {
        let hits = 0;
        const hostile = {
            valueOf(): number {
                hits += 1;
                throw new Error("hostile valueOf executed");
            }
        };
        const Guard = compile(t.union(t.number.gte(0).int(), t.string), {
            name: "union_preflight_no_coercion"
        });

        expect(Guard.check(hostile).ok).toBe(false);
        expect(hits).toBe(0);
    });

    test("forged Date Map and Set prototypes fail closed", () => {
        const dateValue = Object.create(Date.prototype) as unknown;
        const mapValue = Object.create(Map.prototype) as unknown;
        const setValue = Object.create(Set.prototype) as unknown;
        const MapGuard = t.map(t.string, t.number);
        const SetGuard = t.set(t.number);

        expect(t.date.is(dateValue)).toBe(false);
        expect(t.date.check(dateValue).ok).toBe(false);
        expect(MapGuard.is(mapValue)).toBe(false);
        expect(MapGuard.check(mapValue).ok).toBe(false);
        expect(SetGuard.is(setValue)).toBe(false);
        expect(SetGuard.check(setValue).ok).toBe(false);
        const invalidMap = MapGuard.check({});
        expect(invalidMap.ok).toBe(false);
        if (!invalidMap.ok) {
            expect(formatIssues(invalidMap.error)).toEqual([
                "Expected Map at $; received object."
            ]);
        }
    });

    test("raw object schemas cannot hide non-enumerable key lookup entries", () => {
        const keyLookup = Object.create(null) as Record<string, true>;
        Object.defineProperty(keyLookup, "evil", {
            configurable: true,
            enumerable: false,
            value: true
        });
        const rawSchema = {
            tag: SchemaTag.Object,
            entries: [
                {
                    key: "safe",
                    schema: {
                        tag: SchemaTag.Unknown
                    },
                    presence: PresenceTag.Required
                }
            ],
            keys: ["safe"],
            keyLookup,
            mode: ObjectModeTag.Strict,
            catchall: undefined
        };
        const GuardCtor = BaseGuard as unknown as new (
            schema: unknown
        ) => BaseGuard<unknown>;

        expect(() => new GuardCtor(rawSchema)).toThrow(TypeError);
    });

    test("boolean folding preserves refinement callback barriers", () => {
        let calls = 0;
        const Guard = t.intersect(
            t.refine(
                t.unknown,
                (): boolean => {
                    calls += 1;
                    return false;
                },
                "policy"
            ),
            t.never
        );
        const FastGuard = compile(Guard, { name: "refine_barrier" });

        expect(Guard.is("x")).toBe(false);
        expect(calls).toBe(1);
        calls = 0;
        expect(FastGuard.is("x")).toBe(false);
        expect(calls).toBe(1);
    });

    test("email and url JSON Schema exports keep TypeSea regex semantics", () => {
        const exported = toJsonSchema(t.object({
            email: t.string.email(),
            url: t.string.url()
        }));

        expect(exported.ok).toBe(true);
        if (exported.ok) {
            const root = exported.value as JsonSchemaObject;
            const properties = root.properties as Record<string, JsonSchemaObject>;
            expect(properties["email"]?.format).toBe("email");
            expect(typeof properties["email"]?.pattern).toBe("string");
            expect(properties["url"]?.format).toBe("uri");
            expect(typeof properties["url"]?.pattern).toBe("string");
        }
    });

    test("compile names cannot collide with generated helper names", () => {
        expect(compile(t.string, { name: "p0" }).is("x")).toBe(true);
        expect(compile(t.string, { name: "f0" }).is("x")).toBe(true);
        expect(compile(t.string, { name: "c0" }).check("x").ok).toBe(true);
    });

    test("public optimizeGraph rejects cyclic and shadowed graph inputs", () => {
        const looseOptimizeGraph = optimizeGraph as unknown as (
            graph: unknown
        ) => unknown;
        const cyclic = {
            nodes: [
                {
                    id: 0,
                    tag: NodeTag.Start,
                    deps: []
                },
                {
                    id: 1,
                    tag: NodeTag.And,
                    deps: [1],
                    values: [1]
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
        };
        const nodes = [
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
        ];
        let shadowCalled = false;
        Object.defineProperty(nodes, "slice", {
            value(): unknown[] {
                shadowCalled = true;
                return [];
            }
        });

        expect(() => looseOptimizeGraph(cyclic)).toThrow(TypeError);
        expect(() => looseOptimizeGraph({
            nodes,
            entry: 0,
            result: 2
        })).toThrow(TypeError);
        expect(shadowCalled).toBe(false);
    });

    test("fluent alias methods validate receivers before touching aliases", () => {
        let arrayAliasReads = 0;
        const forgedArrayReceiver = {
            get min(): unknown {
                arrayAliasReads += 1;
                return (): Guard<unknown[]> => t.array(t.unknown);
            }
        };
        const forgedNumberReceiver = {
            marker: true,
            schema: t.number.schema
        };
        const arrayLength = readPrototypeMethod(ArrayGuard.prototype, "length");
        const numberFinite = readPrototypeMethod(NumberGuard.prototype, "finite");

        expect(() => {
            Reflect.apply(arrayLength, forgedArrayReceiver, [1]);
        }).toThrow(TypeError);
        expect(arrayAliasReads).toBe(0);

        const finiteResult = Reflect.apply(
            numberFinite,
            forgedNumberReceiver,
            []
        ) as Guard<number>;
        expect(finiteResult).not.toBe(forgedNumberReceiver);
        expect(finiteResult.is(1)).toBe(true);
    });
});

function readPrototypeMethod(
    prototype: object,
    key: string
): (...args: readonly unknown[]) => unknown {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
    if (descriptor === undefined || typeof descriptor.value !== "function") {
        throw new TypeError("prototype method is missing");
    }
    return descriptor.value as (...args: readonly unknown[]) => unknown;
}
