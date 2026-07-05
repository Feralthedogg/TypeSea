# TypeSea

**TypeSea**는 런타임 의존성이 없는 TypeScript 검증 라이브러리입니다.
불변 가드, 최적화된 Sea-of-Nodes 검증 계획, 런타임 컴파일, AOT 소스 생성을 중심으로 설계했습니다.

## 벤치마크 요약

마지막 로컬 벤치마크는 2026-07-04 KST에 실행했습니다.
명령은 `npm run bench -- bench/ecosystem.bench.ts --run`이며, strict object 계약을 대상으로 한 단일 머신의 초당 실행 횟수입니다.
릴리스 성능 보증값은 아닙니다.

![TypeSea benchmark comparison](../assets/benchmark-headline.svg)

TypeSea의 안전 모드 컴파일 검증기는 적대적 입력을 방어하는 descriptor 기반 의미를 유지하면서도 Ajv의 boolean 핫패스에 가까운 성능을 냅니다.
unsafe와 unchecked FastMode는 신뢰된 정규화 데이터에서 쓰는 성능 우선 경로입니다.
직접 필드 로드, 할당을 줄인 strict-key loop, V8이 최적화하기 쉬운 monomorphic codegen을 사용합니다.

> 목표는 "아마 유효할 것"이 아닙니다.
> TypeSea의 목표는 **여러 실행 경로가 같은 판정을 내린다는 사실을 테스트로 증명하는 검증기**입니다.
> 사용자 코드를 실행하지 않고, 예상 가능한 실패에서 예외를 던지지 않으며, 공개 경계 밖으로 변경 가능한 상태를 흘리지 않는 것을 기준으로 삼습니다.

> [!IMPORTANT]
> TypeSea는 **적대적인 경계 입력**을 전제로 설계했습니다.
> 속성 읽기는 descriptor를 통하므로 **사용자 getter가 실행되지 않습니다**.
> `__proto__`와 `constructor` key는 null-prototype lookup으로 처리하고, 사용자 regexp는 복제한 뒤 `lastIndex`를 reset하며, 순환 입력도 유한하게 검증합니다.
> 예상 가능한 실패는 얼려진 `Result`로 반환합니다.
> 불명확한 타입 탈출과 예외 흐름에 의존하지 않도록 코드베이스 전체에 정책 게이트를 둡니다.

---

## 왜 만들었나

검증 라이브러리를 쓰다 보면 다음 조건을 동시에 만족시키기 어렵습니다.

- getter 부작용, prototype pollution key, 위조된 schema object, revoked proxy처럼 검증에 저항하는 신뢰할 수 없는 입력
- runtime plan, compiled validator, AOT-generated validator 사이의 동일한 판정
- `throw` 대신 `Result`를 쓰는 명시적 진단
- 공개 경계마다 유지되는 불변성

TypeSea는 아래 원칙에 집중합니다.

- 검증 중 사용자 코드 실행 금지
- runtime plan, compiled, AOT의 판정 일치를 seeded generative fuzzer로 검증
- injection-safe code generation: string interpolation 대신 side table 사용
- `optional`과 `undefinedable`을 분리하는 명시적 presence semantics

---

## 핵심 속성

- **의존성 없음**: runtime, peer, optional, bundled dependency가 없습니다. 릴리스 전 package policy가 이를 기계적으로 검증합니다.
- **세 엔진, 하나의 의미**: `is()`와 `check()`는 cached validation plan을 실행하고, `compile()`은 optimized IR에서 runtime predicate를 방출하며, `emitAotModule()`은 standalone validator source를 생성합니다. runtime plan은 graph와 schema-specialized kernel을 함께 소유합니다. graph는 generated validator의 기준 원본이고, 일반 `is()`는 per-node interpreter를 타지 않습니다. sparse array, accessor property, symbol key, non-enumerable extra까지 포함해 parity fuzz test를 돌립니다.
- **얼려진 공개 표면**: guard, schema, graph, diagnostic, JSON Schema payload는 public API boundary를 넘기 전에 freeze됩니다.
- **손실 없는 export만 허용**: JSON Schema와 AOT export는 의미 손실이 없을 때만 성공합니다. runtime-only contract는 schema를 약화시키지 않고 typed issue를 반환합니다.

