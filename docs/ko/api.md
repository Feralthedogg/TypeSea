# TypeSea API 레퍼런스

TypeSea는 신뢰할 수 없는 값을 `unknown`으로 받고, 불변 guard를 통해 타입을 좁힙니다.
공개 API는 작게 유지하고, 복잡한 검증 로직은 builder validation, graph introspection, diagnostics, export check 내부에 둡니다.

## 가져오기

```ts
import {
  analyzeSchema,
  compile,
  emitAotModule,
  schemaRegistryToJsonSchema,
  t,
  toJSONSchema,
  toJsonSchema,
  type GlobalRegistryMetadata,
  type Guard,
  type Infer
} from "typesea";
```

패키지는 root entry point와 `typesea/mini`, `typesea/seaflow`, `typesea/seabreeze`,
`typesea/zod`, `typesea/v3`, `typesea/v4`, `typesea/v4-mini`,
`typesea/v4/mini`, `typesea/locales`,
`typesea/v4/locales`, `typesea/v4/locales/*`, `typesea/v4/core`,
`typesea/plugin`, `typesea/codegen`, `typesea/seacurrent`,
`typesea/seacurrent/aot`를 공개 API로 노출합니다.
깊은 `dist/*` import는 공개 API가 아닙니다. TypeSea는 ESM-only이며
CommonJS condition을 publish하지 않습니다. Zod에서 옮겨오는 코드는 호환
builder namespace를 `z`로 import할 수 있습니다. 이 namespace는 TypeSea
builder를 유지하면서 `z.null()`, `z.undefined()` 같은 인자 없는 호출도
지원합니다. namespace import에서는 소문자 `infer`, `input`, `output` type
alias를 쓸 수 있습니다.

```ts
import { z } from "typesea";
import * as typesea from "typesea";

const User = z.object({ id: z.string.uuid() });
type User = typesea.infer<typeof User>;
type UserInput = typesea.input<typeof User>;
type UserOutput = typesea.output<typeof User>;
type SameUser = typesea.TypeOf<typeof User>;
```

기존 파일이 `import * as z from "zod"` 형태라면 facade subpath를 import하면
됩니다.

```ts
import * as z from "typesea/zod";

const User = z.strictObject({
  id: z.string().uuid(),
  status: z.union([z.literal("active"), z.literal("disabled")])
});

type User = z.infer<typeof User>;
```

`typesea/zod`는 compatibility namespace를 top-level module export로 펼칩니다.
`z.string()`, `z.unknown()` 같은 primitive constructor, `z.union([a, b])`,
`z.nativeEnum`, `z.intersection`, `z.instanceof`, `z.keyof(object)`,
`z.catch(schema, fallback)`, `z.exactOptional(schema)`를 Zod식 namespace
import에서 그대로 사용할 수 있습니다. `exactOptional`은 object key 생략은
허용하지만, inner schema가 허용하지 않는 한 명시적인 `undefined` 값은
거부합니다. `import z from "typesea/zod"` 형태의 default import도 제공합니다.
이 facade는 Zod를 런타임 의존성으로 끌어오지 않습니다. Zod 패키지는 TypeSea
test suite에서 대표 마이그레이션 안전 스키마, 원시값만 다루는 안전한 강제
변환, 디코더 출력 wrapper, 최상위 wrapper, 객체 modifier의 동작을 비교하는
개발용 기준으로만 사용됩니다.
1.x에서 TypeSea는 이 subpath 이름들을 안정적인 마이그레이션 facade로 유지합니다.
다만 이것은 TypeSea guard engine 위에 얹은 best-effort 호환 계층이지, Zod 내부
parser engine이나 앞으로 추가될 모든 upstream 기능을 그대로 복제하겠다는 약속은
아닙니다. 빠진 Zod API는 TypeSea 핵심 검증 계약이 아니라 compatibility gap으로
다룹니다.

[고정된 실사용 코퍼스](./zod-real-world-compat.md)는 공개 저장소 9곳의 Zod 파일
1,875개와 호출 28,758개를 분석합니다. import를 교체해 컴파일하는 독립 파일
224개는 현재 TypeSea만의 추가 진단 0건, 관측된 declaration export 누락 0건을
기록합니다. 이는 고정 commit의 소스 호환성 근거이며 전체 의미 동등성을 선언하는
수치가 아닙니다.

### Zod 호환성 표

정식 지원 등급과 마이그레이션 정책은
[Zod 호환성 가이드](./zod-compatibility.md)에서 관리합니다. 아래 표는 API를
읽을 때 바로 확인할 수 있도록 남긴 요약입니다.

facade는 기존 코드가 이미 Zod식 builder로 작성되어 있을 때 유용합니다. 아래 표는
실제로 기대할 수 있는 지원 범위를 구분합니다. "compiled"는 runtime callback이나
손실 있는 export blocker가 없는 경우 TypeSea의 generated validator path로 내려갈
수 있다는 뜻입니다.

| Surface | Status | Notes |
| --- | --- | --- |
| `z.string()`, `z.number()`, `z.boolean()`, `z.bigint()`, `z.symbol()`, `z.date()` | 지원, compiled | primitive guard는 Zod식 constructor와 alias를 가진 TypeSea guard입니다. |
| string, number, bigint, date, array, set, map, file check | 지원, compiled | `.min()`, `.max()`, `.email()`, `.uuid()`, `.int()`, `.gte()`, `.nonempty()`, `.mime()` 같은 built-in check는 일반 validator pipeline에 남습니다. |
| `z.object()`, `.strict()`, `.loose()`, `.passthrough()`, `.strip()`, `.extend()`, `.pick()`, `.omit()`, `.partial()`, `.required()` | 지원, compiled | `z.object()`는 Zod v4처럼 기본 parse output에서 unknown key를 strip합니다. object decoder는 transform, metadata, refinement 뒤에도 shape 연산을 유지합니다. safe strict object는 prototype을 읽지 않고 undeclared own string, symbol, non-enumerable key를 거부합니다. |
| `z.array()`, `z.tuple()`, tuple rest, `z.record()`, `z.map()`, `z.set()`, `z.enum()`, `z.literal()` | 지원, compiled | container schema는 TypeSea의 presence, tuple, key semantics를 유지합니다. |
| `z.union()`, `z.discriminatedUnion()`, `z.intersection()` | 지원, compiled | guard와 decoder branch를 섞어도 input/output 추론을 유지합니다. branch에 required key나 discriminator가 있으면 object-union preflight가 최적화됩니다. 넓고 겹치는 union은 여전히 branch probing이 필요할 수 있습니다. |
| `z.default()`, `z.prefault()`, `z.catch()`, `z.pipe()`, `z.codec()`, `z.coerce.*`, transform, overwrite | decoder/codec pipeline으로 지원 | output이 바뀌는 동작은 parse/decode API를 사용하세요. 의미를 잃지 않고 표현할 수 없는 경우 JSON Schema export나 standalone AOT는 막힐 수 있습니다. |
| `z.refine()`, `z.superRefine()`, `z.custom()`, `z.lazy()`, `z.function()`, `z.instanceof()` | 런타임 지원, 항상 export 가능하지는 않음 | callback이나 identity에 의존하는 계약은 runtime에서는 검증할 수 있지만, TypeSea가 의미를 보존할 수 없는 경우 AOT/JSON Schema blocker로 취급합니다. |
| `typesea/v4/core`, underscore-prefixed metadata, class alias, v3 shim | 마이그레이션/probe shim | 흔한 package-alias probe와 type reference가 깨지지 않게 하는 계층입니다. Zod private parser engine 복제를 약속하지 않습니다. |
| 앞으로 추가되거나 아직 빠진 upstream Zod API | compatibility gap | 빠진 method는 TypeSea core contract 보장이 아니라 migration issue로 다뤄야 합니다. |

자주 쓰는 Zod top-level check와 transform도 TypeSea식 함수형 helper로
제공합니다. 예를 들어 `z.minLength(2)(z.string())`,
`z.trim()(z.string())`, `z.positive()(z.number())`,
`z.mime("text/plain")`, `z.overwrite(mapper)(schema)` 형태입니다.
같은 helper를 Zod식 check object 코드처럼 `schema.check(...)`에 넘길 수도
있습니다. 예를 들면 `z.string().check(z.minLength(2))`,
`z.string().check(z.trim())` 형태입니다.
plain guard에는 Zod식 instance decode/encode alias도 있습니다:
`schema.decode(value)`, `schema.safeDecode(value)`, `schema.encode(value)`,
`schema.safeEncode(value)` 형태입니다.

Zod 4 subpath를 유지하는 package-alias migration을 위해 TypeSea는 같은 모양의
entry point도 제공합니다.

```ts
import z from "typesea/v4";
import * as zm from "typesea/v4-mini";
import * as nestedMini from "typesea/v4/mini";
import { en, ko } from "typesea/locales";
import { $ZodString } from "typesea/v4/core";
import { en as enLocale } from "typesea/v4/locales/en";

const User = z.object({ id: z.uuid() });
const Name = zm.apply(zm.string(), zm.minLength(1));
const AliasName = nestedMini.apply(nestedMini.string(), nestedMini.maxLength(80));

void en;
void ko;
void $ZodString;
void enLocale;
void User;
void Name;
void AliasName;
```

`typesea/v4/core`는 package-alias migration과 생태계 probe가 깨지지 않도록
Zod 4.4.3의 named export 목록을 맞춘 호환 namespace입니다. 저수준
`$ZodCheck*`와 underscore-prefixed export는 TypeSea의 공개 builder 위에 얹은
compatibility shim이며, Zod 내부 parser engine을 복제한 것은 아닙니다.

`zod/v3`를 import하는 legacy code는 `typesea/v3`로 해석될 수 있습니다. 이
subpath는 TypeSea의 현재 guard engine 위에서 v3 named export set을 제공하는
compatibility facade이며, `ParseStatus` 같은 v3 parser 내부 API는 migration
probe를 위한 가벼운 shim입니다.

번들 크기에 민감한 코드는 큰 root `t`/`z` 호환성 barrel 대신
`typesea/mini`의 함수형 builder를 사용할 수 있습니다.

```ts
import * as mini from "typesea/mini";

const MiniUser = mini.object({
  id: mini.string().uuid(),
  nickname: mini.optional(
    mini.apply(mini.string(), mini.minLength(1), mini.maxLength(80))
  )
});

type MiniUser = mini.Infer<typeof MiniUser>;
```

Mini helper는 curried schema transform입니다.
method chain 없이도 아래처럼 조합할 수 있습니다.

```ts
const Tags = mini.apply(
  mini.array(mini.string()),
  mini.minSize(1),
  mini.maxSize(8)
);

const TrimmedName = mini.apply(
  mini.string(),
  mini.minLength(1),
  mini.trim()
);
```

