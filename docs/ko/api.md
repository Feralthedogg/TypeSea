# TypeSea API 레퍼런스

TypeSea는 신뢰할 수 없는 값을 `unknown`으로 받고, 불변 guard를 통해 타입을 좁힙니다.
공개 API는 작게 유지하고, 복잡한 검증 로직은 builder validation, graph introspection, diagnostics, export check 내부에 둡니다.

## 가져오기

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

패키지는 root entry point 하나만 노출합니다.
subpath import는 공개 API가 아닙니다.
TypeSea는 ESM-only이며 CommonJS condition을 publish하지 않습니다.

## Guard 계약

```ts
interface Guard<T> {
  is(value: unknown): value is T;
  check(value: unknown): CheckResult<T>;
  checkFirst(value: unknown): CheckResult<T>;
  assert(value: unknown): asserts value is T;
  graph(): Graph;
}
```

| 메서드 | 용도 | 계약 |
| --- | --- | --- |
| `is` | 빠른 boolean narrowing | 성공 경로에서 진단 객체를 만들지 않습니다. |
| `check` | 실패 이유가 필요한 검증 | 동결된 `Result<T, Issue[]>` container를 반환합니다. |
| `checkFirst` | hot path의 단일 실패 진단 | 같은 `Result` 형태를 반환하되 실패 시 issue를 최대 하나만 담습니다. compiled/AOT guard는 전용 first-fault collector를 사용합니다. |
| `assert` | 예외가 필요한 연동 지점 | 복사되고 동결된 issue를 담은 `TypeSeaAssertionError`를 던집니다. |
| `graph` | 검증 계획 introspection | validation plan이 보유한 validated, optimized, frozen Sea-of-Nodes graph를 반환합니다. |

diagnostic path에는 object key와 0부터 시작하는 array 또는 tuple index만 들어갑니다.
공개 diagnostic validator는 잘못된 path segment를 거부한 뒤 diagnostic을 API 밖으로 내보냅니다.

## Builder 계열

| 계열 | Builder |
| --- | --- |
| Scalar | `t.unknown`, `t.never`, `t.string`, `t.number`, `t.date`, `t.bigint`, `t.symbol`, `t.boolean`, `t.null`, `t.undefined`, `t.void` |
| String check | `.min`, `.max`, `.length`, `.nonempty`, `.regex`, `.startsWith`, `.endsWith`, `.includes`, `.uuid`, `.email`, `.url`, `.isoDate`, `.isoDateTime`, `.ulid`, `.ipv4`, `.ipv6` |
| Number check | `.int`, `.finite`, `.safe`, `.gte`, `.lte`, `.min`, `.max`, `.gt`, `.lt`, `.multipleOf`, `.positive`, `.nonnegative`, `.negative`, `.nonpositive` |
| Date check | `.min`, `.max` |
| Literal과 container | `t.literal(value)`, `t.enum(values)`, `t.array(item)`, `t.tuple([a, b])`, `t.tuple([head], rest)`, `t.record(value)`, `t.map(key, value)`, `t.set(item)`, `t.json()` |
| Array check | `.min`, `.max`, `.length`, `.nonempty` |
| Object | `t.object(shape)`, `t.strictObject(shape)` |
| Object transform | `t.extend`, `t.safeExtend`, `t.merge`, `t.pick`, `t.omit`, `t.partial`, `t.deepPartial`, `t.required`, `t.strict`, `t.passthrough`, `t.strip`, `t.catchall`, 그리고 같은 이름의 object guard method |
| Runtime object contract | `t.instanceOf(Ctor)`, `t.property(base, key, value)`, `guard.property(key, value)` |
| Composition | `t.union`, `t.discriminatedUnion`, `t.intersect`, `guard.intersect` |
| Presence | `t.optional`, `t.undefinedable`, `t.nullable`, `t.nullish` |
| Dynamic guard | `t.lazy`, `t.refine` |
| Decoder | `t.decoder`, `t.transform`, `t.pipe`, `t.default`, `t.defaultValue`, `t.prefault`, `t.catch`, `t.codec`, `t.coerce`, `t.string.trim()`, `t.string.toLowerCase()`, `t.string.toUpperCase()` |
| Async decoder | `t.asyncDecoder`, `t.asyncRefine`, `t.asyncTransform`, `t.asyncPipe` |

