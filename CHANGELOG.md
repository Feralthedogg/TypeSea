# Changelog

All notable changes to TypeSea are recorded here.

## 1.3.0 - 2026-07-20

### Added

- Added the isolated `typesea/codegen` declaration precompiler. It renders
  top-level and nested schema descriptions as IDE-visible JSDoc while retaining
  exact `Infer<typeof schema>` types for brands, custom guards, optional fields,
  and recursive schemas.
- Added the isolated `typesea/seacurrent` SeaCurrent planning subpath with exact
  spanning-tree edge profiling, bounded and independently verified CDC covers,
  selective Ball-Larus path plans, and fully revalidated schedule warm starts.
- Added target-specific online cost-model tuning for pipeline potential,
  profile uncertainty, size penalty, semantic risk, and denominator epsilon.
- Added bounded incremental region caching keyed by adapter, target, structural
  hash, and analysis budget so unchanged CFG, dependence, and shadow-graph work
  is reused across builds.
- Added a TypeSea Sea-of-Nodes adapter, English/Korean documentation, package
  consumer checks, and focused rank, CDC, path, scheduling, tuning, and cache
  regression tests.
- Added `createSeaCurrent()`, a retained TypeSea facade with direct guard
  planning, root and nested-region profile helpers, target-local observations,
  tuner snapshots, and explicit cache lifecycle controls.
- Added the opt-in `typesea/seacurrent/aot` bridge for instrumented JIT predicates,
  standalone profiled ESM emission, hostile-safe profile artifacts, and closed-loop
  replanning. Ordinary TypeSea predicates remain uninstrumented.
- Added complete per-region accept/reject profiling and the TypeSea transformation
  lowerer that reorders sampled pure object checks without crossing callback or
  presence boundaries.
- Added `optimize()` and `emitOptimized()` for uninstrumented JIT/AOT promotion,
  plus `tune()` for warmed, alternating-order median benchmarks with an explicit
  minimum-speedup gate and target-local feedback.

### Fixed

- Preserved existing live cost-model views when loading auto-tuner snapshots so
  retained builders observe restored parameters without rebuilding closures.
- Closed the planning-to-code gap: verified TypeSea transform plans now become
  validated and frozen graph IR before source emission instead of remaining
  recommendation-only metadata.

## 1.2.1 - 2026-07-13

### Added

- Added the dedicated `typesea/plugin` subpath and standalone English/Korean AOT
  plugin guides for Vite, Rollup, and esbuild configuration.
- Added SeaFlow extreme-mode probes for reflection-throwing and revoked proxies.
- Added canonical English/Korean Zod compatibility and project-direction guides.

### Changed

- Positioned the package and documentation around TypeSea's validation compiler
  contract, with Zod-shaped exports explicitly classified as compatibility
  facades.
- Removed declaration maps from npm release builds and added packed size,
  unpacked size, and file-count budgets to the package gate.
- Pinned GitHub Actions to immutable revisions and disabled persisted checkout
  credentials in CI and release workflows.

## 1.2.0 - 2026-07-11

### Added

- Added a pinned real-world Zod compatibility corpus covering nine public
  repositories, 1,875 Zod-importing files, 28,758 observed calls, and 224
  self-contained replacement compilation candidates.
- Added `TypeSource<Output, Input, Presence>` as the shared structural contract
  for guards, decoders, codecs, and Zod-compatible schema aliases.
- Added decoder-aware union, intersection, lazy, array, and object composition,
  including public `ArrayDecoder`, `ObjectDecoder`, and `ObjectCodec` classes.
- Added object decoder shape operations for `extend`, `safeExtend`, `merge`,
  `pick`, `omit`, `partial`, strict/strip/passthrough modes, and mixed
  guard-decoder object promotion.
- Added the Zod declaration aliases observed by the corpus across
  `typesea/zod`, `/v3`, `/v4`, `/v4/core`, and `/v4-mini`.

### Changed

- Preserved decoder input and output types through transformed strings, arrays,
  object shapes, unions, and recursive lazy schemas. `default()` now excludes
  `undefined` from its output after installing a fallback.
- Preserved object shape capabilities after descriptions and refinements.
  Zod-facade objects accept truthy refinement results while native TypeSea
  refinements retain their literal-`true` contract.
- Tightened the compatibility gate to zero replacement-only TypeScript
  diagnostics and zero missing observed declaration exports. These are pinned
  source-compatibility budgets, not a claim of complete Zod semantic parity.

### Security

- Kept decoder object reads descriptor-based, including the new object
  composition and selection paths. Hostile data and selection-mask accessors
  are rejected without execution.

## 1.1.1 - 2026-07-11

### Changed

- Stabilized benchmark warmup hooks by giving all benchmark suites a shared
  release-gate timeout budget. Warmup still runs before measurement; the
  timeout change only prevents slow CI runners from failing before sampling.
- Strengthened benchmark drift checks so `bench/results/latest.json` must match
  the current package name and version before `check:benchmarks` or
  `bench:compare` can pass.
- Hardened npm package checks with explicit development-path exclusions and
  export-condition validation for every public subpath.
- Added a Perl-based `check:contributing` gate that builds a small policy IR and
  semantically verifies the automatable parts of `CONTRIBUTING.md`: zero runtime
  dependencies, strict TypeScript flags, public type tests, release metadata,
  export conditions, source import boundaries, module graph layering,
  SchemaTag/NodeTag coverage, generated-source ABI continuity, release-gate
  coverage, comment-policy wiring, safe-mode descriptor evidence,
  compiler-pipeline coverage, and benchmark target drift. Diagnostics are split
  into error, warning, and notice levels.
