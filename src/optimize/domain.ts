/**
 * @file domain.ts
 * @brief Validation-domain specialization for dispatch child graphs.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 */

import { NodeTag } from "../kind/index.js";
import type {
    BooleanFoldNode,
    Graph,
    GraphNode,
    NodeId,
    ObjectShapeEntry
} from "../ir/index.js";
import type { LiteralValue } from "../schema/index.js";
import { compactReachable } from "./compact.js";
import { peepholeGraph } from "./peephole.js";
import { foldConstants } from "./fold.js";
import { ensureConst, keep, replace, type FoldResult } from "./fold-common.js";
import { resolveAlias, rewriteNodeDeps } from "./rewrite.js";

const DomainMask = {
    String: 1 << 0,
    Number: 1 << 1,
    Boolean: 1 << 2,
    BigInt: 1 << 3,
    Symbol: 1 << 4,
    Undefined: 1 << 5,
    Null: 1 << 6,
    Array: 1 << 7,
    Object: 1 << 8,
    Function: 1 << 9
} as const;

/**
 * @brief Node shape that carries a single validated value edge.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 */
interface ValueNode {
    readonly value: NodeId;
}

/**
 * @brief Node shape that carries the numeric left operand used by bounds checks.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 */
interface NumericNode {
    readonly left: NodeId;
}

/**
 * @brief Container guard implied by an iteration node over the same value.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 */
interface IterationDomain {
    readonly value: NodeId;
    readonly guard: typeof NodeTag.IsArray | typeof NodeTag.IsObject;
}

/**
 * @brief Specialize nested validation graphs with domain knowledge.
 * @details Dispatch nodes already know the primitive domain of each child arm.
 * This pass pushes that fact into child graphs so redundant type checks collapse.
 * @param graph Root graph to specialize.
 * @returns The original graph when no node changed, otherwise a rewritten graph.
 */
export function specializeDomains(graph: Graph): Graph {
    let changed = false;
    const nodes = new Array<GraphNode>(graph.nodes.length);

    for (let index = 0; index < graph.nodes.length; index += 1) {
        const node = graph.nodes[index];
        if (node === undefined) {
            continue;
        }
        const specialized = specializeChildDomains(node, graph.nodes);
        nodes[index] = specialized;
        changed = changed || specialized !== node;
    }

    if (!changed) {
        return graph;
    }
    return {
        nodes,
        entry: graph.entry,
        result: graph.result
    };
}

/**
 * @brief Execute specialize child domains.
 * @details Optimizer helpers preserve graph equivalence while reducing redundant validation work.
 */
function specializeChildDomains(
    node: GraphNode,
    nodes: readonly GraphNode[]
): GraphNode {
    switch (node.tag) {
        case NodeTag.And:
            return specializeIterationDomains(node, nodes);
        case NodeTag.ArrayEvery: {
            const itemGraph = specializeDomains(node.itemGraph);
            if (itemGraph === node.itemGraph) {
                return node;
            }
            return {
                ...node,
                itemGraph
            };
        }
        case NodeTag.TupleItems: {
            const itemGraphs = specializeGraphArray(node.itemGraphs);
            if (itemGraphs === node.itemGraphs) {
                return node;
            }
            return {
                ...node,
                itemGraphs
            };
        }
        case NodeTag.RecordEvery: {
            const itemGraph = specializeDomains(node.itemGraph);
            if (itemGraph === node.itemGraph) {
                return node;
            }
            return {
                ...node,
                itemGraph
            };
        }
        case NodeTag.DiscriminantDispatch: {
            const graphs = specializeGraphArray(node.graphs);
            if (graphs === node.graphs) {
                return node;
            }
            return {
                ...node,
                graphs
            };
        }
        case NodeTag.ObjectShape: {
            const entries = specializeObjectShapeEntries(node.entries);
            const catchallGraph = node.catchallGraph === undefined
                ? undefined
                : specializeDomains(node.catchallGraph);
            if (entries === node.entries && catchallGraph === node.catchallGraph) {
                return node;
            }
            return {
                ...node,
                entries,
                catchallGraph
            };
        }
        case NodeTag.UnionDispatch: {
            const graphs = specializeGraphsForMasks(node.graphs, node.masks);
            if (graphs === node.graphs) {
                return node;
            }
            return {
                ...node,
                graphs
            };
        }
        case NodeTag.PresenceDispatch: {
            const graphs = specializeGraphsForMasks(node.graphs, node.masks);
            if (graphs === node.graphs) {
                return node;
            }
            return {
                ...node,
                graphs
            };
        }
        case NodeTag.PrimitiveUnion: {
            const graphs = specializeGraphsForMasks(node.graphs, node.masks);
            if (graphs === node.graphs) {
                return node;
            }
            return {
                ...node,
                graphs
            };
        }
        default:
            return node;
    }
}

