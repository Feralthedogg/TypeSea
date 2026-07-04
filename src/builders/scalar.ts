/**
 * @file scalar.ts
 * @brief Primitive and literal guard builders.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */

import { SchemaTag } from "../kind/index.js";
import {
    BaseGuard,
    NumberGuard,
    StringGuard
} from "../guard/index.js";
import type { LiteralValue } from "../schema/index.js";
import { isLiteralValue } from "../schema/index.js";

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