- Replaced the policy gate's structural TypeScript parsing with a shared
  TypeScript `Program`/AST/`TypeChecker` front end. Imports, exports, public
  declarations, function-like nodes, resolved call targets, inferred types,
  type-safety escapes, regex literals, and compiler diagnostics now carry exact
  zero-based UTF-16, end-exclusive ranges; the Perl layer remains responsible
  for policy aggregation, quality gates, and reports.
- Added a constrained Algorithm-W inference supplement for local expressions.
  TypeScript inference and explicit annotations remain authoritative; HM output
  is provenance-labeled, non-blocking fallback evidence and reports occurs-check,
  unsupported-syntax, value-restriction, and analysis-budget outcomes.
- Added a stdio TypeScript language server for compiler and document-local
  TypeSea policy diagnostics, inferred-type hover, go-to-definition, and safe
  quick-fix code actions. Rust-style terminal diagnostics and SARIF now preserve
  exact start/end columns, related locations, UTF-16 offsets, compiler codes,
  remediation notes, and suggested fixes.
- Added compiler-front-end regression fixtures for comment/parser bait, nested
  templates, complex generics, methods, constructors, arrows, postfix non-null
  assertions, cross-file generic inference, malformed syntax, deterministic
  output, and emoji-sensitive UTF-16 columns.
- Kept the standalone analyzer warning budget at 200. Newly visible, exact
  TypeChecker call cycles remain visible to the gate rather than being hidden by
  a broad budget increase.
- Rebased only the Perl gate's affected domain baselines after full AST-body
  coverage exposed previously uncounted recursion, hot-loop, exception, async,
  allocation, and call-context debt. Global warning/error budgets were not
  raised; future growth above the recorded per-domain counts still fails.
- Made executable AST bodies and TypeChecker-resolved targets the function and
  call inventory for interprocedural abstract domains. Local TypeSea-specific
  metrics are re-tokenized strictly inside Compiler API runtime spans. Nested
  bodies and parameter initializers remain owned by the nested function, while
  closure creation and evaluated computed names/decorators remain visible to the
  enclosing runtime. Earlier summaries are migration comparisons only;
  extraction failures are explicit unknowns, not missing functions or
  assumed-safe zeros.
- Added explicit runtime-owner nodes for module execution, class-static
  initialization, implicit constructors, and instance-field initialization.
  Synthetic semantic edges model `new`, `super`, decorators, computed names,
  static blocks, and field initializers without leaking deferred closure bodies
  or instance costs into their lexical parent. Compiler-enumerated non-runtime
  type spans are masked before local token domains, preventing generic/type-only
  syntax from being mistaken for calls, allocations, or dynamic-code sinks.
- Added TypeChecker-resolved implicit edges for getter/setter dispatch, object
  literal computed method names, and decorator application. Setter RHS facts
  participate in taint propagation; unresolved project-local decorator factory
  results fail closed as runtime-ownership obligations.
- Hardened the policy lexer's template literal handling for nested `${...}`
  interpolation, nested template literals inside interpolation expressions, and
  comments or RegExp literals inside interpolation blocks. The analyzer now runs
  lexer self-tests before reading project policy state.
- Added multi-character operator tokens and type-only import/export
  classification to the policy analyzer, including `import { type Foo } from`
  and `export { type Foo } from` graph-edge handling. The classifier also keeps
  value imports named `type`, such as `import { type as value } from ...`, in the
  runtime graph.
- Added literal dynamic import extraction to the policy analyzer so
  `await import("./module.js")` participates in runtime dependency and layer
  graph checks.
- Hardened import statement boundary detection so semicolonless source files do
  not collapse multiple imports into one analyzer statement.
- Added `lex.parse` diagnostics for unterminated quoted strings, regular
  expressions, template literals, and template interpolations so malformed
  TypeScript input cannot be silently folded into policy graph analysis.
- Reworked module-cycle detection in `check:contributing` from recursive DFS to
  an iterative strongly-connected-component pass, avoiding Perl call-stack depth
  as the import graph grows.
- Added a zero-dependency static-analysis workbench under `tools/analyzer` with
  a shared analysis engine, CLI, Node HTTP backend, and browser dashboard. The
  analyzer now exposes a rule catalog, configurable quality profile, quality
  gate, deterministic issue fingerprints, baseline suppression, SARIF 2.1.0
  export, non-zero quality-gate CLI mode, rule hit summary, hotspot ranking,
  runtime module graph, function
  summaries, function call graph, recursive SCC
  detection, source viewer, and TypeSea-specific checks for JIT dynamic-code bridges,
  hostile-input property access, descriptor value-slot proofs, generated-source
  ABI helpers, SchemaTag/NodeTag coverage, layer boundaries, complexity, and
  generated artifact imports.
- Extended the Perl `check:contributing` policy analyzer with function IR
  extraction, function-level complexity summaries, a conservative function call
  graph, recursive SCC detection, descriptor-proof abstract state, dynamic-code
  sink confinement checks, hostile-parameter sink candidate detection,
  descriptor-read dominance checks, TypeSea-specific abstract-domain counts,
  interprocedural taint fixed-point propagation, SARIF code-flow reporting,
  JSON reports, deterministic issue fingerprints, baseline suppression,
  configurable rule profiles, and quality-gate budgets.
