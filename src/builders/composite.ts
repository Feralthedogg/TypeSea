/**
 * @file composite.ts
 * @brief Composite guard builders.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */

import {
    NumberCheckTag,
    PresenceTag,
    SchemaTag,
    StringCheckTag
} from "../kind/index.js";
import {
    ArrayGuard,
    BaseGuard,
    MapGuard,
    SetGuard,
    StringGuard,
    TupleGuard,
    UnionGuard,
    XorGuard,
    type Guard,
    type Infer,
    type Presence
} from "../guard/index.js";
import {
    decodeArraySource,
    decodeMapSources,
    decodeRecordSource,
    decodeSetSource,
    decodeTupleSources,
    isDecoderValue,
    type BaseCodec,
    type BaseDecoder,
    type DecodeSource,
    type EncodeSource,
    type InferDecodedTuple,
    type InferDecodedTupleWithRest,
    type InferDecoder,
    type InferDecodedMap,
    type InferDecodedLooseRecord,
    type InferDecodedRecord,
    type InferDecodedRecordValue,
    type InferEncodedSource,
    type InferEncodedMap,
    type InferEncodedLooseRecord,
    type InferEncodedRecord,
    type InferEncodedRecordValue,
    type InferEncodedTuple,
    type InferEncodedTupleWithRest,
    type TupleCodecShape,
    type TupleDecodeShape
} from "../decoder/index.js";
import type {
    DiscriminatedUnionCase,
    LiteralValue,
    Schema
} from "../schema/index.js";
import { normalizeUnionSchema } from "../schema/index.js";
import { closedStringRecordKeys } from "../schema/record-keys.js";
import { isRecord, readGuardSchema } from "../internal/index.js";
import type {
    DiscriminatedUnionCases,
    InferTuple,
    InferTupleWithRest,
    TupleShape,
    UnionInput
} from "./types.js";

export type TemplateLiteralPart =
    | string
    | number
    | bigint
    | boolean
    | null
    | undefined
    | Guard<unknown, Presence>;

type TemplateLiteralPrimitive =
    | string
    | number
    | bigint
    | boolean
    | null
    | undefined;

type StringifiedTemplatePart<TPart> =
    TPart extends Guard<unknown, Presence>
        ? StringifiedTemplatePrimitive<Extract<Infer<TPart>, TemplateLiteralPrimitive>>
        : StringifiedTemplatePrimitive<Extract<TPart, TemplateLiteralPrimitive>>;

type StringifiedTemplatePrimitive<TValue> =
    TValue extends string
        ? TValue
        : TValue extends number
            ? `${TValue}`
            : TValue extends bigint
                ? `${TValue}`
                : TValue extends boolean
                    ? `${TValue}`
                    : TValue extends null
                        ? "null"
                        : TValue extends undefined
                            ? "undefined"
                            : never;

type InferTemplateLiteral<TParts extends readonly TemplateLiteralPart[]> =
    number extends TParts["length"]
        ? string
        : TParts extends readonly []
            ? ""
            : TParts extends readonly [infer THead, ...infer TTail]
                ? TTail extends readonly TemplateLiteralPart[]
                    ? `${StringifiedTemplatePart<THead>}${InferTemplateLiteral<TTail>}`
                    : string
                : string;

type InferRecordKey<TGuard extends Guard<unknown, Presence>> =
    Extract<Infer<TGuard>, string | number>;

type InferPartialRecord<
    TKey extends Guard<unknown, Presence>,
    TValue extends Guard<unknown, Presence>
> = Readonly<Partial<Record<InferRecordKey<TKey>, Infer<TValue>>>>;

type InferLooseRecord<
    TKey extends Guard<unknown, Presence>,
    TValue extends Guard<unknown, Presence>
> = string extends InferRecordKey<TKey>
    ? Readonly<Record<string, Infer<TValue>>>
    : Readonly<
        Partial<Record<InferRecordKey<TKey>, Infer<TValue>>> &
        Record<string, unknown>
    >;

interface DiscriminantLiteralRead {
    readonly value: LiteralValue;
}

/**
 * @brief Build an array guard.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 * @param item Guard used for each logical array slot.
 * @returns Fresh array guard.
 */
