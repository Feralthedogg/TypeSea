/**
 * @file guard.ts
 * @brief Object guard class and object builder API.
 */

import { objectEntryCanBeOmitted, type ObjectSchema, type Schema } from "../../schema/index.js";
import {
    KeyRuleTag,
    ObjectModeTag,
    SchemaTag
} from "../../kind/index.js";
import {
    BaseGuard,
    type Guard,
    type Presence
} from "../../guard/index.js";
import {
    decodeObjectShape,
    isDecoderValue,
    type BaseCodec,
    type BaseDecoder,
    type InferDecodedObject,
    type InferEncodedObject,
    type ObjectCodecShape,
    type ObjectDecodeShape
} from "../../decoder/index.js";
import { defineReadonlyProperty } from "../../guard/props.js";
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
    PartialObjectShapeByMask,
    PartialObjectShape,
    PickObjectShape,
    PickObjectShapeByMask,
    RequiredObjectShapeByMask,
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

export interface PatternPropertyGuardInput {
    readonly source: string;
    readonly regex: RegExp;
    readonly guard: Guard<unknown, Presence>;
}

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
    public declare readonly shape: TShape;

    public constructor(schema: ObjectSchema, shape?: TShape) {
        const object = readObjectConstructorSchema(schema);
        super(object);
        defineReadonlyProperty(
            this,
            "shape",
            shape === undefined ? objectShapeFromSchema(object) : copyObjectShape(shape),
            true
        );
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
    ):
        | ObjectGuard<PickObjectShape<TShape, StringKeyOf<TShape>>, TMode>
        | ObjectGuard<PickObjectShapeByMask<TShape, ObjectKeyMask<TShape>>, TMode> {
        return pickObjectGuard(this, keys) as
            | ObjectGuard<PickObjectShape<TShape, StringKeyOf<TShape>>, TMode>
            | ObjectGuard<PickObjectShapeByMask<TShape, ObjectKeyMask<TShape>>, TMode>;
    }

    public omit<const TKeys extends readonly StringKeyOf<TShape>[]>(
        keys: TKeys
    ): ObjectGuard<OmitObjectShape<TShape, TKeys[number]>, TMode>;

    public omit<const TMask extends ObjectKeyMask<TShape>>(
        keys: TMask
    ): ObjectGuard<OmitObjectShapeByMask<TShape, TMask>, TMode>;

    public omit(
        keys: readonly string[] | ObjectKeyMask<TShape>
    ):
        | ObjectGuard<OmitObjectShape<TShape, StringKeyOf<TShape>>, TMode>
        | ObjectGuard<OmitObjectShapeByMask<TShape, ObjectKeyMask<TShape>>, TMode> {
        return omitObjectGuard(this, keys) as
            | ObjectGuard<OmitObjectShape<TShape, StringKeyOf<TShape>>, TMode>
            | ObjectGuard<OmitObjectShapeByMask<TShape, ObjectKeyMask<TShape>>, TMode>;
    }

    public partial(): ObjectGuard<PartialObjectShape<TShape>, TMode>;

    public partial<const TMask extends ObjectKeyMask<TShape>>(
        keys: TMask
    ): ObjectGuard<PartialObjectShapeByMask<TShape, TMask>, TMode>;

    public partial(
        keys?: ObjectKeyMask<TShape>
    ): unknown {
        return partialObjectGuard(this, keys);
    }

    public deepPartial(): ObjectGuard<DeepPartialObjectShape<TShape>, TMode> {
        return deepPartialObjectGuard(this);
    }

    public required(): ObjectGuard<RequiredObjectShape<TShape>, TMode>;

    public required<const TMask extends ObjectKeyMask<TShape>>(
        keys: TMask
    ): ObjectGuard<RequiredObjectShapeByMask<TShape, TMask>, TMode>;

    public required(
        keys?: ObjectKeyMask<TShape>
    ): unknown {
        return requiredObjectGuard(this, keys);
    }

    public strict(): ObjectGuard<TShape, typeof ObjectModeTag.Strict> {
        return objectModeGuard(this, ObjectModeTag.Strict);
    }

    public passthrough(): ObjectGuard<TShape, typeof ObjectModeTag.Passthrough> {
        return objectModeGuard(this, ObjectModeTag.Passthrough);
    }

    public loose(): ObjectGuard<TShape, typeof ObjectModeTag.Passthrough> {
        return this.passthrough();
    }

    public nonstrict(): ObjectGuard<TShape, typeof ObjectModeTag.Passthrough> {
        return this.passthrough();
    }

    public nonpassthrough(): ObjectGuard<TShape, typeof ObjectModeTag.Strict> {
        return this.strict();
    }

    public strip(): ObjectGuard<TShape, typeof ObjectModeTag.Strip> {
        return objectModeGuard(this, ObjectModeTag.Strip);
    }

    public catchall(
        guard: Guard<unknown, Presence>
    ): ObjectGuard<TShape, TMode> {
        return catchallObjectGuard(this, guard);
    }

    public atLeastOneKey(
        keys: readonly StringKeyOf<TShape>[]
    ): BaseGuard<InferObject<TShape>> {
        return keyedObjectGuard(this, keys, KeyRuleTag.AtLeastOne, "atLeastOneKey keys");
    }

    public exactlyOneKey(
        keys: readonly StringKeyOf<TShape>[]
    ): BaseGuard<InferObject<TShape>> {
        return keyedObjectGuard(this, keys, KeyRuleTag.ExactlyOne, "exactlyOneKey keys");
    }

    public oneOfKeys(
        keys: readonly StringKeyOf<TShape>[]
    ): BaseGuard<InferObject<TShape>> {
        return keyedObjectGuard(this, keys, KeyRuleTag.ExactlyOne, "oneOfKeys keys");
    }

    public keyof(): BaseGuard<StringKeyOf<TShape>> {
        return keyofObjectGuard(this);
    }
}

