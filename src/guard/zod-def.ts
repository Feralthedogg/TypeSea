/**
 * @file zod-def.ts
 * @brief Zod migration metadata facade.
 * @details The facade is computed on demand and is never consumed by validation
 * hot paths. It exists so migration tooling can inspect TypeSea guards through
 * familiar Zod-style field names without receiving mutable engine state.
 */

import {
    ObjectModeTag,
    SchemaTag
} from "../kind/index.js";
import type { Schema } from "../schema/index.js";
import type { ZodDef } from "./types.js";

type GuardFactory = (schema: Schema) => unknown;

const CONSTRUCTOR_KEY = "constructor";

/**
 * @brief Zod first-party type-name constants.
 * @details Values follow the classic Zod `typeName` strings. TypeSea keeps this
 * table frozen because user code often treats it as a stable enum-like object.
 */
export const ZodFirstPartyTypeKind = Object.freeze({
    ZodUnknown: "ZodUnknown",
    ZodNever: "ZodNever",
    ZodString: "ZodString",
    ZodNumber: "ZodNumber",
    ZodBoolean: "ZodBoolean",
    ZodBigInt: "ZodBigInt",
    ZodSymbol: "ZodSymbol",
    ZodDate: "ZodDate",
    ZodLiteral: "ZodLiteral",
    ZodArray: "ZodArray",
    ZodObject: "ZodObject",
    ZodUnion: "ZodUnion",
    ZodDiscriminatedUnion: "ZodDiscriminatedUnion",
    ZodIntersection: "ZodIntersection",
    ZodOptional: "ZodOptional",
    ZodNullable: "ZodNullable",
    ZodBranded: "ZodBranded",
    ZodTuple: "ZodTuple",
    ZodRecord: "ZodRecord",
    ZodMap: "ZodMap",
    ZodSet: "ZodSet",
    ZodFile: "ZodFile",
    ZodCustom: "ZodCustom",
    ZodEffects: "ZodEffects",
    ZodReadonly: "ZodReadonly",
    ZodLazy: "ZodLazy",
    ZodEnum: "ZodEnum"
} as const);

export type ZodFirstPartyTypeKind =
    (typeof ZodFirstPartyTypeKind)[keyof typeof ZodFirstPartyTypeKind];

/**
 * @brief Build a frozen Zod-style definition object.
 * @param schema Guard schema that owns validation semantics.
 * @param source Public guard instance supplying facade fields such as shape or options.
 * @param guardFactory Factory used for child schema facade guards.
 * @returns Frozen metadata object for migration-only introspection.
 */
export function makeZodDef(
    schema: Schema,
    source: object,
    guardFactory: GuardFactory
): ZodDef {
    const visibleSchema = unwrapAnnotationSchema(schema);
    const enumOptions = readReadonlyArray(source, "options");
    const enumObject = readRecord(source, "enum");
    const typeName = enumOptions !== undefined && enumObject !== undefined
        ? ZodFirstPartyTypeKind.ZodEnum
        : zodTypeName(visibleSchema);
    const base: Record<string, unknown> = {
        schema: visibleSchema,
        type: zodTypeLabel(typeName),
        typeName
    };
    addSchemaSpecificFields(base, visibleSchema, source, guardFactory, typeName);
    return Object.freeze(base) as unknown as ZodDef;
}

/**
 * @brief Skip annotation wrappers that do not change the exposed Zod node kind.
 */
function unwrapAnnotationSchema(schema: Schema): Schema {
    let current = schema;
    while (current.tag === SchemaTag.Metadata || current.tag === SchemaTag.Message) {
        current = current.inner;
    }
    return current;
}

/**
 * @brief Attach child-facing fields used by common Zod ecosystem probes.
 */
