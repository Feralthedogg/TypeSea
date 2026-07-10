import { checkSchema } from "../evaluate/index.js";
import { readMapEntries, readSetValues } from "../evaluate/shared.js";
import type {
    CheckMessageInput,
    CheckMessageOptions,
    Guard,
    GuardPresence,
    GuardValue,
    ParseOptions,
    Presence,
    RuntimeValue,
    SafeParseResult,
    StringEmailOptions,
    StringHashAlgorithm,
    StringHashEncoding,
    StringHashOptions,
    StringIsoDateTimeOptions,
    StringIsoTimeOptions,
    StringJwtOptions,
    StringMacDelimiter,
    StringMacOptions,
    StringNormalizationForm,
    StringUrlOptions,
    StringUuidOptions,
    StringUuidVersion
} from "../guard/index.js";
import { TypeSeaAssertionError } from "../guard/error.js";
import { readCheckMessage } from "../guard/check-message.js";
import { applyParseOptions } from "../guard/parse-options.js";
import {
    checkDateBound,
    checkFiniteNumberBound,
    checkStringLengthBound
} from "../guard/read.js";
import type { CheckResult, Issue, IssueCode, PathSegment } from "../issue/index.js";
import { freezeIssueArray, makeIssue } from "../issue/index.js";
import {
    BigIntCheckTag,
    DateCheckTag,
    NumberCheckTag,
    ObjectModeTag,
    SchemaTag,
    StringCheckTag
} from "../kind/index.js";
import { err } from "../result/index.js";
import { freezeSchema, isSchemaValue, type Schema } from "../schema/index.js";
import { closedStringRecordKeys } from "../schema/record-keys.js";
import { recordKeyInput } from "../schema/record-key.js";
import { makeStandardSchemaProps, type StandardSchemaV1Props } from "../standard/index.js";

type DecodeRunner<TValue> = (value: unknown) => CheckResult<TValue>;
type EncodeRunner<TValue> = (value: unknown) => CheckResult<TValue>;
type DefaultInput<TValue> = TValue | (() => TValue);
type TransformMapper<TValue, TNext> =
    (value: TValue, context: TransformContext) => TNext;

const TransformNeverSymbol = Symbol("TypeSea.NEVER");

export const NEVER = TransformNeverSymbol as never;

export type JsonCodecValue =
    | null
    | string
    | number
    | boolean
    | readonly JsonCodecValue[]
    | { readonly [key: string]: JsonCodecValue };

export interface CatchContext {
    readonly error: readonly Issue[];
}

export type CatchInput<TValue> =
    | TValue
    | (() => TValue)
    | ((context: CatchContext) => TValue);

export type TransformIssueInput =
    | string
    | {
        readonly path?: readonly PathSegment[];
        readonly message?: string;
        readonly [key: string]: unknown;
    };

export interface TransformIssueSink {
    readonly length: number;
    push(...issues: (TransformIssueInput | undefined)[]): number;
}

export interface TransformContext {
    readonly issues: TransformIssueSink;
    addIssue(issue?: TransformIssueInput): void;
}

export type StringBoolCase = "insensitive" | "sensitive";

export interface StringBoolOptions {
    readonly truthy?: readonly string[] | undefined;
    readonly falsy?: readonly string[] | undefined;
    readonly case?: StringBoolCase | undefined;
}

/**
 * @brief Private runner slot for decoder instances.
 * @details A symbol slot keeps the public object small while avoiding accidental
 * collision with user-visible properties.
 */
const DecoderRunSymbol = Symbol("TypeSea.decoder.run");
const CodecEncodeSymbol = Symbol("TypeSea.codec.encode");

/**
 * @brief Real decoder instances tracked without extending object lifetime.
 */
const constructedDecoders = new WeakSet<object>();

export type DecodeSource =
    | Guard<unknown, Presence>
    | Decoder<unknown>;

export type EncodeSource =
    | Guard<unknown, Presence>
    | Codec<unknown, unknown>;

export type ObjectDecodeShape = Readonly<Record<string, DecodeSource>>;

export type ObjectCodecShape = Readonly<Record<string, EncodeSource>>;

export type TupleDecodeShape = readonly DecodeSource[];

export type TupleCodecShape = readonly EncodeSource[];

type ObjectDecodeMode =
    | typeof ObjectModeTag.Passthrough
    | typeof ObjectModeTag.Strict;

export type InferDecoder<TSource> =
    TSource extends Decoder<infer TValue>
        ? TValue
        : TSource extends Guard<infer TValue, infer TPresence>
            ? RuntimeValue<TValue, TPresence>
            : never;

export type InferCodecEncoded<TSource> =
    TSource extends Codec<infer TEncoded, unknown> ? TEncoded : never;

export type InferCodecDecoded<TSource> =
    TSource extends Codec<unknown, infer TDecoded> ? TDecoded : never;

type ObjectDecodeOptionalKeys<TShape extends ObjectDecodeShape> = {
    [TKey in keyof TShape]-?: TShape[TKey] extends Guard<unknown, Presence>
        ? GuardPresence<TShape[TKey]> extends "optional"
            ? TKey
            : never
        : never;
}[keyof TShape];

type ObjectDecodeRequiredKeys<TShape extends ObjectDecodeShape> = {
    [TKey in keyof TShape]-?: TShape[TKey] extends Guard<unknown, Presence>
        ? GuardPresence<TShape[TKey]> extends "optional"
            ? never
            : TKey
        : TKey;
}[keyof TShape];

export type InferDecodedObject<TShape extends ObjectDecodeShape> = Simplify<{
    readonly [TKey in ObjectDecodeRequiredKeys<TShape>]: InferDecoder<TShape[TKey]>;
} & {
    readonly [TKey in ObjectDecodeOptionalKeys<TShape>]?: GuardValue<TShape[TKey]>;
}>;

export type InferEncodedObject<TShape extends ObjectCodecShape> = Simplify<{
    readonly [TKey in ObjectDecodeRequiredKeys<TShape>]: TShape[TKey] extends Codec<
        infer TEncoded,
        unknown
    > ? TEncoded : InferDecoder<TShape[TKey]>;
} & {
    readonly [TKey in ObjectDecodeOptionalKeys<TShape>]?: GuardValue<TShape[TKey]>;
}>;

export type InferEncodedSource<TSource extends EncodeSource> =
    TSource extends Codec<infer TEncoded, unknown>
        ? TEncoded
        : InferDecoder<TSource>;

export type InferDecodedTuple<TShape extends TupleDecodeShape> = {
    readonly [TKey in keyof TShape]: InferDecoder<TShape[TKey]>;
};

export type InferEncodedTuple<TShape extends TupleCodecShape> = {
    readonly [TKey in keyof TShape]: InferEncodedSource<TShape[TKey]>;
};

export type InferDecodedTupleWithRest<
    TShape extends TupleDecodeShape,
    TRest extends DecodeSource
> = readonly [
    ...{
        [TKey in keyof TShape]: InferDecoder<TShape[TKey]>;
    },
    ...InferDecoder<TRest>[]
];

export type InferEncodedTupleWithRest<
    TShape extends TupleCodecShape,
    TRest extends EncodeSource
> = readonly [
    ...{
        [TKey in keyof TShape]: InferEncodedSource<TShape[TKey]>;
    },
    ...InferEncodedSource<TRest>[]
];

export type InferRecordKey<TSource extends Guard<unknown, Presence>> = Extract<
    RuntimeValue<GuardValue<TSource>, GuardPresence<TSource>>,
    string | number
>;

export type InferDecodedRecordValue<TValue extends DecodeSource> = Readonly<
    Record<string, InferDecoder<TValue>>
>;

export type InferEncodedRecordValue<TValue extends EncodeSource> = Readonly<
    Record<string, InferEncodedSource<TValue>>
>;

export type InferDecodedRecord<
    TKey extends Guard<unknown, Presence>,
    TValue extends DecodeSource
> = Readonly<Record<InferRecordKey<TKey>, InferDecoder<TValue>>>;

export type InferEncodedRecord<
    TKey extends Guard<unknown, Presence>,
    TValue extends EncodeSource
> = Readonly<Record<InferRecordKey<TKey>, InferEncodedSource<TValue>>>;

export type InferDecodedLooseRecord<
    TKey extends Guard<unknown, Presence>,
    TValue extends DecodeSource
> = string extends InferRecordKey<TKey>
    ? Readonly<Record<string, InferDecoder<TValue>>>
    : Readonly<
        Partial<Record<InferRecordKey<TKey>, InferDecoder<TValue>>> &
        Record<string, unknown>
    >;

export type InferEncodedLooseRecord<
    TKey extends Guard<unknown, Presence>,
    TValue extends EncodeSource
> = string extends InferRecordKey<TKey>
    ? Readonly<Record<string, InferEncodedSource<TValue>>>
    : Readonly<
        Partial<Record<InferRecordKey<TKey>, InferEncodedSource<TValue>>> &
        Record<string, unknown>
    >;

export type InferDecodedMap<
    TKey extends DecodeSource,
    TValue extends DecodeSource
> = ReadonlyMap<InferDecoder<TKey>, InferDecoder<TValue>>;

export type InferEncodedMap<
    TKey extends EncodeSource,
    TValue extends EncodeSource
> = ReadonlyMap<InferEncodedSource<TKey>, InferEncodedSource<TValue>>;

type Simplify<TValue> = {
    readonly [TKey in keyof TValue]: TValue[TKey];
} & {};

/**
 * @brief Infer the accepted input side of a TypeSea source.
 * @details Guards accept their runtime value domain. Codecs expose their encoded
 * side. Plain decoders accept unknown by design because they own parsing.
 */
export type Input<TSource> =
    TSource extends Codec<infer TEncoded, unknown>
        ? TEncoded
        : TSource extends Guard<infer TValue, infer TPresence>
            ? RuntimeValue<TValue, TPresence>
            : TSource extends Decoder<unknown>
                ? unknown
                : never;

/**
 * @brief Infer the produced output side of a TypeSea source.
 * @details This is the Zod-compatible spelling for guard, decoder, and codec
 * output inference.
 */
export type Output<TSource> =
    TSource extends Codec<unknown, infer TDecoded>
        ? TDecoded
        : TSource extends DecodeSource
            ? InferDecoder<TSource>
            : never;

/**
 * @brief Synchronous decode pipeline.
 * @details Decoders are explicit Result producers; they do not throw for data
 * validation failure.
 */
export interface Decoder<TValue, TInput = unknown> {
    readonly "~standard": StandardSchemaV1Props<TInput, TValue>;

    decode(value: unknown): CheckResult<TValue>;

    parse(value: unknown, options?: Partial<ParseOptions>): TValue;

    safeParse(value: unknown, options?: Partial<ParseOptions>): SafeParseResult<TValue>;

    parseAsync(value: unknown, options?: Partial<ParseOptions>): Promise<TValue>;

    safeParseAsync(
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<SafeParseResult<TValue>>;

    spa(value: unknown, options?: Partial<ParseOptions>): Promise<SafeParseResult<TValue>>;

    transform<TNext>(mapper: TransformMapper<TValue, TNext>): BaseDecoder<TNext>;

    pipe<TNext extends DecodeSource>(next: TNext): BaseDecoder<InferDecoder<TNext>>;

    default(fallback: DefaultInput<TValue>): BaseDecoder<TValue>;

    prefault(fallback: unknown): BaseDecoder<TValue>;

    catch(fallback: CatchInput<TValue>): BaseDecoder<TValue>;
}

export interface Codec<TEncoded, TDecoded> extends Decoder<TDecoded, TEncoded> {
    encode(value: TDecoded): CheckResult<TEncoded>;
}

interface ConstructedDecoder<TValue> extends Decoder<TValue> {
    readonly [DecoderRunSymbol]: DecodeRunner<TValue>;
}

interface ConstructedCodec<TEncoded, TDecoded> extends Codec<TEncoded, TDecoded> {
    readonly [CodecEncodeSymbol]: EncodeRunner<TEncoded>;
}

/**
 * @brief Frozen decoder wrapper around one runner function.
 * @details Methods re-read the symbol runner from the receiver so detached
 * method calls fail with TypeSea errors instead of touching undefined state.
 */
export class BaseDecoder<TValue, TInput = unknown> implements Decoder<TValue, TInput> {
    private declare readonly [DecoderRunSymbol]: DecodeRunner<TValue>;
    public declare readonly "~standard": StandardSchemaV1Props<TInput, TValue>;

    public constructor(run: DecodeRunner<TValue>) {
        if (typeof run !== "function") {
            throw new TypeError("decoder run must be a function");
        }
        defineReadonlyProperty(this, DecoderRunSymbol, run, false);
        defineReadonlyProperty(
            this,
            "~standard",
            makeStandardSchemaProps<TInput, TValue>(run),
            false
        );
        constructedDecoders.add(this);
        if (new.target === BaseDecoder) {
            Object.freeze(this);
        }
    }

    public decode(this: unknown, value: unknown): CheckResult<TValue> {
        return readDecoderRunner<TValue>(this, "decoder receiver")(value);
    }

    public parse(
        this: unknown,
        value: unknown,
        options?: Partial<ParseOptions>
    ): TValue {
        const result = readDecoderRunner<TValue>(this, "decoder receiver")(value);
        if (!result.ok) {
            throw new TypeSeaAssertionError(applyParseOptions(result.error, value, options));
        }
        return result.value;
    }

