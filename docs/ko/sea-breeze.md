# SeaBreeze Principal Join

SeaBreeze는 `typesea/seabreeze`로 공개됩니다. root entry point에서 다시
export하지 않으므로 일반 validator 사용자에게 arena 기반 inference의 import 비용이나
bundle 비용을 붙이지 않습니다.

SeaBreeze는 TypeSea의 저수준 타입 추론 알고리즘입니다. 두 아이디어를 섞습니다.

- Hindley-Milner 방식의 타입 변수와 union-find 대표 노드.
- 구체 타입 생성자가 맞지 않을 때 최적 공통 타입으로 복구하는 방식.

이 알고리즘은 범용 TypeScript 타입 체커가 아닙니다. TypeSea의 런타임
검증 도메인에서 여러 후보를 가장 작은 유용한 validator shape로 합치는
solver입니다. 중간 타입마다 JavaScript 객체를 만들지 않는 것이 핵심입니다.

## 핵심 규칙

`principalJoin(a, b)`는 고정 arena 안의 node id를 반환합니다.

```txt
Var(x) join T          -> x를 T에 바인딩
Never join T           -> T
Unknown join T         -> Unknown
Number join Number     -> Number
Array<A> join Array<B> -> Array<principalJoin(A, B)>
Object<A> join Object<B>
    -> 양쪽 공통 key는 required,
       한쪽에만 있는 key는 optional,
       공통 field type은 재귀적으로 join
T join U               -> Union<T, U>
```

순수 Hindley-Milner라면 `number`와 `string`에서 실패합니다. 하지만 TypeSea는
validator를 만들어야 하므로 여기서 멈추면 쓸모가 없습니다. 반대로 일반적인
best common type만 쓰면 너무 빨리 넓어집니다. SeaBreeze는 먼저 HM처럼 변수를
바인딩하고, 같은 생성자는 그대로 유지하고, 검증 lattice가 요구할 때만 union을
만듭니다.

## 객체 Join

객체 field는 caller가 intern한 숫자 key id로 정렬되어 저장됩니다. join은
두 포인터 병합입니다.

```txt
{ a: number, b: string }
join
{ a: string, c: boolean }

=
{ a: number | string, b?: string, c?: boolean }
```

이 결과는 `unknown`으로 뭉개는 것보다 정확하고, 두 객체를 그대로 union하는
것보다 TypeSea validator 관점에서 더 좋은 공통 shape입니다.

## 할당 규율

구현은 `src/seabreeze/sea-breeze.ts`에 있습니다.

- 노드는 dense id입니다.
- parent, rank, kind, child, field table은 typed array입니다.
- hot operation은 wrapper 객체가 아니라 number를 반환합니다.
- capacity는 caller가 소유하고 명시적으로 검사합니다.
- field key string interning도 caller 책임입니다.
- 사람이 읽는 형태로 materialize하는 단계는 core solver 밖에 둡니다.

JavaScript에서 주변 reflection은 여전히 할당할 수 있습니다. TypeSea의
zero-cost abstraction 철학에 맞춰 설계한 부분은 solver core입니다.

## 복잡도

정렬된 object shape 기준:

- Scalar join: union-find 때문에 `O(alpha(n))`.
- Array join: element join을 재귀 수행.
- Object join: `O(leftFieldCount + rightFieldCount)`.
- Field storage: 출력 field 하나당 고정 arena slot 하나.

중요한 점은 object common type 추론이 join마다 `Map`이나 임시 field record를
만들지 않는다는 것입니다.

## 공개 Surface

전용 subpath에서 import합니다.

```ts
import {
  createSeaBreeze,
  SeaBreezeArena,
  SeaBreezePresence,
  emitSeaBreezeBooleanSourceBundle,
  seaBreezeReader
} from "typesea/seabreeze";
```

일반 코드에서는 builder API부터 쓰면 됩니다.

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

