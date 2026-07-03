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
- After required object fields have proved their data-property descriptors, load
  descriptor values directly instead of rechecking missing-property fallbacks.
- For all-required strict objects, reject extras by counting own string names
  and own symbols after field validation. Optional strict objects keep the full
  key membership scan.
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

The public schema tree is the semantic source used by builders and diagnostic
collectors. Boolean validation executes a cached `ValidationPlan`: schema
identity is lowered into Sea-of-Nodes IR, the optimizer runs, and the plan keeps
both the frozen graph and a schema-specialized predicate kernel.

The graph is not decorative. `compile()`, AOT emission, and `Guard.graph()` all
consume the optimized graph held by the plan. Ordinary `Guard.is()` deliberately
uses the sibling schema-specialized kernel instead of a generic node interpreter,
because per-node dispatch and scratch-slot bookkeeping cost more than they buy
on the most common hot path.

Current lowering hash-conses pure value and predicate nodes. Strict object
schemas lower an explicit keyset check into the IR, so extra-key rejection does
not depend on out-of-band schema knowledge. Required and optional object fields
separate key presence from data-property presence, which keeps accessor-backed
properties from executing getters or being misclassified as valid values.

`Guard.graph()` returns the same optimized graph held by the validation plan.
Public graph values are validated and frozen before leaving the API. The first
optimizer pass performs reachable node elimination and compacts node ids so every
dependency points at an existing dense node index. `compile()` and AOT emission
use this graph as their predicate source.

Array, tuple, and record schemas lower to native composite IR nodes whose child
schemas are executed through child validation plans. `SchemaCheck` is reserved
for dynamic schemas such as `lazy` and `refine`; the graph records that callback
or resolver-backed semantics are required instead of pretending they are static
predicates.

## Runtime Compiler

Compiled guards emit boolean predicates from optimized Sea-of-Nodes graphs and
schema-aware diagnostics collectors for failed values. Runtime `is()` uses the
plan-owned schema-specialized kernel to avoid recursive node dispatch and scratch
buffer churn. `check()` first asks the plan predicate for the pass/fail verdict;
successful values skip diagnostic collection, while failed values replay the
diagnostic collector to build paths and issue codes.

User-controlled literals, regexps, object keys, keysets, dynamic schemas, and
diagnostic names live in side tables captured by the generated factory. The
generated source contains numeric side-table indexes, fixed helper strings, and
sanitized function names.

Scalar nodes emit direct JavaScript tests where the semantics are local:
finite-number checks, integer checks, string length bounds, literal equality,
and regexp tests all lower without helper calls on the generated hot path.

Array and record IR nodes emit indexed loops. Static child schemas are inlined
into those loops from their optimized graphs, which avoids function-call
boundaries for small scalar or union element contracts. Tuple nodes preserve
descriptor-based element access, and dynamic edges use the same IR-backed
runtime fallback as ordinary guard execution, preserving behavior for `lazy` and
`refine`.

Strict object IR emits two shapes. When every declared key is required and has
already passed the data-property descriptor check, generated validators compare
`Object.getOwnPropertyNames(value).length` with the declared key count and
require `Object.getOwnPropertySymbols(value).length === 0`. This keeps
non-enumerable and symbol extras rejected without paying a `Reflect.ownKeys`
membership loop on the common all-required path. Optional strict objects still
emit the full own-key membership scan because a missing optional key cannot be
distinguished by the final key count alone.

## Recursion

Lazy schemas resolve their getter once per guard instance. Recursive validation
therefore sees stable schema identity, and repeated validations do not rebuild
the recursive schema graph.

Recursive validation uses a root-local active pair table keyed by runtime object
identity and schema identity. Re-entering the same schema/value pair
short-circuits that edge, which lets cyclic object graphs validate finitely while
still checking the original object fields on the outer frame.

Compiled `lazy` and `refine` fallbacks use the same IR-backed runtime path, so
recursive behavior stays consistent across execution engines.

## JSON Schema Export

JSON Schema export succeeds only when the TypeSea schema can be represented over
JSON-compatible input values without semantic loss. Runtime-only concepts return
typed `Result` errors.

Export diagnostics keep paths at the failed child slot instead of collapsing
everything to the parent container. Nested unsupported schemas therefore remain
actionable without reconstructing the schema tree manually.

Literal checks use `Object.is` in runtime-plan and compiled paths. Diagnostics
use the same literal formatting, including `-0`, so compiled and runtime-plan
`check()` results stay byte-for-byte comparable in tests.

## Benchmark Scope

The benchmark suite keeps two questions separate:

- `compile.bench.ts` compares TypeSea runtime-plan and compiled validators over
  the same TypeSea schema.
- `ecosystem.bench.ts` compares TypeSea runtime-plan, TypeSea compiled, Zod,
  Valibot, and Ajv over one JSON-compatible strict-object contract.

Zod, Valibot, and Ajv are dev dependencies for measurement only. They are not
imported by `src`, and package policy rejects runtime, peer, optional, or
bundled dependency fields before release.

Last local release smoke on 2026-07-04 KST reported this ecosystem boolean
path over the JSON-compatible strict-object benchmark:

| Case | TypeSea runtime plan | TypeSea compiled | Ajv compiled |
| --- | ---: | ---: | ---: |
| Valid object | 496,270 hz | 4,237,892 hz | 4,312,174 hz |
| Invalid object | 3,422,416 hz | 27,125,445 hz | 28,953,501 hz |

Benchmark numbers are machine-local telemetry. They are useful for catching
regressions, not for promising a fixed throughput floor.
