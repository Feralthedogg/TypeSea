/**
 * @file graph-predicate.ts
 * @brief Predicate source emitter backed by optimized Sea-of-Nodes graphs.
 */

import { NodeTag } from "../kind/index.js";
import type {
  Graph,
  NodeId
} from "../ir/index.js";
import { makeValidationPlan } from "../plan/index.js";
import type { LiteralValue, Schema } from "../schema/index.js";
import {
  pushKeyset,
  pushLiteral,
  pushRegex,
  pushSchema,
  stringRef
} from "./context.js";
import type { EmitContext, FunctionSource } from "./types.js";

/**
 * @brief graph emit state.
 */
interface GraphEmitState {
  readonly chunks: string[];
  readonly dataSlots: Map<string, DataSlot>;
  readonly dataGuards: Set<string>;
  temp: number;
}

/**
 * @brief data slot.
 */
interface DataSlot {
  readonly descriptor: string;
  value: string | undefined;
}

/**
 * @brief emit graph function.
 * @details Emits one predicate function from the optimized graph owned by a schema plan.
 * @returns Generated function name.
 */
export function emitGraphFunction(
  schema: Schema,
  context: EmitContext
): string {
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
  const plan = makeValidationPlan(schema);
  source.body = emitGraphBody(
    plan.graph,
    plan.graph.result,
    "v",
    context
  );
  return name;
}

/**
 * @brief emit graph functions.
 * @details Serializes every graph predicate function accumulated in the context.
 * @returns JavaScript source for the predicate function table.
 */
export function emitGraphFunctions(context: EmitContext): string {
  const chunks = new Array<string>(context.functions.length);
  for (let index = 0; index < context.functions.length; index += 1) {
    const source = context.functions[index];
    if (source !== undefined) {
      chunks[index] = `function ${source.name}(v){${source.body}}`;
    }
  }
  return chunks.join("");
}

/**
 * @brief emit graph body.
 */
function emitGraphBody(
  graph: Graph,
  id: NodeId,
  value: string,
  context: EmitContext
): string {
  const state: GraphEmitState = {
    chunks: [],
    dataSlots: new Map<string, DataSlot>(),
    dataGuards: new Set<string>(),
    temp: 0
  };
  emitGraphReturn(graph, id, value, context, state);
  return state.chunks.join("");
}

/**
 * @brief emit graph return.
 */
function emitGraphReturn(
  graph: Graph,
  id: NodeId,
  value: string,
  context: EmitContext,
  state: GraphEmitState
): void {
  const node = graph.nodes[id];
  if (node === undefined) {
    state.chunks.push("return false;");
    return;
  }
  switch (node.tag) {
    case NodeTag.Return:
      emitGraphReturn(graph, node.value, value, context, state);
      return;
    case NodeTag.And:
      emitAndReturn(graph, node.values, value, context, state);
      return;
    case NodeTag.Or:
      emitOrReturn(graph, node.values, value, context, state);
      return;
    case NodeTag.DiscriminantDispatch:
      emitDiscriminantDispatchReturn(
        graph,
        node.value,
        value,
        node.key,
        node.literals,
        node.schemas,
        context,
        state
      );
      return;
    default:
      state.chunks.push(`return ${emitGraphExpression(
        graph,
        id,
        value,
        context,
        state
      )};`);
  }
}

/**
 * @brief emit and return.
 */
function emitAndReturn(
  graph: Graph,
  ids: readonly NodeId[],
  value: string,
  context: EmitContext,
  state: GraphEmitState
): void {
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (id !== undefined) {
      emitFalseCheck(graph, id, value, context, state);
    }
  }
  state.chunks.push("return true;");
}

/**
 * @brief emit false check.
 */
