/**
 * @file predicate.ts
 * @brief Instantiate instrumented graph bundles for the opt-in JIT bridge.
 */

import type { CompiledSourceBundle } from "../../compile/index.js";
import { isInspectableValue } from "../../evaluate/shared.js";
import {
    makeDynamicCheck,
    makeDynamicFirstIssueCheck,
    makeDynamicIssueCheck,
    strictKeys,
    type BooleanPredicate,
    type DynamicCheck,
    type DynamicFirstIssueCheck,
    type DynamicIssueCheck,
    type StrictKeysCheck
} from "../../compile/runtime.js";
import type { LiteralValue } from "../../schema/index.js";
import {
    CHECKSUM_TABLE,
    COUNTER_TABLE,
    FREQUENCY_TABLE,
    OVERFLOW_TABLE
} from "./layout.js";
import {
    createSeaCurrentRuntimeTables,
    type SeaCurrentRuntimeTables
} from "./runtime.js";
import type { SeaCurrentInstrumentationManifest } from "./types.js";

/** @brief Predicate and fixed tables created from one generated source bundle. */
export interface SeaCurrentPredicateRuntime {
    readonly predicate: BooleanPredicate;
    readonly tables: SeaCurrentRuntimeTables;
}

type SeaCurrentPredicateFactory = (
    counters: Float64Array,
    frequencies: Float64Array,
    checksums: Uint32Array,
    overflow: Uint8Array,
    literals: readonly LiteralValue[],
    regexps: readonly RegExp[],
    keysets: readonly (readonly string[])[],
    strings: readonly string[],
    dynamicCheck: DynamicCheck,
    dynamicIssueCheck: DynamicIssueCheck,
    dynamicFirstIssueCheck: DynamicFirstIssueCheck,
    strictKeyCheck: StrictKeysCheck
) => BooleanPredicate;

const EMPTY_MANIFEST: SeaCurrentInstrumentationManifest = Object.freeze({
    version: 1,
    profileId: "uninstrumented",
    targetKey: "none",
    regions: Object.freeze([]),
    counterSlots: 0,
    checksumSlots: 0
});

/**
 * @brief Instantiate one instrumented predicate without exposing table mutation.
 * @param bundle Generated predicate source and side tables.
 * @param manifest Fixed instrumentation layout.
 * @returns Predicate closure and reusable typed tables.
 */
export function instantiateSeaCurrentPredicate(
    bundle: CompiledSourceBundle,
    manifest: SeaCurrentInstrumentationManifest
): SeaCurrentPredicateRuntime {
    const tables = createSeaCurrentRuntimeTables(manifest);
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const factory = new Function(
        COUNTER_TABLE,
        FREQUENCY_TABLE,
        CHECKSUM_TABLE,
        OVERFLOW_TABLE,
        "l",
        "r",
        "k",
        "u",
        "d",
        "m",
        "mf",
        "sk",
        `return (function(l,r,k,u,d,m,mf,sk){${bundle.source}})(l,r,k,u,d,m,mf,sk);`
    ) as SeaCurrentPredicateFactory;
    const generated = factory(
        tables.counters,
        tables.frequencies,
        tables.checksums,
        tables.overflow,
        bundle.literals,
        bundle.regexps,
        bundle.keysets,
        bundle.strings,
        makeDynamicCheck(bundle.dynamicSchemas),
        makeDynamicIssueCheck(bundle.dynamicSchemas),
        makeDynamicFirstIssueCheck(bundle.dynamicSchemas),
        strictKeys
    );
    const predicate = closeHostileInputBoundary(generated, tables.overflow);
    return Object.freeze({ predicate, tables });
}

/** @brief Instantiate an uninstrumented graph predicate from compiler side tables. */
export function instantiateSeaCurrentOptimizedPredicate(
    bundle: CompiledSourceBundle
): BooleanPredicate {
    return instantiateSeaCurrentPredicate(bundle, EMPTY_MANIFEST).predicate;
}

/**
 * @brief Close generated predicates over TypeSea's hostile-input contract.
 * @details Ordinary generated-code failures remain programmer errors. Reflection
 * failures caused by revoked or trapping proxies fail closed; profiled runtimes
 * additionally poison the artifact because an interrupted region cannot provide
 * complete outcome counts.
 * @param generated Raw predicate returned by the generated factory.
 * @param overflow Shared artifact-integrity flag.
 * @returns Public predicate with the same boundary as compileBoolean().
 */
function closeHostileInputBoundary(
    generated: BooleanPredicate,
    overflow: Uint8Array
): BooleanPredicate {
    return function seaCurrentPredicate(value: unknown): boolean {
        // eslint-disable-next-line no-restricted-syntax
        try {
            return generated(value);
        } catch {
            if (isInspectableValue(value)) {
                throw new TypeError("SeaCurrent generated predicate failed");
            }
            overflow[0] = 1;
            return false;
        }
    };
}
