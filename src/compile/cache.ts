/**
 * @file compile/cache.ts
 * @brief Explicit compiled-guard cache APIs.
 * @details The cache is keyed by caller-supplied semantic identity, not by a
 * structural hash. That avoids accidentally reusing schemas with different
 * closure-backed semantics.
 */

import type { Guard, Presence } from "../guard/index.js";
import { compile, type CompiledBaseGuard } from "./guard.js";
import type { CompileMode, CompileOptions } from "./types.js";

const globalCompileCache = createCompileCache();

/**
 * @brief Explicit compiled guard cache.
 * @details Factories run only on cache miss. The user key is combined with
 * compile mode, function name, and debug source mode.
 */
export interface CompileCache {
    /**
     * @brief Number of compiled entries currently retained.
     */
    readonly size: number;

    /**
     * @brief Compile through this cache using an explicit semantic key.
     * @param key Caller-owned schema identity.
     * @param factory Guard factory evaluated only on cache miss.
     * @param options Compile options included in the cache identity.
     * @returns Cached or newly compiled guard.
     */
    compile<TValue, TPresence extends Presence>(
        key: string,
        factory: () => Guard<TValue, TPresence>,
        options?: Partial<CompileOptions>
    ): CompiledBaseGuard<TValue, TPresence>;

    /**
     * @brief Remove one cached compiled guard.
     * @param key Caller-owned schema identity.
     * @param options Compile options used to form the cache identity.
     * @returns True when an entry was removed.
     */
    delete(key: string, options?: Partial<CompileOptions>): boolean;

    /**
     * @brief Remove every compiled guard retained by this cache.
     */
    clear(): void;
}

/**
 * @brief One server-start warmup target.
 * @details `key` routes compilation through an explicit cache. `guard` is for
 * already-built schemas; `factory` is for lazy schema construction.
 */
export interface WarmupEntry {
    /**
     * @brief Optional explicit cache key.
     * @details Entries with keys compile through the configured cache. Entries
     * without keys still precompile, but are not retained by semantic identity.
     */
    readonly key: string | undefined;

    /**
     * @brief Already-built guard to compile during warmup.
     */
    readonly guard: Guard<unknown, Presence> | undefined;

    /**
     * @brief Lazy guard factory evaluated during warmup.
     * @details Use a factory when schema construction itself should be moved out
     * of the first request path.
     */
    readonly factory: (() => Guard<unknown, Presence>) | undefined;

    /**
     * @brief Entry-local compile options.
     */
    readonly options: Partial<CompileOptions> | undefined;
}

/**
 * @brief Warmup batch options.
 * @details Shared options are merged before entry-local options. A namePrefix
 * gives otherwise anonymous warmup guards stable generated function names.
 */
export interface WarmupOptions {
    /**
     * @brief Cache used for keyed warmup entries.
     */
    readonly cache: CompileCache | undefined;

    /**
     * @brief Shared compile options applied before entry-local options.
     */
    readonly options: Partial<CompileOptions> | undefined;

    /**
     * @brief Generated function-name prefix for anonymous warmup entries.
     */
    readonly namePrefix: string | undefined;
}

/**
 * @brief One warmup input accepted by warmup().
 * @details Plain guards are supported for compact call sites. Partial entries are
 * supported when the caller wants cache keys, factories, or entry-local options.
 */
export type WarmupInput =
    | Guard<unknown, Presence>
    | Partial<WarmupEntry>;

/**
 * @brief Compile through the process-local explicit cache.
 * @param key Caller-owned semantic schema identity.
 * @param factory Guard factory invoked only on cache miss.
 * @param options Compile options included in the cache identity.
 * @returns Cached or newly compiled guard.
 */
export function compileCached<TValue, TPresence extends Presence>(
    key: string,
    factory: () => Guard<TValue, TPresence>,
    options?: Partial<CompileOptions>
): CompiledBaseGuard<TValue, TPresence> {
    return globalCompileCache.compile(key, factory, options);
}

/**
 * @brief Precompile a batch of guards during process initialization.
 * @param inputs Guards or warmup entries to compile.
 * @param options Shared warmup options.
 * @returns Compiled guards in input order.
 * @details This API is intended for serverless cold starts and service boot.
 * It moves compile cost out of the first request path without changing runtime
 * validation semantics.
 */
export function warmup(
    inputs: readonly WarmupInput[],
    options?: Partial<WarmupOptions>
): readonly CompiledBaseGuard<unknown, Presence>[] {
    if (!Array.isArray(inputs)) {
        throw new TypeError("warmup inputs must be an array");
    }
    const config = readWarmupOptions(options);
    const compiled = new Array<CompiledBaseGuard<unknown, Presence>>(inputs.length);
    for (let index = 0; index < inputs.length; index += 1) {
        const input = readWarmupInputAt(inputs, index);
        if (input === undefined) {
            throw new TypeError("warmup input must be a guard or warmup entry");
        }
        compiled[index] = compileWarmupInput(input, config, index);
    }
    return Object.freeze(compiled);
}

