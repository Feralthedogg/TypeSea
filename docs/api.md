# TypeSea API Reference

TypeSea accepts untrusted input as `unknown` and narrows it through immutable
guard values. The public API is small by design; most complexity lives behind
builder validation, graph introspection, diagnostics, and export checks.

## Import

```ts
import {
  analyzeSchema,
  compile,
  emitAotModule,
  schemaRegistryToJsonSchema,
  t,
  toJSONSchema,
  toJsonSchema,
  type GlobalRegistryMetadata,
  type Guard,
  type Infer
} from "typesea";
```

The package exposes the root entry point plus `typesea/mini`,
`typesea/seaflow`, `typesea/seabreeze`, `typesea/zod`, `typesea/v3`, `typesea/v4`,
`typesea/v4-mini`, `typesea/v4/mini`, `typesea/locales`,
`typesea/v4/locales`, `typesea/v4/locales/*`, and `typesea/v4/core`. Deep `dist/*` imports are
intentionally not part of the public API. TypeSea is ESM-only and does not
publish a CommonJS condition. Zod migration code can import the compatibility
builder namespace as `z`; it keeps TypeSea builders while supporting nullary
calls such as `z.null()` and `z.undefined()`. Namespace imports expose
lower-case `infer`, `input`, and `output` type aliases.

```ts
import { z } from "typesea";
import * as typesea from "typesea";

const User = z.object({ id: z.string.uuid() });
type User = typesea.infer<typeof User>;
type UserInput = typesea.input<typeof User>;
type UserOutput = typesea.output<typeof User>;
type SameUser = typesea.TypeOf<typeof User>;
```

For migration files that currently use `import * as z from "zod"`, import the
facade subpath instead:

```ts
import * as z from "typesea/zod";

const User = z.strictObject({
  id: z.string().uuid(),
  status: z.union([z.literal("active"), z.literal("disabled")])
});

type User = z.infer<typeof User>;
```

`typesea/zod` exposes the compatibility namespace as top-level module exports:
primitive constructors such as `z.string()` and `z.unknown()`, tuple-style
`z.union([a, b])`, `z.nativeEnum`, `z.intersection`, `z.instanceof`,
`z.keyof(object)`, `z.catch(schema, fallback)`, and
`z.exactOptional(schema)`. The same facade is also the default export for
`import z from "typesea/zod"` migration code. The facade has no runtime Zod
dependency; Zod itself is used only as a development parity oracle in TypeSea's
test suite.
For 1.x, TypeSea owns these subpath names as stable migration facades, but they
remain best-effort compatibility layers over TypeSea's guard engine rather than
a promise to clone Zod's internal parser engine or every future upstream
feature. Missing Zod APIs should be treated as compatibility gaps, not as part
of TypeSea's core validation contract.

The [pinned real-world corpus](./zod-real-world-compat.md) scans 1,875 Zod files
and 28,758 calls across nine repositories. Its 224 self-contained replacement
candidates currently compile with zero TypeSea-only diagnostics and zero missing
observed declaration exports. This is source-compatibility evidence for the
pinned commits, not a full semantic-equivalence claim.

### Zod Compatibility Matrix

The canonical support levels and migration policy live in the
[Zod compatibility guide](./zod-compatibility.md). The summary below is kept
next to the API surface for quick reference.

The facade is useful when existing code already thinks in Zod-shaped builders.
The table below describes the practical support boundary. "Compiled" means the
schema lowers into TypeSea's generated validator path when no runtime callback
or lossy export blocker is present.

| Surface | Status | Notes |
| --- | --- | --- |
| `z.string()`, `z.number()`, `z.boolean()`, `z.bigint()`, `z.symbol()`, `z.date()` | Supported and compiled | Primitive guards are TypeSea guards with Zod-style constructors and aliases. |
| String, number, bigint, date, array, set, map, and file checks | Supported and compiled | Built-in checks such as `.min()`, `.max()`, `.email()`, `.uuid()`, `.int()`, `.gte()`, `.nonempty()`, and `.mime()` stay in the normal validator pipeline. |
| `z.object()`, `.strict()`, `.loose()`, `.passthrough()`, `.strip()`, `.extend()`, `.pick()`, `.omit()`, `.partial()`, `.required()` | Supported and compiled | `z.object()` follows Zod v4 strip-by-default output semantics. Object decoders retain shape operations after transforms, metadata, and refinements. Safe strict objects reject undeclared own string, symbol, and non-enumerable keys without reading through prototypes. |
| `z.array()`, `z.tuple()`, tuple rest, `z.record()`, `z.map()`, `z.set()`, `z.enum()`, `z.literal()` | Supported and compiled | Container schemas keep TypeSea's own presence, tuple, and key semantics. |
| `z.union()`, `z.discriminatedUnion()`, `z.intersection()` | Supported and compiled | Guard and decoder branches can be mixed while preserving input/output inference. Object-union preflight is optimized when branches expose required keys or discriminators. Wide overlapping unions may still need branch probing. |
| `z.default()`, `z.prefault()`, `z.catch()`, `z.pipe()`, `z.codec()`, `z.coerce.*`, transforms, and overwrites | Supported as decoder/codec pipelines | Use parse/decode APIs for output-changing behavior. These paths may block JSON Schema export or standalone AOT when semantics would be lost. |
| `z.refine()`, `z.superRefine()`, `z.custom()`, `z.lazy()`, `z.function()`, `z.instanceof()` | Runtime-supported, not always exportable | Callback or identity-sensitive contracts can validate at runtime, but they are intentionally treated as AOT/JSON Schema blockers unless TypeSea can preserve the behavior. |
| `typesea/v4/core`, underscore-prefixed metadata, class aliases, and v3 shims | Migration/probe shims | These keep common package-alias probes and type references alive. They are not a promise to clone Zod's private parser engine. |
| Future or missing upstream Zod APIs | Compatibility gap | Treat missing methods as migration issues to report, not as TypeSea core contract guarantees. |

It also exposes TypeSea's functional helper versions of common top-level Zod
checks and transforms, including `z.minLength(2)(z.string())`,
`z.trim()(z.string())`, `z.positive()(z.number())`, `z.mime("text/plain")`,
and `z.overwrite(mapper)(schema)`. The same helpers can be passed to
`schema.check(...)` for Zod-style check-object code:
`z.string().check(z.minLength(2))` and `z.string().check(z.trim())`.
Plain guards also expose Zod-style instance decode/encode aliases:
`schema.decode(value)`, `schema.safeDecode(value)`, `schema.encode(value)`,
and `schema.safeEncode(value)`.

For package-alias migrations that keep Zod 4 subpaths, TypeSea also exposes
matching entry points:

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

Legacy code that imports `zod/v3` can resolve `typesea/v3`. The subpath exposes
the v3 named export set as a compatibility facade over TypeSea's current guard
engine; v3 parser internals such as `ParseStatus` are lightweight shims for
migration probes.

For bundle-sensitive code, `typesea/mini` exposes functional builders without
the broad root `t`/`z` compatibility barrel:

```ts
import * as mini from "typesea/mini";

const MiniUser = mini.object({
  id: mini.string().uuid(),
  nickname: mini.optional(
    mini.apply(mini.string(), mini.minLength(1), mini.maxLength(80))
  )
});

type MiniUser = mini.Infer<typeof MiniUser>;
```

Mini helpers are curried schema transforms, so they can be composed without
method chains:

```ts
const Tags = mini.apply(
  mini.array(mini.string()),
  mini.minSize(1),
  mini.maxSize(8)
);

const TrimmedName = mini.apply(
  mini.string(),
  mini.minLength(1),
  mini.trim()
);
```

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

## Guard Contract

