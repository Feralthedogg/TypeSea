# Contributing to TypeSea

Thank you for your interest in contributing to TypeSea! TypeSea is not just another validation library; it is a **Sea-of-Nodes JIT/AOT Compiler** disguised as a validation library. Our ultimate goal is to provide **Zero-cost Abstraction** with the highest possible performance and security on the V8 engine.

Before submitting a pull request, please read through our core philosophies and coding guidelines.

---

## 1. Core Philosophies

### 1.1. Zero Dependencies
TypeSea must have **0 dependencies** for its runtime and compiler. We do not rely on Babel, Prettier, or any external utilities to parse, optimize, or format our generated code. Everything is built from scratch to ensure a microscopic bundle size and cold-start time.

### 1.2. Extreme V8 Performance (Zero-cost Abstraction)
Our validation hot paths (`is()`, `check()`) must run at maximum speed (target: 40M+ ops/sec).
- **No Closure Allocations**: Avoid creating anonymous functions or closures in hot paths.
- **Use `break label`**: For control flow jumps (e.g., Union dispatch, Presence dispatch), prefer labeled blocks (`label: {}`) and `break label;` over function calls.
- **Side-table Literals**: Do not interpolate string literals directly into generated JS code to avoid V8 parsing overhead. Store them in a side-table array (`u[0]`, `l[1]`) and reference them by index.
- **Jump Tables**: Use `switch(typeof v)` or `switch(v)` to allow V8 to generate `O(1)` memory jump tables instead of `O(N)` if/else chains.

### 1.3. Uncompromising Security (Safe Mode)
Validation speed must not compromise security. We treat all incoming objects as potentially malicious.
- **Defend against Prototype Poisoning**: Do not blindly read `value.prop`.
- **Defend against Malicious Accessors**: In `safe` mode, ALWAYS use `Object.getOwnPropertyDescriptor` (`gp`) and check for hostile getters before reading `.value`. (e.g., `!h.call(d, "value")`).

---

## 2. Compiler Architecture

When contributing a new validation feature, you must understand the TypeSea compiler pipeline. A feature is never just a "function call". It must flow through the entire architecture:

1. **Builder API (`src/builders/`)**: The user-facing API (`t.string`, `t.object()`). Returns a `Schema` node (`SchemaTag`).
2. **IR Lowering (`src/lower/`)**: Converts the Builder Schema into a Sea-of-Nodes Intermediate Representation (`NodeTag`).
3. **Static Analysis & Optimization (`src/optimize/`)**:
   - **Constant Folding**: Remove redundant constraints (e.g., `.min(0).min(10)` -> `.min(10)`).
   - **Peephole Optimization**: Eliminate unreachable union branches (`t.never`) and redundant logic.
4. **Code Generation (`src/compile/`)**: Traverse the optimized IR graph and emit pure, unrolled JavaScript strings.

> **Requirement**: Any new schema feature must be supported across the **Interpreter**, **JIT Compiler**, **AOT/Async Compiler**, and **JSON Schema generator**.

---

## 3. Coding Style

### 3.1. Documentation (JSDoc)
Use C/C++ style JSDoc where it carries information the signature cannot. Public
API, generated-source ABI, unsafe/unchecked contracts, hostile-input defenses,
V8-sensitive code shape, and non-obvious compiler invariants should be
documented. Small private helpers do not need boilerplate comments.

Good comments explain **why this shape must survive refactors**:
```typescript
/**
 * @brief Emit only helpers referenced by generated validator bodies.
 * @details Helper names are part of the factory ABI shared by JIT and AOT paths;
 * changing one name must be paired with compile/runtime and AOT wrapper updates.
 */
```

Avoid comments that only restate the declaration, such as `@brief constructor`,
`@brief start`, `@returns True if successful`, or parameter lists that repeat
obvious local names. `scripts/source-policy.mjs` rejects known low-information
templates, and `check:contributing` verifies that the policy gate remains wired
into CI.

