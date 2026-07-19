/**
 * @file graph-predicate.ts
 * @brief Predicate source emitter backed by optimized Sea-of-Nodes graphs.
 */

import {
    ArrayCheckTag,
    NodeTag,
    ObjectModeTag,
    PresenceTag,
    SchemaTag
} from "../kind/index.js";
import type {
    ArrayEveryNode,
    DiscriminantDispatchNode,
    Graph,
    NodeId,
    ObjectShapeNode,
    PresenceDispatchNode,
    PrimitiveUnionNode,
    UnionDispatchNode
} from "../ir/index.js";
import {
    appendControlPath,
    ROOT_CONTROL_PATH
} from "./control-path.js";
import { makeValidationPlan } from "../plan/index.js";
import {
    type ArrayCheck,
    schemaCanAcceptUndefined,
    schemaMustRejectUndefined,
    type LiteralValue,
    type Schema
} from "../schema/index.js";
import {
    pushKeyset,
    pushLiteral,
    pushRegex,
    pushSchema,
    stringRef
} from "./context.js";
import { scheduleObjectShapeEntries } from "./object-order.js";
import type {
    EmitContext,
    FunctionSource,
    GraphInstrumentationRegion
} from "./types.js";

/**
 * @brief Mutable state for one graph-to-source emission pass.
 * @details The sets track facts already proven in emitted branches. Keeping
 * those facts in the emitter prevents duplicate guards and keeps generated code
 * short enough for V8 to inline aggressively.
 */
interface GraphEmitState {
    readonly chunks: string[];
    readonly dataSlots: Map<string, DataSlot>;
    readonly dataGuards: Set<string>;
    readonly dataLiterals: Map<string, LiteralValue>;
    readonly knownObjects: Set<string>;
    readonly knownPredicates: Set<string>;
    readonly knownTypeofs: Set<string>;
    readonly failureStatement: string | undefined;
    temp: number;
}

/**
 * @brief Descriptor-backed value proven in one generated branch scope.
 * @details The descriptor remains authoritative until a branch materializes its
 * data value. Child branches clone slots so speculative reads cannot leak into
 * sibling code paths.
 */
interface DataSlot {
    readonly descriptor: string;
    value: string | undefined;
}

function makeGraphEmitState(): GraphEmitState {
    return {
        chunks: [],
        dataSlots: new Map<string, DataSlot>(),
        dataGuards: new Set<string>(),
        dataLiterals: new Map<string, LiteralValue>(),
        knownObjects: new Set<string>(),
        knownPredicates: new Set<string>(),
        knownTypeofs: new Set<string>(),
        failureStatement: undefined,
        temp: 0
    };
}

/**
 * @brief Fork emitter state for a speculative branch.
 * @param parent State at the branch entry.
 * @returns New state with copied facts and independent output chunks.
 * @details Branches inherit proven facts but must not append directly to the
 * parent until the caller chooses the branch source.
 */
function makeBranchEmitState(parent: GraphEmitState): GraphEmitState {
    return {
        chunks: [],
        dataSlots: cloneDataSlots(parent.dataSlots),
        dataGuards: new Set<string>(parent.dataGuards),
        dataLiterals: new Map<string, LiteralValue>(parent.dataLiterals),
        knownObjects: new Set<string>(parent.knownObjects),
        knownPredicates: new Set<string>(parent.knownPredicates),
        knownTypeofs: new Set<string>(parent.knownTypeofs),
        failureStatement: parent.failureStatement,
        temp: parent.temp
    };
}

/**
 * @brief Fork emitter state that exits through a local failure label.
 * @param parent State at the branch entry.
 * @param failureLabel Label used when the branch fails.
 * @returns Branch state configured to break instead of returning false.
 * @details Union and dispatch emitters use labels to probe a branch without
 * aborting the whole predicate.
 */
function makeFailureBranchEmitState(
    parent: GraphEmitState,
    failureLabel: string
): GraphEmitState {
    const state = makeBranchEmitState(parent);
    return {
        chunks: state.chunks,
        dataSlots: state.dataSlots,
        dataGuards: state.dataGuards,
        dataLiterals: state.dataLiterals,
        knownObjects: state.knownObjects,
        knownPredicates: state.knownPredicates,
        knownTypeofs: state.knownTypeofs,
        failureStatement: `break ${failureLabel};`,
        temp: state.temp
    };
}

/**
 * @brief Fork facts while writing into the caller's lexical source scope.
 * @param parent Facts known before the predicate check.
 * @param failureStatement Complete statement emitted when the check fails.
 * @returns Success-path state sharing the caller's output vector.
 */
function makeFailureStatementEmitState(
    parent: GraphEmitState,
    failureStatement: string
): GraphEmitState {
    const state = makeBranchEmitState(parent);
    return {
        chunks: parent.chunks,
        dataSlots: state.dataSlots,
        dataGuards: state.dataGuards,
        dataLiterals: state.dataLiterals,
        knownObjects: state.knownObjects,
        knownPredicates: state.knownPredicates,
        knownTypeofs: state.knownTypeofs,
        failureStatement,
        temp: state.temp
    };
}

/**
 * @brief Continue with conservative parent facts after a merged branch.
 * @param parent Facts valid before the branch.
 * @param temp Highest temporary identifier consumed by branch emission.
 * @returns State sharing output chunks without branch-local assumptions.
 */
function makeNeutralContinuationState(
    parent: GraphEmitState,
    temp: number
): GraphEmitState {
    const state = makeBranchEmitState(parent);
    return {
        chunks: parent.chunks,
        dataSlots: state.dataSlots,
        dataGuards: state.dataGuards,
        dataLiterals: state.dataLiterals,
        knownObjects: state.knownObjects,
        knownPredicates: state.knownPredicates,
        knownTypeofs: state.knownTypeofs,
        failureStatement: parent.failureStatement,
        temp
    };
}

function cloneDataSlots(slots: ReadonlyMap<string, DataSlot>): Map<string, DataSlot> {
    const cloned = new Map<string, DataSlot>();
    for (const [key, slot] of slots) {
        cloned.set(key, {
            descriptor: slot.descriptor,
            value: slot.value
        });
    }
    return cloned;
}

/**
 * @brief emit graph function.
 * @details Emits one predicate function from the optimized graph owned by a schema plan.
 * @returns Generated function name.
 */
