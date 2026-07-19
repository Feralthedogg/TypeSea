# AOT Bundler Plugin

`typesea/plugin` exposes zero-dependency structural plugins for Vite, Rollup,
and esbuild. The plugin turns configured `compileCached()` sites into imports of
standalone validator modules generated during the application build.

## Vite and Rollup

```ts
// vite.config.ts or rollup.config.ts
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
// application source
import { compileCached } from "typesea";
import { User } from "./schema.js";

export const isUser = compileCached("user:v1", () => User);
```

The production module imports `typesea:aot/user:v1`; schema construction and
runtime compilation disappear from that call site.

For Rollup, use `createTypeSeaRollupPlugin()` with the same options.

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

## Conservative Rewrite Rules

The macro rewrites a call only when all of these are true:

- `compileCached` is imported from TypeSea through a recognized static import;
- the cache key is a string literal;
- the key exists in the plugin `entries` table;
- the call is in a JavaScript or TypeScript module handled by the plugin.

Dynamic keys and unknown bindings remain runtime calls. The plugin does not use
textual `eval`, does not interpolate schema values into generated code, and does
not weaken AOT portability checks.

## AOT Blockers

Runtime callbacks, unresolved lazy factories, host-bound constructors, and other
non-serializable semantics cause module generation to fail. Move those stages
outside the compiled boundary or keep the validator on the runtime path.

The current macro emits no source map for the small replacement. Generated
validator failures still use TypeSea issue paths and configured function names.