Zod식 primitive 호출도 받을 수 있습니다. `z.string()`, `z.number()`,
`z.boolean()`, `z.bigint()`, `z.symbol()`, `z.date()`는 각각 같은 primitive
guard를 반환합니다. `z.any()`는 migration 편의를 위한 `z.unknown()` 별칭일
뿐이며, 모든 입력을 통과시키지만 추론 타입은 TypeScript `any`가 아니라
`unknown`입니다.
오래된 Zod 코드에서 쓰던 optional shortcut도 지원합니다.
`z.ostring()`, `z.onumber()`, `z.oboolean()`, `z.obigint()`, `z.osymbol()`,
`z.odate()`는 각각 대응하는 optional primitive guard를 반환합니다.
`ZodString`, `ZodNumber`, `ZodObject`, `ZodArray`, `ZodUnion`, `ZodEnum`,
`ZodPromise` 같은 migration class 이름은 TypeSea 구현 클래스의 별칭으로
export합니다. `ZodTypeAny`, `AnyZodObject` 같은 타입 전용 migration helper도
기존 Zod 표면을 이름으로 참조하는 코드를 위해 제공합니다.
`ZodEmail`, `ZodURL`, `ZodUUID`, `ZodNumberFormat`, `ZodBigIntFormat`처럼
format에 특화된 class 이름은 별도 runtime class가 아니라 같은 TypeSea guard
family를 가리키는 migration alias입니다.
`ZodEffects`, `ZodPipeline`, `ZodTransform`, `ZodDefault`, `ZodCatch`,
`ZodPrefault`, `ZodCodec` 같은 decoder 쪽 이름은 TypeSea의 decoder와 codec
클래스에 매핑됩니다.
`ZodOptional`, `ZodNullable`, `ZodTuple`, `ZodRecord`, `ZodMap`,
`ZodIntersection`, `ZodDiscriminatedUnion`, `ZodReadonly`, `ZodBranded` 같은
wrapper와 container 이름은 TypeSea의 schema-backed guard 클래스에 매핑됩니다.
guard는 migration 도구가 읽기 쉬운 Zod 스타일 `def`, `_def`, `_zod`
metadata도 lazy하게 제공합니다. 의미가 맞는 schema에서는 `typeName`, `type`,
`shape`, `element`, `options`, `innerType`, `keyType`, `valueType`을 볼 수 있고,
`ZodFirstPartyTypeKind`도 같은 enum 형태의 constant table로 export합니다.
guard에는 `schema.type`, `literal.value`, `literal.values`, `record.keyType`,
`record.valueType`, `bigint.minValue`, `bigint.maxValue`, `date.minDate`,
`date.maxDate` 같은 Zod 스타일 metadata property도 직접 노출됩니다. 이 facade는
읽기 전용이며 검증이나 generated predicate 실행에는 사용되지 않습니다.

## Guard 계약

```ts
interface Guard<T> {
  readonly def: ZodDef;
  readonly _def: ZodDef;
  readonly _zod: {
    readonly def: ZodDef;
    readonly traits: ReadonlySet<string>;
    readonly version: { readonly major: number; readonly minor: number; readonly patch: number };
  };
  readonly description: string | undefined;
  readonly type: string;
  readonly keyType: unknown;
  readonly valueType: unknown;
  is(value: unknown): value is T;
  check(value: unknown, options?: Partial<ParseOptions>): CheckResult<T>;
  checkFirst(value: unknown, options?: Partial<ParseOptions>): CheckResult<T>;
  parse(value: unknown, options?: Partial<ParseOptions>): T;
  safeParse(value: unknown, options?: Partial<ParseOptions>): SafeParseResult<T>;
  decode(value: unknown, options?: Partial<ParseOptions>): T;
  safeDecode(value: unknown, options?: Partial<ParseOptions>): SafeParseResult<T>;
  encode(value: unknown, options?: Partial<ParseOptions>): T;
  safeEncode(value: unknown, options?: Partial<ParseOptions>): SafeParseResult<T>;
  parseAsync(value: unknown, options?: Partial<ParseOptions>): Promise<T>;
  safeParseAsync(value: unknown, options?: Partial<ParseOptions>): Promise<SafeParseResult<T>>;
  decodeAsync(value: unknown, options?: Partial<ParseOptions>): Promise<T>;
  safeDecodeAsync(value: unknown, options?: Partial<ParseOptions>): Promise<SafeParseResult<T>>;
  encodeAsync(value: unknown, options?: Partial<ParseOptions>): Promise<T>;
  safeEncodeAsync(value: unknown, options?: Partial<ParseOptions>): Promise<SafeParseResult<T>>;
  spa(value: unknown, options?: Partial<ParseOptions>): Promise<SafeParseResult<T>>;
  isOptional(): boolean;
  isNullable(): boolean;
  assert(value: unknown, options?: Partial<ParseOptions>): asserts value is T;
  graph(): Graph;
  toJSONSchema(options?: Partial<JsonSchemaOptions>): Result<JsonSchema, JsonSchemaExportIssue[]>;
  metadata(value: SchemaMetadataInput): Guard<T>;
  meta(value: SchemaMetadataInput): Guard<T>;
  title(value: string): Guard<T>;
  describe(value: string): Guard<T>;
  example(value: unknown): Guard<T>;
  message(value: string): Guard<T>;
  readonly(): Guard<Readonly<T>>;
  unwrap(): Guard<unknown>;
  nonoptional(): Guard<Exclude<T, undefined>>;
  apply<R>(callback: (guard: this) => R): R;
  clone(): this;
  optional(): Guard<T | undefined>;
  exactOptional(): Guard<T | undefined>;
  undefinedable(): Guard<T | undefined>;
  nullable(): Guard<T | null>;
  nullish(): Guard<T | null | undefined>;
  overwrite<U>(mapper: (value: T) => U): Decoder<U>;
  refine(predicate: (value: T) => boolean, params?: string | RefineOptions): Guard<T>;
  superRefine(callback: (value: T, ctx: SuperRefineContext) => void, name?: string): Guard<T>;
  with(...checks: WithCheckInput<T>[]): Guard<T>;
  transform<U>(mapper: (value: T) => U): Decoder<U>;
  pipe(next: Guard<unknown> | Decoder<unknown>): Decoder<unknown>;
  default(value: T | (() => T)): Decoder<T>;
  prefault(value: unknown): Decoder<T>;
  catch(value: T | (() => T) | ((ctx: CatchContext) => T)): Decoder<T>;
  promise(): AsyncDecoder<T>;
}
```

```ts
interface ParseOptions {
  readonly error?: string | ParseErrorMapper;
  readonly reportInput?: boolean;
}
```

| 메서드 | 용도 | 계약 |
| --- | --- | --- |
| `is` | 빠른 boolean narrowing | 성공 경로에서 진단 객체를 만들지 않습니다. |
| `check` | 실패 이유가 필요한 검증 | 동결된 `Result<T, Issue[]>` container를 반환합니다. |
| `checkFirst` | hot path의 단일 실패 진단 | 같은 `Result` 형태를 반환하되 실패 시 issue를 최대 하나만 담습니다. compiled/AOT guard는 전용 first-fault collector를 사용합니다. |
| `parse` / `safeParse` / `parseAsync` / `safeParseAsync` / `spa` | Zod 스타일 parse 표면 | 예외, tagged result, promise 기반 parse 변형입니다. `spa`는 `safeParseAsync` 별칭입니다. |
| `isOptional` / `isNullable` | schema 수용성 probe | `undefined` 또는 `null`이 일반 검증을 통과하는지 반환합니다. |
| `assert` | 예외가 필요한 연동 지점 | 복사되고 동결된 issue를 담은 `TypeSeaAssertionError`를 던집니다. |
| `graph` | 검증 계획 introspection | validation plan이 보유한 validated, optimized, frozen Sea-of-Nodes graph를 반환합니다. |
| `toJSONSchema` | Zod 스타일 JSON Schema export | lossless JSON Schema emitter를 호출하며 `toJsonSchema()`와 같은 Result 형태를 반환합니다. |
| `metadata` / `meta` / `title` / `describe` / `example` | 문서용 annotation | 검증 의미는 바꾸지 않고, 표현 가능한 경우 JSON Schema annotation으로 전달합니다. |
| `description` | 문서 metadata probe | top-level description metadata를 반환하는 Zod 스타일 property입니다. |
| `type` / `keyType` / `valueType` | Zod 스타일 metadata probe | `type`은 짧은 schema kind label을 반환합니다. `keyType`과 `valueType`은 record/map 계열 schema에서 가능한 경우 child guard를 노출합니다. |
| `def` / `_def` / `_zod` | Zod 스타일 migration metadata | `typeName`, `type`, trait 이름과 함께 schema 의미를 노출할 수 있는 경우 `shape`, `element`, `options`, `innerType`, `keyType`, `valueType` 같은 container field를 담은 frozen facade를 반환합니다. 내부 engine state는 노출하지 않습니다. |
| `register` | 외부 schema metadata | 검증 의미를 바꾸지 않고 schema identity를 key로 삼아 registry에 metadata를 저장합니다. |
| `message` | schema-local 진단 문구 | 하위 schema가 만든 issue에 message가 없을 때 local message를 붙입니다. |
| `readonly` | 성공값 freeze | `is()` 의미는 바꾸지 않고, `check`, `checkFirst`, `parse`, `safeParse`, `assert`가 받아들인 값을 freeze합니다. |
| `unwrap` | wrapper 내부 guard 꺼내기 | optional, undefinedable, nullable, array schema의 payload guard를 반환합니다. annotation wrapper는 건너뛰고, wrapper가 아닌 schema에서는 `TypeError`를 던집니다. |
| `nonoptional` | required 값으로 정규화 | optional presence와 명시적 `undefined` 허용을 제거합니다. nullable schema의 `null` 허용은 유지합니다. |
| `apply` | fluent helper 재사용 | 현재 guard를 helper에 넘기고 helper가 반환한 값을 그대로 반환합니다. |
| `optional` / `exactOptional` / `undefinedable` / `nullable` / `nullish` | Zod 스타일 presence와 nullability wrapper | immutable presence/value wrapper를 만듭니다. `exactOptional`은 object key 생략을 허용하지만, inner schema가 허용하지 않는 한 standalone 또는 own-property `undefined`를 거부합니다. |
| `refine` / `superRefine` / `with` | 의미 검증 | 구조 검증이 끝난 뒤 predicate나 callback check를 붙입니다. |
| `transform` / `pipe` | 값을 생성하는 decode pipeline | decoder를 반환합니다. 원래 guard의 `is()` 의미는 바뀌지 않습니다. |
| `default` / `prefault` / `catch` | Zod 스타일 decode fallback | decoder를 반환합니다. fallback은 `decode()`에서만 적용되고 `is()`에는 적용되지 않습니다. |
| `promise` | Zod 스타일 Promise input | native `Promise` input을 await한 뒤 resolved value를 검증하는 async decoder를 반환합니다. |

diagnostic path에는 object key와 0부터 시작하는 array 또는 tuple index만 들어갑니다.
공개 diagnostic validator는 잘못된 path segment를 거부한 뒤 diagnostic을 API 밖으로 내보냅니다.

parse 계열 API는 Zod처럼 호출별 error customization을 받을 수 있습니다.

```ts
const result = User.safeParse(input, {
  error: (issue) => issue.code === "expected_string"
    ? { message: `${issue.path.join(".")}에는 문자열이 필요합니다` }
    : undefined
});
```

`error`에는 고정 문자열을 넣거나, string, `{ message }`, `undefined`를 반환하는 callback을 넣을 수 있습니다.
schema-level과 check-level message는 Zod 스타일 우선순위에 따라 per-call/global error map보다 높습니다.
따라서 `{ error }`가 있어도 이미 issue에 붙은 schema-level message는 유지됩니다.
`undefined`를 반환하면 아직 message가 없는 issue의 fallback message가 유지됩니다.
이 옵션은 검증 실패 뒤에만 적용됩니다.
따라서 `is()`와 성공한 `check()`는 렌더링된 message를 만들지 않습니다.

primitive builder도 기본 타입 에러 메시지를 받을 수 있습니다. 예를 들어
`t.string({ error: "이름은 문자열이어야 합니다" })`는 `expected_string` issue에만 적용되고,
`.min()`, `.email()` 같은 세부 check는 각자 지정한 메시지를 사용합니다.
check 자체에도 정적 메시지를 저장할 수 있습니다.

```ts
const User = t.object({
  name: t.string({ error: "이름은 문자열이어야 합니다" }).min(1, "이름은 필수입니다"),
  age: t.number("나이는 숫자여야 합니다").int("나이는 정수여야 합니다").gte(0, {
    error: "나이는 0 이상이어야 합니다"
  }),
  email: t.string.email({ error: "올바른 이메일 주소가 아닙니다" }),
  tags: t.array(t.string).nonempty({ message: "태그를 하나 이상 추가하세요" }),
  flags: t.set(t.string).nonempty("플래그를 하나 이상 선택하세요"),
  uploaded: t.file().mime("text/plain", "텍스트 파일만 허용됩니다")
});
```