function emitFalseCheck(
  graph: Graph,
  id: NodeId,
  value: string,
  context: EmitContext,
  state: GraphEmitState
): void {
  const node = graph.nodes[id];
  if (node?.tag === NodeTag.And) {
    for (let index = 0; index < node.values.length; index += 1) {
      const child = node.values[index];
      if (child !== undefined) {
        emitFalseCheck(graph, child, value, context, state);
      }
    }
    return;
  }
  if (node?.tag === NodeTag.ArrayEvery) {
    emitArrayEveryCheck(graph, node.value, node.item, value, context, state);
    return;
  }
  if (node?.tag === NodeTag.RecordEvery) {
    emitRecordEveryCheck(graph, node.value, node.item, value, context, state);
    return;
  }
  if (node?.tag === NodeTag.HasOwnData) {
    emitHasDataCheck(graph, node.object, node.key, value, context, state);
    return;
  }
  if (node?.tag === NodeTag.StrictKeys) {
    emitStrictKeysCheck(graph, node.object, node.keys, value, context, state);
    return;
  }
  state.chunks.push(`if(!${emitGraphExpression(
    graph,
    id,
    value,
    context,
    state
  )})return false;`);
}

/**
 * @brief emit array every check.
 */
function emitArrayEveryCheck(
  graph: Graph,
  valueId: NodeId,
  item: Schema,
  value: string,
  context: EmitContext,
  state: GraphEmitState
): void {
  const arrayExpression = emitGraphExpression(graph, valueId, value, context, state);
  const index = `i${String(state.temp)}`;
  state.temp += 1;
  const descriptor = `d${String(state.temp)}`;
  state.temp += 1;
  const itemValue = `v${String(state.temp)}`;
  state.temp += 1;
  state.chunks.push(
    `for(let ${index}=0;${index}<${arrayExpression}.length;${index}+=1){`,
    `const ${descriptor}=gp(${arrayExpression},${index});`,
    `if(${descriptor}!==undefined&&!h.call(${descriptor},"value"))return false;`,
    `const ${itemValue}=${descriptor}===undefined?undefined:${descriptor}.value;`,
    `if(!${emitInlineSchemaExpression(item, itemValue, context)})return false;`,
    "}"
  );
}

/**
 * @brief emit record every check.
 */
function emitRecordEveryCheck(
  graph: Graph,
  valueId: NodeId,
  item: Schema,
  value: string,
  context: EmitContext,
  state: GraphEmitState
): void {
  const recordExpression = emitGraphExpression(graph, valueId, value, context, state);
  const keys = `ks${String(state.temp)}`;
  state.temp += 1;
  const index = `i${String(state.temp)}`;
  state.temp += 1;
  const key = `key${String(state.temp)}`;
  state.temp += 1;
  const descriptor = `d${String(state.temp)}`;
  state.temp += 1;
  const itemValue = `v${String(state.temp)}`;
  state.temp += 1;
  state.chunks.push(
    `const ${keys}=Object.keys(${recordExpression});`,
    `for(let ${index}=0;${index}<${keys}.length;${index}+=1){`,
    `const ${key}=${keys}[${index}];`,
    `if(${key}===undefined)return false;`,
    `const ${descriptor}=gp(${recordExpression},${key});`,
    `if(${descriptor}===undefined||!h.call(${descriptor},"value"))return false;`,
    `const ${itemValue}=${descriptor}.value;`,
    `if(!${emitInlineSchemaExpression(item, itemValue, context)})return false;`,
    "}"
  );
}

/**
 * @brief emit strict keys check.
 */
function emitStrictKeysCheck(
  graph: Graph,
  object: NodeId,
  keys: readonly string[],
  value: string,
  context: EmitContext,
  state: GraphEmitState
): void {
  const objectExpression = emitGraphExpression(graph, object, value, context, state);
  if (hasAllRequiredKeys(object, keys, state)) {
    state.chunks.push(
      `if(Object.getOwnPropertyNames(${objectExpression}).length!==${String(keys.length)}||Object.getOwnPropertySymbols(${objectExpression}).length!==0)return false;`
    );
    return;
  }
  const present = `xs${String(state.temp)}`;
  state.temp += 1;
  const index = `i${String(state.temp)}`;
  state.temp += 1;
  const key = `key${String(state.temp)}`;
  state.temp += 1;
  state.chunks.push(
    `const ${present}=Reflect.ownKeys(${objectExpression});`,
    `for(let ${index}=0;${index}<${present}.length;${index}+=1){`,
    `const ${key}=${present}[${index}];`,
    `if(typeof ${key}!=="string"||!${keyMembershipExpression(key, keys, context)})return false;`,
    "}"
  );
}

/**
 * @brief emit or return.
 */
