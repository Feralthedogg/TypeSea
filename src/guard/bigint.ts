/**
 * @file bigint.ts
 * @brief BigInt guard implementation.
 * @details BigInt helpers mirror numeric fluent checks while preserving
 * JavaScript bigint semantics and avoiding implicit number coercion.
 */

import { BigIntCheckTag, SchemaTag } from "../kind/index.js";
import type { BigIntSchema } from "../schema/index.js";
import { BaseGuard } from "./base.js";
import { readCheckMessage } from "./check-message.js";
import {
    readBigIntConstructorSchema,
    readBigIntMethodSchema
} from "./read.js";
import type { CheckMessageInput, Presence } from "./types.js";

const INT64_MIN = -9223372036854775808n;
const INT64_MAX = 9223372036854775807n;
const UINT64_MIN = 0n;
const UINT64_MAX = 18446744073709551615n;

/**
 * @brief Persistent builder for bigint predicates.
 * @details Methods append normalized bigint checks and return fresh frozen
 * guards. Number values are intentionally rejected instead of coerced.
 */
export class BigIntGuard<
    TPresence extends Presence = "required"
> extends BaseGuard<bigint, TPresence> {

    /**
     * @brief Construct a frozen bigint guard.
     * @param schema BigInt schema backing this guard.
     */
    public constructor(schema: BigIntSchema) {
        super(readBigIntConstructorSchema(schema));
        Object.freeze(this);
    }

    /**
     * @brief Read the compact Zod-style bigint type label.
     * @details The receiver is still schema-checked so detached accessors do not
     * silently report metadata for a forged object.
     * @returns Literal `bigint` schema label.
     */
    public override get type(): "bigint" {
        readBigIntMethodSchema(this, "bigint type receiver");
        return "bigint";
    }

    /**
     * @brief Report the canonical bigint format.
     * @returns Null; range helpers expose bounds separately.
     */
    public get format(): string | null {
        readBigIntMethodSchema(this, "bigint format receiver");
        return null;
    }

    /**
     * @brief Report the strongest inclusive lower bigint bound.
     * @returns Inclusive lower bound, or null when unbounded.
     */
    public get minValue(): bigint | null {
        const schema = readBigIntMethodSchema(this, "bigint minValue receiver");
        let bound: bigint | null = null;
        for (let index = 0; index < schema.checks.length; index += 1) {
            const check = schema.checks[index];
            if (check?.tag === BigIntCheckTag.Gte) {
                bound = bound === null ? check.value : maxBigInt(bound, check.value);
            }
        }
        return bound;
    }

    /**
     * @brief Report the strongest inclusive upper bigint bound.
     * @returns Inclusive upper bound, or null when unbounded.
     */
    public get maxValue(): bigint | null {
        const schema = readBigIntMethodSchema(this, "bigint maxValue receiver");
        let bound: bigint | null = null;
        for (let index = 0; index < schema.checks.length; index += 1) {
            const check = schema.checks[index];
            if (check?.tag === BigIntCheckTag.Lte) {
                bound = bound === null ? check.value : minBigInt(bound, check.value);
            }
        }
        return bound;
    }

    /**
     * @brief Require a signed 64-bit integer domain.
     * @details BigInt values are already integral; this appends inclusive
     * int64 bounds for wire-format and database interop schemas.
     * @returns Fresh BigIntGuard constrained to the int64 range.
     */
    public int64(options?: CheckMessageInput): BigIntGuard<TPresence> {
        const schema = readBigIntMethodSchema(this, "bigint int64 receiver");
        const message = readCheckMessage(options);
        return appendBigIntChecks(schema, [
            {
                tag: BigIntCheckTag.Gte,
                value: INT64_MIN,
                message
            },
            {
                tag: BigIntCheckTag.Lte,
                value: INT64_MAX,
                message
            }
        ]);
    }

    /**
     * @brief Require an unsigned 64-bit integer domain.
     * @returns Fresh BigIntGuard constrained to the uint64 range.
     */
    public uint64(options?: CheckMessageInput): BigIntGuard<TPresence> {
        const schema = readBigIntMethodSchema(this, "bigint uint64 receiver");
        const message = readCheckMessage(options);
        return appendBigIntChecks(schema, [
            {
                tag: BigIntCheckTag.Gte,
                value: UINT64_MIN,
                message
            },
            {
                tag: BigIntCheckTag.Lte,
                value: UINT64_MAX,
                message
            }
        ]);
    }

    /**
     * @brief Add an inclusive lower bound.
     * @param value BigInt lower bound.
     * @returns Fresh BigIntGuard with an appended gte check.
     */
    public gte(value: bigint, options?: CheckMessageInput): BigIntGuard<TPresence> {
        const schema = readBigIntMethodSchema(this, "bigint gte receiver");
        return appendBigIntCheck(
            schema,
            BigIntCheckTag.Gte,
            readBigIntBound(value, "gte"),
            readCheckMessage(options)
        );
    }

    /**
     * @brief Alias for an inclusive lower bound.
     * @param value BigInt lower bound.
     * @returns Fresh BigIntGuard with an appended gte check.
     */
    public min(value: bigint, options?: CheckMessageInput): BigIntGuard<TPresence> {
        const schema = readBigIntMethodSchema(this, "bigint min receiver");
        return appendBigIntCheck(
            schema,
            BigIntCheckTag.Gte,
            readBigIntBound(value, "min"),
            readCheckMessage(options)
        );
    }

    /**
     * @brief Add an inclusive upper bound.
     * @param value BigInt upper bound.
     * @returns Fresh BigIntGuard with an appended lte check.
     */
    public lte(value: bigint, options?: CheckMessageInput): BigIntGuard<TPresence> {
        const schema = readBigIntMethodSchema(this, "bigint lte receiver");
        return appendBigIntCheck(
            schema,
            BigIntCheckTag.Lte,
            readBigIntBound(value, "lte"),
            readCheckMessage(options)
        );
    }

    /**
     * @brief Alias for an inclusive upper bound.
     * @param value BigInt upper bound.
     * @returns Fresh BigIntGuard with an appended lte check.
     */
    public max(value: bigint, options?: CheckMessageInput): BigIntGuard<TPresence> {
        const schema = readBigIntMethodSchema(this, "bigint max receiver");
        return appendBigIntCheck(
            schema,
            BigIntCheckTag.Lte,
            readBigIntBound(value, "max"),
            readCheckMessage(options)
        );
    }

    /**
     * @brief Add an exclusive lower bound.
     * @param value BigInt lower bound.
     * @returns Fresh BigIntGuard with an appended gt check.
     */
    public gt(value: bigint, options?: CheckMessageInput): BigIntGuard<TPresence> {
        const schema = readBigIntMethodSchema(this, "bigint gt receiver");
        return appendBigIntCheck(
            schema,
            BigIntCheckTag.Gt,
            readBigIntBound(value, "gt"),
            readCheckMessage(options)
        );
    }

    /**
     * @brief Add an exclusive upper bound.
     * @param value BigInt upper bound.
     * @returns Fresh BigIntGuard with an appended lt check.
     */
    public lt(value: bigint, options?: CheckMessageInput): BigIntGuard<TPresence> {
        const schema = readBigIntMethodSchema(this, "bigint lt receiver");
        return appendBigIntCheck(
            schema,
            BigIntCheckTag.Lt,
            readBigIntBound(value, "lt"),
            readCheckMessage(options)
        );
    }

    /**
     * @brief Require divisibility by a non-zero bigint divisor.
     * @param value Non-zero divisor.
     * @returns Fresh BigIntGuard with an appended multipleOf check.
     */
    public multipleOf(value: bigint, options?: CheckMessageInput): BigIntGuard<TPresence> {
        const schema = readBigIntMethodSchema(this, "bigint multipleOf receiver");
        return appendBigIntCheck(
            schema,
            BigIntCheckTag.MultipleOf,
            readBigIntDivisor(value, "multipleOf"),
            readCheckMessage(options)
        );
    }

    /**
     * @brief Alias for multipleOf.
     * @param value Non-zero divisor.
     * @returns Fresh BigIntGuard with an appended multipleOf check.
     */
    public step(value: bigint, options?: CheckMessageInput): BigIntGuard<TPresence> {
        return this.multipleOf(value, options);
    }

    /**
     * @brief Require a bigint greater than zero.
     * @returns Fresh BigIntGuard with `gt(0n)`.
     */
    public positive(options?: CheckMessageInput): BigIntGuard<TPresence> {
        return this.gt(0n, options);
    }

    /**
     * @brief Require a bigint greater than or equal to zero.
     * @returns Fresh BigIntGuard with `gte(0n)`.
     */
    public nonnegative(options?: CheckMessageInput): BigIntGuard<TPresence> {
        return this.gte(0n, options);
    }

    /**
     * @brief Require a bigint less than zero.
     * @returns Fresh BigIntGuard with `lt(0n)`.
     */
    public negative(options?: CheckMessageInput): BigIntGuard<TPresence> {
        return this.lt(0n, options);
    }

    /**
     * @brief Require a bigint less than or equal to zero.
     * @returns Fresh BigIntGuard with `lte(0n)`.
     */
    public nonpositive(options?: CheckMessageInput): BigIntGuard<TPresence> {
        return this.lte(0n, options);
    }
}

