import { emitCompiledSourceBundle } from "../compile/index.js";
import type { Guard, Presence } from "../guard/index.js";
import type { PathSegment } from "../issue/index.js";
import { SchemaTag } from "../kind/index.js";
import { err, ok, type Result } from "../result/index.js";
import {
  freezeSchema,
  isSchemaValue,
  type LiteralValue,
  type Schema
} from "../schema/index.js";

/**
 * @brief aot issue code type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type AotIssueCode =
  | "unsupported_aot_lazy"
  | "unsupported_aot_refine"
  | "unsupported_aot_symbol_literal";

/**
 * @brief aot issue interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface AotIssue {

  /**
   * @brief path field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly path: readonly PathSegment[];

  /**
   * @brief code field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly code: AotIssueCode;

  /**
   * @brief message field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly message: string;
}

/**
 * @brief aot compile options interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface AotCompileOptions {

  /**
   * @brief name field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly name: string | undefined;
}

/**
 * @brief resolved aot compile options interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
interface ResolvedAotCompileOptions {

  /**
   * @brief name field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly name: string;
}

/**
 * @brief aot module interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface AotModule {

  /**
   * @brief source field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly source: string;

  /**
   * @brief declaration source field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly declarationSource: string;
}

/**
 * @brief emit aot module function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @param options Borrowed input slot named options; validation or normalization happens before stored state changes.
 * @returns Result for emit aot module; ownership of newly created aggregates is transferred to the caller.
 */
export function emitAotModule(
  guard: Guard<unknown, Presence>,
  options?: Partial<AotCompileOptions>
): Result<AotModule, readonly AotIssue[]> {
  const schema = readAotSchema(guard);
  const config = readOptions(options);
  const issues: AotIssue[] = [];
  scanAotSchema(schema, [], issues, new WeakSet<object>());
  if (issues.length !== 0) {
    return err(freezeAotIssues(issues));
  }
  const bundle = emitCompiledSourceBundle(schema, config.name);
  if (bundle.dynamicSchemas.length !== 0) {
    return err(freezeAotIssues([
      {
        path: Object.freeze([]),
        code: "unsupported_aot_refine",
        message: "AOT modules cannot preserve dynamic schema fallback"
      }
    ]));
  }
  return ok(Object.freeze({
    source: emitModuleSource(bundle),
    declarationSource: emitDeclarationSource()
  }));
}

/**
 * @brief read aot schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @returns Result for read aot schema; ownership of newly created aggregates is transferred to the caller.
 */
function readAotSchema(guard: unknown): Schema {
  if (!isRecord(guard)) {
    throw new TypeError("AOT guard must be a TypeSea guard");
  }
  const schema = guard["schema"];
  if (!isSchemaValue(schema)) {
    throw new TypeError("AOT guard must contain a valid TypeSea schema");
  }
  return freezeSchema(schema);
}

/**
 * @brief read options function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param options Borrowed input slot named options; validation or normalization happens before stored state changes.
 * @returns Result for read options; ownership of newly created aggregates is transferred to the caller.
 */
function readOptions(
  options: Partial<AotCompileOptions> | undefined
): ResolvedAotCompileOptions {
  if (options === undefined) {
    return {
      name: "typesea_aot"
    };
  }
  if (!isRecord(options)) {
    throw new TypeError("AOT options must be an object");
  }
  const name = options.name;
  if (name === undefined) {
    return {
      name: "typesea_aot"
    };
  }
  if (typeof name !== "string") {
    throw new TypeError("AOT name must be a string");
  }
  return {
    name
  };
}

/**
 * @brief scan aot schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param seen Borrowed input slot named seen; validation or normalization happens before stored state changes.
 * @post No result value is produced; effects are limited to the documented receiver or output buffer.
 */
