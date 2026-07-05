# TypeSea API Reference

TypeSea accepts untrusted input as `unknown` and narrows it through immutable
guard values. The public API is small by design; most complexity lives behind
builder validation, graph introspection, diagnostics, and export checks.

## Import

```ts
import {
  compile,
  emitAotModule,
  t,
  toJsonSchema,
  type Guard,
  type Infer
} from "typesea";
```

The package exposes one root entry point. Subpath imports are intentionally not
part of the public API. TypeSea is ESM-only and does not publish a CommonJS
condition.

## Guard Contract

```ts
interface Guard<T> {
  is(value: unknown): value is T;
  check(value: unknown): CheckResult<T>;
  checkFirst(value: unknown): CheckResult<T>;
  assert(value: unknown): asserts value is T;
  graph(): Graph;
  transform<U>(mapper: (value: T) => U): Decoder<U>;
  pipe(next: Guard<unknown> | Decoder<unknown>): Decoder<unknown>;
  default(value: T | (() => T)): Decoder<T>;
  prefault(value: unknown): Decoder<T>;
  catch(value: T | (() => T)): Decoder<T>;
}
```

| Method | Use it for | Contract |
| --- | --- | --- |
| `is` | Hot boolean narrowing | Avoids diagnostic allocation on the success path. |
| `check` | Validation with issues | Returns frozen `Result<T, Issue[]>` containers. |
| `checkFirst` | Hot rejection diagnostics | Returns the same frozen `Result` shape, but failure contains at most one issue. Compiled and AOT guards use a dedicated first-fault collector. |
| `assert` | Throwing integration boundaries | Throws `TypeSeaAssertionError` with copied, frozen issues. |
| `graph` | Runtime plan introspection | Returns the validated, optimized, frozen Sea-of-Nodes graph held by the validation plan. |
| `transform` / `pipe` | Output-producing decode pipelines | Return decoders. The source guard's `is()` semantics do not change. |
| `default` / `prefault` / `catch` | Zod-style decode recovery | Return decoders. Fallbacks are applied only by `decode()`, never by `is()`. |

Diagnostic paths contain only object keys and zero-based array or tuple indexes.
Public diagnostic validators reject malformed path segments before diagnostics
cross the API boundary.

## Builder Families

| Family | Builders |
| --- | --- |
| Scalars | `t.unknown`, `t.never`, `t.string`, `t.number`, `t.date`, `t.bigint`, `t.symbol`, `t.boolean`, `t.null`, `t.undefined`, `t.void` |
| String checks | `.min`, `.max`, `.length`, `.nonempty`, `.regex`, `.startsWith`, `.endsWith`, `.includes`, `.uuid`, `.email`, `.url`, `.isoDate`, `.isoDateTime`, `.ulid`, `.ipv4`, `.ipv6` |
| Number checks | `.int`, `.finite`, `.safe`, `.gte`, `.lte`, `.min`, `.max`, `.gt`, `.lt`, `.multipleOf`, `.positive`, `.nonnegative`, `.negative`, `.nonpositive` |
| Date checks | `.min`, `.max` |
| Literals and containers | `t.literal(value)`, `t.enum(values)`, `t.array(item)`, `t.tuple([a, b])`, `t.tuple([head], rest)`, `t.record(value)`, `t.map(key, value)`, `t.set(item)`, `t.json()` |
| Array checks | `.min`, `.max`, `.length`, `.nonempty` |
| Objects | `t.object(shape)`, `t.strictObject(shape)` |
| Object transforms | `t.extend`, `t.safeExtend`, `t.merge`, `t.pick`, `t.omit`, `t.partial`, `t.deepPartial`, `t.required`, `t.strict`, `t.passthrough`, `t.strip`, `t.catchall`, and matching object guard methods |
| Runtime object contracts | `t.instanceOf(Ctor)`, `t.property(base, key, value)`, `guard.property(key, value)` |
| Composition | `t.union`, `t.discriminatedUnion`, `t.intersect`, `guard.intersect` |
| Presence | `t.optional`, `t.undefinedable`, `t.nullable`, `t.nullish` |
| Dynamic guards | `t.lazy`, `t.refine`, `t.superRefine`, `guard.superRefine` |
| Decoders | `guard.transform`, `guard.pipe`, `guard.default`, `guard.prefault`, `guard.catch`, `t.decoder`, `t.transform`, `t.pipe`, `t.default`, `t.defaultValue`, `t.prefault`, `t.catch`, `t.codec`, `t.coerce`, `t.string.trim()`, `t.string.toLowerCase()`, `t.string.toUpperCase()` |
| Async decoders | `t.asyncDecoder`, `t.asyncRefine`, `t.asyncTransform`, `t.asyncPipe` |

