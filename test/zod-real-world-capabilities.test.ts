import { describe, expect, expectTypeOf, test } from "vitest";
import { t } from "../src/index.js";
import { z } from "../src/zod.js";

describe("real-world Zod capability preservation", () => {
    test("retains string and array checks after decoder transforms", () => {
        const Tags = z.array(
            z.string().transform((value) => value.toUpperCase())
        ).min(1);
        const Name = z.string().trim().min(2);
        const User = z.object({
            name: Name,
            tags: Tags
        });

        type NameInput = z.input<typeof Name>;
        type TagsOutput = z.output<typeof Tags>;

        expectTypeOf<NameInput>().toEqualTypeOf<string>();
        expectTypeOf<TagsOutput>().toEqualTypeOf<string[]>();
        expect(User.parse({
            name: " Ada ",
            tags: ["compiler"],
            ignored: true
        })).toEqual({
            name: "Ada",
            tags: ["COMPILER"]
        });
        expect(Tags.safeParse([]).success).toBe(false);
    });

    test("preserves object operations across decoder and metadata boundaries", () => {
        const General = z.object({
            enabled: z.boolean().optional()
        });
        const Profile = z.object({
            name: z.string().trim()
        }).describe("profile");
        const Contact = z.object({
            email: z.string().optional()
        }).describe("contact");
        const Combined = General.merge(Profile).merge(Contact);
        const Picked = Combined.pick({
            name: true,
            email: true
        });

        expect(Picked.parse({
            enabled: true,
            name: " Ada ",
            email: "ada@example.test"
        })).toEqual({
            name: "Ada",
            email: "ada@example.test"
        });
    });

    test("uses Zod truthiness without weakening native TypeSea refinements", () => {
        const Compatible = z.object({
            primary: z.string().optional(),
            secondary: z.string().optional()
        }).refine((value) => value.primary ?? value.secondary);
        const strictString = t.string as unknown as {
            refine(
                predicate: (value: string) => unknown,
                name: string
            ): ReturnType<typeof t.string.refine>;
        };

        expect(Compatible.safeParse({ primary: "yes" }).success).toBe(true);
        expect(Compatible.safeParse({}).success).toBe(false);
        expect(strictString.refine(() => "truthy", "strict").safeParse("value").success)
            .toBe(false);
    });

    test("keeps recursive union inputs correlated through lazy schemas", () => {
        interface Condition {
            readonly field: string;
            readonly value: string;
        }

        interface FilterGroup {
            readonly logicalOperator: "AND" | "OR";
            readonly conditions: (Condition | FilterGroup)[];
        }

        const ConditionSchema = z.object({
            field: z.string(),
            value: z.string()
        });
        const FilterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() => z.object({
            logicalOperator: z.enum(["AND", "OR"]),
            conditions: z.array(z.union([ConditionSchema, FilterGroupSchema]))
        }));

        expect(FilterGroupSchema.parse({
            logicalOperator: "AND",
            conditions: [
                { field: "status", value: "active" },
                { logicalOperator: "OR", conditions: [] }
            ]
        })).toEqual({
            logicalOperator: "AND",
            conditions: [
                { field: "status", value: "active" },
                { logicalOperator: "OR", conditions: [] }
            ]
        });
    });

    test("removes undefined from default output types", () => {
        const Hostname = z.string().optional().default("typesea.dev");
        type Hostname = z.output<typeof Hostname>;

        expectTypeOf<Hostname>().toEqualTypeOf<string>();
        expect(Hostname.parse(undefined)).toBe("typesea.dev");
    });

    test("does not execute hostile data or key-mask accessors", () => {
        const Schema = z.object({
            name: z.string().trim()
        });
        let dataReads = 0;
        let maskReads = 0;
        const input = Object.create(null) as Record<string, unknown>;
        const mask = Object.create(null) as Record<string, boolean>;
        Object.defineProperty(input, "name", {
            enumerable: true,
            get: (): string => {
                dataReads += 1;
                return "Ada";
            }
        });
        Object.defineProperty(mask, "name", {
            enumerable: true,
            get: (): boolean => {
                maskReads += 1;
                return true;
            }
        });

        expect(Schema.safeParse(input).success).toBe(false);
        expect(() => Schema.pick(mask as unknown as { readonly name: true }))
            .toThrow(TypeError);
        expect(dataReads).toBe(0);
        expect(maskReads).toBe(0);
    });

    test("keeps indexed safeParse results correlated with generic keys", () => {
        const Catalog = {
            count: z.number(),
            label: z.string(),
            enabled: z.boolean()
        } as const;

        function parseCatalog<TKey extends keyof typeof Catalog>(
            key: TKey,
            value: unknown
        ): z.SafeParseReturnType<unknown, z.infer<(typeof Catalog)[TKey]>> {
            return Catalog[key].safeParse(value);
        }

        expect(parseCatalog("count", 42)).toEqual({ success: true, data: 42 });
        expect(parseCatalog("label", 42).success).toBe(false);
    });
});
