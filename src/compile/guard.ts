/**
 * @file compile/guard.ts
 * @brief Compiled guard construction and receiver validation.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 */

import {
    BaseGuard,
    TypeSeaAssertionError,
    type Guard,
    type Presence,
    type RuntimeValue
} from "../guard/index.js";
import type { CheckResult } from "../issue/index.js";
import { finalizeIssueArray } from "../issue/index.js";
import { err, ok } from "../result/index.js";
import {
    freezeSchema,
    isSchemaValue,
    type Schema
} from "../schema/index.js";
import {
    makeDynamicCheck,
    makeDynamicFirstIssueCheck,
    makeDynamicIssueCheck,
    strictKeys,
    type BooleanPredicate,
    type CheckResultRoot,
    type IsFactory,
    type IssueCollectorRoot
} from "./runtime.js";
import { emitCompiledSourceBundle } from "./source.js";
import type {
    CompileMode,
    CompileOptions,
    CompiledGuard
} from "./types.js";

const trustedCollectors = new WeakSet<IssueCollectorRoot>();
const trustedCheckResults = new WeakSet<CheckResultRoot>();
const trustedPredicates = new WeakSet<BooleanPredicate>();

/**
 * @brief Guard backed by generated predicate and diagnostic collectors.
 * @details The boolean predicate is the hot path; the collector is only entered
 * after a failed predicate so successful validation does not allocate issues.
 * @invariant test, collect, and source are immutable after construction.
 */
export class CompiledBaseGuard<
    TValue,
    TPresence extends Presence = "required"
> extends BaseGuard<TValue, TPresence> implements CompiledGuard<TValue, TPresence> {
    readonly #test: BooleanPredicate;
    readonly #collect: IssueCollectorRoot;
    readonly #trustedCollector: boolean;
    readonly #checkResult: CheckResultRoot | undefined;
    readonly #checkFirstResult: CheckResultRoot | undefined;

    public declare readonly source: string;

    public constructor(
        schema: Schema,
        test: BooleanPredicate,
        collect: IssueCollectorRoot,
        source: string,
        trustedCollector = false,
        checkResult?: CheckResultRoot,
        checkFirstResult?: CheckResultRoot
    ) {
        if (typeof test !== "function") {
            throw new TypeError("compiled guard test must be a function");
        }
        if (typeof collect !== "function") {
            throw new TypeError("compiled guard collector must be a function");
        }
        if (typeof source !== "string") {
            throw new TypeError("compiled guard source must be a string");
        }
        super(schema);
        this.#test = test;
        this.#collect = collect;
        this.#trustedCollector = trustedCollector && trustedCollectors.has(collect);
        this.#checkResult = checkResult !== undefined &&
            trustedCheckResults.has(checkResult)
            ? checkResult
            : undefined;
        this.#checkFirstResult = checkFirstResult !== undefined &&
            trustedCheckResults.has(checkFirstResult)
            ? checkFirstResult
            : undefined;
        defineReadonlyProperty(this, "source", source, true);
        if (trustedPredicates.has(test) &&
            this.#checkResult !== undefined &&
            this.#checkFirstResult !== undefined) {
            defineTrustedHotMethods(
                this,
                test,
                this.#checkResult,
                this.#checkFirstResult
            );
        }
        Object.freeze(this);
    }

    public override is(
        this: CompiledBaseGuard<TValue, TPresence>,
        value: unknown
    ): value is RuntimeValue<TValue, TPresence> {
        return isStrictTrue(this.#test(value));
    }

    public override check(
        this: CompiledBaseGuard<TValue, TPresence>,
        value: unknown
    ): CheckResult<RuntimeValue<TValue, TPresence>> {
        if (this.#checkResult !== undefined) {
            return this.#checkResult(value) as CheckResult<RuntimeValue<TValue, TPresence>>;
        }
        return runCompiledCheck<RuntimeValue<TValue, TPresence>>(
            this.#collect,
            this.#trustedCollector,
            value
        );
    }

    public override checkFirst(
        this: CompiledBaseGuard<TValue, TPresence>,
        value: unknown
    ): CheckResult<RuntimeValue<TValue, TPresence>> {
        if (this.#checkFirstResult !== undefined) {
            return this.#checkFirstResult(value) as CheckResult<RuntimeValue<TValue, TPresence>>;
        }
        return runCompiledCheckFirst<RuntimeValue<TValue, TPresence>>(
            this.#collect,
            this.#trustedCollector,
            value
        );
    }

    public override assert(
        this: CompiledBaseGuard<TValue, TPresence>,
        value: unknown
    ): asserts value is RuntimeValue<TValue, TPresence> {
        const result = this.#checkResult === undefined
            ? runCompiledCheck<RuntimeValue<TValue, TPresence>>(
                this.#collect,
                this.#trustedCollector,
                value
            )
            : this.#checkResult(value);
        if (!result.ok) {
            throw new TypeSeaAssertionError(result.error);
        }
    }
}

/**
 * @brief Emit a V8-visible validator function for a guard schema.
 * @details The generated function keeps literals and dynamic schema fallbacks in
 * side tables so the source body remains monomorphic and easy to inline.
 */
export function compile<TValue, TPresence extends Presence>(
    guard: Guard<TValue, TPresence>,
    options?: Partial<CompileOptions>
): CompiledBaseGuard<TValue, TPresence> {
    const schema = readCompileSchema(guard);
    const name = readCompileName(options);
    const mode = readCompileMode(options);
    const bundle = emitCompiledSourceBundle(schema, name, mode);
    // compile() intentionally emits source so V8 can optimize the validator body.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const factory = new Function(
        "l",
        "r",
        "k",
        "u",
        "d",
        "m",
        "mf",
        "sk",
        bundle.source
    ) as IsFactory;
    const dynamicCheck = makeDynamicCheck(bundle.dynamicSchemas);
    const dynamicFirstIssueCheck = makeDynamicFirstIssueCheck(bundle.dynamicSchemas);
    const runtime = factory(
        bundle.literals,
        bundle.regexps,
        bundle.keysets,
        bundle.strings,
        dynamicCheck,
        makeDynamicIssueCheck(bundle.dynamicSchemas),
        dynamicFirstIssueCheck,
        strictKeys
    );
    trustedPredicates.add(runtime.is);
    trustedCollectors.add(runtime.check);
    trustedCheckResults.add(runtime.result);
    trustedCheckResults.add(runtime.first);
    return new CompiledBaseGuard<TValue, TPresence>(
        schema,
        runtime.is,
        runtime.check,
        bundle.source,
        true,
        runtime.result,
        runtime.first
    );
}