export function array<TGuard extends Guard<unknown, Presence>>(
    item: TGuard
): ArrayGuard<Infer<TGuard>>;

export function array<TItem extends EncodeSource>(
    item: TItem
): BaseCodec<readonly InferEncodedSource<TItem>[], readonly InferDecoder<TItem>[]>;

export function array<TItem extends DecodeSource>(
    item: TItem
): BaseDecoder<readonly InferDecoder<TItem>[]>;

export function array(
    item: DecodeSource
): ArrayGuard<unknown> | BaseCodec<readonly unknown[], readonly unknown[]> | BaseDecoder<readonly unknown[]> {
    if (isDecoderValue(item)) {
        return decodeArraySource(item);
    }
    return new ArrayGuard<unknown>({
        tag: SchemaTag.Array,
        item: readGuardSchema(item, "array item"),
        checks: []
    });
}

/**
 * @brief Build a fixed-length tuple guard.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 * @param shape Ordered guard list for tuple indexes.
 * @returns Fresh tuple guard preserving item order.
 * @throws TypeError when shape is not an array-like tuple input.
 */
export function tuple<const TShape extends TupleShape>(
    shape: TShape
): TupleGuard<InferTuple<TShape>, "required", InferTuple<TShape>>;

export function tuple<const TShape extends TupleCodecShape>(
    shape: TShape
): BaseCodec<InferEncodedTuple<TShape>, InferDecodedTuple<TShape>>;

export function tuple<const TShape extends TupleDecodeShape>(
    shape: TShape
): BaseDecoder<InferDecodedTuple<TShape>>;

export function tuple<
    const TShape extends TupleShape,
    TRest extends Guard<unknown, Presence>
>(
    shape: TShape,
    rest: TRest
): TupleGuard<InferTupleWithRest<TShape, TRest>, "required", InferTuple<TShape>>;

export function tuple<
    const TShape extends TupleCodecShape,
    TRest extends EncodeSource
>(
    shape: TShape,
    rest: TRest
): BaseCodec<
    InferEncodedTupleWithRest<TShape, TRest>,
    InferDecodedTupleWithRest<TShape, TRest>
>;

export function tuple<
    const TShape extends TupleDecodeShape,
    TRest extends DecodeSource
>(
    shape: TShape,
    rest: TRest
): BaseDecoder<InferDecodedTupleWithRest<TShape, TRest>>;

export function tuple(
    shape: TupleDecodeShape,
    rest?: DecodeSource
): TupleGuard<readonly unknown[]> | BaseCodec<readonly unknown[], readonly unknown[]> | BaseDecoder<readonly unknown[]> {
    const rawShape: unknown = shape;
    if (!Array.isArray(rawShape)) {
        throw new TypeError("tuple shape must be an array");
    }
    if (tupleShapeHasDecoder(shape) || (rest !== undefined && isDecoderValue(rest))) {
        return rest === undefined
            ? decodeTupleSources(shape)
            : decodeTupleSources(shape, rest);
    }
    /*
     * Tuple indexes are read in order and stored as schemas, not guard objects,
     * so later validation cannot observe mutation on user-held guard wrappers.
     */
    const items = new Array<Schema>(shape.length);
    for (let index = 0; index < shape.length; index += 1) {
        const guard = shape[index];
        items[index] = readGuardSchema(guard, `tuple item ${String(index)}`);
    }
    return new TupleGuard<readonly unknown[]>({
        tag: SchemaTag.Tuple,
        items,
        rest: rest === undefined
            ? undefined
            : readGuardSchema(rest, "tuple rest")
    });
}

/**
 * @brief Detect decoder-aware tuple shapes.
 * @param shape Ordered tuple sources.
 * @returns True when at least one fixed slot is a TypeSea decoder or codec.
 */
function tupleShapeHasDecoder(shape: TupleDecodeShape): boolean {
    for (let index = 0; index < shape.length; index += 1) {
        const source = shape[index];
        if (source !== undefined && isDecoderValue(source)) {
            return true;
        }
    }
    return false;
}

/**
 * @brief Build a template-literal string guard.
 * @param parts Ordered literal fragments and scalar guards.
 * @returns String guard backed by one anchored regular expression.
 * @throws TypeError when a part cannot be represented as a regular language.
 */
