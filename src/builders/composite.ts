/**
 * @file composite.ts
 * @brief Composite guard builders.
 */

import {
  PresenceTag,
  SchemaTag
} from "../kind/index.js";
import {
  BaseGuard,
  type Guard,
  type Infer,
  type Presence
} from "../guard/index.js";
import type {
  DiscriminatedUnionCase,
  Schema
} from "../schema/index.js";
import { isRecord, readGuardSchema } from "../internal/index.js";
import type {
  DiscriminatedUnionCases,
  InferTuple,
  TupleShape,
  UnionInput
} from "./types.js";

/**
 * @brief array.
 */
export function array<TGuard extends Guard<unknown, Presence>>(
  item: TGuard
): BaseGuard<Infer<TGuard>[]> {
  return new BaseGuard<Infer<TGuard>[]>({
    tag: SchemaTag.Array,
    item: readGuardSchema(item, "array item")
  });
}

/**
 * @brief tuple.
 */
export function tuple<const TShape extends TupleShape>(
  shape: TShape
): BaseGuard<InferTuple<TShape>> {
  const rawShape: unknown = shape;
  if (!Array.isArray(rawShape)) {
    throw new TypeError("tuple shape must be an array");
  }
  const items = new Array<Schema>(shape.length);
  for (let index = 0; index < shape.length; index += 1) {
    const guard = shape[index];
    items[index] = readGuardSchema(guard, `tuple item ${String(index)}`);
  }
  return new BaseGuard<InferTuple<TShape>>({
    tag: SchemaTag.Tuple,
    items
  });
}

/**
 * @brief record.
 */
export function record<TGuard extends Guard<unknown, Presence>>(
  value: TGuard
): BaseGuard<Readonly<Record<string, Infer<TGuard>>>> {
  return new BaseGuard<Readonly<Record<string, Infer<TGuard>>>>({
    tag: SchemaTag.Record,
    value: readGuardSchema(value, "record value")
  });
}

/**
 * @brief union.
 */
export function union<const TGuards extends UnionInput>(
  ...guards: TGuards
): BaseGuard<Infer<TGuards[number]>> {
  if (guards.length === 0) {
    throw new TypeError("union requires at least one guard");
  }
  const options = new Array<Schema>(guards.length);
  for (let index = 0; index < guards.length; index += 1) {
    const guard = guards[index];
    options[index] = readGuardSchema(guard, `union option ${String(index)}`);
  }
  return new BaseGuard<Infer<TGuards[number]>>({
    tag: SchemaTag.Union,
    options
  });
}

/**
 * @brief intersect.
 */
export function intersect<
  TLeft extends Guard<unknown, Presence>,
  TRight extends Guard<unknown, Presence>
>(
  left: TLeft,
  right: TRight
): BaseGuard<Infer<TLeft> & Infer<TRight>> {
  return new BaseGuard<Infer<TLeft> & Infer<TRight>>({
    tag: SchemaTag.Intersection,
    left: readGuardSchema(left, "intersection left"),
    right: readGuardSchema(right, "intersection right")
  });
}

/**
 * @brief discriminated union.
 */
export function discriminatedUnion<
  const TKey extends string,
  const TCases extends Readonly<Record<string, Guard<unknown, Presence>>>
>(
  key: TKey,
  cases: TCases & DiscriminatedUnionCases<TKey, TCases>
): BaseGuard<Infer<TCases[keyof TCases]>> {
  if (typeof key !== "string") {
    throw new TypeError("discriminated union key must be a string");
  }
  if (!isRecord(cases)) {
    throw new TypeError("discriminated union cases must be an object");
  }
  const entries = Object.entries(cases);
  if (entries.length === 0) {
    throw new TypeError("discriminated union requires at least one case");
  }
  const unionCases = new Array<DiscriminatedUnionCase>(entries.length);
  for (let index = 0; index < entries.length; index += 1) {
    const pair = entries[index];
    if (pair === undefined) {
      continue;
    }
    const caseKey = pair[0];
    const guard = pair[1];
    unionCases[index] = {
      literal: caseKey,
      schema: readDiscriminatedUnionCaseSchema(guard, key, caseKey)
    };
  }
  return new BaseGuard<Infer<TCases[keyof TCases]>>({
    tag: SchemaTag.DiscriminatedUnion,
    key,
    cases: unionCases
  });
}

/**
 * @brief read discriminated union case schema.
 */
function readDiscriminatedUnionCaseSchema(
  guard: Guard<unknown, Presence> | undefined,
  key: string,
  literal: string
): Schema {
  const schema = readGuardSchema(guard, `case ${literal}`);
  if (!caseRequiresDiscriminant(schema, key, literal)) {
    throw new TypeError(
      `case ${literal} must require literal discriminant ${key}`
    );
  }
  return schema;
}

/**
 * @brief case requires discriminant.
 */
function caseRequiresDiscriminant(
  schema: Schema,
  key: string,
  literal: string
): boolean {
  const objectSchema = unwrapCaseObjectSchema(schema);
  if (objectSchema === undefined) {
    return false;
  }
  const entries = objectSchema.entries;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry?.key !== key) {
      continue;
    }
    return entry.presence === PresenceTag.Required &&
      schemaRequiresLiteral(entry.schema, literal);
  }
  return false;
}

/**
 * @brief unwrap case object schema.
 */
function unwrapCaseObjectSchema(
  schema: Schema
): Extract<Schema, { readonly tag: typeof SchemaTag.Object }> | undefined {
  switch (schema.tag) {
    case SchemaTag.Object:
      return schema;
    case SchemaTag.Intersection:
      return unwrapCaseObjectSchema(schema.left) ?? unwrapCaseObjectSchema(schema.right);
    case SchemaTag.Brand:
    case SchemaTag.Refine:
      return unwrapCaseObjectSchema(schema.inner);
    default:
      return undefined;
  }
}

/**
 * @brief schema requires literal.
 */
function schemaRequiresLiteral(schema: Schema, literal: string): boolean {
  switch (schema.tag) {
    case SchemaTag.Literal:
      return Object.is(schema.value, literal);
    case SchemaTag.Intersection:
      return schemaRequiresLiteral(schema.left, literal) ||
        schemaRequiresLiteral(schema.right, literal);
    case SchemaTag.Brand:
    case SchemaTag.Refine:
      return schemaRequiresLiteral(schema.inner, literal);
    default:
      return false;
  }
}
