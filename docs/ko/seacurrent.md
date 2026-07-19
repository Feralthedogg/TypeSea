# SeaCurrent 계획기

SeaCurrent는 exact edge profiling, 선택적 path profiling, CDC 중복 검증과
검증된 변환 scheduling을 위한 TypeSea의 zero-dependency 범용 계획기입니다.
`typesea/seacurrent`에서 별도로 가져오므로 root validator entry와 `is()`, `check()`,
JIT, AOT 실행에는 추가 비용이 없습니다.

## 역할

범용 SeaCurrent 계획기는 특정 컴파일러 IR을 직접 고치지 않습니다.
`SeaCurrentGraphAdapter`가 region을 방향성 CFG와 방향성 의존성 그래프로 변환하고,
계획기는 불변 계측·변환 계획을 반환합니다. TypeSea에는 V8용 변환 adapter가 함께
제공됩니다. 선택형 AOT Bridge는 이 adapter가 선택한 object field 계획을 TypeSea
graph IR에 실제로 lowering할 수 있습니다. Custom compiler의 payload 변경과
rollback은 해당 compiler가 계속 소유합니다.

CFG와 의존성 방향은 항상 보존됩니다. 무방향 shadow graph는 bridge 탐색과
제한된 CDC 탐색 안에서만 사용합니다.

## 계획 파이프라인

```text
adapter region
-> structural hash와 증분 cache 조회
-> spanning tree 기반 exact edge profile
-> 제한된 CDC 인증서 생성과 독립 검증
-> 적응형 path-profile 선택
-> 선택적 변환과 schedule 검증
-> compiler별 IR lowering과 benchmark gate
-> 불변 region plan
```

TypeSea adapter는 `And`, `Or`, `Not`을 predicate emitter와 동일한 continuation
순서로 펼칩니다. 복합 loop와 dispatch는 원자적인 branch로 유지하고 내부 child
graph는 별도 region으로 분석합니다.

## 빠른 시작

```typescript
import { t } from "typesea";
import { createSeaCurrent } from "typesea/seacurrent";

const User = t.strictObject({
    id: t.string.uuid(),
    age: t.number.int().gte(0)
});

const current = createSeaCurrent({
    targetKey: "node-v8",
    maxCacheEntries: 512,
    checksums: true
});

const plan = current.plan(User, {
    frequency: 1_000_000,
    uncertainty: 0.3
});
```

같은 graph를 다시 계획하면 변경되지 않은 region의 구조 분석을 재사용합니다.
프로파일과 학습 점수는 IR이 같아도 달라질 수 있으므로 매번 다시 계산합니다.
계측 세대에 중첩 child region 데이터가 있다면 `planRegions(User, profiles)`를
사용합니다.

일반 TypeSea 코드에서는 `createSeaCurrent()`를 사용하면 됩니다. Adapter, target,
tuner, 고정된 cost-model view와 제한된 planner를 한 번만 생성합니다. `plan()`은
guard나 직접 schema를 받고 `observe()`, `snapshot()`, `load()`, `invalidate()`,
`clear()`는 target key를 반복하지 않고 일반적인 수명주기를 처리합니다.

Facade는 validation 실행 기준 zero-cost입니다. 별도 subpath에 있고 `is()`,
`check()`, JIT, AOT predicate가 이를 보관하거나 호출하지 않습니다. Profile이 없는
`plan(source)`도 같은 정규화 options와 cost-model closure를 재사용합니다. Profile
단축 입력에 필요한 할당은 build control plane에서만 발생합니다.

## 선택형 TypeSea JIT/AOT Bridge

`typesea/seacurrent/aot`는 장수 planner를 TypeSea graph emitter에 연결합니다. 이
기능은 명시적으로 선택해야 합니다. `typesea/seacurrent`만 import하거나 사용하는
경우 predicate는 계측되지 않으며, 일반 compiled predicate에는 SeaCurrent 조건문,
counter table, profile 할당이 전혀 들어가지 않습니다.