지원되는 범위는 문자열 길이 check, 문자열 format, custom regex, 숫자 format/정수/bound check, bigint format/bound check, Date bound, 배열 길이 check, set 크기 check, File 크기/MIME check입니다.
정적 check 메시지는 실제 issue를 만든 check에 직접 붙어 있으므로 바깥 `message()` wrapper보다 우선합니다.
호출 시점의 `{ error }` 옵션과 global error map은 schema-level text가 없는 issue에만 message를 렌더링합니다.

## Builder 계열

| 계열 | Builder |
| --- | --- |
| 스칼라 guard | `t.unknown`, `t.never`, `t.string`, `t.number`, `t.int`, `t.int32`, `t.uint32`, `t.float32`, `t.float64`, `t.int64`, `t.uint64`, `t.nan`, `t.date`, `t.bigint`, `t.symbol`, `t.boolean`, `t.null`, `t.undefined`, `t.void` |
| 문자열 검사 | `.min`, `.max`, `.length`, `.minLength`, `.maxLength`, `.nonempty`, `.regex`, `.startsWith`, `.endsWith`, `.includes`, `.uppercase`, `.lowercase`, `.uuid`, `.guid`, `.uuidv4`, `.uuidv6`, `.uuidv7`, `.hash`, `.email`, `.url`, `.httpUrl`, `.hostname`, `.e164`, `.emoji`, `.base64`, `.base64url`, `.hex`, `.jwt`, `.nanoid`, `.cuid`, `.cuid2`, `.xid`, `.ksuid`, `.mac`, `.cidrv4`, `.cidrv6`, `.isoDate`, `.isoDateTime`, `.isoTime`, `.isoDuration`, `.date`, `.datetime`, `.time`, `.duration`, `.ulid`, `.ipv4`, `.ipv6` |
| 최상위 문자열 포맷 | `t.email`, `t.uuid`, `t.guid`, `t.uuidv4`, `t.uuidv6`, `t.uuidv7`, `t.url`, `t.httpUrl`, `t.hostname`, `t.e164`, `t.emoji`, `t.base64`, `t.base64url`, `t.hex`, `t.jwt`, `t.nanoid`, `t.cuid`, `t.cuid2`, `t.xid`, `t.ksuid`, `t.ulid`, `t.ipv4`, `t.ipv6`, `t.mac`, `t.cidrv4`, `t.cidrv6`, `t.isoDate`, `t.isoDateTime`, `t.isoTime`, `t.isoDuration`, `t.iso.date`, `t.iso.datetime`, `t.iso.time`, `t.iso.duration`, `t.hash`, `t.stringFormat` |
| 정규식 프리셋 | `regexes`, `t.regexes`, 그리고 `email`, `html5Email`, `rfc5322Email`, `unicodeEmail`, `domain`, `uuid`, `guid`, `e164`, `nanoid`, `cuid`, `cuid2`, `xid`, `ksuid`, `ulid`, `ipv4`, `ipv6`, `cidrv4`, `cidrv6`, `mac`, `base64`, `base64url`, `hex`, `jwt` |
| 숫자 check | `.int`, `.int32`, `.uint32`, `.float32`, `.float64`, `.finite`, `.isFinite`, `.isInt`, `.safe`, `.gte`, `.lte`, `.min`, `.max`, `.minValue`, `.maxValue`, `.gt`, `.lt`, `.multipleOf`, `.step`, `.positive`, `.nonnegative`, `.negative`, `.nonpositive` |
| BigInt check | `.int64`, `.uint64`, `.gte`, `.lte`, `.min`, `.max`, `.gt`, `.lt`, `.multipleOf`, `.step`, `.positive`, `.nonnegative`, `.negative`, `.nonpositive` |
| Date check | `.min`, `.max` |
| Literal과 container | `t.literal(value)`, `literal.value`, `t.literal([...]).values`, `t.enum(values)`, `enum.options`, `enum.enum`, `enum.extract`, `enum.exclude`, `t.templateLiteral(parts)`, `t.array(item)`, `array.element`, `t.tuple([a, b])`, `tuple.items`, `t.tuple([head], rest)`, `tuple.rest(rest)`, `t.record(value)`, `t.partialRecord(key, value)`, `t.looseRecord(key, value)`, `t.map(key, value)`, `t.set(item)`, `t.file()`, `t.json()` |
| Array check | `.min`, `.max`, `.length`, `.nonempty` |
| Map check | `.min`, `.max`, `.size`, `.nonempty` |
| Set check | `.min`, `.max`, `.size`, `.nonempty` |
| File check | `.min`, `.max`, `.mime` |
| 함수형 helper | `typesea/mini`와 `typesea/zod`: `minLength`, `maxLength`, `length`, `regex`, `startsWith`, `endsWith`, `includes`, `uppercase`, `lowercase`, `trim`, `toLowerCase`, `toUpperCase`, `normalize`, `slugify`, `minSize`, `maxSize`, `size`, `mime`, `gt`, `gte`, `lt`, `lte`, `multipleOf`, `positive`, `negative`, `nonpositive`, `nonnegative`, `overwrite`, `clone` |
| Object | `t.object(shape)`, `t.looseObject(shape)`, `t.strictObject(shape)` |
| Object transform | `object.shape`, `t.extend`, `t.safeExtend`, `t.merge`, `t.pick`, `t.omit`, `t.keyof`, `keyofObject`, `t.partial`, `t.partial(..., { key: true })`, `t.deepPartial`, `t.required`, `t.required(..., { key: true })`, `t.strict`, `t.loose`, `t.passthrough`, `t.nonstrict`, `t.nonpassthrough`, `t.strip`, `t.catchall`, `t.atLeastOneKey`, `t.exactlyOneKey`, `t.oneOfKeys`, 그리고 같은 이름의 object guard method |
| Runtime object contract | `t.instanceOf(Ctor)`, `t.property(base, key, value)`, `guard.property(key, value)` |
| 함수 호출 경계 계약 | `t.function`, `z.function().args(...).returns(...)`, `functionBuilder`, `FunctionContract.parameters`, `FunctionContract.returnType`, `FunctionContract.implement`, `FunctionContract.implementAsync` |
| Composition | `t.union`, `union.options`, `t.xor`, `xor.options`, `t.discriminatedUnion`, `t.intersect`, `guard.intersect`, `guard.and` |
| Presence | `t.optional`, `guard.optional`, `t.exactOptional`, `z.exactOptional`, `guard.exactOptional`, `t.undefinedable`, `guard.undefinedable`, `t.nullable`, `guard.nullable`, `t.nullish`, `guard.nullish`, `guard.nonoptional`, `t.nonoptional` |
| Wrapper introspection | `guard.unwrap`, `t.unwrap`, `guard.apply` |
| Output wrapper | `guard.readonly`, `t.readonly` |
| Dynamic guard | `t.lazy`, `t.custom`, `t.check`, `t.property(key, value)`, `t.refine`, `guard.refine`, `t.superRefine`, `guard.superRefine`, `guard.with` |
| Annotation | `t.metadata`, `t.meta`, `t.title`, `t.describe`, `t.example`, `t.message`, `t.registry`, `t.globalRegistry`, 그리고 같은 이름의 guard method |
| Decoder | `guard.decode`, `guard.safeDecode`, `guard.encode`, `guard.safeEncode`, `guard.transform`, `guard.overwrite`, `guard.pipe`, `guard.default`, `guard.prefault`, `guard.catch`, `t.decoder`, `t.decode`, `t.safeDecode`, `t.encode`, `t.safeEncode`, `t.encodeAsync`, `t.safeEncodeAsync`, `t.transform`, `t.preprocess`, `t.pipe`, `t.default`, `t.defaultValue`, `t.prefault`, `t.catch`, `t.codec`, `t.invertCodec`, `t.codecs`, 내장 codec helper, `t.stringbool`, `t.coerce`, `t.string.trim()`, `t.string.toLowerCase()`, `t.string.toUpperCase()`, `t.string.slugify()`, `t.string.normalize()` |
| Async decoder | `t.asyncDecoder`, `t.decodeAsync`, `t.safeDecodeAsync`, `t.asyncRefine`, `t.asyncTransform`, `t.asyncPipe`, `t.promise` |
| Parse helper | root / `t` / `z` / `typesea/mini` / `typesea/zod`: `parse`, `safeParse`, `parseAsync`, `safeParseAsync`, `spa` |

tuple rest는 builder 인자로 줄 수도 있고, Zod 스타일 fluent call로도 쓸 수 있습니다.

```ts
const RowA = t.tuple([t.literal("row")], t.number.int());
const RowB = t.tuple([t.literal("row")]).rest(t.number.int());

type Row = Infer<typeof RowB>;
// readonly ["row", ...number[]]

RowB.items[0].is("row"); // true
```

builder function은 schema가 validation plan, compiler, AOT emitter, diagnostic collector, JSON Schema exporter로 들어가기 전에 입력을 검증합니다.
위조된 guard-like value, 잘못된 schema tag, 잘못된 predicate, 잘못된 bound, malformed regexp, 잘못된 discriminated union case set은 construction 중 거부됩니다.

허용된 schema는 저장 전에 freeze됩니다.
공개 schema collection field는 변경 가능한 collection object 대신 frozen array와 frozen key lookup record를 사용합니다.

top-level string format helper는 같은 이름의 string method와 같은 의미입니다.
`t.iso.date()`, `t.iso.datetime()`, `t.iso.time()`, `t.iso.duration()`은 기존 top-level ISO helper와 같은 의미를 가진 Zod 호환 별칭입니다.
`t.hash`는 `hex`, padding이 있는 `base64`, padding이 없는 `base64url` digest 길이를 강제합니다.
string의 `date()`, `datetime()`, `time()`, `duration()`은 같은 ISO method를 부르는 fluent 별칭입니다.
`minLength`, `maxLength`, `minValue`, `maxValue`, `isInt`, `isFinite`는 Zod 스타일 읽기 전용 metadata property입니다. string guard와 number guard는 Zod 스타일 `type`, `format` metadata도 노출합니다.
bigint guard는 `format`, `minValue`, `maxValue`, Date guard는 `minDate`, `maxDate`를 노출하고, record/map 계열 guard는 가능한 경우 `keyType`과 `valueType`을 노출합니다.
`t.stringFormat(name, regexp)`는 일반 string regex check로 낮아지고, predicate callback을 넘기면 dynamic refinement가 되므로 lossless export에서는 runtime-only contract로 취급됩니다.

string format은 정규식으로 낮출 수 있는 Zod 스타일 옵션을 지원합니다.
`uuid({ version })`, `email({ pattern })`, `url({ protocol, hostname })`, `url({ normalize: true })`, `iso.datetime({ offset, local, precision })`, `iso.time({ precision })`, `mac({ delimiter })`, `jwt({ alg })`을 사용할 수 있습니다.
기본 `iso.datetime()`은 끝의 `Z`를 요구합니다. `+05:30` 같은 offset은 `offset: true`, timezone suffix 없는 local datetime은 `local: true`로 켭니다.
`jwt({ alg })`는 compact JWT shape를 먼저 확인한 뒤 base64url header의 `alg` field를 예외 없이 읽어 비교합니다.
`url({ normalize: true })`는 검증 뒤 `new URL(input).href`를 출력하므로 guard가 아니라 decoder를 반환합니다.
`regexes` namespace는 `t.regexes`로도 노출됩니다. `email({ pattern: regexes.html5Email })`,
`url({ hostname: t.regexes.domain })`처럼 Zod 스타일 정규식을 재사용할 수 있습니다.

literal array는 일반 literal union으로 낮아지고 읽기 전용 `.values` facade를 노출합니다.
`t.enum()`은 Zod 스타일 `.options`, `.enum`, `.extract()`, `.exclude()` helper를 가진 `EnumGuard`를 반환합니다.
TypeScript numeric enum의 reverse-map entry는 construction 단계에서 제외합니다.

`t.record(key, value)`는 `key`가 `t.enum(["id", "name"])`이나
`t.literal(["id", "name"])`처럼 닫힌 문자열 literal domain이면 모든 key가
반드시 있어야 합니다. 해당 key들이 선택 사항이면 `t.partialRecord(key, value)`를
사용합니다. 숫자 key schema는 객체 key 문자열을 finite number로 해석한 뒤
검증합니다. 예를 들어 `t.record(t.number.int().gte(0), value)`는 `"0"`은
통과시키고 `"1.5"`는 거부합니다. 패턴 key나 넓은 string key는 기존처럼 존재하는
key만 검증합니다.

