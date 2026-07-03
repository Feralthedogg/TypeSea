import { checkSchema } from "../evaluate/index.js";
import type { Guard, Presence, RuntimeValue } from "../guard/index.js";
import type { CheckResult, IssueCode } from "../issue/index.js";
import { freezeIssueArray, makeIssue } from "../issue/index.js";
import { SchemaTag } from "../kind/index.js";
import { err } from "../result/index.js";
import { freezeSchema, isSchemaValue, type Schema } from "../schema/index.js";

/**
 * @brief decode runner.
 */
type DecodeRunner<TValue> = (value: unknown) => CheckResult<TValue>;

/**
 * @brief decoder run symbol.
 */
const DecoderRunSymbol = Symbol("TypeSea.decoder.run");

/**
 * @brief constructed decoders.
 */
const constructedDecoders = new WeakSet<object>();

/**
 * @brief decode source.
 */
export type DecodeSource =
  | Guard<unknown, Presence>
  | Decoder<unknown>;

/**
 * @brief infer decoder.
 */
export type InferDecoder<TSource> =
  TSource extends Decoder<infer TValue>
    ? TValue
    : TSource extends Guard<infer TValue, infer TPresence>
      ? RuntimeValue<TValue, TPresence>
      : never;

/**
 * @brief decoder.
 */
export interface Decoder<TValue> {

  /**
   * @brief decode.
         */
  decode(value: unknown): CheckResult<TValue>;

  /**
   * @brief transform.
         */
  transform<TNext>(mapper: (value: TValue) => TNext): BaseDecoder<TNext>;

  /**
   * @brief pipe.
         */
  pipe<TNext extends DecodeSource>(next: TNext): BaseDecoder<InferDecoder<TNext>>;
}

/**
 * @brief constructed decoder.
 */
interface ConstructedDecoder<TValue> extends Decoder<TValue> {
  readonly [DecoderRunSymbol]: DecodeRunner<TValue>;
}

/**
 * @brief base decoder.
 * @details Owns its state directly; methods expose receiver checks and explicit result flow.
 * @invariant Construction leaves the instance in a fully usable state before it escapes.
 */
export class BaseDecoder<TValue> implements Decoder<TValue> {
  private declare readonly [DecoderRunSymbol]: DecodeRunner<TValue>;

  /**
   * @brief constructor.
       * @post The receiver is initialized according to the class invariant before it can be observed.
   */
  public constructor(run: DecodeRunner<TValue>) {
    if (typeof run !== "function") {
      throw new TypeError("decoder run must be a function");
    }
    defineReadonlyProperty(this, DecoderRunSymbol, run, false);
    constructedDecoders.add(this);
    Object.freeze(this);
  }

  /**
   * @brief decode.
           */
  public decode(this: unknown, value: unknown): CheckResult<TValue> {
    return readDecoderRunner<TValue>(this, "decoder receiver")(value);
  }

  /**
   * @brief transform.
         */
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

  /**
   * @brief pipe.
         */
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
 * @brief decoder.
 */
export function decoder<TValue, TPresence extends Presence>(
  source: Guard<TValue, TPresence>
): BaseDecoder<RuntimeValue<TValue, TPresence>>;

/**
 * @brief decoder.
 */
export function decoder<TValue>(source: Decoder<TValue>): BaseDecoder<TValue>;

/**
 * @brief decoder.
 */
export function decoder(source: DecodeSource): BaseDecoder<unknown> {
  return makeDecoder(source);
}

/**
 * @brief make decoder.
 */
function makeDecoder(source: DecodeSource): BaseDecoder<unknown> {
  const run = readDecodeSourceRunner<unknown>(source, "decoder source");
  return new BaseDecoder<unknown>(run);
}

/**
 * @brief transform.
 */
export function transform<TValue, TPresence extends Presence, TNext>(
  source: Guard<TValue, TPresence>,
  mapper: (value: RuntimeValue<TValue, TPresence>) => TNext
): BaseDecoder<TNext>;

/**
 * @brief transform.
 */
export function transform<TValue, TNext>(
  source: Decoder<TValue>,
  mapper: (value: TValue) => TNext
): BaseDecoder<TNext>;

/**
 * @brief transform.
 */
export function transform(
  source: DecodeSource,
  mapper: (value: unknown) => unknown
): BaseDecoder<unknown> {
  return makeDecoder(source).transform(mapper);
}

/**
 * @brief pipe.
 */
export function pipe<TNext extends DecodeSource>(
  source: DecodeSource,
  next: TNext
): BaseDecoder<InferDecoder<TNext>> {
  return makeDecoder(source).pipe(next);
}

/**
 * @brief coerce.
 */
export const coerce = Object.freeze({
  string: coerceString,
  number: coerceNumber,
  boolean: coerceBoolean
} as const);

/**
 * @brief coerce string.
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
 * @brief coerce number.
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
 * @brief coerce boolean.
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
 * @brief is decoder value.
 */
export function isDecoderValue(value: unknown): value is Decoder<unknown> {
  return isConstructedDecoder(value);
}

/**
 * @brief is constructed decoder.
 */
function isConstructedDecoder(value: unknown): value is ConstructedDecoder<unknown> {
  return isRecord(value) && constructedDecoders.has(value);
}

/**
 * @brief read decode source runner.
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
 * @brief read decoder runner.
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
 * @brief read guard schema.
 */
function readGuardSchema(value: unknown, label: string): Schema {
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be a TypeSea guard or decoder`);
  }
  const schema = value["schema"];
  if (!isSchemaValue(schema)) {
    throw new TypeError(`${label} must contain a valid TypeSea schema`);
  }
  return freezeSchema(schema);
}

/**
 * @brief ok result.
 */
function okResult<TValue>(value: TValue): CheckResult<TValue> {
  return Object.freeze({
    ok: true,
    value
  });
}

/**
 * @brief fail.
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
 * @brief actual type.
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
 * @brief define readonly property.
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
 * @brief is record.
 */
function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief number schema.
 */
const numberSchema = Object.freeze({
  tag: SchemaTag.Number,
  checks: Object.freeze([])
} satisfies Schema);
