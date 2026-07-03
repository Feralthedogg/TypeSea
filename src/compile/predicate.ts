/**
 * @file compile/predicate.ts
 * @brief Boolean validator source emitter.
 */

import {
  NumberCheckTag,
  ObjectModeTag,
  PresenceTag,
  SchemaTag,
  StringCheckTag
} from "../kind/index.js";
import {
  UUID_PATTERN,
  type DiscriminatedUnionCase,
  type Schema
} from "../schema/index.js";
import {
  pushLiteral,
  pushRegex,
  pushSchema,
  stringRef
} from "./context.js";
import type { EmitContext, FunctionSource } from "./types.js";

/**
 * @brief emit function.
 */
export function emitFunction(schema: Schema, context: EmitContext): string {
  const cached = context.functionNames.get(schema);
  if (cached !== undefined) {
    return cached;
  }
  const name = `p${String(context.functions.length)}`;
  const source: FunctionSource = {
    name,
    body: ""
  };
  context.functionNames.set(schema, name);
  context.functions.push(source);
  source.body = emitBody(schema, "v", context);
  return name;
}

/**
 * @brief emit functions.
 */
export function emitFunctions(context: EmitContext): string {
  const chunks = new Array<string>(context.functions.length);
  for (let index = 0; index < context.functions.length; index += 1) {
    const source = context.functions[index];
    if (source === undefined) {
      continue;
    }
    chunks[index] = `function ${source.name}(v){${source.body}}`;
  }
  return chunks.join("");
}

/**
 * @brief emit body.
 */
function emitBody(schema: Schema, value: string, context: EmitContext): string {
  switch (schema.tag) {
    case SchemaTag.Array:
      return emitArrayBody(schema.item, value, context);
    case SchemaTag.Tuple:
      return emitTupleBody(schema.items, value, context);
    case SchemaTag.Record:
      return emitRecordBody(schema.value, value, context);
    case SchemaTag.Object:
      return emitObjectBody(schema, value, context);
    case SchemaTag.DiscriminatedUnion:
      return emitDiscriminatedUnionBody(schema.key, schema.cases, value, context);
    default:
      return `return ${emitExpression(schema, value, context)};`;
  }
}

/**
 * @brief emit expression.
 */
export function emitExpression(
  schema: Schema,
  value: string,
  context: EmitContext
): string {
  switch (schema.tag) {
    case SchemaTag.Unknown:
      return "true";
    case SchemaTag.Never:
      return "false";
    case SchemaTag.String:
      return emitString(schema, value, context);
    case SchemaTag.Number:
      return emitNumber(schema, value);
    case SchemaTag.BigInt:
      return `(typeof ${value}==="bigint")`;
    case SchemaTag.Symbol:
      return `(typeof ${value}==="symbol")`;
    case SchemaTag.Boolean:
      return `(typeof ${value}==="boolean")`;
    case SchemaTag.Literal:
      return `Object.is(${value},l[${String(pushLiteral(context, schema.value))}])`;
    case SchemaTag.Array:
      return `${emitFunction(schema, context)}(${value})`;
    case SchemaTag.Tuple:
      return `${emitFunction(schema, context)}(${value})`;
    case SchemaTag.Record:
      return `${emitFunction(schema, context)}(${value})`;
    case SchemaTag.Object:
      return `${emitFunction(schema, context)}(${value})`;
    case SchemaTag.Union:
      return emitUnion(schema.options, value, context);
    case SchemaTag.Intersection:
      return `(${emitExpression(schema.left, value, context)}&&${emitExpression(
        schema.right,
        value,
        context
      )})`;
    case SchemaTag.Optional:
    case SchemaTag.Undefinedable:
      return `(${value}===undefined||${emitExpression(schema.inner, value, context)})`;
    case SchemaTag.Nullable:
      return `(${value}===null||${emitExpression(schema.inner, value, context)})`;
    case SchemaTag.DiscriminatedUnion:
      return `${emitFunction(schema, context)}(${value})`;
    case SchemaTag.Brand:
      return emitExpression(schema.inner, value, context);
    case SchemaTag.Lazy:
    case SchemaTag.Refine:
      return `d(${String(pushSchema(context, schema))},${value})`;
  }
}

