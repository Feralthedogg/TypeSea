/**
 * @file table.ts
 * @brief Frozen public builder table.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */

import { asyncDecoder, asyncPipe, asyncRefine, asyncTransform } from "../async/index.js";
import {
    catchValue,
    codec,
    coerce,
    decoder,
    defaultValue,
    pipe,
    prefault,
    transform
} from "../decoder/index.js";
import {
    array,
    discriminatedUnion,
    intersect,
    map,
    record,
    set,
    tuple,
    union
} from "./composite.js";
import {
    lazy,
    nullable,
    nullish,
    optional,
    refine,
    superRefine,
    undefinedable
} from "./modifier.js";
import {
    catchall,
    deepPartial,
    extend,
    merge,
    object,
    omit,
    partial,
    passthrough,
    pick,
    required,
    safeExtend,
    strict,
    strictObject,
    strip
} from "./object/index.js";
import {
    bigintGuard,
    booleanGuard,
    dateGuard,
    enumValues,
    literal,
    neverGuard,
    nullGuard,
    numberGuard,
    stringGuard,
    symbolGuard,
    unknownGuard,
    undefinedGuard,
    voidGuard
} from "./scalar.js";
import {
    instanceOf,
    json,
    property
} from "./runtime.js";

/**
 * @brief t.
 * @details Frozen namespace of all public builders. Freezing prevents accidental
 * mutation of shared singleton guards and helper functions after module load.
 */
export const t = Object.freeze({
    unknown: unknownGuard,
    never: neverGuard,
    string: stringGuard,
    number: numberGuard,
    date: dateGuard,
    bigint: bigintGuard,
    symbol: symbolGuard,
    boolean: booleanGuard,
    null: nullGuard,
    undefined: undefinedGuard,
    void: voidGuard,
    literal,
    enum: enumValues,
    enumValues,
    array,
    tuple,
    record,
    map,
    set,
    instanceOf,
    property,
    json,
    decoder,
    default: defaultValue,
    defaultValue,
    prefault,
    catch: catchValue,
    codec,
    object,
    strictObject,
    extend,
    merge,
    pick,
    omit,
    partial,
    deepPartial,
    required,
    safeExtend,
    strict,
    passthrough,
    strip,
    catchall,
    union,
    intersect,
    discriminatedUnion,
    optional,
    undefinedable,
    nullable,
    nullish,
    lazy,
    refine,
    superRefine,
    transform,
    pipe,
    coerce,
    asyncDecoder,
    asyncRefine,
    asyncTransform,
    asyncPipe
} as const);
