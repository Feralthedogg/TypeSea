/**
 * @file string.ts
 * @brief String guard implementation.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
 */

import { SchemaTag, StringCheckTag } from "../kind/index.js";
import type { StringSchema } from "../schema/index.js";
import { BaseGuard } from "./base.js";
import { isPlainRegExp } from "./props.js";
import {
    checkStringLengthBound,
    readStringConstructorSchema,
    readStringMethodSchema
} from "./read.js";
import type { Presence } from "./types.js";

/**
 * @brief Persistent builder for string predicates.
 * @details Refinement methods append schema checks and return fresh frozen
 * guards, so shared guard values cannot be mutated by later chains.
 */
export class StringGuard<
    TPresence extends Presence = "required"
> extends BaseGuard<string, TPresence> {

    /**
     * @brief Construct a frozen string guard.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
     * @param schema String schema backing this guard.
     */
    public constructor(schema: StringSchema) {
        super(readStringConstructorSchema(schema));
        Object.freeze(this);
    }

    /**
     * @brief Add a minimum string length.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
     * @param value Non-negative integer lower length bound.
     * @returns Fresh StringGuard with an appended min check.
     */
    public min(value: number): StringGuard<TPresence> {
        const schema = readStringMethodSchema(this, "string min receiver");
        const bound = checkStringLengthBound(value, "min");
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.Min,
                    value: bound
                }
            ]
        });
    }

    /**
     * @brief Add a maximum string length.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
     * @param value Non-negative integer upper length bound.
     * @returns Fresh StringGuard with an appended max check.
     */
    public max(value: number): StringGuard<TPresence> {
        const schema = readStringMethodSchema(this, "string max receiver");
        const bound = checkStringLengthBound(value, "max");
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.Max,
                    value: bound
                }
            ]
        });
    }

    /**
     * @brief Add a regular expression check.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
     * @param pattern Plain RegExp instance to clone into the schema.
     * @param name Diagnostic name for pattern failures.
     * @returns Fresh StringGuard with an appended regex check.
     */
    public regex(pattern: RegExp, name: string): StringGuard<TPresence> {
        if (!isPlainRegExp(pattern)) {
            throw new TypeError("regex pattern must be a plain RegExp");
        }
        if (typeof name !== "string") {
            throw new TypeError("regex name must be a string");
        }
        const schema = readStringMethodSchema(this, "string regex receiver");
        /*
         * Clone the pattern so later mutation of lastIndex or subclass state on
         * the caller-owned RegExp cannot affect validation.
         */
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.Regex,
                    regex: new RegExp(pattern.source, pattern.flags),
                    name
                }
            ]
        });
    }

    /**
     * @brief Add the built-in UUID string check.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
     * @returns Fresh StringGuard with an appended uuid check.
     */
    public uuid(): StringGuard<TPresence> {
        const schema = readStringMethodSchema(this, "string uuid receiver");
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.Uuid
                }
            ]
        });
    }
}
