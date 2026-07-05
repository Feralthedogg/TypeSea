/**
 * @file validate.ts
 * @brief Runtime validation for graph objects.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 */

import {
    ArrayCheckTag,
    NodeTag,
    ObjectModeTag,
    PresenceTag
} from "../kind/index.js";
import {
    isLiteralValue,
    isSchemaValue
} from "../schema/index.js";
import { isPlainRegExp } from "./regexp.js";
import type { Graph, GraphNode, NodeId } from "./types.js";

/**
 * @brief Validate an unknown value as a frozen-style Sea-of-Nodes graph.
 * @param value Candidate graph object supplied to graph consumers.
 * @returns True when the full graph has a dense arena and well-formed nodes.
 * @details Graph objects can cross public introspection boundaries. Validation
 * therefore rejects accessors, sparse arrays, and prototype-backed fields before
 * optimization or freezing reads graph metadata.
 */
export function isGraphValue(value: unknown): value is Graph {
    return isGraphValueInner(value, makeGraphValidationState());
}

/**
 * @brief Cycle guard for nested child graphs.
 * @details IR nodes such as ArrayEvery and ObjectShape carry child graphs. The
 * active set fails closed on recursive graph references; the done set prevents
 * repeated traversal of shared child graph objects.
 */
interface GraphValidationState {
    readonly active: WeakSet<object>;
    readonly done: WeakSet<object>;
}

const missingDataProperty = Symbol("typesea.ir.missingDataProperty");

/**
 * @brief Allocate traversal state for one root graph validation.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 * @returns Empty active and completed graph sets.
 */
function makeGraphValidationState(): GraphValidationState {
    return {
        active: new WeakSet<object>(),
        done: new WeakSet<object>()
    };
}

/**
 * @brief Validate one graph object and its nested child graphs.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 * @param value Candidate graph object.
 * @param state Shared recursion state.
 * @returns True when entry/result ids and every arena node are valid.
 */
function isGraphValueInner(
    value: unknown,
    state: GraphValidationState
): value is Graph {
    if (!isRecord(value)) {
        return false;
    }
    if (state.done.has(value)) {
        return true;
    }
    if (state.active.has(value)) {
        return false;
    }
    state.active.add(value);
    /*
     * `nodes`, `entry`, and `result` must be own data slots. Optimizer callers
     * may pass graph-like values, and bracket reads would otherwise consult a
     * hostile prototype before the shape is trusted.
     */
    const nodes = readOwnDataProperty(value, "nodes");
    if (!isUnknownArray(nodes)) {
        return false;
    }
    const entryId = readOwnDataProperty(value, "entry");
    const resultId = readOwnDataProperty(value, "result");
    if (!isNodeId(entryId, nodes.length) ||
        !isNodeId(resultId, nodes.length)) {
        return false;
    }
    for (let index = 0; index < nodes.length; index += 1) {
        if (!isGraphNodeValue(nodes[index], index, nodes.length, state)) {
            return false;
        }
    }
    const entry = nodes[entryId];
    const result = nodes[resultId];
    const valid = isRecord(entry) &&
        readOwnDataProperty(entry, "tag") === NodeTag.Start &&
        isRecord(result) &&
        readOwnDataProperty(result, "tag") === NodeTag.Return;
    state.active.delete(value);
    if (valid) {
        state.done.add(value);
    }
    return valid;
}

/**
 * @brief Validate one arena node at its expected id.
 * @param value Candidate node object.
 * @param index Arena slot the node occupies.
 * @param nodeCount Total arena size for dependency bounds.
 * @param state Shared recursion state for child graphs.
 * @returns True when the node tag and payload agree with its dependency vector.
 * @details Every node stores both `deps` and named edge fields. The redundant
 * representation is checked here so later passes can trust either view.
 */