/**
 * @brief emit array body.
 */
function emitArrayBody(
  item: Schema,
  value: string,
  context: EmitContext
): string {
  const itemFunction = emitFunction(item, context);
  return [
    `if(!Array.isArray(${value}))return false;`,
    `for(let i=0;i<${value}.length;i+=1){`,
    `const d=gp(${value},i);`,
    `if(d!==undefined&&!h.call(d,"value"))return false;`,
    `if(!${itemFunction}(d===undefined?undefined:d.value))return false;`,
    "}",
    "return true;"
  ].join("");
}

/**
 * @brief emit record body.
 */
function emitRecordBody(
  item: Schema,
  value: string,
  context: EmitContext
): string {
  const itemFunction = emitFunction(item, context);
  return [
    `if(!o(${value}))return false;`,
    `const ks=Object.keys(${value});`,
    "for(let i=0;i<ks.length;i+=1){",
    "const key=ks[i];",
    `const d=key===undefined?undefined:gp(${value},key);`,
    `if(d===undefined||!h.call(d,"value")||!${itemFunction}(d.value))return false;`,
    "}",
    "return true;"
  ].join("");
}

/**
 * @brief emit tuple body.
 * @details Emits tuple validation as straight-line descriptor reads and early returns.
 * @returns Generated tuple predicate body.
 */
function emitTupleBody(
  items: readonly Schema[],
  value: string,
  context: EmitContext
): string {
  const chunks: string[] = [
    `if(!Array.isArray(${value})||${value}.length!==${String(items.length)})return false;`
  ];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === undefined) {
      continue;
    }
    const descriptor = `d${String(index)}`;
    const itemValue = `v${String(index)}`;
    chunks.push(
      `const ${descriptor}=gp(${value},${String(index)});`,
      `if(${descriptor}!==undefined&&!h.call(${descriptor},"value"))return false;`,
      `const ${itemValue}=${descriptor}===undefined?undefined:${descriptor}.value;`,
      `if(!${emitExpression(item, itemValue, context)})return false;`
    );
  }
  chunks.push("return true;");
  return chunks.join("");
}

/**
 * @brief emit object body.
 * @details Emits object validation as Ajv-style straight-line code with local descriptor variables.
 * @returns Generated object predicate body.
 */
function emitObjectBody(
  schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
  value: string,
  context: EmitContext
): string {
  const chunks: string[] = [`if(!o(${value}))return false;`];
  chunks.push(emitStrictObjectKeyBody(schema, value, context));
  const entries = schema.entries;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) {
      continue;
    }
    const key = stringRef(context, entry.key);
    const descriptor = `d${String(index)}`;
    const itemValue = `v${String(index)}`;
    chunks.push(`const ${descriptor}=gp(${value},${key});`);
    if (entry.presence === PresenceTag.Optional) {
      chunks.push(
        `if(${descriptor}!==undefined){`,
        `if(!h.call(${descriptor},"value"))return false;`,
        `const ${itemValue}=${descriptor}.value;`,
        `if(!${emitExpression(entry.schema, itemValue, context)})return false;`,
        `}else if(h.call(${value},${key}))return false;`
      );
    } else {
      chunks.push(
        `if(${descriptor}===undefined||!h.call(${descriptor},"value"))return false;`,
        `const ${itemValue}=${descriptor}.value;`,
        `if(!${emitExpression(entry.schema, itemValue, context)})return false;`
      );
    }
  }
  chunks.push("return true;");
  return chunks.join("");
}

/**
 * @brief emit strict object key body.
 * @details Emits a low-allocation known-key check specialized for one object shape.
 * @returns Generated strict-key prelude, or an empty string for passthrough objects.
 */
