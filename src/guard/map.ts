/**
 * @file map.ts
 * @brief Map guard implementation.
 * @details Map helpers append immutable size constraints while preserving the
 * key and value schemas owned by the original guard.
 */

import { ArrayCheckTag, SchemaTag } from "../kind/index.js";
import type { MapSchema } from "../schema/index.js";
import { BaseGuard } from "./base.js";
import { readCheckMessage } from "./check-message.js";
import {
    checkArrayLengthBound,
    readMapConstructorSchema,
    readMapMethodSchema
} from "./read.js";
import type { CheckMessageInput, Presence } from "./types.js";

/**
 * @brief Persistent builder for Map predicates.
 * @details Size methods allocate fresh schema records. Key and value schemas
 * are reused by identity because guard construction has already frozen them.
 */
export class MapGuard<
    TKey,
    TValue,
    TPresence extends Presence = "required"
> extends BaseGuard<ReadonlyMap<TKey, TValue>, TPresence> {

    /**
     * @brief Construct a frozen map guard.
     * @param schema Map schema backing this guard.
     * @post The receiver has no mutable instance state after construction.
     */
    public constructor(schema: MapSchema) {
        super(readMapConstructorSchema(schema));
        Object.freeze(this);
    }

    /**
     * @brief Require an inclusive minimum Map size.
     * @param value Non-negative integer lower bound.
     * @returns Fresh MapGuard with an appended minimum size check.
     */
    public min(
        value: number,
        options?: CheckMessageInput
    ): MapGuard<TKey, TValue, TPresence> {
        const schema = readMapMethodSchema(this, "map min receiver");
        const bound = checkArrayLengthBound(value, "min");
        const message = readCheckMessage(options);
        return new MapGuard<TKey, TValue, TPresence>({
            tag: SchemaTag.Map,
            key: schema.key,
            value: schema.value,
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
     * @brief Require an inclusive maximum Map size.
     * @param value Non-negative integer upper bound.
     * @returns Fresh MapGuard with an appended maximum size check.
     */
    public max(
        value: number,
        options?: CheckMessageInput
    ): MapGuard<TKey, TValue, TPresence> {
        const schema = readMapMethodSchema(this, "map max receiver");
        const bound = checkArrayLengthBound(value, "max");
        const message = readCheckMessage(options);
        return new MapGuard<TKey, TValue, TPresence>({
            tag: SchemaTag.Map,
            key: schema.key,
            value: schema.value,
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
     * @brief Require one exact Map size.
     * @param value Non-negative integer exact size.
     * @returns Fresh MapGuard with matching minimum and maximum size checks.
     */
    public size(
        value: number,
        options?: CheckMessageInput
    ): MapGuard<TKey, TValue, TPresence> {
        const schema = readMapMethodSchema(this, "map size receiver");
        const bound = checkArrayLengthBound(value, "size");
        const message = readCheckMessage(options);
        return new MapGuard<TKey, TValue, TPresence>({
            tag: SchemaTag.Map,
            key: schema.key,
            value: schema.value,
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
     * @brief Require at least one Map entry.
     * @returns Fresh MapGuard with a minimum size of one.
     */
    public nonempty(options?: CheckMessageInput): MapGuard<TKey, TValue, TPresence> {
        const schema = readMapMethodSchema(this, "map nonempty receiver");
        const message = readCheckMessage(options);
        return new MapGuard<TKey, TValue, TPresence>({
            tag: SchemaTag.Map,
            key: schema.key,
            value: schema.value,
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