/**
 * @brief Remove container guards already proven by iteration nodes.
 * @details `ArrayEvery(x)` implies `IsArray(x)` and `RecordEvery(x)` implies
 * `IsObject(x)`. Removing the sibling guard keeps the IR closer to the code
 * that will be emitted.
 * @param node Boolean fold node whose operands may contain container domains.
 * @param nodes Graph node table used to inspect operands.
 * @returns Rewritten boolean node, or the original node when nothing changed.
 */
function specializeIterationDomains(
    node: BooleanFoldNode,
    nodes: readonly GraphNode[]
): GraphNode {
    const domains = collectIterationDomains(node.values, nodes);
    if (domains.length === 0) {
        return node;
    }

    let changed = false;
    const values: NodeId[] = [];
    for (let index = 0; index < node.values.length; index += 1) {
        const value = node.values[index];
        if (value === undefined) {
            changed = true;
            continue;
        }
        if (isIterationDomainGuard(value, nodes, domains)) {
            /*
             * The iterator node performs the same container guard before it can
             * enter its child graph, so keeping this sibling check is redundant.
             */
            changed = true;
            continue;
        }
        values.push(value);
    }

    if (!changed) {
        return node;
    }
    return {
        id: node.id,
        tag: node.tag,
        deps: values,
        values
    };
}

/**
 * @brief Collect domains implied by iteration nodes inside one boolean fold.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param values Operand ids from an And/Or-like fold.
 * @param nodes Graph node table used to inspect operands.
 * @returns Iteration domains visible from the operand list.
 */
function collectIterationDomains(
    values: readonly NodeId[],
    nodes: readonly GraphNode[]
): readonly IterationDomain[] {
    const domains: IterationDomain[] = [];
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value === undefined) {
            continue;
        }
        const node = nodes[value];
        if (node === undefined) {
            continue;
        }
        const domain = readIterationDomain(node);
        if (domain !== undefined) {
            domains.push(domain);
        }
    }
    return domains;
}

/**
 * @brief Test whether a boolean operand is redundant due to an iteration domain.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param value Candidate guard node id.
 * @param nodes Graph node table used to inspect the candidate.
 * @param domains Domains collected from sibling iteration nodes.
 * @returns True when the candidate guard repeats a sibling iterator guard.
 */
function isIterationDomainGuard(
    value: NodeId,
    nodes: readonly GraphNode[],
    domains: readonly IterationDomain[]
): boolean {
    const node = nodes[value];
    if (node === undefined || !isContainerGuardNode(node)) {
        return false;
    }
    for (let index = 0; index < domains.length; index += 1) {
        const domain = domains[index];
        if (domain?.guard === node.tag && domain.value === node.value) {
            return true;
        }
    }
    return false;
}

/**
 * @brief Read the guard implied by an iteration node.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param node Candidate graph node.
 * @returns Array/Object guard implied by the node, or undefined.
 */
function readIterationDomain(node: GraphNode): IterationDomain | undefined {
    switch (node.tag) {
        case NodeTag.ArrayEvery:
        case NodeTag.TupleItems:
            return {
                value: node.value,
                guard: NodeTag.IsArray
            };
        case NodeTag.RecordEvery:
            return {
                value: node.value,
                guard: NodeTag.IsObject
            };
        default:
            return undefined;
    }
}

/**
 * @brief Test whether a node is a plain container guard over one value edge.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param node Candidate graph node.
 * @returns True for array/object guard nodes.
 */
function isContainerGuardNode(
    node: GraphNode
): node is GraphNode & ValueNode & {
    readonly tag: typeof NodeTag.IsArray | typeof NodeTag.IsObject;
} {
    return node.tag === NodeTag.IsArray || node.tag === NodeTag.IsObject;
}

/**
 * @brief Recursively specialize every graph in a closed graph list.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param graphs Child graph list.
 * @returns Original list when no child changed, otherwise a rewritten list.
 */
