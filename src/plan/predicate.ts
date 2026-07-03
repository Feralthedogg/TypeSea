/**
 * @file predicate.ts
 * @brief Sea-of-Nodes predicate executor.
 */

import { NodeTag, SchemaTag } from "../kind/index.js";
import type {
  Graph,
  GraphNode,
  NodeId
} from "../ir/index.js";
import {
  resolveLazySchema,
  type Schema
} from "../schema/index.js";
import {
  type GraphEvaluationFrame,
  enterValidation,
  leaveValidation,
  makeValidationState,
  type ValidationState
} from "../evaluate/state.js";
import { makeValidationPlan, schemaRequiresTracking } from "./cache.js";
import { executeSchemaKernel } from "./schema-predicate.js";

/**
 * @brief execute schema predicate.
 * @details Runs one schema through its optimized Sea-of-Nodes validation plan.
 * Dynamic schemas are resolved only at explicit lazy/refinement boundaries.
 * @returns True when the value satisfies the schema.
 */
export function executeSchemaPredicate(
  schema: Schema,
  value: unknown
): boolean {
  return executeSchemaPredicateWithState(schema, value, makeValidationState());
}

/**
 * @brief execute schema predicate with state.
 * @details Shares recursion accounting and cycle detection across nested IR nodes.
 * @returns True when the value satisfies the schema under the borrowed state.
 */
export function executeSchemaPredicateWithState(
  schema: Schema,
  value: unknown,
  state: ValidationState
): boolean {
  if (!schemaRequiresTracking(schema)) {
    return executeSchemaPredicateInner(schema, value, state);
  }
  const entered = enterValidation(schema, value, state);
  if (entered === "cycle") {
    return true;
  }
  if (entered === "budget") {
    return false;
  }
  const result = executeSchemaPredicateInner(schema, value, state);
  leaveValidation(schema, value, state);
  return result;
}

/**
 * @brief execute graph predicate.
 * @details Executes a frozen graph with one input value.
 * @returns Boolean value held by the graph return node.
 */
export function executeGraphPredicate(
  graph: Graph,
  value: unknown,
  state: ValidationState
): boolean {
  const frame = acquireGraphFrame(state, graph.nodes.length);
  const result = evaluateNode(
    graph,
    graph.result,
    value,
    frame.values,
    frame.seen,
    frame.epoch,
    state
  );
  releaseGraphFrame(state);
  return result === true;
}

/**
 * @brief execute schema predicate inner.
 */
function executeSchemaPredicateInner(
  schema: Schema,
  value: unknown,
  state: ValidationState
): boolean {
  switch (schema.tag) {
    case SchemaTag.Lazy:
      return executeSchemaPredicateWithState(
        resolveLazySchema(schema, state.resolving),
        value,
        state
      );
    case SchemaTag.Refine:
      return executeSchemaPredicateWithState(schema.inner, value, state) &&
        isStrictTrue(schema.predicate(value));
    default: {
      makeValidationPlan(schema);
      return executeSchemaKernel(
        schema,
        value,
        state,
        executeSchemaPredicateWithState
      );
    }
  }
}

/**
 * @brief evaluate node.
 */
function evaluateNode(
  graph: Graph,
  id: NodeId,
  input: unknown,
  values: unknown[],
  seen: Uint32Array,
  epoch: number,
  state: ValidationState
): unknown {
  if (seen[id] === epoch) {
    return values[id];
  }
  const node = graph.nodes[id];
  const result = node === undefined
    ? undefined
    : evaluateGraphNode(graph, node, input, values, seen, epoch, state);
  values[id] = result;
  seen[id] = epoch;
  return result;
}

/**
 * @brief evaluate graph node.
 */
