/**
 * @file compile/index.ts
 * @brief Public compile module barrel.
 * @details This barrel keeps public import paths stable while implementation files remain
 * split by responsibility.
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