### 3.2. Strict TypeScript & Type Inference
- Use `readonly` everywhere for schema nodes and IR structures. Objects must be deeply immutable.
- All public types must be strictly tested using `expectTypeOf<>`.

### 3.3. Test-Driven & CI/CD Gates
Before opening a PR, you must pass the entire validation suite:
```bash
npm run check
```
This runs `policy`, `check:contributing`, `check:benchmarks`, `check:docs`,
`typecheck`, `lint`, `test`, `build`, `check:dist`, `check:api`,
`check:zod-compat`, and `check:pack`.

The documentation application is isolated in `website/`. It uses SvelteKit,
Lily source components, mdsvex, and Paraglide with English and Korean catalogs.
Keep the root Markdown files as the content source of truth; the website syncs
them before development, checking, and builds.

```bash
corepack pnpm --dir website install --frozen-lockfile
corepack pnpm --dir website run verify
```

`npm run check:docs` validates the bilingual source and site configuration
without installing website-only dependencies. GitHub Pages runs the complete
pnpm build with `BASE_PATH=/TypeSea` and deploys `website/build`.

The suite also runs the Perl-based contributing policy gate:
```bash
npm run check:contributing
```
This script builds a small policy IR from `CONTRIBUTING.md`, `package.json`,
`tsconfig.json`, source files, test files, release scripts, and benchmark
snapshots. It then runs semantic checks over that IR for the parts of this
document that can be checked reliably in CI: zero runtime dependencies, strict
TypeScript flags, public type tests, release metadata, export conditions, source
import boundaries, module-graph layering, SchemaTag/NodeTag coverage,
generated-source ABI continuity, required release gates, comment-policy wiring,
safe-mode descriptor evidence, compiler-pipeline coverage, and hot-path
benchmark targets.

The source side of this gate is token based, not whole-file regular-expression
matching. It lexes TypeScript enough to separate comments, strings, nested
template literals with `${...}` interpolation, imports, exports, and identifiers
before checking module edges, generated-source fragments, public JSDoc
proximity, and helper ABI slots. Unterminated quoted strings, regular
expressions, template literals, and template interpolations are reported as
`lex.parse` errors instead of being silently recovered into a misleading module
graph. Import/export analysis classifies type-only edges, including
`import { type Foo } from ...` and `export { type Foo } from ...`, so the
runtime module graph is not polluted by type-only references. It also treats
value imports named `type`, such as `import { type as value } from ...`, as
runtime edges. Literal dynamic imports, such as `await import("./chunk.js")`,
are also included in runtime graph analysis. Import statement boundaries do not
depend on semicolons, so semicolonless source style still produces a stable
graph. Module cycle checks use an iterative strongly-connected-component pass
so repository growth does not rely on recursive Perl call depth.

Policy diagnostics use three levels:
- **error**: invariant violation; CI fails.
- **warning**: likely policy drift or aspirational target miss; CI passes but the PR needs review.
- **notice**: verified state or informational coverage; shown with `perl scripts/contributing-policy.pl --verbose`.

The analyzer also emits a **soundness envelope** in JSON, SARIF, and HTML
reports. This is the list of assumptions under which the policy result should be
trusted: lexer completeness, module graph closure, function IR/CFG extraction,
interprocedural fixed-point convergence, hostile-input sink closure,
generated-source provenance, variant exhaustiveness, V8 performance envelope,
and release-governance state. Open assumptions fail the quality gate through
`soundnessAssumptionBudget`; budgeted assumptions remain visible so a reviewer
can distinguish proven coverage from deliberate approximation.

Security-sensitive evidence is tracked separately as **security hotspots**. JIT
entry points, side-table generated-source bridges, hostile-accessor defenses,
prototype-pollution key paths, taint/symbolic hostile-input sinks, and security
regression coverage are grouped into a review model before they are treated as
release evidence. Actual error-level security findings are reported as
vulnerabilities, warning-level hotspots require review through
`securityHotspotReviewBudget`, and notice-level boundaries remain visible as
reviewed evidence.