function specializeGraphArray(graphs: readonly Graph[]): readonly Graph[] {
    let changed = false;
    const specialized = new Array<Graph>(graphs.length);
    for (let index = 0; index < graphs.length; index += 1) {
        const graph = graphs[index];
        if (graph === undefined) {
            continue;
        }
        const next = specializeDomains(graph);
        specialized[index] = next;
        changed = changed || next !== graph;
    }
    return changed ? specialized : graphs;
}

/**
 * @brief Specialize child graphs using the dispatch mask assigned to each arm.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param graphs Child graph list.
 * @param masks Primitive-domain mask per graph.
 * @returns Original list when no child changed, otherwise a rewritten list.
 */
function specializeGraphsForMasks(
    graphs: readonly Graph[],
    masks: readonly number[]
): readonly Graph[] {
    let changed = false;
    const specialized = new Array<Graph>(graphs.length);
    for (let index = 0; index < graphs.length; index += 1) {
        const graph = graphs[index];
        const mask = masks[index];
        if (graph === undefined || mask === undefined) {
            continue;
        }
        /*
         * Domain specialization can expose constants, so run the light cleanup
         * stack immediately before the child graph is stored back.
         */
        const child = optimizeGraphForMask(specializeDomains(graph), mask);
        specialized[index] = child;
        changed = changed || child !== graph;
    }
    return changed ? specialized : graphs;
}

/**
 * @brief Specialize object-shape entry graphs without touching entry metadata.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param entries Object-shape entries.
 * @returns Original entry list when no graph changed, otherwise a rewritten list.
 */
function specializeObjectShapeEntries(
    entries: readonly ObjectShapeEntry[]
): readonly ObjectShapeEntry[] {
    let changed = false;
    const specialized = new Array<ObjectShapeEntry>(entries.length);
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
            continue;
        }
        const graph = specializeDomains(entry.graph);
        if (graph === entry.graph) {
            specialized[index] = entry;
            continue;
        }
        changed = true;
        specialized[index] = {
            key: entry.key,
            schema: entry.schema,
            graph,
            presence: entry.presence
        };
    }
    return changed ? specialized : entries;
}

/**
 * @brief Specialize and clean a graph for one known primitive-domain mask.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param graph Child graph to specialize.
 * @param mask Primitive-domain mask proven by the dispatch parent.
 * @returns Optimized graph for the narrowed domain.
 */
function optimizeGraphForMask(graph: Graph, mask: number): Graph {
    const specialized = specializeGraphForMask(graph, mask);
    if (specialized === graph) {
        return graph;
    }
    return compactReachable(peepholeGraph(foldConstants(specialized)));
}

/**
 * @brief Rewrite one graph under a known input-domain mask.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param graph Graph whose root parameter has the supplied mask.
 * @param mask Primitive-domain mask for the graph parameter.
 * @returns Original graph when no node changed, otherwise a rewritten graph.
 */
function specializeGraphForMask(graph: Graph, mask: number): Graph {
    const originalLength = graph.nodes.length;
    const nodes = graph.nodes.slice();
    const aliases = new Array<NodeId>(nodes.length);
    let changed = false;
    for (let index = 0; index < aliases.length; index += 1) {
        aliases[index] = index;
    }

    for (let index = 0; index < originalLength; index += 1) {
        const node = nodes[index];
        if (node === undefined) {
            continue;
        }
        const rewritten = rewriteNodeDeps(node, aliases);
        const result = specializeNodeForMask(rewritten, nodes, aliases, mask);
        nodes[index] = result.node;
        if (result.replacement !== undefined) {
            /*
             * Replacements are recorded as aliases first. A final rewrite pass
             * then updates every dependency after the alias forest has settled.
             */
            aliases[index] = result.replacement;
            changed = true;
        }
        changed = changed || result.node !== rewritten;
    }

    if (!changed) {
        return graph;
    }

    for (let index = 0; index < aliases.length; index += 1) {
        aliases[index] = resolveAlias(index, aliases);
    }

    const rewritten = new Array<GraphNode>(nodes.length);
    for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        if (node !== undefined) {
            rewritten[index] = rewriteNodeDeps(node, aliases);
        }
    }

    return {
        nodes: rewritten,
        entry: resolveAlias(graph.entry, aliases),
        result: resolveAlias(graph.result, aliases)
    };
}

