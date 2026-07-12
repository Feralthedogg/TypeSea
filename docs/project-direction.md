# Project Direction

TypeSea is a zero-dependency TypeScript validation compiler: schema in,
optimized type guard out.

## Core Identity

The core project owns immutable schemas, hostile-input-safe validation,
Sea-of-Nodes lowering, optimization, JIT predicates, and standalone AOT source.
Performance claims are separated by safe, unsafe, unchecked, boolean, and
diagnostic contracts.

TypeSea does not position its core as a clone of Zod. Zod-shaped entry points are
maintained compatibility facades for migration and ecosystem integration.

## Stability Before Breadth

Near-term work prioritizes:

- security and execution-mode parity regressions;
- public API and package export drift prevention;
- reproducible warmed benchmarks with checked performance floors;
- Node 20.19, 22, and 24 CI;
- bounded package footprint and zero runtime dependencies;
- explicit compatibility evidence and honest unsupported cases.

New schema features must define interpreted, compiled, AOT, diagnostic, async,
JSON Schema, and fuzzing behavior where those paths apply.

## Product Layers

1. **TypeSea core**: native validation and compilation contracts.
2. **Zod compatibility**: source migration and ecosystem facades with documented support levels.
3. **AOT plugin**: build-time replacement of configured runtime compilation sites.
4. **SeaFlow**: schema-directed boundary and hostile-input generation for users and TypeSea parity tests.
5. **SeaBreeze**: advanced arena-backed inference for tooling that needs compact principal joins.

The layers are separate subpaths where import cost or semantic ownership differs.

## Non-goals

- cloning Zod's private parser implementation;
- compiling effectful callbacks as if they were pure type guards;
- weakening safe mode to improve headline benchmarks;
- adding runtime dependencies for build or test convenience;
- promoting research APIs ahead of core correctness and release evidence.

## Release Bar

A release must pass source policy, the Perl analyzer, documentation parity,
strict TypeScript, lint, tests, dist policy, public API snapshots, Zod compatibility
checks, the pinned real-world corpus, benchmark floors, package contents, and
consumer installation smoke tests.