> [!NOTE]
> TypeSea는 **ESM-only** 패키지입니다.
> `"type": "module"`만 제공하며 CommonJS build는 없습니다.
> Node.js `>= 20.19`에서는 `default` export condition을 통해 `require(esm)` 로드도 가능합니다.

---

## 빠른 시작

```ts
import { compile, t, toJsonSchema, type Infer } from "typesea";

const User = t.strictObject({
  id: t.string.uuid(),
  age: t.number.int().gte(0),
  role: t.union(t.literal("admin"), t.literal("user"))
});

type User = Infer<typeof User>;

// 1) Boolean narrowing: 성공 경로에서 진단 할당을 피합니다.
if (User.is(input)) {
  input.id; // narrowed
}

// 2) Immutable diagnostics: 얼려진 Result를 반환하고, 예상 가능한 실패에서 throw하지 않습니다.
const checked = User.check(input);
if (!checked.ok) {
  console.log(checked.error); // 경로가 포함된 얼려진 issue 목록
}

// 3) Hot path: 생성된 검증기 코드
const FastUser = compile(User, { name: "isUser" });

// 4) Interop: 의미 손실 없는 JSON Schema export
const schema = toJsonSchema(User);
```

`is()`는 할당이 적은 boolean 경로에 씁니다.
호출자가 불변 진단 정보를 필요로 하면 `check()`를 씁니다.
스키마가 안정적이고 핫패스에 있다면 `compile()` 또는 `emitAotModule()`을 씁니다.

> [!CAUTION]
> `compile()`은 `new Function`으로 검증기를 생성합니다.
> `unsafe-eval`을 금지하는 Content-Security-Policy 환경에서는 예외가 납니다.
> CSP 제한 환경에서는 `emitAotModule()`로 build time에 validator source를 생성하세요.

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

`compile(..., { mode: "unsafe" })`와 `emitAotModule(..., { mode: "unsafe" })`는 TypeSea가 생성할 수 있는 가장 V8 친화적인 predicate를 방출합니다.
required object field는 direct bracket access로 읽고, array와 tuple은 direct indexed load를 쓰며, discriminant는 descriptor read를 피합니다.
strict-object extra는 allocation-free `for...in` loop로 검사합니다.
이 모드는 신뢰할 수 있고 이미 정규화된 데이터를 극단적인 핫패스에서 다룰 때만 사용합니다.

기본값은 여전히 `mode: "safe"`입니다.
unsafe mode는 getter를 실행할 수 있고, prototype-backed value를 받아들일 수 있으며, strict object에서 symbol 또는 non-enumerable extra를 거부하지 않습니다.
호출자가 object graph를 소유하고 있거나 input을 plain data record로 이미 정규화한 경우에만 사용하세요.
unsafe generated predicate는 V8 inline cache가 일반 property load를 잡을 수 있도록 escaped static property key를 source에 직접 넣을 수도 있습니다.

`mode: "unchecked"`는 한 단계 더 나아가 object shape을 신뢰하고 strict extra-key loop 자체를 건너뜁니다.
이미 소유한 DTO에서 가장 빠른 경로지만, strict object가 더 이상 extra key를 거부하지 않습니다.

unsafe와 unchecked mode에서 successful compiled `check()`는 frozen success result 대신 raw `{ ok: true, value }` object를 반환합니다.
실패 진단은 여전히 freeze됩니다.
safe mode는 success와 failure 모두 fully frozen `Result` contract를 유지합니다.
FastMode diagnostic collector도 가능한 곳에서는 trusted direct-read object shape을 사용합니다.
따라서 missing/accessor-backed field, sparse/accessor-backed array, record slot, discriminant diagnostic의 issue code는 safe mode와 다를 수 있습니다.