- Added a path-sensitive symbolic execution domain to the Perl policy analyzer.
  The function IR now records parameter type summaries, separates primitive
  parameters from hostile payload candidates, tracks fail-fast path cuts, and
  emits SARIF/JSON proof traces for TypeSea-sensitive hostile-input sink paths.
- Added interprocedural symbolic fixed-point propagation to the Perl policy
  analyzer. Local hostile-input sink witnesses now propagate through caller
  edges that forward hostile arguments, with SARIF caller-to-callee code-flow
  traces and an `interproceduralSymbolicPathBudget` quality-gate budget.
- Added an abstract memory/alias domain to the Perl policy analyzer. Function
  summaries now track hostile heap regions, local aliases, clone barriers,
  freeze facts, escaped aliases, and alias-mediated mutations so safe TypeSea
  paths cannot mutate hostile or frozen heap regions through another name.
- Added a rule catalog and defect taxonomy to the Perl policy analyzer. JSON and
  SARIF reports now attach category, engine, precision, confidence, remediation
  class, tags, and selected CWE metadata to diagnostics and rule definitions,
  with a `policy.rule-catalog` self-check keeping that reporting layer wired.
- Added a defect ledger and triage model to the Perl policy analyzer. Machine
  reports now emit stable defect keys, lifecycle status (`open`, `evidence`, or
  `suppressed`), priority bands, triage scores, remediation text, and top-open
  issue ordering, with `policy.defect-ledger` guarding that reporting contract.
- Added differential defect comparison to the Perl policy analyzer. Passing
  `--compare-report` now compares the current defect ledger with a previous JSON
  or SARIF report, emits new/resolved/persisting open-defect sets, and fails the
  quality gate when new open defects exceed the `newDefectBudget`.
- Added human-readable analyzer output to the Perl policy analyzer. `--html`
  emits a self-contained dashboard, and `--serve [port]` exposes the same report
  through a zero-dependency local HTTP endpoint with `/api/report` JSON.
- Upgraded human terminal diagnostics with a Rust-style rich view containing
  source context, carets, reasons, remediation help, and bounded flow traces.
  Color is TTY-aware, honors `NO_COLOR`, and can be controlled with
  `--color auto|always|never` or `--no-color`; `--diagnostic-format rich|short`,
  `--context-lines N`, and `--max-flow-steps N` tune detail. `--explain RULE`
  and `--help` provide rule and CLI guidance. JSON, SARIF, and HTML output remains
  free of terminal color and decoration.
- Added a normalized token clone-analysis domain to the Perl policy analyzer.
  The analyzer now fingerprints TypeSea source token windows, reports duplicate
  and cross-file clone groups, exposes them in JSON/SARIF/HTML output, and
  gates them through `duplicateBlockBudget`.
- Added a SonarQube-style quality model to the Perl policy analyzer. Reports now
  include dimension ratings, open/evidence counts, technical-debt minutes, top
  quality hotspots, SARIF quality-model properties, and a `technicalDebtBudget`
  quality gate.
- Added issue-history trend tracking to the Perl policy analyzer. `--history`
  reads previous snapshots, `--write-history` persists the current run, reports
  now expose open/debt/rating deltas, and the quality gate can enforce
  `historyOpenRegressionBudget` and `historyDebtRegressionBudget`.
- Added history-backed issue aging to the Perl policy analyzer. History snapshots
  now build a defect-key first-seen/last-seen index, reports expose age, SLA,
  oldest, and overdue issue summaries, and quality gates can enforce
  `overdueIssueBudget`, `maxIssueAgeDays`, and `slaDaysByPriority` profile
  overrides.
- Added a TypeSea assurance-case model to the Perl policy analyzer. Core safety
  claims now tie hostile accessor defenses, mutation barriers, key-safety,
  Result-state guards, lifecycle balance, dynamic-code confinement,
  generated-source provenance, symbolic hostile-input closure, hot-loop
  allocation control, and schema-union exhaustiveness to diagnostic evidence,
  budgeted metrics, JSON/SARIF/HTML reports, and `assuranceGapBudget`.
- Added a TypeSea compliance control matrix to the Perl policy analyzer. The
  matrix maps security, correctness, performance, and release-governance
  controls to diagnostics, assurance claims, JSON/SARIF/HTML reports, and a
  `complianceFailureBudget` quality-gate budget.
- Added a SonarQube-style security hotspot review model to the Perl policy
  analyzer. JIT bridges, side-table generated-source paths, hostile-accessor
  defenses, prototype-pollution key paths, taint/symbolic hostile-input sinks,
  and security-regression evidence now appear in JSON/SARIF/HTML reports, with
  unreviewed warning/error hotspots gated by `securityHotspotReviewBudget`.
- Added a regex ReDoS safety domain to the Perl policy analyzer. Source analysis
  now inventories regex literals, string-based `RegExp` constructors, dynamic
  constructors, and stateful patterns, flags backreferences, nested unbounded
  quantifiers, quantified alternation, and wildcard chains as
  `security.redos-risk`, and tracks the risk through quality gates, assurance
  claims, compliance controls, soundness assumptions, and `redosRiskBudget`.
- Added a hardcoded secret leak domain to the Perl policy analyzer. Release
  inputs are scanned for AWS, GitHub, npm, OpenAI, private-key, and
  high-entropy credential assignments; findings are redacted, fingerprinted,
  surfaced as `security.secret-leak`, and tracked through quality gates,
  assurance claims, compliance controls, soundness assumptions, and
  `secretLeakBudget`.
