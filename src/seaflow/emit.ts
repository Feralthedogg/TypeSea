/**
 * @file emit.ts
 * @brief SeaFlow bounded emission loop.
 */

import { SchemaTag } from "../kind/index.js";
import type { Schema } from "../schema/index.js";
import { isSchema } from "../evaluate/predicate.js";
import { emitCompositeCases } from "./composite.js";
import { normalizeSeaFlowOptions } from "./options.js";
import { emitScalarCases } from "./scalar.js";
import { readSeaFlowSchema } from "./source.js";
import type {
    SeaFlowCase,
    SeaFlowConfig,
    SeaFlowContext,
    SeaFlowOptions,
    SeaFlowSource
} from "./types.js";

/**
 * @brief Generate structured SeaFlow cases for a guard or schema.
 * @param source Guard-like value or direct schema record.
 * @param options Optional intensity, quota, and filtering controls.
 * @returns Iterator over frozen case descriptors.
 * @details Filtering happens after case generation so solver modules can remain
 * simple and still produce stable reason strings. The yielded count is measured
 * after filtering, matching what callers actually consume.
 */
export function* fuzzCases(
    source: SeaFlowSource,
    options?: SeaFlowOptions
): IterableIterator<SeaFlowCase> {
    const schema = readSeaFlowSchema(source);
    const config = normalizeSeaFlowOptions(options);
    const context = rootContext(config);
    let count = 0;
    for (const item of emitSchemaCases(schema, context)) {
        if (!caseEnabled(item, config)) {
            continue;
        }
        yield item;
        count += 1;
        if (count >= config.maxYields) {
            return;
        }
    }
}

/**
 * @brief Generate values only, discarding SeaFlow metadata.
 * @param source Guard-like value or direct schema record.
 * @param options Optional generation controls.
 * @returns Iterator over candidate payloads.
 * @details This wrapper is intentionally thin. Advanced tests should use
 * `fuzzCases()` when they need expected verdicts or reason codes.
 */
export function* fuzz(
    source: SeaFlowSource,
    options?: SeaFlowOptions
): IterableIterator<unknown> {
    for (const item of fuzzCases(source, options)) {
        yield item.value;
    }
}

/**
 * @brief Dispatch one schema node to the scalar or composite solver family.
 * @param schema Schema node currently being inverted.
 * @param context Traversal state and quota configuration.
 * @returns Iterator over cases produced for this node.
 * @details Composite solvers receive this function as a callback. That keeps
 * nested object, tuple, and union generation under the same dispatcher and
 * avoids each module knowing about every schema tag.
 */
export function* emitSchemaCases(
    schema: Schema,
    context: SeaFlowContext
): IterableIterator<SeaFlowCase> {
    const emitted = isScalarSchema(schema)
        ? emitScalarCases(schema, context)
        : emitCompositeCases(schema, context, emitSchemaCases);
    for (const item of emitted) {
        yield reconcileSeaFlowCase(schema, item);
    }
}

/**
 * @brief Build traversal state for the root schema.
 * @param config Normalized generation configuration.
 * @returns Context with empty path and zero depth.
 */
function rootContext(config: SeaFlowConfig): SeaFlowContext {
    return {
        config,
        depth: 0,
        path: []
    };
}

/**
 * @brief Apply caller-selected case category filters.
 * @param item Generated case before filtering.
 * @param config Normalized generation configuration.
 * @returns True when the case should count toward `maxYields`.
 */
function caseEnabled(item: SeaFlowCase, config: SeaFlowConfig): boolean {
    if (!item.valid && !config.includeInvalid) {
        return false;
    }
    if (item.kind === "security" && !config.includeSecurity) {
        return false;
    }
    return true;
}

/**
 * @brief Reconcile solver metadata with the executable schema contract.
 * @param schema Local schema that produced the candidate.
 * @param item Candidate and provisional solver classification.
 * @returns Frozen case whose verdict matches runtime validation.
 * @details SeaFlow is test tooling rather than a validator hot path. Running the
 * exact predicate here prevents heuristic sample synthesis from publishing a
 * stale verdict when constraints overlap.
 */
function reconcileSeaFlowCase(schema: Schema, item: SeaFlowCase): SeaFlowCase {
    const valid = isSchema(schema, item.value);
    const kind = item.kind === "security"
        ? "security"
        : valid
            ? "valid"
            : "invalid";
    if (item.valid === valid && item.kind === kind) {
        return item;
    }
    return Object.freeze({
        value: item.value,
        valid,
        kind,
        reason: item.reason,
        path: item.path
    });
}

/**
 * @brief Identify schema tags handled by scalar solvers.
 * @param schema Candidate schema node.
 * @returns True when the node has no child schema traversal.
 */
function isScalarSchema(schema: Schema): boolean {
    switch (schema.tag) {
        case SchemaTag.Unknown:
        case SchemaTag.Never:
        case SchemaTag.String:
        case SchemaTag.Number:
        case SchemaTag.BigInt:
        case SchemaTag.Symbol:
        case SchemaTag.Boolean:
        case SchemaTag.Literal:
        case SchemaTag.Date:
        case SchemaTag.File:
        case SchemaTag.InstanceOf:
            return true;
        default:
            return false;
    }
}
