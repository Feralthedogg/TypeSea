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
- Keep `compile()` and `emitAotModule()` safe by default. Unsafe mode is an
  explicit opt-in that may use direct property/index loads and own-enumerable
  strict-key loops after the caller accepts getter/prototype/symbol-extra risk.
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

Strict object IR emits two shapes. When every declared key is required,
generated validators run the strict-key count before field descriptor reads:
they compare `Object.getOwnPropertyNames(value).length` with the declared key
count and require `Object.getOwnPropertySymbols(value).length === 0`. V8
optimizes this count-only path better than a generic `Reflect.ownKeys` count,
and it rejects obvious extra-key objects before touching field descriptors.
Optional strict objects still emit the full own-key membership scan because a
missing optional key cannot be distinguished by the final key count alone.

`compile(..., { mode: "unsafe" })` and
`emitAotModule(..., { mode: "unsafe" })` switch generated predicates to a
trusted-data code shape. Required object fields whose schemas reject
`undefined` use direct `value[key]` loads without descriptor or own-key checks.
Required fields that can accept `undefined` retain an own-key presence guard so
missing required keys do not collapse into valid `undefined` values. Optional
fields take the direct-load fast path for present non-`undefined` values and
fall back to an own-key check only for the ambiguous `undefined` case.

Unsafe array, tuple, record, and discriminant paths also prefer direct loads.
Strict objects use a `for...in` own-enumerable key loop instead of allocating
own-key arrays.
Object keys that are ASCII identifier names emit as dot-property loads such as
`value.id`; other keys emit as escaped string-literal bracket loads. That is
intentionally not hostile-input equivalent: getters can execute,
prototype-backed values can be accepted, symbol or non-enumerable strict extras
are not rejected, and static property names may appear in unsafe generated
predicate source.

`mode: "unchecked"` keeps the unsafe direct-read shape and removes strict
extra-key loops. It is a trusted-shape path for objects already normalized by
the caller; strict objects no longer reject any extra keys there.

Fast modes also remove `Object.freeze()` from successful compiled `check()`
results. The returned object keeps the same `{ ok: true, value }` shape, but it
is intentionally not frozen. Failed diagnostics stay frozen because those
objects are off the success hot path and are often retained for reporting.
Object diagnostics in fast modes are generated from the same direct-read
contract as predicates. Required fields load through `value.key`, optional
fields use direct load plus an own-key fallback for `undefined`, unsafe strict
objects scan own enumerable string keys, and unchecked strict objects skip the
strict-key diagnostic scan. Array and tuple diagnostics in fast modes read
items through direct indexes instead of descriptor probes. Record diagnostics
read through `record[key]`; unchecked mode intentionally keeps inherited
enumerable keys visible. Discriminant diagnostics read the tag directly and
compare literal string cases with strict equality.

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

`checkFirst()` has a separate generated collector. It returns one frozen issue
as soon as the first diagnostic is known, instead of running the full `check()`
collector and truncating its issue array.

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

Last local benchmark on 2026-07-04 KST reported these ecosystem paths over the
JSON-compatible strict-object benchmark:

| Case | TypeSea runtime plan | TypeSea compiled safe | TypeSea compiled unsafe | TypeSea compiled unchecked | Ajv compiled |
| --- | ---: | ---: | ---: | ---: | ---: |
| Valid `is()` | 513,701 hz | 4,297,306 hz | 36,297,653 hz | 42,581,174 hz | 4,275,389 hz |
| Valid `check()` | 503,232 hz | 3,903,929 hz | 35,568,425 hz | 40,084,605 hz | 4,278,587 hz |
| Invalid `is()` | 3,636,369 hz | 42,080,241 hz | 49,654,076 hz | 50,482,732 hz | 27,820,643 hz |
| Invalid `check()` | 420,446 hz | 2,086,129 hz | 3,077,367 hz | 3,673,508 hz | 28,713,035 hz |

Benchmark numbers are machine-local telemetry. They are useful for catching
regressions, not for promising a fixed throughput floor. Unsafe and unchecked
numbers are not hostile-input equivalent to safe mode.