- Added a GitHub Actions workflow supply-chain domain to the Perl policy
  analyzer. Workflow files are scanned for mutable action refs, broad write
  permissions, `pull_request_target`, secret exposure on pull request triggers,
  and release publish evidence; high-risk findings are tracked by
  `workflowHighRiskBudget`, mutable action drift by
  `workflowMutableActionBudget`, and the domain is connected to SARIF,
  assurance claims, compliance controls, and soundness assumptions.
- Added an npm lockfile supply-chain domain to the Perl policy analyzer.
  `package-lock.json` is scanned for lockfile version drift, runtime dependency
  drift, missing integrity metadata, HTTP/Git/file/link or non-registry resolved
  entries, and dependency lifecycle scripts. Findings are surfaced as
  `supply.lockfile-integrity` or `supply.lockfile-runtime`, gated by
  `packageLockRiskBudget` and `packageLockRuntimeDependencyBudget`, and
  connected to SARIF, assurance claims, compliance controls, and soundness
  assumptions.
- Added a package license compliance domain to the Perl policy analyzer. The
  root package and lockfile package licenses are inventoried, denied or missing
  licenses are surfaced as `legal.license-risk`, weak-copyleft review items are
  surfaced as `legal.license-review`, and the domain is connected to quality
  gates, SARIF, assurance claims, compliance controls, and soundness assumptions.
- Added a public API surface drift domain to the Perl policy analyzer. The
  analyzer now compares `package.json` export subpaths with README/API
  documentation import specifiers, validates `types` / `import` / `default`
  export-condition metadata, rejects stale docs references, and gates drift via
  `apiSurfaceDriftBudget` and `apiDocumentationGapBudget`.
- Added a release metadata consistency domain to the Perl policy analyzer. The
  analyzer now cross-checks `package.json`, `package-lock.json`,
  `bench/results/latest.json`, the top `CHANGELOG.md` release heading, generated
  docs site version text, and README Socket badge pinning, then gates drift via
  `releaseConsistencyRiskBudget`.
- Added a test evidence domain to the Perl policy analyzer. The required test
  portfolio now covers core semantics, JIT parity, AOT, async validation, JSON
  Schema, decoders, adapters, hostile-input regression, fuzz parity, public
  types, Zod compatibility, SeaFlow, SeaBreeze, IR recursion, entrypoints, and
  message surfaces; missing suites are surfaced as `test.evidence-gap` and gated
  by `testEvidenceGapBudget`.
- Added a TypeSea soundness envelope to the Perl policy analyzer. Reports now
  make analyzer assumptions explicit across lexer completeness, module-graph
  closure, function IR/CFG extraction, interprocedural fixed-points,
  hostile-input sink closure, generated-source provenance, variant
  exhaustiveness, V8 performance budgets, and release governance, with open
  assumptions gated by `soundnessAssumptionBudget`.
- Added an async scheduling domain to the Perl policy analyzer. Function IR now
  summarizes `await` sites, loop-carried awaits, cooperative yield evidence,
  promise creation, promise combinator use, and detached promise candidates,
  with `flow.async-scheduling-gap` tracked through quality gates, assurance
  claims, compliance controls, and `asyncSchedulingGapBudget`.
- Added a TypeScript type escape domain to the Perl policy analyzer. Source
  analysis now counts explicit `any`, `as any`, `as unknown as` double
  assertions, non-null assertions, unchecked `JSON.parse` boundaries, and
  `@ts-ignore` / `@ts-expect-error` comments, with `types.unsafe-escape`
  tracked through quality gates, assurance claims, compliance controls,
  soundness assumptions, and `typeEscapeBudget`.
- Added reasoned source suppression comments to the Perl policy analyzer.
  `typesea-ignore-next-line <rule-code>: <reason>` now suppresses the next
  diagnostic on a declaration or statement, preserves the reason in JSON/SARIF,
  and rejects suppression comments that omit a rule code or rationale.
  `typesea-ignore-next-declaration <rule-code>: <reason>` now suppresses the
  whole following function, variable, or class declaration range for intentional
  analyzer exceptions, with self-tests covering both function and variable
  declarations.
- Added a waiver audit model to the Perl policy analyzer. Source suppressions,
  baseline suppressions, and reviewed triage states now stay visible in
  JSON/SARIF/HTML reports, stale source suppressions are detected when they no
  longer suppress any diagnostic, and stale or expired waivers are gated by
  `staleWaiverBudget` and `expiredWaiverBudget`.
- Added an analysis coverage model to the Perl policy analyzer. JSON, SARIF,
  HTML, and the quality gate now expose whether source lexing, function IR/CFG,
  SchemaTag coverage, NodeTag coverage, generated-source ABI checks, and
  policy-engine self-checks actually ran; coverage gaps fail through
  `analysisCoverageGapBudget`.
- Added a benchmark evidence domain to the Perl policy analyzer. The gate now
  validates `bench/results/latest.json` metadata, Node/V8/CPU evidence,
  median-of-runs aggregation, and the required warm benchmark row portfolio for
  TypeSea, ecosystem, union dispatch, runtime cache, async, macro, and AOT
  scenarios. Gaps surface as `bench.evidence-gap`, fail through
  `benchmarkEvidenceGapBudget`, and feed assurance, compliance, soundness,
  SARIF, JSON, HTML, and CLI quality-gate output.