/**
 * @brief Create an isolated explicit compiled-guard cache.
 * @returns Cache object with compile, delete, clear, and size.
 */
export function createCompileCache(): CompileCache {
    const entries = new Map<string, CompiledBaseGuard<unknown, Presence>>();
    return Object.freeze({
        get size(): number {
            return entries.size;
        },

        compile<TValue, TPresence extends Presence>(
            key: string,
            factory: () => Guard<TValue, TPresence>,
            options?: Partial<CompileOptions>
        ): CompiledBaseGuard<TValue, TPresence> {
            const cacheKey = readCompileCacheKey(key, options);
            const cached = entries.get(cacheKey);
            if (cached !== undefined) {
                return cached as CompiledBaseGuard<TValue, TPresence>;
            }
            if (typeof factory !== "function") {
                throw new TypeError("compile cache factory must be a function");
            }
            const compiled = compile(factory(), options);
            entries.set(cacheKey, compiled);
            return compiled;
        },

        delete(key: string, options?: Partial<CompileOptions>): boolean {
            return entries.delete(readCompileCacheKey(key, options));
        },

        clear(): void {
            entries.clear();
        }
    });
}

/**
 * @brief Build one explicit compile cache key.
 * @param key User semantic schema key.
 * @param options Compile options.
 * @returns Stable cache key including option-sensitive codegen state.
 */
function readCompileCacheKey(
    key: string,
    options: Partial<CompileOptions> | undefined
): string {
    if (typeof key !== "string" || key.length === 0) {
        throw new TypeError("compile cache key must be a non-empty string");
    }
    const config = readCompileCacheOptions(options);
    return JSON.stringify([
        key,
        config.mode,
        config.name,
        config.debugSource
    ]);
}

/**
 * @brief Normalize compile options for explicit cache identity.
 */
function readCompileCacheOptions(
    options: Partial<CompileOptions> | undefined
): {
    readonly name: string;
    readonly mode: CompileMode;
    readonly debugSource: boolean;
} {
    if (options === undefined) {
        return {
            name: "typesea_is",
            mode: "safe",
            debugSource: false
        };
    }
    if (!isRecord(options)) {
        throw new TypeError("compile options must be an object");
    }
    const record = options as Readonly<Record<string, unknown>>;
    const name = record["name"];
    if (name !== undefined && typeof name !== "string") {
        throw new TypeError("compile name must be a string");
    }
    const mode = record["mode"];
    if (mode !== undefined &&
        mode !== "safe" &&
        mode !== "unsafe" &&
        mode !== "unchecked") {
        throw new TypeError("compile mode must be \"safe\", \"unsafe\", or \"unchecked\"");
    }
    const debugSource = record["debugSource"];
    if (debugSource !== undefined && typeof debugSource !== "boolean") {
        throw new TypeError("compile debugSource must be a boolean");
    }
    return {
        name: name ?? "typesea_is",
        mode: mode ?? "safe",
        debugSource: debugSource ?? false
    };
}

/**
 * @brief Compile one normalized warmup input.
 */
function compileWarmupInput(
    input: WarmupInput,
    options: RequiredWarmupOptions,
    index: number
): CompiledBaseGuard<unknown, Presence> {
    const entry = readWarmupEntry(input);
    const compileOptions = mergeCompileOptions(
        options.options,
        entry.options,
        options.namePrefix,
        index
    );
    if (entry.key !== undefined) {
        const cache = options.cache;
        const factory = entry.factory ?? makeGuardFactory(entry.guard);
        return cache.compile(entry.key, factory, compileOptions);
    }
    const guard = entry.guard ?? entry.factory?.();
    if (guard === undefined) {
        throw new TypeError("warmup entry requires guard or factory");
    }
    return compile(guard, compileOptions);
}

interface RequiredWarmupOptions {
    readonly cache: CompileCache;
    readonly options: Partial<CompileOptions> | undefined;
    readonly namePrefix: string | undefined;
}

/**
 * @brief Normalize warmup-level options.
 */
function readWarmupOptions(
    options: Partial<WarmupOptions> | undefined
): RequiredWarmupOptions {
    if (options === undefined) {
        return {
            cache: globalCompileCache,
            options: undefined,
            namePrefix: undefined
        };
    }
    if (!isRecord(options)) {
        throw new TypeError("warmup options must be an object");
    }
    const cache = options.cache;
    if (cache !== undefined && !isCompileCache(cache)) {
        throw new TypeError("warmup cache must be a TypeSea compile cache");
    }
    const shared = options.options;
    if (shared !== undefined && !isRecord(shared)) {
        throw new TypeError("warmup compile options must be an object");
    }
    const namePrefix = options.namePrefix;
    if (namePrefix !== undefined && typeof namePrefix !== "string") {
        throw new TypeError("warmup namePrefix must be a string");
    }
    return {
        cache: cache ?? globalCompileCache,
        options: shared,
        namePrefix
    };
}

