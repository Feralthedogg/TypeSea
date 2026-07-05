/**
 * @file array.ts
 * @brief Array guard implementation.
 * @details Array helpers append immutable length constraints while preserving
 * the item schema owned by the original guard.
 */

import { ArrayCheckTag, SchemaTag } from "../kind/index.js";
import type { ArraySchema } from "../schema/index.js";
import {
    BaseGuard,
    setArrayGuardFactory
} from "./base.js";
import {
    checkArrayLengthBound,
    readArrayConstructorSchema,
    readArrayMethodSchema
} from "./read.js";
import type { Presence } from "./types.js";

/**
 * @brief Persistent builder for homogeneous array predicates.
 * @details Length methods allocate a fresh schema record. The item schema is
 * reused by identity because guard construction has already frozen it.
 */
export class ArrayGuard<
    TItem,
    TPresence extends Presence = "required"
> extends BaseGuard<TItem[], TPresence> {

    /**
     * @brief Construct a frozen array guard.
     * @param schema Array schema backing this guard.
     * @post The receiver has no mutable instance state after construction.
     */
    public constructor(schema: ArraySchema) {
        super(readArrayConstructorSchema(schema));
        Object.freeze(this);
    }

    /**
     * @brief Require an inclusive minimum array length.
     * @param value Non-negative integer lower bound.
     * @returns Fresh ArrayGuard with an appended minimum length check.
     */
    public min(value: number): ArrayGuard<TItem, TPresence> {
        const schema = readArrayMethodSchema(this, "array min receiver");
        const bound = checkArrayLengthBound(value, "min");
        return new ArrayGuard<TItem, TPresence>({
            tag: SchemaTag.Array,
            item: schema.item,
            checks: [
                ...schema.checks,
                {
                    tag: ArrayCheckTag.Min,
                    value: bound
                }
            ]
        });
    }

    /**
     * @brief Require an inclusive maximum array length.
     * @param value Non-negative integer upper bound.
     * @returns Fresh ArrayGuard with an appended maximum length check.
     */
    public max(value: number): ArrayGuard<TItem, TPresence> {
        const schema = readArrayMethodSchema(this, "array max receiver");
        const bound = checkArrayLengthBound(value, "max");
        return new ArrayGuard<TItem, TPresence>({
            tag: SchemaTag.Array,
            item: schema.item,
            checks: [
                ...schema.checks,
                {
                    tag: ArrayCheckTag.Max,
                    value: bound
                }
            ]
        });
    }

    /**
     * @brief Require one exact array length.
     * @param value Non-negative integer exact length.
     * @returns Fresh ArrayGuard with matching minimum and maximum length checks.
     * @details Exact length is represented as two ordinary bounds so every
     * backend can reuse the same comparison and diagnostic paths.
     */
    public length(value: number): ArrayGuard<TItem, TPresence> {
        const bound = checkArrayLengthBound(value, "exact");
        return this.min(bound).max(bound);
    }

    /**
     * @brief Require at least one array element.
     * @returns Fresh ArrayGuard with a minimum length of one.
     */
    public nonempty(): ArrayGuard<TItem, TPresence> {
        return this.min(1);
    }
}

setArrayGuardFactory(<TItem>(schema: ArraySchema): ArrayGuard<TItem> =>
    new ArrayGuard<TItem>(schema));
