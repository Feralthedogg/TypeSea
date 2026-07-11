/**
 * @file lower-graph.ts
 * @brief Lower SeaBreeze arena nodes directly into TypeSea Sea-of-Nodes graphs.
 * @details This bridge bypasses root schema materialization for predicate IR
 * while preserving existing composite-node schema payloads for diagnostics and
 * generated fallback paths.
 */

import { ObjectModeTag, PresenceTag } from "../kind/index.js";
import {
    GraphBuilder,
    type Graph,
    type NodeId,
    type ObjectShapeEntry,
    type UnionDispatchMask
} from "../ir/index.js";
import { optimizeGraph } from "../optimize/index.js";
import type { Schema } from "../schema/index.js";
import {
    lowerSeaBreezeToSchema,
    type SeaBreezeSchemaLoweringOptions
} from "./lower-schema.js";
import {
    SeaBreezeKind,
    SeaBreezePresence,
    type SeaBreezeNodeId
} from "./sea-breeze.js";
import type { SeaBreezeArena } from "./sea-breeze.js";

/** @brief Schema-lowering policies plus optional graph optimization. */
export interface SeaBreezeGraphLoweringOptions
    extends SeaBreezeSchemaLoweringOptions {
    /**
     * @brief Run optimizeGraph() before returning the graph.
     * @default true
     */
    readonly optimize?: boolean | undefined;
}

interface GraphLoweringContext {
    readonly arena: SeaBreezeArena;
    readonly options: SeaBreezeGraphLoweringOptions;
    readonly keyTable: readonly string[];
    readonly objectMode: ObjectModeTag;
    readonly schemaCache: (Schema | undefined)[];
    readonly graphCache: (Graph | undefined)[];
}

const UnionMask = {
    None: 0,
    String: 1 << 0,
    Number: 1 << 1,
    Boolean: 1 << 2,
    BigInt: 1 << 3,
    Symbol: 1 << 4,
    Undefined: 1 << 5,
    Null: 1 << 6,
    Array: 1 << 7,
    Object: 1 << 8,
    Any: (1 << 9) - 1
} as const;

const PrimitiveUnionMask =
    UnionMask.String |
    UnionMask.Number |
    UnionMask.Boolean |
    UnionMask.BigInt |
    UnionMask.Symbol |
    UnionMask.Undefined |
    UnionMask.Null;

/**
 * @brief Lower a SeaBreeze root into a TypeSea predicate graph.
 * @param arena Inference arena owning the node ids.
 * @param root Root node id.
 * @param options Key table and lowering policy shared with schema lowering.
 * @returns TypeSea graph suitable for optimizeGraph() and graph-aware tooling.
 */
export function lowerSeaBreezeToGraph(
    arena: SeaBreezeArena,
    root: SeaBreezeNodeId,
    options: SeaBreezeGraphLoweringOptions
): Graph {
    const context = makeGraphLoweringContext(arena, options);
    return graphFor(context, root);
}

/**
 * @brief Build one graph lowering context.
 */
function makeGraphLoweringContext(
    arena: SeaBreezeArena,
    options: SeaBreezeGraphLoweringOptions
): GraphLoweringContext {
    const keyTable = readKeyTable(options.keyTable);
    return {
        arena,
        options,
        keyTable,
        objectMode: readObjectMode(options.objectMode),
        schemaCache: new Array<Schema | undefined>(arena.nodeLength),
        graphCache: new Array<Graph | undefined>(arena.nodeLength)
    };
}

/**
 * @brief Return a cached root graph for one arena node.
 */
function graphFor(context: GraphLoweringContext, node: SeaBreezeNodeId): Graph {
    const root = context.arena.find(node);
    const cached = context.graphCache[root];
    if (cached !== undefined) {
        return cached;
    }
    const builder = new GraphBuilder();
    const entry = builder.start();
    const input = builder.param("input");
    const result = lowerPredicate(context, builder, root, input);
    const ret = builder.ret(entry, result);
    const graph = builder.finish(entry, ret);
    const output = context.options.optimize === false
        ? graph
        : optimizeGraph(graph);
    context.graphCache[root] = output;
    return output;
}

