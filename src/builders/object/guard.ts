/**
 * @file guard.ts
 * @brief Object guard class and object builder API.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */

import type { ObjectSchema } from "../../schema/index.js";
import { ObjectModeTag } from "../../kind/index.js";
import {
    BaseGuard,
    type Guard,
    type Presence
} from "../../guard/index.js";
import { readGuardSchema } from "../../internal/index.js";
import type {
    ObjectGuardMode,
    ObjectShape,
    DeepPartialObjectShape,
    InferObject,
    MergeObjectShapes,
    ObjectKeyMask,
    OmitObjectShape,
    OmitObjectShapeByMask,
    PartialObjectShape,
    PickObjectShape,
    PickObjectShapeByMask,
    RequiredObjectShape,
    StringKeyOf
} from "./types.js";
import {
    deepPartialObjectSchema,
    mergeObjectSchemas,
    objectSchema,
    objectSchemaWithCatchall,
    objectSchemaWithMode,
    omitObjectSchema,
    partialObjectSchema,
    pickObjectSchema,
    readObjectConstructorSchema,
    readObjectKeySelection,
    readObjectMethodSchema,
    requiredObjectSchema
} from "./schema.js";

/**
 * @brief Guard subclass with object-specific shape operations.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 *
 * @invariant Methods preserve the original object mode. Strict schemas stay
 * strict after shape edits; passthrough schemas stay passthrough.
 */
export class ObjectGuard<
    TShape extends ObjectShape,
    TMode extends ObjectGuardMode
> extends BaseGuard<InferObject<TShape>> {

    public constructor(schema: ObjectSchema) {
        super(readObjectConstructorSchema(schema));
        Object.freeze(this);
    }

    public extend<const TExtension extends ObjectShape>(
        extension: TExtension
    ): ObjectGuard<MergeObjectShapes<TShape, TExtension>, TMode> {
        return extendObjectGuard(this, extension);
    }

    public safeExtend<const TExtension extends ObjectShape>(
        extension: TExtension
    ): ObjectGuard<MergeObjectShapes<TShape, TExtension>, TMode> {
        return extendObjectGuard(this, extension);
    }

    public merge<
        const TExtension extends ObjectShape,
        TExtensionMode extends ObjectGuardMode
    >(
        other: ObjectGuard<TExtension, TExtensionMode>
    ): ObjectGuard<MergeObjectShapes<TShape, TExtension>, TMode> {
        return mergeObjectGuard(this, other);
    }

    public pick<const TKeys extends readonly StringKeyOf<TShape>[]>(
        keys: TKeys
    ): ObjectGuard<PickObjectShape<TShape, TKeys[number]>, TMode>;

    public pick<const TMask extends ObjectKeyMask<TShape>>(
        keys: TMask
    ): ObjectGuard<PickObjectShapeByMask<TShape, TMask>, TMode>;

    public pick(
        keys: readonly string[] | ObjectKeyMask<TShape>
    ): ObjectGuard<ObjectShape, TMode> {
        return pickObjectGuard(this, keys);
    }

    public omit<const TKeys extends readonly StringKeyOf<TShape>[]>(
        keys: TKeys
    ): ObjectGuard<OmitObjectShape<TShape, TKeys[number]>, TMode>;

    public omit<const TMask extends ObjectKeyMask<TShape>>(
        keys: TMask
    ): ObjectGuard<OmitObjectShapeByMask<TShape, TMask>, TMode>;

    public omit(
        keys: readonly string[] | ObjectKeyMask<TShape>
    ): ObjectGuard<ObjectShape, TMode> {
        return omitObjectGuard(this, keys);
    }

    public partial(): ObjectGuard<PartialObjectShape<TShape>, TMode> {
        return partialObjectGuard(this);
    }

    public deepPartial(): ObjectGuard<DeepPartialObjectShape<TShape>, TMode> {
        return deepPartialObjectGuard(this);
    }

    public required(): ObjectGuard<RequiredObjectShape<TShape>, TMode> {
        return requiredObjectGuard(this);
    }

    public strict(): ObjectGuard<TShape, typeof ObjectModeTag.Strict> {
        return objectModeGuard(this, ObjectModeTag.Strict);
    }

    public passthrough(): ObjectGuard<TShape, typeof ObjectModeTag.Passthrough> {
        return objectModeGuard(this, ObjectModeTag.Passthrough);
    }

    public strip(): ObjectGuard<TShape, typeof ObjectModeTag.Passthrough> {
        return objectModeGuard(this, ObjectModeTag.Passthrough);
    }

    public catchall(
        guard: Guard<unknown, Presence>
    ): ObjectGuard<TShape, TMode> {
        return catchallObjectGuard(this, guard);
    }
}

