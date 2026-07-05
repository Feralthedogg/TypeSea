# 엔진 설계 노트

TypeSea는 TypeScript가 JavaScript를 emit한 뒤의 실행 특성을 예측 가능하게 만들기 위해 작성했습니다.
목표는 난해한 코드가 아닙니다.
object shape, allocation site, branch behavior, validation contract가 코드에서 드러나도록 만드는 것이 목표입니다.

## Hot Path 규칙

- per-instance method closure 대신 prototype method를 사용합니다.
- schema, check, issue, IR node variant에는 numeric tag를 씁니다.
- class field는 모든 constructor에서 같은 순서로 초기화합니다.
- successful `is()` validation은 diagnostic allocation을 만들지 않습니다.
- `Issue` object와 path array는 diagnostic이 요청될 때만 할당합니다.
- recursive validation path에서는 indexed loop를 선호합니다.
- object-entry array는 schema construction 중 미리 계산합니다.
- required object field가 data-property descriptor임을 증명한 뒤에는 missing-property fallback을 다시 검사하지 않고 descriptor value를 직접 읽습니다.
- 모든 field가 required인 strict object는 field validation 뒤 own string name과 own symbol 수를 세어 extra를 거부합니다. optional strict object는 전체 key membership scan을 유지합니다.
- `compile()`과 `emitAotModule()`은 safe가 기본입니다. unsafe mode는 명시적 opt-in이며, caller가 getter, prototype, symbol-extra risk를 받아들였을 때 direct property/index load와 own-enumerable strict-key loop를 쓸 수 있습니다.
- constructed guard는 out-of-band로 표시합니다. 정상 receiver는 반복 schema validation을 피하고, forged receiver는 structural check로 fallback합니다.
- object guard 뒤에는 `Readonly<Record<string, unknown>>`을 사용합니다.
- generated-validator literal, regexp, keyset, dynamic fallback은 사용자가 제어하는 값을 source text에 interpolate하지 않고 side table에 저장합니다.

## 타입 시스템 규칙

- `optional(inner)`은 object key가 없어도 된다는 뜻입니다.
- `undefinedable(inner)`은 object shape에서 key가 반드시 존재하지만 value가 `undefined`일 수 있다는 뜻입니다.
- `nullable(inner)`은 value가 `null`일 수 있다는 뜻입니다.
- presence-preserving wrapper는 optional-key semantics를 지우지 않습니다.
- `number`는 finite JavaScript number를 의미합니다.
- 신뢰할 수 없는 입력의 boundary type은 `unknown`만 허용합니다.
- builder validation은 schema가 engine에 도달하기 전의 hard barrier입니다.

## IR 규칙

public schema tree는 builder와 diagnostic collector가 사용하는 semantic source입니다.
boolean validation은 cached `ValidationPlan`을 실행합니다.
schema identity는 Sea-of-Nodes IR로 낮아지고 optimizer를 거치며, plan은 frozen graph와 schema-specialized predicate kernel을 함께 보유합니다.

graph는 장식이 아닙니다.
`compile()`, AOT emission, `Guard.graph()`는 모두 plan이 보유한 optimized graph를 소비합니다.
ordinary `Guard.is()`는 generic node interpreter 대신 sibling schema-specialized kernel을 의도적으로 사용합니다.
가장 흔한 hot path에서는 per-node dispatch와 scratch-slot bookkeeping 비용이 이득보다 크기 때문입니다.

현재 lowering은 pure value node와 predicate node를 hash-cons합니다.
strict object schema는 explicit keyset check를 IR로 낮춥니다.
따라서 extra-key rejection이 out-of-band schema knowledge에 의존하지 않습니다.
required object field와 optional object field는 key presence와 data-property presence를 분리합니다.
이 방식은 accessor-backed property의 getter를 실행하거나 valid value로 잘못 분류하지 않게 합니다.

`Guard.graph()`는 validation plan이 보유한 동일한 optimized graph를 반환합니다.
public graph value는 API 밖으로 나가기 전에 validate되고 freeze됩니다.
첫 optimizer pass는 reachable node elimination을 수행하고 node id를 compact해서 모든 dependency가 존재하는 dense node index를 가리키게 합니다.
`compile()`과 AOT emission은 이 graph를 predicate source로 사용합니다.

