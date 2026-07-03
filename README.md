# TypeSea

TypeSea is a zero-runtime-dependency TypeScript runtime narrowing library built
around immutable guards and Sea-of-Nodes graph introspection.
It is ESM-only: the package is published with `"type": "module"` and no
CommonJS export.

It is intentionally shaped like a small compiler: builders create frozen schema
syntax, execution chooses interpretation, runtime compilation, or AOT source
generation, and `Guard.graph()` lowers the same schema into an optimized graph
for analysis and tooling.

## Quick Start

```ts
import { compile, t, toJsonSchema, type Infer } from "typesea";

const User = t.strictObject({
  id: t.string.uuid(),
  age: t.number.int().gte(0),
  role: t.union(t.literal("admin"), t.literal("user"))
});

type User = Infer<typeof User>;

if (User.is(input)) {
  input.id;
}

const checked = User.check(input);
const FastUser = compile(User, { name: "isUser" });
const schema = toJsonSchema(User);
```

Use `is()` for the allocation-light boolean path. Use `check()` when callers
need immutable diagnostics. Use `compile()` or `emitAotModule()` when a stable
schema is hot enough to deserve generated validator code.

## Contract

- The published package has zero runtime, peer, optional, or bundled
  dependencies.
- Untrusted boundary data enters as `unknown`.
- `any`, `try`, and `catch` are rejected in source, tests, benchmarks, scripts,
  and emitted package artifacts.
- Expected validation failures return `Result` values.
- Guards, schemas, graphs, diagnostics, and JSON Schema export payloads are
  frozen before they cross public boundaries.
- Successful `is()` validation avoids diagnostic allocation.
- Object presence is explicit: `optional(inner)` means the key may be absent;
  `undefinedable(inner)` means the key exists but the value may be `undefined`.
- Recursive contracts go through `t.lazy`; direct schema object cycles are
  rejected.
- JSON Schema and AOT export are lossless-only. Runtime-only contracts return
  typed issues instead of weakening the schema.

## API Map

| Area | Entry points |
| --- | --- |
| Scalar guards | `t.unknown`, `t.never`, `t.string`, `t.number`, `t.bigint`, `t.symbol`, `t.boolean` |
| Literal and containers | `t.literal`, `t.array`, `t.tuple`, `t.record` |
| Objects | `t.object`, `t.strictObject`, `extend`, `pick`, `omit`, `partial` |
| Composition | `t.union`, `t.discriminatedUnion`, `t.intersect`, `guard.intersect` |
| Presence wrappers | `t.optional`, `t.undefinedable`, `t.nullable` |
| Dynamic contracts | `t.lazy`, `t.refine` |
| Decoders | `t.decoder`, `t.transform`, `t.pipe`, `t.coerce` |
| Async decoders | `t.asyncDecoder`, `t.asyncRefine`, `t.asyncTransform`, `t.asyncPipe` |
| Execution | `compile`, `emitAotModule` |
| Messages | `formatIssue`, `formatIssues`, `withMessages`, `defineMessages` |
| Adapters | tRPC, Fastify, and React Hook Form structural adapters |
| Export | `toJsonSchema` |

## Execution Model

TypeSea keeps the public schema tree for diagnostics and introspection, but the
current execution engines read the frozen schema tree directly. `Guard.graph()`
lowers that schema into a Sea-of-Nodes graph for public introspection and
optimizer validation; it is not the runtime execution substrate yet.

```text
builder -> frozen schema -> interpret | compile() | emitAotModule()
builder -> frozen schema -> Sea-of-Nodes IR -> optimize -> graph()
```

Generated validators use side tables for literals, regexps, keysets, and dynamic
schema fallbacks. User-controlled values do not get interpolated into generated
source text.

## Verification

```sh
npm run check
npm run check:consumer
npm run bench -- --run
npm run pack:dry
npm run release:check
```

`npm run release:check` runs the same gate expected before publishing:
typecheck, lint, tests, build, docs smoke, dist policy, public API snapshot,
package contents, consumer install, benchmark smoke, and pack dry run.

Benchmark comparison packages such as Zod, Valibot, and Ajv are dev
dependencies only. Package policy rejects them from runtime dependency fields.

## Documentation

- [Documentation site](docs/index.html)
- [API reference](docs/api.md)
- [Public API surface](docs/api-surface.md)
- [Engine notes](docs/engine-notes.md)
- [Documentation style](docs/documentation-style.md)
- [Release checklist](docs/release-checklist.md)
