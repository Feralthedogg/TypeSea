/**
 * @file number.ts
 * @brief Number guard implementation.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
 */

import { NumberCheckTag, SchemaTag } from "../kind/index.js";
import type { NumberSchema } from "../schema/index.js";
import { BaseGuard } from "./base.js";
import { readCheckMessage } from "./check-message.js";
import {
    checkFiniteNumberBound,
    readNumberConstructorSchema,
    readNumberMethodSchema
} from "./read.js";
import type { CheckMessageInput, Presence } from "./types.js";

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;
const UINT32_MIN = 0;
const UINT32_MAX = 4294967295;
const FLOAT32_MAX = 3.4028234663852886e38;
const FLOAT64_MAX = Number.MAX_VALUE;

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
     * @param schema Number schema backing this guard.
     */
    public constructor(schema: NumberSchema) {
        super(readNumberConstructorSchema(schema));
        Object.freeze(this);
    }

    /**
     * @brief Read the compact Zod-style number type label.
     * @details The receiver is still schema-checked so detached accessors do not
     * silently report metadata for a forged object.
     * @returns Literal `number` schema label.
     */
    public override get type(): "number" {
        readNumberMethodSchema(this, "number type receiver");
        return "number";
    }

    /**
     * @brief Report the canonical numeric format.
     * @details The format is derived from the concrete numeric domain, so it
     * never claims a domain wider than this guard validates.
     * @returns Zod-style number format name, or null when no canonical format exists.
     */
    public get format(): string | null {
        const schema = readNumberMethodSchema(this, "number format receiver");
        const isInt = hasIntegerCheck(schema);
        const min = readNumberMinValue(schema);
        const max = readNumberMaxValue(schema);
        if (isInt) {
            if (min === INT32_MIN && max === INT32_MAX) {
                return "int32";
            }
            if (min === UINT32_MIN && max === UINT32_MAX) {
                return "uint32";
            }
            if (min === Number.MIN_SAFE_INTEGER && max === Number.MAX_SAFE_INTEGER) {
                return "safeint";
            }
            return null;
        }
        if (min === -FLOAT32_MAX && max === FLOAT32_MAX) {
            return "float32";
        }
        if (min === -FLOAT64_MAX && max === FLOAT64_MAX) {
            return "float64";
        }
        return null;
    }

    /**
     * @brief Report whether integer validation is present.
     * @details Mirrors Zod's metadata property without narrowing the guard.
     * @returns True when an integer check is attached.
     */
    public get isInt(): boolean {
        const schema = readNumberMethodSchema(this, "number isInt receiver");
        return hasIntegerCheck(schema);
    }

    /**
     * @brief Report whether the guard accepts only finite numbers.
     * @details TypeSea number schemas are finite by construction.
     * @returns Always true for NumberGuard instances.
     */
    public get isFinite(): boolean {
        readNumberMethodSchema(this, "number isFinite receiver");
        return true;
    }

    /**
     * @brief Report the strongest lower numeric bound.
     * @details Inclusive and exclusive bounds expose the same numeric edge,
     * matching Zod's metadata property.
     * @returns Minimum edge or negative infinity when unbounded.
     */
    public get minValue(): number {
        const schema = readNumberMethodSchema(this, "number minValue receiver");
        return readNumberMinValue(schema);
    }

    /**
     * @brief Report the strongest upper numeric bound.
     * @details Inclusive and exclusive bounds expose the same numeric edge,
     * matching Zod's metadata property.
     * @returns Maximum edge or infinity when unbounded.
     */
    public get maxValue(): number {
        const schema = readNumberMethodSchema(this, "number maxValue receiver");
        return readNumberMaxValue(schema);
    }

    /**
     * @brief Require finite numbers to be integers.
     * @returns Fresh NumberGuard with an appended integer check.
     */
    public int(options?: CheckMessageInput): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number int receiver");
        const message = readCheckMessage(options);
        return new NumberGuard<TPresence>({
            tag: SchemaTag.Number,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: NumberCheckTag.Integer,
                    message
                }
            ]
        });
    }

    /**
     * @brief Require a signed 32-bit integer.
     * @details Matches Zod's numeric format domain for `int32`.
     * @returns Fresh NumberGuard constrained to the int32 range.
     */
    public int32(options?: CheckMessageInput): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number int32 receiver");
        const message = readCheckMessage(options);
        return new NumberGuard<TPresence>({
            tag: SchemaTag.Number,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: NumberCheckTag.Integer,
                    message
                },
                {
                    tag: NumberCheckTag.Gte,
                    value: INT32_MIN,
                    message
                },
                {
                    tag: NumberCheckTag.Lte,
                    value: INT32_MAX,
                    message
                }
            ]
        });
    }

    /**
     * @brief Require an unsigned 32-bit integer.
     * @details Uses inclusive bounds so JSON Schema emission can stay in the
     * normal integer/minimum/maximum path.
     * @returns Fresh NumberGuard constrained to the uint32 range.
     */
    public uint32(options?: CheckMessageInput): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number uint32 receiver");
        const message = readCheckMessage(options);
        return new NumberGuard<TPresence>({
            tag: SchemaTag.Number,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: NumberCheckTag.Integer,
                    message
                },
                {
                    tag: NumberCheckTag.Gte,
                    value: UINT32_MIN,
                    message
                },
                {
                    tag: NumberCheckTag.Lte,
                    value: UINT32_MAX,
                    message
                }
            ]
        });
    }

    /**
     * @brief Require a value inside the IEEE-754 float32 finite range.
     * @details TypeSea still stores the value as a JavaScript number; this is a
     * representable-domain guard, not a narrowing to a distinct runtime type.
     * @returns Fresh NumberGuard constrained to the float32 range.
     */
    public float32(options?: CheckMessageInput): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number float32 receiver");
        const message = readCheckMessage(options);
        return new NumberGuard<TPresence>({
            tag: SchemaTag.Number,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: NumberCheckTag.Gte,
                    value: -FLOAT32_MAX,
                    message
                },
                {
                    tag: NumberCheckTag.Lte,
                    value: FLOAT32_MAX,
                    message
                }
            ]
        });
    }

    /**
     * @brief Require a value inside the IEEE-754 float64 finite range.
     * @details This is explicit for Zod parity; TypeSea number guards already
     * reject NaN and infinities before fluent checks run.
     * @returns Fresh NumberGuard constrained to the float64 range.
     */
    public float64(options?: CheckMessageInput): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number float64 receiver");
        const message = readCheckMessage(options);
        return new NumberGuard<TPresence>({
            tag: SchemaTag.Number,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: NumberCheckTag.Gte,
                    value: -FLOAT64_MAX,
                    message
                },
                {
                    tag: NumberCheckTag.Lte,
                    value: FLOAT64_MAX,
                    message
                }
            ]
        });
    }

    /**
     * @brief Add an inclusive lower bound.
     * @param value Finite lower bound.
     * @returns Fresh NumberGuard with an appended gte check.
     */
    public gte(value: number, options?: CheckMessageInput): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number gte receiver");
        const bound = checkFiniteNumberBound(value, "gte");
        const message = readCheckMessage(options);
        /*
         * Bounds are normalized before schema construction so interpreters and
         * compilers never need to handle NaN or infinity inside hot validation.
         */
        return new NumberGuard<TPresence>({
            tag: SchemaTag.Number,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: NumberCheckTag.Gte,
                    value: bound,
                    message
                }
            ]
        });
    }

    /**
     * @brief Alias for an inclusive lower bound.
     * @param value Finite lower bound.
     * @returns Fresh NumberGuard with an appended gte check.
     */
    public min(value: number, options?: CheckMessageInput): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number min receiver");
        const bound = checkFiniteNumberBound(value, "min");
        const message = readCheckMessage(options);
        return new NumberGuard<TPresence>({
            tag: SchemaTag.Number,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: NumberCheckTag.Gte,
                    value: bound,
                    message
                }
            ]
        });
    }

    /**
     * @brief Add an inclusive upper bound.
     * @param value Finite upper bound.
     * @returns Fresh NumberGuard with an appended lte check.
     */
    public lte(value: number, options?: CheckMessageInput): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number lte receiver");
        const bound = checkFiniteNumberBound(value, "lte");
        const message = readCheckMessage(options);
        return new NumberGuard<TPresence>({
            tag: SchemaTag.Number,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: NumberCheckTag.Lte,
                    value: bound,
                    message
                }
            ]
        });
    }

    /**
     * @brief Alias for an inclusive upper bound.
     * @param value Finite upper bound.
     * @returns Fresh NumberGuard with an appended lte check.
     */
    public max(value: number, options?: CheckMessageInput): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number max receiver");
        const bound = checkFiniteNumberBound(value, "max");
        const message = readCheckMessage(options);
        return new NumberGuard<TPresence>({
            tag: SchemaTag.Number,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: NumberCheckTag.Lte,
                    value: bound,
                    message
                }
            ]
        });
    }

    /**
     * @brief Add an exclusive lower bound.
     * @param value Finite lower bound.
     * @returns Fresh NumberGuard with an appended gt check.
     */
    public gt(value: number, options?: CheckMessageInput): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number gt receiver");
        const bound = checkFiniteNumberBound(value, "gt");
        const message = readCheckMessage(options);
        return new NumberGuard<TPresence>({
            tag: SchemaTag.Number,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: NumberCheckTag.Gt,
                    value: bound,
                    message
                }
            ]
        });
    }

    /**
     * @brief Add an exclusive upper bound.
     * @param value Finite upper bound.
     * @returns Fresh NumberGuard with an appended lt check.
     */
    public lt(value: number, options?: CheckMessageInput): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number lt receiver");
        const bound = checkFiniteNumberBound(value, "lt");
        const message = readCheckMessage(options);
        return new NumberGuard<TPresence>({
            tag: SchemaTag.Number,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: NumberCheckTag.Lt,
                    value: bound,
                    message
                }
            ]
        });
    }

    /**
     * @brief Require a number to be divisible by a positive finite divisor.
     * @param value Positive finite divisor.
     * @returns Fresh NumberGuard with an appended multipleOf check.
     */
    public multipleOf(value: number, options?: CheckMessageInput): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number multipleOf receiver");
        const divisor = checkPositiveFiniteNumber(value, "multipleOf");
        const message = readCheckMessage(options);
        return new NumberGuard<TPresence>({
            tag: SchemaTag.Number,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: NumberCheckTag.MultipleOf,
                    value: divisor,
                    message
                }
            ]
        });
    }

    /**
     * @brief Alias for multipleOf.
     * @param value Positive finite divisor.
     * @returns Fresh NumberGuard with an appended multipleOf check.
     */
    public step(value: number, options?: CheckMessageInput): NumberGuard<TPresence> {
        return this.multipleOf(value, options);
    }

    /**
     * @brief Require a number greater than zero.
     * @returns Fresh NumberGuard with `gt(0)`.
     */
    public positive(options?: CheckMessageInput): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number positive receiver");
        const message = readCheckMessage(options);
        return new NumberGuard<TPresence>({
            tag: SchemaTag.Number,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: NumberCheckTag.Gt,
                    value: 0,
                    message
                }
            ]
        });
    }

    /**
     * @brief Require a number greater than or equal to zero.
     * @returns Fresh NumberGuard with `gte(0)`.
     */
    public nonnegative(options?: CheckMessageInput): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number nonnegative receiver");
        const message = readCheckMessage(options);
        return new NumberGuard<TPresence>({
            tag: SchemaTag.Number,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: NumberCheckTag.Gte,
                    value: 0,
                    message
                }
            ]
        });
    }

    /**
     * @brief Require a number less than zero.
     * @returns Fresh NumberGuard with `lt(0)`.
     */
    public negative(options?: CheckMessageInput): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number negative receiver");
        const message = readCheckMessage(options);
        return new NumberGuard<TPresence>({
            tag: SchemaTag.Number,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: NumberCheckTag.Lt,
                    value: 0,
                    message
                }
            ]
        });
    }

    /**
     * @brief Require a number less than or equal to zero.
     * @returns Fresh NumberGuard with `lte(0)`.
     */
    public nonpositive(options?: CheckMessageInput): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number nonpositive receiver");
        const message = readCheckMessage(options);
        return new NumberGuard<TPresence>({
            tag: SchemaTag.Number,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: NumberCheckTag.Lte,
                    value: 0,
                    message
                }
            ]
        });
    }

    /**
     * @brief Keep the explicit Zod-compatible finite marker.
     * @returns This guard because TypeSea numbers are finite by construction.
     */
    public finite(): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number finite receiver");
        return new NumberGuard<TPresence>(schema);
    }

    /**
     * @brief Require a safe JavaScript integer.
     * @returns Fresh NumberGuard constrained to Number.isSafeInteger domain.
     */
    public safe(options?: CheckMessageInput): NumberGuard<TPresence> {
        const schema = readNumberMethodSchema(this, "number safe receiver");
        const message = readCheckMessage(options);
        return new NumberGuard<TPresence>({
            tag: SchemaTag.Number,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: NumberCheckTag.Integer,
                    message
                },
                {
                    tag: NumberCheckTag.Gte,
                    value: Number.MIN_SAFE_INTEGER,
                    message
                },
                {
                    tag: NumberCheckTag.Lte,
                    value: Number.MAX_SAFE_INTEGER,
                    message
                }
            ]
        });
    }
}

function hasIntegerCheck(schema: NumberSchema): boolean {
    for (let index = 0; index < schema.checks.length; index += 1) {
        const check = schema.checks[index];
        if (check?.tag === NumberCheckTag.Integer) {
            return true;
        }
    }
    return false;
}

function readNumberMinValue(schema: NumberSchema): number {
    let bound = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < schema.checks.length; index += 1) {
        const check = schema.checks[index];
        if (
            check !== undefined &&
            (check.tag === NumberCheckTag.Gte || check.tag === NumberCheckTag.Gt)
        ) {
            bound = Math.max(bound, check.value);
        }
    }
    return bound;
}

function readNumberMaxValue(schema: NumberSchema): number {
    let bound = Number.POSITIVE_INFINITY;
    for (let index = 0; index < schema.checks.length; index += 1) {
        const check = schema.checks[index];
        if (
            check !== undefined &&
            (check.tag === NumberCheckTag.Lte || check.tag === NumberCheckTag.Lt)
        ) {
            bound = Math.min(bound, check.value);
        }
    }
    return bound;
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
