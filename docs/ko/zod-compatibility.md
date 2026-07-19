# Zod 호환성

TypeSea의 본체는 검증 컴파일러입니다. Zod 형태의 entry point는 TypeSea 엔진 위에
구현한 마이그레이션·생태계 호환 계층이며, Zod의 비공개 parser runtime을 다시
구현한 것이 아닙니다.

## 지원 등급

| 등급 | 의미 | 실행 방식 |
| --- | --- | --- |
| 네이티브 컴파일 | TypeSea가 의미를 소유하고 스키마를 검증 IR로 내립니다. | 인터프리터 계획, JIT, 직렬화 가능한 경우 AOT. |
| 런타임 파이프라인 | decoder, codec, callback 또는 host identity가 필요한 API입니다. | parse/decode에서 실행하며 AOT와 JSON Schema는 거부될 수 있습니다. |
| 호환 shim | 마이그레이션, 타입 참조, 생태계 probe를 위해 export를 제공합니다. | Zod 비공개 엔진 동작까지 보장하지 않습니다. |
| 호환성 공백 | TypeSea가 구현하지 않았거나 의미를 보존할 수 없는 표면입니다. | 호출부를 바꾸거나 Zod를 유지해야 합니다. |

## 호환성 표

| 표면 | 등급 | 설명 |
| --- | --- | --- |
| 원시 타입 builder와 내장 string/number/BigInt/Date check | 네이티브 컴파일 | format, 범위, 정수 검사와 불변 metadata를 포함합니다. |
| object, array, rest tuple, record, map, set, enum, literal | 네이티브 컴파일 | safe object 경로는 own descriptor를 사용하고 적대적 accessor를 거부합니다. |
| union, discriminated union, intersection, optional, nullable, readonly | 네이티브 컴파일 | 정적으로 증명할 수 있는 경우 union preflight와 discriminant dispatch를 최적화합니다. |
| `transform`, `overwrite`, `pipe`, `default`, `prefault`, `catch`, `codec`, `coerce.*`, `preprocess` | 런타임 파이프라인 | 출력이 바뀌는 동작은 decoder와 codec으로 표현합니다. |
| `refine`, `superRefine`, `custom`, `lazy`, function, `instanceof` | 런타임 파이프라인 | callback과 host identity 때문에 standalone emission이 막힐 수 있습니다. |
| error format, flatten, treeify, Standard Schema V1 | 네이티브/런타임 유틸리티 | TypeSea issue를 요청된 외부 형태로 변환합니다. |
| `typesea/v3`, `typesea/v4/core`, class alias, underscore export | 호환 shim | 소스 마이그레이션과 package probe용이며 parser 내부 확장용이 아닙니다. |
| 아직 관측하지 못한 Zod API 또는 TypeSea 테스트에 없는 동작 | 호환성 공백 | 조용히 허용하지 않고 compatibility issue로 다룹니다. |

## 컴파일 경계

`compile()`은 source의 guard 부분에서 boolean 또는 diagnostic validator를
만듭니다. 출력이 바뀌는 decoder 단계는 parse/decode 작업으로 남으며 boolean type
guard인 것처럼 위장하지 않습니다. `emitAotModule()`은 callback, host constructor,
동적 lazy 해석을 의미 손실 없이 직렬화할 수 없으면 구조화된 issue로 실패합니다.

```ts
import { compile, z } from "typesea/v4";

const User = z.object({
    id: z.string().uuid(),
    displayName: z.string().trim().default("anonymous")
});

const isUserInput = compile(User);
const user = User.parse(input);
```

컴파일된 predicate는 guard 경계를 검증합니다. `parse()`는 trim과 default decoder
단계까지 추가로 실행합니다.

## 마이그레이션 정책

1. 릴리스 브랜치가 아니라 테스트 브랜치에서 import를 교체합니다.
2. TypeScript 컴파일과 애플리케이션 검증 테스트를 실행합니다.
3. 런타임 파이프라인과 shim 전용 API를 이 표에서 확인합니다.
4. 외부 입력은 safe mode로 유지합니다.
5. AOT portability가 성공한 뒤에만 `typesea/plugin` 또는 `emitAotModule()`을 사용합니다.

[실사용 호환성 코퍼스](./zod-real-world-compat.md)는 고정된 소스 근거를 기록합니다.
관측된 declaration과 import 교체 컴파일을 측정할 뿐, 전체 의미 동등성을 주장하지
않습니다.