function emitOrReturn(
  graph: Graph,
  ids: readonly NodeId[],
  value: string,
  context: EmitContext,
  state: GraphEmitState
): void {
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (id !== undefined) {
      state.chunks.push(`if(${emitGraphExpression(
        graph,
        id,
        value,
        context,
        state
      )})return true;`);
    }
  }
  state.chunks.push("return false;");
}

/**
 * @brief emit discriminant dispatch return.
 */
function emitDiscriminantDispatchReturn(
  graph: Graph,
  object: NodeId,
  value: string,
  key: string,
  literals: readonly string[],
  schemas: readonly Schema[],
  context: EmitContext,
  state: GraphEmitState
): void {
  const objectExpression = emitGraphExpression(
    graph,
    object,
    value,
    context,
    state
  );
  const descriptor = `d${String(state.temp)}`;
  state.temp += 1;
  state.chunks.push(
    `if(!o(${objectExpression}))return false;`,
    `const ${descriptor}=g(${objectExpression},${stringRef(context, key)});`,
    `if(${descriptor}===undefined||typeof ${descriptor}.value!=="string")return false;`,
    `switch(${descriptor}.value){`
  );
  for (let index = 0; index < schemas.length; index += 1) {
    const schema = schemas[index];
    const literal = literals[index];
    if (schema !== undefined && literal !== undefined) {
      state.chunks.push(
        `case ${stringRef(context, literal)}:return ${emitGraphFunction(
          schema,
          context
        )}(${objectExpression});`
      );
    }
  }
  state.chunks.push("default:return false;}");
}

/**
 * @brief emit graph expression.
 */
function emitGraphExpression(
  graph: Graph,
  id: NodeId,
  value: string,
  context: EmitContext,
  state: GraphEmitState | undefined
): string {
  const node = graph.nodes[id];
  if (node === undefined) {
    return "undefined";
  }
  switch (node.tag) {
    case NodeTag.Start:
      return "true";
    case NodeTag.Param:
      return value;
    case NodeTag.Const:
      return literalExpression(node.value, context);
    case NodeTag.GetProp:
      return state === undefined
        ? `gv(${emitGraphExpression(graph, node.object, value, context, state)},${stringRef(context, node.key)})`
        : emitDataValueSlot(graph, node.object, node.key, value, context, state);
    case NodeTag.IsString:
      return `(typeof ${emitGraphExpression(graph, node.value, value, context, state)}==="string")`;
    case NodeTag.IsNumber:
      return finiteNumberExpression(
        emitGraphExpression(graph, node.value, value, context, state)
      );
    case NodeTag.IsBoolean:
      return `(typeof ${emitGraphExpression(graph, node.value, value, context, state)}==="boolean")`;
    case NodeTag.IsBigInt:
      return `(typeof ${emitGraphExpression(graph, node.value, value, context, state)}==="bigint")`;
    case NodeTag.IsSymbol:
      return `(typeof ${emitGraphExpression(graph, node.value, value, context, state)}==="symbol")`;
    case NodeTag.IsObject:
      return `o(${emitGraphExpression(graph, node.value, value, context, state)})`;
    case NodeTag.IsArray:
      return `Array.isArray(${emitGraphExpression(graph, node.value, value, context, state)})`;
    case NodeTag.IsUndefined:
      return `(${emitGraphExpression(graph, node.value, value, context, state)}===undefined)`;
    case NodeTag.IsNull:
      return `(${emitGraphExpression(graph, node.value, value, context, state)}===null)`;
    case NodeTag.IsInteger:
      return `Number.isInteger(${emitGraphExpression(graph, node.value, value, context, state)})`;
    case NodeTag.Not:
      return `(${emitGraphExpression(graph, node.value, value, context, state)}!==true)`;
    case NodeTag.Equals:
      return `Object.is(${emitGraphExpression(graph, node.left, value, context, state)},${emitGraphExpression(graph, node.right, value, context, state)})`;
    case NodeTag.Gte:
      return `(${emitGraphExpression(graph, node.left, value, context, state)}>=${emitGraphExpression(graph, node.right, value, context, state)})`;
    case NodeTag.Lte:
      return `(${emitGraphExpression(graph, node.left, value, context, state)}<=${emitGraphExpression(graph, node.right, value, context, state)})`;
    case NodeTag.StringMin:
      return `(${emitGraphExpression(graph, node.value, value, context, state)}.length>=${String(node.bound)})`;
    case NodeTag.StringMax:
      return `(${emitGraphExpression(graph, node.value, value, context, state)}.length<=${String(node.bound)})`;
    case NodeTag.Regex:
      return regexExpression(
        emitGraphExpression(graph, node.value, value, context, state),
        node.regex,
        context
      );
    case NodeTag.HasOwn:
      return `ho(${emitGraphExpression(graph, node.object, value, context, state)},${stringRef(context, node.key)})`;
    case NodeTag.HasOwnData:
      return state === undefined
        ? `hd(${emitGraphExpression(graph, node.object, value, context, state)},${stringRef(context, node.key)})`
        : hasDataExpression(graph, node.object, node.key, value, context, state);
    case NodeTag.StrictKeys:
      return `sk(${emitGraphExpression(graph, node.object, value, context, state)},k[${String(pushKeyset(context, node.keys))}])`;
    case NodeTag.ArrayEvery:
      return `ea(${emitGraphExpression(graph, node.value, value, context, state)},${emitGraphFunction(node.item, context)})`;
    case NodeTag.TupleItems:
      return emitTupleItemsExpression(
        emitGraphExpression(graph, node.value, value, context, state),
        node.items,
        context
      );
    case NodeTag.RecordEvery:
      return `er(${emitGraphExpression(graph, node.value, value, context, state)},${emitGraphFunction(node.item, context)})`;
    case NodeTag.DiscriminantDispatch:
      return emitDiscriminantDispatchExpression(
        emitGraphExpression(graph, node.value, value, context, state),
        node.key,
        node.literals,
        node.schemas,
        context
      );
    case NodeTag.SchemaCheck:
      return `d(${String(pushSchema(context, node.schema))},${emitGraphExpression(graph, node.value, value, context, state)})`;
    case NodeTag.And:
      return emitBooleanFoldExpression(graph, node.values, value, context, state, true);
    case NodeTag.Or:
      return emitBooleanFoldExpression(graph, node.values, value, context, state, false);
    case NodeTag.Return:
      return emitGraphExpression(graph, node.value, value, context, state);
  }
}

