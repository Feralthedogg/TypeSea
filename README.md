# TypeSea

[![CI](https://github.com/Feralthedogg/TypeSea/actions/workflows/ci.yml/badge.svg)](https://github.com/Feralthedogg/TypeSea/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![TypeScript](https://img.shields.io/badge/language-TypeScript-informational)
![Dependencies](https://img.shields.io/badge/runtime%20deps-zero-brightgreen)
![Module](https://img.shields.io/badge/module-ESM--only-orange)
![Node](https://img.shields.io/badge/node-%3E%3D20.19-yellowgreen)

**TypeSea** is a **zero-runtime-dependency TypeScript runtime narrowing library**
built around **immutable guards**, optimized **Sea-of-Nodes validation plans**,
runtime compilation, and AOT source generation.

> Goal: not "probably valid", but **provably parity-tested validation** that
> never executes user code, never throws on expected failures, and never leaks
> mutable state across a public boundary.

> [!IMPORTANT]
> TypeSea is designed for **hostile boundary data**: property reads go through
> descriptors so **user getters never execute**, `__proto__`/`constructor` keys
> are handled with null-prototype lookups, user regexes are cloned and
> `lastIndex`-reset, and cyclic inputs validate finitely. Expected failures
> return frozen `Result` values — `any`, `try`, and `catch` are banned from the
> entire codebase and enforced by policy gates.

---

## Why

Many validation libraries fall short when you care about:

- **untrusted input that fights back** (getters with side effects, prototype
  pollution keys, forged schema objects, revoked proxies)
- **identical verdicts across execution strategies** (runtime plan vs compiled
  vs AOT-generated validators)
- **diagnostics without exceptions** (`Result` values instead of `throw`)
- **immutability at every public boundary**

TypeSea focuses on:

- **no user-code execution during validation**
- **runtime plan / compiled / AOT parity, enforced by a seeded generative fuzzer**
- **injection-safe code generation** (side tables, never string interpolation)
- **explicit presence semantics** (`optional` vs `undefinedable`)

---

## Key Properties

- **Zero dependencies**: no runtime, peer, optional, or bundled dependencies —
  mechanically enforced by package policy before every release.
- **Three engines, one semantics**: `is()`/`check()` execute a cached validation
  plan, `compile()` emits runtime predicates from optimized IR, and
  `emitAotModule()` emits standalone validator source. The runtime plan owns
  both the graph and a schema-specialized kernel, so the graph is the source of
  truth for generated validators without forcing ordinary `is()` through a
  per-node interpreter. Parity is fuzz-tested with sparse arrays, accessor
  properties, symbol keys, and non-enumerable extras included.
- **Frozen public surface**: guards, schemas, graphs, diagnostics, and JSON
  Schema payloads are frozen before they cross an API boundary.
- **Lossless-only export**: JSON Schema and AOT export succeed only when no
  semantics would be lost; runtime-only contracts return typed issues instead
  of silently weakening the schema.

> [!NOTE]
> TypeSea is **ESM-only**: the package ships `"type": "module"` with no
> CommonJS build. Node.js `>= 20.19` can also load it via `require(esm)`
> through the `default` export condition.

---

## Quick Start

```ts
import { compile, t, toJsonSchema, type Infer } from "typesea";

const User = t.strictObject({
  id: t.string.uuid(),
  age: t.number.int().gte(0),
  role: t.union(t.literal("admin"), t.literal("user"))
});

type User = Infer<typeof User>;

// 1) Boolean narrowing — avoids diagnostic allocation on success
if (User.is(input)) {
  input.id; // narrowed
}

// 2) Immutable diagnostics — frozen Result, never throws on expected failure
const checked = User.check(input);
if (!checked.ok) {
  console.log(checked.error); // frozen issue list with paths
}

// 3) Hot path — generated validator code
const FastUser = compile(User, { name: "isUser" });

// 4) Interop — lossless-only JSON Schema export
const schema = toJsonSchema(User);
```

Use `is()` for the allocation-light boolean path. Use `check()` when callers
need immutable diagnostics. Use `compile()` or `emitAotModule()` when a stable
schema is hot enough to deserve generated validator code.

> [!CAUTION]
> `compile()` builds the validator with `new Function`, which throws under a
> Content-Security-Policy that forbids `unsafe-eval`. In CSP-restricted
> environments, generate validator source ahead of time with
> `emitAotModule()` instead.

---

## Presence Semantics

Object presence is explicit — two different wrappers express two different
contracts:

| Wrapper | Key may be absent | Value may be `undefined` | Inferred type |
| --- | --- | --- | --- |
| `t.optional(inner)` | yes | no | `key?: T` |
| `t.undefinedable(inner)` | no | yes | `key: T \| undefined` |
| `t.nullable(inner)` | — | value may be `null` | `key: T \| null` |

> [!NOTE]
> Presence survives wrapper composition: `t.nullable(t.optional(x))` still
> means "the key may be absent" — inference and runtime agree on this under
> `exactOptionalPropertyTypes`.

---

## Execution Model

TypeSea keeps the public schema tree for builder validation and diagnostics,
then lowers each schema identity into a cached validation plan. The plan owns an
optimized Sea-of-Nodes graph and a schema-specialized predicate kernel.
`Guard.is()` uses the kernel to avoid per-node interpreter dispatch, while
`compile()` and `emitAotModule()` emit predicates from the optimized graph.
`check()` first asks the same plan for the verdict; failed values then replay
the schema-aware diagnostic collector to produce issue paths and codes.

```text
builder -> frozen schema -> lower -> Sea-of-Nodes IR -> optimize
optimize -> ValidationPlan { graph, schema kernel }
schema kernel -> Guard.is() / check() preflight
graph -> compile() predicate / emitAotModule() predicate / Guard.graph()
failed check() -> schema-aware diagnostic collector
```

> [!IMPORTANT]
> Generated validators keep **user-controlled values out of source text**:
> literals, regexps, object keys, keysets, and dynamic schema fallbacks live in
> **side tables** referenced by numeric index. Hostile property names cannot
> escape into generated code — this is pinned by dedicated injection-audit
> tests.

---

## Performance Snapshot

Last local release smoke on 2026-07-04 KST, using
`npm run release:check` on the benchmark strict-object contract. These are
operations per second on one machine, not release guarantees.

| Valid object path | hz |
| --- | ---: |
| TypeSea interpreted `is()` | 496,270 |
| TypeSea compiled `is()` | 4,237,892 |
| Zod `safeParse` | 1,363,792 |
| Valibot `safeParse` | 1,384,892 |
| Ajv compiled | 4,312,174 |

| Invalid object path | hz |
| --- | ---: |
| TypeSea interpreted `is()` | 3,422,416 |
| TypeSea compiled `is()` | 27,125,445 |
| Zod `safeParse` | 83,501 |
| Valibot `safeParse` | 902,616 |
| Ajv compiled | 28,953,501 |

The compiled path stays close to Ajv while retaining TypeSea semantics:
descriptor-based property reads, symbol/non-enumerable strict-key rejection,
presence semantics, immutable diagnostics, and TypeScript guard inference.

---

## API Reference

All public entry points are exported from the package root; builders are also
grouped under the `t` table.

### Builders

| Area | Entry points |
| --- | --- |
| Scalar guards | `t.unknown`, `t.never`, `t.string`, `t.number`, `t.bigint`, `t.symbol`, `t.boolean` |
| Literal and containers | `t.literal`, `t.array`, `t.tuple`, `t.record` |
| Objects | `t.object`, `t.strictObject`, `extend`, `pick`, `omit`, `partial` |
| Composition | `t.union`, `t.discriminatedUnion`, `t.intersect`, `guard.intersect` |
| Presence wrappers | `t.optional`, `t.undefinedable`, `t.nullable` |
| Dynamic contracts | `t.lazy`, `t.refine` |

### Decoders

| Area | Entry points |
| --- | --- |
| Sync decoders | `t.decoder`, `t.transform`, `t.pipe`, `t.coerce` |
| Async decoders | `t.asyncDecoder`, `t.asyncRefine`, `t.asyncTransform`, `t.asyncPipe` |

### Execution & Export

| Area | Entry points |
| --- | --- |
| Guard methods | `guard.is()`, `guard.check()`, `guard.graph()` |
| Generated validators | `compile`, `emitAotModule` |
| JSON Schema | `toJsonSchema` |

### Messages & Adapters

| Area | Entry points |
| --- | --- |
| Messages / i18n | `formatIssue`, `formatIssues`, `withMessages`, `defineMessages` |
| tRPC | `toTrpcParser`, `toAsyncTrpcParser` |
| Fastify | `toFastifyRouteSchema`, `toFastifyValidatorCompiler` |
| React Hook Form | `toReactHookFormResolver` |

> [!TIP]
> Match the inference alias to the source kind: `Infer<>` for guards,
> `InferDecoder<>` for decoders, `InferAsyncDecoder<>` for async decoders.
> Applying `Infer<>` to a decoder resolves to `never` — if a downstream type
> suddenly collapses, this is the first thing to check.

---

## Edge Semantics

Deliberate, documented, and pinned by tests:

| Input | Behavior |
| --- | --- |
| `NaN`, `Infinity` | rejected by `t.number` (finite numbers only); `t.literal(NaN)` matches `NaN` |
| `-0` vs `0` | literals match via `Object.is`; diagnostics format `-0` distinctly |
| Getter-backed properties | never executed; treated as missing/invalid data |
| `__proto__`, `constructor` keys | validated as plain own keys, no pollution |
| Sparse array holes | read as `undefined` without executing accessors |
| Strict object extras | rejected via `Reflect.ownKeys` — including symbol keys and non-enumerable properties |
| Global-flag regexes | cloned at construction; `lastIndex` reset before every test |
| UUID | accepts RFC 9562 versions 1–8 plus the nil UUID |
| Cyclic input values | validate finitely via (value × schema) active-pair tracking |
| Nesting depth | capped at 256 recursive frames; deeper input fails instead of overflowing the stack |

---

## Best Practices & Pitfalls

> [!WARNING]
> **Recursive guards need an explicit type annotation.** TypeScript cannot
> infer a self-referential initializer (TS7022):
>
> ```ts
> interface ListNode {
>   readonly value: string;
>   readonly next?: ListNode;
> }
>
> const Node: Guard<ListNode> = t.lazy((): Guard<ListNode> =>
>   t.object({ value: t.string, next: t.optional(Node) })
> );
> ```

- **Boundary data enters as `unknown`.** Do not pre-narrow with `as` — the
  builder API is typed so that narrowing happens through validation.
- **Recursive contracts go through `t.lazy`.** Direct schema object cycles are
  rejected at construction.
- **Choose the engine by schema lifetime.** One-off schemas: runtime plan.
  Stable hot schemas: `compile()`. CSP environments or build-time generation:
  `emitAotModule()`.
- **Decoders do not embed in object shapes.** Compose transformations with
  `t.pipe` around a validated shape instead of mixing decoders into `t.object`
  entries.

---

## Verification

Every gate that CI runs is a local npm script:

```sh
npm run check           # policy, docs, typecheck, lint, tests, build, dist, API snapshot, pack
npm run check:consumer  # tarball install + runtime/type smoke in a temp project
npm run bench -- --run  # benchmark smoke
npm run pack:dry        # package contents dry run
npm run release:check   # the full pre-publish gate (everything above)
```

`npm run release:check` runs the same gate expected before publishing:
typecheck, lint, tests, build, docs smoke, dist policy, public API snapshot,
package contents, consumer install, benchmark smoke, and pack dry run.
CI executes it on Node 20.19, 22, and 24; releases publish with npm provenance.

> [!NOTE]
> Benchmark comparison packages (Zod, Valibot, Ajv) are dev dependencies only —
> package policy rejects them from every runtime dependency field. The
> benchmark suite reports both boolean-path and diagnostic-path
> (`check()` vs `safeParse`) comparisons, so numbers stay apples-to-apples.

---

## Documentation

- [Documentation site](docs/index.html)
- [API reference](docs/api.md)
- [Engine notes](docs/engine-notes.md)

---

## License

MIT License. See [LICENSE](./LICENSE).