builder function은 schema가 validation plan, compiler, AOT emitter, diagnostic collector, JSON Schema exporter로 들어가기 전에 입력을 검증합니다.
위조된 guard-like value, 잘못된 schema tag, 잘못된 predicate, 잘못된 bound, malformed regexp, 잘못된 discriminated union case set은 construction 중 거부됩니다.

허용된 schema는 저장 전에 freeze됩니다.
공개 schema collection field는 변경 가능한 collection object 대신 frozen array와 frozen key lookup record를 사용합니다.

## 객체 key 존재 규칙

TypeSea는 key가 존재하는지와 value domain을 분리합니다.

```ts
const Shape = t.object({
  name: t.optional(t.string),
  nickname: t.undefinedable(t.string)
});
```

- `name`은 없어도 됩니다. 존재한다면 값은 string이어야 합니다.
- `nickname`은 반드시 존재해야 합니다. 값은 string 또는 `undefined`일 수 있습니다.
- `t.nullable(inner)`는 value domain에 `null`을 추가합니다.
- `t.nullish(inner)`는 nullable value와 optional key 의미를 함께 제공합니다.
- `nullable`, `undefinedable`, `brand`, `refine`을 지나도 optional-key 의미는 보존됩니다.

object combinator는 object mode를 보존합니다.
strict object guard는 `extend`, `pick`, `omit`, `partial` 이후에도 strict를 유지하고, passthrough object guard는 unknown key 허용을 유지합니다.

`catchall(schema)`는 선언되지 않은 모든 own key를 `schema`로 검증합니다.
`strip()`은 TypeSea에서 검증 전용 의미입니다. guard는 원본 값을 반환하므로, 검증 의미는 `passthrough()`와 같습니다.
`pick`과 `omit`은 key array와 Zod 스타일 `{ key: true }` mask를 모두 받습니다.
`deepPartial()`은 순수 object, array, tuple, tuple rest, record, map, set, property, union, intersection, nullable, undefinedable, optional, brand schema를 재귀적으로 partial 처리합니다.
lazy와 refinement schema는 callback 의미를 보존하기 위해 semantic barrier로 둡니다.

`property`는 own data descriptor만 검증합니다. 안정적인 class field를 증명할 때 쓰기 좋고, prototype getter나 accessor property는 실행하지 않고 거부합니다.

## 합성

`t.union(a, b)`는 적어도 한 branch를 만족하는 값을 허용합니다.

`t.discriminatedUnion("kind", cases)`는 string case key를 요구합니다.
각 case는 static하게 inspect할 수 있는 object case여야 하며, dispatch key는 case name과 일치하는 required string literal이어야 합니다.

`t.intersect(a, b)`와 `guard.intersect(other)`는 같은 input value가 두 guard를 모두 만족해야 합니다.
`check()`는 양쪽 diagnostic을 모두 수집합니다.

## 재귀

recursive contract는 반드시 `t.lazy`를 사용해야 합니다.

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

직접 순환하는 schema object는 builder boundary에서 거부됩니다.
lazy guard는 guard instance마다 한 번 resolve되고 recursive schema identity를 안정적으로 유지합니다.
lazy chain은 결국 concrete non-lazy schema로 resolve되어야 합니다.

## Decoder Pipeline