/**
 * @brief Build an object guard that accepts unspecified enumerable keys.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */
export function object<const TShape extends ObjectShape>(
    shape: TShape
): ObjectGuard<TShape, typeof ObjectModeTag.Passthrough> {
    return new ObjectGuard<TShape, typeof ObjectModeTag.Passthrough>(
        objectSchema(shape, ObjectModeTag.Passthrough)
    );
}

/**
 * @brief Build an object guard that rejects unspecified own keys.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */
export function strictObject<const TShape extends ObjectShape>(
    shape: TShape
): ObjectGuard<TShape, typeof ObjectModeTag.Strict> {
    return new ObjectGuard<TShape, typeof ObjectModeTag.Strict>(
        objectSchema(shape, ObjectModeTag.Strict)
    );
}

/**
 * @brief Execute extend.
 * @details This helper keeps a local invariant explicit at the module boundary.
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
 * @brief Execute safe extend.
 * @details Runtime construction follows the same hardened schema merge as
 * extend. The method name gives callers a Zod-compatible, intention-revealing
 * API for shape extension.
 */
export function safeExtend<
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
 * @brief Execute object merge.
 * @details The left object keeps its unknown-key mode. The right object supplies
 * overriding fields and, when present, a catchall schema.
 */
export function merge<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode,
    const TExtension extends ObjectShape,
    TExtensionMode extends ObjectGuardMode
>(
    guard: ObjectGuard<TShape, TMode>,
    other: ObjectGuard<TExtension, TExtensionMode>
): ObjectGuard<MergeObjectShapes<TShape, TExtension>, TMode> {
    return mergeObjectGuard(guard, other);
}

/**
 * @brief Execute pick.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
export function pick<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode,
    const TKeys extends readonly StringKeyOf<TShape>[]
>(
    guard: ObjectGuard<TShape, TMode>,
    keys: TKeys
): ObjectGuard<PickObjectShape<TShape, TKeys[number]>, TMode>;

export function pick<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode,
    const TMask extends ObjectKeyMask<TShape>
>(
    guard: ObjectGuard<TShape, TMode>,
    keys: TMask
): ObjectGuard<PickObjectShapeByMask<TShape, TMask>, TMode>;

export function pick<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: ObjectGuard<TShape, TMode>,
    keys: readonly string[] | ObjectKeyMask<TShape>
): ObjectGuard<ObjectShape, TMode> {
    return pickObjectGuard(guard, keys);
}

/**
 * @brief Execute omit.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
export function omit<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode,
    const TKeys extends readonly StringKeyOf<TShape>[]
>(
    guard: ObjectGuard<TShape, TMode>,
    keys: TKeys
): ObjectGuard<OmitObjectShape<TShape, TKeys[number]>, TMode>;

export function omit<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode,
    const TMask extends ObjectKeyMask<TShape>
>(
    guard: ObjectGuard<TShape, TMode>,
    keys: TMask
): ObjectGuard<OmitObjectShapeByMask<TShape, TMask>, TMode>;

export function omit<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: ObjectGuard<TShape, TMode>,
    keys: readonly string[] | ObjectKeyMask<TShape>
): ObjectGuard<ObjectShape, TMode> {
    return omitObjectGuard(guard, keys);
}

/**
 * @brief Execute partial.
 * @details This helper keeps a local invariant explicit at the module boundary.
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
 * @brief Execute deep partial.
 */
export function deepPartial<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: ObjectGuard<TShape, TMode>
): ObjectGuard<DeepPartialObjectShape<TShape>, TMode> {
    return deepPartialObjectGuard(guard);
}

/**
 * @brief Execute required.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
export function required<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: ObjectGuard<TShape, TMode>
): ObjectGuard<RequiredObjectShape<TShape>, TMode> {
    return requiredObjectGuard(guard);
}

/**
 * @brief Convert an object guard to strict unknown-key policy.
 */
export function strict<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: ObjectGuard<TShape, TMode>
): ObjectGuard<TShape, typeof ObjectModeTag.Strict> {
    return objectModeGuard(guard, ObjectModeTag.Strict);
}

/**
 * @brief Convert an object guard to passthrough unknown-key policy.
 */
