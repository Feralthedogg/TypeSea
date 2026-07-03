import {
  NumberCheckTag,
  ObjectModeTag,
  PresenceTag,
  SchemaTag,
  StringCheckTag
} from "../kind/index.js";
import { GraphBuilder, type Graph, type NodeId } from "../ir/index.js";
import { UUID_PATTERN, type Schema } from "../schema/index.js";

/**
 * @brief lower schema.
 */
export function lowerSchema(schema: Schema): Graph {
  const builder = new GraphBuilder();
  const entry = builder.start();
  const input = builder.param("input");
  const result = lowerPredicate(builder, schema, input);
  const ret = builder.ret(entry, result);
  return builder.finish(entry, ret);
}

/**
 * @brief lower predicate.
 */
function lowerPredicate(
  builder: GraphBuilder,
  schema: Schema,
  value: NodeId
): NodeId {
  switch (schema.tag) {
    case SchemaTag.Unknown:
      return builder.constant(true);
    case SchemaTag.Never:
      return builder.constant(false);
    case SchemaTag.String:
      return lowerString(builder, schema, value);
    case SchemaTag.Number:
      return lowerNumber(builder, schema, value);
    case SchemaTag.BigInt:
      return builder.isBigInt(value);
    case SchemaTag.Symbol:
      return builder.isSymbol(value);
    case SchemaTag.Boolean:
      return builder.isBoolean(value);
    case SchemaTag.Literal:
      return builder.equals(value, builder.constant(schema.value));
    case SchemaTag.Array:
      return builder.and([
        builder.isArray(value),
        builder.arrayEvery(value, schema.item)
      ]);
    case SchemaTag.Tuple:
      return builder.and([
        builder.isArray(value),
        builder.tupleItems(value, schema.items)
      ]);
    case SchemaTag.Record:
      return builder.and([
        builder.isObject(value),
        builder.recordEvery(value, schema.value)
      ]);
    case SchemaTag.Object:
      return lowerObject(builder, schema, value);
    case SchemaTag.Union:
      return lowerUnion(builder, schema.options, value);
    case SchemaTag.Intersection:
      return builder.and([
        lowerPredicate(builder, schema.left, value),
        lowerPredicate(builder, schema.right, value)
      ]);
    case SchemaTag.Optional:
    case SchemaTag.Undefinedable:
      return builder.or([
        builder.isUndefined(value),
        lowerPredicate(builder, schema.inner, value)
      ]);
    case SchemaTag.Nullable:
      return builder.or([
        builder.isNull(value),
        lowerPredicate(builder, schema.inner, value)
      ]);
    case SchemaTag.DiscriminatedUnion:
      return lowerDiscriminatedUnion(builder, schema.key, schema.cases, value);
    case SchemaTag.Brand:
      return lowerPredicate(builder, schema.inner, value);
    case SchemaTag.Lazy:
    case SchemaTag.Refine:
      return builder.schemaCheck(value, schema);
  }
}

/**
 * @brief lower string.
 */
function lowerString(
  builder: GraphBuilder,
  schema: Extract<Schema, { readonly tag: typeof SchemaTag.String }>,
  value: NodeId
): NodeId {
  const tests: NodeId[] = [builder.isString(value)];
  const checks = schema.checks;
  for (let index = 0; index < checks.length; index += 1) {
    const check = checks[index];
    if (check === undefined) {
      continue;
    }
    switch (check.tag) {
      case StringCheckTag.Min:
        tests.push(builder.stringMin(value, check.value));
        break;
      case StringCheckTag.Max:
        tests.push(builder.stringMax(value, check.value));
        break;
      case StringCheckTag.Regex:
        tests.push(builder.regex(value, check.regex, check.name));
        break;
      case StringCheckTag.Uuid:
        tests.push(builder.regex(value, UUID_PATTERN, "uuid"));
        break;
    }
  }
  return builder.and(tests);
}

/**
 * @brief lower number.
 */
function lowerNumber(
  builder: GraphBuilder,
  schema: Extract<Schema, { readonly tag: typeof SchemaTag.Number }>,
  value: NodeId
): NodeId {
  const tests: NodeId[] = [builder.isNumber(value)];
  const checks = schema.checks;
  for (let index = 0; index < checks.length; index += 1) {
    const check = checks[index];
    if (check === undefined) {
      continue;
    }
    switch (check.tag) {
      case NumberCheckTag.Integer:
        tests.push(builder.isInteger(value));
        break;
      case NumberCheckTag.Gte:
        tests.push(builder.gte(value, builder.constant(check.value)));
        break;
      case NumberCheckTag.Lte:
        tests.push(builder.lte(value, builder.constant(check.value)));
        break;
    }
  }
  return builder.and(tests);
}

/**
 * @brief lower object.
 */
function lowerObject(
  builder: GraphBuilder,
  schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
  value: NodeId
): NodeId {
  const entries = schema.entries;
  const tests: NodeId[] = [builder.isObject(value)];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) {
      continue;
    }
    const prop = builder.getProp(value, entry.key);
    const propTest = lowerPredicate(builder, entry.schema, prop);
    const hasData = builder.hasOwnData(value, entry.key);
    if (entry.presence === PresenceTag.Optional) {
      const hasKey = builder.hasOwn(value, entry.key);
      tests.push(builder.or([
        builder.not(hasKey),
        builder.and([hasData, propTest])
      ]));
    } else {
      tests.push(hasData);
      tests.push(propTest);
    }
  }
  if (schema.mode === ObjectModeTag.Strict) {
    const keys = new Array<string>(entries.length);
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (entry !== undefined) {
        keys[index] = entry.key;
      }
    }
    tests.push(builder.strictKeys(value, keys));
  }
  return builder.and(tests);
}

/**
 * @brief lower union.
 */
function lowerUnion(
  builder: GraphBuilder,
  options: readonly Schema[],
  value: NodeId
): NodeId {
  const tests: NodeId[] = [];
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option === undefined) {
      continue;
    }
    tests.push(lowerPredicate(builder, option, value));
  }
  return builder.or(tests);
}

/**
 * @brief lower discriminated union.
 */
function lowerDiscriminatedUnion(
  builder: GraphBuilder,
  key: string,
  cases: Extract<Schema, {
    readonly tag: typeof SchemaTag.DiscriminatedUnion
  }>["cases"],
  value: NodeId
): NodeId {
  const literals = new Array<string>(cases.length);
  const schemas = new Array<Schema>(cases.length);
  for (let index = 0; index < cases.length; index += 1) {
    const unionCase = cases[index];
    if (unionCase !== undefined) {
      literals[index] = unionCase.literal;
      schemas[index] = unionCase.schema;
    }
  }
  return builder.discriminantDispatch(value, key, literals, schemas);
}