function isGraphNodeValue(
    value: unknown,
    index: number,
    nodeCount: number,
    state: GraphValidationState
): value is GraphNode {
    if (!isRecord(value) || readOwnDataProperty(value, "id") !== index) {
        return false;
    }
    const deps = readOwnDataProperty(value, "deps");
    if (!isNodeIdArray(deps, nodeCount)) {
        return false;
    }
    const tag = readOwnDataProperty(value, "tag");
    /*
     * The tag switch is deliberately closed. Unknown node tags are rejected at
     * the boundary so optimizer passes can stay exhaustive over NodeTag.
     */
    switch (tag) {
        case NodeTag.Start:
        case NodeTag.Param:
        case NodeTag.Const:
            return isLeafNodeValue(value, deps);
        case NodeTag.GetProp:
            return typeof readOwnDataProperty(value, "key") === "string" &&
                isSingleDepNode(value, deps, "object", nodeCount);
        case NodeTag.IsString:
        case NodeTag.IsNumber:
        case NodeTag.IsBoolean:
        case NodeTag.IsBigInt:
        case NodeTag.IsSymbol:
        case NodeTag.IsObject:
        case NodeTag.IsArray:
        case NodeTag.IsUndefined:
        case NodeTag.IsNull:
        case NodeTag.IsInteger:
        case NodeTag.Not:
            return isSingleDepNode(value, deps, "value", nodeCount);
        case NodeTag.Equals:
        case NodeTag.Gte:
        case NodeTag.Lte:
            return isTwoDepNode(value, deps, "left", "right", nodeCount);
        case NodeTag.StringMin:
        case NodeTag.StringMax: {
            const bound = readOwnDataProperty(value, "bound");
            return typeof bound === "number" &&
                Number.isInteger(bound) &&
                bound >= 0 &&
                isSingleDepNode(value, deps, "value", nodeCount);
        }
        case NodeTag.Regex:
            return isPlainRegExp(readOwnDataProperty(value, "regex")) &&
                typeof readOwnDataProperty(value, "name") === "string" &&
                isSingleDepNode(value, deps, "value", nodeCount);
        case NodeTag.HasOwn:
        case NodeTag.HasOwnData:
            return typeof readOwnDataProperty(value, "key") === "string" &&
                isSingleDepNode(value, deps, "object", nodeCount);
        case NodeTag.StrictKeys:
            return isStringArray(readOwnDataProperty(value, "keys")) &&
                isSingleDepNode(value, deps, "object", nodeCount);
        case NodeTag.ArrayEvery:
            return isSchemaValue(readOwnDataProperty(value, "item")) &&
                isArrayChecks(readOwnDataProperty(value, "checks")) &&
                isGraphValueInner(readOwnDataProperty(value, "itemGraph"), state) &&
                isSingleDepNode(value, deps, "value", nodeCount);
        case NodeTag.TupleItems:
            return isTupleItemGraphsAligned(value, state) &&
                isSingleDepNode(value, deps, "value", nodeCount);
        case NodeTag.RecordEvery:
            return isSchemaValue(readOwnDataProperty(value, "item")) &&
                isGraphValueInner(readOwnDataProperty(value, "itemGraph"), state) &&
                isSingleDepNode(value, deps, "value", nodeCount);
        case NodeTag.DiscriminantDispatch:
            return isDiscriminantDispatchNode(value, state) &&
                isSingleDepNode(value, deps, "value", nodeCount);
        case NodeTag.ObjectShape:
            return isObjectShapePayload(value, state) &&
                isSingleDepNode(value, deps, "value", nodeCount);
        case NodeTag.UnionDispatch:
            return isUnionDispatchNode(value, state) &&
                isSingleDepNode(value, deps, "value", nodeCount);
        case NodeTag.PrimitiveUnion:
            return isPrimitiveUnionNode(value, state) &&
                isSingleDepNode(value, deps, "value", nodeCount);
        case NodeTag.SchemaCheck:
            return isSchemaValue(readOwnDataProperty(value, "schema")) &&
                isSingleDepNode(value, deps, "value", nodeCount);
        case NodeTag.And:
        case NodeTag.Or: {
            const values = readOwnDataProperty(value, "values");
            return isNodeIdArray(values, nodeCount) &&
                sameNodeIds(deps, values);
        }
        case NodeTag.Return:
            return isTwoDepNode(value, deps, "control", "value", nodeCount);
        default:
            return false;
    }
}