/**
 * @brief emit boolean fold expression.
 */
function emitBooleanFoldExpression(
  graph: Graph,
  ids: readonly NodeId[],
  value: string,
  context: EmitContext,
  state: GraphEmitState | undefined,
  and: boolean
): string {
  const fallback = and ? "true" : "false";
  const operator = and ? "&&" : "||";
  const parts: string[] = [];
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (id !== undefined) {
      parts.push(emitGraphExpression(graph, id, value, context, undefined));
    }
  }
  if (parts.length === 0) {
    return fallback;
  }
  return `(${parts.join(operator)})`;
}

/**
 * @brief emit data slot.
 */
function emitDataSlot(
  graph: Graph,
  object: NodeId,
  key: string,
  value: string,
  context: EmitContext,
  state: GraphEmitState
): DataSlot {
  const cacheKey = dataSlotKey(object, key);
  const cached = state.dataSlots.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const objectExpression = emitGraphExpression(
    graph,
    object,
    value,
    context,
    state
  );
  const descriptor = `d${String(state.temp)}`;
  state.temp += 1;
  const keyRef = stringRef(context, key);
  state.chunks.push(
    `const ${descriptor}=gp(${objectExpression},${keyRef});`
  );
  const slot: DataSlot = {
    descriptor,
    value: undefined
  };
  state.dataSlots.set(cacheKey, slot);
  return slot;
}

/**
 * @brief emit data value slot.
 */
function emitDataValueSlot(
  graph: Graph,
  object: NodeId,
  key: string,
  value: string,
  context: EmitContext,
  state: GraphEmitState
): string {
  const cacheKey = dataSlotKey(object, key);
  const slot = emitDataSlot(graph, object, key, value, context, state);
  if (slot.value !== undefined) {
    return slot.value;
  }
  const localValue = `v${String(state.temp)}`;
  state.temp += 1;
  const source = state.dataGuards.has(cacheKey)
    ? `${slot.descriptor}.value`
    : `${slot.descriptor}===undefined?undefined:${slot.descriptor}.value`;
  state.chunks.push(`const ${localValue}=${source};`);
  slot.value = localValue;
  return localValue;
}