function addSchemaSpecificFields(
    target: Record<string, unknown>,
    schema: Schema,
    source: object,
    guardFactory: GuardFactory,
    typeName: ZodFirstPartyTypeKind
): void {
    switch (schema.tag) {
        case SchemaTag.Object:
            target["shape"] = readShapeFactory(source);
            target["unknownKeys"] = readObjectMode(schema.mode);
            if (schema.catchall !== undefined) {
                target["catchall"] = guardFactory(schema.catchall);
            }
            return;
        case SchemaTag.Array:
            target["element"] = guardFactory(schema.item);
            return;
        case SchemaTag.Union:
        case SchemaTag.Xor:
            target["options"] = readReadonlyArray(source, "options") ??
                schema.options.map((option) => guardFactory(option));
            return;
        case SchemaTag.DiscriminatedUnion:
            target["discriminator"] = schema.key;
            target["options"] = schema.cases.map((entry) => guardFactory(entry.schema));
            return;
        case SchemaTag.Literal:
            target["value"] = schema.value;
            target["values"] = readOwnValue(source, "values") ?? Object.freeze([schema.value]);
            return;
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
        case SchemaTag.Nullable:
        case SchemaTag.Brand:
        case SchemaTag.Readonly:
            target["innerType"] = guardFactory(schema.inner);
            return;
        case SchemaTag.Tuple:
            target["items"] = Object.freeze(schema.items.map((item) => guardFactory(item)));
            if (schema.rest !== undefined) {
                target["rest"] = guardFactory(schema.rest);
            }
            return;
        case SchemaTag.Record:
            if (schema.key !== undefined) {
                target["keyType"] = guardFactory(schema.key);
            }
            target["valueType"] = guardFactory(schema.value);
            return;
        case SchemaTag.Map:
            target["keyType"] = guardFactory(schema.key);
            target["valueType"] = guardFactory(schema.value);
            return;
        case SchemaTag.Set:
            target["valueType"] = guardFactory(schema.item);
            return;
        case SchemaTag.Intersection:
            target["left"] = guardFactory(schema.left);
            target["right"] = guardFactory(schema.right);
            return;
        case SchemaTag.InstanceOf:
            target[CONSTRUCTOR_KEY] = schema.constructor;
            target["className"] = schema.name;
            return;
        case SchemaTag.Property:
            target["innerType"] = guardFactory(schema.base);
            target["propertyKey"] = schema.key;
            target["valueType"] = guardFactory(schema.value);
            return;
        case SchemaTag.KeyedObject:
        case SchemaTag.PropertyCount:
        case SchemaTag.PropertyNames:
        case SchemaTag.PatternProperties:
        case SchemaTag.Refine:
            target["innerType"] = guardFactory(schema.inner);
            target["effect"] = typeName;
            return;
        case SchemaTag.Lazy:
            target["getter"] = schema.get;
            return;
        default:
            return;
    }
}

/**
 * @brief Map TypeSea schema tags to Zod-style node names.
 */
function zodTypeName(schema: Schema): ZodFirstPartyTypeKind {
    switch (schema.tag) {
        case SchemaTag.Unknown:
            return ZodFirstPartyTypeKind.ZodUnknown;
        case SchemaTag.Never:
            return ZodFirstPartyTypeKind.ZodNever;
        case SchemaTag.String:
            return ZodFirstPartyTypeKind.ZodString;
        case SchemaTag.Number:
            return ZodFirstPartyTypeKind.ZodNumber;
        case SchemaTag.Boolean:
            return ZodFirstPartyTypeKind.ZodBoolean;
        case SchemaTag.BigInt:
            return ZodFirstPartyTypeKind.ZodBigInt;
        case SchemaTag.Symbol:
            return ZodFirstPartyTypeKind.ZodSymbol;
        case SchemaTag.Date:
            return ZodFirstPartyTypeKind.ZodDate;
        case SchemaTag.Literal:
            return ZodFirstPartyTypeKind.ZodLiteral;
        case SchemaTag.Array:
            return ZodFirstPartyTypeKind.ZodArray;
        case SchemaTag.Object:
            return ZodFirstPartyTypeKind.ZodObject;
        case SchemaTag.Union:
        case SchemaTag.Xor:
            return ZodFirstPartyTypeKind.ZodUnion;
        case SchemaTag.DiscriminatedUnion:
            return ZodFirstPartyTypeKind.ZodDiscriminatedUnion;
        case SchemaTag.Intersection:
            return ZodFirstPartyTypeKind.ZodIntersection;
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
            return ZodFirstPartyTypeKind.ZodOptional;
        case SchemaTag.Nullable:
            return ZodFirstPartyTypeKind.ZodNullable;
        case SchemaTag.Brand:
            return ZodFirstPartyTypeKind.ZodBranded;
        case SchemaTag.Tuple:
            return ZodFirstPartyTypeKind.ZodTuple;
        case SchemaTag.Record:
            return ZodFirstPartyTypeKind.ZodRecord;
        case SchemaTag.Map:
            return ZodFirstPartyTypeKind.ZodMap;
        case SchemaTag.Set:
            return ZodFirstPartyTypeKind.ZodSet;
        case SchemaTag.File:
            return ZodFirstPartyTypeKind.ZodFile;
        case SchemaTag.InstanceOf:
            return ZodFirstPartyTypeKind.ZodCustom;
        case SchemaTag.Readonly:
            return ZodFirstPartyTypeKind.ZodReadonly;
        case SchemaTag.Lazy:
            return ZodFirstPartyTypeKind.ZodLazy;
        default:
            return ZodFirstPartyTypeKind.ZodEffects;
    }
}

