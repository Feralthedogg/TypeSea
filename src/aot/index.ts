import { emitCompiledSourceBundle } from "../compile/index.js";
import type { CompileMode } from "../compile/index.js";
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
 * @brief aot issue code.
 * @details AOT helpers serialize only portable data because standalone modules cannot close
 * over runtime side tables.
 */
export type AotIssueCode =
    | "unsupported_aot_lazy"
    | "unsupported_aot_refine"
    | "unsupported_aot_symbol_literal";

/**
 * @brief aot issue.
 * @details AOT helpers serialize only portable data because standalone modules cannot close
 * over runtime side tables.
 */
export interface AotIssue {
    readonly path: readonly PathSegment[];
    readonly code: AotIssueCode;
    readonly message: string;
}

/**
 * @brief aot compile options.
 * @details AOT helpers serialize only portable data because standalone modules cannot close
 * over runtime side tables.
 */
export interface AotCompileOptions {
    readonly name: string | undefined;
    readonly mode: CompileMode | undefined;
}

/**
 * @brief resolved aot compile options.
 * @details AOT helpers serialize only portable data because standalone modules cannot close
 * over runtime side tables.
 */
interface ResolvedAotCompileOptions {
    readonly name: string;
    readonly mode: CompileMode;
}

/**
 * @brief Source pair emitted for ahead-of-time validation.
 * @details `source` is the JavaScript module body; `declarationSource` is the
 * companion TypeScript declaration used by package consumers.
 */
export interface AotModule {
    readonly source: string;
    readonly declarationSource: string;
}

/**
 * @brief Emit a standalone validator module for a guard schema.
 * @param guard Guard whose schema is exported.
 * @param options Optional function name and compile mode.
 * @returns Result carrying source text, or closed issues for unsupported schema nodes.
 * @details AOT output cannot close over runtime side tables. The schema is
 * scanned before code emission so lazy, refine, and symbol-literal constructs
 * fail as explicit issues instead of producing partially faithful source.
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
    const bundle = emitCompiledSourceBundle(schema, config.name, config.mode);
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
 * @brief Normalize the guard input used by AOT emission.
 * @param guard Candidate guard-like value.
 * @returns Frozen schema safe for source generation.
 * @throws TypeError when the value is not a TypeSea guard.
 * @details The schema slot is descriptor-read to reject forged prototypes before
 * the generator traverses schema data.
 */
function readAotSchema(guard: unknown): Schema {
    if (!isRecord(guard)) {
        throw new TypeError("AOT guard must be a TypeSea guard");
    }
    const schema = readOwnDataProperty(guard, "schema");
    if (!isSchemaValue(schema)) {
        throw new TypeError("AOT guard must contain a valid TypeSea schema");
    }
    return freezeSchema(schema);
}

/**
 * @brief Normalize AOT compile options.
 * @details AOT helpers serialize only portable data because standalone modules cannot close
 * over runtime side tables.
 * @param options Optional user options object.
 * @returns Complete options with defaults.
 * @throws TypeError when option fields have unsupported types.
 */
function readOptions(
    options: Partial<AotCompileOptions> | undefined
): ResolvedAotCompileOptions {
    if (options === undefined) {
        return {
            name: "typesea_aot",
            mode: "safe"
        };
    }
    if (!isRecord(options)) {
        throw new TypeError("AOT options must be an object");
    }
    const name = options.name;
    if (name === undefined) {
        return {
            name: "typesea_aot",
            mode: readAotMode(options)
        };
    }
    if (typeof name !== "string") {
        throw new TypeError("AOT name must be a string");
    }
    return {
        name,
        mode: readAotMode(options)
    };
}

/**
 * @brief Normalize the requested AOT compile mode.
 * @details AOT helpers serialize only portable data because standalone modules cannot close
 * over runtime side tables.
 * @param options Options object already accepted as a record.
 * @returns Safe, unsafe, or unchecked codegen mode.
 * @throws TypeError when the mode is outside the supported set.
 */