/**
 * @brief Execute define trusted hot methods.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function defineTrustedHotMethods<
    TValue,
    TPresence extends Presence
>(
    guard: CompiledBaseGuard<TValue, TPresence>,
    test: BooleanPredicate,
    checkResult: CheckResultRoot,
    checkFirstResult: CheckResultRoot
): void {
    const self = guard;
    /*
     * Compiled guards receive own methods after construction. The closure over
     * `self` keeps detached calls from reaching optimized validators with a
     * forged receiver while preserving a tiny call shape for V8.
     */
    defineReadonlyProperty(
        guard,
        "is",
        /**
         * @brief Execute compiled trusted is.
         * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
         */
        function compiledTrustedIs(
            this: unknown,
            value: unknown
        ): value is RuntimeValue<TValue, TPresence> {
            if (this !== self) {
                throw new TypeError("compiled guard method receiver is invalid");
            }
            return test(value);
        },
        false
    );
    defineReadonlyProperty(
        guard,
        "check",
        /**
         * @brief Execute compiled trusted check.
         * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
         */
        function compiledTrustedCheck(
            this: unknown,
            value: unknown
        ): CheckResult<RuntimeValue<TValue, TPresence>> {
            if (this !== self) {
                throw new TypeError("compiled guard method receiver is invalid");
            }
            return checkResult(value) as CheckResult<RuntimeValue<TValue, TPresence>>;
        },
        false
    );
    defineReadonlyProperty(
        guard,
        "assert",
        /**
         * @brief Execute compiled trusted assert.
         * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
         */
        function compiledTrustedAssert(
            this: unknown,
            value: unknown
        ): asserts value is RuntimeValue<TValue, TPresence> {
            if (this !== self) {
                throw new TypeError("compiled guard method receiver is invalid");
            }
            const result = checkResult(value);
            if (!result.ok) {
                throw new TypeSeaAssertionError(result.error);
            }
        },
        false
    );
    defineReadonlyProperty(
        guard,
        "checkFirst",
        /**
         * @brief Execute compiled trusted checkFirst.
         * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
         */
        function compiledTrustedCheckFirst(
            this: unknown,
            value: unknown
        ): CheckResult<RuntimeValue<TValue, TPresence>> {
            if (this !== self) {
                throw new TypeError("compiled guard method receiver is invalid");
            }
            return checkFirstResult(value) as CheckResult<RuntimeValue<TValue, TPresence>>;
        },
        false
    );
}