```typescript
import { createSeaCurrentAotBridge } from "typesea/seacurrent/aot";

const bridge = createSeaCurrentAotBridge(current);
const profiled = bridge.compile(User, { mode: "safe" });

profiled.is({
    id: "550e8400-e29b-41d4-a716-446655440000",
    age: 42
});

const artifact = profiled.snapshot();
const next = bridge.replan(User, artifact, { uncertainty: 0.1 });
const optimized = bridge.optimize(User, artifact);

const tuned = bridge.tune(User, artifact, representativeInputs, {
    warmupIterations: 20_000,
    iterations: 200_000,
    rounds: 5,
    minSpeedup: 1.02
});

const standalone = bridge.emitOptimized(User, artifact);
profiled.reset();
```

`compile()`은 process 안에서 실행하는 boolean predicate를 만들고 선택한 safe,
unsafe, unchecked 검증 계약을 그대로 유지합니다. `emit()`은 `is()`, `snapshot()`,
`reset()`을 export하는 독립 ESM source와 declaration을 생성합니다. 기존 AOT
이식성 검사는 callback 기반 등 독립 실행이 불가능한 schema를 source 반환 전에
계속 거부합니다.

Bridge는 root와 중첩 region frequency, 완결된 accept/reject 결과, 선택된 exact
edge counter와 검증된 CDC checksum term을 lowering합니다. Counter 저장소는 계측
predicate마다 한 번만 할당하고 artifact는 `snapshot()`을 호출할 때만 만듭니다.
계측 predicate에는 typed array 갱신 비용이 있으므로 제한된 benchmark, canary 또는
profile 세대에서만 사용합니다.

`optimize()`는 artifact를 받아 재계획하고 선택된 TypeSea object node를 재작성한 뒤,
graph를 다시 검증하고 freeze하여 계측 없는 predicate를 생성합니다.
`emitOptimized()`는 같은 graph를 독립 ESM으로 직렬화합니다.
여기서 계측이 없다는 말은 profile counter가 제거된다는 뜻입니다. JIT와 AOT
predicate 모두 revoked proxy와 reflection trap을 거부하는 TypeSea의 기본 fail-closed
경계는 유지합니다. `tune()`은 static baseline과 변환 후보를 모두 warmup하고 측정
순서를 번갈아 가며 median 처리량을
비교합니다. 후보는 `minSpeedup`을 넘을 때만 선택됩니다. 입력 sample 배열은 dense해야
하며 실제 배포 workload를 대표해야 합니다.

Artifact는 version, target, graph structural hash, edge layout과 checksum layout에
묶입니다. `profiles()`와 `replan()`은 `unknown`을 받고 own data property만 읽습니다.
모든 region은 `accepted + rejected === frequency`를 만족해야 합니다. 형식이
잘못됐거나 accessor 기반인 값, revoked proxy, 오래됐거나 내부 count가 맞지 않는
세대, overflow가 발생한 세대는 getter를 실행하지 않고 fail-closed합니다. Profile
수집 중 hostile reflection이 실패해도 해당 세대를 overflow로 표시합니다. 실행이
중단된 중첩 region의 outcome은 완결된 증거로 사용할 수 없기 때문입니다.

내장 변환의 범위는 의도적으로 좁습니다. Safe mode에서 표본이 충분한 field만 순수한
동일 presence `ObjectShape` 구간 안에서 재배치합니다. `lazy`, `refine` 같은 callback
schema에서 생기는 `SchemaCheck`는 이동할 수 없는 장벽입니다. 순서는 graph 비용을
불확실성으로 보정한 실패 확률로 나눈 값이 작은 field부터 정합니다. 표본이 부족한
field는 원래 static 위치에 남습니다. Unsafe와 unchecked Bridge는 profile은 수집하지만
direct property read 순서가 관찰될 수 있어 이 변환을 적용하지 않습니다. Ball-Larus
path bucket은 아직 계획 결과로만 제공됩니다.

## SeaCurrent 운영 방법