export function emitGraphFunction(
    schema: Schema,
    context: EmitContext,
    preferredName?: string
): string {
    const cached = context.functionNames.get(schema);
    if (cached !== undefined) {
        return cached;
    }
    const name = preferredName ?? nextGraphFunctionName(context);
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
 * @brief Emit one predicate function from an already lowered graph.
 * @param graph Optimized or validated graph to emit.
 * @param context Emitter side-table context.
 * @param preferredName Optional stable public function name.
 * @returns Generated function name.
 * @details This is the bridge for inference engines that produce graph IR
 * directly instead of starting from a schema plan.
 */
export function emitGraphRootFunction(
    graph: Graph,
    context: EmitContext,
    preferredName?: string
): string {
    const name = preferredName ?? nextGraphFunctionName(context);
    const source: FunctionSource = {
        name,
        body: ""
    };
    context.functions.push(source);
    source.body = emitGraphBody(
        graph,
        graph.result,
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

function emitGraphChildFunction(graph: Graph, context: EmitContext): string {
    const name = nextGraphFunctionName(context);
    const source: FunctionSource = {
        name,
        body: ""
    };
    context.functions.push(source);
    source.body = emitGraphBody(graph, graph.result, "v", context);
    return name;
}

/**
 * @brief Allocate a collision-free generated predicate function name.
 * @details Predicate and diagnostic emitters append to the same function table,
 * so length alone is not a sufficient namespace proof after mixed emission.
 */
function nextGraphFunctionName(context: EmitContext): string {
    let index = context.functions.length;
    let name = `p${String(index)}`;
    while (hasFunctionName(context, name)) {
        index += 1;
        name = `p${String(index)}`;
    }
    return name;
}

function hasFunctionName(context: EmitContext, name: string): boolean {
    for (let index = 0; index < context.functions.length; index += 1) {
        if (context.functions[index]?.name === name) {
            return true;
        }
    }
    for (let index = 0; index < context.checkFunctions.length; index += 1) {
        if (context.checkFunctions[index]?.name === name) {
            return true;
        }
    }
    return false;
}

function isUnsafeMode(context: EmitContext): boolean {
    return context.mode !== "safe";
}

function isUncheckedMode(context: EmitContext): boolean {
    return context.mode === "unchecked";
}


function emitGraphBody(
    graph: Graph,
    id: NodeId,
    value: string,
    context: EmitContext
): string {
    const state = makeGraphEmitState();
    const instrumentation = context.instrumentation?.region(graph);
    if (instrumentation !== undefined && id === graph.result) {
        emitInstrumentedRegionReturn(
            graph,
            value,
            context,
            state,
            instrumentation
        );
        return state.chunks.join("");
    }
    emitGraphReturn(graph, id, value, context, state);
    return state.chunks.join("");
}

/**
 * @brief Emit one instrumented region at a predicate return boundary.
 * @details The ordinary optimized checks remain authoritative; instrumentation
 * contributes statements only at adapter-proven control edges.
 */
function emitInstrumentedRegionReturn(
    graph: Graph,
    value: string,
    context: EmitContext,
    state: GraphEmitState,
    instrumentation: GraphInstrumentationRegion
): void {
    state.chunks.push(instrumentation.statement(ROOT_CONTROL_PATH, "entry"));
    const reject = combineInstrumentationStatements(
        instrumentation.statement(ROOT_CONTROL_PATH, "reject"),
        "return false;"
    );
    const success = emitInstrumentedGuard(
        graph,
        graph.result,
        value,
        context,
        state,
        instrumentation,
        ROOT_CONTROL_PATH,
        reject
    );
    success.chunks.push(
        instrumentation.statement(ROOT_CONTROL_PATH, "accept"),
        "return true;"
    );
    state.temp = Math.max(state.temp, success.temp);
}

/**
 * @brief Emit an instrumented nested-region check into an existing predicate.
 * @details Child graph facts are intentionally not propagated to the parent
 * graph because node ids and descriptor slots are region-local.
 */
function emitInstrumentedRegionCheck(
    graph: Graph,
    value: string,
    context: EmitContext,
    state: GraphEmitState,
    instrumentation: GraphInstrumentationRegion
): void {
    state.chunks.push(instrumentation.statement(ROOT_CONTROL_PATH, "entry"));
    const reject = combineInstrumentationStatements(
        instrumentation.statement(ROOT_CONTROL_PATH, "reject"),
        failStatement(state)
    );
    const success = emitInstrumentedGuard(
        graph,
        graph.result,
        value,
        context,
        state,
        instrumentation,
        ROOT_CONTROL_PATH,
        reject
    );
    success.chunks.push(instrumentation.statement(ROOT_CONTROL_PATH, "accept"));
    state.temp = Math.max(state.temp, success.temp);
}

/**
 * @brief Emit a guard whose success falls through and failure executes a jump.
 * @returns Success-path facts available to the next conjunct.
 */
function emitInstrumentedGuard(
    graph: Graph,
    id: NodeId,
    value: string,
    context: EmitContext,
    state: GraphEmitState,
    instrumentation: GraphInstrumentationRegion,
    path: string,
    failureStatement: string
): GraphEmitState {
    const node = graph.nodes[id];
    if (instrumentation.branch(path, id)) {
        return emitInstrumentedLeafGuard(
            graph,
            id,
            value,
            context,
            state,
            instrumentation,
            path,
            failureStatement
        );
    }
    if (node === undefined) {
        state.chunks.push(failureStatement);
        return state;
    }
    if (node.tag === NodeTag.Const) {
        if (node.value !== true) {
            state.chunks.push(failureStatement);
        }
        return state;
    }
    if (node.tag === NodeTag.Return) {
        return emitInstrumentedGuard(
            graph,
            node.value,
            value,
            context,
            state,
            instrumentation,
            path,
            failureStatement
        );
    }
    if (node.tag === NodeTag.Not) {
        return emitInstrumentedProbe(
            graph,
            node.value,
            value,
            context,
            state,
            instrumentation,
            appendControlPath(path, "n"),
            failureStatement
        );
    }
    if (node.tag === NodeTag.And) {
        let current = state;
        for (let index = 0; index < node.values.length; index += 1) {
            const child = node.values[index];
            if (child !== undefined) {
                current = emitInstrumentedGuard(
                    graph,
                    child,
                    value,
                    context,
                    current,
                    instrumentation,
                    appendControlPath(path, "a", index),
                    failureStatement
                );
            }
        }
        return current;
    }
    if (node.tag === NodeTag.Or) {
        const successLabel = `is${String(state.temp)}`;
        state.temp += 1;
        state.chunks.push(`${successLabel}:{`);
        let current = state;
        for (let index = 0; index < node.values.length; index += 1) {
            const child = node.values[index];
            if (child !== undefined) {
                current = emitInstrumentedProbe(
                    graph,
                    child,
                    value,
                    context,
                    current,
                    instrumentation,
                    appendControlPath(path, "o", index),
                    `break ${successLabel};`
                );
            }
        }
        current.chunks.push(failureStatement, "}");
        return makeNeutralContinuationState(state, current.temp);
    }
    return emitInstrumentedLeafGuard(
        graph,
        id,
        value,
        context,
        state,
        instrumentation,
        path,
        failureStatement
    );
}

/**
 * @brief Emit a predicate whose false result falls through.
 * @returns Conservative false-path facts after the probe block.
 */
function emitInstrumentedProbe(
    graph: Graph,
    id: NodeId,
    value: string,
    context: EmitContext,
    state: GraphEmitState,
    instrumentation: GraphInstrumentationRegion,
    path: string,
    successStatement: string
): GraphEmitState {
    const failureLabel = `if${String(state.temp)}`;
    state.temp += 1;
    state.chunks.push(`${failureLabel}:{`);
    const success = emitInstrumentedGuard(
        graph,
        id,
        value,
        context,
        state,
        instrumentation,
        path,
        `break ${failureLabel};`
    );
    success.chunks.push(successStatement, "}");
    return makeNeutralContinuationState(state, success.temp);
}

/**
 * @brief Emit one adapter-identified atomic predicate edge pair.
 * @returns Success-path facts produced by the existing optimized check emitter.
 */
function emitInstrumentedLeafGuard(
    graph: Graph,
    id: NodeId,
    value: string,
    context: EmitContext,
    state: GraphEmitState,
    instrumentation: GraphInstrumentationRegion,
    path: string,
    failureStatement: string
): GraphEmitState {
    const failure = combineInstrumentationStatements(
        instrumentation.statement(path, "false"),
        failureStatement
    );
    const success = makeFailureStatementEmitState(state, failure);
    emitFalseCheck(graph, id, value, context, success);
    success.chunks.push(instrumentation.statement(path, "true"));
    return success;
}

/** @brief Join an edge action and control transfer as one generated statement. */
function combineInstrumentationStatements(action: string, continuation: string): string {
    return action.length === 0 ? continuation : `{${action}${continuation}}`;
}


function emitGraphReturn(
    graph: Graph,
    id: NodeId,
    value: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    const node = graph.nodes[id];
    if (node === undefined) {
        state.chunks.push(failStatement(state));
        return;
    }
    if (node.tag === NodeTag.Const) {
        state.chunks.push(node.value === true ? "return true;" : failStatement(state));
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
                node,
                value,
                context,
                state
            );
            return;
        case NodeTag.UnionDispatch:
            emitUnionDispatchReturn(
                graph,
                node,
                value,
                context,
                state
            );
            return;
        case NodeTag.PresenceDispatch:
            emitPresenceDispatchReturn(
                graph,
                node,
                value,
                context,
                state
            );
            return;
        case NodeTag.PrimitiveUnion:
            emitPrimitiveUnionReturn(
                graph,
                node,
                value,
                context,
                state
            );
            return;
        case NodeTag.ObjectShape:
            emitObjectShapeCheck(
                graph,
                node,
                value,
                context,
                state
            );
            state.chunks.push("return true;");
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


function emitFalseCheck(
    graph: Graph,
    id: NodeId,
    value: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    const instrumentation = context.instrumentation?.region(graph);
    if (instrumentation !== undefined && id === graph.result) {
        emitInstrumentedRegionCheck(
            graph,
            value,
            context,
            state,
            instrumentation
        );
        return;
    }
    const node = graph.nodes[id];
    if (node?.tag === NodeTag.Const) {
        if (node.value !== true) {
            state.chunks.push(failStatement(state));
        }
        return;
    }
    if (node?.tag === NodeTag.Return) {
        emitFalseCheck(graph, node.value, value, context, state);
        return;
    }
    if (node?.tag === NodeTag.And) {
        if (emitStringAndCheck(graph, node.values, value, context, state)) {
            return;
        }
        if (emitNumberAndCheck(graph, node.values, value, context, state)) {
            return;
        }
        for (let index = 0; index < node.values.length; index += 1) {
            const child = node.values[index];
            if (child !== undefined) {
                emitFalseCheck(graph, child, value, context, state);
            }
        }
        return;
    }
    if (node?.tag === NodeTag.ArrayEvery) {
        emitArrayEveryCheck(
            graph,
            node.value,
            node.item,
            node.checks,
            node.itemGraph,
            value,
            context,
            state
        );
        return;
    }
    if (node?.tag === NodeTag.TupleItems) {
        emitTupleItemsCheck(
            graph,
            node.value,
            node.items,
            node.itemGraphs,
            value,
            context,
            state
        );
        return;
    }
    if (node?.tag === NodeTag.RecordEvery) {
        emitRecordEveryCheck(
            graph,
            node.value,
            node.item,
            node.itemGraph,
            value,
            context,
            state
        );
        return;
    }
    if (node?.tag === NodeTag.PrimitiveUnion) {
        emitPrimitiveUnionCheck(graph, node, value, context, state);
        return;
    }
    if (node?.tag === NodeTag.PresenceDispatch) {
        emitPresenceDispatchCheck(graph, node, value, context, state);
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
    if (isKnownPredicateNode(graph, node, value, context, state)) {
        return;
    }
    if (node?.tag === NodeTag.IsNumber) {
        emitNumberGuard(
            emitGraphExpression(graph, node.value, value, context, state),
            state
        );
        return;
    }
    if (node !== undefined && isKnownPredicateTag(node.tag) &&
        node.tag !== NodeTag.IsObject && "value" in node &&
        typeof node.value === "number") {
        emitPredicateGuard(
            node.tag,
            emitGraphExpression(graph, node.value, value, context, state),
            state
        );
        return;
    }
    if (node?.tag === NodeTag.IsObject) {
        emitObjectGuard(
            emitGraphExpression(graph, node.value, value, context, state),
            state
        );
        return;
    }
    if (node?.tag === NodeTag.ObjectShape) {
        emitObjectShapeCheck(graph, node, value, context, state);
        return;
    }
    state.chunks.push(`if(!${emitGraphExpression(
        graph,
        id,
        value,
        context,
        state
    )})${failStatement(state)}`);
}

/**
 * @brief Emit safe array validation without executing index accessors.
 * @details A schema that rejects undefined must prove every logical index is an
 * own data property. A schema that accepts undefined delegates to the
 * present-index path so hostile sparse lengths do not force linear hole scans.
 */
function emitArrayEveryCheck(
    graph: Graph,
    valueId: NodeId,
    item: Schema,
    checks: readonly ArrayCheck[],
    itemGraph: Graph,
    value: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    if (isUnsafeMode(context)) {
        emitUnsafeArrayEveryCheck(
            graph,
            valueId,
            checks,
            itemGraph,
            value,
            context,
            state
        );
        return;
    }
    const arrayExpression = emitGraphExpression(graph, valueId, value, context, state);
    const index = `i${String(state.temp)}`;
    state.temp += 1;
    const descriptor = `d${String(state.temp)}`;
    state.temp += 1;
    const allowsUndefined = schemaCanAcceptUndefined(item);
    const itemConstant = readGraphResultBoolean(itemGraph);
    emitArrayGuard(arrayExpression, state);
    emitArrayLengthChecks(arrayExpression, checks, state);
    if (itemConstant === false) {
        /*
         * If the item graph is impossible, only an empty array can pass. This
         * avoids emitting a loop that would fail on the first slot.
         */
        state.chunks.push(
            `if(${arrayExpression}.length!==0)${failStatement(state)}`
        );
        return;
    }
    if (allowsUndefined) {
        /*
         * Holes are already accepted by the source schema, so the hot path scales
         * with present descriptors rather than logical length.
         */
        emitPresentArrayEveryCheck(
            itemGraph,
            itemConstant,
            arrayExpression,
            context,
            state
        );
        return;
    }
    state.chunks.push(
        `for(let ${index}=0;${index}<${arrayExpression}.length;${index}+=1){`,
        `const ${descriptor}=gp(${arrayExpression},${index});`,
        `if(${descriptor}===undefined${descriptorNeedsValueProof(item) ? `||!h.call(${descriptor},"value")` : ""})${failStatement(state)}`
    );
    if (itemConstant !== true) {
        const itemValue = `v${String(state.temp)}`;
        state.temp += 1;
        state.chunks.push(`const ${itemValue}=${descriptor}.value;`);
        emitFalseCheck(itemGraph, itemGraph.result, itemValue, context, state);
    }
    state.chunks.push("}");
}

/**
 * @brief Walk present array indexes when the item schema accepts undefined.
 * @details When holes are valid `undefined` values, only present own index slots
 * can fail validation or hide accessor code, so sparse arrays avoid hole scans.
 */
function emitPresentArrayEveryCheck(
    itemGraph: Graph,
    itemConstant: boolean | undefined,
    arrayExpression: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    const keyIndex = `x${String(state.temp)}`;
    state.temp += 1;
    const key = `k${String(state.temp)}`;
    state.temp += 1;
    const descriptor = `d${String(state.temp)}`;
    state.temp += 1;
    const keys = `ks${String(state.temp)}`;
    state.temp += 1;
    /*
     * Object.getOwnPropertyNames allocates one key list, but it avoids a
     * length-proportional scan for hostile sparse arrays with huge length.
     */
    state.chunks.push(
        `const ${keys}=Object.getOwnPropertyNames(${arrayExpression});`,
        `for(let ${keyIndex}=0;${keyIndex}<${keys}.length;${keyIndex}+=1){`,
        `const ${key}=${keys}[${keyIndex}];`,
        `if(!ai(${key},${arrayExpression}.length))continue;`,
        `const ${descriptor}=gp(${arrayExpression},${key});`,
        `if(${descriptor}!==undefined&&!h.call(${descriptor},"value"))${failStatement(state)}`
    );
    if (itemConstant !== true) {
        /*
         * The descriptor may disappear between key enumeration and lookup on
         * exotic arrays. Treat absence as a valid hole because this path exists
         * only after undefined was accepted.
         */
        const itemValue = `v${String(state.temp)}`;
        state.temp += 1;
        state.chunks.push(
            `if(${descriptor}!==undefined){`,
            `const ${itemValue}=${descriptor}.value;`
        );
        emitFalseCheck(itemGraph, itemGraph.result, itemValue, context, state);
        state.chunks.push("}");
    }
    state.chunks.push("}");
}


function emitUnsafeArrayEveryCheck(
    graph: Graph,
    valueId: NodeId,
    checks: readonly ArrayCheck[],
    itemGraph: Graph,
    value: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    const arrayExpression = emitGraphExpression(graph, valueId, value, context, state);
    const index = `i${String(state.temp)}`;
    state.temp += 1;
    const itemConstant = readGraphResultBoolean(itemGraph);
    emitArrayGuard(arrayExpression, state);
    emitArrayLengthChecks(arrayExpression, checks, state);
    if (itemConstant === false) {
        state.chunks.push(
            `if(${arrayExpression}.length!==0)${failStatement(state)}`
        );
        return;
    }
    if (itemConstant === true) {
        return;
    }
    const itemValue = `v${String(state.temp)}`;
    state.temp += 1;
    state.chunks.push(
        `for(let ${index}=0;${index}<${arrayExpression}.length;${index}+=1){`,
        `const ${itemValue}=${arrayExpression}[${index}];`
    );
    emitFalseCheck(itemGraph, itemGraph.result, itemValue, context, state);
    state.chunks.push("}");
}

/**
 * @brief Emit array length failure branches.
 * @param arrayExpression Generated expression already proven to be an array.
 * @param checks Normalized array length checks.
 * @param state Mutable graph emitter state.
 * @post Appends no code when the schema has no length checks.
 */
function emitArrayLengthChecks(
    arrayExpression: string,
    checks: readonly ArrayCheck[],
    state: GraphEmitState
): void {
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            state.chunks.push(failStatement(state));
            continue;
        }
        switch (check.tag) {
            case ArrayCheckTag.Min:
                state.chunks.push(
                    `if(${arrayExpression}.length<${String(check.value)})${failStatement(state)}`
                );
                break;
            case ArrayCheckTag.Max:
                state.chunks.push(
                    `if(${arrayExpression}.length>${String(check.value)})${failStatement(state)}`
                );
                break;
        }
    }
}


function emitTupleItemsCheck(
    graph: Graph,
    valueId: NodeId,
    items: readonly Schema[],
    itemGraphs: readonly Graph[],
    value: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    if (isUnsafeMode(context)) {
        emitUnsafeTupleItemsCheck(
            graph,
            valueId,
            itemGraphs,
            value,
            context,
            state
        );
        return;
    }
    const tupleExpression = emitGraphExpression(graph, valueId, value, context, state);
    emitArrayGuard(tupleExpression, state);
    state.chunks.push(
        `if(${tupleExpression}.length!==${String(itemGraphs.length)})${failStatement(state)}`
    );
    for (let index = 0; index < itemGraphs.length; index += 1) {
        const itemGraph = itemGraphs[index];
        if (itemGraph === undefined) {
            state.chunks.push(failStatement(state));
            continue;
        }
        const item = items[index];
        if (item === undefined) {
            state.chunks.push(failStatement(state));
            continue;
        }
        const itemConstant = readGraphResultBoolean(itemGraph);
        if (itemConstant === false) {
            state.chunks.push(failStatement(state));
            return;
        }
        const allowsUndefined = schemaCanAcceptUndefined(item);
        const descriptor = `d${String(state.temp)}`;
        state.temp += 1;
        state.chunks.push(
            `const ${descriptor}=gp(${tupleExpression},${String(index)});`
        );
        if (allowsUndefined) {
            state.chunks.push(
                `if(${descriptor}!==undefined&&!h.call(${descriptor},"value"))${failStatement(state)}`
            );
        } else {
            state.chunks.push(
                `if(${descriptor}===undefined${descriptorNeedsValueProof(item) ? `||!h.call(${descriptor},"value")` : ""})${failStatement(state)}`
            );
        }
        if (itemConstant !== true) {
            const itemValue = `v${String(state.temp)}`;
            state.temp += 1;
            state.chunks.push(
                allowsUndefined
                    ? `const ${itemValue}=${descriptor}===undefined?undefined:${descriptor}.value;`
                    : `const ${itemValue}=${descriptor}.value;`
            );
            emitFalseCheck(itemGraph, itemGraph.result, itemValue, context, state);
        }
    }
}


function emitUnsafeTupleItemsCheck(
    graph: Graph,
    valueId: NodeId,
    itemGraphs: readonly Graph[],
    value: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    const tupleExpression = emitGraphExpression(graph, valueId, value, context, state);
    emitArrayGuard(tupleExpression, state);
    state.chunks.push(
        `if(${tupleExpression}.length!==${String(itemGraphs.length)})${failStatement(state)}`
    );
    for (let index = 0; index < itemGraphs.length; index += 1) {
        const itemGraph = itemGraphs[index];
        if (itemGraph === undefined) {
            state.chunks.push(failStatement(state));
            continue;
        }
        const itemConstant = readGraphResultBoolean(itemGraph);
        if (itemConstant === false) {
            state.chunks.push(failStatement(state));
            return;
        }
        if (itemConstant !== true) {
            const itemValue = `v${String(state.temp)}`;
            state.temp += 1;
            state.chunks.push(`const ${itemValue}=${tupleExpression}[${String(index)}];`);
            emitFalseCheck(itemGraph, itemGraph.result, itemValue, context, state);
        }
    }
}


function emitRecordEveryCheck(
    graph: Graph,
    valueId: NodeId,
    item: Schema,
    itemGraph: Graph,
    value: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    if (isUnsafeMode(context)) {
        emitUnsafeRecordEveryCheck(
            graph,
            valueId,
            itemGraph,
            value,
            context,
            state
        );
        return;
    }
    const recordExpression = emitGraphExpression(graph, valueId, value, context, state);
    const key = `key${String(state.temp)}`;
    state.temp += 1;
    const descriptor = `d${String(state.temp)}`;
    state.temp += 1;
    const itemConstant = readGraphResultBoolean(itemGraph);
    emitObjectGuard(recordExpression, state);
    if (itemConstant === false) {
        state.chunks.push(
            `for(const ${key} in ${recordExpression}){`,
            `if(h.call(${recordExpression},${key}))${failStatement(state)}`,
            "}"
        );
        return;
    }
    state.chunks.push(
        `for(const ${key} in ${recordExpression}){`,
        `if(!h.call(${recordExpression},${key}))continue;`,
        `const ${descriptor}=gp(${recordExpression},${key});`,
        `if(${descriptor}===undefined${descriptorNeedsValueProof(item) ? `||!h.call(${descriptor},"value")` : ""})${failStatement(state)}`
    );
    if (itemConstant !== true) {
        const itemValue = `v${String(state.temp)}`;
        state.temp += 1;
        state.chunks.push(`const ${itemValue}=${descriptor}.value;`);
        emitFalseCheck(itemGraph, itemGraph.result, itemValue, context, state);
    }
    state.chunks.push("}");
}


function emitUnsafeRecordEveryCheck(
    graph: Graph,
    valueId: NodeId,
    itemGraph: Graph,
    value: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    const recordExpression = emitGraphExpression(graph, valueId, value, context, state);
    const key = `key${String(state.temp)}`;
    state.temp += 1;
    const itemConstant = readGraphResultBoolean(itemGraph);
    emitObjectGuard(recordExpression, state);
    if (itemConstant === false) {
        if (isUncheckedMode(context)) {
            state.chunks.push(
                `for(const ${key} in ${recordExpression}){`,
                failStatement(state),
                "}"
            );
        } else {
            state.chunks.push(
                `for(const ${key} in ${recordExpression}){`,
                `if(h.call(${recordExpression},${key}))${failStatement(state)}`,
                "}"
            );
        }
        return;
    }
    if (itemConstant === true) {
        return;
    }
    const itemValue = `v${String(state.temp)}`;
    state.temp += 1;
    if (isUncheckedMode(context)) {
        state.chunks.push(
            `for(const ${key} in ${recordExpression}){`,
            `const ${itemValue}=${recordExpression}[${key}];`
        );
    } else {
        state.chunks.push(
            `for(const ${key} in ${recordExpression}){`,
            `if(!h.call(${recordExpression},${key}))continue;`,
            `const ${itemValue}=${recordExpression}[${key}];`
        );
    }
    emitFalseCheck(itemGraph, itemGraph.result, itemValue, context, state);
    state.chunks.push("}");
}


function emitStrictKeysCheck(
    graph: Graph,
    object: NodeId,
    keys: readonly string[],
    value: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    const objectExpression = emitGraphExpression(graph, object, value, context, state);
    if (isUncheckedMode(context)) {
        return;
    }
    if (isUnsafeMode(context)) {
        emitUnsafeStrictKeyLoop(objectExpression, keys, state);
        return;
    }
    if (hasAllRequiredKeys(object, keys, objectExpression, state)) {
        state.chunks.push(
            `if(Object.getOwnPropertyNames(${objectExpression}).length!==${String(keys.length)}||Object.getOwnPropertySymbols(${objectExpression}).length!==0)${failStatement(state)}`
        );
        return;
    }
    const present = `xs${String(state.temp)}`;
    state.temp += 1;
    const length = `n${String(state.temp)}`;
    state.temp += 1;
    const index = `i${String(state.temp)}`;
    state.temp += 1;
    const key = `key${String(state.temp)}`;
    state.temp += 1;
    state.chunks.push(
        `const ${present}=Reflect.ownKeys(${objectExpression});`,
        `const ${length}=${present}.length;`,
        `for(let ${index}=0;${index}<${length};${index}+=1){`,
        `const ${key}=${present}[${index}];`,
        `if(typeof ${key}!=="string"||!${keyMembershipExpression(key, keys, context)})${failStatement(state)}`,
        "}"
    );
}


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
    state.chunks.push(failStatement(state));
}


function emitDiscriminantDispatchReturn(
    graph: Graph,
    node: DiscriminantDispatchNode,
    value: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    const objectExpression = emitGraphExpression(
        graph,
        node.value,
        value,
        context,
        state
    );
    if (isUnsafeMode(context)) {
        emitUnsafeDiscriminantDispatchReturn(node, objectExpression, context, state);
        return;
    }
    const descriptor = `d${String(state.temp)}`;
    state.temp += 1;
    state.chunks.push(
        objectGuardStatement(objectExpression, state),
        `const ${descriptor}=gp(${objectExpression},${stringRef(context, node.key)});`,
        `if(${descriptor}===undefined||typeof ${descriptor}.value!=="string")${failStatement(state)}`,
        `switch(${descriptor}.value){`
    );
    markKnownObject(objectExpression, state);
    for (let index = 0; index < node.graphs.length; index += 1) {
        const childGraph = node.graphs[index];
        const literal = node.literals[index];
        if (childGraph !== undefined && literal !== undefined &&
            readGraphResultBoolean(childGraph) !== false) {
            const branch = makeBranchEmitState(state);
            const param = findParamNode(childGraph);
            markKnownObject(objectExpression, branch);
            if (param !== undefined) {
                seedDataSlot(
                    branch,
                    param,
                    node.key,
                    objectExpression,
                    descriptor,
                    `${descriptor}.value`,
                    literal
                );
            }
            emitFalseCheck(childGraph, childGraph.result, objectExpression, context, branch);
            state.chunks.push(
                `case ${stringRef(context, literal)}:{`,
                ...branch.chunks,
                "return true;}"
            );
            if (branch.temp > state.temp) {
                state.temp = branch.temp;
            }
        }
    }
    state.chunks.push(`default:${failStatement(state)}}`);
}


function emitUnsafeDiscriminantDispatchReturn(
    node: DiscriminantDispatchNode,
    objectExpression: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    const discriminant = `v${String(state.temp)}`;
    state.temp += 1;
    state.chunks.push(
        objectGuardStatement(objectExpression, state),
        `const ${discriminant}=${unsafePropertyReadExpression(objectExpression, node.key)};`,
        `if(typeof ${discriminant}!=="string")${failStatement(state)}`,
        `switch(${discriminant}){`
    );
    markKnownObject(objectExpression, state);
    for (let index = 0; index < node.graphs.length; index += 1) {
        const childGraph = node.graphs[index];
        const literal = node.literals[index];
        if (childGraph !== undefined && literal !== undefined &&
            readGraphResultBoolean(childGraph) !== false) {
            const branch = makeBranchEmitState(state);
            markKnownObject(objectExpression, branch);
            emitFalseCheck(childGraph, childGraph.result, objectExpression, context, branch);
            state.chunks.push(
                `case ${unsafeStringLiteralExpression(literal)}:{`,
                ...branch.chunks,
                "return true;}"
            );
            if (branch.temp > state.temp) {
                state.temp = branch.temp;
            }
        }
    }
    state.chunks.push(`default:${failStatement(state)}}`);
}


function emitPrimitiveUnionReturn(
    graph: Graph,
    node: PrimitiveUnionNode,
    value: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    const subjectExpression = emitGraphExpression(
        graph,
        node.value,
        value,
        context,
        state
    );
    const subject = emitSubjectAlias(subjectExpression, state);
    emitPrimitiveUnionTail(node, subject, context, state, "return true;");
}


function emitPrimitiveUnionCheck(
    graph: Graph,
    node: PrimitiveUnionNode,
    value: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    const success = `us${String(state.temp)}`;
    state.temp += 1;
    const subjectExpression = emitGraphExpression(
        graph,
        node.value,
        value,
        context,
        state
    );
    const subject = emitSubjectAlias(subjectExpression, state);
    state.chunks.push(`${success}:{`);
    emitPrimitiveUnionTail(
        node,
        subject,
        context,
        state,
        `break ${success};`
    );
    state.chunks.push("}");
}


function emitPrimitiveUnionFunction(
    node: PrimitiveUnionNode,
    context: EmitContext
): string {
    const name = `p${String(context.functions.length)}`;
    const source: FunctionSource = {
        name,
        body: ""
    };
    context.functions.push(source);
    source.body = emitPrimitiveUnionBody(node, "v", context);
    return name;
}


function emitPrimitiveUnionBody(
    node: PrimitiveUnionNode,
    value: string,
    context: EmitContext
): string {
    const state = makeGraphEmitState();
    emitPrimitiveUnionTail(node, value, context, state, "return true;");
    return state.chunks.join("");
}


function emitPrimitiveUnionTail(
    node: PrimitiveUnionNode,
    value: string,
    context: EmitContext,
    state: GraphEmitState,
    successStatement: string
): void {
    const type = `ut${String(state.temp)}`;
    state.temp += 1;
    state.chunks.push(`const ${type}=typeof ${value};`);
    for (let index = 0; index < node.graphs.length;) {
        const mask = node.masks[index];
        if (mask === undefined || mask === 0 || node.graphs[index] === undefined) {
            index += 1;
            continue;
        }
        const guard = primitiveUnionMaskExpression(mask, value, type);
        if (guard === "false") {
            index += 1;
            continue;
        }
        const end = nextPrimitiveUnionMaskRun(node, index, mask);
        if (end === index + 1) {
            const graph = node.graphs[index];
            if (graph !== undefined && readGraphResultBoolean(graph) !== false) {
                const branch = makeBranchEmitState(state);
                markUnionMaskRefinement(mask, value, branch);
                emitFalseCheck(graph, graph.result, value, context, branch);
                state.chunks.push(
                    `if(${guard}){`,
                    ...branch.chunks,
                    successStatement,
                    "}"
                );
                if (branch.temp > state.temp) {
                    state.temp = branch.temp;
                }
            }
            index = end;
            continue;
        }
        const runChunks: string[] = [];
        for (let runIndex = index; runIndex < end; runIndex += 1) {
            const graph = node.graphs[runIndex];
            if (graph === undefined || readGraphResultBoolean(graph) === false) {
                continue;
            }
            const label = `ub${String(state.temp)}`;
            state.temp += 1;
            const branch = makeFailureBranchEmitState(state, label);
            markUnionMaskRefinement(mask, value, branch);
            emitFalseCheck(graph, graph.result, value, context, branch);
            if (branch.chunks.length === 0) {
                runChunks.push(successStatement);
            } else {
                runChunks.push(`${label}:{`, ...branch.chunks, successStatement, "}");
            }
            if (branch.temp > state.temp) {
                state.temp = branch.temp;
            }
        }
        if (runChunks.length !== 0) {
            state.chunks.push(`if(${guard}){`, ...runChunks, "}");
        }
        index = end;
    }
    state.chunks.push(failStatement(state));
}


function emitUnionDispatchReturn(
    graph: Graph,
    node: UnionDispatchNode,
    value: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    const subjectExpression = emitGraphExpression(
        graph,
        node.value,
        value,
        context,
        state
    );
    const subject = emitSubjectAlias(subjectExpression, state);
    emitUnionDispatchTail(node, subject, context, state);
}


function emitUnionDispatchFunction(
    node: UnionDispatchNode,
    context: EmitContext
): string {
    const name = `p${String(context.functions.length)}`;
    const source: FunctionSource = {
        name,
        body: ""
    };
    context.functions.push(source);
    source.body = emitUnionDispatchBody(node, "v", context);
    return name;
}


function emitUnionDispatchBody(
    node: UnionDispatchNode,
    value: string,
    context: EmitContext
): string {
    const state = makeGraphEmitState();
    emitUnionDispatchTail(node, value, context, state);
    return state.chunks.join("");
}


function emitUnionDispatchTail(
    node: UnionDispatchNode,
    value: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    const type = `ut${String(state.temp)}`;
    state.temp += 1;
    state.chunks.push(`const ${type}=typeof ${value};`);
    for (let index = 0; index < node.graphs.length;) {
        const mask = node.masks[index];
        if (mask === undefined || mask === 0 || node.graphs[index] === undefined) {
            index += 1;
            continue;
        }
        const guard = unionMaskExpression(mask, value, type);
        const end = nextUnionMaskRun(node, index, mask);
        const runChunks: string[] = [];
        for (let runIndex = index; runIndex < end; runIndex += 1) {
            const graph = node.graphs[runIndex];
            if (graph === undefined || readGraphResultBoolean(graph) === false) {
                continue;
            }
            const label = `ub${String(state.temp)}`;
            state.temp += 1;
            const branch = makeFailureBranchEmitState(state, label);
            markUnionMaskRefinement(mask, value, branch);
            emitFalseCheck(graph, graph.result, value, context, branch);
            if (branch.chunks.length === 0) {
                runChunks.push("return true;");
            } else {
                runChunks.push(`${label}:{`, ...branch.chunks, "return true;}");
            }
            if (branch.temp > state.temp) {
                state.temp = branch.temp;
            }
        }
        if (runChunks.length !== 0) {
            if (guard === "true") {
                state.chunks.push(...runChunks);
            } else {
                state.chunks.push(`if(${guard}){`, ...runChunks, "}");
            }
        }
        index = end;
    }
    state.chunks.push(failStatement(state));
}

/**
 * @brief Inline presence dispatch at a predicate return boundary.
 * @details Presence dispatch keeps source union order but avoids entering object
 * branches whose required key is absent.
 */
function emitPresenceDispatchReturn(
    graph: Graph,
    node: PresenceDispatchNode,
    value: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    const subjectExpression = emitGraphExpression(
        graph,
        node.value,
        value,
        context,
        state
    );
    const subject = emitSubjectAlias(subjectExpression, state);
    emitPresenceDispatchTail(node, subject, context, state, "return true;");
}

/**
 * @brief Inline presence dispatch inside a fallible parent branch.
 * @details Nested presence dispatch uses a success label so failure still
 * behaves like an ordinary predicate check.
 */
function emitPresenceDispatchCheck(
    graph: Graph,
    node: PresenceDispatchNode,
    value: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    const success = `ps${String(state.temp)}`;
    state.temp += 1;
    const subjectExpression = emitGraphExpression(
        graph,
        node.value,
        value,
        context,
        state
    );
    const subject = emitSubjectAlias(subjectExpression, state);
    state.chunks.push(`${success}:{`);
    emitPresenceDispatchTail(
        node,
        subject,
        context,
        state,
        `break ${success};`
    );
    state.chunks.push("}");
}

/**
 * @brief Materialize presence dispatch for expression-mode callers.
 * @details Expression-mode callers use a generated helper while return/check
 * paths inline the same branch-gated loop.
 */
function emitPresenceDispatchFunction(
    node: PresenceDispatchNode,
    context: EmitContext
): string {
    const name = `p${String(context.functions.length)}`;
    const source: FunctionSource = {
        name,
        body: ""
    };
    context.functions.push(source);
    const state = makeGraphEmitState();
    emitPresenceDispatchTail(node, "v", context, state, "return true;");
    source.body = state.chunks.join("");
    return name;
}

/**
 * @brief Preserve source union order while gating impossible object branches.
 * @details Branches remain in declaration order. A key gate can only skip a
 * branch after lowering proved that branch cannot accept objects missing that
 * own data field.
 */
function emitPresenceDispatchTail(
    node: PresenceDispatchNode,
    value: string,
    context: EmitContext,
    state: GraphEmitState,
    successStatement: string
): void {
    emitObjectGuard(value, state);
    for (let index = 0; index < node.graphs.length; index += 1) {
        const childGraph = node.graphs[index];
        if (childGraph === undefined || readGraphResultBoolean(childGraph) === false) {
            continue;
        }
        const label = `pb${String(state.temp)}`;
        state.temp += 1;
        const key = node.keys[index];
        const branch = makeFailureBranchEmitState(state, label);
        markKnownObject(value, branch);
        if (typeof key === "string" && !isUnsafeMode(context)) {
            const descriptor = `d${String(state.temp)}`;
            state.temp += 1;
            branch.temp = state.temp;
            const needsValueProof = !branchKeyMustRejectUndefined(
                node.options[index],
                key
            );
            branch.chunks.push(`const ${descriptor}=gp(${value},${stringRef(context, key)});`);
            branch.chunks.push(`if(${descriptor}===undefined${needsValueProof ? `||!h.call(${descriptor},"value")` : ""})break ${label};`);
            const param = findParamNode(childGraph);
            if (param !== undefined) {
                seedDataSlot(
                    branch,
                    param,
                    key,
                    value,
                    descriptor,
                    `${descriptor}.value`,
                    undefined
                );
            }
        }
        emitFalseCheck(childGraph, childGraph.result, value, context, branch);
        const branchChunks = branch.chunks.length === 0
            ? [successStatement]
            : [`${label}:{`, ...branch.chunks, successStatement, "}"];
        if (typeof key === "string" && isUnsafeMode(context)) {
            state.chunks.push(
                `if(h.call(${value},${unsafeStringLiteralExpression(key)})){`,
                ...branchChunks,
                "}"
            );
        } else if (typeof key === "string") {
            state.chunks.push(...branchChunks);
        } else {
            state.chunks.push(...branchChunks);
        }
        if (branch.temp > state.temp) {
            state.temp = branch.temp;
        }
    }
    state.chunks.push(failStatement(state));
}


function emitStringAndCheck(
    graph: Graph,
    ids: readonly NodeId[],
    value: string,
    context: EmitContext,
    state: GraphEmitState
): boolean {
    const plan = readStringAndPlan(graph, ids);
    if (plan === undefined) {
        return false;
    }
    const subject = emitGraphExpression(graph, plan.value, value, context, state);
    if (isKnownPredicate(NodeTag.IsString, subject, state)) {
        emitKnownStringAndPlan(plan, subject, context, state);
    } else {
        const failures = [`typeof ${subject}!=="string"`];
        pushStringPlanFailures(plan, subject, context, failures);
        state.chunks.push(`if(${failures.join("||")})${failStatement(state)}`);
        markKnownPredicate(NodeTag.IsString, subject, state);
    }
    return true;
}


function emitKnownStringAndPlan(
    plan: StringAndPlan,
    subject: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    const failures: string[] = [];
    pushStringPlanFailures(plan, subject, context, failures);
    if (failures.length !== 0) {
        state.chunks.push(`if(${failures.join("||")})${failStatement(state)}`);
    }
}

/**
 * @brief Execute push string plan failures.
 */
function pushStringPlanFailures(
    plan: StringAndPlan,
    subject: string,
    context: EmitContext,
    failures: string[]
): void {
    if (plan.min !== undefined) {
        failures.push(`${subject}.length<${String(plan.min)}`);
    }
    if (plan.max !== undefined) {
        failures.push(`${subject}.length>${String(plan.max)}`);
    }
    const regexes = plan.regexes;
    for (let index = 0; index < regexes.length; index += 1) {
        const regex = regexes[index];
        if (regex !== undefined) {
            failures.push(`!${regexExpression(subject, regex, context)}`);
        }
    }
}

/**
 * @brief Collapsed string validation facts for one subject node.
 * @details The emitter combines `typeof`, length, and regex checks so one
 * compact guard can replace several individual graph nodes.
 */
interface StringAndPlan {
    readonly value: NodeId;
    readonly min: number | undefined;
    readonly max: number | undefined;
    readonly regexes: readonly RegExp[];
}

/**
 * @brief Collapse string-related graph nodes into one emission plan.
 * @param graph Graph being emitted.
 * @param ids Candidate node ids from a boolean fold.
 * @returns A plan when every node constrains the same subject, otherwise undefined.
 * @details This recognizes the common string hot path and lets codegen emit one
 * straight-line guard rather than bouncing through each predicate node.
 */
function readStringAndPlan(
    graph: Graph,
    ids: readonly NodeId[]
): StringAndPlan | undefined {
    let value: NodeId | undefined;
    let sawString = false;
    let min: number | undefined;
    let max: number | undefined;
    const regexes: RegExp[] = [];
    for (let index = 0; index < ids.length; index += 1) {
        const id = ids[index];
        if (id === undefined) {
            return undefined;
        }
        const node = graph.nodes[id];
        if (node === undefined) {
            return undefined;
        }
        switch (node.tag) {
            case NodeTag.IsString:
                value = readSameStringValue(value, node.value);
                sawString = true;
                break;
            case NodeTag.StringMin:
                value = readSameStringValue(value, node.value);
                min = node.bound;
                break;
            case NodeTag.StringMax:
                value = readSameStringValue(value, node.value);
                max = node.bound;
                break;
            case NodeTag.Regex:
                value = readSameStringValue(value, node.value);
                regexes.push(node.regex);
                break;
            default:
                return undefined;
        }
        if (value === undefined) {
            return undefined;
        }
    }
    if (!sawString || value === undefined) {
        return undefined;
    }
    return {
        value,
        min,
        max,
        regexes
    };
}

/**
 * @brief Maintain the single-subject invariant for string plan folding.
 * @param current Previously observed subject id.
 * @param next Subject id from the next string predicate.
 * @returns The shared subject id, or undefined when predicates target different values.
 */
function readSameStringValue(
    current: NodeId | undefined,
    next: NodeId
): NodeId | undefined {
    return current === undefined || current === next ? next : undefined;
}


function emitNumberAndCheck(
    graph: Graph,
    ids: readonly NodeId[],
    value: string,
    context: EmitContext,
    state: GraphEmitState
): boolean {
    const plan = readNumberAndPlan(graph, ids);
    if (plan === undefined) {
        return false;
    }
    const subject = emitGraphExpression(graph, plan.value, value, context, state);
    const failures: string[] = [];
    if (plan.integer) {
        failures.push(`!Number.isInteger(${subject})`);
        markKnownPredicate(NodeTag.IsNumber, subject, state);
    } else if (!isKnownPredicate(NodeTag.IsNumber, subject, state)) {
        failures.push(`!${finiteNumberExpression(subject, state)}`);
        markKnownPredicate(NodeTag.IsNumber, subject, state);
    }
    if (plan.gte !== undefined) {
        failures.push(`${subject}<${finiteNumberLiteralExpression(plan.gte)}`);
    }
    if (plan.lte !== undefined) {
        failures.push(`${subject}>${finiteNumberLiteralExpression(plan.lte)}`);
    }
    if (failures.length !== 0) {
        state.chunks.push(`if(${failures.join("||")})${failStatement(state)}`);
    }
    return true;
}

/**
 * @brief Collapsed numeric validation facts for one subject node.
 * @details The integer flag implies number-ness; gte/lte bounds are tightened to
 * the strongest known interval before source emission.
 */
interface NumberAndPlan {
    readonly value: NodeId;
    readonly integer: boolean;
    readonly gte: number | undefined;
    readonly lte: number | undefined;
}

/**
 * @brief Collapse numeric graph predicates into one emission plan.
 * @details This helper preserves a code-generation invariant that would be easy to obscure inside the main emitter loop.
 * @param graph Graph being emitted.
 * @param ids Candidate node ids from a boolean fold.
 * @returns A numeric plan when all constraints share one subject.
 */
function readNumberAndPlan(
    graph: Graph,
    ids: readonly NodeId[]
): NumberAndPlan | undefined {
    let value: NodeId | undefined;
    let sawGuard = false;
    let integer = false;
    let gte: number | undefined;
    let lte: number | undefined;
    for (let index = 0; index < ids.length; index += 1) {
        const id = ids[index];
        if (id === undefined) {
            return undefined;
        }
        const node = graph.nodes[id];
        if (node === undefined) {
            return undefined;
        }
        switch (node.tag) {
            case NodeTag.IsNumber:
                value = readSameNumberValue(value, node.value);
                sawGuard = true;
                break;
            case NodeTag.IsInteger:
                value = readSameNumberValue(value, node.value);
                sawGuard = true;
                integer = true;
                break;
            case NodeTag.Gte: {
                const bound = readFiniteNumberConst(graph, node.right);
                if (bound === undefined) {
                    return undefined;
                }
                value = readSameNumberValue(value, node.left);
                gte = gte === undefined || bound > gte ? bound : gte;
                break;
            }
            case NodeTag.Lte: {
                const bound = readFiniteNumberConst(graph, node.right);
                if (bound === undefined) {
                    return undefined;
                }
                value = readSameNumberValue(value, node.left);
                lte = lte === undefined || bound < lte ? bound : lte;
                break;
            }
            default:
                return undefined;
        }
        if (value === undefined) {
            return undefined;
        }
    }
    if (!sawGuard || value === undefined) {
        return undefined;
    }
    return {
        value,
        integer,
        gte,
        lte
    };
}

/**
 * @brief Maintain the single-subject invariant for numeric plan folding.
 * @param current Previously observed numeric subject id.
 * @param next Subject id from the next numeric predicate.
 * @returns The shared subject id, or undefined on subject drift.
 */
function readSameNumberValue(
    current: NodeId | undefined,
    next: NodeId
): NodeId | undefined {
    return current === undefined || current === next ? next : undefined;
}

/**
 * @brief Read a finite numeric bound from a Const node.
 * @details This helper preserves a code-generation invariant that would be easy to obscure inside the main emitter loop.
 * @param graph Graph containing the bound node.
 * @param id Node id expected to reference a numeric constant.
 * @returns Finite numeric value, or undefined for unsupported bounds.
 */
function readFiniteNumberConst(
    graph: Graph,
    id: NodeId
): number | undefined {
    const node = graph.nodes[id];
    return node?.tag === NodeTag.Const &&
        typeof node.value === "number" &&
        Number.isFinite(node.value)
        ? node.value
        : undefined;
}


function finiteNumberLiteralExpression(value: number): string {
    if (Object.is(value, -0)) {
        return "-0";
    }
    return String(value);
}

function nextUnionMaskRun(
    node: UnionDispatchNode,
    start: number,
    mask: number
): number {
    let index = start + 1;
    while (index < node.masks.length && node.masks[index] === mask) {
        index += 1;
    }
    return index;
}

function nextPrimitiveUnionMaskRun(
    node: PrimitiveUnionNode,
    start: number,
    mask: number
): number {
    let index = start + 1;
    while (index < node.masks.length && node.masks[index] === mask) {
        index += 1;
    }
    return index;
}

function primitiveUnionMaskExpression(
    mask: number,
    value: string,
    type: string
): string {
    const parts: string[] = [];
    if ((mask & 1) !== 0) {
        parts.push(`${type}==="string"`);
    }
    if ((mask & 2) !== 0) {
        parts.push(`${type}==="number"`);
    }
    if ((mask & 4) !== 0) {
        parts.push(`${type}==="boolean"`);
    }
    if ((mask & 8) !== 0) {
        parts.push(`${type}==="bigint"`);
    }
    if ((mask & 16) !== 0) {
        parts.push(`${type}==="symbol"`);
    }
    if ((mask & 32) !== 0) {
        parts.push(`${type}==="undefined"`);
    }
    if ((mask & 64) !== 0) {
        parts.push(`${value}===null`);
    }
    if (parts.length === 0) {
        return "false";
    }
    if (parts.length === 7) {
        return "true";
    }
    if (parts.length === 1) {
        return parts[0] ?? "false";
    }
    return `(${parts.join("||")})`;
}

function unionMaskExpression(mask: number, value: string, type: string): string {
    const parts: string[] = [];
    if ((mask & 1) !== 0) {
        parts.push(`${type}==="string"`);
    }
    if ((mask & 2) !== 0) {
        parts.push(`${type}==="number"`);
    }
    if ((mask & 4) !== 0) {
        parts.push(`${type}==="boolean"`);
    }
    if ((mask & 8) !== 0) {
        parts.push(`${type}==="bigint"`);
    }
    if ((mask & 16) !== 0) {
        parts.push(`${type}==="symbol"`);
    }
    if ((mask & 32) !== 0) {
        parts.push(`${type}==="undefined"`);
    }
    if ((mask & 64) !== 0) {
        parts.push(`${value}===null`);
    }
    if ((mask & 128) !== 0) {
        parts.push(`Array.isArray(${value})`);
    }
    if ((mask & 256) !== 0) {
        parts.push(`(${type}==="object"&&${value}!==null&&!Array.isArray(${value}))`);
    }
    if ((mask & 512) !== 0) {
        parts.push(`${type}==="function"`);
    }
    if (parts.length === 0) {
        return "false";
    }
    if (parts.length === 10) {
        return "true";
    }
    if (parts.length === 1) {
        return parts[0] ?? "false";
    }
    return `(${parts.join("||")})`;
}


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
            return unaryPredicateExpression(
                graph,
                node.value,
                NodeTag.IsString,
                value,
                context,
                state,
                (subject) => `(typeof ${subject}==="string")`
            );
        case NodeTag.IsNumber:
            return numberPredicateExpression(
                graph,
                node.value,
                value,
                context,
                state
            );
        case NodeTag.IsBoolean:
            return unaryPredicateExpression(
                graph,
                node.value,
                NodeTag.IsBoolean,
                value,
                context,
                state,
                (subject) => `(typeof ${subject}==="boolean")`
            );
        case NodeTag.IsBigInt:
            return unaryPredicateExpression(
                graph,
                node.value,
                NodeTag.IsBigInt,
                value,
                context,
                state,
                (subject) => `(typeof ${subject}==="bigint")`
            );
        case NodeTag.IsSymbol:
            return unaryPredicateExpression(
                graph,
                node.value,
                NodeTag.IsSymbol,
                value,
                context,
                state,
                (subject) => `(typeof ${subject}==="symbol")`
            );
        case NodeTag.IsObject:
            return unaryPredicateExpression(
                graph,
                node.value,
                NodeTag.IsObject,
                value,
                context,
                state,
                (subject) => `o(${subject})`
            );
        case NodeTag.IsArray:
            return unaryPredicateExpression(
                graph,
                node.value,
                NodeTag.IsArray,
                value,
                context,
                state,
                (subject) => `Array.isArray(${subject})`
            );
        case NodeTag.IsUndefined:
            return unaryPredicateExpression(
                graph,
                node.value,
                NodeTag.IsUndefined,
                value,
                context,
                state,
                (subject) => `(${subject}===undefined)`
            );
        case NodeTag.IsNull:
            return unaryPredicateExpression(
                graph,
                node.value,
                NodeTag.IsNull,
                value,
                context,
                state,
                (subject) => `(${subject}===null)`
            );
        case NodeTag.IsInteger:
            return `Number.isInteger(${emitGraphExpression(graph, node.value, value, context, state)})`;
        case NodeTag.Not:
            return `(${emitGraphExpression(graph, node.value, value, context, state)}!==true)`;
        case NodeTag.Equals:
            return emitEqualsExpression(
                graph,
                node.left,
                node.right,
                value,
                context,
                state
            );
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
            /*
             * Expression-mode code uses compact helpers. `eu` is the present-key
             * variant; `ea` is the dense logical-slot variant.
             */
            return emitArrayEveryExpression(
                emitGraphExpression(graph, node.value, value, context, state),
                node,
                context
            );
        case NodeTag.TupleItems:
            return emitTupleItemsExpression(
                emitGraphExpression(graph, node.value, value, context, state),
                node.itemGraphs,
                context
            );
        case NodeTag.RecordEvery:
            return `er(${emitGraphExpression(graph, node.value, value, context, state)},${emitGraphChildFunction(node.itemGraph, context)})`;
        case NodeTag.DiscriminantDispatch:
            return emitDiscriminantDispatchExpression(
                emitGraphExpression(graph, node.value, value, context, state),
                node,
                context
            );
        case NodeTag.ObjectShape:
            return `${emitObjectShapeFunction(node, context)}(${emitGraphExpression(
                graph,
                node.value,
                value,
                context,
                state
            )})`;
        case NodeTag.UnionDispatch:
            return `${emitUnionDispatchFunction(node, context)}(${emitGraphExpression(
                graph,
                node.value,
                value,
                context,
                state
            )})`;
        case NodeTag.PresenceDispatch:
            return `${emitPresenceDispatchFunction(node, context)}(${emitGraphExpression(
                graph,
                node.value,
                value,
                context,
                state
            )})`;
        case NodeTag.PrimitiveUnion:
            return `${emitPrimitiveUnionFunction(node, context)}(${emitGraphExpression(
                graph,
                node.value,
                value,
                context,
                state
            )})`;
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


function emitObjectShapeFunction(
    node: ObjectShapeNode,
    context: EmitContext
): string {
    const name = `p${String(context.functions.length)}`;
    const source: FunctionSource = {
        name,
        body: ""
    };
    context.functions.push(source);
    source.body = emitObjectShapeBody(node, "v", context);
    return name;
}


function emitObjectShapeBody(
    node: ObjectShapeNode,
    value: string,
    context: EmitContext
): string {
    const state = makeGraphEmitState();
    emitObjectGuard(value, state);
    const emittedStrictKeyCount = emitEarlyStrictKeyCount(
        node,
        value,
        context,
        state
    );
    emitObjectShapeEntries(node, value, context, state);
    emitObjectShapeCatchall(node, value, context, state);
    if (!emittedStrictKeyCount) {
        emitObjectShapeStrictKeys(node, value, context, state);
    }
    state.chunks.push("return true;");
    return state.chunks.join("");
}


function emitObjectShapeCheck(
    graph: Graph,
    node: ObjectShapeNode,
    value: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    const objectExpression = emitGraphExpression(
        graph,
        node.value,
        value,
        context,
        state
    );
    emitObjectGuard(objectExpression, state);
    const emittedStrictKeyCount = emitEarlyStrictKeyCount(
        node,
        objectExpression,
        context,
        state
    );
    emitObjectShapeEntries(node, objectExpression, context, state);
    emitObjectShapeCatchall(node, objectExpression, context, state);
    if (!emittedStrictKeyCount) {
        emitObjectShapeStrictKeys(node, objectExpression, context, state);
    }
}


function emitEarlyStrictKeyCount(
    node: ObjectShapeNode,
    objectExpression: string,
    context: EmitContext,
    state: GraphEmitState
): boolean {
    if (
        node.mode !== ObjectModeTag.Strict ||
        node.catchall !== undefined ||
        !node.allRequired ||
        isUnsafeMode(context)
    ) {
        return false;
    }
    state.chunks.push(
        `if(Object.getOwnPropertyNames(${objectExpression}).length!==${String(node.entries.length)}||Object.getOwnPropertySymbols(${objectExpression}).length!==0)${failStatement(state)}`
    );
    return true;
}

/**
 * @brief Emit catchall validation for undeclared own object keys.
 * @param node Object shape node with optional catchall graph.
 * @param objectExpression JavaScript object expression already proven object.
 * @param context Shared emission context.
 * @param state Mutable graph emitter state.
 */
function emitObjectShapeCatchall(
    node: ObjectShapeNode,
    objectExpression: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    if (node.catchallGraph === undefined) {
        return;
    }
    if (isUnsafeMode(context)) {
        emitUnsafeObjectShapeCatchall(node, objectExpression, context, state);
        return;
    }
    const keys = `xs${String(state.temp)}`;
    state.temp += 1;
    const length = `n${String(state.temp)}`;
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
        `const ${keys}=Reflect.ownKeys(${objectExpression});`,
        `const ${length}=${keys}.length;`,
        `for(let ${index}=0;${index}<${length};${index}+=1){`,
        `const ${key}=${keys}[${index}];`,
        `if(typeof ${key}==="string"&&${keyMembershipExpression(key, node.keys, context)})continue;`,
        `const ${descriptor}=gp(${objectExpression},${key});`,
        `if(${descriptor}===undefined${node.catchall !== undefined && descriptorNeedsValueProof(node.catchall) ? `||!h.call(${descriptor},"value")` : ""})${failStatement(state)}`,
        `const ${itemValue}=${descriptor}.value;`
    );
    emitFalseCheck(
        node.catchallGraph,
        node.catchallGraph.result,
        itemValue,
        context,
        state
    );
    state.chunks.push("}");
}

/**
 * @brief Emit unsafe catchall validation for undeclared own object keys.
 * @param node Object shape node with catchall graph.
 * @param objectExpression JavaScript object expression already proven object.
 * @param context Shared emission context.
 * @param state Mutable graph emitter state.
 */
function emitUnsafeObjectShapeCatchall(
    node: ObjectShapeNode,
    objectExpression: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    if (node.catchallGraph === undefined) {
        return;
    }
    const keys = `xs${String(state.temp)}`;
    state.temp += 1;
    const length = `n${String(state.temp)}`;
    state.temp += 1;
    const index = `i${String(state.temp)}`;
    state.temp += 1;
    const key = `key${String(state.temp)}`;
    state.temp += 1;
    const itemValue = `v${String(state.temp)}`;
    state.temp += 1;
    state.chunks.push(
        `const ${keys}=Reflect.ownKeys(${objectExpression});`,
        `const ${length}=${keys}.length;`,
        `for(let ${index}=0;${index}<${length};${index}+=1){`,
        `const ${key}=${keys}[${index}];`,
        `if(typeof ${key}==="string"&&${unsafeKeyMembershipExpression(key, node.keys)})continue;`,
        `const ${itemValue}=${objectExpression}[${key}];`
    );
    emitFalseCheck(
        node.catchallGraph,
        node.catchallGraph.result,
        itemValue,
        context,
        state
    );
    state.chunks.push("}");
}


function emitObjectShapeEntries(
    node: ObjectShapeNode,
    objectExpression: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    if (isUnsafeMode(context)) {
        emitUnsafeObjectShapeEntries(node, objectExpression, context, state);
        return;
    }
    const entries = context.objectEntryOrder === "graph"
        ? node.entries
        : scheduleObjectShapeEntries(node.entries);
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
            state.chunks.push(failStatement(state));
            continue;
        }
        const cacheKey = dataSlotKey(node.value, entry.key, objectExpression);
        const slot = emitDataSlotForExpression(
            node.value,
            entry.key,
            objectExpression,
            context,
            state
        );
        if (entry.presence === PresenceTag.Optional) {
            state.chunks.push(
                `if(${slot.descriptor}!==undefined){`
            );
            if (descriptorNeedsValueProof(entry.schema)) {
                state.chunks.push(
                    `if(!h.call(${slot.descriptor},"value"))${failStatement(state)}`
                );
            }
            state.dataGuards.add(cacheKey);
            const itemValue = emitDataSlotValue(cacheKey, slot, state);
            emitFalseCheck(entry.graph, entry.graph.result, itemValue, context, state);
            state.chunks.push(`}else if(h.call(${objectExpression},${stringRef(context, entry.key)}))${failStatement(state)}`);
        } else {
            if (!state.dataGuards.has(cacheKey)) {
                state.chunks.push(
                    `if(${slot.descriptor}===undefined${descriptorNeedsValueProof(entry.schema) ? `||!h.call(${slot.descriptor},"value")` : ""})${failStatement(state)}`
                );
                state.dataGuards.add(cacheKey);
            }
            if (isKnownLiteralDataSlot(entry.schema, cacheKey, state)) {
                continue;
            }
            const itemValue = emitDataSlotValue(cacheKey, slot, state);
            emitFalseCheck(entry.graph, entry.graph.result, itemValue, context, state);
        }
    }
}