---

## Presence Semantics

object의 key presence는 명시적입니다.
서로 다른 wrapper는 서로 다른 계약을 뜻합니다.

| Wrapper | key 생략 허용 | value `undefined` 허용 | 추론 타입 |
| --- | --- | --- | --- |
| `t.optional(inner)` | yes | no | `key?: T` |
| `t.undefinedable(inner)` | no | yes | `key: T \| undefined` |
| `t.nullable(inner)` | - | value may be `null` | `key: T \| null` |

> [!NOTE]
> presence는 wrapper composition을 지나도 유지됩니다.
> `t.nullable(t.optional(x))`는 여전히 "key가 없어도 된다"는 뜻입니다.
> `exactOptionalPropertyTypes` 아래에서 타입 추론과 runtime 동작이 같은 의미를 가집니다.

---

## Execution Model

TypeSea는 builder validation과 diagnostic을 위해 public schema tree를 유지합니다.
그 뒤 각 schema identity를 cached validation plan으로 낮춥니다.
plan은 optimized Sea-of-Nodes graph와 schema-specialized predicate kernel을 소유합니다.
`Guard.is()`는 per-node interpreter dispatch를 피하려고 kernel을 사용하고, `compile()`과 `emitAotModule()`은 optimized graph에서 predicate를 방출합니다.
`check()`는 먼저 같은 plan으로 판정을 얻고, 실패한 값만 schema-aware diagnostic collector로 replay해서 issue path와 code를 만듭니다.

```text
builder -> frozen schema -> lower -> Sea-of-Nodes IR -> optimize
optimize -> ValidationPlan { graph, schema kernel }
schema kernel -> Guard.is() / check() preflight
graph -> compile() predicate / emitAotModule() predicate / Guard.graph()
failed check() -> schema-aware diagnostic collector
```

> [!IMPORTANT]
> generated validator는 **사용자가 제어하는 값을 source text에 넣지 않습니다**.
> literal, regexp, object key, keyset, dynamic schema fallback은 numeric index로 참조되는 **side table**에 둡니다.
> 적대적인 property name이 generated code 밖으로 탈출할 수 없으며, dedicated injection-audit test가 이 속성을 고정합니다.

---

## Performance Snapshot

마지막 로컬 벤치마크는 2026-07-04 KST에 실행했습니다.
`npm run bench -- bench/ecosystem.bench.ts --run`을 사용했고, benchmark strict-object 계약을 대상으로 했습니다.
아래 값은 단일 머신의 초당 연산 수이며 릴리스 성능 보증값은 아닙니다.

| 유효한 객체: boolean 경로 | hz |
| --- | ---: |
| TypeSea interpreted `is()` | 513,701 |
| TypeSea compiled safe `is()` | 4,297,306 |
| TypeSea compiled unsafe `is()` | 36,297,653 |
| TypeSea compiled unchecked `is()` | 42,581,174 |
| Zod `safeParse` | 1,343,756 |
| Valibot `safeParse` | 1,406,528 |
| Ajv compiled | 4,275,389 |

| 유효한 객체: 진단 경로 | hz |
| --- | ---: |
| TypeSea interpreted `check()` | 503,232 |
| TypeSea compiled safe `check()` | 3,903,929 |
| TypeSea compiled unsafe `check()` | 35,568,425 |
| TypeSea compiled unchecked `check()` | 40,084,605 |
| Zod `safeParse` | 1,355,014 |
| Valibot `safeParse` | 1,378,266 |
| Ajv compiled | 4,278,587 |