- Added a rule metadata integrity domain to the Perl policy analyzer. Every
  emitted rule is now checked for category, engine, precision, confidence,
  remediation, description, remediation text, severity class, and SARIF tags.
  Required metadata gaps surface as `rule.metadata-gap` and fail through
  `ruleMetadataGapBudget`, while prefix-derived generic metadata remains visible
  through `rule.metadata-generic` and zero-budget `genericRuleMetadataBudget`.
- Replaced the remaining prefix-only rule catalog defaults with focused metadata
  generators for policy, flow, compiler stage, SchemaTag, NodeTag, JIT, safe-mode,
  release, package, graph, lexer, type-safety, ABI, and benchmark rule families.
  The rule catalog now reports `rules=186`, `specific=186`, `generic=0`, and
  `gaps=0`.
- Added root-cause correlation to the Perl policy analyzer. Defects are now
  clustered by TypeSea layer, analyzer engine, and remediation class, exposed in
  JSON/SARIF/HTML reports, annotated on SARIF results with root-cause ids, and
  tracked by the `rootCauseOpenBudget` quality-gate metric.
- Added rule-health calibration to the Perl policy analyzer. Per-rule signal,
  reviewed state, suppression, false-positive, and noise ratios now appear in
  JSON/SARIF/HTML reports, with noisy checkers gated by `noisyRuleBudget` while
  ordinary open findings remain watch-list evidence.
- Added finding-provenance integrity checks to the Perl policy analyzer.
  Diagnostics, rule metadata, defect ledger records, owners, remediation text,
  stable fingerprints, and SARIF projection fields are now cross-checked in
  JSON/SARIF/HTML reports and gated by `findingProvenanceGapBudget`.
- Added finding-witness completeness checks to the Perl policy analyzer.
  Actionable warning/error findings now need a SARIF flow trace, quantified
  metric witness, or reviewed waiver reason plus location, owner, remediation,
  and fingerprint evidence, with missing witnesses gated by
  `findingWitnessGapBudget`.
- Added finding-confidence calibration to the Perl policy analyzer. Reports now
  score each finding from rule precision/confidence, witness strength, concrete
  location, owner routing, remediation text, and fingerprint evidence, with open
  low-confidence findings gated by `lowConfidenceFindingBudget`.
- Added an analysis run manifest to the Perl policy analyzer. JSON, SARIF, and
  HTML reports now carry package identity, policy profile digest, analyzer
  digest, source-tree digest, benchmark digest, git revision, and dirty-worktree
  context, with missing reproducibility fields gated by `runManifestGapBudget`.
- Added a change-impact blast-radius model to the Perl policy analyzer. Reports
  now walk the reverse import graph from changed source files, classify TypeSea
  critical compiler/JIT layers and public API surfaces, expose impacted source
  counts in JSON/SARIF/HTML, and gate explicit new-code scopes through
  `changeImpactCriticalBudget` and `changeImpactBlastRadiusBudget`.
- Added reviewed triage ledgers to the Perl policy analyzer. `--triage` applies
  defect-key or fingerprint based states (`confirmed`, `accepted-risk`,
  `false-positive`, `mitigated`) with required owner/reason/expiry metadata,
  expired accepted risks fail the quality gate through `expiredTriageBudget`,
  invalid ledger entries fail through `invalidTriageEntryBudget`, and
  `--write-triage-template` exports a current open-defect review template.
- Added new-code quality gates to the Perl policy analyzer. `--new-code-base`
  reads changed files from Git, `--new-code-file` can scope manual checks, and
  reports now expose changed-file diagnostics, open defects, technical debt, and
  `newCodeOpenBudget` / `newCodeDebtBudget` gates.
- Added component-level risk modeling to the Perl policy analyzer. Reports now
  aggregate file and layer hotspots, worst-component ratings, component debt,
  and `componentOpenBudget` / `componentDebtBudget` quality gates.
- Added ownership modeling to the Perl policy analyzer. Reports now assign
  diagnostics to CODEOWNERS entries when present, fall back to TypeSea layer
  owners otherwise, expose owner summaries in JSON/SARIF/HTML, and gate
  `unownedOpenBudget` / `unownedDiagnosticBudget`.
- Added an owner-aware remediation planner to the Perl policy analyzer. Reports
  now turn open defects into must-fix, quick-win, and backlog work items with
  effort estimates, owner queues, remediation buckets, next-action ordering, and
  dashboard/SARIF/JSON exposure.
- Tightened the Perl analyzer's descriptor abstract interpretation with
  TypeSea-specific proof factories (`readOwnDataProperty`,
  `readArrayIndexDataProperty`, and `readArrayKeyDataProperty`), short-circuit
  and else-branch guard recognition, and `{ found, value }` wrapper guards so
  safe descriptor reads no longer report as dominance warnings.
- Added lightweight CFG summaries to the Perl analyzer, including function
  block/edge/decision/loop/exit counts, maximum block depth, throw-aware
  unreachable statement scanning, JSON/SARIF exposure, and a quality-gate
  budget for proven unreachable code.
- Added branch-state guard fact summaries to the Perl analyzer so descriptor
  value reads are tied to early-exit, `{ found, value }`, value-slot, and
  post-dominator proof evidence before the quality gate accepts safe-path code.
