/**
 * @file predicate.ts
 * @brief Sea-of-Nodes predicate executor.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 */

import {
    ArrayCheckTag,
    NodeTag,
    ObjectModeTag,
    PresenceTag,
    SchemaTag
} from "../kind/index.js";
import type {
    Graph,
    GraphNode,
    NodeId,
    ObjectShapeEntry
} from "../ir/index.js";
import {
    type ArrayCheck,
    resolveLazySchema,
    schemaCanAcceptUndefined,
    type Schema
} from "../schema/index.js";
import type { Issue } from "../issue/index.js";
import {
    hasOwnRuntimeProperty,
    isArrayIndexKey,
    isArrayValue,
    isPlainRecord,
    readEnumerableStringKeys,
    readOwnDataProperty,
    readOwnKeys,
    readOwnPropertyNameCount,
    readOwnPropertySymbolCount
} from "../evaluate/shared.js";
import {
    type GraphEvaluationFrame,
    enterValidation,
    leaveValidation,
    makeValidationState,
    type ValidationState
} from "../evaluate/state.js";
import { makeValidationPlan, schemaRequiresTracking } from "./cache.js";

const EMPTY_ISSUES: readonly Issue[] = Object.freeze([]);
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
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
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
            if (!executeSchemaPredicateWithState(schema.inner, value, state)) {
                return false;
            }
            if (!shouldRunRefinement(schema, value)) {
                return true;
            }
            return isStrictTrue(schema.predicate(value));
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
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
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
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
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
            return isArrayValue(evaluateNode(graph, node.value, input, values, seen, epoch, state));
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
                node.checks,
                node.itemGraph,
                state
            );
        case NodeTag.TupleItems:
            return testTupleItems(
                evaluateNode(graph, node.value, input, values, seen, epoch, state),
                node.itemGraphs,
                state
            );
        case NodeTag.RecordEvery:
            return testRecordEvery(
                evaluateNode(graph, node.value, input, values, seen, epoch, state),
                node.itemGraph,
                state
            );
        case NodeTag.DiscriminantDispatch:
            return testDiscriminantDispatch(
                evaluateNode(graph, node.value, input, values, seen, epoch, state),
                node.key,
                node.graphs,
                node.lookup,
                state
            );
        case NodeTag.ObjectShape:
            return testObjectShape(
                evaluateNode(graph, node.value, input, values, seen, epoch, state),
                node.entries,
                node.keys,
                node.mode,
                node.allRequired,
                state
            );
        case NodeTag.UnionDispatch:
            return testUnionDispatch(
                evaluateNode(graph, node.value, input, values, seen, epoch, state),
                node.graphs,
                node.masks,
                state
            );
        case NodeTag.PresenceDispatch:
            return testUnionDispatch(
                evaluateNode(graph, node.value, input, values, seen, epoch, state),
                node.graphs,
                node.masks,
                state
            );
        case NodeTag.PrimitiveUnion:
            return testUnionDispatch(
                evaluateNode(graph, node.value, input, values, seen, epoch, state),
                node.graphs,
                node.masks,
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
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
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
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
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
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 * @param value Candidate value supplied to the graph executor.
 * @param item Source schema retained by the ArrayEvery node.
 * @param itemGraph Optimized graph used for each validated slot.
 * @param state Shared recursion and cycle state.
 * @returns True when every relevant slot satisfies `itemGraph`.
 */
function testArrayEvery(
    value: unknown,
    item: Schema,
    checks: readonly ArrayCheck[],
    itemGraph: Graph,
    state: ValidationState
): boolean {
    if (!isArrayValue(value)) {
        return false;
    }
    if (!testArrayLengthChecks(value.length, checks)) {
        return false;
    }
    if (schemaCanAcceptUndefined(item)) {
        /*
         * The graph alone cannot reveal whether holes are valid. The retained
         * schema decides that question, then the graph validates only present
         * own indexes.
         */
        return testPresentArrayIndexes(value, itemGraph, state);
    }
    for (let index = 0; index < value.length; index += 1) {
        const slot = readArrayIndexValue(value, index);
        if (slot.accessor ||
            !executeGraphPredicate(itemGraph, slot.value, state)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Test array length checks attached to an ArrayEvery node.
 * @param length Runtime array length.
 * @param checks Normalized length check vector.
 * @returns True when every bound accepts the length.
 */
function testArrayLengthChecks(
    length: number,
    checks: readonly ArrayCheck[]
): boolean {
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            return false;
        }
        switch (check.tag) {
            case ArrayCheckTag.Min:
                if (length < check.value) {
                    return false;
                }
                break;
            case ArrayCheckTag.Max:
                if (length > check.value) {
                    return false;
                }
                break;
        }
    }
    return true;
}

/**
 * @brief test present array indexes.
 * @details Holes are skipped only after the caller proved that undefined passes
 * the item schema, preserving sparse-array semantics without scanning every hole.
 * @param value Array already proven by the caller.
 * @param itemGraph Optimized graph used for each present index.
 * @param state Shared recursion and cycle state.
 * @returns True when every present own index satisfies `itemGraph`.
 */
function testPresentArrayIndexes(
    value: readonly unknown[],
    itemGraph: Graph,
    state: ValidationState
): boolean {
    const keys = readOwnKeys(value);
    if (keys === undefined) {
        return false;
    }
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
        const key = keys[keyIndex];
        if (typeof key !== "string" || !isArrayIndexKey(key, value.length)) {
            continue;
        }
        /*
         * Present descriptors still need the safe read path. Accessors fail
         * before their getter can observe validation.
         */
        const slot = readArrayKeyValue(value, key);
        if (slot.accessor ||
            (slot.present && !executeGraphPredicate(itemGraph, slot.value, state))) {
            return false;
        }
    }
    return true;
}

/**
 * @brief test tuple items.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 */
function testTupleItems(
    value: unknown,
    itemGraphs: readonly Graph[],
    state: ValidationState
): boolean {
    if (!isArrayValue(value) || value.length !== itemGraphs.length) {
        return false;
    }
    for (let index = 0; index < itemGraphs.length; index += 1) {
        const itemGraph = itemGraphs[index];
        if (itemGraph === undefined) {
            return false;
        }
        const slot = readArrayIndexValue(value, index);
        if (slot.accessor ||
            !executeGraphPredicate(itemGraph, slot.value, state)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief test record every.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 */
function testRecordEvery(
    value: unknown,
    itemGraph: Graph,
    state: ValidationState
): boolean {
    if (!isPlainRecord(value)) {
        return false;
    }
    const keys = readEnumerableStringKeys(value);
    if (keys === undefined) {
        return false;
    }
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined) {
            return false;
        }
        const descriptor = readOwnDataProperty(value, key);
        if (descriptor === undefined ||
            !executeGraphPredicate(itemGraph, descriptor.value, state)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief test discriminant dispatch.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 */
function testDiscriminantDispatch(
    value: unknown,
    key: string,
    graphs: readonly Graph[],
    lookup: Readonly<Record<string, number>>,
    state: ValidationState
): boolean {
    if (!isPlainRecord(value)) {
        return false;
    }
    const descriptor = readOwnDataProperty(value, key);
    if (descriptor === undefined || typeof descriptor.value !== "string") {
        return false;
    }
    const index = Object.prototype.hasOwnProperty.call(lookup, descriptor.value)
        ? lookup[descriptor.value]
        : undefined;
    if (index === undefined) {
        return false;
    }
    const graph = graphs[index];
    return graph !== undefined && executeGraphPredicate(graph, value, state);
}

/**
 * @brief test object shape.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 */
function testObjectShape(
    value: unknown,
    entries: readonly ObjectShapeEntry[],
    keys: readonly string[],
    mode: ObjectModeTag,
    allRequired: boolean,
    state: ValidationState
): boolean {
    if (!isPlainRecord(value)) {
        return false;
    }
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
            return false;
        }
        const descriptor = readOwnDataProperty(value, entry.key);
        if (descriptor === undefined) {
            if (entry.presence === PresenceTag.Optional &&
                hasOwnRuntimeProperty(value, entry.key) === false) {
                continue;
            }
            return false;
        }
        if (!executeGraphPredicate(entry.graph, descriptor.value, state)) {
            return false;
        }
    }
    if (mode !== ObjectModeTag.Strict) {
        return true;
    }
    if (allRequired) {
        return readOwnPropertyNameCount(value) === entries.length &&
            readOwnPropertySymbolCount(value) === 0;
    }
    const present = readOwnKeys(value);
    if (present === undefined) {
        return false;
    }
    for (let index = 0; index < present.length; index += 1) {
        const key = present[index];
        if (typeof key !== "string" || !keys.includes(key)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief union mask.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 */
const UnionMask = {
    String: 1 << 0,
    Number: 1 << 1,
    Boolean: 1 << 2,
    BigInt: 1 << 3,
    Symbol: 1 << 4,
    Undefined: 1 << 5,
    Null: 1 << 6,
    Array: 1 << 7,
    Object: 1 << 8,
    Function: 1 << 9,
    Any: (1 << 10) - 1
} as const;

/**
 * @brief test union dispatch.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 */
function testUnionDispatch(
    value: unknown,
    graphs: readonly Graph[],
    masks: readonly number[],
    state: ValidationState
): boolean {
    const valueMask = valueUnionMask(value);
    for (let index = 0; index < graphs.length; index += 1) {
        const graph = graphs[index];
        const mask = masks[index];
        if (graph !== undefined &&
            mask !== undefined &&
            (mask & valueMask) !== 0 &&
            executeGraphPredicate(graph, value, state)) {
            return true;
        }
    }
    return false;
}

/**
 * @brief value union mask.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 */
function valueUnionMask(value: unknown): number {
    if (value === null) {
        return UnionMask.Null;
    }
    if (isArrayValue(value)) {
        return UnionMask.Array;
    }
    switch (typeof value) {
        case "string":
            return UnionMask.String;
        case "number":
            return UnionMask.Number;
        case "boolean":
            return UnionMask.Boolean;
        case "bigint":
            return UnionMask.BigInt;
        case "symbol":
            return UnionMask.Symbol;
        case "undefined":
            return UnionMask.Undefined;
        case "object":
            return UnionMask.Object;
        case "function":
            return UnionMask.Function;
        default:
            return UnionMask.Any;
    }
}

/**
 * @brief Read one array index for graph predicate execution.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 * @param value Array being inspected.
 * @param index Numeric index.
 * @returns Descriptor-derived slot record including accessor status.
 */
function readArrayIndexValue(
    value: readonly unknown[],
    index: number
): { readonly accessor: boolean; readonly value: unknown } {
    return readArrayKeyValue(value, String(index));
}

/**
 * @brief Read one canonical array index key without invoking accessors.
 * @param value Array being inspected.
 * @param key Canonical array index key.
 * @returns Slot record distinguishing holes, data slots, and accessor slots.
 * @details Graph predicates must preserve safe-mode behavior, so an accessor is
 * reported as present but unreadable instead of being invoked.
 */
function readArrayKeyValue(
    value: readonly unknown[],
    key: string
): { readonly accessor: boolean; readonly present: boolean; readonly value: unknown } {
    let descriptor: PropertyDescriptor | undefined;
    // eslint-disable-next-line no-restricted-syntax
    try {
        descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
        return {
            accessor: true,
            present: true,
            value: undefined
        };
    }
    if (descriptor === undefined) {
        return {
            accessor: false,
            present: false,
            value: undefined
        };
    }
    if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        return {
            accessor: true,
            present: true,
            value: undefined
        };
    }
    return {
        accessor: false,
        present: true,
        value: descriptor.value
    };
}

/**
 * @brief Read one own data property from an object or function host.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 * @param value Candidate property host.
 * @param key Property key to inspect.
 * @returns Stored value, or undefined when absent or accessor-backed.
 */
function readOwnDataValue(value: unknown, key: string): unknown {
    if (!isPropertyHost(value)) {
        return undefined;
    }
    const descriptor = readOwnDataProperty(value, key);
    if (descriptor === undefined) {
        return undefined;
    }
    return descriptor.value;
}

/**
 * @brief Test whether a value owns a property without reading it.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 * @param value Candidate property host.
 * @param key Property key to inspect.
 * @returns True when the key exists directly on the value.
 */
function hasOwnProperty(value: unknown, key: string): boolean {
    return isPropertyHost(value) &&
        hasOwnRuntimeProperty(value, key) === true;
}

/**
 * @brief Test whether a value owns a stable data property.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 * @param value Candidate property host.
 * @param key Property key to inspect.
 * @returns True when the key is present as a data descriptor.
 */
function hasOwnDataProperty(value: unknown, key: string): boolean {
    if (!isPropertyHost(value)) {
        return false;
    }
    return readOwnDataProperty(value, key) !== undefined;
}

/**
 * @brief test strict keys.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 */
function testStrictKeys(value: unknown, keys: readonly string[]): boolean {
    if (!isPlainRecord(value)) {
        return false;
    }
    const present = readOwnKeys(value);
    if (present === undefined) {
        return false;
    }
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
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 */
function compareNumber(left: unknown, right: unknown, gte: boolean): boolean {
    if (typeof left === "number" && typeof right === "number") {
        return gte ? left >= right : left <= right;
    }
    if (typeof left === "bigint" && typeof right === "bigint") {
        return gte ? left >= right : left <= right;
    }
    return false;
}

/**
 * @brief test string bound.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 */
function testStringBound(value: unknown, bound: number, min: boolean): boolean {
    if (typeof value !== "string") {
        return false;
    }
    return min ? value.length >= bound : value.length <= bound;
}

/**
 * @brief test regex.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
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
 * @brief Test the numeric domain accepted by TypeSea number schemas.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 * @param value Candidate runtime value.
 * @returns True for finite JavaScript numbers.
 */
function isFiniteNumber(value: unknown): boolean {
    return typeof value === "number" && Number.isFinite(value);
}

/**
 * @brief Test whether descriptor APIs can inspect the value.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 * @param value Candidate runtime value.
 * @returns True for objects and functions.
 */
function isPropertyHost(value: unknown): value is object {
    return (typeof value === "object" && value !== null) || typeof value === "function";
}

/**
 * @brief acquire graph frame.
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
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
 * @details Plan helpers keep schema-specialized execution aligned with optimized IR while
 * preserving interpreter parity.
 */
function releaseGraphFrame(state: ValidationState): void {
    state.graphDepth -= 1;
}

/**
 * @brief Decide whether a boolean refinement should execute.
 * @param schema Refine schema whose inner predicate already accepted.
 * @param value Candidate runtime value.
 * @returns True when no gate exists or the gate returns literal true.
 */
function shouldRunRefinement(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Refine }>,
    value: unknown
): boolean {
    return schema.when === undefined ||
        isStrictTrue(schema.when(Object.freeze({
            value,
            issues: EMPTY_ISSUES
        })));
}

/**
 * @brief Check strict true.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
function isStrictTrue(value: unknown): boolean {
    return value === true;
}