/**
 * @brief Append one bigint check to a schema.
 */
function appendBigIntCheck<TPresence extends Presence>(
    schema: BigIntSchema,
    tag: BigIntCheckTag,
    value: bigint,
    checkMessage: string | undefined
): BigIntGuard<TPresence> {
    return appendBigIntChecks(schema, [
        {
            tag,
            value,
            message: checkMessage
        }
    ]);
}

/**
 * @brief Append multiple bigint checks to a schema.
 */
function appendBigIntChecks<TPresence extends Presence>(
    schema: BigIntSchema,
    checks: readonly {
        readonly tag: BigIntCheckTag;
        readonly value: bigint;
        readonly message: string | undefined;
    }[]
): BigIntGuard<TPresence> {
    return new BigIntGuard<TPresence>({
        tag: SchemaTag.BigInt,
        message: schema.message,
        checks: [
            ...schema.checks,
            ...checks
        ]
    });
}

/**
 * @brief Validate a bigint bound argument.
 */
function readBigIntBound(value: unknown, label: string): bigint {
    if (typeof value !== "bigint") {
        throw new TypeError(`${label} bigint bound must be a bigint`);
    }
    return value;
}

function maxBigInt(left: bigint, right: bigint): bigint {
    return left > right ? left : right;
}

function minBigInt(left: bigint, right: bigint): bigint {
    return left < right ? left : right;
}

/**
 * @brief Validate a bigint divisor argument.
 */
function readBigIntDivisor(value: unknown, label: string): bigint {
    if (typeof value !== "bigint" || value === 0n) {
        throw new RangeError(`${label} bigint divisor must be non-zero`);
    }
    return value;
}