- Added a loop-bound abstract domain to the Perl analyzer. Hot validation loops
  are now classified by length, key-enumeration, fixed numeric, and budget/depth
  bounds, with unbounded hot-loop drift enforced by `hotUnboundedLoopBudget`.
- Added a lightweight interval/range abstract domain to the Perl analyzer.
  Numeric singleton facts, lower/upper comparator bounds, `.length` upper
  bounds, and progress updates are now summarized before hostile safe-path index
  reads are accepted by the zero-budget `rangeGapBudget` gate.
- Added an allocation/effect abstract domain to the Perl analyzer, including
  loop-carried allocation sites, reflection-array allocation calls, closure
  creation, interprocedural allocation reachability, JSON/SARIF exposure, and a
  quality-gate budget for V8-sensitive validation loop allocation drift.
- Added a function-contract abstract domain to the Perl analyzer so validator,
  sanitizer, descriptor-factory, approved dynamic-bridge, pure-candidate, and
  sink-like functions are classified before sink reachability is accepted by the
  quality gate.
- Added an index/bounds abstract domain to the Perl analyzer so bracket index
  reads, loop/length guard facts, descriptor-based array index reads, and
  safe-path hostile index gaps are summarized and enforced with a zero-budget
  quality gate.
- Added a mutation/side-effect abstract domain to the Perl analyzer so
  assignments, deletes, mutating calls, hostile parameter mutation, and safe-path
  validation side effects are summarized and enforced with a zero-budget quality
  gate.
- Added a prototype-pollution key-safety abstract domain to the Perl analyzer.
  The gate now counts dangerous `__proto__`/`constructor`/`prototype` key
  literals, null-prototype tables, own-key enumeration, descriptor/hasOwn proof
  sites, and unsafe bulk key transfers, with a zero-budget `keySafetyGapBudget`.
- Added a generated-source provenance domain to the Perl analyzer. JIT/AOT source
  builders now expose source fragment counts, taint marker counts, escape proofs,
  side-table proofs, dynamic-code sinks, interprocedural helper-proof propagation,
  and a `generatedSourceGapBudget` drift gate for builder functions that rely on
  non-local source-safety evidence.
- Added a Result-state abstract domain to the Perl analyzer. Result-like values
  now track `.ok` polarity facts across branches, `else` arms, short-circuit
  expressions, and early-exit post-dominators before `.value` or `.error` reads
  are accepted by the zero-budget `resultStateGapBudget` gate.
- Added a freeze-state temporal domain to the Perl analyzer. Local
  `Object.freeze()` facts are now tracked through each function so later property
  writes, bracket writes, deletes, or mutating collection calls are rejected by
  the zero-budget `freezeMutationBudget` gate.
- Added a variant-state discriminant domain to the Perl analyzer. Function-local
  `switch (schema.tag)`, `switch (node.tag)`, and check-tag dispatchers now
  expose case counts, defaultless switches, non-empty fallthrough, and
  `variantSwitchGapBudget` drift protection for TypeSea's schema and IR unions.
- Added an exception/control-effect abstract domain to the Perl analyzer so
  throw edges, try/catch/finally blocks, Promise rejection sites, validator
  throws, and V8-sensitive validation throws are summarized and budgeted by the
  quality gate.
- Added a lifecycle-state abstract domain to the Perl analyzer. Validation
  enter/leave calls, graph-frame acquire/release calls, and JSON Schema path
  push/pop slots are now summarized so active path/frame state cannot escape a
  lifecycle-sensitive function under the zero-budget `lifecycleGapBudget` gate.
- Added interprocedural lifecycle fixed-point propagation to the Perl analyzer.
  Local lifecycle gaps are now propagated through the call graph and enforced by
  the zero-budget `interproceduralLifecycleGapBudget` gate, with SARIF code-flow
  paths for wrapper functions that can reach a lifecycle imbalance.
- Split budgeted flow diagnostics from quality-gate metrics in the Perl analyzer:
  hot validation throws and loop-carried allocation findings now remain
  machine-enforced by their budgets while reporting as notices when they are
  within the current baseline.
- Added a nullish/presence abstract domain to the Perl analyzer so safe
  validation paths prove runtime input dereferences with local presence evidence
  while excluding typed internal schema parameters from hostile dereference
  accounting.
- Added a recursion proof abstract domain to the Perl analyzer. Recursive SCCs
  are now split into bounded cycles with cycle/depth/admission/weak-map evidence
  and unbounded cycles that are exposed through JSON, SARIF code-flow traces, and
  a dedicated `unboundedRecursionBudget` quality gate.
- Made taint sink classification proof-aware: descriptor factory reads that are
  guarded by branch-state/value-slot evidence no longer count as hostile-input
  sink paths.
- Added a CONTRIBUTING coverage matrix to `check:contributing --verbose` so each
  machine-checkable policy rule is mapped to diagnostic evidence, while human
  review-only rules are explicitly classified as manual coverage.
- Reworked the contribution comment policy around durable engineering context:
  public API contracts, generated-source ABI, hostile-input defenses, V8-sensitive
  code shape, and compiler invariants. Low-information JSDoc templates are now
  called out explicitly and covered by the source policy gate.
- Removed repeated generated-source ABI boilerplate and short helper-template
  comments from compiler, script, benchmark, and test support code while keeping
  comments that explain security, ABI, or semantic constraints.
- Expanded consumer smoke coverage for the published `typesea/seabreeze`
  subpath and pinned the contract that SeaBreeze remains absent from the root
  `typesea` barrel.
