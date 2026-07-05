# Changelog

All notable changes to TypeSea are recorded here.

## 0.3.2 - Unreleased

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