function evaluateGraphNode(
  graph: Graph,
  node: GraphNode,
  input: unknown,
  values: unknown[],
  seen: Uint32Array,
  epoch: number,
  state: ValidationState
): unknown {
  switch (node.tag) {
    case NodeTag.Start:
      return true;
    case NodeTag.Param:
      return input;
    case NodeTag.Const:
      return node.value;
    case NodeTag.GetProp:
      return readOwnDataValue(
        evaluateNode(graph, node.object, input, values, seen, epoch, state),
        node.key
      );
    case NodeTag.IsString:
      return typeof evaluateNode(graph, node.value, input, values, seen, epoch, state) === "string";
    case NodeTag.IsNumber:
      return isFiniteNumber(evaluateNode(graph, node.value, input, values, seen, epoch, state));
    case NodeTag.IsBoolean:
      return typeof evaluateNode(graph, node.value, input, values, seen, epoch, state) === "boolean";
    case NodeTag.IsBigInt:
      return typeof evaluateNode(graph, node.value, input, values, seen, epoch, state) === "bigint";
    case NodeTag.IsSymbol:
      return typeof evaluateNode(graph, node.value, input, values, seen, epoch, state) === "symbol";
    case NodeTag.IsObject:
      return isPlainRecord(evaluateNode(graph, node.value, input, values, seen, epoch, state));
    case NodeTag.IsArray:
      return Array.isArray(evaluateNode(graph, node.value, input, values, seen, epoch, state));
    case NodeTag.IsUndefined:
      return evaluateNode(graph, node.value, input, values, seen, epoch, state) === undefined;
    case NodeTag.IsNull:
      return evaluateNode(graph, node.value, input, values, seen, epoch, state) === null;
    case NodeTag.IsInteger:
      return Number.isInteger(evaluateNode(graph, node.value, input, values, seen, epoch, state));
    case NodeTag.Not:
      return evaluateNode(graph, node.value, input, values, seen, epoch, state) !== true;
    case NodeTag.Equals:
      return Object.is(
        evaluateNode(graph, node.left, input, values, seen, epoch, state),
        evaluateNode(graph, node.right, input, values, seen, epoch, state)
      );
    case NodeTag.Gte:
      return compareNumber(
        evaluateNode(graph, node.left, input, values, seen, epoch, state),
        evaluateNode(graph, node.right, input, values, seen, epoch, state),
        true
      );
    case NodeTag.Lte:
      return compareNumber(
        evaluateNode(graph, node.left, input, values, seen, epoch, state),
        evaluateNode(graph, node.right, input, values, seen, epoch, state),
        false
      );
    case NodeTag.StringMin:
      return testStringBound(
        evaluateNode(graph, node.value, input, values, seen, epoch, state),
        node.bound,
        true
      );
    case NodeTag.StringMax:
      return testStringBound(
        evaluateNode(graph, node.value, input, values, seen, epoch, state),
        node.bound,
        false
      );
    case NodeTag.Regex:
      return testRegex(
        evaluateNode(graph, node.value, input, values, seen, epoch, state),
        node.regex
      );
    case NodeTag.HasOwn:
      return hasOwnProperty(
        evaluateNode(graph, node.object, input, values, seen, epoch, state),
        node.key
      );
    case NodeTag.HasOwnData:
      return hasOwnDataProperty(
        evaluateNode(graph, node.object, input, values, seen, epoch, state),
        node.key
      );
    case NodeTag.StrictKeys:
      return testStrictKeys(
        evaluateNode(graph, node.object, input, values, seen, epoch, state),
        node.keys
      );
    case NodeTag.ArrayEvery:
      return testArrayEvery(
        evaluateNode(graph, node.value, input, values, seen, epoch, state),
        node.item,
        state
      );
    case NodeTag.TupleItems:
      return testTupleItems(
        evaluateNode(graph, node.value, input, values, seen, epoch, state),
        node.items,
        state
      );
    case NodeTag.RecordEvery:
      return testRecordEvery(
        evaluateNode(graph, node.value, input, values, seen, epoch, state),
        node.item,
        state
      );
    case NodeTag.DiscriminantDispatch:
      return testDiscriminantDispatch(
        evaluateNode(graph, node.value, input, values, seen, epoch, state),
        node.key,
        node.schemas,
        node.lookup,
        state
      );
    case NodeTag.SchemaCheck:
      return executeSchemaPredicateWithState(
        node.schema,
        evaluateNode(graph, node.value, input, values, seen, epoch, state),
        state
      );
    case NodeTag.And:
      return evaluateAnd(graph, node.values, input, values, seen, epoch, state);
    case NodeTag.Or:
      return evaluateOr(graph, node.values, input, values, seen, epoch, state);
    case NodeTag.Return:
      return evaluateNode(graph, node.value, input, values, seen, epoch, state);
  }
}

/**
 * @brief evaluate and.
 */
function evaluateAnd(
  graph: Graph,
  ids: readonly NodeId[],
  input: unknown,
  values: unknown[],
  seen: Uint32Array,
  epoch: number,
  state: ValidationState
): boolean {
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (id === undefined ||
      evaluateNode(graph, id, input, values, seen, epoch, state) !== true) {
      return false;
    }
  }
  return true;
}

/**
 * @brief evaluate or.
 */
function evaluateOr(
  graph: Graph,
  ids: readonly NodeId[],
  input: unknown,
  values: unknown[],
  seen: Uint32Array,
  epoch: number,
  state: ValidationState
): boolean {
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (id !== undefined &&
      evaluateNode(graph, id, input, values, seen, epoch, state) === true) {
      return true;
    }
  }
  return false;
}

/**
 * @brief test array every.
 */
function testArrayEvery(
  value: unknown,
  item: Schema,
  state: ValidationState
): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const slot = readArrayIndexValue(value, index);
    if (slot.accessor ||
      !executeSchemaPredicateWithState(item, slot.value, state)) {
      return false;
    }
  }
  return true;
}

