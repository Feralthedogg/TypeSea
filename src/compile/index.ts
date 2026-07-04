/**
 * @file compile/index.ts
 * @brief Public compile module barrel.
 * @details This barrel keeps public import paths stable while implementation files remain
 * split by responsibility.
 */

export {
    CompiledBaseGuard,
    compile
} from "./guard.js";

export {
    emitCompiledSourceBundle
} from "./source.js";

export type {
    CompileMode,
    CompileOptions,
    CompiledGuard,
    CompiledSourceBundle
} from "./types.js";