| 잘못된 객체: boolean 경로 | hz |
| --- | ---: |
| TypeSea interpreted `is()` | 3,636,369 |
| TypeSea compiled safe `is()` | 42,080,241 |
| TypeSea compiled unsafe `is()` | 49,654,076 |
| TypeSea compiled unchecked `is()` | 50,482,732 |
| Zod `safeParse` | 84,272 |
| Valibot `safeParse` | 878,521 |
| Ajv compiled | 27,820,643 |

| 잘못된 객체: 진단 경로 | hz |
| --- | ---: |
| TypeSea interpreted `check()` | 420,446 |
| TypeSea compiled safe `check()` | 2,086,129 |
| TypeSea compiled unsafe `check()` | 3,077,367 |
| TypeSea compiled unchecked `check()` | 3,673,508 |
| Zod `safeParse` | 79,613 |
| Valibot `safeParse` | 887,991 |
| Ajv compiled | 28,713,035 |

안전 모드 컴파일 경로는 TypeSea의 적대적 입력 방어 의미를 유지하면서 Ajv에 가깝게 동작합니다.
descriptor 기반 property read, symbol/non-enumerable strict-key rejection, presence semantics, immutable diagnostic, TypeScript guard inference를 유지합니다.
unsafe와 unchecked compiled mode는 그 방어 계약 일부를 의도적으로 포기하기 때문에 더 빠릅니다.

---

## API 레퍼런스

모든 공개 진입점은 package root에서 export됩니다.
builder는 `t` table 아래에도 묶여 있습니다.

### Builders

| 영역 | 진입점 |
| --- | --- |
| Scalar guard | `t.unknown`, `t.never`, `t.string`, `t.number`, `t.bigint`, `t.symbol`, `t.boolean` |
| Literal과 container | `t.literal`, `t.array`, `t.tuple`, `t.record` |
| Object | `t.object`, `t.strictObject`, `extend`, `pick`, `omit`, `partial` |
| 합성 | `t.union`, `t.discriminatedUnion`, `t.intersect`, `guard.intersect` |
| Presence wrapper | `t.optional`, `t.undefinedable`, `t.nullable` |
| 동적 계약 | `t.lazy`, `t.refine` |

### Decoders

| 영역 | 진입점 |
| --- | --- |
| 동기 decoder | `t.decoder`, `t.transform`, `t.pipe`, `t.coerce` |
| 비동기 decoder | `t.asyncDecoder`, `t.asyncRefine`, `t.asyncTransform`, `t.asyncPipe` |

### Execution & Export

| 영역 | 진입점 |
| --- | --- |
| Guard method | `guard.is()`, `guard.check()`, `guard.graph()` |
| 생성 검증기 | `compile`, `emitAotModule` |
| JSON Schema | `toJsonSchema` |

### Messages & Adapters

| 영역 | 진입점 |
| --- | --- |
| Message / i18n | `formatIssue`, `formatIssues`, `withMessages`, `defineMessages` |
| tRPC | `toTrpcParser`, `toAsyncTrpcParser` |
| Fastify | `toFastifyRouteSchema`, `toFastifyValidatorCompiler` |
| React Hook Form | `toReactHookFormResolver` |

adapter도 compiled guard를 받을 수 있습니다.
startup에서 한 번 compile한 뒤 parser나 validator-compiler adapter에 넘기면 framework hot path가 generated predicate를 재사용합니다.

```ts
const FastUser = compile(User);
const trpcParser = toTrpcParser(FastUser);
const fastifyCompiler = toFastifyValidatorCompiler(FastUser);

// 신뢰된 정규화 데이터 전용: 적대적 입력 방어를 direct read 성능과 맞바꿉니다.
const UnsafeUser = compile(User, { mode: "unsafe" });
const internalParser = toTrpcParser(UnsafeUser);
```

> [!TIP]
> source kind에 맞는 inference alias를 쓰세요.
> guard에는 `Infer<>`, decoder에는 `InferDecoder<>`, async decoder에는 `InferAsyncDecoder<>`를 씁니다.
> decoder에 `Infer<>`를 적용하면 `never`가 됩니다.
> downstream type이 갑자기 collapse되면 먼저 이 부분을 확인하세요.

