/**
 * @file composite.ts
 * @brief Composite guard builders.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */

import {
    PresenceTag,
    SchemaTag
} from "../kind/index.js";
import {
    BaseGuard,
    type Guard,
    type Infer,
    type Presence
} from "../guard/index.js";
import type {
    DiscriminatedUnionCase,
    Schema
} from "../schema/index.js";
import { isRecord, readGuardSchema } from "../internal/index.js";
import type {
    DiscriminatedUnionCases,
    InferTuple,
    TupleShape,
    UnionInput
} from "./types.js";

/**
 * @brief Build an array guard.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 * @param item Guard used for each logical array slot.
 * @returns Fresh array guard.
 */
export function array<TGuard extends Guard<unknown, Presence>>(
    item: TGuard
): BaseGuard<Infer<TGuard>[]> {
    return new BaseGuard<Infer<TGuard>[]>({
        tag: SchemaTag.Array,
        item: readGuardSchema(item, "array item")
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
): BaseGuard<InferTuple<TShape>> {
    const rawShape: unknown = shape;
    if (!Array.isArray(rawShape)) {
        throw new TypeError("tuple shape must be an array");
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
    return new BaseGuard<InferTuple<TShape>>({
        tag: SchemaTag.Tuple,
        items
    });
}

/**
 * @brief Build a string-keyed record guard.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 * @param value Guard used for each enumerable own record value.
 * @returns Fresh record guard.
 */
export function record<TGuard extends Guard<unknown, Presence>>(
    value: TGuard
): BaseGuard<Readonly<Record<string, Infer<TGuard>>>> {
    return new BaseGuard<Readonly<Record<string, Infer<TGuard>>>>({
        tag: SchemaTag.Record,
        value: readGuardSchema(value, "record value")
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
): BaseGuard<Infer<TGuards[number]>> {
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
    return new BaseGuard<Infer<TGuards[number]>>({
        tag: SchemaTag.Union,
        options
    });
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
): BaseGuard<Infer<TCases[keyof TCases]>> {
    if (typeof key !== "string") {
        throw new TypeError("discriminated union key must be a string");
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
    return new BaseGuard<Infer<TCases[keyof TCases]>>({
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
    literal: string
): Schema {
    const schema = readGuardSchema(guard, `case ${literal}`);
    if (!caseRequiresDiscriminant(schema, key, literal)) {
        throw new TypeError(
            `case ${literal} must require literal discriminant ${key}`
        );
    }
    return schema;
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
    literal: string
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
 * @details Brand and refinement wrappers do not change object shape, and either
 * side of an intersection may supply the tag field. Other schema forms cannot
 * provide the required object-field proof.
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
function schemaRequiresLiteral(schema: Schema, literal: string): boolean {
    switch (schema.tag) {
        case SchemaTag.Literal:
            return Object.is(schema.value, literal);
        case SchemaTag.Intersection:
            return schemaRequiresLiteral(schema.left, literal) ||
                schemaRequiresLiteral(schema.right, literal);
        case SchemaTag.Brand:
        case SchemaTag.Refine:
            return schemaRequiresLiteral(schema.inner, literal);
        default:
            return false;
    }
}