/**
 * @brief Build an object guard that accepts unspecified enumerable keys.
 */
export function object<const TShape extends ObjectShape>(
    shape: TShape
): ObjectGuard<TShape, typeof ObjectModeTag.Passthrough>;

export function object<const TShape extends ObjectCodecShape>(
    shape: TShape
): BaseCodec<InferEncodedObject<TShape>, InferDecodedObject<TShape>>;

export function object<const TShape extends ObjectDecodeShape>(
    shape: TShape
): BaseDecoder<InferDecodedObject<TShape>>;

export function object(
    shape: ObjectDecodeShape
): ObjectGuard<ObjectShape, typeof ObjectModeTag.Passthrough> |
    BaseCodec<unknown, unknown> |
    BaseDecoder<unknown> {
    if (objectShapeHasDecoder(shape)) {
        return decodeObjectShape(shape, ObjectModeTag.Passthrough);
    }
    const guardShape = shape as ObjectShape;
    return new ObjectGuard<ObjectShape, typeof ObjectModeTag.Passthrough>(
        objectSchema(guardShape, ObjectModeTag.Passthrough),
        guardShape
    );
}

/**
 * @brief Build a passthrough object guard with Zod-compatible naming.
 * @details TypeSea's default object mode already allows undeclared keys, so
 * this is an alias for object().
 */
export function looseObject<const TShape extends ObjectShape>(
    shape: TShape
): ObjectGuard<TShape, typeof ObjectModeTag.Passthrough>;

export function looseObject<const TShape extends ObjectCodecShape>(
    shape: TShape
): BaseCodec<InferEncodedObject<TShape>, InferDecodedObject<TShape>>;

export function looseObject<const TShape extends ObjectDecodeShape>(
    shape: TShape
): BaseDecoder<InferDecodedObject<TShape>>;

export function looseObject(
    shape: ObjectDecodeShape
): ObjectGuard<ObjectShape, typeof ObjectModeTag.Passthrough> |
    BaseCodec<unknown, unknown> |
    BaseDecoder<unknown> {
    return object(shape);
}