function emitStrictObjectKeyBody(
  schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
  value: string,
  context: EmitContext
): string {
  if (schema.mode !== ObjectModeTag.Strict) {
    return "";
  }
  const entries = schema.entries;
  const comparisons: string[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry !== undefined) {
      comparisons.push(`key!==${stringRef(context, entry.key)}`);
    }
  }
  if (comparisons.length === 0) {
    return `if(Reflect.ownKeys(${value}).length!==0)return false;`;
  }
  return [
    `const xs=Reflect.ownKeys(${value});`,
    "for(let i=0;i<xs.length;i+=1){",
    "const key=xs[i];",
    `if(typeof key!=="string"||(${comparisons.join("&&")}))return false;`,
    "}"
  ].join("");
}

/**
 * @brief emit discriminated union body.
 * @details Emits discriminant selection once and dispatches to branch validators.
 * @returns Generated discriminated-union predicate body.
 */
function emitDiscriminatedUnionBody(
  key: string,
  cases: readonly DiscriminatedUnionCase[],
  value: string,
  context: EmitContext
): string {
  const keyRef = stringRef(context, key);
  const chunks: string[] = [
    `if(!o(${value}))return false;`,
    `const d=gp(${value},${keyRef});`,
    `if(d===undefined||!h.call(d,"value"))return false;`,
    "const dv=d.value;",
    `if(typeof dv!=="string")return false;`
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const unionCase = cases[index];
    if (unionCase === undefined) {
      continue;
    }
    chunks.push(
      `if(Object.is(dv,l[${String(pushLiteral(context, unionCase.literal))}]))return ${emitExpression(
        unionCase.schema,
        value,
        context
      )};`
    );
  }
  chunks.push("return false;");
  return chunks.join("");
}

/**
 * @brief emit string.
 */
function emitString(
  schema: Extract<Schema, { readonly tag: typeof SchemaTag.String }>,
  value: string,
  context: EmitContext
): string {
  const parts: string[] = [`(typeof ${value}==="string")`];
  const checks = schema.checks;
  for (let index = 0; index < checks.length; index += 1) {
    const check = checks[index];
    if (check === undefined) {
      continue;
    }
    switch (check.tag) {
      case StringCheckTag.Min:
        parts.push(`(${value}.length>=${String(check.value)})`);
        break;
      case StringCheckTag.Max:
        parts.push(`(${value}.length<=${String(check.value)})`);
        break;
      case StringCheckTag.Regex:
        parts.push(emitRegex(value, check.regex, context));
        break;
      case StringCheckTag.Uuid:
        parts.push(emitRegex(value, UUID_PATTERN, context));
        break;
    }
  }
  return `(${parts.join("&&")})`;
}

/**
 * @brief emit number.
 */
function emitNumber(
  schema: Extract<Schema, { readonly tag: typeof SchemaTag.Number }>,
  value: string
): string {
  const parts: string[] = [
    `(typeof ${value}==="number")`,
    `Number.isFinite(${value})`
  ];
  const checks = schema.checks;
  for (let index = 0; index < checks.length; index += 1) {
    const check = checks[index];
    if (check === undefined) {
      continue;
    }
    switch (check.tag) {
      case NumberCheckTag.Integer:
        parts.push(`Number.isInteger(${value})`);
        break;
      case NumberCheckTag.Gte:
        parts.push(`(${value}>=${String(check.value)})`);
        break;
      case NumberCheckTag.Lte:
        parts.push(`(${value}<=${String(check.value)})`);
        break;
    }
  }
  return `(${parts.join("&&")})`;
}

/**
 * @brief emit union.
 */
export function emitUnion(
  options: readonly Schema[],
  value: string,
  context: EmitContext
): string {
  const parts: string[] = [];
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option !== undefined) {
      parts.push(emitExpression(option, value, context));
    }
  }
  if (parts.length === 0) {
    return "false";
  }
  return `(${parts.join("||")})`;
}

/**
 * @brief emit regex.
 */
function emitRegex(value: string, regex: RegExp, context: EmitContext): string {
  const index = pushRegex(context, regex);
  const access = `r[${String(index)}]`;
  return `((${access}.lastIndex=0),${access}.test(${value}))`;
}