array, tuple, record schema는 native composite IR node로 낮아지며, child schema는 child validation plan을 통해 실행됩니다.
`SchemaCheck`는 `lazy`와 `refine` 같은 dynamic schema에 예약되어 있습니다.
graph는 callback 또는 resolver-backed semantics가 필요하다는 사실을 기록하며, 이것을 static predicate인 척하지 않습니다.

## Runtime Compiler

compiled guard는 optimized Sea-of-Nodes graph에서 boolean predicate를 방출하고, failed value용 schema-aware diagnostic collector를 함께 생성합니다.
runtime `is()`는 plan-owned schema-specialized kernel을 사용해 recursive node dispatch와 scratch buffer churn을 피합니다.
`check()`는 먼저 plan predicate로 pass/fail verdict를 얻습니다.
successful value는 diagnostic collection을 건너뛰고, failed value는 diagnostic collector를 replay해서 path와 issue code를 만듭니다.

user-controlled literal, regexp, object key, keyset, dynamic schema, diagnostic name은 generated factory가 capture한 side table에 둡니다.
generated source에는 numeric side-table index, fixed helper string, sanitized function name만 들어갑니다.

semantic이 local한 scalar node는 direct JavaScript test로 emit됩니다.
finite-number check, integer check, string length bound, literal equality, regexp test는 generated hot path에서 helper call 없이 낮아집니다.

array와 record IR node는 indexed loop를 emit합니다.
static child schema는 optimized graph에서 해당 loop 안으로 inline됩니다.
작은 scalar 또는 union element contract에서 function-call boundary를 피하기 위해서입니다.
tuple node는 descriptor-based element access를 보존하고, dynamic edge는 ordinary guard execution과 같은 IR-backed runtime fallback을 사용합니다.
따라서 `lazy`와 `refine`의 동작이 유지됩니다.

strict object IR은 두 가지 shape으로 emit됩니다.
모든 declared key가 required이면 generated validator는 field descriptor read보다 먼저 strict-key count를 실행합니다.
`Object.getOwnPropertyNames(value).length`를 declared key count와 비교하고, `Object.getOwnPropertySymbols(value).length === 0`을 요구합니다.
V8은 generic `Reflect.ownKeys` count보다 이 count-only path를 더 잘 최적화하고, obvious extra-key object를 field descriptor를 만지기 전에 거부할 수 있습니다.
optional strict object는 missing optional key를 final key count만으로 구분할 수 없으므로 full own-key membership scan을 emit합니다.

`compile(..., { mode: "unsafe" })`와 `emitAotModule(..., { mode: "unsafe" })`는 generated predicate를 trusted-data code shape으로 전환합니다.
schema가 `undefined`를 거부하는 required object field는 descriptor 또는 own-key check 없이 direct `value[key]` load를 사용합니다.
`undefined`를 허용할 수 있는 required field는 missing required key가 valid `undefined` value로 collapse되지 않도록 own-key presence guard를 유지합니다.
optional field는 present non-`undefined` value에 direct-load fast path를 쓰고, ambiguous `undefined` case에서만 own-key check로 fallback합니다.

unsafe array, tuple, record, discriminant path도 direct load를 선호합니다.
strict object는 own-key array를 할당하는 대신 `for...in` own-enumerable key loop를 사용합니다.
ASCII identifier object key는 `value.id` 같은 dot-property load로 emit되고, 나머지는 escaped string-literal bracket load로 emit됩니다.
이는 의도적으로 safe mode와 같은 적대적 입력 방어가 아닙니다.
getter가 실행될 수 있고, prototype-backed value가 accepted될 수 있으며, symbol 또는 non-enumerable strict extra가 거부되지 않고, static property name이 unsafe generated predicate source에 나타날 수 있습니다.

`mode: "unchecked"`는 unsafe direct-read shape을 유지하면서 strict extra-key loop를 제거합니다.
caller가 이미 정규화한 object를 위한 trusted-shape path입니다.
이 모드에서 strict object는 더 이상 extra key를 거부하지 않습니다.

