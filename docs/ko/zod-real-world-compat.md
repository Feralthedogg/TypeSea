# 실사용 Zod 호환성 코퍼스

이 코퍼스는 공개 TypeScript 저장소의 고정된 commit을 검사하며 소스 자체를
TypeSea 저장소에 포함하지 않습니다. 같은 독립 파일을 원래 Zod import 상태와
TypeSea facade로 교체한 상태에서 각각 컴파일해 새로 발생한 진단만 비교합니다.
이는 소스 호환성 측정이며 Zod 전체 의미가 동일하다는 선언이 아닙니다.

## 요약

| 항목 | 결과 |
| --- | ---: |
| 저장소 | 9 |
| Zod를 import하는 파일 | 1,875 |
| 관측된 Zod 호출 | 28,758 |
| 고유 static path | 41 |
| 고유 fluent method | 50 |
| 컴파일한 독립 파일 | 224 |
| TypeSea 교체로 새로 발생한 진단 | 0 |
| 누락된 static path | 0 |
| 누락된 fluent method | 0 |
| 누락된 declaration export | 0 |

표본에 포함된 독립 파일은 TypeSea 교체로 인한 추가 진단 없이 컴파일됩니다.
회귀 허용치와 declaration export 누락 허용치는 모두 0으로 고정되어 있습니다.
다만 이 결과는 아래 commit과 독립 컴파일이 가능한 파일 범위에 한정됩니다.

## 저장소

| 저장소 | Commit | 라이선스 | Zod 파일 | 호출 |
| --- | --- | --- | ---: | ---: |
| [t3-oss/create-t3-app](https://github.com/t3-oss/create-t3-app/tree/4709861f7e67a15564c0460c13e7b4b6cfcae40d) | `4709861f7e67` | MIT | 19 | 40 |
| [calcom/cal.diy](https://github.com/calcom/cal.diy/tree/f00434927386c9ecdcbd7e6c5f82d22044a245bc) | `f00434927386` | MIT | 510 | 5,373 |
| [hoppscotch/hoppscotch](https://github.com/hoppscotch/hoppscotch/tree/afc2cf181c16e56647b099e5d18cfe55710c6cdd) | `afc2cf181c16` | MIT | 94 | 1,629 |
| [triggerdotdev/trigger.dev](https://github.com/triggerdotdev/trigger.dev/tree/2cac63f13ab151ae408282c44d42f01295cf9f64) | `2cac63f13ab1` | Apache-2.0 | 545 | 12,489 |
| [trpc/trpc](https://github.com/trpc/trpc/tree/340811ba5320637fbaf48fccf3dbfdd258bd34db) | `340811ba5320` | MIT | 147 | 1,511 |
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui/tree/3cdaa6eb2f0da27aca8598cb752c32d840e06940) | `3cdaa6eb2f0d` | MIT | 95 | 874 |
| [payloadcms/payload](https://github.com/payloadcms/payload/tree/fd11d0796117b48d25159119a3e5830c77097f93) | `fd11d0796117` | MIT | 23 | 607 |
| [medusajs/medusa](https://github.com/medusajs/medusa/tree/917ddbe0e56b4e739fa828140cd7973d823d1bbd) | `917ddbe0e56b` | MIT | 170 | 1,849 |
| [supabase/supabase](https://github.com/supabase/supabase/tree/e5df232b44cf0a66d8c10692323ac8934f47e3f3) | `e5df232b44cf` | Apache-2.0 | 272 | 4,386 |

## 호환성 공백

- Static path: 없음
- Fluent method: 없음
- Type export: 없음

여기서 "없음"은 관측된 API 집합을 기준으로 합니다. 코퍼스에 등장하지 않은 Zod
API나 Zod 내부 parser 동작까지 지원한다는 뜻은 아닙니다.

## 자주 사용된 static API

| API | 호출 |
| --- | ---: |
| `string` | 12,291 |
| `object` | 4,939 |
| `number` | 2,545 |
| `coerce.number` | 2,058 |
| `boolean` | 1,771 |
| `array` | 1,333 |
| `literal` | 991 |
| `enum` | 799 |
| `record` | 434 |
| `union` | 380 |
| `discriminatedUnion` | 201 |
| `coerce.date` | 160 |
| `unknown` | 133 |
| `any` | 118 |
| `date` | 105 |
| `preprocess` | 98 |
| `optional` | 90 |
| `nativeEnum` | 85 |
| `lazy` | 38 |
| `coerce.boolean` | 34 |

## 자주 사용된 fluent method

| API | 호출 |
| --- | ---: |
| `optional` | 4,462 |
| `int` | 1,595 |
| `min` | 1,556 |
| `default` | 1,232 |
| `describe` | 654 |
| `nullable` | 509 |
| `max` | 467 |
| `transform` | 350 |
| `safeParse` | 330 |
| `parse` | 306 |
| `trim` | 286 |
| `refine` | 269 |
| `nullish` | 259 |
| `positive` | 223 |
| `catch` | 156 |
| `array` | 133 |
| `or` | 114 |
| `url` | 112 |
| `extend` | 111 |
| `passthrough` | 99 |

## 컴파일 회귀

TypeSea import 교체에서만 발생한 TypeScript 진단은 없습니다.
기계 판독용 전체 결과는 `tools/zod-compat/latest.json`에 기록되며,
`npm run check:zod-real-world`가 0 회귀 예산을 검사합니다.