/**
 * @brief Lower one arena type node into a boolean predicate node.
 */
function lowerPredicate(
    context: GraphLoweringContext,
    builder: GraphBuilder,
    node: SeaBreezeNodeId,
    value: NodeId
): NodeId {
    const root = context.arena.find(node);
    switch (context.arena.kindOf(root)) {
        case SeaBreezeKind.Never:
            return builder.constant(false);
        case SeaBreezeKind.Unknown:
            return builder.constant(true);
        case SeaBreezeKind.Null:
            return builder.isNull(value);
        case SeaBreezeKind.Undefined:
            return builder.isUndefined(value);
        case SeaBreezeKind.Boolean:
            return builder.isBoolean(value);
        case SeaBreezeKind.Number:
            return builder.isNumber(value);
        case SeaBreezeKind.String:
            return builder.isString(value);
        case SeaBreezeKind.BigInt:
            return builder.isBigInt(value);
        case SeaBreezeKind.Symbol:
            return builder.isSymbol(value);
        case SeaBreezeKind.Var:
            return lowerVar(context, builder);
        case SeaBreezeKind.Array:
            return lowerArray(context, builder, root, value);
        case SeaBreezeKind.Object:
            return lowerObject(context, builder, root, value);
        case SeaBreezeKind.Union:
            return lowerUnion(context, builder, root, value);
    }
}

/**
 * @brief Lower an unbound variable according to the schema lowering policy.
 */
function lowerVar(
    context: GraphLoweringContext,
    builder: GraphBuilder
): NodeId {
    if (context.options.unboundVar === "error") {
        throw new TypeError("cannot lower unbound SeaBreeze variable");
    }
    return builder.constant(true);
}

/**
 * @brief Lower an array node into container and item-loop predicates.
 */
function lowerArray(
    context: GraphLoweringContext,
    builder: GraphBuilder,
    root: SeaBreezeNodeId,
    value: NodeId
): NodeId {
    const item = context.arena.arrayElement(root);
    return builder.and([
        builder.isArray(value),
        builder.arrayEvery(value, schemaFor(context, item), [], graphFor(context, item))
    ]);
}

/**
 * @brief Lower an object node into one TypeSea object-shape graph node.
 */
function lowerObject(
    context: GraphLoweringContext,
    builder: GraphBuilder,
    root: SeaBreezeNodeId,
    value: NodeId
): NodeId {
    const count = context.arena.fieldCount(root);
    const entries = new Array<ObjectShapeEntry>(count);
    const keys = new Array<string>(count);
    for (let index = 0; index < count; index += 1) {
        const fieldType = context.arena.fieldTypeAt(root, index);
        const key = readFieldKey(context, context.arena.fieldKeyAt(root, index));
        keys[index] = key;
        entries[index] = {
            key,
            schema: schemaFor(context, fieldType),
            graph: graphFor(context, fieldType),
            presence: context.arena.fieldPresenceAt(root, index) === SeaBreezePresence.Required
                ? PresenceTag.Required
                : PresenceTag.Optional
        };
    }
    return builder.objectShape(
        value,
        entries,
        keys,
        context.objectMode,
        undefined,
        undefined
    );
}

/**
 * @brief Lower a union node into primitive or general dispatch.
 */
function lowerUnion(
    context: GraphLoweringContext,
    builder: GraphBuilder,
    root: SeaBreezeNodeId,
    value: NodeId
): NodeId {
    const arms: SeaBreezeNodeId[] = [];
    appendUnionArms(context, root, arms);
    if (arms.length === 0) {
        return builder.constant(false);
    }
    if (arms.length === 1) {
        return lowerPredicate(context, builder, arms[0] ?? root, value);
    }
    const options = new Array<Schema>(arms.length);
    const graphs = new Array<Graph>(arms.length);
    const masks = new Array<UnionDispatchMask>(arms.length);
    let primitiveOnly = true;
    for (let index = 0; index < arms.length; index += 1) {
        const arm = arms[index];
        if (arm === undefined) {
            continue;
        }
        options[index] = schemaFor(context, arm);
        graphs[index] = graphFor(context, arm);
        const mask = maskOf(context, arm);
        masks[index] = mask;
        if ((mask & ~PrimitiveUnionMask) !== 0) {
            primitiveOnly = false;
        }
    }
    return primitiveOnly
        ? builder.primitiveUnion(value, graphs, masks)
        : builder.unionDispatch(value, options, graphs, masks);
}