`z` 호환 namespace는 `z.nativeEnum`을 `t.enum`의 alias로,
`z.intersection`을 `t.intersect`의 alias로, `z.instanceof`를
`t.instanceOf`의 alias로 제공합니다. `z.union([a, b])`와 `z.xor([a, b])`처럼
Zod 스타일 tuple input도 받을 수 있습니다.
`z.discriminatedUnion("kind", [A, B])`도 각 branch가 literal `kind`를
구조적으로 요구할 때 사용할 수 있습니다. string뿐 아니라 number, boolean,
null, undefined literal discriminator도 지원합니다.
`z.string()`과 `z.number()` 같은 primitive constructor 호출도 지원합니다.
`z.any()`는 migration 안전성을 위해 TypeSea의 `unknown` 의미로 매핑됩니다.
`z.ostring()`, `z.onumber()` 같은 legacy optional shortcut도 오래된
Zod 스타일 코드 이식을 위해 지원합니다.

`t.custom<T>()`는 외부 코드에서 이미 증명된 값을 TypeSea 타입 경계로 들여오는
`unknown` 기반 guard를 만듭니다. predicate를 넘기면 `refine()`과 같은
strict-true 규칙으로 검증하고, 두 번째 인자는 기존 label 문자열이나 Zod식
`{ error, path, abort, when }` refinement 옵션을 받을 수 있습니다.
`t.looseRecord(key, value)`는 enumerable own string key 중 `key` guard를 통과한 key에 대해서만 value를 검증하고, 맞지 않는 key는 값 검증 없이 통과시킵니다.

함수 계약은 IR schema node가 아니라 호출 경계 wrapper입니다.
인자를 decode한 뒤 구현 함수를 호출하고, `output` source가 있으면 반환값도 decode합니다.

```ts
const NameLength = t.function({
  input: [t.string.trim().pipe(t.string.min(1))],
  output: t.number.int().nonnegative()
});

const lengthOfName = NameLength.implement((name) => name.length);
```

예전 Zod 스타일의 함수 wrapper를 옮길 때는 옵션 없이 `z.function()`을
호출하고 체인 문법을 유지하면 됩니다.

```ts
const LegacyNameLength = z.function()
  .args(t.string.trim().pipe(t.string.min(1)))
  .returns(t.number.int().nonnegative());

const legacyLengthOfName = LegacyNameLength.implement((name) => name.length);

LegacyNameLength.parameters(); // 읽기 전용 인자 source tuple
LegacyNameLength.returnType(); // 출력 source
```

`implementAsync()`는 async 구현을 받아 resolved output까지 검증합니다.
입력 실패는 숫자 인자 index 아래에, 출력 실패는 `"return"` 아래에 issue path가 붙습니다.
함수 wrapper는 integration boundary이므로 실패 시 `TypeSeaAssertionError`를 던집니다.

## 객체 key 존재 규칙

TypeSea는 key가 존재하는지와 value domain을 분리합니다.

```ts
const Shape = t.object({
  name: t.optional(t.string),
  nickname: t.undefinedable(t.string)
});

const RequiredName = t.optional(t.string).nonoptional();
const MaybeNick = t.string.nullish();
const ArrayItem = t.array(t.number.int()).unwrap();
const Percent = t.number.apply((schema) =>
  schema.int().gte(0).lte(100));
```

- `name`은 없어도 됩니다. 존재한다면 값은 string이어야 합니다.
- `nickname`은 반드시 존재해야 합니다. 값은 string 또는 `undefined`일 수 있습니다.
- `t.nullable(inner)`는 value domain에 `null`을 추가합니다.
- `t.nullish(inner)`와 `guard.nullish()`는 nullable value와 optional key 의미를 함께 제공합니다.
- `nonoptional()`은 optional key와 명시적 `undefined` 허용을 제거합니다.
  단, nullable schema였다면 `null` 허용은 유지합니다.
- `unwrap()`은 optional, nullable, undefinedable, array item의 내부 guard를 꺼냅니다.
  metadata, message, brand, readonly, refinement wrapper는 내부 payload를 가리지 않도록 건너뜁니다.
- `apply()`는 Zod 스타일 helper hook입니다. schema node를 만들지 않고 현재 guard를 callback에 넘긴 뒤 callback 결과를 그대로 반환합니다.
- `nullable`, `undefinedable`, `brand`, `refine`, `superRefine`을 지나도 optional-key 의미는 보존됩니다.

object combinator는 object mode를 보존합니다.
strict object guard는 `extend`, `pick`, `omit`, `partial` 이후에도 strict를 유지하고, passthrough object guard는 unknown key 허용을 유지합니다.
`t.looseObject(shape)`는 기본 passthrough `t.object(shape)` mode를 명시적으로 드러내는 별칭입니다.
`loose()`와 `nonstrict()`는 object guard를 passthrough mode로 바꾸고, `nonpassthrough()`는 `strict()`와 같은 Zod migration 별칭입니다.

`object.shape`는 선언된 field guard map을 freeze해서 노출합니다.
`partial()` 같은 derived shape도 노출된 guard가 optional field presence를 그대로 검증합니다.

`catchall(schema)`는 선언되지 않은 모든 own key를 `schema`로 검증합니다.
`strip()`의 boolean 검증은 `passthrough()`처럼 extra key를 허용하지만,
`check`, `parse`, `safeParse` 같은 성공 출력 경로에서는 선언된 own data field만
남긴 새 객체를 반환합니다. 원본 input 객체는 mutate하지 않습니다.
`pick`과 `omit`은 key array와 Zod 스타일 `{ key: true }` mask를 모두 받습니다.
`partial`과 `required`도 같은 mask 형식을 받아 선택한 field만 required/optional presence를 바꿉니다.
`deepPartial()`은 순수 object, array, tuple, tuple rest, record, map, set, property, union, intersection, nullable, undefinedable, optional, brand, metadata, message, keyed-object schema를 재귀적으로 partial 처리합니다.
lazy와 refinement schema는 callback 의미를 보존하기 위해 semantic barrier로 둡니다.

`property`는 own data descriptor만 검증합니다. 안정적인 class field를 증명할 때 쓰기 좋고, prototype getter나 accessor property는 실행하지 않고 거부합니다.

`atLeastOneKey(keys)`는 object schema가 통과한 뒤 선택한 key 중 적어도 하나의 own data property가 있어야 한다는 규칙을 붙입니다.
`exactlyOneKey(keys)`는 정확히 하나만 있어야 한다는 규칙이고, `oneOfKeys(keys)`는 같은 의미의 alias입니다.
여러 optional key 중 하나가 필요하다는 조건을 넓은 object union으로 표현하는 대신 이 helper를 쓰는 쪽이 더 빠르고 명확합니다.

```ts
const Contact = t.object({
  email: t.optional(t.string.email()),
  phone: t.optional(t.string.min(1))
}).oneOfKeys(["email", "phone"]);
```

key-rule은 data descriptor만 셉니다.
safe mode에서는 getter-backed field를 실행하지 않으며, 그런 field는 선택된 key가 존재한 것으로 인정하지 않습니다.

`ObjectGuard.keyof()`와 `t.keyof(ObjectGuard)`는 선언된 object key만 허용하는 literal-union guard를 만듭니다.
빈 object shape에서는 `never` guard를 반환합니다.

## 합성

`t.union(a, b)`는 적어도 한 branch를 만족하는 값을 허용합니다.
`t.xor(a, b)`는 정확히 하나의 branch만 만족하는 값을 허용합니다.
둘 이상이 동시에 통과하는 overlap 값은 첫 branch를 고르지 않고 실패합니다.

```ts
const Contact = t.xor(
  t.object({ email: t.string.email() }),
  t.object({ phone: t.string.min(1) })
);
```

`t.templateLiteral(parts)`는 지원되는 literal, scalar, literal union 조각을 하나의
anchored regular expression으로 낮춥니다. string schema 조각은 빈 문자열도
받고 JavaScript `string.length` 의미의 length check를 보존합니다.
literal과 enum 조각은 출력 타입을 literal 그대로 보존하며, `number.int()`
조각은 정수 전용 pattern으로 낮춥니다.

```ts
const OrderId = t.templateLiteral([
  "order_",
  t.union(t.literal("prod"), t.literal("dev")),
  "_",
  t.number.int()
]);

type OrderId = Infer<typeof OrderId>;
// `order_prod_${number}` | `order_dev_${number}`

const CssSize = t.templateLiteral([
  t.number,
  t.enum(["px", "em", "rem"])
]);

type CssSize = Infer<typeof CssSize>;
// `${number}px` | `${number}em` | `${number}rem`

const Tag = t.templateLiteral(["tag:", t.string.min(2).max(4), "!"]);

Tag.is("tag:ab!");    // true
Tag.is("tag:abcde!"); // false
```

`refine`, `superRefine`, `with`는 구조 검증이 끝난 뒤 의미 검증을 붙입니다.
조건 하나면 `refine`이 간단하고, 여러 줄의 검사 로직에서 실패를 표시하고
싶다면 `superRefine`에서 `context.addIssue()`를 호출하면 됩니다.
`refine()`의 두 번째 인자는 생략할 수 있고, 기존 label 문자열 또는
`{ error, path, abort, when }` 객체도 받을 수 있습니다. `superRefine()`의
label도 생략할 수 있으며, 생략 시 내부 expected label은 `"refinement"`입니다.
Zod의 callback check를 옮길 때는 `with(({ value, issues }) => ...)`를 쓰면 됩니다.
`t.check(callback)`은 `guard.with(t.check(...))`에 넘길 수 있는 재사용 가능한
check source를 만듭니다. TypeSea에서 `guard.check(value)`는 Result를 반환하는
검증 메서드이므로, Zod 스타일 reusable check 생성은 builder namespace에 둡니다.
`t.property(key, guard)`는 `guard.with(...)`에 넘기는 Zod 스타일 property source입니다.
public property를 읽으므로 string length 검사나 instance getter 검사를 semantic
check로 표현할 수 있습니다. `t.property(base, key, guard)`와
`base.property(key, guard)`는 적대적 입력 경계를 위한 runtime contract입니다.
이 형태는 own data property만 허용하고 사용자 getter를 실행하지 않습니다.
`addIssue()`는 인자를 생략하면 기본 refinement issue를 냅니다.
문자열을 넘기면 message shorthand로 쓰고, `{ path, message }`를 넘기면 현재 refinement 위치를 기준으로 한 상대 path와 message를 직접 지정할 수 있습니다.
`with()`의 `issues.push()`는 Zod 스타일 `{ code, input, message }` 같은 payload를 받을 수 있지만, TypeSea issue에는 `message`와 상대 `path`만 복사합니다.

```ts
const Range = t.object({
  min: t.number,
  max: t.number
}).superRefine((value, context) => {
  if (value.min > value.max) {
    context.addIssue({
      path: ["max"],
      message: "max는 min보다 크거나 같아야 합니다"
    });
  }
}, "ordered_range");

const LongName = t.string.with(({ value, issues }) => {
  if (value.length <= 3) {
    issues.push({
      code: "custom",
      input: value,
      message: "네 글자 이상이어야 합니다"
    });
  }
});

const LongEnough = t.check<string>(({ value, issues }) => {
  if (value.length <= 3) {
    issues.push("네 글자 이상이어야 합니다");
  }
});

const ReusedLongName = t.string.with(LongEnough);
```

`t.discriminatedUnion("kind", cases)`의 object-map form은 빠른 table dispatch를 위해 string case key를 사용합니다.
각 object-map case는 static하게 inspect할 수 있는 object case여야 하며, dispatch key는 case name과 일치하는 required string literal이어야 합니다.
Zod 스타일 case-array form은 branch 안의 literal을 직접 읽으므로 number, boolean, null, undefined discriminator literal도 지원합니다.

