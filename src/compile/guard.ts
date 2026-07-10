/**
 * @file compile/guard.ts
 * @brief Compiled guard construction and receiver validation.
 */

import {
    BaseGuard,
    TypeSeaAssertionError,
    type Guard,
    type ParseOptions,
    type Presence,
    type RuntimeValue,
    type SafeParseResult,
    type WithCheckSource
} from "../guard/index.js";
import {
    applyParseOptions,
    hasGlobalErrorMap
} from "../guard/parse-options.js";
import { isWithCheckSource } from "../guard/with-check.js";
import type { CheckResult } from "../issue/index.js";
import {
    finalizeIssueArray,
    freezeIssueArray,
    makeIssue
} from "../issue/index.js";
import { err, ok } from "../result/index.js";
import {
    finalizeAcceptedValue,
    schemaNeedsFinalization
} from "../evaluate/finalize.js";
import { isInspectableValue } from "../evaluate/shared.js";
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
    type IssueCollectorRoot,
    type PredicateFactory
} from "./runtime.js";
import {
    emitCompiledBooleanSourceBundle,
    emitCompiledSourceBundle
} from "./source.js";
import type {
    CompiledBooleanGuard,
    CompileMode,
    CompileOptions,
    CompiledGuard
} from "./types.js";

const trustedCollectors = new WeakSet<IssueCollectorRoot>();
const trustedCheckResults = new WeakSet<CheckResultRoot>();
const trustedPredicates = new WeakSet<BooleanPredicate>();
const compiledGuardCache = new WeakMap<object, Map<string, CompiledBaseGuard<unknown, Presence>>>();
const compiledBooleanGuardCache = new WeakMap<
    object,
    Map<string, CompiledBooleanBaseGuard<unknown, Presence>>
>();
const COMPILE_WARNING_THRESHOLD = 32;
const COMPILE_WARNING_WINDOW_MS = 10_000;
const COMPILE_WARNING_LIMIT = 256;
const compileWarnings = new Map<string, CompileWarningState>();

interface ResolvedCompileOptions {
    readonly name: string;
    readonly mode: CompileMode;
    readonly debugSource: boolean;
}

