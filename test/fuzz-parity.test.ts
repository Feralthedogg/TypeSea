import { describe, expect, test } from "vitest";
import {
    NodeTag,
    NumberCheckTag,
    PresenceTag,
    SchemaTag,
    StringCheckTag
} from "../src/kind/index.js";
import {
    compile,
    t,
    type Graph,
    type Guard,
    type Presence
} from "../src/index.js";
import type { Schema } from "../src/schema/index.js";

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

    test("keeps unsafe and unchecked modes aligned on trusted plain data", () => {
        const context: FuzzContext = {
            marker: Symbol("fuzz_marker")
        };
        const schemaRng = new Rng(0x745eaf01);
        const plainValues = makePlainValues(context);

        for (let schemaIndex = 0; schemaIndex < 64; schemaIndex += 1) {
            const guard = randomGuard(schemaRng, context, 0);
            const name = `mode_fuzz_${String(schemaIndex)}`;
            const safe = compile(guard, { name: `${name}_safe` });
            const unsafe = compile(guard, {
                name: `${name}_unsafe`,
                mode: "unsafe"
            });
            const unchecked = compile(guard, {
                name: `${name}_unchecked`,
                mode: "unchecked"
            });
            const trustedValues = makeTrustedShapeValues(
                guard.schema,
                context,
                new Rng(0x57afe000 + schemaIndex)
            );

            for (let valueIndex = 0; valueIndex < plainValues.length; valueIndex += 1) {
                const value = plainValues[valueIndex];
                const label = `${name} plain value ${String(valueIndex)}`;
                const safeIs = safe.is(value);

                expect(unsafe.is(value), label).toBe(safeIs);
                expect(unsafe.check(value).ok, label).toBe(safe.check(value).ok);
                if (safeIs) {
                    expect(unchecked.is(value), label).toBe(true);
                    expect(unchecked.check(value).ok, label).toBe(true);
                }
            }

            for (let valueIndex = 0; valueIndex < trustedValues.length; valueIndex += 1) {
                const value = trustedValues[valueIndex];
                const label = `${name} trusted value ${String(valueIndex)}`;
                const safeIs = safe.is(value);
                const safeCheckOk = safe.check(value).ok;

                expect(unsafe.is(value), label).toBe(safeIs);
                expect(unsafe.check(value).ok, label).toBe(safeCheckOk);
                expect(unchecked.is(value), label).toBe(safeIs);
                expect(unchecked.check(value).ok, label).toBe(safeCheckOk);
            }
        }
    });
});