/**
 * @brief Build an object guard that rejects unspecified own keys.
 */
export function strictObject<const TShape extends ObjectShape>(
    shape: TShape
): ObjectGuard<TShape, typeof ObjectModeTag.Strict>;

export function strictObject<const TShape extends ObjectCodecShape>(
    shape: TShape
): BaseCodec<InferEncodedObject<TShape>, InferDecodedObject<TShape>>;

export function strictObject<const TShape extends ObjectDecodeShape>(
    shape: TShape
): BaseDecoder<InferDecodedObject<TShape>>;

export function strictObject(
    shape: ObjectDecodeShape
): ObjectGuard<ObjectShape, typeof ObjectModeTag.Strict> |
    BaseCodec<unknown, unknown> |
    BaseDecoder<unknown> {
    if (objectShapeHasDecoder(shape)) {
        return decodeObjectShape(shape, ObjectModeTag.Strict);
    }
    const guardShape = shape as ObjectShape;
    return new ObjectGuard<ObjectShape, typeof ObjectModeTag.Strict>(
        objectSchema(guardShape, ObjectModeTag.Strict),
        guardShape
    );
}

/**
 * @brief Return an object guard with additional or overridden fields.
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
 * @brief Return a Zod-compatible safe extension of an object guard.
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
 * @brief Merge another object guard while preserving the left unknown-key mode.
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
 * @brief Keep only the selected object fields.
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
 * @brief Remove selected object fields.
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
 * @brief Make all or selected object fields optional.
 */
export function partial<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: ObjectGuard<TShape, TMode>
): ObjectGuard<PartialObjectShape<TShape>, TMode>;

export function partial<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode,
    const TMask extends ObjectKeyMask<TShape>
>(
    guard: ObjectGuard<TShape, TMode>,
    keys: TMask
): ObjectGuard<PartialObjectShapeByMask<TShape, TMask>, TMode>;

export function partial<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: ObjectGuard<TShape, TMode>,
    keys?: ObjectKeyMask<TShape>
): ObjectGuard<ObjectShape, TMode> {
    return partialObjectGuard(guard, keys);
}

/**
 * @brief Recursively make object fields optional.
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
 * @brief Make all or selected object fields required.
 */
export function required<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: ObjectGuard<TShape, TMode>
): ObjectGuard<RequiredObjectShape<TShape>, TMode>;

export function required<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode,
    const TMask extends ObjectKeyMask<TShape>
>(
    guard: ObjectGuard<TShape, TMode>,
    keys: TMask
): ObjectGuard<RequiredObjectShapeByMask<TShape, TMask>, TMode>;

export function required<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: ObjectGuard<TShape, TMode>,
    keys?: ObjectKeyMask<TShape>
): ObjectGuard<ObjectShape, TMode> {
    return requiredObjectGuard(guard, keys);
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
 * @brief Convert an object guard to passthrough unknown-key policy.
 */
export function loose<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: ObjectGuard<TShape, TMode>
): ObjectGuard<TShape, typeof ObjectModeTag.Passthrough> {
    return objectModeGuard(guard, ObjectModeTag.Passthrough);
}

/**
 * @brief Zod-compatible alias for loose.
 */
export function nonstrict<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: ObjectGuard<TShape, TMode>
): ObjectGuard<TShape, typeof ObjectModeTag.Passthrough> {
    return objectModeGuard(guard, ObjectModeTag.Passthrough);
}

/**
 * @brief Zod-compatible alias for strict.
 */
export function nonpassthrough<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: ObjectGuard<TShape, TMode>
): ObjectGuard<TShape, typeof ObjectModeTag.Strict> {
    return objectModeGuard(guard, ObjectModeTag.Strict);
}

/**
 * @brief Accept unknown keys while projecting successful outputs to declared keys.
 * @details Boolean validation has passthrough semantics. Parse-like publication
 * paths copy only declared own data fields.
 */