/**
 * @brief test tuple items.
 */
function testTupleItems(
  value: unknown,
  items: readonly Schema[],
  state: ValidationState
): boolean {
  if (!Array.isArray(value) || value.length !== items.length) {
    return false;
  }
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === undefined) {
      return false;
    }
    const slot = readArrayIndexValue(value, index);
    if (slot.accessor ||
      !executeSchemaPredicateWithState(item, slot.value, state)) {
      return false;
    }
  }
  return true;
}

/**
 * @brief test record every.
 */
function testRecordEvery(
  value: unknown,
  item: Schema,
  state: ValidationState
): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  const keys = Object.keys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === undefined) {
      return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
      !executeSchemaPredicateWithState(item, descriptor.value, state)) {
      return false;
    }
  }
  return true;
}

/**
 * @brief test discriminant dispatch.
 */
function testDiscriminantDispatch(
  value: unknown,
  key: string,
  schemas: readonly Schema[],
  lookup: Readonly<Record<string, number>>,
  state: ValidationState
): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined ||
    !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
    typeof descriptor.value !== "string") {
    return false;
  }
  const index = Object.prototype.hasOwnProperty.call(lookup, descriptor.value)
    ? lookup[descriptor.value]
    : undefined;
  if (index === undefined) {
    return false;
  }
  const schema = schemas[index];
  return schema !== undefined &&
    executeSchemaPredicateWithState(schema, value, state);
}

/**
 * @brief read array index value.
 */
function readArrayIndexValue(
  value: readonly unknown[],
  index: number
): { readonly accessor: boolean; readonly value: unknown } {
  const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
  if (descriptor === undefined) {
    return {
      accessor: false,
      value: undefined
    };
  }
  if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
    return {
      accessor: true,
      value: undefined
    };
  }
  return {
    accessor: false,
    value: descriptor.value
  };
}

/**
 * @brief read own data value.
 */
function readOwnDataValue(value: unknown, key: string): unknown {
  if (!isPropertyHost(value)) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined ||
    !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
    return undefined;
  }
  return descriptor.value;
}

/**
 * @brief has own property.
 */
function hasOwnProperty(value: unknown, key: string): boolean {
  return isPropertyHost(value) &&
    Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * @brief has own data property.
 */
function hasOwnDataProperty(value: unknown, key: string): boolean {
  if (!isPropertyHost(value)) {
    return false;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined &&
    Object.prototype.hasOwnProperty.call(descriptor, "value");
}

/**
 * @brief test strict keys.
 */
function testStrictKeys(value: unknown, keys: readonly string[]): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  const present = Reflect.ownKeys(value);
  for (let index = 0; index < present.length; index += 1) {
    const key = present[index];
    if (typeof key !== "string" || !keys.includes(key)) {
      return false;
    }
  }
  return true;
}

/**
 * @brief compare number.
 */
function compareNumber(left: unknown, right: unknown, gte: boolean): boolean {
  if (typeof left !== "number" || typeof right !== "number") {
    return false;
  }
  return gte ? left >= right : left <= right;
}

/**
 * @brief test string bound.
 */
function testStringBound(value: unknown, bound: number, min: boolean): boolean {
  if (typeof value !== "string") {
    return false;
  }
  return min ? value.length >= bound : value.length <= bound;
}

/**
 * @brief test regex.
 */
function testRegex(value: unknown, regex: RegExp): boolean {
  if (typeof value !== "string") {
    return false;
  }
  regex.lastIndex = 0;
  const result = regex.test(value);
  regex.lastIndex = 0;
  return result;
}

/**
 * @brief is finite number.
 */
function isFiniteNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * @brief is plain record.
 */
function isPlainRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief is property host.
 */
function isPropertyHost(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

/**
 * @brief acquire graph frame.
 */
function acquireGraphFrame(
  state: ValidationState,
  nodeCount: number
): GraphEvaluationFrame {
  const index = state.graphDepth;
  state.graphDepth = index + 1;
  let frame = state.graphFrames[index];
  if (frame === undefined) {
    frame = {
      values: new Array<unknown>(nodeCount),
      seen: new Uint32Array(nodeCount),
      epoch: 0
    };
    state.graphFrames[index] = frame;
  } else if (frame.seen.length < nodeCount) {
    frame.values = new Array<unknown>(nodeCount);
    frame.seen = new Uint32Array(nodeCount);
    frame.epoch = 0;
  }
  frame.epoch += 1;
  if (frame.epoch === 0) {
    frame.seen.fill(0);
    frame.epoch = 1;
  }
  return frame;
}

/**
 * @brief release graph frame.
 */
function releaseGraphFrame(state: ValidationState): void {
  state.graphDepth -= 1;
}

/**
 * @brief is strict true.
 */
function isStrictTrue(value: unknown): boolean {
  return value === true;
}
