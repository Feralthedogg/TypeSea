/**
 * @file tuple.ts
 * @brief Tuple guard implementation.
 * @details Tuple helpers allocate fresh schema records so fluent APIs preserve
 * immutable validation plans.
 */

import { SchemaTag } from "../kind/index.js";
import type { TupleSchema } from "../schema/index.js";
import { BaseGuard } from "./base.js";
import {
    readGuardSchema,
    readTupleConstructorSchema,
    readTupleMethodSchema
} from "./read.js";
import type {
    Guard,
    Infer,
    Presence
} from "./types.js";

/**
 * @brief Persistent builder for tuple predicates.
 * @details Fixed tuple items are kept by schema identity. The fluent `rest()`
 * method only replaces the variadic tail schema and returns a fresh guard.
 */
export class TupleGuard<
    TValue extends readonly unknown[],
    TPresence extends Presence = "required",
    TItems extends readonly unknown[] = TValue
> extends BaseGuard<TValue, TPresence> {

    /**
     * @brief Construct a frozen tuple guard.
     * @param schema Tuple schema backing this guard.
     */
    public constructor(schema: TupleSchema) {
        super(readTupleConstructorSchema(schema));
        Object.freeze(this);
    }

    /**
     * @brief Return the fixed tuple item guards.
     * @details The variadic rest schema is intentionally not included here;
     * callers can use `_def.rest` when they need migration metadata for the
     * tail. The returned array is frozen.
     */
    public get items(): {
        readonly [TKey in keyof TItems]: BaseGuard<TItems[TKey]>;
    } {
        const schema = readTupleMethodSchema(this, "tuple items receiver");
        const items = new Array<BaseGuard<unknown>>(schema.items.length);
        for (let index = 0; index < schema.items.length; index += 1) {
            const item = schema.items[index];
            if (item === undefined) {
                throw new TypeError("tuple item schema disappeared");
            }
            items[index] = new BaseGuard<unknown>(item);
        }
        return Object.freeze(items) as {
            readonly [TKey in keyof TItems]: BaseGuard<TItems[TKey]>;
        };
    }

    /**
     * @brief Add or replace the variadic tuple tail.
     * @param item Guard used for every tuple slot after the fixed prefix.
     * @returns Fresh TupleGuard with the same prefix and a new rest schema.
     */
    public rest<TGuard extends Guard<unknown, Presence>>(
        item: TGuard
    ): TupleGuard<readonly [...TItems, ...Infer<TGuard>[]], TPresence, TItems> {
        const schema = readTupleMethodSchema(this, "tuple rest receiver");
        return new TupleGuard<readonly [...TItems, ...Infer<TGuard>[]], TPresence, TItems>({
            tag: SchemaTag.Tuple,
            items: schema.items,
            rest: readGuardSchema(item, "tuple rest schema")
        });
    }
}