/**
 * @brief Normalize a guard-or-entry warmup input.
 */
function readWarmupEntry(input: WarmupInput): WarmupEntry {
    if (!isRecord(input)) {
        throw new TypeError("warmup input must be a guard or warmup entry");
    }
    const maybeKey = readOwnDataProperty(input, "key");
    const maybeGuard = readOwnDataProperty(input, "guard");
    const maybeFactory = readOwnDataProperty(input, "factory");
    const maybeOptions = readOwnDataProperty(input, "options");
    if (maybeKey === undefined &&
        maybeGuard === undefined &&
        maybeFactory === undefined &&
        maybeOptions === undefined) {
        return {
            key: undefined,
            guard: input as Guard<unknown, Presence>,
            factory: undefined,
            options: undefined
        };
    }
    if (maybeKey !== undefined &&
        (typeof maybeKey !== "string" || maybeKey.length === 0)) {
        throw new TypeError("warmup key must be a non-empty string");
    }
    if (maybeGuard !== undefined && !isRecord(maybeGuard)) {
        throw new TypeError("warmup guard must be a TypeSea guard");
    }
    if (maybeFactory !== undefined && typeof maybeFactory !== "function") {
        throw new TypeError("warmup factory must be a function");
    }
    if (maybeOptions !== undefined && !isRecord(maybeOptions)) {
        throw new TypeError("warmup entry options must be an object");
    }
    return {
        key: maybeKey,
        guard: maybeGuard as Guard<unknown, Presence> | undefined,
        factory: maybeFactory as (() => Guard<unknown, Presence>) | undefined,
        options: maybeOptions
    };
}

/**
 * @brief Read a warmup array slot without losing its declared element type.
 */
function readWarmupInputAt(
    inputs: readonly WarmupInput[],
    index: number
): WarmupInput | undefined {
    return inputs[index];
}

/**
 * @brief Merge shared and entry-local compile options.
 */
function mergeCompileOptions(
    shared: Partial<CompileOptions> | undefined,
    local: Partial<CompileOptions> | undefined,
    namePrefix: string | undefined,
    index: number
): Partial<CompileOptions> | undefined {
    if (shared === undefined && local === undefined && namePrefix === undefined) {
        return undefined;
    }
    const merged: {
        name?: string;
        mode?: CompileMode;
        debugSource?: boolean;
    } = {};
    copyCompileOptions(shared, merged);
    copyCompileOptions(local, merged);
    if (merged.name === undefined && namePrefix !== undefined) {
        merged.name = `${namePrefix}${String(index)}`;
    }
    return merged;
}

/**
 * @brief Copy supported compile option fields.
 */
function copyCompileOptions(
    source: Partial<CompileOptions> | undefined,
    target: {
        name?: string;
        mode?: CompileMode;
        debugSource?: boolean;
    }
): void {
    if (source === undefined) {
        return;
    }
    if (!isRecord(source)) {
        throw new TypeError("warmup compile options must be an object");
    }
    const record = source as Readonly<Record<string, unknown>>;
    const name = record["name"];
    if (name !== undefined) {
        if (typeof name !== "string") {
            throw new TypeError("compile name must be a string");
        }
        target.name = name;
    }
    const mode = record["mode"];
    if (mode !== undefined) {
        if (mode !== "safe" && mode !== "unsafe" && mode !== "unchecked") {
            throw new TypeError("compile mode must be \"safe\", \"unsafe\", or \"unchecked\"");
        }
        target.mode = mode;
    }
    const debugSource = record["debugSource"];
    if (debugSource !== undefined) {
        if (typeof debugSource !== "boolean") {
            throw new TypeError("compile debugSource must be a boolean");
        }
        target.debugSource = debugSource;
    }
}

/**
 * @brief Build a factory for an already constructed guard.
 */
function makeGuardFactory(
    guard: Guard<unknown, Presence> | undefined
): () => Guard<unknown, Presence> {
    if (guard === undefined) {
        throw new TypeError("warmup entry requires guard or factory");
    }
    return (): Guard<unknown, Presence> => guard;
}

/**
 * @brief Check structural compile cache shape.
 */
function isCompileCache(value: unknown): value is CompileCache {
    return isRecord(value) &&
        typeof value["compile"] === "function" &&
        typeof value["delete"] === "function" &&
        typeof value["clear"] === "function";
}

/**
 * @brief Read one own data slot from a user-supplied record.
 */
function readOwnDataProperty(
    value: object,
    key: PropertyKey
): unknown {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        return undefined;
    }
    return descriptor.value;
}

/**
 * @brief Check whether a value can be read as an options record.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
