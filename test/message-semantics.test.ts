import { describe, expect, expectTypeOf, test } from "vitest";
import {
    defineMessages,
    formatIssue,
    formatIssues,
    t,
    withMessages,
    type CheckResult,
    type IssueMessageCatalog,
    type MessageLocale
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