function emitUnsafeObjectShapeEntries(
    node: ObjectShapeNode,
    objectExpression: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    for (let index = 0; index < node.entries.length; index += 1) {
        const entry = node.entries[index];
        if (entry === undefined) {
            state.chunks.push(failStatement(state));
            continue;
        }
        const keyRef = unsafeStringLiteralExpression(entry.key);
        const itemValue = `v${String(state.temp)}`;
        state.temp += 1;
        const maybeUndefined = schemaCanAcceptUndefined(entry.schema);
        state.chunks.push(
            `const ${itemValue}=${unsafePropertyReadExpression(
                objectExpression,
                entry.key
            )};`
        );
        if (entry.presence === PresenceTag.Optional) {
            const presentBranch = makeBranchEmitState(state);
            emitFalseCheck(
                entry.graph,
                entry.graph.result,
                itemValue,
                context,
                presentBranch
            );
            if (presentBranch.temp > state.temp) {
                state.temp = presentBranch.temp;
            }
            const ownUndefinedBranch = makeBranchEmitState(state);
            emitFalseCheck(
                entry.graph,
                entry.graph.result,
                itemValue,
                context,
                ownUndefinedBranch
            );
            if (ownUndefinedBranch.temp > state.temp) {
                state.temp = ownUndefinedBranch.temp;
            }
            state.chunks.push(
                `if(${itemValue}!==undefined){`,
                ...presentBranch.chunks,
                `}else if(h.call(${objectExpression},${keyRef})){`,
                ...ownUndefinedBranch.chunks,
                "}"
            );
        } else {
            if (maybeUndefined) {
                state.chunks.push(
                    `if(${itemValue}===undefined&&!h.call(${objectExpression},${keyRef}))${failStatement(state)}`
                );
            }
            emitFalseCheck(entry.graph, entry.graph.result, itemValue, context, state);
        }
    }
}