```ts
interface Guard<T> {
  readonly def: ZodDef;
  readonly _def: ZodDef;
  readonly _zod: {
    readonly def: ZodDef;
    readonly traits: ReadonlySet<string>;
    readonly version: { readonly major: number; readonly minor: number; readonly patch: number };
  };
  readonly description: string | undefined;
  readonly type: string;
  readonly keyType: unknown;
  readonly valueType: unknown;
  is(value: unknown): value is T;
  check(value: unknown, options?: Partial<ParseOptions>): CheckResult<T>;
  checkFirst(value: unknown, options?: Partial<ParseOptions>): CheckResult<T>;
  parse(value: unknown, options?: Partial<ParseOptions>): T;
  safeParse(value: unknown, options?: Partial<ParseOptions>): SafeParseResult<T>;
  decode(value: unknown, options?: Partial<ParseOptions>): T;
  safeDecode(value: unknown, options?: Partial<ParseOptions>): SafeParseResult<T>;
  encode(value: unknown, options?: Partial<ParseOptions>): T;
  safeEncode(value: unknown, options?: Partial<ParseOptions>): SafeParseResult<T>;
  parseAsync(value: unknown, options?: Partial<ParseOptions>): Promise<T>;
  safeParseAsync(value: unknown, options?: Partial<ParseOptions>): Promise<SafeParseResult<T>>;
  decodeAsync(value: unknown, options?: Partial<ParseOptions>): Promise<T>;
  safeDecodeAsync(value: unknown, options?: Partial<ParseOptions>): Promise<SafeParseResult<T>>;
  encodeAsync(value: unknown, options?: Partial<ParseOptions>): Promise<T>;
  safeEncodeAsync(value: unknown, options?: Partial<ParseOptions>): Promise<SafeParseResult<T>>;
  spa(value: unknown, options?: Partial<ParseOptions>): Promise<SafeParseResult<T>>;
  isOptional(): boolean;
  isNullable(): boolean;
  assert(value: unknown, options?: Partial<ParseOptions>): asserts value is T;
  graph(): Graph;
  toJSONSchema(options?: Partial<JsonSchemaOptions>): Result<JsonSchema, JsonSchemaExportIssue[]>;
  metadata(value: SchemaMetadataInput): Guard<T>;
  meta(value: SchemaMetadataInput): Guard<T>;
  title(value: string): Guard<T>;
  describe(value: string): Guard<T>;
  example(value: unknown): Guard<T>;
  message(value: string): Guard<T>;
  readonly(): Guard<Readonly<T>>;
  unwrap(): Guard<unknown>;
  nonoptional(): Guard<Exclude<T, undefined>>;
  apply<R>(callback: (guard: this) => R): R;
  clone(): this;
  optional(): Guard<T | undefined>;
  exactOptional(): Guard<T | undefined>;
  undefinedable(): Guard<T | undefined>;
  nullable(): Guard<T | null>;
  nullish(): Guard<T | null | undefined>;
  overwrite<U>(mapper: (value: T) => U): Decoder<U>;
  refine(predicate: (value: T) => boolean, params?: string | RefineOptions): Guard<T>;
  superRefine(callback: (value: T, ctx: SuperRefineContext) => void, name?: string): Guard<T>;
  with(...checks: WithCheckInput<T>[]): Guard<T>;
  transform<U>(mapper: (value: T) => U): Decoder<U>;
  pipe(next: Guard<unknown> | Decoder<unknown>): Decoder<unknown>;
  default(value: T | (() => T)): Decoder<T>;
  prefault(value: unknown): Decoder<T>;
  catch(value: T | (() => T) | ((ctx: CatchContext) => T)): Decoder<T>;
  promise(): AsyncDecoder<T>;
}
```

```ts
interface ParseOptions {
  readonly error?: string | ParseErrorMapper;
  readonly reportInput?: boolean;
}
```

| Method | Use it for | Contract |
| --- | --- | --- |
| `is` | Hot boolean narrowing | Avoids diagnostic allocation on the success path. |
| `check` | Validation with issues | Returns frozen `Result<T, Issue[]>` containers. |
| `checkFirst` | Hot rejection diagnostics | Returns the same frozen `Result` shape, but failure contains at most one issue. Compiled and AOT guards use a dedicated first-fault collector. |
| `parse` / `safeParse` / `parseAsync` / `safeParseAsync` / `spa` | Zod-style parse surfaces | Throwing, tagged-result, and promise-returning parse variants. `spa` aliases `safeParseAsync`. |
| `isOptional` / `isNullable` | Schema capability probes | Return whether `undefined` or `null` passes normal validation. |
| `assert` | Throwing integration boundaries | Throws `TypeSeaAssertionError` with copied, frozen issues. |
| `graph` | Runtime plan introspection | Returns the validated, optimized, frozen Sea-of-Nodes graph held by the validation plan. |
| `toJSONSchema` | Zod-style JSON Schema export | Calls the lossless JSON Schema emitter and returns the same Result shape as `toJsonSchema()`. |
| `metadata` / `meta` / `title` / `describe` / `example` | Documentation annotations | Preserve validation semantics and flow into JSON Schema annotations where representable. |
| `description` | Documentation metadata probe | Returns the top-level description metadata, matching Zod's property surface. |
| `type` / `keyType` / `valueType` | Zod-style metadata probes | `type` returns the compact schema kind label. `keyType` and `valueType` expose child guards for record/map-like schemas when present. |
| `def` / `_def` / `_zod` | Zod-style migration metadata | Returns frozen facades with `typeName`, `type`, trait names, and container fields such as `shape`, `element`, `options`, `innerType`, `keyType`, or `valueType` when the schema can expose them without leaking mutable engine state. |
| `register` | External schema metadata | Stores metadata in a registry keyed by schema identity without changing validation. |
| `message` | Local diagnostic text | Copies a message onto issues emitted below the wrapper when those issues do not already have one. |
| `readonly` | Output freezing | Leaves `is()` semantics unchanged, then freezes accepted values returned by `check`, `checkFirst`, `parse`, `safeParse`, and `assert`. |
| `unwrap` | Wrapper introspection | Returns the payload guard for optional, undefinedable, nullable, or array schemas. Annotation wrappers are skipped; non-wrapper schemas throw `TypeError`. |
| `nonoptional` | Required-value normalization | Removes optional presence and explicit `undefined` acceptance while preserving nullable values. |
| `apply` | Fluent helper reuse | Calls a helper with this guard and returns the helper result unchanged. |
| `clone` | Zod-style copy surface | Returns an equivalent immutable guard while preserving the fluent surface. |
| `optional` / `exactOptional` / `undefinedable` / `nullable` / `nullish` | Zod-style presence and nullability wrappers | Build immutable presence/value wrappers. `exactOptional` permits object-key omission while rejecting explicit standalone or own-property `undefined` unless the inner schema accepts it. |
| `refine` / `superRefine` / `with` | Semantic validation | Attach callback or predicate checks after structural validation. |
| `overwrite` | Zod-style output rewrite | Returns a decoder alias for `transform()` because TypeSea keeps output-producing logic out of predicates. |
| `transform` / `pipe` | Output-producing decode pipelines | Return decoders. The source guard's `is()` semantics do not change. |
| `default` / `prefault` / `catch` | Zod-style decode recovery | Return decoders. Fallbacks are applied only by `decode()`, never by `is()`. |
| `promise` | Zod-style Promise input | Returns an async decoder that awaits native `Promise` inputs before validating the resolved value. |

Diagnostic paths contain only object keys and zero-based array or tuple indexes.
Public diagnostic validators reject malformed path segments before diagnostics
cross the API boundary.

Parse-like surfaces accept Zod-style per-call error customization:

```ts
const result = User.safeParse(input, {
  error: (issue) => issue.code === "expected_string"
    ? { message: `Expected text at ${issue.path.join(".")}` }
    : undefined
});
```

The `error` option may be a static string or a callback returning a string,
`{ message }`, or `undefined`. Schema-level and check-level messages have
Zod-style higher precedence than per-call and global error maps, so they are
kept even when `{ error }` is supplied. Returning `undefined` keeps the fallback
message for issues that do not already carry one. The option is applied only
after validation fails; `is()` and successful `check()` calls do not allocate
rendered messages.

Primitive builders can also be called with a base type message. For example,
`t.string({ error: "name must be text" })` changes the message only for the
`expected_string` issue; `.min()`, `.email()`, and other checks still use their
own messages. Check-level static messages are stored in the schema itself:

```ts
const User = t.object({
  name: t.string({ error: "name must be text" }).min(1, "name is required"),
  age: t.number("age must be numeric").int("age must be an integer").gte(0, {
    error: "age must be non-negative"
  }),
  email: t.string.email({ error: "email is invalid" }),
  tags: t.array(t.string).nonempty({ message: "add at least one tag" }),
  flags: t.set(t.string).nonempty("select at least one flag"),
  uploaded: t.file().mime("text/plain", "plain text only")
});
```

