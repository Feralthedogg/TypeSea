/**
 * @file compile/check.ts
 * @brief Diagnostic validator function table emitter.
 */

import { SchemaTag } from "../kind/index.js";
import type { Schema } from "../schema/index.js";
import {
  emitArrayCheck,
  emitDiscriminatedUnionCheck,
  emitObjectCheck,
  emitRecordCheck,
  emitTupleCheck
} from "./check-composite.js";
import {
  emitLiteralCheck,
  emitNumberCheck,
  emitStringCheck
} from "./check-scalar.js";
import { pushSchema } from "./context.js";
import { emitIssue } from "./issue.js";
import { emitUnion } from "./predicate.js";
import type { EmitContext, FunctionSource } from "./types.js";

/**
 * @brief emit check function function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param context Borrowed input slot named context; validation or normalization happens before stored state changes.
 * @returns Result for emit check function; ownership of newly created aggregates is transferred to the caller.
 */
export function emitCheckFunction(schema: Schema, context: EmitContext): string {
  const cached = context.checkFunctionNames.get(schema);
  if (cached !== undefined) {
    return cached;
  }
  const name = `c${String(context.checkFunctions.length)}`;
  const source: FunctionSource = {
    name,
    body: ""
  };
  context.checkFunctionNames.set(schema, name);
  context.checkFunctions.push(source);
  source.body = emitCheckBody(schema, "v", "p", "s", context);
  return name;
}

/**
 * @brief emit check functions function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param context Borrowed input slot named context; validation or normalization happens before stored state changes.
 * @returns Result for emit check functions; ownership of newly created aggregates is transferred to the caller.
 */
export function emitCheckFunctions(context: EmitContext): string {
  const chunks = new Array<string>(context.checkFunctions.length);
  for (let index = 0; index < context.checkFunctions.length; index += 1) {
    const source = context.checkFunctions[index];
    if (source === undefined) {
      continue;
    }
    chunks[index] = `function ${source.name}(v,p,s){${source.body}}`;
  }
  return chunks.join("");
}

/**
 * @brief emit check body function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param context Borrowed input slot named context; validation or normalization happens before stored state changes.
 * @returns Result for emit check body; ownership of newly created aggregates is transferred to the caller.
 */
function emitCheckBody(
  schema: Schema,
  value: string,
  path: string,
  issues: string,
  context: EmitContext
): string {
  switch (schema.tag) {
    case SchemaTag.Unknown:
      return "return;";
    case SchemaTag.Never:
      return emitIssue(issues, path, "expected_never", "never", `a(${value})`);
    case SchemaTag.String:
      return emitStringCheck(schema, value, path, issues, context);
    case SchemaTag.Number:
      return emitNumberCheck(schema, value, path, issues);
    case SchemaTag.BigInt:
      return `if(typeof ${value}!=="bigint"){${emitIssue(
        issues,
        path,
        "expected_bigint",
        "bigint",
        `a(${value})`
      )}}`;
    case SchemaTag.Symbol:
      return `if(typeof ${value}!=="symbol"){${emitIssue(
        issues,
        path,
        "expected_symbol",
        "symbol",
        `a(${value})`
      )}}`;
    case SchemaTag.Boolean:
      return `if(typeof ${value}!=="boolean"){${emitIssue(
        issues,
        path,
        "expected_boolean",
        "boolean",
        `a(${value})`
      )}}`;
    case SchemaTag.Literal:
      return emitLiteralCheck(schema.value, value, path, issues, context);
    case SchemaTag.Array:
      return emitArrayCheck(schema.item, value, path, issues, context, emitCheckFunction);
    case SchemaTag.Tuple:
      return emitTupleCheck(schema.items, value, path, issues, context, emitCheckFunction);
    case SchemaTag.Record:
      return emitRecordCheck(schema.value, value, path, issues, context, emitCheckFunction);
    case SchemaTag.Object:
      return emitObjectCheck(schema, value, path, issues, context, emitCheckFunction);
    case SchemaTag.Union:
      return `if(!${emitUnion(schema.options, value, context)}){${emitIssue(
        issues,
        path,
        "expected_union",
        "union",
        `a(${value})`
      )}}`;
    case SchemaTag.Intersection:
      return [
        emitCheckCall(schema.left, value, path, issues, context),
        emitCheckCall(schema.right, value, path, issues, context)
      ].join("");
    case SchemaTag.Optional:
    case SchemaTag.Undefinedable:
      return `if(${value}!==undefined){${emitCheckCall(
        schema.inner,
        value,
        path,
        issues,
        context
      )}}`;
    case SchemaTag.Nullable:
      return `if(${value}!==null){${emitCheckCall(
        schema.inner,
        value,
        path,
        issues,
        context
      )}}`;
    case SchemaTag.DiscriminatedUnion:
      return emitDiscriminatedUnionCheck(
        schema.key,
        schema.cases,
        value,
        path,
        issues,
        context,
        emitCheckFunction
      );
    case SchemaTag.Brand:
      return emitCheckCall(schema.inner, value, path, issues, context);
    case SchemaTag.Lazy:
    case SchemaTag.Refine:
      return `m(${String(pushSchema(context, schema))},${value},${path},${issues});`;
  }
}

/**
 * @brief emit check call function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param context Borrowed input slot named context; validation or normalization happens before stored state changes.
 * @returns Result for emit check call; ownership of newly created aggregates is transferred to the caller.
 */
function emitCheckCall(
  schema: Schema,
  value: string,
  path: string,
  issues: string,
  context: EmitContext
): string {
  return `${emitCheckFunction(schema, context)}(${value},${path},${issues});`;
}
