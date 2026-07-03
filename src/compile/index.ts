/**
 * @file compile/index.ts
 * @brief Public compile module barrel.
 */

export {
  CompiledBaseGuard,
  compile
} from "./guard.js";

export {
  emitCompiledSourceBundle
} from "./source.js";

export type {
  CompileOptions,
  CompiledGuard,
  CompiledSourceBundle
} from "./types.js";
