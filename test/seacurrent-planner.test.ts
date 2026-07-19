/**
 * @file seacurrent-planner.test.ts
 * @brief SeaCurrent planner correctness and incremental reuse tests.
 */

import { describe, expect, test } from "vitest";
import { t } from "../src/index.js";
import { NodeTag } from "../src/kind/index.js";
import {
    createSeaCurrent,
    createTypeSeaCurrentAdapter,
    createTypeSeaV8TargetModel,
    isTypeSeaCurrentTransformationAdapter,
    SeaCurrentAutoTuner,
    SeaCurrentPlanner,
    type SeaCurrentControlEdge,
    type SeaCurrentControlFlowGraph,
    type SeaCurrentCounterSite,
    type SeaCurrentDependence,
    type SeaCurrentDependenceGraph,
    type SeaCurrentGraphAdapter,
    type SeaCurrentRegionProfile,
    type SeaCurrentTargetModel
} from "../src/seacurrent/index.js";
import { makeSeaCurrentChecksumPlan, planSeaCurrentCover } from "../src/seacurrent/cdc.js";
import { planExactEdgeProfile } from "../src/seacurrent/exact-profile.js";
import { planBallLarusPaths } from "../src/seacurrent/path-profile.js";
import { buildSeaCurrentSchedule, verifySeaCurrentSchedule } from "../src/seacurrent/schedule.js";