Builder functions validate inputs before a schema can enter the validation plan,
compiler, AOT emitter, diagnostic collector, or JSON Schema exporter. Forged guard-like values,
invalid schema tags, invalid predicates, invalid bounds, malformed regexps, and
invalid discriminated union case sets are rejected during construction.

Accepted schemas are frozen before storage. Public schema collection fields use
frozen arrays and frozen key lookup records instead of mutable collection
objects.

## Object Presence

TypeSea separates key presence from value domain.

```ts
const Shape = t.object({
  name: t.optional(t.string),
  nickname: t.undefinedable(t.string)
});
```

- `name` may be absent. If `name` exists, its value must be a string.
- `nickname` must be present. Its value may be a string or `undefined`.
- `t.nullable(inner)` adds `null` to the value domain.
- `t.nullish(inner)` combines nullable value semantics with optional object-key
  presence.
- Presence-preserving wrappers keep optional-key semantics through `nullable`,
  `undefinedable`, `brand`, `refine`, and `superRefine`.

Object combinators preserve object mode. Strict object guards remain strict
after `extend`, `pick`, `omit`, or `partial`; passthrough object guards keep
allowing unknown keys.

`catchall(schema)` validates every undeclared own key with `schema`.
`strip()` is validation-only in TypeSea: guards return the original value, so it
has the same validation behavior as `passthrough()`.
`pick` and `omit` accept either key arrays or Zod-style `{ key: true }` masks.
`deepPartial()` recursively partializes pure object, array, tuple, tuple rest,
record, map, set, property, union, intersection, nullable, undefinedable,
optional, and brand schemas. Lazy and refinement schemas are semantic barriers.

`property` validates only own data descriptors. It is useful for class instances
with stable fields; prototype getters and accessor-backed properties are rejected
instead of executed.

## Composition

`t.union(a, b)` accepts a value that satisfies at least one branch.

`refine` and `superRefine` attach semantic checks after structural validation.
Use `refine` when a boolean predicate is enough, and `superRefine` when the
check is easier to write as a callback that can call `context.addIssue()`.
`addIssue()` accepts no argument for the default refinement issue, a string as a
message shorthand, or `{ path, message }` when the failure should point at a
nested relative path.

```ts
const Range = t.object({
  min: t.number,
  max: t.number
}).superRefine((value, context) => {
  if (value.min > value.max) {
    context.addIssue({
      path: ["max"],
      message: "max must be greater than or equal to min"
    });
  }
}, "ordered_range");
```

`t.discriminatedUnion("kind", cases)` requires string case keys. Each case must
be a statically inspectable object case whose dispatch key is a required string
literal matching the case name.

`t.intersect(a, b)` and `guard.intersect(other)` require the same input value to
satisfy both guards. `check()` collects diagnostics from both sides.

## Recursion

Recursive contracts must use `t.lazy`.

```ts
interface ListNode {
  readonly value: string;
  readonly next?: ListNode;
}

const Node: Guard<ListNode> = t.lazy((): Guard<ListNode> =>
  t.object({
    value: t.string,
    next: t.optional(Node)
  })
);
```

Direct cyclic schema objects are rejected at builder boundaries. Lazy guards
resolve once per guard instance and keep recursive schema identity stable. A
lazy chain must eventually resolve to a concrete non-lazy schema.

