# SeaBreeze Principal Join

SeaBreeze is published as `typesea/seabreeze`. It is deliberately not re-exported
from the root entry point, so ordinary validator users do not pay import or
bundle cost for arena-backed inference.

SeaBreeze is a low-level TypeSea inference algorithm that combines two ideas:

- Hindley-Milner style variables and union-find representatives.
- Best-common-type recovery when concrete constructors cannot be unified.

The result is not a general-purpose TypeScript type checker. It is a validation
type solver for TypeSea's runtime domain. Its job is to compute the smallest
useful validator shape for multiple candidates without allocating one JavaScript
object per intermediate type.

## Core Rule

`principalJoin(a, b)` returns a node id in a fixed arena.

```txt
Var(x) join T          -> bind x to T
Never join T           -> T
Unknown join T         -> Unknown
Number join Number     -> Number
Array<A> join Array<B> -> Array<principalJoin(A, B)>
Object<A> join Object<B>
    -> object whose common keys are required,
       drift keys are optional,
       and shared field types are joined recursively
T join U               -> Union<T, U>
```

Hindley-Milner alone would fail at `number` vs `string`. TypeSea cannot stop
there because validator inference often needs a useful supertype. Best common
type alone would widen too early. SeaBreeze tries HM binding first, keeps exact
constructors exact, and only emits a union when the validation lattice actually
requires it.

## Object Join

Object fields are stored sorted by caller-owned numeric key ids. The join is a
linear two-pointer merge:

```txt
{ a: number, b: string }
join
{ a: string, c: boolean }

=
{ a: number | string, b?: string, c?: boolean }
```

This is a better TypeSea common type than `unknown` and a more precise runtime
contract than a raw union of the two object shapes.

## Allocation Discipline

The implementation lives in `src/seabreeze/sea-breeze.ts`.

- Nodes are dense ids.
- Parent, rank, kind, child, and field tables are typed arrays.
- Hot operations return numbers, not wrapper objects.
- Capacity is caller-owned and checked explicitly.
- Field keys are already interned by the caller.
- Materialization is intentionally outside the core solver.

The solver still lives in JavaScript, so object reflection around it can
allocate. The algorithm core is the part designed for TypeSea's zero-cost
abstraction style.

## Complexity

For sorted object shapes:

- Scalar join: `O(alpha(n))` through union-find.
- Array join: recursive element join.
- Object join: `O(leftFieldCount + rightFieldCount)`.
- Field storage: one fixed arena slot per emitted output field.

The important property is that common object inference does not need a `Map` per
join and does not allocate transient field records.

## Public Surface

Import it from the dedicated subpath:

```ts
import {
  createSeaBreeze,
  SeaBreezeArena,
  SeaBreezePresence,
  emitSeaBreezeBooleanSourceBundle,
  seaBreezeReader
} from "typesea/seabreeze";
```

For normal code, prefer the builder API:

```ts
const s = createSeaBreeze({ maxNodes: 64, maxFields: 16 });

const User = s.object({
  id: s.string(),
  age: s.optional(s.number()),
  tags: s.array(s.string())
});

const FastUser = s.compile(User, {
  objectMode: "strict",
  mode: "safe",
  name: "isUser"
});
```

The builder is deliberately thin. Primitive methods return canonical numeric
node ids, `object()` interns keys and appends sorted arena fields, and
`compile()` calls the direct reader emitter. Once `FastUser.is()` runs, no
builder object participates in validation.

The subpath also exports the arena, typed reader, snapshot helpers, schema
lowering, graph lowering, and direct predicate source emitter. It does not add
exports to `typesea`, which keeps the root validator API zero-cost with respect
to SeaBreeze.

Current tests cover:

- HM variable binding.
- Scalar conflict fallback to union.
- Optimal object common-shape join.
- Array element variable propagation.
- Fixed-capacity failure behavior.
- Schema lowering into the existing TypeSea JIT path.
- Direct graph lowering and predicate source emission from a lowered graph.
- Direct reader-to-source emission without materializing `Schema`, `Graph`, or
  `GraphNode` objects.

## Bridge To JIT

`src/seabreeze/lower-schema.ts` implements the compatibility bridge:

```txt
SeaBreeze arena node
-> lowerSeaBreezeToSchema()
-> BaseGuard(schema)
-> compileBoolean() / compile()
-> existing Sea-of-Nodes lower/optimize/JIT emitter
```

This intentionally materializes a TypeSea `Schema` before JIT emission. That
keeps diagnostics, AOT, optimizer parity, and existing hostile-input modes on
the normal TypeSea path.

The lowering accepts a caller-owned key table:

```ts
const schema = lowerSeaBreezeToSchema(arena, root, {
  keyTable: ["", "id", "name", "flag"],
  objectMode: "strict"
});
```

Field key ids stay numeric inside the arena. The key table is copied and
validated at the bridge boundary so later caller mutation cannot change the
schema meaning.

Lowering policy:

- `objectMode`: `"strict" | "passthrough" | "strip"`, default `"strict"`.
- `unboundVar`: `"unknown" | "error"`, default `"unknown"`.
- `cycle`: `"unknown" | "error"`, default `"error"`.
- `unionMode`: `"flatten" | "binary"`, default `"flatten"`.

`src/seabreeze/lower-graph.ts` implements the direct predicate bridge:

```txt
SeaBreeze arena node
-> lowerSeaBreezeToGraph()
-> optimizeGraph()
-> emitCompiledGraphBooleanSourceBundle()
-> V8 predicate function
```

This skips root `Schema` materialization for the predicate graph while still
using schema payloads where TypeSea's existing object, array, and union nodes
need them for parity with diagnostics and hostile-input modes.

`src/seabreeze/emit.ts` implements the direct reader emitter:

```txt
SeaBreezeReader
-> emitSeaBreezeBooleanSourceBundle()
-> V8 predicate function
```

This path reads arena metadata through `SeaBreezeReader` and emits predicate
source directly. It still reuses TypeSea's side-table ABI, function naming, debug
source formatter, and helper prelude, but it does not allocate intermediate
`Schema`, `Graph`, `GraphBuilder`, or `GraphNode` records.

The direct emitter preserves the same safety tier semantics as the normal JIT
emitter:

- `safe`: own data descriptors only; accessors and prototype reads fail closed.
- `unsafe`: direct property reads for V8 hot paths; hostile-input defenses are
  intentionally reduced.
- `unchecked`: unsafe reads plus skipped strict excess-key checks.
