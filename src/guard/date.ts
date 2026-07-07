/**
 * @file date.ts
 * @brief Date guard implementation.
 * @details Date helpers store normalized epoch-millisecond bounds so runtime
 * validation never has to read caller-owned Date objects again.
 */

import { DateCheckTag, SchemaTag } from "../kind/index.js";
import type { DateSchema } from "../schema/index.js";
import { BaseGuard } from "./base.js";
import { readCheckMessage } from "./check-message.js";
import {
    checkDateBound,
    readDateConstructorSchema,
    readDateMethodSchema
} from "./read.js";
import type { CheckMessageInput, Presence } from "./types.js";

/**
 * @brief Persistent builder for valid Date predicates.
 * @details Bound methods allocate fresh schema records and keep the source guard
 * immutable, matching the scalar guard discipline used by number and string.
 */
export class DateGuard<
    TPresence extends Presence = "required"
> extends BaseGuard<Date, TPresence> {

    /**
     * @brief Construct a frozen Date guard.
     * @param schema Date schema backing this guard.
     */
    public constructor(schema: DateSchema) {
        super(readDateConstructorSchema(schema));
        Object.freeze(this);
    }

    /**
     * @brief Read the compact Zod-style date type label.
     * @details The receiver is still schema-checked so detached accessors do not
     * silently report metadata for a forged object.
     * @returns Literal `date` schema label.
     */
    public override get type(): "date" {
        readDateMethodSchema(this, "date type receiver");
        return "date";
    }

    /**
     * @brief Report the strongest lower Date bound.
     * @returns Fresh Date for the lower bound, or null when unbounded.
     */
    public get minDate(): Date | null {
        const schema = readDateMethodSchema(this, "date minDate receiver");
        let bound: number | null = null;
        for (let index = 0; index < schema.checks.length; index += 1) {
            const check = schema.checks[index];
            if (check?.tag === DateCheckTag.Min) {
                bound = bound === null ? check.value : Math.max(bound, check.value);
            }
        }
        return bound === null ? null : new Date(bound);
    }

    /**
     * @brief Report the strongest upper Date bound.
     * @returns Fresh Date for the upper bound, or null when unbounded.
     */
    public get maxDate(): Date | null {
        const schema = readDateMethodSchema(this, "date maxDate receiver");
        let bound: number | null = null;
        for (let index = 0; index < schema.checks.length; index += 1) {
            const check = schema.checks[index];
            if (check?.tag === DateCheckTag.Max) {
                bound = bound === null ? check.value : Math.min(bound, check.value);
            }
        }
        return bound === null ? null : new Date(bound);
    }

    /**
     * @brief Add an inclusive lower Date bound.
     * @param value Valid Date object used as the lower bound.
     * @returns Fresh DateGuard with an appended min check.
     */
    public min(value: Date, options?: CheckMessageInput): DateGuard<TPresence> {
        const schema = readDateMethodSchema(this, "date min receiver");
        const message = readCheckMessage(options);
        return new DateGuard<TPresence>({
            tag: SchemaTag.Date,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: DateCheckTag.Min,
                    value: checkDateBound(value, "min"),
                    message
                }
            ]
        });
    }

    /**
     * @brief Add an inclusive upper Date bound.
     * @param value Valid Date object used as the upper bound.
     * @returns Fresh DateGuard with an appended max check.
     */
    public max(value: Date, options?: CheckMessageInput): DateGuard<TPresence> {
        const schema = readDateMethodSchema(this, "date max receiver");
        const message = readCheckMessage(options);
        return new DateGuard<TPresence>({
            tag: SchemaTag.Date,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: DateCheckTag.Max,
                    value: checkDateBound(value, "max"),
                    message
                }
            ]
        });
    }
}
