/**
 * @file literal.ts
 * @brief Literal guard implementation.
 * @details LiteralGuard adds Zod-style metadata around the existing literal and
 * literal-union schema representation used by every execution backend.
 */

import type { LiteralValue, Schema } from "../schema/index.js";
import { BaseGuard } from "./base.js";
import { defineReadonlyProperty } from "./props.js";
import { FrozenReadonlySet } from "./readonly-set.js";
import type { Presence } from "./types.js";

/**
 * @brief Guard for one or more primitive literal values.
 */
export class LiteralGuard<
    TValue extends LiteralValue,
    TPresence extends Presence = "required"
> extends BaseGuard<TValue, TPresence> {
    public declare readonly values: ReadonlySet<TValue>;

    /**
     * @brief Construct a literal guard facade.
     * @param schema Literal or literal-union schema consumed by validators.
     * @param values Unique literal values exposed through `.values`.
     */
    public constructor(schema: Schema, values: readonly TValue[]) {
        super(schema);
        defineReadonlyProperty(
            this,
            "values",
            new FrozenReadonlySet<TValue>(values),
            true
        );
        Object.freeze(this);
    }

    /**
     * @brief Read the single literal value.
     * @details Mirrors Zod's `.value` probe. Literal-union guards must use
     * `.values` because there is no single canonical value.
     */
    public get value(): TValue {
        if (this.values.size !== 1) {
            throw new Error(
                "This schema contains multiple valid literal values. Use `.values` instead."
            );
        }
        for (const value of this.values) {
            return value;
        }
        throw new Error("Literal guard contains no value.");
    }
}