    public safeParse(
        this: unknown,
        value: unknown,
        options?: Partial<ParseOptions>
    ): SafeParseResult<TValue> {
        const result = readDecoderRunner<TValue>(this, "decoder receiver")(value);
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

    public parseAsync(
        this: unknown,
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<TValue> {
        const result = readDecoderRunner<TValue>(this, "decoder receiver")(value);
        if (!result.ok) {
            return Promise.reject(new TypeSeaAssertionError(
                applyParseOptions(result.error, value, options)
            ));
        }
        return Promise.resolve(result.value);
    }

    public safeParseAsync(
        this: unknown,
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<SafeParseResult<TValue>> {
        const result = readDecoderRunner<TValue>(this, "decoder receiver")(value);
        if (result.ok) {
            return Promise.resolve(Object.freeze({
                success: true,
                data: result.value
            }));
        }
        return Promise.resolve(Object.freeze({
            success: false,
            error: new TypeSeaAssertionError(applyParseOptions(result.error, value, options))
        }));
    }

    public spa(
        this: unknown,
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<SafeParseResult<TValue>> {
        const result = readDecoderRunner<TValue>(this, "decoder receiver")(value);
        if (result.ok) {
            return Promise.resolve(Object.freeze({
                success: true,
                data: result.value
            }));
        }
        return Promise.resolve(Object.freeze({
            success: false,
            error: new TypeSeaAssertionError(applyParseOptions(result.error, value, options))
        }));
    }

    public transform<TNext>(mapper: TransformMapper<TValue, TNext>): BaseDecoder<TNext> {
        if (typeof mapper !== "function") {
            throw new TypeError("decoder transform mapper must be a function");
        }
        const run = readDecoderRunner<TValue>(this, "decoder transform receiver");
        return new BaseDecoder<TNext>((value: unknown): CheckResult<TNext> => {
            const decoded = run(value);
            if (!decoded.ok) {
                return decoded;
            }
            const context = createTransformContext(decoded.value);
            const mapped = mapper(decoded.value, context.value);
            if (mapped === TransformNeverSymbol || context.issues.length !== 0) {
                return err(readTransformIssues(context.issues, decoded.value));
            }
            return okResult(mapped);
        });
    }

    public pipe<TNext extends DecodeSource>(
        next: TNext
    ): BaseDecoder<InferDecoder<TNext>> {
        const run = readDecoderRunner<TValue>(this, "decoder pipe receiver");
        const nextRun = readDecodeSourceRunner<InferDecoder<TNext>>(next, "decoder pipe target");
        return new BaseDecoder<InferDecoder<TNext>>(
            (value: unknown): CheckResult<InferDecoder<TNext>> => {
                const decoded = run(value);
                if (!decoded.ok) {
                    return decoded;
                }
                return nextRun(decoded.value);
            }
        );
    }

    public default(fallback: DefaultInput<TValue>): BaseDecoder<TValue> {
        const run = readDecoderRunner<TValue>(this, "decoder default receiver");
        return new BaseDecoder<TValue>((value: unknown): CheckResult<TValue> => {
            if (value === undefined) {
                return okResult(resolveDefault(fallback));
            }
            return run(value);
        });
    }

    public prefault(fallback: unknown): BaseDecoder<TValue> {
        const run = readDecoderRunner<TValue>(this, "decoder prefault receiver");
        return new BaseDecoder<TValue>((value: unknown): CheckResult<TValue> =>
            run(value === undefined ? fallback : value));
    }

    public catch(fallback: CatchInput<TValue>): BaseDecoder<TValue> {
        const run = readDecoderRunner<TValue>(this, "decoder catch receiver");
        return new BaseDecoder<TValue>((value: unknown): CheckResult<TValue> => {
            const decoded = run(value);
            if (decoded.ok) {
                return decoded;
            }
            return okResult(resolveCatch(fallback, decoded.error));
        });
    }
}

/**
 * @brief Frozen bidirectional codec wrapper.
 * @details Decode uses the BaseDecoder runner. Encode has a separate private
 * symbol so detached encode calls fail through the same receiver discipline.
 */
export class BaseCodec<TEncoded, TDecoded>
    extends BaseDecoder<TDecoded, TEncoded>
    implements Codec<TEncoded, TDecoded> {
    private declare readonly [CodecEncodeSymbol]: EncodeRunner<TEncoded>;
    public declare readonly "~standard": StandardSchemaV1Props<TEncoded, TDecoded>;

    public constructor(
        decodeRun: DecodeRunner<TDecoded>,
        encodeRun: EncodeRunner<TEncoded>
    ) {
        super(decodeRun);
        if (typeof encodeRun !== "function") {
            throw new TypeError("codec encode run must be a function");
        }
        defineReadonlyProperty(this, CodecEncodeSymbol, encodeRun, false);
        Object.freeze(this);
    }

    public encode(this: unknown, value: TDecoded): CheckResult<TEncoded> {
        return readCodecEncodeRunner<TEncoded>(this, "codec receiver")(value);
    }
}

/**
 * @brief Wrap a guard or decoder as a synchronous decoder pipeline.
 */
export function decoder<TValue, TPresence extends Presence>(
    source: Guard<TValue, TPresence>
): BaseDecoder<RuntimeValue<TValue, TPresence>>;

/**
 * @brief Wrap an existing decoder without changing its output type.
 */
export function decoder<TValue>(source: Decoder<TValue>): BaseDecoder<TValue>;

/**
 * @brief Normalize a guard or decoder into a synchronous decoder pipeline.
 */
export function decoder(source: DecodeSource): BaseDecoder<unknown> {
    return makeDecoder(source);
}

/**
 * @brief Decode a value through a guard or decoder.
 * @param source Guard or decoder used for validation.
 * @param value Candidate runtime value.
 * @returns TypeSea Result carrying decoded output or issues.
 */
export function decode<TSource extends DecodeSource>(
    source: TSource,
    value: unknown
): CheckResult<InferDecoder<TSource>> {
    return readDecodeSourceRunner<InferDecoder<TSource>>(source, "decode source")(value);
}

/**
 * @brief Zod-style safe decode alias for Result-native TypeSea callers.
 * @param source Guard or decoder used for validation.
 * @param value Candidate runtime value.
 * @returns TypeSea Result carrying decoded output or issues.
 */
export function safeDecode<TSource extends DecodeSource>(
    source: TSource,
    value: unknown
): CheckResult<InferDecoder<TSource>> {
    return decode(source, value);
}

/**
 * @brief Encode a value through a bidirectional codec.
 * @param source Codec carrying an encode runner.
 * @param value Candidate decoded value.
 * @returns TypeSea Result carrying encoded output or issues.
 */
export function encode<TSource extends Codec<unknown, unknown>>(
    source: TSource,
    value: InferCodecDecoded<TSource>
): CheckResult<InferCodecEncoded<TSource>> {
    return readCodecEncodeRunner<InferCodecEncoded<TSource>>(source, "encode source")(value);
}

/**
 * @brief Zod-style safe encode alias for Result-native TypeSea callers.
 * @param source Codec carrying an encode runner.
 * @param value Candidate decoded value.
 * @returns TypeSea Result carrying encoded output or issues.
 */
export function safeEncode<TSource extends Codec<unknown, unknown>>(
    source: TSource,
    value: InferCodecDecoded<TSource>
): CheckResult<InferCodecEncoded<TSource>> {
    return encode(source, value);
}

/**
 * @brief Encode a value through a codec and return a promise.
 */
export function encodeAsync<TSource extends Codec<unknown, unknown>>(
    source: TSource,
    value: InferCodecDecoded<TSource>
): Promise<CheckResult<InferCodecEncoded<TSource>>> {
    return Promise.resolve(encode(source, value));
}

/**
 * @brief Zod-style safe async encode alias for Result-native TypeSea callers.
 */
export function safeEncodeAsync<TSource extends Codec<unknown, unknown>>(
    source: TSource,
    value: InferCodecDecoded<TSource>
): Promise<CheckResult<InferCodecEncoded<TSource>>> {
    return encodeAsync(source, value);
}

export function decodeObjectShape<TShape extends ObjectCodecShape>(
    shape: TShape,
    mode: ObjectDecodeMode
): BaseCodec<InferEncodedObject<TShape>, InferDecodedObject<TShape>>;

export function decodeObjectShape<TShape extends ObjectDecodeShape>(
    shape: TShape,
    mode: ObjectDecodeMode
): BaseDecoder<InferDecodedObject<TShape>>;

export function decodeObjectShape(
    shape: ObjectDecodeShape,
    mode: ObjectDecodeMode
): BaseDecoder<unknown> | BaseCodec<unknown, unknown> {
    const config = readObjectDecodeConfig(shape, mode);
    if (config.encodable) {
        return new BaseCodec<unknown, unknown>(
            (value: unknown): CheckResult<unknown> => decodeObjectValue(config, value),
            (value: unknown): CheckResult<unknown> => encodeObjectValue(config, value)
        );
    }
    return new BaseDecoder<unknown>(
        (value: unknown): CheckResult<unknown> => decodeObjectValue(config, value)
    );
}

export function decodeArraySource<TItem extends EncodeSource>(
    item: TItem
): BaseCodec<readonly InferEncodedSource<TItem>[], readonly InferDecoder<TItem>[]>;

export function decodeArraySource<TItem extends DecodeSource>(
    item: TItem
): BaseDecoder<readonly InferDecoder<TItem>[]>;

export function decodeArraySource(
    item: DecodeSource
): BaseDecoder<readonly unknown[]> | BaseCodec<readonly unknown[], readonly unknown[]> {
    const decodeRun = readDecodeSourceRunner<unknown>(item, "array item");
    const encodeRun = readEncodeSourceRunner(item, "array item");
    if (encodeRun !== undefined) {
        return new BaseCodec<readonly unknown[], readonly unknown[]>(
            (value: unknown): CheckResult<readonly unknown[]> =>
                runArrayItems(value, decodeRun),
            (value: unknown): CheckResult<readonly unknown[]> =>
                runArrayItems(value, encodeRun)
        );
    }
    return new BaseDecoder<readonly unknown[]>(
        (value: unknown): CheckResult<readonly unknown[]> => runArrayItems(value, decodeRun)
    );
}

export function decodeTupleSources<
    const TShape extends TupleCodecShape
>(
    shape: TShape
): BaseCodec<InferEncodedTuple<TShape>, InferDecodedTuple<TShape>>;

export function decodeTupleSources<
    const TShape extends TupleDecodeShape
>(
    shape: TShape
): BaseDecoder<InferDecodedTuple<TShape>>;

export function decodeTupleSources<
    const TShape extends TupleCodecShape,
    TRest extends EncodeSource
>(
    shape: TShape,
    rest: TRest
): BaseCodec<
    InferEncodedTupleWithRest<TShape, TRest>,
    InferDecodedTupleWithRest<TShape, TRest>
>;

export function decodeTupleSources<
    const TShape extends TupleDecodeShape,
    TRest extends DecodeSource
>(
    shape: TShape,
    rest: TRest
): BaseDecoder<InferDecodedTupleWithRest<TShape, TRest>>;

export function decodeTupleSources(
    shape: TupleDecodeShape,
    rest?: DecodeSource
): BaseDecoder<readonly unknown[]> | BaseCodec<readonly unknown[], readonly unknown[]> {
    const config = readTupleDecodeConfig(shape, rest);
    if (config.encodable) {
        return new BaseCodec<readonly unknown[], readonly unknown[]>(
            (value: unknown): CheckResult<readonly unknown[]> =>
                runTupleItems(config, value, false),
            (value: unknown): CheckResult<readonly unknown[]> =>
                runTupleItems(config, value, true)
        );
    }
    return new BaseDecoder<readonly unknown[]>(
        (value: unknown): CheckResult<readonly unknown[]> =>
        runTupleItems(config, value, false)
    );
}

export function decodeRecordSource(
    keyOrValue: DecodeSource,
    value?: DecodeSource,
    loose?: boolean
): BaseDecoder<Readonly<Record<string, unknown>>> | BaseCodec<
    Readonly<Record<string, unknown>>,
    Readonly<Record<string, unknown>>
> {
    const config = readRecordDecodeConfig(keyOrValue, value, loose === true);
    if (config.encodeValue !== undefined) {
        return new BaseCodec<
            Readonly<Record<string, unknown>>,
            Readonly<Record<string, unknown>>
        >(
            (input: unknown): CheckResult<Readonly<Record<string, unknown>>> =>
                runRecordEntries(config, input, false),
            (input: unknown): CheckResult<Readonly<Record<string, unknown>>> =>
                runRecordEntries(config, input, true)
        );
    }
    return new BaseDecoder<Readonly<Record<string, unknown>>>(
        (input: unknown): CheckResult<Readonly<Record<string, unknown>>> =>
            runRecordEntries(config, input, false)
    );
}

export function decodeMapSources<TKey extends EncodeSource, TValue extends EncodeSource>(
    key: TKey,
    value: TValue
): BaseCodec<InferEncodedMap<TKey, TValue>, InferDecodedMap<TKey, TValue>>;

export function decodeMapSources<TKey extends DecodeSource, TValue extends DecodeSource>(
    key: TKey,
    value: TValue
): BaseDecoder<InferDecodedMap<TKey, TValue>>;

export function decodeMapSources(
    key: DecodeSource,
    value: DecodeSource
): BaseDecoder<ReadonlyMap<unknown, unknown>> | BaseCodec<
    ReadonlyMap<unknown, unknown>,
    ReadonlyMap<unknown, unknown>
> {
    const config = readPairContainerConfig(key, value, "map key", "map value");
    if (config.encodeKey !== undefined && config.encodeValue !== undefined) {
        return new BaseCodec<ReadonlyMap<unknown, unknown>, ReadonlyMap<unknown, unknown>>(
            (input: unknown): CheckResult<ReadonlyMap<unknown, unknown>> =>
                runMapEntries(config, input, false),
            (input: unknown): CheckResult<ReadonlyMap<unknown, unknown>> =>
                runMapEntries(config, input, true)
        );
    }
    return new BaseDecoder<ReadonlyMap<unknown, unknown>>(
        (input: unknown): CheckResult<ReadonlyMap<unknown, unknown>> =>
            runMapEntries(config, input, false)
    );
}

export function decodeSetSource<TItem extends EncodeSource>(
    item: TItem
): BaseCodec<ReadonlySet<InferEncodedSource<TItem>>, ReadonlySet<InferDecoder<TItem>>>;

export function decodeSetSource<TItem extends DecodeSource>(
    item: TItem
): BaseDecoder<ReadonlySet<InferDecoder<TItem>>>;

export function decodeSetSource(
    item: DecodeSource
): BaseDecoder<ReadonlySet<unknown>> | BaseCodec<ReadonlySet<unknown>, ReadonlySet<unknown>> {
    const decodeRun = readDecodeSourceRunner<unknown>(item, "set item");
    const encodeRun = readEncodeSourceRunner(item, "set item");
    if (encodeRun !== undefined) {
        return new BaseCodec<ReadonlySet<unknown>, ReadonlySet<unknown>>(
            (input: unknown): CheckResult<ReadonlySet<unknown>> =>
                runSetValues(input, decodeRun),
            (input: unknown): CheckResult<ReadonlySet<unknown>> =>
                runSetValues(input, encodeRun)
        );
    }
    return new BaseDecoder<ReadonlySet<unknown>>(
        (input: unknown): CheckResult<ReadonlySet<unknown>> =>
            runSetValues(input, decodeRun)
    );
}

/**
 * @brief Reverse a codec's decode and encode directions.
 * @param source Codec whose encoded and decoded sides should be swapped.
 * @returns Codec that decodes with the original encoder and encodes with the original decoder.
 */
export function invertCodec<TSource extends Codec<unknown, unknown>>(
    source: TSource
): BaseCodec<InferCodecDecoded<TSource>, InferCodecEncoded<TSource>> {
    const decodeRun = readCodecEncodeRunner<InferCodecEncoded<TSource>>(
        source,
        "invertCodec source"
    );
    const encodeRun = readDecoderRunner<InferCodecDecoded<TSource>>(
        source,
        "invertCodec source"
    );
    return new BaseCodec<InferCodecDecoded<TSource>, InferCodecEncoded<TSource>>(
        (value: unknown): CheckResult<InferCodecEncoded<TSource>> => decodeRun(value),
        (value: unknown): CheckResult<InferCodecDecoded<TSource>> => encodeRun(value)
    );
}

/**
 * @brief Build decoder.
 */
function makeDecoder(source: DecodeSource): BaseDecoder<unknown> {
    const run = readDecodeSourceRunner<unknown>(source, "decoder source");
    return new BaseDecoder<unknown>(run);
}

/**
 * @brief Build a decoder and append a synchronous mapper.
 */
export function transform<TValue, TPresence extends Presence, TNext>(
    source: Guard<TValue, TPresence>,
    mapper: TransformMapper<RuntimeValue<TValue, TPresence>, TNext>
): BaseDecoder<TNext>;

/**
 * @brief Append a synchronous mapper to an existing decoder.
 */
export function transform<TValue, TNext>(
    source: Decoder<TValue>,
    mapper: TransformMapper<TValue, TNext>
): BaseDecoder<TNext>;

/**
 * @brief Normalize a source and append a synchronous mapper.
 */
export function transform(
    source: DecodeSource,
    mapper: TransformMapper<unknown, unknown>
): BaseDecoder<unknown> {
    return makeDecoder(source).transform(mapper);
}

/**
 * @brief Return true when the source decodes successfully.
 * @details This is a Zod migration helper for code that only needs a successful
 * marker after validation but still wants the decoder parse surface.
 * @param source Guard or decoder to validate.
 * @returns Decoder that emits `true` after source success.
 */
export function success(source: DecodeSource): BaseDecoder<boolean> {
    return makeDecoder(source).transform((): boolean => true);
}

/**
 * @brief Pipe one decode source into the next decode source.
 */
export function pipe<TNext extends DecodeSource>(
    source: DecodeSource,
    next: TNext
): BaseDecoder<InferDecoder<TNext>> {
    return makeDecoder(source).pipe(next);
}

/**
 * @brief Run a mapper before validating a decode source.
 * @param mapper Function applied to raw input before validation.
 * @param source Guard or decoder used after preprocessing.
 * @returns Decoder that validates the mapped value.
 */
export function preprocess<TSource extends DecodeSource>(
    mapper: (value: unknown) => unknown,
    source: TSource
): BaseDecoder<InferDecoder<TSource>> {
    if (typeof mapper !== "function") {
        throw new TypeError("preprocess mapper must be a function");
    }
    const run = readDecodeSourceRunner<InferDecoder<TSource>>(source, "preprocess source");
    return new BaseDecoder<InferDecoder<TSource>>(
        (value: unknown): CheckResult<InferDecoder<TSource>> => run(mapper(value))
    );
}

/**
 * @brief Add a short-circuit default output for undefined input.
 * @param source Guard or decoder used for non-undefined input.
 * @param fallback Output value or zero-argument producer.
 * @returns Decoder that returns fallback output when input is undefined.
 */
export function defaultValue<TSource extends DecodeSource>(
    source: TSource,
    fallback: DefaultInput<InferDecoder<TSource>>
): BaseDecoder<InferDecoder<TSource>> {
    const run = readDecodeSourceRunner<InferDecoder<TSource>>(source, "default source");
    return new BaseDecoder<InferDecoder<TSource>>(
        (value: unknown): CheckResult<InferDecoder<TSource>> => {
            if (value === undefined) {
                return okResult(resolveDefault(fallback));
            }
            return run(value);
        }
    );
}

/**
 * @brief Add a pre-parse fallback input for undefined input.
 * @param source Guard or decoder used for actual validation.
 * @param fallback Input value passed through the source when input is undefined.
 * @returns Decoder that validates fallback input instead of short-circuiting.
 */
export function prefault<TSource extends DecodeSource>(
    source: TSource,
    fallback: unknown
): BaseDecoder<InferDecoder<TSource>> {
    const run = readDecodeSourceRunner<InferDecoder<TSource>>(source, "prefault source");
    return new BaseDecoder<InferDecoder<TSource>>(
        (value: unknown): CheckResult<InferDecoder<TSource>> =>
            run(value === undefined ? fallback : value)
    );
}

/**
 * @brief Add a failure fallback output for decode errors.
 * @param source Guard or decoder used for validation.
 * @param fallback Output value or zero-argument producer returned on failure.
 * @returns Decoder that converts validation failure into fallback success.
 */
export function catchValue<TSource extends DecodeSource>(
    source: TSource,
    fallback: CatchInput<InferDecoder<TSource>>
): BaseDecoder<InferDecoder<TSource>> {
    const run = readDecodeSourceRunner<InferDecoder<TSource>>(source, "catch source");
    return new BaseDecoder<InferDecoder<TSource>>(
        (value: unknown): CheckResult<InferDecoder<TSource>> => {
            const decoded = run(value);
            if (decoded.ok) {
                return decoded;
            }
            return okResult(resolveCatch(fallback, decoded.error));
        }
    );
}

/**
 * @brief Build a bidirectional codec from input and output validation sources.
 * @param input Source schema for encoded values.
 * @param output Source schema for decoded values.
 * @param mapping Decode and encode mapping functions.
 * @returns Codec that validates both sides of each conversion.
 */
export function codec<
    TInput extends DecodeSource,
    TOutput extends DecodeSource
>(
    input: TInput,
    output: TOutput,
    mapping: {
        readonly decode: (value: InferDecoder<TInput>) => InferDecoder<TOutput>;
        readonly encode: (value: InferDecoder<TOutput>) => InferDecoder<TInput>;
    }
): BaseCodec<InferDecoder<TInput>, InferDecoder<TOutput>> {
    if (!isRecord(mapping) ||
        typeof mapping.decode !== "function" ||
        typeof mapping.encode !== "function") {
        throw new TypeError("codec mapping must contain decode and encode functions");
    }
    const inputRun = readDecodeSourceRunner<InferDecoder<TInput>>(input, "codec input");
    const outputRun = readDecodeSourceRunner<InferDecoder<TOutput>>(output, "codec output");
    return new BaseCodec<InferDecoder<TInput>, InferDecoder<TOutput>>(
        (value: unknown): CheckResult<InferDecoder<TOutput>> => {
            const decodedInput = inputRun(value);
            if (!decodedInput.ok) {
                return decodedInput;
            }
            return outputRun(mapping.decode(decodedInput.value));
        },
        (value: unknown): CheckResult<InferDecoder<TInput>> => {
            const decodedOutput = outputRun(value);
            if (!decodedOutput.ok) {
                return decodedOutput;
            }
            return inputRun(mapping.encode(decodedOutput.value));
        }
    );
}

/**
 * @brief Built-in bidirectional codec builders.
 * @details These helpers keep common string-boundary conversions explicit while
 * preserving Result-based validation failure.
 */
export const codecs = Object.freeze({
    stringToNumber,
    stringToInt,
    stringToBigInt,
    numberToBigInt,
    stringToDate,
    isoDatetimeToDate,
    epochSecondsToDate,
    epochMillisToDate,
    utf8ToBytes,
    bytesToUtf8,
    base64ToBytes,
    base64urlToBytes,
    hexToBytes,
    jsonCodec,
    stringToURL,
    stringToHttpURL
} as const);

/**
 * @brief Build a string/number codec.
 * @returns Codec decoding numeric strings and encoding finite numbers.
 */
export function stringToNumber(): BaseCodec<string, number> {
    return new BaseCodec<string, number>(
        (value: unknown): CheckResult<number> => {
            if (typeof value !== "string") {
                return fail("expected_string", "number string", value);
            }
            const trimmed = value.trim();
            if (trimmed.length === 0) {
                return fail("expected_number", "number string", value);
            }
            return checkSchema<number>(numberSchema, Number(trimmed));
        },
        (value: unknown): CheckResult<string> => {
            const checked = checkSchema<number>(numberSchema, value);
            if (!checked.ok) {
                return checked;
            }
            return okResult(String(checked.value));
        }
    );
}

/**
 * @brief Build a string/safe-integer codec.
 * @returns Codec decoding integer strings and encoding safe integers.
 */
export function stringToInt(): BaseCodec<string, number> {
    return new BaseCodec<string, number>(
        (value: unknown): CheckResult<number> => {
            if (typeof value !== "string") {
                return fail("expected_string", "integer string", value);
            }
            const trimmed = value.trim();
            if (!isIntegerString(trimmed)) {
                return fail("expected_integer", "integer string", value);
            }
            const parsed = Number(trimmed);
            if (!Number.isSafeInteger(parsed)) {
                return fail("expected_integer", "safe integer string", value);
            }
            return okResult(parsed);
        },
        (value: unknown): CheckResult<string> => {
            if (!Number.isSafeInteger(value)) {
                return fail("expected_integer", "safe integer", value);
            }
            return okResult(String(value));
        }
    );
}

/**
 * @brief Build a string/bigint codec.
 * @returns Codec decoding integer strings and encoding bigint values.
 */
export function stringToBigInt(): BaseCodec<string, bigint> {
    return new BaseCodec<string, bigint>(
        (value: unknown): CheckResult<bigint> => {
            if (typeof value !== "string") {
                return fail("expected_string", "bigint string", value);
            }
            const trimmed = value.trim();
            if (!isBigIntString(trimmed)) {
                return fail("expected_bigint", "bigint string", value);
            }
            return okResult(BigInt(trimmed));
        },
        (value: unknown): CheckResult<string> => {
            const checked = checkSchema<bigint>(bigIntSchema, value);
            if (!checked.ok) {
                return checked;
            }
            return okResult(String(checked.value));
        }
    );
}

/**
 * @brief Build a safe-integer number/bigint codec.
 * @returns Codec decoding safe integers to bigint and encoding safe-range bigint values.
 */
export function numberToBigInt(): BaseCodec<number, bigint> {
    return new BaseCodec<number, bigint>(
        (value: unknown): CheckResult<bigint> => {
            if (!Number.isSafeInteger(value)) {
                return fail("expected_integer", "safe integer", value);
            }
            return okResult(BigInt(value as number));
        },
        (value: unknown): CheckResult<number> => {
            const checked = checkSchema<bigint>(bigIntSchema, value);
            if (!checked.ok) {
                return checked;
            }
            const encoded = Number(checked.value);
            if (!Number.isSafeInteger(encoded) || BigInt(encoded) !== checked.value) {
                return fail("expected_integer", "safe-range bigint", value);
            }
            return okResult(encoded);
        }
    );
}

/**
 * @brief Build a string/Date codec.
 * @returns Codec decoding date strings and encoding valid Date objects.
 */
export function stringToDate(): BaseCodec<string, Date> {
    return new BaseCodec<string, Date>(
        (value: unknown): CheckResult<Date> => {
            if (typeof value !== "string") {
                return fail("expected_string", "date string", value);
            }
            return checkSchema<Date>(dateSchema, new Date(value));
        },
        (value: unknown): CheckResult<string> => {
            const checked = checkSchema<Date>(dateSchema, value);
            if (!checked.ok) {
                return checked;
            }
            return okResult(checked.value.toISOString());
        }
    );
}

/**
 * @brief Build an ISO datetime string/Date codec.
 * @returns Codec decoding ISO datetime text and encoding valid Dates.
 */
export function isoDatetimeToDate(): BaseCodec<string, Date> {
    return new BaseCodec<string, Date>(
        (value: unknown): CheckResult<Date> => {
            if (typeof value !== "string") {
                return fail("expected_string", "ISO datetime string", value);
            }
            if (!ISO_DATETIME_CODEC_PATTERN.test(value)) {
                return fail("expected_pattern", "ISO datetime string", value);
            }
            return checkSchema<Date>(dateSchema, new Date(value));
        },
        (value: unknown): CheckResult<string> => {
            const checked = checkSchema<Date>(dateSchema, value);
            if (!checked.ok) {
                return checked;
            }
            return okResult(checked.value.toISOString());
        }
    );
}

/**
 * @brief Build an epoch-seconds/Date codec.
 * @returns Codec decoding seconds since Unix epoch and encoding valid Dates.
 */
export function epochSecondsToDate(): BaseCodec<number, Date> {
    return new BaseCodec<number, Date>(
        (value: unknown): CheckResult<Date> => {
            const checked = checkSchema<number>(numberSchema, value);
            if (!checked.ok) {
                return checked;
            }
            return checkSchema<Date>(dateSchema, new Date(checked.value * 1000));
        },
        (value: unknown): CheckResult<number> => {
            const checked = checkSchema<Date>(dateSchema, value);
            if (!checked.ok) {
                return checked;
            }
            return okResult(checked.value.getTime() / 1000);
        }
    );
}

/**
 * @brief Build an epoch-milliseconds/Date codec.
 * @returns Codec decoding milliseconds since Unix epoch and encoding valid Dates.
 */
export function epochMillisToDate(): BaseCodec<number, Date> {
    return new BaseCodec<number, Date>(
        (value: unknown): CheckResult<Date> => {
            const checked = checkSchema<number>(numberSchema, value);
            if (!checked.ok) {
                return checked;
            }
            return checkSchema<Date>(dateSchema, new Date(checked.value));
        },
        (value: unknown): CheckResult<number> => {
            const checked = checkSchema<Date>(dateSchema, value);
            if (!checked.ok) {
                return checked;
            }
            return okResult(checked.value.getTime());
        }
    );
}

/**
 * @brief Build a UTF-8 string/bytes codec.
 * @returns Codec decoding text to bytes and encoding bytes to text.
 */
export function utf8ToBytes(): BaseCodec<string, Uint8Array> {
    return new BaseCodec<string, Uint8Array>(
        (value: unknown): CheckResult<Uint8Array> => {
            if (typeof value !== "string") {
                return fail("expected_string", "UTF-8 string", value);
            }
            return okResult(new TextEncoder().encode(value));
        },
        (value: unknown): CheckResult<string> => {
            if (!isUint8Array(value)) {
                return fail("expected_array", "Uint8Array", value);
            }
            return okResult(new TextDecoder().decode(value));
        }
    );
}

/**
 * @brief Build a bytes/UTF-8 string codec.
 * @returns Codec decoding bytes to text and encoding text to bytes.
 */
export function bytesToUtf8(): BaseCodec<Uint8Array, string> {
    return new BaseCodec<Uint8Array, string>(
        (value: unknown): CheckResult<string> => {
            if (!isUint8Array(value)) {
                return fail("expected_array", "Uint8Array", value);
            }
            return okResult(new TextDecoder().decode(value));
        },
        (value: unknown): CheckResult<Uint8Array> => {
            if (typeof value !== "string") {
                return fail("expected_string", "UTF-8 string", value);
            }
            return okResult(new TextEncoder().encode(value));
        }
    );
}

/**
 * @brief Build a base64 string/bytes codec.
 * @returns Codec decoding base64 text and encoding bytes with padding.
 */
export function base64ToBytes(): BaseCodec<string, Uint8Array> {
    return bytesStringCodec(false);
}

/**
 * @brief Build a base64url string/bytes codec.
 * @returns Codec decoding base64url text and encoding bytes without padding.
 */
export function base64urlToBytes(): BaseCodec<string, Uint8Array> {
    return bytesStringCodec(true);
}

/**
 * @brief Build a hex string/bytes codec.
 * @returns Codec decoding hexadecimal text and encoding bytes as lowercase hex.
 */
export function hexToBytes(): BaseCodec<string, Uint8Array> {
    return new BaseCodec<string, Uint8Array>(
        (value: unknown): CheckResult<Uint8Array> => {
            if (typeof value !== "string") {
                return fail("expected_string", "hex string", value);
            }
            const decoded = decodeHexBytes(value);
            if (decoded === undefined) {
                return fail("expected_pattern", "hex string", value);
            }
            return okResult(decoded);
        },
        (value: unknown): CheckResult<string> => {
            if (!isUint8Array(value)) {
                return fail("expected_array", "Uint8Array", value);
            }
            return okResult(encodeHexBytes(value));
        }
    );
}

/**
 * @brief Build a JSON string/value codec.
 * @returns Codec decoding JSON text and encoding JSON-compatible values.
 */
export function jsonCodec(): BaseCodec<string, JsonCodecValue> {
    return new BaseCodec<string, JsonCodecValue>(
        (value: unknown): CheckResult<JsonCodecValue> => {
            if (typeof value !== "string") {
                return fail("expected_string", "JSON string", value);
            }
            const parsed = parseJsonText(value);
            if (parsed === undefined) {
                return fail("expected_pattern", "JSON string", value);
            }
            return okResult(parsed);
        },
        (value: unknown): CheckResult<string> => {
            const encoded = stringifyJsonValue(value);
            if (encoded === undefined) {
                return fail("expected_refinement", "JSON-compatible value", value);
            }
            return okResult(encoded);
        }
    );
}

/**
 * @brief Build a string/URL codec.
 * @returns Codec decoding URL strings and encoding URL instances to href strings.
 */
export function stringToURL(): BaseCodec<string, URL> {
    return urlCodec(false);
}

/**
 * @brief Build a string/http URL codec.
 * @returns Codec accepting only http and https URL strings.
 */
export function stringToHttpURL(): BaseCodec<string, URL> {
    return urlCodec(true);
}

type CoerceStringUuidInput =
    | (Partial<StringUuidOptions> & CheckMessageOptions)
    | CheckMessageInput;

type CoerceStringEmailInput =
    | (Partial<StringEmailOptions> & CheckMessageOptions)
    | CheckMessageInput;

type CoerceStringUrlInput = Partial<StringUrlOptions> & CheckMessageOptions;

type CoerceStringIsoDateTimeInput =
    Partial<StringIsoDateTimeOptions> & CheckMessageOptions;

type CoerceStringIsoTimeInput =
    Partial<StringIsoTimeOptions> & CheckMessageOptions;

type CoerceStringMacInput =
    | StringMacDelimiter
    | (Partial<StringMacOptions> & CheckMessageOptions);

type CoerceStringJwtInput =
    | (Partial<StringJwtOptions> & CheckMessageOptions)
    | CheckMessageInput;

type CoerceStringHashInput = Partial<StringHashOptions> & CheckMessageOptions;
type CoerceStringCheck =
    Extract<Schema, { readonly tag: typeof SchemaTag.String }>["checks"][number];
type CoerceNumberCheck =
    Extract<Schema, { readonly tag: typeof SchemaTag.Number }>["checks"][number];
type CoerceBigIntCheck =
    Extract<Schema, { readonly tag: typeof SchemaTag.BigInt }>["checks"][number];
type CoerceDateCheck =
    Extract<Schema, { readonly tag: typeof SchemaTag.Date }>["checks"][number];

const COERCE_INT32_MIN = -2147483648;
const COERCE_INT32_MAX = 2147483647;
const COERCE_UINT32_MIN = 0;
const COERCE_UINT32_MAX = 4294967295;
const COERCE_FLOAT32_MAX = 3.4028234663852886e38;
const COERCE_FLOAT64_MAX = Number.MAX_VALUE;
const COERCE_INT64_MIN = -9223372036854775808n;
const COERCE_INT64_MAX = 9223372036854775807n;
const COERCE_UINT64_MAX = 18446744073709551615n;
const COERCE_HTTP_URL_PATTERN = /^https?:\/\/[^\s/?#]+(?:[/?#][^\s]*)?$/iu;
const COERCE_HOSTNAME_PATTERN =
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.?$/iu;
const COERCE_E164_PATTERN = /^\+[1-9]\d{1,14}$/u;
const COERCE_EMOJI_PATTERN =
    /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0E|\uFE0F)?(?:\u200D(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0E|\uFE0F)?)*$/u;
const COERCE_BASE64_PATTERN =
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const COERCE_BASE64_URL_PATTERN =
    /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2}(?:==)?|[A-Za-z0-9_-]{3}=?)?$/u;
const COERCE_HEX_PATTERN = /^(?:[0-9a-f]{2})*$/iu;
const COERCE_JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/u;
const COERCE_NANOID_PATTERN = /^[A-Za-z0-9_-]{21}$/u;
const COERCE_CUID_PATTERN = /^c[a-z0-9]{24}$/u;
const COERCE_CUID2_PATTERN = /^[a-z][a-z0-9]{1,31}$/u;
const COERCE_MAC_COLON_PATTERN = /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/iu;
const COERCE_MAC_DASH_PATTERN = /^(?:[0-9a-f]{2}-){5}[0-9a-f]{2}$/iu;
const COERCE_CIDR_V4_PATTERN =
    /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\/(?:3[0-2]|[12]?\d)$/u;
const COERCE_CIDR_V6_PATTERN =
    /^(?:(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,7}:|(?:[0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,5}(?::[0-9a-f]{1,4}){1,2}|(?:[0-9a-f]{1,4}:){1,4}(?::[0-9a-f]{1,4}){1,3}|(?:[0-9a-f]{1,4}:){1,3}(?::[0-9a-f]{1,4}){1,4}|(?:[0-9a-f]{1,4}:){1,2}(?::[0-9a-f]{1,4}){1,5}|[0-9a-f]{1,4}:(?:(?::[0-9a-f]{1,4}){1,6})|:(?:(?::[0-9a-f]{1,4}){1,7}|:))\/(?:12[0-8]|1[01]\d|[1-9]?\d)$/iu;
const COERCE_ISO_TIME_PATTERN =
    /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/u;
const COERCE_ISO_DURATION_PATTERN =
    /^P(?=\d|T\d)(?:\d+(?:[.,]\d+)?Y)?(?:\d+(?:[.,]\d+)?M)?(?:\d+(?:[.,]\d+)?W)?(?:\d+(?:[.,]\d+)?D)?(?:T(?:\d+(?:[.,]\d+)?H)?(?:\d+(?:[.,]\d+)?M)?(?:\d+(?:[.,]\d+)?S)?)?$/u;
const COERCE_GUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const COERCE_UUID_V4_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const COERCE_UUID_V6_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-6[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const COERCE_UUID_V7_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const COERCE_UPPERCASE_PATTERN = /^\P{Ll}*$/u;
const COERCE_LOWERCASE_PATTERN = /^\P{Lu}*$/u;

const coerceStringGuard = Object.freeze({
    min: (value: number, options?: CheckMessageInput): DecodeSource =>
        stringSchemaSource({
            tag: StringCheckTag.Min,
            value: checkStringLengthBound(value, "min"),
            message: readCheckMessage(options)
        }),
    max: (value: number, options?: CheckMessageInput): DecodeSource =>
        stringSchemaSource({
            tag: StringCheckTag.Max,
            value: checkStringLengthBound(value, "max"),
            message: readCheckMessage(options)
        }),
    length: (value: number, options?: CheckMessageInput): DecodeSource => {
        const bound = checkStringLengthBound(value, "length");
        const message = readCheckMessage(options);
        return stringSchemaSource(
            {
                tag: StringCheckTag.Min,
                value: bound,
                message
            },
            {
                tag: StringCheckTag.Max,
                value: bound,
                message
            }
        );
    },
    nonempty: (options?: CheckMessageInput): DecodeSource =>
        stringSchemaSource({
            tag: StringCheckTag.Min,
            value: 1,
            message: readCheckMessage(options)
        }),
    regex: (
        pattern: RegExp,
        name: string,
        options?: CheckMessageInput
    ): DecodeSource => stringRegexSource(pattern, name, options),
    startsWith: (value: string, options?: CheckMessageInput): DecodeSource =>
        stringRegexSource(
            new RegExp(`^${escapeCoerceRegExpString(readStringNeedle(value, "startsWith"))}`, "u"),
            "starts_with",
            options
        ),
    endsWith: (value: string, options?: CheckMessageInput): DecodeSource =>
        stringRegexSource(
            new RegExp(`${escapeCoerceRegExpString(readStringNeedle(value, "endsWith"))}$`, "u"),
            "ends_with",
            options
        ),
    includes: (value: string, options?: CheckMessageInput): DecodeSource =>
        stringRegexSource(
            new RegExp(escapeCoerceRegExpString(readStringNeedle(value, "includes")), "u"),
            "includes",
            options
        ),
    uppercase: (options?: CheckMessageInput): DecodeSource =>
        stringRegexSource(COERCE_UPPERCASE_PATTERN, "uppercase", options),
    lowercase: (options?: CheckMessageInput): DecodeSource =>
        stringRegexSource(COERCE_LOWERCASE_PATTERN, "lowercase", options),
    uuid: (options?: CoerceStringUuidInput): DecodeSource => {
        const version = readCoerceUuidVersion(options);
        if (version !== undefined) {
            return stringRegexSource(uuidCoerceVersionPattern(version), `uuid_${version}`, options);
        }
        return stringSchemaSource({
            tag: StringCheckTag.Uuid,
            message: readCheckMessage(options)
        });
    },
    guid: (options?: CheckMessageInput): DecodeSource =>
        stringRegexSource(COERCE_GUID_PATTERN, "guid", options),
    uuidv4: (options?: CheckMessageInput): DecodeSource =>
        stringRegexSource(COERCE_UUID_V4_PATTERN, "uuidv4", options),
    uuidv6: (options?: CheckMessageInput): DecodeSource =>
        stringRegexSource(COERCE_UUID_V6_PATTERN, "uuidv6", options),
    uuidv7: (options?: CheckMessageInput): DecodeSource =>
        stringRegexSource(COERCE_UUID_V7_PATTERN, "uuidv7", options),
    email: (options?: CoerceStringEmailInput): DecodeSource =>
        stringSchemaSource({
            tag: StringCheckTag.Email,
            message: readCheckMessage(options)
        }),
    url: (options?: CoerceStringUrlInput): DecodeSource =>
        options?.normalize === true
            ? normalizedCoerceUrlDecoder(readCheckMessage(options))
            : stringSchemaSource({
                tag: StringCheckTag.Url,
                message: readCheckMessage(options)
            }),
    httpUrl: (options?: CheckMessageInput): DecodeSource =>
        stringRegexSource(COERCE_HTTP_URL_PATTERN, "http_url", options),
    hostname: (options?: CheckMessageInput): DecodeSource =>
        stringRegexSource(COERCE_HOSTNAME_PATTERN, "hostname", options),
    e164: (options?: CheckMessageInput): DecodeSource =>
        stringRegexSource(COERCE_E164_PATTERN, "e164", options),
    emoji: (options?: CheckMessageInput): DecodeSource =>
        stringRegexSource(COERCE_EMOJI_PATTERN, "emoji", options),
    base64: (options?: CheckMessageInput): DecodeSource =>
        stringRegexSource(COERCE_BASE64_PATTERN, "base64", options),
    base64url: (options?: CheckMessageInput): DecodeSource =>
        stringRegexSource(COERCE_BASE64_URL_PATTERN, "base64url", options),
    hex: (options?: CheckMessageInput): DecodeSource =>
        stringRegexSource(COERCE_HEX_PATTERN, "hex", options),
    jwt: (options?: CoerceStringJwtInput): DecodeSource =>
        stringRegexSource(COERCE_JWT_PATTERN, "jwt", options),
    nanoid: (options?: CheckMessageInput): DecodeSource =>
        stringRegexSource(COERCE_NANOID_PATTERN, "nanoid", options),
    cuid: (options?: CheckMessageInput): DecodeSource =>
        stringRegexSource(COERCE_CUID_PATTERN, "cuid", options),
    cuid2: (options?: CheckMessageInput): DecodeSource =>
        stringRegexSource(COERCE_CUID2_PATTERN, "cuid2", options),
    xid: (options?: CheckMessageInput): DecodeSource =>
        stringSchemaSource({
            tag: StringCheckTag.Xid,
            message: readCheckMessage(options)
        }),
    ksuid: (options?: CheckMessageInput): DecodeSource =>
        stringSchemaSource({
            tag: StringCheckTag.Ksuid,
            message: readCheckMessage(options)
        }),
    mac: (delimiter: CoerceStringMacInput = ":"): DecodeSource => {
        const selected = readCoerceMacDelimiter(delimiter);
        return stringRegexSource(
            selected === ":" ? COERCE_MAC_COLON_PATTERN : COERCE_MAC_DASH_PATTERN,
            "mac",
            typeof delimiter === "string" ? undefined : delimiter
        );
    },
    cidrv4: (options?: CheckMessageInput): DecodeSource =>
        stringRegexSource(COERCE_CIDR_V4_PATTERN, "cidrv4", options),
    cidrv6: (options?: CheckMessageInput): DecodeSource =>
        stringRegexSource(COERCE_CIDR_V6_PATTERN, "cidrv6", options),
    isoDate: (options?: CheckMessageInput): DecodeSource =>
        stringSchemaSource({
            tag: StringCheckTag.IsoDate,
            message: readCheckMessage(options)
        }),
    date: (options?: CheckMessageInput): DecodeSource =>
        coerceStringGuard.isoDate(options),
    isoDateTime: (options?: CoerceStringIsoDateTimeInput): DecodeSource =>
        stringSchemaSource({
            tag: StringCheckTag.IsoDateTime,
            message: readCheckMessage(options)
        }),
    datetime: (options?: CoerceStringIsoDateTimeInput): DecodeSource =>
        coerceStringGuard.isoDateTime(options),
    isoTime: (options?: CoerceStringIsoTimeInput): DecodeSource =>
        stringRegexSource(COERCE_ISO_TIME_PATTERN, "iso_time", options),
    time: (options?: CoerceStringIsoTimeInput): DecodeSource =>
        coerceStringGuard.isoTime(options),
    isoDuration: (options?: CheckMessageInput): DecodeSource =>
        stringRegexSource(COERCE_ISO_DURATION_PATTERN, "iso_duration", options),
    duration: (options?: CheckMessageInput): DecodeSource =>
        coerceStringGuard.isoDuration(options),
    ulid: (options?: CheckMessageInput): DecodeSource =>
        stringSchemaSource({
            tag: StringCheckTag.Ulid,
            message: readCheckMessage(options)
        }),
    ipv4: (options?: CheckMessageInput): DecodeSource =>
        stringSchemaSource({
            tag: StringCheckTag.Ipv4,
            message: readCheckMessage(options)
        }),
    ipv6: (options?: CheckMessageInput): DecodeSource =>
        stringSchemaSource({
            tag: StringCheckTag.Ipv6,
            message: readCheckMessage(options)
        }),
    hash: (
        algorithm: StringHashAlgorithm,
        options?: CoerceStringHashInput
    ): DecodeSource => stringRegexSource(
        coerceHashPattern(algorithm, options),
        `hash_${algorithm}_${readCoerceHashEncoding(options)}`,
        options
    ),
    trim: (): DecodeSource => stringTransformSource((value: string): string =>
        String.prototype.trim.call(value)),
    toLowerCase: (): DecodeSource => stringTransformSource((value: string): string =>
        String.prototype.toLowerCase.call(value)),
    toUpperCase: (): DecodeSource => stringTransformSource((value: string): string =>
        String.prototype.toUpperCase.call(value)),
    slugify: (): DecodeSource => stringTransformSource((value: string): string =>
        value
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, "")
            .replace(/[\s_-]+/g, "-")
            .replace(/^-+|-+$/g, "")),
    normalize: (form: StringNormalizationForm = "NFC"): DecodeSource => {
        const normalizedForm = readCoerceNormalizationForm(form);
        return stringTransformSource((value: string): string =>
            String.prototype.normalize.call(value, normalizedForm));
    }
});

const coerceNumberGuard = Object.freeze({
    int: (options?: CheckMessageInput): DecodeSource =>
        numberSchemaSource({ tag: NumberCheckTag.Integer, message: readCheckMessage(options) }),
    int32: (options?: CheckMessageInput): DecodeSource => {
        const message = readCheckMessage(options);
        return numberSchemaSource(
            { tag: NumberCheckTag.Integer, message },
            { tag: NumberCheckTag.Gte, value: COERCE_INT32_MIN, message },
            { tag: NumberCheckTag.Lte, value: COERCE_INT32_MAX, message }
        );
    },
    uint32: (options?: CheckMessageInput): DecodeSource => {
        const message = readCheckMessage(options);
        return numberSchemaSource(
            { tag: NumberCheckTag.Integer, message },
            { tag: NumberCheckTag.Gte, value: COERCE_UINT32_MIN, message },
            { tag: NumberCheckTag.Lte, value: COERCE_UINT32_MAX, message }
        );
    },
    float32: (options?: CheckMessageInput): DecodeSource => {
        const message = readCheckMessage(options);
        return numberSchemaSource(
            { tag: NumberCheckTag.Gte, value: -COERCE_FLOAT32_MAX, message },
            { tag: NumberCheckTag.Lte, value: COERCE_FLOAT32_MAX, message }
        );
    },
    float64: (options?: CheckMessageInput): DecodeSource => {
        const message = readCheckMessage(options);
        return numberSchemaSource(
            { tag: NumberCheckTag.Gte, value: -COERCE_FLOAT64_MAX, message },
            { tag: NumberCheckTag.Lte, value: COERCE_FLOAT64_MAX, message }
        );
    },
    gte: (value: number, options?: CheckMessageInput): DecodeSource =>
        numberSchemaSource({
            tag: NumberCheckTag.Gte,
            value: checkFiniteNumberBound(value, "gte"),
            message: readCheckMessage(options)
        }),
    min: (value: number, options?: CheckMessageInput): DecodeSource =>
        numberSchemaSource({
            tag: NumberCheckTag.Gte,
            value: checkFiniteNumberBound(value, "min"),
            message: readCheckMessage(options)
        }),
    lte: (value: number, options?: CheckMessageInput): DecodeSource =>
        numberSchemaSource({
            tag: NumberCheckTag.Lte,
            value: checkFiniteNumberBound(value, "lte"),
            message: readCheckMessage(options)
        }),
    max: (value: number, options?: CheckMessageInput): DecodeSource =>
        numberSchemaSource({
            tag: NumberCheckTag.Lte,
            value: checkFiniteNumberBound(value, "max"),
            message: readCheckMessage(options)
        }),
    gt: (value: number, options?: CheckMessageInput): DecodeSource =>
        numberSchemaSource({
            tag: NumberCheckTag.Gt,
            value: checkFiniteNumberBound(value, "gt"),
            message: readCheckMessage(options)
        }),
    lt: (value: number, options?: CheckMessageInput): DecodeSource =>
        numberSchemaSource({
            tag: NumberCheckTag.Lt,
            value: checkFiniteNumberBound(value, "lt"),
            message: readCheckMessage(options)
        }),
    multipleOf: (value: number, options?: CheckMessageInput): DecodeSource =>
        numberSchemaSource({
            tag: NumberCheckTag.MultipleOf,
            value: checkPositiveFiniteNumber(value, "multipleOf"),
            message: readCheckMessage(options)
        }),
    step: (value: number, options?: CheckMessageInput): DecodeSource =>
        coerceNumberGuard.multipleOf(value, options),
    positive: (options?: CheckMessageInput): DecodeSource =>
        numberSchemaSource({ tag: NumberCheckTag.Gt, value: 0, message: readCheckMessage(options) }),
    nonnegative: (options?: CheckMessageInput): DecodeSource =>
        numberSchemaSource({ tag: NumberCheckTag.Gte, value: 0, message: readCheckMessage(options) }),
    negative: (options?: CheckMessageInput): DecodeSource =>
        numberSchemaSource({ tag: NumberCheckTag.Lt, value: 0, message: readCheckMessage(options) }),
    nonpositive: (options?: CheckMessageInput): DecodeSource =>
        numberSchemaSource({ tag: NumberCheckTag.Lte, value: 0, message: readCheckMessage(options) }),
    finite: (): DecodeSource => numberSchemaSource(),
    safe: (options?: CheckMessageInput): DecodeSource => {
        const message = readCheckMessage(options);
        return numberSchemaSource(
            { tag: NumberCheckTag.Integer, message },
            { tag: NumberCheckTag.Gte, value: Number.MIN_SAFE_INTEGER, message },
            { tag: NumberCheckTag.Lte, value: Number.MAX_SAFE_INTEGER, message }
        );
    }
});

const coerceBigIntGuard = Object.freeze({
    int64: (options?: CheckMessageInput): DecodeSource => {
        const message = readCheckMessage(options);
        return bigIntSchemaSource(
            { tag: BigIntCheckTag.Gte, value: COERCE_INT64_MIN, message },
            { tag: BigIntCheckTag.Lte, value: COERCE_INT64_MAX, message }
        );
    },
    uint64: (options?: CheckMessageInput): DecodeSource => {
        const message = readCheckMessage(options);
        return bigIntSchemaSource(
            { tag: BigIntCheckTag.Gte, value: 0n, message },
            { tag: BigIntCheckTag.Lte, value: COERCE_UINT64_MAX, message }
        );
    },
    gte: (value: bigint, options?: CheckMessageInput): DecodeSource =>
        bigIntSchemaSource({
            tag: BigIntCheckTag.Gte,
            value: readCoerceBigIntBound(value, "gte"),
            message: readCheckMessage(options)
        }),
    min: (value: bigint, options?: CheckMessageInput): DecodeSource =>
        bigIntSchemaSource({
            tag: BigIntCheckTag.Gte,
            value: readCoerceBigIntBound(value, "min"),
            message: readCheckMessage(options)
        }),
    lte: (value: bigint, options?: CheckMessageInput): DecodeSource =>
        bigIntSchemaSource({
            tag: BigIntCheckTag.Lte,
            value: readCoerceBigIntBound(value, "lte"),
            message: readCheckMessage(options)
        }),
    max: (value: bigint, options?: CheckMessageInput): DecodeSource =>
        bigIntSchemaSource({
            tag: BigIntCheckTag.Lte,
            value: readCoerceBigIntBound(value, "max"),
            message: readCheckMessage(options)
        }),
    gt: (value: bigint, options?: CheckMessageInput): DecodeSource =>
        bigIntSchemaSource({
            tag: BigIntCheckTag.Gt,
            value: readCoerceBigIntBound(value, "gt"),
            message: readCheckMessage(options)
        }),
    lt: (value: bigint, options?: CheckMessageInput): DecodeSource =>
        bigIntSchemaSource({
            tag: BigIntCheckTag.Lt,
            value: readCoerceBigIntBound(value, "lt"),
            message: readCheckMessage(options)
        }),
    multipleOf: (value: bigint, options?: CheckMessageInput): DecodeSource =>
        bigIntSchemaSource({
            tag: BigIntCheckTag.MultipleOf,
            value: readCoerceBigIntDivisor(value, "multipleOf"),
            message: readCheckMessage(options)
        }),
    step: (value: bigint, options?: CheckMessageInput): DecodeSource =>
        coerceBigIntGuard.multipleOf(value, options),
    positive: (options?: CheckMessageInput): DecodeSource =>
        coerceBigIntGuard.gt(0n, options),
    nonnegative: (options?: CheckMessageInput): DecodeSource =>
        coerceBigIntGuard.gte(0n, options),
    negative: (options?: CheckMessageInput): DecodeSource =>
        coerceBigIntGuard.lt(0n, options),
    nonpositive: (options?: CheckMessageInput): DecodeSource =>
        coerceBigIntGuard.lte(0n, options)
});

const coerceDateGuard = Object.freeze({
    min: (value: Date, options?: CheckMessageInput): DecodeSource =>
        dateSchemaSource({
            tag: DateCheckTag.Min,
            value: checkDateBound(value, "min"),
            message: readCheckMessage(options)
        }),
    max: (value: Date, options?: CheckMessageInput): DecodeSource =>
        dateSchemaSource({
            tag: DateCheckTag.Max,
            value: checkDateBound(value, "max"),
            message: readCheckMessage(options)
        })
});

/**
 * @brief String coercion decoder with Zod-style fluent checks.
 * @details Each check appends an ordinary StringGuard or string decoder to the
 * existing coercion pipeline, preserving call order without mutating receivers.
 */
export class CoerceStringDecoder extends BaseDecoder<string> {

    public constructor(run: DecodeRunner<string>) {
        super(run);
        Object.freeze(this);
    }

    public min(value: number, options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.min(value, options));
    }

    public max(value: number, options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.max(value, options));
    }

    public length(value: number, options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.length(value, options));
    }