function scanAotSchema(
  schema: Schema,
  path: readonly PathSegment[],
  issues: AotIssue[],
  seen: WeakSet<object>
): void {
  if (seen.has(schema)) {
    return;
  }
  seen.add(schema);
  switch (schema.tag) {
    case SchemaTag.Literal:
      if (typeof schema.value === "symbol") {
        pushIssue(
          path,
          issues,
          "unsupported_aot_symbol_literal",
          "AOT modules cannot preserve symbol literal identity"
        );
      }
      return;
    case SchemaTag.Array:
      scanAotSchema(schema.item, path.concat("items"), issues, seen);
      return;
    case SchemaTag.Tuple:
      scanSchemaArray(schema.items, path, issues, seen);
      return;
    case SchemaTag.Record:
      scanAotSchema(schema.value, path.concat("additionalProperties"), issues, seen);
      return;
    case SchemaTag.Object:
      scanObjectEntries(schema.entries, path, issues, seen);
      return;
    case SchemaTag.Union:
      scanSchemaArray(schema.options, path, issues, seen);
      return;
    case SchemaTag.Intersection:
      scanAotSchema(schema.left, path.concat("left"), issues, seen);
      scanAotSchema(schema.right, path.concat("right"), issues, seen);
      return;
    case SchemaTag.Optional:
    case SchemaTag.Undefinedable:
    case SchemaTag.Nullable:
    case SchemaTag.Brand:
      scanAotSchema(schema.inner, path.concat("inner"), issues, seen);
      return;
    case SchemaTag.DiscriminatedUnion:
      for (let index = 0; index < schema.cases.length; index += 1) {
        const unionCase = schema.cases[index];
        if (unionCase !== undefined) {
          scanAotSchema(unionCase.schema, path.concat(index), issues, seen);
        }
      }
      return;
    case SchemaTag.Lazy:
      pushIssue(
        path,
        issues,
        "unsupported_aot_lazy",
        "AOT modules cannot preserve lazy resolvers"
      );
      return;
    case SchemaTag.Refine:
      pushIssue(
        path,
        issues,
        "unsupported_aot_refine",
        "AOT modules cannot preserve refinement predicates"
      );
      return;
    case SchemaTag.Unknown:
    case SchemaTag.Never:
    case SchemaTag.String:
    case SchemaTag.Number:
    case SchemaTag.BigInt:
    case SchemaTag.Symbol:
    case SchemaTag.Boolean:
      return;
  }
}

/**
 * @brief scan schema array function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schemas Borrowed input slot named schemas; validation or normalization happens before stored state changes.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param seen Borrowed input slot named seen; validation or normalization happens before stored state changes.
 * @post No result value is produced; effects are limited to the documented receiver or output buffer.
 */
function scanSchemaArray(
  schemas: readonly Schema[],
  path: readonly PathSegment[],
  issues: AotIssue[],
  seen: WeakSet<object>
): void {
  for (let index = 0; index < schemas.length; index += 1) {
    const schema = schemas[index];
    if (schema !== undefined) {
      scanAotSchema(schema, path.concat(index), issues, seen);
    }
  }
}

/**
 * @brief scan object entries function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param entries Borrowed input slot named entries; validation or normalization happens before stored state changes.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param seen Borrowed input slot named seen; validation or normalization happens before stored state changes.
 * @post No result value is produced; effects are limited to the documented receiver or output buffer.
 */
function scanObjectEntries(
  entries: readonly {
    readonly key: string;
    readonly schema: Schema;
  }[],
  path: readonly PathSegment[],
  issues: AotIssue[],
  seen: WeakSet<object>
): void {
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry !== undefined) {
      scanAotSchema(entry.schema, path.concat(entry.key), issues, seen);
    }
  }
}

/**
 * @brief module bundle input interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
interface ModuleBundleInput {

  /**
   * @brief source field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly source: string;

  /**
   * @brief literals field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly literals: readonly LiteralValue[];

  /**
   * @brief regexps field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly regexps: readonly RegExp[];

  /**
   * @brief keysets field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly keysets: readonly (readonly string[])[];

  /**
   * @brief strings field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly strings: readonly string[];
}

/**
 * @brief emit module source function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param bundle Borrowed input slot named bundle; validation or normalization happens before stored state changes.
 * @returns Result for emit module source; ownership of newly created aggregates is transferred to the caller.
 */
function emitModuleSource(bundle: ModuleBundleInput): string {
  return [
    "const l=",
    serializeLiteralArray(bundle.literals),
    ";const r=",
    serializeRegExpArray(bundle.regexps),
    ";const k=",
    JSON.stringify(bundle.keysets),
    ";const u=",
    JSON.stringify(bundle.strings),
    ";const d=function(){return false;};",
    "const m=function(){return;};",
    "const sk=function(v,ks){if(typeof v!==\"object\"||v===null||Array.isArray(v))return false;const ps=Object.keys(v);for(let i=0;i<ps.length;i+=1){const key=ps[i];if(key===undefined||!ks.includes(key))return false;}return true;};",
    "const __typesea=(function(l,r,k,u,d,m,sk){",
    bundle.source,
    "})(l,r,k,u,d,m,sk);",
    "const freezeIssues=function(xs){if(xs.length===0)return Object.freeze([]);const out=new Array(xs.length);for(let i=0;i<xs.length;i+=1){const x=xs[i];const p=x.path.slice();Object.freeze(p);const y={path:p,code:x.code,expected:x.expected,actual:x.actual,message:x.message};Object.freeze(y);out[i]=y;}return Object.freeze(out);};",
    "export function is(value){return __typesea.is(value);}",
    "export function check(value){const issues=freezeIssues(__typesea.check(value));if(issues.length===0)return Object.freeze({ok:true,value});return Object.freeze({ok:false,error:issues});}",
    "export function assert(value){const result=check(value);if(!result.ok){const error=new Error(\"TypeSea assertion failed\");Object.defineProperty(error,\"issues\",{configurable:false,enumerable:true,value:result.error,writable:false});throw error;}}",
    "export default Object.freeze({is,check,assert});",
    ""
  ].join("");
}

