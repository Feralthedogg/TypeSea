import {
    type DecodeSource,
    type Decoder,
    type InferDecoder,
    isDecoderValue
} from "../decoder/index.js";
import { checkSchema } from "../evaluate/index.js";
import type { Guard, Presence, RuntimeValue } from "../guard/index.js";
import { freezeIssueArray, makeIssue, type CheckResult } from "../issue/index.js";
import { err, ok } from "../result/index.js";
import { freezeSchema, isSchemaValue, type Schema } from "../schema/index.js";

type AsyncDecodeRunner<TValue> = (value: unknown) => Promise<CheckResult<TValue>>;

type AsyncPredicate<TValue> = (value: TValue) => boolean | Promise<boolean>;

type AsyncMapper<TValue, TNext> = (value: TValue) => TNext | Promise<TNext>;

/**
 * @brief Private runner slot for async decoder instances.
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
 */
const AsyncDecoderRunSymbol = Symbol("TypeSea.asyncDecoder.run");

/**
 * @brief Real async decoder instances tracked without extending object lifetime.
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
 */
const constructedAsyncDecoders = new WeakSet<object>();

export type AsyncDecodeSource =
    | DecodeSource
    | AsyncDecoder<unknown>;

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
        Object.freeze(this);
    }

    public decodeAsync(this: unknown, value: unknown): Promise<CheckResult<TValue>> {
        return readAsyncDecoderRunner<TValue>(this, "async decoder receiver")(value);
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

/**
 * @brief Wrap a guard, decoder, or async decoder as an async decoder pipeline.
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
 */
export function asyncDecoder<TValue, TPresence extends Presence>(
    source: Guard<TValue, TPresence>
): BaseAsyncDecoder<RuntimeValue<TValue, TPresence>>;

/**
 * @brief Execute async decoder.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
export function asyncDecoder<TValue>(
    source: Decoder<TValue> | AsyncDecoder<TValue>
): BaseAsyncDecoder<TValue>;

/**
 * @brief Execute async decoder.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
export function asyncDecoder(source: AsyncDecodeSource): BaseAsyncDecoder<unknown> {
    return makeAsyncDecoder(source);
}

/**
 * @brief Build an async decoder and append an async refinement.
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
 */
export function asyncRefine<TValue, TPresence extends Presence>(
    source: Guard<TValue, TPresence>,
    predicate: AsyncPredicate<RuntimeValue<TValue, TPresence>>,
    name: string
): BaseAsyncDecoder<RuntimeValue<TValue, TPresence>>;

/**
 * @brief Execute async refine.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
export function asyncRefine<TValue>(
    source: Decoder<TValue> | AsyncDecoder<TValue>,
    predicate: AsyncPredicate<TValue>,
    name: string
): BaseAsyncDecoder<TValue>;

/**
 * @brief Execute async refine.
 * @details This helper keeps a local invariant explicit at the module boundary.
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
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
 */
export function asyncTransform<TValue, TPresence extends Presence, TNext>(
    source: Guard<TValue, TPresence>,
    mapper: AsyncMapper<RuntimeValue<TValue, TPresence>, TNext>
): BaseAsyncDecoder<TNext>;

/**
 * @brief Execute async transform.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
export function asyncTransform<TValue, TNext>(
    source: Decoder<TValue> | AsyncDecoder<TValue>,
    mapper: AsyncMapper<TValue, TNext>
): BaseAsyncDecoder<TNext>;

/**
 * @brief Execute async transform.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
export function asyncTransform(
    source: AsyncDecodeSource,
    mapper: AsyncMapper<unknown, unknown>
): BaseAsyncDecoder<unknown> {
    return makeAsyncDecoder(source).transformAsync(mapper);
}

/**
 * @brief Execute async pipe.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
export function asyncPipe<TNext extends AsyncDecodeSource>(
    source: AsyncDecodeSource,
    next: TNext
): BaseAsyncDecoder<InferAsyncDecoder<TNext>> {
    return makeAsyncDecoder(source).pipeAsync(next);
}

/**
 * @brief Check async decoder value.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
export function isAsyncDecoderValue(
    value: unknown
): value is AsyncDecoder<unknown> {
    return isConstructedAsyncDecoder(value);
}

/**
 * @brief Construct an async decoder from a guard, decoder, or async decoder.
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
 * @param source Source pipeline element.
 * @returns Async decoder wrapping the normalized runner.
 */
function makeAsyncDecoder(source: AsyncDecodeSource): BaseAsyncDecoder<unknown> {
    const run = readAsyncDecodeSourceRunner<unknown>(source, "async decoder source");
    return new BaseAsyncDecoder<unknown>(run);
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
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
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
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
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
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
 * @param value Candidate guard-like source.
 * @param label Message prefix for TypeError diagnostics.
 * @returns Frozen schema used by the promise-wrapped check runner.
 * @throws TypeError when the schema slot is absent or malformed.
 */
function readGuardSchema(value: unknown, label: string): Schema {
    if (!isRecord(value)) {
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
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
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
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
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
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
 * @param value Predicate return value.
 * @returns True only for `true`.
 */
function isStrictTrue(value: unknown): boolean {
    return value === true;
}

/**
 * @brief Define one immutable async decoder instance slot.
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
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
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
 * @param value Candidate object.
 * @returns True for non-array objects.
 */
function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Read one own data slot from an async decode source.
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
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