---

## 경계 동작

의도적으로 정한 동작이며 테스트로 고정되어 있습니다.

| 입력 | 동작 |
| --- | --- |
| `NaN`, `Infinity` | `t.number`는 거부합니다. finite number만 허용합니다. `t.literal(NaN)`은 `NaN`을 match합니다. |
| `-0` vs `0` | literal은 `Object.is`로 match합니다. diagnostic은 `-0`을 구분해서 format합니다. |
| Getter-backed properties | 실행하지 않습니다. missing 또는 invalid data로 취급합니다. |
| `__proto__`, `constructor` keys | pollution 없이 plain own key로 검증합니다. |
| Sparse array holes | accessor 실행 없이 `undefined`로 읽습니다. |
| Strict object extras | `Reflect.ownKeys`로 거부합니다. symbol key와 non-enumerable property도 포함합니다. |
| Global-flag regexes | construction 시 clone하고, 매 test 전에 `lastIndex`를 reset합니다. |
| UUID | RFC 9562 version 1-8과 nil UUID를 허용합니다. |
| Cyclic input values | value x schema active-pair tracking으로 유한하게 검증합니다. |
| Nesting depth | recursive frame 256에서 cap을 둡니다. 더 깊은 input은 stack overflow 대신 실패합니다. |

---

## 사용 팁과 주의점

> [!WARNING]
> **recursive guard에는 명시적 type annotation이 필요합니다.**
> TypeScript는 self-referential initializer를 추론하지 못합니다(TS7022).
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

- **경계 데이터는 `unknown`으로 들어옵니다.** `as`로 미리 좁히지 마세요. builder API는 validation을 통해 narrowing이 일어나도록 typed되어 있습니다.
- **recursive contract는 `t.lazy`를 통합니다.** 직접 순환하는 schema object는 construction에서 거부합니다.
- **schema lifetime에 맞춰 engine을 고르세요.** 일회성 schema는 runtime plan, 안정적인 hot schema는 `compile()`, CSP 환경이나 build-time generation은 `emitAotModule()`이 맞습니다.
- **decoder는 object shape 안에 넣지 않습니다.** decoder를 `t.object` entry와 섞지 말고, validated shape 바깥에서 `t.pipe`로 transformation을 합성하세요.

---

## 검증

CI가 실행하는 gate는 전부 로컬 npm script입니다.

```sh
npm run check           # policy, docs, typecheck, lint, tests, build, dist, API snapshot, pack
npm run check:consumer  # tarball install + runtime/type smoke in a temp project
npm run bench -- --run  # benchmark smoke
npm run pack:dry        # package contents dry run
npm run release:check   # the full pre-publish gate
```

`npm run release:check`는 publish 전에 기대하는 동일한 gate를 실행합니다.
typecheck, lint, tests, build, docs smoke, dist policy, public API snapshot, package contents, consumer install, benchmark smoke, pack dry run을 포함합니다.
CI는 Node 20.19, 22, 24에서 실행하고, release는 npm provenance와 함께 publish합니다.

> [!NOTE]
> benchmark 비교 패키지인 Zod, Valibot, Ajv는 dev dependency일 뿐입니다.
> package policy는 이들이 runtime dependency field에 들어가는 것을 거부합니다.
> benchmark suite는 boolean path와 diagnostic path(`check()` vs `safeParse`)를 모두 보고하므로 비교 기준을 맞춥니다.

---

## 문서

- [문서 사이트](https://feralthedogg.github.io/TypeSea/)
- [API 레퍼런스](../api.md)
- [엔진 노트](../engine-notes.md)

---

## 라이선스

MIT License. 자세한 내용은 [LICENSE](../../LICENSE)를 보세요.