fast mode는 successful compiled `check()` result에서 `Object.freeze()`도 제거합니다.
반환 object는 동일한 `{ ok: true, value }` shape을 유지하지만 의도적으로 freeze되지 않습니다.
failed diagnostic은 success hot path 밖에 있고 reporting을 위해 보존되는 일이 많으므로 계속 freeze됩니다.
fast mode의 object diagnostic은 predicate와 같은 direct-read contract에서 생성됩니다.
required field는 `value.key`로 읽고, optional field는 direct load 뒤 `undefined`일 때 own-key fallback을 사용하며, unsafe strict object는 own enumerable string key를 scan하고, unchecked strict object는 strict-key diagnostic scan을 건너뜁니다.
fast mode의 array와 tuple diagnostic은 descriptor probe 대신 direct index로 item을 읽습니다.
record diagnostic은 `record[key]`로 읽습니다.
unchecked mode는 inherited enumerable key를 의도적으로 보이게 둡니다.
discriminant diagnostic은 tag를 직접 읽고 literal string case를 strict equality로 비교합니다.

## 재귀

lazy schema는 guard instance마다 getter를 한 번 resolve합니다.
따라서 recursive validation은 stable schema identity를 보고, 반복 validation이 recursive schema graph를 다시 만들지 않습니다.

recursive validation은 root-local active pair table을 사용합니다.
key는 runtime object identity와 schema identity의 pair입니다.
같은 schema/value pair에 다시 들어오면 그 edge를 short-circuit합니다.
이 방식으로 cyclic object graph도 유한하게 검증하면서, outer frame에서는 원래 object field를 계속 검사합니다.

compiled `lazy`와 `refine` fallback은 같은 IR-backed runtime path를 사용하므로 recursive behavior가 execution engine 사이에서 일관됩니다.

`checkFirst()`는 별도의 generated collector를 사용합니다.
첫 diagnostic이 확정되는 즉시 frozen issue 하나를 반환하며, full `check()` collector를 끝까지 실행한 뒤 issue array를 자르지 않습니다.

## JSON Schema Export

JSON Schema export는 TypeSea schema를 JSON-compatible input value 위에서 의미 손실 없이 표현할 수 있을 때만 성공합니다.
runtime-only concept는 typed `Result` error를 반환합니다.

export diagnostic은 모든 것을 parent container로 collapse하지 않고 failed child slot에 path를 유지합니다.
따라서 nested unsupported schema도 schema tree를 수동으로 재구성하지 않고 바로 조치할 수 있습니다.

literal check는 runtime-plan과 compiled path 모두에서 `Object.is`를 사용합니다.
diagnostic도 `-0`을 포함해 같은 literal formatting을 사용하므로 compiled와 runtime-plan `check()` result가 test에서 byte-for-byte로 비교됩니다.

## Benchmark 범위

benchmark suite는 두 질문을 분리합니다.

- `compile.bench.ts`는 같은 TypeSea schema를 대상으로 TypeSea runtime-plan validator와 compiled validator를 비교합니다.
- `ecosystem.bench.ts`는 하나의 JSON-compatible strict-object contract를 대상으로 TypeSea runtime-plan, TypeSea compiled, Zod, Valibot, Ajv를 비교합니다.

Zod, Valibot, Ajv는 측정용 dev dependency입니다.
`src`에서 import하지 않으며, package policy는 release 전에 runtime, peer, optional, bundled dependency field를 거부합니다.

2026-07-05 KST의 마지막 로컬 벤치마크는 JSON-compatible strict-object benchmark에서 아래 ecosystem path를 보고했습니다.

| Case | TypeSea runtime plan | TypeSea compiled safe | TypeSea compiled unsafe | TypeSea compiled unchecked | Ajv compiled |
| --- | ---: | ---: | ---: | ---: | ---: |
| Valid `is()` | 478,576 hz | 5,109,602 hz | 36,777,097 hz | 42,620,570 hz | 4,238,036 hz |
| Valid `check()` | 424,989 hz | 4,642,948 hz | 37,184,199 hz | 42,487,325 hz | 4,338,063 hz |
| Invalid `is()` | 3,325,603 hz | 43,094,061 hz | 50,738,235 hz | 50,898,012 hz | 30,535,761 hz |
| Invalid `check()` | 405,590 hz | 2,107,460 hz | 3,186,702 hz | 3,509,673 hz | 29,951,403 hz |

benchmark number는 machine-local telemetry입니다.
regression을 잡는 데 유용하지만 고정된 throughput floor를 약속하지 않습니다.
unsafe와 unchecked number는 safe mode와 hostile-input equivalent가 아닙니다.
