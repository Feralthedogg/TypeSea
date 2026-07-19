# SeaCurrent planner

SeaCurrent is TypeSea's zero-dependency, adapter-independent planner for exact
edge profiling, selective path profiling, redundant CDC checks, and verified
transformation scheduling. Import it from `typesea/seacurrent`; it is not part of the
root validator entry and adds no work to `is()`, `check()`, JIT, or AOT.

## Position

The generic SeaCurrent planner does not rewrite compiler-specific IR. A
`SeaCurrentGraphAdapter` converts regions into a directed CFG and directed
dependence graph, and the planner returns immutable instrumentation and
transformation plans. TypeSea additionally ships a V8-specific transformation
adapter. The optional AOT bridge can lower its selected object-field plans back
into TypeSea graph IR; custom compilers still own their payload changes and
rollback.

CFG and dependence directions are never discarded. An undirected shadow graph
exists only during bridge discovery and bounded CDC search.

## Planning pipeline

```text
adapter regions
-> structural hash and incremental lookup
-> exact spanning-tree edge profile
-> bounded CDC certificate and independent verification
-> adaptive path-profile selection
-> optional transformation and schedule verification
-> compiler-owned IR lowering and benchmark gate
-> immutable region plans
```

The TypeSea adapter expands `And`, `Or`, and `Not` in the continuation order
used by predicate emission. Composite loops and dispatches remain atomic
branches, while their child graphs become independent regions.

## Quick start

```typescript
import { t } from "typesea";
import { createSeaCurrent } from "typesea/seacurrent";

const User = t.strictObject({
    id: t.string.uuid(),
    age: t.number.int().gte(0)
});

const current = createSeaCurrent({
    targetKey: "node-v8",
    maxCacheEntries: 512,
    checksums: true
});

const plan = current.plan(User, {
    frequency: 1_000_000,
    uncertainty: 0.3
});
```

Repeated calls reuse structural analysis for unchanged graph regions. Profiles
and learned scores are recalculated because they may change while IR remains
identical. Use `planRegions(User, profiles)` when an instrumented generation
contains data for nested child regions.

`createSeaCurrent()` is the normal TypeSea entrypoint. It creates the adapter,
target, tuner, stable cost-model view, and bounded planner once. `plan()` accepts
a guard or direct schema, while `observe()`, `snapshot()`, `load()`,
`invalidate()`, and `clear()` cover the common lifecycle without repeating the
configured target key.

The facade is zero-cost with respect to validation: it lives in the dedicated
subpath and is never retained by `is()`, `check()`, JIT, or AOT predicates. A
profile-free `plan(source)` also reuses the same normalized planner options and
cost-model closures. Profile shorthands allocate only in the build control plane.

## Optional TypeSea JIT/AOT bridge

`typesea/seacurrent/aot` connects a retained planner to TypeSea's graph emitter.
This is an explicit opt-in surface. Importing or using `typesea/seacurrent` alone
does not instrument a predicate, and ordinary compiled predicates contain no
SeaCurrent condition, counter table, or profile allocation.

```typescript
import { createSeaCurrentAotBridge } from "typesea/seacurrent/aot";

const bridge = createSeaCurrentAotBridge(current);
const profiled = bridge.compile(User, { mode: "safe" });

profiled.is({
    id: "550e8400-e29b-41d4-a716-446655440000",
    age: 42
});

const artifact = profiled.snapshot();
const next = bridge.replan(User, artifact, { uncertainty: 0.1 });
const optimized = bridge.optimize(User, artifact);

const tuned = bridge.tune(User, artifact, representativeInputs, {
    warmupIterations: 20_000,
    iterations: 200_000,
    rounds: 5,
    minSpeedup: 1.02
});

const standalone = bridge.emitOptimized(User, artifact);
profiled.reset();
```

`compile()` produces an in-process boolean predicate and preserves the selected
safe, unsafe, or unchecked validation contract. `emit()` produces standalone ESM
and declaration source exporting `is()`, `snapshot()`, and `reset()`. The existing
AOT portability scan still rejects callback-backed or otherwise non-portable
schemas before source is returned.

The bridge lowers root and nested-region frequencies, complete accept/reject
outcomes, selected exact edge counters, and verified CDC checksum terms. Counter
storage is allocated once per instrumented predicate; an artifact is allocated
only by `snapshot()`. The instrumented predicate necessarily pays fixed
typed-array updates. Use it for a bounded benchmark, canary, or profile
generation.

`optimize()` consumes that artifact, replans, rewrites selected TypeSea object
nodes, validates and freezes the rewritten graph, then emits an uninstrumented
predicate. `emitOptimized()` serializes the same uninstrumented graph as ESM.
Uninstrumented means that profile counters are absent; JIT and AOT predicates
retain TypeSea's normal fail-closed boundary for revoked and trapping proxies.
`tune()` warms both the static baseline and transformed candidate, alternates
measurement order, compares median throughput, and promotes the candidate only
when `minSpeedup` is met. The supplied sample array must be dense and should
represent the intended deployment workload.