The supported check families are string length checks, string formats, custom
regex checks, number format/integer/bound checks, bigint format/bound checks,
Date bounds, array length checks, set size checks, and File size/MIME checks. A
static check message wins over outer `message()` wrappers because it belongs to
the exact issue that was emitted. Per-call and global error maps only render
issues that do not already carry schema-level text.

## Builder Families

| Family | Builders |
| --- | --- |
| Scalars | `t.unknown`, `t.never`, `t.string`, `t.number`, `t.int`, `t.int32`, `t.uint32`, `t.float32`, `t.float64`, `t.int64`, `t.uint64`, `t.nan`, `t.date`, `t.bigint`, `t.symbol`, `t.boolean`, `t.null`, `t.undefined`, `t.void` |
| String checks | `.min`, `.max`, `.length`, `.minLength`, `.maxLength`, `.nonempty`, `.regex`, `.startsWith`, `.endsWith`, `.includes`, `.uppercase`, `.lowercase`, `.uuid`, `.guid`, `.uuidv4`, `.uuidv6`, `.uuidv7`, `.hash`, `.email`, `.url`, `.httpUrl`, `.hostname`, `.e164`, `.emoji`, `.base64`, `.base64url`, `.hex`, `.jwt`, `.nanoid`, `.cuid`, `.cuid2`, `.xid`, `.ksuid`, `.mac`, `.cidrv4`, `.cidrv6`, `.isoDate`, `.isoDateTime`, `.isoTime`, `.isoDuration`, `.date`, `.datetime`, `.time`, `.duration`, `.ulid`, `.ipv4`, `.ipv6` |
| Top-level string formats | `t.email`, `t.uuid`, `t.guid`, `t.uuidv4`, `t.uuidv6`, `t.uuidv7`, `t.url`, `t.httpUrl`, `t.hostname`, `t.e164`, `t.emoji`, `t.base64`, `t.base64url`, `t.hex`, `t.jwt`, `t.nanoid`, `t.cuid`, `t.cuid2`, `t.xid`, `t.ksuid`, `t.ulid`, `t.ipv4`, `t.ipv6`, `t.mac`, `t.cidrv4`, `t.cidrv6`, `t.isoDate`, `t.isoDateTime`, `t.isoTime`, `t.isoDuration`, `t.iso.date`, `t.iso.datetime`, `t.iso.time`, `t.iso.duration`, `t.hash`, `t.stringFormat` |
| Regex presets | `regexes`, `t.regexes`, including `email`, `html5Email`, `rfc5322Email`, `unicodeEmail`, `domain`, `uuid`, `guid`, `e164`, `nanoid`, `cuid`, `cuid2`, `xid`, `ksuid`, `ulid`, `ipv4`, `ipv6`, `cidrv4`, `cidrv6`, `mac`, `base64`, `base64url`, `hex`, `jwt` |
| Number checks | `.int`, `.int32`, `.uint32`, `.float32`, `.float64`, `.finite`, `.isFinite`, `.isInt`, `.safe`, `.gte`, `.lte`, `.min`, `.max`, `.minValue`, `.maxValue`, `.gt`, `.lt`, `.multipleOf`, `.step`, `.positive`, `.nonnegative`, `.negative`, `.nonpositive` |
| BigInt checks | `.int64`, `.uint64`, `.gte`, `.lte`, `.min`, `.max`, `.gt`, `.lt`, `.multipleOf`, `.step`, `.positive`, `.nonnegative`, `.negative`, `.nonpositive` |
| Date checks | `.min`, `.max` |
| Literals and containers | `t.literal(value)`, `literal.value`, `t.literal([...]).values`, `t.enum(values)`, `enum.options`, `enum.enum`, `enum.extract`, `enum.exclude`, `t.templateLiteral(parts)`, `t.array(item)`, `array.element`, `t.tuple([a, b])`, `tuple.items`, `t.tuple([head], rest)`, `tuple.rest(rest)`, `t.record(value)`, `t.partialRecord(key, value)`, `t.looseRecord(key, value)`, `t.map(key, value)`, `t.set(item)`, `t.file()`, `t.json()` |
| Array checks | `.min`, `.max`, `.length`, `.nonempty` |
| Map checks | `.min`, `.max`, `.size`, `.nonempty` |
| Set checks | `.min`, `.max`, `.size`, `.nonempty` |
| File checks | `.min`, `.max`, `.mime` |
| Functional helpers | `typesea/mini` and `typesea/zod`: `minLength`, `maxLength`, `length`, `regex`, `startsWith`, `endsWith`, `includes`, `uppercase`, `lowercase`, `trim`, `toLowerCase`, `toUpperCase`, `normalize`, `slugify`, `minSize`, `maxSize`, `size`, `mime`, `gt`, `gte`, `lt`, `lte`, `multipleOf`, `positive`, `negative`, `nonpositive`, `nonnegative`, `overwrite`, `clone` |
| Objects | `t.object(shape)`, `t.looseObject(shape)`, `t.strictObject(shape)` |
| Object transforms | `object.shape`, `t.extend`, `t.safeExtend`, `t.merge`, `t.pick`, `t.omit`, `t.keyof`, `keyofObject`, `t.partial`, `t.partial(..., { key: true })`, `t.deepPartial`, `t.required`, `t.required(..., { key: true })`, `t.strict`, `t.loose`, `t.passthrough`, `t.nonstrict`, `t.nonpassthrough`, `t.strip`, `t.catchall`, `t.atLeastOneKey`, `t.exactlyOneKey`, `t.oneOfKeys`, and matching object guard methods |
| Runtime object contracts | `t.instanceOf(Ctor)`, `t.property(base, key, value)`, `guard.property(key, value)` |
| Function contracts | `t.function`, `z.function().args(...).returns(...)`, `functionBuilder`, `FunctionContract.parameters`, `FunctionContract.returnType`, `FunctionContract.implement`, `FunctionContract.implementAsync` |
| Composition | `t.union`, `union.options`, `t.xor`, `xor.options`, `t.discriminatedUnion`, `t.intersect`, `guard.intersect`, `guard.and` |
| Presence | `t.optional`, `guard.optional`, `t.exactOptional`, `z.exactOptional`, `guard.exactOptional`, `t.undefinedable`, `guard.undefinedable`, `t.nullable`, `guard.nullable`, `t.nullish`, `guard.nullish`, `guard.nonoptional`, `t.nonoptional` |
| Wrapper introspection | `guard.unwrap`, `t.unwrap`, `guard.apply` |
| Output wrappers | `guard.readonly`, `t.readonly` |
| Dynamic guards | `t.lazy`, `t.custom`, `t.check`, `t.property(key, value)`, `t.refine`, `guard.refine`, `t.superRefine`, `guard.superRefine`, `guard.with` |
| Annotations | `t.metadata`, `t.meta`, `t.title`, `t.describe`, `t.example`, `t.message`, `t.registry`, `t.globalRegistry`, and matching guard methods |
| Decoders | `guard.decode`, `guard.safeDecode`, `guard.encode`, `guard.safeEncode`, `guard.transform`, `guard.overwrite`, `guard.pipe`, `guard.default`, `guard.prefault`, `guard.catch`, `t.decoder`, `t.decode`, `t.safeDecode`, `t.encode`, `t.safeEncode`, `t.encodeAsync`, `t.safeEncodeAsync`, `t.transform`, `t.preprocess`, `t.pipe`, `t.default`, `t.defaultValue`, `t.prefault`, `t.catch`, `t.codec`, `t.invertCodec`, `t.codecs`, built-in codec helpers, `t.stringbool`, `t.coerce`, `t.string.trim()`, `t.string.toLowerCase()`, `t.string.toUpperCase()`, `t.string.slugify()`, `t.string.normalize()` |
| Async decoders | `t.asyncDecoder`, `t.decodeAsync`, `t.safeDecodeAsync`, `t.asyncRefine`, `t.asyncTransform`, `t.asyncPipe`, `t.promise` |
| Parse helpers | root / `t` / `z` / `typesea/mini` / `typesea/zod`: `parse`, `safeParse`, `parseAsync`, `safeParseAsync`, `spa` |

Tuple rest can be written either as a builder argument or as a Zod-style fluent
call:

