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
import { readCheckMessage } from "./check-message.js";
import {
    checkArrayLengthBound,
    readArrayConstructorSchema,
    readArrayMethodSchema
} from "./read.js";
import type { CheckMessageInput, Presence } from "./types.js";

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
     * @brief Return the item guard carried by this array schema.
     * @details Zod exposes this as `array.element`. TypeSea stores the item as a
     * schema node, so the facade returns a schema-backed guard without mutating
     * the array guard.
     * @returns Guard for one logical array item.
     */
    public get element(): BaseGuard<TItem> {
        const schema = readArrayMethodSchema(this, "array element receiver");
        return new BaseGuard<TItem>(schema.item);
    }

    /**
     * @brief Require an inclusive minimum array length.
     * @param value Non-negative integer lower bound.
     * @returns Fresh ArrayGuard with an appended minimum length check.
     */
    public min(value: number, options?: CheckMessageInput): ArrayGuard<TItem, TPresence> {
        const schema = readArrayMethodSchema(this, "array min receiver");
        const bound = checkArrayLengthBound(value, "min");
        const message = readCheckMessage(options);
        return new ArrayGuard<TItem, TPresence>({
            tag: SchemaTag.Array,
            item: schema.item,
            checks: [
                ...schema.checks,
                {
                    tag: ArrayCheckTag.Min,
                    value: bound,
                    message
                }
            ]
        });
    }

    /**
     * @brief Require an inclusive maximum array length.
     * @param value Non-negative integer upper bound.
     * @returns Fresh ArrayGuard with an appended maximum length check.
     */
    public max(value: number, options?: CheckMessageInput): ArrayGuard<TItem, TPresence> {
        const schema = readArrayMethodSchema(this, "array max receiver");
        const bound = checkArrayLengthBound(value, "max");
        const message = readCheckMessage(options);
        return new ArrayGuard<TItem, TPresence>({
            tag: SchemaTag.Array,
            item: schema.item,
            checks: [
                ...schema.checks,
                {
                    tag: ArrayCheckTag.Max,
                    value: bound,
                    message
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
    public length(value: number, options?: CheckMessageInput): ArrayGuard<TItem, TPresence> {
        const schema = readArrayMethodSchema(this, "array length receiver");
        const bound = checkArrayLengthBound(value, "exact");
        const message = readCheckMessage(options);
        return new ArrayGuard<TItem, TPresence>({
            tag: SchemaTag.Array,
            item: schema.item,
            checks: [
                ...schema.checks,
                {
                    tag: ArrayCheckTag.Min,
                    value: bound,
                    message
                },
                {
                    tag: ArrayCheckTag.Max,
                    value: bound,
                    message
                }
            ]
        });
    }

    /**
     * @brief Require at least one array element.
     * @returns Fresh ArrayGuard with a minimum length of one.
     */
    public nonempty(options?: CheckMessageInput): ArrayGuard<TItem, TPresence> {
        const schema = readArrayMethodSchema(this, "array nonempty receiver");
        const message = readCheckMessage(options);
        return new ArrayGuard<TItem, TPresence>({
            tag: SchemaTag.Array,
            item: schema.item,
            checks: [
                ...schema.checks,
                {
                    tag: ArrayCheckTag.Min,
                    value: 1,
                    message
                }
            ]
        });
    }
}

setArrayGuardFactory(<TItem>(schema: ArraySchema): ArrayGuard<TItem> =>
    new ArrayGuard<TItem>(schema));
