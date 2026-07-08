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
import { readCheckMessage } from "./check-message.js";
import { isPlainRegExp } from "./props.js";
import {
    checkStringLengthBound,
    readStringConstructorSchema,
    readStringMethodSchema
} from "./read.js";
import type {
    CheckMessageInput,
    CheckMessageOptions,
    Guard,
    Presence
} from "./types.js";

const HTTP_URL_PATTERN = /^https?:\/\/[^\s/?#]+(?:[/?#][^\s]*)?$/iu;
const HOSTNAME_PATTERN =
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.?$/iu;
const E164_PATTERN = /^\+[1-9]\d{1,14}$/u;
const EMOJI_PATTERN =
    /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0E|\uFE0F)?(?:\u200D(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0E|\uFE0F)?)*$/u;
const BASE64_PATTERN =
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const BASE64_URL_PATTERN =
    /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2}(?:==)?|[A-Za-z0-9_-]{3}=?)?$/u;
const HEX_PATTERN = /^(?:[0-9a-f]{2})*$/iu;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/u;
const NANOID_PATTERN = /^[A-Za-z0-9_-]{21}$/u;
const CUID_PATTERN = /^c[a-z0-9]{24}$/u;
const CUID2_PATTERN = /^[a-z][a-z0-9]{1,31}$/u;
const MAC_COLON_PATTERN = /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/iu;
const MAC_DASH_PATTERN = /^(?:[0-9a-f]{2}-){5}[0-9a-f]{2}$/iu;
const CIDR_V4_PATTERN =
    /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\/(?:3[0-2]|[12]?\d)$/u;
