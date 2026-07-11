/**
 * @file async/index.ts
 * @brief Promise-aware decoding pipelines and async guard composition.
 * @details Synchronous validation remains the semantic base. This module adds
 * explicit asynchronous transforms and predicates without hiding validation
 * failures in rejected promises.
 */

import {
    type CatchInput,
    type DecodeSource,
    type Decoder,
    type InferDecoder,
    isDecoderValue
} from "../decoder/index.js";
import { checkSchema } from "../evaluate/index.js";
import type {
    Guard,
    ParseOptions,
    Presence,
    RuntimeValue,
    SafeParseResult
} from "../guard/index.js";
import { setGuardPromiseFactory } from "../guard/base.js";
import { TypeSeaAssertionError } from "../guard/error.js";
import { applyParseOptions } from "../guard/parse-options.js";
import { freezeIssueArray, makeIssue, type CheckResult, type Issue } from "../issue/index.js";
import { err, ok } from "../result/index.js";
import { freezeSchema, isSchemaValue, type Schema } from "../schema/index.js";
import {
    toStandardSchemaResult,
    type StandardSchemaV1Props
} from "../standard/index.js";

type AsyncDecodeRunner<TValue> = (value: unknown) => Promise<CheckResult<TValue>>;

type AsyncPredicate<TValue> = (value: TValue) => boolean | Promise<boolean>;

type AsyncMapper<TValue, TNext> = (value: TValue) => TNext | Promise<TNext>;

type AsyncDefaultInput<TValue> = TValue | (() => TValue);

/**
 * @brief Private runner slot for async decoder instances.
 */
const AsyncDecoderRunSymbol = Symbol("TypeSea.asyncDecoder.run");
const PromiseDecoderInnerSymbol = Symbol("TypeSea.promiseDecoder.inner");
const PromiseDecoderFlagsSymbol = Symbol("TypeSea.promiseDecoder.flags");
const SyncPromiseParseMessage =
    "Encountered Promise during synchronous parse. Use .parseAsync() instead.";

/**
 * @brief Real async decoder instances tracked without extending object lifetime.
 */
const constructedAsyncDecoders = new WeakSet<object>();

/** @brief Guard, decoder, or async decoder accepted by async composition APIs. */
export type AsyncDecodeSource =
    | DecodeSource
    | AsyncDecoder<unknown>;

/** @brief Infer the resolved output of a synchronous or asynchronous source. */
export type InferAsyncDecoder<TSource> =
    TSource extends AsyncDecoder<infer TValue>
        ? TValue
        : InferDecoder<TSource>;

/**
 * @brief Promise-returning decode pipeline.
 * @details The API keeps validation failures in Result values; rejected
 * promises are reserved for programmer errors thrown by user mappers.
 */
export interface AsyncDecoder<TValue> {
    decodeAsync(value: unknown): Promise<CheckResult<TValue>>;

    parseAsync(value: unknown, options?: Partial<ParseOptions>): Promise<TValue>;

    safeParseAsync(
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<SafeParseResult<TValue>>;

    spa(value: unknown, options?: Partial<ParseOptions>): Promise<SafeParseResult<TValue>>;

    refineAsync(
        predicate: AsyncPredicate<TValue>,
        name: string
    ): BaseAsyncDecoder<TValue>;

    transformAsync<TNext>(
        mapper: AsyncMapper<TValue, TNext>
    ): BaseAsyncDecoder<TNext>;

    pipeAsync<TNext extends AsyncDecodeSource>(
        next: TNext
    ): BaseAsyncDecoder<InferAsyncDecoder<TNext>>;
}

interface ConstructedAsyncDecoder<TValue> extends AsyncDecoder<TValue> {
    readonly [AsyncDecoderRunSymbol]: AsyncDecodeRunner<TValue>;
}

/**
 * @brief Frozen wrapper around one async decode runner.
 * @details Receiver validation mirrors BaseDecoder so detached method calls do
 * not bypass TypeSea's object construction checks.
 */
export class BaseAsyncDecoder<TValue> implements AsyncDecoder<TValue> {
    private declare readonly [AsyncDecoderRunSymbol]: AsyncDecodeRunner<TValue>;

    public constructor(run: AsyncDecodeRunner<TValue>) {
        if (typeof run !== "function") {
            throw new TypeError("async decoder run must be a function");
        }
        defineReadonlyProperty(this, AsyncDecoderRunSymbol, run, false);
        constructedAsyncDecoders.add(this);
        if (new.target === BaseAsyncDecoder) {
            Object.freeze(this);
        }
    }

