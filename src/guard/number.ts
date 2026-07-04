/**
 * @file number.ts
 * @brief Number guard implementation.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
 */

import { NumberCheckTag, SchemaTag } from "../kind/index.js";
import type { NumberSchema } from "../schema/index.js";
import { BaseGuard } from "./base.js";
import {
    checkFiniteNumberBound,
    readNumberConstructorSchema,
    readNumberMethodSchema
} from "./read.js";
import type { Presence } from "./types.js";

/**
 * @brief Persistent builder for finite number predicates.
 * @details Bounds are normalized before entering the schema so the evaluator
 * and compiler never have to defend against NaN or infinities later.
 */
export class NumberGuard<
    TPresence extends Presence = "required"
> extends BaseGuard<number, TPresence> {

    /**
     * @brief Construct a frozen number guard.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
     * @param schema Number schema backing this guard.
     */
    public constructor(schema: NumberSchema) {
        super(readNumberConstructorSchema(schema));
        Object.freeze(this);
    }

    /**
     * @brief Require finite numbers to be integers.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
     * @returns Fresh NumberGuard with an appended integer check.
     */
    public int(): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number int receiver");
        return new NumberGuard<TPresence>({
            tag: SchemaTag.Number,
            checks: [
                ...schema.checks,
                {
                    tag: NumberCheckTag.Integer
                }
            ]
        });
    }

    /**
     * @brief Add an inclusive lower bound.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
     * @param value Finite lower bound.
     * @returns Fresh NumberGuard with an appended gte check.
     */
    public gte(value: number): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number gte receiver");
        const bound = checkFiniteNumberBound(value, "gte");
        /*
         * Bounds are normalized before schema construction so interpreters and
         * compilers never need to handle NaN or infinity inside hot validation.
         */
        return new NumberGuard<TPresence>({
            tag: SchemaTag.Number,
            checks: [
                ...schema.checks,
                {
                    tag: NumberCheckTag.Gte,
                    value: bound
                }
            ]
        });
    }

    /**
     * @brief Add an inclusive upper bound.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
     * @param value Finite upper bound.
     * @returns Fresh NumberGuard with an appended lte check.
     */
    public lte(value: number): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number lte receiver");
        const bound = checkFiniteNumberBound(value, "lte");
        return new NumberGuard<TPresence>({
            tag: SchemaTag.Number,
            checks: [
                ...schema.checks,
                {
                    tag: NumberCheckTag.Lte,
                    value: bound
                }
            ]
        });
    }
}
