/**
 * @file guard.ts
 * @brief Object guard class and object builder API.
 */

import type { ObjectSchema } from "../../schema/index.js";
import { ObjectModeTag } from "../../kind/index.js";
import { BaseGuard } from "../../guard/index.js";
import type {
  ObjectGuardMode,
  ObjectShape,
  InferObject,
  MergeObjectShapes,
  OmitObjectShape,
  PartialObjectShape,
  PickObjectShape,
  StringKeyOf
} from "./types.js";
import {
  mergeObjectSchemas,
  objectSchema,
  omitObjectSchema,
  partialObjectSchema,
  pickObjectSchema,
  readObjectConstructorSchema,
  readObjectKeySelection,
  readObjectMethodSchema
} from "./schema.js";

/**
 * @brief Guard subclass with object-specific shape operations.
 *
 * @invariant Methods preserve the original object mode. Strict schemas stay
 * strict after shape edits; passthrough schemas stay passthrough.
 */
export class ObjectGuard<
  TShape extends ObjectShape,
  TMode extends ObjectGuardMode
> extends BaseGuard<InferObject<TShape>> {

  /**
   * @brief constructor constructor contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
   * @post The receiver is initialized according to the class invariant before it can be observed.
   */
  public constructor(schema: ObjectSchema) {
    super(readObjectConstructorSchema(schema));
    Object.freeze(this);
  }

  /**
   * @brief extend routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param extension Borrowed input slot named extension; validation or normalization happens before stored state changes.
   * @returns Result for extend; ownership of newly created aggregates is transferred to the caller.
   */
  public extend<const TExtension extends ObjectShape>(
    extension: TExtension
  ): ObjectGuard<MergeObjectShapes<TShape, TExtension>, TMode> {
    return extendObjectGuard(this, extension);
  }

  /**
   * @brief pick routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param keys Borrowed input slot named keys; validation or normalization happens before stored state changes.
   * @returns Result for pick; ownership of newly created aggregates is transferred to the caller.
   */
  public pick<const TKeys extends readonly StringKeyOf<TShape>[]>(
    keys: TKeys
  ): ObjectGuard<PickObjectShape<TShape, TKeys[number]>, TMode> {
    return pickObjectGuard(this, keys);
  }

  /**
   * @brief omit routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @param keys Borrowed input slot named keys; validation or normalization happens before stored state changes.
   * @returns Result for omit; ownership of newly created aggregates is transferred to the caller.
   */
  public omit<const TKeys extends readonly StringKeyOf<TShape>[]>(
    keys: TKeys
  ): ObjectGuard<OmitObjectShape<TShape, TKeys[number]>, TMode> {
    return omitObjectGuard(this, keys);
  }

  /**
   * @brief partial routine contract.
   * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
   * @returns Result for partial; ownership of newly created aggregates is transferred to the caller.
   */
  public partial(): ObjectGuard<PartialObjectShape<TShape>, TMode> {
    return partialObjectGuard(this);
  }
}

/**
 * @brief object function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param shape Borrowed input slot named shape; validation or normalization happens before stored state changes.
 * @returns Result for object; ownership of newly created aggregates is transferred to the caller.
 */
export function object<const TShape extends ObjectShape>(
  shape: TShape
): ObjectGuard<TShape, typeof ObjectModeTag.Passthrough> {
  return new ObjectGuard<TShape, typeof ObjectModeTag.Passthrough>(
    objectSchema(shape, ObjectModeTag.Passthrough)
  );
}

/**
 * @brief strict object function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param shape Borrowed input slot named shape; validation or normalization happens before stored state changes.
 * @returns Result for strict object; ownership of newly created aggregates is transferred to the caller.
 */
export function strictObject<const TShape extends ObjectShape>(
  shape: TShape
): ObjectGuard<TShape, typeof ObjectModeTag.Strict> {
  return new ObjectGuard<TShape, typeof ObjectModeTag.Strict>(
    objectSchema(shape, ObjectModeTag.Strict)
  );
}

/**
 * @brief extend function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @param extension Borrowed input slot named extension; validation or normalization happens before stored state changes.
 * @returns Result for extend; ownership of newly created aggregates is transferred to the caller.
 */
export function extend<
  const TShape extends ObjectShape,
  TMode extends ObjectGuardMode,
  const TExtension extends ObjectShape
>(
  guard: ObjectGuard<TShape, TMode>,
  extension: TExtension
): ObjectGuard<MergeObjectShapes<TShape, TExtension>, TMode> {
  return extendObjectGuard(guard, extension);
}