/**
 * @brief Normalize the guard input for runtime compilation.
 * @param guard Candidate guard-like value.
 * @returns Frozen schema passed to source emission.
 * @throws TypeError when the input does not expose a valid TypeSea schema.
 * @details Runtime compilation may be called with structural guard-like values.
 * The schema is descriptor-read so inherited getters cannot influence emitted
 * code or mutate the schema between validation and codegen.
 */
function readCompileSchema(guard: unknown): Schema {
    if (!isRecord(guard)) {
        throw new TypeError("compile guard must be a TypeSea guard");
    }
    const schema = readOwnDataProperty(guard, "schema");
    if (!isSchemaValue(schema)) {
        throw new TypeError("compile guard must contain a valid TypeSea schema");
    }
    return freezeSchema(schema);
}

/**
 * @brief Accept only the literal boolean success value from compiled predicates.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param value Predicate return value.
 * @returns True only for `true`.
 */
function isStrictTrue(value: unknown): boolean {
    return value === true;
}

/**
 * @brief Read one own data slot from a compile input object.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
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

/**
 * @brief Convert a generated issue collector result into a public Result.
 * @param collect Generated collector function.
 * @param trustedCollector Whether the collector came from TypeSea codegen.
 * @param value Candidate runtime value.
 * @returns Success result or frozen diagnostic issue result.
 * @details Trusted collectors already emit internal issue records, so the fast
 * path freezes only the final vector. Untrusted collectors are normalized
 * through finalizeIssueArray before publication.
 */
function runCompiledCheck<TValue>(
    collect: IssueCollectorRoot,
    trustedCollector: boolean,
    value: unknown
): CheckResult<TValue> {
    const rawIssues = collect(value);
    if (trustedCollector) {
        if (rawIssues === undefined || rawIssues.length === 0) {
            return ok(value as TValue);
        }
        return err(Object.freeze(rawIssues));
    }
    const issues = finalizeIssueArray(rawIssues);
    if (issues.length === 0) {
        return ok(value as TValue);
    }
    return err(issues);
}

/**
 * @brief Convert a generated collector result into a one-issue public Result.
 * @details This fallback is used only for manually constructed compiled guards.
 * Trusted codegen normally installs a dedicated first-result function.
 * @param collect Generated collector function.
 * @param trustedCollector Whether the collector came from TypeSea codegen.
 * @param value Candidate runtime value.
 * @returns Success result or a frozen failure carrying at most one issue.
 */
function runCompiledCheckFirst<TValue>(
    collect: IssueCollectorRoot,
    trustedCollector: boolean,
    value: unknown
): CheckResult<TValue> {
    const result = runCompiledCheck<TValue>(collect, trustedCollector, value);
    if (result.ok || result.error.length <= 1) {
        return result;
    }
    const first = result.error[0];
    if (first === undefined) {
        return ok(value as TValue);
    }
    return err(Object.freeze([first]));
}

/**
 * @brief Execute define readonly property.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function defineReadonlyProperty(
    target: object,
    key: string,
    value: unknown,
    enumerable: boolean
): void {
    Object.defineProperty(target, key, {
        configurable: false,
        enumerable,
        value,
        writable: false
    });
}

/**
 * @brief Read compile name.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function readCompileName(options: unknown): string {
    if (options === undefined) {
        return "typesea_is";
    }
    if (!isRecord(options)) {
        throw new TypeError("compile options must be an object");
    }
    const name = options["name"];
    if (name === undefined) {
        return "typesea_is";
    }
    if (typeof name !== "string") {
        throw new TypeError("compile name must be a string");
    }
    return name;
}

/**
 * @brief Read compile mode.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function readCompileMode(options: unknown): CompileMode {
    if (options === undefined) {
        return "safe";
    }
    if (!isRecord(options)) {
        throw new TypeError("compile options must be an object");
    }
    const mode = options["mode"];
    if (mode === undefined) {
        return "safe";
    }
    if (mode === "safe" || mode === "unsafe" || mode === "unchecked") {
        return mode;
    }
    throw new TypeError("compile mode must be \"safe\", \"unsafe\", or \"unchecked\"");
}

/**
 * @brief Check record.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