export function strip<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: ObjectGuard<TShape, TMode>
): ObjectGuard<TShape, typeof ObjectModeTag.Strip> {
    return objectModeGuard(guard, ObjectModeTag.Strip);
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
 * @brief Require at least one selected own data key.
 */
export function atLeastOneKey<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: ObjectGuard<TShape, TMode>,
    keys: readonly StringKeyOf<TShape>[]
): BaseGuard<InferObject<TShape>> {
    return keyedObjectGuard(guard, keys, KeyRuleTag.AtLeastOne, "atLeastOneKey keys");
}

/**
 * @brief Require exactly one selected own data key.
 */
export function exactlyOneKey<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: ObjectGuard<TShape, TMode>,
    keys: readonly StringKeyOf<TShape>[]
): BaseGuard<InferObject<TShape>> {
    return keyedObjectGuard(guard, keys, KeyRuleTag.ExactlyOne, "exactlyOneKey keys");
}

/**
 * @brief Alias for exactlyOneKey.
 */
export function oneOfKeys<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: ObjectGuard<TShape, TMode>,
    keys: readonly StringKeyOf<TShape>[]
): BaseGuard<InferObject<TShape>> {
    return keyedObjectGuard(guard, keys, KeyRuleTag.ExactlyOne, "oneOfKeys keys");
}

/**
 * @brief Build a JSON Schema property-count wrapper.
 */
export function propertyCountObject(
    guard: unknown,
    min: number | undefined,
    max: number | undefined
): BaseGuard<unknown> {
    const schema = readObjectMethodSchema(guard, "object property-count receiver");
    const lower = readPropertyCountBound(min, "minProperties");
    const upper = readPropertyCountBound(max, "maxProperties");
    if (lower !== undefined && upper !== undefined && lower > upper) {
        throw new RangeError("minProperties must be less than or equal to maxProperties");
    }
    return new BaseGuard<unknown>({
        tag: SchemaTag.PropertyCount,
        inner: schema,
        min: lower,
        max: upper
    });
}

/**
 * @brief Build a JSON Schema property-name wrapper.
 */
export function propertyNamesObject(
    guard: unknown,
    key: Guard<unknown, Presence>
): BaseGuard<unknown> {
    return new BaseGuard<unknown>({
        tag: SchemaTag.PropertyNames,
        inner: readObjectMethodSchema(guard, "object property-names receiver"),
        key: readGuardSchema(key, "propertyNames key")
    });
}

/**
 * @brief Build a JSON Schema pattern-properties wrapper.
 */
export function patternPropertiesObject(
    guard: unknown,
    entries: readonly PatternPropertyGuardInput[],
    keys: readonly string[],
    additional: Guard<unknown, Presence> | undefined,
    allowAdditional: boolean
): BaseGuard<unknown> {
    return new BaseGuard<unknown>({
        tag: SchemaTag.PatternProperties,
        inner: readObjectMethodSchema(guard, "object pattern-properties receiver"),
        entries: readPatternPropertyEntries(entries),
        keys: readPatternPropertyKeys(keys),
        keyLookup: makePatternPropertyKeyLookup(keys),
        additional: additional === undefined
            ? undefined
            : readGuardSchema(additional, "patternProperties additionalProperties"),
        allowAdditional
    });
}

/**
 * @brief Build a guard accepting exactly the keys of an object guard.
 * @param guard Object guard whose declared shape keys form the literal set.
 * @returns Literal-union key guard, or never for an empty object shape.
 */
export function keyofObject<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: ObjectGuard<TShape, TMode>
): BaseGuard<StringKeyOf<TShape>> {
    return keyofObjectGuard(guard);
}

/**
 * @brief Copy a user-facing object shape into immutable storage.
 * @details Accessors are preserved without being executed so recursive object
 * getters stay lazy after construction and remain visible through `.shape`.
 */