Regex validators are covered by a dedicated **ReDoS safety** domain. The
analyzer inventories regex literals, string-based `RegExp` constructors, dynamic
constructors, and stateful `g` / `y` patterns, then flags backreferences,
nested unbounded quantifiers, quantified alternation, and wildcard chains as
`security.redos-risk`. ReDoS findings are tracked by `redosRiskBudget`; dynamic
constructors remain visible in the domain summary without failing the gate by
themselves.

Committed credential material is covered by a dedicated **secret leak** domain.
The analyzer scans release-relevant source, scripts, tests, benchmarks, GitHub
workflow files, and root package/documentation manifests for AWS access key ids,
GitHub tokens, npm tokens, OpenAI keys, private-key headers, and high-entropy
credential assignments. Local `.env` files are intentionally excluded, and
findings carry only redacted previews plus stable fingerprints. Hardcoded secret
findings are reported as `security.secret-leak` and are gated by the
zero-budget `secretLeakBudget`.

GitHub Actions release automation is covered by a dedicated **workflow supply
chain** domain. The analyzer inventories workflow files, `uses:` action
references, token write permissions, secret usage, `pull_request_target`, and
release publish evidence. High-risk workflow findings are reported as
`supply.workflow-permission` or `supply.workflow-publish` and are gated by the
zero-budget `workflowHighRiskBudget`. Mutable action references are reported as
`supply.workflow-action-ref` and tracked by `workflowMutableActionBudget` so the
current release path remains visible while future drift is caught.

The npm lockfile is covered by a dedicated **lockfile supply chain** domain.
The analyzer checks `package-lock.json` for lockfile version drift, runtime
dependency drift, missing integrity metadata, plain HTTP, Git/file/link
resolved entries, non-registry tarballs, and dependency lifecycle scripts.
Lockfile supply-chain findings are reported as `supply.lockfile-integrity` or
`supply.lockfile-runtime` and gated by zero-budget `packageLockRiskBudget` and
`packageLockRuntimeDependencyBudget`.

Package licenses are covered by a dedicated **license compliance** domain. The
analyzer inventories the root package license and every lockfile package license,
rejects missing or denied licenses as `legal.license-risk`, and keeps
weak-copyleft development-tooling licenses visible as `legal.license-review`.
Denied or missing licenses are gated by zero-budget `licenseRiskBudget`; reviewed
license obligations are tracked by `licenseReviewBudget`.

Public package entry points are covered by a dedicated **API surface drift**
domain. The analyzer compares `package.json` export subpaths against README/API
documentation import specifiers, checks `types` / `import` / `default` condition
metadata, and rejects stale documentation references. Surface drift is reported
as `api.surface-drift`; missing public-export documentation is reported as
`api.docs-coverage`. Both are zero-budget release gates through
`apiSurfaceDriftBudget` and `apiDocumentationGapBudget`.

Release metadata is covered by a dedicated **release consistency** domain. The
analyzer compares `package.json`, `package-lock.json`, the root lockfile package,
`bench/results/latest.json`, the top `CHANGELOG.md` version, the generated docs
site version label, and the README Socket badge shape. Mismatches are reported as
`release.version-drift` and gated by zero-budget
`releaseConsistencyRiskBudget`; version bumps must update every generated
release artifact before publication.

Benchmark claims are covered by a dedicated **benchmark evidence** domain. The
analyzer treats `bench/results/latest.json` as release evidence, not a loose
marketing artifact: it requires Node/V8/CPU metadata, median-of-runs aggregation,
and the full warm benchmark row portfolio for valid/invalid boolean paths,
diagnostic paths, union dispatch, runtime cache, async, macro, and AOT scenarios.
Missing or malformed evidence is reported as `bench.evidence-gap` and gated by
zero-budget `benchmarkEvidenceGapBudget`; the summary appears as
`bench.evidence-domain` in JSON, SARIF, HTML, and CLI quality-gate output.

