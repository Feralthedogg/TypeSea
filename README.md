# TypeSea

[![CI](https://github.com/Feralthedogg/TypeSea/actions/workflows/ci.yml/badge.svg)](https://github.com/Feralthedogg/TypeSea/actions/workflows/ci.yml)
[![Socket Badge](https://badge.socket.dev/npm/package/typesea)](https://socket.dev/npm/package/typesea)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![TypeScript](https://img.shields.io/badge/language-TypeScript-informational)
![Dependencies](https://img.shields.io/badge/runtime%20deps-zero-brightgreen)
![Tree-shakeable](https://img.shields.io/badge/tree--shakeable-yes-7CFF9B)
![Side-effect free](https://img.shields.io/badge/side--effect%20free-yes-7CFF9B)
![No dependencies](https://img.shields.io/badge/dependencies-none-7CFF9B)
![Module](https://img.shields.io/badge/module-ESM--only-orange)
![Node](https://img.shields.io/badge/node-%3E%3D20.19-yellowgreen)

**TypeSea** is a **zero-runtime-dependency TypeScript runtime narrowing library**
built around **immutable guards**, optimized **Sea-of-Nodes validation plans**,
runtime compilation, and AOT source generation.

## Try It In Existing Code

For Zod 4 migration experiments, keep the schema shape and swap the import to
TypeSea's facade subpath. The facade is a best-effort compatibility layer over
TypeSea guards, not a clone of Zod's parser internals, so start with ordinary
object, string, number, enum, array, tuple, union, and modifier-heavy schemas.

```ts
// Before
import { z } from "zod";

// After
import { z } from "typesea/v4";

const User = z.object({
  id: z.string().uuid(),
  email: z.string().email()
}).strict();

const user = User.parse(input);
```

TypeSea guards also expose Standard Schema V1, so ecosystem tools that accept
Standard Schema can receive the guard directly. Hono supports this through
`@hono/standard-validator`, and tRPC can consume Standard Schema validators or
the explicit TypeSea parser adapter.

```ts
import { sValidator } from "@hono/standard-validator";
import { compile, t, toTrpcParser } from "typesea";

const User = t.strictObject({
  id: t.string.uuid(),
  email: t.string.email()
});

// Hono: Standard Schema path, no TypeSea-specific adapter required.
app.post("/users", sValidator("json", User), (c) => {
  const body = c.req.valid("json");
  return c.json(body);
});

// tRPC: compile once, then reuse the generated predicate on the hot path.
const FastUser = compile(User);
const userInput = toTrpcParser(FastUser);

publicProcedure.input(userInput).mutation(({ input }) => {
  return createUser(input);
});
```

## Benchmark Headline

Last clean committed local benchmark on 2026-07-09 KST:
`npm run bench:record`, median of 3 full runs, strict-object contract,
operations per second on one machine. The chart is generated from
[`bench/results/latest.json`](https://github.com/Feralthedogg/TypeSea/blob/main/bench/results/latest.json).

![TypeSea benchmark comparison](https://feralthedogg.github.io/TypeSea/benchmark-headline.svg)

TypeSea safe compiled validators are already in Ajv's boolean hot-path class
while keeping descriptor-based hostile-input semantics. Unsafe and unchecked
FastMode are the bragging-rights path for trusted normalized data: direct field
loads, allocation-light strict-key loops, and V8-friendly monomorphic codegen.

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

> [!WARNING]
> `unsafe` and `unchecked` are **not public-boundary modes**. They are for
> trusted, already-normalized data where the caller accepts getter execution,
> prototype-backed values, and weaker strict-extra-key guarantees. Use the
> default safe mode for external input.

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
  email: t.string.email(),
  age: t.number.int().nonnegative(),
  role: t.enum(["admin", "user"]),
  tags: t.array(t.string.min(1)).max(8)
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

const SharedName = t.string.min(1).meta({ id: "SharedName" });
const referencedSchema = toJsonSchema(t.object({
  first: SharedName,
  last: SharedName
}), { reused: "ref" });
```

Use `is()` for the allocation-light boolean path. Use `check()` when callers
need the full immutable diagnostic list, or `checkFirst()` when a hot rejection
path only needs one machine-readable issue. Use `compile()` or `emitAotModule()`
when a stable schema is hot enough to deserve generated validator code.
Compiled and AOT `checkFirst()` use a dedicated first-fault collector instead
of building the full issue list and slicing it afterward.

> [!CAUTION]
> `compile()` builds the validator with `new Function`, which throws under a
> Content-Security-Policy that forbids `unsafe-eval`. In CSP-restricted
> environments, generate validator source ahead of time with
> `emitAotModule()` instead.

### Mini Entry Point

Bundle-sensitive callers can import the functional subpath:

```ts
import * as mini from "typesea/mini";

const User = mini.object({
  id: mini.string().uuid(),
  name: mini.optional(
    mini.apply(mini.string(), mini.minLength(1), mini.maxLength(80))
  )
});

type User = mini.Infer<typeof User>;
```

`typesea/mini` follows the same direction as Zod Mini: top-level functional
builders, no broad `t`/`z` namespace import, and no runtime dependencies. It
keeps the same immutable guards, decoders, messages, JSON Schema helpers, and
Standard Schema helpers as the root package, but avoids exporting the root
compatibility barrel. Use `mini.apply(schema, ...helpers)` or call helpers
directly as `mini.minLength(1)(mini.string())` when you want method-chain-free
schemas. The first helper set covers length, size, numeric bounds, string
patterns, and string decode transforms such as `mini.trim()`.

### SeaFlow Symbolic Fuzzer

```ts
import { fuzzCases } from "typesea/seaflow";
import { t } from "typesea";

const User = t.strictObject({
  id: t.string.uuid(),
  age: t.number.int().gte(0),
  role: t.enum(["admin", "user"])
});

for (const item of fuzzCases(User, { intensity: "high", maxYields: 64 })) {
  console.log(item.kind, item.valid, item.reason, item.value);
}
```

SeaFlow is the dev/test fuzzer for TypeSea schemas. It walks the immutable
schema tree backward and emits valid samples, invalid boundaries, and
security-oriented probes such as deleted required keys, strict-object extras,
`__proto__` keys, accessor properties, sparse arrays, and union hybrids. It is
published as `typesea/seaflow` so production validators do not pay for the
fuzzer unless you import it. `maxYields` is a hard upper bound, not a target:
small schemas may naturally emit fewer cases when the solver has exhausted its
finite edge set.
Before filtering, SeaFlow checks each generated value against its local schema,
so `item.valid` matches the executable validator even when multiple constraints
overlap. This reconciliation executes custom refinement predicates.

### SeaBreeze Arena Inference

```ts
import { createSeaBreeze } from "typesea/seabreeze";

const s = createSeaBreeze({ maxNodes: 64, maxFields: 16 });

const User = s.object({
  id: s.string(),
  age: s.optional(s.number()),
  tags: s.array(s.string())
});

const FastUser = s.compile(User, {
  objectMode: "strict",
  mode: "safe",
  name: "isInferredUser"
});

FastUser.is({ id: "u1", tags: ["jit"] }); // true
```

SeaBreeze is TypeSea's arena-backed inference surface. The ergonomic
`createSeaBreeze()` builder is a zero-cost abstraction for the validation hot
path: it allocates only while building the arena shape, returns numeric node ids,
and `compile()` emits the same direct predicate source as the low-level reader
API. It is published as `typesea/seabreeze`, not re-exported from `typesea`, so
normal validators do not pay for it.

### Cold Starts, Fail-Fast, And Large Payloads

```ts
import {
  compileAsync,
  compileBoolean,
  compileCached,
  createTypeSeaVitePlugin,
  warmup
} from "typesea";

const FastUser = compileCached("user:v1", () => User, { name: "isUser" });
const BooleanUser = compileBoolean(User, { name: "isUserBoolean" });
const AsyncUsers = compileAsync(t.array(User), {
  name: "isUsersAsync",
  yieldEvery: 4096,
  yieldTimeout: 5
});

warmup([User, { key: "user:v1", guard: User, options: { name: "isUser" } }]);

export default createTypeSeaVitePlugin({
  entries: [{ id: "user:v1", guard: User, options: { name: "isUser" } }],
  transformCompileCached: true
});
```

Use `compileCached()` when schema construction might otherwise happen inside a
request handler. It caches by caller-owned semantic keys, so cold-start work can
be paid once and reused deliberately. `compile()` also caches repeated calls for
the same guard instance, and development builds warn when repeated codegen comes
from the same callsite.

Use `warmup()` in Lambda/serverless module scope or service startup to prefill
compiled guards before the first request. Use `compileBoolean()` when a hot
path only needs true/false; it emits no diagnostic collectors at all. Use
`compileAsync()` or `isAsync()` for huge arrays, records, maps, sets, or object
graphs that should yield back to the Node.js event loop between validation
chunks.

The zero-dependency AOT plugin helpers expose Rollup, Vite, and esbuild
compatible plugin objects. All three can rewrite static
`compileCached("id", ...)` calls into imports from `typesea:aot/<id>` when the
entry is listed in the plugin config. esbuild reads source through an optional
`readFile` hook or a dynamic `node:fs/promises` import inside `setup()`.

### Unsafe FastMode

```ts
const FastButLooseUser = compile(User, {
  name: "isUserFast",
  mode: "unsafe"
});

const FastTrustedShapeUser = compile(User, {
  name: "isUserTrustedShape",
  mode: "unchecked"
});
```

`compile(..., { mode: "unsafe" })` and
`emitAotModule(..., { mode: "unsafe" })` emit the V8-friendliest predicate
TypeSea can generate: required object fields are read with direct bracket
access, arrays and tuples use direct indexed loads, discriminants avoid
descriptor reads, and strict-object extras are checked with an allocation-free
`for...in` loop. This mode is for trusted, already-normalized data on extremely
hot paths.

The default is still `mode: "safe"`. Unsafe mode may execute getters, may accept
prototype-backed values, and strict objects do not reject symbol or
non-enumerable extras. Use it only when the caller owns the object graph or has
already normalized input into plain data records. Unsafe generated predicates
may also embed escaped static property keys directly in source so V8 can use
ordinary property-load inline caches.

`mode: "unchecked"` goes one step further: it trusts the object shape and skips
strict extra-key loops entirely. That is the fastest path for already-owned DTOs,
but strict objects no longer reject any extra keys.

In unsafe and unchecked modes, successful compiled `check()` calls return a raw
`{ ok: true, value }` object instead of freezing the success result. Failed
diagnostics are still frozen. Safe mode keeps the fully frozen Result contract.
FastMode diagnostic collectors also use the same trusted direct-read object
shape where possible, so their issue codes can be less hostile-input-specific
than safe mode for missing/accessor-backed fields and sparse/accessor-backed
array or record slots. Discriminant diagnostics also read tags directly.

| Contract | `safe` | `unsafe` | `unchecked` |
| --- | --- | --- | --- |
| Executes user getters | no | possible | possible |
| Accepts prototype-backed fields | no | possible | possible |
| Rejects enumerable extra keys in strict objects | yes | yes | no |
| Rejects symbol or non-enumerable strict extras | yes | no | no |
| Freezes successful compiled `check()` result | yes | no | no |
| Intended input | hostile boundary data | trusted normalized records | trusted fixed-shape DTOs |

Use `safe` at every public boundary. Use `unsafe` only after data has already
been normalized into ordinary records. Use `unchecked` only when the caller owns
the shape and treats extra-key rejection as unnecessary work.

---

## Presence Semantics

Object presence is explicit — two different wrappers express two different
contracts:

| Wrapper | Key may be absent | Value may be `undefined` | Inferred type |
| --- | --- | --- | --- |
| `t.optional(inner)` / `guard.optional()` | yes | no | `key?: T` |
| `t.exactOptional(inner)` / `z.exactOptional(inner)` | yes | no, and standalone `undefined` fails | `key?: T` |
| `t.undefinedable(inner)` / `guard.undefinedable()` | no | yes | `key: T \| undefined` |
| `t.nullable(inner)` / `guard.nullable()` | — | value may be `null` | `key: T \| null` |
| `t.nullish(inner)` / `guard.nullish()` | yes | value may be `null` | `key?: T \| null` |
| `guard.nonoptional()` / `t.nonoptional(inner)` | no | no | `key: T` |

> [!NOTE]
> Presence survives wrapper composition: `t.nullable(t.optional(x))` still
> means "the key may be absent" — inference and runtime agree on this under
> `exactOptionalPropertyTypes`.

Use `guard.unwrap()` or `t.unwrap(guard)` to recover the inner guard from
optional, nullable, undefinedable, or array schemas. Metadata, message, brand,
readonly, and refinement shells are skipped so annotations do not hide the
payload schema.

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

Last clean local benchmark on 2026-07-09 KST, using `npm run bench:record` with the
median of 3 full Vitest runs over the benchmark strict-object contract. The raw
Vitest JSON is stored in
[`bench/results/raw.json`](https://github.com/Feralthedogg/TypeSea/blob/main/bench/results/raw.json),
and the stable summary used by the README graph is stored in
[`bench/results/latest.json`](https://github.com/Feralthedogg/TypeSea/blob/main/bench/results/latest.json).
These are operations per second on one machine, not release guarantees.

| Valid object path | hz |
| --- | ---: |
| TypeSea interpreted `is()` | 428,637 |
| TypeSea compiled safe `is()` | 4,952,729 |
| TypeSea compiled unsafe `is()` | 31,992,573 |
| TypeSea compiled unchecked `is()` | 39,651,592 |
| Zod `safeParse` | 1,278,093 |
| Valibot `safeParse` | 1,252,213 |
| Ajv compiled | 4,047,925 |

| Valid diagnostic path | hz |
| --- | ---: |
| TypeSea interpreted `check()` | 414,697 |
| TypeSea compiled safe `check()` | 4,422,123 |
| TypeSea compiled unsafe `check()` | 25,915,737 |
| TypeSea compiled unchecked `check()` | 32,844,863 |
| Zod `safeParse` | 1,295,961 |
| Valibot `safeParse` | 1,244,209 |
| Ajv compiled | 4,238,051 |

| Invalid object path | hz |
| --- | ---: |
| TypeSea interpreted `is()` | 2,891,226 |
| TypeSea compiled safe `is()` | 40,230,201 |
| TypeSea compiled unsafe `is()` | 49,473,616 |
| TypeSea compiled unchecked `is()` | 48,593,951 |
| Zod `safeParse` | 82,424 |
| Valibot `safeParse` | 897,869 |
| Ajv compiled | 27,612,151 |

| Invalid diagnostic path | hz |
| --- | ---: |
| TypeSea interpreted `check()` | 345,894 |
| TypeSea compiled safe `check()` | 1,714,191 |
| TypeSea compiled unsafe `check()` | 2,689,279 |
| TypeSea compiled unchecked `check()` | 3,207,055 |
| Zod `safeParse` | 80,559 |
| Valibot `safeParse` | 845,532 |
| Ajv compiled | 29,466,173 |

| Presence-dispatched object union | hz |
| --- | ---: |
| TypeSea interpreted logical branch | 1,118,624 |
| TypeSea compiled safe logical branch | 5,151,943 |
| TypeSea compiled unsafe logical branch | 44,039,351 |
| TypeSea interpreted fallback record branch | 412,629 |
| TypeSea compiled safe fallback record branch | 6,139,899 |
| TypeSea compiled unsafe fallback record branch | 13,643,825 |
| TypeSea interpreted invalid branch | 594,288 |
| TypeSea compiled safe invalid branch | 15,148,274 |
| TypeSea compiled unsafe invalid branch | 26,067,883 |

The safe compiled path stays close to Ajv while retaining TypeSea hostile-input
semantics: descriptor-based property reads, symbol/non-enumerable strict-key
rejection, presence semantics, immutable diagnostics, and TypeScript guard
inference. Unsafe and unchecked compiled modes are faster because they
deliberately give up parts of that hostile-input contract.

---

## API Reference

All public entry points are exported from the package root; builders are also
grouped under the `t` table. Zod migration code can import the compatibility
builder namespace as `z`; it keeps TypeSea builders while supporting nullary
calls such as `z.null()` and `z.undefined()`. Namespace imports can use
Zod-style type aliases:

```ts
import { z } from "typesea";
import * as typesea from "typesea";

const User = z.object({ id: z.string.uuid() });
type User = typesea.infer<typeof User>;
type SameUser = typesea.TypeOf<typeof User>;
```

When you want the migration import itself to look like Zod, use the dedicated
facade subpath:

```ts
import * as z from "typesea/zod";

const User = z.strictObject({
  id: z.string().uuid(),
  status: z.union([z.literal("active"), z.literal("disabled")])
});

type User = z.infer<typeof User>;
```

`typesea/zod` flattens the compatibility namespace into top-level exports for
`import * as z` code: primitive constructors such as `z.string()` and
`z.unknown()`, tuple-style `z.union([a, b])`, `z.nativeEnum`,
`z.intersection`, `z.instanceof`, `z.keyof(object)`, and
`z.catch(schema, fallback)`, plus `z.exactOptional(schema)` for optional object
keys that must reject explicit `undefined` values. It also provides a default
export for `import z from "typesea/zod"` migration code. It is still TypeSea
underneath, has no runtime dependency on Zod, and is covered by dev-only Zod
parity tests for representative migration-safe schemas, primitive-safe
coercion, decoder output wrappers, top-level wrappers, and object modifiers.
In the `z` namespace, `z.object(shape)` follows Zod v4 strip-by-default output
semantics; call `.passthrough()` or `.loose()` when unknown keys should be kept.
Native `t.object(shape)` remains TypeSea's explicit passthrough object builder.
For 1.x, TypeSea owns these subpath names as stable migration facades, but they
remain best-effort compatibility layers over TypeSea's guard engine rather than
a promise to clone Zod's internal parser engine or every future upstream
feature. Missing Zod APIs should be treated as compatibility gaps, not as part
of TypeSea's core validation contract.
The facade also carries TypeSea's functional helper variants of common
top-level Zod checks and transforms, such as `z.minLength(2)(z.string())`,
`z.trim()(z.string())`, `z.positive()(z.number())`, `z.mime("text/plain")`,
and `z.overwrite(mapper)(schema)`. The same helpers can be passed to
`schema.check(...)` when using Zod-style check-object code:
`z.string().check(z.minLength(2))` and `z.string().check(z.trim())`.
Plain guards also expose Zod-style instance decode/encode aliases:
`schema.decode(value)`, `schema.safeDecode(value)`, `schema.encode(value)`,
and `schema.safeEncode(value)`.

Zod 4 package-alias migrations can keep their subpath imports:

```ts
import z from "typesea/v4";
import * as zm from "typesea/v4-mini";
import * as nestedMini from "typesea/v4/mini";
import { en, ko } from "typesea/locales";
import { $ZodString } from "typesea/v4/core";
import { en as enLocale } from "typesea/v4/locales/en";

const User = z.object({ id: z.uuid() });
const Name = zm.apply(zm.string(), zm.minLength(1));
const AliasName = nestedMini.apply(nestedMini.string(), nestedMini.maxLength(80));

void en;
void ko;
void $ZodString;
void enLocale;
void User;
void Name;
void AliasName;
```

`typesea/v4/core` matches the Zod 4.4.3 named export set for package-alias
migrations and common ecosystem probes. Its low-level `$ZodCheck*` and
underscore-prefixed exports are compatibility shims over TypeSea's public
builders, not a clone of Zod's internal parser engine.

Legacy `zod/v3` imports can resolve `typesea/v3`. That entry point exposes the
v3 named export set over TypeSea's current guard engine; v3 parser internals
such as `ParseStatus` are lightweight compatibility shims for migration probes.

Zod-style primitive calls are accepted too: `z.string()`, `z.number()`,
`z.boolean()`, `z.bigint()`, `z.symbol()`, and `z.date()` return the matching
primitive guards. `z.any()` exists only as a migration alias for `z.unknown()`;
it accepts every input but still infers `unknown`, never TypeScript `any`.
Legacy optional shortcuts `z.ostring()`, `z.onumber()`, `z.oboolean()`,
`z.obigint()`, `z.osymbol()`, and `z.odate()` return the matching optional
primitive guard for older Zod-style code.
Migration class names such as `ZodString`, `ZodNumber`, `ZodObject`,
`ZodArray`, `ZodUnion`, `ZodEnum`, and `ZodPromise` are exported as aliases for
the TypeSea implementation classes. Type-only migration helpers `ZodTypeAny`
and `AnyZodObject` are also available for code that names those Zod surfaces.
Format-specific class names such as `ZodEmail`, `ZodURL`, `ZodUUID`,
`ZodNumberFormat`, and `ZodBigIntFormat` are migration aliases for the matching
TypeSea guard family rather than separate runtime classes.
Decoder-facing names such as `ZodEffects`, `ZodPipeline`, `ZodTransform`,
`ZodDefault`, `ZodCatch`, `ZodPrefault`, and `ZodCodec` point at TypeSea's
decoder and codec classes.
Wrapper and container names such as `ZodOptional`, `ZodNullable`, `ZodTuple`,
`ZodRecord`, `ZodMap`, `ZodIntersection`, `ZodDiscriminatedUnion`,
`ZodReadonly`, and `ZodBranded` point at TypeSea's schema-backed guard class.
Guards also expose lazy Zod-style `def`, `_def`, and `_zod` metadata for
migration tools: `typeName`, `type`, `shape`, `element`, `options`,
`innerType`, `keyType`, and `valueType` are available where they make sense,
and `ZodFirstPartyTypeKind` is exported as the matching enum-like constant
table. Guards also expose direct Zod-style metadata probes such as
`schema.type`, `literal.value`, `literal.values`, `record.keyType`,
`record.valueType`, `bigint.minValue`, `bigint.maxValue`, `date.minDate`, and
`date.maxDate`. This facade is read-only and is not used by validation or
generated predicates.

### Builders

| Area | Entry points |
| --- | --- |
| Scalar guards | `t.unknown`, `t.never`, `t.string`, `t.number`, `t.int`, `t.int32`, `t.uint32`, `t.float32`, `t.float64`, `t.int64`, `t.uint64`, `t.nan`, `t.date`, `t.bigint`, `t.symbol`, `t.boolean`, `t.null`, `t.undefined`, `t.void` |
| String checks | `.min`, `.max`, `.length`, `.minLength`, `.maxLength`, `.nonempty`, `.regex`, `.startsWith`, `.endsWith`, `.includes`, `.uppercase`, `.lowercase`, `.uuid`, `.guid`, `.uuidv4`, `.uuidv6`, `.uuidv7`, `.hash`, `.email`, `.url`, `.httpUrl`, `.hostname`, `.e164`, `.emoji`, `.base64`, `.base64url`, `.hex`, `.jwt`, `.nanoid`, `.cuid`, `.cuid2`, `.xid`, `.ksuid`, `.mac`, `.cidrv4`, `.cidrv6`, `.isoDate`, `.isoDateTime`, `.isoTime`, `.isoDuration`, `.date`, `.datetime`, `.time`, `.duration`, `.ulid`, `.ipv4`, `.ipv6` |
| Top-level string formats | `t.email`, `t.uuid`, `t.guid`, `t.uuidv4`, `t.uuidv6`, `t.uuidv7`, `t.url`, `t.httpUrl`, `t.hostname`, `t.e164`, `t.emoji`, `t.base64`, `t.base64url`, `t.hex`, `t.jwt`, `t.nanoid`, `t.cuid`, `t.cuid2`, `t.xid`, `t.ksuid`, `t.ulid`, `t.ipv4`, `t.ipv6`, `t.mac`, `t.cidrv4`, `t.cidrv6`, `t.isoDate`, `t.isoDateTime`, `t.isoTime`, `t.isoDuration`, `t.iso.date`, `t.iso.datetime`, `t.iso.time`, `t.iso.duration`, `t.hash`, `t.stringFormat` |
| Regex presets | `regexes`, `t.regexes`, including `email`, `html5Email`, `rfc5322Email`, `unicodeEmail`, `domain`, `uuid`, `guid`, `e164`, `nanoid`, `cuid`, `cuid2`, `xid`, `ksuid`, `ulid`, `ipv4`, `ipv6`, `cidrv4`, `cidrv6`, `mac`, `base64`, `base64url`, `hex`, `jwt` |
| Number checks | `.int`, `.int32`, `.uint32`, `.float32`, `.float64`, `.finite`, `.isFinite`, `.isInt`, `.safe`, `.gte`, `.lte`, `.min`, `.max`, `.minValue`, `.maxValue`, `.gt`, `.lt`, `.multipleOf`, `.step`, `.positive`, `.nonnegative`, `.negative`, `.nonpositive` |
| BigInt checks | `.int64`, `.uint64`, `.gte`, `.lte`, `.min`, `.max`, `.gt`, `.lt`, `.multipleOf`, `.step`, `.positive`, `.nonnegative`, `.negative`, `.nonpositive` |
| Date checks | `.min`, `.max` |
| Literal and containers | `t.literal(value)`, `literal.value`, `t.literal([...]).values`, `t.enum`, `enum.options`, `enum.enum`, `enum.extract`, `enum.exclude`, `t.templateLiteral`, `t.array`, `array.element`, `t.tuple`, `tuple.items`, `t.tuple([head], rest)`, `tuple.rest`, `t.record`, `t.partialRecord`, `t.looseRecord`, `t.map`, `t.set`, `t.file`, `t.json` |
| Array checks | `.min`, `.max`, `.length`, `.nonempty` |
| Map checks | `.min`, `.max`, `.size`, `.nonempty` |
| Set checks | `.min`, `.max`, `.size`, `.nonempty` |
| File checks | `.min`, `.max`, `.mime` |
| Functional helpers | `typesea/mini` and `typesea/zod`: `minLength`, `maxLength`, `length`, `regex`, `startsWith`, `endsWith`, `includes`, `uppercase`, `lowercase`, `trim`, `toLowerCase`, `toUpperCase`, `normalize`, `slugify`, `minSize`, `maxSize`, `size`, `mime`, `gt`, `gte`, `lt`, `lte`, `multipleOf`, `positive`, `negative`, `nonpositive`, `nonnegative`, `overwrite`, `clone` |
| Objects | `t.object`, `t.looseObject`, `t.strictObject`, `object.shape`, `extend`, `safeExtend`, `merge`, `pick`, `omit`, `t.keyof`, `keyofObject`, `partial`, `partial({ key: true })`, `deepPartial`, `required`, `required({ key: true })`, `strict`, `loose`, `passthrough`, `nonstrict`, `nonpassthrough`, `strip`, `catchall`, `atLeastOneKey`, `exactlyOneKey`, `oneOfKeys` |
| Runtime object contracts | `t.instanceOf`, `t.property(base, key, value)`, `guard.property(key, value)` |
| Function contracts | `t.function`, `z.function().args(...).returns(...)`, `functionBuilder`, `FunctionContract.parameters`, `FunctionContract.returnType`, `FunctionContract.implement`, `FunctionContract.implementAsync` |
| Composition | `t.union`, `union.options`, `t.xor`, `xor.options`, `t.discriminatedUnion`, `t.intersect`, `guard.intersect`, `guard.and` |
| Presence wrappers | `t.optional`, `guard.optional`, `t.exactOptional`, `z.exactOptional`, `guard.exactOptional`, `t.undefinedable`, `guard.undefinedable`, `t.nullable`, `guard.nullable`, `t.nullish`, `guard.nullish`, `guard.nonoptional`, `t.nonoptional` |
| Wrapper introspection | `guard.unwrap`, `t.unwrap`, `guard.apply` |
| Output wrappers | `guard.readonly`, `t.readonly` |
| Dynamic contracts | `t.lazy`, `t.custom`, `t.check`, `t.property(key, value)`, `t.refine`, `guard.refine`, `t.superRefine`, `guard.superRefine`, `guard.with` |
| Schema annotations | `guard.metadata`, `guard.meta`, `guard.title`, `guard.describe`, `guard.example`, `guard.message`, `guard.register`, `t.metadata`, `t.meta`, `t.title`, `t.describe`, `t.example`, `t.message`, `t.registry`, `t.globalRegistry` |

`t.iso.date()`, `t.iso.datetime()`, `t.iso.time()`, and `t.iso.duration()`
are Zod-compatible aliases for the existing top-level ISO format helpers.
`t.looseObject(shape)` is an explicit alias for TypeSea's default passthrough
object mode. `loose()` and `nonstrict()` switch an object guard to passthrough
mode; `nonpassthrough()` is a Zod migration alias for `strict()`.
String `date()`, `datetime()`, `time()`, and `duration()` are fluent aliases for
the matching ISO methods. `type`, `minLength`, `maxLength`, `minValue`,
`maxValue`, `isInt`, `isFinite`, `keyType`, and `valueType` are Zod-style
readonly metadata properties. String and number guards expose Zod-style
`format`; bigint guards expose `format`, `minValue`, and `maxValue`; Date guards
expose `minDate` and `maxDate`.
String format helpers accept Zod-style options where the runtime grammar is
still a regular expression: `uuid({ version })`, `email({ pattern })`,
`url({ protocol, hostname })`, `url({ normalize: true })`,
`iso.datetime({ offset, local, precision })`, `iso.time({ precision })`,
`mac({ delimiter })`, and `jwt({ alg })`. URL normalization returns a decoder
because it changes the accepted output value.
`guard.refine(predicate, params?)` and `t.refine(guard, predicate, params?)`
support Zod-style refinement diagnostics. `params` may be omitted, a legacy
label string, or `{ error, path, abort, when }`. `error` becomes the issue
message, `path` points at the relative failing field, and
`when({ value, issues })` can opt into running the predicate even after the
inner diagnostic pass has reported unrelated issues. `superRefine()` also
accepts an omitted label and uses `"refinement"` as the internal expected label.
`guard.with(({ value, issues }) => ...)` accepts Zod-style callback checks; the
issue sink supports `issues.push({ message, path, ...extra })` and ignores
Zod-specific extra fields after copying TypeSea's `message` and relative `path`.
`t.check(callback)` creates a reusable callback-check source for
`guard.with(t.check(...))`. TypeSea keeps `guard.check(value)` as the native
Result-returning validation method.
`t.property(key, guard)` is the Zod-style reusable property check source for
`guard.with(...)`; it reads the public property so examples such as
`t.string.with(t.property("length", t.number.gte(3)))` work. For hostile-input
boundaries, keep using `t.property(base, key, guard)` or
`base.property(key, guard)`, which require an own data property and do not invoke
user getters.
Use `regexes` or `t.regexes` for Zod-style reusable patterns such as
`email({ pattern: regexes.html5Email })` and
`url({ hostname: t.regexes.domain })`.
`t.record(key, value)` follows Zod 4 exhaustive semantics for finite string
literal key domains. Numeric key schemas receive finite numeric object keys as
numbers, so `t.record(t.number.int(), value)` accepts keys like `"0"` or
`"1.5"` only when the numeric schema accepts the parsed number. Use
`t.partialRecord(key, value)` when enum/literal keys are optional.
The `z` compatibility namespace also exposes `z.nativeEnum` as an alias for
`t.enum`, `z.intersection` as an alias for `t.intersect`, `z.instanceof` as an
alias for `t.instanceOf`, and Zod-style tuple inputs for `z.union([a, b])` and
`z.xor([a, b])`. `z.discriminatedUnion("kind", [A, B])` accepts Zod-style case
arrays when each branch structurally requires a literal `kind`, including
string, number, boolean, null, or undefined literals.
Primitive constructor calls such as `z.string()` and `z.number()` are supported,
and `z.any()` is mapped to TypeSea's `unknown` semantics for migration safety.
Legacy optional shortcuts such as `z.ostring()` and `z.onumber()` are supported
for older Zod-style code.

### Decoders

| Area | Entry points |
| --- | --- |
| Sync decoders | `guard.decode`, `guard.safeDecode`, `guard.encode`, `guard.safeEncode`, `guard.transform`, `guard.overwrite`, `guard.pipe`, `guard.default`, `guard.prefault`, `guard.catch`, `t.decoder`, `t.decode`, `t.safeDecode`, `t.encode`, `t.safeEncode`, `t.encodeAsync`, `t.safeEncodeAsync`, `t.transform`, `t.success`, `t.preprocess`, `t.pipe`, `t.default`, `t.defaultValue`, `t.prefault`, `t.catch`, `t.codec`, `t.invertCodec`, `t.codecs`, built-in codec helpers, `t.stringbool`, `t.coerce`, `t.string.trim()`, `t.string.toLowerCase()`, `t.string.toUpperCase()`, `t.string.slugify()`, `t.string.normalize()` |
| Async decoders | `t.asyncDecoder`, `t.decodeAsync`, `t.safeDecodeAsync`, `t.asyncRefine`, `t.asyncTransform`, `t.asyncPipe`, `t.promise`, `guard.promise()` |

Synchronous decoder and codec instances expose Zod-style `parse`, `safeParse`,
`parseAsync`, `safeParseAsync`, and `spa` methods for migration ergonomics.
Async decoder instances expose `parseAsync`, `safeParseAsync`, and `spa`.
The top-level `t.decode`, `t.safeDecode`, `t.encode`, `t.safeEncode`,
`t.decodeAsync`, `t.safeDecodeAsync`, `t.encodeAsync`, and `t.safeEncodeAsync`
helpers keep TypeSea's native `Result` contract. `t.promise(source)` is
async-only: it awaits native `Promise` inputs and validates the resolved value
through `source`. `guard.promise()` is the same async decoder surface in fluent
form.
`t.success(source)` and `z.success(source)` validate `source` and return a
decoder whose successful output is `true`, which helps migration code that
expects a parse-capable success marker rather than the original value.
Transform mappers receive a Zod-style context as their second argument.
`context.issues.push({ message, path, ...extra })` or
`context.addIssue({ message, path })` makes the decoder fail, and returning
`z.NEVER` aborts the mapper without widening the inferred output type.
`t.coerce.string()`, `t.coerce.number()`, `t.coerce.bigint()`, and
`t.coerce.date()` expose Zod-style fluent checks after coercion, so migration
code can write `t.coerce.number().int().gte(0)`,
`t.coerce.string().trim().min(1)`, or `t.coerce.date().min(start)` without a
separate `pipe()` call. `t.coerce.boolean()` follows JavaScript truthiness
semantics like Zod's `Boolean(value)` coercion. For Zod parity, `coerce`
decoders use JavaScript constructor coercion for objects too, which can execute
caller-owned `valueOf`, `toString`, or `Symbol.toPrimitive` hooks. Use ordinary
guards or explicit codecs at hostile-input boundaries when those hooks must not
run.
Built-in codec builders live under `t.codecs`: `stringToNumber`,
`stringToInt`, `stringToBigInt`, `numberToBigInt`, `stringToDate`,
`isoDatetimeToDate`, `epochSecondsToDate`, `epochMillisToDate`,
`utf8ToBytes`, `bytesToUtf8`, `base64ToBytes`, `base64urlToBytes`,
`hexToBytes`, `jsonCodec`, `stringToURL`, and `stringToHttpURL`.

Decoder and codec children can be placed directly inside object, array, tuple,
record, map, and set containers. If the container includes a one-way decoder,
the builder returns a decoder. If every transformed child is bidirectional, the
builder returns a codec that can encode the value back across the same boundary.

```ts
const Event = t.strictObject({
  name: t.string.min(1),
  at: t.stringToDate(),
  active: t.stringbool()
});

const decoded = Event.decode({
  name: "launch",
  at: "2026-07-06T00:00:00.000Z",
  active: "true"
});

const encoded = Event.encode({
  name: "launch",
  at: new Date("2026-07-06T00:00:00.000Z"),
  active: false
});

const Dates = t.array(t.stringToDate());
const decodedDates = Dates.decode(["2026-07-06T00:00:00.000Z"]);

const DateRecord = t.record(t.stringToDate());
const decodedRecord = DateRecord.decode({
  created: "2026-07-06T00:00:00.000Z"
});
```

### Execution & Export

| Area | Entry points |
| --- | --- |
| Guard methods | `guard.is()`, `guard.check()`, `guard.checkFirst()`, `guard.parse()`, `guard.safeParse()`, `guard.parseAsync()`, `guard.safeParseAsync()`, `guard.spa()`, `guard.isOptional()`, `guard.isNullable()`, `guard.description`, `guard.def`, `guard._def`, `guard._zod`, `guard.clone()`, `guard.with()`, `guard.graph()`, `guard.toJSONSchema()` |
| Parse helpers | root / `t` / `z` / `typesea/mini` / `typesea/zod`: `parse`, `safeParse`, `parseAsync`, `safeParseAsync`, `spa` |
| Generated validators | `compile`, `emitAotModule` |
| JSON Schema | `toJsonSchema`, `toJSONSchema`, `schemaRegistryToJsonSchema`, `guard.toJSONSchema`, `fromJsonSchema`, `fromJSONSchema`, `target`, `unrepresentable`, `cycles`, `uri`, `reused`, `metadata`, `override` options |
| Standard Schema | `guard["~standard"]`, `decoder["~standard"]`, `StandardSchemaV1`, `StandardSchemaV1InferInput`, `StandardSchemaV1InferOutput` |
| Messages | `formatIssue`, `formatIssues`, `formatError`, `prettifyError`, `treeifyError`, `treeifyIssues`, `flattenError`, `flattenIssues`, `toZodIssue`, `toZodIssues`, `toZodError`, `withMessages` |
| Analysis | `analyzeSchema` |
| Registries | `registry`, `globalRegistry`, `SchemaRegistry`, `SchemaRegistry.entries()`, `SchemaRegistry.clear()`, `isSchemaRegistryValue` |

### Key Rules And Annotations

```ts
const Contact = t.object({
  email: t.optional(t.string.email()),
  phone: t.optional(t.string.min(1))
})
  .oneOfKeys(["email", "phone"])
  .title("Contact")
  .describe("Exactly one reachable contact endpoint")
  .message("contact must include exactly one endpoint");

const report = analyzeSchema(Contact);
```

`oneOfKeys()` is an alias for `exactlyOneKey()`. Key-rule validators count
selected own data properties, so accessor-backed keys do not satisfy the rule in
safe mode. Metadata annotations flow into JSON Schema as `title`,
`description`, and `examples`; `message()` attaches a local issue message
without changing boolean validation.

`object.shape` exposes a frozen guard map for the declared fields.
`ObjectGuard.keyof()` and `t.keyof(ObjectGuard)` produce a literal-union guard
for the declared object keys. Empty object shapes produce `never`.

Registries attach tool-owned metadata to schema identity without wrapping the
guard or changing validation semantics. String `id` metadata is unique per
registry; adding a different schema with the same id throws immediately.
`SchemaRegistry.clear()` removes every live entry.

Every guard, decoder, and codec exposes a Standard Schema V1 `~standard`
property with `vendor: "typesea"`, `version: 1`, and `validate(value)`. Use it
when framework tooling accepts Standard Schema contracts instead of
TypeSea-specific adapters.

Function contracts validate call boundaries without becoming IR schema nodes.
Use them where Zod users would reach for `z.function()`:

```ts
const NameLength = t.function({
  input: [t.string.trim().pipe(t.string.min(1))],
  output: t.number.int().nonnegative()
});

const lengthOfName = NameLength.implement((name) => name.length);

lengthOfName(" Ada "); // 3
```

Codebases migrating older Zod function wrappers can keep the chain syntax:

```ts
const LegacyNameLength = z.function()
  .args(t.string.trim().pipe(t.string.min(1)))
  .returns(t.number.int().nonnegative());

const legacyLengthOfName = LegacyNameLength.implement((name) => name.length);

LegacyNameLength.parameters(); // readonly argument source tuple
LegacyNameLength.returnType(); // output source
```

Arguments are decoded before the implementation runs. If an `output` source is
present, the return value is decoded before being returned. Boundary failures
throw `TypeSeaAssertionError` with issue paths under the argument index or
`"return"`.

```ts
const Docs = t.registry<{ title: string; order: number }>();

User.register(Docs, { title: "User", order: 1 });
t.globalRegistry.add(User, {
  id: "User",
  title: "User",
  description: "Application user payload"
});

const DocsJson = toJSONSchema(t.globalRegistry, {
  uri: (id) => `https://schemas.example/${id}.json`
});
```

### Messages & Adapters

| Area | Entry points |
| --- | --- |
| Messages / i18n | `formatIssue`, `formatIssues`, `formatError`, `prettifyError`, `treeifyError`, `treeifyIssues`, `flattenError`, `flattenIssues`, `toZodIssue`, `toZodIssues`, `toZodError`, `withMessages`, `defineMessages`, `config`, `locales`, `setErrorMap`, `getErrorMap`, `resetErrorMap` |
| tRPC | `toTrpcParser`, `toAsyncTrpcParser` |
| Fastify | `toFastifyRouteSchema`, `toFastifyValidatorCompiler` |
| React Hook Form | `toReactHookFormResolver` |

`parse`, `safeParse`, `parseAsync`, `safeParseAsync`, `spa`, `check`,
`checkFirst`, and `assert` accept Zod-style `{ error }` options for
call-specific diagnostic messages. The option runs only after validation fails,
so `is()` and successful hot paths keep message allocation out of the loop.
`setErrorMap(mapper)`, `getErrorMap()`, and `resetErrorMap()` provide the
Zod-style process-wide fallback mapper; a per-call `{ error }` option always
overrides the global mapper.
`config({ customError })`, `config({ localeError })`, and
`config(locales.ko())` mirror Zod 4's global configuration shape on top of that
same mapper slot. The `z` namespace exposes the same helpers as
`z.config(...)` and `z.locales.en()/ko()`.
`reportInput: true` can be passed to parse-like APIs when a migration needs
Zod-style issue `input` fields. TypeSea keeps this opt-in: by default it does
not publish user input in diagnostics, and when enabled it follows only own
data-property paths so getter-backed hostile inputs are not executed.
The `z` migration namespace mirrors these helpers too, so Zod-oriented code can
call `z.treeifyError`, `z.flattenError`, `z.prettifyError`, `z.formatError`,
`z.toZodError`, `z.withMessages`, `z.defineMessages`, `z.config`,
`z.locales`, and `z.ZodIssueCode` without changing import style.
`spa()` is an alias for `safeParseAsync()`. `isOptional()` and `isNullable()`
probe the schema by checking whether `undefined` or `null` is accepted.

Primitive builders can carry a base type message with the Zod-style callable
form, such as `t.string({ error })` or `t.number("message")`. That message is
used only when the value has the wrong primitive type. Built-in checks can also
carry static messages at declaration time. String length checks, string
formats, regex checks, number and bigint formats/bounds, Date bounds, array lengths,
set sizes, and File size/MIME checks accept either a string shorthand or
`{ error }` / `{ message }`. The message is stored in the schema, survives
interpreted, compiled, and AOT paths, and is copied only when that exact check
emits an issue.

```ts
const User = t.object({
  name: t.string({ error: "name must be text" }).min(1, "name is required"),
  age: t.number("age must be numeric").int("age must be an integer").gte(0, {
    error: "age must be non-negative"
  }),
  email: t.string.email({ error: "email is invalid" }),
  tags: t.array(t.string).nonempty({ message: "add at least one tag" }),
  uploaded: t.file().mime("text/plain", "plain text only")
});
```

Use check-level messages for stable contract text and `message()` for a wrapper
default. Use per-call `{ error }` for locale- or request-specific rendering of
issues that do not already carry schema-level text.

`toZodIssues(errorOrIssues, options)` and `toZodError(errorOrIssues, options)`
project TypeSea diagnostics into Zod v4-style issue objects. Each projected
issue keeps the original TypeSea code as `typeseaCode`, while `TypeSeaZodError`
exposes `name: "ZodError"`, a frozen `issues` array, and Zod-style
`flatten()` / `format()` instance methods for migration adapters.
When TypeSea can derive them without reading hostile input again, projected
issues also carry Zod-style detail fields such as `minimum`, `maximum`,
`inclusive`, `exact`, `origin`, `divisor`, and `format`. The same fields are
visible inside `config({ customError })` callbacks.
Native `TypeSeaAssertionError` values returned by `safeParse()` expose the same
`flatten()` / `format()` methods, so migration code can format parse failures
without first converting them to `TypeSeaZodError`.
`ZodIssueCode` is exported as both a type and a frozen value object for code
that imports constants such as `ZodIssueCode.invalid_type`.

Adapters accept compiled guards too. Compile once at startup, then pass the
compiled guard into parser or validator-compiler adapters so framework hot paths
reuse the generated predicate.

```ts
const FastUser = compile(User);
const trpcParser = toTrpcParser(FastUser);
const fastifyCompiler = toFastifyValidatorCompiler(FastUser);

// Trusted normalized data only: trades hostile-input hardening for direct reads.
const UnsafeUser = compile(User, { mode: "unsafe" });
const internalParser = toTrpcParser(UnsafeUser);
```

> [!TIP]
> Match the inference alias to the source kind: `Infer<>` for guards,
> `InferDecoder<>` for decoders, `InferAsyncDecoder<>` for async decoders.
> `Input<>` and `Output<>` provide Zod-style aliases for guard, decoder, and
> codec boundaries.
> Applying `Infer<>` to a decoder resolves to `never` — if a downstream type
> suddenly collapses, this is the first thing to check.

---

## Edge Semantics

Deliberate, documented, and pinned by tests:

| Input | Behavior |
| --- | --- |
| `NaN`, `Infinity` | rejected by `t.number` (finite numbers only); `t.nan()` and `t.literal(NaN)` match `NaN` |
| BigInt bounds | `t.bigint` accepts only JavaScript `bigint` values; bound checks use `bigint` arguments and never coerce numbers |
| `-0` vs `0` | literals match via `Object.is`; diagnostics format `-0` distinctly |
| Getter-backed properties | never executed; treated as missing/invalid data |
| `__proto__`, `constructor` keys | validated as plain own keys, no pollution |
| Sparse array holes | read as `undefined` without executing accessors |
| Strict object extras | rejected via `Reflect.ownKeys` — including symbol keys and non-enumerable properties |
| `catchall` extras | unknown own keys are descriptor-read and validated by the catchall schema |
| `strip()` | `is()` accepts extras; parse-like success outputs project to declared own data fields without mutating input |
| `readonly()` | `is()` stays side-effect free; parse-like APIs freeze accepted object-like values after full validation succeeds |
| `unwrap()` | optional, undefinedable, nullable, and array schemas expose their payload guard; non-wrapper schemas throw `TypeError` |
| `nonoptional()` | removes optional/undefined acceptance while preserving nullable values |
| `t.date` | accepts valid JavaScript `Date` objects; `.min` and `.max` compare epoch milliseconds without reading user-overridable Date methods |
| `t.map`, `t.set`, `t.instanceOf` | runtime-only contracts; JSON Schema and AOT export reject them instead of weakening semantics |
| `t.file` | validates JavaScript `File` objects; JSON Schema export emits OpenAPI-style binary string annotations |
| `property` | validates own data properties only; getter-backed properties are rejected |
| Global-flag regexes | cloned at construction; `lastIndex` reset before every test |
| UUID | accepts RFC 9562 versions 1–8 plus the nil UUID |
| Cyclic input values | validate finitely via (value × schema) active-pair tracking |
| Nesting depth | capped at 256 recursive frames; deeper input fails instead of overflowing the stack |

---

## Best Practices & Pitfalls

> [!WARNING]
> **Recursive guards need an explicit type annotation.** TypeScript cannot
> infer a self-referential initializer (TS7022). Use `t.lazy` for general
> recursion, or a Zod-style object getter when one object field points back:
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
>
> interface Category {
>   readonly name: string;
>   readonly subcategories: Category[];
>   readonly parent?: Category;
> }
>
> const Category: Guard<Category> = t.object({
>   name: t.string,
>   get subcategories(): Guard<Category[]> {
>     return t.array(Category);
>   },
>   get parent(): Guard<Category, "optional"> {
>     return t.optional(Category);
>   }
> });
> ```

- **Boundary data enters as `unknown`.** Do not pre-narrow with `as` — the
  builder API is typed so that narrowing happens through validation.
- **Recursive contracts go through `t.lazy` or object shape getters.** Shape
  getters are schema-definition thunks; TypeSea still rejects getter-backed
  properties on runtime input in safe mode.
- **Choose the engine by schema lifetime.** One-off schemas: runtime plan.
  Stable hot schemas: `compile()`. CSP environments or build-time generation:
  `emitAotModule()`.
- **Shape object unions by required keys.** `t.union(t.object({ and: ... }),
  t.object({ or: ... }), t.object({ path: ... }))` lowers to presence dispatch
  and skips impossible branches. Do not model an optional operator bag as many
  near-identical union branches; use one object and `superRefine` for "at least
  one operator exists".
- **Decoder-aware containers are decode surfaces.** An object, array, tuple,
  record, map, or set that contains a decoder returns a decoder or codec instead
  of a guard. Apply guard-specific methods such as `pick`, `extend`, `keyof`,
  `min`, or `max` before adding child decoders.

---

## Verification

Every gate that CI runs is a local npm script:

```sh
npm run check           # policy, docs, typecheck, lint, tests, build, dist, API snapshot, pack
npm run check:consumer  # tarball install + runtime/type smoke in a temp project
npm run bench:compare   # compare committed benchmark JSON against release floors
npm run bench:record    # full benchmark run + committed JSON/SVG refresh
npm run bench:render    # regenerate SVG from committed benchmark JSON
npm run bench -- --run  # benchmark smoke
npm run pack:dry        # package contents dry run
npm run release:check   # the full pre-publish gate (everything above)
npm run release:publish # npm publish with provenance and ignored lifecycle scripts
```

`npm run release:check` runs the same gate expected before publishing:
typecheck, lint, tests, build, docs smoke, dist policy, public API snapshot,
package contents, consumer install, benchmark smoke, and pack dry run.
CI executes it on Node 20.19, 22, and 24; releases publish with npm provenance.

Release path:

1. Push a `vX.Y.Z` tag or run the GitHub `Release` workflow with that tag.
2. The release workflow verifies that the tag matches `package.json`.
3. The same release workflow runs `npm run release:check`, then `npm run release:publish`, which expands to `npm publish --provenance --access public --ignore-scripts`.
4. The workflow verifies npm registry visibility and then creates the GitHub Release.

Local publishing with `NPM_TOKEN` is reserved for manual recovery releases. It
must still run `npm run release:check` first, and it cannot attach GitHub OIDC
provenance.

> [!NOTE]
> Benchmark comparison packages (Zod, Valibot, Ajv) are dev dependencies only —
> package policy rejects them from every runtime dependency field. The
> benchmark suite reports both boolean-path and diagnostic-path
> (`check()` vs `safeParse`) comparisons, so numbers stay apples-to-apples.
> `check:benchmarks` also verifies the committed summary against release floors
> for unchecked valid, safe invalid, safe valid, and presence-dispatch union
> paths.

---

## Documentation

- [Documentation site](https://feralthedogg.github.io/TypeSea/)
- [API reference](https://feralthedogg.github.io/TypeSea/api/)
- [SeaFlow fuzzer guide](https://feralthedogg.github.io/TypeSea/seaflow/)
- [SeaBreeze arena inference](https://feralthedogg.github.io/TypeSea/seabreeze/)
- [Engine notes](https://feralthedogg.github.io/TypeSea/engine/)
- [Security policy](https://github.com/Feralthedogg/TypeSea/blob/main/SECURITY.md)

---

## Migration Notes

### 1.1.0 to 1.1.1

Existing schemas and SeaBreeze callers keep working. `1.1.1` is a patch
release focused on release-gate stability, benchmark metadata freshness,
package export checks, and published `typesea/seabreeze` consumer-smoke
coverage. It does not change the public validator API.

### 1.0.0 to 1.1.0

Existing schemas keep working. `1.1.0` adds SeaBreeze through the dedicated
`typesea/seabreeze` subpath. SeaBreeze is an advanced arena-backed inference
surface for compiler-style tooling: use it when you want to infer a validator
shape from numeric arena nodes, lower it to TypeSea schema or graph IR, or emit
predicate-only source directly from a typed-array reader.

SeaBreeze is not re-exported from `typesea`, so root validator imports keep zero
SeaBreeze import and bundle cost.

### 0.4.0 to 1.0.0

Existing schemas keep working. `1.0.0` marks the current public surface as a
stable baseline and adds SeaFlow through `typesea/seaflow`. SeaFlow is a
dev/test-only symbolic fuzzer: import it when you want schema-directed valid,
invalid, and hostile payloads, and leave it out of production validator bundles.

`t.promise(inner)` now follows Zod's promise-like semantics more closely:
`decodeAsync(value)` awaits the input and then validates the resolved value with
`inner`. Use an explicit custom async decoder if you need to reject non-Promise
inputs before resolution.

### 0.3.2 to 0.4.0

Existing schemas keep working. `0.4.0` adds public APIs such as `superRefine`,
`compileCached`, `createCompileCache`, `warmup`, `compileBoolean`, cooperative
async validation, zero-dependency Vite/Rollup/esbuild AOT plugin helpers, and
Zod migration facades. Compiled object unions are also faster when branches
have required keys, such as AST or query objects shaped by `and`, `or`, `not`,
or `path` fields.

### 0.3.1 to 0.3.2

No application code changes are required. `0.3.2` is a performance-regression
hardening patch: it adds benchmark floors, pins representative generated source
fingerprints, strengthens FastMode fuzz parity, and normalizes unions by
flattening nested unions, removing `never`, and absorbing `unknown`.

### 0.3.0 to 0.3.1

No application code changes are required. `0.3.1` is a release-hardening patch:
it tightens manual release tag handling, documents npm provenance expectations,
adds a security policy, and verifies that npm exposes the published version after
the GitHub publish workflow completes.

---

## License

MIT License. See [LICENSE](./LICENSE).