/**
 * @brief emit declaration source function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @returns Result for emit declaration source; ownership of newly created aggregates is transferred to the caller.
 */
function emitDeclarationSource(): string {
  return [
    "export interface AotIssue {",
    "  readonly path: readonly (string | number)[];",
    "  readonly code: string;",
    "  readonly expected: string | undefined;",
    "  readonly actual: string | undefined;",
    "  readonly message: string | undefined;",
    "}",
    "export type AotCheckResult<TValue = unknown> =",
    "  | { readonly ok: true; readonly value: TValue }",
    "  | { readonly ok: false; readonly error: readonly AotIssue[] };",
    "export declare function is(value: unknown): boolean;",
    "export declare function check<TValue = unknown>(value: TValue): AotCheckResult<TValue>;",
    "export declare function assert(value: unknown): void;",
    "declare const guard: {",
    "  readonly is: typeof is;",
    "  readonly check: typeof check;",
    "  readonly assert: typeof assert;",
    "};",
    "export default guard;",
    ""
  ].join("\n");
}

/**
 * @brief serialize literal array function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param values Borrowed input slot named values; validation or normalization happens before stored state changes.
 * @returns Result for serialize literal array; ownership of newly created aggregates is transferred to the caller.
 */
function serializeLiteralArray(values: readonly LiteralValue[]): string {
  const parts = new Array<string>(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value !== undefined || Object.prototype.hasOwnProperty.call(values, index)) {
      parts[index] = serializeLiteral(value);
    }
  }
  return `[${parts.join(",")}]`;
}

/**
 * @brief serialize literal function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for serialize literal; ownership of newly created aggregates is transferred to the caller.
 */
function serializeLiteral(value: LiteralValue): string {
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      if (Number.isNaN(value)) {
        return "Number.NaN";
      }
      if (Object.is(value, -0)) {
        return "-0";
      }
      if (value === Number.POSITIVE_INFINITY) {
        return "Number.POSITIVE_INFINITY";
      }
      if (value === Number.NEGATIVE_INFINITY) {
        return "Number.NEGATIVE_INFINITY";
      }
      return String(value);
    case "bigint":
      return `${String(value)}n`;
    case "boolean":
      return value ? "true" : "false";
    case "undefined":
      return "undefined";
    case "symbol":
      throw new TypeError("symbol literals must be rejected before AOT serialization");
    default:
      return "null";
  }
}

/**
 * @brief serialize reg exp array function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param values Borrowed input slot named values; validation or normalization happens before stored state changes.
 * @returns Result for serialize reg exp array; ownership of newly created aggregates is transferred to the caller.
 */
function serializeRegExpArray(values: readonly RegExp[]): string {
  const parts = new Array<string>(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value !== undefined) {
      parts[index] = `new RegExp(${JSON.stringify(value.source)},${JSON.stringify(value.flags)})`;
    }
  }
  return `[${parts.join(",")}]`;
}

/**
 * @brief push issue function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param code Borrowed input slot named code; validation or normalization happens before stored state changes.
 * @param message Borrowed input slot named message; validation or normalization happens before stored state changes.
 * @post No result value is produced; effects are limited to the documented receiver or output buffer.
 */
function pushIssue(
  path: readonly PathSegment[],
  issues: AotIssue[],
  code: AotIssueCode,
  message: string
): void {
  issues.push({
    path: path.slice(),
    code,
    message
  });
}

/**
 * @brief freeze aot issues function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @returns Result for freeze aot issues; ownership of newly created aggregates is transferred to the caller.
 */
function freezeAotIssues(issues: readonly AotIssue[]): readonly AotIssue[] {
  for (let index = 0; index < issues.length; index += 1) {
    const issue = issues[index];
    if (issue !== undefined) {
      Object.freeze(issue.path);
      Object.freeze(issue);
    }
  }
  return Object.freeze(issues);
}

/**
 * @brief is record function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is record; ownership of newly created aggregates is transferred to the caller.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