    public nonempty(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.nonempty(options));
    }

    public regex(
        pattern: RegExp,
        name: string,
        options?: CheckMessageInput
    ): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.regex(pattern, name, options));
    }

    public startsWith(value: string, options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.startsWith(value, options));
    }

    public endsWith(value: string, options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.endsWith(value, options));
    }

    public includes(value: string, options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.includes(value, options));
    }

    public uppercase(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.uppercase(options));
    }

    public lowercase(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.lowercase(options));
    }

    public uuid(options?: CoerceStringUuidInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.uuid(options));
    }

    public guid(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.guid(options));
    }

    public uuidv4(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.uuidv4(options));
    }

    public uuidv6(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.uuidv6(options));
    }

    public uuidv7(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.uuidv7(options));
    }

    public email(options?: CoerceStringEmailInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.email(options));
    }

    public url(options?: CoerceStringUrlInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.url(options));
    }

    public httpUrl(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.httpUrl(options));
    }

    public hostname(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.hostname(options));
    }

    public e164(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.e164(options));
    }

    public emoji(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.emoji(options));
    }

    public base64(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.base64(options));
    }

    public base64url(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.base64url(options));
    }

    public hex(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.hex(options));
    }

    public jwt(options?: CoerceStringJwtInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.jwt(options));
    }

    public nanoid(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.nanoid(options));
    }

    public cuid(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.cuid(options));
    }

    public cuid2(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.cuid2(options));
    }

    public xid(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.xid(options));
    }

    public ksuid(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.ksuid(options));
    }

    public mac(delimiter: CoerceStringMacInput = ":"): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.mac(delimiter));
    }

    public cidrv4(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.cidrv4(options));
    }

    public cidrv6(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.cidrv6(options));
    }

    public isoDate(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.isoDate(options));
    }

    public date(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.date(options));
    }

    public isoDateTime(options?: CoerceStringIsoDateTimeInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.isoDateTime(options));
    }

    public datetime(options?: CoerceStringIsoDateTimeInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.datetime(options));
    }

    public isoTime(options?: CoerceStringIsoTimeInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.isoTime(options));
    }

    public time(options?: CoerceStringIsoTimeInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.time(options));
    }

    public isoDuration(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.isoDuration(options));
    }

    public duration(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.duration(options));
    }

    public ulid(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.ulid(options));
    }

    public ipv4(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.ipv4(options));
    }

    public ipv6(options?: CheckMessageInput): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.ipv6(options));
    }

    public hash(
        algorithm: StringHashAlgorithm,
        options?: CoerceStringHashInput
    ): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.hash(algorithm, options));
    }

    public trim(): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.trim());
    }

    public toLowerCase(): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.toLowerCase());
    }

    public toUpperCase(): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.toUpperCase());
    }

    public slugify(): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.slugify());
    }

    public normalize(form: StringNormalizationForm = "NFC"): CoerceStringDecoder {
        return chainCoerceString(this, coerceStringGuard.normalize(form));
    }
}

