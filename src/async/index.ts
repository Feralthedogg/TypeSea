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

/**
 * @brief async decode runner.
 */
type AsyncDecodeRunner<TValue> = (value: unknown) => Promise<CheckResult<TValue>>;

/**
 * @brief async predicate.
 */
type AsyncPredicate<TValue> = (value: TValue) => boolean | Promise<boolean>;

/**
 * @brief async mapper.
 */
type AsyncMapper<TValue, TNext> = (value: TValue) => TNext | Promise<TNext>;

/**
 * @brief async decoder run symbol.
 */
const AsyncDecoderRunSymbol = Symbol("TypeSea.asyncDecoder.run");

/**
 * @brief constructed async decoders.
 */
const constructedAsyncDecoders = new WeakSet<object>();

/**
 * @brief async decode source.
 */
export type AsyncDecodeSource =
  | DecodeSource
  | AsyncDecoder<unknown>;

/**
 * @brief infer async decoder.
 */
export type InferAsyncDecoder<TSource> =
  TSource extends AsyncDecoder<infer TValue>
    ? TValue
    : InferDecoder<TSource>;

/**
 * @brief async decoder.
 */
export interface AsyncDecoder<TValue> {

  /**
   * @brief decode async.
         */
  decodeAsync(value: unknown): Promise<CheckResult<TValue>>;

  /**
   * @brief refine async.
           */
  refineAsync(
    predicate: AsyncPredicate<TValue>,
    name: string
  ): BaseAsyncDecoder<TValue>;

  /**
   * @brief transform async.
         */
  transformAsync<TNext>(
    mapper: AsyncMapper<TValue, TNext>
  ): BaseAsyncDecoder<TNext>;

  /**
   * @brief pipe async.
         */
  pipeAsync<TNext extends AsyncDecodeSource>(
    next: TNext
  ): BaseAsyncDecoder<InferAsyncDecoder<TNext>>;
}

/**
 * @brief constructed async decoder.
 */
interface ConstructedAsyncDecoder<TValue> extends AsyncDecoder<TValue> {
  readonly [AsyncDecoderRunSymbol]: AsyncDecodeRunner<TValue>;
}

/**
 * @brief base async decoder.
 * @details Owns its state directly; methods expose receiver checks and explicit result flow.
 * @invariant Construction leaves the instance in a fully usable state before it escapes.
 */
export class BaseAsyncDecoder<TValue> implements AsyncDecoder<TValue> {
  private declare readonly [AsyncDecoderRunSymbol]: AsyncDecodeRunner<TValue>;

  /**
   * @brief constructor.
       * @post The receiver is initialized according to the class invariant before it can be observed.
   */
  public constructor(run: AsyncDecodeRunner<TValue>) {
    if (typeof run !== "function") {
      throw new TypeError("async decoder run must be a function");
    }
    defineReadonlyProperty(this, AsyncDecoderRunSymbol, run, false);
    constructedAsyncDecoders.add(this);
    Object.freeze(this);
  }

  /**
   * @brief decode async.
           */
  public decodeAsync(this: unknown, value: unknown): Promise<CheckResult<TValue>> {
    return readAsyncDecoderRunner<TValue>(this, "async decoder receiver")(value);
  }

  /**
   * @brief refine async.
           */
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

  /**
   * @brief transform async.
         */
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

  /**
   * @brief pipe async.
         */
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
 * @brief async decoder.
 */
export function asyncDecoder<TValue, TPresence extends Presence>(
  source: Guard<TValue, TPresence>
): BaseAsyncDecoder<RuntimeValue<TValue, TPresence>>;

/**
 * @brief async decoder.
 */
export function asyncDecoder<TValue>(
  source: Decoder<TValue> | AsyncDecoder<TValue>
): BaseAsyncDecoder<TValue>;

/**
 * @brief async decoder.
 */
export function asyncDecoder(source: AsyncDecodeSource): BaseAsyncDecoder<unknown> {
  return makeAsyncDecoder(source);
}

/**
 * @brief async refine.
 */
export function asyncRefine<TValue, TPresence extends Presence>(
  source: Guard<TValue, TPresence>,
  predicate: AsyncPredicate<RuntimeValue<TValue, TPresence>>,
  name: string
): BaseAsyncDecoder<RuntimeValue<TValue, TPresence>>;

/**
 * @brief async refine.
 */
export function asyncRefine<TValue>(
  source: Decoder<TValue> | AsyncDecoder<TValue>,
  predicate: AsyncPredicate<TValue>,
  name: string
): BaseAsyncDecoder<TValue>;

/**
 * @brief async refine.
 */
export function asyncRefine(
  source: AsyncDecodeSource,
  predicate: AsyncPredicate<unknown>,
  name: string
): BaseAsyncDecoder<unknown> {
  return makeAsyncDecoder(source).refineAsync(predicate, name);
}

/**
 * @brief async transform.
 */
export function asyncTransform<TValue, TPresence extends Presence, TNext>(
  source: Guard<TValue, TPresence>,
  mapper: AsyncMapper<RuntimeValue<TValue, TPresence>, TNext>
): BaseAsyncDecoder<TNext>;

/**
 * @brief async transform.
 */
export function asyncTransform<TValue, TNext>(
  source: Decoder<TValue> | AsyncDecoder<TValue>,
  mapper: AsyncMapper<TValue, TNext>
): BaseAsyncDecoder<TNext>;

/**
 * @brief async transform.
 */
export function asyncTransform(
  source: AsyncDecodeSource,
  mapper: AsyncMapper<unknown, unknown>
): BaseAsyncDecoder<unknown> {
  return makeAsyncDecoder(source).transformAsync(mapper);
}

/**
 * @brief async pipe.
 */
export function asyncPipe<TNext extends AsyncDecodeSource>(
  source: AsyncDecodeSource,
  next: TNext
): BaseAsyncDecoder<InferAsyncDecoder<TNext>> {
  return makeAsyncDecoder(source).pipeAsync(next);
}

/**
 * @brief is async decoder value.
 */
export function isAsyncDecoderValue(
  value: unknown
): value is AsyncDecoder<unknown> {
  return isConstructedAsyncDecoder(value);
}

/**
 * @brief make async decoder.
 */
function makeAsyncDecoder(source: AsyncDecodeSource): BaseAsyncDecoder<unknown> {
  const run = readAsyncDecodeSourceRunner<unknown>(source, "async decoder source");
  return new BaseAsyncDecoder<unknown>(run);
}

/**
 * @brief read async decode source runner.
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
 * @brief read async decoder runner.
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
 * @brief is constructed async decoder.
 */
function isConstructedAsyncDecoder(
  value: unknown
): value is ConstructedAsyncDecoder<unknown> {
  return isRecord(value) && constructedAsyncDecoders.has(value);
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
 * @brief fail refinement.
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
 * @brief actual type.
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
 * @brief is strict true.
 */
function isStrictTrue(value: unknown): boolean {
  return value === true;
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