## Decoder Pipelines

```ts
const Count = t.pipe(t.coerce.number(), t.number.int().gte(0));
const result = Count.decode("42");

const Port = t.number.int().gte(0).lte(65535).default(3000);
const SafePort = t.number.int().gte(0).lte(65535).catch(3000);
const Name = t.default(t.string.min(1), "anonymous");
const NormalizedName = t.string
  .trim()
  .pipe(t.string.min(1))
  .transform((value) => value.toLowerCase())
  .default("anonymous")
  .catch("anonymous");
const NumberText = t.codec(
  t.string.regex(/^\d+$/u, "digits"),
  t.number.int().nonnegative(),
  {
    decode: (value) => Number(value),
    encode: (value) => String(value)
  }
);
```

Decoders are for output-producing operations. They return `Result` from
`decode()` and do not expose `is()` predicates, because the decoded output may
not be the same runtime value as the input.

- `t.transform(source, mapper)` decodes `source`, then maps the decoded value.
- `t.pipe(source, next)` feeds a successful decoded value into the next guard or decoder.
- `t.default(source, value)` returns a fallback output for `undefined` input.
- `t.prefault(source, value)` feeds a fallback input through the source.
- `t.catch(source, value)` returns a fallback output after a failed decode.
- Guard methods `guard.transform`, `guard.pipe`, `guard.default`,
  `guard.prefault`, and `guard.catch` are shorthand for the same decoder
  helpers. They do not change `guard.is()`.
- `t.codec(input, output, mapping)` validates both sides of a bidirectional decode/encode pair.
- `t.coerce.string`, `t.coerce.number`, and `t.coerce.boolean` provide explicit
  primitive coercion.
- `t.string.trim()`, `t.string.toLowerCase()`, and `t.string.toUpperCase()`
  are decoder helpers. They validate the string first, then return transformed
  output from `decode()`.
- `t.asyncRefine`, `t.asyncTransform`, and `t.asyncPipe` return
  `Promise<Result<T, Issue[]>>` from `decodeAsync()`.

Expected async validation failures still return `Result` values.

## Messages

```ts
const checked = withMessages(User.check(input), {
  locale: "ko",
  catalog: defineMessages({
    expected_string: "{path}: 문자열 필요"
  })
});
```

`formatIssue`, `formatIssues`, `flattenIssues`, and `withMessages` render
diagnostics after validation has finished. This keeps `is()` and ordinary
`check()` paths free from message allocation.

Built-in locales are `en` and `ko`. Custom catalogs can use string templates
with `{path}`, `{code}`, `{expected}`, and `{actual}`, or formatter callbacks.
`withMessages(result, options)` preserves successful results and returns a new
failed `Result` with copied, frozen issues whose `message` fields are populated.
`flattenIssues(issues, options)` groups rendered messages into `formErrors` and
top-level `fieldErrors` buckets.

## Runtime Compile

```ts
const FastUser = compile(User, { name: "isUser" });

FastUser.is(input);
FastUser.check(input);
```

`compile` emits generated predicate functions from the optimized Sea-of-Nodes
validation graph plus diagnostics collectors for failed values. Static scalar,
object, array, record, union, and strict-key nodes lower to straight-line
JavaScript or indexed loops where possible. Union lowering specializes
discriminant literals, primitive domains, required-key presence checks, and
coarse root-kind masks before falling back to ordered branch probing. Dynamic
schema edges such as `lazy`, `refine`, and `superRefine` keep semantics by using
the same IR-backed runtime fallback as ordinary guards.

The optional `name` is a debugging and profiling hint. TypeSea normalizes it
into a strict-mode-safe JavaScript function name, prefixes reserved names, and
caps generated name length. Direct compiled guard construction validates the
predicate, collector, and source arguments. Collector diagnostics are validated,
copied, and frozen before `check()` returns them.

Generated source never interpolates user-controlled values directly. Literals,
regexps, property keys, keysets, and dynamic schema fallbacks are captured in
side tables and referenced by numeric index.

