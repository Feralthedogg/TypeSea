/**
 * @file builder.ts
 * @brief Dense graph builder with structural node interning.
 * @details IR helpers preserve Sea-of-Nodes invariants before graphs cross optimizer,
 * compiler, or public introspection boundaries.
 */

import { NodeTag, PresenceTag, type ObjectModeTag } from "../kind/index.js";
import type { ArrayCheck, LiteralValue, Schema } from "../schema/index.js";
import { freezeGraph } from "./freeze.js";
import { isPlainRegExp } from "./regexp.js";
import type {
    ArrayEveryNode,
    BooleanFoldNode,
    ConstNode,
    DiscriminantDispatchLookup,
    DiscriminantDispatchNode,
    EqualsNode,
    GetPropNode,
    Graph,
    GraphNode,
    HasOwnDataNode,
    HasOwnNode,
    NodeId,
    ObjectShapeEntry,
    ObjectShapeNode,
    NumericCompareNode,
    ParamNode,
    PrimitiveUnionNode,
    RecordEveryNode,
    RegexNode,
    ReturnNode,
    SchemaCheckNode,
    StartNode,
    StrictKeysNode,
    StringBoundNode,
    TupleItemsNode,
    UnionDispatchMask,
    UnionDispatchNode,
    UnaryPredicateNode
} from "./types.js";

/**
 * @brief Dense Sea-of-Nodes graph construction arena.
 * @details The builder interns pure scalar nodes so later optimization passes see
 * one canonical id for equivalent predicates. Composite nodes are deliberately
 * appended instead: their embedded child graphs and schema payloads are owned
 * values, and pointer-level interning would make aliasing harder to audit.
 */
export class GraphBuilder {
    private readonly nodes: GraphNode[];
    private readonly hash: Map<string, NodeId>;

    public constructor() {
        this.nodes = [];
        this.hash = new Map<string, NodeId>();
    }

    public start(): NodeId {
        return this.intern("start", (id: NodeId): StartNode => ({
            id,
            tag: NodeTag.Start,
            deps: []
        }));
    }

    public param(name: string): NodeId {
        return this.intern(`param:${name}`, (id: NodeId): ParamNode => ({
            id,
            tag: NodeTag.Param,
            deps: [],
            name
        }));
    }

    public constant(value: LiteralValue): NodeId {
        /* Symbols are identity values; interning them by text would be unsound. */
        if (typeof value === "symbol") {
            return this.push((id: NodeId): ConstNode => ({
                id,
                tag: NodeTag.Const,
                deps: [],
                value
            }));
        }
        const key = `const:${literalKey(value)}`;
        return this.intern(key, (id: NodeId): ConstNode => ({
            id,
            tag: NodeTag.Const,
            deps: [],
            value
        }));
    }

    public getProp(object: NodeId, key: string): NodeId {
        const hashKey = `getProp:${String(object)}:${key}`;
        return this.intern(hashKey, (id: NodeId): GetPropNode => ({
            id,
            tag: NodeTag.GetProp,
            deps: [object],
            object,
            key
        }));
    }

    public isString(value: NodeId): NodeId {
        return this.unary(NodeTag.IsString, value);
    }

    public isNumber(value: NodeId): NodeId {
        return this.unary(NodeTag.IsNumber, value);
    }

    public isBoolean(value: NodeId): NodeId {
        return this.unary(NodeTag.IsBoolean, value);
    }

    public isBigInt(value: NodeId): NodeId {
        return this.unary(NodeTag.IsBigInt, value);
    }

    public isSymbol(value: NodeId): NodeId {
        return this.unary(NodeTag.IsSymbol, value);
    }

    public isObject(value: NodeId): NodeId {
        return this.unary(NodeTag.IsObject, value);
    }

    public isArray(value: NodeId): NodeId {
        return this.unary(NodeTag.IsArray, value);
    }

    public isUndefined(value: NodeId): NodeId {
        return this.unary(NodeTag.IsUndefined, value);
    }

    public isNull(value: NodeId): NodeId {
        return this.unary(NodeTag.IsNull, value);
    }

    public isInteger(value: NodeId): NodeId {
        return this.unary(NodeTag.IsInteger, value);
    }

    public not(value: NodeId): NodeId {
        return this.unary(NodeTag.Not, value);
    }

    public equals(left: NodeId, right: NodeId): NodeId {
        const key = `eq:${String(left)}:${String(right)}`;
        return this.intern(key, (id: NodeId): EqualsNode => ({
            id,
            tag: NodeTag.Equals,
            deps: [left, right],
            left,
            right
        }));
    }

    public gte(left: NodeId, right: NodeId): NodeId {
        return this.numeric(NodeTag.Gte, left, right);
    }

    public lte(left: NodeId, right: NodeId): NodeId {
        return this.numeric(NodeTag.Lte, left, right);
    }

