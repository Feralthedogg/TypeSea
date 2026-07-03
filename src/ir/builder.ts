/**
 * @file builder.ts
 * @brief Dense graph builder with structural node interning.
 */

import { NodeTag } from "../kind/index.js";
import type { LiteralValue, Schema } from "../schema/index.js";
import { freezeGraph } from "./freeze.js";
import { isPlainRegExp } from "./regexp.js";
import type {
  ArrayEveryNode,
  BooleanFoldNode,
  ConstNode,
  EqualsNode,
  GetPropNode,
  Graph,
  GraphNode,
  HasOwnNode,
  NodeId,
  NumericCompareNode,
  ParamNode,
  RegexNode,
  ReturnNode,
  SchemaCheckNode,
  StartNode,
  StrictKeysNode,
  StringBoundNode,
  UnaryPredicateNode
} from "./types.js";

/**
 * @brief graph builder.
 * @details Owns its state directly; methods expose receiver checks and explicit result flow.
 * @invariant Construction leaves the instance in a fully usable state before it escapes.
 */
export class GraphBuilder {
  private readonly nodes: GraphNode[];
  private readonly hash: Map<string, NodeId>;

  /**
   * @brief constructor.
     * @post The receiver is initialized according to the class invariant before it can be observed.
   */
  public constructor() {
    this.nodes = [];
    this.hash = new Map<string, NodeId>();
  }

  /**
   * @brief start.
       */
  public start(): NodeId {
    return this.intern("start", (id: NodeId): StartNode => ({
      id,
      tag: NodeTag.Start,
      deps: []
    }));
  }

  /**
   * @brief param.
         */
  public param(name: string): NodeId {
    return this.intern(`param:${name}`, (id: NodeId): ParamNode => ({
      id,
      tag: NodeTag.Param,
      deps: [],
      name
    }));
  }

  /**
   * @brief constant.
         */
  public constant(value: LiteralValue): NodeId {
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

  /**
   * @brief get prop.
           */
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

  /**
   * @brief is string.
         */
  public isString(value: NodeId): NodeId {
    return this.unary(NodeTag.IsString, value);
  }

  /**
   * @brief is number.
         */
  public isNumber(value: NodeId): NodeId {
    return this.unary(NodeTag.IsNumber, value);
  }

  /**
   * @brief is boolean.
         */
  public isBoolean(value: NodeId): NodeId {
    return this.unary(NodeTag.IsBoolean, value);
  }

  /**
   * @brief is big int.
         */
  public isBigInt(value: NodeId): NodeId {
    return this.unary(NodeTag.IsBigInt, value);
  }

  /**
   * @brief is symbol.
         */
  public isSymbol(value: NodeId): NodeId {
    return this.unary(NodeTag.IsSymbol, value);
  }

  /**
   * @brief is object.
         */
  public isObject(value: NodeId): NodeId {
    return this.unary(NodeTag.IsObject, value);
  }

  /**
   * @brief is array.
         */
  public isArray(value: NodeId): NodeId {
    return this.unary(NodeTag.IsArray, value);
  }

  /**
   * @brief is undefined.
         */
  public isUndefined(value: NodeId): NodeId {
    return this.unary(NodeTag.IsUndefined, value);
  }

  /**
   * @brief is null.
         */
  public isNull(value: NodeId): NodeId {
    return this.unary(NodeTag.IsNull, value);
  }

  /**
   * @brief is integer.
         */
  public isInteger(value: NodeId): NodeId {
    return this.unary(NodeTag.IsInteger, value);
  }

  /**
   * @brief not.
         */
  public not(value: NodeId): NodeId {
    return this.unary(NodeTag.Not, value);
  }

  /**
   * @brief equals.
           */
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

  /**
   * @brief gte.
           */
  public gte(left: NodeId, right: NodeId): NodeId {
    return this.numeric(NodeTag.Gte, left, right);
  }

  /**
   * @brief lte.
           */
  public lte(left: NodeId, right: NodeId): NodeId {
    return this.numeric(NodeTag.Lte, left, right);
  }

  /**
   * @brief string min.
           */
  public stringMin(value: NodeId, bound: number): NodeId {
    return this.stringBound(NodeTag.StringMin, value, bound);
  }

  /**
   * @brief string max.
           */
  public stringMax(value: NodeId, bound: number): NodeId {
    return this.stringBound(NodeTag.StringMax, value, bound);
  }

  /**
   * @brief regex.
             */
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

  /**
   * @brief has own.
           */
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

  /**
   * @brief strict keys.
           */
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

  /**
   * @brief array every.
           */
  public arrayEvery(value: NodeId, item: Schema): NodeId {
    return this.push((id: NodeId): ArrayEveryNode => ({
      id,
      tag: NodeTag.ArrayEvery,
      deps: [value],
      value,
      item
    }));
  }

  /**
   * @brief schema check.
           */
  public schemaCheck(value: NodeId, schema: Schema): NodeId {
    return this.push((id: NodeId): SchemaCheckNode => ({
      id,
      tag: NodeTag.SchemaCheck,
      deps: [value],
      value,
      schema
    }));
  }

  /**
   * @brief and.
         */
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

  /**
   * @brief or.
         */
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

  /**
   * @brief ret.
           */
  public ret(control: NodeId, value: NodeId): NodeId {
    return this.push((id: NodeId): ReturnNode => ({
      id,
      tag: NodeTag.Return,
      deps: [control, value],
      control,
      value
    }));
  }

  /**
   * @brief finish.
           */
  public finish(entry: NodeId, result: NodeId): Graph {
    return freezeGraph({
      nodes: this.nodes.slice(),
      entry,
      result
    });
  }

  /**
   * @brief unary.
           */
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

  /**
   * @brief numeric.
             */
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

  /**
   * @brief string bound.
             */
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

  /**
   * @brief intern.
           */
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

  /**
   * @brief push.
         */
  private push(make: (id: NodeId) => GraphNode): NodeId {
    const id = this.nodes.length;
    const node = make(id);
    this.nodes.push(node);
    return id;
  }
}

/**
 * @brief make regex intern key.
 * @details Encodes each string segment with its byte-length-independent character length before concatenation.
 * @returns Collision-resistant intern key for one regex predicate identity.
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
 * @brief length prefixed.
 * @details Preserves string tuple boundaries without allocating wrapper arrays or nested maps.
 * @returns Encoded string segment suitable for intern table keys.
 */
function lengthPrefixed(value: string): string {
  return `${String(value.length)}:${value};`;
}

/**
 * @brief literal key.
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