Artifacts are versioned and tied to the target, graph structural hashes, edge
layout, and checksum layout. `profiles()` and `replan()` accept `unknown` and read
only own data properties. Every region must satisfy
`accepted + rejected === frequency`. Malformed, accessor-backed, revoked-proxy,
stale, inconsistent, or overflowed generations fail closed without invoking
getters. A hostile reflection failure while profiling marks that generation as
overflowed because interrupted nested regions cannot supply complete outcomes.

The built-in transform is deliberately narrow. In safe mode it reorders only
sampled fields inside pure, equal-presence `ObjectShape` runs. `SchemaCheck`
nodes from `lazy`, `refine`, and similar callback-backed schemas are immovable
barriers. The order minimizes modeled short-circuit work using graph cost divided
by an uncertainty-shrunk rejection probability. Unsampled fields stay in their
static positions. Unsafe and unchecked bridges collect profiles but do not apply
this transform because direct property reads can make evaluation order
observable. Ball-Larus path buckets are still planner output only.

## Operating SeaCurrent

SeaCurrent belongs in the compiler or build control plane, not in an HTTP
request, validation call, or other data-plane hot path. Create a long-lived
adapter, planner, and tuner in each build worker or compiler daemon. Reuse them
across incremental builds so the bounded region cache and target-specific tuner
state remain useful.

The recommended build-to-build loop is:

1. **Plan a baseline build.** Pass `transformations: false` when no transform
   recommendation is wanted. Treat
   `status: "unavailable"`, an unselected path profile, and an absent transform
   as normal fail-closed results.
2. **Lower an instrumented build.** The optional TypeSea AOT bridge lowers exact
   counters, region outcomes, and checksum terms into generated JavaScript. A
   custom host compiler lowers optional Ball-Larus increments itself.
3. **Collect a bounded sample.** Run the instrumented build in benchmarks or a
   canary deployment. Aggregate outside the application hot path.
4. **Validate the profile generation.** Reject unknown edge ids, missing
   required counters, checksum mismatches, overflowed counters, and data from a
   different structural hash. Do not partially merge a rejected generation.
5. **Lower with evidence.** Use `optimize()` or `emitOptimized()` to turn verified
   TypeSea plans into uninstrumented predicates. Custom adapters apply their own
   payload plans.
6. **Measure and learn.** Use `tune()` for the built-in warmed median gate, or
   feed external benchmark outcomes to `observe()`. Persist the tuner snapshot
   between builds, never once per request.
7. **Promote with a fallback.** Keep the static predicate until semantic checks
   and the performance gate pass. `tune()` returns the selected predicate and
   retains both measured throughputs for release evidence.

### Profile identity

Key stored profile data by at least application build id, adapter key, target
key, region id, and `structuralHash`. The planner accepts profiles by region id
for convenience, so the caller must verify the remaining identity fields before
constructing that map. Profiles from different targets or structural hashes are
not interchangeable even when their region ids match.

Start with exact edge profiling and no path-profile budget:

```typescript
const edgeOnly = createSeaCurrent({
    targetKey: "node-v8",
    checksums: true,
    budget: {
        maxCounterCost: 0
    }
});

const firstGeneration = edgeOnly.plan(User, {
    frequency: 1,
    uncertainty: 1
});

for (const region of firstGeneration.regions) {
    if (region.exactProfile.status !== "exact") {
        continue;
    }

    // The host emitter lowers region.exactProfile.counters here.
}
```

`maxCounterCost: 0` prevents path-profile selection while retaining exact edge
plans. Increase it gradually after measured counter overhead is acceptable.
Keep `maxCdcSearchSteps`, `maxCdcCycles`, `maxPathBuckets`, and `maxScheduleII`
finite in shared build infrastructure; budget exhaustion is an expected
fallback, not a reason to retry without limits.

### Tuning state

Use stable units for every observation on a target. For example, keep costs in
nanoseconds per operation, size in emitted bytes, and `actualValue` in the same
normalized benefit units used by the surrounding build system. Mixing units or
feeding raw outliers makes learned weights meaningless.

```typescript
const features = {
    frequency: 2_000_000,
    costBefore: 18,
    costAfter: 14,
    sizeIncrease: 192,
    semanticRisk: 0.05
} as const;

current.observe({
    kind: "benefit",
    features,
    actualValue: 7_900_000
});

const tuningArtifact = current.snapshot();
```

Store the snapshot with the target model and compiler version that produced it.
Call `load()` only after validating that metadata. Prefer aggregated medians or
trimmed means over individual production samples, and reset a target state when
its architecture, runtime, or cost units change materially.

### Cache lifecycle and observability

Monitor `plan.cache.hits`, `misses`, `evictions`, and `rebuiltRegions`. A low hit
rate in an incremental build usually means unstable region ids, a structural
hash that includes volatile data, or a cache that is too small. Bump a custom
adapter's `key`, clear the planner cache, or call the facade's `invalidate()`
method whenever instrumentation legality changes without a corresponding
structural-hash change. Low-level cache users can call `invalidateRegion()`.