/**
 * @brief Specialize a single graph node against a primitive-domain mask.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param node Node with dependencies already rewritten through current aliases.
 * @param nodes Mutable graph node table used for constants.
 * @param aliases Alias table updated by replacement folds.
 * @param mask Primitive-domain mask proven for the root parameter.
 * @returns Fold decision for the node.
 */
function specializeNodeForMask(
    node: GraphNode,
    nodes: GraphNode[],
    aliases: NodeId[],
    mask: number
): FoldResult {
    switch (node.tag) {
        case NodeTag.IsString:
            return specializeUnaryType(node, nodes, aliases, mask, DomainMask.String);
        case NodeTag.IsBoolean:
            return specializeUnaryType(node, nodes, aliases, mask, DomainMask.Boolean);
        case NodeTag.IsBigInt:
            return specializeUnaryType(node, nodes, aliases, mask, DomainMask.BigInt);
        case NodeTag.IsSymbol:
            return specializeUnaryType(node, nodes, aliases, mask, DomainMask.Symbol);
        case NodeTag.IsUndefined:
            return specializeUnaryType(node, nodes, aliases, mask, DomainMask.Undefined);
        case NodeTag.IsNull:
            return specializeUnaryType(node, nodes, aliases, mask, DomainMask.Null);
        case NodeTag.IsArray:
            return specializeUnaryType(node, nodes, aliases, mask, DomainMask.Array);
        case NodeTag.IsObject:
            return specializeUnaryType(node, nodes, aliases, mask, DomainMask.Object);
        case NodeTag.IsNumber:
        case NodeTag.IsInteger:
            return specializeNumericType(node, nodes, aliases, mask);
        case NodeTag.StringMin:
        case NodeTag.StringMax:
        case NodeTag.Regex:
            return specializeStringDomain(node, nodes, aliases, mask);
        case NodeTag.Gte:
        case NodeTag.Lte:
            return specializeNumericDomain(node, nodes, aliases, mask);
        case NodeTag.Equals:
            return specializeEqualityDomain(node, nodes, aliases, mask);
        case NodeTag.ArrayEvery:
        case NodeTag.TupleItems:
            return specializeValueDomain(node, nodes, aliases, mask, DomainMask.Array);
        case NodeTag.RecordEvery:
        case NodeTag.ObjectShape:
        case NodeTag.DiscriminantDispatch:
        case NodeTag.PresenceDispatch:
        case NodeTag.StrictKeys:
            return specializeValueDomain(node, nodes, aliases, mask, DomainMask.Object);
        default:
            return keep(node);
    }
}

/**
 * @brief Specialize a unary type guard.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param node Guard node whose value edge may point at the root parameter.
 * @param nodes Mutable graph node table used for constants.
 * @param aliases Alias table updated by replacement folds.
 * @param mask Primitive-domain mask proven for the root parameter.
 * @param bit Domain bit represented by the guard.
 * @returns Constant true/false when the mask proves the answer, otherwise keep.
 */
function specializeUnaryType(
    node: GraphNode & ValueNode,
    nodes: GraphNode[],
    aliases: NodeId[],
    mask: number,
    bit: number
): FoldResult {
    if (!isParamNode(nodes, node.value)) {
        return keep(node);
    }
    if ((mask & bit) === 0) {
        /*
         * The parent dispatch has excluded this type, so the guard is statically
         * false inside this arm.
         */
        return replace(node, ensureConst(nodes, aliases, false));
    }
    if (mask === bit) {
        /*
         * The arm contains only this type, so the guard is statically true and
         * later boolean folding can remove it.
         */
        return replace(node, ensureConst(nodes, aliases, true));
    }
    return keep(node);
}

/**
 * @brief Specialize number and integer guards.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param node Numeric guard node.
 * @param nodes Mutable graph node table used for constants.
 * @param aliases Alias table updated by replacement folds.
 * @param mask Primitive-domain mask proven for the root parameter.
 * @returns Constant false when number is excluded, otherwise keep.
 */
function specializeNumericType(
    node: GraphNode & ValueNode,
    nodes: GraphNode[],
    aliases: NodeId[],
    mask: number
): FoldResult {
    if (isParamNode(nodes, node.value) && (mask & DomainMask.Number) === 0) {
        return replace(node, ensureConst(nodes, aliases, false));
    }
    return keep(node);
}