export function templateLiteral<const TParts extends readonly TemplateLiteralPart[]>(
    parts: TParts
): StringGuard<"required", InferTemplateLiteral<TParts>> {
    const rawParts: unknown = parts;
    if (!Array.isArray(rawParts)) {
        throw new TypeError("templateLiteral parts must be an array");
    }
    const checkedParts = rawParts as readonly TemplateLiteralPart[];
    const patternParts = new Array<string>(checkedParts.length);
    for (let index = 0; index < checkedParts.length; index += 1) {
        patternParts[index] = templatePartPattern(
            checkedParts[index],
            `templateLiteral part ${String(index)}`
        );
    }
    return new StringGuard<"required", InferTemplateLiteral<TParts>>({
        tag: SchemaTag.String,
        checks: [
            {
                tag: StringCheckTag.Regex,
                regex: new RegExp(`^${patternParts.join("")}$`),
                name: "template_literal"
            }
        ]
    });
}

/**
 * @brief Build a string-keyed record guard.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 * @param value Guard used for each enumerable own record value.
 * @returns Fresh record guard.
 */
export function record<TValue extends Guard<unknown, Presence>>(
    value: TValue
): BaseGuard<Readonly<Record<string, Infer<TValue>>>>;

export function record<TValue extends EncodeSource>(
    value: TValue
): BaseCodec<InferEncodedRecordValue<TValue>, InferDecodedRecordValue<TValue>>;

export function record<TValue extends DecodeSource>(
    value: TValue
): BaseDecoder<InferDecodedRecordValue<TValue>>;

export function record<
    TKey extends Guard<unknown, Presence>,
    TValue extends Guard<unknown, Presence>
>(
    key: TKey,
    value: TValue
): BaseGuard<Readonly<Record<InferRecordKey<TKey>, Infer<TValue>>>>;

export function record<
    TKey extends Guard<unknown, Presence>,
    TValue extends EncodeSource
>(
    key: TKey,
    value: TValue
): BaseCodec<InferEncodedRecord<TKey, TValue>, InferDecodedRecord<TKey, TValue>>;

export function record<
    TKey extends Guard<unknown, Presence>,
    TValue extends DecodeSource
>(
    key: TKey,
    value: TValue
): BaseDecoder<InferDecodedRecord<TKey, TValue>>;

export function record(
    keyOrValue: DecodeSource,
    value?: DecodeSource
): BaseGuard<Readonly<Record<string, unknown>>> |
    BaseCodec<Readonly<Record<string, unknown>>, Readonly<Record<string, unknown>>> |
    BaseDecoder<Readonly<Record<string, unknown>>> {
    if (value === undefined && isDecoderValue(keyOrValue)) {
        return decodeRecordSource(keyOrValue);
    }
    if (value !== undefined && isDecoderValue(value)) {
        return decodeRecordSource(keyOrValue, value, false);
    }
    const keyOrValueGuard = keyOrValue as Guard<unknown, Presence>;
    const valueGuard = value as Guard<unknown, Presence> | undefined;
    const keySchema = value === undefined
        ? undefined
        : readGuardSchema(keyOrValueGuard, "record key");
    const valueSchema = readGuardSchema(valueGuard ?? keyOrValueGuard, "record value");
    const requiredKeys = keySchema === undefined
        ? undefined
        : closedStringRecordKeys(keySchema);
    return new BaseGuard<Readonly<Record<string, unknown>>>({
        tag: SchemaTag.Record,
        key: keySchema,
        value: valueSchema,
        loose: false,
        requiredKeys
    });
}

/**
 * @brief Build a record guard that validates only present keys.
 * @param key Guard applied to each enumerable own key.
 * @param value Guard applied to each enumerable own value.
 * @returns Fresh record guard with partial key-set semantics.
 * @details This mirrors Zod's partialRecord entry point. Unlike `record()`,
 * closed literal key domains are not required exhaustively.
 */
export function partialRecord<
    TKey extends Guard<unknown, Presence>,
    TValue extends Guard<unknown, Presence>
>(
    key: TKey,
    value: TValue
): BaseGuard<InferPartialRecord<TKey, TValue>>;

export function partialRecord<
    TKey extends Guard<unknown, Presence>,
    TValue extends EncodeSource
