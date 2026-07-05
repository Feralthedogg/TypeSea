/**
 * @file scalar.ts
 * @brief Primitive and literal guard builders.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */

import { SchemaTag } from "../kind/index.js";
import {
    BaseGuard,
    DateGuard,
    NumberGuard,
    StringGuard
} from "../guard/index.js";
import type { LiteralValue, Schema } from "../schema/index.js";
import { isLiteralValue } from "../schema/index.js";

export type EnumValues = readonly [string, ...string[]];

/**
 * @brief Shared string guard singleton.
 * @details Primitive guards are immutable, so exporting one instance avoids
 * allocation for the common `t.string` path.
 */
export const stringGuard = new StringGuard({
    tag: SchemaTag.String,
    checks: []
});

/**
 * @brief Shared unknown guard singleton.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */
export const unknownGuard = new BaseGuard<unknown>({
    tag: SchemaTag.Unknown
});

/**
 * @brief Shared never guard singleton.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */
export const neverGuard = new BaseGuard<never>({
    tag: SchemaTag.Never
});

/**
 * @brief Shared finite number guard singleton.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */
export const numberGuard = new NumberGuard({
    tag: SchemaTag.Number,
    checks: []
});

/**
 * @brief Shared valid Date guard singleton.
 * @details Date validation accepts Date objects whose time value is finite.
 * Invalid Date instances are rejected.
 */
export const dateGuard = new DateGuard({
    tag: SchemaTag.Date,
    checks: []
});

/**
 * @brief Shared bigint guard singleton.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */
export const bigintGuard = new BaseGuard<bigint>({
    tag: SchemaTag.BigInt
});

/**
 * @brief Shared symbol guard singleton.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */
export const symbolGuard = new BaseGuard<symbol>({
    tag: SchemaTag.Symbol
});

/**
 * @brief Shared boolean guard singleton.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */
export const booleanGuard = new BaseGuard<boolean>({
    tag: SchemaTag.Boolean
});

export const nullGuard = new BaseGuard<null>({
    tag: SchemaTag.Literal,
    value: null
});

export const undefinedGuard = new BaseGuard<undefined>({
    tag: SchemaTag.Literal,
    value: undefined
});

export const voidGuard = undefinedGuard;

/**
 * @brief Build a literal guard after rejecting non-literal runtime values.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 * @param value Literal value to match with Object.is.
 * @returns Fresh guard for exactly the supplied literal.
 * @throws TypeError when the value cannot be represented as a TypeSea literal.
 */
export function literal<const TValue extends LiteralValue>(
    value: TValue
): BaseGuard<TValue> {
    if (!isLiteralValue(value)) {
        throw new TypeError("literal value must be a primitive literal");
    }
    /*
     * Literal schemas store the runtime value directly. Rejecting compound input
     * here keeps later equality checks side-effect free and serializable.
     */
    return new BaseGuard<TValue>({
        tag: SchemaTag.Literal,
        value
    });
}

/**
 * @brief Build a string literal enum guard.
 * @param values Non-empty tuple of string literals.
 * @returns Fresh guard accepting exactly one supplied enum member.
 * @throws TypeError when values are empty, non-strings, or duplicated.
 * @details The public export is aliased as `enum`; this internal name avoids
 * spelling a reserved word as a local binding.
 */
export function enumValues<const TValues extends EnumValues>(
    values: TValues
): BaseGuard<TValues[number]> {
    const rawValues: unknown = values;
    if (!Array.isArray(rawValues) || rawValues.length === 0) {
        throw new TypeError("enum values must be a non-empty string array");
    }
    const checkedValues: readonly unknown[] = rawValues;
    const options = new Array<Schema>(checkedValues.length);
    for (let index = 0; index < checkedValues.length; index += 1) {
        const value = checkedValues[index];
        if (typeof value !== "string") {
            throw new TypeError("enum values must be strings");
        }
        for (let seen = 0; seen < index; seen += 1) {
            if (Object.is(checkedValues[seen], value)) {
                throw new TypeError("enum values must be unique");
            }
        }
        options[index] = {
            tag: SchemaTag.Literal,
            value
        };
    }
    return new BaseGuard<TValues[number]>({
        tag: SchemaTag.Union,
        options
    });
}
