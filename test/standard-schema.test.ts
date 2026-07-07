import { describe, expect, expectTypeOf, test } from "vitest";
import {
    t,
    type StandardSchemaV1,
    type StandardSchemaV1InferInput,
    type StandardSchemaV1InferOutput
} from "../src/index.js";

describe("Standard Schema interoperability", () => {
    test("exposes Standard Schema V1 on guards", async () => {
        const User = t.object({
            id: t.string.min(1),
            age: t.number.int().gte(0)
        });
        const standard = User["~standard"];
        const valid = await standard.validate({
            id: "u_1",
            age: 42
        });
        const invalid = await standard.validate({
            id: "",
            age: -1
        });

        expectTypeOf<typeof User>().toExtend<StandardSchemaV1<
            {
                readonly id: string;
                readonly age: number;
            }
        >>();
        expectTypeOf<StandardSchemaV1InferInput<typeof User>>().toEqualTypeOf<{
            readonly id: string;
            readonly age: number;
        }>();
        expectTypeOf<StandardSchemaV1InferOutput<typeof User>>().toEqualTypeOf<{
            readonly id: string;
            readonly age: number;
        }>();
        expect(standard.version).toBe(1);
        expect(standard.vendor).toBe("typesea");
        expect(valid).toEqual({
            value: {
                id: "u_1",
                age: 42
            }
        });
        expect(invalid.issues).toBeDefined();
        if (invalid.issues !== undefined) {
            expect(invalid.issues[0]?.message).toContain("expected_min_length");
            expect(invalid.issues[0]?.path).toEqual(["id"]);
            expect(Object.isFrozen(invalid.issues)).toBe(true);
        }
    });

    test("exposes Standard Schema V1 on decoders and codecs", async () => {
        const Count = t.coerce.number().pipe(t.number.int().gte(0));
        const NumberText = t.codecs.stringToInt();
        const countValid = await Count["~standard"].validate("42");
        const countInvalid = await Count["~standard"].validate("-1");
        const codecValid = await NumberText["~standard"].validate("42");
        const codecInvalid = await NumberText["~standard"].validate("1.5");

        expectTypeOf<StandardSchemaV1InferInput<typeof Count>>().toEqualTypeOf<unknown>();
        expectTypeOf<StandardSchemaV1InferOutput<typeof Count>>().toEqualTypeOf<number>();
        expectTypeOf<StandardSchemaV1InferInput<typeof NumberText>>()
            .toEqualTypeOf<string>();
        expectTypeOf<StandardSchemaV1InferOutput<typeof NumberText>>()
            .toEqualTypeOf<number>();
        expect(countValid).toEqual({
            value: 42
        });
        expect(codecValid).toEqual({
            value: 42
        });
        expect(countInvalid.issues).toBeDefined();
        expect(codecInvalid.issues).toBeDefined();
    });
});
