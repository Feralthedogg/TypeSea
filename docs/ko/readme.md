# TypeSea

**TypeSea**는 런타임 의존성 없이 TypeScript 값을 검증하고 타입을 좁히는 라이브러리입니다.
불변 스키마, Sea-of-Nodes에서 영향을 받은 검증 IR, 런타임 컴파일, AOT 소스 생성을 한 흐름으로 묶는 것을 목표로 합니다.

## 벤치마크 요약

마지막 로컬 벤치마크는 2026-07-04 KST에 실행했습니다.
명령은 `npm run bench -- bench/ecosystem.bench.ts --run`이며, strict object 계약을 대상으로 한 단일 머신의 초당 실행 횟수입니다.
아래 수치는 회귀를 잡기 위한 로컬 측정값이지, 릴리스 성능 보증값은 아닙니다.

![TypeSea benchmark comparison](../assets/benchmark-headline.svg)

TypeSea의 안전 모드 컴파일 검증기는 getter 실행 방지와 strict extra key 검사 같은 적대적 입력 방어를 유지하면서도 Ajv의 boolean hot path에 가까운 성능을 냅니다.
`unsafe`와 `unchecked` FastMode는 호출자가 이미 입력을 정규화했고 객체 그래프를 신뢰할 수 있을 때 쓰는 성능 우선 경로입니다.
이 모드에서는 직접 필드 로드, 할당을 줄인 strict-key loop, V8이 inline cache를 붙이기 쉬운 코드 형태를 사용합니다.

> 목표는 "대충 유효해 보이면 통과"가 아닙니다.
> TypeSea의 목표는 **런타임 실행, 컴파일 실행, AOT 실행이 같은 판정을 내린다는 사실을 테스트로 고정하는 검증기**입니다.
> 사용자 코드를 실행하지 않고, 예상 가능한 실패에서 예외를 던지지 않으며, 공개 API 경계 밖으로 변경 가능한 내부 상태를 내보내지 않는 것을 기본 원칙으로 둡니다.

> [!IMPORTANT]
> TypeSea는 **적대적인 경계 입력**을 전제로 설계했습니다.
> 속성 읽기는 descriptor를 통하므로 **사용자 getter를 실행하지 않습니다**.
> `__proto__`와 `constructor` key는 null-prototype lookup으로 처리하고, 사용자 regexp는 복제한 뒤 `lastIndex`를 reset하며, 순환 입력도 유한하게 검증합니다.
> 예상 가능한 실패는 동결된 `Result`로 반환합니다.
> 불명확한 타입 탈출과 암묵적 예외 흐름에 기대지 않도록 코드베이스 전체에 정책 게이트를 둡니다.

> [!WARNING]
> `unsafe`와 `unchecked`는 **public boundary용 모드가 아닙니다**.
> 이미 신뢰 가능한 plain data로 정규화된 입력에서만 사용하세요.
> 이 모드에서는 getter 실행, prototype-backed value 수용, 더 약한 strict extra-key 보장을 호출자가 받아들이는 것입니다.
> 외부 입력에는 기본 safe mode를 쓰는 것이 TypeSea의 보안 계약입니다.

---

## 왜 만들었나

검증 라이브러리를 실제 경계 입력에 쓰다 보면 다음 조건을 동시에 만족시키기 어렵습니다.

- getter 부작용, prototype pollution key, 위조된 schema object, revoked proxy처럼 검증 자체에 저항하는 입력
- 런타임 계획, 컴파일된 검증기, AOT로 생성한 검증기 사이의 동일한 판정
- `throw` 대신 `Result`로 표현되는 명시적 실패
- 공개 API 경계를 지날 때마다 유지되는 불변성

TypeSea는 아래 원칙에 집중합니다.