interface CompileWarningState {
    count: number;
    windowStart: number;
    warned: boolean;
}

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
    readonly #needsFinalization: boolean;

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
        this.#needsFinalization = schemaNeedsFinalization(schema);
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
                this.#checkFirstResult,
                this.#needsFinalization
            );
        }
        Object.freeze(this);
    }

    public override is(
        this: CompiledBaseGuard<TValue, TPresence>,
        value: unknown
    ): value is RuntimeValue<TValue, TPresence> {
        return runCompiledPredicate(this.#test, value);
    }

    public override check<TNext>(
        source: WithCheckSource<RuntimeValue<TValue, TPresence>> & ((guard: this) => TNext)
    ): TNext;

    public override check(
        source: WithCheckSource<RuntimeValue<TValue, TPresence>>
    ): BaseGuard<TValue, TPresence>;

    public override check(
        value: unknown,
        options?: Partial<ParseOptions>
    ): CheckResult<RuntimeValue<TValue, TPresence>>;

    public override check(
        this: CompiledBaseGuard<TValue, TPresence>,
        value: unknown,
        options?: Partial<ParseOptions>
    ): unknown {
        if (isWithCheckSource(value)) {
            return super.check(value, options);
        }
        const result = finalizeCompiledResult(
            this.schema,
            this.#checkResult !== undefined
                ? runCompiledCheckResult<RuntimeValue<TValue, TPresence>>(
                    this.#checkResult,
                    value
                )
                : runCompiledCheck<RuntimeValue<TValue, TPresence>>(
                    this.#collect,
                    this.#trustedCollector,
                    value
                ),
            this.#needsFinalization
        );
        if (result.ok) {
            return result;
        }
        return err(applyParseOptions(result.error, value, options));
    }

    public override checkFirst(
        this: CompiledBaseGuard<TValue, TPresence>,
        value: unknown,
        options?: Partial<ParseOptions>
    ): CheckResult<RuntimeValue<TValue, TPresence>> {
        const result = finalizeCompiledResult(
            this.schema,
            this.#checkFirstResult !== undefined
                ? runCompiledCheckResult<RuntimeValue<TValue, TPresence>>(
                    this.#checkFirstResult,
                    value
                )
                : runCompiledCheckFirst<RuntimeValue<TValue, TPresence>>(
                    this.#collect,
                    this.#trustedCollector,
                    value
                ),
            this.#needsFinalization
        );
        if (result.ok) {
            return result;
        }
        return err(applyParseOptions(result.error, value, options));
    }

    public override parse(
        this: CompiledBaseGuard<TValue, TPresence>,
        value: unknown,
        options?: Partial<ParseOptions>
    ): RuntimeValue<TValue, TPresence> {
        const result = this.#checkResult === undefined
            ? runCompiledCheck<RuntimeValue<TValue, TPresence>>(
                this.#collect,
                this.#trustedCollector,
                value
            )
            : runCompiledCheckResult<RuntimeValue<TValue, TPresence>>(
                this.#checkResult,
                value
            );
        if (!result.ok) {
            throw new TypeSeaAssertionError(applyParseOptions(result.error, value, options));
        }
        const accepted = result.value;
        return this.#needsFinalization
            ? finalizeAcceptedValue(this.schema, accepted)
            : accepted;
    }

    public override safeParse(
        this: CompiledBaseGuard<TValue, TPresence>,
        value: unknown,
        options?: Partial<ParseOptions>
    ): SafeParseResult<RuntimeValue<TValue, TPresence>> {
        const result = this.#checkResult === undefined
            ? runCompiledCheck<RuntimeValue<TValue, TPresence>>(
                this.#collect,
                this.#trustedCollector,
                value
            )
            : runCompiledCheckResult<RuntimeValue<TValue, TPresence>>(
                this.#checkResult,
                value
            );
        if (result.ok) {
            const accepted = result.value;
            const data = this.#needsFinalization
                ? finalizeAcceptedValue(this.schema, accepted)
                : accepted;
            return Object.freeze({
                success: true,
                data
            });
        }
        return Object.freeze({
            success: false,
            error: new TypeSeaAssertionError(applyParseOptions(result.error, value, options))
        });
    }

    public override parseAsync(
        this: CompiledBaseGuard<TValue, TPresence>,
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<RuntimeValue<TValue, TPresence>> {
        const result = this.#checkResult === undefined
            ? runCompiledCheck<RuntimeValue<TValue, TPresence>>(
                this.#collect,
                this.#trustedCollector,
                value
            )
            : runCompiledCheckResult<RuntimeValue<TValue, TPresence>>(
                this.#checkResult,
                value
            );
        if (!result.ok) {
            return Promise.reject(new TypeSeaAssertionError(
                applyParseOptions(result.error, value, options)
            ));
        }
        const accepted = result.value;
        return Promise.resolve(this.#needsFinalization
            ? finalizeAcceptedValue(this.schema, accepted)
            : accepted);
    }

    public override safeParseAsync(
        this: CompiledBaseGuard<TValue, TPresence>,
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<SafeParseResult<RuntimeValue<TValue, TPresence>>> {
        return Promise.resolve(this.safeParse(value, options));
    }

    public override spa(
        this: CompiledBaseGuard<TValue, TPresence>,
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<SafeParseResult<RuntimeValue<TValue, TPresence>>> {
        return this.safeParseAsync(value, options);
    }

    public override assert(
        this: CompiledBaseGuard<TValue, TPresence>,
        value: unknown,
        options?: Partial<ParseOptions>
    ): asserts value is RuntimeValue<TValue, TPresence> {
        const result = this.#checkResult === undefined
            ? runCompiledCheck<RuntimeValue<TValue, TPresence>>(
                this.#collect,
                this.#trustedCollector,
                value
            )
            : runCompiledCheckResult<RuntimeValue<TValue, TPresence>>(
                this.#checkResult,
                value
            );
        if (!result.ok) {
            throw new TypeSeaAssertionError(applyParseOptions(result.error, value, options));
        }
        if (this.#needsFinalization) {
            finalizeAcceptedValue(this.schema, value);
        }
    }
}

/**
 * @brief Predicate-only compiled guard.
 * @details This object is the fail-fast validation surface. It contains no
 * diagnostic collector, so validation can only answer true or false.
 */
export class CompiledBooleanBaseGuard<
    TValue,
    TPresence extends Presence = "required"
> implements CompiledBooleanGuard<TValue, TPresence> {
    /**
     * @brief Trusted predicate emitted by predicate-only code generation.
     */
    readonly #test: BooleanPredicate;

    /**
     * @brief Generated JavaScript source backing this predicate.
     */
    public declare readonly source: string;

    /**
     * @brief Construct a frozen predicate-only compiled guard.
     * @param test Emitted predicate function.
     * @param source Generated JavaScript source for debug and audit use.
     */
    public constructor(test: BooleanPredicate, source: string) {
        if (typeof test !== "function") {
            throw new TypeError("compiled boolean guard test must be a function");
        }
        if (typeof source !== "string") {
            throw new TypeError("compiled boolean guard source must be a string");
        }
        this.#test = test;
        defineReadonlyProperty(this, "source", source, true);
        Object.freeze(this);
    }

    public is(
        value: unknown
    ): value is RuntimeValue<TValue, TPresence> {
        return runCompiledPredicate(this.#test, value);
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
    const config = readCompileOptions(options);
    const cacheKey = compileCacheKey(config);
    const cached = readCachedCompiledGuard<TValue, TPresence>(guard, cacheKey);
    if (cached !== undefined) {
        return cached;
    }
    maybeWarnRepeatedCompile();
    const bundle = emitCompiledSourceBundle(
        schema,
        config.name,
        config.mode,
        config.debugSource
    );
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
    const compiled = new CompiledBaseGuard<TValue, TPresence>(
        schema,
        runtime.is,
        runtime.check,
        bundle.source,
        true,
        runtime.result,
        runtime.first
    );
    writeCachedCompiledGuard(guard, cacheKey, compiled);
    return compiled;
}

/**
 * @brief Emit a predicate-only compiled validator for fail-fast checks.
 * @param guard Guard whose schema should be compiled.
 * @param options Compile options shared with compile().
 * @returns Frozen boolean-only guard with is() and source.
 * @details Unlike compile(), this function does not emit check(), checkFirst(),
 * assert(), or issue collector code. Use it on hot paths that only need a
 * boolean answer.
 */
export function compileBoolean<TValue, TPresence extends Presence>(
    guard: Guard<TValue, TPresence>,
    options?: Partial<CompileOptions>
): CompiledBooleanBaseGuard<TValue, TPresence> {
    const schema = readCompileSchema(guard);
    const config = readCompileOptions(options);
    const cacheKey = compileCacheKey(config);
    const cached = readCachedCompiledBooleanGuard<TValue, TPresence>(guard, cacheKey);
    if (cached !== undefined) {
        return cached;
    }
    maybeWarnRepeatedCompile();
    const bundle = emitCompiledBooleanSourceBundle(
        schema,
        config.name,
        config.mode,
        config.debugSource
    );
    // compileBoolean() intentionally emits source so V8 can optimize the predicate body.
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
    ) as PredicateFactory;
    const predicate = factory(
        bundle.literals,
        bundle.regexps,
        bundle.keysets,
        bundle.strings,
        makeDynamicCheck(bundle.dynamicSchemas),
        makeDynamicIssueCheck(bundle.dynamicSchemas),
        makeDynamicFirstIssueCheck(bundle.dynamicSchemas),
        strictKeys
    );
    trustedPredicates.add(predicate);
    const compiled = new CompiledBooleanBaseGuard<TValue, TPresence>(
        predicate,
        bundle.source
    );
    writeCachedCompiledBooleanGuard(guard, cacheKey, compiled);
    return compiled;
}

/**
 * @brief Install trusted hot-path methods on a compiled guard instance.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function defineTrustedHotMethods<
    TValue,
    TPresence extends Presence
>(
    guard: CompiledBaseGuard<TValue, TPresence>,
    test: BooleanPredicate,
    checkResult: CheckResultRoot,
    checkFirstResult: CheckResultRoot,
    needsFinalization: boolean
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
         * @brief Run the trusted predicate after receiver validation.
         * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
         */
        function compiledTrustedIs(
            this: unknown,
            value: unknown
        ): value is RuntimeValue<TValue, TPresence> {
            if (this !== self) {
                throw new TypeError("compiled guard method receiver is invalid");
            }
            return runTrustedPredicate(test, value);
        },
        false
    );
    if (needsFinalization) {
        defineReadonlyProperty(
            guard,
            "check",
            /**
             * @brief Run a trusted check and finalize accepted values.
             * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
             */
            function compiledTrustedCheck(
                this: unknown,
                value: unknown,
                options?: Partial<ParseOptions>
            ): CheckResult<RuntimeValue<TValue, TPresence>> {
                if (this !== self) {
                    throw new TypeError("compiled guard method receiver is invalid");
                }
                const result = runCompiledCheckResult<RuntimeValue<TValue, TPresence>>(
                    checkResult,
                    value
                );
                if (result.ok) {
                    return ok(finalizeAcceptedValue(self.schema, result.value));
                }
                return err(applyParseOptions(result.error, value, options));
            },
            false
        );
    } else {
        defineReadonlyProperty(
            guard,
            "check",
            /**
             * @brief Run a trusted check without finalization overhead.
             * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
             */
            function compiledTrustedCheck(
                this: unknown,
                value: unknown
            ): CheckResult<RuntimeValue<TValue, TPresence>> {
                if (this !== self) {
                    throw new TypeError("compiled guard method receiver is invalid");
                }
                // eslint-disable-next-line prefer-rest-params -- Rest arrays allocate on this hot path.
                const args = arguments;
                if (args.length < 2 && !hasGlobalErrorMap) {
                    return runCompiledCheckResult<RuntimeValue<TValue, TPresence>>(
                        checkResult,
                        value
                    );
                }
                const options = args[1] as Partial<ParseOptions> | undefined;
                if (options === undefined && !hasGlobalErrorMap) {
                    return runCompiledCheckResult<RuntimeValue<TValue, TPresence>>(
                        checkResult,
                        value
                    );
                }
                const result = runCompiledCheckResult<RuntimeValue<TValue, TPresence>>(
                    checkResult,
                    value
                );
                if (result.ok) {
                    return result;
                }
                return err(applyParseOptions(result.error, value, options));
            },
            false
        );
    }
    if (needsFinalization) {
        defineReadonlyProperty(
            guard,
            "assert",
            /**
             * @brief Assert with trusted diagnostics and accepted-value finalization.
             * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
             */
            function compiledTrustedAssert(
                this: unknown,
                value: unknown,
                options?: Partial<ParseOptions>
            ): asserts value is RuntimeValue<TValue, TPresence> {
                if (this !== self) {
                    throw new TypeError("compiled guard method receiver is invalid");
                }
                const result = runCompiledCheckResult<RuntimeValue<TValue, TPresence>>(
                    checkResult,
                    value
                );
                if (!result.ok) {
                    throw new TypeSeaAssertionError(
                        applyParseOptions(result.error, value, options)
                    );
                }
                finalizeAcceptedValue(self.schema, value);
            },
            false
        );
        defineReadonlyProperty(
            guard,
            "checkFirst",
            /**
             * @brief Run first-issue checking and finalize accepted values.
             * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
             */
            function compiledTrustedCheckFirst(
                this: unknown,
                value: unknown,
                options?: Partial<ParseOptions>
            ): CheckResult<RuntimeValue<TValue, TPresence>> {
                if (this !== self) {
                    throw new TypeError("compiled guard method receiver is invalid");
                }
                const result = runCompiledCheckResult<RuntimeValue<TValue, TPresence>>(
                    checkFirstResult,
                    value
                );
                if (result.ok) {
                    return ok(finalizeAcceptedValue(self.schema, result.value));
                }
                return err(applyParseOptions(result.error, value, options));
            },
            false
        );
    } else {
        defineReadonlyProperty(
            guard,
            "assert",
            /**
             * @brief Assert with trusted diagnostics and no finalization pass.
             * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
             */
            function compiledTrustedAssert(
                this: unknown,
                value: unknown
            ): asserts value is RuntimeValue<TValue, TPresence> {
                if (this !== self) {
                    throw new TypeError("compiled guard method receiver is invalid");
                }
                const result = runCompiledCheckResult<RuntimeValue<TValue, TPresence>>(
                    checkResult,
                    value
                );
                if (!result.ok) {
                    // eslint-disable-next-line prefer-rest-params -- Rest arrays allocate on this hot path.
                    const args = arguments;
                    const options = args[1] as Partial<ParseOptions> | undefined;
                    throw new TypeSeaAssertionError(
                        (args.length < 2 || options === undefined) && !hasGlobalErrorMap
                            ? result.error
                            : applyParseOptions(result.error, value, options)
                    );
                }
            },
            false
        );
        defineReadonlyProperty(
            guard,
            "checkFirst",
            /**
             * @brief Run first-issue checking without finalization overhead.
             * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
             */
            function compiledTrustedCheckFirst(
                this: unknown,
                value: unknown
            ): CheckResult<RuntimeValue<TValue, TPresence>> {
                if (this !== self) {
                    throw new TypeError("compiled guard method receiver is invalid");
                }
                // eslint-disable-next-line prefer-rest-params -- Rest arrays allocate on this hot path.
                const args = arguments;
                if (args.length < 2 && !hasGlobalErrorMap) {
                    return runCompiledCheckResult<RuntimeValue<TValue, TPresence>>(
                        checkFirstResult,
                        value
                    );
                }
                const options = args[1] as Partial<ParseOptions> | undefined;
                if (options === undefined && !hasGlobalErrorMap) {
                    return runCompiledCheckResult<RuntimeValue<TValue, TPresence>>(
                        checkFirstResult,
                        value
                    );
                }
                const result = runCompiledCheckResult<RuntimeValue<TValue, TPresence>>(
                    checkFirstResult,
                    value
                );
                if (result.ok) {
                    return result;
                }
                return err(applyParseOptions(result.error, value, options));
            },
            false
        );
    }
}

/**
 * @brief Apply output finalization to a compiled success Result.
 */
function finalizeCompiledResult<TValue>(
    schema: Schema,
    result: CheckResult<TValue>,
    needsFinalization: boolean
): CheckResult<TValue> {
    if (!result.ok || !needsFinalization) {
        return result;
    }
    return ok(finalizeAcceptedValue(schema, result.value));
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
    if (!isObjectLike(guard)) {
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
 * @param value Predicate return value.
 * @returns True only for `true`.
 */
function isStrictTrue(value: unknown): boolean {
    return value === true;
}

/**
 * @brief Run a generated predicate with hostile-input failure closure.
 */
function runCompiledPredicate<TValue, TPresence extends Presence>(
    test: BooleanPredicate,
    value: unknown
): value is RuntimeValue<TValue, TPresence> {
    // eslint-disable-next-line no-restricted-syntax
    try {
        return isStrictTrue(test(value));
    } catch {
        if (isInspectableValue(value)) {
            throw new TypeError("compiled guard predicate failed");
        }
        return false;
    }
}

/**
 * @brief Run a trusted generated predicate with hostile-input failure closure.
 */
function runTrustedPredicate<TValue, TPresence extends Presence>(
    test: BooleanPredicate,
    value: unknown
): value is RuntimeValue<TValue, TPresence> {
    // eslint-disable-next-line no-restricted-syntax
    try {
        return test(value);
    } catch {
        if (isInspectableValue(value)) {
            throw new TypeError("compiled guard predicate failed");
        }
        return false;
    }
}

/**
 * @brief Read one own data slot from a compile input object.
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
    let rawIssues: ReturnType<IssueCollectorRoot>;
    // eslint-disable-next-line no-restricted-syntax
    try {
        rawIssues = collect(value);
    } catch {
        if (isInspectableValue(value)) {
            throw new TypeError("compiled guard collector failed");
        }
        return hostileInputResult<TValue>(value);
    }
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
 * @brief Run a generated Result-returning checker with fail-closed traps.
 */
function runCompiledCheckResult<TValue>(
    check: CheckResultRoot,
    value: unknown
): CheckResult<TValue> {
    // eslint-disable-next-line no-restricted-syntax
    try {
        return check(value) as CheckResult<TValue>;
    } catch {
        if (isInspectableValue(value)) {
            throw new TypeError("compiled guard checker failed");
        }
        return hostileInputResult<TValue>(value);
    }
}

/**
 * @brief Build a stable diagnostic for hostile reflection failures.
 */
function hostileInputResult<TValue>(value: unknown): CheckResult<TValue> {
    return err(freezeIssueArray([
        makeIssue(
            Object.freeze([]),
            "expected_object",
            "inspectable value",
            "hostile object",
            undefined,
            value
        )
    ]));
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
 * @brief Define a non-writable method slot on a compiled guard.
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
 * @brief Normalize compile options once for cache keys and codegen.
 * @param options User-supplied compile options.
 * @returns Complete compile options with defaults applied.
 */
function readCompileOptions(options: unknown): ResolvedCompileOptions {
    if (options === undefined) {
        return {
            name: "typesea_is",
            mode: "safe",
            debugSource: false
        };
    }
    if (!isRecord(options)) {
        throw new TypeError("compile options must be an object");
    }
    const name = options["name"];
    if (name !== undefined && typeof name !== "string") {
        throw new TypeError("compile name must be a string");
    }
    const mode = options["mode"];
    if (mode !== undefined &&
        mode !== "safe" &&
        mode !== "unsafe" &&
        mode !== "unchecked") {
        throw new TypeError("compile mode must be \"safe\", \"unsafe\", or \"unchecked\"");
    }
    const debugSource = options["debugSource"];
    if (debugSource !== undefined && typeof debugSource !== "boolean") {
        throw new TypeError("compile debugSource must be a boolean");
    }
    return {
        name: name ?? "typesea_is",
        mode: mode ?? "safe",
        debugSource: debugSource ?? false
    };
}

/**
 * @brief Build the per-guard compile cache key.
 * @param config Normalized compile options.
 * @returns Stable key for one guard instance and compile mode.
 */
function compileCacheKey(config: ResolvedCompileOptions): string {
    return `${config.mode}\n${config.name}\n${config.debugSource ? "debug" : "compact"}`;
}

/**
 * @brief Read a cached compiled guard for the same guard instance.
 */
function readCachedCompiledGuard<TValue, TPresence extends Presence>(
    guard: object,
    cacheKey: string
): CompiledBaseGuard<TValue, TPresence> | undefined {
    return compiledGuardCache.get(guard)?.get(cacheKey) as
        CompiledBaseGuard<TValue, TPresence> | undefined;
}

/**
 * @brief Store a compiled guard for repeated calls with the same guard object.
 */
function writeCachedCompiledGuard<TValue, TPresence extends Presence>(
    guard: object,
    cacheKey: string,
    compiled: CompiledBaseGuard<TValue, TPresence>
): void {
    let entries = compiledGuardCache.get(guard);
    if (entries === undefined) {
        entries = new Map<string, CompiledBaseGuard<unknown, Presence>>();
        compiledGuardCache.set(guard, entries);
    }
    entries.set(cacheKey, compiled);
}

/**
 * @brief Read a cached predicate-only compiled guard for one guard instance.
 */
function readCachedCompiledBooleanGuard<TValue, TPresence extends Presence>(
    guard: object,
    cacheKey: string
): CompiledBooleanBaseGuard<TValue, TPresence> | undefined {
    return compiledBooleanGuardCache.get(guard)?.get(cacheKey) as
        CompiledBooleanBaseGuard<TValue, TPresence> | undefined;
}

/**
 * @brief Store a predicate-only compiled guard for repeated compileBoolean calls.
 */
function writeCachedCompiledBooleanGuard<TValue, TPresence extends Presence>(
    guard: object,
    cacheKey: string,
    compiled: CompiledBooleanBaseGuard<TValue, TPresence>
): void {
    let entries = compiledBooleanGuardCache.get(guard);
    if (entries === undefined) {
        entries = new Map<string, CompiledBooleanBaseGuard<unknown, Presence>>();
        compiledBooleanGuardCache.set(guard, entries);
    }
    entries.set(cacheKey, compiled);
}

/**
 * @brief Warn when compile() repeatedly code-generates from the same callsite.
 */
function maybeWarnRepeatedCompile(): void {
    if (!shouldEmitCompileWarning()) {
        return;
    }
    const callsite = readCompileCallsite();
    const now = Date.now();
    let state = compileWarnings.get(callsite);
    if (state === undefined ||
        now - state.windowStart > COMPILE_WARNING_WINDOW_MS) {
        state = {
            count: 0,
            windowStart: now,
            warned: false
        };
        if (compileWarnings.size > COMPILE_WARNING_LIMIT) {
            compileWarnings.clear();
        }
        compileWarnings.set(callsite, state);
    }
    state.count += 1;
    if (!state.warned && state.count >= COMPILE_WARNING_THRESHOLD) {
        state.warned = true;
        readConsoleWarn()(
            `TypeSea warning: compile() was called ${String(state.count)} times from the same callsite (${callsite}). Move schema construction to module scope or use compileCached()/createCompileCache().`
        );
    }
}

/**
 * @brief Decide whether development compile warnings are enabled.
 */
function shouldEmitCompileWarning(): boolean {
    const env = readProcessEnv();
    const mode = env?.["NODE_ENV"];
    return mode !== "production" && mode !== "test";
}

/**
 * @brief Read the user's compile() callsite from an Error stack.
 */
function readCompileCallsite(): string {
    const stack = new Error().stack;
    if (stack === undefined) {
        return "unknown";
    }
    const lines = stack.split("\n");
    for (let index = 1; index < lines.length; index += 1) {
        const line = lines[index]?.trim();
        if (line === undefined ||
            line.length === 0 ||
            line.includes("maybeWarnRepeatedCompile") ||
            line.includes("readCompileCallsite") ||
            line.includes("compile/guard") ||
            line.includes("dist/compile/guard")) {
            continue;
        }
        return line;
    }
    return "unknown";
}

/**
 * @brief Read process.env without assuming a Node global exists.
 */
function readProcessEnv(): Readonly<Record<string, string | undefined>> | undefined {
    const processLike = (globalThis as {
        readonly process?: {
            readonly env?: Readonly<Record<string, string | undefined>>;
        };
    }).process;
    return processLike?.env;
}

/**
 * @brief Read console.warn through a tiny indirection for tests.
 */
function readConsoleWarn(): (message: string) => void {
    return globalThis.console.warn.bind(globalThis.console);
}

/**
 * @brief Accept non-array objects before structured field reads.
 * @details Code generation helpers keep emitted JavaScript shape stable across runtime and AOT paths.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Accept objects and function objects that can carry own schema slots.
 */
function isObjectLike(value: unknown): value is object {
    return value !== null && (typeof value === "object" || typeof value === "function");
}
