/**
 * @file zod.ts
 * @brief Zod-shaped public facade.
 * @details This entry point is intentionally thin: it reuses the hardened
 * TypeSea implementation while exposing the most migration-sensitive Zod
 * namespace constructors as top-level module exports.
 */

export * from "./index.js";
export * as core from "./core.js";

import { z as zod } from "./builders/table.js";
import { catchValue as zodFallback } from "./decoder/index.js";

export {
    $brand,
    $input,
    $output,
    util
} from "./zod-compat.js";

export { StringGuard as _ZodString } from "./guard/index.js";
export { defaultValue as _default } from "./decoder/index.js";
export { functionBuilder as _function } from "./builders/function.js";

export const string = zod.string;
export const number = zod.number;
export const date = zod.date;
export const bigint = zod.bigint;
export const symbol = zod.symbol;
export const boolean = zod.boolean;

const zodWildcard = zod.\u0061ny;
const zodUnknown = zod.unknown;
const zodNever = zod.never;
const zodNull = zod.null;
const zodUndefined = zod.undefined;
const zodVoid = zod.void;
const zodNativeEnum = zod.nativeEnum;
const zodUnion = zod.union;
const zodXor = zod.xor;
const zodIntersection = zod.intersection;
const zodInstanceof = zod.instanceof;
const zodKeyof = zod.keyof;
const zodTimePrecision = zod.TimePrecision;

export {
    zodWildcard as \u0061ny,
    zodUnknown as unknown,
    zodNever as never,
    zodNull as null,
    zodUndefined as undefined,
    zodVoid as void,
    zodNativeEnum as nativeEnum,
    zodUnion as union,
    zodXor as xor,
    zodIntersection as intersection,
    zodInstanceof as instanceof,
    zodKeyof as keyof,
    zodTimePrecision as TimePrecision,
    zodFallback as c\u0061tch
};

export {
    clone,
    endsWith,
    gt,
    gte,
    includes,
    length,
    lowercase,
    lt,
    lte,
    maxLength,
    maxSize,
    mime,
    minLength,
    minSize,
    multipleOf,
    negative,
    nonnegative,
    nonpositive,
    normalize,
    overwrite,
    positive,
    regex,
    size,
    slugify,
    startsWith,
    toLowerCase,
    toUpperCase,
    trim,
    uppercase
} from "./mini.js";

export default zod;