- Moved SeaFlow runtime helpers back behind the `typesea/seaflow` subpath only;
  root `typesea` keeps SeaFlow type exports without importing the fuzzer
  implementation.
- Aligned `z.object(shape)` with Zod v4 strip-by-default parse output while
  preserving `t.object(shape)` as TypeSea's passthrough object builder.
- Rebuilt the documentation site as a statically generated SvelteKit
  application with Lily components, mdsvex, full English/Korean Paraglide
  routing, localized search, responsive navigation, and automatic GitHub Pages
  deployment from `main`.
- Refreshed the benchmark snapshot, README benchmark text, engine notes, and
  generated docs site for the 1.1.1 release candidate.

### Fixed

- Fixed AOT plugin macro replacement so it rewrites only TypeSea-imported
  `compileCached` bindings and no longer touches strings, comments, or local
  functions named `compileCached`.
- Fixed SeaFlow property-count wrapper cases so generated `valid` predictions
  include `minProperties` / `maxProperties` constraints.
- Fixed JSON Schema `patternProperties` export path cleanup so two-segment
  diagnostic paths are fully popped before the next pattern entry is emitted.

## 1.1.0 - 2026-07-08

### Added

- Added the public `typesea/seabreeze` subpath for SeaBreeze arena-backed
  inference. SeaBreeze exposes the high-level `createSeaBreeze()` builder, the
  low-level `SeaBreezeArena`, schema and graph lowering, snapshot helpers, and
  direct predicate source emission.
- Added dedicated SeaBreeze documentation covering principal join,
  arena/typed-array allocation discipline, the schema bridge, the graph bridge,
  and the direct reader emitter.

### Changed

- Documented SeaBreeze as an advanced compiler/inference surface rather than a
  root validator API. It is intentionally not re-exported from `typesea`, so
  ordinary validators keep zero SeaBreeze import and bundle cost.
- Regenerated the documentation site for the 1.1.0 release shell.

## 1.0.0 - 2026-07-07

### Added

- Added SeaFlow, a zero-dependency symbolic fuzzer exposed through
  `typesea/seaflow` and root exports `SeaFlow`, `fuzz`, and `fuzzCases`.
  SeaFlow walks TypeSea schema records backward to emit bounded valid,
  invalid, and security-oriented payloads, including numeric boundaries,
  string injections, required-key deletion, strict-object excess keys,
  prototype-pollution keys, accessor properties, union hybrids, sparse arrays,
  and lazy-recursion depth stops.

### Changed

- Promoted the current public API surface to the `1.0.0` baseline, including
  the package manifest and lockfile version.
- Documented Zod compatibility subpaths as stable 1.x migration facades over
  TypeSea's guard engine, not as a clone of Zod's internal parser engine.
- Removed generated docs from the npm package payload; the documentation site is
  published through GitHub Pages instead.
- Clarified that SeaFlow `maxYields` is an upper bound and small schemas can
  stop earlier after their finite edge set is exhausted.
- Aligned `t.promise(inner)` with Zod-style promise-like async decoding:
  `decodeAsync(value)` now awaits the input and validates the resolved value
  with `inner` instead of rejecting non-Promise inputs before resolution.

## 0.4.0 - 2026-07-06

### Added

- Added `t.superRefine` and `guard.superRefine` for callback-style semantic
  checks that report failure through `context.addIssue()`.
- Added custom `superRefine` issue payloads. `context.addIssue()` can now attach
  a message and a relative path to the emitted `expected_refinement` issue.
- Added a presence-dispatched object-union IR node. Object union branches with
  required keys can now skip impossible branches before entering their child
  graphs while preserving declaration order.
- Added `bench/union-dispatch.bench.ts` to track AST/query-shaped object union
  performance.
- Added `compileCached`, `createCompileCache`, and `warmup` to move runtime
  compilation out of request paths and serverless first-hit latency.
- Added `compileBoolean` for predicate-only fail-fast validators that emit no
  diagnostic collectors.
- Added cooperative async validation through `isAsync`, `checkAsync`, and
  `compileAsync`, with `yieldEvery` and `yieldTimeout` controls for large input
  graphs.
- Added zero-dependency AOT bundler plugin helpers for Vite, Rollup, and
  esbuild. Vite, Rollup, and esbuild can rewrite static
  `compileCached("id", ...)` calls into `typesea:aot/<id>` virtual module
  imports.
- Added dedicated runtime feature benchmarks for `compileBoolean`, compile
  cache hits, cooperative async validation, and AOT plugin transforms.

### Changed

- Specialized union lowering now chooses between literal discriminant dispatch,
  primitive dispatch, required-key presence dispatch, and root-kind branch
  probing.
- Runtime `compile()` now caches repeated compilation of the same guard instance
  and can emit debug-formatted generated source with a sourceURL marker.
- Development builds now warn when repeated code generation comes from the same
  callsite, pointing users toward module-scope schemas, `compileCached`, or
  `warmup`.
- `checkAsync()` and `compileAsync().check()` now return full diagnostics after
  a failed cooperative boolean pass instead of first-fault diagnostics.

## 0.3.2 - 2026-07-05

### Added

- Added `bench:compare` and wired benchmark floor checks into
  `check:benchmarks`. The committed benchmark summary now fails the local gate
  if unchecked valid hot path, safe invalid fast-fail, or safe valid throughput
  drops below the 0.3.2 floor.
