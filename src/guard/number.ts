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
     * @brief Alias for an inclusive lower bound.
     * @param value Finite lower bound.
     * @returns Fresh NumberGuard with an appended gte check.
     */
    public min(value: number): NumberGuard<TPresence> {
        return this.gte(value);
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

    /**
     * @brief Alias for an inclusive upper bound.
     * @param value Finite upper bound.
     * @returns Fresh NumberGuard with an appended lte check.
     */
    public max(value: number): NumberGuard<TPresence> {
        return this.lte(value);
    }

    /**
     * @brief Add an exclusive lower bound.
     * @param value Finite lower bound.
     * @returns Fresh NumberGuard with an appended gt check.
     */
    public gt(value: number): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number gt receiver");
        const bound = checkFiniteNumberBound(value, "gt");
        return new NumberGuard<TPresence>({
            tag: SchemaTag.Number,
            checks: [
                ...schema.checks,
                {
                    tag: NumberCheckTag.Gt,
                    value: bound
                }
            ]
        });
    }

    /**
     * @brief Add an exclusive upper bound.
     * @param value Finite upper bound.
     * @returns Fresh NumberGuard with an appended lt check.
     */
    public lt(value: number): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number lt receiver");
        const bound = checkFiniteNumberBound(value, "lt");
        return new NumberGuard<TPresence>({
            tag: SchemaTag.Number,
            checks: [
                ...schema.checks,
                {
                    tag: NumberCheckTag.Lt,
                    value: bound
                }
            ]
        });
    }

    /**
     * @brief Require a number to be divisible by a positive finite divisor.
     * @param value Positive finite divisor.
     * @returns Fresh NumberGuard with an appended multipleOf check.
     */
    public multipleOf(value: number): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number multipleOf receiver");
        const divisor = checkPositiveFiniteNumber(value, "multipleOf");
        return new NumberGuard<TPresence>({
            tag: SchemaTag.Number,
            checks: [
                ...schema.checks,
                {
                    tag: NumberCheckTag.MultipleOf,
                    value: divisor
                }
            ]
        });
    }

    /**
     * @brief Require a number greater than zero.
     * @returns Fresh NumberGuard with `gt(0)`.
     */
    public positive(): NumberGuard<TPresence> {
        return this.gt(0);
    }

    /**
     * @brief Require a number greater than or equal to zero.
     * @returns Fresh NumberGuard with `gte(0)`.
     */
    public nonnegative(): NumberGuard<TPresence> {
        return this.gte(0);
    }

    /**
     * @brief Require a number less than zero.
     * @returns Fresh NumberGuard with `lt(0)`.
     */
    public negative(): NumberGuard<TPresence> {
        return this.lt(0);
    }

    /**
     * @brief Require a number less than or equal to zero.
     * @returns Fresh NumberGuard with `lte(0)`.
     */
    public nonpositive(): NumberGuard<TPresence> {
        return this.lte(0);
    }

    /**
     * @brief Keep the explicit Zod-compatible finite marker.
     * @returns This guard because TypeSea numbers are finite by construction.
     */
    public finite(): this {
        return this;
    }

    /**
     * @brief Require a safe JavaScript integer.
     * @returns Fresh NumberGuard constrained to Number.isSafeInteger domain.
     */
    public safe(): NumberGuard<TPresence> {
        return this.int()
            .gte(Number.MIN_SAFE_INTEGER)
            .lte(Number.MAX_SAFE_INTEGER);
    }
}

/**
 * @brief Validate a positive finite numeric divisor.
 * @param value Candidate divisor.
 * @param label Bound label used in RangeError messages.
 * @returns Accepted divisor.
 */
function checkPositiveFiniteNumber(value: number, label: string): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        throw new RangeError(`${label} numeric divisor must be positive and finite`);
    }
    return value;
}