/**
 * @brief Validate array length metadata carried by ArrayEvery nodes.
 * @param value Candidate check vector.
 * @returns True when every entry is a supported non-negative integer bound.
 */
function isArrayChecks(value: unknown): boolean {
    if (!isUnknownArray(value)) {
        return false;
    }
    for (let index = 0; index < value.length; index += 1) {
        const check = value[index];
        if (!isRecord(check)) {
            return false;
        }
        switch (readOwnDataProperty(check, "tag")) {
            case ArrayCheckTag.Min:
            case ArrayCheckTag.Max: {
                const bound = readOwnDataProperty(check, "value");
                if (typeof bound !== "number" || !Number.isInteger(bound) || bound < 0) {
                    return false;
                }
                break;
            }
            default:
                return false;
        }
    }
    return true;
}

/**
 * @brief Validate payloads for dependency-free nodes.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 * @param value Candidate node record.
 * @param deps Dependency vector already read from the node.
 * @returns True when the leaf payload matches Start, Param, or Const.
 */
function isLeafNodeValue(
    value: Readonly<Record<string, unknown>>,
    deps: readonly NodeId[]
): boolean {
    if (deps.length !== 0) {
        return false;
    }
    switch (readOwnDataProperty(value, "tag")) {
        case NodeTag.Start:
            return true;
        case NodeTag.Param:
            return typeof readOwnDataProperty(value, "name") === "string";
        case NodeTag.Const: {
            const literal = readOwnDataProperty(value, "value");
            return !isMissingDataProperty(literal) && isLiteralValue(literal);
        }
        default:
            return false;
    }
}

/**
 * @brief Validate a node whose named edge mirrors one dependency.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 * @param value Candidate node record.
 * @param deps Dependency vector from the same node.
 * @param field Named edge field that must equal deps[0].
 * @param nodeCount Total arena size for bounds.
 * @returns True when the edge is in range and exactly mirrors the dependency.
 */
function isSingleDepNode(
    value: Readonly<Record<string, unknown>>,
    deps: readonly NodeId[],
    field: string,
    nodeCount: number
): boolean {
    const fieldValue = readOwnDataProperty(value, field);
    return deps.length === 1 &&
        isNodeId(fieldValue, nodeCount) &&
        deps[0] === fieldValue;
}

/**
 * @brief Validate a node whose named edges mirror two dependencies.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 * @param value Candidate node record.
 * @param deps Dependency vector from the same node.
 * @param leftField First named edge field.
 * @param rightField Second named edge field.
 * @param nodeCount Total arena size for bounds.
 * @returns True when both named edges are in range and mirror `deps`.
 */
function isTwoDepNode(
    value: Readonly<Record<string, unknown>>,
    deps: readonly NodeId[],
    leftField: string,
    rightField: string,
    nodeCount: number
): boolean {
    const left = readOwnDataProperty(value, leftField);
    const right = readOwnDataProperty(value, rightField);
    return deps.length === 2 &&
        isNodeId(left, nodeCount) &&
        isNodeId(right, nodeCount) &&
        deps[0] === left &&
        deps[1] === right;
}

/**
 * @brief Validate a graph-local arena index.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 * @param value Candidate node id.
 * @param nodeCount Total arena size.
 * @returns True when the id is an integer inside the arena.
 */
function isNodeId(value: unknown, nodeCount: number): value is NodeId {
    return typeof value === "number" &&
        Number.isSafeInteger(value) &&
        value >= 0 &&
        value < nodeCount;
}

/**
 * @brief Validate a dense dependency vector.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 * @param value Candidate dependency list.
 * @param nodeCount Total arena size for every dependency.
 * @returns True when every dependency points inside the arena.
 */
