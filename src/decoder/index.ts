import { checkSchema } from "../evaluate/index.js";
import type { Guard, Presence, RuntimeValue } from "../guard/index.js";
import type { CheckResult, IssueCode } from "../issue/index.js";
import { freezeIssueArray, makeIssue } from "../issue/index.js";
import { SchemaTag } from "../kind/index.js";
import { err } from "../result/index.js";
import { freezeSchema, isSchemaValue, type Schema } from "../schema/index.js";

type DecodeRunner<TValue> = (value: unknown) => CheckResult<TValue>;

/**
 * @brief Private runner slot for decoder instances.
 * @details A symbol slot keeps the public object small while avoiding accidental
 * collision with user-visible properties.
 */
const DecoderRunSymbol = Symbol("TypeSea.decoder.run");

/**
 * @brief Real decoder instances tracked without extending object lifetime.
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
 */
const constructedDecoders = new WeakSet<object>();

export type DecodeSource =
    | Guard<unknown, Presence>
    | Decoder<unknown>;

export type InferDecoder<TSource> =
    TSource extends Decoder<infer TValue>
        ? TValue
        : TSource extends Guard<infer TValue, infer TPresence>
            ? RuntimeValue<TValue, TPresence>
            : never;

/**
 * @brief Synchronous decode pipeline.
 * @details Decoders are explicit Result producers; they do not throw for data
 * validation failure.
 */
export interface Decoder<TValue> {
    decode(value: unknown): CheckResult<TValue>;

    transform<TNext>(mapper: (value: TValue) => TNext): BaseDecoder<TNext>;

    pipe<TNext extends DecodeSource>(next: TNext): BaseDecoder<InferDecoder<TNext>>;
}

interface ConstructedDecoder<TValue> extends Decoder<TValue> {
    readonly [DecoderRunSymbol]: DecodeRunner<TValue>;
}

/**
 * @brief Frozen decoder wrapper around one runner function.
 * @details Methods re-read the symbol runner from the receiver so detached
 * method calls fail with TypeSea errors instead of touching undefined state.
 */
export class BaseDecoder<TValue> implements Decoder<TValue> {
    private declare readonly [DecoderRunSymbol]: DecodeRunner<TValue>;

    public constructor(run: DecodeRunner<TValue>) {
        if (typeof run !== "function") {
            throw new TypeError("decoder run must be a function");
        }
        defineReadonlyProperty(this, DecoderRunSymbol, run, false);
        constructedDecoders.add(this);
        Object.freeze(this);
    }

    public decode(this: unknown, value: unknown): CheckResult<TValue> {
        return readDecoderRunner<TValue>(this, "decoder receiver")(value);
    }