- Added generated-source fingerprint tests for the representative strict-object
  hot path across safe, unsafe, and unchecked compile modes.

### Changed

- Normalized union construction conservatively by flattening nested unions,
  removing `never` branches, and letting `unknown` absorb the whole union.
  Runtime branch ordering and dispatch heuristics are otherwise unchanged.
- Strengthened FastMode fuzz parity so trusted schema-shaped values must produce
  the same boolean and diagnostic verdicts in safe, unsafe, and unchecked modes.
- Refreshed benchmark JSON, README tables, docs tables, and the generated SVG
  from the restored 2026-07-05 benchmark run.

## 0.3.1 - 2026-07-05

### Changed

- Hardened the manual GitHub Release workflow so `workflow_dispatch` tag input
  is passed through environment variables and validated as a release tag before
  it reaches shell output.
- Added `SECURITY.md` with supported versions, reporting guidance, and the
  security boundary for safe, unsafe, unchecked, AOT, and dynamic compilation.
- Added a post-publish npm registry verification step to the GitHub Publish
  workflow.
- Added `release:publish` so the repository-owned publish command always uses
  `npm publish --provenance --access public --ignore-scripts`.
- Removed the version-pinned Socket badge URL from the README.
- Refreshed the benchmark snapshot and docs graph from the 2026-07-05 local
  `bench/ecosystem.bench.ts` run.
- Clarified the release path: local npm publishing is allowed for emergency
  manual releases, but normal releases should go through GitHub Release so npm
  provenance is attached.
- Expanded decoder documentation around method chaining with `transform`,
  `default`, `prefault`, and `catch`.

## 0.3.0 - 2026-07-05

### Added

- Added Date bounds with `t.date.min()` and `t.date.max()`.
- Added tuple rest support with `t.tuple([head], rest)`.
- Added `t.map`, `t.set`, `t.instanceOf`, `t.property`, `guard.property`, and
  `t.json`.
- Added scalar aliases `t.null`, `t.undefined`, `t.void`, and presence helper
  `t.nullish`.
- Added string decoder helpers `t.string.trim()`, `t.string.toLowerCase()`,
  and `t.string.toUpperCase()`.

### Changed

- Hardened Date validation to use intrinsic Date reads instead of
  user-overridable Date instance methods.

## 0.2.0 - 2026-07-04

Initial public release of TypeSea: a zero-runtime-dependency TypeScript runtime
narrowing library built around immutable guards, optimized Sea-of-Nodes
validation plans, runtime compilation, and AOT source generation.

### Added

- Added the `t` builder surface for scalar, object, strict object, array,
  tuple, record, union, discriminated union, intersection, optional,
  undefinedable, nullable, literal, brand, refine, lazy, unknown, and never
  guards.
- Added `is()`, `check()`, and `assert()` guard APIs with explicit Result-style
  diagnostics and frozen public outputs.
- Added `compile()` for runtime-generated validators and `emitAotModule()` for
  standalone validator source.
- Added safe, unsafe, and unchecked compile modes. Safe mode keeps hostile-input
  descriptor semantics by default; unsafe and unchecked modes opt into
  trusted-data FastMode codegen.
- Added optimized Sea-of-Nodes validation plans, graph introspection, constant
  folding, algebraic simplification, peephole optimization, and
  validation-domain specialization for composite loops.
- Added lossless JSON Schema export with typed issues for unsupported runtime
  semantics.
- Added adapters for tRPC, async tRPC-style parsers, Fastify route schemas,
  Fastify validator compilers, and React Hook Form resolvers.
- Added seeded parity fuzzing across runtime plan, compiled validators, AOT
  output, sparse arrays, accessors, symbol keys, non-enumerable extras, and
  FastMode trusted-data invariants.
- Added release gates for source policy, docs validation, typechecking, linting,
  tests, dist policy, public API drift, package contents, consumer smoke tests,
  and benchmark smoke coverage.

### Performance

- Measured TypeSea compiled safe `is()` at `4,297,306 hz` on valid benchmark
  objects, essentially Ajv-class throughput while keeping TypeSea's hostile
  boundary contract.
- Measured TypeSea compiled unsafe `is()` at `36,297,653 hz` and unchecked
  `is()` at `42,581,174 hz` on valid benchmark objects.
- Measured TypeSea compiled safe invalid `is()` at `42,080,241 hz`, ahead of
  Ajv on the local strict-object benchmark run.
- Measured TypeSea compiled safe invalid `check()` at `2,086,129 hz`, with
  unsafe and unchecked diagnostic modes at `3,077,367 hz` and `3,673,508 hz`.

### Security And Correctness

- Enforced zero runtime dependencies, strict TypeScript settings, no `any`, and
  no expected-failure exceptions through policy gates.
- Kept safe validation getter-free by using property descriptors for hostile
  boundary data.
- Rejected strict-object symbol and non-enumerable extras in safe mode.
- Fixed strict object compiled/AOT parity around own-key counting and required
  non-enumerable properties.
- Fixed interpreter step-budget divergence on large valid arrays by making the
  limit configurable and parity-covered.
- Fixed React Hook Form nested error output and Fastify validator compiler
  route-part handling.
- Fixed unsafe optional own-`undefined` field codegen so child guard refinements
  cannot leak between generated branches.

### Packaging

- Published as ESM-only with Node.js `>=20.19`.
- Added repository metadata, package export defaults, docs site checks, CI
  matrices, Pages deployment workflow, and npm publish workflow support.
