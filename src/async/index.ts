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
 * @brief async decode runner type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
type AsyncDecodeRunner<TValue> = (value: unknown) => Promise<CheckResult<TValue>>;

/**
 * @brief async predicate type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
type AsyncPredicate<TValue> = (value: TValue) => boolean | Promise<boolean>;

/**
 * @brief async mapper type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
type AsyncMapper<TValue, TNext> = (value: TValue) => TNext | Promise<TNext>;

/**
 * @brief async decoder run symbol constant contract.
 * @details Module-scope storage with stable identity, created once and reused by callers.
 * @invariant Initialization happens during module load and later code treats the binding as fixed.
 */
const AsyncDecoderRunSymbol = Symbol("TypeSea.asyncDecoder.run");

/**
 * @brief constructed async decoders constant contract.
 * @details Module-scope storage with stable identity, created once and reused by callers.
 * @invariant Initialization happens during module load and later code treats the binding as fixed.
 */
const constructedAsyncDecoders = new WeakSet<object>();

/**
 * @brief async decode source type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type AsyncDecodeSource =
  | DecodeSource
  | AsyncDecoder<unknown>;

/**
 * @brief infer async decoder type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type InferAsyncDecoder<TSource> =
  TSource extends AsyncDecoder<infer TValue>
    ? TValue
    : InferDecoder<TSource>;

/**
 * @brief async decoder interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface AsyncDecoder<TValue> {

  /**
   * @brief decode async routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for decode async; ownership of newly created aggregates is transferred to the caller.
   */
  decodeAsync(value: unknown): Promise<CheckResult<TValue>>;

  /**
   * @brief refine async routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param predicate Borrowed input slot named predicate; validation or normalization happens before stored state changes.
   * @param name Borrowed input slot named name; validation or normalization happens before stored state changes.
   * @returns Result for refine async; ownership of newly created aggregates is transferred to the caller.
   */
  refineAsync(
    predicate: AsyncPredicate<TValue>,
    name: string
  ): BaseAsyncDecoder<TValue>;

  /**
   * @brief transform async routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param mapper Borrowed input slot named mapper; validation or normalization happens before stored state changes.
   * @returns Result for transform async; ownership of newly created aggregates is transferred to the caller.
   */
  transformAsync<TNext>(
    mapper: AsyncMapper<TValue, TNext>
  ): BaseAsyncDecoder<TNext>;

  /**
   * @brief pipe async routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param next Borrowed input slot named next; validation or normalization happens before stored state changes.
   * @returns Result for pipe async; ownership of newly created aggregates is transferred to the caller.
   */
  pipeAsync<TNext extends AsyncDecodeSource>(
    next: TNext
  ): BaseAsyncDecoder<InferAsyncDecoder<TNext>>;
}

/**
 * @brief constructed async decoder interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
interface ConstructedAsyncDecoder<TValue> extends AsyncDecoder<TValue> {

  /**
   * @brief async decoder run symbol field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly [AsyncDecoderRunSymbol]: AsyncDecodeRunner<TValue>;
}

/**
 * @brief base async decoder class contract.
 * @details Owns its state directly; methods expose receiver checks and explicit result flow.
 * @invariant Construction leaves the instance in a fully usable state before it escapes.
 */
export class BaseAsyncDecoder<TValue> implements AsyncDecoder<TValue> {

  /**
   * @brief async decoder run symbol field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  private declare readonly [AsyncDecoderRunSymbol]: AsyncDecodeRunner<TValue>;

  /**
   * @brief constructor constructor contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param run Borrowed input slot named run; validation or normalization happens before stored state changes.
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
   * @brief decode async routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param this Borrowed input slot named this; validation or normalization happens before stored state changes.
   * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
   * @returns Result for decode async; ownership of newly created aggregates is transferred to the caller.
   */
  public decodeAsync(this: unknown, value: unknown): Promise<CheckResult<TValue>> {
    return readAsyncDecoderRunner<TValue>(this, "async decoder receiver")(value);
  }