    public transform<TNext>(mapper: (value: TValue) => TNext): BaseDecoder<TNext> {
        if (typeof mapper !== "function") {
            throw new TypeError("decoder transform mapper must be a function");
        }
        const run = readDecoderRunner<TValue>(this, "decoder transform receiver");
        return new BaseDecoder<TNext>((value: unknown): CheckResult<TNext> => {
            const decoded = run(value);
            if (!decoded.ok) {
                return decoded;
            }
            return okResult(mapper(decoded.value));
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
}

/**
 * @brief Wrap a guard or decoder as a synchronous decoder pipeline.
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
 */
export function decoder<TValue, TPresence extends Presence>(
    source: Guard<TValue, TPresence>
): BaseDecoder<RuntimeValue<TValue, TPresence>>;

/**
 * @brief Execute decoder.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
export function decoder<TValue>(source: Decoder<TValue>): BaseDecoder<TValue>;

/**
 * @brief Execute decoder.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
export function decoder(source: DecodeSource): BaseDecoder<unknown> {
    return makeDecoder(source);
}

/**
 * @brief Build decoder.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
function makeDecoder(source: DecodeSource): BaseDecoder<unknown> {
    const run = readDecodeSourceRunner<unknown>(source, "decoder source");
    return new BaseDecoder<unknown>(run);
}

/**
 * @brief Build a decoder and append a synchronous mapper.
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
 */
export function transform<TValue, TPresence extends Presence, TNext>(
    source: Guard<TValue, TPresence>,
    mapper: (value: RuntimeValue<TValue, TPresence>) => TNext
): BaseDecoder<TNext>;

/**
 * @brief Execute transform.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
export function transform<TValue, TNext>(
    source: Decoder<TValue>,
    mapper: (value: TValue) => TNext
): BaseDecoder<TNext>;

/**
 * @brief Execute transform.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
export function transform(
    source: DecodeSource,
    mapper: (value: unknown) => unknown
): BaseDecoder<unknown> {
    return makeDecoder(source).transform(mapper);
}

/**
 * @brief Execute pipe.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
export function pipe<TNext extends DecodeSource>(
    source: DecodeSource,
    next: TNext
): BaseDecoder<InferDecoder<TNext>> {
    return makeDecoder(source).pipe(next);
}

/**
 * @brief Primitive coercion decoders with explicit failure issues.
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
 */
export const coerce = Object.freeze({
    string: coerceString,
    number: coerceNumber,
    boolean: coerceBoolean
} as const);

/**
 * @brief Execute coerce string.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
export function coerceString(): BaseDecoder<string> {
    return new BaseDecoder<string>((value: unknown): CheckResult<string> => {
        switch (typeof value) {
            case "string":
                return okResult(value);
            case "number":
                if (Number.isFinite(value)) {
                    return okResult(String(value));
                }
                return fail("expected_string", "string-coercible primitive", value);
            case "bigint":
            case "boolean":
            case "symbol":
                return okResult(String(value));
            default:
                return fail("expected_string", "string-coercible primitive", value);
        }
    });
}

/**
 * @brief Execute coerce number.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
export function coerceNumber(): BaseDecoder<number> {
    return new BaseDecoder<number>((value: unknown): CheckResult<number> => {
        if (typeof value === "number") {
            return checkSchema<number>(numberSchema, value);
        }
        if (typeof value !== "string") {
            return fail("expected_number", "number or numeric string", value);
        }
        const trimmed = value.trim();
        if (trimmed.length === 0) {
            return fail("expected_number", "number or numeric string", value);
        }
        return checkSchema<number>(numberSchema, Number(trimmed));
    });
}

/**
 * @brief Execute coerce boolean.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
export function coerceBoolean(): BaseDecoder<boolean> {
    return new BaseDecoder<boolean>((value: unknown): CheckResult<boolean> => {
        if (typeof value === "boolean") {
            return okResult(value);
        }
        if (typeof value !== "string") {
            return fail("expected_boolean", "boolean or boolean string", value);
        }
        const lowered = value.trim().toLowerCase();
        if (lowered === "true") {
            return okResult(true);
        }
        if (lowered === "false") {
            return okResult(false);
        }
        return fail("expected_boolean", "boolean or boolean string", value);
    });
}

/**
 * @brief Check decoder value.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
export function isDecoderValue(value: unknown): value is Decoder<unknown> {
    return isConstructedDecoder(value);
}

/**
 * @brief Test decoder identity through the private registry.
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
 * @param value Candidate decoder.
 * @returns True when TypeSea constructed the decoder instance.
 */
function isConstructedDecoder(value: unknown): value is ConstructedDecoder<unknown> {
    return isRecord(value) && constructedDecoders.has(value);
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
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
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
 * @brief Normalize a guard-like value used as a decode source.
 * @param value Candidate guard-like source.
 * @param label Message prefix for TypeError diagnostics.
 * @returns Frozen schema used by the generated decode runner.
 * @throws TypeError when the schema slot is absent or malformed.
 * @details Descriptor reads keep inherited schema getters out of the decode
 * pipeline before the schema is frozen for repeated use.
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
 * @brief Build a frozen success Result for decoder transforms.
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
 * @param value Decoded value.
 * @returns Frozen ok result.
 */
function okResult<TValue>(value: TValue): CheckResult<TValue> {
    return Object.freeze({
        ok: true,
        value
    });
}

/**
 * @brief Build a frozen single-issue failure Result.
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
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
    if (typeof value === "number" && Number.isNaN(value)) {
        return "nan";
    }
    return typeof value;
}

/**
 * @brief Define one immutable decoder instance slot.
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
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
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
 * @param value Candidate object.
 * @returns True for non-array objects.
 */
function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Read one own data slot from a decode source.
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

/**
 * @brief Reused finite-number schema for string-to-number coercion.
 * @details Decoder helpers keep validation failures explicit in Result values while
 * preserving the original input value.
 */
const numberSchema = Object.freeze({
    tag: SchemaTag.Number,
    checks: Object.freeze([])
} satisfies Schema);