/**
 * @brief Generate guard.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Generate leaf guard.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Generate optional wrapper.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Generate object guard.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function randomObjectGuard(
    rng: Rng,
    context: FuzzContext,
    depth: number
): Guard<unknown, Presence> {
    return t.object(randomShape(rng, context, depth));
}

/**
 * @brief Generate strict object guard.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function randomStrictObjectGuard(
    rng: Rng,
    context: FuzzContext,
    depth: number
): Guard<unknown, Presence> {
    return t.strictObject(randomShape(rng, context, depth));
}

/**
 * @brief Generate shape.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Generate discriminated union.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Generate literal.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Build values.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Build plain values.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function makePlainValues(context: FuzzContext): readonly unknown[] {
    const rng = new Rng(0x51ea0002);
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
        Symbol("plain_other"),
        [],
        ["a", 1],
        ["alpha", "beta"],
        {},
        { a: "a" },
        { a: "a", b: 1, c: null },
        { a: undefined, b: "b" },
        { a: "a", b: 1, extra: true },
        { kind: "alpha", value: "a" },
        { kind: "alpha", value: undefined },
        { kind: "beta", flag: true },
        { kind: "beta", flag: "true" }
    ];

    for (let index = 0; index < 128; index += 1) {
        values.push(randomPlainValue(rng, context, 0));
    }
    return values;
}

/**
 * @brief Generate plain value.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function randomPlainValue(
    rng: Rng,
    context: FuzzContext,
    depth: number
): unknown {
    const tag = rng.nextInt(depth >= 3 ? 10 : 13);
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
            return rng.nextInt(2) === 0 ? context.marker : Symbol("plain_generated");
        case 8:
            return randomPlainArray(rng, context, depth);
        case 9:
            return randomPlainRecord(rng, context, depth);
        default:
            return randomPlainTaggedRecord(rng, context, depth);
    }
}

/**
 * @brief Generate plain array.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function randomPlainArray(
    rng: Rng,
    context: FuzzContext,
    depth: number
): unknown[] {
    const length = rng.nextInt(5);
    const value = new Array<unknown>(length);
    for (let index = 0; index < length; index += 1) {
        value[index] = randomPlainValue(rng, context, depth + 1);
    }
    return value;
}

/**
 * @brief Generate plain record.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function randomPlainRecord(
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
            value[key] = randomPlainValue(rng, context, depth + 1);
        }
    }
    return value;
}

/**
 * @brief Generate plain tagged record.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function randomPlainTaggedRecord(
    rng: Rng,
    context: FuzzContext,
    depth: number
): Readonly<Record<string, unknown>> {
    const kind = rng.nextInt(3) === 0 ? "alpha" : rng.nextInt(2) === 0 ? "beta" : "other";
    const value: Record<string, unknown> = {
        kind
    };
    if (kind === "alpha") {
        value["value"] = randomPlainValue(rng, context, depth + 1);
    } else if (kind === "beta") {
        value["flag"] = randomPlainValue(rng, context, depth + 1);
    } else {
        value["extra"] = randomPlainValue(rng, context, depth + 1);
    }
    return value;
}

/**
 * @brief Build trusted shape values.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function makeTrustedShapeValues(
    schema: Schema,
    context: FuzzContext,
    rng: Rng
): readonly unknown[] {
    return makeTrustedShapeValuesInner(schema, context, rng, 0, new WeakSet<object>());
}

/**
 * @brief Build trusted shape values inner.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function makeTrustedShapeValuesInner(
    schema: Schema,
    context: FuzzContext,
    rng: Rng,
    depth: number,
    visiting: WeakSet<object>
): readonly unknown[] {
    if (depth >= 5) {
        return [preferredTrustedValue(schema, context, rng, depth, visiting)];
    }
    if (visiting.has(schema)) {
        return [undefined];
    }
    visiting.add(schema);
    const values = makeTrustedShapeValuesForSchema(
        schema,
        context,
        rng,
        depth,
        visiting
    );
    visiting.delete(schema);
    return values;
}

/**
 * @brief Build trusted shape values for schema.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function makeTrustedShapeValuesForSchema(
    schema: Schema,
    context: FuzzContext,
    rng: Rng,
    depth: number,
    visiting: WeakSet<object>
): readonly unknown[] {
    switch (schema.tag) {
        case SchemaTag.Unknown:
            return [undefined, null, "", 0, {}, []];
        case SchemaTag.Never:
            return [undefined, null, ""];
        case SchemaTag.String:
            return [preferredString(schema), "", "a", "ab", 1];
        case SchemaTag.Number:
            return [preferredNumber(schema), -1, 0, 1, 1.5, Number.NaN, "1"];
        case SchemaTag.BigInt:
            return [0n, 1n, 1];
        case SchemaTag.Symbol:
            return [context.marker, Symbol("trusted_symbol"), "symbol"];
        case SchemaTag.Boolean:
            return [true, false, "true"];
        case SchemaTag.Literal:
            return [schema.value, mutatedLiteral(schema.value)];
        case SchemaTag.Array:
            return trustedArrayValues(schema.item, context, rng, depth, visiting);
        case SchemaTag.Tuple:
            return trustedTupleValues(schema.items, context, rng, depth, visiting);
        case SchemaTag.Record:
            return trustedRecordValues(schema.value, context, rng, depth, visiting);
        case SchemaTag.Object:
            return trustedObjectValues(schema, context, rng, depth, visiting);
        case SchemaTag.Union:
            return trustedUnionValues(schema.options, context, rng, depth, visiting);
        case SchemaTag.Intersection:
            return [
                ...makeTrustedShapeValuesInner(schema.left, context, rng, depth + 1, visiting),
                ...makeTrustedShapeValuesInner(schema.right, context, rng, depth + 1, visiting)
            ];
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
            return [
                undefined,
                ...makeTrustedShapeValuesInner(schema.inner, context, rng, depth + 1, visiting)
            ];
        case SchemaTag.Nullable:
            return [
                null,
                ...makeTrustedShapeValuesInner(schema.inner, context, rng, depth + 1, visiting)
            ];
        case SchemaTag.DiscriminatedUnion:
            return trustedDiscriminatedUnionValues(schema, context, rng, depth, visiting);
        case SchemaTag.Brand:
        case SchemaTag.Refine:
            return makeTrustedShapeValuesInner(schema.inner, context, rng, depth + 1, visiting);
        case SchemaTag.Lazy:
            return makeTrustedShapeValuesInner(schema.get(), context, rng, depth + 1, visiting);
        default:
            return [undefined];
    }
}

/**
 * @brief Execute trusted array values.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function trustedArrayValues(
    item: Schema,
    context: FuzzContext,
    rng: Rng,
    depth: number,
    visiting: WeakSet<object>
): readonly unknown[] {
    const preferred = preferredTrustedValue(item, context, rng, depth + 1, visiting);
    const invalid = invalidTrustedValue(item);
    return [
        [],
        [preferred],
        [preferred, preferred],
        [invalid]
    ];
}

/**
 * @brief Execute trusted tuple values.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function trustedTupleValues(
    items: readonly Schema[],
    context: FuzzContext,
    rng: Rng,
    depth: number,
    visiting: WeakSet<object>
): readonly unknown[] {
    const tuple = new Array<unknown>(items.length);
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (item !== undefined) {
            tuple[index] = preferredTrustedValue(item, context, rng, depth + 1, visiting);
        }
    }
    const invalidTuple = tuple.slice();
    const first = items[0];
    if (first !== undefined) {
        invalidTuple[0] = invalidTrustedValue(first);
    }
    return [
        tuple,
        tuple.slice(0, Math.max(0, tuple.length - 1)),
        [...tuple, "extra"],
        invalidTuple
    ];
}

/**
 * @brief Execute trusted record values.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function trustedRecordValues(
    valueSchema: Schema,
    context: FuzzContext,
    rng: Rng,
    depth: number,
    visiting: WeakSet<object>
): readonly unknown[] {
    const preferred = preferredTrustedValue(
        valueSchema,
        context,
        rng,
        depth + 1,
        visiting
    );
    return [
        {},
        { a: preferred },
        { a: preferred, b: preferred },
        { bad: invalidTrustedValue(valueSchema) }
    ];
}

/**
 * @brief Execute trusted object values.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function trustedObjectValues(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    context: FuzzContext,
    rng: Rng,
    depth: number,
    visiting: WeakSet<object>
): readonly unknown[] {
    const requiredOnly: Record<string, unknown> = {};
    const withOptional: Record<string, unknown> = {};
    const entries = schema.entries;

    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
            continue;
        }
        const preferred = preferredTrustedValue(
            entry.schema,
            context,
            rng,
            depth + 1,
            visiting
        );
        if (entry.presence === PresenceTag.Required) {
            requiredOnly[entry.key] = preferred;
        }
        withOptional[entry.key] = preferred;
    }

    const invalidField = { ...withOptional };
    const firstRequired = firstRequiredObjectEntry(schema);
    if (firstRequired !== undefined) {
        invalidField[firstRequired.key] = invalidTrustedValue(firstRequired.schema);
    }

    return [
        requiredOnly,
        withOptional,
        invalidField
    ];
}

/**
 * @brief Execute trusted union values.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function trustedUnionValues(
    options: readonly Schema[],
    context: FuzzContext,
    rng: Rng,
    depth: number,
    visiting: WeakSet<object>
): readonly unknown[] {
    const values: unknown[] = [];
    for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        if (option !== undefined) {
            values.push(...makeTrustedShapeValuesInner(
                option,
                context,
                rng,
                depth + 1,
                visiting
            ));
        }
    }
    return values;
}

/**
 * @brief Execute trusted discriminated union values.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function trustedDiscriminatedUnionValues(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.DiscriminatedUnion }>,
    context: FuzzContext,
    rng: Rng,
    depth: number,
    visiting: WeakSet<object>
): readonly unknown[] {
    const values: unknown[] = [];
    const cases = schema.cases;
    for (let index = 0; index < cases.length; index += 1) {
        const item = cases[index];
        if (item !== undefined) {
            values.push(...makeTrustedShapeValuesInner(
                item.schema,
                context,
                rng,
                depth + 1,
                visiting
            ));
        }
    }
    values.push({ [schema.key]: "missing" });
    return values;
}

/**
 * @brief Execute preferred trusted value.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function preferredTrustedValue(
    schema: Schema,
    context: FuzzContext,
    rng: Rng,
    depth: number,
    visiting: WeakSet<object>
): unknown {
    switch (schema.tag) {
        case SchemaTag.Unknown:
            return null;
        case SchemaTag.Never:
            return undefined;
        case SchemaTag.String:
            return preferredString(schema);
        case SchemaTag.Number:
            return preferredNumber(schema);
        case SchemaTag.BigInt:
            return 1n;
        case SchemaTag.Symbol:
            return context.marker;
        case SchemaTag.Boolean:
            return true;
        case SchemaTag.Literal:
            return schema.value;
        case SchemaTag.Array:
            return [];
        case SchemaTag.Tuple:
            return trustedTupleValues(schema.items, context, rng, depth + 1, visiting)[0];
        case SchemaTag.Record:
            return {};
        case SchemaTag.Object:
            return trustedObjectValues(schema, context, rng, depth + 1, visiting)[1];
        case SchemaTag.Union: {
            const option = schema.options[0];
            return option === undefined
                ? undefined
                : preferredTrustedValue(option, context, rng, depth + 1, visiting);
        }
        case SchemaTag.Intersection:
            return preferredTrustedValue(schema.left, context, rng, depth + 1, visiting);
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
            return undefined;
        case SchemaTag.Nullable:
            return null;
        case SchemaTag.DiscriminatedUnion: {
            const item = schema.cases[0];
            return item === undefined
                ? { [schema.key]: "missing" }
                : preferredTrustedValue(item.schema, context, rng, depth + 1, visiting);
        }
        case SchemaTag.Brand:
        case SchemaTag.Refine:
            return preferredTrustedValue(schema.inner, context, rng, depth + 1, visiting);
        case SchemaTag.Lazy:
            if (visiting.has(schema)) {
                return undefined;
            }
            return preferredTrustedValue(schema.get(), context, rng, depth + 1, visiting);
        default:
            return undefined;
    }
}

/**
 * @brief Execute preferred string.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function preferredString(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.String }>
): string {
    let min = 0;
    let max = Number.POSITIVE_INFINITY;
    let requiresUuid = false;
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        if (check.tag === StringCheckTag.Min) {
            min = Math.max(min, check.value);
        } else if (check.tag === StringCheckTag.Max) {
            max = Math.min(max, check.value);
        } else if (check.tag === StringCheckTag.Uuid) {
            requiresUuid = true;
        }
    }
    if (requiresUuid) {
        return "550e8400-e29b-41d4-a716-446655440000";
    }
    let value = "a".repeat(Math.max(1, min));
    if (value.length > max) {
        value = "a".repeat(Math.max(0, max));
    }
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check?.tag === StringCheckTag.Regex && !regexAccepts(check.regex, value)) {
            value = regexAccepts(check.regex, "ab") ? "ab" : "";
        }
    }
    return value;
}

/**
 * @brief Execute preferred number.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function preferredNumber(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Number }>
): number {
    let min = Number.NEGATIVE_INFINITY;
    let max = Number.POSITIVE_INFINITY;
    let integer = false;
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        if (check.tag === NumberCheckTag.Integer) {
            integer = true;
        } else if (check.tag === NumberCheckTag.Gte) {
            min = Math.max(min, check.value);
        } else {
            max = Math.min(max, check.value);
        }
    }
    let value = Math.max(min, 1);
    if (value > max) {
        value = max;
    }
    if (integer) {
        value = Math.ceil(value);
        if (value > max) {
            value = Math.floor(max);
        }
    }
    return Number.isFinite(value) ? value : 0;
}

/**
 * @brief Execute regex accepts.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function regexAccepts(regex: RegExp, value: string): boolean {
    const lastIndex = regex.lastIndex;
    regex.lastIndex = 0;
    const accepted = regex.test(value);
    regex.lastIndex = lastIndex;
    return accepted;
}

/**
 * @brief Execute mutated literal.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function mutatedLiteral(value: unknown): unknown {
    switch (typeof value) {
        case "string":
            return `${value}_x`;
        case "number":
            return Object.is(value, 1) ? 2 : 1;
        case "bigint":
            return value === 1n ? 2n : 1n;
        case "boolean":
            return !value;
        case "symbol":
            return Symbol("mutated_literal");
        case "undefined":
            return null;
        default:
            return undefined;
    }
}

/**
 * @brief Execute invalid trusted value.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function invalidTrustedValue(schema: Schema): unknown {
    switch (schema.tag) {
        case SchemaTag.String:
            return 1;
        case SchemaTag.Number:
            return "number";
        case SchemaTag.BigInt:
            return 1;
        case SchemaTag.Symbol:
            return "symbol";
        case SchemaTag.Boolean:
            return "boolean";
        case SchemaTag.Array:
        case SchemaTag.Tuple:
            return {};
        case SchemaTag.Object:
        case SchemaTag.Record:
            return null;
        case SchemaTag.Literal:
            return mutatedLiteral(schema.value);
        default:
            return "invalid";
    }
}

/**
 * @brief Execute first required object entry.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function firstRequiredObjectEntry(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>
): typeof schema.entries[number] | undefined {
    const entries = schema.entries;
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry?.presence === PresenceTag.Required) {
            return entry;
        }
    }
    return undefined;
}

/**
 * @brief Generate value.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Generate string.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function randomString(rng: Rng): string {
    const alphabet = "abckindalpha beta";
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

/**
 * @brief Build sparse array.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function makeSparseArray(): unknown[] {
    const value = new Array<unknown>(3);
    value[1] = "alpha";
    return value;
}

/**
 * @brief Build accessor array.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Generate sparse array.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Generate accessor array.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Generate record.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Build non enumerable extra record.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Build symbol extra record.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function makeSymbolExtraRecord(): Readonly<Record<PropertyKey, unknown>> {
    return {
        a: "alpha",
        [Symbol("fuzz_extra")]: true
    };
}

/**
 * @brief Build accessor record.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Generate descriptor record.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Generate symbol record.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Generate tagged record.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Execute assert graph invariants.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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

/**
 * @brief Execute mark reachable.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
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