/**
 * @brief pick function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @param keys Borrowed input slot named keys; validation or normalization happens before stored state changes.
 * @returns Result for pick; ownership of newly created aggregates is transferred to the caller.
 */
export function pick<
  const TShape extends ObjectShape,
  TMode extends ObjectGuardMode,
  const TKeys extends readonly StringKeyOf<TShape>[]
>(
  guard: ObjectGuard<TShape, TMode>,
  keys: TKeys
): ObjectGuard<PickObjectShape<TShape, TKeys[number]>, TMode> {
  return pickObjectGuard(guard, keys);
}

/**
 * @brief omit function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @param keys Borrowed input slot named keys; validation or normalization happens before stored state changes.
 * @returns Result for omit; ownership of newly created aggregates is transferred to the caller.
 */
export function omit<
  const TShape extends ObjectShape,
  TMode extends ObjectGuardMode,
  const TKeys extends readonly StringKeyOf<TShape>[]
>(
  guard: ObjectGuard<TShape, TMode>,
  keys: TKeys
): ObjectGuard<OmitObjectShape<TShape, TKeys[number]>, TMode> {
  return omitObjectGuard(guard, keys);
}

/**
 * @brief partial function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @returns Result for partial; ownership of newly created aggregates is transferred to the caller.
 */
export function partial<
  const TShape extends ObjectShape,
  TMode extends ObjectGuardMode
>(
  guard: ObjectGuard<TShape, TMode>
): ObjectGuard<PartialObjectShape<TShape>, TMode> {
  return partialObjectGuard(guard);
}

/**
 * @brief extend object guard function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @param extension Borrowed input slot named extension; validation or normalization happens before stored state changes.
 * @returns Result for extend object guard; ownership of newly created aggregates is transferred to the caller.
 */
function extendObjectGuard<
  TShape extends ObjectShape,
  TMode extends ObjectGuardMode,
  TExtension extends ObjectShape
>(
  guard: unknown,
  extension: TExtension
): ObjectGuard<MergeObjectShapes<TShape, TExtension>, TMode> {
  const schema = readObjectMethodSchema(guard, "object extend receiver");
  return new ObjectGuard<MergeObjectShapes<TShape, TExtension>, TMode>(
    mergeObjectSchemas(schema, objectSchema(extension, schema.mode))
  );
}

/**
 * @brief pick object guard function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @param keys Borrowed input slot named keys; validation or normalization happens before stored state changes.
 * @returns Result for pick object guard; ownership of newly created aggregates is transferred to the caller.
 */
function pickObjectGuard<
  TShape extends ObjectShape,
  TMode extends ObjectGuardMode,
  TKeys extends readonly StringKeyOf<TShape>[]
>(
  guard: unknown,
  keys: TKeys
): ObjectGuard<PickObjectShape<TShape, TKeys[number]>, TMode> {
  const schema = readObjectMethodSchema(guard, "object pick receiver");
  const selection = readObjectKeySelection(keys, schema, "pick keys");
  return new ObjectGuard<PickObjectShape<TShape, TKeys[number]>, TMode>(
    pickObjectSchema(schema, selection)
  );
}

/**
 * @brief omit object guard function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @param keys Borrowed input slot named keys; validation or normalization happens before stored state changes.
 * @returns Result for omit object guard; ownership of newly created aggregates is transferred to the caller.
 */
function omitObjectGuard<
  TShape extends ObjectShape,
  TMode extends ObjectGuardMode,
  TKeys extends readonly StringKeyOf<TShape>[]
>(
  guard: unknown,
  keys: TKeys
): ObjectGuard<OmitObjectShape<TShape, TKeys[number]>, TMode> {
  const schema = readObjectMethodSchema(guard, "object omit receiver");
  const selection = readObjectKeySelection(keys, schema, "omit keys");
  return new ObjectGuard<OmitObjectShape<TShape, TKeys[number]>, TMode>(
    omitObjectSchema(schema, selection)
  );
}

/**
 * @brief partial object guard function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @returns Result for partial object guard; ownership of newly created aggregates is transferred to the caller.
 */
function partialObjectGuard<
  TShape extends ObjectShape,
  TMode extends ObjectGuardMode
>(
  guard: unknown
): ObjectGuard<PartialObjectShape<TShape>, TMode> {
  const schema = readObjectMethodSchema(guard, "object partial receiver");
  return new ObjectGuard<PartialObjectShape<TShape>, TMode>(
    partialObjectSchema(schema)
  );
}