```ts
const RowA = t.tuple([t.literal("row")], t.number.int());
const RowB = t.tuple([t.literal("row")]).rest(t.number.int());

type Row = Infer<typeof RowB>;
// readonly ["row", ...number[]]

RowB.items[0].is("row"); // true
```

Builder functions validate inputs before a schema can enter the validation plan,
compiler, AOT emitter, diagnostic collector, or JSON Schema exporter. Forged guard-like values,
invalid schema tags, invalid predicates, invalid bounds, malformed regexps, and
invalid discriminated union case sets are rejected during construction.

The `z` compatibility namespace exposes `z.nativeEnum` as an alias for `t.enum`,
`z.intersection` as an alias for `t.intersect`, `z.instanceof` as an alias for
`t.instanceOf`, and Zod-style tuple inputs for `z.union([a, b])` and
`z.xor([a, b])`. `z.discriminatedUnion("kind", [A, B])` accepts Zod-style case
arrays when each branch structurally requires a literal `kind`, including
string, number, boolean, null, or undefined literals.
Primitive constructor calls such as `z.string()` and `z.number()` are supported,
and `z.any()` is mapped to TypeSea's `unknown` semantics for migration safety.
Legacy optional shortcuts such as `z.ostring()` and `z.onumber()` are supported
for older Zod-style code.

Accepted schemas are frozen before storage. Public schema collection fields use
frozen arrays and frozen key lookup records instead of mutable collection
objects.

Top-level string format helpers mirror the matching string methods.
`t.iso.date()`, `t.iso.datetime()`, `t.iso.time()`, and `t.iso.duration()`
are Zod-compatible aliases for the existing top-level ISO helpers. `t.hash`
enforces digest length for `hex`, padded `base64`, or unpadded `base64url`.
String `date()`, `datetime()`, `time()`, and `duration()` are fluent aliases for
the matching ISO methods. `type`, `minLength`, `maxLength`, `minValue`,
`maxValue`, `isInt`, `isFinite`, `keyType`, and `valueType` are Zod-style
readonly metadata properties. String and number guards expose Zod-style
`format`; bigint guards expose `format`, `minValue`, and `maxValue`; Date guards
expose `minDate` and `maxDate`.
`t.stringFormat(name, regexp)` lowers to a regular string check; a predicate
callback lowers to a dynamic refinement and is therefore runtime-only for
lossless export.

String formats support Zod-style options that can still lower to deterministic
regular expressions: `uuid({ version })`, `email({ pattern })`,
`url({ protocol, hostname })`, `iso.datetime({ offset, local, precision })`,
`iso.time({ precision })`, `mac({ delimiter })`, and `jwt({ alg })`. The default
`iso.datetime()` accepts a trailing `Z`; set `offset: true` for `+05:30` style
offsets or `local: true` for no timezone suffix. `jwt({ alg })` first checks
compact JWT shape, then reads the base64url header `alg` field without throwing.
`url({ normalize: true })` returns a decoder, not a guard, because it outputs
`new URL(input).href` after validation.
The `regexes` namespace is also exported under `t.regexes` for Zod-style presets
such as `email({ pattern: regexes.html5Email })` and
`url({ hostname: t.regexes.domain })`.

Literal arrays lower to ordinary literal unions and expose a readonly `.values`
facade. `t.enum()` returns an `EnumGuard` with Zod-style `.options`, `.enum`,
`.extract()`, and `.exclude()` helpers; TypeScript numeric enum reverse-map
entries are ignored at construction.

`t.record(key, value)` exhaustively requires every key when `key` is a finite
string literal domain such as `t.enum(["id", "name"])` or
`t.literal(["id", "name"])`. Numeric key schemas receive object keys as finite
numbers before key validation, so `t.record(t.number.int().gte(0), value)`
accepts `"0"` and rejects `"1.5"`. Use `t.partialRecord(key, value)` when those
keys are optional. Pattern and broad string keys keep present-key semantics.

`t.custom<T>()` creates a typed `unknown` boundary for values already proven by
external code. Passing a predicate keeps the same strict-true contract as
`refine()`, and the second argument accepts the legacy label string or Zod-style
`{ error, path, abort, when }` refinement options. `t.looseRecord(key, value)`
validates values only for enumerable own string keys accepted by `key`;
non-matching keys pass through without value validation.

Function contracts are call-boundary wrappers rather than IR schema nodes. They
validate decoded arguments before invoking the implementation, then validate the
return value when an output source is supplied.

```ts
const NameLength = t.function({
  input: [t.string.trim().pipe(t.string.min(1))],
  output: t.number.int().nonnegative()
});

const lengthOfName = NameLength.implement((name) => name.length);
```

For older Zod-style wrappers, call `z.function()` without options and keep the
chain surface:

```ts
const LegacyNameLength = z.function()
  .args(t.string.trim().pipe(t.string.min(1)))
  .returns(t.number.int().nonnegative());

const legacyLengthOfName = LegacyNameLength.implement((name) => name.length);

LegacyNameLength.parameters(); // readonly argument source tuple
LegacyNameLength.returnType(); // output source
```

`implementAsync()` accepts an async implementation and validates the resolved
output. Input failures are reported below the numeric argument index; output
failures are reported below `"return"`. Both paths throw `TypeSeaAssertionError`
because function wrappers sit at integration boundaries.

## Object Presence

TypeSea separates key presence from value domain.

```ts
const Shape = t.object({
  name: t.optional(t.string),
  nickname: t.undefinedable(t.string)
});

const RequiredName = t.optional(t.string).nonoptional();
const MaybeNick = t.string.nullish();
const ArrayItem = t.array(t.number.int()).unwrap();
const Percent = t.number.apply((schema) =>
  schema.int().gte(0).lte(100));
```

- `name` may be absent. If `name` exists, its value must be a string.
- `nickname` must be present. Its value may be a string or `undefined`.
- `t.nullable(inner)` adds `null` to the value domain.
- `t.nullish(inner)` and `guard.nullish()` combine nullable value semantics with
  optional object-key presence.
- `nonoptional()` removes optional presence and explicit `undefined`, but keeps
  `null` if the schema was nullable.
- `unwrap()` exposes the inner optional, nullable, undefinedable, or array item
  guard. Metadata, message, brand, readonly, and refinement shells are skipped.
- `apply()` is a Zod-style helper hook. It does not create a schema node; it
  calls the callback with the current guard and returns the callback result.
- Presence-preserving wrappers keep optional-key semantics through `nullable`,
  `undefinedable`, `brand`, `refine`, and `superRefine`.

Object combinators preserve object mode. Strict object guards remain strict
after `extend`, `pick`, `omit`, or `partial`; passthrough object guards keep
allowing unknown keys. `t.looseObject(shape)` is an explicit alias for the
default passthrough `t.object(shape)` mode. `loose()` and `nonstrict()` switch
an object guard to passthrough mode; `nonpassthrough()` is a Zod migration alias
for `strict()`.

`object.shape` exposes a frozen map of declared field guards. Shape values are
guard facades, so derived shapes such as `partial()` still validate optional
field presence through the exposed guards.

`catchall(schema)` validates every undeclared own key with `schema`.
`strip()` has passthrough boolean validation, but parse-like success paths
project the output to declared own data fields. The original input object is not
mutated.
`pick` and `omit` accept either key arrays or Zod-style `{ key: true }` masks.
`partial` and `required` accept the same mask form when only selected fields
should change required/optional presence.
`deepPartial()` recursively partializes pure object, array, tuple, tuple rest,
record, map, set, property, union, intersection, nullable, undefinedable,
optional, brand, metadata, message, and keyed-object schemas. Lazy and
refinement schemas are semantic barriers.

`property` validates only own data descriptors. It is useful for class instances
with stable fields; prototype getters and accessor-backed properties are rejected
instead of executed.

`atLeastOneKey(keys)` requires at least one selected own data property after the
object schema passes. `exactlyOneKey(keys)` requires exactly one selected own
data property, and `oneOfKeys(keys)` is its alias. These helpers are the
preferred way to model "one of these optional keys must be present" without
encoding cardinality as a wide object union.

```ts
const Contact = t.object({
  email: t.optional(t.string.email()),
  phone: t.optional(t.string.min(1))
}).oneOfKeys(["email", "phone"]);
```