function isNodeIdArray(
    value: unknown,
    nodeCount: number
): value is readonly NodeId[] {
    if (!isUnknownArray(value)) {
        return false;
    }
    for (let index = 0; index < value.length; index += 1) {
        if (!isNodeId(value[index], nodeCount)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Compare two dependency vectors without allocating.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 * @param left First dependency vector.
 * @param right Second dependency vector.
 * @returns True when both vectors contain the same node ids in the same order.
 */
function sameNodeIds(
    left: readonly NodeId[],
    right: readonly NodeId[]
): boolean {
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Validate a dense vector of graph-owned strings.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 * @param value Candidate string vector.
 * @returns True when every slot is a string.
 */
function isStringArray(value: unknown): value is readonly string[] {
    if (!isUnknownArray(value)) {
        return false;
    }
    for (let index = 0; index < value.length; index += 1) {
        if (typeof value[index] !== "string") {
            return false;
        }
    }
    return true;
}

/**
 * @brief Validate a dense vector of embedded schema payloads.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 * @param value Candidate schema vector.
 * @returns True when every slot is accepted by schema validation.
 */
function isSchemaArray(value: unknown): value is readonly unknown[] {
    if (!isUnknownArray(value)) {
        return false;
    }
    for (let index = 0; index < value.length; index += 1) {
        if (!isSchemaValue(value[index])) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Validate tuple item schemas and lowered child graphs as parallel arrays.
 * @details IR helpers preserve Sea-of-Nodes invariants before graphs cross optimizer,
 * compiler, or public introspection boundaries.
 * @param value Candidate TupleItems node.
 * @param state Shared recursion state for child graphs.
 * @returns True when item schemas and item graphs have the same arity.
 */
function isTupleItemGraphsAligned(
    value: Readonly<Record<string, unknown>>,
    state: GraphValidationState
): boolean {
    const items = readOwnDataProperty(value, "items");
    const itemGraphs = readOwnDataProperty(value, "itemGraphs");
    return isSchemaArray(items) &&
        isGraphArray(itemGraphs, state) &&
        items.length === itemGraphs.length;
}

/**
 * @brief Validate the dispatch table for discriminated-union graph nodes.
 * @details IR helpers preserve Sea-of-Nodes invariants before graphs cross optimizer,
 * compiler, or public introspection boundaries.
 * @param value Candidate DiscriminantDispatch node.
 * @param state Shared recursion state for child graphs.
 * @returns True when literal, schema, graph, and lookup vectors agree.
 */
function isDiscriminantDispatchNode(
    value: Readonly<Record<string, unknown>>,
    state: GraphValidationState
): boolean {
    const key = readOwnDataProperty(value, "key");
    const literals = readOwnDataProperty(value, "literals");
    const schemas = readOwnDataProperty(value, "schemas");
    const graphs = readOwnDataProperty(value, "graphs");
    const lookup = readOwnDataProperty(value, "lookup");
    return typeof key === "string" &&
        isStringArray(literals) &&
        isSchemaArray(schemas) &&
        isGraphArray(graphs, state) &&
        isDiscriminantLookup(lookup, literals) &&
        literals.length === schemas.length &&
        literals.length === graphs.length;
}

/**
 * @brief Validate object-shape payload redundancy.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 * @param value Candidate ObjectShape node.
 * @param state Shared recursion state for property graphs.
 * @returns True when entries, keys, mode, and all-required metadata agree.
 */
function isObjectShapePayload(
    value: Readonly<Record<string, unknown>>,
    state: GraphValidationState
): boolean {
    const entries = readOwnDataProperty(value, "entries");
    const keys = readOwnDataProperty(value, "keys");
    const mode = readOwnDataProperty(value, "mode");
    const catchall = readOwnDataProperty(value, "catchall");
    const catchallGraph = readOwnDataProperty(value, "catchallGraph");
    const allRequired = readOwnDataProperty(value, "allRequired");
    return isObjectShapeEntries(entries, state) &&
        isStringArray(keys) &&
        objectShapeEntriesMatchKeys(entries, keys) &&
        isObjectModeTag(mode) &&
        (
            (catchall === undefined && catchallGraph === undefined) ||
            (isSchemaValue(catchall) && isGraphValueInner(catchallGraph, state))
        ) &&
        typeof allRequired === "boolean" &&
        allRequired === objectShapeAllRequired(entries);
}

/**
 * @brief Validate general union-dispatch payload vectors.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 * @param value Candidate UnionDispatch node.
 * @param state Shared recursion state for option graphs.
 * @returns True when options, graphs, and masks have matching lengths.
 */
function isUnionDispatchNode(
    value: Readonly<Record<string, unknown>>,
    state: GraphValidationState
): boolean {
    const options = readOwnDataProperty(value, "options");
    const graphs = readOwnDataProperty(value, "graphs");
    const masks = readOwnDataProperty(value, "masks");
    return isSchemaArray(options) &&
        isGraphArray(graphs, state) &&
        isUnionMaskArray(masks) &&
        options.length === graphs.length &&
        options.length === masks.length;
}

/**
 * @brief Validate primitive-only union dispatch metadata.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 * @param value Candidate PrimitiveUnion node.
 * @param state Shared recursion state for option graphs.
 * @returns True when primitive masks line up with option graphs.
 */
function isPrimitiveUnionNode(
    value: Readonly<Record<string, unknown>>,
    state: GraphValidationState
): boolean {
    const graphs = readOwnDataProperty(value, "graphs");
    const masks = readOwnDataProperty(value, "masks");
    return isGraphArray(graphs, state) &&
        isPrimitiveUnionMaskArray(masks) &&
        graphs.length === masks.length;
}

/**
 * @brief Validate object property entries carried by an ObjectShape node.
 * @details IR helpers preserve Sea-of-Nodes invariants before graphs cross optimizer,
 * compiler, or public introspection boundaries.
 * @param value Candidate entry vector.
 * @param state Shared recursion state for entry graphs.
 * @returns True when each entry owns key, schema, graph, and presence metadata.
 */
function isObjectShapeEntries(
    value: unknown,
    state: GraphValidationState
): value is readonly unknown[] {
    if (!isUnknownArray(value)) {
        return false;
    }
    for (let index = 0; index < value.length; index += 1) {
        const entry = value[index];
        if (!isRecord(entry)) {
            return false;
        }
        if (typeof readOwnDataProperty(entry, "key") !== "string" ||
            !isSchemaValue(readOwnDataProperty(entry, "schema")) ||
            !isGraphValueInner(readOwnDataProperty(entry, "graph"), state) ||
            !isPresenceTag(readOwnDataProperty(entry, "presence"))) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Validate a dense vector of child graphs.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 * @param value Candidate child graph vector.
 * @param state Shared recursion state.
 * @returns True when every slot is a valid graph.
 */
function isGraphArray(
    value: unknown,
    state: GraphValidationState
): value is readonly Graph[] {
    if (!isUnknownArray(value)) {
        return false;
    }
    for (let index = 0; index < value.length; index += 1) {
        if (!isGraphValueInner(value[index], state)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Check that object-shape entries preserve key vector order.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 * @param entries ObjectShape entries.
 * @param keys Parallel key vector emitted by lowering.
 * @returns True when each entry key matches the same index in `keys`.
 */
function objectShapeEntriesMatchKeys(
    entries: readonly unknown[],
    keys: readonly string[]
): boolean {
    if (entries.length !== keys.length) {
        return false;
    }
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (!isRecord(entry) || readOwnDataProperty(entry, "key") !== keys[index]) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Recompute the all-required flag from object-shape entries.
 * @param entries ObjectShape entries.
 * @returns True when every property is required.
 * @details The stored flag enables generated fast paths. Recomputing it during
 * graph admission prevents a forged graph from lying about optionality.
 */
function objectShapeAllRequired(entries: readonly unknown[]): boolean {
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (!isRecord(entry) ||
            readOwnDataProperty(entry, "presence") !== PresenceTag.Required) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Validate the closed presence tag set used by object entries.
 * @details IR helpers preserve Sea-of-Nodes invariants before graphs cross optimizer,
 * compiler, or public introspection boundaries.
 * @param value Candidate presence marker.
 * @returns True for required or optional.
 */
function isPresenceTag(value: unknown): value is PresenceTag {
    return value === PresenceTag.Required || value === PresenceTag.Optional;
}

/**
 * @brief Validate the closed object-mode tag set.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 * @param value Candidate object mode.
 * @returns True for passthrough or strict mode.
 */
function isObjectModeTag(value: unknown): value is ObjectModeTag {
    return value === ObjectModeTag.Passthrough || value === ObjectModeTag.Strict;
}

/**
 * @brief Validate root-kind bit masks for union dispatch.
 * @param value Candidate mask vector.
 * @returns True when every mask is a small safe integer.
 * @details The upper bound is intentionally tied to the current root-kind mask
 * width so invalid high bits cannot steer optimizer logic.
 */
function isUnionMaskArray(value: unknown): value is readonly number[] {
    if (!isUnknownArray(value)) {
        return false;
    }
    for (let index = 0; index < value.length; index += 1) {
        const mask = value[index];
        if (typeof mask !== "number" ||
            !Number.isSafeInteger(mask) ||
            mask < 0 ||
            mask > 1023) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Validate masks restricted to primitive root kinds.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 * @param value Candidate mask vector.
 * @returns True when no object/function bits are present.
 */
function isPrimitiveUnionMaskArray(value: unknown): value is readonly number[] {
    if (!isUnionMaskArray(value)) {
        return false;
    }
    for (let index = 0; index < value.length; index += 1) {
        const mask = value[index];
        if (typeof mask !== "number" || (mask & ~127) !== 0) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Validate literal-to-case-index lookup metadata.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 * @param value Candidate lookup table.
 * @param literals Parallel literal vector.
 * @returns True when the table maps each literal to its vector index.
 */
function isDiscriminantLookup(
    value: unknown,
    literals: readonly unknown[]
): value is Readonly<Record<string, number>> {
    if (!isRecord(value)) {
        return false;
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length !== literals.length) {
        return false;
    }
    for (let index = 0; index < literals.length; index += 1) {
        const literal = literals[index];
        if (typeof literal !== "string" ||
            readOwnDataProperty(value, literal) !== index) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Accept a graph metadata record with data-only own fields.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 * @param value Candidate record.
 * @returns True when no accessor fields or arrays are present.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        hasOnlyDataProperties(value);
}

/**
 * @brief Accept a dense graph metadata vector.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 * @param value Candidate vector.
 * @returns True when it has no accessors, inherited slots, or holes.
 */
function isUnknownArray(value: unknown): value is readonly unknown[] {
    return Array.isArray(value) &&
        hasOnlyDataProperties(value) &&
        hasDenseDataSlots(value);
}

/**
 * @brief Reject accessor descriptors before graph internals read fields.
 * @details IR helpers preserve Sea-of-Nodes invariants before graphs cross optimizer,
 * compiler, or public introspection boundaries.
 * @param value Object whose own descriptor table is inspected.
 * @returns True when every own property is backed by a data slot.
 */
function hasOnlyDataProperties(value: object): boolean {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const descriptorMap = descriptors as Record<PropertyKey, PropertyDescriptor | undefined>;
    const keys = Reflect.ownKeys(descriptors);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined) {
            continue;
        }
        const descriptor = descriptorMap[key];
        if (descriptor === undefined ||
            !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Require all array indexes to be own data slots.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 * @param value Candidate graph vector.
 * @returns True when each index from 0 to length - 1 exists as data.
 */
function hasDenseDataSlots(value: readonly unknown[]): boolean {
    for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined ||
            !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Read one own data slot from graph metadata.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 * @param value Object being validated.
 * @param key Field name or symbol to read.
 * @returns Stored value or the missing-data sentinel.
 */
function readOwnDataProperty(
    value: object,
    key: PropertyKey
): unknown {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        return missingDataProperty;
    }
    return descriptor.value;
}

/**
 * @brief Test for the graph metadata missing-data sentinel.
 * @details Graph validation protects optimizer and compiler passes before they assume dense
 * node ids and valid dependency edges.
 * @param value Candidate value returned by readOwnDataProperty.
 * @returns True when the field was absent or not a data descriptor.
 */
function isMissingDataProperty(
    value: unknown
): value is typeof missingDataProperty {
    return value === missingDataProperty;
}