`t.intersect(a, b)`, `guard.intersect(other)`, Zod 스타일 alias인
`guard.and(other)`는 같은 input value가 두 guard를 모두 만족해야 합니다.
`check()`는 양쪽 diagnostic을 모두 수집합니다.

## 재귀

재귀 계약에는 `t.lazy`를 사용할 수 있습니다. object field가 자기 자신을
가리키는 형태라면 Zod 스타일 getter 패턴도 사용할 수 있습니다. 이 getter는
schema 정의용 thunk라서 object guard를 만드는 동안 실행되지 않습니다.

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

interface Category {
  readonly name: string;
  readonly subcategories: Category[];
  readonly parent?: Category;
}

const Category: Guard<Category> = t.object({
  name: t.string,
  get subcategories(): Guard<Category[]> {
    return t.array(Category);
  },
  get parent(): Guard<Category, "optional"> {
    return t.optional(Category);
  }
});
```

직접 순환하는 schema object는 builder boundary에서 거부됩니다.
lazy guard는 guard instance마다 한 번 resolve되고 recursive schema identity를 안정적으로 유지합니다.
lazy chain은 결국 concrete non-lazy schema로 resolve되어야 합니다. runtime input에
대한 getter 정책은 바뀌지 않습니다. safe validation은 accessor-backed input
property를 실행하지 않고 계속 거부합니다.
object shape getter가 `t.optional(...)`로 resolve되면 field는 optional key로
취급됩니다. required guard로 resolve되면 key가 없을 때 실패합니다.

`refine`과 `superRefine`은 구조 검증 뒤에 붙이는 의미 검증입니다.
boolean predicate만 필요하면 `refine`을 쓰고, 여러 issue나 상대 path를
직접 보고해야 하면 `superRefine`을 씁니다. `refine`은 두 번째 인자를 생략하거나,
기존 label 문자열 또는 `{ error, path, abort, when }` 옵션 객체를 받을 수
있습니다. `superRefine`의 label도 생략할 수 있습니다. 생략하면 내부 expected
label은 `"refinement"`입니다. `error`는 issue message가 되고, `path`는
refinement node 기준의 상대 경로입니다.
`when({ value, issues })`는 원본 value와 inner diagnostic pass에서 만들어진
frozen issue snapshot을 받아, literal `true`를 반환할 때 predicate를 실행합니다.

```ts
const PasswordForm = t.object({
  password: t.string,
  confirm: t.string
}).refine((value) => value.password === value.confirm, {
  error: "비밀번호가 일치하지 않습니다",
  path: ["confirm"],
  abort: true,
  when: ({ value }) => t.object({
    password: t.string,
    confirm: t.string
  }).safeParse(value).success
});
```

## Registry

registry는 검증 동작을 바꾸지 않고 schema identity에 호출자 소유 metadata를 붙입니다.
문서 생성, OpenAPI 연동, form label, 내부 도구용 annotation처럼 validation contract와 분리해야 하는 정보를 담기에 적합합니다.

```ts
const Docs = t.registry<{ title: string; order: number }>();

User.register(Docs, { title: "사용자", order: 1 });
t.globalRegistry.add(User, {
  id: "User",
  title: "사용자",
  description: "애플리케이션 사용자 payload"
});
```

registry key는 schema identity입니다.
같은 shape를 다시 만들어도 새 schema identity이므로 registry metadata는 공유되지 않습니다.

## Standard Schema

모든 guard, decoder, codec은 Standard Schema V1 `~standard` property를 노출합니다.
이 property는 freeze되어 있으며 `version: 1`, `vendor: "typesea"`,
`validate(value)`를 담습니다.

```ts
const User = t.object({
  id: t.string.min(1)
});

const result = User["~standard"].validate({ id: "u_1" });
```

`validate`는 성공 시 `{ value }`, 실패 시 `{ issues }`를 반환합니다.
TypeSea의 frozen issue는 `message`와 `path`를 가진 Standard Schema issue로
변환됩니다. 도구 연동 코드에서 compile-time input/output type이 필요하면
`StandardSchemaV1InferInput<T>`, `StandardSchemaV1InferOutput<T>`를 사용하세요.

Standard Schema를 소비하는 framework에는 guard 객체 자체를 넘길 수 있습니다.
Hono는 `@hono/standard-validator`로 이 경로를 제공하고, tRPC도 사용 가능한 경우
Standard Schema interface를 사용합니다.

```ts
import { sValidator } from "@hono/standard-validator";

app.post("/users", sValidator("json", User), (c) => {
  const body = c.req.valid("json");
  return c.json(body);
});
```

## Decoder Pipeline

```ts
const Count = t.coerce.number().int().gte(0);
const result = Count.decode("42");
const Name = t.coerce.string().trim().min(1);
const CreatedAt = t.coerce.date().min(new Date("2020-01-01T00:00:00.000Z"));

const Port = t.number.int().gte(0).lte(65535).default(3000);
const SafePort = t.number.int().gte(0).lte(65535).catch(3000);
const SafeName = t.string.min(3).catch((ctx) =>
  ctx.error[0]?.code === "expected_min_length" ? "anonymous" : "guest"
);
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
const TextNumber = t.invertCodec(NumberText);
const BuiltInCount = t.codecs.stringToNumber();
const BuiltInCreatedAt = t.stringToDate();
```

decoder는 output을 생성하는 작업에 씁니다.
`decode()`에서 `Result`를 반환하며 `is()` predicate를 노출하지 않습니다.
decoded output이 input과 같은 runtime value가 아닐 수 있기 때문입니다.
decoder와 codec instance는 Zod migration을 위해 `parse`, `safeParse`,
`parseAsync`, `safeParseAsync`, `spa`도 제공합니다.
async decoder instance는 같은 목적의 `parseAsync`, `safeParseAsync`, `spa`를
제공합니다.

- `t.transform(source, mapper)`는 `source`를 decode한 뒤 decoded value를 map합니다.
- transform mapper는 두 번째 인자로 Zod 스타일 context를 받습니다.
  `context.issues.push({ message, path, ...extra })` 또는
  `context.addIssue({ message, path })`를 호출하면 decoder가 실패합니다.
  `z.NEVER`를 반환하면 추론된 출력 타입을 넓히지 않은 채 mapper를 중단합니다.
- `t.success(source)`와 `z.success(source)`는 `source`를 decode한 뒤 `true`를 반환합니다.
- `t.preprocess(mapper, source)`는 raw input을 먼저 map한 뒤 `source`로 검증합니다.
- `t.pipe(source, next)`는 성공한 decoded value를 다음 guard 또는 decoder에 넘깁니다.
- `t.default(source, value)`는 input이 `undefined`일 때 fallback output을 바로 반환합니다.
- `t.prefault(source, value)`는 input이 `undefined`일 때 fallback input을 source에 다시 통과시킵니다.
- `t.catch(source, value)`는 decode 실패 시 대체 출력값을 반환합니다.
  fallback은 `(ctx) => value` 형태의 함수도 받을 수 있고, `ctx.error`에는
  실패한 decode에서 나온 frozen issue list가 들어 있습니다.
- `guard.transform`, `guard.overwrite`, `guard.pipe`, `guard.default`, `guard.prefault`, `guard.catch`는 같은 decoder helper의 method shorthand입니다. `guard.is()` 의미를 바꾸지는 않습니다.
- `t.decode`, `t.safeDecode`, `t.encode`, `t.safeEncode`, `t.decodeAsync`, `t.safeDecodeAsync`, `t.encodeAsync`, `t.safeEncodeAsync`는 decoder와 codec pipeline을 실행하고 TypeSea `Result`를 반환하는 top-level helper입니다.
- `decoder.parse(value)`는 decoded output을 반환하거나 `TypeSeaAssertionError`를 던집니다. `decoder.safeParse(value)`는 `decode()` 의미를 바꾸지 않고 `success/data` 또는 `success/error`를 반환합니다.
- `t.codec(input, output, mapping)`은 양방향 decode/encode 양쪽을 모두
  검증합니다. `t.invertCodec(codec)`은 mapping을 새로 만들지 않고 그 방향을
  뒤집습니다.
- `t.codecs.stringToNumber()`, `t.codecs.stringToInt()`,
  `t.codecs.stringToBigInt()`, `t.codecs.numberToBigInt()`,
  `t.codecs.stringToDate()`, `t.codecs.isoDatetimeToDate()`,
  `t.codecs.epochSecondsToDate()`, `t.codecs.epochMillisToDate()`,
  `t.codecs.utf8ToBytes()`, `t.codecs.bytesToUtf8()`,
  `t.codecs.base64ToBytes()`, `t.codecs.base64urlToBytes()`,
  `t.codecs.hexToBytes()`, `t.codecs.jsonCodec()`, `t.codecs.stringToURL()`,
  `t.codecs.stringToHttpURL()`은 경계값 변환에 자주 쓰는 양방향 변환을
  제공합니다. 같은 builder를 top-level `t.*` helper로도 사용할 수 있습니다.
- decoder와 codec child는 `t.object()`, `t.strictObject()`, `t.array()`,
  `t.tuple()`, `t.record()`, `t.map()`, `t.set()` 안에 넣을 수 있습니다.
  단방향 child decoder가 있으면 container builder는 decoder를 반환합니다.
  변환 child가 모두 codec이면 container 단위로 `decode()`와 `encode()`를
  모두 제공하는 codec을 반환합니다.
- decoder가 포함된 union, intersection, lazy, array, object builder는
  `Input<>`과 `Output<>`을 모두 보존합니다.
  `TypeSource<Output, Input, Presence>`는 guard, decoder, codec이 공유하는
  구조적 계약입니다.
- object decoder는 `shape`, `extend`, `safeExtend`, `merge`, `pick`, `omit`,
  `partial`, `strict`, `strip`, `passthrough`, `loose`를 유지합니다. 이 연산은
  cold schema-construction 단계에서만 실행되며 완성된 decode runner에 분기를
  추가하지 않습니다. guard-only object와 object decoder를 합치면 결과는 object
  decoder로 승격됩니다.
- `default()`는 fallback을 설치한 뒤 output에서 `undefined`를 제외합니다.
  string transform은 `string` input을, decoder array는 child input array type을
  보존합니다.
- native TypeSea refinement는 literal `true`만 성공으로 처리합니다.
  `z.object()` facade는 Zod 호환을 위해 truthy 결과를 정규화하지만
  `t.object()`의 계약은 바꾸지 않습니다.
- `t.stringbool(options)`는 환경변수 스타일 boolean 문자열을 boolean으로 decode하고, boolean을 대표 문자열로 encode합니다. 기본값은 대소문자를 구분하지 않으며, 토큰을 정확히 비교하려면 `case: "sensitive"`를 설정합니다.
- `t.coerce.string`, `t.coerce.number`, `t.coerce.boolean`, `t.coerce.date`,
  `t.coerce.bigint`는 JavaScript 스타일 변환을 명시적으로 수행합니다. string, number,
  bigint, Date coercion decoder는 변환 뒤에도 해당 타입의 fluent check를
  이어서 쓸 수 있으므로 `t.coerce.number().int().gte(0)`,
  `t.coerce.string().trim().min(1)`처럼 별도 `pipe()` 없이 작성할 수
  있습니다. boolean coercion은 Zod처럼 JavaScript truthiness 규칙을
  따릅니다. Zod와 맞추기 위해 object input도 JavaScript constructor
  coercion을 사용하므로 caller-owned `valueOf`, `toString`,
  `Symbol.toPrimitive` hook이 실행될 수 있습니다. 이런 hook을 실행하면 안
  되는 hostile-input boundary에서는 일반 guard나 명시적인 codec을
  사용하세요.
- `t.string.trim()`, `t.string.toLowerCase()`, `t.string.toUpperCase()`, `t.string.slugify()`는 decoder helper입니다. 먼저 string을 검증한 뒤 `decode()` 결과로 변환된 값을 반환합니다.
- `t.string.normalize(form)`은 먼저 string을 검증한 뒤 `NFC`, `NFD`, `NFKC`, `NFKD` 중 하나의 Unicode normalization을 적용합니다.
- `t.asyncRefine`, `t.asyncTransform`, `t.asyncPipe`는 instance `decodeAsync()`와 top-level `t.decodeAsync()` / `t.safeDecodeAsync()`에서 `Promise<Result<T, Issue[]>>`를 반환합니다.
- async decoder instance는 Zod 스타일 migration을 위해 `parseAsync`, `safeParseAsync`, `spa`도 제공합니다.
- `t.promise(source)`는 native `Promise` input을 await한 뒤 resolved value를 `source`로 검증합니다. Promise가 아닌 input은 `expected_promise` issue로 실패합니다.
- `guard.promise()`는 `t.promise(guard)`의 fluent 형태입니다.

예상 가능한 async validation 실패도 `Result`로 반환됩니다.

## Message

```ts
const User = t.object({
  name: t.string.min(1).message("이름은 필수입니다")
});