/**
 * @brief Number coercion decoder with Zod-style fluent checks.
 */
export class CoerceNumberDecoder extends BaseDecoder<number> {

    public constructor(run: DecodeRunner<number>) {
        super(run);
        Object.freeze(this);
    }

    public int(options?: CheckMessageInput): CoerceNumberDecoder {
        return chainCoerceNumber(this, coerceNumberGuard.int(options));
    }

    public int32(options?: CheckMessageInput): CoerceNumberDecoder {
        return chainCoerceNumber(this, coerceNumberGuard.int32(options));
    }

    public uint32(options?: CheckMessageInput): CoerceNumberDecoder {
        return chainCoerceNumber(this, coerceNumberGuard.uint32(options));
    }

    public float32(options?: CheckMessageInput): CoerceNumberDecoder {
        return chainCoerceNumber(this, coerceNumberGuard.float32(options));
    }

    public float64(options?: CheckMessageInput): CoerceNumberDecoder {
        return chainCoerceNumber(this, coerceNumberGuard.float64(options));
    }

    public gte(value: number, options?: CheckMessageInput): CoerceNumberDecoder {
        return chainCoerceNumber(this, coerceNumberGuard.gte(value, options));
    }

    public min(value: number, options?: CheckMessageInput): CoerceNumberDecoder {
        return chainCoerceNumber(this, coerceNumberGuard.min(value, options));
    }