SeaCurrent는 HTTP 요청, validation 호출 같은 data plane 핫패스가 아니라 컴파일러나
빌드 control plane에서 실행해야 합니다. 빌드 worker 또는 compiler daemon마다
adapter, planner, tuner를 장수 객체로 만들고 증분 빌드 사이에서 재사용해야 제한된
region cache와 target별 tuner 상태가 의미를 가집니다.

권장하는 빌드 세대별 흐름은 다음과 같습니다.

1. **기준 빌드를 계획합니다.** 변환 추천이 필요 없으면 `transformations: false`를
   지정합니다.
   `status: "unavailable"`, 선택되지 않은 path profile, 없는 transform은 오류가
   아니라 fail-closed 결과로 처리합니다.
2. **계측 빌드를 만듭니다.** 선택형 TypeSea AOT Bridge는 exact counter, region
   outcome과 checksum term을 생성된 JavaScript로 lowering합니다. 선택적인
   Ball-Larus increment는 custom host compiler가 직접 lowering합니다.
3. **제한된 표본을 수집합니다.** 계측 빌드를 benchmark나 canary 배포에서
   실행하고, 집계는 애플리케이션 핫패스 밖에서 수행합니다.
4. **프로파일 세대를 검증합니다.** 알 수 없는 edge id, 누락된 필수 counter,
   checksum 불일치, counter overflow, 다른 structural hash에서 나온 데이터는
   거부합니다. 거부한 세대의 일부만 합치면 안 됩니다.
5. **근거를 실제 코드로 lowering합니다.** TypeSea에서는 `optimize()` 또는
   `emitOptimized()`를 사용합니다. Custom adapter는 자체 payload lowerer를 사용합니다.
6. **측정하고 학습합니다.** 내장 warmup median gate는 `tune()`을 사용하고, 외부
   benchmark나 canary 결과는 `observe()`에 넣습니다. Tuner snapshot은 요청마다가
   아니라 빌드 사이에 저장합니다.
7. **fallback과 함께 승격합니다.** Static predicate를 유지한 채 의미 검증과 성능
   gate를 통과한 후보만 배포합니다. `tune()` 결과에는 선택된 predicate와 두 처리량이
   함께 들어 있어 release 근거로 남길 수 있습니다.

### 프로파일 식별자

저장하는 프로파일은 최소한 application build id, adapter key, target key, region id,
`structuralHash`를 함께 key로 사용해야 합니다. Planner 입력은 편의를 위해 region
id로만 profile을 받으므로 나머지 식별자가 일치하는지 호출자가 먼저 확인해야
합니다. Region id가 같아도 target이나 structural hash가 다르면 profile을 섞을 수
없습니다.

첫 도입은 path profiling 없이 exact edge profiling만 활성화하는 것이 좋습니다.

```typescript
const edgeOnly = createSeaCurrent({
    targetKey: "node-v8",
    checksums: true,
    budget: {
        maxCounterCost: 0
    }
});

const firstGeneration = edgeOnly.plan(User, {
    frequency: 1,
    uncertainty: 1
});

for (const region of firstGeneration.regions) {
    if (region.exactProfile.status !== "exact") {
        continue;
    }

    // Host emitter가 region.exactProfile.counters를 여기서 lowering합니다.
}
```

`maxCounterCost: 0`은 exact edge plan은 유지하면서 path profile 선택만 막습니다.
실측한 counter overhead가 허용 범위일 때 점진적으로 높이세요. 공유 빌드 환경에서는
`maxCdcSearchSteps`, `maxCdcCycles`, `maxPathBuckets`, `maxScheduleII`를 유한하게
유지해야 합니다. 예산 소진은 무제한 재시도 사유가 아니라 정상 fallback입니다.

### Tuner 상태 운영

한 target의 모든 observation은 단위를 고정해야 합니다. 예를 들어 cost는 operation당
nanosecond, size는 emitted byte로 통일하고 `actualValue`는 빌드 시스템이 사용하는
동일한 정규화 benefit 단위로 넣습니다. 단위를 섞거나 개별 outlier를 그대로 넣으면
학습된 가중치가 의미를 잃습니다.