  /**
   * @brief refine async routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param predicate Borrowed input slot named predicate; validation or normalization happens before stored state changes.
   * @param name Borrowed input slot named name; validation or normalization happens before stored state changes.
   * @returns Result for refine async; ownership of newly created aggregates is transferred to the caller.
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
   * @brief transform async routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param mapper Borrowed input slot named mapper; validation or normalization happens before stored state changes.
   * @returns Result for transform async; ownership of newly created aggregates is transferred to the caller.
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
   * @brief pipe async routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param next Borrowed input slot named next; validation or normalization happens before stored state changes.
   * @returns Result for pipe async; ownership of newly created aggregates is transferred to the caller.
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
 * @brief async decoder function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param source Borrowed input slot named source; validation or normalization happens before stored state changes.
 * @returns Result for async decoder; ownership of newly created aggregates is transferred to the caller.
 */
export function asyncDecoder<TValue, TPresence extends Presence>(
  source: Guard<TValue, TPresence>
): BaseAsyncDecoder<RuntimeValue<TValue, TPresence>>;

/**
 * @brief async decoder function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param source Borrowed input slot named source; validation or normalization happens before stored state changes.
 * @returns Result for async decoder; ownership of newly created aggregates is transferred to the caller.
 */
export function asyncDecoder<TValue>(
  source: Decoder<TValue> | AsyncDecoder<TValue>
): BaseAsyncDecoder<TValue>;

/**
 * @brief async decoder function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param source Borrowed input slot named source; validation or normalization happens before stored state changes.
 * @returns Result for async decoder; ownership of newly created aggregates is transferred to the caller.
 */
export function asyncDecoder(source: AsyncDecodeSource): BaseAsyncDecoder<unknown> {
  return makeAsyncDecoder(source);
}

/**
 * @brief async refine function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param source Borrowed input slot named source; validation or normalization happens before stored state changes.
 * @param predicate Borrowed input slot named predicate; validation or normalization happens before stored state changes.
 * @param name Borrowed input slot named name; validation or normalization happens before stored state changes.
 * @returns Result for async refine; ownership of newly created aggregates is transferred to the caller.
 */
export function asyncRefine<TValue, TPresence extends Presence>(
  source: Guard<TValue, TPresence>,
  predicate: AsyncPredicate<RuntimeValue<TValue, TPresence>>,
  name: string
): BaseAsyncDecoder<RuntimeValue<TValue, TPresence>>;

/**
 * @brief async refine function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param source Borrowed input slot named source; validation or normalization happens before stored state changes.
 * @param predicate Borrowed input slot named predicate; validation or normalization happens before stored state changes.
 * @param name Borrowed input slot named name; validation or normalization happens before stored state changes.
 * @returns Result for async refine; ownership of newly created aggregates is transferred to the caller.
 */
export function asyncRefine<TValue>(
  source: Decoder<TValue> | AsyncDecoder<TValue>,
  predicate: AsyncPredicate<TValue>,
  name: string
): BaseAsyncDecoder<TValue>;

/**
 * @brief async refine function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param source Borrowed input slot named source; validation or normalization happens before stored state changes.
 * @param predicate Borrowed input slot named predicate; validation or normalization happens before stored state changes.
 * @param name Borrowed input slot named name; validation or normalization happens before stored state changes.
 * @returns Result for async refine; ownership of newly created aggregates is transferred to the caller.
 */
export function asyncRefine(
  source: AsyncDecodeSource,
  predicate: AsyncPredicate<unknown>,
  name: string
): BaseAsyncDecoder<unknown> {
  return makeAsyncDecoder(source).refineAsync(predicate, name);
}

/**
 * @brief async transform function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param source Borrowed input slot named source; validation or normalization happens before stored state changes.
 * @param mapper Borrowed input slot named mapper; validation or normalization happens before stored state changes.
 * @returns Result for async transform; ownership of newly created aggregates is transferred to the caller.
 */
export function asyncTransform<TValue, TPresence extends Presence, TNext>(
  source: Guard<TValue, TPresence>,
  mapper: AsyncMapper<RuntimeValue<TValue, TPresence>, TNext>
): BaseAsyncDecoder<TNext>;

/**
 * @brief async transform function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param source Borrowed input slot named source; validation or normalization happens before stored state changes.
 * @param mapper Borrowed input slot named mapper; validation or normalization happens before stored state changes.
 * @returns Result for async transform; ownership of newly created aggregates is transferred to the caller.
 */
export function asyncTransform<TValue, TNext>(
  source: Decoder<TValue> | AsyncDecoder<TValue>,
  mapper: AsyncMapper<TValue, TNext>
): BaseAsyncDecoder<TNext>;

/**
 * @brief async transform function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param source Borrowed input slot named source; validation or normalization happens before stored state changes.
 * @param mapper Borrowed input slot named mapper; validation or normalization happens before stored state changes.
 * @returns Result for async transform; ownership of newly created aggregates is transferred to the caller.
 */
export function asyncTransform(
  source: AsyncDecodeSource,
  mapper: AsyncMapper<unknown, unknown>
): BaseAsyncDecoder<unknown> {
  return makeAsyncDecoder(source).transformAsync(mapper);
}

/**
 * @brief async pipe function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param source Borrowed input slot named source; validation or normalization happens before stored state changes.
 * @param next Borrowed input slot named next; validation or normalization happens before stored state changes.
 * @returns Result for async pipe; ownership of newly created aggregates is transferred to the caller.
 */
export function asyncPipe<TNext extends AsyncDecodeSource>(
  source: AsyncDecodeSource,
  next: TNext
): BaseAsyncDecoder<InferAsyncDecoder<TNext>> {
  return makeAsyncDecoder(source).pipeAsync(next);
}

/**
 * @brief is async decoder value function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is async decoder value; ownership of newly created aggregates is transferred to the caller.
 */
export function isAsyncDecoderValue(
  value: unknown
): value is AsyncDecoder<unknown> {
  return isConstructedAsyncDecoder(value);
}

/**
 * @brief make async decoder function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param source Borrowed input slot named source; validation or normalization happens before stored state changes.
 * @returns Result for make async decoder; ownership of newly created aggregates is transferred to the caller.
 */
function makeAsyncDecoder(source: AsyncDecodeSource): BaseAsyncDecoder<unknown> {
  const run = readAsyncDecodeSourceRunner<unknown>(source, "async decoder source");
  return new BaseAsyncDecoder<unknown>(run);
}

/**
 * @brief read async decode source runner function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param source Borrowed input slot named source; validation or normalization happens before stored state changes.
 * @param label Borrowed input slot named label; validation or normalization happens before stored state changes.
 * @returns Result for read async decode source runner; ownership of newly created aggregates is transferred to the caller.
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
 * @brief read async decoder runner function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param label Borrowed input slot named label; validation or normalization happens before stored state changes.
 * @returns Result for read async decoder runner; ownership of newly created aggregates is transferred to the caller.
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
 * @brief is constructed async decoder function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is constructed async decoder; ownership of newly created aggregates is transferred to the caller.
 */
function isConstructedAsyncDecoder(
  value: unknown
): value is ConstructedAsyncDecoder<unknown> {
  return isRecord(value) && constructedAsyncDecoders.has(value);
}

/**
 * @brief read guard schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param label Borrowed input slot named label; validation or normalization happens before stored state changes.
 * @returns Result for read guard schema; ownership of newly created aggregates is transferred to the caller.
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
 * @brief fail refinement function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param name Borrowed input slot named name; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for fail refinement; ownership of newly created aggregates is transferred to the caller.
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
 * @brief actual type function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for actual type; ownership of newly created aggregates is transferred to the caller.
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
 * @brief is strict true function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is strict true; ownership of newly created aggregates is transferred to the caller.
 */
function isStrictTrue(value: unknown): boolean {
  return value === true;
}

/**
 * @brief define readonly property function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param target Borrowed input slot named target; validation or normalization happens before stored state changes.
 * @param key Borrowed input slot named key; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param enumerable Borrowed input slot named enumerable; validation or normalization happens before stored state changes.
 * @post No result value is produced; effects are limited to the documented receiver or output buffer.
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
 * @brief is record function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is record; ownership of newly created aggregates is transferred to the caller.
 */
function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
