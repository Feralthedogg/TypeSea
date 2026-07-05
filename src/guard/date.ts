/**
 * @file date.ts
 * @brief Date guard implementation.
 * @details Date helpers store normalized epoch-millisecond bounds so runtime
 * validation never has to read caller-owned Date objects again.
 */

import { DateCheckTag, SchemaTag } from "../kind/index.js";
import type { DateSchema } from "../schema/index.js";
import { BaseGuard } from "./base.js";
import {
    checkDateBound,
    readDateConstructorSchema,
    readDateMethodSchema
} from "./read.js";
import type { Presence } from "./types.js";

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
     * @brief Add an inclusive lower Date bound.
     * @param value Valid Date object used as the lower bound.
     * @returns Fresh DateGuard with an appended min check.
     */
    public min(value: Date): DateGuard<TPresence> {
        const schema = readDateMethodSchema(this, "date min receiver");
        return new DateGuard<TPresence>({
            tag: SchemaTag.Date,
            checks: [
                ...schema.checks,
                {
                    tag: DateCheckTag.Min,
                    value: checkDateBound(value, "min")
                }
            ]
        });
    }

    /**
     * @brief Add an inclusive upper Date bound.
     * @param value Valid Date object used as the upper bound.
     * @returns Fresh DateGuard with an appended max check.
     */
    public max(value: Date): DateGuard<TPresence> {
        const schema = readDateMethodSchema(this, "date max receiver");
        return new DateGuard<TPresence>({
            tag: SchemaTag.Date,
            checks: [
                ...schema.checks,
                {
                    tag: DateCheckTag.Max,
                    value: checkDateBound(value, "max")
                }
            ]
        });
    }
}