Key-rule checks count data descriptors only. Getter-backed fields are not
executed and do not satisfy the selected-key rule in safe mode.

`ObjectGuard.keyof()` and `t.keyof(ObjectGuard)` build a literal-union guard
from declared object keys. Empty object shapes produce `never`.

## Composition

`t.union(a, b)` accepts a value that satisfies at least one branch.
`t.xor(a, b)` accepts a value that satisfies exactly one branch; overlapping
branches are rejected instead of selecting the first successful branch.

```ts
const Contact = t.xor(
  t.object({ email: t.string.email() }),
  t.object({ phone: t.string.min(1) })
);
```

`t.templateLiteral(parts)` lowers supported literal, scalar, and literal-union
parts into one anchored regular expression. String schema parts accept the
empty string and preserve length checks with JavaScript `string.length`
semantics, literal and enum parts preserve literal output types, and
`number.int()` parts use an integer-only pattern.

```ts
const OrderId = t.templateLiteral([
  "order_",
  t.union(t.literal("prod"), t.literal("dev")),
  "_",
  t.number.int()
]);

type OrderId = Infer<typeof OrderId>;
// `order_prod_${number}` | `order_dev_${number}`

const CssSize = t.templateLiteral([
  t.number,
  t.enum(["px", "em", "rem"])
]);

type CssSize = Infer<typeof CssSize>;
// `${number}px` | `${number}em` | `${number}rem`

const Tag = t.templateLiteral(["tag:", t.string.min(2).max(4), "!"]);

Tag.is("tag:ab!");    // true
Tag.is("tag:abcde!"); // false
```

`refine`, `superRefine`, and `with` attach semantic checks after structural
validation. Use `refine` when a boolean predicate is enough, `superRefine` when
the check is easier to write as a callback that can call `context.addIssue()`,
and `with(({ value, issues }) => ...)` when porting Zod callback checks.
`t.check(callback)` creates a reusable source for `guard.with(t.check(...))`.
TypeSea keeps `guard.check(value)` as the Result-returning validation method,
so Zod-style reusable check construction lives under the builder namespace.
`t.property(key, guard)` is the Zod-style reusable property source for
`guard.with(...)`; it reads the public property, so string length checks and
instance getter checks can be expressed as semantic checks. `t.property(base,
key, guard)` and `base.property(key, guard)` are the hostile-input-safe runtime
contracts: they require an own data property and do not invoke user getters.
`refine` accepts an omitted second argument, the legacy label string, or
`{ error, path, abort, when }`.
`error` becomes the emitted issue message, and `path` is relative to the
refinement node. `when({ value, issues })` receives the original value and a
frozen snapshot of issues emitted by the inner diagnostic pass; returning
literal `true` runs the predicate even when unrelated inner issues exist.
When `refine()` or `superRefine()` is called without a label or options object,
TypeSea uses `"refinement"` as the internal expected label.
`addIssue()` accepts no argument for the default refinement issue, a string as a
message shorthand, or `{ path, message }` when the failure should point at a
nested relative path. `with()` exposes an `issues.push()` sink. Pushed objects
may include Zod-style fields such as `code` and `input`; TypeSea copies only
`message` and relative `path` into its smaller issue model.

```ts
const PasswordForm = t.object({
  password: t.string,
  confirm: t.string
}).refine((value) => value.password === value.confirm, {
  error: "Passwords do not match",
  path: ["confirm"],
  abort: true,
  when: ({ value }) => t.object({
    password: t.string,
    confirm: t.string
  }).safeParse(value).success
});

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

const LongName = t.string.with(({ value, issues }) => {
  if (value.length <= 3) {
    issues.push({
      code: "custom",
      input: value,
      message: "Must be longer than 3"
    });
  }
});

const LongEnough = t.check<string>(({ value, issues }) => {
  if (value.length <= 3) {
    issues.push("Must be longer than 3");
  }
});

const ReusedLongName = t.string.with(LongEnough);
```

`t.discriminatedUnion("kind", cases)` accepts a string-keyed case object for the
fast table form; each object-map case must require a string literal matching the
case name. The Zod-style case-array form reads the literal from each branch and
also supports number, boolean, null, and undefined discriminator literals.

`t.intersect(a, b)`, `guard.intersect(other)`, and the Zod-style
`guard.and(other)` alias require the same input value to satisfy both guards.
`check()` collects diagnostics from both sides.

## Recursion

Recursive contracts can use `t.lazy`. Object-shaped recursion can also use the
Zod-style getter pattern; the getter is a schema-definition thunk and is not
executed while constructing the object guard.

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

interface Category {
  readonly name: string;
  readonly subcategories: Category[];
  readonly parent?: Category;
}

const Category: Guard<Category> = t.object({
  name: t.string,
  get subcategories(): Guard<Category[]> {
    return t.array(Category);
  },
  get parent(): Guard<Category, "optional"> {
    return t.optional(Category);
  }
});
```

Direct cyclic schema objects are rejected at builder boundaries. Lazy guards
resolve once per guard instance and keep recursive schema identity stable. A
lazy chain must eventually resolve to a concrete non-lazy schema. Runtime input
getter policy is unchanged: safe validation still rejects accessor-backed input
properties without executing them.
If an object shape getter resolves to `t.optional(...)`, the field is treated as
an optional key; if it resolves to a required guard, a missing key is rejected.

## Registries

Registries attach caller-owned metadata to schema identity without changing
validation behavior. Use them for documentation, OpenAPI bridges, form labels,
or other tooling data that should not live inside the validation contract.

```ts
const Docs = t.registry<{ title: string; order: number }>();

User.register(Docs, { title: "User", order: 1 });
t.globalRegistry.add(User, {
  id: "User",
  title: "User",
  description: "Application user payload"
});
```

Registry keys are schema identities. Rebuilding the same shape creates a new
schema identity and does not share registry metadata.

## Standard Schema

Every guard, decoder, and codec exposes a Standard Schema V1 `~standard`
property. The property is frozen and contains `version: 1`,
`vendor: "typesea"`, and `validate(value)`.

```ts
const User = t.object({
  id: t.string.min(1)
});

const result = User["~standard"].validate({ id: "u_1" });
```

`validate` returns `{ value }` on success or `{ issues }` on failure. TypeSea
maps its own frozen issues to Standard Schema issues with `message` and `path`.
Use `StandardSchemaV1InferInput<T>` and `StandardSchemaV1InferOutput<T>` when a
tooling bridge needs compile-time input/output types.

Frameworks that consume Standard Schema can use the guard object itself. Hono
provides this through `@hono/standard-validator`, and tRPC uses the Standard
Schema interface when it is available.

```ts
import { sValidator } from "@hono/standard-validator";

app.post("/users", sValidator("json", User), (c) => {
  const body = c.req.valid("json");
  return c.json(body);
});
```

## Decoder Pipelines

```ts
const Count = t.coerce.number().int().gte(0);
const result = Count.decode("42");
const Name = t.coerce.string().trim().min(1);
const CreatedAt = t.coerce.date().min(new Date("2020-01-01T00:00:00.000Z"));