>(
    key: TKey,
    value: TValue
): BaseCodec<InferEncodedRecord<TKey, TValue>, InferDecodedRecord<TKey, TValue>>;

export function partialRecord<
    TKey extends Guard<unknown, Presence>,
    TValue extends DecodeSource
>(
    key: TKey,
    value: TValue
): BaseDecoder<InferDecodedRecord<TKey, TValue>>;

export function partialRecord(
    key: Guard<unknown, Presence>,
    value: DecodeSource
): BaseGuard<Readonly<Record<string, unknown>>> |
    BaseCodec<Readonly<Record<string, unknown>>, Readonly<Record<string, unknown>>> |
    BaseDecoder<Readonly<Record<string, unknown>>> {
    if (isDecoderValue(value)) {
        return decodeRecordSource(key, value, false);
    }
    return new BaseGuard<Readonly<Record<string, unknown>>>({
        tag: SchemaTag.Record,
        key: readGuardSchema(key, "partialRecord key"),
        value: readGuardSchema(value, "partialRecord value"),
        loose: false,
        requiredKeys: undefined
    });
}

/**
 * @brief Build a record that ignores keys outside the key schema.
 * @param key Guard applied to enumerable own string keys.
 * @param value Guard applied only to keys accepted by key.
 * @returns Fresh loose record guard.
 * @details Non-matching keys pass through unvalidated, matching Zod's
 * looseRecord semantics while preserving descriptor-safe reads for matching
 * values.
 */
export function looseRecord<
    TKey extends Guard<unknown, Presence>,
    TValue extends Guard<unknown, Presence>
>(
    key: TKey,
    value: TValue
): BaseGuard<InferLooseRecord<TKey, TValue>>;

export function looseRecord<
    TKey extends Guard<unknown, Presence>,
    TValue extends EncodeSource
>(
    key: TKey,
    value: TValue
): BaseCodec<InferEncodedLooseRecord<TKey, TValue>, InferDecodedLooseRecord<TKey, TValue>>;

export function looseRecord<
    TKey extends Guard<unknown, Presence>,
    TValue extends DecodeSource
>(
    key: TKey,
    value: TValue
): BaseDecoder<InferDecodedLooseRecord<TKey, TValue>>;

export function looseRecord(
    key: Guard<unknown, Presence>,
    value: DecodeSource
): BaseGuard<Readonly<Record<string, unknown>>> |
    BaseCodec<Readonly<Record<string, unknown>>, Readonly<Record<string, unknown>>> |
    BaseDecoder<Readonly<Record<string, unknown>>> {
    if (isDecoderValue(value)) {
        return decodeRecordSource(key, value, true);
    }
    return new BaseGuard<Readonly<Record<string, unknown>>>({
        tag: SchemaTag.Record,
        key: readGuardSchema(key, "looseRecord key"),
        value: readGuardSchema(value, "looseRecord value"),
        loose: true,
        requiredKeys: undefined
    });
}

export function map<
    TKey extends Guard<unknown, Presence>,
    TValue extends Guard<unknown, Presence>
>(
    key: TKey,
    value: TValue
): MapGuard<Infer<TKey>, Infer<TValue>>;

export function map<TKey extends EncodeSource, TValue extends EncodeSource>(
    key: TKey,
    value: TValue
): BaseCodec<InferEncodedMap<TKey, TValue>, InferDecodedMap<TKey, TValue>>;

export function map<TKey extends DecodeSource, TValue extends DecodeSource>(
    key: TKey,
    value: TValue
): BaseDecoder<InferDecodedMap<TKey, TValue>>;

export function map(
    key: DecodeSource,
    value: DecodeSource
): MapGuard<unknown, unknown> |
    BaseCodec<ReadonlyMap<unknown, unknown>, ReadonlyMap<unknown, unknown>> |
    BaseDecoder<ReadonlyMap<unknown, unknown>> {
    if (isDecoderValue(key) || isDecoderValue(value)) {
        return decodeMapSources(key, value);
    }
    return new MapGuard<unknown, unknown>({
        tag: SchemaTag.Map,
        key: readGuardSchema(key, "map key"),
        value: readGuardSchema(value, "map value"),
        checks: []
    });
}

export function set<TItem extends Guard<unknown, Presence>>(
    item: TItem
): SetGuard<Infer<TItem>>;