Production and CI dashboards should track planning latency, cache hit ratio,
counter count and estimated counter cost, rejected profile generations, path
storage mode, proposed and accepted transforms, emitted code-size delta,
rollback rate, and predicted-versus-measured benefit. These signals distinguish
planner regressions from noisy workloads or stale profiles.

### Safe rollout

A practical rollout is baseline CI, instrumented benchmark, small canary,
target-specific tuning, then guarded promotion. Do not enable automatic payload
mutation until the host compiler has an independent semantic verifier and a
baseline fallback. For ordinary TypeSea schemas, use the optional bridge only for
explicit profile generations. Importing the adapter alone does not make the JIT
consume its plans.

## Low-level compiler adapters

Use `SeaCurrentPlanner` directly when the input is LLVM, GCC, MLIR,
WebAssembly, or another compiler-owned IR. Implement `SeaCurrentGraphAdapter`,
supply a target model and cost model, then lower the immutable result in the
owning compiler. The facade exposes its normalized `adapter`, `target`,
`planner`, and `tuner` for gradual migration, but it intentionally accepts only
TypeSea guard sources.

## Exact profiles and CDC

The exact profiler closes exits through a conceptual super-exit and computes a
maximum-weight spanning tree. Expensive or hot edges stay uninstrumented in the
tree; legal counter sites are selected only for real chord edges. A connected
tree-complement certificate proves full rank without a dense cubic-time matrix.

CDC is a redundancy layer, not the source of exact counts. The implementation:

1. removes bridges from the undirected shadow graph;
2. enumerates bounded simple-cycle candidates;
3. searches for edge multiplicity exactly two;
4. colors overlapping cycles into at most eight layers;
5. verifies connectivity, degree, edge ids, multiplicity, and distinct labels;
6. creates deterministic modular checksums only after verification.

Search exhaustion returns `status: "unavailable"`. Exact edge profiling remains
usable, and no partial CDC result can influence a transformation.

## Adaptive target tuning

`SeaCurrentAutoTuner` keeps independent parameter state per target key. Region
priority starts from:

```text
frequency * weightedPipelinePotential * weightedUncertainty
----------------------------------------------------------------
instrumentationCost + codeSizeCost + epsilon
```

Transformation benefit subtracts learned `lambda * sizeIncrease` and
`gamma * semanticRisk`. `observe()` applies normalized online gradients with
hard bounds to the pipeline and uncertainty weights, `lambda`, `gamma`, and
`epsilon`. This is a deterministic lightweight meta-optimizer, not a runtime ML
dependency.

Feed observations after benchmarks or production profile aggregation. Model
updates never run inside a validation hot path. `snapshot()` and `load()` move
learned state between builds.

## Incremental region cache

`SeaCurrentIncrementalCache` keys structural work by adapter, target, region id,
structural hash, and analysis-budget version. A hit reuses CFG construction,
directed dependences, exact spanning-tree analysis, bridge discovery, and CDC
candidate search.

The cache is bounded LRU storage. `invalidateRegion()` removes every generation
of one logical region. Each program plan reports hits, misses, evictions, and
the exact regions rebuilt. Adapters must include instrumentation legality and
transformation semantics in their structural hash contract.

## Scheduling and transformations

A transformation adapter may propose versioning, if-conversion, unrolling,
vectorization, pipelining, or a custom target operation. The generic planner
scores and verifies candidates. The built-in TypeSea adapter additionally owns
the private graph permutation payload needed by `optimize()`; arbitrary custom
adapters remain recommendation-only until their host supplies a lowerer.

Pipeline candidates receive recurrence and resource MII lower bounds followed
by a difference-constraint warm start. The complete directed dependence graph
and modulo resource capacities are verified afterward. Failed schedules try a
larger II up to the configured budget and then fall back without applying code.

The V8 target disables machine scheduling because V8 owns instruction
scheduling and register allocation. Native, WebAssembly, GPU, or MLIR adapters
can supply concrete latency and resource models.

## Guarantees and limits

Guaranteed:

- exact plans satisfy the spanning-tree rank certificate;
- checksums are emitted only from independently verified covers;
- schedule recommendations pass complete dependence and resource checks;
- every search has explicit work and storage budgets;
- unchanged regions avoid repeated shadow-graph construction;
- ordinary TypeSea imports and hot paths pay no SeaCurrent cost.
- promoted TypeSea predicates contain no profile counters or planner calls.

Not guaranteed:

- CDC does not reduce the exact counter lower bound;
- bounded CDC search is not a complete general CDC constructor;
- edge counts do not reconstruct arbitrary path histograms;
- cyclic CFGs need adapter-provided acyclic SESE fragments for Ball-Larus;
- the optional TypeSea bridge does not lower Ball-Larus path buckets;
- profile-guided object ordering assumes the benchmark sample represents the
  deployment workload and therefore requires an explicit promotion gate;
- learned weights are only as representative as supplied observations.