describe("SeaCurrent planner", () => {
    test("produces a full-rank tree-complement edge profile", () => {
        const graph = diamondCFG();
        const plan = planExactEdgeProfile(graph, (edge) => [{
            id: `site:${edge.id}`,
            edge: edge.id,
            cost: edge.counterCost
        }]);

        expect(plan.status).toBe("exact");
        expect(plan.cycleRank).toBe(2);
        expect(plan.counters).toHaveLength(2);
        expect(plan.rank).toBe(graph.edges.length + 2);
        expect(new Set(plan.counters.map((counter) => counter.edge)).size).toBe(2);
    });

    test("returns only independently verified CDC multiplicity", () => {
        const graph = squareCFG();
        const cover = planSeaCurrentCover(graph, 1_000, 16);

        expect(cover.status).toBe("verified");
        const checksums = makeSeaCurrentChecksumPlan(cover);
        expect(checksums?.terms).toHaveLength(8);
        if (cover.status !== "verified") {
            return;
        }
        const occurrences = new Map<string, Set<number>>();
        for (const cycle of cover.cycles) {
            for (const edgeId of cycle.edges) {
                const labels = occurrences.get(edgeId) ?? new Set<number>();
                labels.add(cycle.label);
                occurrences.set(edgeId, labels);
            }
        }
        expect(Array.from(occurrences.values()).every((labels) => labels.size === 2)).toBe(true);
        expect(planSeaCurrentCover(graph, 1, 16)).toMatchObject({
            status: "unavailable"
        });
    });

    test("fails closed when a required chord cannot be instrumented", () => {
        const plan = planExactEdgeProfile(diamondCFG(), () => []);

        expect(plan.status).toBe("unavailable");
        if (plan.status === "unavailable") {
            expect(plan.reason).toContain("no legal counter site");
        }
    });

    test("analyzes large bridge-only regions without recursive stack growth", () => {
        const nodeCount = 20_000;
        const nodes = new Array<{ readonly id: string }>(nodeCount);
        const edges = new Array<SeaCurrentControlEdge>(nodeCount - 1);
        for (let index = 0; index < nodeCount; index += 1) {
            nodes[index] = { id: `n:${String(index)}` };
            if (index + 1 < nodeCount) {
                edges[index] = edge(
                    `e:${String(index)}`,
                    `n:${String(index)}`,
                    `n:${String(index + 1)}`,
                    1,
                    1
                );
            }
        }
        const cover = planSeaCurrentCover({
            nodes,
            edges,
            entry: "n:0",
            exits: [`n:${String(nodeCount - 1)}`]
        }, 32, 8);

        expect(cover).toMatchObject({
            status: "verified",
            cycles: [],
            coveredEdges: []
        });
    });

    test("assigns deterministic Ball-Larus path increments", () => {
        const plan = planBallLarusPaths(diamondCFG(), 10, 16, true);

        expect(plan.selected).toBe(true);
        expect(plan.pathCount).toBe(2);
        expect(plan.storage).toEqual({ kind: "exact", buckets: 2 });
        expect(plan.increments.some((increment) => increment.increment === 1)).toBe(true);
    });

    test("learns bounded target-specific cost parameters", () => {
        const tuner = new SeaCurrentAutoTuner({ learningRate: 0.2 });
        const before = tuner.targetState("apple-m4");
        const features = {
            frequency: 100,
            costBefore: 10,
            costAfter: 8,
            sizeIncrease: 20,
            semanticRisk: 2
        } as const;
        const predicted = tuner.model("apple-m4").benefit(features);
        const after = tuner.observe({
            kind: "benefit",
            targetKey: "apple-m4",
            features,
            actualValue: predicted + 100
        });

        expect(after.lambda).toBeLessThan(before.lambda);
        expect(after.gamma).toBeLessThan(before.gamma);
        expect(after.observations).toBe(1);
        const priorityBefore = tuner.targetState("wasm32");
        const priorityFeatures = {
            frequency: 100,
            pipelinePotential: 2,
            profileUncertainty: 0.5,
            instrumentationCost: 8,
            codeSizeCost: 2
        } as const;
        const priorityValue = tuner.model("wasm32").priority(priorityFeatures);
        const priorityAfter = tuner.observe({
            kind: "priority",
            targetKey: "wasm32",
            features: priorityFeatures,
            actualValue: priorityValue + 50
        });
        expect(priorityAfter.pipelineWeight).toBeGreaterThan(priorityBefore.pipelineWeight);
        expect(priorityAfter.uncertaintyWeight).toBeGreaterThan(priorityBefore.uncertaintyWeight);
        expect(priorityAfter.epsilon).toBeLessThan(priorityBefore.epsilon);
        expect(priorityAfter.observations).toBe(1);
        const snapshot = tuner.snapshot();
        const restored = new SeaCurrentAutoTuner();
        restored.load(snapshot);
        expect(restored.targetState("apple-m4")).toEqual(after);
    });

    test("keeps existing cost-model views live across snapshot loading", () => {
        const tuner = new SeaCurrentAutoTuner();
        const features = {
            frequency: 100,
            costBefore: 10,
            costAfter: 8,
            sizeIncrease: 4,
            semanticRisk: 0
        } as const;
        const model = tuner.model("live-target");
        const before = model.benefit(features);

        tuner.load({
            version: 1,
            targets: [{
                targetKey: "live-target",
                lambda: 100,
                gamma: 1,
                epsilon: 1e-6,
                pipelineWeight: 1,
                uncertaintyWeight: 1,
                observations: 10
            }]
        });

        expect(model.benefit(features)).toBeLessThan(before);
        expect(tuner.targetState("live-target").lambda).toBe(100);
    });

    test("plans TypeSea guards through the reusable builder facade", () => {
        const User = t.strictObject({
            id: t.string.uuid(),
            tags: t.array(t.string.min(1))
        });
        const current = createSeaCurrent({
            targetKey: "builder-v8",
            checksums: true,
            maxCacheEntries: 32,
            budget: { maxCounterCost: 0 }
        });
        const profile = { frequency: 10_000, uncertainty: 0.8 } as const;
        const initial = current.plan(User, profile);
        const repeated = current.planRegions(User.schema, rootProfile(profile));

        expect(initial.target).toBe("builder-v8");
        expect(initial.cache.misses).toBe(initial.regions.length);
        expect(initial.regions[0]?.pathProfile.selected).toBe(false);
        expect(repeated.cache.hits).toBe(initial.regions.length);
        expect(current.invalidate("root")).toBe(1);
        expect(current.plan(User).cache.misses).toBe(1);
    });

    test("injects the configured target into builder observations", () => {
        const current = createSeaCurrent({ targetKey: "builder-observe" });
        const before = current.state();
        const features = {
            frequency: 100,
            costBefore: 10,
            costAfter: 8,
            sizeIncrease: 20,
            semanticRisk: 2
        } as const;
        const predicted = current.tuner.model(current.target.key).benefit(features);
        const after = current.observe({
            kind: "benefit",
            features,
            actualValue: predicted + 100
        });

        expect(after.targetKey).toBe("builder-observe");
        expect(after.lambda).toBeLessThan(before.lambda);
        expect(current.snapshot().targets).toEqual([after]);
    });

    test("rebuilds only structurally changed regions", () => {
        interface Region {
            readonly id: string;
            readonly revision: number;
        }
        let cfgBuilds = 0;
        const adapter: SeaCurrentGraphAdapter<readonly Region[], Region> = {
            key: "incremental-test-v1",
            enumerateRegions: (program) => program,
            regionId: (region) => region.id,
            structuralHash: (region) => String(region.revision),
            buildCFG: () => {
                cfgBuilds += 1;
                return diamondCFG();
            },
            buildDependenceGraph: () => emptyDependences(),
            legalCounterSites: (_region, edge) => [counterSite(edge)]
        };
        const tuner = new SeaCurrentAutoTuner();
        const target = sourceTarget();
        const planner = new SeaCurrentPlanner();
        const options = {
            target,
            costModel: tuner.model(target.key)
        };
        const initial = planner.plan([
            { id: "a", revision: 1 },
            { id: "b", revision: 1 }
        ], adapter, options);
        const repeated = planner.plan([
            { id: "a", revision: 1 },
            { id: "b", revision: 1 }
        ], adapter, options);
        const changed = planner.plan([
            { id: "a", revision: 1 },
            { id: "b", revision: 2 }
        ], adapter, options);

        expect(initial.cache).toMatchObject({ hits: 0, misses: 2 });
        expect(repeated.cache).toMatchObject({ hits: 2, misses: 0 });
        expect(changed.cache).toMatchObject({ hits: 1, misses: 1 });
        expect(changed.cache.rebuiltRegions).toEqual(["b"]);
        expect(cfgBuilds).toBe(3);
    });

    test("rechecks directed dependences and resources after scheduling", () => {
        const target = schedulingTarget();
        const graph: SeaCurrentDependenceGraph = {
            operations: [
                { id: "load", opcode: "load" },
                { id: "add", opcode: "add" },
                { id: "store", opcode: "store" }
            ],
            dependences: [
                dependence("load", "add", 1, 0),
                dependence("add", "store", 1, 0)
            ]
        };
        const schedule = buildSeaCurrentSchedule(graph, target, 8);

        expect(schedule).toBeDefined();
        if (schedule !== undefined) {
            expect(verifySeaCurrentSchedule(graph, target, schedule)).toBe(true);
            expect(schedule.starts["store"]).toBeGreaterThanOrEqual(2);
        }
    });

    test("returns only positive adapter-verified transformation plans", () => {
        const region = { id: "loop" };
        const dependences: SeaCurrentDependenceGraph = {
            operations: [
                { id: "load", opcode: "load" },
                { id: "add", opcode: "add" }
            ],
            dependences: [dependence("load", "add", 1, 0)]
        };
        const adapter: SeaCurrentGraphAdapter<typeof region, typeof region> = {
            key: "transform-test-v1",
            enumerateRegions: (program) => [program],
            regionId: (value) => value.id,
            structuralHash: () => "loop-v1",
            buildCFG: () => diamondCFG(),
            buildDependenceGraph: () => dependences,
            legalCounterSites: (_value, edgeValue) => [counterSite(edgeValue)]
        };
        const target = schedulingTarget();
        const tuner = new SeaCurrentAutoTuner();
        const plan = new SeaCurrentPlanner().plan(region, adapter, {
            target,
            costModel: tuner.model(target.key),
            profiles: { loop: { frequency: 100, uncertainty: 0.5 } },
            transformations: {
                supportedTransforms: () => [{
                    id: "pipeline-loop",
                    kind: "pipeline",
                    costBefore: 10,
                    costAfter: 4,
                    sizeIncrease: 2,
                    semanticRisk: 0
                }],
                verify: (_value, _candidate, _graph, schedule) => schedule !== undefined
            }
        });

        expect(plan.regions[0]?.transform?.candidate.id).toBe("pipeline-loop");
        expect(plan.regions[0]?.transform?.schedule).toBeDefined();
    });

    test("adapts TypeSea short-circuit and child graphs as separate regions", () => {
        const User = t.strictObject({
            id: t.string.uuid(),
            tags: t.array(t.string.min(1))
        });
        const adapter = createTypeSeaCurrentAdapter();
        const target = createTypeSeaV8TargetModel();
        const tuner = new SeaCurrentAutoTuner();
        const planner = new SeaCurrentPlanner();
        const plan = planner.plan(User.graph(), adapter, {
            target,
            costModel: tuner.model(target.key),
            enableChecksums: true,
            profiles: rootProfile({ frequency: 10_000, uncertainty: 0.8 })
        });

        expect(plan.regions.length).toBeGreaterThan(1);
        expect(plan.regions[0]?.region).toBe("root");
        expect(plan.regions.every((region) => region.exactProfile.status === "exact")).toBe(true);
        const repeated = planner.plan(User.graph(), adapter, {
            target,
            costModel: tuner.model(target.key)
        });
        expect(repeated.cache.hits).toBe(plan.regions.length);
    });

    test("materializes a profile-selected object order into graph IR", () => {
        const Request = t.object({
            id: t.string,
            payload: t.object({ mode: t.literal("ok") })
        });
        const current = createSeaCurrent({
            transformation: { minSamples: 16 }
        });
        const graph = current.graph(Request);
        const objectNode = graph.nodes.find((node) => node.tag === NodeTag.ObjectShape);
        expect(objectNode?.tag).toBe(NodeTag.ObjectShape);
        if (objectNode?.tag !== NodeTag.ObjectShape) {
            return;
        }
        const profiles: Record<string, SeaCurrentRegionProfile> = {};
        for (const region of current.adapter.enumerateRegions(graph)) {
            const entry = objectNode.entries.find((candidate) =>
                candidate.graph === region.graph);
            profiles[region.id] = entry?.key === "payload"
                ? { frequency: 256, accepted: 32, rejected: 224, uncertainty: 0 }
                : { frequency: 256, accepted: 256, rejected: 0, uncertainty: 0 };
        }
        const plan = current.planRegions(Request, profiles);
        const transformations = current.transformations;

        expect(plan.regions[0]?.transform?.candidate.id).toContain(
            "profile-guided-object-order"
        );
        expect(isTypeSeaCurrentTransformationAdapter(transformations)).toBe(true);
        if (!isTypeSeaCurrentTransformationAdapter(transformations)) {
            return;
        }
        const lowered = transformations.lower(graph, current.adapter, plan);
        const loweredNode = lowered.graph.nodes[objectNode.id];
        expect(loweredNode?.tag).toBe(NodeTag.ObjectShape);
        if (loweredNode?.tag === NodeTag.ObjectShape) {
            expect(loweredNode.entries[0]?.key).toBe("payload");
            expect(loweredNode.entries[1]?.key).toBe("id");
        }
        expect(lowered.applied).toHaveLength(1);
        expect(lowered.applied[0]?.region).toBe("root");
        expect(lowered.applied[0]?.candidate).toContain("profile-guided-object-order");
    });

    test("keeps opaque SchemaCheck fields as transformation barriers", () => {
        const Request = t.object({
            first: t.string.refine((value) => value.length > 0),
            second: t.object({ mode: t.literal("ok") })
        });
        const current = createSeaCurrent({ transformation: { minSamples: 2 } });
        const graph = current.graph(Request);
        const profiles: Record<string, SeaCurrentRegionProfile> = {};
        for (const region of current.adapter.enumerateRegions(graph)) {
            profiles[region.id] = {
                frequency: 16,
                accepted: region.id.endsWith("child:1") ? 1 : 16,
                rejected: region.id.endsWith("child:1") ? 15 : 0,
                uncertainty: 0
            };
        }

        expect(current.planRegions(Request, profiles).regions[0]?.transform).toBeUndefined();
    });
});