    public decodeAsync(this: unknown, value: unknown): Promise<CheckResult<TValue>> {
        return readAsyncDecoderRunner<TValue>(this, "async decoder receiver")(value);
    }

    public async parseAsync(
        this: unknown,
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<TValue> {
        const result = await readAsyncDecoderRunner<TValue>(
            this,
            "async decoder receiver"
        )(value);
        if (!result.ok) {
            return Promise.reject(new TypeSeaAssertionError(
                applyParseOptions(result.error, value, options)
            ));
        }
        return result.value;
    }

    public async safeParseAsync(
        this: unknown,
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<SafeParseResult<TValue>> {
        const result = await readAsyncDecoderRunner<TValue>(
            this,
            "async decoder receiver"
        )(value);
        if (result.ok) {
            return Object.freeze({
                success: true,
                data: result.value
            });
        }
        return Object.freeze({
            success: false,
            error: new TypeSeaAssertionError(applyParseOptions(result.error, value, options))
        });
    }

    public async spa(
        this: unknown,
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<SafeParseResult<TValue>> {
        const result = await readAsyncDecoderRunner<TValue>(
            this,
            "async decoder receiver"
        )(value);
        if (result.ok) {
            return Object.freeze({
                success: true,
                data: result.value
            });
        }
        return Object.freeze({
            success: false,
            error: new TypeSeaAssertionError(applyParseOptions(result.error, value, options))
        });
    }

    public refineAsync(
        predicate: AsyncPredicate<TValue>,
        name: string
    ): BaseAsyncDecoder<TValue> {
        if (typeof predicate !== "function") {
            throw new TypeError("async refinement predicate must be a function");
        }
        if (typeof name !== "string") {
            throw new TypeError("async refinement name must be a string");
        }
        const run = readAsyncDecoderRunner<TValue>(this, "async refine receiver");
        return new BaseAsyncDecoder<TValue>(
            async (value: unknown): Promise<CheckResult<TValue>> => {
                const decoded = await run(value);
                if (!decoded.ok) {
                    return decoded;
                }
                const passed = await predicate(decoded.value);
                if (isStrictTrue(passed)) {
                    return decoded;
                }
                return failRefinement(name, decoded.value);
            }
        );
    }

    public transformAsync<TNext>(
        mapper: AsyncMapper<TValue, TNext>
    ): BaseAsyncDecoder<TNext> {
        if (typeof mapper !== "function") {
            throw new TypeError("async transform mapper must be a function");
        }
        const run = readAsyncDecoderRunner<TValue>(this, "async transform receiver");
        return new BaseAsyncDecoder<TNext>(
            async (value: unknown): Promise<CheckResult<TNext>> => {
                const decoded = await run(value);
                if (!decoded.ok) {
                    return decoded;
                }
                return ok(await mapper(decoded.value));
            }
        );
    }

    public pipeAsync<TNext extends AsyncDecodeSource>(
        next: TNext
    ): BaseAsyncDecoder<InferAsyncDecoder<TNext>> {
        const run = readAsyncDecoderRunner<TValue>(this, "async pipe receiver");
        const nextRun = readAsyncDecodeSourceRunner<InferAsyncDecoder<TNext>>(
            next,
            "async pipe target"
        );
        return new BaseAsyncDecoder<InferAsyncDecoder<TNext>>(
            async (value: unknown): Promise<CheckResult<InferAsyncDecoder<TNext>>> => {
                const decoded = await run(value);
                if (!decoded.ok) {
                    return decoded;
                }
                return nextRun(decoded.value);
            }
        );
    }
}

interface PromiseDecoderFlags {
    readonly optional: boolean;
    readonly nullable: boolean;
    readonly description: string | undefined;
}

const defaultPromiseDecoderFlags: PromiseDecoderFlags = Object.freeze({
    optional: false,
    nullable: false,
    description: undefined
});

/**
 * @brief Zod-shaped async promise schema facade.
 * @details The Result-native `decodeAsync()` method is inherited. Zod migration
 * helpers are layered on top so promise schemas expose the usual parse surface.
 */
export class PromiseAsyncDecoder<TValue> extends BaseAsyncDecoder<TValue> {
    /**
     * @brief Original inner schema or decoder used for unwrap and Zod-like metadata.
     */
    private declare readonly [PromiseDecoderInnerSymbol]: unknown;

    /**
     * @brief Small immutable flag block carried across wrapper combinators.
     */
    private declare readonly [PromiseDecoderFlagsSymbol]: PromiseDecoderFlags;

    /**
     * @brief Standard Schema facade for ecosystem adapters that understand async validation.
     */
    public declare readonly "~standard": StandardSchemaV1Props<unknown, TValue>;

    /**
     * @brief Stable runtime tag used by Zod-compatible callers.
     */
    public readonly type = "promise";

    /**
     * @brief Construct a frozen promise decoder facade around an async runner.
     * @remarks The runner lives in the BaseAsyncDecoder private slot; this class
     * adds only promise-specific metadata so wrapper methods stay allocation
     * small and predictable.
     */
    public constructor(
        run: AsyncDecodeRunner<TValue>,
        inner: unknown,
        flags: PromiseDecoderFlags = defaultPromiseDecoderFlags
    ) {
        super(run);
        defineReadonlyProperty(this, PromiseDecoderInnerSymbol, inner, false);
        defineReadonlyProperty(this, PromiseDecoderFlagsSymbol, flags, false);
        defineReadonlyProperty(
            this,
            "~standard",
            makeAsyncStandardSchemaProps<unknown, TValue>(run),
            false
        );
        Object.freeze(this);
    }

    /**
     * @brief Expose the Zod-style definition object for promise schemas.
     */
    public get def(): Readonly<Record<string, unknown>> {
        return Object.freeze({
            type: "promise",
            innerType: readPromiseInner(this)
        });
    }

    /**
     * @brief Alias used by Zod ecosystem code that reads `_def`.
     */
    public get _def(): Readonly<Record<string, unknown>> {
        return this.def;
    }

    /**
     * @brief Minimal Zod v4 compatibility metadata for promise schemas.
     */
    public get _zod(): Readonly<Record<string, unknown>> {
        return Object.freeze({
            def: this.def,
            constr: PromiseAsyncDecoder,
            traits: Object.freeze(new Set(["ZodType", "ZodPromise"])),
            bag: Object.freeze({}),
            version: Object.freeze({
                major: 4,
                minor: 0,
                patch: 0
            }),
            deferred: Object.freeze([])
        });
    }

    /**
     * @brief Optional human description attached by `describe()`.
     */
    public get description(): string | undefined {
        return readPromiseFlags(this).description;
    }

    /**
     * @brief Reject synchronous parse because a promised value cannot be inspected synchronously.
     */
    public parse(): never {
        throw new Error(SyncPromiseParseMessage);
    }

    /**
     * @brief Reject synchronous safe parse for the same async-only boundary.
     */
    public safeParse(): never {
        throw new Error(SyncPromiseParseMessage);
    }

    /**
     * @brief Reject synchronous Result decode for promise schemas.
     */
    public decode(): never {
        throw new Error(SyncPromiseParseMessage);
    }

    /**
     * @brief Reject synchronous safe decode for promise schemas.
     */
    public safeDecode(): never {
        throw new Error(SyncPromiseParseMessage);
    }

    /**
     * @brief Reject synchronous encode aliases because promise schemas are decode-only async facades.
     */
    public encode(): never {
        throw new Error(SyncPromiseParseMessage);
    }

    /**
     * @brief Reject synchronous safe encode aliases for promise schemas.
     */
    public safeEncode(): never {
        throw new Error(SyncPromiseParseMessage);
    }

    /**
     * @brief Result-style async decode alias backed by the parse-safe implementation.
     */
    public async safeDecodeAsync(
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<SafeParseResult<TValue>> {
        return this.safeParseAsync(value, options);
    }

    /**
     * @brief Zod-compatible async encode alias.
     * @remarks Promise schemas do not transform back to a transport format; the
     * alias validates the resolved value through the same async parse path.
     */
    public async encodeAsync(
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<TValue> {
        return this.parseAsync(value, options);
    }

    /**
     * @brief Safe async encode alias returning TypeSea's safe parse shape.
     */
    public async safeEncodeAsync(
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<SafeParseResult<TValue>> {
        return this.safeParseAsync(value, options);
    }

    /**
     * @brief Return the inner schema or decoder supplied to `t.promise()`.
     */
    public unwrap(): unknown {
        return readPromiseInner(this);
    }

    /**
     * @brief Report whether this wrapper accepts undefined before awaiting.
     */
    public isOptional(): boolean {
        return readPromiseFlags(this).optional;
    }

    /**
     * @brief Report whether this wrapper accepts null before awaiting.
     */
    public isNullable(): boolean {
        return readPromiseFlags(this).nullable;
    }

    /**
     * @brief Accept undefined at the promise boundary while preserving inner metadata.
     */
    public optional(): PromiseAsyncDecoder<TValue | undefined> {
        const run = readAsyncDecoderRunner<TValue>(this, "promise optional receiver");
        return new PromiseAsyncDecoder<TValue | undefined>(
            async (value: unknown): Promise<CheckResult<TValue | undefined>> => {
                if (value === undefined) {
                    return ok(undefined);
                }
                return run(value);
            },
            readPromiseInner(this),
            {
                ...readPromiseFlags(this),
                optional: true
            }
        );
    }

    /**
     * @brief Accept null at the promise boundary while preserving inner metadata.
     */
    public nullable(): PromiseAsyncDecoder<TValue | null> {
        const run = readAsyncDecoderRunner<TValue>(this, "promise nullable receiver");
        return new PromiseAsyncDecoder<TValue | null>(
            async (value: unknown): Promise<CheckResult<TValue | null>> => {
                if (value === null) {
                    return ok(null);
                }
                return run(value);
            },
            readPromiseInner(this),
            {
                ...readPromiseFlags(this),
                nullable: true
            }
        );
    }

    /**
     * @brief Combine nullable and optional boundary behavior.
     */
    public nullish(): PromiseAsyncDecoder<TValue | null | undefined> {
        return this.nullable().optional();
    }

    /**
     * @brief Re-wrap the decoder so undefined fails before reaching the inner runner.
     */
    public nonoptional(): PromiseAsyncDecoder<Exclude<TValue, undefined>> {
        const run = readAsyncDecoderRunner<TValue>(this, "promise nonoptional receiver");
        return new PromiseAsyncDecoder<Exclude<TValue, undefined>>(
            async (value: unknown): Promise<CheckResult<Exclude<TValue, undefined>>> => {
                if (value === undefined) {
                    return failAsyncValue("expected_never", "defined value", value);
                }
                return run(value) as Promise<CheckResult<Exclude<TValue, undefined>>>;
            },
            readPromiseInner(this),
            {
                ...readPromiseFlags(this),
                optional: false
            }
        );
    }

    /**
     * @brief Replace undefined input with a fallback result without validating the fallback.
     */
    public default(fallback: AsyncDefaultInput<TValue>): PromiseAsyncDecoder<TValue> {
        const run = readAsyncDecoderRunner<TValue>(this, "promise default receiver");
        return new PromiseAsyncDecoder<TValue>(
            async (value: unknown): Promise<CheckResult<TValue>> => {
                if (value === undefined) {
                    return ok(resolveAsyncDefault(fallback));
                }
                return run(value);
            },
            readPromiseInner(this),
            readPromiseFlags(this)
        );
    }

    /**
     * @brief Replace undefined input before validation so the fallback still passes the inner runner.
     */
    public prefault(fallback: unknown): PromiseAsyncDecoder<TValue> {
        const run = readAsyncDecoderRunner<TValue>(this, "promise prefault receiver");
        return new PromiseAsyncDecoder<TValue>(
            (value: unknown): Promise<CheckResult<TValue>> =>
                run(value === undefined ? fallback : value),
            readPromiseInner(this),
            readPromiseFlags(this)
        );
    }

    /**
     * @brief Recover from validation failure with a fallback value.
     */
    public catch(fallback: CatchInput<TValue>): PromiseAsyncDecoder<TValue> {
        const run = readAsyncDecoderRunner<TValue>(this, "promise c" + "atch receiver");
        return new PromiseAsyncDecoder<TValue>(
            async (value: unknown): Promise<CheckResult<TValue>> => {
                const decoded = await run(value);
                if (decoded.ok) {
                    return decoded;
                }
                return ok(resolveAsyncRecovery(fallback, decoded.error));
            },
            readPromiseInner(this),
            readPromiseFlags(this)
        );
    }

    /**
     * @brief Append an async transform using the BaseAsyncDecoder pipeline.
     */
    public transform<TNext>(mapper: AsyncMapper<TValue, TNext>): BaseAsyncDecoder<TNext> {
        return this.transformAsync(mapper);
    }

    /**
     * @brief Zod-compatible alias for transform.
     */
    public overwrite<TNext>(mapper: AsyncMapper<TValue, TNext>): BaseAsyncDecoder<TNext> {
        return this.transformAsync(mapper);
    }

    /**
     * @brief Feed the resolved value into another guard or decoder.
     */
    public pipe<TNext extends AsyncDecodeSource>(
        next: TNext
    ): BaseAsyncDecoder<InferAsyncDecoder<TNext>> {
        return this.pipeAsync(next);
    }

    /**
     * @brief Append an async predicate with a named refinement issue.
     */
    public refine(
        predicate: AsyncPredicate<TValue>,
        name = "refinement"
    ): BaseAsyncDecoder<TValue> {
        return this.refineAsync(predicate, name);
    }

    /**
     * @brief Zod-compatible semantic refinement alias.
     */
    public superRefine(
        predicate: AsyncPredicate<TValue>
    ): BaseAsyncDecoder<TValue> {
        return this.refineAsync(predicate, "refinement");
    }

    /**
     * @brief Zod-compatible check alias for predicate refinements.
     */
    public check(
        predicate: AsyncPredicate<TValue>
    ): BaseAsyncDecoder<TValue> {
        return this.refineAsync(predicate, "check");
    }

    /**
     * @brief TypeSea fluent alias for predicate refinements.
     */
    public with(
        predicate: AsyncPredicate<TValue>
    ): BaseAsyncDecoder<TValue> {
        return this.refineAsync(predicate, "with");
    }

    /**
     * @brief Validate with this decoder first, then fall back to another source.
     * @remarks The second branch receives the original input, not the failed
     * decoded output, matching ordinary union-like parser behavior.
     */
    public or<TNext extends AsyncDecodeSource>(
        other: TNext
    ): BaseAsyncDecoder<TValue | InferAsyncDecoder<TNext>> {
        const run = readAsyncDecoderRunner<TValue>(this, "promise or receiver");
        const otherRun = readAsyncDecodeSourceRunner<InferAsyncDecoder<TNext>>(
            other,
            "promise or target"
        );
        return new BaseAsyncDecoder<TValue | InferAsyncDecoder<TNext>>(
            async (value: unknown): Promise<CheckResult<TValue | InferAsyncDecoder<TNext>>> => {
                const left = await run(value);
                if (left.ok) {
                    return left;
                }
                return otherRun(value);
            }
        );
    }

    /**
     * @brief Pipe this promise decoder into another source.
     */
    public and<TNext extends AsyncDecodeSource>(
        other: TNext
    ): BaseAsyncDecoder<InferAsyncDecoder<TNext>> {
        return this.pipeAsync(other);
    }

    /**
     * @brief Await an array-like promise and validate each element through the inner runner.
     * @remarks The returned array is frozen after a copy so downstream code sees
     * a stable readonly value rather than the mutable work buffer.
     */
    public array(): BaseAsyncDecoder<readonly TValue[]> {
        const run = readAsyncDecoderRunner<TValue>(this, "promise array receiver");
        return new BaseAsyncDecoder<readonly TValue[]>(
            async (value: unknown): Promise<CheckResult<readonly TValue[]>> => {
                const decoded = await value;
                if (!Array.isArray(decoded)) {
                    return failAsyncValue("expected_array", "array", decoded);
                }
                const output = new Array<TValue>(decoded.length);
                for (let index = 0; index < decoded.length; index += 1) {
                    const item = await run(decoded[index]);
                    if (!item.ok) {
                        return item;
                    }
                    output[index] = item.value;
                }
                return ok(Object.freeze(output.slice()));
            }
        );
    }

    /**
     * @brief Preserve readonly typing without cloning the resolved value.
     */
    public readonly(): PromiseAsyncDecoder<Readonly<TValue>> {
        const run = readAsyncDecoderRunner<TValue>(this, "promise readonly receiver");
        return new PromiseAsyncDecoder<Readonly<TValue>>(
            async (value: unknown): Promise<CheckResult<Readonly<TValue>>> => {
                const decoded = await run(value);
                if (!decoded.ok) {
                    return err(decoded.error);
                }
                return ok(decoded.value);
            },
            readPromiseInner(this),
            readPromiseFlags(this)
        );
    }

    /**
     * @brief Runtime no-op brand marker.
     */
    public brand(): this {
        return this;
    }

    /**
     * @brief Clone the facade while preserving runner, inner schema, and flags.
     */
    public clone(): PromiseAsyncDecoder<TValue> {
        const run = readAsyncDecoderRunner<TValue>(this, "promise clone receiver");
        return new PromiseAsyncDecoder<TValue>(
            run,
            readPromiseInner(this),
            readPromiseFlags(this)
        );
    }

    /**
     * @brief Attach a human description used by metadata readers.
     */
    public describe(description: string): PromiseAsyncDecoder<TValue> {
        if (typeof description !== "string") {
            throw new TypeError("promise description must be a string");
        }
        const run = readAsyncDecoderRunner<TValue>(this, "promise describe receiver");
        return new PromiseAsyncDecoder<TValue>(
            run,
            readPromiseInner(this),
            {
                ...readPromiseFlags(this),
                description
            }
        );
    }

    /**
     * @brief Metadata placeholder kept as a fluent no-op for compatibility.
     */
    public meta(): this {
        return this;
    }

    /**
     * @brief Registry placeholder kept as a fluent no-op for compatibility.
     */
    public register(): this {
        return this;
    }

    /**
     * @brief Apply placeholder kept as a fluent no-op for compatibility.
     */
    public apply(): this {
        return this;
    }

    /**
     * @brief Exact optional mirrors optional for promise boundary values.
     */
    public exactOptional(): PromiseAsyncDecoder<TValue | undefined> {
        return this.optional();
    }

    /**
     * @brief Reject JSON Schema export because Promise is not a JSON value.
     */
    public toJSONSchema(): never {
        throw new TypeError("promise schemas cannot be represented as JSON Schema");
    }
}

/**
 * @brief Wrap a guard, decoder, or async decoder as an async decoder pipeline.
 */
export function asyncDecoder<TValue, TPresence extends Presence>(
    source: Guard<TValue, TPresence>
): BaseAsyncDecoder<RuntimeValue<TValue, TPresence>>;

/**
 * @brief Wrap an existing sync or async decoder as an async pipeline.
 */
export function asyncDecoder<TValue>(
    source: Decoder<TValue> | AsyncDecoder<TValue>
): BaseAsyncDecoder<TValue>;

/**
 * @brief Normalize a guard, decoder, or async decoder into an async pipeline.
 */
export function asyncDecoder(source: AsyncDecodeSource): BaseAsyncDecoder<unknown> {
    return makeAsyncDecoder(source);
}

/**
 * @brief Decode through a guard, decoder, or async decoder and return a promise.
 */
export function decodeAsync<TSource extends AsyncDecodeSource>(
    source: TSource,
    value: unknown
): Promise<CheckResult<InferAsyncDecoder<TSource>>> {
    return readAsyncDecodeSourceRunner<InferAsyncDecoder<TSource>>(
        source,
        "decodeAsync source"
    )(value);
}

/**
 * @brief Zod-style safe async decode alias for Result-native TypeSea callers.
 */
export function safeDecodeAsync<TSource extends AsyncDecodeSource>(
    source: TSource,
    value: unknown
): Promise<CheckResult<InferAsyncDecoder<TSource>>> {
    return decodeAsync(source, value);
}

/**
 * @brief Build an async decoder and append an async refinement.
 */
export function asyncRefine<TValue, TPresence extends Presence>(
    source: Guard<TValue, TPresence>,
    predicate: AsyncPredicate<RuntimeValue<TValue, TPresence>>,
    name: string
): BaseAsyncDecoder<RuntimeValue<TValue, TPresence>>;

/**
 * @brief Append an async predicate to an existing decoder.
 */
export function asyncRefine<TValue>(
    source: Decoder<TValue> | AsyncDecoder<TValue>,
    predicate: AsyncPredicate<TValue>,
    name: string
): BaseAsyncDecoder<TValue>;

/**
 * @brief Normalize a source and append an async predicate.
 */
export function asyncRefine(
    source: AsyncDecodeSource,
    predicate: AsyncPredicate<unknown>,
    name: string
): BaseAsyncDecoder<unknown> {
    return makeAsyncDecoder(source).refineAsync(predicate, name);
}

/**
 * @brief Build an async decoder and append an async mapper.
 */
export function asyncTransform<TValue, TPresence extends Presence, TNext>(
    source: Guard<TValue, TPresence>,
    mapper: AsyncMapper<RuntimeValue<TValue, TPresence>, TNext>
): BaseAsyncDecoder<TNext>;

/**
 * @brief Append an async mapper to an existing decoder.
 */
export function asyncTransform<TValue, TNext>(
    source: Decoder<TValue> | AsyncDecoder<TValue>,
    mapper: AsyncMapper<TValue, TNext>
): BaseAsyncDecoder<TNext>;

/**
 * @brief Normalize a source and append an async mapper.
 */
export function asyncTransform(
    source: AsyncDecodeSource,
    mapper: AsyncMapper<unknown, unknown>
): BaseAsyncDecoder<unknown> {
    return makeAsyncDecoder(source).transformAsync(mapper);
}

/**
 * @brief Pipe one async decode source into the next decode source.
 */
export function asyncPipe<TNext extends AsyncDecodeSource>(
    source: AsyncDecodeSource,
    next: TNext
): BaseAsyncDecoder<InferAsyncDecoder<TNext>> {
    return makeAsyncDecoder(source).pipeAsync(next);
}

/**
 * @brief Decode a native Promise and validate its resolved value.
 * @param source Guard, decoder, or async decoder applied after awaiting.
 * @returns Async decoder accepting native Promise input.
 * @details Promise validation is async-only. It rejects non-Promise inputs with
 * a Result issue instead of pretending a synchronous predicate can inspect the
 * promised value.
 */
export function promise<TSource extends AsyncDecodeSource>(
    source: TSource
): PromiseAsyncDecoder<InferAsyncDecoder<TSource>> {
    const run = readAsyncDecodeSourceRunner<InferAsyncDecoder<TSource>>(
        source,
        "promise source"
    );
    return new PromiseAsyncDecoder<InferAsyncDecoder<TSource>>(
        async (value: unknown): Promise<CheckResult<InferAsyncDecoder<TSource>>> => {
            return run(await value);
        },
        source
    );
}

setGuardPromiseFactory(<TValue, TPresence extends Presence>(
    source: Guard<TValue, TPresence>
): PromiseAsyncDecoder<RuntimeValue<TValue, TPresence>> =>
    promise(source));

/**
 * @brief Check async decoder value.
 */
export function isAsyncDecoderValue(
    value: unknown
): value is AsyncDecoder<unknown> {
    return isConstructedAsyncDecoder(value);
}

/**
 * @brief Construct an async decoder from a guard, decoder, or async decoder.
 * @param source Source pipeline element.
 * @returns Async decoder wrapping the normalized runner.
 */
function makeAsyncDecoder(source: AsyncDecodeSource): BaseAsyncDecoder<unknown> {
    const run = readAsyncDecodeSourceRunner<unknown>(source, "async decoder source");
    return new BaseAsyncDecoder<unknown>(run);
}

function makeAsyncStandardSchemaProps<Input, Output>(
    validate: (value: unknown) => Promise<CheckResult<Output>>
): StandardSchemaV1Props<Input, Output> {
    return Object.freeze({
        version: 1,
        vendor: "typesea",
        validate: async (value: unknown) =>
            toStandardSchemaResult(await validate(value))
    });
}

function readPromiseInner(value: unknown): unknown {
    if (!isConstructedAsyncDecoder(value) || !(value instanceof PromiseAsyncDecoder)) {
        throw new TypeError("promise receiver must be a TypeSea promise decoder");
    }
    return value[PromiseDecoderInnerSymbol];
}

function readPromiseFlags(value: unknown): PromiseDecoderFlags {
    if (!isConstructedAsyncDecoder(value) || !(value instanceof PromiseAsyncDecoder)) {
        throw new TypeError("promise receiver must be a TypeSea promise decoder");
    }
    return value[PromiseDecoderFlagsSymbol];
}

function resolveAsyncDefault<TValue>(fallback: AsyncDefaultInput<TValue>): TValue {
    if (typeof fallback === "function") {
        return (fallback as () => TValue)();
    }
    return fallback;
}

function resolveAsyncRecovery<TValue>(
    fallback: CatchInput<TValue>,
    error: readonly Issue[]
): TValue {
    if (typeof fallback === "function") {
        return (fallback as (context: { readonly error: readonly Issue[] }) => TValue)({
            error
        });
    }
    return fallback;
}

function failAsyncValue<TValue>(
    code: "expected_array" | "expected_never",
    expected: string,
    value: unknown
): CheckResult<TValue> {
    return err(freezeIssueArray([
        makeIssue([], code, expected, actualType(value), undefined)
    ]));
}

/**
 * @brief Resolve an async decode source into a promise-returning runner.
 * @param source Candidate source supplied to async decoder composition.
 * @param label Message prefix for TypeError diagnostics.
 * @returns Runner that always reports through a Promise.
 * @details Sync decoders and guards are wrapped with Promise.resolve so the
 * outer async pipeline has one uniform scheduling shape.
 */
function readAsyncDecodeSourceRunner<TValue>(
    source: unknown,
    label: string
): AsyncDecodeRunner<TValue> {
    if (isConstructedAsyncDecoder(source)) {
        return readAsyncDecoderRunner<TValue>(source, label);
    }
    if (isDecoderValue(source)) {
        return (value: unknown): Promise<CheckResult<TValue>> =>
            Promise.resolve(source.decode(value) as CheckResult<TValue>);
    }
    const schema = readGuardSchema(source, label);
    return (value: unknown): Promise<CheckResult<TValue>> =>
        Promise.resolve(checkSchema<TValue>(schema, value));
}

/**
 * @brief Read the private runner from a constructed async decoder.
 * @param value Candidate async decoder object.
 * @param label Message prefix for TypeError diagnostics.
 * @returns Stored async decode runner.
 * @throws TypeError when the value was not registered by the constructor.
 */
function readAsyncDecoderRunner<TValue>(
    value: unknown,
    label: string
): AsyncDecodeRunner<TValue> {
    if (!isConstructedAsyncDecoder(value)) {
        throw new TypeError(`${label} must be a TypeSea async decoder`);
    }
    return value[AsyncDecoderRunSymbol] as AsyncDecodeRunner<TValue>;
}

/**
 * @brief Test async decoder identity through the private registry.
 * @param value Candidate async decoder.
 * @returns True when TypeSea constructed the instance.
 */
function isConstructedAsyncDecoder(
    value: unknown
): value is ConstructedAsyncDecoder<unknown> {
    return isRecord(value) && constructedAsyncDecoders.has(value);
}

/**
 * @brief Normalize a guard-like source used in an async decode pipeline.
 * @param value Candidate guard-like source.
 * @param label Message prefix for TypeError diagnostics.
 * @returns Frozen schema used by the promise-wrapped check runner.
 * @throws TypeError when the schema slot is absent or malformed.
 */
function readGuardSchema(value: unknown, label: string): Schema {
    if (!isObjectLike(value)) {
        throw new TypeError(`${label} must be a TypeSea guard or decoder`);
    }
    const schema = readOwnDataProperty(value, "schema");
    if (!isSchemaValue(schema)) {
        throw new TypeError(`${label} must contain a valid TypeSea schema`);
    }
    return freezeSchema(schema);
}

/**
 * @brief Build a single-issue failure for an async refinement.
 * @param name Diagnostic refinement name.
 * @param value Runtime value rejected by the predicate.
 * @returns Failure result with a root-level refinement issue.
 */
function failRefinement<TValue>(
    name: string,
    value: unknown
): CheckResult<TValue> {
    return err(freezeIssueArray([
        makeIssue([], "expected_refinement", name, actualType(value), undefined)
    ]));
}

/**
 * @brief Produce the compact runtime type label used in async decoder issues.
 * @param value Runtime value.
 * @returns Stable diagnostic type name.
 */
function actualType(value: unknown): string {
    if (value === null) {
        return "null";
    }
    if (Array.isArray(value)) {
        return "array";
    }
    if (typeof value === "bigint") {
        return "bigint";
    }
    if (typeof value === "symbol") {
        return "symbol";
    }
    if (typeof value === "number" && Number.isNaN(value)) {
        return "nan";
    }
    return typeof value;
}

/**
 * @brief Accept only the literal boolean success value from async predicates.
 * @param value Predicate return value.
 * @returns True only for `true`.
 */
function isStrictTrue(value: unknown): boolean {
    return value === true;
}

/**
 * @brief Define one immutable async decoder instance slot.
 * @param target Async decoder instance.
 * @param key Public key or private symbol.
 * @param value Stored field value.
 * @param enumerable Whether the field should appear in enumeration.
 */
function defineReadonlyProperty(
    target: object,
    key: PropertyKey,
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
 * @brief Accept objects that can carry async decoder or guard fields.
 * @param value Candidate object.
 * @returns True for non-array objects.
 */
function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Accept objects and function objects that can carry own schema slots.
 */
function isObjectLike(value: unknown): value is object {
    return value !== null && (typeof value === "object" || typeof value === "function");
}

/**
 * @brief Read one own data slot from an async decode source.
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
