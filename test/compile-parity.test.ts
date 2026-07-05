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

    test("rejects strict object non-enumerable and symbol extras", () => {
        const Shape = t.strictObject({
            id: t.string
        });
        const FastShape = compile(Shape, { name: "strict_own_key_shape" });
        const symbolKey = Symbol("extra");
        const nonEnumerableExtra: Record<PropertyKey, unknown> = {
            id: "u-1"
        };
        const symbolExtra: Record<PropertyKey, unknown> = {
            id: "u-1",
            [symbolKey]: true
        };

        Object.defineProperty(nonEnumerableExtra, "hidden", {
            configurable: true,
            enumerable: false,
            value: true
        });

        expect(Shape.is(nonEnumerableExtra)).toBe(false);
        expect(FastShape.is(nonEnumerableExtra)).toBe(false);
        expect(FastShape.check(nonEnumerableExtra)).toEqual(Shape.check(nonEnumerableExtra));
        expect(Shape.is(symbolExtra)).toBe(false);
        expect(FastShape.is(symbolExtra)).toBe(false);
        expect(FastShape.check(symbolExtra)).toEqual(Shape.check(symbolExtra));
    });

    test("returns at most one issue from checkFirst", () => {
        const Shape = t.strictObject({
            id: t.string.min(2),
            age: t.number.int().gte(0)
        });
        const FastShape = compile(Shape, { name: "first_issue_shape" });
        const invalid = {
            id: "",
            age: -1,
            extra: true
        };
        const interpreted = Shape.checkFirst(invalid);
        const compiled = FastShape.checkFirst(invalid);

        expect(Shape.checkFirst({ id: "ok", age: 1 }).ok).toBe(true);
        expect(FastShape.checkFirst({ id: "ok", age: 1 }).ok).toBe(true);
        expect(interpreted.ok).toBe(false);
        expect(compiled.ok).toBe(false);
        if (!interpreted.ok && !compiled.ok) {
            expect(interpreted.error).toHaveLength(1);
            expect(compiled.error).toHaveLength(1);
            expect(Object.isFrozen(interpreted.error)).toBe(true);
            expect(Object.isFrozen(compiled.error)).toBe(true);
            expect(compiled.error[0]).toEqual(interpreted.error[0]);
        }
    });

    test("stops compiled checkFirst after the first diagnostic", () => {
        let firstRefinements = 0;
        let secondRefinements = 0;
        const Shape = t.strictObject({
            first: t.string.refine(
                (): boolean => {
                    firstRefinements += 1;
                    return false;
                },
                "first_refinement"
            ),
            second: t.string.refine(
                (): boolean => {
                    secondRefinements += 1;
                    return false;
                },
                "second_refinement"
            )
        });
        const FastShape = compile(Shape, { name: "firstFaultStops" });
        const result = FastShape.checkFirst({
            first: "a",
            second: "b"
        });

        expect(result.ok).toBe(false);
        expect(firstRefinements).toBeGreaterThan(0);
        expect(secondRefinements).toBe(0);
        if (!result.ok) {
            expect(result.error).toHaveLength(1);
            expect(result.error[0]?.path).toEqual(["first"]);
        }
    });

    test("keeps diagnostic order independent from predicate scheduling", () => {
        const Shape = t.strictObject({
            tags: t.array(t.string.min(1)),
            id: t.string.min(2)
        });
        const FastShape = compile(Shape, { name: "diagnostic_order_shape" });
        const invalid = {
            tags: [""],
            id: ""
        };
        const full = FastShape.check(invalid);
        const first = FastShape.checkFirst(invalid);

        expect(full).toEqual(Shape.check(invalid));
        expect(first).toEqual(Shape.checkFirst(invalid));
        if (!full.ok && !first.ok) {
            expect(full.error[0]?.path).toEqual(["tags", 0]);
            expect(first.error[0]?.path).toEqual(["tags", 0]);
        }
    });

    test("does not move pure object checks before refinement barriers", () => {
        let refinements = 0;
        const Shape = t.strictObject({
            gated: t.string.refine(
                (value): boolean => {
                    refinements += 1;
                    return value.length > 0;
                },
                "non_empty"
            ),
            cheap: t.number.int()
        });
        const FastShape = compile(Shape, { name: "refinement_barrier_shape" });

        expect(FastShape.is({
            gated: "ok",
            cheap: 1.5
        })).toBe(false);
        expect(refinements).toBe(1);
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

        const hugeSparse = new Array<unknown>(10_000_000);
        const highAccessor = new Array<unknown>(10_000_000);
        Object.defineProperty(highAccessor, "9999999", {
            configurable: true,
            enumerable: true,
            get(): never {
                throw new Error("array getter must not execute");
            }
        });

        expect(MaybeStringArray.is(hugeSparse)).toBe(true);
        expect(FastMaybeStringArray.is(hugeSparse)).toBe(true);
        expect(FastMaybeStringArray.check(hugeSparse)).toEqual(MaybeStringArray.check(hugeSparse));
        expect(MaybeStringArray.is(highAccessor)).toBe(false);
        expect(FastMaybeStringArray.is(highAccessor)).toBe(false);
        expect(FastMaybeStringArray.check(highAccessor)).toEqual(MaybeStringArray.check(highAccessor));
    });

    test("rejects sparse holes behind opaque array items", () => {
        let predicateReads = 0;
        const Refined = t.array(t.string.refine(
            (value): boolean => {
                predicateReads += 1;
                return value.length > 0;
            },
            "non_empty"
        ));
        const FastRefined = compile(Refined, { name: "sparse_refined_array" });
        const refinedHole = new Array<unknown>(1);
        const UndefinedRefined = t.array(t.undefinedable(t.string).refine(
            (value): boolean => value !== undefined,
            "present"
        ));
        const FastUndefinedRefined = compile(UndefinedRefined, {
            name: "sparse_undefined_refined_array"
        });
        const undefinedRefinedHole = new Array<unknown>(1);
        const Lazy = t.array(t.lazy(() => t.string));
        const FastLazy = compile(Lazy, { name: "sparse_lazy_array" });
        const lazyHole = new Array<unknown>(1);

        expect(Refined.is(refinedHole)).toBe(false);
        expect(FastRefined.is(refinedHole)).toBe(false);
        expect(predicateReads).toBe(0);
        expect(FastRefined.check(refinedHole)).toEqual(Refined.check(refinedHole));
        expect(UndefinedRefined.is(undefinedRefinedHole)).toBe(false);
        expect(FastUndefinedRefined.is(undefinedRefinedHole)).toBe(false);
        expect(FastUndefinedRefined.check(undefinedRefinedHole))
            .toEqual(UndefinedRefined.check(undefinedRefinedHole));
        expect(Lazy.is(lazyHole)).toBe(false);
        expect(FastLazy.is(lazyHole)).toBe(false);
        expect(FastLazy.check(lazyHole)).toEqual(Lazy.check(lazyHole));
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

/**
 * @brief Execute assert parity.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Build samples.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Generate value.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Generate string.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function randomString(rng: Rng): string {
    const alphabet = "abckinduserpoint";
    const length = rng.nextInt(8);
    let value = "";
    for (let index = 0; index < length; index += 1) {
        value += alphabet.charAt(rng.nextInt(alphabet.length));
    }
    return value;
}

/**
 * @brief Generate array.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function randomArray(rng: Rng, depth: number): unknown[] {
    const length = rng.nextInt(5);
    const value = new Array<unknown>(length);
    for (let index = 0; index < length; index += 1) {
        value[index] = randomValue(rng, depth + 1);
    }
    return value;
}

/**
 * @brief Generate record.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function randomRecord(rng: Rng, depth: number): Readonly<Record<string, unknown>> {
    const length = rng.nextInt(5);
    const value: Record<string, unknown> = {};
    for (let index = 0; index < length; index += 1) {
        value[`k${String(index)}`] = randomValue(rng, depth + 1);
    }
    return value;
}

/**
 * @brief Generate tagged record.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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