const checked = withMessages(User.check(input), {
  locale: "ko",
  catalog: defineMessages({
    expected_string: "{path}: 문자열 필요"
  })
});
```

`formatIssue`, `formatIssues`, `formatError`, `prettifyError`, `treeifyError`, `treeifyIssues`, `flattenError`, `flattenIssues`, `toZodIssue`, `toZodIssues`, `toZodError`, `withMessages`는 validation이 끝난 뒤 diagnostic을 렌더링하거나 다른 에러 표면으로 변환합니다.
`setErrorMap(mapper)`, `getErrorMap()`, `resetErrorMap()`은 parse/check API를 위한 Zod 스타일 전역 fallback mapper입니다.
호출 시점의 `{ error }` 옵션이 항상 전역 mapper보다 우선합니다.
따라서 `is()`와 성공한 일반 `check()` path에서는 message allocation이 발생하지 않습니다.
`config({ customError })`, `config({ localeError })`, `config(locales.ko())`는 같은 mapper slot 위에 Zod 4 스타일 전역 설정 API를 제공합니다.
`z` migration namespace에서는 `z.config(...)`, `z.locales.en()/ko()` 형태로도 사용할 수 있습니다.
Zod 스타일 issue `input` field가 필요한 migration code는 parse 계열 API에 `reportInput: true`를 넘길 수 있습니다.
TypeSea는 이를 opt-in으로 유지하며, own data-property path만 따라가므로 accessor 기반 hostile input은 diagnostic decoration 중에도 실행되지 않습니다.
`z` migration namespace에서도 같은 helper를 제공합니다.
따라서 Zod를 쓰던 코드는 import 형태를 크게 바꾸지 않고 `z.treeifyError`, `z.flattenError`, `z.prettifyError`, `z.formatError`, `z.toZodError`, `z.withMessages`, `z.defineMessages`, `z.config`, `z.locales`, `z.ZodIssueCode`를 그대로 호출할 수 있습니다.

`guard.message(text)`와 `t.message(guard, text)`는 wrapped schema가 만든 issue에 local message를 붙입니다.
issue 자체의 message가 catalog rendering보다 우선하며, 더 안쪽 wrapper나 `superRefine` callback message가 바깥쪽 wrapper보다 더 구체적인 message로 남습니다.

built-in으로 실제 렌더링되는 locale은 `en`과 `ko`입니다. locale index는 Zod 4 locale 함수 이름도 함께 export하며, 아직 내장 catalog가 없는 언어는 English fallback을 사용합니다.
`typesea/v4/locales/en.js` 같은 wildcard import는 default locale factory를 제공합니다.
custom catalog는 `{path}`, `{code}`, `{expected}`, `{actual}` string template 또는 formatter callback을 쓸 수 있습니다.
`withMessages(result, options)`는 successful result를 그대로 보존하고, failed `Result`에는 복사되고 동결된 issue에 `message` field를 채워 새로 반환합니다.
`prettifyError(errorOrIssues, options)`는 terminal log, test output, 빠른 debugging에 쓰기 좋은 multi-line diagnostic string을 반환합니다.
`treeifyError(errorOrIssues, options)`와 `treeifyIssues(errorOrIssues, options)`는 local `errors`, object `properties`, array `items`를 가진 nested tree를 반환합니다.
`flattenError(errorOrIssues, options)`와 `flattenIssues(errorOrIssues, options)`는 렌더링된 message를 `formErrors`와 top-level `fieldErrors` bucket으로 묶습니다.
`Error` 이름은 Zod 4에서 넘어오는 사용자를 위한 호환 이름이고, `Issues` 이름은 TypeSea의 native API입니다.
`formatError(errorOrIssues, options)`는 Zod의 deprecated `_errors` tree를 내보내는 migration helper입니다.
새 코드에서는 local error와 object property name을 분리하는 `treeifyError()`를 쓰는 편이 낫습니다.

`toZodIssues(errorOrIssues, options)`는 TypeSea issue를 Zod v4 스타일 issue로 변환합니다.
변환된 issue는 `code`, `path`, `message`, `expected`, `received`, 선택적 `keys`, 그리고 원래 TypeSea code인 `typeseaCode`를 가집니다.
TypeSea가 hostile input을 다시 읽지 않고 immutable diagnostic에서 안전하게 복원할 수 있는 경우에는 `minimum`, `maximum`, `inclusive`, `exact`, `origin`, `divisor`, `format` 같은 Zod 스타일 detail field도 함께 제공합니다.
`config({ customError })` callback에서도 같은 detail field를 읽을 수 있습니다.
parse option에 `reportInput: true`가 들어온 경우에는 안전하게 도달한 실패 지점의 `input` 값도 Zod issue에 보존합니다.
`toZodError()`는 이 issue들을 `TypeSeaZodError`로 감싸며, public `name`은 `"ZodError"`이고 `issues` 배열은 동결됩니다.
`TypeSeaZodError.flatten()`과 `TypeSeaZodError.format()`은 Zod 스타일 instance formatter를 기대하는 migration code를 위한 helper입니다.
`TypeSeaAssertionError`도 같은 `flatten()`과 `format()`을 제공하므로, `safeParse()` 실패 결과를 바로 렌더링할 수 있습니다.
`ZodIssueCode`는 타입과 동결된 값 객체를 모두 export하므로 `ZodIssueCode.invalid_type` 같은 constant import 코드도 옮길 수 있습니다.

```ts
const parsed = User.safeParse(input);

if (!parsed.success) {
  parsed.error.flatten();
  const zodError = toZodError(parsed.error, { locale: "ko" });
  zodError.name; // "ZodError"
  zodError.issues[0]?.typeseaCode;
}
```

## Schema Metadata와 Analysis

```ts
const User = t.object({
  id: t.string.uuid()
})
  .meta({ id: "User" })
  .title("User")
  .describe("공개 사용자 레코드")
  .example({ id: "550e8400-e29b-41d4-a716-446655440000" });

const report = analyzeSchema(User);
```

`metadata`, `meta`, `title`, `describe`, `example`은 문서 전용 wrapper입니다.
`is()`, `check()`, compiled validation, AOT validation의 의미는 바꾸지 않습니다.
JSON Schema export가 성공하면 `title`, `description`, `examples` annotation으로 내보냅니다.
metadata `id`는 JSON Schema target에서 `$id`로 방출합니다. OpenAPI 3.0 export에서는
`$id`가 OpenAPI 3.0 Schema Object의 표준 keyword가 아니므로 생략합니다.

`analyzeSchema(guardOrSchema)`는 frozen advisory report를 반환합니다.
넓은 object union처럼 branch probing 비용이 커질 수 있는 schema, `lazy`와 `refine` 같은 runtime-only schema, AOT blocker, 그리고 `oneOfKeys`, `exactlyOneKey`, `atLeastOneKey`로 더 명확하게 표현할 수 있는 후보를 알려줍니다.
analyzer는 user predicate나 lazy resolver를 실행하지 않습니다.

## SeaFlow 퍼저

```ts
import { fuzzCases } from "typesea/seaflow";
import { t } from "typesea";

const User = t.strictObject({
  id: t.string.uuid(),
  age: t.number.int().gte(0)
});

for (const item of fuzzCases(User, { intensity: "high", maxYields: 64 })) {
  User.is(item.value) === item.valid;
}
```

SeaFlow는 TypeSea의 schema-directed symbolic fuzzer입니다.
guard 또는 schema record를 받아 schema를 거꾸로 순회하고, 제한된 수의 case를 metadata와 함께 생성합니다.

```ts
interface SeaFlowCase {
  readonly value: unknown;
  readonly valid: boolean;
  readonly kind: "valid" | "invalid" | "security";
  readonly reason: string;
  readonly path: readonly PathSegment[];
}
```

`fuzz(source, options)`는 값만 생성합니다.
`fuzzCases(source, options)`는 위의 구조화된 case를 생성합니다.
`SeaFlow.cases(...)`는 frozen namespace object에 달린 같은 함수입니다.

SeaFlow는 filtering과 yield 전에 각 후보를 해당 값을 만든 local schema로 다시
검증합니다. 따라서 길이, 범위, format, container 제약이 겹쳐도 `case.valid`는
실제 runtime predicate 결과와 일치합니다. 이 재검증 과정에서는 사용자가 작성한
refinement predicate도 실행됩니다.

`SeaFlowOptions`는 `intensity: "low" | "high" | "extreme"`, `maxDepth`,
`maxYields`, `includeInvalid`, `includeSecurity`를 지원합니다.
`lazy` schema는 `maxDepth`에서 멈추므로 재귀 object graph도 유한하게 끝납니다.
`maxYields`는 목표 생성 개수가 아니라 최대 상한입니다. 작은 schema는 solver가
가진 유한한 edge case를 모두 방출하면 그보다 적은 개수에서 자연스럽게 끝날 수
있습니다.

SeaFlow는 number/bigint 경계값, string 길이와 format 실패, SQLi/XSS string,
필수 key 삭제, strict object excess key, prototype-pollution key, accessor property,
sparse array, tuple length fault, record/map/set child 오염, object-union hybrid probe를 생성합니다.
`typesea/seaflow`로 분리되어 있으므로 root validator API를 import해도 hot validation code에 퍼저가 딸려오지 않습니다.

## SeaBreeze Arena 추론

```ts
import {
  createSeaBreeze,
  SeaBreezeArena,
  SeaBreezePresence,
  emitSeaBreezeBooleanSourceBundle,
  seaBreezeReader
} from "typesea/seabreeze";
```

SeaBreeze는 TypeSea의 저수준 arena-backed inference surface입니다. 추론된 검증
타입을 typed array 안의 dense id로 저장하고, HM 스타일 변수와 best-common-type
복구를 결합한 principal join을 계산합니다. 결과는 schema record, graph IR, 또는
predicate-only source bundle로 낮출 수 있습니다.

`typesea/seabreeze`는 전용 public subpath입니다. `typesea` root에서 다시 export하지
않으므로 root validator import는 arena inference code 비용을 치르지 않습니다.
schema generator, cache/AOT tooling, compiler-style pipeline처럼 런타임 validator를
추론한 뒤 TypeSea JIT에 넘겨야 하는 경우에 사용하세요.

일반적인 사용은 builder API에서 시작하면 됩니다. object key interning, field
ordering, source emission, predicate instantiation을 작은 API 뒤에 숨기지만,
결과는 여전히 numeric arena node id입니다.

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
  name: "isInferredUser"
});

FastUser.is({ id: "u1", tags: ["jit"] });

const schema = s.schema(User);
const graph = s.graph(User);
const sourceBundle = s.emit(User);
```

builder는 검증 루프 기준으로 zero-cost입니다. `object()`, `optional()`, key
interning은 arena shape를 만들 때만 실행됩니다. `compile()`은
`SeaBreezeReader`에서 직접 predicate를 방출하며, 반환된 `is()`는 builder로 다시
돌아오지 않습니다.