### Compile Cache And Warmup

```ts
const FastUser = compileCached("user:v1", () => User, { name: "isUser" });

warmup([
  User,
  {
    key: "user:v1",
    guard: User,
    options: { name: "isUser" }
  }
], {
  namePrefix: "boot_"
});
```

`compileCached(key, factory, options)` uses a process-local explicit cache.
`createCompileCache()` creates an isolated cache for tests, workers, or
multi-tenant servers. The cache key combines the caller key, compile mode,
generated function name, and debug-source flag.

`warmup()` compiles guards during service startup or serverless module
initialization. Plain guards fill the per-guard WeakMap cache. Entries with
`key` fill an explicit cache, so the first real request does not pay schema
construction or codegen cost.

### Boolean-Only And Async Validation

```ts
const BooleanUser = compileBoolean(User, { name: "isUserBoolean" });
const AsyncUsers = compileAsync(t.array(User), {
  name: "isUsersAsync",
  yieldEvery: 4096,
  yieldTimeout: 5
});

BooleanUser.is(input);
await AsyncUsers.is(largePayload);
```

`compileBoolean()` is the fail-fast surface: it emits only a predicate and
generated source. It has no `check`, no `assert`, and no diagnostic collector.
Use it when the caller only needs a boolean verdict.

`isAsync()`, `checkAsync()`, and `compileAsync()` validate cooperatively. Long
array, tuple, record, map, set, union, and object loops yield with
`setImmediate()` when available, otherwise `setTimeout(0)`. `yieldEvery` limits
node-count bursts and `yieldTimeout` limits wall-clock bursts in milliseconds.
Diagnostics are still collected only after failure. `checkAsync()` and
`compileAsync().check()` return the same full diagnostic result as `check()`;
use `isAsync()` when the hot path needs only the cooperative boolean verdict.

### AOT Bundler Plugins

```ts
export default createTypeSeaVitePlugin({
  entries: [
    {
      id: "user:v1",
      guard: User,
      options: { name: "isUser", mode: "unsafe" }
    }
  ],
  transformCompileCached: true
});
```

`createTypeSeaVitePlugin`, `createTypeSeaRollupPlugin`, and
`createTypeSeaEsbuildPlugin` are zero-dependency structural plugin factories.
They serve virtual modules such as `typesea:aot/user:v1` by running
`emitAotModule()` at build time. Vite, Rollup, and esbuild can rewrite static
`compileCached("user:v1", ...)` calls into default imports from those virtual
modules, so production bundles can drop the schema factory and runtime compiler
for that guard. esbuild source reads use an optional `readFile` hook or a
dynamic `node:fs/promises` import inside plugin `setup()`.

### Union Schema Shape

TypeSea optimizes object unions best when each branch advertises a required own
key. AST-like contracts such as `and`, `or`, `not`, `path`, or `elemMatch`
lower to presence dispatch: the compiled predicate checks the required key first
and skips branches that cannot match.

```ts
const Query = t.union(
  t.object({ and: t.array(t.unknown).min(1) }),
  t.object({ or: t.array(t.unknown).min(1) }),
  t.object({ not: t.unknown }),
  t.object({ path: t.string, eq: t.optional(t.string) })
);
```

Avoid splitting optional operator bags into many near-identical union branches
only to express "at least one key exists". That shape repeats the same property
walk for every branch and can dominate recursive query validation. Prefer one
object schema for the structural pass, then add a semantic refinement if the
non-empty operator rule matters.

```ts
const Operators = t.object({
  eq: t.optional(t.string),
  neq: t.optional(t.string),
  exists: t.optional(t.boolean),
  gt: t.optional(t.number),
  between: t.optional(t.tuple([t.number, t.number]))
}).superRefine((value, context) => {
  if (!("eq" in value) &&
      !("neq" in value) &&
      !("exists" in value) &&
      !("gt" in value) &&
      !("between" in value)) {
    context.addIssue();
  }
}, "at_least_one_operator");
```

