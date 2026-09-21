import { afterEach, describe, expect, test, vi } from "vitest";
import { t } from "../src/index.js";
import { makeValidationState } from "../src/evaluate/state.js";

describe("native validation performance contracts", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test("checkFirst publishes only the first issue and stops later array reads", () => {
        const schema = t.array(t.number.int());
        const source = ["bad", "also bad", "still bad"];
        const fullReads: Record<string, number> = {};
        const firstReads: Record<string, number> = {};
        const tracked = (reads: Record<string, number>): unknown[] =>
            new Proxy([...source], {
                getOwnPropertyDescriptor(target, key): PropertyDescriptor | undefined {
                    if (/^\d+$/.test(String(key))) {
                        const name = String(key);
                        reads[name] = (reads[name] ?? 0) + 1;
                    }
                    return Object.getOwnPropertyDescriptor(target, key);
                }
            });

        const all = schema.check(tracked(fullReads));
        const first = schema.checkFirst(tracked(firstReads));

        expect(all.ok).toBe(false);
        expect(first.ok).toBe(false);
        if (!all.ok && !first.ok) {
            expect(all.error).toHaveLength(3);
            expect(first.error).toEqual([all.error[0]]);
            expect(Object.isFrozen(first.error)).toBe(true);
        }
        expect(fullReads["1"]).toBeGreaterThan(0);
        expect(fullReads["2"]).toBeGreaterThan(0);
        expect(firstReads["1"]).toBeUndefined();
        expect(firstReads["2"]).toBeUndefined();
    });

    test("checkFirst stops closed-record key admission after the first missing key", () => {
        const schema = t.record(t.literal(["a", "b"] as const), t.number);
        const fullReads: Record<string, number> = {};
        const firstReads: Record<string, number> = {};
        const tracked = (reads: Record<string, number>): Record<string, unknown> =>
            new Proxy({}, {
                getOwnPropertyDescriptor(target, key): PropertyDescriptor | undefined {
                    const name = String(key);
                    if (name === "a" || name === "b") {
                        reads[name] = (reads[name] ?? 0) + 1;
                    }
                    return Object.getOwnPropertyDescriptor(target, key);
                }
            });

        const all = schema.check(tracked(fullReads));
        const first = schema.checkFirst(tracked(firstReads));

        expect(all.ok).toBe(false);
        expect(first.ok).toBe(false);
        if (!all.ok && !first.ok) {
            expect(all.error).toHaveLength(2);
            expect(first.error).toEqual([all.error[0]]);
        }
        expect(fullReads["b"]).toBeGreaterThan(0);
        expect(firstReads["b"]).toBeUndefined();
    });

    test("defers WeakMap and WeakSet construction until tracking resources are read", () => {
        const originalWeakMap = globalThis.WeakMap;
        const originalWeakSet = globalThis.WeakSet;
        let weakMapAllocations = 0;
        let weakSetAllocations = 0;
        vi.stubGlobal("WeakMap", new Proxy(originalWeakMap, {
            construct(target, argumentsList): object {
                weakMapAllocations += 1;
                return Reflect.construct(target, argumentsList) as object;
            }
        }));
        vi.stubGlobal("WeakSet", new Proxy(originalWeakSet, {
            construct(target, argumentsList): object {
                weakSetAllocations += 1;
                return Reflect.construct(target, argumentsList) as object;
            }
        }));

        const state = makeValidationState();
        const eagerWeakMapAllocations = weakMapAllocations;
        const eagerWeakSetAllocations = weakSetAllocations;
        void state.active;
        void state.resolving;
        void state.graphFrames;
        const accessedWeakMapAllocations = weakMapAllocations;
        const accessedWeakSetAllocations = weakSetAllocations;

        vi.unstubAllGlobals();
        expect(eagerWeakMapAllocations).toBe(0);
        expect(eagerWeakSetAllocations).toBe(0);
        expect(accessedWeakMapAllocations).toBe(1);
        expect(accessedWeakSetAllocations).toBe(1);
    });

    test("keeps validation resources stable within a state and isolated across states", () => {
        const first = makeValidationState();
        const second = makeValidationState();

        expect(first.active).toBe(first.active);
        expect(first.resolving).toBe(first.resolving);
        expect(first.graphFrames).toBe(first.graphFrames);
        expect(first.active).not.toBe(second.active);
        expect(first.resolving).not.toBe(second.resolving);
        expect(first.graphFrames).not.toBe(second.graphFrames);
    });

    test("uses the legacy full path for callbacks that reenter validation", () => {
        const nested = t.number.int();
        const firstCalls: string[] = [];
        const firstSchema = nested.refine((value) => {
            firstCalls.push("refine");
            expect(nested.check(value).ok).toBe(true);
            return false;
        }, "reject");
        const first = firstSchema.checkFirst(3);

        const fullCalls: string[] = [];
        const fullSchema = nested.refine((value) => {
            fullCalls.push("refine");
            expect(nested.check(value).ok).toBe(true);
            return false;
        }, "reject");
        const full = fullSchema.check(3);

        expect(first).toEqual(full);
        expect(firstCalls).toEqual(["refine", "refine"]);
        expect(fullCalls).toEqual(["refine", "refine"]);
    });

    test("does not skip a later callback after an earlier structural issue", () => {
        let callbackCalls = 0;
        const schema = t.object({
            first: t.string,
            second: t.number.refine(() => {
                callbackCalls += 1;
                return false;
            }, "second_reject")
        });

        const result = schema.checkFirst({ first: 1, second: 2 });

        expect(result.ok).toBe(false);
        expect(callbackCalls).toBe(1);
        if (!result.ok) {
            expect(result.error[0]?.path).toEqual(["first"]);
        }
    });

    test("keeps lazy resolution and message wrappers compatible with checkFirst", () => {
        let resolves = 0;
        const lazy = t.lazy(() => {
            resolves += 1;
            return t.array(t.number.int());
        });
        const lazyResult = lazy.checkFirst(["bad", "also bad"]);
        expect(lazyResult.ok).toBe(false);
        expect(resolves).toBe(1);

        const wrapped = t.message(t.array(t.number.int()), "invalid array");
        const all = wrapped.check(["bad", "also bad"]);
        const first = wrapped.checkFirst(["bad", "also bad"]);
        expect(first).toEqual(all.ok ? undefined : {
            ok: false,
            error: [all.error[0]]
        });
        if (!first.ok) {
            expect(first.error[0]?.message).toBe("invalid array");
        }
    });
});