    public lte(value: number, options?: CheckMessageInput): CoerceNumberDecoder {
        return chainCoerceNumber(this, coerceNumberGuard.lte(value, options));
    }

    public max(value: number, options?: CheckMessageInput): CoerceNumberDecoder {
        return chainCoerceNumber(this, coerceNumberGuard.max(value, options));
    }

    public gt(value: number, options?: CheckMessageInput): CoerceNumberDecoder {
        return chainCoerceNumber(this, coerceNumberGuard.gt(value, options));
    }

    public lt(value: number, options?: CheckMessageInput): CoerceNumberDecoder {
        return chainCoerceNumber(this, coerceNumberGuard.lt(value, options));
    }

    public multipleOf(value: number, options?: CheckMessageInput): CoerceNumberDecoder {
        return chainCoerceNumber(this, coerceNumberGuard.multipleOf(value, options));
    }

    public step(value: number, options?: CheckMessageInput): CoerceNumberDecoder {
        return chainCoerceNumber(this, coerceNumberGuard.step(value, options));
    }

    public positive(options?: CheckMessageInput): CoerceNumberDecoder {
        return chainCoerceNumber(this, coerceNumberGuard.positive(options));
    }

    public nonnegative(options?: CheckMessageInput): CoerceNumberDecoder {
        return chainCoerceNumber(this, coerceNumberGuard.nonnegative(options));
    }

    public negative(options?: CheckMessageInput): CoerceNumberDecoder {
        return chainCoerceNumber(this, coerceNumberGuard.negative(options));
    }

    public nonpositive(options?: CheckMessageInput): CoerceNumberDecoder {
        return chainCoerceNumber(this, coerceNumberGuard.nonpositive(options));
    }

    public finite(): CoerceNumberDecoder {
        return chainCoerceNumber(this, coerceNumberGuard.finite());
    }

    public safe(options?: CheckMessageInput): CoerceNumberDecoder {
        return chainCoerceNumber(this, coerceNumberGuard.safe(options));
    }
}

/**
 * @brief BigInt coercion decoder with Zod-style fluent checks.
 */
export class CoerceBigIntDecoder extends BaseDecoder<bigint> {

    public constructor(run: DecodeRunner<bigint>) {
        super(run);
        Object.freeze(this);
    }

    public int64(options?: CheckMessageInput): CoerceBigIntDecoder {
        return chainCoerceBigInt(this, coerceBigIntGuard.int64(options));
    }

    public uint64(options?: CheckMessageInput): CoerceBigIntDecoder {
        return chainCoerceBigInt(this, coerceBigIntGuard.uint64(options));
    }

    public gte(value: bigint, options?: CheckMessageInput): CoerceBigIntDecoder {
        return chainCoerceBigInt(this, coerceBigIntGuard.gte(value, options));
    }

    public min(value: bigint, options?: CheckMessageInput): CoerceBigIntDecoder {
        return chainCoerceBigInt(this, coerceBigIntGuard.min(value, options));
    }

    public lte(value: bigint, options?: CheckMessageInput): CoerceBigIntDecoder {
        return chainCoerceBigInt(this, coerceBigIntGuard.lte(value, options));
    }

    public max(value: bigint, options?: CheckMessageInput): CoerceBigIntDecoder {
        return chainCoerceBigInt(this, coerceBigIntGuard.max(value, options));
    }

    public gt(value: bigint, options?: CheckMessageInput): CoerceBigIntDecoder {
        return chainCoerceBigInt(this, coerceBigIntGuard.gt(value, options));
    }

    public lt(value: bigint, options?: CheckMessageInput): CoerceBigIntDecoder {
        return chainCoerceBigInt(this, coerceBigIntGuard.lt(value, options));
    }

    public multipleOf(value: bigint, options?: CheckMessageInput): CoerceBigIntDecoder {
        return chainCoerceBigInt(this, coerceBigIntGuard.multipleOf(value, options));
    }

    public step(value: bigint, options?: CheckMessageInput): CoerceBigIntDecoder {
        return chainCoerceBigInt(this, coerceBigIntGuard.step(value, options));
    }

    public positive(options?: CheckMessageInput): CoerceBigIntDecoder {
        return chainCoerceBigInt(this, coerceBigIntGuard.positive(options));
    }

    public nonnegative(options?: CheckMessageInput): CoerceBigIntDecoder {
        return chainCoerceBigInt(this, coerceBigIntGuard.nonnegative(options));
    }

    public negative(options?: CheckMessageInput): CoerceBigIntDecoder {
        return chainCoerceBigInt(this, coerceBigIntGuard.negative(options));
    }

    public nonpositive(options?: CheckMessageInput): CoerceBigIntDecoder {
        return chainCoerceBigInt(this, coerceBigIntGuard.nonpositive(options));
    }
}

/**
 * @brief Date coercion decoder with Zod-style fluent checks.
 */
export class CoerceDateDecoder extends BaseDecoder<Date> {

    public constructor(run: DecodeRunner<Date>) {
        super(run);
        Object.freeze(this);
    }

    public min(value: Date, options?: CheckMessageInput): CoerceDateDecoder {
        return chainCoerceDate(this, coerceDateGuard.min(value, options));
    }

    public max(value: Date, options?: CheckMessageInput): CoerceDateDecoder {
        return chainCoerceDate(this, coerceDateGuard.max(value, options));
    }
}

function chainCoerceString(source: CoerceStringDecoder, next: DecodeSource): CoerceStringDecoder {
    return new CoerceStringDecoder(chainedDecodeRunner<string>(
        source,
        next,
        "coerce string receiver",
        "coerce string target"
    ));
}

function chainCoerceNumber(source: CoerceNumberDecoder, next: DecodeSource): CoerceNumberDecoder {
    return new CoerceNumberDecoder(chainedDecodeRunner<number>(
        source,
        next,
        "coerce number receiver",
        "coerce number target"
    ));
}

function chainCoerceBigInt(source: CoerceBigIntDecoder, next: DecodeSource): CoerceBigIntDecoder {
    return new CoerceBigIntDecoder(chainedDecodeRunner<bigint>(
        source,
        next,
        "coerce bigint receiver",
        "coerce bigint target"
    ));
}

function chainCoerceDate(source: CoerceDateDecoder, next: DecodeSource): CoerceDateDecoder {
    return new CoerceDateDecoder(chainedDecodeRunner<Date>(
        source,
        next,
        "coerce date receiver",
        "coerce date target"
    ));
}

function chainedDecodeRunner<TValue>(
    source: Decoder<TValue>,
    next: DecodeSource,
    sourceLabel: string,
    nextLabel: string
): DecodeRunner<TValue> {
    const run = readDecoderRunner<TValue>(source, sourceLabel);
    const nextRun = readDecodeSourceRunner<TValue>(next, nextLabel);
    return (value: unknown): CheckResult<TValue> => {
        const decoded = run(value);
        if (!decoded.ok) {
            return decoded;
        }
        return nextRun(decoded.value);
    };
}

function stringSchemaSource(...checks: CoerceStringCheck[]): DecodeSource {
    return schemaDecodeSource({
        tag: SchemaTag.String,
        checks
    });
}

function numberSchemaSource(...checks: CoerceNumberCheck[]): DecodeSource {
    return schemaDecodeSource({
        tag: SchemaTag.Number,
        checks
    });
}

function bigIntSchemaSource(...checks: CoerceBigIntCheck[]): DecodeSource {
    return schemaDecodeSource({
        tag: SchemaTag.BigInt,
        checks
    });
}

function dateSchemaSource(...checks: CoerceDateCheck[]): DecodeSource {
    return schemaDecodeSource({
        tag: SchemaTag.Date,
        checks
    });
}

function schemaDecodeSource(schema: Schema): DecodeSource {
    return Object.freeze({
        schema
    }) as unknown as DecodeSource;
}

function stringRegexSource(
    pattern: RegExp,
    name: string,
    options?: CheckMessageInput
): DecodeSource {
    if (!(pattern instanceof RegExp) || Object.getPrototypeOf(pattern) !== RegExp.prototype) {
        throw new TypeError("regex pattern must be a plain RegExp");
    }
    if (typeof name !== "string") {
        throw new TypeError("regex name must be a string");
    }
    return stringSchemaSource({
        tag: StringCheckTag.Regex,
        regex: new RegExp(pattern.source, pattern.flags),
        name,
        message: readCheckMessage(options)
    });
}

function stringTransformSource(mapper: (value: string) => string): DecodeSource {
    return new BaseDecoder<string>((value: unknown): CheckResult<string> => {
        const checked = checkSchema<string>({
            tag: SchemaTag.String,
            checks: []
        }, value);
        if (!checked.ok) {
            return checked;
        }
        return okResult(mapper(checked.value));
    });
}

function normalizedCoerceUrlDecoder(message: string | undefined): DecodeSource {
    const run = readDecodeSourceRunner<string>(
        stringSchemaSource({
            tag: StringCheckTag.Url,
            message
        }),
        "coerce url normalize source"
    );
    return new BaseDecoder<string>((value: unknown): CheckResult<string> => {
        const checked = run(value);
        if (!checked.ok) {
            return checked;
        }
        return okResult(new URL(checked.value).href);
    });
}

function readStringNeedle(value: unknown, label: string): string {
    if (typeof value !== "string") {
        throw new TypeError(`${label} value must be a string`);
    }
    return value;
}

function escapeCoerceRegExpString(value: string): string {
    return value.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&");
}

function readCoerceUuidVersion(
    options: CoerceStringUuidInput | undefined
): StringUuidVersion | undefined {
    const version = readCoerceOption(options, "version");
    if (version === undefined) {
        return undefined;
    }
    if (typeof version !== "string") {
        throw new TypeError("uuid version must be v1, v2, v3, v4, v5, v6, v7, or v8");
    }
    switch (version) {
        case "v1":
        case "v2":
        case "v3":
        case "v4":
        case "v5":
        case "v6":
        case "v7":
        case "v8":
            return version;
        default:
            throw new TypeError("uuid version must be v1, v2, v3, v4, v5, v6, v7, or v8");
    }
}