function emitObjectShapeStrictKeys(
    node: ObjectShapeNode,
    objectExpression: string,
    context: EmitContext,
    state: GraphEmitState
): void {
    if (node.mode !== ObjectModeTag.Strict) {
        return;
    }
    if (node.catchall !== undefined) {
        return;
    }
    if (isUncheckedMode(context)) {
        return;
    }
    if (isUnsafeMode(context)) {
        emitUnsafeStrictKeyLoop(objectExpression, node.keys, state);
        return;
    }
    if (node.allRequired) {
        state.chunks.push(
            `if(Object.getOwnPropertyNames(${objectExpression}).length!==${String(node.entries.length)}||Object.getOwnPropertySymbols(${objectExpression}).length!==0)${failStatement(state)}`
        );
        return;
    }
    const present = `xs${String(state.temp)}`;
    state.temp += 1;
    const length = `n${String(state.temp)}`;
    state.temp += 1;
    const index = `i${String(state.temp)}`;
    state.temp += 1;
    const key = `key${String(state.temp)}`;
    state.temp += 1;
    state.chunks.push(
        `const ${present}=Reflect.ownKeys(${objectExpression});`,
        `const ${length}=${present}.length;`,
        `for(let ${index}=0;${index}<${length};${index}+=1){`,
        `const ${key}=${present}[${index}];`,
        `if(typeof ${key}!=="string"||!${keyMembershipExpression(key, node.keys, context)})${failStatement(state)}`,
        "}"
    );
}