const CIDR_V6_PATTERN =
    /^(?:(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,7}:|(?:[0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,5}(?::[0-9a-f]{1,4}){1,2}|(?:[0-9a-f]{1,4}:){1,4}(?::[0-9a-f]{1,4}){1,3}|(?:[0-9a-f]{1,4}:){1,3}(?::[0-9a-f]{1,4}){1,4}|(?:[0-9a-f]{1,4}:){1,2}(?::[0-9a-f]{1,4}){1,5}|[0-9a-f]{1,4}:(?:(?::[0-9a-f]{1,4}){1,6})|:(?:(?::[0-9a-f]{1,4}){1,7}|:))\/(?:12[0-8]|1[01]\d|[1-9]?\d)$/iu;
const ISO_TIME_PATTERN =
    /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/u;
const ISO_DURATION_PATTERN =
    /^P(?=\d|T\d)(?:\d+(?:[.,]\d+)?Y)?(?:\d+(?:[.,]\d+)?M)?(?:\d+(?:[.,]\d+)?W)?(?:\d+(?:[.,]\d+)?D)?(?:T(?:\d+(?:[.,]\d+)?H)?(?:\d+(?:[.,]\d+)?M)?(?:\d+(?:[.,]\d+)?S)?)?$/u;
const GUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const UUID_V4_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UUID_V6_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-6[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UUID_V7_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UPPERCASE_PATTERN = /^\P{Ll}*$/u;
const LOWERCASE_PATTERN = /^\P{Lu}*$/u;

export type StringUuidVersion =
    | "v1"
    | "v2"
    | "v3"
    | "v4"
    | "v5"
    | "v6"
    | "v7"
    | "v8";

export interface StringUuidOptions {
    readonly version: StringUuidVersion | undefined;
}

export interface StringEmailOptions {
    readonly pattern: RegExp | undefined;
}

export interface StringUrlOptions {
    readonly protocol: RegExp | undefined;
    readonly hostname: RegExp | undefined;
    readonly normalize: boolean | undefined;
}

export interface StringIsoDateTimeOptions {
    readonly offset: boolean | undefined;
    readonly local: boolean | undefined;
    readonly precision: number | undefined;
}

export interface StringIsoTimeOptions {
    readonly precision: number | undefined;
}

export type StringMacDelimiter = ":" | "-";

export interface StringMacOptions {
    readonly delimiter: StringMacDelimiter | undefined;
}

export interface StringJwtOptions {
    readonly alg: string | undefined;
}

export type StringHashAlgorithm =
    | "md5"
    | "sha1"
    | "sha256"
    | "sha384"
    | "sha512";

export type StringHashEncoding =
    | "hex"
    | "base64"
    | "base64url";

export interface StringHashOptions {
    readonly enc: StringHashEncoding | undefined;
}

export type StringNormalizationForm =
    | "NFC"
    | "NFD"
    | "NFKC"
    | "NFKD";

type StringUuidInput = (Partial<StringUuidOptions> & CheckMessageOptions) | CheckMessageInput;
type StringEmailInput = (Partial<StringEmailOptions> & CheckMessageOptions) | CheckMessageInput;
type StringUrlInput = Partial<StringUrlOptions> & CheckMessageOptions;
type StringIsoDateTimeInput = Partial<StringIsoDateTimeOptions> & CheckMessageOptions;
type StringIsoTimeInput = Partial<StringIsoTimeOptions> & CheckMessageOptions;
type StringMacInput = StringMacDelimiter | (Partial<StringMacOptions> & CheckMessageOptions);
type StringJwtInput = Partial<StringJwtOptions> & CheckMessageOptions;
type StringHashInput = Partial<StringHashOptions> & CheckMessageOptions;

/**
 * @brief Persistent builder for string predicates.
 * @details Refinement methods append schema checks and return fresh frozen
 * guards, so shared guard values cannot be mutated by later chains.
 */
export class StringGuard<
    TPresence extends Presence = "required",
    TValue extends string = string
> extends BaseGuard<TValue, TPresence> {

    /**
     * @brief Construct a frozen string guard.
     * @param schema String schema backing this guard.
     */
    public constructor(schema: StringSchema) {
        super(readStringConstructorSchema(schema));
        Object.freeze(this);
    }

    /**
     * @brief Read the compact Zod-style string type label.
     * @details The receiver is still schema-checked so detached accessors do not
     * silently report metadata for a forged object.
     * @returns Literal `string` schema label.
     */
    public override get type(): "string" {
        readStringMethodSchema(this, "string type receiver");
        return "string";
    }

    /**
     * @brief Report the last string format check.
     * @details Length checks and substring checks do not contribute to this
     * metadata. Generic regex checks report `regex`.
     * @returns Zod-style format name, or null when no format check exists.
     */
    public get format(): string | null {
        const schema = readStringMethodSchema(this, "string format receiver");
        let format: string | null = null;
        for (let index = 0; index < schema.checks.length; index += 1) {
            const check = schema.checks[index];
            if (check === undefined) {
                continue;
            }
            switch (check.tag) {
                case StringCheckTag.Regex: {
                    const regexFormat = readRegexFormat(check.name);
                    format = regexFormat ?? format;
                    break;
                }
                case StringCheckTag.Uuid:
                    format = "uuid";
                    break;
                case StringCheckTag.Email:
                    format = "email";
                    break;
                case StringCheckTag.Url:
                    format = "url";
                    break;
                case StringCheckTag.IsoDate:
                    format = "date";
                    break;
                case StringCheckTag.IsoDateTime:
                    format = "datetime";
                    break;
                case StringCheckTag.Ulid:
                    format = "ulid";
                    break;
                case StringCheckTag.Xid:
                    format = "xid";
                    break;
                case StringCheckTag.Ksuid:
                    format = "ksuid";
                    break;
                case StringCheckTag.Ipv4:
                    format = "ipv4";
                    break;
                case StringCheckTag.Ipv6:
                    format = "ipv6";
                    break;
            }
        }
        return format;
    }

    /**
     * @brief Report the strongest lower string length bound.
     * @details Mirrors Zod's metadata property without changing validation.
     * @returns Minimum accepted length, or null when no lower bound exists.
     */
    public get minLength(): number | null {
        const schema = readStringMethodSchema(this, "string minLength receiver");
        let bound: number | null = null;
        for (let index = 0; index < schema.checks.length; index += 1) {
            const check = schema.checks[index];
            if (check?.tag === StringCheckTag.Min) {
                bound = bound === null ? check.value : Math.max(bound, check.value);
            }
        }
        return bound;
    }

    /**
     * @brief Report the strongest upper string length bound.
     * @details Mirrors Zod's metadata property without changing validation.
     * @returns Maximum accepted length, or null when no upper bound exists.
     */
    public get maxLength(): number | null {
        const schema = readStringMethodSchema(this, "string maxLength receiver");
        let bound: number | null = null;
        for (let index = 0; index < schema.checks.length; index += 1) {
            const check = schema.checks[index];
            if (check?.tag === StringCheckTag.Max) {
                bound = bound === null ? check.value : Math.min(bound, check.value);
            }
        }
        return bound;
    }

    /**
     * @brief Add a minimum string length.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
     * @param value Non-negative integer lower length bound.
     * @returns Fresh StringGuard with an appended min check.
     */
    public min(value: number, options?: CheckMessageInput): StringGuard<TPresence> {
        const schema = readStringMethodSchema(this, "string min receiver");
        const bound = checkStringLengthBound(value, "min");
        const message = readCheckMessage(options);
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.Min,
                    value: bound,
                    message
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
    public max(value: number, options?: CheckMessageInput): StringGuard<TPresence> {
        const schema = readStringMethodSchema(this, "string max receiver");
        const bound = checkStringLengthBound(value, "max");
        const message = readCheckMessage(options);
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.Max,
                    value: bound,
                    message
                }
            ]
        });
    }

    /**
     * @brief Require an exact string length.
     * @param value Non-negative integer length.
     * @returns Fresh StringGuard with matching min and max bounds.
     */
    public length(value: number, options?: CheckMessageInput): StringGuard<TPresence> {
        const schema = readStringMethodSchema(this, "string length receiver");
        const bound = checkStringLengthBound(value, "length");
        const message = readCheckMessage(options);
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.Min,
                    value: bound,
                    message
                },
                {
                    tag: StringCheckTag.Max,
                    value: bound,
                    message
                }
            ]
        });
    }

    /**
     * @brief Require a non-empty string.
     * @returns Fresh StringGuard with `min(1)`.
     */
    public nonempty(options?: CheckMessageInput): StringGuard<TPresence> {
        const schema = readStringMethodSchema(this, "string nonempty receiver");
        const message = readCheckMessage(options);
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.Min,
                    value: 1,
                    message
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
    public regex(
        pattern: RegExp,
        name: string,
        options?: CheckMessageInput
    ): StringGuard<TPresence> {
        if (!isPlainRegExp(pattern)) {
            throw new TypeError("regex pattern must be a plain RegExp");
        }
        if (typeof name !== "string") {
            throw new TypeError("regex name must be a string");
        }
        const schema = readStringMethodSchema(this, "string regex receiver");
        const message = readCheckMessage(options);
        /*
         * Clone the pattern so later mutation of lastIndex or subclass state on
         * the caller-owned RegExp cannot affect validation.
         */
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.Regex,
                    regex: new RegExp(pattern.source, pattern.flags),
                    name,
                    message
                }
            ]
        });
    }

    /**
     * @brief Require a fixed prefix.
     * @param value Prefix string matched at offset zero.
     * @returns Fresh StringGuard with an escaped prefix regex.
     */
    public startsWith(value: string, options?: CheckMessageInput): StringGuard<TPresence> {
        return this.regex(
            new RegExp(`^${escapeRegExpString(readStringNeedle(value, "startsWith"))}`, "u"),
            "starts_with",
            options
        );
    }

    /**
     * @brief Require a fixed suffix.
     * @param value Suffix string matched at the end of the input.
     * @returns Fresh StringGuard with an escaped suffix regex.
     */
    public endsWith(value: string, options?: CheckMessageInput): StringGuard<TPresence> {
        return this.regex(
            new RegExp(`${escapeRegExpString(readStringNeedle(value, "endsWith"))}$`, "u"),
            "ends_with",
            options
        );
    }

    /**
     * @brief Require a fixed substring.
     * @param value Substring that must appear in the input.
     * @returns Fresh StringGuard with an escaped substring regex.
     */
    public includes(value: string, options?: CheckMessageInput): StringGuard<TPresence> {
        return this.regex(
            new RegExp(escapeRegExpString(readStringNeedle(value, "includes")), "u"),
            "includes",
            options
        );
    }

    /**
     * @brief Require a string with no lowercase code points.
     * @returns Fresh StringGuard with an appended uppercase check.
     */
    public uppercase(options?: CheckMessageInput): StringGuard<TPresence> {
        return this.regex(UPPERCASE_PATTERN, "uppercase", options);
    }

    /**
     * @brief Require a string with no uppercase code points.
     * @returns Fresh StringGuard with an appended lowercase check.
     */
    public lowercase(options?: CheckMessageInput): StringGuard<TPresence> {
        return this.regex(LOWERCASE_PATTERN, "lowercase", options);
    }

    /**
     * @brief Add the built-in UUID string check.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
     * @returns Fresh StringGuard with an appended uuid check.
     */
    public uuid(options?: StringUuidInput): StringGuard<TPresence> {
        const version = readUuidVersion(options);
        const message = readCheckMessage(options);
        if (version !== undefined) {
            return this.regex(uuidVersionPattern(version), `uuid_${version}`, message);
        }
        const schema = readStringMethodSchema(this, "string uuid receiver");
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.Uuid,
                    message
                }
            ]
        });
    }

    /**
     * @brief Require a UUID-like GUID without version or variant enforcement.
     * @returns Fresh StringGuard with an appended GUID regex check.
     */
    public guid(options?: CheckMessageInput): StringGuard<TPresence> {
        return this.regex(GUID_PATTERN, "guid", options);
    }

    /**
     * @brief Require a version 4 RFC UUID.
     * @returns Fresh StringGuard with an appended UUID v4 regex check.
     */
    public uuidv4(options?: CheckMessageInput): StringGuard<TPresence> {
        return this.regex(UUID_V4_PATTERN, "uuidv4", options);
    }

    /**
     * @brief Require a version 6 RFC UUID.
     * @returns Fresh StringGuard with an appended UUID v6 regex check.
     */
    public uuidv6(options?: CheckMessageInput): StringGuard<TPresence> {
        return this.regex(UUID_V6_PATTERN, "uuidv6", options);
    }

    /**
     * @brief Require a version 7 RFC UUID.
     * @returns Fresh StringGuard with an appended UUID v7 regex check.
     */
    public uuidv7(options?: CheckMessageInput): StringGuard<TPresence> {
        return this.regex(UUID_V7_PATTERN, "uuidv7", options);
    }

    /**
     * @brief Add the built-in email string check.
     * @returns Fresh StringGuard with an appended email check.
     */
    public email(options?: StringEmailInput): StringGuard<TPresence> {
        const pattern = readOptionalPlainRegExp(readOption(options, "pattern"), "email pattern");
        const message = readCheckMessage(options);
        if (pattern !== undefined) {
            return this.regex(pattern, "email", message);
        }
        const schema = readStringMethodSchema(this, "string email receiver");
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.Email,
                    message
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
    public url(options: StringUrlInput & { readonly normalize: true }): BaseDecoder<string>;

    public url(options?: StringUrlInput): StringGuard<TPresence>;

    public url(
        options?: StringUrlInput
    ): StringGuard<TPresence> | BaseDecoder<string> {
        const protocol = readOptionalPlainRegExp(readOption(options, "protocol"), "url protocol");
        const hostname = readOptionalPlainRegExp(readOption(options, "hostname"), "url hostname");
        const normalize = readUrlNormalize(options);
        const message = readCheckMessage(options);
        if (normalize) {
            return normalizedUrlDecoder(
                this.refine(
                    (value): boolean =>
                        typeof value === "string" &&
                        canParseUrl(value) &&
                        urlMatchesOptions(value, protocol, hostname),
                    message === undefined ? "url" : { error: message }
                )
            );
        }
        if (protocol !== undefined || hostname !== undefined) {
            return this.regex(buildUrlPattern(protocol, hostname), "url", message);
        }
        const schema = readStringMethodSchema(this, "string url receiver");
        const guard = new StringGuard<TPresence>({
            tag: SchemaTag.String,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.Url,
                    message
                }
            ]
        });
        return guard;
    }

    /**
     * @brief Require an HTTP or HTTPS URL string.
     * @returns Fresh StringGuard with an appended HTTP URL regex check.
     */
    public httpUrl(options?: CheckMessageInput): StringGuard<TPresence> {
        return this.regex(HTTP_URL_PATTERN, "http_url", options);
    }

    /**
     * @brief Require an RFC-style hostname string.
     * @returns Fresh StringGuard with an appended hostname regex check.
     */
    public hostname(options?: CheckMessageInput): StringGuard<TPresence> {
        return this.regex(HOSTNAME_PATTERN, "hostname", options);
    }

    /**
     * @brief Require an E.164 phone number string.
     * @returns Fresh StringGuard with an appended E.164 regex check.
     */
    public e164(options?: CheckMessageInput): StringGuard<TPresence> {
        return this.regex(E164_PATTERN, "e164", options);
    }

    /**
     * @brief Require a single emoji grapheme-like sequence.
     * @returns Fresh StringGuard with an appended emoji regex check.
     */
    public emoji(options?: CheckMessageInput): StringGuard<TPresence> {
        return this.regex(EMOJI_PATTERN, "emoji", options);
    }

    /**
     * @brief Require a base64 string.
     * @returns Fresh StringGuard with an appended base64 regex check.
     */
    public base64(options?: CheckMessageInput): StringGuard<TPresence> {
        return this.regex(BASE64_PATTERN, "base64", options);
    }

    /**
     * @brief Require a URL-safe base64 string.
     * @returns Fresh StringGuard with an appended base64url regex check.
     */
    public base64url(options?: CheckMessageInput): StringGuard<TPresence> {
        return this.regex(BASE64_URL_PATTERN, "base64url", options);
    }

    /**
     * @brief Require an even-length hexadecimal byte string.
     * @returns Fresh StringGuard with an appended hex regex check.
     */
    public hex(options?: CheckMessageInput): StringGuard<TPresence> {
        return this.regex(HEX_PATTERN, "hex", options);
    }

    /**
     * @brief Require a compact JWT string.
     * @returns Fresh StringGuard with an appended JWT regex check.
     */
    public jwt(options?: CheckMessageInput): StringGuard<TPresence>;

    public jwt(options: StringJwtInput): BaseGuard<string, TPresence>;

    public jwt(
        options?: StringJwtInput | CheckMessageInput
    ): StringGuard<TPresence> | BaseGuard<string, TPresence> {
        const message = readCheckMessage(options);
        const guard = this.regex(JWT_PATTERN, "jwt", message);
        const alg = readJwtAlgorithm(options);
        if (alg === undefined) {
            return guard;
        }
        return guard.refine(
            (value): boolean => typeof value === "string" && jwtHasAlgorithm(value, alg),
            message === undefined ? "jwt_alg" : { error: message }
        );
    }

    /**
     * @brief Require a default-length nanoid string.
     * @returns Fresh StringGuard with an appended nanoid regex check.
     */
    public nanoid(options?: CheckMessageInput): StringGuard<TPresence> {
        return this.regex(NANOID_PATTERN, "nanoid", options);
    }

    /**
     * @brief Require a CUID v1 string.
     * @returns Fresh StringGuard with an appended CUID regex check.
     */
    public cuid(options?: CheckMessageInput): StringGuard<TPresence> {
        return this.regex(CUID_PATTERN, "cuid", options);
    }

    /**
     * @brief Require a CUID2-style string.
     * @returns Fresh StringGuard with an appended CUID2 regex check.
     */
    public cuid2(options?: CheckMessageInput): StringGuard<TPresence> {
        return this.regex(CUID2_PATTERN, "cuid2", options);
    }

    /**
     * @brief Require an XID string.
     * @returns Fresh StringGuard with an appended XID regex check.
     */
    public xid(options?: CheckMessageInput): StringGuard<TPresence> {
        const schema = readStringMethodSchema(this, "string xid receiver");
        const message = readCheckMessage(options);
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.Xid,
                    message
                }
            ]
        });
    }

    /**
     * @brief Require a KSUID string.
     * @returns Fresh StringGuard with an appended KSUID regex check.
     */
    public ksuid(options?: CheckMessageInput): StringGuard<TPresence> {
        const schema = readStringMethodSchema(this, "string ksuid receiver");
        const message = readCheckMessage(options);
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.Ksuid,
                    message
                }
            ]
        });
    }

    /**
     * @brief Require a 48-bit MAC address string.
     * @param delimiter Optional delimiter, either ":" or "-".
     * @returns Fresh StringGuard with an appended MAC regex check.
     */
    public mac(
        delimiter: StringMacInput = ":"
    ): StringGuard<TPresence> {
        const selected = readMacDelimiter(delimiter);
        const message = readCheckMessage(typeof delimiter === "string" ? undefined : delimiter);
        if (selected === ":") {
            return this.regex(MAC_COLON_PATTERN, "mac", message);
        }
        return this.regex(MAC_DASH_PATTERN, "mac", message);
    }

    /**
     * @brief Require an IPv4 CIDR block string.
     * @returns Fresh StringGuard with an appended IPv4 CIDR regex check.
     */
    public cidrv4(options?: CheckMessageInput): StringGuard<TPresence> {
        return this.regex(CIDR_V4_PATTERN, "cidrv4", options);
    }

    /**
     * @brief Require an IPv6 CIDR block string.
     * @returns Fresh StringGuard with an appended IPv6 CIDR regex check.
     */
    public cidrv6(options?: CheckMessageInput): StringGuard<TPresence> {
        return this.regex(CIDR_V6_PATTERN, "cidrv6", options);
    }

    /**
     * @brief Add the built-in ISO date check.
     * @returns Fresh StringGuard with an appended ISO date check.
     */
    public isoDate(options?: CheckMessageInput): StringGuard<TPresence> {
        const schema = readStringMethodSchema(this, "string isoDate receiver");
        const message = readCheckMessage(options);
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.IsoDate,
                    message
                }
            ]
        });
    }

    /**
     * @brief Zod-compatible alias for ISO date strings.
     * @param options Optional diagnostic message.
     * @returns Fresh StringGuard with an appended ISO date check.
     */
    public date(options?: CheckMessageInput): StringGuard<TPresence> {
        return this.isoDate(options);
    }

    /**
     * @brief Add the built-in ISO date-time check.
     * @returns Fresh StringGuard with an appended ISO date-time check.
     */
    public isoDateTime(options?: StringIsoDateTimeInput): StringGuard<TPresence> {
        const message = readCheckMessage(options);
        if (hasOptionsPayload(options, ["offset", "local", "precision"])) {
            return this.regex(buildIsoDateTimePattern(readIsoDateTimeOptions(options)), "iso_datetime", message);
        }
        const schema = readStringMethodSchema(this, "string isoDateTime receiver");
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.IsoDateTime,
                    message
                }
            ]
        });
    }

    /**
     * @brief Zod-compatible alias for ISO date-time strings.
     * @param options Date-time grammar and diagnostic options.
     * @returns Fresh StringGuard with an appended ISO date-time check.
     */
    public datetime(options?: StringIsoDateTimeInput): StringGuard<TPresence> {
        return this.isoDateTime(options);
    }

    /**
     * @brief Add the built-in ISO time check.
     * @returns Fresh StringGuard with an appended ISO time regex check.
     */
    public isoTime(options?: StringIsoTimeInput): StringGuard<TPresence> {
        const message = readCheckMessage(options);
        if (hasOptionsPayload(options, ["precision"])) {
            return this.regex(
                buildIsoTimePattern(readIsoTimePrecision(options)),
                "iso_time",
                message
            );
        }
        return this.regex(ISO_TIME_PATTERN, "iso_time", message);
    }

    /**
     * @brief Zod-compatible alias for ISO time strings.
     * @param options Time grammar and diagnostic options.
     * @returns Fresh StringGuard with an appended ISO time check.
     */
    public time(options?: StringIsoTimeInput): StringGuard<TPresence> {
        return this.isoTime(options);
    }

    /**
     * @brief Add the built-in ISO duration check.
     * @returns Fresh StringGuard with an appended ISO duration regex check.
     */
    public isoDuration(options?: CheckMessageInput): StringGuard<TPresence> {
        return this.regex(ISO_DURATION_PATTERN, "iso_duration", options);
    }

    /**
     * @brief Zod-compatible alias for ISO duration strings.
     * @param options Optional diagnostic message.
     * @returns Fresh StringGuard with an appended ISO duration check.
     */
    public duration(options?: CheckMessageInput): StringGuard<TPresence> {
        return this.isoDuration(options);
    }

    /**
     * @brief Add the built-in ULID string check.
     * @returns Fresh StringGuard with an appended ULID check.
     */
    public ulid(options?: CheckMessageInput): StringGuard<TPresence> {
        const schema = readStringMethodSchema(this, "string ulid receiver");
        const message = readCheckMessage(options);
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.Ulid,
                    message
                }
            ]
        });
    }

    /**
     * @brief Add the built-in IPv4 string check.
     * @returns Fresh StringGuard with an appended IPv4 check.
     */
    public ipv4(options?: CheckMessageInput): StringGuard<TPresence> {
        const schema = readStringMethodSchema(this, "string ipv4 receiver");
        const message = readCheckMessage(options);
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.Ipv4,
                    message
                }
            ]
        });
    }

    /**
     * @brief Add the built-in IPv6 string check.
     * @returns Fresh StringGuard with an appended IPv6 check.
     */
    public ipv6(options?: CheckMessageInput): StringGuard<TPresence> {
        const schema = readStringMethodSchema(this, "string ipv6 receiver");
        const message = readCheckMessage(options);
        return new StringGuard<TPresence>({
            tag: SchemaTag.String,
            message: schema.message,
            checks: [
                ...schema.checks,
                {
                    tag: StringCheckTag.Ipv6,
                    message
                }
            ]
        });
    }

    /**
     * @brief Require a cryptographic hash string.
     * @param algorithm Hash algorithm whose encoded digest length is enforced.
     * @param options Optional output encoding, defaulting to hex.
     * @returns Fresh StringGuard with an appended hash regex check.
     */
    public hash(
        algorithm: StringHashAlgorithm,
        options?: StringHashInput
    ): StringGuard<TPresence> {
        const config = readHashConfig(algorithm, options);
        const message = readCheckMessage(options);
        return this.regex(
            makeHashPattern(config.bytes, config.enc),
            `hash_${algorithm}_${config.enc}`,
            message
        );
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

    /**
     * @brief Decode a string into a URL slug.
     * @returns Decoder that validates this string guard before slugifying.
     */
    public slugify(): BaseDecoder<string> {
        return transform(readRequiredStringGuard(this), (value: string): string =>
            slugifyString(value));
    }

    /**
     * @brief Decode a string and apply Unicode normalization.
     * @param form Normalization form, defaulting to NFC.
     * @returns Decoder that validates this string guard before normalizing.
     */
    public normalize(form: StringNormalizationForm = "NFC"): BaseDecoder<string> {
        const normalizedForm = readNormalizationForm(form);
        return transform(readRequiredStringGuard(this), (value: string): string =>
            normalizeString(value, normalizedForm));
    }
}

