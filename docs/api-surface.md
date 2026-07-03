# Public API Surface

The package exposes one public entry point:

```ts
import { t, compile, toJsonSchema } from "typesea";
```

Subpath imports are intentionally unsupported. The npm `exports` map exposes
only `"."`, backed by `dist/index.js` and `dist/index.d.ts`.

## Stability Groups

Stable runtime API:

- `t`
- builder functions such as `object`, `strictObject`, `extend`, `pick`, `omit`,
  `partial`, `union`, `intersect`, `array`, `tuple`, `record`, `optional`,
  `undefinedable`, `nullable`, `lazy`, and `refine`
- decoder functions and helpers such as `decoder`, `transform`, `pipe`, and
  `coerce`
- async decoder functions and helpers such as `asyncDecoder`, `asyncRefine`,
  `asyncTransform`, and `asyncPipe`
- message helpers such as `formatIssue`, `formatIssues`, `withMessages`, and
  `defineMessages`
- ecosystem adapters such as `toTrpcParser`, `toFastifyRouteSchema`,
  `toFastifyValidatorCompiler`, and `toReactHookFormResolver`
- `compile`
- `emitAotModule`
- `toJsonSchema`
- guard classes and `TypeSeaAssertionError`

Stable type API:

- `Infer`
- `Guard`
- `Decoder`
- `AsyncDecoder`
- `CheckResult`
- `Issue`
- `InferDecoder`
- `InferAsyncDecoder`
- AOT module emission types
- ecosystem adapter types
- message customization types
- JSON Schema export types
- graph and schema introspection types currently exported from the root package

The exact root export list is checked by `npm run check:api`, which reads the
built `dist/index.js` and `dist/index.d.ts` and fails on missing, duplicated, or
unexpected exports.

## Semver Policy

Before `1.0.0`, breaking changes are allowed but must be explicit in release
notes. After `1.0.0`, removing or changing a root export is a breaking change.