builder는 의도적으로 얇습니다. primitive method는 canonical numeric node id를
반환하고, `object()`는 key를 intern한 뒤 정렬된 arena field를 append하며,
`compile()`은 direct reader emitter를 호출합니다. `FastUser.is()`가 실행될 때는
builder object가 검증에 참여하지 않습니다.

이 subpath는 arena, typed reader, snapshot helper, schema lowering, graph lowering,
직접 predicate source emitter도 export합니다. `typesea` root에는 export를 추가하지
않으므로 root validator API는 SeaBreeze에 대해 zero-cost입니다.

현재 테스트는 다음을 검증합니다.

- HM 변수 바인딩.
- scalar 충돌 시 union fallback.
- object 최적 공통 shape join.
- array element 변수 전파.
- 고정 capacity 초과 실패.
- 기존 TypeSea JIT 경로로 들어가는 schema lowering.
- 직접 graph lowering과 lowered graph 기반 predicate source emission.
- `Schema`, `Graph`, `GraphNode`를 만들지 않는 직접 reader-to-source emission.

## JIT로 이어지는 Bridge

`src/seabreeze/lower-schema.ts`가 호환성 bridge입니다.

```txt
SeaBreeze arena node
-> lowerSeaBreezeToSchema()
-> BaseGuard(schema)
-> compileBoolean() / compile()
-> 기존 Sea-of-Nodes lower/optimize/JIT emitter
```

이 단계는 일부러 TypeSea `Schema`를 materialize합니다. 그래야 diagnostics,
AOT, optimizer parity, hostile-input mode가 기존 TypeSea 경로를 그대로 탑니다.

lowering은 caller가 소유한 key table을 받습니다.

```ts
const schema = lowerSeaBreezeToSchema(arena, root, {
  keyTable: ["", "id", "name", "flag"],
  objectMode: "strict"
});
```

arena 안에서는 field key가 계속 숫자입니다. bridge 경계에서 key table을
복사하고 검증하므로, caller가 나중에 key table을 mutate해도 schema 의미가
바뀌지 않습니다.

lowering 정책:

- `objectMode`: `"strict" | "passthrough" | "strip"`, 기본값 `"strict"`.
- `unboundVar`: `"unknown" | "error"`, 기본값 `"unknown"`.
- `cycle`: `"unknown" | "error"`, 기본값 `"error"`.
- `unionMode`: `"flatten" | "binary"`, 기본값 `"flatten"`.

`src/seabreeze/lower-graph.ts`는 직접 predicate bridge입니다.

```txt
SeaBreeze arena node
-> lowerSeaBreezeToGraph()
-> optimizeGraph()
-> emitCompiledGraphBooleanSourceBundle()
-> V8 predicate function
```

이 경로는 root `Schema` materialization을 건너뛰고 predicate graph를 만듭니다.
다만 TypeSea의 기존 object, array, union node가 diagnostics와 hostile-input mode
parity를 유지해야 하는 부분에서는 schema payload를 계속 사용합니다.

`src/seabreeze/emit.ts`는 직접 reader emitter입니다.

```txt
SeaBreezeReader
-> emitSeaBreezeBooleanSourceBundle()
-> V8 predicate function
```

이 경로는 `SeaBreezeReader`로 arena metadata를 읽고 predicate source를 바로
생성합니다. TypeSea의 side-table ABI, function naming, debug source formatter,
helper prelude는 그대로 재사용하지만, 중간 `Schema`, `Graph`, `GraphBuilder`,
`GraphNode` record는 만들지 않습니다.

직접 emitter도 기존 JIT emitter와 같은 safety tier 의미를 유지합니다.

- `safe`: own data descriptor만 허용합니다. accessor와 prototype read는 실패합니다.
- `unsafe`: V8 hot path를 위해 direct property read를 씁니다. hostile-input 방어는
  의도적으로 줄어듭니다.
- `unchecked`: unsafe read에 더해 strict excess-key check도 건너뜁니다.