### Unsafe Compile Mode

```ts
const FastButLooseUser = compile(User, {
  name: "isUserFast",
  mode: "unsafe"
});
```

`CompileOptions["mode"]` and `AotCompileOptions["mode"]` are
`"safe" | "unsafe" | "unchecked" | undefined`; omitted options default to
`"safe"`. Safe mode keeps TypeSea's hostile-input contract: descriptor-based
property reads, no getter execution, and strict-object rejection for symbol and
non-enumerable extras.

Unsafe mode is an explicit performance escape hatch for trusted, normalized
plain data:

- Required object fields read with `value[key]` when the field schema rejects
  `undefined`.
- Discriminant dispatch reads the tag with direct bracket access.
- Arrays and tuples read items with direct indexed loads.
- Strict-object extra-key rejection uses an allocation-free own-enumerable
  `for...in` loop.

This may execute getters, may accept prototype-backed values, and does not
reject symbol or non-enumerable extras on strict objects. Because compiled
`check()` first trusts the generated predicate verdict, an unsafe predicate
that returns `true` also returns a successful `check()` result. Use unsafe mode
only after the input has crossed a trusted normalization boundary.

Unsafe mode may embed escaped static property keys directly into generated
predicate source so V8 can attach ordinary property-load inline caches. Safe
mode keeps property keys in side tables.

Unchecked mode uses the unsafe direct-read shape and also skips strict-object
extra-key loops. It is only for input whose object shape has already been
trusted or normalized; strict objects no longer reject extra keys in this mode.
Unsafe and unchecked compiled `check()` calls also return raw successful Result
objects without `Object.freeze()`. Failure diagnostics remain frozen. Safe mode
keeps frozen success and failure Result objects.
FastMode diagnostic collectors use direct field reads and FastMode strict-key
rules for object diagnostics where possible, so missing/accessor issue codes
are not guaranteed to match safe mode. Array and tuple diagnostics also use
direct indexed reads in fast modes, so sparse slots are diagnosed from the
loaded `undefined` value. Record diagnostics use direct `record[key]` reads;
unchecked mode also visits inherited enumerable keys. Discriminant diagnostics
read the tag directly and compare string cases with `===`.

| Contract | `safe` | `unsafe` | `unchecked` |
| --- | --- | --- | --- |
| Avoids user getter execution | yes | no | no |
| Rejects prototype-backed fields | yes | no | no |
| Rejects enumerable strict extras | yes | yes | no |
| Rejects symbol and non-enumerable strict extras | yes | no | no |
| Freezes successful compiled `check()` result | yes | no | no |

The practical rule is: public boundary data uses `safe`; trusted normalized
records may use `unsafe`; caller-owned fixed-shape DTOs may use `unchecked`.

## AOT Emit

```ts
const emitted = emitAotModule(User, { name: "aotUser" });
const unsafeEmitted = emitAotModule(User, {
  name: "aotUserFast",
  mode: "unsafe"
});
const uncheckedEmitted = emitAotModule(User, {
  name: "aotUserTrustedShape",
  mode: "unchecked"
});
```

`emitAotModule` returns `Result<AotModule, AotIssue[]>`. A successful result
contains standalone ESM validator source plus declaration source. The generated
module exports `is`, `check`, `assert`, and a default frozen guard-like object,
without requiring dynamic source compilation at module load time.

AOT generation is lossless-only. Schemas that require runtime callbacks or
identity that cannot be serialized return explicit AOT issues.

## Ecosystem Adapters

```ts
const parser = toTrpcParser(User);
const routeSchema = toFastifyRouteSchema(User);
const validatorCompiler = toFastifyValidatorCompiler(User);
const resolver = toReactHookFormResolver(User);
```

Adapters are structural and zero-dependency. TypeSea does not import tRPC,
Fastify, or React Hook Form.

Compiled guards can be passed to the same adapters. This is the preferred shape
for hot request paths: compile once during startup, then let the adapter reuse
the generated predicate.