function copyObjectShape<TShape extends ObjectShape>(shape: TShape): TShape {
    const keys = Object.keys(shape);
    const copy: Record<string, Guard<unknown, Presence>> = {};
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined) {
            continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(shape, key);
        if (descriptor === undefined) {
            throw new TypeError(`object property ${key} disappeared during construction`);
        }
        defineObjectShapeCopyEntry(copy, shape, key, descriptor);
    }
    return Object.freeze(copy) as TShape;
}

/**
 * @brief Install one copied shape property.
 * @details Data entries are copied directly. Getter entries keep the original
 * shape object as receiver so recursive factories that depend on closure or
 * receiver state observe the same schema-definition object.
 * @param target Public shape facade being built.
 * @param shape Original user-supplied shape.
 * @param key Shape key being copied.
 * @param descriptor Own descriptor from the original shape.
 */
function defineObjectShapeCopyEntry(
    target: Record<string, Guard<unknown, Presence>>,
    shape: ObjectShape,
    key: string,
    descriptor: PropertyDescriptor
): void {
    if (Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        Object.defineProperty(target, key, {
            configurable: false,
            enumerable: true,
            value: descriptor.value as Guard<unknown, Presence>,
            writable: false
        });
        return;
    }
    const get = descriptor.get?.bind(shape) as (() => unknown) | undefined;
    if (get === undefined) {
        throw new TypeError(`object property ${key} must be a TypeSea guard`);
    }
    Object.defineProperty(target, key, {
        configurable: false,
        enumerable: true,
        get: (): Guard<unknown, Presence> => readObjectShapeGetter(key, get)
    });
}

/**
 * @brief Resolve a copied shape getter.
 * @details Public shape access may execute the developer-authored schema getter,
 * but the value is still admitted only after the normal guard schema check.
 * @param key Shape key being read.
 * @param get Getter function from the original descriptor.
 * @returns Guard returned by the getter.
 */
function readObjectShapeGetter(
    key: string,
    get: () => unknown
): Guard<unknown, Presence> {
    const value = get();
    readGuardSchema(value, `object property ${key}`);
    return value as Guard<unknown, Presence>;
}

/**
 * @brief Rebuild a public shape facade from an object schema.
 */
function objectShapeFromSchema(schema: ObjectSchema): ObjectShape {
    const shape: Record<string, Guard<unknown, Presence>> = {};
    const entries = schema.entries;
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
            continue;
        }
        shape[entry.key] = new BaseGuard(
            objectEntryCanBeOmitted(entry)
                ? {
                    tag: SchemaTag.Optional,
                    inner: entry.schema
                }
                : entry.schema
        );
    }
    return Object.freeze(shape);
}

/**
 * @brief Apply object extension after validating the receiver schema.
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
 * @brief Apply object merge after validating both guard operands.
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
 * @brief Apply object field selection from a key list or key mask.
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
 * @brief Apply object field exclusion from a key list or key mask.
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
 * @brief Rewrite selected object entries to optional presence.
 */
function partialObjectGuard<
    TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: unknown,
    keys?: ObjectKeyMask<TShape>
): ObjectGuard<ObjectShape, TMode> {
    const schema = readObjectMethodSchema(guard, "object partial receiver");
    const selection = keys === undefined
        ? undefined
        : readObjectKeySelection(keys, schema, "partial keys");
    return new ObjectGuard<ObjectShape, TMode>(
        partialObjectSchema(schema, selection)
    );
}

/**
 * @brief Rewrite nested object entries to optional presence.
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
 * @brief Rewrite selected object entries to required presence.
 */
function requiredObjectGuard<
    TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: unknown,
    keys?: ObjectKeyMask<TShape>
): ObjectGuard<ObjectShape, TMode> {
    const schema = readObjectMethodSchema(guard, "object required receiver");
    const selection = keys === undefined
        ? undefined
        : readObjectKeySelection(keys, schema, "required keys");
    return new ObjectGuard<ObjectShape, TMode>(
        requiredObjectSchema(schema, selection)
    );
}

