# Real-world Zod compatibility corpus

Generated: 2026-07-10T20:49:48.310Z

The corpus scans pinned public TypeScript sources without vendoring them.
Counts describe observed Zod usage; compilation diagnostics compare the
same self-contained files before and after replacing Zod imports.
This is a compatibility measurement, not a claim of full semantic parity.

## Summary

| Metric | Result |
| --- | ---: |
| Repositories | 9 |
| Files importing Zod | 1875 |
| Observed Zod calls | 28758 |
| Unique static paths | 41 |
| Unique fluent methods | 50 |
| Self-contained files compiled | 224 |
| New TypeSea diagnostics | 0 |
| Missing static paths | 0 |
| Missing fluent methods | 0 |
| Missing declaration exports | 0 |

The sampled self-contained files compile without replacement-only diagnostics.
This result measures the pinned corpus and does not prove full Zod semantic parity.
The zero budgets prevent later compatibility drift from entering unnoticed.

## Repositories

| Repository | Commit | License | Zod files | Calls |
| --- | --- | --- | ---: | ---: |
| [t3-oss/create-t3-app](https://github.com/t3-oss/create-t3-app/tree/4709861f7e67a15564c0460c13e7b4b6cfcae40d) | `4709861f7e67` | MIT | 19 | 40 |
| [calcom/cal.diy](https://github.com/calcom/cal.diy/tree/f00434927386c9ecdcbd7e6c5f82d22044a245bc) | `f00434927386` | MIT | 510 | 5373 |
| [hoppscotch/hoppscotch](https://github.com/hoppscotch/hoppscotch/tree/afc2cf181c16e56647b099e5d18cfe55710c6cdd) | `afc2cf181c16` | MIT | 94 | 1629 |
| [triggerdotdev/trigger.dev](https://github.com/triggerdotdev/trigger.dev/tree/2cac63f13ab151ae408282c44d42f01295cf9f64) | `2cac63f13ab1` | Apache-2.0 | 545 | 12489 |
| [trpc/trpc](https://github.com/trpc/trpc/tree/340811ba5320637fbaf48fccf3dbfdd258bd34db) | `340811ba5320` | MIT | 147 | 1511 |
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui/tree/3cdaa6eb2f0da27aca8598cb752c32d840e06940) | `3cdaa6eb2f0d` | MIT | 95 | 874 |
| [payloadcms/payload](https://github.com/payloadcms/payload/tree/fd11d0796117b48d25159119a3e5830c77097f93) | `fd11d0796117` | MIT | 23 | 607 |
| [medusajs/medusa](https://github.com/medusajs/medusa/tree/917ddbe0e56b4e739fa828140cd7973d823d1bbd) | `917ddbe0e56b` | MIT | 170 | 1849 |
| [supabase/supabase](https://github.com/supabase/supabase/tree/e5df232b44cf0a66d8c10692323ac8934f47e3f3) | `e5df232b44cf` | Apache-2.0 | 272 | 4386 |

## Compatibility gaps

- Static paths: none
- Fluent methods: none
- Type exports: none

## Most frequent static APIs

| API | Calls |
| --- | ---: |
| `string` | 12291 |
| `object` | 4939 |
| `number` | 2545 |
| `coerce.number` | 2058 |
| `boolean` | 1771 |
| `array` | 1333 |
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
| `null` | 31 |
| `tuple` | 21 |
| `nullable` | 19 |
| `custom` | 14 |
| `instanceof` | 14 |
| `undefined` | 14 |
| `void` | 10 |
| `coerce.string` | 6 |
| `bigint` | 5 |
| `intersection` | 4 |

## Most frequent fluent methods

| API | Calls |
| --- | ---: |
| `optional` | 4462 |
| `int` | 1595 |
| `min` | 1556 |
| `default` | 1232 |
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
| `superRefine` | 78 |
| `email` | 73 |
| `regex` | 66 |
| `merge` | 60 |
| `strict` | 54 |
| `and` | 51 |
| `nonnegative` | 47 |
| `pipe` | 27 |
| `partial` | 26 |
| `uuid` | 25 |

## Compilation regressions

No TypeSea-only diagnostics were produced.