/**
 * @brief Map Zod node names to compact Zod 4-style `def.type` labels.
 */
function zodTypeLabel(typeName: ZodFirstPartyTypeKind): string {
    switch (typeName) {
        case ZodFirstPartyTypeKind.ZodUnknown:
            return "unknown";
        case ZodFirstPartyTypeKind.ZodNever:
            return "never";
        case ZodFirstPartyTypeKind.ZodString:
            return "string";
        case ZodFirstPartyTypeKind.ZodNumber:
            return "number";
        case ZodFirstPartyTypeKind.ZodBoolean:
            return "boolean";
        case ZodFirstPartyTypeKind.ZodBigInt:
            return "bigint";
        case ZodFirstPartyTypeKind.ZodSymbol:
            return "symbol";
        case ZodFirstPartyTypeKind.ZodDate:
            return "date";
        case ZodFirstPartyTypeKind.ZodLiteral:
            return "literal";
        case ZodFirstPartyTypeKind.ZodArray:
            return "array";
        case ZodFirstPartyTypeKind.ZodObject:
            return "object";
        case ZodFirstPartyTypeKind.ZodUnion:
            return "union";
        case ZodFirstPartyTypeKind.ZodDiscriminatedUnion:
            return "discriminatedUnion";
        case ZodFirstPartyTypeKind.ZodIntersection:
            return "intersection";
        case ZodFirstPartyTypeKind.ZodOptional:
            return "optional";
        case ZodFirstPartyTypeKind.ZodNullable:
            return "nullable";
        case ZodFirstPartyTypeKind.ZodBranded:
            return "branded";
        case ZodFirstPartyTypeKind.ZodTuple:
            return "tuple";
        case ZodFirstPartyTypeKind.ZodRecord:
            return "record";
        case ZodFirstPartyTypeKind.ZodMap:
            return "map";
        case ZodFirstPartyTypeKind.ZodSet:
            return "set";
        case ZodFirstPartyTypeKind.ZodFile:
            return "file";
        case ZodFirstPartyTypeKind.ZodCustom:
            return "custom";
        case ZodFirstPartyTypeKind.ZodEffects:
            return "effects";
        case ZodFirstPartyTypeKind.ZodReadonly:
            return "readonly";
        case ZodFirstPartyTypeKind.ZodLazy:
            return "lazy";
        case ZodFirstPartyTypeKind.ZodEnum:
            return "enum";
    }
}

/**
 * @brief Translate TypeSea object modes into Zod unknown-key labels.
 */
function readObjectMode(mode: number): string {
    switch (mode) {
        case ObjectModeTag.Strict:
            return "strict";
        case ObjectModeTag.Strip:
            return "strip";
        default:
            return "passthrough";
    }
}

/**
 * @brief Return an own data property without invoking user accessors.
 */
function readOwnValue(source: object, key: string): unknown {
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (
        descriptor === undefined ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
        return undefined;
    }
    return descriptor.value;
}

/**
 * @brief Read an own array property without trusting prototype state.
 */
function readReadonlyArray(source: object, key: string): readonly unknown[] | undefined {
    const value = readOwnValue(source, key);
    return Array.isArray(value) ? Object.freeze(value.slice()) : undefined;
}

/**
 * @brief Read an own object property without executing accessors.
 */
function readRecord(source: object, key: string): Readonly<Record<string, unknown>> | undefined {
    const value = readOwnValue(source, key);
    return isRecord(value) ? value : undefined;
}

/**
 * @brief Build the Zod v3-compatible shape thunk when a guard exposes a shape.
 */
function readShapeFactory(
    source: object
): (() => Readonly<Record<string, unknown>>) | undefined {
    const shape = readRecord(source, "shape");
    return shape === undefined
        ? undefined
        : (): Readonly<Record<string, unknown>> => shape;
}

/**
 * @brief Check for ordinary non-array object records.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
