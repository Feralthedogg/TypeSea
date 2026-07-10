import { describe, expect, expectTypeOf, test } from "vitest";
import {
    defineMessages,
    flattenError,
    flattenIssues,
    formatError,
    formatIssue,
    formatIssues,
    prettifyError,
    t,
    toZodError,
    toZodIssue,
    toZodIssues,
    treeifyError,
    treeifyIssues,
    TypeSeaZodError,
    withMessages,
    z,
    type CheckResult,
    type FlattenedIssueMessages,
    type FormattedIssueMessages,
    type Issue,
    type IssueSource,
    type IssueMessageCatalog,
    type MessageLocale,
    type TreeifiedIssueMessages,
    type ZodErrorLike,
    type ZodIssue
} from "../src/index.js";

describe("issue message formatting and i18n", () => {
    test("formats default and localized issue messages without mutating issues", () => {
        const User = t.strictObject({
            id: t.string.min(2),
            count: t.number.int()
        });
        const result = User.check({
            id: "",
            count: 1.5,
            extra: true
        });

        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }

        const english = formatIssues(result.error);
        const korean = formatIssues(result.error, {
            locale: "ko"
        });

        expect(Object.isFrozen(english)).toBe(true);
        expect(english[0]).toBe("Expected length >= 2 at $[\"id\"]; received length 0.");
        expect(english[1]).toBe("Expected integer at $[\"count\"]; received number.");
        expect(english[2]).toBe("Unrecognized key at $[\"extra\"]; expected known key.");
        expect(korean[0]).toBe("$[\"id\"]에서 length >= 2이 필요하지만 length 0을 받았습니다.");
        expect(result.error[0]?.message).toBeUndefined();
    });

    test("applies custom message catalogs and path formatters", () => {
        const Shape = t.object({
            name: t.string.min(3),
            active: t.boolean
        });
        const result = Shape.check({
            name: "",
            active: "yes"
        });
        const catalog = defineMessages({
            expected_min_length: "{path}: short, expected {expected}, actual {actual}",
            expected_boolean: (_issue, context) => `${context.path}:${context.code}`
        });

        expect(Object.isFrozen(catalog)).toBe(true);
        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }

        const messages = formatIssues(result.error, {
            catalog,
            pathFormatter: (path) => path.length === 0
                ? "<root>"
                : path.map((segment) => String(segment)).join(".")
        });

        expect(messages).toEqual([
            "name: short, expected length >= 3, actual length 0",
            "active:expected_boolean"
        ]);

        const withCustomMessages = withMessages(result, {
            catalog
        });
        expect(withCustomMessages.ok).toBe(false);
        if (!withCustomMessages.ok) {
            expect(withCustomMessages.error[0]?.message)
                .toBe("$[\"name\"]: short, expected length >= 3, actual length 0");
            expect(Object.isFrozen(withCustomMessages.error)).toBe(true);
        }
    });

    test("flattens issues into form and field message buckets", () => {
        const Shape = t.object({
            name: t.string.min(3),
            tags: t.array(t.string.min(2))
        });
        const result = Shape.check({
            name: "",
            tags: ["x"]
        });
        const rootResult = t.string.check(1);

        expect(result.ok).toBe(false);
        expect(rootResult.ok).toBe(false);
        if (result.ok || rootResult.ok) {
            return;
        }

        const issues = [
            ...result.error,
            ...rootResult.error
        ];
        const flattened = flattenIssues(issues);
        const aliased = flattenError({
            issues
        });
        const korean = flattenIssues(issues, {
            locale: "ko"
        });

        expectTypeOf<typeof flattened>().toEqualTypeOf<FlattenedIssueMessages>();
        expectTypeOf<typeof issues>().toExtend<IssueSource>();
        expect(Object.isFrozen(flattened)).toBe(true);
        expect(Object.isFrozen(flattened.formErrors)).toBe(true);
        expect(Object.isFrozen(flattened.fieldErrors)).toBe(true);
        expect(flattened.fieldErrors["name"]?.[0])
            .toBe("Expected length >= 3 at $[\"name\"]; received length 0.");
        expect(flattened.fieldErrors["tags"]?.[0])
            .toBe("Expected length >= 2 at $[\"tags\"][0]; received length 1.");
        expect(flattened.formErrors[0])
            .toBe("Expected string at $; received number.");
        expect(aliased.fieldErrors["tags"]?.[0])
            .toBe("Expected length >= 2 at $[\"tags\"][0]; received length 1.");
        expect(korean.formErrors[0])
            .toBe("$에서 문자열이 필요하지만 number을 받았습니다.");
    });

    test("prettifies issue arrays and assertion errors", () => {
        const Shape = t.object({
            name: t.string.min(3),
            active: t.boolean
        });
        const result = Shape.safeParse({
            name: "",
            active: "yes"
        });

        expect(result.success).toBe(false);
        if (result.success) {
            return;
        }

        expect(prettifyError(result.error)).toBe([
            "Validation failed:",
            "- Expected length >= 3 at $[\"name\"]; received length 0.",
            "- Expected boolean at $[\"active\"]; received string."
        ].join("\n"));
        expect(prettifyError(result.error.issues, { locale: "ko" }))
            .toContain("Validation failed:");
        expect(prettifyError([])).toBe("Validation succeeded.");
    });

    test("treeifies issues into property and item paths", () => {
        const Shape = t.strictObject({
            username: t.string,
            favoriteNumbers: t.array(t.number)
        });
        const result = Shape.check({
            username: 1234,
            favoriteNumbers: [1234, "4567"],
            extraKey: 1234
        });

        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }

        const tree = treeifyIssues(result.error);
        const aliased = treeifyError({
            issues: result.error
        });

        expectTypeOf<typeof tree>().toEqualTypeOf<TreeifiedIssueMessages>();
        expect(Object.isFrozen(tree)).toBe(true);
        expect(tree.errors).toEqual([]);
        expect(tree.properties?.["extraKey"]?.errors[0])
            .toBe("Unrecognized key at $[\"extraKey\"]; expected known key.");
        expect(tree.properties?.["username"]?.errors[0])
            .toBe("Expected string at $[\"username\"]; received number.");
        expect(tree.properties?.["favoriteNumbers"]?.items?.[1]?.errors[0])
            .toBe("Expected number at $[\"favoriteNumbers\"][1]; received string.");
        expect(tree.properties?.["favoriteNumbers"]?.items?.[0]).toBeUndefined();
        expect(aliased.properties?.["favoriteNumbers"]?.items?.[1]?.errors[0])
            .toBe("Expected number at $[\"favoriteNumbers\"][1]; received string.");
        expect(treeifyIssues({ issues: [] }).errors).toEqual([]);
    });

    test("formats errors into the legacy underscore-errors tree", () => {
        const Shape = t.object({
            user: t.object({
                name: t.string.min(2)
            }),
            tags: t.array(t.string.min(2))
        });
        const result = Shape.check({
            user: {
                name: ""
            },
            tags: ["x"]
        });

        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }

        const formatted = formatError(result.error);
        const user = formatted["user"] as FormattedIssueMessages;
        const name = user["name"] as FormattedIssueMessages;
        const tags = formatted["tags"] as FormattedIssueMessages;
        const firstTag = tags["0"] as FormattedIssueMessages;

        expectTypeOf<typeof formatted>().toEqualTypeOf<FormattedIssueMessages>();
        expect(Object.isFrozen(formatted)).toBe(true);
        expect(Object.isFrozen(formatted._errors)).toBe(true);
        expect(name._errors[0])
            .toBe("Expected length >= 2 at $[\"user\"][\"name\"]; received length 0.");
        expect(firstTag._errors[0])
            .toBe("Expected length >= 2 at $[\"tags\"][0]; received length 1.");
    });

    test("preserves prototype-named paths in legacy formatting", () => {
        const issue: Issue = {
            path: ["__proto__"],
            code: "expected_string",
            expected: "string",
            actual: "number",
            message: undefined
        };
        const formatted = formatError([issue]);
        const child = formatted["__proto__"] as FormattedIssueMessages;

        expect(Object.getPrototypeOf(formatted)).toBe(null);
        expect(Object.prototype.hasOwnProperty.call(formatted, "__proto__")).toBe(true);
        expect(child._errors).toEqual([
            "Expected string at $[\"__proto__\"]; received number."
        ]);
    });

    test("projects TypeSea diagnostics to Zod-style issues and errors", () => {
        const Shape = t.strictObject({
            name: t.string.min(3),
            count: t.number.int()
        });
        const result = Shape.check({
            name: "",
            count: 1.5,
            extra: true
        });

        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }

        const zodIssues = toZodIssues(result.error);
        const koreanIssues = toZodIssues(result.error, {
            locale: "ko"
        });
        const sourceFirst = result.error[0];
        expect(sourceFirst).not.toBeUndefined();
        if (sourceFirst === undefined) {
            return;
        }
        const firstIssue = toZodIssue(sourceFirst);
        const zodError = toZodError(result.error);
        const copiedError = new TypeSeaZodError(zodIssues);
        const issueSource: ZodErrorLike = zodError;
        const flattened = zodError.flatten();
        const formatted = zodError.format();

        expectTypeOf<typeof zodIssues>().toEqualTypeOf<readonly ZodIssue[]>();
        expectTypeOf<typeof issueSource>().toEqualTypeOf<ZodErrorLike>();
        expect(issueSource.name).toBe("ZodError");
        expect(Object.isFrozen(zodIssues)).toBe(true);
        expect(Object.isFrozen(zodIssues[0])).toBe(true);
        expect(zodIssues.map((issue) => issue.code)).toEqual([
            "too_small",
            "invalid_type",
            "unrecognized_keys"
        ]);
        expect(zodIssues[0]?.typeseaCode).toBe("expected_min_length");
        expect(zodIssues[0]?.expected).toBe("length >= 3");
        expect(zodIssues[0]?.received).toBe("length 0");
        expect(zodIssues[0]?.minimum).toBe(3);
        expect(zodIssues[0]?.inclusive).toBe(true);
        expect(zodIssues[0]?.exact).toBe(false);
        expect(zodIssues[0]?.origin).toBe("string");
        expect(zodIssues[2]?.keys).toEqual(["extra"]);
        expect(firstIssue.message)
            .toBe("Expected length >= 3 at $[\"name\"]; received length 0.");
        expect(koreanIssues[0]?.message)
            .toBe("$[\"name\"]에서 length >= 3이 필요하지만 length 0을 받았습니다.");
        expect(zodError).toBeInstanceOf(TypeSeaZodError);
        expect(zodError.name).toBe("ZodError");
        expect(zodError.issues[1]?.code).toBe("invalid_type");
        expect(zodError.message).toContain("\"typeseaCode\": \"expected_integer\"");
        expect(Object.isFrozen(zodError.issues)).toBe(true);
        expect(copiedError.issues).not.toBe(zodIssues);
        expect(copiedError.issues[0]).not.toBe(zodIssues[0]);
        expect(copiedError.issues[0]?.minimum).toBe(3);
        expect(copiedError.issues[0]?.origin).toBe("string");
        expect(Object.isFrozen(flattened.fieldErrors)).toBe(true);
        expect(flattened.fieldErrors["name"]?.[0])
            .toBe("Expected length >= 3 at $[\"name\"]; received length 0.");
        expect(formatted["name"]).toMatchObject({
            _errors: ["Expected length >= 3 at $[\"name\"]; received length 0."]
        });

        const reported = Shape.safeParse({
            name: "",
            count: 1
        }, {
            reportInput: true
        });
        expect(reported.success).toBe(false);
        if (!reported.success) {
            expect(toZodIssues(reported.error)[0]?.input).toBe("");
        }
    });

    test("exposes Zod namespace issue helpers", () => {
        const Shape = t.object({
            name: t.string,
            tags: t.array(t.string.min(2))
        });
        const result = Shape.check({
            name: 1,
            tags: ["x"]
        });

        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }

        const catalog = z.defineMessages({
            expected_string: "text required"
        });
        const messaged = z.withMessages(result, {
            catalog
        });

        expect(z.formatIssues(result.error)).toEqual(formatIssues(result.error));
        expect(z.formatError(result.error)).toEqual(formatError(result.error));
        expect(z.treeifyError(result.error)).toEqual(treeifyError(result.error));
        expect(z.flattenError(result.error)).toEqual(flattenError(result.error));
        expect(z.prettifyError([])).toBe("Validation succeeded.");
        expect(z.toZodIssues(result.error)).toEqual(toZodIssues(result.error));
        expect(z.toZodError(result.error)).toBeInstanceOf(TypeSeaZodError);
        expect(z.ZodIssueCode.custom).toBe("custom");
        expect(messaged.ok).toBe(false);
        if (!messaged.ok) {
            expect(messaged.error[0]?.message).toBe("text required");
        }
    });

    test("projects Zod-style bound and divisor issue details", () => {
        const Count = t.number.gt(3).lt(10).multipleOf(2);
        const tooSmall = Count.check(3);
        const tooBig = Count.check(10);
        const notMultiple = Count.check(5);

        expect(tooSmall.ok).toBe(false);
        expect(tooBig.ok).toBe(false);
        expect(notMultiple.ok).toBe(false);
        if (tooSmall.ok || tooBig.ok || notMultiple.ok) {
            return;
        }

        const smallSource = tooSmall.error[0];
        const bigSource = tooBig.error[0];
        const multipleSource = notMultiple.error[0];
        expect(smallSource).not.toBeUndefined();
        expect(bigSource).not.toBeUndefined();
        expect(multipleSource).not.toBeUndefined();
        if (smallSource === undefined ||
            bigSource === undefined ||
            multipleSource === undefined) {
            return;
        }

        const smallIssue = toZodIssue(smallSource);
        const bigIssue = toZodIssue(bigSource);
        const multipleIssue = toZodIssue(multipleSource);

        expect(smallIssue).toMatchObject({
            code: "too_small",
            minimum: 3,
            inclusive: false,
            exact: false,
            origin: "number"
        });
        expect(bigIssue).toMatchObject({
            code: "too_big",
            maximum: 10,
            inclusive: false,
            exact: false,
            origin: "number"
        });
        expect(multipleIssue).toMatchObject({
            code: "not_multiple_of",
            divisor: 2,
            origin: "number"
        });
    });

    test("preserves successful results and formats single issues", () => {
        const valid = t.string.check("sea");
        const invalid = t.string.check(1);
        const same = withMessages(valid);

        expect(same).toBe(valid);
        expect(invalid.ok).toBe(false);
        if (!invalid.ok) {
            const first = invalid.error[0];
            expect(first).not.toBeUndefined();
            if (first !== undefined) {
                expect(formatIssue(first)).toBe("Expected string at $; received number.");
            }
        }
    });

    test("rejects malformed message configuration", () => {
        const invalid = t.string.check(1);
        expect(invalid.ok).toBe(false);
        if (invalid.ok) {
            return;
        }

        expect(() => formatIssues(invalid.error, {
            locale: "fr" as unknown as MessageLocale
        })).toThrow(TypeError);
        expect(() => defineMessages({
            missing_code: "bad"
        } as unknown as IssueMessageCatalog)).toThrow(TypeError);
        expect(() => defineMessages({
            expected_string: 1
        } as unknown as IssueMessageCatalog)).toThrow(TypeError);
        expect(() => formatIssues(invalid.error, {
            catalog: {
                expected_string: () => 1 as unknown as string
            }
        })).toThrow(TypeError);
        expect(() => formatIssues(invalid.error, {
            pathFormatter: () => 1 as unknown as string
        })).toThrow(TypeError);
    });

    test("preserves message result types", () => {
        const result = withMessages(t.string.check(1));
        expectTypeOf<typeof result>().toEqualTypeOf<CheckResult<string>>();
        expect(result.ok).toBe(false);
    });
});
