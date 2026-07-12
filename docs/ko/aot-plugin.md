# AOT 번들러 플러그인

`typesea/plugin`은 Vite, Rollup, esbuild용 zero-dependency 구조적 플러그인을
제공합니다. 애플리케이션을 빌드할 때 설정된 `compileCached()` 호출을 standalone
validator module import로 바꿉니다.

## Vite와 Rollup

```ts
// vite.config.ts 또는 rollup.config.ts
import { createTypeSeaVitePlugin } from "typesea/plugin";
import { User } from "./src/schema.js";

export default {
    plugins: [
        createTypeSeaVitePlugin({
            entries: [{ id: "user:v1", guard: User }],
            transformCompileCached: true
        })
    ]
};
```

```ts
// 애플리케이션 소스
import { compileCached } from "typesea";
import { User } from "./schema.js";

export const isUser = compileCached("user:v1", () => User);
```

프로덕션 모듈은 `typesea:aot/user:v1`을 import합니다. 이 호출부에서는 스키마
생성과 런타임 컴파일이 사라집니다.

Rollup에서는 같은 옵션으로 `createTypeSeaRollupPlugin()`을 사용합니다.

## esbuild

```ts
import { build } from "esbuild";
import { createTypeSeaEsbuildPlugin } from "typesea/plugin";
import { User } from "./src/schema.js";

await build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    plugins: [
        createTypeSeaEsbuildPlugin({
            entries: [{ id: "user:v1", guard: User }],
            transformCompileCached: true
        })
    ]
});
```

## 보수적인 치환 규칙

다음 조건을 모두 만족할 때만 macro가 호출을 바꿉니다.

- `compileCached`가 인식 가능한 정적 import를 통해 TypeSea에서 들어옵니다.
- cache key가 문자열 literal입니다.
- key가 plugin `entries` 표에 존재합니다.
- plugin이 처리하는 JavaScript 또는 TypeScript module 안의 호출입니다.

동적 key와 알 수 없는 binding은 런타임 호출로 남습니다. 플러그인은 텍스트
`eval`을 사용하지 않고, schema 값을 생성 코드에 문자열로 삽입하지 않으며, AOT
portability 검사를 약화하지 않습니다.

## AOT 차단 요소

runtime callback, 해석되지 않은 lazy factory, host constructor처럼 직렬화할 수 없는
의미가 있으면 module 생성이 실패합니다. 해당 단계를 컴파일 경계 밖으로 옮기거나
runtime 경로를 유지해야 합니다.

현재 macro의 작은 치환에는 source map을 생성하지 않습니다. 생성 validator의
실패는 여전히 TypeSea issue path와 설정된 함수 이름을 사용합니다.
