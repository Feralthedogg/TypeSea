/**
 * @file check.ts
 * @brief Diagnostic schema interpreter dispatcher.
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
 */
export function checkSchema<TValue>(
  schema: Schema,
  value: unknown
): CheckResult<TValue> {
  if (isSchemaWithState(schema, value, makeValidationState())) {
    return ok(value as TValue);
  }
  const issues: Issue[] = [];
  const path: PathSegment[] = [];
  collectIssues(schema, value, path, issues, makeValidationState());
  if (issues.length === 0) {
    pushIssue(path, issues, "expected_refinement", "matching schema", actualType(value));
  }
  return err(freezeIssueArray(issues));
}

/**
 * @brief collect issues.
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