Analyzer rules are covered by a dedicated **rule metadata** domain. Every emitted
diagnostic rule must carry machine-readable category, engine, precision,
confidence, remediation, description, remediation help, severity class, and SARIF
tags. Missing metadata is reported as `rule.metadata-gap` and gated by
zero-budget `ruleMetadataGapBudget`. Rules that still rely on prefix-derived
generic metadata are reported as `rule.metadata-generic` and tracked by
zero-budget `genericRuleMetadataBudget`; rule families that are generated from
stable metadata templates must still mention the exact rule id and carry focused
remediation text.

Async validation is covered by a dedicated **async scheduling** domain. The
analyzer summarizes `await` sites, loop-carried awaits, cooperative yield calls,
promise creation, promise combinator evidence, and detached promise candidates.
Sequential loop awaits or floating promises in async-sensitive TypeSea paths are
reported as `flow.async-scheduling-gap` and tracked by
`asyncSchedulingGapBudget`.

TypeScript escape hatches are covered by a dedicated **type escape** domain.
The analyzer counts explicit `any`, `as any`, `as unknown as` double
assertions, non-null assertions, unchecked `JSON.parse` boundaries, and
`@ts-ignore` / `@ts-expect-error` comments. `unknown` itself is not a finding;
it is the required boundary type for hostile external data. Escape hatches are
reported as `types.escape-domain` / `types.unsafe-escape` and tracked by
`typeEscapeBudget`.

Intentional analyzer exceptions must be local and reasoned. Put the suppression
comment directly above the warned line or declaration, name the exact rule code,
and explain why the exception is acceptable:

```typescript
/*
 * TINL flow.complexity: generated dispatch table is intentionally flat for V8 locality
 */
emitLargeDispatchTable();

/*
 * TIND flow.hot-loop-allocation: lookup table is allocated once at module load, outside validation hot paths
 */
export const lookupTable = buildLookupTable();

/*
 * TIND flow.complexity: central parser entrypoint keeps grammar recovery in one audited function
 */
export function parseSchemaGrammar(input: string): ParseResult {
    return parseWithRecovery(input);
}
```

Suppressions without a rule code or a concrete reason are reported as
`source.suppression-reason`. `TINL` means "TypeSea ignore next line" and covers
only the next statement. `TIND` means "TypeSea ignore next declaration" and
covers the whole following function, variable, or class declaration range; use
it only for cases that a reviewer can audit from the comment alone. The older
`typesea-ignore-next-line` and `typesea-ignore-next-declaration` spellings are
still accepted for compatibility, but new suppressions should use the short
block-comment form.

All accepted exceptions are also tracked by the **waiver audit** model in JSON,
SARIF, and HTML reports. Source suppressions, baseline suppressions, and triage
states such as `accepted-risk`, `false-positive`, and `mitigated` remain visible
even when they no longer count as open defects. Stale source suppressions that
no longer suppress any diagnostic fail through `staleWaiverBudget`; expired
accepted risks fail through `expiredWaiverBudget`.

The analyzer also emits an **analysis coverage** model. It records whether the
source front end, function IR/CFG, SchemaTag coverage, NodeTag coverage,
generated-source ABI checks, and policy-engine self-checks actually ran before a
warning is accepted. Coverage gaps are reported in JSON, SARIF, and the HTML
dashboard, and fail the quality gate through `analysisCoverageGapBudget`.

The analyzer also emits a **test evidence** model. It inventories the required
test portfolio for TypeSea's core semantics, JIT parity, AOT, async validation,
JSON Schema, decoders, adapters, hostile-input regression, fuzz parity, public
types, Zod compatibility, SeaFlow, SeaBreeze, IR recursion, entrypoints, and
message surfaces. Missing required test files are reported as `test.evidence-gap`
and gated by zero-budget `testEvidenceGapBudget`.

