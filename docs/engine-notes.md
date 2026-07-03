# Engine Notes

TypeSea is written for predictable machine behavior after TypeScript emits
JavaScript. The goal is not obscurity; the goal is to make object shapes,
allocation sites, branch behavior, and validation contracts visible in code.

## Hot Path Rules

- Use prototype methods instead of per-instance method closures.
- Use numeric tags for schema, check, issue, and IR node variants.
- Initialize class fields in one constructor order.
- Keep successful `is()` validation free of diagnostic allocation.
- Allocate `Issue` objects and path arrays only when diagnostics are requested.
- Prefer indexed loops on recursive validation paths.
- Precompute object-entry arrays during schema construction.
- Mark constructed guards out-of-band so normal receivers avoid repeated schema
  validation while forged receivers still fall back to structural checks.
- Use `Readonly<Record<string, unknown>>` after object guards.
- Store generated-validator literals, regexps, keysets, and dynamic fallbacks in
  side tables instead of interpolating user-controlled values into source text.

## Type-System Rules

- `optional(inner)` means an object key may be absent.
- `undefinedable(inner)` means the key must exist when used in an object shape,
  but its value may be `undefined`.
- `nullable(inner)` means the value may be `null`.
- Presence-preserving wrappers do not erase optional-key semantics.
- `number` means finite JavaScript number.
- `unknown` is the only accepted boundary type for untrusted input.
- Builder validation is the hard barrier before a schema reaches the engine.

## IR Rules

The public schema tree is the semantic source for diagnostics, interpretation,
runtime compilation, and AOT emission. The lowered Sea-of-Nodes graph is exposed
through `Guard.graph()` for introspection, optimizer tests, and future execution
work; current validators do not execute that graph.

Current lowering hash-conses pure value and predicate nodes. Strict object
schemas lower an explicit keyset check into the IR, so extra-key rejection does
not depend on out-of-band schema knowledge.

`Guard.graph()` returns the optimized graph. Public graph values are validated
and frozen before leaving the API. The first optimizer pass performs reachable
node elimination and compacts node ids so every dependency points at an existing
dense node index.

`SchemaCheck` is the explicit barrier for dynamic schemas such as `lazy` and
`refine`. The graph records that runtime schema logic is required instead of
pretending callback-backed semantics are static predicates.

## Runtime Compiler

Compiled guards emit both boolean predicates and diagnostics collectors.
`check()` allocates the returned `Result` container and allocates issue lists or
paths only when diagnostics exist.

User-controlled literals, regexps, object keys, keysets, dynamic schemas, and
diagnostic names live in side tables captured by the generated factory. The
generated source contains numeric side-table indexes, fixed helper strings, and
sanitized function names.

Array and record schemas lower to indexed loops that call generated item
validators. Dynamic edges use the same interpreter fallback as ordinary guard
execution, preserving behavior for `lazy` and `refine`.

## Recursion

Lazy schemas resolve their getter once per guard instance. Recursive validation
therefore sees stable schema identity, and repeated validations do not rebuild
the recursive schema graph.

Recursive validation uses a root-local active pair table keyed by runtime object
identity and schema identity. Re-entering the same schema/value pair
short-circuits that edge, which lets cyclic object graphs validate finitely while
still checking the original object fields on the outer frame.

Compiled `lazy` and `refine` fallbacks use the same interpreter path, so
recursive behavior stays consistent across execution engines.

## JSON Schema Export

JSON Schema export succeeds only when the TypeSea schema can be represented over
JSON-compatible input values without semantic loss. Runtime-only concepts return
typed `Result` errors.

Export diagnostics keep paths at the failed child slot instead of collapsing
everything to the parent container. Nested unsupported schemas therefore remain
actionable without reconstructing the schema tree manually.

Literal checks use `Object.is` in interpreted and compiled paths. Diagnostics
use the same literal formatting, including `-0`, so compiled and interpreted
`check()` results stay byte-for-byte comparable in tests.

## Benchmark Scope

The benchmark suite keeps two questions separate:

- `compile.bench.ts` compares TypeSea interpreted and compiled validators over
  the same TypeSea schema.
- `ecosystem.bench.ts` compares TypeSea interpreted, TypeSea compiled, Zod,
  Valibot, and Ajv over one JSON-compatible strict-object contract.

Zod, Valibot, and Ajv are dev dependencies for measurement only. They are not
imported by `src`, and package policy rejects runtime, peer, optional, or
bundled dependency fields before release.