- 검증 중 사용자 코드 실행 금지
- 런타임, 컴파일, AOT 실행 경로의 판정 일치를 seeded fuzzer로 검증
- 코드 생성 시 사용자 입력을 소스 문자열에 직접 삽입하지 않기
- `optional`과 `undefinedable`을 분리하는 명시적 key presence 규칙

---

## 핵심 속성

- **런타임 의존성 없음**: runtime, peer, optional, bundled dependency가 없습니다. 릴리스 전에 package policy가 이를 기계적으로 검증합니다.
- **세 실행 경로, 하나의 의미**: `is()`와 `check()`는 cached validation plan을 실행하고, `compile()`은 최적화된 IR에서 런타임 predicate를 생성하며, `emitAotModule()`은 standalone validator source를 만듭니다. 일반 `is()`는 per-node interpreter를 타지 않고 schema-specialized kernel을 사용합니다. sparse array, accessor property, symbol key, non-enumerable extra까지 포함해 parity fuzz test를 돌립니다.
- **동결된 공개 표면**: guard, schema, graph, diagnostic, JSON Schema payload는 공개 API 경계를 넘기 전에 freeze됩니다.
- **손실 없는 export만 허용**: JSON Schema와 AOT export는 TypeSea 계약을 의미 손실 없이 표현할 수 있을 때만 성공합니다. 런타임 전용 계약은 schema를 약화시키지 않고 typed issue를 반환합니다.

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
  email: t.string.email(),
  age: t.number.int().nonnegative(),
  role: t.enum(["admin", "user"]),
  tags: t.array(t.string.min(1)).max(8)
});

type User = Infer<typeof User>;

// 1) Boolean narrowing: 성공 경로에서 진단 객체를 만들지 않습니다.
if (User.is(input)) {
  input.id; // narrowed
}

// 2) Immutable diagnostics: 예상 가능한 실패는 Result로 받습니다.
const checked = User.check(input);
if (!checked.ok) {
  console.log(checked.error); // path가 포함된 동결 issue 목록
}

// 3) Hot path: 검증 코드를 생성합니다.
const FastUser = compile(User, { name: "isUser" });