function diamondCFG(): SeaCurrentControlFlowGraph {
    return {
        nodes: ["entry", "left", "right", "exit"].map((id) => ({ id })),
        edges: [
            edge("a", "entry", "left", 0.5, 4),
            edge("b", "entry", "right", 0.5, 3),
            edge("c", "left", "exit", 1, 2),
            edge("d", "right", "exit", 1, 1)
        ],
        entry: "entry",
        exits: ["exit"]
    };
}

function squareCFG(): SeaCurrentControlFlowGraph {
    return {
        nodes: ["a", "b", "c", "d"].map((id) => ({ id })),
        edges: [
            edge("ab", "a", "b", 1, 1),
            edge("bc", "b", "c", 1, 1),
            edge("cd", "c", "d", 1, 1),
            edge("da", "d", "a", 1, 1)
        ],
        entry: "a",
        exits: ["d"]
    };
}

function edge(
    id: string,
    source: string,
    destination: string,
    probability: number,
    counterCost: number
): SeaCurrentControlEdge {
    return {
        id,
        source,
        destination,
        probability,
        counterCost,
        effect: "normal",
        instrumentable: true
    };
}

function counterSite(edgeValue: SeaCurrentControlEdge): SeaCurrentCounterSite {
    return {
        id: `site:${edgeValue.id}`,
        edge: edgeValue.id,
        cost: edgeValue.counterCost
    };
}