```ts
const Count = t.pipe(t.coerce.number(), t.number.int().gte(0));
const result = Count.decode("42");

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

decoder는 output을 생성하는 작업에 씁니다.
`decode()`에서 `Result`를 반환하며 `is()` predicate를 노출하지 않습니다.
decoded output이 input과 같은 runtime value가 아닐 수 있기 때문입니다.

- `t.transform(source, mapper)`는 `source`를 decode한 뒤 decoded value를 map합니다.
- `t.pipe(source, next)`는 성공한 decoded value를 다음 guard 또는 decoder에 넘깁니다.
- `t.default(source, value)`는 input이 `undefined`일 때 fallback output을 바로 반환합니다.
- `t.prefault(source, value)`는 input이 `undefined`일 때 fallback input을 source에 다시 통과시킵니다.
- `t.catch(source, value)`는 decode 실패 시 fallback output을 반환합니다.
- `t.codec(input, output, mapping)`은 bidirectional decode/encode 양쪽을 모두 검증합니다.
- `t.coerce.string`, `t.coerce.number`, `t.coerce.boolean`은 명시적 primitive coercion을 제공합니다.
- `t.string.trim()`, `t.string.toLowerCase()`, `t.string.toUpperCase()`는 decoder helper입니다. 먼저 string을 검증한 뒤 `decode()` 결과로 변환된 값을 반환합니다.
- `t.asyncRefine`, `t.asyncTransform`, `t.asyncPipe`는 `decodeAsync()`에서 `Promise<Result<T, Issue[]>>`를 반환합니다.

예상 가능한 async validation 실패도 `Result`로 반환됩니다.

## Message

```ts
const checked = withMessages(User.check(input), {
  locale: "ko",
  catalog: defineMessages({
    expected_string: "{path}: 문자열 필요"
  })
});
```

`formatIssue`, `formatIssues`, `flattenIssues`, `withMessages`는 validation이 끝난 뒤 diagnostic을 렌더링합니다.
따라서 `is()`와 일반 `check()` path에서는 message allocation이 발생하지 않습니다.

built-in locale은 `en`과 `ko`입니다.
custom catalog는 `{path}`, `{code}`, `{expected}`, `{actual}` string template 또는 formatter callback을 쓸 수 있습니다.
`withMessages(result, options)`는 successful result를 그대로 보존하고, failed `Result`에는 복사되고 동결된 issue에 `message` field를 채워 새로 반환합니다.
`flattenIssues(issues, options)`는 렌더링된 message를 `formErrors`와 top-level `fieldErrors` bucket으로 묶습니다.

## 런타임 컴파일

```ts
const FastUser = compile(User, { name: "isUser" });