/**
 * @brief Rewrite passthrough, strip, or strict object mode.
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
 * @brief Attach a catchall schema for unknown string keys.
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

/**
 * @brief Detect decoder-aware object shapes.
 * @param shape Candidate object shape.
 * @returns True when at least one declared field is a TypeSea decoder or codec.
 */
function objectShapeHasDecoder(shape: ObjectDecodeShape): boolean {
    const keys = Object.keys(shape);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined) {
            continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(shape, key);
        if (descriptor !== undefined &&
            Object.prototype.hasOwnProperty.call(descriptor, "value") &&
            isDecoderValue(descriptor.value)) {
            return true;
        }
    }
    return false;
}

/**
 * @brief Build a keyed-object wrapper around an object schema.
 */
function keyedObjectGuard<
    TShape extends ObjectShape
>(
    guard: unknown,
    keys: readonly string[],
    rule: KeyRuleTag,
    label: string
): BaseGuard<InferObject<TShape>> {
    const schema = readObjectMethodSchema(guard, "object key-rule receiver");
    const selection = readObjectKeySelection(keys, schema, label);
    if (selection.length === 0) {
        throw new TypeError(`${label} must select at least one key`);
    }
    return new BaseGuard<InferObject<TShape>>({
        tag: SchemaTag.KeyedObject,
        inner: schema,
        keys: selection,
        rule
    });
}

/**
 * @brief Normalize an optional JSON Schema property-count bound.
 */
function readPropertyCountBound(value: number | undefined, label: string): number | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!Number.isInteger(value) || value < 0) {
        throw new RangeError(`${label} must be a non-negative integer`);
    }
    return value;
}

/**
 * @brief Normalize JSON Schema pattern-property entries.
 */
function readPatternPropertyEntries(
    entries: readonly PatternPropertyGuardInput[]
): readonly {
    readonly source: string;
    readonly regex: RegExp;
    readonly schema: Schema;
}[] {
    const output = new Array<{
        readonly source: string;
        readonly regex: RegExp;
        readonly schema: Schema;
    }>(entries.length);
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined ||
            typeof entry.source !== "string" ||
            !(entry.regex instanceof RegExp) ||
            entry.regex.flags !== "") {
            throw new TypeError("patternProperties entry must contain an unflagged RegExp");
        }
        output[index] = {
            source: entry.source,
            regex: new RegExp(entry.regex.source),
            schema: readGuardSchema(entry.guard, "patternProperties schema")
        };
    }
    return output;
}

/**
 * @brief Normalize declared object keys for pattern-properties wrappers.
 */
function readPatternPropertyKeys(keys: readonly string[]): readonly string[] {
    const output = new Array<string>(keys.length);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (typeof key !== "string") {
            throw new TypeError("patternProperties keys must contain strings");
        }
        output[index] = key;
    }
    return output;
}

/**
 * @brief Build an O(1) declared-key lookup for pattern-properties wrappers.
 */
function makePatternPropertyKeyLookup(
    keys: readonly string[]
): Readonly<Record<string, true>> {
    const lookup: Record<string, true> = Object.create(null) as Record<string, true>;
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (typeof key !== "string") {
            throw new TypeError("patternProperties keys must contain strings");
        }
        lookup[key] = true;
    }
    return lookup;
}

/**
 * @brief Lower object keys into a literal-union guard.
 */
function keyofObjectGuard<
    const TShape extends ObjectShape,
    TMode extends ObjectGuardMode
>(
    guard: ObjectGuard<TShape, TMode>
): BaseGuard<StringKeyOf<TShape>> {
    const schema = readObjectMethodSchema(guard, "keyof object");
    const keys = schema.keys;
    if (keys.length === 0) {
        return new BaseGuard<never>({
            tag: SchemaTag.Never
        });
    }
    const options = new Array<Schema>(keys.length);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined) {
            throw new TypeError("object key disappeared during keyof construction");
        }
        options[index] = {
            tag: SchemaTag.Literal,
            value: key
        };
    }
    return new BaseGuard<StringKeyOf<TShape>>({
        tag: SchemaTag.Union,
        options
    });
}
