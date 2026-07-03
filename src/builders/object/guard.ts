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
   * @brief constructor.
       * @post The receiver is initialized according to the class invariant before it can be observed.
   */
  public constructor(schema: ObjectSchema) {
    super(readObjectConstructorSchema(schema));
    Object.freeze(this);
  }

  /**
   * @brief extend.
         */
  public extend<const TExtension extends ObjectShape>(
    extension: TExtension
  ): ObjectGuard<MergeObjectShapes<TShape, TExtension>, TMode> {
    return extendObjectGuard(this, extension);
  }

  /**
   * @brief pick.
         */
  public pick<const TKeys extends readonly StringKeyOf<TShape>[]>(
    keys: TKeys
  ): ObjectGuard<PickObjectShape<TShape, TKeys[number]>, TMode> {
    return pickObjectGuard(this, keys);
  }

  /**
   * @brief omit.
         */
  public omit<const TKeys extends readonly StringKeyOf<TShape>[]>(
    keys: TKeys
  ): ObjectGuard<OmitObjectShape<TShape, TKeys[number]>, TMode> {
    return omitObjectGuard(this, keys);
  }

  /**
   * @brief partial.
       */
  public partial(): ObjectGuard<PartialObjectShape<TShape>, TMode> {
    return partialObjectGuard(this);
  }
}

/**
 * @brief object.
 */
export function object<const TShape extends ObjectShape>(
  shape: TShape
): ObjectGuard<TShape, typeof ObjectModeTag.Passthrough> {
  return new ObjectGuard<TShape, typeof ObjectModeTag.Passthrough>(
    objectSchema(shape, ObjectModeTag.Passthrough)
  );
}

/**
 * @brief strict object.
 */
export function strictObject<const TShape extends ObjectShape>(
  shape: TShape
): ObjectGuard<TShape, typeof ObjectModeTag.Strict> {
  return new ObjectGuard<TShape, typeof ObjectModeTag.Strict>(
    objectSchema(shape, ObjectModeTag.Strict)
  );
}

/**
 * @brief extend.
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
 * @brief pick.
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
 * @brief omit.
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
 * @brief partial.
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
 * @brief extend object guard.
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
 * @brief pick object guard.
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
 * @brief omit object guard.
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
 * @brief partial object guard.
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