interface HashConfig {
    readonly bytes: number;
    readonly enc: StringHashEncoding;
}

/**
 * @brief Narrow a StringGuard receiver to its runtime string contract.
 * @param guard StringGuard receiver after method dispatch.
 * @returns The same guard seen as a required string source for decoder transforms.
 */
function readRequiredStringGuard<TPresence extends Presence>(
    guard: StringGuard<TPresence>
): Guard<string> {
    return new StringGuard(readStringMethodSchema(guard, "string decoder receiver"));
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

function slugifyString(value: string): string {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function normalizeString(value: string, form: StringNormalizationForm): string {
    return String.prototype.normalize.call(value, form);
}

function readNormalizationForm(value: unknown): StringNormalizationForm {
    if (value === "NFC" || value === "NFD" || value === "NFKC" || value === "NFKD") {
        return value;
    }
    throw new TypeError("string normalize form must be NFC, NFD, NFKC, or NFKD");
}

function readRegexFormat(name: string): string | null {
    if (name.startsWith("hash_")) {
        return name.slice(5);
    }
    if (name.startsWith("uuid_")) {
        return "uuid";
    }
    switch (name) {
        case "starts_with":
        case "ends_with":
        case "includes":
            return null;
        case "http_url":
            return "url";
        case "uuidv4":
        case "uuidv6":
        case "uuidv7":
            return "uuid";
        case "iso_date":
            return "date";
        case "iso_datetime":
            return "datetime";
        case "iso_time":
            return "time";
        case "iso_duration":
            return "duration";
        case "email":
        case "url":
        case "guid":
        case "hostname":
        case "e164":
        case "emoji":
        case "base64":
        case "base64url":
        case "hex":
        case "jwt":
        case "nanoid":
        case "cuid":
        case "cuid2":
        case "mac":
        case "cidrv4":
        case "cidrv6":
        case "uppercase":
        case "lowercase":
            return name;
        default:
            return "regex";
    }
}

function readHashConfig(
    algorithm: StringHashAlgorithm,
    options: StringHashInput | undefined
): HashConfig {
    return {
        bytes: readHashByteLength(algorithm),
        enc: readHashEncoding(options)
    };
}

function readHashByteLength(algorithm: StringHashAlgorithm): number {
    switch (algorithm) {
        case "md5":
            return 16;
        case "sha1":
            return 20;
        case "sha256":
            return 32;
        case "sha384":
            return 48;
        case "sha512":
            return 64;
        default:
            throw new TypeError("hash algorithm must be md5, sha1, sha256, sha384, or sha512");
    }
}

function readHashEncoding(
    options: StringHashInput | undefined
): StringHashEncoding {
    const enc = readOption(options, "enc");
    if (enc === undefined) {
        return "hex";
    }
    if (enc === "hex" || enc === "base64" || enc === "base64url") {
        return enc;
    }
    throw new TypeError("hash encoding must be hex, base64, or base64url");
}

function makeHashPattern(bytes: number, enc: StringHashEncoding): RegExp {
    switch (enc) {
        case "hex":
            return new RegExp(`^[0-9a-f]{${String(bytes * 2)}}$`, "iu");
        case "base64":
            return new RegExp(
                `^[A-Za-z0-9+/]{${String(base64BodyLength(bytes))}}${base64Padding(bytes)}$`,
                "u"
            );
        case "base64url":
            return new RegExp(`^[A-Za-z0-9_-]{${String(base64UrlLength(bytes))}}$`, "u");
    }
}

function base64BodyLength(bytes: number): number {
    const fullTriples = Math.floor(bytes / 3);
    const remainder = bytes % 3;
    return fullTriples * 4 + (remainder === 0 ? 0 : remainder + 1);
}

function base64Padding(bytes: number): string {
    switch (bytes % 3) {
        case 1:
            return "==";
        case 2:
            return "=";
        default:
            return "";
    }
}

function base64UrlLength(bytes: number): number {
    const fullTriples = Math.floor(bytes / 3);
    const remainder = bytes % 3;
    return fullTriples * 4 + (remainder === 0 ? 0 : remainder + 1);
}

function readUuidVersion(
    options: StringUuidInput | undefined
): StringUuidVersion | undefined {
    const version = readOption(options, "version");
    if (version === undefined) {
        return undefined;
    }
    if (typeof version !== "string") {
        throw new TypeError("uuid version must be v1, v2, v3, v4, v5, v6, v7, or v8");
    }
    switch (version) {
        case "v1":
        case "v2":
        case "v3":
        case "v4":
        case "v5":
        case "v6":
        case "v7":
        case "v8":
            return version;
        default:
            throw new TypeError("uuid version must be v1, v2, v3, v4, v5, v6, v7, or v8");
    }
}

function uuidVersionPattern(version: StringUuidVersion): RegExp {
    const nibble = version.slice(1);
    return new RegExp(
        `^[0-9a-f]{8}-[0-9a-f]{4}-${nibble}[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,
        "iu"
    );
}

function readOptionalPlainRegExp(value: unknown, label: string): RegExp | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!isPlainRegExp(value)) {
        throw new TypeError(`${label} must be a plain RegExp`);
    }
    return value;
}

function readOption(
    options: unknown,
    key: string
): unknown {
    if (typeof options !== "object" || options === null || Array.isArray(options)) {
        return undefined;
    }
    return Object.getOwnPropertyDescriptor(options, key)?.value;
}

function hasOptionsPayload(
    options: unknown,
    keys: readonly string[]
): boolean {
    if (typeof options !== "object" || options === null || Array.isArray(options)) {
        return false;
    }
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key !== undefined && Object.prototype.hasOwnProperty.call(options, key)) {
            return true;
        }
    }
    return false;
}

function readUrlNormalize(options: StringUrlInput | undefined): boolean {
    const value = readOption(options, "normalize");
    if (value === undefined || value === false) {
        return false;
    }
    if (value === true) {
        return true;
    }
    throw new TypeError("url normalize must be a boolean");
}

function readIsoDateTimeOptions(
    options: StringIsoDateTimeInput | undefined
): Partial<StringIsoDateTimeOptions> {
    return options ?? {};
}

function readIsoTimePrecision(
    options: StringIsoTimeInput | undefined
): number | undefined {
    const precision = readOption(options, "precision");
    if (precision === undefined || typeof precision === "number") {
        return precision;
    }
    throw new TypeError("iso time precision must be an integer greater than or equal to -1");
}

function normalizedUrlDecoder(
    guard: BaseGuard<string, Presence>
): BaseDecoder<string> {
    return guard.transform((value): string =>
        typeof value === "string" ? normalizeUrl(value) : "");
}

function canParseUrl(value: string): boolean {
    return typeof URL === "function" &&
        typeof URL.canParse === "function" &&
        URL.canParse(value);
}

function normalizeUrl(value: string): string {
    return new URL(value).href;
}

function urlMatchesOptions(
    value: string,
    protocol: RegExp | undefined,
    hostname: RegExp | undefined
): boolean {
    const url = new URL(value);
    if (protocol !== undefined) {
        protocol.lastIndex = 0;
        if (!protocol.test(url.protocol.endsWith(":")
            ? url.protocol.slice(0, -1)
            : url.protocol)) {
            return false;
        }
    }
    if (hostname !== undefined) {
        hostname.lastIndex = 0;
        if (!hostname.test(url.hostname)) {
            return false;
        }
    }
    return true;
}

function readMacDelimiter(
    input: unknown
): StringMacDelimiter {
    const raw: unknown = typeof input === "object"
        ? input === null
            ? undefined
            : Object.getOwnPropertyDescriptor(input, "delimiter")?.value
        : input;
    if (raw === undefined || raw === ":") {
        return ":";
    }
    if (raw === "-") {
        return "-";
    }
    throw new TypeError("mac delimiter must be ':' or '-'");
}

function readJwtAlgorithm(
    options: StringJwtInput | CheckMessageInput | undefined
): string | undefined {
    const alg = readOption(options, "alg");
    if (alg === undefined) {
        return undefined;
    }
    if (typeof alg !== "string" || alg.length === 0) {
        throw new TypeError("jwt alg must be a non-empty string");
    }
    return alg;
}

function jwtHasAlgorithm(value: string, alg: string): boolean {
    const firstDot = value.indexOf(".");
    if (firstDot <= 0) {
        return false;
    }
    const header = decodeBase64UrlText(value.slice(0, firstDot));
    if (header === undefined) {
        return false;
    }
    return readJsonObjectStringProperty(header, "alg") === alg;
}

function decodeBase64UrlText(value: string): string | undefined {
    if (value.length % 4 === 1) {
        return undefined;
    }
    let bits = 0;
    let bitCount = 0;
    let output = "";
    for (let index = 0; index < value.length; index += 1) {
        const code = readBase64UrlSextet(value.charCodeAt(index));
        if (code < 0) {
            return undefined;
        }
        bits = (bits << 6) | code;
        bitCount += 6;
        if (bitCount >= 8) {
            bitCount -= 8;
            output += String.fromCharCode((bits >> bitCount) & 0xff);
        }
    }
    return output;
}

function readBase64UrlSextet(code: number): number {
    if (code >= 65 && code <= 90) {
        return code - 65;
    }
    if (code >= 97 && code <= 122) {
        return code - 71;
    }
    if (code >= 48 && code <= 57) {
        return code + 4;
    }
    if (code === 45) {
        return 62;
    }
    if (code === 95) {
        return 63;
    }
    return -1;
}

function readJsonObjectStringProperty(source: string, property: string): string | undefined {
    let index = skipJsonWhitespace(source, 0);
    if (source.charCodeAt(index) !== 123) {
        return undefined;
    }
    index += 1;
    let found: string | undefined;
    for (;;) {
        index = skipJsonWhitespace(source, index);
        if (source.charCodeAt(index) === 125) {
            index = skipJsonWhitespace(source, index + 1);
            return index === source.length ? found : undefined;
        }
        const key = readJsonString(source, index);
        if (key === undefined) {
            return undefined;
        }
        index = skipJsonWhitespace(source, key.next);
        if (source.charCodeAt(index) !== 58) {
            return undefined;
        }
        index = skipJsonWhitespace(source, index + 1);
        if (key.value === property) {
            const value = readJsonString(source, index);
            if (value === undefined) {
                return undefined;
            }
            index = skipJsonWhitespace(source, value.next);
            found = value.value;
        } else {
            const next = skipJsonValue(source, index);
            if (next < 0) {
                return undefined;
            }
            index = skipJsonWhitespace(source, next);
        }
        if (source.charCodeAt(index) === 44) {
            index += 1;
            continue;
        }
        if (source.charCodeAt(index) === 125) {
            index = skipJsonWhitespace(source, index + 1);
            return index === source.length ? found : undefined;
        }
        return undefined;
    }
}

function readJsonString(
    source: string,
    start: number
): { readonly value: string; readonly next: number } | undefined {
    if (source.charCodeAt(start) !== 34) {
        return undefined;
    }
    let value = "";
    for (let index = start + 1; index < source.length; index += 1) {
        const code = source.charCodeAt(index);
        if (code === 34) {
            return {
                value,
                next: index + 1
            };
        }
        if (code === 92) {
            const escaped = readJsonEscape(source, index + 1);
            if (escaped === undefined) {
                return undefined;
            }
            value += escaped.value;
            index = escaped.next - 1;
            continue;
        }
        if (code < 32) {
            return undefined;
        }
        value += source[index] ?? "";
    }
    return undefined;
}

function readJsonEscape(
    source: string,
    index: number
): { readonly value: string; readonly next: number } | undefined {
    const code = source.charCodeAt(index);
    switch (code) {
        case 34:
        case 47:
        case 92:
            return { value: source[index] ?? "", next: index + 1 };
        case 98:
            return { value: "\b", next: index + 1 };
        case 102:
            return { value: "\f", next: index + 1 };
        case 110:
            return { value: "\n", next: index + 1 };
        case 114:
            return { value: "\r", next: index + 1 };
        case 116:
            return { value: "\t", next: index + 1 };
        default:
            return undefined;
    }
}

function skipJsonValue(source: string, start: number): number {
    const code = source.charCodeAt(start);
    if (code === 34) {
        return readJsonString(source, start)?.next ?? -1;
    }
    if (code === 123 || code === 91) {
        return skipJsonContainer(source, start);
    }
    let index = start;
    while (index < source.length) {
        const next = source.charCodeAt(index);
        if (next === 44 || next === 125 || next === 93 || isJsonWhitespace(next)) {
            return index;
        }
        index += 1;
    }
    return index;
}

function skipJsonContainer(source: string, start: number): number {
    const open = source.charCodeAt(start);
    const close = open === 123 ? 125 : 93;
    let depth = 1;
    for (let index = start + 1; index < source.length; index += 1) {
        const code = source.charCodeAt(index);
        if (code === 34) {
            const string = readJsonString(source, index);
            if (string === undefined) {
                return -1;
            }
            index = string.next - 1;
            continue;
        }
        if (code === open) {
            depth += 1;
        } else if (code === close) {
            depth -= 1;
            if (depth === 0) {
                return index + 1;
            }
        }
    }
    return -1;
}

function skipJsonWhitespace(source: string, start: number): number {
    let index = start;
    while (index < source.length && isJsonWhitespace(source.charCodeAt(index))) {
        index += 1;
    }
    return index;
}

function isJsonWhitespace(code: number): boolean {
    return code === 32 || code === 9 || code === 10 || code === 13;
}

function buildUrlPattern(protocol: RegExp | undefined, hostname: RegExp | undefined): RegExp {
    const protocolSource = protocol === undefined
        ? "[A-Z][A-Z0-9+.-]*"
        : wholePatternSource(protocol);
    if (hostname === undefined) {
        return new RegExp(`^(?:${protocolSource}):[^\\s]+$`, joinFlags(protocol, hostname));
    }
    const hostnameSource = wholePatternSource(hostname);
    return new RegExp(
        `^(?:${protocolSource}):\\/\\/(?:${hostnameSource})(?:[/?#][^\\s]*)?$`,
        joinFlags(protocol, hostname)
    );
}

function wholePatternSource(pattern: RegExp): string {
    let source = pattern.source;
    if (source.startsWith("^")) {
        source = source.slice(1);
    }
    if (source.endsWith("$") && !source.endsWith("\\$")) {
        source = source.slice(0, -1);
    }
    return source;
}

function buildIsoDateTimePattern(options: Partial<StringIsoDateTimeOptions>): RegExp {
    const precision = readIsoPrecision(options.precision, "iso datetime precision");
    const time = isoClockSource(precision);
    const zones = ["Z"];
    if (options.offset === true) {
        zones.push("[+-](?:[01]\\d|2[0-3]):[0-5]\\d");
    }
    if (options.local === true) {
        zones.push("");
    }
    return new RegExp(
        `^\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])T${time}(?:${zones.join("|")})$`,
        "u"
    );
}

function buildIsoTimePattern(precision: number | undefined): RegExp {
    return new RegExp(`^${isoClockSource(readIsoPrecision(precision, "iso time precision"))}$`, "u");
}

function readIsoPrecision(value: unknown, label: string): number | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "number" || !Number.isInteger(value) || value < -1) {
        throw new TypeError(`${label} must be an integer greater than or equal to -1`);
    }
    return value;
}

function isoClockSource(precision: number | undefined): string {
    const hourMinute = "(?:[01]\\d|2[0-3]):[0-5]\\d";
    if (precision === -1) {
        return hourMinute;
    }
    if (precision === 0) {
        return `${hourMinute}:[0-5]\\d`;
    }
    if (precision === undefined) {
        return `${hourMinute}(?::[0-5]\\d(?:\\.\\d+)?)?`;
    }
    return `${hourMinute}:[0-5]\\d\\.\\d{${String(precision)}}`;
}

function joinFlags(first: RegExp | undefined, second: RegExp | undefined): string {
    let flags = "u";
    if (first?.ignoreCase === true || second?.ignoreCase === true) {
        flags += "i";
    }
    return flags;
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