/**
 * @brief Specialize string-only scalar checks.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param node String check node.
 * @param nodes Mutable graph node table used for constants.
 * @param aliases Alias table updated by replacement folds.
 * @param mask Primitive-domain mask proven for the root parameter.
 * @returns Constant false when string is excluded, otherwise keep.
 */
function specializeStringDomain(
    node: GraphNode & ValueNode,
    nodes: GraphNode[],
    aliases: NodeId[],
    mask: number
): FoldResult {
    if (isParamNode(nodes, node.value) && (mask & DomainMask.String) === 0) {
        return replace(node, ensureConst(nodes, aliases, false));
    }
    return keep(node);
}

/**
 * @brief Specialize numeric bound checks.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param node Numeric bound node.
 * @param nodes Mutable graph node table used for constants.
 * @param aliases Alias table updated by replacement folds.
 * @param mask Primitive-domain mask proven for the root parameter.
 * @returns Constant false when number is excluded, otherwise keep.
 */
function specializeNumericDomain(
    node: GraphNode & NumericNode,
    nodes: GraphNode[],
    aliases: NodeId[],
    mask: number
): FoldResult {
    if (isParamNode(nodes, node.left) && (mask & DomainMask.Number) === 0) {
        return replace(node, ensureConst(nodes, aliases, false));
    }
    return keep(node);
}

/**
 * @brief Specialize equality checks against a known primitive domain.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param node Equality node.
 * @param nodes Mutable graph node table used for constants.
 * @param aliases Alias table updated by replacement folds.
 * @param mask Primitive-domain mask proven for the root parameter.
 * @returns Constant false when the literal cannot belong to the domain.
 */
function specializeEqualityDomain(
    node: Extract<GraphNode, { readonly tag: typeof NodeTag.Equals }>,
    nodes: GraphNode[],
    aliases: NodeId[],
    mask: number
): FoldResult {
    const left = nodes[node.left];
    const right = nodes[node.right];
    if (left?.tag === NodeTag.Param && right?.tag === NodeTag.Const &&
        (mask & literalMask(right.value)) === 0) {
        return replace(node, ensureConst(nodes, aliases, false));
    }
    if (right?.tag === NodeTag.Param && left?.tag === NodeTag.Const &&
        (mask & literalMask(left.value)) === 0) {
        return replace(node, ensureConst(nodes, aliases, false));
    }
    return keep(node);
}

/**
 * @brief Specialize container-value nodes against a known primitive domain.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param node Node that may carry a `value` edge.
 * @param nodes Mutable graph node table used for constants.
 * @param aliases Alias table updated by replacement folds.
 * @param mask Primitive-domain mask proven for the root parameter.
 * @param bit Container domain bit required by the node.
 * @returns Constant false when the container type is excluded, otherwise keep.
 */
function specializeValueDomain(
    node: GraphNode,
    nodes: GraphNode[],
    aliases: NodeId[],
    mask: number,
    bit: number
): FoldResult {
    if (!("value" in node) || typeof node.value !== "number") {
        return keep(node);
    }
    if (isParamNode(nodes, node.value) && (mask & bit) === 0) {
        return replace(node, ensureConst(nodes, aliases, false));
    }
    return keep(node);
}

/**
 * @brief Test whether a node id names the root graph parameter.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param nodes Graph node table.
 * @param id Candidate node id.
 * @returns True when the id points at a Param node.
 */
function isParamNode(nodes: readonly GraphNode[], id: NodeId): boolean {
    return nodes[id]?.tag === NodeTag.Param;
}

/**
 * @brief Convert a literal value into its primitive-domain mask bit.
 * @details Optimizer helpers preserve graph equivalence while shrinking redundant nodes
 * before code generation consumes the graph.
 * @param value Literal value carried by an Equals node.
 * @returns Domain mask bit for the literal's runtime type.
 */
function literalMask(value: LiteralValue): number {
    if (value === null) {
        return DomainMask.Null;
    }
    switch (typeof value) {
        case "string":
            return DomainMask.String;
        case "number":
            return DomainMask.Number;
        case "boolean":
            return DomainMask.Boolean;
        case "bigint":
            return DomainMask.BigInt;
        case "symbol":
            return DomainMask.Symbol;
        case "undefined":
            return DomainMask.Undefined;
    }
}