FastUser.is(input);
FastUser.check(input);
```

`compile`은 optimized Sea-of-Nodes validation graph에서 generated predicate function과 failed value용 diagnostic collector를 방출합니다.
static scalar, object, array, record, union, strict-key node는 가능한 경우 straight-line JavaScript 또는 indexed loop로 낮아집니다.
`lazy`, `refine` 같은 dynamic schema edge는 ordinary guard execution과 같은 IR-backed runtime fallback을 사용해 의미를 유지합니다.

선택적 `name`은 debugging과 profiling을 위한 hint입니다.
TypeSea는 이를 strict-mode-safe JavaScript function name으로 normalize하고, reserved name에는 prefix를 붙이며, generated name 길이에 cap을 둡니다.
직접 compiled guard construction은 predicate, collector, source argument를 검증합니다.
collector diagnostic은 `check()` 반환 전에 validate, copy, freeze됩니다.

generated source는 사용자가 제어하는 값을 직접 interpolate하지 않습니다.
literal, regexp, property key, keyset, dynamic schema fallback은 side table에 capture되고 numeric index로 참조됩니다.

### Unsafe 컴파일 모드

```ts
const FastButLooseUser = compile(User, {
  name: "isUserFast",
  mode: "unsafe"
});
```

`CompileOptions["mode"]`와 `AotCompileOptions["mode"]`는 `"safe" | "unsafe" | "unchecked" | undefined`입니다.
option을 생략하면 `"safe"`가 기본입니다.
safe mode는 TypeSea의 적대적 입력 방어 계약을 유지합니다.
descriptor 기반 property read, getter 실행 금지, symbol과 non-enumerable extra를 포함한 strict-object rejection을 보장합니다.

unsafe mode는 신뢰할 수 있고 정규화된 plain data를 위한 명시적 performance escape hatch입니다.

- field schema가 `undefined`를 거부하는 required object field는 `value[key]`로 읽습니다.
- discriminant dispatch는 tag를 direct bracket access로 읽습니다.
- array와 tuple은 direct indexed load를 사용합니다.
- strict-object extra-key rejection은 allocation-free own-enumerable `for...in` loop를 사용합니다.

이 모드는 getter를 실행할 수 있고, prototype-backed value를 받아들일 수 있으며, strict object에서 symbol 또는 non-enumerable extra를 거부하지 않습니다.
compiled `check()`는 먼저 generated predicate의 판정을 신뢰하므로, unsafe predicate가 `true`를 반환하면 `check()`도 successful result를 반환합니다.
input이 trusted normalization boundary를 지난 뒤에만 unsafe mode를 사용하세요.

unsafe mode는 escaped static property key를 generated predicate source에 직접 넣을 수 있습니다.
그래야 V8이 ordinary property-load inline cache를 붙이기 쉽습니다.
safe mode는 property key를 side table에 유지합니다.

unchecked mode는 unsafe direct-read shape을 사용하고 strict-object extra-key loop도 건너뜁니다.
object shape이 이미 신뢰되거나 정규화된 input에만 사용해야 합니다.
이 모드에서는 strict object가 더 이상 extra key를 거부하지 않습니다.

unsafe와 unchecked compiled `check()`는 successful Result object를 `Object.freeze()` 없이 raw object로 반환합니다.
failure diagnostic은 계속 freeze됩니다.
safe mode는 success와 failure 모두 frozen Result object를 유지합니다.
FastMode diagnostic collector는 가능한 경우 direct field read와 FastMode strict-key rule을 사용합니다.
따라서 missing/accessor issue code는 safe mode와 일치한다고 보장하지 않습니다.
array와 tuple diagnostic도 fast mode에서는 direct indexed read를 쓰므로 sparse slot은 loaded `undefined` value 기준으로 진단됩니다.
record diagnostic은 direct `record[key]` read를 사용합니다.
unchecked mode는 inherited enumerable key도 방문합니다.
discriminant diagnostic은 tag를 직접 읽고 string case를 `===`로 비교합니다.

## AOT 모듈 생성

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

`emitAotModule`은 `Result<AotModule, AotIssue[]>`를 반환합니다.
successful result에는 standalone ESM validator source와 declaration source가 들어 있습니다.
generated module은 module load time에 dynamic source compilation을 요구하지 않고 `is`, `check`, `assert`, default frozen guard-like object를 export합니다.

AOT generation은 lossless-only입니다.
runtime callback 또는 serialize할 수 없는 identity가 필요한 schema는 명시적 AOT issue를 반환합니다.

## Framework Adapter

```ts
const parser = toTrpcParser(User);
const routeSchema = toFastifyRouteSchema(User);
const validatorCompiler = toFastifyValidatorCompiler(User);
const resolver = toReactHookFormResolver(User);
```

adapter는 구조적으로 맞춰진 얇은 연결 계층이며 런타임 의존성이 없습니다.
TypeSea는 tRPC, Fastify, React Hook Form을 import하지 않습니다.

compiled guard도 같은 adapter에 넘길 수 있습니다.
hot request path에서는 이 형태를 권장합니다.
startup에서 한 번 compile한 뒤 adapter가 generated predicate를 재사용하게 하세요.

```ts
const FastUser = compile(User);
const fastParser = toTrpcParser(FastUser);
const fastValidatorCompiler = toFastifyValidatorCompiler(FastUser);
```

public input boundary에서는 기본 compiled mode를 쓰세요.
adapter가 직접 `is()` 호출을 숨기더라도 safe descriptor-read 계약은 유지됩니다.
신뢰된, 이미 정규화된 내부 데이터에서는 더 빠른 mode를 같은 방식으로 adapter에 연결할 수 있습니다.

```ts
const UnsafeUser = compile(User, { mode: "unsafe" });
const internalParser = toTrpcParser(UnsafeUser);