function emitUnsafeStrictKeyLoop(
    objectExpression: string,
    keys: readonly string[],
    state: GraphEmitState
): void {
    const key = `key${String(state.temp)}`;
    state.temp += 1;
    state.chunks.push(
        `for(const ${key} in ${objectExpression}){`,
        `if(h.call(${objectExpression},${key})&&!${unsafeKeyMembershipExpression(key, keys)})${failStatement(state)}`,
        "}"
    );
}


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


function emitEqualsExpression(
    graph: Graph,
    left: NodeId,
    right: NodeId,
    value: string,
    context: EmitContext,
    state: GraphEmitState | undefined
): string {
    const leftNode = graph.nodes[left];
    const rightNode = graph.nodes[right];
    if (rightNode?.tag === NodeTag.Const) {
        return literalEqualsExpression(
            emitGraphExpression(graph, left, value, context, state),
            rightNode.value,
            context
        );
    }
    if (leftNode?.tag === NodeTag.Const) {
        return literalEqualsExpression(
            emitGraphExpression(graph, right, value, context, state),
            leftNode.value,
            context
        );
    }
    return `Object.is(${emitGraphExpression(
        graph,
        left,
        value,
        context,
        state
    )},${emitGraphExpression(graph, right, value, context, state)})`;
}


function literalEqualsExpression(
    subject: string,
    literal: LiteralValue,
    context: EmitContext
): string {
    if (literal === null) {
        return `(${subject}===null)`;
    }
    if (literal === undefined) {
        return `(${subject}===undefined)`;
    }
    switch (typeof literal) {
        case "string":
        case "boolean":
        case "bigint":
        case "symbol":
            return `(${subject}===${literalExpression(literal, context)})`;
        case "number":
            if (Number.isNaN(literal)) {
                return `Number.isNaN(${subject})`;
            }
            if (Object.is(literal, 0) || Object.is(literal, -0)) {
                return `Object.is(${subject},${literalExpression(literal, context)})`;
            }
            return `(${subject}===${literalExpression(literal, context)})`;
        default:
            return "false";
    }
}

