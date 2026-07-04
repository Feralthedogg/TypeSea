import { describe, expect, test } from "vitest";
import {
    BaseDecoder,
    t,
    toJsonSchema,
    type Decoder
} from "../src/index.js";

describe("decoder transform, pipe, and coerce semantics", () => {
    test("decodes transformed values through explicit Result containers", () => {
        const Length = t.transform(t.string.min(1), (value) => value.length);
        const PositiveLength = Length.pipe(t.number.int().gte(2));
        const valid = Length.decode("sea");
        const short = PositiveLength.decode("a");
        const invalidSource = Length.decode("");

        expect(valid).toEqual({
            ok: true,
            value: 3
        });
        expect(Object.isFrozen(valid)).toBe(true);
        expect(short.ok).toBe(false);
        if (!short.ok) {
            expect(short.error[0]?.code).toBe("expected_gte");
            expect(Object.isFrozen(short.error)).toBe(true);
        }
        expect(invalidSource.ok).toBe(false);
        if (!invalidSource.ok) {
            expect(invalidSource.error[0]?.code).toBe("expected_min_length");
        }
    });

    test("coerces primitive strings through explicit decoder paths", () => {
        const Count = t.pipe(t.coerce.number(), t.number.int().gte(0));
        const Flag = t.coerce.boolean();
        const Text = t.coerce.string();

        expect(Count.decode(" 42 ")).toEqual({
            ok: true,
            value: 42
        });
        expect(Count.decode(7)).toEqual({
            ok: true,
            value: 7
        });
        expect(Flag.decode("false")).toEqual({
            ok: true,
            value: false
        });
        expect(Text.decode(true)).toEqual({
            ok: true,
            value: "true"
        });

        const emptyNumber = Count.decode("");
        const fractional = Count.decode("1.5");
        const invalidFlag = Flag.decode("yes");
        const nanText = Text.decode(Number.NaN);

        expect(emptyNumber.ok).toBe(false);
        if (!emptyNumber.ok) {
            expect(emptyNumber.error[0]?.code).toBe("expected_number");
        }
        expect(fractional.ok).toBe(false);
        if (!fractional.ok) {
            expect(fractional.error[0]?.code).toBe("expected_integer");
        }
        expect(invalidFlag.ok).toBe(false);
        if (!invalidFlag.ok) {
            expect(invalidFlag.error[0]?.code).toBe("expected_boolean");
        }
        expect(nanText.ok).toBe(false);
        if (!nanText.ok) {
            expect(nanText.error[0]?.code).toBe("expected_string");
        }
    });

    test("rejects malformed decoder construction and receivers", () => {
        const NumberDecoder = t.coerce.number();
        const looseDecoder = t.decoder as unknown as (source: unknown) => Decoder<unknown>;
        const looseTransform = t.transform as unknown as (
            source: unknown,
            mapper: unknown
        ) => Decoder<unknown>;
        expect(() => new BaseDecoder("not_fn" as unknown as (value: unknown) => never))
            .toThrow(TypeError);
        expect(() => looseDecoder({})).toThrow(TypeError);
        expect(() => looseTransform(t.string, "not_fn")).toThrow(TypeError);
        expect(() => looseTransform({}, (value: unknown) => value)).toThrow(TypeError);
        expect(() => NumberDecoder.decode.call({}, "1")).toThrow(TypeError);
        expect(() => NumberDecoder.transform.call({}, (value: number) => value))
            .toThrow(TypeError);
        expect(() => NumberDecoder.pipe.call({}, t.number)).toThrow(TypeError);
    });

    test("rejects decoder JSON Schema export without semantic loss", () => {
        const exported = toJsonSchema(t.coerce.number());

        expect(exported.ok).toBe(false);
        if (!exported.ok) {
            expect(exported.error[0]?.code).toBe("unsupported_decoder");
            expect(Object.isFrozen(exported.error)).toBe(true);
            expect(Object.isFrozen(exported.error[0]?.path)).toBe(true);
        }
    });
});