function uuidCoerceVersionPattern(version: StringUuidVersion): RegExp {
    const nibble = version.slice(1);
    return new RegExp(
        `^[0-9a-f]{8}-[0-9a-f]{4}-${nibble}[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,
        "iu"
    );
}

function readCoerceMacDelimiter(value: CoerceStringMacInput): StringMacDelimiter {
    const delimiter = typeof value === "string"
        ? value
        : readCoerceOption(value, "delimiter") ?? ":";
    if (delimiter === ":" || delimiter === "-") {
        return delimiter;
    }
    throw new TypeError("mac delimiter must be ':' or '-'");
}

function coerceHashPattern(
    algorithm: StringHashAlgorithm,
    options: CoerceStringHashInput | undefined
): RegExp {
    const bytes = readCoerceHashByteLength(algorithm);
    const enc = readCoerceHashEncoding(options);
    switch (enc) {
        case "hex":
            return new RegExp(`^[0-9a-f]{${String(bytes * 2)}}$`, "iu");
        case "base64":
            return new RegExp(
                `^[A-Za-z0-9+/]{${String(base64BodyLength(bytes))}}${base64Padding(bytes)}$`,
                "u"
            );
        case "base64url":
            return new RegExp(`^[A-Za-z0-9_-]{${String(base64UrlLength(bytes))}}$`, "u");
    }
}

function readCoerceHashByteLength(algorithm: StringHashAlgorithm): number {
    switch (algorithm) {
        case "md5":
            return 16;
        case "sha1":
            return 20;
        case "sha256":
            return 32;
        case "sha384":
            return 48;
        case "sha512":
            return 64;
        default:
            throw new TypeError("hash algorithm must be md5, sha1, sha256, sha384, or sha512");
    }
}

function readCoerceHashEncoding(
    options: CoerceStringHashInput | undefined
): StringHashEncoding {
    const enc = readCoerceOption(options, "enc");
    if (enc === undefined) {
        return "hex";
    }
    if (enc === "hex" || enc === "base64" || enc === "base64url") {
        return enc;
    }
    throw new TypeError("hash encoding must be hex, base64, or base64url");
}

function base64BodyLength(bytes: number): number {
    const fullTriples = Math.floor(bytes / 3);
    const remainder = bytes % 3;
    return fullTriples * 4 + (remainder === 0 ? 0 : remainder + 1);
}

function base64Padding(bytes: number): string {
    switch (bytes % 3) {
        case 1:
            return "==";
        case 2:
            return "=";
        default:
            return "";
    }
}

function base64UrlLength(bytes: number): number {
    const fullTriples = Math.floor(bytes / 3);
    const remainder = bytes % 3;
    return fullTriples * 4 + (remainder === 0 ? 0 : remainder + 1);
}

function readCoerceNormalizationForm(value: unknown): StringNormalizationForm {
    if (value === "NFC" || value === "NFD" || value === "NFKC" || value === "NFKD") {
        return value;
    }
    throw new TypeError("string normalize form must be NFC, NFD, NFKC, or NFKD");
}

function checkPositiveFiniteNumber(value: number, label: string): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        throw new TypeError(`${label} divisor must be a positive finite number`);
    }
    return value;
}

function readCoerceBigIntBound(value: unknown, label: string): bigint {
    if (typeof value !== "bigint") {
        throw new TypeError(`${label} bigint bound must be a bigint`);
    }
    return value;
}

function readCoerceBigIntDivisor(value: unknown, label: string): bigint {
    if (typeof value !== "bigint" || value === 0n) {
        throw new TypeError(`${label} bigint divisor must be a non-zero bigint`);
    }
    return value;
}

function readCoerceOption(
    value: unknown,
    key: string
): unknown {
    if (value === undefined || typeof value === "string") {
        return undefined;
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return undefined;
    }
    return (value as Readonly<Record<string, unknown>>)[key];
}

/**
 * @brief Primitive coercion decoders with explicit failure issues.
 */
export const coerce = Object.freeze({
    string: coerceString,
    number: coerceNumber,
    boolean: coerceBoolean,
    date: coerceDate,
    bigint: coerceBigInt
} as const);

/**
 * @brief Build a decoder using JavaScript string coercion.
 */
export function coerceString(): CoerceStringDecoder {
    return new CoerceStringDecoder((value: unknown): CheckResult<string> => {
        // eslint-disable-next-line no-restricted-syntax
        try {
            return okResult(String(value));
        } catch {
            return fail("expected_string", "string-coercible value", value);
        }
    });
}

/**
 * @brief Build a decoder using JavaScript number coercion.
 */
export function coerceNumber(): CoerceNumberDecoder {
    return new CoerceNumberDecoder((value: unknown): CheckResult<number> => {
        // eslint-disable-next-line no-restricted-syntax
        try {
            return checkSchema<number>(numberSchema, Number(value));
        } catch {
            return fail("expected_number", "number-coercible value", value);
        }
    });
}

/**
 * @brief Build a decoder using JavaScript boolean coercion.
 */
export function coerceBoolean(): BaseDecoder<boolean> {
    return new BaseDecoder<boolean>((value: unknown): CheckResult<boolean> => {
        return okResult(Boolean(value));
    });
}

/**
 * @brief Coerce primitive date-like input into a valid Date.
 * @returns Decoder producing a valid Date object.
 * @details This follows JavaScript Date constructor coercion for Zod parity.
 */
export function coerceDate(): CoerceDateDecoder {
    return new CoerceDateDecoder((value: unknown): CheckResult<Date> => {
        if (value instanceof Date) {
            return checkSchema<Date>(dateSchema, value);
        }
        // eslint-disable-next-line no-restricted-syntax
        try {
            return checkSchema<Date>(dateSchema, new Date(value as string | number | Date));
        } catch {
            return fail("expected_date", "date-coercible value", value);
        }
    });
}

/**
 * @brief Coerce integer strings and numbers into bigint.
 * @returns Decoder producing a bigint value.
 */
export function coerceBigInt(): CoerceBigIntDecoder {
    return new CoerceBigIntDecoder((value: unknown): CheckResult<bigint> => {
        if (typeof value === "bigint") {
            return okResult(value);
        }
        // eslint-disable-next-line no-restricted-syntax
        try {
            return okResult(BigInt(value as string | number | bigint | boolean));
        } catch {
            return fail("expected_bigint", "bigint-coercible value", value);
        }
    });
}

/**
 * @brief Build an env-style boolean string codec.
 * @param options Optional truthy and falsy token sets.
 * @returns Codec decoding strings to booleans and encoding booleans to strings.
 */
export function stringbool(options?: Partial<StringBoolOptions>): BaseCodec<string, boolean> {
    const config = readStringBoolOptions(options);
    return new BaseCodec<string, boolean>(
        (value: unknown): CheckResult<boolean> => {
            if (typeof value !== "string") {
                return fail("expected_boolean", "boolean string", value);
            }
            const token = normalizeStringBoolToken(value.trim(), config.caseSensitive);
            if (config.truthyLookup[token] === true) {
                return okResult(true);
            }
            if (config.falsyLookup[token] === true) {
                return okResult(false);
            }
            return fail("expected_boolean", "boolean string", value);
        },
        (value: unknown): CheckResult<string> => {
            if (typeof value !== "boolean") {
                return fail("expected_boolean", "boolean", value);
            }
            return okResult(value ? config.truthy[0] : config.falsy[0]);
        }
    );
}

/**
 * @brief Check decoder value.
 */
export function isDecoderValue(value: unknown): value is Decoder<unknown> {
    return isConstructedDecoder(value);
}

/**
 * @brief Check codec value.
 * @param value Candidate runtime value.
 * @returns True when the value is a TypeSea codec.
 */
export function isCodecValue(value: unknown): value is Codec<unknown, unknown> {
    return isConstructedCodec(value);
}

interface TupleDecodeEntry {
    readonly decode: DecodeRunner<unknown>;
    readonly encode: EncodeRunner<unknown> | undefined;
}

interface TupleDecodeConfig {
    readonly entries: readonly TupleDecodeEntry[];
    readonly rest: TupleDecodeEntry | undefined;
    readonly encodable: boolean;
}

/**
 * @brief Decode or encode array items without executing index accessors.
 * @param value Candidate array.
 * @param runner Field runner applied to each logical index.
 * @returns Result carrying transformed array output.
 */
function runArrayItems(
    value: unknown,
    runner: DecodeRunner<unknown>
): CheckResult<readonly unknown[]> {
    if (!Array.isArray(value)) {
        return fail("expected_array", "array", value);
    }
    const output = new Array<unknown>(value.length);
    const issues: Issue[] = [];
    for (let index = 0; index < value.length; index += 1) {
        runIndexedItem(value, index, runner, output, issues);
    }
    if (issues.length !== 0) {
        return err(freezeIssueArray(issues));
    }
    return okResult(output);
}

/**
 * @brief Normalize tuple decode sources.
 * @param shape Ordered tuple field sources.
 * @param rest Optional rest source.
 * @returns Frozen tuple execution config.
 */
function readTupleDecodeConfig(
    shape: TupleDecodeShape,
    rest: DecodeSource | undefined
): TupleDecodeConfig {
    const rawShape: unknown = shape;
    if (!Array.isArray(rawShape)) {
        throw new TypeError("tuple decoder shape must be an array");
    }
    const entries = new Array<TupleDecodeEntry>(shape.length);
    let encodable = true;
    for (let index = 0; index < shape.length; index += 1) {
        const source = shape[index];
        const label = `tuple item ${String(index)}`;
        const entry = readTupleDecodeEntry(source, label);
        if (entry.encode === undefined) {
            encodable = false;
        }
        entries[index] = entry;
    }
    const restEntry = rest === undefined
        ? undefined
        : readTupleDecodeEntry(rest, "tuple rest");
    if (restEntry !== undefined && restEntry.encode === undefined) {
        encodable = false;
    }
    return Object.freeze({
        entries: Object.freeze(entries),
        rest: restEntry,
        encodable
    });
}

/**
 * @brief Normalize one tuple field source.
 * @param source Guard, decoder, or codec for one tuple slot.
 * @param label Message prefix for construction errors.
 * @returns Frozen tuple field execution entry.
 */
function readTupleDecodeEntry(source: unknown, label: string): TupleDecodeEntry {
    return Object.freeze({
        decode: readDecodeSourceRunner(source, label),
        encode: readEncodeSourceRunner(source, label)
    });
}

/**
 * @brief Decode or encode tuple slots.
 * @param config Frozen tuple execution config.
 * @param value Candidate tuple value.
 * @param encoding Whether to use encode runners.
 * @returns Result carrying transformed tuple output.
 */
function runTupleItems(
    config: TupleDecodeConfig,
    value: unknown,
    encoding: boolean
): CheckResult<readonly unknown[]> {
    if (!Array.isArray(value)) {
        return fail("expected_tuple", "tuple", value);
    }
    const fixedLength = config.entries.length;
    if (config.rest === undefined && value.length !== fixedLength) {
        return tupleLengthFailure(fixedLength, value.length);
    }
    if (config.rest !== undefined && value.length < fixedLength) {
        return tupleLengthFailure(`>= ${String(fixedLength)}`, value.length);
    }
    const output = new Array<unknown>(value.length);
    const issues: Issue[] = [];
    for (let index = 0; index < fixedLength; index += 1) {
        const entry = config.entries[index];
        if (entry !== undefined) {
            runIndexedItem(
                value,
                index,
                readTupleRunner(entry, encoding),
                output,
                issues
            );
        }
    }
    const rest = config.rest;
    if (rest !== undefined) {
        const runner = readTupleRunner(rest, encoding);
        for (let index = fixedLength; index < value.length; index += 1) {
            runIndexedItem(value, index, runner, output, issues);
        }
    }
    if (issues.length !== 0) {
        return err(freezeIssueArray(issues));
    }
    return okResult(output);
}

/**
 * @brief Select a tuple field runner.
 * @param entry Tuple field entry.
 * @param encoding Whether to select encode.
 * @returns Runner for the requested direction.
 */
function readTupleRunner(
    entry: TupleDecodeEntry,
    encoding: boolean
): DecodeRunner<unknown> {
    const runner = encoding ? entry.encode : entry.decode;
    if (runner !== undefined) {
        return runner;
    }
    return (): CheckResult<unknown> => err(freezeIssueArray([
        makeIssue(
            Object.freeze([]),
            "expected_refinement",
            "encodable field",
            "one-way decoder",
            undefined
        )
    ]));
}

/**
 * @brief Decode one array or tuple index.
 * @param source Source array.
 * @param index Logical index.
 * @param runner Field runner.
 * @param output Mutable output array.
 * @param issues Mutable issue buffer.
 */
function runIndexedItem(
    source: readonly unknown[],
    index: number,
    runner: DecodeRunner<unknown>,
    output: unknown[],
    issues: Issue[]
): void {
    const descriptor = Object.getOwnPropertyDescriptor(source, String(index));
    if (descriptor !== undefined &&
        !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        issues.push(makeIssue(
            Object.freeze([index]),
            "expected_array",
            "data property",
            "accessor",
            undefined
        ));
        return;
    }
    const input = descriptor === undefined ? undefined : readDescriptorValue(descriptor);
    const decoded = runner(input);
    if (!decoded.ok) {
        appendPrefixedIssues(index, decoded.error, issues);
        return;
    }
    output[index] = decoded.value;
}

/**
 * @brief Build a tuple length failure.
 * @param expected Expected tuple length label.
 * @param actual Actual array length.
 * @returns Failed Result with one length issue.
 */
function tupleLengthFailure(
    expected: string | number,
    actual: number
): CheckResult<readonly unknown[]> {
    return err(freezeIssueArray([
        makeIssue(
            Object.freeze([]),
            "expected_tuple_length",
            String(expected),
            String(actual),
            undefined
        )
    ]));
}

interface RecordDecodeConfig {
    readonly keySchema: Schema | undefined;
    readonly key: DecodeRunner<unknown> | undefined;
    readonly value: DecodeRunner<unknown>;
    readonly encodeValue: EncodeRunner<unknown> | undefined;
    readonly loose: boolean;
    readonly requiredKeys: readonly string[] | undefined;
}

interface PairContainerConfig {
    readonly key: DecodeRunner<unknown>;
    readonly value: DecodeRunner<unknown>;
    readonly encodeKey: EncodeRunner<unknown> | undefined;
    readonly encodeValue: EncodeRunner<unknown> | undefined;
}

/**
 * @brief Normalize record decode sources.
 * @param keyOrValue Value source, or key source when value is present.
 * @param value Optional value source.
 * @param loose Whether failing keys should pass through unvalidated.
 * @returns Frozen record execution config.
 */
function readRecordDecodeConfig(
    keyOrValue: DecodeSource,
    value: DecodeSource | undefined,
    loose: boolean
): RecordDecodeConfig {
    const valueSource = value ?? keyOrValue;
    const keySchema = value === undefined
        ? undefined
        : readGuardSchema(keyOrValue, "record key");
    return Object.freeze({
        keySchema,
        key: value === undefined
            ? undefined
            : readDecodeSourceRunner<unknown>(keyOrValue, "record key"),
        value: readDecodeSourceRunner<unknown>(valueSource, "record value"),
        encodeValue: readEncodeSourceRunner(valueSource, "record value"),
        loose,
        requiredKeys: keySchema === undefined || loose
            ? undefined
            : closedStringRecordKeys(keySchema)
    });
}

/**
 * @brief Decode or encode record values.
 * @param config Frozen record execution config.
 * @param input Candidate record.
 * @param encoding Whether value codecs should encode.
 * @returns Result carrying transformed record output.
 */
function runRecordEntries(
    config: RecordDecodeConfig,
    input: unknown,
    encoding: boolean
): CheckResult<Readonly<Record<string, unknown>>> {
    if (!isRecord(input)) {
        return fail("expected_record", "record", input);
    }
    const output: Record<PropertyKey, unknown> = {};
    const issues: Issue[] = [];
    const keys = Object.keys(input);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key !== undefined) {
            runRecordEntry(config, input, output, issues, encoding, key);
        }
    }
    appendMissingRecordKeyIssues(config, input, issues);
    if (issues.length !== 0) {
        return err(freezeIssueArray(issues));
    }
    return okResult(output as Readonly<Record<string, unknown>>);
}

/**
 * @brief Decode or encode one record entry.
 */
function runRecordEntry(
    config: RecordDecodeConfig,
    input: object,
    output: Record<PropertyKey, unknown>,
    issues: Issue[],
    encoding: boolean,
    key: string
): void {
    if (!recordKeyAccepted(config, key, output, input, issues)) {
        return;
    }
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor === undefined ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        issues.push(makeIssue(
            Object.freeze([key]),
            "expected_record",
            "data property",
            descriptor === undefined ? "missing" : "accessor",
            undefined
        ));
        return;
    }
    const runner = encoding ? config.encodeValue : config.value;
    if (runner === undefined) {
        issues.push(makeIssue(
            Object.freeze([key]),
            "expected_refinement",
            "encodable field",
            "one-way decoder",
            undefined
        ));
        return;
    }
    const decoded = runner(readDescriptorValue(descriptor));
    if (!decoded.ok) {
        appendPrefixedIssues(key, decoded.error, issues);
        return;
    }
    defineOutputProperty(output, key, decoded.value, true);
}

/**
 * @brief Report missing exhaustive record keys.
 */
function appendMissingRecordKeyIssues(
    config: RecordDecodeConfig,
    input: object,
    issues: Issue[]
): void {
    const requiredKeys = config.requiredKeys;
    if (requiredKeys === undefined) {
        return;
    }
    for (let index = 0; index < requiredKeys.length; index += 1) {
        const key = requiredKeys[index];
        if (key === undefined) {
            continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        if (descriptor?.enumerable !== true) {
            issues.push(makeIssue(
                Object.freeze([key]),
                "expected_record",
                "enumerable data property",
                "missing",
                undefined
            ));
        }
    }
}

/**
 * @brief Validate one record key and handle loose pass-through entries.
 */
function recordKeyAccepted(
    config: RecordDecodeConfig,
    key: string,
    output: Record<PropertyKey, unknown>,
    input: object,
    issues: Issue[]
): boolean {
    const keyRunner = config.key;
    if (keyRunner === undefined) {
        return true;
    }
    const checked = keyRunner(recordKeyInput(config.keySchema, key));
    if (checked.ok) {
        return true;
    }
    if (config.loose) {
        copyLooseRecordEntry(input, output, key);
    } else {
        appendPrefixedIssues(key, checked.error, issues);
    }
    return false;
}

/**
 * @brief Copy a loose-record entry that did not match the key schema.
 */
function copyLooseRecordEntry(
    input: object,
    output: Record<PropertyKey, unknown>,
    key: string
): void {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor !== undefined &&
        Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        defineOutputProperty(output, key, readDescriptorValue(descriptor), true);
    }
}

/**
 * @brief Normalize paired key/value container sources.
 */
function readPairContainerConfig(
    key: DecodeSource,
    value: DecodeSource,
    keyLabel: string,
    valueLabel: string
): PairContainerConfig {
    return Object.freeze({
        key: readDecodeSourceRunner<unknown>(key, keyLabel),
        value: readDecodeSourceRunner<unknown>(value, valueLabel),
        encodeKey: readEncodeSourceRunner(key, keyLabel),
        encodeValue: readEncodeSourceRunner(value, valueLabel)
    });
}

/**
 * @brief Decode or encode Map entries.
 */
function runMapEntries(
    config: PairContainerConfig,
    input: unknown,
    encoding: boolean
): CheckResult<ReadonlyMap<unknown, unknown>> {
    const iterator = readMapEntries(input);
    if (iterator === undefined) {
        return fail("expected_map", "Map", input);
    }
    const output = new Map<unknown, unknown>();
    const issues: Issue[] = [];
    let index = 0;
    for (;;) {
        const step = iterator.next();
        if (step.done === true) {
            break;
        }
        const pair = step.value;
        runMapEntry(config, pair[0], pair[1], output, issues, encoding, index);
        index += 1;
    }
    if (issues.length !== 0) {
        return err(freezeIssueArray(issues));
    }
    return okResult(output);
}

/**
 * @brief Decode or encode one Map entry.
 */
function runMapEntry(
    config: PairContainerConfig,
    rawKey: unknown,
    rawValue: unknown,
    output: Map<unknown, unknown>,
    issues: Issue[],
    encoding: boolean,
    index: number
): void {
    const keyRunner = encoding ? config.encodeKey : config.key;
    const valueRunner = encoding ? config.encodeValue : config.value;
    if (keyRunner === undefined || valueRunner === undefined) {
        issues.push(makeIssue(
            Object.freeze([index]),
            "expected_refinement",
            "encodable entry",
            "one-way decoder",
            undefined
        ));
        return;
    }
    const key = keyRunner(rawKey);
    if (!key.ok) {
        appendPrefixedPathIssues([index, "key"], key.error, issues);
    }
    const value = valueRunner(rawValue);
    if (!value.ok) {
        appendPrefixedPathIssues([index, "value"], value.error, issues);
        return;
    }
    if (!key.ok) {
        return;
    }
    output.set(key.value, value.value);
}

/**
 * @brief Decode or encode Set values.
 */
function runSetValues(
    input: unknown,
    runner: DecodeRunner<unknown>
): CheckResult<ReadonlySet<unknown>> {
    const iterator = readSetValues(input);
    if (iterator === undefined) {
        return fail("expected_set", "Set", input);
    }
    const output = new Set<unknown>();
    const issues: Issue[] = [];
    let index = 0;
    for (;;) {
        const step = iterator.next();
        if (step.done === true) {
            break;
        }
        const decoded = runner(step.value);
        if (!decoded.ok) {
            appendPrefixedIssues(index, decoded.error, issues);
        } else {
            output.add(decoded.value);
        }
        index += 1;
    }
    if (issues.length !== 0) {
        return err(freezeIssueArray(issues));
    }
    return okResult(output);
}

interface ObjectDecodeEntry {
    readonly key: string;
    readonly decode: DecodeRunner<unknown>;
    readonly encode: EncodeRunner<unknown> | undefined;
}

interface ObjectDecodeConfig {
    readonly entries: readonly ObjectDecodeEntry[];
    readonly keyLookup: Readonly<Record<string, true>>;
    readonly mode: ObjectDecodeMode;
    readonly encodable: boolean;
}

/**
 * @brief Normalize a decoder-aware object shape.
 * @param shape User supplied object shape.
 * @param mode Unknown-key policy.
 * @returns Frozen execution config for object decode and encode runners.
 */
function readObjectDecodeConfig(
    shape: ObjectDecodeShape,
    mode: ObjectDecodeMode
): ObjectDecodeConfig {
    if (!isRecord(shape)) {
        throw new TypeError("object decoder shape must be an object");
    }
    const keys = Object.keys(shape);
    const entries = new Array<ObjectDecodeEntry>(keys.length);
    const keyLookup: Record<string, true> = Object.create(null) as Record<string, true>;
    let encodable = true;
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined) {
            throw new TypeError("object decoder key disappeared during construction");
        }
        const source = shape[key];
        const label = `object decoder property ${key}`;
        const decodeRun = readDecodeSourceRunner(source, label);
        const encodeRun = readEncodeSourceRunner(source, label);
        if (encodeRun === undefined) {
            encodable = false;
        }
        keyLookup[key] = true;
        entries[index] = Object.freeze({
            key,
            decode: decodeRun,
            encode: encodeRun
        });
    }
    return Object.freeze({
        entries: Object.freeze(entries),
        keyLookup: Object.freeze(keyLookup),
        mode,
        encodable
    });
}

/**
 * @brief Resolve the encode side for one object field.
 * @param source Guard or codec supplied in the object shape.
 * @param label Message prefix for construction errors.
 * @returns Encode runner, or undefined for one-way decoders.
 */
function readEncodeSourceRunner(
    source: unknown,
    label: string
): EncodeRunner<unknown> | undefined {
    if (isConstructedCodec(source)) {
        return readCodecEncodeRunner<unknown>(source, label);
    }
    if (isConstructedDecoder(source)) {
        return undefined;
    }
    return readDecodeSourceRunner<unknown>(source, label);
}

/**
 * @brief Decode an object through field-level sources.
 * @param config Frozen object decode config.
 * @param value Candidate encoded object.
 * @returns Result containing transformed object output or path-prefixed issues.
 */
function decodeObjectValue(
    config: ObjectDecodeConfig,
    value: unknown
): CheckResult<unknown> {
    return runObjectFields(config, value, false);
}

/**
 * @brief Encode an object through field-level codecs.
 * @param config Frozen object decode config.
 * @param value Candidate decoded object.
 * @returns Result containing encoded object output or path-prefixed issues.
 */
function encodeObjectValue(
    config: ObjectDecodeConfig,
    value: unknown
): CheckResult<unknown> {
    return runObjectFields(config, value, true);
}

/**
 * @brief Run object field decoders in either decode or encode direction.
 * @param config Frozen object decode config.
 * @param value Candidate object.
 * @param encoding Whether to use codec encode runners.
 * @returns Result containing the rebuilt object or frozen issues.
 */
function runObjectFields(
    config: ObjectDecodeConfig,
    value: unknown,
    encoding: boolean
): CheckResult<unknown> {
    if (!isRecord(value)) {
        return fail("expected_object", "object", value);
    }
    const output: Record<PropertyKey, unknown> = {};
    const issues: Issue[] = [];
    copyDeclaredObjectFields(config, value, output, issues, encoding);
    collectStrictObjectExtras(config, value, issues);
    if (issues.length !== 0) {
        return err(freezeIssueArray(issues));
    }
    if (config.mode === ObjectModeTag.Passthrough) {
        copyPassthroughObjectExtras(config, value, output);
    }
    return okResult(output);
}

/**
 * @brief Decode or encode all declared object fields.
 * @param config Frozen object decode config.
 * @param source Source object being transformed.
 * @param output Mutable output object.
 * @param issues Mutable issue buffer.
 * @param encoding Whether to use encode runners.
 */
function copyDeclaredObjectFields(
    config: ObjectDecodeConfig,
    source: object,
    output: Record<PropertyKey, unknown>,
    issues: Issue[],
    encoding: boolean
): void {
    const entries = config.entries;
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
            continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(source, entry.key);
        const present = descriptor !== undefined;
        if (descriptor !== undefined &&
            !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
            issues.push(makeIssue(
                Object.freeze([entry.key]),
                "expected_object",
                "data property",
                "accessor",
                undefined
            ));
            continue;
        }
        const runner = encoding ? entry.encode : entry.decode;
        if (runner === undefined) {
            issues.push(makeIssue(
                Object.freeze([entry.key]),
                "expected_refinement",
                "encodable field",
                "one-way decoder",
                undefined
            ));
            continue;
        }
        const input = descriptor === undefined ? undefined : readDescriptorValue(descriptor);
        const decoded = runner(input);
        if (!decoded.ok) {
            appendPrefixedIssues(entry.key, decoded.error, issues);
            continue;
        }
        if (present || decoded.value !== undefined) {
            defineOutputProperty(output, entry.key, decoded.value, true);
        }
    }
}

/**
 * @brief Reject unknown keys for strict object decoders.
 * @param config Frozen object decode config.
 * @param source Source object being transformed.
 * @param issues Mutable issue buffer.
 */
function collectStrictObjectExtras(
    config: ObjectDecodeConfig,
    source: object,
    issues: Issue[]
): void {
    if (config.mode !== ObjectModeTag.Strict) {
        return;
    }
    const keys = Reflect.ownKeys(source);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined ||
            (typeof key === "string" && config.keyLookup[key] === true)) {
            continue;
        }
        issues.push(makeIssue(
            Object.freeze([typeof key === "string" ? key : String(key)]),
            "unrecognized_key",
            "known key",
            "extra key",
            undefined
        ));
    }
}

/**
 * @brief Copy undeclared own data properties in passthrough mode.
 * @param config Frozen object decode config.
 * @param source Source object being transformed.
 * @param output Mutable output object.
 */
function copyPassthroughObjectExtras(
    config: ObjectDecodeConfig,
    source: object,
    output: Record<PropertyKey, unknown>
): void {
    const keys = Reflect.ownKeys(source);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined ||
            (typeof key === "string" && config.keyLookup[key] === true)) {
            continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(source, key);
        if (descriptor !== undefined &&
            Object.prototype.hasOwnProperty.call(descriptor, "value")) {
            defineOutputProperty(
                output,
                key,
                readDescriptorValue(descriptor),
                descriptor.enumerable === true
            );
        }
    }
}

/**
 * @brief Read a descriptor value as unknown.
 * @param descriptor Data descriptor already checked by the caller.
 * @returns Descriptor payload without exposing the lib.d.ts value type.
 */
function readDescriptorValue(descriptor: PropertyDescriptor): unknown {
    return (descriptor as { readonly value: unknown }).value;
}

/**
 * @brief Append field-prefixed child issues.
 * @param key Object field key that owns the child result.
 * @param source Child issues returned by a field runner.
 * @param target Mutable aggregate issue buffer.
 */
function appendPrefixedIssues(
    key: PathSegment,
    source: readonly Issue[],
    target: Issue[]
): void {
    appendPrefixedPathIssues([key], source, target);
}

/**
 * @brief Append child issues under a multi-segment prefix.
 * @param prefix Prefix path owned by the parent container.
 * @param source Child issues returned by a field runner.
 * @param target Mutable aggregate issue buffer.
 */
function appendPrefixedPathIssues(
    prefix: readonly PathSegment[],
    source: readonly Issue[],
    target: Issue[]
): void {
    for (let index = 0; index < source.length; index += 1) {
        const issue = source[index];
        if (issue === undefined) {
            continue;
        }
        target.push(makeIssue(
            prefixIssuePath(prefix, issue.path),
            issue.code,
            issue.expected,
            issue.actual,
            issue.message
        ));
    }
}

/**
 * @brief Copy an issue path under one object key.
 * @param prefix Parent path prefix.
 * @param path Child issue path.
 * @returns Frozen prefixed path.
 */
function prefixIssuePath(
    prefix: readonly PathSegment[],
    path: readonly PathSegment[]
): readonly PathSegment[] {
    const prefixed = new Array<PathSegment>(prefix.length + path.length);
    for (let index = 0; index < prefix.length; index += 1) {
        const segment = prefix[index];
        if (segment !== undefined) {
            prefixed[index] = segment;
        }
    }
    for (let index = 0; index < path.length; index += 1) {
        const segment = path[index];
        if (segment !== undefined) {
            prefixed[prefix.length + index] = segment;
        }
    }
    return Object.freeze(prefixed);
}

/**
 * @brief Define one ordinary data property on transformed object output.
 * @param output Object being built.
 * @param key Property key.
 * @param value Decoded or encoded field value.
 * @param enumerable Whether enumeration should expose the field.
 */
function defineOutputProperty(
    output: Record<PropertyKey, unknown>,
    key: PropertyKey,
    value: unknown,
    enumerable: boolean
): void {
    Object.defineProperty(output, key, {
        configurable: true,
        enumerable,
        value,
        writable: true
    });
}

/**
 * @brief Test decoder identity through the private registry.
 * @param value Candidate decoder.
 * @returns True when TypeSea constructed the decoder instance.
 */
function isConstructedDecoder(value: unknown): value is ConstructedDecoder<unknown> {
    return isRecord(value) && constructedDecoders.has(value);
}

/**
 * @brief Test codec identity through the private encode slot.
 * @param value Candidate codec.
 * @returns True when TypeSea constructed the codec instance.
 */
function isConstructedCodec(value: unknown): value is ConstructedCodec<unknown, unknown> {
    return isConstructedDecoder(value) &&
        Object.prototype.hasOwnProperty.call(value, CodecEncodeSymbol);
}

/**
 * @brief Resolve a default value or zero-argument producer.
 * @param fallback Stored fallback value or producer.
 * @returns Concrete fallback output.
 */
function resolveDefault<TValue>(fallback: DefaultInput<TValue>): TValue {
    return typeof fallback === "function"
        ? (fallback as () => TValue)()
        : fallback;
}

/**
 * @brief Resolve a failure fallback after validation failure.
 * @param fallback Stored fallback value or producer.
 * @param error Frozen validation issues from the failed decode.
 * @returns Concrete fallback output.
 */
function resolveCatch<TValue>(
    fallback: CatchInput<TValue>,
    error: readonly Issue[]
): TValue {
    return typeof fallback === "function"
        ? (fallback as (context: CatchContext) => TValue)(Object.freeze({ error }))
        : fallback;
}

interface StringBoolConfig {
    readonly truthy: readonly [string, ...string[]];
    readonly falsy: readonly [string, ...string[]];
    readonly truthyLookup: Readonly<Record<string, true>>;
    readonly falsyLookup: Readonly<Record<string, true>>;
    readonly caseSensitive: boolean;
}

const DEFAULT_STRINGBOOL_TRUTHY = Object.freeze([
    "true",
    "1",
    "yes",
    "on",
    "y",
    "enabled"
] as const);

const DEFAULT_STRINGBOOL_FALSY = Object.freeze([
    "false",
    "0",
    "no",
    "off",
    "n",
    "disabled"
] as const);

const ISO_DATETIME_CODEC_PATTERN =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/u;
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * @brief Normalize stringbool options.
 */
function readStringBoolOptions(
    value: Partial<StringBoolOptions> | undefined
): StringBoolConfig {
    if (value !== undefined && !isRecord(value)) {
        throw new TypeError("stringbool options must be an object");
    }
    const caseSensitive = readStringBoolCase(value?.case);
    const truthy = readStringBoolTokenList(
        value?.truthy,
        DEFAULT_STRINGBOOL_TRUTHY,
        "stringbool truthy",
        caseSensitive
    );
    const falsy = readStringBoolTokenList(
        value?.falsy,
        DEFAULT_STRINGBOOL_FALSY,
        "stringbool falsy",
        caseSensitive
    );
    const truthyLookup = makeTokenLookup(truthy);
    const falsyLookup = makeTokenLookup(falsy);
    for (let index = 0; index < truthy.length; index += 1) {
        const token = truthy[index];
        if (token !== undefined && falsyLookup[token] === true) {
            throw new TypeError("stringbool truthy and falsy tokens must not overlap");
        }
    }
    return Object.freeze({
        truthy,
        falsy,
        truthyLookup,
        falsyLookup,
        caseSensitive
    });
}

/**
 * @brief Normalize the stringbool case mode.
 */
function readStringBoolCase(value: unknown): boolean {
    if (value === undefined || value === "insensitive") {
        return false;
    }
    if (value === "sensitive") {
        return true;
    }
    throw new TypeError("stringbool case must be insensitive or sensitive");
}

/**
 * @brief Normalize one stringbool token list.
 */
function readStringBoolTokenList(
    value: readonly string[] | undefined,
    fallback: readonly [string, ...string[]],
    label: string,
    caseSensitive: boolean
): readonly [string, ...string[]] {
    const sourceValue: unknown = value ?? fallback;
    if (!Array.isArray(sourceValue) || sourceValue.length === 0) {
        throw new TypeError(`${label} tokens must be a non-empty array`);
    }
    const source: readonly unknown[] = sourceValue;
    const copied = new Array<string>(source.length);
    for (let index = 0; index < source.length; index += 1) {
        const token = source[index];
        if (typeof token !== "string" || token.length === 0) {
            throw new TypeError(`${label} tokens must be non-empty strings`);
        }
        copied[index] = normalizeStringBoolToken(token, caseSensitive);
    }
    return Object.freeze(copied) as readonly [string, ...string[]];
}

/**
 * @brief Apply the selected stringbool comparison mode to one token.
 */
function normalizeStringBoolToken(value: string, caseSensitive: boolean): string {
    return caseSensitive ? value : value.toLowerCase();
}

/**
 * @brief Build a null-prototype token lookup.
 */
function makeTokenLookup(tokens: readonly string[]): Readonly<Record<string, true>> {
    const lookup: Record<string, true> = Object.create(null) as Record<string, true>;
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token !== undefined) {
            lookup[token] = true;
        }
    }
    return Object.freeze(lookup);
}

/**
 * @brief Check whether a string can be parsed by BigInt without exceptions.
 */
function isBigIntString(value: string): boolean {
    if (value.length === 0) {
        return false;
    }
    let index = 0;
    const first = value.charCodeAt(0);
    if (first === 43 || first === 45) {
        if (value.length === 1) {
            return false;
        }
        index = 1;
    }
    for (; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (code < 48 || code > 57) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Check whether a string is a decimal integer token.
 */
function isIntegerString(value: string): boolean {
    return isBigIntString(value);
}

/**
 * @brief Build a base64 or base64url byte codec.
 */
function bytesStringCodec(urlSafe: boolean): BaseCodec<string, Uint8Array> {
    return new BaseCodec<string, Uint8Array>(
        (value: unknown): CheckResult<Uint8Array> => {
            if (typeof value !== "string") {
                return fail("expected_string", urlSafe ? "base64url string" : "base64 string", value);
            }
            const decoded = decodeBase64Bytes(value, urlSafe);
            if (decoded === undefined) {
                return fail("expected_pattern", urlSafe ? "base64url string" : "base64 string", value);
            }
            return okResult(decoded);
        },
        (value: unknown): CheckResult<string> => {
            if (!isUint8Array(value)) {
                return fail("expected_array", "Uint8Array", value);
            }
            return okResult(encodeBase64Bytes(value, urlSafe));
        }
    );
}

/**
 * @brief Decode base64 text into bytes without host helpers.
 */
function decodeBase64Bytes(value: string, urlSafe: boolean): Uint8Array | undefined {
    const length = value.length;
    if (length === 0) {
        return new Uint8Array(0);
    }
    let paddingStart = length;
    while (paddingStart > 0 && value.charCodeAt(paddingStart - 1) === 61) {
        paddingStart -= 1;
    }
    const padding = length - paddingStart;
    if (padding > 2) {
        return undefined;
    }
    if (padding !== 0 && length % 4 !== 0) {
        return undefined;
    }
    for (let index = 0; index < paddingStart; index += 1) {
        if (base64Value(value.charCodeAt(index), urlSafe) < 0) {
            return undefined;
        }
    }
    for (let index = 0; index < padding; index += 1) {
        if (value.charCodeAt(paddingStart + index) !== 61) {
            return undefined;
        }
    }
    const remainder = padding === 0 ? length % 4 : 0;
    if (remainder === 1) {
        return undefined;
    }
    const paddedLength = padding === 0 && remainder !== 0
        ? length + 4 - remainder
        : length;
    const outputLength = (paddedLength / 4) * 3 -
        (padding === 0 ? (remainder === 0 ? 0 : 4 - remainder) : padding);
    const output = new Uint8Array(outputLength);
    let out = 0;
    for (let index = 0; index < paddedLength; index += 4) {
        const code0 = value.charCodeAt(index);
        const code1 = value.charCodeAt(index + 1);
        const code2 = index + 2 < length ? value.charCodeAt(index + 2) : 61;
        const code3 = index + 3 < length ? value.charCodeAt(index + 3) : 61;
        const v0 = base64Value(code0, urlSafe);
        const v1 = base64Value(code1, urlSafe);
        const v2 = code2 === 61 ? 0 : base64Value(code2, urlSafe);
        const v3 = code3 === 61 ? 0 : base64Value(code3, urlSafe);
        if (v0 < 0 || v1 < 0 || v2 < 0 || v3 < 0) {
            return undefined;
        }
        const bits = (v0 << 18) | (v1 << 12) | (v2 << 6) | v3;
        if (out < outputLength) {
            output[out] = (bits >>> 16) & 255;
            out += 1;
        }
        if (out < outputLength) {
            output[out] = (bits >>> 8) & 255;
            out += 1;
        }
        if (out < outputLength) {
            output[out] = bits & 255;
            out += 1;
        }
    }
    return output;
}

/**
 * @brief Encode bytes into base64 text.
 */
function encodeBase64Bytes(value: Uint8Array, urlSafe: boolean): string {
    const alphabet = urlSafe ? BASE64_URL_ALPHABET : BASE64_ALPHABET;
    let output = "";
    for (let index = 0; index < value.length; index += 3) {
        const a = value[index] ?? 0;
        const b = value[index + 1] ?? 0;
        const c = value[index + 2] ?? 0;
        const bits = (a << 16) | (b << 8) | c;
        output += alphabet[(bits >>> 18) & 63] ?? "";
        output += alphabet[(bits >>> 12) & 63] ?? "";
        output += index + 1 < value.length ? alphabet[(bits >>> 6) & 63] ?? "" : "=";
        output += index + 2 < value.length ? alphabet[bits & 63] ?? "" : "=";
    }
    return urlSafe ? output.replace(/=+$/u, "") : output;
}

/**
 * @brief Read the numeric value of one base64 code unit.
 */
function base64Value(code: number, urlSafe: boolean): number {
    if (code >= 65 && code <= 90) {
        return code - 65;
    }
    if (code >= 97 && code <= 122) {
        return code - 71;
    }
    if (code >= 48 && code <= 57) {
        return code + 4;
    }
    if (urlSafe) {
        if (code === 45) {
            return 62;
        }
        if (code === 95) {
            return 63;
        }
        return -1;
    }
    if (code === 43) {
        return 62;
    }
    if (code === 47) {
        return 63;
    }
    return -1;
}

/**
 * @brief Decode even-length hexadecimal text into bytes.
 */
function decodeHexBytes(value: string): Uint8Array | undefined {
    if (value.length % 2 !== 0) {
        return undefined;
    }
    const output = new Uint8Array(value.length / 2);
    for (let index = 0; index < value.length; index += 2) {
        const high = hexValue(value.charCodeAt(index));
        const low = hexValue(value.charCodeAt(index + 1));
        if (high < 0 || low < 0) {
            return undefined;
        }
        output[index / 2] = (high << 4) | low;
    }
    return output;
}

/**
 * @brief Encode bytes into lowercase hexadecimal text.
 */
function encodeHexBytes(value: Uint8Array): string {
    let output = "";
    for (let index = 0; index < value.length; index += 1) {
        const byte = value[index] ?? 0;
        output += (byte >>> 4).toString(16);
        output += (byte & 15).toString(16);
    }
    return output;
}

/**
 * @brief Read one hexadecimal digit.
 */
function hexValue(code: number): number {
    if (code >= 48 && code <= 57) {
        return code - 48;
    }
    if (code >= 65 && code <= 70) {
        return code - 55;
    }
    if (code >= 97 && code <= 102) {
        return code - 87;
    }
    return -1;
}

/**
 * @brief Build a URL codec with optional http protocol restriction.
 */
function urlCodec(httpOnly: boolean): BaseCodec<string, URL> {
    return new BaseCodec<string, URL>(
        (value: unknown): CheckResult<URL> => {
            if (typeof value !== "string") {
                return fail("expected_string", httpOnly ? "http URL string" : "URL string", value);
            }
            if (typeof URL.canParse !== "function" || !URL.canParse(value)) {
                return fail("expected_pattern", httpOnly ? "http URL string" : "URL string", value);
            }
            const parsed = new URL(value);
            if (httpOnly && parsed.protocol !== "http:" && parsed.protocol !== "https:") {
                return fail("expected_pattern", "http URL string", value);
            }
            return okResult(parsed);
        },
        (value: unknown): CheckResult<string> => {
            if (!(value instanceof URL)) {
                return fail("expected_instance", "URL", value);
            }
            if (httpOnly && value.protocol !== "http:" && value.protocol !== "https:") {
                return fail("expected_pattern", "http URL", value);
            }
            return okResult(value.href);
        }
    );
}

/**
 * @brief Test Uint8Array values without accepting DataView or generic arrays.
 */
function isUint8Array(value: unknown): value is Uint8Array {
    return value instanceof Uint8Array;
}

interface JsonParseStep {
    readonly value: JsonCodecValue;
    readonly index: number;
}

const JSON_MAX_DEPTH = 1000;

/**
 * @brief Parse one complete JSON text.
 */
function parseJsonText(source: string): JsonCodecValue | undefined {
    const start = skipJsonWhitespace(source, 0);
    const parsed = parseJsonValue(source, start, 0);
    if (parsed === undefined) {
        return undefined;
    }
    return skipJsonWhitespace(source, parsed.index) === source.length
        ? parsed.value
        : undefined;
}

/**
 * @brief Parse one JSON value at a specific offset.
 */
function parseJsonValue(
    source: string,
    start: number,
    depth: number
): JsonParseStep | undefined {
    if (depth > JSON_MAX_DEPTH || start >= source.length) {
        return undefined;
    }
    const code = source.charCodeAt(start);
    switch (code) {
        case 34:
            return parseJsonString(source, start);
        case 45:
        case 48:
        case 49:
        case 50:
        case 51:
        case 52:
        case 53:
        case 54:
        case 55:
        case 56:
        case 57:
            return parseJsonNumber(source, start);
        case 91:
            return parseJsonArray(source, start, depth);
        case 123:
            return parseJsonObject(source, start, depth);
        case 116:
            return source.startsWith("true", start)
                ? { value: true, index: start + 4 }
                : undefined;
        case 102:
            return source.startsWith("false", start)
                ? { value: false, index: start + 5 }
                : undefined;
        case 110:
            return source.startsWith("null", start)
                ? { value: null, index: start + 4 }
                : undefined;
        default:
            return undefined;
    }
}

/**
 * @brief Parse a JSON string token.
 */
function parseJsonString(source: string, start: number): JsonParseStep | undefined {
    if (source.charCodeAt(start) !== 34) {
        return undefined;
    }
    let output = "";
    let segmentStart = start + 1;
    for (let index = start + 1; index < source.length; index += 1) {
        const code = source.charCodeAt(index);
        if (code < 32) {
            return undefined;
        }
        if (code === 34) {
            return {
                value: output + source.slice(segmentStart, index),
                index: index + 1
            };
        }
        if (code !== 92) {
            continue;
        }
        output += source.slice(segmentStart, index);
        index += 1;
        if (index >= source.length) {
            return undefined;
        }
        const escaped = source.charCodeAt(index);
        switch (escaped) {
            case 34:
            case 47:
            case 92:
                output += String.fromCharCode(escaped);
                break;
            case 98:
                output += "\b";
                break;
            case 102:
                output += "\f";
                break;
            case 110:
                output += "\n";
                break;
            case 114:
                output += "\r";
                break;
            case 116:
                output += "\t";
                break;
            case 117: {
                const decoded = readJsonUnicodeEscape(source, index + 1);
                if (decoded === undefined) {
                    return undefined;
                }
                output += decoded.value;
                index = decoded.index - 1;
                break;
            }
            default:
                return undefined;
        }
        segmentStart = index + 1;
    }
    return undefined;
}

/**
 * @brief Decode a JSON unicode escape sequence.
 */
function readJsonUnicodeEscape(
    source: string,
    start: number
): { readonly value: string; readonly index: number } | undefined {
    const high = readHexQuad(source, start);
    if (high < 0) {
        return undefined;
    }
    let index = start + 4;
    if (high >= 0xd800 && high <= 0xdbff) {
        if (source.charCodeAt(index) !== 92 || source.charCodeAt(index + 1) !== 117) {
            return undefined;
        }
        const low = readHexQuad(source, index + 2);
        if (low < 0 || low < 0xdc00 || low > 0xdfff) {
            return undefined;
        }
        index += 6;
        return {
            value: String.fromCodePoint(0x10000 + ((high - 0xd800) << 10) + (low - 0xdc00)),
            index
        };
    }
    if (high >= 0xdc00 && high <= 0xdfff) {
        return undefined;
    }
    return {
        value: String.fromCharCode(high),
        index
    };
}

/**
 * @brief Read four hexadecimal digits as a 16-bit value.
 */
function readHexQuad(source: string, start: number): number {
    if (start + 4 > source.length) {
        return -1;
    }
    let value = 0;
    for (let index = 0; index < 4; index += 1) {
        const digit = hexValue(source.charCodeAt(start + index));
        if (digit < 0) {
            return -1;
        }
        value = (value << 4) | digit;
    }
    return value;
}

/**
 * @brief Parse a JSON number token.
 */
function parseJsonNumber(source: string, start: number): JsonParseStep | undefined {
    let index = start;
    if (source.charCodeAt(index) === 45) {
        index += 1;
    }
    if (source.charCodeAt(index) === 48) {
        index += 1;
        if (isJsonDigit(source.charCodeAt(index))) {
            return undefined;
        }
    } else if (isJsonDigitOneToNine(source.charCodeAt(index))) {
        index += 1;
        while (isJsonDigit(source.charCodeAt(index))) {
            index += 1;
        }
    } else {
        return undefined;
    }
    if (source.charCodeAt(index) === 46) {
        index += 1;
        if (!isJsonDigit(source.charCodeAt(index))) {
            return undefined;
        }
        while (isJsonDigit(source.charCodeAt(index))) {
            index += 1;
        }
    }
    const exponent = source.charCodeAt(index);
    if (exponent === 69 || exponent === 101) {
        index += 1;
        const sign = source.charCodeAt(index);
        if (sign === 43 || sign === 45) {
            index += 1;
        }
        if (!isJsonDigit(source.charCodeAt(index))) {
            return undefined;
        }
        while (isJsonDigit(source.charCodeAt(index))) {
            index += 1;
        }
    }
    const value = Number(source.slice(start, index));
    return Number.isFinite(value)
        ? { value, index }
        : undefined;
}

/**
 * @brief Parse a JSON array token.
 */
function parseJsonArray(
    source: string,
    start: number,
    depth: number
): JsonParseStep | undefined {
    const values: JsonCodecValue[] = [];
    let index = skipJsonWhitespace(source, start + 1);
    if (source.charCodeAt(index) === 93) {
        return { value: values, index: index + 1 };
    }
    while (index < source.length) {
        const item = parseJsonValue(source, index, depth + 1);
        if (item === undefined) {
            return undefined;
        }
        values.push(item.value);
        index = skipJsonWhitespace(source, item.index);
        const code = source.charCodeAt(index);
        if (code === 93) {
            return { value: values, index: index + 1 };
        }
        if (code !== 44) {
            return undefined;
        }
        index = skipJsonWhitespace(source, index + 1);
    }
    return undefined;
}

/**
 * @brief Parse a JSON object token.
 */
function parseJsonObject(
    source: string,
    start: number,
    depth: number
): JsonParseStep | undefined {
    const output: Record<string, JsonCodecValue> =
        Object.create(null) as Record<string, JsonCodecValue>;
    let index = skipJsonWhitespace(source, start + 1);
    if (source.charCodeAt(index) === 125) {
        return { value: output, index: index + 1 };
    }
    while (index < source.length) {
        const key = parseJsonString(source, index);
        if (key === undefined || typeof key.value !== "string") {
            return undefined;
        }
        index = skipJsonWhitespace(source, key.index);
        if (source.charCodeAt(index) !== 58) {
            return undefined;
        }
        const child = parseJsonValue(source, skipJsonWhitespace(source, index + 1), depth + 1);
        if (child === undefined) {
            return undefined;
        }
        defineOutputProperty(output, key.value, child.value, true);
        index = skipJsonWhitespace(source, child.index);
        const code = source.charCodeAt(index);
        if (code === 125) {
            return { value: output, index: index + 1 };
        }
        if (code !== 44) {
            return undefined;
        }
        index = skipJsonWhitespace(source, index + 1);
    }
    return undefined;
}

/**
 * @brief Skip JSON whitespace characters.
 */
function skipJsonWhitespace(source: string, start: number): number {
    let index = start;
    while (index < source.length) {
        const code = source.charCodeAt(index);
        if (code !== 32 && code !== 10 && code !== 13 && code !== 9) {
            return index;
        }
        index += 1;
    }
    return index;
}

/**
 * @brief Test a JSON digit.
 */
function isJsonDigit(code: number): boolean {
    return code >= 48 && code <= 57;
}

/**
 * @brief Test a non-zero JSON digit.
 */
function isJsonDigitOneToNine(code: number): boolean {
    return code >= 49 && code <= 57;
}

/**
 * @brief Stringify one JSON-compatible value without invoking user code.
 */
function stringifyJsonValue(value: unknown): string | undefined {
    return stringifyJsonValueInner(value, new WeakSet<object>(), 0);
}

/**
 * @brief Stringify one JSON-compatible value with cycle tracking.
 */
function stringifyJsonValueInner(
    value: unknown,
    seen: WeakSet<object>,
    depth: number
): string | undefined {
    if (depth > JSON_MAX_DEPTH) {
        return undefined;
    }
    switch (typeof value) {
        case "string":
            return quoteJsonString(value);
        case "number":
            return Number.isFinite(value) ? String(value) : undefined;
        case "boolean":
            return value ? "true" : "false";
        case "object":
            if (value === null) {
                return "null";
            }
            if (Array.isArray(value)) {
                return stringifyJsonArray(value, seen, depth);
            }
            return stringifyJsonObject(value, seen, depth);
        default:
            return undefined;
    }
}

/**
 * @brief Stringify one JSON array value.
 */
function stringifyJsonArray(
    value: readonly unknown[],
    seen: WeakSet<object>,
    depth: number
): string | undefined {
    if (seen.has(value)) {
        return undefined;
    }
    seen.add(value);
    const items = new Array<string>(value.length);
    for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, index);
        if (descriptor === undefined ||
            !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
            seen.delete(value);
            return undefined;
        }
        const item = stringifyJsonValueInner(descriptor.value, seen, depth + 1);
        if (item === undefined) {
            seen.delete(value);
            return undefined;
        }
        items[index] = item;
    }
    seen.delete(value);
    return `[${items.join(",")}]`;
}

/**
 * @brief Stringify one JSON object value.
 */
function stringifyJsonObject(
    value: object,
    seen: WeakSet<object>,
    depth: number
): string | undefined {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        return undefined;
    }
    if (seen.has(value)) {
        return undefined;
    }
    seen.add(value);
    const keys = Object.keys(value);
    const parts = new Array<string>(keys.length);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined) {
            seen.delete(value);
            return undefined;
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined ||
            !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
            seen.delete(value);
            return undefined;
        }
        const child = stringifyJsonValueInner(descriptor.value, seen, depth + 1);
        if (child === undefined) {
            seen.delete(value);
            return undefined;
        }
        parts[index] = `${quoteJsonString(key)}:${child}`;
    }
    seen.delete(value);
    return `{${parts.join(",")}}`;
}

/**
 * @brief Quote one JSON string.
 */
function quoteJsonString(value: string): string {
    let output = "\"";
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        switch (code) {
            case 34:
                output += "\\\"";
                break;
            case 92:
                output += "\\\\";
                break;
            case 8:
                output += "\\b";
                break;
            case 12:
                output += "\\f";
                break;
            case 10:
                output += "\\n";
                break;
            case 13:
                output += "\\r";
                break;
            case 9:
                output += "\\t";
                break;
            default:
                output += code < 32
                    ? `\\u${code.toString(16).padStart(4, "0")}`
                    : value[index] ?? "";
                break;
        }
    }
    return `${output}"`;
}

/**
 * @brief Resolve a decode source into an executable runner.
 * @param source Decoder or guard-like value supplied by the caller.
 * @param label Message prefix for TypeError diagnostics.
 * @returns Function that validates one runtime value.
 * @details Real decoders keep a private runner symbol. Guard-like values are
 * lowered to schema checks after hardened schema normalization.
 */
function readDecodeSourceRunner<TValue>(
    source: unknown,
    label: string
): DecodeRunner<TValue> {
    if (isConstructedDecoder(source)) {
        return readDecoderRunner<TValue>(source, label);
    }
    const schema = readGuardSchema(source, label);
    return (value: unknown): CheckResult<TValue> => checkSchema<TValue>(schema, value);
}

/**
 * @brief Read the private runner from a constructed decoder.
 * @param value Candidate decoder object.
 * @param label Message prefix for TypeError diagnostics.
 * @returns Stored decode runner.
 * @throws TypeError when the value was not registered by a decoder constructor.
 */
function readDecoderRunner<TValue>(
    value: unknown,
    label: string
): DecodeRunner<TValue> {
    if (!isConstructedDecoder(value)) {
        throw new TypeError(`${label} must be a TypeSea decoder`);
    }
    return value[DecoderRunSymbol] as DecodeRunner<TValue>;
}

/**
 * @brief Read the private encode runner from a constructed codec.
 * @param value Candidate codec object.
 * @param label Message prefix for TypeError diagnostics.
 * @returns Stored encode runner.
 * @throws TypeError when the receiver is not a TypeSea codec.
 */
function readCodecEncodeRunner<TValue>(
    value: unknown,
    label: string
): EncodeRunner<TValue> {
    if (!isConstructedCodec(value)) {
        throw new TypeError(`${label} must be a TypeSea codec`);
    }
    return value[CodecEncodeSymbol] as EncodeRunner<TValue>;
}

/**
 * @brief Normalize a guard-like value used as a decode source.
 * @param value Candidate guard-like source.
 * @param label Message prefix for TypeError diagnostics.
 * @returns Frozen schema used by the generated decode runner.
 * @throws TypeError when the schema slot is absent or malformed.
 * @details Descriptor reads keep inherited schema getters out of the decode
 * pipeline before the schema is frozen for repeated use.
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
 * @brief Build a frozen success Result for decoder transforms.
 * @param value Decoded value.
 * @returns Frozen ok result.
 */
function okResult<TValue>(value: TValue): CheckResult<TValue> {
    return Object.freeze({
        ok: true,
        value
    });
}

interface TransformContextSlot {
    readonly value: TransformContext;
    readonly issues: Issue[];
}

function createTransformContext(value: unknown): TransformContextSlot {
    const issues: Issue[] = [];
    const sink: TransformIssueSink = Object.freeze({
        get length(): number {
            return issues.length;
        },
        push: (...items: (TransformIssueInput | undefined)[]): number => {
            for (let index = 0; index < items.length; index += 1) {
                issues.push(readTransformIssueInput(items[index], value));
            }
            return issues.length;
        }
    });
    const context: TransformContext = Object.freeze({
        issues: sink,
        addIssue(issue?: TransformIssueInput): void {
            sink.push(issue);
        }
    });
    return {
        value: context,
        issues
    };
}

function readTransformIssues(
    issues: readonly Issue[],
    value: unknown
): readonly Issue[] {
    if (issues.length !== 0) {
        return freezeIssueArray(issues);
    }
    return freezeIssueArray([
        makeIssue([], "expected_refinement", "transform", actualType(value), undefined)
    ]);
}

function readTransformIssueInput(
    issue: TransformIssueInput | undefined,
    value: unknown
): Issue {
    if (issue === undefined) {
        return makeIssue([], "expected_refinement", "transform", actualType(value), undefined);
    }
    if (typeof issue === "string") {
        return makeIssue([], "expected_refinement", "transform", actualType(value), issue);
    }
    if (!isRecord(issue)) {
        throw new TypeError("transform issue must be a string or object");
    }
    const message = issue.message;
    if (message !== undefined && typeof message !== "string") {
        throw new TypeError("transform issue message must be a string");
    }
    return makeIssue(
        copyTransformIssuePath(issue.path),
        "expected_refinement",
        "transform",
        actualType(value),
        message
    );
}

function copyTransformIssuePath(value: unknown): readonly PathSegment[] {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value)) {
        throw new TypeError("transform issue path must be an array");
    }
    if (value.length === 0) {
        return [];
    }
    const path = value as readonly unknown[];
    const copied = new Array<PathSegment>(path.length);
    for (let index = 0; index < path.length; index += 1) {
        const segment = path[index];
        if (typeof segment === "string") {
            copied[index] = segment;
            continue;
        }
        if (typeof segment === "number" && Number.isInteger(segment) && segment >= 0) {
            copied[index] = segment;
            continue;
        }
        throw new TypeError("transform issue path segment must be a string or non-negative integer");
    }
    return copied;
}

