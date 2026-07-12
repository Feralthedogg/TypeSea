# SeaFlow 퍼저

SeaFlow는 TypeSea schema를 기준으로 payload를 생성하는 symbolic fuzzer입니다.
불변 schema tree를 거꾸로 읽어서 경계값 테스트, 잘못된 구조 테스트, 적대적 입력
smoke test에 쓸 수 있는 제한된 case를 만듭니다. `typesea/seaflow` subpath로
분리되어 있으므로, 이 subpath를 import하지 않는 production validator bundle에는
포함되지 않습니다.

SeaFlow는 deterministic합니다. random load generator가 아니며, `maxYields`는 목표
개수가 아니라 최대 상한입니다. 작은 schema는 solver가 가진 유한한 edge set을 모두
방출하면 그보다 적은 개수에서 끝날 수 있습니다.

## 기본 사용법

```ts
import { fuzzCases } from "typesea/seaflow";
import { t } from "typesea";

const User = t.strictObject({
  id: t.string.uuid(),
  email: t.string.email(),
  age: t.number.int().gte(0).lte(150)
});

for (const item of fuzzCases(User, { intensity: "high", maxYields: 64 })) {
  console.log(item.kind, item.valid, item.reason, item.value);
}
```

`fuzzCases(schema, options)`는 구조화된 case를 생성합니다.

```ts
interface SeaFlowCase {
  readonly value: unknown;
  readonly valid: boolean;
  readonly kind: "valid" | "invalid" | "security";
  readonly reason: string;
  readonly path: readonly PathSegment[];
}
```

harness가 값만 필요하다면 `fuzz(schema, options)`를 쓰면 됩니다.

## 단위 테스트 패턴

가장 먼저 쓸 만한 테스트는 semantic parity입니다. 생성된 모든 case에 대해
SeaFlow가 schema에서 예측한 verdict와 실제 guard verdict가 같아야 합니다.

```ts
import { describe, expect, test } from "vitest";
import { fuzzCases } from "typesea/seaflow";
import { t } from "typesea";

const User = t.strictObject({
  id: t.string.uuid(),
  email: t.string.email(),
  age: t.number.int().gte(0)
});

describe("user boundary", () => {
  test("schema and generated edge cases agree", () => {
    for (const item of fuzzCases(User, { includeSecurity: true })) {
      expect(User.is(item.value), item.reason).toBe(item.valid);
    }
  });
});
```

비즈니스 로직 테스트에서는 먼저 boundary에서 값을 검증한 뒤, 통과한 값만 service에
넘기는 식이 가장 안전합니다.

```ts
test("accepted payloads do not crash the service", () => {
  for (const item of fuzzCases(User, { includeSecurity: true, maxYields: 128 })) {
    const parsed = User.safeParse(item.value);
    expect(parsed.success, item.reason).toBe(item.valid);

    if (parsed.success) {
      expect(() => createUser(parsed.data)).not.toThrow();
    }
  }
});
```

## 생성되는 case 종류

| Family | Examples |
| --- | --- |
| Valid sample | 최소 valid object, enum member, tuple value, record/map/set value |
| Numeric boundary | minimum, maximum, 경계 바로 밖 값, integer/float confusion, `NaN`, infinity |
| String boundary | minimum/maximum length, empty string, format failure, SQLi/XSS probe string |
| Object structure | required key 삭제, optional key variant, strict-object extra key, object-union hybrid |
| Hostile input | `__proto__`, `constructor`, accessor property, sparse array, reflection trap Proxy, revoked Proxy, symbol/non-enumerable extra |
| Recursive schema | lazy schema는 `maxDepth`에서 멈추므로 재귀 graph도 유한하게 끝납니다 |

safe strict object는 prototype을 따라가지 않고 undeclared own string, symbol,
non-enumerable key를 거부합니다. safe runtime과 compiled path는 `Reflect.ownKeys`
또는 이에 해당하는 own-name plus own-symbol fast path를 사용하므로, undeclared
`__proto__`와 `constructor` data key는 prototype state가 아니라 평범한 extra key로
취급됩니다.

reflection trap이 예외를 내는 Proxy와 revoked Proxy probe는 `extreme` intensity에서만
생성합니다. safe validator가 Proxy trap 실패를 호출자에게 흘리지 않고 false로
닫히는지 검증합니다.

## 옵션

```ts
interface SeaFlowOptions {
  readonly intensity?: "low" | "high" | "extreme";
  readonly maxDepth?: number;
  readonly maxYields?: number;
  readonly includeInvalid?: boolean;
  readonly includeSecurity?: boolean;
}
```

좁은 CI smoke test에는 `intensity: "low"`, 일반 boundary test에는 `high`, 드문
numeric/structural probe까지 보고 싶을 때는 `extreme`을 쓰세요. injection string과
hostile object shape를 제외한 순수 semantic test가 필요하다면
`includeSecurity: false`를 설정하면 됩니다.