/**
 * @brief emit has data check.
 */
function emitHasDataCheck(
  graph: Graph,
  object: NodeId,
  key: string,
  value: string,
  context: EmitContext,
  state: GraphEmitState
): void {
  const cacheKey = dataSlotKey(object, key);
  const slot = emitDataSlot(graph, object, key, value, context, state);
  state.chunks.push(
    `if(${slot.descriptor}===undefined||!h.call(${slot.descriptor},"value"))return false;`
  );
  state.dataGuards.add(cacheKey);
}

/**
 * @brief has data expression.
 */
function hasDataExpression(
  graph: Graph,
  object: NodeId,
  key: string,
  value: string,
  context: EmitContext,
  state: GraphEmitState
): string {
  const slot = emitDataSlot(graph, object, key, value, context, state);
  return `(${slot.descriptor}!==undefined&&h.call(${slot.descriptor},"value"))`;
}

/**
 * @brief data slot key.
 */
function dataSlotKey(object: NodeId, key: string): string {
  return `${String(object)}:${key}`;
}

/**
 * @brief has all required keys.
 */
function hasAllRequiredKeys(
  object: NodeId,
  keys: readonly string[],
  state: GraphEmitState
): boolean {
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === undefined || !state.dataGuards.has(dataSlotKey(object, key))) {
      return false;
    }
  }
  return true;
}

/**
 * @brief key membership expression.
 */
function keyMembershipExpression(
  key: string,
  keys: readonly string[],
  context: EmitContext
): string {
  if (keys.length === 0) {
    return "false";
  }
  const parts = new Array<string>(keys.length);
  for (let index = 0; index < keys.length; index += 1) {
    const value = keys[index];
    parts[index] = value === undefined
      ? "false"
      : `${key}===${stringRef(context, value)}`;
  }
  return `(${parts.join("||")})`;
}

/**
 * @brief emit inline schema expression.
 */
function emitInlineSchemaExpression(
  schema: Schema,
  value: string,
  context: EmitContext
): string {
  const plan = makeValidationPlan(schema);
  return emitGraphExpression(plan.graph, plan.graph.result, value, context, undefined);
}

/**
 * @brief finite number expression.
 */
function finiteNumberExpression(value: string): string {
  return `(typeof ${value}==="number"&&Number.isFinite(${value}))`;
}

/**
 * @brief regex expression.
 */
function regexExpression(
  value: string,
  regex: RegExp,
  context: EmitContext
): string {
  const index = pushRegex(context, regex);
  const ref = `r[${String(index)}]`;
  return `((${ref}.lastIndex=0),${ref}.test(${value}))`;
}

/**
 * @brief emit tuple items expression.
 */
function emitTupleItemsExpression(
  value: string,
  items: readonly Schema[],
  context: EmitContext
): string {
  const parts: string[] = [
    `Array.isArray(${value})`,
    `${value}.length===${String(items.length)}`
  ];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item !== undefined) {
      parts.push(`ev(${value},${String(index)},${emitGraphFunction(item, context)})`);
    }
  }
  return `(${parts.join("&&")})`;
}

/**
 * @brief emit discriminant dispatch expression.
 */
function emitDiscriminantDispatchExpression(
  value: string,
  key: string,
  literals: readonly string[],
  schemas: readonly Schema[],
  context: EmitContext
): string {
  const functions: string[] = [];
  for (let index = 0; index < schemas.length; index += 1) {
    const schema = schemas[index];
    if (schema !== undefined) {
      functions.push(emitGraphFunction(schema, context));
    }
  }
  const keyset = `k[${String(pushKeyset(context, literals))}]`;
  if (functions.length === 0) {
    return `dj(${value},${stringRef(context, key)},${keyset})`;
  }
  return `dj(${value},${stringRef(context, key)},${keyset},${functions.join(",")})`;
}

/**
 * @brief literal expression.
 */
function literalExpression(value: LiteralValue, context: EmitContext): string {
  if (value === true) {
    return "true";
  }
  if (value === false) {
    return "false";
  }
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  return `l[${String(pushLiteral(context, value))}]`;
}
