/**
 * @file builder.ts
 * @brief Dense graph builder with structural node interning.
 */

import { NodeTag } from "../kind/index.js";
import type { IssueCode, PathSegment } from "../issue/index.js";
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
  IssueNode,
  LengthNode,
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
 * @brief graph builder class contract.
 * @details Owns its state directly; methods expose receiver checks and explicit result flow.
 * @invariant Construction leaves the instance in a fully usable state before it escapes.
 */
export class GraphBuilder {

  /**
   * @brief nodes field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  private readonly nodes: GraphNode[];

  /**
   * @brief hash field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  private readonly hash: Map<string, NodeId>;

  /**
   * @brief constructor constructor contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @post The receiver is initialized according to the class invariant before it can be observed.
   */
  public constructor() {
    this.nodes = [];
    this.hash = new Map<string, NodeId>();
  }

  /**
   * @brief start routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @returns Result for start; ownership of newly created aggregates is transferred to the caller.
   */
  public start(): NodeId {
    return this.intern("start", (id: NodeId): StartNode => ({
      id,
      tag: NodeTag.Start,
      deps: []
    }));
  }

  /**
   * @brief param routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param name Borrowed input slot named name; validation or normalization happens before stored state changes.
   * @returns Result for param; ownership of newly created aggregates is transferred to the caller.
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
   * @brief constant routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for constant; ownership of newly created aggregates is transferred to the caller.
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
   * @brief get prop routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param object Borrowed input slot named object; validation or normalization happens before stored state changes.
   * @param key Borrowed input slot named key; validation or normalization happens before stored state changes.
   * @returns Result for get prop; ownership of newly created aggregates is transferred to the caller.
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
   * @brief length routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for length; ownership of newly created aggregates is transferred to the caller.
   */
  public length(value: NodeId): NodeId {
    return this.intern(`length:${String(value)}`, (id: NodeId): LengthNode => ({
      id,
      tag: NodeTag.Length,
      deps: [value],
      value
    }));
  }

  /**
   * @brief is string routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for is string; ownership of newly created aggregates is transferred to the caller.
   */
  public isString(value: NodeId): NodeId {
    return this.unary(NodeTag.IsString, value);
  }

  /**
   * @brief is number routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for is number; ownership of newly created aggregates is transferred to the caller.
   */
  public isNumber(value: NodeId): NodeId {
    return this.unary(NodeTag.IsNumber, value);
  }

  /**
   * @brief is boolean routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for is boolean; ownership of newly created aggregates is transferred to the caller.
   */
  public isBoolean(value: NodeId): NodeId {
    return this.unary(NodeTag.IsBoolean, value);
  }

  /**
   * @brief is big int routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for is big int; ownership of newly created aggregates is transferred to the caller.
   */
  public isBigInt(value: NodeId): NodeId {
    return this.unary(NodeTag.IsBigInt, value);
  }

  /**
   * @brief is symbol routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for is symbol; ownership of newly created aggregates is transferred to the caller.
   */
  public isSymbol(value: NodeId): NodeId {
    return this.unary(NodeTag.IsSymbol, value);
  }

  /**
   * @brief is object routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for is object; ownership of newly created aggregates is transferred to the caller.
   */
  public isObject(value: NodeId): NodeId {
    return this.unary(NodeTag.IsObject, value);
  }

  /**
   * @brief is array routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for is array; ownership of newly created aggregates is transferred to the caller.
   */
  public isArray(value: NodeId): NodeId {
    return this.unary(NodeTag.IsArray, value);
  }

  /**
   * @brief is undefined routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for is undefined; ownership of newly created aggregates is transferred to the caller.
   */
  public isUndefined(value: NodeId): NodeId {
    return this.unary(NodeTag.IsUndefined, value);
  }

  /**
   * @brief is null routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for is null; ownership of newly created aggregates is transferred to the caller.
   */
  public isNull(value: NodeId): NodeId {
    return this.unary(NodeTag.IsNull, value);
  }

  /**
   * @brief is integer routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for is integer; ownership of newly created aggregates is transferred to the caller.
   */
  public isInteger(value: NodeId): NodeId {
    return this.unary(NodeTag.IsInteger, value);
  }

  /**
   * @brief not routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for not; ownership of newly created aggregates is transferred to the caller.
   */
  public not(value: NodeId): NodeId {
    return this.unary(NodeTag.Not, value);
  }

  /**
   * @brief equals routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param left Borrowed input slot named left; validation or normalization happens before stored state changes.
   * @param right Borrowed input slot named right; validation or normalization happens before stored state changes.
   * @returns Result for equals; ownership of newly created aggregates is transferred to the caller.
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
   * @brief gte routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param left Borrowed input slot named left; validation or normalization happens before stored state changes.
   * @param right Borrowed input slot named right; validation or normalization happens before stored state changes.
   * @returns Result for gte; ownership of newly created aggregates is transferred to the caller.
   */
  public gte(left: NodeId, right: NodeId): NodeId {
    return this.numeric(NodeTag.Gte, left, right);
  }

  /**
   * @brief lte routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param left Borrowed input slot named left; validation or normalization happens before stored state changes.
   * @param right Borrowed input slot named right; validation or normalization happens before stored state changes.
   * @returns Result for lte; ownership of newly created aggregates is transferred to the caller.
   */
  public lte(left: NodeId, right: NodeId): NodeId {
    return this.numeric(NodeTag.Lte, left, right);
  }