```ts
const arena = new SeaBreezeArena({ maxNodes: 64, maxFields: 16 });
const user = arena.allocObject();
arena.appendField(user, 1, arena.string, SeaBreezePresence.Required);
arena.appendField(user, 2, arena.number, SeaBreezePresence.Optional);

const bundle = emitSeaBreezeBooleanSourceBundle(
  seaBreezeReader(arena),
  user,
  {
    keyTable: ["", "id", "age"],
    objectMode: "strict",
    mode: "safe",
    name: "isInferredUser"
  }
);
```

직접 emitter도 TypeSea의 safety tier를 유지합니다. `safe`는 own data descriptor만
읽고 accessor/prototype read를 거부합니다. `unsafe`는 V8 hot path를 위해 direct
property read를 사용하고, `unchecked`는 strict excess-key check도 건너뜁니다.

## 런타임 컴파일

```ts
const FastUser = compile(User, { name: "isUser" });

FastUser.is(input);
FastUser.check(input);
```

`compile`은 optimized Sea-of-Nodes validation graph에서 generated predicate function과 failed value용 diagnostic collector를 방출합니다.
static scalar, object, array, record, union, strict-key node는 가능한 경우 straight-line JavaScript 또는 indexed loop로 낮아집니다.
union은 literal discriminant, primitive domain, required-key presence, root-kind mask 순서로 특화한 뒤 그래도 남는 경우에만 선언 순서대로 branch를 검사합니다.
`lazy`, `refine`, `superRefine` 같은 dynamic schema edge는 ordinary guard execution과 같은 IR-backed runtime fallback을 사용해 의미를 유지합니다.

선택적 `name`은 debugging과 profiling을 위한 hint입니다.
TypeSea는 이를 strict-mode-safe JavaScript function name으로 normalize하고, reserved name에는 prefix를 붙이며, generated name 길이에 cap을 둡니다.
직접 compiled guard construction은 predicate, collector, source argument를 검증합니다.
collector diagnostic은 `check()` 반환 전에 validate, copy, freeze됩니다.

generated source는 사용자가 제어하는 값을 직접 interpolate하지 않습니다.
literal, regexp, property key, keyset, dynamic schema fallback은 side table에 capture되고 numeric index로 참조됩니다.

### 컴파일 캐시와 warmup

```ts
const FastUser = compileCached("user:v1", () => User, { name: "isUser" });

warmup([
  User,
  {
    key: "user:v1",
    guard: User,
    options: { name: "isUser" }
  }
], {
  namePrefix: "boot_"
});
```

`compileCached(key, factory, options)`는 프로세스 안의 명시적 캐시를 사용합니다.
`createCompileCache()`는 테스트, worker, multi-tenant server처럼 캐시를 분리해야 하는 곳에서 독립 캐시를 만듭니다.
캐시 key에는 caller가 넘긴 key, compile mode, generated function name, debug-source flag가 함께 들어갑니다.

`warmup()`은 service startup이나 serverless module initialization 단계에서 guard를 미리 compile합니다.
그냥 guard를 넘기면 guard instance 기반 WeakMap cache가 채워지고, `key`가 있는 entry는 explicit cache를 채웁니다.
따라서 첫 실제 request가 schema construction이나 codegen 비용을 떠안지 않습니다.

### Boolean-only와 async validation

```ts
const BooleanUser = compileBoolean(User, { name: "isUserBoolean" });
const AsyncUsers = compileAsync(t.array(User), {
  name: "isUsersAsync",
  yieldEvery: 4096,
  yieldTimeout: 5
});

BooleanUser.is(input);
await AsyncUsers.is(largePayload);
```

`compileBoolean()`은 fail-fast 전용 표면입니다.
predicate와 generated source만 만들고, `check`, `assert`, diagnostic collector는 만들지 않습니다.
호출자가 true/false 판정만 필요로 하는 hot path에서 쓰세요.

`isAsync()`, `checkAsync()`, `compileAsync()`는 event loop를 막지 않도록 협력적으로 검증합니다.
큰 array, tuple, record, map, set, union, object loop에서 Node.js라면 `setImmediate()`, 그 외에는 `setTimeout(0)`으로 한 번씩 양보합니다.
`yieldEvery`는 node count 기준 burst를 제한하고, `yieldTimeout`은 wall-clock 기준 burst를 millisecond 단위로 제한합니다.
diagnostic은 여전히 실패 뒤에만 수집합니다.
`checkAsync()`와 `compileAsync().check()`는 `check()`와 같은 full diagnostic result를 반환합니다.
cooperative boolean verdict만 필요한 hot path라면 `isAsync()`를 쓰세요.

### JSDoc type declaration codegen

```ts
import { emitTypeDeclarations } from "typesea/codegen";

const source = emitTypeDeclarations({
  entries: [{
    name: "User",
    guard: User,
    source: "./schema.js"
  }]
});
```

`emitTypeDeclarations()`는 정확한 `Infer<typeof schema>` alias를 export하면서
각 schema `description`을 JSDoc으로 겹친 TypeScript-only module source를 반환합니다.
최상위 description과 nested object field가 생성되고 optional key는 optional로
유지되며, recursive path는 이미 방문한 object에서 멈춥니다. 생성된 alias가 원본
export schema를 참조하므로 `custom<T>`와 brand처럼 runtime schema tag에서 지워지는
type detail도 다시 추측하지 않습니다.

각 entry의 `source`는 generated file 기준으로 resolve되고 `exportName` 기본값은
`name`입니다. `typeSeaImport`로 기본 `"typesea"` module specifier를 바꿀 수 있고,
`banner: false`는 generated-file header를 생략합니다. `precompileSchemaDocs()`는
같은 source emitter의 alias이며, 두 API 모두 file write를 수행하지 않는 순수 함수입니다.

### AOT bundler plugin

```ts
import { createTypeSeaVitePlugin } from "typesea/plugin";

export default createTypeSeaVitePlugin({
  entries: [
    {
      id: "user:v1",
      guard: User,
      options: { name: "isUser", mode: "unsafe" }
    }
  ],
  transformCompileCached: true
});
```

`createTypeSeaVitePlugin`, `createTypeSeaRollupPlugin`, `createTypeSeaEsbuildPlugin`은 런타임 의존성이 없는 structural plugin factory입니다.
`typesea:aot/user:v1` 같은 virtual module을 제공하고, build time에 `emitAotModule()`을 실행합니다.
Vite, Rollup, esbuild는 정적인 `compileCached("user:v1", ...)` 호출을 그 virtual module의 default import로 치환할 수 있습니다.
이렇게 하면 production bundle에서 해당 guard의 schema factory와 runtime compiler를 제거할 수 있습니다.
esbuild source read는 optional `readFile` hook을 쓰거나 plugin `setup()` 내부에서 동적 `node:fs/promises` import를 사용합니다.
[AOT plugin 가이드](./aot-plugin.md)에서 Vite, Rollup, esbuild 전체 설정과
보수적인 치환 규칙을 확인할 수 있습니다.

### Union schema 작성법

TypeSea는 object union의 각 branch가 고유한 required own key를 드러낼 때 가장 잘 최적화됩니다.
`and`, `or`, `not`, `path`, `elemMatch`처럼 shape가 key로 갈리는 AST 계열 schema는 presence dispatch로 낮아집니다.
compiled predicate는 먼저 required key가 있는지만 보고, 맞을 수 없는 branch는 실행하지 않습니다.

```ts
const Query = t.union(
  t.object({ and: t.array(t.unknown).min(1) }),
  t.object({ or: t.array(t.unknown).min(1) }),
  t.object({ not: t.unknown }),
  t.object({ path: t.string, eq: t.optional(t.string) })
);
```

"operator가 하나 이상 있어야 한다"는 규칙을 표현하려고 optional field가 많은 비슷한 object를 여러 union branch로 쪼개지 마세요.
그 shape는 branch마다 같은 property walk를 반복해서, 재귀적인 query validation에서 비용이 크게 불어납니다.
구조 검증은 하나의 object schema로 끝내고, operator 존재 여부 같은 의미 규칙은 `superRefine`으로 붙이는 편이 낫습니다.

```ts
const Operators = t.object({
  eq: t.optional(t.string),
  neq: t.optional(t.string),
  exists: t.optional(t.boolean),
  gt: t.optional(t.number),
  between: t.optional(t.tuple([t.number, t.number]))
}).superRefine((value, context) => {
  if (!("eq" in value) &&
      !("neq" in value) &&
      !("exists" in value) &&
      !("gt" in value) &&
      !("between" in value)) {
    context.addIssue();
  }
}, "at_least_one_operator");
```

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
discriminant diagnostic은 tag를 직접 읽고 case literal을 `Object.is`로 비교합니다.

| 계약 | `safe` | `unsafe` | `unchecked` |
| --- | --- | --- | --- |
| 사용자 getter 실행 방지 | 예 | 아니오 | 아니오 |
| prototype-backed field 거부 | 예 | 아니오 | 아니오 |
| enumerable strict extra 거부 | 예 | 예 | 아니오 |
| symbol/non-enumerable strict extra 거부 | 예 | 아니오 | 아니오 |
| compiled `check()` 성공 Result freeze | 예 | 아니오 | 아니오 |

실전 규칙은 단순합니다.
public boundary data는 `safe`, 신뢰된 정규화 record는 `unsafe`, 호출자가 소유한 fixed-shape DTO는 `unchecked`를 씁니다.

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
BigInt bound check는 standalone compare IR로 emit됩니다.
BigInt `multipleOf`는 아직 runtime schema fallback이 필요하므로, 의미를 약화시키지 않고 AOT에서 명시적으로 거부합니다.
Readonly wrapper는 성공값을 freeze하는 output side effect를 갖기 때문에, standalone finalization 지원이 들어가기 전까지 AOT에서 거부합니다.

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

`SchemaCheck`는 `lazy`, `refine`, `superRefine`처럼 dynamic runtime schema logic을 기록합니다.
callback-backed edge를 static primitive인 척하지 않고, runtime semantics가 필요하다는 사실을 IR에 정확히 남깁니다.

### SeaCurrent 계획기 subpath

`typesea/seacurrent`의 기본 TypeSea API는 편의 facade인 `createSeaCurrent()`입니다.
장수 builder의 `plan()`은 guard를 직접 받고, `planRegions()`는 중첩 region profile
map을 받습니다. Target별 `observe()`, `snapshot()`, cache invalidation과 상태 복원도
builder가 소유합니다.

같은 subpath에서 custom compiler 연동을 위한 `SeaCurrentPlanner`,
`SeaCurrentAutoTuner`, `SeaCurrentIncrementalCache`, 범용 graph·target 계약과 TypeSea
Sea-of-Nodes adapter도 공개합니다. 두 API 모두 graph를 직접 변경하지 않고 profiling
계획과 검증된 scheduling 계획을 반환합니다. 기본 TypeSea builder는 profile 기반
object 순서 adapter도 보관하며 `transformations: false`로 추천을 끌 수 있습니다.
일반 root entry에서는 의도적으로 export하지 않으며 facade는 runtime validation에
참여하지 않습니다.

`typesea/seacurrent/aot`는 `createSeaCurrentAotBridge(current)`를 공개합니다.
`compile()`은 `is()`, `snapshot()`, `reset()`을 가진 계측 JIT predicate를 반환하고,
`emit()`은 독립 ESM source와 declaration을 반환합니다. `profiles()`와 `replan()`은
일치하는 profile artifact를 다음 계획 세대로 전달합니다. Artifact 수용 과정은
getter를 실행하지 않으면서 오래된 target·graph·counter·outcome·checksum,
overflow, accessor, proxy와 잘못된 값을 거부합니다. `optimize()`는 선택된 safe-mode
object 순서를 계측 없는 JIT predicate로 lowering하고 `emitOptimized()`는 같은 graph를
ESM으로 만듭니다. `tune()`은 명시적인 warmup과 측정 순서 교차, median 계산을 거친
뒤 후보를 승격합니다. 재배치는 `SchemaCheck` 장벽이나 required/optional 경계를
넘지 않으며 unsafe와 unchecked mode에는 적용되지 않습니다. 이 Bridge는 선택
사항이므로 일반 predicate와 승격된 predicate에는 SeaCurrent 분기나 counter table이
들어가지 않습니다.

