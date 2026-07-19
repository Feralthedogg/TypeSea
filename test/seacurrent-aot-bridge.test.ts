/**
 * @file seacurrent-aot-bridge.test.ts
 * @brief Optional SeaCurrent JIT/AOT bridge parity and artifact tests.
 */

import { Buffer } from "node:buffer";
import { describe, expect, test } from "vitest";
import {
    compileBoolean,
    t,
    type CompileMode
} from "../src/index.js";
import { fuzzCases } from "../src/seaflow/index.js";
import { createSeaCurrent } from "../src/seacurrent/index.js";
import {
    createSeaCurrentAotBridge,
    type SeaCurrentProfileArtifact
} from "../src/seacurrent/aot/index.js";

interface GeneratedProfileModule {
    readonly is: (value: unknown) => boolean;
    readonly snapshot: () => SeaCurrentProfileArtifact;
    readonly reset: () => void;
}

interface GeneratedOptimizedModule {
    readonly is: (value: unknown) => boolean;
}

describe("SeaCurrent AOT bridge", () => {
    test("keeps ordinary compiled predicates free of instrumentation", () => {
        const User = t.object({ id: t.string, age: t.number.int() });
        const ordinary = compileBoolean(User);
        const profiled = createSeaCurrentAotBridge(createSeaCurrent()).compile(User);

        expect(ordinary.source).not.toContain("__ts_sc_");
        expect(profiled.source).toContain("__ts_sc_");
    });

    test("preserves safe predicate semantics while collecting nested regions", () => {
        const User = t.strictObject({
            id: t.string.uuid(),
            tags: t.array(t.string.min(1))
        });
        const current = createSeaCurrent({
            targetKey: "bridge-v8",
            checksums: true,
            budget: { maxCounterCost: 0 }
        });
        const bridge = createSeaCurrentAotBridge(current);
        const profiled = bridge.compile(User);
        const values: readonly unknown[] = [
            { id: "550e8400-e29b-41d4-a716-446655440000", tags: ["jit", "aot"] },
            { id: "bad", tags: ["jit"] },
            { id: "550e8400-e29b-41d4-a716-446655440000", tags: [""] },
            null
        ];

        for (const value of values) {
            expect(profiled.is(value)).toBe(User.is(value));
        }

        const artifact = profiled.snapshot();
        expect(artifact.targetKey).toBe("bridge-v8");
        expect(artifact.regions[0]?.frequency).toBe(values.length);
        expect((artifact.regions[0]?.accepted ?? 0) +
            (artifact.regions[0]?.rejected ?? 0)).toBe(values.length);
        expect(artifact.regions.some((region) => region.id !== "root" && region.frequency > 0))
            .toBe(true);
        expect(artifact.regions.flatMap((region) => region.edges)
            .some((edge) => edge.count > 0)).toBe(true);

        profiled.reset();
        expect(profiled.snapshot().regions.every((region) => region.frequency === 0)).toBe(true);
        expect(profiled.snapshot().regions.every((region) =>
            region.accepted === 0 && region.rejected === 0)).toBe(true);
    });

    test("keeps safe accessor rejection identical without invoking the getter", () => {
        const User = t.strictObject({ id: t.string });
        const bridge = createSeaCurrentAotBridge(createSeaCurrent());
        const profiled = bridge.compile(User, { mode: "safe" });
        let calls = 0;
        const hostile = {};
        Object.defineProperty(hostile, "id", {
            configurable: true,
            enumerable: true,
            get: (): string => {
                calls += 1;
                return "hidden";
            }
        });

        expect(profiled.is(hostile)).toBe(User.is(hostile));
        expect(profiled.is(hostile)).toBe(false);
        expect(calls).toBe(0);

        const revoked = Proxy.revocable({ id: "hidden" }, {});
        revoked.revoke();
        expect(() => profiled.is(revoked.proxy)).not.toThrow();
        expect(profiled.is(revoked.proxy)).toBe(false);
        expect(profiled.snapshot().overflow).toBe(true);
    });

    test("matches each compiled mode across generated composite cases", () => {
        const Event = t.union(
            t.strictObject({
                type: t.literal("message"),
                body: t.string.min(1),
                tags: t.array(t.string).max(4).optional()
            }),
            t.strictObject({
                type: t.literal("metric"),
                value: t.number.finite(),
                active: t.boolean
            })
        );
        const cases = Array.from(fuzzCases(Event, {
            intensity: "high",
            includeSecurity: false,
            maxYields: 96
        }));
        const modes: readonly CompileMode[] = ["safe", "unsafe", "unchecked"];

        for (const mode of modes) {
            const ordinary = compileBoolean(Event, { mode });
            const profiled = createSeaCurrentAotBridge(createSeaCurrent())
                .compile(Event, { mode });
            for (const item of cases) {
                expect(profiled.is(item.value), `${mode}: ${item.reason}`)
                    .toBe(ordinary.is(item.value));
            }
        }
    });

    test("admits matching artifacts and rejects stale structural hashes", () => {
        const User = t.object({ id: t.string, age: t.number.int() });
        const bridge = createSeaCurrentAotBridge(createSeaCurrent({ targetKey: "profile-v8" }));
        const profiled = bridge.compile(User);
        profiled.is({ id: "u1", age: 42 });
        const artifact = profiled.snapshot();
        const profiles = bridge.profiles(User, artifact, { uncertainty: 0.2 });

        expect(profiles.ok).toBe(true);
        if (profiles.ok) {
            expect(profiles.value["root"]?.frequency).toBe(1);
            expect(profiles.value["root"]?.uncertainty).toBe(0.2);
        }
        expect(bridge.replan(User, artifact).ok).toBe(true);

        const stale: SeaCurrentProfileArtifact = {
            ...artifact,
            regions: artifact.regions.map((region, index) => index === 0
                ? { ...region, structuralHash: "stale" }
                : region)
        };
        const rejected = bridge.profiles(User, stale);
        expect(rejected.ok).toBe(false);
        if (!rejected.ok) {
            expect(rejected.error.some((value) =>
                value.code === "structural_hash_mismatch")).toBe(true);
        }
        expect(bridge.profiles(User, { ...artifact, overflow: true }).ok).toBe(false);
        const mismatchedOutcomes: SeaCurrentProfileArtifact = {
            ...artifact,
            regions: artifact.regions.map((region, index) => index === 0
                ? { ...region, rejected: region.rejected + 1 }
                : region)
        };
        const outcomeResult = bridge.profiles(User, mismatchedOutcomes);
        expect(outcomeResult.ok).toBe(false);
        if (!outcomeResult.ok) {
            expect(outcomeResult.error.some((value) =>
                value.code === "outcome_mismatch")).toBe(true);
        }

        const firstRegion = artifact.regions[0];
        expect(firstRegion).toBeDefined();
        if (firstRegion === undefined) {
            return;
        }
        let outcomeAccessorCalls = 0;
        const outcomeAccessorRegion = { ...firstRegion };
        Object.defineProperty(outcomeAccessorRegion, "accepted", {
            configurable: true,
            enumerable: true,
            get: (): never => {
                outcomeAccessorCalls += 1;
                throw new Error("artifact outcome accessor executed");
            }
        });
        const outcomeAccessorArtifact: SeaCurrentProfileArtifact = {
            ...artifact,
            regions: [outcomeAccessorRegion, ...artifact.regions.slice(1)]
        };
        expect(() => bridge.profiles(User, outcomeAccessorArtifact)).not.toThrow();
        expect(bridge.profiles(User, outcomeAccessorArtifact).ok).toBe(false);
        expect(outcomeAccessorCalls).toBe(0);

        const revoked = Proxy.revocable({}, {});
        revoked.revoke();
        expect(() => bridge.profiles(User, revoked.proxy)).not.toThrow();
        expect(bridge.profiles(User, revoked.proxy).ok).toBe(false);

        let accessorCalls = 0;
        const accessorRegions = artifact.regions.slice();
        Object.defineProperty(accessorRegions, 0, {
            configurable: true,
            enumerable: true,
            get: (): never => {
                accessorCalls += 1;
                throw new Error("artifact accessor executed");
            }
        });
        expect(bridge.profiles(User, { ...artifact, regions: accessorRegions }).ok)
            .toBe(false);
        expect(accessorCalls).toBe(0);

        const trappedRegions = new Proxy(artifact.regions.slice(), {
            getOwnPropertyDescriptor: (): never => {
                throw new Error("artifact descriptor trap");
            }
        });
        expect(() => bridge.profiles(User, { ...artifact, regions: trappedRegions }))
            .not.toThrow();
        expect(bridge.profiles(User, { ...artifact, regions: trappedRegions }).ok)
            .toBe(false);

        const oversizedRegions = new Array<unknown>(0xffff_ffff);
        expect(bridge.profiles(User, { ...artifact, regions: oversizedRegions }).ok)
            .toBe(false);
    });

    test("emits an executable standalone profiled ESM module", async () => {
        const User = t.strictObject({ id: t.string, active: t.boolean });
        const bridge = createSeaCurrentAotBridge(createSeaCurrent({ targetKey: "aot-v8" }));
        const emitted = bridge.emit(User, { mode: "safe" });

        expect(emitted.ok).toBe(true);
        if (!emitted.ok) {
            return;
        }
        const encoded = Buffer.from(emitted.value.source, "utf8").toString("base64");
        const generated = await import(`data:text/javascript;base64,${encoded}`) as
            GeneratedProfileModule;
        expect(generated.is({ id: "u1", active: true })).toBe(true);
        expect(generated.is({ id: "u1", active: "yes" })).toBe(false);
        expect(generated.snapshot().regions[0]?.frequency).toBe(2);
        expect(bridge.profiles(User, generated.snapshot()).ok).toBe(true);
        generated.reset();
        expect(generated.snapshot().regions[0]?.frequency).toBe(0);
    });

    test("keeps unsupported AOT schemas on the existing fail-closed path", () => {
        const Dynamic = t.string.refine((value) => value.length > 0);
        const bridge = createSeaCurrentAotBridge(createSeaCurrent());
        const emitted = bridge.emit(Dynamic);

        expect(emitted.ok).toBe(false);
        if (!emitted.ok) {
            expect(emitted.error.some((value) => value.code === "unsupported_aot_refine"))
                .toBe(true);
        }
    });

    test("lowers admitted profiles into uninstrumented safe JIT and AOT predicates", async () => {
        const Request = t.object({
            id: t.string,
            payload: t.object({
                mode: t.literal("ok"),
                values: t.array(t.number)
            })
        });
        const current = createSeaCurrent({ targetKey: "adaptive-v8" });
        const bridge = createSeaCurrentAotBridge(current);
        const profiled = bridge.compile(Request);
        for (let index = 0; index < 256; index += 1) {
            profiled.is(index < 224
                ? { id: "u", payload: { mode: "bad", values: [] } }
                : { id: "u", payload: { mode: "ok", values: [1, 2] } });
        }
        const artifact = profiled.snapshot();
        const optimized = bridge.optimize(Request, artifact);

        expect(optimized.ok).toBe(true);
        if (!optimized.ok) {
            return;
        }
        expect(optimized.value.applied.length).toBeGreaterThan(0);
        expect(optimized.value.source).not.toContain("__ts_sc_");
        const sparseValues: unknown[] = [];
        sparseValues.length = 1;
        const nonEnumerable = {};
        Object.defineProperties(nonEnumerable, {
            id: { configurable: true, enumerable: false, value: "u" },
            payload: {
                configurable: true,
                enumerable: false,
                value: { mode: "ok", values: [1] }
            }
        });
        let accessorCalls = 0;
        const accessor = { id: "u" };
        Object.defineProperty(accessor, "payload", {
            configurable: true,
            enumerable: true,
            get: (): never => {
                accessorCalls += 1;
                throw new Error("optimized predicate executed an accessor");
            }
        });
        const explicitValues: readonly unknown[] = [
            { id: "u", payload: { mode: "ok", values: [1] } },
            { id: "u", payload: { mode: "bad", values: [] } },
            { id: 1, payload: { mode: "ok", values: [] } },
            { id: "u", payload: { mode: "ok", values: sparseValues } },
            nonEnumerable,
            accessor,
            null
        ];
        const generatedValues = Array.from(fuzzCases(Request, {
            intensity: "extreme",
            includeSecurity: true,
            maxYields: 128
        }), (item) => item.value);
        const values = [...explicitValues, ...generatedValues];
        const baseline = compileBoolean(Request, { mode: "safe" });
        for (const value of values) {
            expect(optimized.value.is(value)).toBe(baseline.is(value));
        }
        expect(accessorCalls).toBe(0);

        const unsafe = bridge.optimize(Request, artifact, { mode: "unsafe" });
        expect(unsafe.ok && unsafe.value.applied).toEqual([]);

        const emitted = bridge.emitOptimized(Request, artifact);
        expect(emitted.ok).toBe(true);
        if (emitted.ok) {
            const encoded = Buffer.from(emitted.value.source, "utf8").toString("base64");
            const generated = await import(`data:text/javascript;base64,${encoded}`) as
                GeneratedOptimizedModule;
            for (const value of values) {
                expect(generated.is(value)).toBe(baseline.is(value));
            }
            expect(accessorCalls).toBe(0);
            expect(emitted.value.applied.length).toBeGreaterThan(0);
        }
    });

    test("warms and benchmarks a candidate before explicit promotion", () => {
        const Request = t.object({
            id: t.string,
            payload: t.object({ mode: t.literal("ok") })
        });
        const current = createSeaCurrent({ targetKey: "tune-v8" });
        const bridge = createSeaCurrentAotBridge(current);
        const profiled = bridge.compile(Request);
        const samples: unknown[] = [];
        for (let index = 0; index < 128; index += 1) {
            const value = index < 112
                ? { id: "u", payload: { mode: "bad" } }
                : { id: "u", payload: { mode: "ok" } };
            samples.push(value);
            profiled.is(value);
        }
        const tuned = bridge.tune(Request, profiled.snapshot(), samples, {
            warmupIterations: 1_000,
            iterations: 5_000,
            rounds: 3,
            minSpeedup: 0
        });

        expect(tuned.ok).toBe(true);
        if (tuned.ok) {
            expect(tuned.value.selected).toBe("optimized");
            expect(tuned.value.baselineHz).toBeGreaterThan(0);
            expect(tuned.value.optimizedHz).toBeGreaterThan(0);
            expect(tuned.value.candidateTransforms.length).toBeGreaterThan(0);
            expect(tuned.value.is(samples[0])).toBe(false);
        }
        expect(current.state().observations).toBeGreaterThan(0);
    });
});