/**
 * @brief Build a frozen single-issue failure Result.
 * @param code Issue code.
 * @param expected Expected value description.
 * @param value Runtime value that failed validation.
 * @returns Failure result with a root-level issue.
 */
function fail<TValue>(
    code: IssueCode,
    expected: string,
    value: unknown
): CheckResult<TValue> {
    return err(freezeIssueArray([
        makeIssue([], code, expected, actualType(value), undefined)
    ]));
}

/**
 * @brief Produce the compact runtime type label used in decoder issues.
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
    if (value instanceof Date) {
        return "date";
    }
    if (value instanceof Map) {
        return "map";
    }
    if (value instanceof Set) {
        return "set";
    }
    if (typeof value === "number" && Number.isNaN(value)) {
        return "nan";
    }
    return typeof value;
}

/**
 * @brief Define one immutable decoder instance slot.
 * @param target Decoder instance.
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
 * @brief Accept objects that can carry decoder or guard fields.
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
 * @brief Read one own data slot from a decode source.
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
 * @brief Reused finite-number schema for string-to-number coercion.
 */
const numberSchema = Object.freeze({
    tag: SchemaTag.Number,
    checks: Object.freeze([])
} satisfies Schema);

const dateSchema = Object.freeze({
    tag: SchemaTag.Date,
    checks: Object.freeze([])
} satisfies Schema);

const bigIntSchema = Object.freeze({
    tag: SchemaTag.BigInt,
    checks: Object.freeze([])
} satisfies Schema);