export function set<TItem extends EncodeSource>(
    item: TItem
): BaseCodec<ReadonlySet<InferEncodedSource<TItem>>, ReadonlySet<InferDecoder<TItem>>>;

export function set<TItem extends DecodeSource>(
    item: TItem
): BaseDecoder<ReadonlySet<InferDecoder<TItem>>>;

export function set(
    item: DecodeSource
): SetGuard<unknown> | BaseCodec<ReadonlySet<unknown>, ReadonlySet<unknown>> | BaseDecoder<ReadonlySet<unknown>> {
    if (isDecoderValue(item)) {
        return decodeSetSource(item);
    }
    return new SetGuard<unknown>({
        tag: SchemaTag.Set,
        item: readGuardSchema(item, "set item"),
        checks: []
    });
}

/**
 * @brief Build a union guard from one or more guards.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 * @param guards Non-empty guard list.
 * @returns Fresh union guard.
 * @throws TypeError when called without guards.
 */
export function union<const TGuards extends UnionInput>(
    ...guards: TGuards
): UnionGuard<TGuards> {
    if (guards.length === 0) {
        throw new TypeError("union requires at least one guard");
    }
    /*
     * Preserve option order. Diagnostics and generated dispatch use this order
     * when probing branches and constructing graph children.
     */
    const options = new Array<Schema>(guards.length);
    for (let index = 0; index < guards.length; index += 1) {
        const guard = guards[index];
        options[index] = readGuardSchema(guard, `union option ${String(index)}`);
    }
    return new UnionGuard<TGuards>(normalizeUnionSchema(options), guards);
}

/**
 * @brief Build an exclusive union guard.
 * @details Exactly one branch must accept the runtime value. Unlike union(),
 * overlapping branches are rejected instead of accepting the first match.
 * @param guards Non-empty guard list.
 * @returns Fresh guard accepting values matched by exactly one branch.
 * @throws TypeError when called without guards.
 */
export function xor<const TGuards extends UnionInput>(
    ...guards: TGuards
): XorGuard<TGuards> {
    if (guards.length === 0) {
        throw new TypeError("xor requires at least one guard");
    }
    const options = new Array<Schema>(guards.length);
    for (let index = 0; index < guards.length; index += 1) {
        const guard = guards[index];
        options[index] = readGuardSchema(guard, `xor option ${String(index)}`);
    }
    return new XorGuard<TGuards>(
        {
            tag: SchemaTag.Xor,
            options
        },
        guards
    );
}

/**
 * @brief Build an intersection guard.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 * @param left Left-hand guard.
 * @param right Right-hand guard.
 * @returns Fresh guard requiring both schemas to accept the value.
 */
export function intersect<
    TLeft extends Guard<unknown, Presence>,
    TRight extends Guard<unknown, Presence>
>(
    left: TLeft,
    right: TRight
): BaseGuard<Infer<TLeft> & Infer<TRight>> {
    return new BaseGuard<Infer<TLeft> & Infer<TRight>>({
        tag: SchemaTag.Intersection,
        left: readGuardSchema(left, "intersection left"),
        right: readGuardSchema(right, "intersection right")
    });
}

/**
 * @brief Build a union whose branch can be selected by one literal property.
 * @details This shape lowers to a dispatch table instead of a linear union
 * scan, which is the fast path object unions should use.
 * @param key Discriminant object key.
 * @param cases Record from discriminant literal to branch guard.
 * @returns Fresh discriminated-union guard.
 * @throws TypeError when cases are empty or branch schemas do not require the tag.
 */
export function discriminatedUnion<
    const TKey extends string,
    const TCases extends Readonly<Record<string, Guard<unknown, Presence>>>
>(
    key: TKey,
    cases: TCases & DiscriminatedUnionCases<TKey, TCases>
): BaseGuard<Infer<TCases[keyof TCases]>>;

export function discriminatedUnion<
    const TOptions extends UnionInput
>(
    key: string,
    cases: TOptions
): BaseGuard<Infer<TOptions[number]>>;