function emitDataSlotForExpression(
    object: NodeId,
    key: string,
    objectExpression: string,
    context: EmitContext,
    state: GraphEmitState
): DataSlot {
    const cacheKey = dataSlotKey(object, key, objectExpression);
    const cached = state.dataSlots.get(cacheKey);
    if (cached !== undefined) {
        return cached;
    }
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


function emitDataValueSlot(
    graph: Graph,
    object: NodeId,
    key: string,
    value: string,
    context: EmitContext,
    state: GraphEmitState
): string {
    const objectExpression = emitGraphExpression(
        graph,
        object,
        value,
        context,
        state
    );
    const cacheKey = dataSlotKey(object, key, objectExpression);
    const slot = emitDataSlotForExpression(
        object,
        key,
        objectExpression,
        context,
        state
    );
    return emitDataSlotValue(cacheKey, slot, state);
}

function emitDataSlotValue(
    cacheKey: string,
    slot: DataSlot,
    state: GraphEmitState
): string {
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

function seedDataSlot(
    state: GraphEmitState,
    object: NodeId,
    key: string,
    objectExpression: string,
    descriptor: string,
    value: string | undefined,
    literal: LiteralValue | undefined
): void {
    const cacheKey = dataSlotKey(object, key, objectExpression);
    state.dataSlots.set(cacheKey, {
        descriptor,
        value
    });
    state.dataGuards.add(cacheKey);
    if (literal !== undefined) {
        state.dataLiterals.set(cacheKey, literal);
    }
}


function emitHasDataCheck(
    graph: Graph,
    object: NodeId,
    key: string,
    value: string,
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
    const cacheKey = dataSlotKey(object, key, objectExpression);
    const slot = emitDataSlotForExpression(
        object,
        key,
        objectExpression,
        context,
        state
    );
    state.chunks.push(
        `if(${slot.descriptor}===undefined||!h.call(${slot.descriptor},"value"))${failStatement(state)}`
    );
    state.dataGuards.add(cacheKey);
}

/**
 * @brief Emit an expression that tests for an own data descriptor.
 * @param graph Graph being emitted.
 * @param object Node id for the object expression.
 * @param key Property key being checked.
 * @param value Root input expression.
 * @param context Shared compile context.
 * @param state Emitter state receiving descriptor cache entries.
 * @returns JavaScript expression that is true only for own data slots.
 */
function hasDataExpression(
    graph: Graph,
    object: NodeId,
    key: string,
    value: string,
    context: EmitContext,
    state: GraphEmitState
): string {
    const objectExpression = emitGraphExpression(
        graph,
        object,
        value,
        context,
        state
    );
    const slot = emitDataSlotForExpression(
        object,
        key,
        objectExpression,
        context,
        state
    );
    return `(${slot.descriptor}!==undefined&&h.call(${slot.descriptor},"value"))`;
}


function unaryPredicateExpression(
    graph: Graph,
    subjectId: NodeId,
    tag: number,
    value: string,
    context: EmitContext,
    state: GraphEmitState | undefined,
    emit: (subject: string) => string
): string {
    const subject = emitGraphExpression(graph, subjectId, value, context, state);
    if (state !== undefined && isKnownPredicate(tag, subject, state)) {
        return "true";
    }
    return emit(subject);
}


function numberPredicateExpression(
    graph: Graph,
    subjectId: NodeId,
    value: string,
    context: EmitContext,
    state: GraphEmitState | undefined
): string {
    const subject = emitGraphExpression(graph, subjectId, value, context, state);
    if (state !== undefined && isKnownPredicate(NodeTag.IsNumber, subject, state)) {
        return "true";
    }
    return finiteNumberExpression(subject, state);
}


function emitNumberGuard(value: string, state: GraphEmitState): void {
    if (isKnownPredicate(NodeTag.IsNumber, value, state)) {
        return;
    }
    state.chunks.push(`if(!${finiteNumberExpression(value, state)})${failStatement(state)}`);
    markKnownPredicate(NodeTag.IsNumber, value, state);
    markKnownTypeof("number", value, state);
}


function emitPredicateGuard(
    tag: number,
    value: string,
    state: GraphEmitState
): void {
    if (isKnownPredicate(tag, value, state)) {
        return;
    }
    const expression = unaryPredicateCheckExpression(tag, value);
    state.chunks.push(`if(!${expression})${failStatement(state)}`);
    markKnownPredicate(tag, value, state);
}


function unaryPredicateCheckExpression(tag: number, value: string): string {
    switch (tag) {
        case NodeTag.IsString:
            return `(typeof ${value}==="string")`;
        case NodeTag.IsBoolean:
            return `(typeof ${value}==="boolean")`;
        case NodeTag.IsBigInt:
            return `(typeof ${value}==="bigint")`;
        case NodeTag.IsSymbol:
            return `(typeof ${value}==="symbol")`;
        case NodeTag.IsArray:
            return `Array.isArray(${value})`;
        case NodeTag.IsUndefined:
            return `(${value}===undefined)`;
        case NodeTag.IsNull:
            return `(${value}===null)`;
        default:
            return "false";
    }
}

/**
 * @brief Check whether a predicate node is already proven in this branch.
 * @param graph Graph being emitted.
 * @param node Candidate predicate node.
 * @param value Root input expression.
 * @param context Shared compile context.
 * @param state Current branch state.
 * @returns True when the node can be skipped.
 */
function isKnownPredicateNode(
    graph: Graph,
    node: Graph["nodes"][number] | undefined,
    value: string,
    context: EmitContext,
    state: GraphEmitState
): boolean {
    if (node === undefined || !isKnownPredicateTag(node.tag)) {
        return false;
    }
    const subject = "value" in node &&
        typeof node.value === "number"
        ? emitGraphExpression(graph, node.value, value, context, state)
        : undefined;
    return subject !== undefined && isKnownPredicate(node.tag, subject, state);
}


function markUnionMaskRefinement(
    mask: number,
    value: string,
    state: GraphEmitState
): void {
    switch (mask) {
        case 1:
            markKnownPredicate(NodeTag.IsString, value, state);
            return;
        case 2:
            markKnownTypeof("number", value, state);
            return;
        case 4:
            markKnownPredicate(NodeTag.IsBoolean, value, state);
            return;
        case 8:
            markKnownPredicate(NodeTag.IsBigInt, value, state);
            return;
        case 16:
            markKnownPredicate(NodeTag.IsSymbol, value, state);
            return;
        case 32:
            markKnownPredicate(NodeTag.IsUndefined, value, state);
            return;
        case 64:
            markKnownPredicate(NodeTag.IsNull, value, state);
            return;
        case 128:
            markKnownPredicate(NodeTag.IsArray, value, state);
            return;
        case 256:
            markKnownPredicate(NodeTag.IsObject, value, state);
            return;
        default:
            return;
    }
}


function markKnownPredicate(
    tag: number,
    value: string,
    state: GraphEmitState
): void {
    state.knownPredicates.add(predicateKey(tag, value));
    markKnownPredicateTypeof(tag, value, state);
    if (tag === NodeTag.IsObject) {
        markKnownObject(value, state);
    }
}

/**
 * @brief Query the branch fact table for a proven predicate.
 * @param tag Predicate node tag.
 * @param value JavaScript subject expression.
 * @param state Current branch state.
 * @returns True when equivalent emitted code already proved the predicate.
 */
function isKnownPredicate(
    tag: number,
    value: string,
    state: GraphEmitState
): boolean {
    return state.knownPredicates.has(predicateKey(tag, value)) ||
        (tag === NodeTag.IsObject && isKnownObject(value, state));
}

/**
 * @brief Test whether a node tag can participate in predicate fact tracking.
 * @param tag Candidate NodeTag value.
 * @returns True for primitive/object/array/null/undefined predicate tags.
 */
function isKnownPredicateTag(tag: number): boolean {
    return tag === NodeTag.IsString ||
        tag === NodeTag.IsNumber ||
        tag === NodeTag.IsBoolean ||
        tag === NodeTag.IsBigInt ||
        tag === NodeTag.IsSymbol ||
        tag === NodeTag.IsObject ||
        tag === NodeTag.IsArray ||
        tag === NodeTag.IsUndefined ||
        tag === NodeTag.IsNull;
}


function predicateKey(tag: number, value: string): string {
    return `${String(tag)}:${value}`;
}


function markKnownPredicateTypeof(
    tag: number,
    value: string,
    state: GraphEmitState
): void {
    switch (tag) {
        case NodeTag.IsString:
            markKnownTypeof("string", value, state);
            return;
        case NodeTag.IsNumber:
            markKnownTypeof("number", value, state);
            return;
        case NodeTag.IsBoolean:
            markKnownTypeof("boolean", value, state);
            return;
        case NodeTag.IsBigInt:
            markKnownTypeof("bigint", value, state);
            return;
        case NodeTag.IsSymbol:
            markKnownTypeof("symbol", value, state);
            return;
        case NodeTag.IsUndefined:
            markKnownTypeof("undefined", value, state);
            return;
        default:
            return;
    }
}


function markKnownTypeof(
    type: string,
    value: string,
    state: GraphEmitState
): void {
    state.knownTypeofs.add(typeofKey(type, value));
}

/**
 * @brief Query branch facts for a proven typeof result.
 * @param type Expected typeof string.
 * @param value JavaScript subject expression.
 * @param state Optional branch state.
 * @returns True when the typeof test is already known in this branch.
 */
function isKnownTypeof(
    type: string,
    value: string,
    state: GraphEmitState | undefined
): boolean {
    return state?.knownTypeofs.has(typeofKey(type, value)) === true;
}


function typeofKey(type: string, value: string): string {
    return `${type}:${value}`;
}

function dataSlotKey(object: NodeId, key: string, objectExpression: string): string {
    return `${String(object)}:${key}:${objectExpression}`;
}

/**
 * @brief Check whether a cached data slot already proved a literal value.
 * @param schema Literal schema being emitted.
 * @param cacheKey Descriptor cache key for the property slot.
 * @param state Current branch state.
 * @returns True when a previous descriptor read established the same literal.
 */
function isKnownLiteralDataSlot(
    schema: Schema,
    cacheKey: string,
    state: GraphEmitState
): boolean {
    if (!state.dataLiterals.has(cacheKey) || schema.tag !== SchemaTag.Literal) {
        return false;
    }
    return Object.is(state.dataLiterals.get(cacheKey), schema.value);
}


function emitArrayGuard(value: string, state: GraphEmitState): void {
    if (isKnownPredicate(NodeTag.IsArray, value, state)) {
        return;
    }
    state.chunks.push(`if(!Array.isArray(${value}))${failStatement(state)}`);
    markKnownPredicate(NodeTag.IsArray, value, state);
}


function emitObjectGuard(value: string, state: GraphEmitState): void {
    const statement = objectGuardStatement(value, state);
    if (statement.length !== 0) {
        state.chunks.push(statement);
    }
}

/**
 * @brief Build the object guard statement for a subject expression.
 * @param value JavaScript subject expression.
 * @param state Current branch state.
 * @returns Empty string when object-ness is already known, otherwise a guard.
 */
function objectGuardStatement(value: string, state: GraphEmitState): string {
    if (isKnownObject(value, state)) {
        return "";
    }
    markKnownObject(value, state);
    return `if(${objectRejectExpression(value)})${failStatement(state)}`;
}

/**
 * @brief Build the object rejection predicate used by generated graph checks.
 */
function objectRejectExpression(value: string): string {
    return `typeof ${value}!=="object"||${value}===null||Array.isArray(${value})`;
}

/**
 * @brief Reuse SSA-like locals and alias only compound subject expressions.
 * @details Sea-of-Nodes lowering often hands codegen an existing local. Reusing
 * that identifier keeps the generated predicate closer to V8's preferred SSA
 * shape; only compound expressions need a one-shot alias.
 */
function emitSubjectAlias(expression: string, state: GraphEmitState): string {
    if (isGeneratedIdentifier(expression)) {
        return expression;
    }
    const subject = `u${String(state.temp)}`;
    state.temp += 1;
    state.chunks.push(`const ${subject}=${expression};`);
    return subject;
}

/**
 * @brief Decide whether an expression can be reused without a temporary alias.
 * @param value JavaScript expression text.
 * @returns True when the expression is a simple generated identifier.
 */
function isGeneratedIdentifier(value: string): boolean {
    if (value.length === 0) {
        return false;
    }
    const first = value.charCodeAt(0);
    if (!isIdentifierStart(first)) {
        return false;
    }
    for (let index = 1; index < value.length; index += 1) {
        if (!isIdentifierPart(value.charCodeAt(index))) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Validate the first character of an emitter-owned identifier.
 * @param code UTF-16 code unit.
 * @returns True for `$`, `_`, or ASCII letters.
 */
function isIdentifierStart(code: number): boolean {
    return code === 36 ||
        code === 95 ||
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122);
}

/**
 * @brief Validate a non-leading character of an emitter-owned identifier.
 * @param code UTF-16 code unit.
 * @returns True for identifier-start characters or ASCII digits.
 */
function isIdentifierPart(code: number): boolean {
    return isIdentifierStart(code) || (code >= 48 && code <= 57);
}


function failStatement(state: GraphEmitState): string {
    return state.failureStatement ?? "return false;";
}


function readGraphResultBoolean(graph: Graph): boolean | undefined {
    const result = graph.nodes[graph.result];
    if (result?.tag !== NodeTag.Return) {
        return undefined;
    }
    const value = graph.nodes[result.value];
    if (value?.tag === NodeTag.Const && typeof value.value === "boolean") {
        return value.value;
    }
    return undefined;
}

/**
 * @brief Decide whether a descriptor must be proven to be a data slot.
 * @details If the child schema statically rejects `undefined`, accessor
 * descriptors may flow as `undefined` into the child validator and fail without
 * executing the getter. Schemas that can accept `undefined` still need the
 * explicit data-property proof.
 * @param schema Child schema receiving the descriptor value.
 * @returns True when `hasOwnProperty(descriptor, "value")` is required.
 */
function descriptorNeedsValueProof(schema: Schema): boolean {
    return !schemaMustRejectUndefined(schema);
}

/**
 * @brief Check whether a union presence key rejects accessor-as-undefined.
 * @details Presence dispatch only skips the data-property proof when the branch
 * schema itself contains a required key that statically rejects `undefined`.
 * @param schema Union branch schema.
 * @param key Presence key used to gate the branch.
 * @returns True when the child branch will reject an accessor descriptor value.
 */
function branchKeyMustRejectUndefined(
    schema: Schema | undefined,
    key: string
): boolean {
    if (schema === undefined) {
        return false;
    }
    switch (schema.tag) {
        case SchemaTag.Object:
            return objectRequiredKeyMustRejectUndefined(schema.entries, key);
        case SchemaTag.Intersection:
            return branchKeyMustRejectUndefined(schema.left, key) ||
                branchKeyMustRejectUndefined(schema.right, key);
        case SchemaTag.Brand:
        case SchemaTag.Nullable:
        case SchemaTag.Refine:
        case SchemaTag.Metadata:
        case SchemaTag.Message:
        case SchemaTag.KeyedObject:
        case SchemaTag.PropertyCount:
        case SchemaTag.PropertyNames:
        case SchemaTag.PatternProperties:
            return branchKeyMustRejectUndefined(schema.inner, key);
        default:
            return false;
    }
}

/**
 * @brief Inspect one object shape for a required undefined-rejecting key.
 * @param entries Object entries in source order.
 * @param key Required key being inspected.
 * @returns True when the matching required entry rejects `undefined`.
 */
function objectRequiredKeyMustRejectUndefined(
    entries: readonly {
        readonly key: string;
        readonly schema: Schema;
        readonly presence: number;
    }[],
    key: string
): boolean {
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry?.key === key &&
            entry.presence === PresenceTag.Required) {
            return schemaMustRejectUndefined(entry.schema);
        }
    }
    return false;
}


function markKnownObject(value: string, state: GraphEmitState): void {
    state.knownObjects.add(value);
}

/**
 * @brief Query branch facts for a proven plain object guard.
 * @param value JavaScript subject expression.
 * @param state Current branch state.
 * @returns True when object guard emission can be skipped.
 */
function isKnownObject(value: string, state: GraphEmitState): boolean {
    return state.knownObjects.has(value);
}

/**
 * @brief Resolve a child graph's local parameter without assuming node ids.
 * @details Parameter discovery is kept local to graph emission so child graphs can be inlined without assuming a global node id.
 */
function findParamNode(graph: Graph): NodeId | undefined {
    for (let index = 0; index < graph.nodes.length; index += 1) {
        const node = graph.nodes[index];
        if (node?.tag === NodeTag.Param) {
            return node.id;
        }
    }
    return undefined;
}

/**
 * @brief Check whether every required object key already has a data guard.
 * @param object Object node id.
 * @param keys Required property keys.
 * @param objectExpression JavaScript object expression.
 * @param state Current branch state.
 * @returns True when strict object emission can reuse existing descriptor guards.
 */
function hasAllRequiredKeys(
    object: NodeId,
    keys: readonly string[],
    objectExpression: string,
    state: GraphEmitState
): boolean {
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined ||
            !state.dataGuards.has(dataSlotKey(object, key, objectExpression))) {
            return false;
        }
    }
    return true;
}


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
 * @brief Build inline key membership checks for unsafe literal keys.
 */
