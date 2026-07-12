# Zod Compatibility

TypeSea is a validation compiler. Its Zod-shaped entry points are migration and
ecosystem facades over the TypeSea engine, not a second implementation of Zod's
private parser runtime.

## Support Levels

| Level | Meaning | Execution |
| --- | --- | --- |
| Native compiled | TypeSea owns the semantics and lowers the schema into validation IR. | Interpreted plan, JIT, and AOT when the schema is serializable. |
| Runtime pipeline | TypeSea supports the API through a decoder, codec, callback, or identity-sensitive node. | Runtime parse/decode; AOT and JSON Schema may reject it. |
| Compatibility shim | The export exists for migration, type references, or ecosystem probes. | No promise of Zod private-engine behavior. |
| Gap | The observed Zod surface is not implemented or cannot preserve semantics. | Migration must change the call or stay on Zod. |

## Compatibility Matrix

| Surface | Level | Notes |
| --- | --- | --- |
| Primitive builders and built-in string/number/BigInt/Date checks | Native compiled | Includes formats, bounds, integer checks, and immutable metadata. |
| Objects, arrays, tuples with rest, records, maps, sets, enums, and literals | Native compiled | Safe object paths use own descriptors and reject hostile accessors. |
| Unions, discriminated unions, intersections, optional, nullable, and readonly | Native compiled | Union preflight and discriminant dispatch are optimized where statically provable. |
| `transform`, `overwrite`, `pipe`, `default`, `prefault`, `catch`, `codec`, `coerce.*`, and `preprocess` | Runtime pipeline | Output-changing behavior is represented by decoders and codecs. |
| `refine`, `superRefine`, `custom`, `lazy`, functions, and `instanceof` | Runtime pipeline | Callbacks and host identity can block standalone emission. |
| Error formatting, flattening, treeification, and Standard Schema V1 | Native/runtime utility | Diagnostics are TypeSea issues translated into the requested outer shape. |
| `typesea/v3`, `typesea/v4/core`, class aliases, and underscore-prefixed exports | Compatibility shim | Intended for source migration and package probes, not parser-internal extension. |
| Unobserved future Zod APIs or behavior absent from TypeSea tests | Gap | Report these as compatibility issues; they are not silently accepted. |

## Compilation Boundary

`compile()` produces a boolean or diagnostic validator from the guard portion of
a source. Output-changing decoder stages remain parse/decode work and are not
pretended to be boolean type guards. `emitAotModule()` fails with structured
issues when callbacks, host constructors, or dynamic lazy resolution cannot be
serialized without changing semantics.

```ts
import { compile, z } from "typesea/v4";

const User = z.object({
    id: z.string().uuid(),
    displayName: z.string().trim().default("anonymous")
});

const isUserInput = compile(User);
const user = User.parse(input);
```

The compiled predicate validates the guard boundary. `parse()` additionally
applies the trim and default decoder stages.

## Migration Policy

1. Replace imports in a test branch, not directly in a release branch.
2. Run TypeScript compilation and the application's validation tests.
3. Check this matrix for runtime-pipeline and shim-only APIs.
4. Keep external input on safe mode.
5. Use `typesea/plugin` or `emitAotModule()` only after AOT portability succeeds.

The [real-world compatibility corpus](./zod-real-world-compat.md) records pinned
source evidence. It measures observed declarations and replacement compilation;
it does not claim universal semantic parity.