    public stringMin(value: NodeId, bound: number): NodeId {
        return this.stringBound(NodeTag.StringMin, value, bound);
    }

    public stringMax(value: NodeId, bound: number): NodeId {
        return this.stringBound(NodeTag.StringMax, value, bound);
    }

    public regex(value: NodeId, regex: RegExp, name: string): NodeId {
        if (!isPlainRegExp(regex)) {
            throw new TypeError("regex node must use a plain RegExp");
        }
        if (typeof name !== "string") {
            throw new TypeError("regex node name must be a string");
        }
        const key = makeRegexInternKey(value, regex.source, regex.flags, name);
        return this.intern(key, (id: NodeId): RegexNode => ({
            id,
            tag: NodeTag.Regex,
            deps: [value],
            value,
            regex,
            name
        }));
    }

    public hasOwn(object: NodeId, key: string): NodeId {
        const hashKey = `hasOwn:${String(object)}:${key}`;
        return this.intern(hashKey, (id: NodeId): HasOwnNode => ({
            id,
            tag: NodeTag.HasOwn,
            deps: [object],
            object,
            key
        }));
    }

    public hasOwnData(object: NodeId, key: string): NodeId {
        const hashKey = `hasOwnData:${String(object)}:${key}`;
        return this.intern(hashKey, (id: NodeId): HasOwnDataNode => ({
            id,
            tag: NodeTag.HasOwnData,
            deps: [object],
            object,
            key
        }));
    }

    public strictKeys(object: NodeId, keys: readonly string[]): NodeId {
        const hashKey = `strictKeys:${String(object)}:${JSON.stringify(keys)}`;
        return this.intern(hashKey, (id: NodeId): StrictKeysNode => ({
            id,
            tag: NodeTag.StrictKeys,
            deps: [object],
            object,
            keys
        }));
    }

    public arrayEvery(
        value: NodeId,
        item: Schema,
        checks: readonly ArrayCheck[],
        itemGraph: Graph
    ): NodeId {
        return this.push((id: NodeId): ArrayEveryNode => ({
            id,
            tag: NodeTag.ArrayEvery,
            deps: [value],
            value,
            item,
            checks,
            itemGraph
        }));
    }

    public tupleItems(
        value: NodeId,
        items: readonly Schema[],
        itemGraphs: readonly Graph[]
    ): NodeId {
        return this.push((id: NodeId): TupleItemsNode => ({
            id,
            tag: NodeTag.TupleItems,
            deps: [value],
            value,
            items,
            itemGraphs
        }));
    }

    public recordEvery(value: NodeId, item: Schema, itemGraph: Graph): NodeId {
        return this.push((id: NodeId): RecordEveryNode => ({
            id,
            tag: NodeTag.RecordEvery,
            deps: [value],
            value,
            item,
            itemGraph
        }));
    }

    public discriminantDispatch(
        value: NodeId,
        key: string,
        literals: readonly string[],
        schemas: readonly Schema[],
        graphs: readonly Graph[]
    ): NodeId {
        return this.push((id: NodeId): DiscriminantDispatchNode => ({
            id,
            tag: NodeTag.DiscriminantDispatch,
            deps: [value],
            value,
            key,
            literals,
            schemas,
            graphs,
            lookup: makeDiscriminantLookup(literals)
        }));
    }

    public objectShape(
        value: NodeId,
        entries: readonly ObjectShapeEntry[],
        keys: readonly string[],
        mode: ObjectModeTag,
        catchall: Schema | undefined,
        catchallGraph: Graph | undefined
    ): NodeId {
        return this.push((id: NodeId): ObjectShapeNode => ({
            id,
            tag: NodeTag.ObjectShape,
            deps: [value],
            value,
            entries,
            keys,
            mode,
            catchall,
            catchallGraph,
            allRequired: objectShapeAllRequired(entries)
        }));
    }

    public unionDispatch(
        value: NodeId,
        options: readonly Schema[],
        graphs: readonly Graph[],
        masks: readonly UnionDispatchMask[]
    ): NodeId {
        return this.push((id: NodeId): UnionDispatchNode => ({
            id,
            tag: NodeTag.UnionDispatch,
            deps: [value],
            value,
            options,
            graphs,
            masks
        }));
    }

    public primitiveUnion(
        value: NodeId,
        graphs: readonly Graph[],
        masks: readonly UnionDispatchMask[]
    ): NodeId {
        return this.push((id: NodeId): PrimitiveUnionNode => ({
            id,
            tag: NodeTag.PrimitiveUnion,
            deps: [value],
            value,
            graphs,
            masks
        }));
    }

    public schemaCheck(value: NodeId, schema: Schema): NodeId {
        return this.push((id: NodeId): SchemaCheckNode => ({
            id,
            tag: NodeTag.SchemaCheck,
            deps: [value],
            value,
            schema
        }));
    }