function unsafeKeyMembershipExpression(
    key: string,
    keys: readonly string[]
): string {
    if (keys.length === 0) {
        return "false";
    }
    const parts = new Array<string>(keys.length);
    for (let index = 0; index < keys.length; index += 1) {
        const value = keys[index];
        parts[index] = value === undefined
            ? "false"
            : `${key}===${unsafeStringLiteralExpression(value)}`;
    }
    return `(${parts.join("||")})`;
}

/**
 * @brief Build a direct property read for unsafe and unchecked modes.
 */
function unsafePropertyReadExpression(
    objectExpression: string,
    key: string
): string {
    if (isAsciiIdentifierName(key)) {
        return `${objectExpression}.${key}`;
    }
    return `${objectExpression}[${unsafeStringLiteralExpression(key)}]`;
}

/**
 * @brief Check ascii identifier name.
 */
function isAsciiIdentifierName(value: string): boolean {
    return /^[A-Za-z_$][0-9A-Za-z_$]*$/u.test(value);
}

/**
 * @brief Escape a string literal for direct insertion into generated source.
 */
function unsafeStringLiteralExpression(value: string): string {
    return JSON.stringify(value)
        .replace(/\u2028/gu, "\\u2028")
        .replace(/\u2029/gu, "\\u2029");
}


