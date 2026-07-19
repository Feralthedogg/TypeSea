/**
 * @file compile/types.ts
 * @brief Shared compile-time data contracts.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source
 * shape stable across runtime and AOT emission.
 */

import type { Guard, Presence, RuntimeValue } from "../guard/index.js";
import type { Graph, NodeId } from "../ir/index.js";
import type { LiteralValue, Schema } from "../schema/index.js";

/** @brief Control outcome observed by optional graph instrumentation. */
export type GraphInstrumentationOutcome =
    | "entry"
    | "accept"
    | "reject"
    | "true"
    | "false";

/**
 * @brief Source-statement provider for one instrumented graph region.
 * @details Statements are generated only by trusted TypeSea bridge code and
 * are absent from ordinary compile contexts.
 */
export interface GraphInstrumentationRegion {
    branch(path: string, node: NodeId): boolean;
    statement(path: string, outcome: GraphInstrumentationOutcome): string;
}

/** @brief Optional graph-to-region instrumentation lookup used during emission. */
export interface GraphInstrumentation {
    region(graph: Graph): GraphInstrumentationRegion | undefined;
}

/**
 * @brief Mutable state used while emitting one validator bundle.
 * @details The context owns side tables instead of interpolating user values into
 * generated source. That keeps code generation auditable and prevents literals,
 * regular expressions, schemas, and key sets from becoming source text.
 */
export interface EmitContext {
    /**
     * @brief Property-access and defensive-read mode used by the generated code.
     */
    readonly mode: CompileMode;

    /** @brief Optional build-time instrumentation resolver. */
    readonly instrumentation: GraphInstrumentation | undefined;

    /** @brief Whether object nodes use cold static scheduling or graph order. */
    readonly objectEntryOrder: ObjectEntryOrder;

    /**
     * @brief Literal side table addressed by generated numeric indexes.
     */
    readonly literals: LiteralValue[];

    /**
     * @brief Regular-expression side table addressed by generated numeric indexes.
     */
    readonly regexps: RegExp[];

    /**
     * @brief Strict-object key-set side table.
     */
    readonly keysets: (readonly string[])[];

    /**
     * @brief String side table for paths, messages, and reusable property names.
     */
    readonly strings: string[];

    /**
     * @brief Dynamic schema side table for constructs that stay interpreted.
     */
    readonly schemas: Schema[];

    /**
     * @brief Boolean helper functions emitted for recursive schema fragments.
     */
    readonly functions: FunctionSource[];

    /**
     * @brief Schema-to-boolean-helper lookup preventing duplicate helper emission.
     */
    readonly functionNames: Map<Schema, string>;

    /**
     * @brief Diagnostic collector helper functions.
     */
    readonly checkFunctions: FunctionSource[];

    /**
     * @brief Schema-to-diagnostic-helper lookup.
     */
    readonly checkFunctionNames: Map<Schema, string>;

    /**
     * @brief First-issue collector helper functions.
     */
    readonly firstFunctions: FunctionSource[];

    /**
     * @brief Schema-to-first-issue-helper lookup.
     */
    readonly firstFunctionNames: Map<Schema, string>;

    /**
     * @brief Intern table for strings already placed in the string side table.
     */
    readonly stringIndexes: Map<string, number>;
}

/**
 * @brief Property-read safety tier for generated validators.
 * @details Safe mode rejects accessors and prototype reads. Unsafe and unchecked
 * modes trade portions of that hostile-input defense for lower V8 overhead.
 */
export type CompileMode = "safe" | "unsafe" | "unchecked";

/** @brief Object-field order selected for graph predicate emission. */
export type ObjectEntryOrder = "static" | "graph";

/**
 * @brief Named helper body emitted into a generated validator.
 * @details Bodies are accumulated independently so recursive schemas can reference
 * stable helper names before the final source string is assembled.
 */
export interface FunctionSource {
    /**
     * @brief Stable helper function name.
     */
    readonly name: string;

    /**
     * @brief JavaScript body text emitted by the compiler.
     */
    body: string;
}

/**
 * @brief Generated source plus the side tables needed to execute it.
 * @details Runtime compile and AOT emission share this bundle shape, which keeps
 * both paths on the same compiler ABI.
 */
export interface CompiledSourceBundle {
    /**
     * @brief Factory source evaluated by runtime compile or written by AOT.
     */
    readonly source: string;

    /**
     * @brief Literal values referenced by generated indexes.
     */
    readonly literals: readonly LiteralValue[];

    /**
     * @brief Regular expressions referenced by generated indexes.
     */
    readonly regexps: readonly RegExp[];

    /**
     * @brief Strict-object key sets referenced by generated indexes.
     */
    readonly keysets: readonly (readonly string[])[];

    /**
     * @brief Strings referenced by generated indexes.
     */
    readonly strings: readonly string[];

    /**
     * @brief Schemas delegated to dynamic fallback checks.
     */
    readonly dynamicSchemas: readonly Schema[];
}

/**
 * @brief Generated source display mode.
 * @details Compact source is optimized for byte size and V8 parsing. Debug
 * source keeps the same semantics but adds comments, newlines, indentation, and
 * a sourceURL marker so stack traces are easier to read.
 */
export type CompileSourceMode = "compact" | "debug";

/**
 * @brief Public guard augmented with generated source.
 * @details The source field exists for audit, snapshots, and AOT debugging. Normal
 * validation should call the guard methods rather than inspecting source text.
 */
export interface CompiledGuard<
    TValue,
    TPresence extends Presence = "required"
> extends Guard<TValue, TPresence> {
    /**
     * @brief Generated JavaScript source backing this guard.
     */
    readonly source: string;
}

/**
 * @brief Predicate-only compiled guard.
 * @details This shape is intentionally smaller than CompiledGuard: it exposes
 * only is() and generated source, so no diagnostic collectors are emitted.
 */
export interface CompiledBooleanGuard<
    TValue,
    TPresence extends Presence = "required"
> {
    /**
     * @brief Generated JavaScript source backing this predicate.
     */
    readonly source: string;

    /**
     * @brief Run the generated predicate without diagnostic collection.
     */
    is(value: unknown): value is RuntimeValue<TValue, TPresence>;
}

/**
 * @brief Options controlling generated validator shape.
 */
export interface CompileOptions {
    /**
     * @brief Public function name used in generated source.
     */
    readonly name: string | undefined;

    /**
     * @brief Safety tier used by property access and strict object checks.
     */
    readonly mode: CompileMode | undefined;

    /**
     * @brief Emit formatted source with comments and sourceURL metadata.
     */
    readonly debugSource: boolean | undefined;
}
