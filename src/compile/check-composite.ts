/**
 * @file compile/check-composite.ts
 * @brief Composite diagnostic validator snippets.
 */

import {
  ObjectModeTag,
  PresenceTag,
  SchemaTag
} from "../kind/index.js";
import type {
  DiscriminatedUnionCase,
  Schema
} from "../schema/index.js";
import {
  pushKeyset,
  pushLiteral,
  stringRef
} from "./context.js";
import {
  emitIssue,
  emitIssueExpr
} from "./issue.js";
import { stringLiteral } from "./names.js";
import type { EmitContext } from "./types.js";

/**
 * @brief check function emitter type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type CheckFunctionEmitter = (
  schema: Schema,
  context: EmitContext
) => string;

/**
 * @brief emit array check function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param item Borrowed input slot named item; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param context Borrowed input slot named context; validation or normalization happens before stored state changes.
 * @param emitChild Borrowed input slot named emitChild; validation or normalization happens before stored state changes.
 * @returns Result for emit array check; ownership of newly created aggregates is transferred to the caller.
 */
export function emitArrayCheck(
  item: Schema,
  value: string,
  path: string,
  issues: string,
  context: EmitContext,
  emitChild: CheckFunctionEmitter
): string {
  const itemFunction = emitChild(item, context);
  return [
    `if(!Array.isArray(${value})){${emitIssue(
      issues,
      path,
      "expected_array",
      "array",
      `a(${value})`
    )}return;}`,
    `for(let i=0;i<${value}.length;i+=1){`,
    `const d=gp(${value},i);`,
    `${path}.push(i);`,
    `if(d!==undefined&&!h.call(d,"value")){${emitIssue(
      issues,
      path,
      "expected_array",
      "data property",
      stringLiteral("accessor")
    )}}else{${itemFunction}(d===undefined?undefined:d.value,${path},${issues});}`,
    `${path}.pop();`,
    "}"
  ].join("");
}

/**
 * @brief emit tuple check function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param items Borrowed input slot named items; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param context Borrowed input slot named context; validation or normalization happens before stored state changes.
 * @param emitChild Borrowed input slot named emitChild; validation or normalization happens before stored state changes.
 * @returns Result for emit tuple check; ownership of newly created aggregates is transferred to the caller.
 */
export function emitTupleCheck(
  items: readonly Schema[],
  value: string,
  path: string,
  issues: string,
  context: EmitContext,
  emitChild: CheckFunctionEmitter
): string {
  const parts: string[] = [
    `if(!Array.isArray(${value})){${emitIssue(
      issues,
      path,
      "expected_tuple",
      "tuple",
      `a(${value})`
    )}return;}`,
    `if(${value}.length!==${String(items.length)}){${emitIssue(
      issues,
      path,
      "expected_tuple_length",
      `length ${String(items.length)}`,
      `"length "+String(${value}.length)`
    )}}`,
    `const n=${value}.length<${String(items.length)}?${value}.length:${String(items.length)};`
  ];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === undefined) {
      continue;
    }
    const itemFunction = emitChild(item, context);
    parts.push(`if(${String(index)}<n){const d=gp(${value},${String(index)});${path}.push(${String(index)});if(d!==undefined&&!h.call(d,"value")){${emitIssue(
      issues,
      path,
      "expected_tuple",
      "data property",
      stringLiteral("accessor")
    )}}else{${itemFunction}(d===undefined?undefined:d.value,${path},${issues});}${path}.pop();}`);
  }
  return parts.join("");
}

/**
 * @brief emit record check function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param item Borrowed input slot named item; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param context Borrowed input slot named context; validation or normalization happens before stored state changes.
 * @param emitChild Borrowed input slot named emitChild; validation or normalization happens before stored state changes.
 * @returns Result for emit record check; ownership of newly created aggregates is transferred to the caller.
 */
export function emitRecordCheck(
  item: Schema,
  value: string,
  path: string,
  issues: string,
  context: EmitContext,
  emitChild: CheckFunctionEmitter
): string {
  const itemFunction = emitChild(item, context);
  return [
    `if(!o(${value})){${emitIssue(
      issues,
      path,
      "expected_record",
      "record",
      `a(${value})`
    )}return;}`,
    `const ks=Object.keys(${value});`,
    "for(let i=0;i<ks.length;i+=1){",
    "const key=ks[i];",
    `if(key!==undefined){const d=g(${value},key);${path}.push(key);if(d===undefined){${emitIssue(
      issues,
      path,
      "expected_record",
      "data property",
      stringLiteral("accessor or missing")
    )}}else{${itemFunction}(d.value,${path},${issues});}${path}.pop();}`,
    "}"
  ].join("");
}