function emptyDependences(): SeaCurrentDependenceGraph {
    return { operations: [], dependences: [] };
}

function dependence(
    source: string,
    destination: string,
    latency: number,
    distance: number
): SeaCurrentDependence {
    return {
        source,
        destination,
        kind: "raw" as const,
        latency,
        distance,
        confidence: 1,
        reorderable: true
    };
}

function sourceTarget(): SeaCurrentTargetModel {
    return {
        key: "source",
        supportsScheduling: false,
        operationLatency: () => 1,
        resources: () => [],
        resourceCapacity: () => Number.MAX_SAFE_INTEGER,
        branchCost: () => 1,
        codeSizeCost: (candidate) => candidate.sizeIncrease,
        registerPressure: () => 0,
        registerCapacity: () => Number.MAX_SAFE_INTEGER
    };
}

function schedulingTarget(): SeaCurrentTargetModel {
    return {
        key: "two-alu",
        supportsScheduling: true,
        operationLatency: () => 1,
        resources: () => [{ resource: "alu", units: 1 }],
        resourceCapacity: () => 2,
        branchCost: () => 1,
        codeSizeCost: (candidate) => candidate.sizeIncrease,
        registerPressure: () => 2,
        registerCapacity: () => 4
    };
}

function rootProfile(profile: SeaCurrentRegionProfile): Readonly<Record<string, SeaCurrentRegionProfile>> {
    return { root: profile };
}
