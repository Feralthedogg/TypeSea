/**
 * @file freeze.ts
 * @brief Immutable graph finalization.
 * @details IR helpers preserve Sea-of-Nodes invariants before graphs cross optimizer,
 * compiler, or public introspection boundaries.
 */

import { NodeTag } from "../kind/index.js";
import { freezeSchema } from "../schema/index.js";
import { isPlainRegExp } from "./regexp.js";
import type { Graph, GraphNode, RegexNode } from "./types.js";

/**
 * @brief freeze graph.
 * @details IR helpers preserve Sea-of-Nodes invariants before graphs cross optimizer,
 * compiler, or public introspection boundaries.
 */
export function freezeGraph(graph: Graph): Graph {
    for (let index = 0; index < graph.nodes.length; index += 1) {
        const node = graph.nodes[index];
        if (node !== undefined) {
            freezeGraphNode(node);
        }
    }
    Object.freeze(graph.nodes);
    return Object.freeze(graph);
}

/**
 * @brief freeze graph node.
 * @details IR helpers preserve Sea-of-Nodes invariants before graphs cross optimizer,
 * compiler, or public introspection boundaries.
 */
function freezeGraphNode(node: GraphNode): void {
    Object.freeze(node.deps);
    switch (node.tag) {
        case NodeTag.StrictKeys:
            Object.freeze(node.keys);
            break;
        case NodeTag.Regex:
            freezeRegexNode(node);
            break;
        case NodeTag.ArrayEvery:
            freezeSchema(node.item);
            Object.freeze(node.checks);
            freezeGraph(node.itemGraph);
            break;
        case NodeTag.TupleItems:
            for (let index = 0; index < node.items.length; index += 1) {
                const item = node.items[index];
                if (item !== undefined) {
                    freezeSchema(item);
                }
                const graph = node.itemGraphs[index];
                if (graph !== undefined) {
                    freezeGraph(graph);
                }
            }
            Object.freeze(node.items);
            Object.freeze(node.itemGraphs);
            break;
        case NodeTag.RecordEvery:
            freezeSchema(node.item);
            freezeGraph(node.itemGraph);
            break;
        case NodeTag.DiscriminantDispatch:
            Object.freeze(node.literals);
            for (let index = 0; index < node.schemas.length; index += 1) {
                const schema = node.schemas[index];
                if (schema !== undefined) {
                    freezeSchema(schema);
                }
                const graph = node.graphs[index];
                if (graph !== undefined) {
                    freezeGraph(graph);
                }
            }
            Object.freeze(node.schemas);
            Object.freeze(node.graphs);
            Object.freeze(node.lookup);
            break;
        case NodeTag.ObjectShape:
            for (let index = 0; index < node.entries.length; index += 1) {
                const entry = node.entries[index];
                if (entry !== undefined) {
                    freezeSchema(entry.schema);
                    freezeGraph(entry.graph);
                    Object.freeze(entry);
                }
            }
            if (node.catchall !== undefined) {
                freezeSchema(node.catchall);
            }
            if (node.catchallGraph !== undefined) {
                freezeGraph(node.catchallGraph);
            }
            Object.freeze(node.entries);
            Object.freeze(node.keys);
            break;
        case NodeTag.UnionDispatch:
        case NodeTag.PresenceDispatch:
            for (let index = 0; index < node.options.length; index += 1) {
                const schema = node.options[index];
                if (schema !== undefined) {
                    freezeSchema(schema);
                }
                const graph = node.graphs[index];
                if (graph !== undefined) {
                    freezeGraph(graph);
                }
            }
            if (node.tag === NodeTag.PresenceDispatch) {
                Object.freeze(node.keys);
            }
            Object.freeze(node.options);
            Object.freeze(node.graphs);
            Object.freeze(node.masks);
            break;
        case NodeTag.PrimitiveUnion:
            for (let index = 0; index < node.graphs.length; index += 1) {
                const graph = node.graphs[index];
                if (graph !== undefined) {
                    freezeGraph(graph);
                }
            }
            Object.freeze(node.graphs);
            Object.freeze(node.masks);
            break;
        case NodeTag.SchemaCheck:
            freezeSchema(node.schema);
            break;
        case NodeTag.And:
        case NodeTag.Or:
            Object.freeze(node.values);
            break;
        default:
            break;
    }
    Object.freeze(node);
}

/**
 * @brief freeze regex node.
 * @details IR helpers preserve Sea-of-Nodes invariants before graphs cross optimizer,
 * compiler, or public introspection boundaries.
 */
function freezeRegexNode(node: RegexNode): void {
    const regex = node.regex;
    if (!isPlainRegExp(regex)) {
        throw new TypeError("regex node must use a plain RegExp");
    }
    if (Object.isFrozen(node)) {
        if (Object.isExtensible(regex)) {
            throw new TypeError("frozen regex node must contain a non-extensible RegExp");
        }
        return;
    }
    if (!Object.isExtensible(regex)) {
        return;
    }
    Object.defineProperty(node, "regex", {
        configurable: false,
        enumerable: true,
        value: cloneGraphRegExp(regex),
        writable: false
    });
}

/**
 * @brief clone graph reg exp.
 * @details IR helpers preserve Sea-of-Nodes invariants before graphs cross optimizer,
 * compiler, or public introspection boundaries.
 */
function cloneGraphRegExp(regex: RegExp): RegExp {
    const cloned = new RegExp(regex.source, regex.flags);
    Object.preventExtensions(cloned);
    return cloned;
}
