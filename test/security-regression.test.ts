import { describe, expect, test } from "vitest";
import {
    ArrayGuard,
    BaseGuard,
    NumberGuard,
    ObjectDecoder,
    compile,
    compileAsync,
    decode,
    encode,
    formatIssues,
    fromJsonSchema,
    optimizeGraph,
    registry,
    t,
    toJsonSchema,
    type Guard,
    type Codec,
    type Decoder,
    type GlobalRegistryMetadata,
    type JsonSchemaObject
} from "../src/index.js";
import {
    NodeTag,
    ObjectModeTag,
    PresenceTag,
    SchemaTag
} from "../src/kind/index.js";

describe("security regression coverage", () => {
    test("object guard derivations retain predicate and callback refinements", () => {
        const refined = t.object({
            x: t.number,
            nested: t.object({ value: t.number }),
            alternate: t.optional(t.number)
        }).refine((value) => value.x > 0, "x_positive");
        const superRefined = t.object({
            x: t.number,
            nested: t.object({ value: t.number }),
            alternate: t.optional(t.number)
        }).superRefine((value, context) => {
            if (value.x <= 0) {
                context.addIssue("x must be positive");
            }
        }, "x_positive");
        const negative = {
            x: -1,
            nested: { value: 1 }
        };
        const derive: readonly ((guard: typeof refined) => unknown)[] = [
            (guard): unknown => guard.extend({ enabled: t.boolean }),
            (guard): unknown => guard.safeExtend({ enabled: t.boolean }),
            (guard): unknown => guard.merge(t.object({ enabled: t.boolean })),
            (guard): unknown => guard.pick(["x", "nested"]),
            (guard): unknown => guard.omit(["alternate"]),
            (guard): unknown => guard.partial(),
            (guard): unknown => guard.deepPartial(),
            (guard): unknown => guard.required(),
            (guard): unknown => guard.strict(),
            (guard): unknown => guard.passthrough(),
            (guard): unknown => guard.loose(),
            (guard): unknown => guard.nonstrict(),
            (guard): unknown => guard.nonpassthrough(),
            (guard): unknown => guard.strip(),
            (guard): unknown => guard.catchall(t.unknown),
            (guard): unknown => guard.atLeastOneKey(["x", "alternate"]),
            (guard): unknown => guard.exactlyOneKey(["x", "alternate"]),
            (guard): unknown => guard.oneOfKeys(["x", "alternate"])
        ];

        for (let index = 0; index < derive.length; index += 1) {
            const operation = derive[index];
            if (operation === undefined) {
                continue;
            }
            const predicateGuard = operation(refined) as Guard<unknown>;
            const callbackGuard = operation(superRefined) as Guard<unknown>;
            const value = index < 3
                ? { ...negative, enabled: true }
                : index === 7
                    ? { ...negative, alternate: 0 }
                    : negative;
            const positive = { ...value, x: 1 };

            expect(predicateGuard.is(value), `predicate derivation ${String(index)}`).toBe(false);
            expect(callbackGuard.check(value).ok, `callback derivation ${String(index)}`).toBe(false);
            expect(predicateGuard.is(positive), `valid predicate derivation ${String(index)}`)
                .toBe(true);
            expect(callbackGuard.check(positive).ok, `valid callback derivation ${String(index)}`)
                .toBe(true);
            expect(
                compile(predicateGuard, {
                    name: `refined_object_${String(index)}`
                }).is(value),
                `compiled derivation ${String(index)}`
            ).toBe(false);
        }

        const refinedRight = t.object({ x: t.number }).refine(
            (value) => value.x > 0,
            "right_positive"
        );
        expect(t.object({ enabled: t.boolean }).merge(refinedRight).is({
            enabled: true,
            x: -1
        })).toBe(false);

        const mixed = t.object({ x: t.number })
            .refine((value) => value.x > 0, "mixed_positive")
            .merge(t.object({ text: t.coerce.string() }));
        expect(mixed.safeParse({ x: -1, text: 1 }).success).toBe(false);
        expect(mixed.strict().safeParse({ x: -1, text: 1 }).success).toBe(false);

        const mixedCodec = t.object({ x: t.number })
            .refine((value) => value.x > 0, "mixed_codec_positive")
            .merge(t.object({ count: t.codecs.stringToNumber() }));
        expect(mixedCodec.safeParse({ x: -1, count: "1" }).success).toBe(false);
        expect(mixedCodec.strip().safeParse({ x: -1, count: "1" }).success).toBe(false);
    });

    test("object decoder derivations retain object-level refinements", () => {
        const refined = t.object({
            role: t.coerce.string(),
            note: t.string
        }).refine((value) => value.role !== "admin", {
            path: ["role"],
            message: "admin is reserved"
        });
        const superRefined = t.object({
            role: t.coerce.string(),
            note: t.string
        }).superRefine((value, context) => {
            if (value.role === "admin") {
                context.addIssue({
                    path: ["role"],
                    message: "admin is reserved"
                });
            }
        });
        const derive: readonly ((source: typeof refined) => unknown)[] = [
            (source): unknown => source.extend({ id: t.coerce.string() }),
            (source): unknown => source.safeExtend({ id: t.coerce.string() }),
            (source): unknown => source.merge(t.object({
                id: t.coerce.string()
            })),
            (source): unknown => source.pick(["role", "note"]),
            (source): unknown => source.omit([]),
            (source): unknown => source.partial(),
            (source): unknown => source.strict(),
            (source): unknown => source.passthrough(),
            (source): unknown => source.loose(),
            (source): unknown => source.strip()
        ];
        const invalid = { role: "admin", note: "memo" };
        const valid = { role: "member", note: "memo" };

        for (let index = 0; index < derive.length; index += 1) {
            const operation = derive[index];
            if (operation === undefined) {
                continue;
            }
            const predicateDecoder = operation(refined) as Decoder<unknown>;
            const callbackDecoder = operation(superRefined) as Decoder<unknown>;
            const invalidValue = index < 3
                ? { ...invalid, id: "u1" }
                : invalid;
            const validValue = index < 3
                ? { ...valid, id: "u1" }
                : valid;

            const predicateFailure = predicateDecoder.decode(invalidValue);
            expect(predicateFailure.ok, `predicate derivation ${String(index)}`).toBe(false);
            if (!predicateFailure.ok) {
                expect(predicateFailure.error[0]).toMatchObject({
                    path: ["role"],
                    code: "expected_refinement",
                    message: "admin is reserved"
                });
            }
            expect(
                callbackDecoder.safeParse(invalidValue).success,
                `callback derivation ${String(index)}`
            ).toBe(false);
            expect(predicateDecoder.decode(validValue).ok, `valid derivation ${String(index)}`)
                .toBe(true);
        }

        let outerCalls = 0;
        const chained = refined.superRefine((_value, context) => {
            outerCalls += 1;
            context.addIssue("outer policy");
        }).describe("chained policies").strict();
        expect(chained.decode(invalid).ok).toBe(false);
        expect(outerCalls).toBe(0);

        const custom = new ObjectDecoder(
            { role: t.coerce.string() },
            ObjectModeTag.Passthrough,
            undefined,
            (value: unknown) => ({
                ok: true,
                value: { role: String(value) }
            })
        );
        expect(() => custom.strict()).toThrow(
            "custom ObjectDecoder runners cannot be shape-derived safely"
        );
    });

    test("decoder intersections reject conflicting normalized outputs", () => {
        const canonical = t.object({ role: t.string })
            .strip()
            .transform((value) => ({ role: value.role.toLowerCase() }))
            .pipe(t.object({ role: t.literal("admin") }).strip());
        const raw = t.object({ role: t.string }).strip();
        const conflicting = t.intersect(canonical, raw);
        const reversed = t.intersect(raw, canonical);

        for (const source of [conflicting, reversed]) {
            const result = decode(source, { role: "ADMIN" });
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error[0]).toMatchObject({
                    code: "expected_intersection",
                    expected: "compatible intersection outputs"
                });
            }
        }

        const leftCodec = t.codec(t.unknown, t.unknown, {
            decode: () => ({ side: "left" }),
            encode: () => ({ side: "left" })
        });
        const rightCodec = t.codec(t.unknown, t.unknown, {
            decode: () => ({ side: "right" }),
            encode: () => ({ side: "right" })
        });
        const codecIntersection = t.intersect(leftCodec, rightCodec);

        expect(decode(codecIntersection, null).ok).toBe(false);
        expect(encode(
            codecIntersection as unknown as Codec<unknown, unknown>,
            null
        ).ok).toBe(false);

        const disjoint = t.intersect(
            t.unknown.transform(() => ({ left: 1 })),
            t.unknown.transform(() => ({ right: 2 }))
        );
        expect(decode(disjoint, null)).toEqual({
            ok: true,
            value: { left: 1, right: 2 }
        });
    });

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

    test("runtime-object guards reject revoked proxies without throwing", async () => {
        class Marker {
            public readonly marker = true;
        }

        const guards: readonly Guard<unknown>[] = [
            t.date,
            t.map(t.string, t.number),
            t.set(t.number),
            t.file(),
            t.instanceOf(Marker)
        ];
        const revoked = Proxy.revocable({}, {});
        revoked.revoke();

        for (let index = 0; index < guards.length; index += 1) {
            const guard = guards[index];
            if (guard === undefined) {
                continue;
            }
            const compiled = compile(guard, {
                name: `revoked_runtime_${String(index)}`
            });
            const asyncGuard = compileAsync(guard, {
                name: `revoked_runtime_async_${String(index)}`,
                yieldEvery: 1,
                yieldTimeout: 0
            });

            expect(() => guard.is(revoked.proxy)).not.toThrow();
            expect(guard.is(revoked.proxy)).toBe(false);
            expect(() => guard.check(revoked.proxy)).not.toThrow();
            expect(guard.check(revoked.proxy).ok).toBe(false);
            expect(() => compiled.is(revoked.proxy)).not.toThrow();
            expect(compiled.is(revoked.proxy)).toBe(false);
            await expect(asyncGuard.is(revoked.proxy)).resolves.toBe(false);
            await expect(asyncGuard.check(revoked.proxy)).resolves.toMatchObject({
                ok: false
            });
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

    test("JSON Schema import rejects hostile and malformed schemas through Result", () => {
        let getterReads = 0;
        const accessorSchema = {};
        Object.defineProperty(accessorSchema, "type", {
            enumerable: true,
            get(): string {
                getterReads += 1;
                throw new Error("schema getter executed");
            }
        });
        const inheritedType = Object.create(Object.defineProperty({}, "type", {
            enumerable: true,
            get(): string {
                getterReads += 1;
                return "string";
            }
        })) as Record<string, unknown>;
        let deep: unknown = { type: "string" };
        for (let index = 0; index < 300; index += 1) {
            deep = {
                type: "array",
                items: deep
            };
        }
        const cyclic: Record<string, unknown> = {
            type: "array"
        };
        cyclic["items"] = cyclic;
        const malformed = [
            accessorSchema,
            { type: "number", minimum: "0" },
            { type: "number", multipleOf: 0 },
            { type: "string", minLength: -1 },
            { type: "array", prefixItems: {} },
            { type: "array", minItems: -1 },
            { type: "string", pattern: "(a+)+$" },
            deep,
            cyclic
        ];

        for (let index = 0; index < malformed.length; index += 1) {
            expect(() => fromJsonSchema(malformed[index])).not.toThrow();
            expect(fromJsonSchema(malformed[index]).ok).toBe(false);
        }
        expect(fromJsonSchema(inheritedType).ok).toBe(true);
        expect(getterReads).toBe(0);
    });

    test("registry metadata export avoids getters and prototype mutation", () => {
        let getterReads = 0;
        const docs = registry<GlobalRegistryMetadata>();
        const User = t.object({
            name: t.string
        });
        const metadata = Object.create(null) as GlobalRegistryMetadata;
        Object.defineProperty(metadata, "id", {
            enumerable: true,
            value: "User"
        });
        Object.defineProperty(metadata, "title", {
            enumerable: true,
            get(): string {
                getterReads += 1;
                throw new Error("metadata getter executed");
            }
        });
        Object.defineProperty(metadata, "__proto__", {
            enumerable: true,
            value: {
                polluted: true
            }
        });
        docs.add(User, metadata);

        const result = toJsonSchema(User, {
            metadata: docs
        });

        expect(result.ok).toBe(true);
        expect(getterReads).toBe(0);
        expect(({} as { readonly polluted?: boolean }).polluted).toBeUndefined();
        if (result.ok) {
            const schema = result.value as Record<string, unknown>;
            expect(schema["$id"]).toBe("User");
            expect(Object.prototype.hasOwnProperty.call(schema, "__proto__")).toBe(true);
            expect(Object.getPrototypeOf(schema)).not.toEqual({ polluted: true });
        }
    });

    test("JWT alg check rejects trailing header JSON bytes", () => {
        const trailingHeader = Buffer
            .from("{\"alg\":\"HS256\"}{\"alg\":\"none\"}")
            .toString("base64url");
        const token = `${trailingHeader}.e30.sig`;

        expect(t.jwt({ alg: "HS256" }).is(token)).toBe(false);
    });

    test("readonly Map finalization does not execute public iterators", () => {
        const Guard = t.map(
            t.string,
            t.object({
                name: t.string
            }).readonly()
        );
        const value = new Map<string, { name: string }>([[
            "user",
            { name: "Ada" }
        ]]);
        Object.defineProperty(value, Symbol.iterator, {
            value(): never {
                throw new Error("custom iterator executed");
            }
        });

        expect(() => Guard.check(value)).not.toThrow();
        const result = Guard.check(value);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(Object.isFrozen(result.value.get("user"))).toBe(true);
        }
    });

    test("async Map size checks yield while counting large maps", async () => {
        const Guard = compileAsync(t.map(t.string, t.number).min(1), {
            yieldEvery: 1,
            yieldTimeout: 0
        });
        const value = new Map<string, number>();
        for (let index = 0; index < 512; index += 1) {
            value.set(String(index), index);
        }

        await expect(Guard.is(value)).resolves.toBe(true);
    });

    test("safe validators fail closed on hostile Proxy reflection traps", async () => {
        const Guard = t.object({
            id: t.string
        });
        const Compiled = compile(Guard, {
            name: "proxy_reflection_safe"
        });
        const Async = compileAsync(Guard, {
            name: "proxy_reflection_async",
            yieldEvery: 1,
            yieldTimeout: 0
        });
        const hostile = new Proxy({ id: "ok" }, {
            getOwnPropertyDescriptor(): never {
                throw new Error("descriptor trap");
            },
            ownKeys(): never {
                throw new Error("ownKeys trap");
            }
        });
        const revoked = Proxy.revocable({ id: "ok" }, {});
        revoked.revoke();

        for (const value of [hostile, revoked.proxy]) {
            expect(() => Guard.is(value)).not.toThrow();
            expect(Guard.is(value)).toBe(false);
            expect(() => Guard.check(value)).not.toThrow();
            expect(Guard.check(value).ok).toBe(false);
            expect(() => Compiled.is(value)).not.toThrow();
            expect(Compiled.is(value)).toBe(false);
            expect(() => Compiled.check(value)).not.toThrow();
            expect(Compiled.check(value).ok).toBe(false);
            await expect(Async.is(value)).resolves.toBe(false);
        }
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