/**
 * @brief emit object check function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param context Borrowed input slot named context; validation or normalization happens before stored state changes.
 * @param emitChild Borrowed input slot named emitChild; validation or normalization happens before stored state changes.
 * @returns Result for emit object check; ownership of newly created aggregates is transferred to the caller.
 */
export function emitObjectCheck(
  schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
  value: string,
  path: string,
  issues: string,
  context: EmitContext,
  emitChild: CheckFunctionEmitter
): string {
  const parts: string[] = [
    `if(!o(${value})){${emitIssue(
      issues,
      path,
      "expected_object",
      "object",
      `a(${value})`
    )}return;}`
  ];
  const entries = schema.entries;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) {
      continue;
    }
    const key = stringRef(context, entry.key);
    const child = emitChild(entry.schema, context);
    if (entry.presence === PresenceTag.Required) {
      parts.push(`{const d=g(${value},${key});if(d===undefined){${path}.push(${key});${emitIssue(
        issues,
        path,
        "expected_required_key",
        "present key",
        stringLiteral("missing")
      )}${path}.pop();}else{${path}.push(${key});${child}(d.value,${path},${issues});${path}.pop();}}`);
    } else {
      parts.push(`if(h.call(${value},${key})){const d=g(${value},${key});${path}.push(${key});if(d===undefined){${emitIssue(
        issues,
        path,
        "expected_object",
        "data property",
        stringLiteral("accessor")
      )}}else{${child}(d.value,${path},${issues});}${path}.pop();}`);
    }
  }
  if (schema.mode === ObjectModeTag.Strict) {
    const keys = new Array<string>(schema.entries.length);
    for (let index = 0; index < schema.entries.length; index += 1) {
      const entry = schema.entries[index];
      if (entry !== undefined) {
        keys[index] = entry.key;
      }
    }
    parts.push(`const xs=Object.keys(${value});for(let i=0;i<xs.length;i+=1){const key=xs[i];if(key!==undefined&&!k[${String(pushKeyset(context, keys))}].includes(key)){${path}.push(key);${emitIssue(
      issues,
      path,
      "unrecognized_key",
      "known key",
      stringLiteral("extra key")
    )}${path}.pop();}}`);
  }
  return parts.join("");
}

/**
 * @brief emit discriminated union check function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param key Borrowed input slot named key; validation or normalization happens before stored state changes.
 * @param cases Borrowed input slot named cases; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param context Borrowed input slot named context; validation or normalization happens before stored state changes.
 * @param emitChild Borrowed input slot named emitChild; validation or normalization happens before stored state changes.
 * @returns Result for emit discriminated union check; ownership of newly created aggregates is transferred to the caller.
 */
export function emitDiscriminatedUnionCheck(
  key: string,
  cases: readonly DiscriminatedUnionCase[],
  value: string,
  path: string,
  issues: string,
  context: EmitContext,
  emitChild: CheckFunctionEmitter
): string {
  const keyRef = stringRef(context, key);
  const descriptor = `g(${value},${keyRef})`;
  const parts: string[] = [
    `if(!o(${value})){${emitIssue(
      issues,
      path,
      "expected_object",
      "object",
      `a(${value})`
    )}return;}`,
    `const dd=${descriptor};`,
    `if(dd===undefined){${path}.push(${keyRef});${emitIssue(
      issues,
      path,
      "expected_discriminant",
      "data property",
      stringLiteral("missing or accessor")
    )}${path}.pop();return;}`,
    "const dv=dd.value;",
    `if(typeof dv!=="string"){${path}.push(${keyRef});${emitIssue(
      issues,
      path,
      "expected_discriminant",
      "string discriminant",
      "a(dv)"
    )}${path}.pop();return;}`
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const unionCase = cases[index];
    if (unionCase === undefined) {
      continue;
    }
    const literal = unionCase.literal;
    const schema = unionCase.schema;
    const literalIndex = pushLiteral(context, literal);
    const check = emitChild(schema, context);
    parts.push(`if(Object.is(dv,l[${String(literalIndex)}])){${check}(${value},${path},${issues});return;}`);
  }
  parts.push(`${path}.push(${keyRef});${emitIssueExpr(
    issues,
    path,
    "expected_discriminant",
    stringLiteral("known discriminant"),
    "le(dv)"
  )}${path}.pop();`);
  return parts.join("");
}