export function discriminatedUnion(
    key: string,
    cases: Readonly<Record<string, Guard<unknown, Presence>>> |
        readonly [Guard<unknown, Presence>, ...Guard<unknown, Presence>[]]
): BaseGuard<unknown> {
    if (typeof key !== "string") {
        throw new TypeError("discriminated union key must be a string");
    }
    if (Array.isArray(cases)) {
        return discriminatedUnionFromArray(key, cases);
    }
    if (!isRecord(cases)) {
        throw new TypeError("discriminated union cases must be an object");
    }
    const entries = Object.entries(cases);
    if (entries.length === 0) {
        throw new TypeError("discriminated union requires at least one case");
    }
    /*
     * Object.entries defines the dispatch order. The literal string is taken
     * from the case key and must be required by the branch schema below.
     */
    const unionCases = new Array<DiscriminatedUnionCase>(entries.length);
    for (let index = 0; index < entries.length; index += 1) {
        const pair = entries[index];
        if (pair === undefined) {
            continue;
        }
        const caseKey = pair[0];
        const guard = pair[1];
        unionCases[index] = {
            literal: caseKey,
            schema: readDiscriminatedUnionCaseSchema(guard, key, caseKey)
        };
    }
    return new BaseGuard<unknown>({
        tag: SchemaTag.DiscriminatedUnion,
        key,
        cases: unionCases
    });
}

/**
 * @brief Build a discriminated union from Zod-style case arrays.
 * @param key Discriminant object key.
 * @param cases Ordered branch guards.
 * @returns Fresh discriminated-union guard.
 */
function discriminatedUnionFromArray(
    key: string,
    cases: readonly Guard<unknown, Presence>[]
): BaseGuard<unknown> {
    if (cases.length === 0) {
        throw new TypeError("discriminated union requires at least one case");
    }
    const seen: LiteralValue[] = [];
    const unionCases = new Array<DiscriminatedUnionCase>(cases.length);
    for (let index = 0; index < cases.length; index += 1) {
        const guard = cases[index];
        const schema = readGuardSchema(guard, `case ${String(index)}`);
        const literal = readDiscriminantLiteral(schema, key, `case ${String(index)}`).value;
        if (literalVectorIncludes(seen, literal)) {
            throw new TypeError(`case ${String(literal)} is duplicated`);
        }
        seen.push(literal);
        unionCases[index] = {
            literal,
            schema
        };
    }
    return new BaseGuard<unknown>({
        tag: SchemaTag.DiscriminatedUnion,
        key,
        cases: unionCases
    });
}

/**
 * @brief Extract and validate one discriminated-union branch schema.
 * @details A branch is accepted only when its object schema itself proves the
 * discriminant literal. Without that proof, dispatch by table key could select
 * a branch whose validator later accepts a different tag shape.
 * @param guard Branch guard from the cases table.
 * @param key Discriminant key shared by all cases.
 * @param literal Literal value assigned to this case.
 * @returns Branch schema after discriminant proof.
 * @throws TypeError when the branch does not require its literal tag.
 */
function readDiscriminatedUnionCaseSchema(
    guard: Guard<unknown, Presence> | undefined,
    key: string,
    literal: LiteralValue
): Schema {
    const schema = readGuardSchema(guard, `case ${String(literal)}`);
    if (!caseRequiresDiscriminant(schema, key, literal)) {
        throw new TypeError(
            `case ${String(literal)} must require literal discriminant ${key}`
        );
    }
    return schema;
}

/**
 * @brief Read a required literal discriminant from one branch schema.
 * @param schema Branch schema to inspect.
 * @param key Discriminant key.
 * @param label Human-readable case label for diagnostics.
 * @returns Literal value required by the branch.
 */
function readDiscriminantLiteral(
    schema: Schema,
    key: string,
    label: string
): DiscriminantLiteralRead {
    const objectSchema = unwrapCaseObjectSchema(schema);
    if (objectSchema === undefined) {
        throw new TypeError(`${label} must require literal discriminant ${key}`);
    }
    for (let index = 0; index < objectSchema.entries.length; index += 1) {
        const entry = objectSchema.entries[index];
        if (entry?.key !== key) {
            continue;
        }
        if (entry.presence !== PresenceTag.Required) {
            break;
        }
        const literal = readSchemaLiteral(entry.schema);
        if (literal !== undefined) {
            return literal;
        }
        break;
    }
    throw new TypeError(`${label} must require literal discriminant ${key}`);
}

