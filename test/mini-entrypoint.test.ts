import { describe, expect, expectTypeOf, test } from "vitest";
import * as mini from "../src/mini.js";

interface MiniUser {
    readonly name: string;
    readonly tags: string[];
    readonly nickname?: string | null;
}

describe("mini entrypoint", () => {
    test("exposes functional schema builders without the root namespace", () => {
        const User = mini.object({
            name: mini.string().min(1),
            tags: mini.array(mini.string().min(1)).max(3),
            nickname: mini.nullish(mini.string())
        });
        const MaybeName = mini.nullable(mini.optional(mini.string()));
        const UpperName = mini.transform(mini.string(), (value, context) => {
            if (value !== value.toUpperCase()) {
                context.issues.push({
                    path: ["name"],
                    message: "uppercase text expected"
                });
                return mini.NEVER;
            }
            return value;
        });
        const CheckedName = mini.apply(
            mini.string(),
            mini.minLength(2),
            mini.maxLength(8),
            mini.includes("Sea")
        );
        const CheckedTags = mini.apply(
            mini.array(mini.string()),
            mini.minSize(1),
            mini.maxSize(2)
        );
        const CheckedScores = mini.apply(
            mini.array(mini.number()),
            mini.size(2)
        );
        const CheckedNumber = mini.apply(
            mini.number(),
            mini.gte(1),
            mini.lte(5),
            mini.multipleOf(1)
        );
        const CheckedBigInt = mini.apply(
            mini.bigint(),
            mini.positive()
        );
        const Trimmed = mini.apply(
            mini.string(),
            mini.trim()
        );

        expectTypeOf<mini.Infer<typeof User>>().toEqualTypeOf<MiniUser>();
        expectTypeOf<mini.Infer<typeof CheckedName>>().toEqualTypeOf<string>();
        expectTypeOf<mini.Infer<typeof CheckedTags>>().toEqualTypeOf<string[]>();
        expectTypeOf<mini.Infer<typeof CheckedNumber>>().toEqualTypeOf<number>();
        expect(User.is({
            name: "TypeSea",
            tags: ["fast"],
            nickname: null
        })).toBe(true);
        expect(User.is({
            name: "",
            tags: []
        })).toBe(false);
        expect(MaybeName.is(undefined)).toBe(true);
        expect(MaybeName.is(null)).toBe(true);
        expect(mini.null().is(null)).toBe(true);
        expect(mini.undefined().is(undefined)).toBe(true);
        expect(mini.unknown().is(Symbol("value"))).toBe(true);
        expect(mini.void().is(undefined)).toBe(true);
        expect(mini.never().is("value")).toBe(false);
        expect(CheckedName.is("TypeSea")).toBe(true);
        expect(CheckedName.is("SeaScript")).toBe(false);
        expect(CheckedTags.is(["a"])).toBe(true);
        expect(CheckedTags.is([])).toBe(false);
        expect(CheckedScores.is([1, 2])).toBe(true);
        expect(CheckedScores.is([1])).toBe(false);
        expect(CheckedNumber.is(3)).toBe(true);
        expect(CheckedNumber.is(6)).toBe(false);
        expect(CheckedBigInt.is(1n)).toBe(true);
        expect(CheckedBigInt.is(0n)).toBe(false);

        const decoded = mini.decode(UpperName, "TYPESEA");
        const rejected = mini.decode(UpperName, "TypeSea");
        const trimmed = mini.decode(Trimmed, " TypeSea ");

        expect(decoded).toEqual({
            ok: true,
            value: "TYPESEA"
        });
        expect(trimmed).toEqual({
            ok: true,
            value: "TypeSea"
        });
        expect(rejected.ok).toBe(false);
        if (!rejected.ok) {
            expect(rejected.error[0]).toMatchObject({
                path: ["name"],
                message: "uppercase text expected"
            });
        }
    });
});
