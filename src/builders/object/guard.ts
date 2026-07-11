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
    type Presence,
    type RefineParams,
    type SuperRefineContext
} from "../../guard/index.js";
import {
    decodeObjectShape,
    decodeObjectShapeWithEffect,
    isDecoderValue,
    type MergeObjectDecodeShapes,
    type ObjectCodec,
    type ObjectDecoder,
    type ObjectCodecShape,
    type ObjectDecodeMode,
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

/** @brief Regular-expression key domain paired with its value guard. */
export interface PatternPropertyGuardInput {
    readonly source: string;
    readonly regex: RegExp;
    readonly guard: Guard<unknown, Presence>;
}

const objectCapabilitySchemas = new WeakMap<object, ObjectSchema>();

/**
 * @brief Guard subclass with object-specific shape operations.
 *
 * @invariant Methods preserve the original object mode. Strict schemas stay
 * strict after shape edits; passthrough schemas stay passthrough.
 */
export class ObjectGuard<
    TShape extends ObjectShape,
    TMode extends ObjectGuardMode = ObjectGuardMode
> extends BaseGuard<InferObject<TShape>> {
    public declare readonly shape: TShape;
    public declare readonly mode: TMode;

    public constructor(
        schema: Schema,
        shape?: TShape,
        capabilitySchema?: ObjectSchema
    ) {
        const object = capabilitySchema ?? readObjectConstructorSchema(schema);
        super(schema);
        defineReadonlyProperty(
            this,
            "shape",
            shape === undefined ? objectShapeFromSchema(object) : copyObjectShape(shape),
            true
        );
        defineReadonlyProperty(this, "mode", object.mode, false);
        objectCapabilitySchemas.set(this, object);
        Object.freeze(this);
    }

    public override describe(description: string): ObjectGuard<TShape, TMode> {
        const described = super.describe(description);
        return new ObjectGuard(
            readGuardSchema(described, "object describe result"),
            this.shape,
            readObjectCapabilitySchema(this, "object describe receiver")
        );
    }

    public override refine(
        predicate: (value: InferObject<TShape>) => boolean,
        params?: RefineParams<InferObject<TShape>>
    ): ObjectGuard<TShape, TMode> {
        const refined = super.refine(predicate, params);
        return new ObjectGuard(
            readGuardSchema(refined, "object refine result"),
            this.shape,
            readObjectCapabilitySchema(this, "object refine receiver")
        );
    }

    public override superRefine(
        callback: (
            value: InferObject<TShape>,
            context: SuperRefineContext
        ) => void,
        name?: string
    ): ObjectGuard<TShape, TMode> {
        const refined = super.superRefine(callback, name);
        return new ObjectGuard(
            readGuardSchema(refined, "object superRefine result"),
            this.shape,
            readObjectCapabilitySchema(this, "object superRefine receiver")
        );
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
    ): ObjectGuard<MergeObjectShapes<TShape, TExtension>, TMode>;

    public merge<
        const TExtension extends ObjectCodecShape,
        TExtensionMode extends ObjectDecodeMode
    >(
        other: ObjectCodec<TExtension, TExtensionMode>
    ): ObjectCodec<MergeObjectDecodeShapes<TShape, TExtension>, TMode>;

    public merge<
        const TExtension extends ObjectDecodeShape,
        TExtensionMode extends ObjectDecodeMode
    >(
        other: ObjectDecoder<TExtension, TExtensionMode>
    ): ObjectDecoder<MergeObjectDecodeShapes<TShape, TExtension>, TMode>;

    public merge(
        other: ObjectGuard<ObjectShape> |
            ObjectCodec<ObjectCodecShape> |
            ObjectDecoder<ObjectDecodeShape>
    ): ObjectGuard<ObjectShape, TMode> |
        ObjectCodec<ObjectCodecShape, TMode> |
        ObjectDecoder<ObjectDecodeShape, TMode> {
        if (other instanceof ObjectGuard) {
            return mergeObjectGuard(this, other);
        }
        const base = readObjectCapabilitySchema(this, "object merge receiver");
        const shape = mergeMixedObjectShape(this.shape, other.shape);
        if (!objectGuardHasRefinement(this, base)) {
            return decodeObjectShape(shape, base.mode) as
                | ObjectCodec<ObjectCodecShape, TMode>
                | ObjectDecoder<ObjectDecodeShape, TMode>;
        }
        const effect = rebaseObjectValidationSchema(
            readGuardSchema(this, "object merge receiver"),
            base,
            { tag: SchemaTag.Unknown },
            "object merge receiver"
        );
        return decodeObjectShapeWithEffect(shape, base.mode, effect) as
            | ObjectCodec<ObjectCodecShape, TMode>
            | ObjectDecoder<ObjectDecodeShape, TMode>;
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
 * @brief Zod-facade object guard with truthy refinement compatibility.
 * @details Native ObjectGuard keeps TypeSea's literal-true refinement rule.
 * This facade normalizes Zod callbacks at schema construction, leaving the
 * generated validation path identical to an ordinary boolean refinement.
 */
export class ZodObjectGuard<
    TShape extends ObjectShape,
    TMode extends ObjectGuardMode = ObjectGuardMode
> extends ObjectGuard<TShape, TMode> {

    public override describe(description: string): ZodObjectGuard<TShape, TMode> {
        const described = super.describe(description);
        return new ZodObjectGuard(
            readGuardSchema(described, "Zod object describe result"),
            this.shape,
            readObjectCapabilitySchema(this, "Zod object describe receiver")
        );
    }

    public override refine(
        predicate: (value: InferObject<TShape>) => unknown,
        params?: RefineParams<InferObject<TShape>>
    ): ZodObjectGuard<TShape, TMode> {
        if (typeof predicate !== "function") {
            throw new TypeError("Zod object refinement predicate must be a function");
        }
        const refined = super.refine(
            (value): boolean => Boolean(predicate(value)),
            params
        );
        return new ZodObjectGuard(
            readGuardSchema(refined, "Zod object refine result"),
            this.shape,
            readObjectCapabilitySchema(this, "Zod object refine receiver")
        );
    }

    public override superRefine(
        callback: (
            value: InferObject<TShape>,
            context: SuperRefineContext
        ) => void,
        name?: string
    ): ZodObjectGuard<TShape, TMode> {
        const refined = super.superRefine(callback, name);
        return new ZodObjectGuard(
            readGuardSchema(refined, "Zod object superRefine result"),
            this.shape,
            readObjectCapabilitySchema(this, "Zod object superRefine receiver")
        );
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
): ObjectCodec<TShape, typeof ObjectModeTag.Passthrough>;

export function object<const TShape extends ObjectDecodeShape>(
    shape: TShape
): ObjectDecoder<TShape, typeof ObjectModeTag.Passthrough>;

export function object(
    shape: ObjectDecodeShape
): ObjectGuard<ObjectShape, typeof ObjectModeTag.Passthrough> |
    ObjectCodec<ObjectCodecShape, typeof ObjectModeTag.Passthrough> |
    ObjectDecoder<ObjectDecodeShape, typeof ObjectModeTag.Passthrough> {
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
): ObjectCodec<TShape, typeof ObjectModeTag.Passthrough>;

export function looseObject<const TShape extends ObjectDecodeShape>(
    shape: TShape
): ObjectDecoder<TShape, typeof ObjectModeTag.Passthrough>;

export function looseObject(
    shape: ObjectDecodeShape
): ObjectGuard<ObjectShape, typeof ObjectModeTag.Passthrough> |
    ObjectCodec<ObjectCodecShape, typeof ObjectModeTag.Passthrough> |
    ObjectDecoder<ObjectDecodeShape, typeof ObjectModeTag.Passthrough> {
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
): ObjectCodec<TShape, typeof ObjectModeTag.Strict>;

export function strictObject<const TShape extends ObjectDecodeShape>(
    shape: TShape
): ObjectDecoder<TShape, typeof ObjectModeTag.Strict>;

export function strictObject(
    shape: ObjectDecodeShape
): ObjectGuard<ObjectShape, typeof ObjectModeTag.Strict> |
    ObjectCodec<ObjectCodecShape, typeof ObjectModeTag.Strict> |
    ObjectDecoder<ObjectDecodeShape, typeof ObjectModeTag.Strict> {
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
    const schema = readObjectConstraintSchema(guard, "object property-count receiver");
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
        inner: readObjectConstraintSchema(guard, "object property-names receiver"),
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
        inner: readObjectConstraintSchema(guard, "object pattern-properties receiver"),
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
 * JSON Schema object keywords are independent constraints and may wrap one
 * another. Preserve the complete outer chain after proving it terminates at an
 * object schema; shape-changing ObjectGuard methods remain stricter.
 */
function readObjectConstraintSchema(guard: unknown, label: string): Schema {
    const schema = readGuardSchema(guard, label);
    let current = schema;
    for (let depth = 0; depth < 65_536; depth += 1) {
        switch (current.tag) {
            case SchemaTag.Object:
                return schema;
            case SchemaTag.PropertyCount:
            case SchemaTag.PropertyNames:
            case SchemaTag.PatternProperties:
                current = current.inner;
                break;
            default:
                throw new TypeError(`${label} must be an object TypeSea guard`);
        }
    }
    throw new TypeError(`${label} exceeds the object constraint depth limit`);
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
 * @brief Resolve the structural object capability without trusting public fields.
 * @details Constructed guards use a WeakMap side table; compatibility receivers
 * fall back to the validated method schema. This prevents forged `.shape` or
 * `.schema` properties from influencing fluent object derivations.
 */
function readObjectCapabilitySchema(guard: unknown, label: string): ObjectSchema {
    if (typeof guard === "object" && guard !== null) {
        const schema = objectCapabilitySchemas.get(guard);
        if (schema !== undefined) {
            readGuardSchema(guard, label);
            return schema;
        }
    }
    return readObjectMethodSchema(guard, label);
}

/**
 * @brief Replace an object's structural leaf while preserving validation wrappers.
 * @details ObjectGuard keeps structural capability metadata separate from its
 * complete validation schema. Shape edits replace only that leaf; refinements
 * and metadata are replayed in their original order so derivation cannot weaken
 * the source guard.
 * @invariant The supplied capability must be reachable through Metadata and
 * Refine wrappers only.
 */
function rebaseObjectValidationSchema(
    outer: Schema,
    capability: ObjectSchema,
    replacement: Schema,
    label: string
): Schema {
    const wrappers: Schema[] = [];
    let current = outer;
    for (let depth = 0; depth < 65_536; depth += 1) {
        if (current === capability) {
            let output = replacement;
            for (let index = wrappers.length - 1; index >= 0; index -= 1) {
                const wrapper = wrappers[index];
                if (wrapper === undefined) {
                    continue;
                }
                output = copyObjectValidationWrapper(wrapper, output, label);
            }
            return output;
        }
        switch (current.tag) {
            case SchemaTag.Metadata:
            case SchemaTag.Refine:
                wrappers.push(current);
                current = current.inner;
                break;
            default:
                throw new TypeError(`${label} has an invalid object validation wrapper`);
        }
    }
    throw new TypeError(`${label} exceeds the object validation wrapper depth limit`);
}

/**
 * @brief Rebuild one admitted object-validation wrapper around a new inner node.
 * @details Wrapper callbacks and metadata are reused by identity. The schema
 * freezer owns final immutability when the derived guard is constructed.
 */
function copyObjectValidationWrapper(
    wrapper: Schema,
    inner: Schema,
    label: string
): Schema {
    switch (wrapper.tag) {
        case SchemaTag.Metadata:
            return {
                tag: SchemaTag.Metadata,
                inner,
                metadata: wrapper.metadata
            };
        case SchemaTag.Refine:
            return {
                tag: SchemaTag.Refine,
                inner,
                predicate: wrapper.predicate,
                collect: wrapper.collect,
                path: wrapper.path,
                message: wrapper.message,
                abort: wrapper.abort,
                when: wrapper.when,
                name: wrapper.name
            };
        default:
            throw new TypeError(`${label} has an invalid object validation wrapper`);
    }
}

/**
 * @brief Prove whether an object guard has a refinement above its capability leaf.
 * @details `safeExtend` uses this proof to distinguish structural derivation from
 * extension of a semantically refined object. Unknown wrapper shapes fail closed.
 */
function objectGuardHasRefinement(guard: unknown, capability: ObjectSchema): boolean {
    let current = readGuardSchema(guard, "object refinement receiver");
    for (let depth = 0; depth < 65_536; depth += 1) {
        if (current === capability) {
            return false;
        }
        switch (current.tag) {
            case SchemaTag.Refine:
                return true;
            case SchemaTag.Metadata:
                current = current.inner;
                break;
            default:
                throw new TypeError("object refinement receiver has an invalid wrapper");
        }
    }
    throw new TypeError("object refinement receiver exceeds the wrapper depth limit");
}

function mergeMixedObjectShape(
    base: ObjectShape,
    extension: ObjectDecodeShape
): ObjectDecodeShape {
    const output: Record<string, Guard<unknown, Presence> | ObjectDecodeShape[string]> =
        Object.create(null) as Record<
            string,
            Guard<unknown, Presence> | ObjectDecodeShape[string]
        >;
    copyMixedObjectShapeEntries(base, output);
    copyMixedObjectShapeEntries(extension, output);
    return Object.freeze(output);
}

function copyMixedObjectShapeEntries(
    shape: ObjectDecodeShape,
    output: Record<string, ObjectDecodeShape[string]>
): void {
    const keys = Object.keys(shape);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined) {
            continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(shape, key);
        if (descriptor === undefined ||
            !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
            throw new TypeError(`mixed object property ${key} must be a data property`);
        }
        Object.defineProperty(output, key, {
            value: descriptor.value as ObjectDecodeShape[string],
            enumerable: true,
            configurable: true,
            writable: true
        });
    }
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
    const schema = readObjectCapabilitySchema(guard, "object extend receiver");
    const merged = mergeObjectSchemas(schema, objectSchema(extension, schema.mode));
    return new ObjectGuard<MergeObjectShapes<TShape, TExtension>, TMode>(
        rebaseObjectValidationSchema(
            readGuardSchema(guard, "object extend receiver"),
            schema,
            merged,
            "object extend receiver"
        ),
        undefined,
        merged
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
    const base = readObjectCapabilitySchema(guard, "object merge receiver");
    const extension = readObjectCapabilitySchema(other, "object merge argument");
    const merged = mergeObjectSchemas(base, extension);
    const withBaseValidation = rebaseObjectValidationSchema(
        readGuardSchema(guard, "object merge receiver"),
        base,
        merged,
        "object merge receiver"
    );
    return new ObjectGuard<MergeObjectShapes<TShape, TExtension>, TMode>(
        rebaseObjectValidationSchema(
            readGuardSchema(other, "object merge argument"),
            extension,
            withBaseValidation,
            "object merge argument"
        ),
        undefined,
        merged
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
    const schema = readObjectCapabilitySchema(guard, "object pick receiver");
    const selection = readObjectKeySelection(keys, schema, "pick keys");
    const selected = pickObjectSchema(schema, selection);
    return new ObjectGuard<ObjectShape, TMode>(
        rebaseObjectValidationSchema(
            readGuardSchema(guard, "object pick receiver"),
            schema,
            selected,
            "object pick receiver"
        ),
        undefined,
        selected
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
    const schema = readObjectCapabilitySchema(guard, "object omit receiver");
    const selection = readObjectKeySelection(keys, schema, "omit keys");
    const selected = omitObjectSchema(schema, selection);
    return new ObjectGuard<ObjectShape, TMode>(
        rebaseObjectValidationSchema(
            readGuardSchema(guard, "object omit receiver"),
            schema,
            selected,
            "object omit receiver"
        ),
        undefined,
        selected
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
    const schema = readObjectCapabilitySchema(guard, "object partial receiver");
    const selection = keys === undefined
        ? undefined
        : readObjectKeySelection(keys, schema, "partial keys");
    const partial = partialObjectSchema(schema, selection);
    return new ObjectGuard<ObjectShape, TMode>(
        rebaseObjectValidationSchema(
            readGuardSchema(guard, "object partial receiver"),
            schema,
            partial,
            "object partial receiver"
        ),
        undefined,
        partial
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
    const schema = readObjectCapabilitySchema(guard, "object deepPartial receiver");
    const partial = deepPartialObjectSchema(schema);
    return new ObjectGuard<DeepPartialObjectShape<TShape>, TMode>(
        rebaseObjectValidationSchema(
            readGuardSchema(guard, "object deepPartial receiver"),
            schema,
            partial,
            "object deepPartial receiver"
        ),
        undefined,
        partial
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
    const schema = readObjectCapabilitySchema(guard, "object required receiver");
    const selection = keys === undefined
        ? undefined
        : readObjectKeySelection(keys, schema, "required keys");
    const required = requiredObjectSchema(schema, selection);
    return new ObjectGuard<ObjectShape, TMode>(
        rebaseObjectValidationSchema(
            readGuardSchema(guard, "object required receiver"),
            schema,
            required,
            "object required receiver"
        ),
        undefined,
        required
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
    const schema = readObjectCapabilitySchema(guard, "object mode receiver");
    const changed = objectSchemaWithMode(schema, mode);
    return new ObjectGuard<TShape, TMode>(
        rebaseObjectValidationSchema(
            readGuardSchema(guard, "object mode receiver"),
            schema,
            changed,
            "object mode receiver"
        ),
        undefined,
        changed
    );
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
    const schema = readObjectCapabilitySchema(guard, "object catchall receiver");
    const changed = objectSchemaWithCatchall(
        schema,
        readGuardSchema(value, "object catchall schema")
    );
    return new ObjectGuard<TShape, TMode>(
        rebaseObjectValidationSchema(
            readGuardSchema(guard, "object catchall receiver"),
            schema,
            changed,
            "object catchall receiver"
        ),
        undefined,
        changed
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
    const schema = readObjectCapabilitySchema(guard, "object key-rule receiver");
    const selection = readObjectKeySelection(keys, schema, label);
    if (selection.length === 0) {
        throw new TypeError(`${label} must select at least one key`);
    }
    return new BaseGuard<InferObject<TShape>>({
        tag: SchemaTag.KeyedObject,
        inner: readGuardSchema(guard, "object key-rule receiver"),
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
    const schema = readObjectCapabilitySchema(guard, "keyof object");
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