Open diagnostics are also grouped by the **root-cause correlation** model. The
model clusters defects by TypeSea layer, analyzer engine, and remediation class,
then reports localized versus systemic causes, suggested owners, top examples,
and the `rootCauseOpenBudget` quality-gate metric. Use this view before fixing a
long warning list; one systemic cause should be fixed once instead of patched at
every symptom.

Each checker also has a **rule health** record. The analyzer tracks per-rule
signal, open findings, reviewed states, suppressions, false positives, and a
noise ratio so a noisy checker is visible as a tool-quality problem instead of
being hidden inside the defect list. `noisyRuleBudget` gates rules whose
false-positive or suppression ratio crosses the noisy threshold; ordinary open
warnings are classified as `watch` until review data proves they are noise.

Every emitted finding also carries **finding provenance**. Diagnostics, rule
metadata, defect-ledger records, owner data, remediation text, fingerprints, and
SARIF projection fields are cross-checked before the report is accepted.
`findingProvenanceGapBudget` defaults to zero, so missing provenance must be
fixed in the analyzer instead of hidden by a report-format bug.

Actionable warning/error findings must also carry a **finding witness**. A
finding is accepted only when it has a SARIF flow trace, a quantified metric
witness such as a benchmark or complexity value, or a reviewed waiver reason,
plus concrete source location, owner routing, stable fingerprint, and
remediation guidance. Missing witness evidence fails through
`findingWitnessGapBudget`.

The analyzer also calibrates **finding confidence**. Rule precision, rule
confidence, witness strength, concrete location, owner routing, remediation
guidance, and stable fingerprints are scored into `high`, `medium`, or `low`
bands. Open warning/error findings in the `low` band fail through
`lowConfidenceFindingBudget`, which defaults to zero.

Every machine report also carries an **analysis run manifest**. The manifest
records package identity, policy profile digest, analyzer script digest, source
tree digest, benchmark snapshot digest, git HEAD/branch, and dirty-worktree
context so a reviewer can reproduce the exact analysis inputs. Missing manifest
identity or digest fields fail through `runManifestGapBudget`; a dirty worktree
is reported as context and does not fail local development runs by itself.

Changed source files are also analyzed by the **change impact** model. The
analyzer walks the reverse TypeScript import graph from each changed file,
classifies TypeSea critical layers such as `compile`, `aot`, `plan`,
`evaluate`, `optimize`, and `ir`, and reports the blast radius that reaches
critical or public API surfaces. Local dirty-worktree impact is reported as
review context; `changeImpactCriticalBudget` and
`changeImpactBlastRadiusBudget` are enforced only when a new-code scope is
explicitly provided with `--new-code-base` or `--new-code-file`.

`--verbose` also prints a CONTRIBUTING coverage summary. Each machine-checkable
rule is mapped to one or more diagnostics; policy text that is inherently a
human review concern, such as focused PR scope, is classified explicitly as
manual-review coverage instead of being silently ignored.

---

## 4. Good First Issues (For Beginners)

If you're new to TypeSea and intimidated by the Sea-of-Nodes compiler architecture, don't worry! There are plenty of meaningful ways to contribute without touching the core JIT/AOT code:

- **Error Message Improvements**: Enhancing the clarity of validation errors or adding custom string format validations.
- **Builder API Additions**: Adding simple utility wrappers around existing scalars (e.g., `t.string.uuid()`, `t.string.ip()`) or new metadata annotations.
- **Test Coverage**: Writing edge-case tests in `test/zod-like-features.test.ts` or `test/core.test.ts` to ensure our public API perfectly matches expected behaviors.
- **Documentation**: Improving JSDoc descriptions, adding code examples, or enhancing the Markdown files.

---

## 5. Submitting a Pull Request
1. Keep PRs highly focused. If you are adding a new IR optimization, include benchmark results (`npm run bench:compare`).
2. Ensure no regressions in `test/security-regression.test.ts`.
3. If changing the public API, ensure `check:api` is updated and approved.