function readAotMode(options: Readonly<Record<string, unknown>>): CompileMode {
    const mode = options["mode"];
    if (mode === undefined) {
        return "safe";
    }
    if (mode === "safe" || mode === "unsafe" || mode === "unchecked") {
        return mode;
    }
    throw new TypeError("AOT mode must be \"safe\", \"unsafe\", or \"unchecked\"");
}

/**
 * @brief Walk a schema tree and record constructs that AOT cannot preserve.
 * @param schema Current schema node.
 * @param path Diagnostic path to the current node.
 * @param issues Mutable issue vector owned by the caller.
 * @param seen Schema object set used to avoid repeated traversal.
 * @details Runtime compilation can keep dynamic schemas in side tables; emitted
 * modules cannot. This scan keeps the public API honest by refusing source that
 * would silently weaken lazy, refine, or symbol literal semantics.
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
 * @brief scan schema array.
 * @details AOT helpers serialize only portable data because standalone modules cannot close
 * over runtime side tables.
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
 * @brief scan object entries.
 * @details AOT helpers serialize only portable data because standalone modules cannot close
 * over runtime side tables.
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
 * @brief module bundle input.
 * @details AOT helpers serialize only portable data because standalone modules cannot close
 * over runtime side tables.
 */
interface ModuleBundleInput {
    readonly source: string;
    readonly literals: readonly LiteralValue[];
    readonly regexps: readonly RegExp[];
    readonly keysets: readonly (readonly string[])[];
    readonly strings: readonly string[];
}

/**
 * @brief emit module source.
 * @details AOT helpers serialize only portable data because standalone modules cannot close
 * over runtime side tables.
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
        "const sk=function(v,ks){if(typeof v!==\"object\"||v===null||Array.isArray(v))return false;const ps=Reflect.ownKeys(v);for(let i=0;i<ps.length;i+=1){const key=ps[i];if(typeof key!==\"string\"||!ks.includes(key))return false;}return true;};",
        "const __typesea=(function(l,r,k,u,d,m,sk){",
        bundle.source,
        "})(l,r,k,u,d,m,sk);",
        "export function is(value){return __typesea.is(value);}",
        "export function check(value){return __typesea.result(value);}",
        "export function assert(value){const result=check(value);if(!result.ok){const error=new Error(\"TypeSea assertion failed\");Object.defineProperty(error,\"issues\",{configurable:false,enumerable:true,value:result.error,writable:false});throw error;}}",
        "export default Object.freeze({is,check,assert});",
        ""
    ].join("");
}

/**
 * @brief emit declaration source.
 * @details AOT helpers serialize only portable data because standalone modules cannot close
 * over runtime side tables.
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
 * @brief serialize literal array.
 * @details AOT helpers serialize only portable data because standalone modules cannot close
 * over runtime side tables.
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
 * @brief serialize literal.
 * @details AOT helpers serialize only portable data because standalone modules cannot close
 * over runtime side tables.
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
 * @brief serialize reg exp array.
 * @details AOT helpers serialize only portable data because standalone modules cannot close
 * over runtime side tables.
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
 * @brief Execute push issue.
 * @details This helper keeps a local invariant explicit at the module boundary.
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
 * @brief Execute freeze aot issues.
 * @details This helper keeps a local invariant explicit at the module boundary.
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
 * @brief Accept option and guard records before local field reads.
 * @details AOT helpers serialize only portable data because standalone modules cannot close
 * over runtime side tables.
 * @param value Candidate object.
 * @returns True for non-array objects.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Read one own data slot from an AOT input object.
 * @details AOT helpers serialize only portable data because standalone modules cannot close
 * over runtime side tables.
 * @param value Object being normalized.
 * @param key Field name or symbol.
 * @returns Stored field value, or undefined when absent.
 */
function readOwnDataProperty(
    value: object,
    key: PropertyKey
): unknown {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        return undefined;
    }
    return descriptor.value;
}