/**
 * @brief Read a transparent literal schema.
 * @param schema Schema attached to a discriminant field.
 * @returns Literal value, or undefined for broader schemas.
 */
function readSchemaLiteral(schema: Schema): DiscriminantLiteralRead | undefined {
    switch (schema.tag) {
        case SchemaTag.Literal:
            return {
                value: schema.value
            };
        case SchemaTag.Intersection:
            return readSchemaLiteral(schema.left) ?? readSchemaLiteral(schema.right);
        case SchemaTag.Brand:
        case SchemaTag.Metadata:
        case SchemaTag.Message:
        case SchemaTag.KeyedObject:
        case SchemaTag.PropertyCount:
        case SchemaTag.PropertyNames:
        case SchemaTag.PatternProperties:
        case SchemaTag.Refine:
            return readSchemaLiteral(schema.inner);
        default:
            return undefined;
    }
}

/**
 * @brief Convert one template literal part to a regex fragment.
 */
function templatePartPattern(value: TemplateLiteralPart | undefined, label: string): string {
    if (value === undefined) {
        return "undefined";
    }
    if (value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "bigint" ||
        typeof value === "boolean") {
        return escapeTemplatePattern(String(value));
    }
    return schemaTemplatePattern(readGuardSchema(value, label), label);
}

/**
 * @brief Convert a template-compatible schema to a regex fragment.
 */
function schemaTemplatePattern(schema: Schema, label: string): string {
    switch (schema.tag) {
        case SchemaTag.String:
            return stringTemplatePattern(schema);
        case SchemaTag.Number:
            return numberTemplatePattern(schema);
        case SchemaTag.BigInt:
            return "-?(?:0|[1-9]\\d*)";
        case SchemaTag.Boolean:
            return "(?:true|false)";
        case SchemaTag.Literal:
            return escapeTemplatePattern(String(schema.value));
        case SchemaTag.Union:
            return templateUnionPattern(schema.options, label);
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
            return `(?:undefined|${schemaTemplatePattern(schema.inner, label)})`;
        case SchemaTag.Nullable:
            return `(?:null|${schemaTemplatePattern(schema.inner, label)})`;
        case SchemaTag.Brand:
        case SchemaTag.Metadata:
        case SchemaTag.Message:
        case SchemaTag.KeyedObject:
        case SchemaTag.PropertyCount:
        case SchemaTag.PropertyNames:
        case SchemaTag.PatternProperties:
            return schemaTemplatePattern(schema.inner, label);
        case SchemaTag.Never:
            return "(?!)";
        default:
            throw new TypeError(`${label} is not template-literal compatible`);
    }
}

/**
 * @brief Convert string length checks to a template fragment.
 * @details JavaScript string length is UTF-16 code-unit based, so the fragment
 * uses a universal code-unit class and the final RegExp is emitted without the
 * unicode flag.
 */
function stringTemplatePattern(schema: Extract<Schema, { readonly tag: typeof SchemaTag.String }>): string {
    let min = 0;
    let max: number | undefined;
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        switch (check?.tag) {
            case StringCheckTag.Min:
                min = Math.max(min, check.value);
                break;
            case StringCheckTag.Max:
                max = max === undefined ? check.value : Math.min(max, check.value);
                break;
            default:
                break;
        }
    }
    if (max !== undefined && min > max) {
        return "(?!)";
    }
    return `[\\s\\S]${templateLengthQuantifier(min, max)}`;
}

/**
 * @brief Build a compact quantifier for a template string fragment.
 */
function templateLengthQuantifier(min: number, max: number | undefined): string {
    if (min === 0 && max === undefined) {
        return "*";
    }
    if (max === undefined) {
        return `{${String(min)},}`;
    }
    if (min === max) {
        return `{${String(min)}}`;
    }
    return `{${String(min)},${String(max)}}`;
}

/**
 * @brief Convert number schema checks to the tightest supported template
 * pattern.
 */
function numberTemplatePattern(schema: Extract<Schema, { readonly tag: typeof SchemaTag.Number }>): string {
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        if (checks[index]?.tag === NumberCheckTag.Integer) {
            return "-?(?:0|[1-9]\\d*)";
        }
    }
    return "-?(?:0|[1-9]\\d*)(?:\\.\\d+)?(?:[eE][+-]?\\d+)?";
}