```ts
const FastUser = compile(User);
const fastParser = toTrpcParser(FastUser);
const fastValidatorCompiler = toFastifyValidatorCompiler(FastUser);
```

Use the default compiled mode at public input boundaries. It keeps the safe
descriptor-read contract even when an adapter hides the direct `is()` call. For
trusted, already-normalized internal data, the faster modes can be wired through
adapters the same way.

```ts
const UnsafeUser = compile(User, { mode: "unsafe" });
const internalParser = toTrpcParser(UnsafeUser);

const TrustedShapeUser = compile(User, { mode: "unchecked" });
const internalValidatorCompiler = toFastifyValidatorCompiler(TrustedShapeUser);
```

| Adapter | Export | Behavior |
| --- | --- | --- |
| tRPC | `toTrpcParser`, `toAsyncTrpcParser` | Return parser objects that emit decoded values or throw `TypeSeaAssertionError`. |
| Fastify route schema | `toFastifyRouteSchema` | Converts guards to JSON Schema route fragments. |
| Fastify validator compiler | `toFastifyValidatorCompiler` | Returns compiler-shaped validators that produce `{ value }` or `{ error }`. |
| React Hook Form | `toReactHookFormResolver` | Returns an async resolver with TypeSea messages mapped to field errors. |

## Graph and IR

```ts
const graph = User.graph();
const optimized = optimizeGraph(graph);
```

`Guard.graph()` returns the optimized Sea-of-Nodes validation graph held by the
runtime validation plan. The same plan also owns the specialized predicate
kernel used by `is()`. The graph is the source for `compile()` and
`emitAotModule()`, while the kernel keeps ordinary guard execution out of a
generic per-node interpreter. Public graph values are validated,
dependency-checked, dense, and frozen.

`optimizeGraph(graph)` validates direct graph inputs before optimizing them.
Regex graph nodes accept only plain `RegExp` values and store non-extensible
regexps, cloning extensible inputs before the graph is frozen.

`SchemaCheck` records dynamic runtime schema logic such as `lazy`, `refine`, or
`superRefine`. It keeps the IR truthful instead of pretending a callback-backed
edge is a static primitive.

## JSON Schema

```ts
const result = toJsonSchema(User);
```

`toJsonSchema` returns `Result<JsonSchema, JsonSchemaExportIssue[]>`. It
succeeds only when TypeSea can represent the contract over JSON-compatible input
values without semantic loss.

Runtime-only concepts return explicit export issues:

- `undefined`
- `bigint`
- `symbol`
- JavaScript `Date`, `Map`, `Set`, `instanceOf`, and `property` contracts
- `lazy`
- `refine`
- `superRefine`
- decoder transforms
- async validation
- regexps with flags
- numeric literals that JSON cannot preserve, such as `NaN`, `Infinity`, and
  `-0`

`schemaToJsonSchema(schema)` is the direct schema API. It validates the supplied
schema and freezes it before export. JSON Schema options are also validated;
`schemaId`, when present, must be a string.

Object `properties` maps are emitted as null-prototype records so special keys
such as `__proto__`, `constructor`, and `hasOwnProperty` remain ordinary own
schema properties.

## Edge Semantics

- Literal guards use `Object.is`, so `t.literal(Number.NaN)` matches `NaN` and
  `t.literal(-0)` does not match `0`.
- `t.number` accepts only finite JavaScript numbers. `NaN`, `Infinity`, and
  `-Infinity` are rejected before configured numeric predicates run.
- String length bounds must be non-negative integers.
- Numeric comparison bounds must be finite.
- Predicate callbacks must return strict `true`; truthy non-boolean values do
  not pass validation.
- `RegExp` checks reset `lastIndex` before each test, so global and sticky
  regexps do not leak state across validations.
- String regex builders and direct string regex schemas accept only plain
  `RegExp` instances. Accepted regex checks are cloned before storage.

## Result Contract

```ts
type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

Expected validation failures use `Result`. Result containers are frozen at
runtime. Successful values are not recursively frozen because they are
caller-owned data.