```typescript
const features = {
    frequency: 2_000_000,
    costBefore: 18,
    costAfter: 14,
    sizeIncrease: 192,
    semanticRisk: 0.05
} as const;

current.observe({
    kind: "benefit",
    features,
    actualValue: 7_900_000
});

const tuningArtifact = current.snapshot();
```

Snapshot은 이를 만든 target model과 compiler version 정보와 함께 저장하세요.
`load()` 전에 이 metadata를 검증해야 합니다. 개별 production sample보다 집계한
median이나 trimmed mean을 권장하며, architecture, runtime 또는 비용 단위가 크게
바뀌면 해당 target 상태를 초기화해야 합니다.

### Cache 수명과 관측 지표

`plan.cache.hits`, `misses`, `evictions`, `rebuiltRegions`를 관측하세요. 증분
빌드에서 hit ratio가 낮으면 region id가 불안정하거나 structural hash에 휘발성
데이터가 들어갔거나 cache가 너무 작은 경우가 많습니다. 계측 가능성이 바뀌었는데
structural hash는 그대로라면 custom adapter의 `key`를 올리거나 planner cache를
비우거나 facade의 `invalidate()`를 호출해야 합니다. 저수준 cache 사용자는
`invalidateRegion()`을 직접 호출할 수 있습니다.

Production과 CI dashboard에는 planning latency, cache hit ratio, counter 수와 예상
counter cost, 거부된 profile 세대, path storage mode, 제안·적용된 transform,
emitted code-size 변화, rollback 비율, 예측 benefit과 실측 benefit의 차이를
기록하는 것이 좋습니다. 그래야 planner 회귀와 workload noise 또는 stale profile을
구분할 수 있습니다.

### 안전한 단계적 도입

실용적인 순서는 기준 CI, 계측 benchmark, 소규모 canary, target별 tuning, gate가
있는 승격입니다. Host compiler에 독립적인 의미 검증기와 기준 빌드 fallback이
생기기 전에는 payload 자동 변경을 켜지 마세요. 일반 TypeSea schema에서는 선택형
Bridge를 명시적인 profile 세대에만 사용하세요. Adapter를 import하는 것만으로
JIT가 SeaCurrent plan을 소비하지는 않습니다.

## 저수준 compiler adapter

입력이 LLVM, GCC, MLIR, WebAssembly 또는 다른 compiler 소유 IR이라면
`SeaCurrentPlanner`를 직접 사용합니다. `SeaCurrentGraphAdapter`를 구현하고 target
model과 cost model을 제공한 뒤, 원래 컴파일러에서 불변 결과를 lowering해야
합니다. Facade는 점진적인 migration을 위해 정규화된 `adapter`, `target`,
`planner`, `tuner`를 공개하지만 입력 자체는 TypeSea guard로 제한합니다.

## Exact profile과 CDC

Exact profiler는 개념적인 super-exit으로 exit를 닫고 maximum-weight spanning
tree를 계산합니다. 비싸거나 자주 실행되는 edge는 계측하지 않는 tree에 두고
실제 chord edge에만 합법적인 counter site를 선택합니다. 연결된 tree-complement
인증서로 full-rank 조건을 증명하므로 큰 region에서 조밀한 3차 시간 행렬을
만들지 않습니다.

CDC는 정확한 count의 원천이 아니라 중복 검증 계층입니다. 구현은 bridge 제거,
제한된 simple-cycle 후보 생성, edge당 정확히 두 번인 조합 탐색, 최대 8개
layer 색칠, 연결성·degree·edge id·출현 횟수·label 독립 검증 순서로 진행합니다.
검증 후에만 결정적인 modular checksum을 만듭니다.

탐색 예산을 소진하면 `status: "unavailable"`을 반환합니다. Exact edge
profiling은 계속 사용할 수 있고 부분적인 CDC 결과가 변환에 영향을 주지
않습니다.

## 타깃별 적응형 튜닝