예산,
fallback과 adapter 불변식은
[SeaCurrent 가이드](./seacurrent.md)를 참고하세요.

## JSON Schema

```ts
const result = toJsonSchema(User);

const imported = fromJsonSchema({
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    tags: {
      type: "array",
      items: { type: "string", minLength: 1 }
    }
  },
  required: ["id", "tags"],
  additionalProperties: false
});
```

`toJsonSchema`는 `Result<JsonSchema, JsonSchemaExportIssue[]>`를 반환합니다.
Zod 스타일 alias인 `toJSONSchema`도 같은 구현을 호출합니다.
TypeSea가 JSON-compatible input value 위에서 contract를 의미 손실 없이 표현할 수 있을 때만 성공합니다.

`fromJsonSchema`와 `fromJSONSchema`는 `Result<Guard<unknown>, JsonSchemaImportIssue[]>`를 반환합니다.
importer는 TypeSea가 직접 표현할 수 있는 이식 가능한 부분집합만 받습니다: boolean schema, `const`, `enum`, primitive `type`, string/number bound, string `pattern`, array, tuple, object, object `minProperties` / `maxProperties`, object `propertyNames`, object `patternProperties`, record, `anyOf`, `oneOf`, `allOf`, 그리고 `#`, `#/$defs/User`, `#/definitions/User` 같은 내부 `$ref` JSON Pointer.
string `pattern`은 flag 없는 ECMAScript `RegExp`로 가져옵니다. 문법이 깨진 pattern source는 schema를 약화시키지 않고 import issue로 거부합니다.
object property-count bound는 own enumerable string property 개수 기준으로 검증하며, export할 때 다시 `minProperties` / `maxProperties`로 보존합니다.
object property-name schema는 own enumerable string key 각각을 검증하며, export할 때 다시 `propertyNames`로 보존합니다.
pattern-property schema는 matching되는 own enumerable string key를 `additionalProperties`보다 먼저 검증하며, export할 때 다시 `patternProperties`로 보존합니다.
외부 ref, 검증 keyword가 함께 붙은 `$ref` sibling, 일반적인 `not` 보수 집합, 조건부 keyword처럼 아직 의미를 보존할 수 없는 keyword는 import issue를 반환합니다.
단, draft-04의 false schema를 표현하는 닫힌 부분집합인 `not: {}`, `not: true`, `not: false`는 import할 수 있습니다.

runtime-only concept는 명시적 export issue를 반환합니다.

- `undefined`
- `bigint`
- `symbol`
- JavaScript `Date`, `Map`, `Set`, `instanceOf`, `property` contract
- `cycles: "throw"`를 선택했거나 concrete schema로 풀리지 않는 `lazy`
- `refine`
- `superRefine`
- `readonly`
- decoder transforms
- async validation
- flag가 있는 regexp
- `NaN`, `Infinity`, `-0`처럼 JSON이 보존할 수 없는 numeric literal

`schemaToJsonSchema(schema)`는 direct schema API입니다.
전달된 schema를 validate하고 freeze한 뒤 export합니다.
JSON Schema option도 validate합니다.
`schemaId`가 있으면 string이어야 합니다.
기본 target은 Ajv 호환성을 위해 draft-07로 유지합니다.
`prefixItems` tuple schema가 필요하면 `dialect: "2020-12"` 또는 Zod 스타일
alias인 `target: "draft-2020-12"`를 사용하세요.
`target: "draft-7"`과 `target: "draft-07"`은 draft-07 keyword set을 선택합니다.
`target: "draft-4"`와 `target: "draft-04"`는 legacy draft-04 keyword set을
선택합니다. literal은 single-value `enum`으로, exclusive number bound는
`minimum`/`maximum`에 붙는 boolean `exclusiveMinimum`/`exclusiveMaximum` flag로,
tuple은 `items` array로, false schema는 `not: {}`로 방출합니다.
draft-04에는 `propertyNames`에 대응하는 keyword가 없으므로 record key schema와
property-name schema는 `unsupported_target` issue를 반환합니다.
`target: "openapi-3.0"`은 의미를 보존할 수 있는 OpenAPI 3.0 subset만
방출합니다. nullable wrapper는 `nullable: true`, literal은 single-value
`enum`으로 표현하고, top-level `$schema`는 생략합니다.
positional tuple, record key schema, property-name schema, pattern-property
schema, false schema처럼 OpenAPI 3.0으로 TypeSea 계약을 보존할 수 없는
경우에는 `unsupported_target` issue를 반환합니다.
`dialect`와 `target`을 동시에 줄 수는 있지만, 둘이 같은 dialect로
정규화될 때만 허용됩니다.
`unrepresentable`의 기본 동작은 `"throw"`입니다. TypeSea의 의미를 JSON Schema로
표현할 수 없는 노드는 typed issue를 반환합니다. Zod 마이그레이션 중 의도적으로
더 느슨한 schema가 필요하다면 `unrepresentable: "any"`를 줄 수 있습니다.
이 옵션은 `Date`, `bigint`, `symbol`, `undefined`, `refine`, decoder transform,
flag가 있는 regexp, non-finite numeric bound, runtime object contract처럼
표현 불가능한 노드를 `{}`로 낮춥니다. target 자체가 맞지 않는 경우는 여전히
fail-closed입니다. 예를 들어 OpenAPI 3.0 tuple은 계속 `unsupported_target`을 반환합니다.
`cycles`는 recursive lazy schema를 어떻게 내보낼지 정합니다. 기본값인 `"ref"`는
`t.lazy()`를 resolve하다가 이미 방출 중인 JSON Schema fragment로 다시 들어가면
local `$ref`로 순환을 끊습니다. `cycles: "throw"`를 주면 lazy schema를
fail-closed로 다루고 `unsupported_lazy`를 반환합니다.
`t.file()`은 OpenAPI에서 쓰는 binary string schema로 내보냅니다. 파일 크기
check는 byte 기준 `minLength`와 `maxLength` annotation이 되고, MIME check는
`contentMediaType` annotation이 됩니다. TypeSea의 runtime validation은 여전히
JavaScript `File` 객체를 기대합니다. JSON Schema 표현은 OpenAPI와 문서 연동을
위한 표현입니다.
`override`는 각 fragment의 원본 TypeSea schema node와 방출된 JSON Schema object를
받습니다. vendor extension을 붙이거나, `unrepresentable: "any"`로 명시적으로
느슨하게 만든 fragment를 문서용 schema로 바꾸고 싶을 때 `context.jsonSchema`를
직접 수정하세요. boolean JSON Schema fragment와 `$ref` placeholder는 override
대상이 아닙니다.
`uri`에는 metadata `id`를 `$id`로 방출하기 전에 변환하는 함수를 줄 수 있습니다.
기본 mapper는 id를 그대로 반환합니다. 단일 schema를 내보낼 때 `metadata` option에
`SchemaRegistry<GlobalRegistryMetadata>`를 넘기면, registry metadata가 일치하는
JSON Schema fragment에 붙습니다. 사용자 정의 metadata field는 JSON Schema extension
field로 복사되고, 현재 schema 그래프에서 실제로 도달 가능한 id-bearing entry는
local `definitions` 또는 `$defs`로 추출되어 안정적인 `$ref` 대상이 됩니다.
`SchemaRegistry<GlobalRegistryMetadata>`를 `toJsonSchema` / `toJSONSchema`에 직접 넘기거나
`schemaRegistryToJsonSchema(registry)`를 호출하면, 문자열 `id`가 있는 살아 있는 registry
entry 전체를 `{ schemas }` 형태의 bundle로 내보냅니다. entry끼리 서로 참조하는 경우
`$ref`는 `uri(id)` 결과를 사용합니다. `id`가 없는 entry는 건너뜁니다.
문자열 `id`는 registry 안에서 고유해야 하므로, 다른 schema에 같은 id를 등록하면 즉시
예외가 발생합니다. exporter는 malformed 또는 오래된 registry snapshot에 중복 id가 들어온
경우를 대비해 `duplicate_registry_id` issue도 유지합니다.
`reused`는 같은 schema identity가 여러 번 등장할 때 어떻게 내보낼지 정합니다.
기본값인 `"inline"`은 기존처럼 모든 위치에 schema를 직접 펼칩니다.
`reused: "ref"`를 주면 두 번 이상 등장한 schema object를 draft-04/draft-07에서는
`definitions`, 2020-12에서는 `$defs`로 빼고, 각 사용 위치는 local `$ref`로
대체합니다. OpenAPI 3.0 target에서는 이 방식이 필요해지는 순간
`unsupported_target`을 반환합니다. TypeSea는 OpenAPI 3.0 subset도 의미를 잃지
않는 범위에서만 내보냅니다.

```ts
const latest = toJsonSchema(t.tuple([t.string, t.number]), {
  target: "draft-2020-12"
});

const legacy = toJsonSchema(t.number.gt(0), {
  target: "draft-04"
});

const weakened = toJsonSchema(t.object({
  id: t.string.uuid(),
  metadata: t.unknown,
  createdAt: t.date
}), {
  unrepresentable: "any"
});

interface TreeNode {
  readonly value: string;
  readonly children: readonly TreeNode[];
}

const Tree: Guard<TreeNode> = t.lazy((): Guard<TreeNode> =>
  t.object({
    value: t.string,
    children: t.array(Tree)
  })
);

const recursive = toJsonSchema(Tree, {
  cycles: "ref"
});

const upload = toJsonSchema(t.file()
  .min(1)
  .max(1024 * 1024)
  .mime("image/png"));

const documentedDate = toJsonSchema(t.object({
  createdAt: t.date
}), {
  unrepresentable: "any",
  override: (context) => {
    if (context.path[0] === "createdAt") {
      context.jsonSchema.type = "string";
      context.jsonSchema.format = "date-time";
    }
  }
});

const referenced = toJSONSchema(t.string.meta({ id: "UserId" }), {
  uri: (id) => `https://schemas.example/${id}.json`
});

const SharedName = t.string.min(1).meta({ id: "SharedName" });
const reused = toJSONSchema(t.object({
  first: SharedName,
  last: SharedName
}), {
  reused: "ref"
});

const Docs = t.registry<GlobalRegistryMetadata>();
const User = t.object({
  id: t.string.uuid(),
  name: t.string.min(1)
});
const Post = t.object({
  title: t.string.min(1),
  author: User
});

Docs.add(User, {
  id: "User",
  title: "User"
});
Docs.add(Post, {
  id: "Post",
  title: "Post"
});

const documented = toJSONSchema(Post, {
  metadata: Docs,
  uri: (id) => `https://schemas.example/${id}.json`
});

const bundle = schemaRegistryToJsonSchema(Docs, {
  uri: (id) => `https://schemas.example/${id}.json`
});

const openapi = toJsonSchema(t.object({
  name: t.nullable(t.string.min(1))
}), {
  target: "openapi-3.0"
});
```

object `properties` map은 null-prototype record로 방출됩니다.
따라서 `__proto__`, `constructor`, `hasOwnProperty` 같은 특수 key도 ordinary own schema property로 남습니다.

## 경계 동작

- literal guard는 `Object.is`를 사용합니다. 따라서 `t.literal(Number.NaN)`은 `NaN`을 match하고 `t.literal(-0)`은 `0`과 match하지 않습니다.
- `t.number`는 finite JavaScript number만 허용합니다. `NaN`, `Infinity`, `-Infinity`는 configured numeric predicate가 실행되기 전에 거부됩니다.
- `t.bigint`는 JavaScript `bigint` 값만 허용합니다. bound와 divisibility method는 `bigint` 인자만 받으며 number를 암묵적으로 변환하지 않습니다.
- string length bound는 non-negative integer여야 합니다.
- numeric comparison bound는 finite number여야 합니다.
- predicate callback은 strict `true`를 반환해야 합니다. truthy non-boolean value는 validation을 통과하지 않습니다.
- `readonly()`는 `is()` 의미를 바꾸지 않고 boolean check에서 freeze하지 않습니다. parse 계열 API는 전체 schema가 성공한 뒤 받아들인 object-like 값을 freeze합니다.
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
