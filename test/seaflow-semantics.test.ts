import { describe, expect, test } from "vitest";
import {
    fromJsonSchema,
    t,
    type Guard,
    type Presence
} from "../src/index.js";
import {
    SeaFlow,
    fuzz,
    fuzzCases,
    type SeaFlowCase
} from "../src/seaflow/index.js";

describe("SeaFlow symbolic fuzzer", () => {
    test("emits bounded object cases with semantic labels", () => {
        const Event = t.strictObject({
            id: t.string.uuid(),
            count: t.number.int().gte(1).lte(3),
            tag: t.literal("event"),
            flags: t.array(t.boolean).min(1)
        });
        const cases = [...fuzzCases(Event, {
            intensity: "extreme",
            maxDepth: 4,
            maxYields: 128
        })];

        expect(cases.length).toBeGreaterThan(8);
        expect(cases.some((item) => item.reason === "object.sample")).toBe(true);
        expect(cases.some((item) => item.reason === "object.requiredKey")).toBe(true);
        expect(cases.some((item) => item.reason === "object.proto")).toBe(true);

        assertCaseLabels(Event, cases);
    });

    test("offers a value-only generator and namespace facade", () => {
        const Count = t.number.int().gte(2).lte(4);
        const values = [...fuzz(Count, {
            intensity: "extreme",
            maxYields: 16
        })];
        const namespaced = [...SeaFlow.cases(Count, {
            intensity: "low",
            maxYields: 4
        })];

        expect(values).toContain(2);
        expect(values).toContain(1);
        expect(namespaced.length).toBeLessThanOrEqual(4);
    });

    test("treats maxYields as an upper bound rather than a target", () => {
        const Boolean = t.boolean;
        const exhausted = [...fuzzCases(Boolean, {
            intensity: "extreme",
            maxYields: 64
        })];
        const capped = [...fuzzCases(Boolean, {
            intensity: "extreme",
            maxYields: 2
        })];

        expect(exhausted.length).toBe(3);
        expect(capped.length).toBe(2);
    });

    test("honors case filters and accepts schema records", () => {
        const User = t.strictObject({
            id: t.string.uuid(),
            name: t.string.min(1)
        });
        const validOnly = [...fuzzCases(User.schema, {
            intensity: "extreme",
            includeInvalid: false,
            includeSecurity: false,
            maxYields: 16
        })];
        const noSecurity = [...fuzzCases(User, {
            intensity: "extreme",
            includeSecurity: false,
            maxYields: 64
        })];

        expect(validOnly.length).toBeGreaterThan(0);
        expect(validOnly.every((item) => item.kind === "valid")).toBe(true);
        expect(validOnly.every((item) => User.is(item.value))).toBe(true);
        expect(noSecurity.some((item) => item.kind === "invalid")).toBe(true);
        expect(noSecurity.every((item) => item.kind !== "security")).toBe(true);
    });

    test("keeps property-count wrapper verdicts aligned with generated payloads", () => {
        const imported = fromJsonSchema({
            type: "object",
            minProperties: 1,
            maxProperties: 2,
            properties: {
                id: { type: "string" },
                count: { type: "number" }
            }
        });
        expect(imported.ok).toBe(true);
        if (!imported.ok) {
            return;
        }

        const cases = [...fuzzCases(imported.value, {
            intensity: "extreme",
            includeSecurity: true,
            maxYields: 64
        })];

        expect(cases.some((item) => item.reason === "object.proto")).toBe(true);
        assertCaseLabels(imported.value, cases);
    });

    test("reconciles constrained solver samples with runtime verdicts", () => {
        const guards: readonly Guard<unknown, Presence>[] = [
            t.array(t.string).min(3),
            t.map(t.string, t.number).min(2),
            t.set(t.number).max(0),
            t.string.regex(/^z$/u, "single_z"),
            t.number.gt(0)
        ];

        for (let index = 0; index < guards.length; index += 1) {
            const guard = guards[index];
            if (guard === undefined) {
                continue;
            }
            const cases = [...fuzzCases(guard, {
                intensity: "extreme",
                maxYields: 64
            })];
            assertCaseLabels(guard, cases);

            const passing = [...fuzzCases(guard, {
                intensity: "extreme",
                includeInvalid: false,
                maxYields: 64
            })];
            expect(passing.every((item) => guard.is(item.value))).toBe(true);
        }
    });

    test("generates strict-union hybrid probes", () => {
        const Event = t.union(
            t.strictObject({
                kind: t.literal("user"),
                userId: t.string
            }),
            t.strictObject({
                kind: t.literal("order"),
                orderId: t.number
            })
        );
        const cases = [...fuzzCases(Event, {
            intensity: "high",
            maxDepth: 4,
            maxYields: 64
        })];
        const hybrid = cases.find((item) => item.reason === "union.hybrid");

        expect(hybrid).toBeDefined();
        expect(hybrid?.valid).toBe(false);
        expect(Event.is(hybrid?.value)).toBe(false);
    });

    test("stops recursive lazy emission at the configured quota", () => {
        let Tree: Guard<unknown, Presence> = t.unknown;
        Tree = t.lazy(() => t.object({
            value: t.string,
            children: t.array(Tree).optional()
        }));

        const cases = [...fuzzCases(Tree, {
            intensity: "high",
            maxDepth: 2,
            maxYields: 12
        })];

        expect(cases.length).toBeLessThanOrEqual(12);
        expect(cases.length).toBeGreaterThan(0);
    });
});

function assertCaseLabels(
    guard: Guard<unknown, Presence>,
    cases: readonly SeaFlowCase[]
): void {
    for (let index = 0; index < cases.length; index += 1) {
        const item = cases[index];
        if (item === undefined) {
            continue;
        }
        expect(guard.is(item.value), item.reason).toBe(item.valid);
    }
}