// 4) Interop: 의미 손실이 없을 때만 JSON Schema로 내보냅니다.
const schema = toJsonSchema(User);
```

`is()`는 할당이 적은 boolean 경로에 씁니다.
호출자가 전체 실패 이유와 path를 필요로 하면 `check()`를 씁니다.
hot rejection path에서 기계가 읽을 첫 번째 실패만 필요하면 `checkFirst()`를 씁니다.
스키마가 안정적이고 호출 빈도가 높다면 `compile()` 또는 `emitAotModule()`을 씁니다.
compiled/AOT `checkFirst()`는 전체 issue list를 만든 뒤 자르지 않고 전용 first-fault collector를 사용합니다.

> [!CAUTION]
> `compile()`은 `new Function`으로 검증기를 생성합니다.
> `unsafe-eval`을 금지하는 Content-Security-Policy 환경에서는 사용할 수 없습니다.
> CSP 제한 환경에서는 `emitAotModule()`로 빌드 시점에 validator source를 생성하세요.

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

기본값은 여전히 `mode: "safe"`입니다.
unsafe mode는 getter를 실행할 수 있고, prototype-backed value를 받아들일 수 있으며, strict object에서 symbol 또는 non-enumerable extra를 거부하지 않습니다.
호출자가 객체 그래프를 소유하고 있거나 입력을 plain data record로 이미 정규화한 경우에만 사용하세요.

`mode: "unchecked"`는 한 단계 더 나아가 object shape을 신뢰하고 strict extra-key loop 자체를 건너뜁니다.
이미 소유한 DTO에서는 가장 빠른 경로지만, strict object가 더 이상 extra key를 거부하지 않습니다.

unsafe와 unchecked mode에서 successful compiled `check()`는 frozen success result 대신 raw `{ ok: true, value }` object를 반환합니다.
실패 진단은 계속 freeze됩니다.
safe mode는 success와 failure 모두 frozen `Result` 계약을 유지합니다.

---

## Key Presence

객체 key 존재 여부는 명시적으로 표현합니다.
서로 다른 wrapper는 서로 다른 계약을 뜻합니다.

| Wrapper | key 생략 허용 | value `undefined` 허용 | 추론 타입 |
| --- | --- | --- | --- |
| `t.optional(inner)` | yes | no | `key?: T` |
| `t.undefinedable(inner)` | no | yes | `key: T \| undefined` |
| `t.nullable(inner)` | - | value may be `null` | `key: T \| null` |

> [!NOTE]
> presence는 wrapper composition을 지나도 유지됩니다.
> `t.nullable(t.optional(x))`는 여전히 "key가 없어도 된다"는 뜻입니다.
> `exactOptionalPropertyTypes` 아래에서 타입 추론과 런타임 동작은 같은 의미를 가집니다.

---

## 실행 모델

TypeSea는 builder validation과 diagnostic을 위해 public schema tree를 유지합니다.
그 뒤 각 schema identity를 cached validation plan으로 낮춥니다.
plan은 최적화된 Sea-of-Nodes graph와 schema-specialized predicate kernel을 소유합니다.
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
> generated validator는 **사용자가 제어하는 값을 소스 문자열에 넣지 않습니다**.
> literal, regexp, object key, keyset, dynamic schema fallback은 numeric index로 참조되는 **side table**에 둡니다.
> 적대적인 property name이 generated code 밖으로 탈출할 수 없으며, dedicated injection-audit test가 이 속성을 고정합니다.

---

## 성능 스냅샷

마지막 로컬 벤치마크는 2026-07-04 KST에 실행했습니다.
`npm run bench -- bench/ecosystem.bench.ts --run`을 사용했고, benchmark strict-object 계약을 대상으로 했습니다.
아래 값은 단일 머신의 초당 실행 횟수이며 릴리스 성능 보증값은 아닙니다.

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

safe compiled path는 TypeSea의 적대적 입력 방어를 유지하면서 Ajv에 가깝게 동작합니다.
descriptor 기반 property read, symbol/non-enumerable strict-key rejection, key presence semantics, immutable diagnostics, TypeScript guard inference를 유지합니다.
unsafe와 unchecked compiled mode는 그 방어 계약 일부를 의도적으로 포기하기 때문에 더 빠릅니다.

---

## API 레퍼런스 요약

모든 공개 진입점은 package root에서 export됩니다.
builder는 `t` table 아래에도 묶여 있습니다.

### Builders

| 영역 | Entry points |
| --- | --- |
| Scalar guard | `t.unknown`, `t.never`, `t.string`, `t.number`, `t.date`, `t.bigint`, `t.symbol`, `t.boolean`, `t.null`, `t.undefined`, `t.void` |
| String check | `.min`, `.max`, `.length`, `.nonempty`, `.regex`, `.startsWith`, `.endsWith`, `.includes`, `.uuid`, `.email`, `.url`, `.isoDate`, `.isoDateTime`, `.ulid`, `.ipv4`, `.ipv6` |
| Number check | `.int`, `.finite`, `.safe`, `.gte`, `.lte`, `.min`, `.max`, `.gt`, `.lt`, `.multipleOf`, `.positive`, `.nonnegative`, `.negative`, `.nonpositive` |
| Date check | `.min`, `.max` |
| Literal과 container | `t.literal`, `t.enum`, `t.array`, `t.tuple`, tuple rest, `t.record`, `t.map`, `t.set`, `t.json` |
| Array check | `.min`, `.max`, `.length`, `.nonempty` |
| Object | `t.object`, `t.strictObject`, `extend`, `safeExtend`, `merge`, `pick`, `omit`, `partial`, `deepPartial`, `required`, `strict`, `passthrough`, `strip`, `catchall` |
| Runtime object contract | `t.instanceOf`, `t.property`, `guard.property` |
| Composition | `t.union`, `t.discriminatedUnion`, `t.intersect`, `guard.intersect` |
| Presence wrapper | `t.optional`, `t.undefinedable`, `t.nullable`, `t.nullish` |
| Dynamic contract | `t.lazy`, `t.refine` |

### Decoders

| 영역 | Entry points |
| --- | --- |
| Sync decoder | `t.decoder`, `t.transform`, `t.pipe`, `t.default`, `t.defaultValue`, `t.prefault`, `t.catch`, `t.codec`, `t.coerce`, `t.string.trim()`, `t.string.toLowerCase()`, `t.string.toUpperCase()` |
| Async decoder | `t.asyncDecoder`, `t.asyncRefine`, `t.asyncTransform`, `t.asyncPipe` |

### Execution & Export

| 영역 | Entry points |
| --- | --- |
| Guard method | `guard.is()`, `guard.check()`, `guard.checkFirst()`, `guard.graph()` |
| Generated validator | `compile`, `emitAotModule` |
| JSON Schema | `toJsonSchema` |

### Messages & Adapters

| 영역 | Entry points |
| --- | --- |
| Messages / i18n | `formatIssue`, `formatIssues`, `flattenIssues`, `withMessages`, `defineMessages` |
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
| `catchall` extras | unknown own key는 descriptor로 읽고 catchall schema로 검증합니다. |
| `strip()` | 출력 객체를 복사하지 않는 검증 전용 alias입니다. TypeSea에서는 extra key 허용 의미가 `passthrough()`와 같습니다. |
| `t.date` | 유효한 JavaScript `Date` 객체만 허용합니다. `.min`과 `.max`는 사용자가 덮어쓸 수 있는 Date method를 읽지 않고 epoch millisecond로 비교합니다. |
| `t.map`, `t.set`, `t.instanceOf` | runtime-only contract입니다. JSON Schema와 AOT export에서는 의미를 약화시키지 않고 명시적으로 거부합니다. |
| `property` | own data property만 검증합니다. getter-backed property는 거부합니다. |
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

릴리스 경로:

1. `vX.Y.Z` 태그를 push하거나 GitHub `Release` workflow를 그 태그로 실행합니다.
2. release workflow는 tag가 `package.json`의 version과 일치하는지 확인합니다.
3. publish는 GitHub `Publish` workflow에서 `npm publish --provenance --access public --ignore-scripts`로 수행합니다.

로컬 `NPM_TOKEN` publish는 수동 복구 릴리스용입니다. 이 경우에도 먼저 `npm run release:check`를 통과해야 하며, GitHub OIDC provenance는 붙지 않습니다.

> [!NOTE]
> benchmark 비교 패키지인 Zod, Valibot, Ajv는 dev dependency일 뿐입니다.
> package policy는 이들이 runtime dependency field에 들어가는 것을 거부합니다.
> benchmark suite는 boolean path와 diagnostic path(`check()` vs `safeParse`)를 모두 보고하므로 비교 기준을 맞춥니다.

---

## 문서

- [문서 사이트](https://feralthedogg.github.io/TypeSea/)
- [API 레퍼런스](../api.md)
- [엔진 노트](../engine-notes.md)
- [보안 정책](https://github.com/Feralthedogg/TypeSea/blob/main/SECURITY.md)

---

## 마이그레이션 노트

### 0.3.0에서 0.3.1

애플리케이션 코드 변경은 필요하지 않습니다.
`0.3.1`은 release hardening patch입니다.
manual release tag 처리를 더 엄격하게 만들고, npm provenance 기대치를 문서화하며, security policy를 추가하고, GitHub publish workflow가 끝난 뒤 npm에 새 버전이 실제로 보이는지 확인합니다.

---

## 라이선스

MIT License. 자세한 내용은 [LICENSE](../../LICENSE)를 보세요.