const TrustedShapeUser = compile(User, { mode: "unchecked" });
const internalValidatorCompiler = toFastifyValidatorCompiler(TrustedShapeUser);
```

| Adapter | Export | 동작 |
| --- | --- | --- |
| tRPC | `toTrpcParser`, `toAsyncTrpcParser` | decoded value를 반환하거나 `TypeSeaAssertionError`를 던지는 parser object를 반환합니다. |
| Fastify route schema | `toFastifyRouteSchema` | guard를 JSON Schema route fragment로 변환합니다. |
| Fastify validator compiler | `toFastifyValidatorCompiler` | `{ value }` 또는 `{ error }`를 만드는 compiler-shaped validator를 반환합니다. |
| React Hook Form | `toReactHookFormResolver` | TypeSea message를 field error로 매핑하는 async resolver를 반환합니다. |

## Graph and IR

```ts
const graph = User.graph();
const optimized = optimizeGraph(graph);
```

`Guard.graph()`는 runtime validation plan이 보유한 optimized Sea-of-Nodes validation graph를 반환합니다.
같은 plan은 `is()`가 사용하는 specialized predicate kernel도 소유합니다.
graph는 `compile()`과 `emitAotModule()`의 source이고, kernel은 ordinary guard execution이 generic per-node interpreter를 타지 않게 합니다.
공개 graph value는 validate, dependency-check, dense compaction, freeze를 거쳐 반환됩니다.

`optimizeGraph(graph)`는 직접 전달된 graph input을 validate한 뒤 optimize합니다.
regex graph node는 plain `RegExp` value만 받으며, graph가 freeze되기 전에 extensible input을 clone해서 non-extensible regexp로 저장합니다.

`SchemaCheck`는 `lazy`나 `refine`처럼 dynamic runtime schema logic을 기록합니다.
callback-backed edge를 static primitive인 척하지 않고, runtime semantics가 필요하다는 사실을 IR에 정확히 남깁니다.

## JSON Schema 내보내기

```ts
const result = toJsonSchema(User);
```

`toJsonSchema`는 `Result<JsonSchema, JsonSchemaExportIssue[]>`를 반환합니다.
TypeSea가 JSON-compatible input value 위에서 contract를 의미 손실 없이 표현할 수 있을 때만 성공합니다.

runtime-only concept는 명시적 export issue를 반환합니다.

- `undefined`
- `bigint`
- `symbol`
- JavaScript `Date`, `Map`, `Set`, `instanceOf`, `property` contract
- `lazy`
- `refine`
- decoder transforms
- async validation
- flag가 있는 regexp
- `NaN`, `Infinity`, `-0`처럼 JSON이 보존할 수 없는 numeric literal

`schemaToJsonSchema(schema)`는 direct schema API입니다.
전달된 schema를 validate하고 freeze한 뒤 export합니다.
JSON Schema option도 validate합니다.
`schemaId`가 있으면 string이어야 합니다.

object `properties` map은 null-prototype record로 방출됩니다.
따라서 `__proto__`, `constructor`, `hasOwnProperty` 같은 특수 key도 ordinary own schema property로 남습니다.

## 경계 동작

- literal guard는 `Object.is`를 사용합니다. 따라서 `t.literal(Number.NaN)`은 `NaN`을 match하고 `t.literal(-0)`은 `0`과 match하지 않습니다.
- `t.number`는 finite JavaScript number만 허용합니다. `NaN`, `Infinity`, `-Infinity`는 configured numeric predicate가 실행되기 전에 거부됩니다.
- string length bound는 non-negative integer여야 합니다.
- numeric comparison bound는 finite number여야 합니다.
- predicate callback은 strict `true`를 반환해야 합니다. truthy non-boolean value는 validation을 통과하지 않습니다.
- `RegExp` check는 매 test 전에 `lastIndex`를 reset합니다. global과 sticky regexp의 상태가 validation 사이에 새지 않습니다.
- string regex builder와 direct string regex schema는 plain `RegExp` instance만 받습니다. 허용된 regex check는 storage 전에 clone됩니다.

## Result 계약

```ts
type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

예상 가능한 validation failure는 `Result`를 사용합니다.
Result container는 runtime에서 freeze됩니다.
successful value는 caller-owned data이므로 recursive freeze하지 않습니다.