function finiteNumberExpression(
    value: string,
    state: GraphEmitState | undefined
): string {
    if (isKnownTypeof("number", value, state)) {
        return `Number.isFinite(${value})`;
    }
    return `(typeof ${value}==="number"&&Number.isFinite(${value}))`;
}


function regexExpression(
    value: string,
    regex: RegExp,
    context: EmitContext
): string {
    const index = pushRegex(context, regex);
    const ref = `r[${String(index)}]`;
    if (!regexNeedsLastIndexReset(regex)) {
        return `${ref}.test(${value})`;
    }
    return `((${ref}.lastIndex=0),${ref}.test(${value}))`;
}

/**
 * @brief Detect regular expressions whose stateful flags require lastIndex reset.
 */
function regexNeedsLastIndexReset(regex: RegExp): boolean {
    return regex.global || regex.sticky;
}

/**
 * @brief Emit compact expression-mode array iteration.
 * @param value Generated expression for the candidate array.
 * @param node ArrayEvery node with sparse-slot and length metadata.
 * @param context Shared code-generation context.
 * @returns Boolean JavaScript expression for array iteration.
 */
function emitArrayEveryExpression(
    value: string,
    node: ArrayEveryNode,
    context: EmitContext
): string {
    const loop = schemaCanAcceptUndefined(node.item)
        ? `eu(${value},${emitGraphChildFunction(node.itemGraph, context)})`
        : `ea(${value},${emitGraphChildFunction(node.itemGraph, context)})`;
    const lengthParts = arrayLengthPredicateParts(value, node.checks);
    if (lengthParts.length === 0) {
        return loop;
    }
    return `(${lengthParts.join("&&")}&&${loop})`;
}

/**
 * @brief Build expression-mode array length predicates.
 * @param value Generated expression for the candidate array.
 * @param checks Normalized length check vector.
 * @returns Predicate fragments guarding safe `.length` access.
 */
function arrayLengthPredicateParts(
    value: string,
    checks: readonly ArrayCheck[]
): string[] {
    if (checks.length === 0) {
        return [];
    }
    const parts: string[] = [`Array.isArray(${value})`];
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            parts.push("false");
            continue;
        }
        switch (check.tag) {
            case ArrayCheckTag.Min:
                parts.push(`${value}.length>=${String(check.value)}`);
                break;
            case ArrayCheckTag.Max:
                parts.push(`${value}.length<=${String(check.value)}`);
                break;
        }
    }
    return parts;
}


function emitTupleItemsExpression(
    value: string,
    itemGraphs: readonly Graph[],
    context: EmitContext
): string {
    const parts: string[] = [
        `Array.isArray(${value})`,
        `${value}.length===${String(itemGraphs.length)}`
    ];
    for (let index = 0; index < itemGraphs.length; index += 1) {
        const itemGraph = itemGraphs[index];
        if (itemGraph !== undefined) {
            parts.push(`ev(${value},${String(index)},${emitGraphChildFunction(itemGraph, context)})`);
        }
    }
    return `(${parts.join("&&")})`;
}


function emitDiscriminantDispatchExpression(
    value: string,
    node: DiscriminantDispatchNode,
    context: EmitContext
): string {
    const functions: string[] = [];
    for (let index = 0; index < node.graphs.length; index += 1) {
        const graph = node.graphs[index];
        if (graph !== undefined) {
            functions.push(emitGraphChildFunction(graph, context));
        }
    }
    const keyset = `k[${String(pushKeyset(context, node.literals))}]`;
    if (functions.length === 0) {
        return `dj(${value},${stringRef(context, node.key)},${keyset})`;
    }
    return `dj(${value},${stringRef(context, node.key)},${keyset},${functions.join(",")})`;
}


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