  /**
   * @brief string min routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @param bound Borrowed input slot named bound; validation or normalization happens before stored state changes.
   * @returns Result for string min; ownership of newly created aggregates is transferred to the caller.
   */
  public stringMin(value: NodeId, bound: number): NodeId {
    return this.stringBound(NodeTag.StringMin, value, bound);
  }

  /**
   * @brief string max routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @param bound Borrowed input slot named bound; validation or normalization happens before stored state changes.
   * @returns Result for string max; ownership of newly created aggregates is transferred to the caller.
   */
  public stringMax(value: NodeId, bound: number): NodeId {
    return this.stringBound(NodeTag.StringMax, value, bound);
  }

  /**
   * @brief regex routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @param regex Borrowed input slot named regex; validation or normalization happens before stored state changes.
   * @param name Borrowed input slot named name; validation or normalization happens before stored state changes.
   * @returns Result for regex; ownership of newly created aggregates is transferred to the caller.
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
   * @brief has own routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param object Borrowed input slot named object; validation or normalization happens before stored state changes.
   * @param key Borrowed input slot named key; validation or normalization happens before stored state changes.
   * @returns Result for has own; ownership of newly created aggregates is transferred to the caller.
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
   * @brief strict keys routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param object Borrowed input slot named object; validation or normalization happens before stored state changes.
   * @param keys Borrowed input slot named keys; validation or normalization happens before stored state changes.
   * @returns Result for strict keys; ownership of newly created aggregates is transferred to the caller.
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
   * @brief array every routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @param item Borrowed input slot named item; validation or normalization happens before stored state changes.
   * @returns Result for array every; ownership of newly created aggregates is transferred to the caller.
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
   * @brief schema check routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
   * @returns Result for schema check; ownership of newly created aggregates is transferred to the caller.
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
   * @brief and routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param values Borrowed input slot named values; validation or normalization happens before stored state changes.
   * @returns Result for and; ownership of newly created aggregates is transferred to the caller.
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
   * @brief or routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param values Borrowed input slot named values; validation or normalization happens before stored state changes.
   * @returns Result for or; ownership of newly created aggregates is transferred to the caller.
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
   * @brief ret routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param control Borrowed input slot named control; validation or normalization happens before stored state changes.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for ret; ownership of newly created aggregates is transferred to the caller.
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
   * @brief issue routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param condition Borrowed input slot named condition; validation or normalization happens before stored state changes.
   * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
   * @param code Borrowed input slot named code; validation or normalization happens before stored state changes.
   * @returns Result for issue; ownership of newly created aggregates is transferred to the caller.
   */
  public issue(
    condition: NodeId,
    path: readonly PathSegment[],
    code: IssueCode
  ): NodeId {
    return this.push((id: NodeId): IssueNode => ({
      id,
      tag: NodeTag.Issue,
      deps: [condition],
      condition,
      path,
      code
    }));
  }

  /**
   * @brief finish routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param entry Borrowed input slot named entry; validation or normalization happens before stored state changes.
   * @param result Borrowed input slot named result; validation or normalization happens before stored state changes.
   * @returns Result for finish; ownership of newly created aggregates is transferred to the caller.
   */
  public finish(entry: NodeId, result: NodeId): Graph {
    return freezeGraph({
      nodes: this.nodes.slice(),
      entry,
      result
    });
  }

  /**
   * @brief unary routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param tag Borrowed input slot named tag; validation or normalization happens before stored state changes.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for unary; ownership of newly created aggregates is transferred to the caller.
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
   * @brief numeric routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param tag Borrowed input slot named tag; validation or normalization happens before stored state changes.
   * @param left Borrowed input slot named left; validation or normalization happens before stored state changes.
   * @param right Borrowed input slot named right; validation or normalization happens before stored state changes.
   * @returns Result for numeric; ownership of newly created aggregates is transferred to the caller.
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
   * @brief string bound routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param tag Borrowed input slot named tag; validation or normalization happens before stored state changes.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @param bound Borrowed input slot named bound; validation or normalization happens before stored state changes.
   * @returns Result for string bound; ownership of newly created aggregates is transferred to the caller.
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
   * @brief intern routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param key Borrowed input slot named key; validation or normalization happens before stored state changes.
   * @param make Borrowed input slot named make; validation or normalization happens before stored state changes.
   * @returns Result for intern; ownership of newly created aggregates is transferred to the caller.
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
   * @brief push routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param make Borrowed input slot named make; validation or normalization happens before stored state changes.
   * @returns Result for push; ownership of newly created aggregates is transferred to the caller.
   */
  private push(make: (id: NodeId) => GraphNode): NodeId {
    const id = this.nodes.length;
    const node = make(id);
    this.nodes.push(node);
    return id;
  }
}

/**
 * @brief make regex intern key function contract.
 * @details Encodes each string segment with its byte-length-independent character length before concatenation.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param source Borrowed input slot named source; validation or normalization happens before stored state changes.
 * @param flags Borrowed input slot named flags; validation or normalization happens before stored state changes.
 * @param name Borrowed input slot named name; validation or normalization happens before stored state changes.
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
 * @brief length prefixed function contract.
 * @details Preserves string tuple boundaries without allocating wrapper arrays or nested maps.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Encoded string segment suitable for intern table keys.
 */
function lengthPrefixed(value: string): string {
  return `${String(value.length)}:${value};`;
}

/**
 * @brief literal key function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for literal key; ownership of newly created aggregates is transferred to the caller.
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