/**
 * @brief Append union arms with optional flattening.
 */
function appendUnionArms(
    context: GraphLoweringContext,
    node: SeaBreezeNodeId,
    output: SeaBreezeNodeId[]
): void {
    const root = context.arena.find(node);
    if (context.options.unionMode !== "binary" &&
        context.arena.kindOf(root) === SeaBreezeKind.Union) {
        appendUnionArms(context, context.arena.unionLeft(root), output);
        appendUnionArms(context, context.arena.unionRight(root), output);
        return;
    }
    if (context.arena.kindOf(root) !== SeaBreezeKind.Never) {
        output.push(root);
    }
}

/**
 * @brief Return schema payload for one arena node.
 */
function schemaFor(context: GraphLoweringContext, node: SeaBreezeNodeId): Schema {
    const root = context.arena.find(node);
    const cached = context.schemaCache[root];
    if (cached !== undefined) {
        return cached;
    }
    const schema = lowerSeaBreezeToSchema(context.arena, root, {
        ...context.options,
        keyTable: context.keyTable
    });
    context.schemaCache[root] = schema;
    return schema;
}

/**
 * @brief Compute root-domain mask for one arena type node.
 */
function maskOf(context: GraphLoweringContext, node: SeaBreezeNodeId): UnionDispatchMask {
    const root = context.arena.find(node);
    switch (context.arena.kindOf(root)) {
        case SeaBreezeKind.Never:
            return UnionMask.None;
        case SeaBreezeKind.Unknown:
        case SeaBreezeKind.Var:
            return UnionMask.Any;
        case SeaBreezeKind.Null:
            return UnionMask.Null;
        case SeaBreezeKind.Undefined:
            return UnionMask.Undefined;
        case SeaBreezeKind.Boolean:
            return UnionMask.Boolean;
        case SeaBreezeKind.Number:
            return UnionMask.Number;
        case SeaBreezeKind.String:
            return UnionMask.String;
        case SeaBreezeKind.BigInt:
            return UnionMask.BigInt;
        case SeaBreezeKind.Symbol:
            return UnionMask.Symbol;
        case SeaBreezeKind.Array:
            return UnionMask.Array;
        case SeaBreezeKind.Object:
            return UnionMask.Object;
        case SeaBreezeKind.Union:
            return maskOf(context, context.arena.unionLeft(root)) |
                maskOf(context, context.arena.unionRight(root));
    }
}

/**
 * @brief Read one field key from the caller-owned key table.
 */
function readFieldKey(context: GraphLoweringContext, keyId: number): string {
    const key = context.keyTable[keyId];
    if (typeof key !== "string") {
        throw new RangeError(`missing SeaBreeze key table entry ${String(keyId)}`);
    }
    return key;
}

/**
 * @brief Validate object mode policy.
 */
function readObjectMode(value: SeaBreezeGraphLoweringOptions["objectMode"]): ObjectModeTag {
    switch (value ?? "strict") {
        case "strict":
            return ObjectModeTag.Strict;
        case "passthrough":
            return ObjectModeTag.Passthrough;
        case "strip":
            return ObjectModeTag.Strip;
    }
}

/**
 * @brief Reject malformed key tables before graph lowering begins.
 */
function readKeyTable(value: readonly string[]): readonly string[] {
    const raw: unknown = value;
    if (!Array.isArray(raw)) {
        throw new TypeError("SeaBreeze keyTable must be an array");
    }
    const input = raw as readonly unknown[];
    const output = new Array<string>(input.length);
    for (let index = 0; index < input.length; index += 1) {
        const entry = input[index];
        if (typeof entry !== "string") {
            throw new TypeError("SeaBreeze keyTable entries must be strings");
        }
        output[index] = entry;
    }
    return Object.freeze(output);
}
