import { beforeAll, bench, describe } from "vitest";
import {
    compile,
    compileAsync,
    compileBoolean,
    compileCached,
    createCompileCache,
    createTypeSeaEsbuildPlugin,
    createTypeSeaRollupPlugin,
    t,
    type TypeSeaEsbuildBuild,
    type TypeSeaEsbuildFilter,
    type TypeSeaEsbuildLoadArgs,
    type TypeSeaEsbuildLoadFilter,
    type TypeSeaEsbuildLoadResult,
    type TypeSeaEsbuildResolveArgs,
    type TypeSeaEsbuildResolveResult
} from "../src/index.js";
import {
    warmupAsync,
    warmupSync,
    type AsyncWarmupTask,
    type WarmupTask
} from "./warmup.js";

interface EsbuildLoadRegistration {
    readonly options: TypeSeaEsbuildLoadFilter;
    readonly callback: (args: TypeSeaEsbuildLoadArgs) =>
        TypeSeaEsbuildLoadResult |
        null |
        Promise<TypeSeaEsbuildLoadResult | null>;
}

const User = t.strictObject({
    id: t.string.uuid(),
    name: t.string.min(1),
    age: t.number.int().gte(0),
    tags: t.array(t.string.min(1)).max(8)
});

const FastUser = compile(User, { name: "benchRuntimeFeatureUser" });
const BooleanUser = compileBoolean(User, {
    name: "benchRuntimeFeatureBooleanUser"
});
const cache = createCompileCache();
const CachedUser = cache.compile("bench:user", () => User, {
    name: "benchRuntimeFeatureCachedUser"
});
const GlobalCachedUser = compileCached("bench:global-user", () => User, {
    name: "benchRuntimeFeatureGlobalCachedUser"
});
const AsyncUsers = compileAsync(t.array(User), {
    name: "benchRuntimeFeatureAsyncUsers",
    yieldEvery: 512,
    yieldTimeout: 1
});

const valid = Object.freeze({
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "Ada",
    age: 37,
    tags: Object.freeze(["compiler", "math"])
});

const invalid = Object.freeze({
    id: "not-a-uuid",
    name: "",
    age: -1,
    tags: Object.freeze(["compiler", 1])
});

const validUsers = Object.freeze(new Array<unknown>(256).fill(valid));
const invalidUsers = Object.freeze([
    ...new Array<unknown>(255).fill(valid),
    invalid
]);

const pluginSource =
    "const User = compileCached(\"user\", () => makeUser(), { name: \"aotUser\" });\nexport { User };";
const rollupPlugin = createTypeSeaRollupPlugin({
    entries: [
        {
            id: "user",
            guard: User,
            options: { name: "aotUser" }
        }
    ],
    transformCompileCached: true
});
const esbuildLoads: EsbuildLoadRegistration[] = [];
const esbuildPlugin = createTypeSeaEsbuildPlugin({
    entries: [
        {
            id: "user",
            guard: User,
            options: { name: "aotUser" }
        }
    ],
    transformCompileCached: true,
    readFile(): string {
        return pluginSource;
    }
});
const esbuildBuild: TypeSeaEsbuildBuild = {
    onResolve(
        options: TypeSeaEsbuildFilter,
        callback: (args: TypeSeaEsbuildResolveArgs) => TypeSeaEsbuildResolveResult
    ): void {
        void options;
        void callback;
    },

    onLoad(options, callback): void {
        esbuildLoads.push({ options, callback });
    }
};
esbuildPlugin.setup(esbuildBuild);
const esbuildSourceLoad = readEsbuildLoad(esbuildLoads, "file");

const warmupTasks: readonly WarmupTask[] = [
    (): unknown => FastUser.is(valid),
    (): unknown => BooleanUser.is(valid),
    (): unknown => FastUser.is(invalid),
    (): unknown => BooleanUser.is(invalid),
    (): unknown => compileCached("bench:global-user", (): typeof User => User, {
        name: "benchRuntimeFeatureGlobalCachedUser"
    }).is(valid),
    (): unknown => cache.compile("bench:user", (): typeof User => User, {
        name: "benchRuntimeFeatureCachedUser"
    }).is(valid),
    (): unknown => CachedUser.is(valid),
    (): unknown => GlobalCachedUser.is(valid),
    (): unknown => rollupPlugin.transform(pluginSource, "/project/src/user.ts"),
    (): unknown => rollupPlugin.load("\0typesea:aot/user")
];

const asyncWarmupTasks: readonly AsyncWarmupTask[] = [
    async (): Promise<unknown> => await AsyncUsers.is(validUsers),
    async (): Promise<unknown> => await AsyncUsers.check(invalidUsers),
    async (): Promise<unknown> =>
        await esbuildSourceLoad.callback({ path: "/project/src/user.ts" })
];

beforeAll(async (): Promise<void> => {
    warmupSync(warmupTasks);
    await warmupAsync(asyncWarmupTasks);
});

describe("runtime feature extensions", () => {
    bench("compiled is valid", () => {
        FastUser.is(valid);
    });

    bench("compiled boolean valid", () => {
        BooleanUser.is(valid);
    });

    bench("compiled is invalid", () => {
        FastUser.is(invalid);
    });

    bench("compiled boolean invalid", () => {
        BooleanUser.is(invalid);
    });

    bench("compileCached global hit", () => {
        compileCached("bench:global-user", () => User, {
            name: "benchRuntimeFeatureGlobalCachedUser"
        }).is(valid);
    });

    bench("createCompileCache hit", () => {
        cache.compile("bench:user", () => User, {
            name: "benchRuntimeFeatureCachedUser"
        }).is(valid);
    });

    bench("prebuilt cached guard valid", () => {
        CachedUser.is(valid);
    });

    bench("prebuilt global cached guard valid", () => {
        GlobalCachedUser.is(valid);
    });

    bench("compileAsync is valid", async () => {
        await AsyncUsers.is(validUsers);
    });

    bench("compileAsync check invalid", async () => {
        await AsyncUsers.check(invalidUsers);
    });

    bench("rollup compileCached macro transform", () => {
        rollupPlugin.transform(pluginSource, "/project/src/user.ts");
    });

    bench("esbuild compileCached macro transform", async () => {
        await esbuildSourceLoad.callback({ path: "/project/src/user.ts" });
    });

    bench("rollup AOT virtual load", () => {
        rollupPlugin.load("\0typesea:aot/user");
    });
});

/**
 * @brief Read one captured esbuild onLoad registration by namespace.
 */
function readEsbuildLoad(
    loads: readonly EsbuildLoadRegistration[],
    namespace: string
): EsbuildLoadRegistration {
    for (let index = 0; index < loads.length; index += 1) {
        const load = loads[index];
        if (load?.options.namespace === namespace) {
            return load;
        }
    }
    throw new Error(`missing esbuild load namespace ${namespace}`);
}
