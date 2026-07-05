/**
 * @file string.ts
 * @brief String guard implementation.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
 */

import { SchemaTag, StringCheckTag } from "../kind/index.js";
import { transform, type BaseDecoder } from "../decoder/index.js";
import type { StringSchema } from "../schema/index.js";
import { BaseGuard } from "./base.js";
import { isPlainRegExp } from "./props.js";
import {
    checkStringLengthBound,
    readStringConstructorSchema,
    readStringMethodSchema
} from "./read.js";
import type { Guard, Presence } from "./types.js";

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
     * @brief Require an exact string length.
     * @param value Non-negative integer length.
     * @returns Fresh StringGuard with matching min and max bounds.
     */
    public length(value: number): StringGuard<TPresence> {
        const bound = checkStringLengthBound(value, "length");
        return this.min(bound).max(bound);
    }

    /**
     * @brief Require a non-empty string.
     * @returns Fresh StringGuard with `min(1)`.
     */
    public nonempty(): StringGuard<TPresence> {
        return this.min(1);
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
     * @brief Require a fixed prefix.
     * @param value Prefix string matched at offset zero.
     * @returns Fresh StringGuard with an escaped prefix regex.
     */
    public startsWith(value: string): StringGuard<TPresence> {
        return this.regex(
            new RegExp(`^${escapeRegExpString(readStringNeedle(value, "startsWith"))}`, "u"),
            "starts_with"
        );
    }

    /**
     * @brief Require a fixed suffix.
     * @param value Suffix string matched at the end of the input.
     * @returns Fresh StringGuard with an escaped suffix regex.
     */
    public endsWith(value: string): StringGuard<TPresence> {
        return this.regex(
            new RegExp(`${escapeRegExpString(readStringNeedle(value, "endsWith"))}$`, "u"),
            "ends_with"
        );
    }

    /**
     * @brief Require a fixed substring.
     * @param value Substring that must appear in the input.
     * @returns Fresh StringGuard with an escaped substring regex.
     */
    public includes(value: string): StringGuard<TPresence> {
        return this.regex(
            new RegExp(escapeRegExpString(readStringNeedle(value, "includes")), "u"),
            "includes"
        );
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

    /**
     * @brief Add the built-in email string check.
     * @returns Fresh StringGuard with an appended email check.
     */
    public email(): StringGuard<TPresence> {
        const schema = readStringMethodSchema(this, "string email receiver");
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.Email
                }
            ]
        });
    }

    /**
     * @brief Add the built-in URL string check.
     * @returns Fresh StringGuard with an appended URL check.
     * @details The check is a deterministic grammar subset rather than a
     * throwing URL constructor call, so AOT and runtime validators agree.
     */
    public url(): StringGuard<TPresence> {
        const schema = readStringMethodSchema(this, "string url receiver");
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.Url
                }
            ]
        });
    }

    /**
     * @brief Add the built-in ISO date check.
     * @returns Fresh StringGuard with an appended ISO date check.
     */
    public isoDate(): StringGuard<TPresence> {
        const schema = readStringMethodSchema(this, "string isoDate receiver");
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.IsoDate
                }
            ]
        });
    }

    /**
     * @brief Add the built-in ISO date-time check.
     * @returns Fresh StringGuard with an appended ISO date-time check.
     */
    public isoDateTime(): StringGuard<TPresence> {
        const schema = readStringMethodSchema(this, "string isoDateTime receiver");
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.IsoDateTime
                }
            ]
        });
    }

    /**
     * @brief Add the built-in ULID string check.
     * @returns Fresh StringGuard with an appended ULID check.
     */
    public ulid(): StringGuard<TPresence> {
        const schema = readStringMethodSchema(this, "string ulid receiver");
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.Ulid
                }
            ]
        });
    }

    /**
     * @brief Add the built-in IPv4 string check.
     * @returns Fresh StringGuard with an appended IPv4 check.
     */
    public ipv4(): StringGuard<TPresence> {
        const schema = readStringMethodSchema(this, "string ipv4 receiver");
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.Ipv4
                }
            ]
        });
    }

    /**
     * @brief Add the built-in IPv6 string check.
     * @returns Fresh StringGuard with an appended IPv6 check.
     */
    public ipv6(): StringGuard<TPresence> {
        const schema = readStringMethodSchema(this, "string ipv6 receiver");
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.Ipv6
                }
            ]
        });
    }

    /**
     * @brief Decode a string and trim surrounding whitespace.
     * @returns Decoder that validates this string guard before trimming.
     */
    public trim(): BaseDecoder<string> {
        return transform(readRequiredStringGuard(this), (value: string): string =>
            trimString(value));
    }

    /**
     * @brief Decode a string and lowercase it.
     * @returns Decoder that validates this string guard before lowercasing.
     */
    public toLowerCase(): BaseDecoder<string> {
        return transform(readRequiredStringGuard(this), (value: string): string =>
            lowerString(value));
    }

    /**
     * @brief Decode a string and uppercase it.
     * @returns Decoder that validates this string guard before uppercasing.
     */
    public toUpperCase(): BaseDecoder<string> {
        return transform(readRequiredStringGuard(this), (value: string): string =>
            upperString(value));
    }
}

/**
 * @brief Narrow a StringGuard receiver to its runtime string contract.
 * @param guard StringGuard receiver after method dispatch.
 * @returns The same guard seen as a required string source for decoder transforms.
 */
function readRequiredStringGuard<TPresence extends Presence>(
    guard: StringGuard<TPresence>
): Guard<string> {
    return guard as unknown as Guard<string>;
}

function trimString(value: string): string {
    return String.prototype.trim.call(value);
}

function lowerString(value: string): string {
    return String.prototype.toLowerCase.call(value);
}

function upperString(value: string): string {
    return String.prototype.toUpperCase.call(value);
}

/**
 * @brief Read a string argument used by fixed-string predicates.
 * @param value Candidate substring value.
 * @param label Method name used in thrown errors.
 * @returns Accepted string value.
 */
function readStringNeedle(value: unknown, label: string): string {
    if (typeof value !== "string") {
        throw new TypeError(`string ${label} value must be a string`);
    }
    return value;
}

/**
 * @brief Escape a literal string for RegExp source text.
 * @param value String fragment to match literally.
 * @returns RegExp source fragment with metacharacters escaped.
 */
function escapeRegExpString(value: string): string {
    return value.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&");
}
