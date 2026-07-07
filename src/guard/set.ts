/**
 * @file set.ts
 * @brief Set guard implementation.
 * @details Set helpers append immutable size constraints while preserving the
 * item schema owned by the original guard.
 */

import { ArrayCheckTag, SchemaTag } from "../kind/index.js";
import type { SetSchema } from "../schema/index.js";
import { BaseGuard } from "./base.js";
import { readCheckMessage } from "./check-message.js";
import {
    checkArrayLengthBound,
    readSetConstructorSchema,
    readSetMethodSchema
} from "./read.js";
import type { CheckMessageInput, Presence } from "./types.js";

/**
 * @brief Persistent builder for Set predicates.
 * @details Size methods allocate fresh schema records. The item schema is
 * reused by identity because guard construction has already frozen it.
 */
export class SetGuard<
    TItem,
    TPresence extends Presence = "required"
> extends BaseGuard<ReadonlySet<TItem>, TPresence> {

    /**
     * @brief Construct a frozen set guard.
     * @param schema Set schema backing this guard.
     * @post The receiver has no mutable instance state after construction.
     */
    public constructor(schema: SetSchema) {
        super(readSetConstructorSchema(schema));
        Object.freeze(this);
    }

    /**
     * @brief Require an inclusive minimum Set size.
     * @param value Non-negative integer lower bound.
     * @returns Fresh SetGuard with an appended minimum size check.
     */
    public min(value: number, options?: CheckMessageInput): SetGuard<TItem, TPresence> {
        const schema = readSetMethodSchema(this, "set min receiver");
        const bound = checkArrayLengthBound(value, "min");
        const message = readCheckMessage(options);
        return new SetGuard<TItem, TPresence>({
            tag: SchemaTag.Set,
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
     * @brief Require an inclusive maximum Set size.
     * @param value Non-negative integer upper bound.
     * @returns Fresh SetGuard with an appended maximum size check.
     */
    public max(value: number, options?: CheckMessageInput): SetGuard<TItem, TPresence> {
        const schema = readSetMethodSchema(this, "set max receiver");
        const bound = checkArrayLengthBound(value, "max");
        const message = readCheckMessage(options);
        return new SetGuard<TItem, TPresence>({
            tag: SchemaTag.Set,
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
     * @brief Require one exact Set size.
     * @param value Non-negative integer exact size.
     * @returns Fresh SetGuard with matching minimum and maximum size checks.
     */
    public size(value: number, options?: CheckMessageInput): SetGuard<TItem, TPresence> {
        const schema = readSetMethodSchema(this, "set size receiver");
        const bound = checkArrayLengthBound(value, "size");
        const message = readCheckMessage(options);
        return new SetGuard<TItem, TPresence>({
            tag: SchemaTag.Set,
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
     * @brief Require at least one Set item.
     * @returns Fresh SetGuard with a minimum size of one.
     */
    public nonempty(options?: CheckMessageInput): SetGuard<TItem, TPresence> {
        const schema = readSetMethodSchema(this, "set nonempty receiver");
        const message = readCheckMessage(options);
        return new SetGuard<TItem, TPresence>({
            tag: SchemaTag.Set,
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