const Port = t.number.int().gte(0).lte(65535).default(3000);
const SafePort = t.number.int().gte(0).lte(65535).catch(3000);
const SafeName = t.string.min(3).catch((ctx) =>
  ctx.error[0]?.code === "expected_min_length" ? "anonymous" : "guest"
);
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
const TextNumber = t.invertCodec(NumberText);
const BuiltInCount = t.codecs.stringToNumber();
const BuiltInCreatedAt = t.stringToDate();
```

Decoders are for output-producing operations. They return `Result` from
`decode()` and do not expose `is()` predicates, because the decoded output may
not be the same runtime value as the input. Synchronous decoder and codec
instances also provide Zod-style `parse`, `safeParse`, `parseAsync`,
`safeParseAsync`, and `spa` methods when migrating code that expects parse
surfaces. Async decoder instances provide `parseAsync`, `safeParseAsync`, and
`spa`.

- `t.transform(source, mapper)` decodes `source`, then maps the decoded value.
- Transform mappers receive a Zod-style context as their second argument.
  `context.issues.push({ message, path, ...extra })` or
  `context.addIssue({ message, path })` marks the decoder as failed. Returning
  `z.NEVER` aborts without widening the inferred output type.
- `t.success(source)` and `z.success(source)` decode `source`, then return `true`.
- `t.preprocess(mapper, source)` maps raw input before validating `source`.
- `t.pipe(source, next)` feeds a successful decoded value into the next guard or decoder.
- `t.default(source, value)` returns a fallback output for `undefined` input.
- `t.prefault(source, value)` feeds a fallback input through the source.
- `t.catch(source, value)` returns a fallback output after a failed decode. The
  fallback may also be `(ctx) => value`, with `ctx.error` carrying the frozen
  issue list from the failed decode.
- Guard methods `guard.transform`, `guard.overwrite`, `guard.pipe`,
  `guard.default`, `guard.prefault`, and `guard.catch` are shorthand for the
  same decoder helpers. They do not change `guard.is()`.
- `t.decode`, `t.safeDecode`, `t.encode`, `t.safeEncode`, `t.decodeAsync`,
  `t.safeDecodeAsync`, `t.encodeAsync`, and `t.safeEncodeAsync` are top-level
  Result-returning helpers for decoder and codec pipelines.
- `decoder.parse(value)` returns decoded output or throws
  `TypeSeaAssertionError`; `decoder.safeParse(value)` returns
  `success/data` or `success/error` without changing `decode()` semantics.
- `t.codec(input, output, mapping)` validates both sides of a bidirectional
  decode/encode pair. `t.invertCodec(codec)` swaps those directions without
  rebuilding the mapping.
- `t.codecs.stringToNumber()`, `t.codecs.stringToInt()`,
  `t.codecs.stringToBigInt()`, `t.codecs.numberToBigInt()`,
  `t.codecs.stringToDate()`, `t.codecs.isoDatetimeToDate()`,
  `t.codecs.epochSecondsToDate()`, `t.codecs.epochMillisToDate()`,
  `t.codecs.utf8ToBytes()`, `t.codecs.bytesToUtf8()`,
  `t.codecs.base64ToBytes()`, `t.codecs.base64urlToBytes()`,
  `t.codecs.hexToBytes()`, `t.codecs.jsonCodec()`,
  `t.codecs.stringToURL()`, and
  `t.codecs.stringToHttpURL()` cover common boundary conversions. The same
  builders are also available as top-level `t.*` helpers.
- Decoder and codec children can be placed inside `t.object()`,
  `t.strictObject()`, `t.array()`, `t.tuple()`, `t.record()`, `t.map()`, and
  `t.set()`. A container with one-way child decoders returns a decoder. A
  container whose transformed children are all codecs returns a codec, so
  `decode()` and `encode()` both work at container granularity.
- Decoder-aware union, intersection, lazy, array, and object builders preserve
  both `Input<>` and `Output<>`. `TypeSource<Output, Input, Presence>` is their
  common structural contract with guards and codecs.
- Object decoders retain `shape`, `extend`, `safeExtend`, `merge`, `pick`,
  `omit`, `partial`, `strict`, `strip`, `passthrough`, and `loose`. These are
  cold schema-construction operations; they do not add branches to the finished
  decode runner. Merging a guard-only object with an object decoder promotes the
  result to an object decoder.
- `default()` excludes `undefined` from its output after a fallback is installed.
  String transforms retain `string` input, and decoder arrays retain the child
  input array type.
- Native TypeSea refinements require literal `true`. The `z.object()` facade
  normalizes truthy refinement results for Zod compatibility without changing
  the `t.object()` contract.
- `t.stringbool(options)` decodes env-style boolean strings and encodes booleans
  back to representative strings. It is case-insensitive by default; set
  `case: "sensitive"` for exact token matching.
- `t.coerce.string`, `t.coerce.number`, `t.coerce.boolean`, `t.coerce.date`,
  and `t.coerce.bigint` provide explicit JavaScript-style coercion. String, number,
  bigint, and Date coercion decoders expose the corresponding fluent checks
  after coercion, so `t.coerce.number().int().gte(0)` and
  `t.coerce.string().trim().min(1)` work without a separate `pipe()` call.
  Boolean coercion follows JavaScript truthiness semantics. For Zod parity,
  object inputs use JavaScript constructor coercion too, so caller-owned
  `valueOf`, `toString`, or `Symbol.toPrimitive` hooks may run. Use ordinary
  guards or explicit codecs at hostile-input boundaries when those hooks must
  not execute.
- `t.string.trim()`, `t.string.toLowerCase()`, `t.string.toUpperCase()`, and
  `t.string.slugify()` are decoder helpers. They validate the string first,
  then return transformed output from `decode()`.
- `t.string.normalize(form)` validates the string first, then applies Unicode
  normalization with `NFC`, `NFD`, `NFKC`, or `NFKD`.
- `t.asyncRefine`, `t.asyncTransform`, and `t.asyncPipe` return
  `Promise<Result<T, Issue[]>>` from `decodeAsync()` and the top-level
  `t.decodeAsync()` / `t.safeDecodeAsync()` helpers.
- Async decoder instances also expose `parseAsync`, `safeParseAsync`, and
  `spa` for Zod-style async parse migrations.
- `t.promise(source)` awaits native `Promise` inputs and validates the resolved
  value through `source`. Non-Promise inputs fail with an `expected_promise`
  issue.
- `guard.promise()` is the fluent form of `t.promise(guard)`.

Expected async validation failures still return `Result` values.

## Messages

```ts
const User = t.object({
  name: t.string.min(1).message("name is required")
});

const checked = withMessages(User.check(input), {
  locale: "ko",
  catalog: defineMessages({
    expected_string: "{path}: 문자열 필요"
  })
});
```

`formatIssue`, `formatIssues`, `formatError`, `prettifyError`,
`treeifyError`, `treeifyIssues`, `flattenError`, `flattenIssues`,
`toZodIssue`, `toZodIssues`, `toZodError`, and `withMessages` render or adapt
diagnostics after validation has finished. `setErrorMap(mapper)`,
`getErrorMap()`, and `resetErrorMap()` provide the Zod-style process-wide
fallback mapper for parse/check APIs. Per-call `{ error }` options always
override the global mapper. This keeps `is()` and ordinary successful `check()`
paths free from message allocation.
`config({ customError })`, `config({ localeError })`, and `config(locales.ko())`
expose the Zod 4 global configuration shape over the same mapper slot. The `z`
migration namespace also exports them as `z.config(...)` and
`z.locales.en()/ko()`.
Pass `reportInput: true` to parse-like APIs when migration code needs Zod-style
issue `input` fields. TypeSea keeps this opt-in and follows only own
data-property paths, so accessor-backed hostile inputs are not executed while
diagnostics are being decorated.
The `z` migration namespace exposes the same helpers, including
`z.treeifyError`, `z.flattenError`, `z.prettifyError`, `z.formatError`,
`z.toZodError`, `z.withMessages`, `z.defineMessages`, `z.config`, `z.locales`,
and `z.ZodIssueCode`, so Zod-oriented code can keep its existing namespace
shape while moving to TypeSea.

`guard.message(text)` and `t.message(guard, text)` attach local diagnostic text
to issues emitted by the wrapped schema. Issue-local messages take precedence
over catalog rendering, while deeper messages and `superRefine` callback
messages remain more specific than outer wrappers.

Built-in rendered catalogs are `en` and `ko`. The locale index also exports the
Zod 4 locale function names, with unsupported languages falling back to English.
Wildcard imports such as `typesea/v4/locales/en.js` expose a default locale
factory. Custom catalogs can use string templates with `{path}`, `{code}`,
`{expected}`, and `{actual}`, or formatter callbacks.
`withMessages(result, options)` preserves successful results and returns a new
failed `Result` with copied, frozen issues whose `message` fields are populated.
`prettifyError(errorOrIssues, options)` returns one multi-line diagnostic string
for terminal logs, test output, and quick debugging.
`treeifyError(errorOrIssues, options)` and `treeifyIssues(errorOrIssues,
options)` return a nested tree with local `errors`, object `properties`, and
array `items`.
`flattenError(errorOrIssues, options)` and `flattenIssues(errorOrIssues,
options)` group rendered messages into `formErrors` and top-level `fieldErrors`
buckets. The `Error` names match Zod 4 migration muscle memory; the `Issues`
names are TypeSea-native.
`formatError(errorOrIssues, options)` emits Zod's deprecated `_errors` tree for
legacy migrations. Prefer `treeifyError()` for new code because it keeps local
errors separate from object property names.

`toZodIssues(errorOrIssues, options)` projects TypeSea issues into Zod v4-style
issues. Each projected issue carries `code`, `path`, `message`, `expected`,
`received`, optional `keys`, and the original TypeSea code as `typeseaCode`.
When TypeSea can derive them without reading hostile input again, projected
issues also expose `minimum`, `maximum`, `inclusive`, `exact`, `origin`,
`divisor`, and `format`. `config({ customError })` callbacks receive the same
detail fields. When parse options include `reportInput: true`, the projected
Zod issue also keeps the safely reached failing `input` value.
`toZodError()` wraps those issues in `TypeSeaZodError`, whose public `name` is
`"ZodError"`, whose `issues` array is frozen, and whose `flatten()` /
`format()` methods mirror Zod-style instance formatting.
`TypeSeaAssertionError` exposes the same `flatten()` and `format()` methods, so
`safeParse()` failures can be formatted directly without an adapter hop.
`ZodIssueCode` is exported as both a type and a frozen value object for code
that imports constants such as `ZodIssueCode.invalid_type`.

```ts
const parsed = User.safeParse(input);