export function passthrough<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: ObjectGuard<TShape, TMode>
): ObjectGuard<TShape, typeof ObjectModeTag.Passthrough> {
    return objectModeGuard(guard, ObjectModeTag.Passthrough);
}

/**
 * @brief Accept unknown keys without producing a stripped output copy.
 * @details TypeSea guard validation returns the original value, so Zod-style
 * strip has validation semantics equivalent to passthrough.
 */
export function strip<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: ObjectGuard<TShape, TMode>
): ObjectGuard<TShape, typeof ObjectModeTag.Passthrough> {
    return objectModeGuard(guard, ObjectModeTag.Passthrough);
}

/**
 * @brief Validate every undeclared own key with a catchall schema.
 */
export function catchall<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: ObjectGuard<TShape, TMode>,
    value: Guard<unknown, Presence>
): ObjectGuard<TShape, TMode> {
    return catchallObjectGuard(guard, value);
}

/**
 * @brief Execute extend object guard.
 * @details This helper keeps a local invariant explicit at the module boundary.
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
 * @brief Execute merge object guard.
 */
function mergeObjectGuard<
    TShape extends ObjectShape,
    TMode extends ObjectGuardMode,
    TExtension extends ObjectShape,
    TExtensionMode extends ObjectGuardMode
>(
    guard: unknown,
    other: ObjectGuard<TExtension, TExtensionMode>
): ObjectGuard<MergeObjectShapes<TShape, TExtension>, TMode> {
    const base = readObjectMethodSchema(guard, "object merge receiver");
    const extension = readObjectMethodSchema(other, "object merge argument");
    return new ObjectGuard<MergeObjectShapes<TShape, TExtension>, TMode>(
        mergeObjectSchemas(base, extension)
    );
}

/**
 * @brief Execute pick object guard.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
function pickObjectGuard<
    TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: unknown,
    keys: readonly string[] | ObjectKeyMask<TShape>
): ObjectGuard<ObjectShape, TMode> {
    const schema = readObjectMethodSchema(guard, "object pick receiver");
    const selection = readObjectKeySelection(keys, schema, "pick keys");
    return new ObjectGuard<ObjectShape, TMode>(
        pickObjectSchema(schema, selection)
    );
}

/**
 * @brief Execute omit object guard.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
function omitObjectGuard<
    TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: unknown,
    keys: readonly string[] | ObjectKeyMask<TShape>
): ObjectGuard<ObjectShape, TMode> {
    const schema = readObjectMethodSchema(guard, "object omit receiver");
    const selection = readObjectKeySelection(keys, schema, "omit keys");
    return new ObjectGuard<ObjectShape, TMode>(
        omitObjectSchema(schema, selection)
    );
}

/**
 * @brief Execute partial object guard.
 * @details This helper keeps a local invariant explicit at the module boundary.
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

/**
 * @brief Execute deep partial object guard.
 */
function deepPartialObjectGuard<
    TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: unknown
): ObjectGuard<DeepPartialObjectShape<TShape>, TMode> {
    const schema = readObjectMethodSchema(guard, "object deepPartial receiver");
    return new ObjectGuard<DeepPartialObjectShape<TShape>, TMode>(
        deepPartialObjectSchema(schema)
    );
}

/**
 * @brief Execute required object guard.
 * @details This helper keeps a local invariant explicit at the module boundary.
 */
function requiredObjectGuard<
    TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: unknown
): ObjectGuard<RequiredObjectShape<TShape>, TMode> {
    const schema = readObjectMethodSchema(guard, "object required receiver");
    return new ObjectGuard<RequiredObjectShape<TShape>, TMode>(
        requiredObjectSchema(schema)
    );
}

/**
 * @brief Execute object mode rewrite.
 */
function objectModeGuard<
    TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: unknown,
    mode: TMode
): ObjectGuard<TShape, TMode> {
    const schema = readObjectMethodSchema(guard, "object mode receiver");
    return new ObjectGuard<TShape, TMode>(objectSchemaWithMode(schema, mode));
}

/**
 * @brief Execute object catchall rewrite.
 */
function catchallObjectGuard<
    TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: unknown,
    value: Guard<unknown, Presence>
): ObjectGuard<TShape, TMode> {
    const schema = readObjectMethodSchema(guard, "object catchall receiver");
    return new ObjectGuard<TShape, TMode>(
        objectSchemaWithCatchall(
            schema,
            readGuardSchema(value, "object catchall schema")
        )
    );
}