/**
 * @brief Convert template-compatible union options to one alternation.
 */
function templateUnionPattern(options: readonly Schema[], label: string): string {
    const parts = new Array<string>(options.length);
    for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        if (option === undefined) {
            throw new TypeError(`${label} contains a sparse union option`);
        }
        parts[index] = schemaTemplatePattern(option, label);
    }
    return `(?:${parts.join("|")})`;
}

/**
 * @brief Escape a literal string for inclusion in a regex source.
 */
function escapeTemplatePattern(value: string): string {
    return value.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&");
}

/**
 * @brief Prove that a branch structurally requires the requested tag literal.
 * @details Dispatch tables are only sound when accepting a branch implies that
 * the discriminant key is present and equal to its table literal. The proof is
 * intentionally structural and refuses schemas whose tag requirement is hidden
 * behind runtime-only logic.
 * @param schema Branch schema to inspect.
 * @param key Discriminant key.
 * @param literal Required literal value.
 * @returns True when the branch structurally requires `key: literal`.
 */
function caseRequiresDiscriminant(
    schema: Schema,
    key: string,
    literal: LiteralValue
): boolean {
    const objectSchema = unwrapCaseObjectSchema(schema);
    if (objectSchema === undefined) {
        return false;
    }
    const entries = objectSchema.entries;
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry?.key !== key) {
            continue;
        }
        return entry.presence === PresenceTag.Required &&
            schemaRequiresLiteral(entry.schema, literal);
    }
    return false;
}

/**
 * @brief Find the object schema that can prove a discriminant requirement.
 * @details Transparent wrappers do not change object shape, and either side of
 * an intersection may supply the tag field. Other schema forms cannot provide
 * the required object-field proof.
 * @param schema Branch schema possibly wrapped by brand/refine/intersection.
 * @returns Object schema used for discriminant inspection, or undefined.
 */
function unwrapCaseObjectSchema(
    schema: Schema
): Extract<Schema, { readonly tag: typeof SchemaTag.Object }> | undefined {
    switch (schema.tag) {
        case SchemaTag.Object:
            return schema;
        case SchemaTag.Intersection:
            /*
             * A discriminant can be supplied by either side of an intersection.
             * Search both sides before rejecting the case.
             */
            return unwrapCaseObjectSchema(schema.left) ?? unwrapCaseObjectSchema(schema.right);
        case SchemaTag.Brand:
        case SchemaTag.Metadata:
        case SchemaTag.Message:
        case SchemaTag.KeyedObject:
        case SchemaTag.PropertyCount:
        case SchemaTag.PropertyNames:
        case SchemaTag.PatternProperties:
        case SchemaTag.Refine:
            return unwrapCaseObjectSchema(schema.inner);
        default:
            return undefined;
    }
}

/**
 * @brief Prove that a discriminant field schema accepts only one literal.
 * @details Intersections may prove the literal from either side, while brand
 * and refinement wrappers preserve the underlying literal requirement. Broader
 * schemas are rejected because they would make table dispatch unsound.
 * @param schema Schema attached to the discriminant property.
 * @param literal Literal value required by the case.
 * @returns True when the schema accepts only the requested literal.
 */
function schemaRequiresLiteral(schema: Schema, literal: LiteralValue): boolean {
    switch (schema.tag) {
        case SchemaTag.Literal:
            return Object.is(schema.value, literal);
        case SchemaTag.Intersection:
            return schemaRequiresLiteral(schema.left, literal) ||
                schemaRequiresLiteral(schema.right, literal);
        case SchemaTag.Brand:
        case SchemaTag.Metadata:
        case SchemaTag.Message:
        case SchemaTag.KeyedObject:
        case SchemaTag.PropertyCount:
        case SchemaTag.PropertyNames:
        case SchemaTag.PatternProperties:
        case SchemaTag.Refine:
            return schemaRequiresLiteral(schema.inner, literal);
        default:
            return false;
    }
}

/**
 * @brief Test whether a literal vector already contains a SameValue literal.
 */
function literalVectorIncludes(values: readonly LiteralValue[], value: LiteralValue): boolean {
    for (let index = 0; index < values.length; index += 1) {
        if (Object.is(values[index], value)) {
            return true;
        }
    }
    return false;
}