if (!parsed.success) {
  parsed.error.flatten();
  const zodError = toZodError(parsed.error, { locale: "ko" });
  zodError.name; // "ZodError"
  zodError.issues[0]?.typeseaCode;
}
```

## Schema Metadata And Analysis

```ts
const User = t.object({
  id: t.string.uuid()
})
  .meta({ id: "User" })
  .title("User")
  .describe("Public user record")
  .example({ id: "550e8400-e29b-41d4-a716-446655440000" });

const report = analyzeSchema(User);
```

`metadata`, `meta`, `title`, `describe`, and `example` are documentation-only wrappers.
They do not change `is()`, `check()`, compiled validation, or AOT validation.
When JSON Schema export succeeds, TypeSea emits them as `title`,
`description`, and `examples`. Metadata `id` is emitted as `$id` for JSON
Schema targets. OpenAPI 3.0 export omits `$id` because it is not part of the
OpenAPI 3.0 Schema Object.

`analyzeSchema(guardOrSchema)` returns a frozen advisory report. It flags wide
object unions that may force branch probing, runtime-only schemas such as
`lazy` and `refine`, AOT blockers, and places where `oneOfKeys`,
`exactlyOneKey`, or `atLeastOneKey` may be a clearer model than a wide union.
The analyzer never executes user predicates or lazy resolvers.

## SeaFlow Fuzzer

```ts
import { fuzzCases } from "typesea/seaflow";
import { t } from "typesea";

const User = t.strictObject({
  id: t.string.uuid(),
  age: t.number.int().gte(0)
});

for (const item of fuzzCases(User, { intensity: "high", maxYields: 64 })) {
  User.is(item.value) === item.valid;
}
```

SeaFlow is TypeSea's schema-directed symbolic fuzzer. It accepts a guard or a
schema record, walks the schema backward, and yields bounded cases with
metadata:

```ts
interface SeaFlowCase {
  readonly value: unknown;
  readonly valid: boolean;
  readonly kind: "valid" | "invalid" | "security";
  readonly reason: string;
  readonly path: readonly PathSegment[];
}
```

`fuzz(source, options)` yields values only. `fuzzCases(source, options)` yields
the structured cases above. `SeaFlow.cases(...)` is the same function on a
frozen namespace object.

Before filtering and yielding, SeaFlow validates each candidate against the
local schema that produced it. This keeps `case.valid` aligned with the runtime
predicate when length, range, format, or container constraints overlap.
Custom refinement predicates execute during this reconciliation step.

`SeaFlowOptions` supports `intensity: "low" | "high" | "extreme"`,
`maxDepth`, `maxYields`, `includeInvalid`, and `includeSecurity`. Lazy schemas
stop at `maxDepth`, so recursive object graphs stay finite. `maxYields` is a
hard upper bound, not a target. Small schemas may naturally emit fewer cases
when the solver exhausts its finite edge set.

SeaFlow emits number and bigint boundaries, string length and format failures,
SQLi/XSS strings, required-key deletions, strict-object excess keys,
prototype-pollution keys, accessor properties, sparse arrays, tuple length
faults, invalid record/map/set children, and object-union hybrid probes. It is
published through `typesea/seaflow`; importing the root validator APIs does not
pull the fuzzer into hot validation code.

## SeaBreeze Arena Inference

```ts
import {
  createSeaBreeze,
  SeaBreezeArena,
  SeaBreezePresence,
  emitSeaBreezeBooleanSourceBundle,
  seaBreezeReader
} from "typesea/seabreeze";
```

SeaBreeze is TypeSea's low-level arena-backed inference surface. It stores
inferred validation types as dense ids in typed arrays, computes principal joins
with HM-style variables plus best-common-type recovery, and can lower the result
to schema records, graph IR, or a predicate-only source bundle.

`typesea/seabreeze` is a dedicated public subpath. It is not re-exported from
`typesea`, so root validator imports do not pay for arena inference code. Use it
when you are building schema generators, cache/AOT tooling, or compiler-style
pipelines that need to infer a runtime validator before handing the result to
TypeSea's JIT.

For ordinary use, start with the builder API. It keeps object key interning,
field ordering, source emission, and predicate instantiation behind one small
surface while still returning numeric arena node ids:

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
  name: "isInferredUser"
});

FastUser.is({ id: "u1", tags: ["jit"] });

const schema = s.schema(User);
const graph = s.graph(User);
const sourceBundle = s.emit(User);
```

The builder is zero-cost for the validation loop. `object()`, `optional()`, and
key interning run while building the arena. `compile()` emits a direct predicate
from `SeaBreezeReader`; the returned `is()` function does not call back into the
builder.

```ts
const arena = new SeaBreezeArena({ maxNodes: 64, maxFields: 16 });
const user = arena.allocObject();
arena.appendField(user, 1, arena.string, SeaBreezePresence.Required);
arena.appendField(user, 2, arena.number, SeaBreezePresence.Optional);

const bundle = emitSeaBreezeBooleanSourceBundle(
  seaBreezeReader(arena),
  user,
  {
    keyTable: ["", "id", "age"],
    objectMode: "strict",
    mode: "safe",
    name: "isInferredUser"
  }
);
```

The direct emitter preserves TypeSea's safety tiers: `safe` uses own data
descriptors and rejects accessors/prototype reads, `unsafe` uses direct property
reads for V8 hot paths, and `unchecked` also skips strict excess-key checks.

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
import { createTypeSeaVitePlugin } from "typesea/plugin";

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
See the [AOT plugin guide](./aot-plugin.md) for complete Vite, Rollup, and
esbuild configurations and the conservative rewrite rules.

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
read the tag directly and compare case literals with `Object.is`.

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
BigInt bound checks are emitted as standalone compare IR. BigInt `multipleOf`
currently needs runtime schema fallback and is rejected by AOT instead of being
silently weakened.
Readonly wrappers freeze accepted values as an output side effect, so AOT
rejects them until standalone finalization support exists.

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

const imported = fromJsonSchema({
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    tags: {
      type: "array",
      items: { type: "string", minLength: 1 }
    }
  },
  required: ["id", "tags"],
  additionalProperties: false
});
```

`toJsonSchema` returns `Result<JsonSchema, JsonSchemaExportIssue[]>`. The
Zod-style alias `toJSONSchema` calls the same implementation. Export succeeds
only when TypeSea can represent the contract over JSON-compatible input values
without semantic loss.

`fromJsonSchema` and `fromJSONSchema` return
`Result<Guard<unknown>, JsonSchemaImportIssue[]>`. The importer accepts the
portable subset TypeSea can represent directly: boolean schemas, `const`,
`enum`, primitive `type`, string and number bounds, string `pattern`, arrays,
tuples, objects, object `minProperties` / `maxProperties`, object
`propertyNames`, object `patternProperties`, records, `anyOf`, `oneOf`,
`allOf`, and internal `$ref` JSON Pointers such as `#`,
`#/$defs/User`, or `#/definitions/User`. String `pattern` imports as an
unflagged ECMAScript `RegExp`; malformed pattern sources return import issues
instead of being weakened. Object property-count bounds are checked against own
enumerable string properties and are exported back as `minProperties` /
`maxProperties`. Object property-name schemas validate each own enumerable
string key and are exported back as `propertyNames`. Pattern-property schemas
validate matching own enumerable string keys before `additionalProperties` is
applied and are exported back as `patternProperties`. External refs, `$ref`
siblings with validation keywords, general `not` complements, and conditionals
return import issues instead of silently weakening the schema. The importer
accepts the closed draft-04 false-schema subset `not: {}`, `not: true`, and
`not: false`.

