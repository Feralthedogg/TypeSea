/**
 * @file check.ts
 * @brief Diagnostic schema interpreter dispatcher.
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
 */

import { SchemaTag } from "../kind/index.js";
import type { CheckResult, Issue, PathSegment } from "../issue/index.js";
import { freezeIssueArray } from "../issue/index.js";
import { err, ok } from "../result/index.js";
import {
    resolveLazySchema,
    type Schema
} from "../schema/index.js";
import {
    collectArrayIssues,
    collectDiscriminatedUnionIssues,
    collectObjectIssues,
    collectRecordIssues,
    collectRefineIssues,
    collectTupleIssues
} from "./check-composite.js";
import {
    collectNumberIssues,
    collectStringIssues
} from "./check-scalar.js";
import { pushIssue } from "./issue.js";
import { isSchemaWithState, isUnionSchema } from "./predicate.js";
import {
    actualType,
    literalToExpected
} from "./shared.js";
import {
    enterValidation,
    leaveValidation,
    makeValidationState,
    type ValidationState
} from "./state.js";

/**
 * @brief check schema.
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
 * @param schema Schema used to validate the input.
 * @param value Candidate runtime value.
 * @returns Frozen success or diagnostic failure result.
 */
export function checkSchema<TValue>(
    schema: Schema,
    value: unknown
): CheckResult<TValue> {
    if (isSchemaWithState(schema, value, makeValidationState())) {
        return ok(value as TValue);
    }
    /*
     * The boolean predicate runs first to keep the valid path allocation-light.
     * Diagnostics are collected only after failure, matching compiled check().
     */
    const issues: Issue[] = [];
    const path: PathSegment[] = [];
    collectIssues(schema, value, path, issues, makeValidationState());
    if (issues.length === 0) {
        /*
         * Refine predicates can fail without emitting a structural issue. Add a
         * conservative fallback so callers never receive an empty failure.
         */
        pushIssue(path, issues, "expected_refinement", "matching schema", actualType(value));
    }
    return err(freezeIssueArray(issues));
}

/**
 * @brief collect issues.
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
 * @param schema Schema node being diagnosed.
 * @param value Candidate runtime value.
 * @param path Mutable path stack shared by recursive diagnostic calls.
 * @param issues Output issue buffer.
 * @param state Shared recursion, cycle, and graph execution state.
 * @post Calls `leaveValidation` only when `enterValidation` returned entered.
 */
function collectIssues(
    schema: Schema,
    value: unknown,
    path: PathSegment[],
    issues: Issue[],
    state: ValidationState
): void {
    const entered = enterValidation(schema, value, state);
    if (entered === "cycle") {
        /*
         * A repeated schema/value pair means the recursive structure is already
         * being validated higher on the stack. Treat it as provisionally valid
         * to break cycles without fabricating duplicate diagnostics.
         */
        return;
    }
    if (entered === "budget") {
        pushIssue(
            path,
            issues,
            "expected_depth_limit",
            `depth <= ${String(state.maxDepth)}`,
            "depth or work limit exceeded"
        );
        return;
    }
    collectIssuesInner(schema, value, path, issues, state);
    leaveValidation(schema, value, state);
}

/**
 * @brief collect issues inner.
 * @details Interpreter helpers keep safe descriptor-based reads and diagnostic collection
 * aligned with compiled behavior.
 * @param schema Schema node being diagnosed after entry admission.
 * @param value Candidate runtime value.
 * @param path Mutable path stack shared by recursive diagnostic calls.
 * @param issues Output issue buffer.
 * @param state Shared recursion, cycle, and graph execution state.
 */
function collectIssuesInner(
    schema: Schema,
    value: unknown,
    path: PathSegment[],
    issues: Issue[],
    state: ValidationState
): void {
    switch (schema.tag) {
        case SchemaTag.Unknown:
            return;
        case SchemaTag.Never:
            pushIssue(path, issues, "expected_never", "never", actualType(value));
            return;
        case SchemaTag.String:
            collectStringIssues(schema, value, path, issues);
            return;
        case SchemaTag.Number:
            collectNumberIssues(schema, value, path, issues);
            return;
        case SchemaTag.BigInt:
            if (typeof value !== "bigint") {
                pushIssue(path, issues, "expected_bigint", "bigint", actualType(value));
            }
            return;
        case SchemaTag.Symbol:
            if (typeof value !== "symbol") {
                pushIssue(path, issues, "expected_symbol", "symbol", actualType(value));
            }
            return;
        case SchemaTag.Boolean:
            if (typeof value !== "boolean") {
                pushIssue(path, issues, "expected_boolean", "boolean", actualType(value));
            }
            return;
        case SchemaTag.Literal:
            if (!Object.is(value, schema.value)) {
                pushIssue(
                    path,
                    issues,
                    "expected_literal",
                    literalToExpected(schema.value),
                    actualType(value)
                );
            }
            return;
        case SchemaTag.Array:
            collectArrayIssues(schema.item, value, path, issues, state, collectIssues);
            return;
        case SchemaTag.Tuple:
            collectTupleIssues(schema.items, value, path, issues, state, collectIssues);
            return;
        case SchemaTag.Record:
            collectRecordIssues(schema.value, value, path, issues, state, collectIssues);
            return;
        case SchemaTag.Object:
            collectObjectIssues(schema, value, path, issues, state, collectIssues);
            return;
        case SchemaTag.Union:
            if (!isUnionSchema(schema.options, value, state)) {
                pushIssue(path, issues, "expected_union", "union", actualType(value));
            }
            return;
        case SchemaTag.Intersection:
            /*
             * Intersections accumulate diagnostics from both sides because both
             * schemas must accept the same value.
             */
            collectIssues(schema.left, value, path, issues, state);
            collectIssues(schema.right, value, path, issues, state);
            return;
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
            if (value !== undefined) {
                collectIssues(schema.inner, value, path, issues, state);
            }
            return;
        case SchemaTag.Nullable:
            if (value !== null) {
                collectIssues(schema.inner, value, path, issues, state);
            }
            return;
        case SchemaTag.DiscriminatedUnion:
            collectDiscriminatedUnionIssues(
                schema.key,
                schema.cases,
                value,
                path,
                issues,
                state,
                collectIssues
            );
            return;
        case SchemaTag.Brand:
            collectIssues(schema.inner, value, path, issues, state);
            return;
        case SchemaTag.Lazy:
            /*
             * Lazy schemas resolve through the shared state so recursive lazy
             * references are tracked consistently with predicate evaluation.
             */
            collectIssues(resolveLazySchema(schema, state.resolving), value, path, issues, state);
            return;
        case SchemaTag.Refine:
            collectRefineIssues(
                schema.inner,
                schema.predicate,
                schema.name,
                value,
                path,
                issues,
                state,
                collectIssues
            );
            return;
    }
}
