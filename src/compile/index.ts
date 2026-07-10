/**
 * @file compile/index.ts
 * @brief Public compile module barrel.
 */

export {
    CompiledBaseGuard,
    CompiledBooleanBaseGuard,
    compile,
    compileBoolean
} from "./guard.js";

export {
    compileCached,
    createCompileCache,
    warmup
} from "./cache.js";

export {
    emitCompiledBooleanSourceBundle,
    emitCompiledGraphBooleanSourceBundle,
    emitCompiledSourceBundle
} from "./source.js";

export type {
    CompiledBooleanGuard,
    CompileMode,
    CompileOptions,
    CompileSourceMode,
    CompiledGuard,
    CompiledSourceBundle
} from "./types.js";
export type {
    CompileCache,
    WarmupEntry,
    WarmupInput,
    WarmupOptions
} from "./cache.js";