Runtime-only concepts return explicit export issues:

- `undefined`
- `bigint`
- `symbol`
- JavaScript `Date`, `Map`, `Set`, `instanceOf`, and `property` contracts
- `lazy` when `cycles: "throw"` is selected or the lazy chain never resolves to
  a concrete schema
- `refine`
- `superRefine`
- `readonly`
- decoder transforms
- async validation
- regexps with flags
- numeric literals that JSON cannot preserve, such as `NaN`, `Infinity`, and
  `-0`

`schemaToJsonSchema(schema)` is the direct schema API. It validates the supplied
schema and freezes it before export. JSON Schema options are also validated;
`schemaId`, when present, must be a string. The default target remains draft-07
for Ajv compatibility. Use `dialect: "2020-12"` or the Zod-style
`target: "draft-2020-12"` alias to emit `prefixItems` tuple schemas. The
aliases `target: "draft-7"` and `target: "draft-07"` select the draft-07
keyword set. The aliases `target: "draft-4"` and `target: "draft-04"` select
the legacy draft-04 keyword set: literals use single-value `enum`, exclusive
number bounds use boolean `exclusiveMinimum`/`exclusiveMaximum` flags attached
to `minimum`/`maximum`, tuples use `items` arrays, and false schemas become
`not: {}`. Draft-04 record key and property-name schemas return
`unsupported_target` because draft-04 has no `propertyNames` equivalent.
`target: "openapi-3.0"` emits the lossless OpenAPI 3.0 subset: nullable wrappers
use `nullable: true`, literals use single-value `enum`, and top-level `$schema`
is omitted. Positional tuples, record key schemas, property-name schemas,
pattern-property schemas, and the false schema return `unsupported_target`
issues because OpenAPI 3.0 cannot preserve those TypeSea contracts. Supplying
both `dialect` and `target` is accepted only when both normalize to the same
dialect.
The default `unrepresentable` behavior is `"throw"`: unsupported TypeSea nodes
return typed issues. For Zod migration code that deliberately wants a weaker
schema, `unrepresentable: "any"` lowers unrepresentable nodes such as `Date`,
`bigint`, `symbol`, `undefined`, `refine`, decoder transforms, regexps with
flags, non-finite numeric bounds, and runtime object contracts to `{}`. Target
incompatibilities are still fail-closed; for example an OpenAPI 3.0 tuple still
returns `unsupported_target`.
`cycles` controls recursive lazy schemas. The default `"ref"` resolves
`t.lazy()` and uses local `$ref` pointers when a schema re-enters an active
JSON Schema fragment. `cycles: "throw"` keeps lazy schemas fail-closed and
returns `unsupported_lazy`.
`t.file()` exports as an OpenAPI-friendly binary string schema. File size
checks become `minLength` and `maxLength` byte annotations, and MIME checks
become `contentMediaType` annotations. Runtime TypeSea validation still expects
a JavaScript `File` object; the JSON Schema representation is for OpenAPI and
documentation interop.
`override` receives the original TypeSea schema node and the emitted JSON
Schema object for each representable fragment. Mutate `context.jsonSchema`
directly to add vendor extensions or to specialize fragments that were
explicitly weakened with `unrepresentable: "any"`. Boolean JSON Schema
fragments and `$ref` placeholders are not override targets.
`uri` accepts a function that maps metadata `id` values before TypeSea emits
them as `$id`. The default mapper returns the id unchanged. The `metadata`
option accepts a `SchemaRegistry<GlobalRegistryMetadata>` when exporting one
schema. Registry metadata is copied onto matching emitted fragments, custom
metadata fields become JSON Schema extension fields, and reachable id-bearing
entries are extracted into local `definitions` or `$defs` so callers get stable
`$ref` targets without wrapping the original guards. Passing a registry directly
to `toJsonSchema` / `toJSONSchema`, or calling
`schemaRegistryToJsonSchema(registry)`, exports every live registry entry with a
string `id` as `{ schemas }`. Cross-entry references use `uri(id)`, and entries
without an `id` are ignored. Registry `id` values are unique per registry:
adding a different schema with the same id throws immediately. The exporter
still reports `duplicate_registry_id` if a malformed or legacy registry snapshot
contains duplicate ids.
`reused` controls repeated schema identity emission. The default `"inline"`
keeps the historical output shape. `reused: "ref"` extracts schema objects that
appear more than once into `definitions` for draft-04/draft-07 and `$defs` for
2020-12, then replaces each occurrence with a local `$ref`. OpenAPI 3.0 exports
return `unsupported_target` when this mode would need extracted refs because
TypeSea keeps the OpenAPI subset lossless.

```ts
const latest = toJsonSchema(t.tuple([t.string, t.number]), {
  target: "draft-2020-12"
});

const legacy = toJsonSchema(t.number.gt(0), {
  target: "draft-04"
});

const weakened = toJsonSchema(t.object({
  id: t.string.uuid(),
  metadata: t.unknown,
  createdAt: t.date
}), {
  unrepresentable: "any"
});

interface TreeNode {
  readonly value: string;
  readonly children: readonly TreeNode[];
}

const Tree: Guard<TreeNode> = t.lazy((): Guard<TreeNode> =>
  t.object({
    value: t.string,
    children: t.array(Tree)
  })
);

const recursive = toJsonSchema(Tree, {
  cycles: "ref"
});

const upload = toJsonSchema(t.file()
  .min(1)
  .max(1024 * 1024)
  .mime("image/png"));

const documentedDate = toJsonSchema(t.object({
  createdAt: t.date
}), {
  unrepresentable: "any",
  override: (context) => {
    if (context.path[0] === "createdAt") {
      context.jsonSchema.type = "string";
      context.jsonSchema.format = "date-time";
    }
  }
});

const referenced = toJSONSchema(t.string.meta({ id: "UserId" }), {
  uri: (id) => `https://schemas.example/${id}.json`
});

const SharedName = t.string.min(1).meta({ id: "SharedName" });
const reused = toJSONSchema(t.object({
  first: SharedName,
  last: SharedName
}), {
  reused: "ref"
});

const Docs = t.registry<GlobalRegistryMetadata>();
const User = t.object({
  id: t.string.uuid(),
  name: t.string.min(1)
});
const Post = t.object({
  title: t.string.min(1),
  author: User
});

Docs.add(User, {
  id: "User",
  title: "User"
});
Docs.add(Post, {
  id: "Post",
  title: "Post"
});

const documented = toJSONSchema(Post, {
  metadata: Docs,
  uri: (id) => `https://schemas.example/${id}.json`
});

const bundle = schemaRegistryToJsonSchema(Docs, {
  uri: (id) => `https://schemas.example/${id}.json`
});

const openapi = toJsonSchema(t.object({
  name: t.nullable(t.string.min(1))
}), {
  target: "openapi-3.0"
});
```

Object `properties` maps are emitted as null-prototype records so special keys
such as `__proto__`, `constructor`, and `hasOwnProperty` remain ordinary own
schema properties.

## Edge Semantics

- Literal guards use `Object.is`, so `t.literal(Number.NaN)` matches `NaN` and
  `t.literal(-0)` does not match `0`.
- `t.number` accepts only finite JavaScript numbers. `NaN`, `Infinity`, and
  `-Infinity` are rejected before configured numeric predicates run.
- `t.bigint` accepts only JavaScript `bigint` values. Its bound and divisibility
  methods require `bigint` arguments and never coerce numbers.
- String length bounds must be non-negative integers.
- Numeric comparison bounds must be finite.
- Predicate callbacks must return strict `true`; truthy non-boolean values do
  not pass validation.
- `readonly()` does not change `is()` and does not freeze on boolean checks.
  Parse-like APIs freeze accepted object-like values after the full schema succeeds.
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