`SeaCurrentAutoTuner`는 target key마다 독립적인 파라미터 상태를 유지합니다. Region
우선순위의 기본식은 다음과 같습니다.

```text
frequency * weightedPipelinePotential * weightedUncertainty
----------------------------------------------------------------
instrumentationCost + codeSizeCost + epsilon
```

변환 이득에서는 학습된 `lambda * sizeIncrease`와
`gamma * semanticRisk`를 차감합니다. `observe()`는 정규화된 online gradient와
상·하한으로 pipeline weight, uncertainty weight, `lambda`, `gamma`, `epsilon`을
조정합니다. 별도 ML 런타임이 필요 없는 결정적인 소형 meta-optimizer입니다.

관측값은 벤치마크나 production profile을 합친 뒤 입력합니다. 학습은 validation
핫패스에서 실행되지 않습니다. `snapshot()`과 `load()`로 상태를 빌드 사이에
이동할 수 있습니다.

## 증분 region cache

`SeaCurrentIncrementalCache`는 adapter, target, region id, structural hash와 분석 예산
버전을 조합해 구조 분석을 저장합니다. Cache hit에서는 CFG와 방향성 의존성 생성,
exact spanning-tree 분석, bridge 탐색과 CDC 후보 생성을 건너뜁니다.

Cache는 크기가 제한된 LRU입니다. `invalidateRegion()`은 한 논리 region의 모든
세대를 제거합니다. 각 plan은 hit, miss, eviction과 실제로 다시 만든 region을
보고합니다. Adapter는 계측 가능성과 변환 의미가 바뀌면 structural hash도
바뀌도록 보장해야 합니다.

## Scheduling과 변환

변환 adapter는 versioning, if-conversion, unroll, vectorize, pipeline 또는 target
고유 변환을 제안할 수 있습니다. 범용 계획기는 후보를 평가하고 검증합니다. 내장
TypeSea adapter는 `optimize()`에 필요한 private graph permutation payload도
소유합니다. 임의의 custom adapter는 host lowerer를 제공하기 전까지 추천 전용입니다.

Pipeline 후보는 recurrence·resource MII 하한과 difference-constraint warm start를
계산합니다. 이후 전체 방향성 의존성과 modulo resource capacity를 다시
검증합니다. 실패하면 설정 한도까지 II를 높이고 끝내 검증되지 않으면 코드를
적용하지 않고 fallback합니다.

일반 V8 target은 machine scheduling을 비활성화합니다. V8이 instruction
scheduling과 register allocation을 소유하기 때문입니다. Native, WebAssembly,
GPU, MLIR adapter는 구체적인 latency와 resource model을 제공할 수 있습니다.

## 보장과 한계

보장하는 항목:

- exact plan은 spanning-tree rank 인증을 만족합니다.
- 독립 검증을 통과한 cover에서만 checksum을 만듭니다.
- schedule 추천은 전체 의존성과 resource 검사를 통과합니다.
- 모든 탐색에는 작업량과 저장 공간 한도가 있습니다.
- 바뀌지 않은 region은 shadow graph를 반복 생성하지 않습니다.
- 일반 TypeSea import와 validation 핫패스에는 SeaCurrent 비용이 없습니다.
- 승격된 TypeSea predicate에는 profile counter나 planner 호출이 없습니다.

보장하지 않는 항목:

- CDC는 exact counter 수의 하한을 낮추지 않습니다.
- 제한된 CDC 탐색은 완전한 범용 CDC 생성기가 아닙니다.
- edge count만으로 임의의 path histogram을 복원할 수 없습니다.
- 순환 CFG의 Ball-Larus에는 adapter가 만든 비순환 SESE fragment가 필요합니다.
- 선택형 TypeSea Bridge는 Ball-Larus path bucket을 lowering하지 않습니다.
- profile 기반 object 순서는 표본이 배포 workload를 대표한다고 가정하므로 명시적인
  승격 gate가 필요합니다.
- 학습 가중치의 품질은 입력 관측값의 대표성에 좌우됩니다.