    public and(values: readonly NodeId[]): NodeId {
        const first = values[0];
        if (first === undefined) {
            return this.constant(true);
        }
        if (values.length === 1) {
            return first;
        }
        const key = `and:${values.join(",")}`;
        return this.intern(key, (id: NodeId): BooleanFoldNode => ({
            id,
            tag: NodeTag.And,
            deps: values,
            values
        }));
    }

    public or(values: readonly NodeId[]): NodeId {
        const first = values[0];
        if (first === undefined) {
            return this.constant(false);
        }
        if (values.length === 1) {
            return first;
        }
        const key = `or:${values.join(",")}`;
        return this.intern(key, (id: NodeId): BooleanFoldNode => ({
            id,
            tag: NodeTag.Or,
            deps: values,
            values
        }));
    }

    public ret(control: NodeId, value: NodeId): NodeId {
        return this.push((id: NodeId): ReturnNode => ({
            id,
            tag: NodeTag.Return,
            deps: [control, value],
            control,
            value
        }));
    }

    public finish(entry: NodeId, result: NodeId): Graph {
        return freezeGraph({
            nodes: this.nodes.slice(),
            entry,
            result
        });
    }

    private unary(
        tag: UnaryPredicateNode["tag"],
        value: NodeId
    ): NodeId {
        const key = `unary:${String(tag)}:${String(value)}`;
        return this.intern(key, (id: NodeId): UnaryPredicateNode => ({
            id,
            tag,
            deps: [value],
            value
        }));
    }

    private numeric(
        tag: NumericCompareNode["tag"],
        left: NodeId,
        right: NodeId
    ): NodeId {
        const key = `numeric:${String(tag)}:${String(left)}:${String(right)}`;
        return this.intern(key, (id: NodeId): NumericCompareNode => ({
            id,
            tag,
            deps: [left, right],
            left,
            right
        }));
    }

    private stringBound(
        tag: StringBoundNode["tag"],
        value: NodeId,
        bound: number
    ): NodeId {
        const key = `stringBound:${String(tag)}:${String(value)}:${String(bound)}`;
        return this.intern(key, (id: NodeId): StringBoundNode => ({
            id,
            tag,
            deps: [value],
            value,
            bound
        }));
    }

    private intern(
        key: string,
        make: (id: NodeId) => GraphNode
    ): NodeId {
        const cached = this.hash.get(key);
        if (cached !== undefined) {
            return cached;
        }
        const id = this.nodes.length;
        const node = make(id);
        this.nodes.push(node);
        this.hash.set(key, id);
        return id;
    }

    private push(make: (id: NodeId) => GraphNode): NodeId {
        const id = this.nodes.length;
        const node = make(id);
        this.nodes.push(node);
        return id;
    }
}

/**
 * @brief Execute object shape all required.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
function objectShapeAllRequired(entries: readonly ObjectShapeEntry[]): boolean {
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry?.presence !== PresenceTag.Required) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Build an intern key without letting adjacent regex fields merge.
 * @details Source, flags, and diagnostic name are all user-controlled strings;
 * length prefixes keep `["ab", "c"]` distinct from `["a", "bc"]` without
 * allocating wrapper tuples in the hot builder path.
 */
function makeRegexInternKey(
    value: NodeId,
    source: string,
    flags: string,
    name: string
): string {
    return `regex:${String(value)}:${lengthPrefixed(source)}${lengthPrefixed(flags)}${lengthPrefixed(name)}`;
}

/**
 * @brief Encode one string segment for a flat composite key.
 * @details IR helpers preserve Sea-of-Nodes invariants before graphs cross optimizer,
 * compiler, or public introspection boundaries.
 */
function lengthPrefixed(value: string): string {
    return `${String(value.length)}:${value};`;
}

/**
 * @brief Execute literal key.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
function literalKey(value: LiteralValue): string {
    if (value === null) {
        return "null";
    }
    const valueType = typeof value;
    if (valueType === "string") {
        return `string:${String(value)}`;
    }
    if (valueType === "number") {
        if (Object.is(value, -0)) {
            return "number:-0";
        }
        if (Number.isNaN(value)) {
            return "number:nan";
        }
        return `number:${String(value)}`;
    }
    if (valueType === "bigint") {
        return `bigint:${String(value)}`;
    }
    if (valueType === "boolean") {
        return `boolean:${String(value)}`;
    }
    return "undefined";
}

/**
 * @brief Build discriminant lookup.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
function makeDiscriminantLookup(
    literals: readonly string[]
): DiscriminantDispatchLookup {
    const lookup = Object.create(null) as Record<string, number>;
    for (let index = 0; index < literals.length; index += 1) {
        const literal = literals[index];
        if (literal !== undefined) {
            lookup[literal] = index;
        }
    }
    return Object.freeze(lookup);
}
