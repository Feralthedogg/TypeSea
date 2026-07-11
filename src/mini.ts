/**
 * @file mini.ts
 * @brief Functional, tree-shakable public entry point.
 * @details This entry avoids the large root barrel and Zod-compatibility class
 * aliases. It is meant for bundle-sensitive callers that prefer top-level
 * functions over broad namespace objects.
 */

import {
    neverGuard,
    nullGuard,
    undefinedGuard,
    unknownGuard,
    voidGuard
} from "./builders/scalar.js";
import type { BaseDecoder } from "./decoder/index.js";
import { readCheckMessage } from "./guard/check-message.js";
import { registerWithCheckSource } from "./guard/with-check.js";
import type {
    ArrayGuard,
    BigIntGuard,
    CheckMessageInput,
    DateGuard,
    FileGuard,
    Guard,
    MapGuard,
    NumberGuard,
    Presence,
    SetGuard,
    StringGuard,
    StringNormalizationForm,
    WithCheckCallback,
    WithCheckPayload,
    WithCheckSource
} from "./guard/index.js";

const neverSchema = (): typeof neverGuard => neverGuard;
const nullSchema = (): typeof nullGuard => nullGuard;
const undefinedSchema = (): typeof undefinedGuard => undefinedGuard;
const unknownSchema = (): typeof unknownGuard => unknownGuard;
const voidSchema = (): typeof voidGuard => voidGuard;

/** @brief Pure pipeline step converting one Mini source type into another. */
export type MiniTransform<TInput, TOutput> = (source: TInput) => TOutput;

type MiniCheckTransform<TFunction extends object, TValue> =
    TFunction & WithCheckSource<TValue>;

/** @brief Length-check transform applicable to strings, arrays, sets, and files. */
export type MiniLengthTransform = MiniCheckTransform<
    (source: StringGuard) => StringGuard,
    string | readonly unknown[]
>;

type MiniStringPredicateTransform = MiniCheckTransform<
    (source: StringGuard) => StringGuard,
    string
>;

type MiniStringDecoderTransform = MiniCheckTransform<
    (source: StringGuard) => BaseDecoder<string>,
    string
>;

type MiniNonemptySource =
    | StringGuard<Presence>
    | ArrayGuard<unknown, Presence>
    | MapGuard<unknown, unknown, Presence>
    | SetGuard<unknown, Presence>;

type MiniNonemptyResult<TSource> =
    TSource extends StringGuard<infer TPresence extends Presence>
        ? StringGuard<TPresence>
        : TSource extends ArrayGuard<infer TItem, infer TPresence extends Presence>
            ? ArrayGuard<TItem, TPresence>
            : TSource extends MapGuard<
                infer TKey,
                infer TValue,
                infer TPresence extends Presence
            >
                ? MapGuard<TKey, TValue, TPresence>
                : TSource extends SetGuard<infer TItem, infer TPresence extends Presence>
                    ? SetGuard<TItem, TPresence>
                    : never;

/** @brief Non-empty transform preserving the concrete compatible source type. */
export type MiniNonemptyTransform = <TSource extends MiniNonemptySource>(
    source: TSource
) => MiniNonemptyResult<TSource>;

type MiniMinSizeSource =
    | ArrayGuard<unknown>
    | MapGuard<unknown, unknown>
    | SetGuard<unknown>
    | FileGuard;

type MiniMinSizeResult<TSource> =
    TSource extends ArrayGuard<infer TItem, infer TPresence extends Presence>
        ? ArrayGuard<TItem, TPresence>
        : TSource extends MapGuard<
            infer TKey,
            infer TValue,
            infer TPresence extends Presence
        >
            ? MapGuard<TKey, TValue, TPresence>
            : TSource extends SetGuard<infer TItem, infer TPresence extends Presence>
                ? SetGuard<TItem, TPresence>
                : TSource extends FileGuard<infer TPresence extends Presence>
                    ? FileGuard<TPresence>
                    : never;

/** @brief Minimum-size transform for collections and file-like values. */
export type MiniMinSizeTransform =
    <TSource extends MiniMinSizeSource>(source: TSource) => MiniMinSizeResult<TSource>;

type MiniSizeSource =
    | StringGuard
    | ArrayGuard<unknown>
    | MapGuard<unknown, unknown>
    | SetGuard<unknown>;

type MiniSizeResult<TSource> =
    TSource extends StringGuard<infer TPresence extends Presence>
        ? StringGuard<TPresence>
        : TSource extends ArrayGuard<infer TItem, infer TPresence extends Presence>
            ? ArrayGuard<TItem, TPresence>
            : TSource extends MapGuard<
                infer TKey,
                infer TValue,
                infer TPresence extends Presence
            >
                ? MapGuard<TKey, TValue, TPresence>
                : TSource extends SetGuard<infer TItem, infer TPresence extends Presence>
                    ? SetGuard<TItem, TPresence>
                    : never;

/** @brief Exact-size transform for collections and file-like values. */
export type MiniSizeTransform =
    <TSource extends MiniSizeSource>(source: TSource) => MiniSizeResult<TSource>;

/** @brief Overloaded signed-bound transform for numbers, BigInts, and Dates. */
export interface MiniSignedTransform {
    (source: NumberGuard): NumberGuard;
    (source: BigIntGuard): BigIntGuard;
}

type MiniNumberTransform = MiniCheckTransform<
    (source: NumberGuard) => NumberGuard,
    number
>;

type MiniBigIntTransform = MiniCheckTransform<
    (source: BigIntGuard) => BigIntGuard,
    bigint
>;

/**
 * @brief Compose a source with a fixed sequence of Mini transforms.
 * @details Transform functions are applied once at schema construction; parsed
 * values do not traverse this composition pipeline.
 */
export function apply<TItem>(
    source: ArrayGuard<TItem>,
    first: MiniMinSizeTransform | MiniSizeTransform,
    second?: MiniMinSizeTransform
): ArrayGuard<TItem>;

export function apply<T0, T1>(
    source: T0,
    first: MiniTransform<T0, T1>
): T1;

export function apply<T0, T1, T2>(
    source: T0,
    first: MiniTransform<T0, T1>,
    second: MiniTransform<T1, T2>
): T2;

export function apply<T0, T1, T2, T3>(
    source: T0,
    first: MiniTransform<T0, T1>,
    second: MiniTransform<T1, T2>,
    third: MiniTransform<T2, T3>
): T3;

export function apply<T0, T1, T2, T3, T4>(
    source: T0,
    first: MiniTransform<T0, T1>,
    second: MiniTransform<T1, T2>,
    third: MiniTransform<T2, T3>,
    fourth: MiniTransform<T3, T4>
): T4;

export function apply<T0, T1, T2, T3, T4, T5>(
    source: T0,
    first: MiniTransform<T0, T1>,
    second: MiniTransform<T1, T2>,
    third: MiniTransform<T2, T3>,
    fourth: MiniTransform<T3, T4>,
    fifth: MiniTransform<T4, T5>
): T5;

export function apply(
    source: unknown,
    ...transforms: readonly unknown[]
): unknown {
    let current = source;
    for (let index = 0; index < transforms.length; index += 1) {
        const transformSource = transforms[index];
        if (isMiniRuntimeTransform(transformSource)) {
            current = transformSource(current);
        }
    }
    return current;
}

function isMiniRuntimeTransform(
    value: unknown
): value is (source: unknown) => unknown {
    return typeof value === "function";
}

function makeMiniCheck<TFunction extends object, TValue>(
    source: TFunction,
    callback: WithCheckCallback<TValue>,
    zodDef: Readonly<Record<string, unknown>>
): MiniCheckTransform<TFunction, TValue> {
    return registerWithCheckSource(source, callback, {
        zodDef
    });
}

function pushMiniIssue<TValue>(
    payload: WithCheckPayload<TValue>,
    fallback: string,
    options?: CheckMessageInput
): void {
    payload.issues.push(readCheckMessage(options) ?? fallback);
}

function readLength(value: unknown): number | undefined {
    if (typeof value === "string" || Array.isArray(value)) {
        return value.length;
    }
    return undefined;
}

function readSize(value: unknown): number | undefined {
    if (value instanceof Set || value instanceof Map) {
        return value.size;
    }
    if (isFileLike(value)) {
        return value.size;
    }
    return readLength(value);
}

function isFileLike(value: unknown): value is { readonly size: number; readonly type: string } {
    return typeof value === "object" &&
        value !== null &&
        "size" in value &&
        "type" in value &&
        typeof value.size === "number" &&
        typeof value.type === "string";
}

function stringValue(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | bigint | undefined {
    return typeof value === "number" || typeof value === "bigint" ? value : undefined;
}

function mimeMatches(type: string, pattern: string): boolean {
    if (pattern.endsWith("/*")) {
        return type.startsWith(pattern.slice(0, -1));
    }
    return type === pattern;
}

/** @brief Return a pipeline transform that enforces an inclusive minimum length. */
export function minLength(
    value: number,
    options?: CheckMessageInput
): MiniLengthTransform {
    const transformSource = <TPresence extends Presence>(
        source: StringGuard<TPresence>
    ): StringGuard<TPresence> =>
        source.min(value, options);
    return makeMiniCheck(
        transformSource as MiniLengthTransform,
        (payload) => {
            const length = readLength(payload.value);
            if (length !== undefined && length < value) {
                pushMiniIssue(payload, "too short", options);
            }
        },
        {
            check: "min_length",
            minimum: value
        }
    );
}

/** @brief Return a pipeline transform that enforces an inclusive maximum length. */
export function maxLength(
    value: number,
    options?: CheckMessageInput
): MiniLengthTransform {
    const transformSource = <TPresence extends Presence>(
        source: StringGuard<TPresence>
    ): StringGuard<TPresence> =>
        source.max(value, options);
    return makeMiniCheck(
        transformSource as MiniLengthTransform,
        (payload) => {
            const length = readLength(payload.value);
            if (length !== undefined && length > value) {
                pushMiniIssue(payload, "too long", options);
            }
        },
        {
            check: "max_length",
            maximum: value
        }
    );
}

/** @brief Return a pipeline transform that enforces one exact length. */
export function length(
    value: number,
    options?: CheckMessageInput
): MiniLengthTransform {
    const transformSource = <TPresence extends Presence>(
        source: StringGuard<TPresence>
    ): StringGuard<TPresence> =>
        source.length(value, options);
    return makeMiniCheck(
        transformSource as MiniLengthTransform,
        (payload) => {
            const lengthValue = readLength(payload.value);
            if (lengthValue !== undefined && lengthValue !== value) {
                pushMiniIssue(payload, "invalid length", options);
            }
        },
        {
            check: "length_equals",
            length: value
        }
    );
}

/** @brief Return a string pipeline transform backed by a copied RegExp. */
export function regex(
    pattern: RegExp,
    name = "regex",
    options?: CheckMessageInput
): MiniStringPredicateTransform {
    const owned = new RegExp(pattern.source, pattern.flags);
    const transformSource = <TPresence extends Presence>(
        source: StringGuard<TPresence>
    ): StringGuard<TPresence> =>
        source.regex(pattern, name, options);
    return makeMiniCheck(
        transformSource,
        (payload) => {
            const value = stringValue(payload.value);
            if (value === undefined) {
                return;
            }
            owned.lastIndex = 0;
            if (!owned.test(value)) {
                pushMiniIssue(payload, "pattern mismatch", options);
            }
        },
        {
            check: "string_format",
            format: name
        }
    );
}

/** @brief Return a string pipeline transform requiring one prefix. */
export function startsWith(
    value: string,
    options?: CheckMessageInput
): MiniStringPredicateTransform {
    const transformSource = <TPresence extends Presence>(
        source: StringGuard<TPresence>
    ): StringGuard<TPresence> =>
        source.startsWith(value, options);
    return makeMiniCheck(
        transformSource,
        (payload) => {
            const text = stringValue(payload.value);
            if (text !== undefined && !text.startsWith(value)) {
                pushMiniIssue(payload, "prefix mismatch", options);
            }
        },
        {
            check: "starts_with",
            prefix: value
        }
    );
}

/** @brief Return a string pipeline transform requiring one suffix. */
export function endsWith(
    value: string,
    options?: CheckMessageInput
): MiniStringPredicateTransform {
    const transformSource = <TPresence extends Presence>(
        source: StringGuard<TPresence>
    ): StringGuard<TPresence> =>
        source.endsWith(value, options);
    return makeMiniCheck(
        transformSource,
        (payload) => {
            const text = stringValue(payload.value);
            if (text !== undefined && !text.endsWith(value)) {
                pushMiniIssue(payload, "suffix mismatch", options);
            }
        },
        {
            check: "ends_with",
            suffix: value
        }
    );
}

/** @brief Return a string pipeline transform requiring one substring. */
export function includes(
    value: string,
    options?: CheckMessageInput
): MiniStringPredicateTransform {
    const transformSource = <TPresence extends Presence>(
        source: StringGuard<TPresence>
    ): StringGuard<TPresence> =>
        source.includes(value, options);
    return makeMiniCheck(
        transformSource,
        (payload) => {
            const text = stringValue(payload.value);
            if (text !== undefined && !text.includes(value)) {
                pushMiniIssue(payload, "substring mismatch", options);
            }
        },
        {
            check: "includes",
            includes: value
        }
    );
}

/** @brief Return a string pipeline transform rejecting lower-case code points. */
export function uppercase(
    options?: CheckMessageInput
): MiniStringPredicateTransform {
    const transformSource = <TPresence extends Presence>(
        source: StringGuard<TPresence>
    ): StringGuard<TPresence> =>
        source.uppercase(options);
    return makeMiniCheck(
        transformSource,
        (payload) => {
            const text = stringValue(payload.value);
            if (text !== undefined && text !== text.toUpperCase()) {
                pushMiniIssue(payload, "uppercase expected", options);
            }
        },
        {
            check: "uppercase"
        }
    );
}

/** @brief Return a string pipeline transform rejecting upper-case code points. */
export function lowercase(
    options?: CheckMessageInput
): MiniStringPredicateTransform {
    const transformSource = <TPresence extends Presence>(
        source: StringGuard<TPresence>
    ): StringGuard<TPresence> =>
        source.lowercase(options);
    return makeMiniCheck(
        transformSource,
        (payload) => {
            const text = stringValue(payload.value);
            if (text !== undefined && text !== text.toLowerCase()) {
                pushMiniIssue(payload, "lowercase expected", options);
            }
        },
        {
            check: "lowercase"
        }
    );
}

/** @brief Return a decoder transform that trims surrounding whitespace. */
export function trim(): MiniStringDecoderTransform {
    const transformSource = <TPresence extends Presence>(
        source: StringGuard<TPresence>
    ): BaseDecoder<string> =>
        source.trim();
    return makeMiniCheck(
        transformSource,
        () => undefined,
        {
            check: "overwrite",
            tx: "trim"
        }
    );
}

/** @brief Return a decoder transform applying locale-independent lower casing. */
export function toLowerCase(): MiniStringDecoderTransform {
    const transformSource = <TPresence extends Presence>(
        source: StringGuard<TPresence>
    ): BaseDecoder<string> =>
        source.toLowerCase();
    return makeMiniCheck(
        transformSource,
        () => undefined,
        {
            check: "overwrite",
            tx: "toLowerCase"
        }
    );
}

/** @brief Return a decoder transform applying locale-independent upper casing. */
export function toUpperCase(): MiniStringDecoderTransform {
    const transformSource = <TPresence extends Presence>(
        source: StringGuard<TPresence>
    ): BaseDecoder<string> =>
        source.toUpperCase();
    return makeMiniCheck(
        transformSource,
        () => undefined,
        {
            check: "overwrite",
            tx: "toUpperCase"
        }
    );
}

/** @brief Return a decoder transform applying one Unicode normalization form. */
export function normalize(
    form?: StringNormalizationForm
): MiniStringDecoderTransform {
    const transformSource = <TPresence extends Presence>(
        source: StringGuard<TPresence>
    ): BaseDecoder<string> =>
        form === undefined ? source.normalize() : source.normalize(form);
    return makeMiniCheck(
        transformSource,
        () => undefined,
        {
            check: "overwrite",
            tx: "normalize"
        }
    );
}

/** @brief Return a decoder transform producing a lower-case ASCII slug. */
export function slugify(): MiniStringDecoderTransform {
    const transformSource = <TPresence extends Presence>(
        source: StringGuard<TPresence>
    ): BaseDecoder<string> =>
        source.slugify();
    return makeMiniCheck(
        transformSource,
        () => undefined,
        {
            check: "overwrite",
            tx: "slugify"
        }
    );
}

/** @brief Return a non-empty transform specialized to the source category. */
export function nonempty(
    options?: CheckMessageInput
): MiniCheckTransform<
    MiniNonemptyTransform,
    string | readonly unknown[] | ReadonlyMap<unknown, unknown> | ReadonlySet<unknown>
> {
    const transformSource = (
        source:
            | StringGuard<Presence>
            | ArrayGuard<unknown, Presence>
            | MapGuard<unknown, unknown, Presence>
            | SetGuard<unknown, Presence>
    ):
        | StringGuard<Presence>
        | ArrayGuard<unknown, Presence>
        | MapGuard<unknown, unknown, Presence>
        | SetGuard<unknown, Presence> =>
        source.nonempty(options);
    return makeMiniCheck(
        transformSource as MiniNonemptyTransform,
        (payload) => {
            const size = readSize(payload.value);
            if (size !== undefined && size < 1) {
                pushMiniIssue(payload, "empty value", options);
            }
        },
        {
            check: "min_size",
            minimum: 1
        }
    );
}

/** @brief Return a minimum cardinality or file-size transform. */
export function minSize(
    value: number,
    options?: CheckMessageInput
): MiniCheckTransform<
    MiniMinSizeTransform,
    readonly unknown[] | ReadonlyMap<unknown, unknown> | ReadonlySet<unknown> | File
> {
    const transformSource = (
        source:
            | ArrayGuard<unknown, Presence>
            | MapGuard<unknown, unknown, Presence>
            | SetGuard<unknown, Presence>
            | FileGuard<Presence>
    ):
        | ArrayGuard<unknown, Presence>
        | MapGuard<unknown, unknown, Presence>
        | SetGuard<unknown, Presence>
        | FileGuard<Presence> =>
        source.min(value, options);
    return makeMiniCheck(
        transformSource as MiniMinSizeTransform,
        (payload) => {
            const size = readSize(payload.value);
            if (size !== undefined && size < value) {
                pushMiniIssue(payload, "too small", options);
            }
        },
        {
            check: "min_size",
            minimum: value
        }
    );
}

/** @brief Return a maximum cardinality or file-size transform. */
export function maxSize(
    value: number,
    options?: CheckMessageInput
): MiniCheckTransform<
    MiniMinSizeTransform,
    readonly unknown[] | ReadonlyMap<unknown, unknown> | ReadonlySet<unknown> | File
> {
    const transformSource = (
        source:
            | ArrayGuard<unknown, Presence>
            | MapGuard<unknown, unknown, Presence>
            | SetGuard<unknown, Presence>
            | FileGuard<Presence>
    ):
        | ArrayGuard<unknown, Presence>
        | MapGuard<unknown, unknown, Presence>
        | SetGuard<unknown, Presence>
        | FileGuard<Presence> =>
        source.max(value, options);
    return makeMiniCheck(
        transformSource as MiniMinSizeTransform,
        (payload) => {
            const size = readSize(payload.value);
            if (size !== undefined && size > value) {
                pushMiniIssue(payload, "too large", options);
            }
        },
        {
            check: "max_size",
            maximum: value
        }
    );
}

/** @brief Return a file transform restricted to the supplied MIME types. */
export function mime(
    value: string | readonly string[],
    options?: CheckMessageInput
): MiniCheckTransform<
    <TPresence extends Presence>(source: FileGuard<TPresence>) => FileGuard<TPresence>,
    File
> {
    const values: readonly string[] = typeof value === "string" ? [value] : value.slice();
    const transformSource = <TPresence extends Presence>(
        source: FileGuard<TPresence>
    ): FileGuard<TPresence> =>
        source.mime(value, options);
    return makeMiniCheck(
        transformSource,
        (payload) => {
            if (!isFileLike(payload.value)) {
                return;
            }
            let matched = false;
            for (let index = 0; index < values.length; index += 1) {
                const pattern = values[index];
                if (pattern !== undefined && mimeMatches(payload.value.type, pattern)) {
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                pushMiniIssue(payload, "MIME type mismatch", options);
            }
        },
        {
            check: "mime_type",
            mime: typeof value === "string" ? value : values
        }
    );
}

/** @brief Return an exact cardinality or file-size transform. */
export function size(
    value: number,
    options?: CheckMessageInput
): MiniCheckTransform<
    MiniSizeTransform,
    string | readonly unknown[] | ReadonlyMap<unknown, unknown> | ReadonlySet<unknown>
> {
    const transformSource = (
        source:
            | StringGuard<Presence>
            | ArrayGuard<unknown, Presence>
            | MapGuard<unknown, unknown, Presence>
            | SetGuard<unknown, Presence>
    ):
        | StringGuard<Presence>
        | ArrayGuard<unknown, Presence>
        | MapGuard<unknown, unknown, Presence>
        | SetGuard<unknown, Presence> => {
        if (hasSetSizeMethod(source)) {
            return source.size(value, options);
        }
        return source.length(value, options);
    };
    return makeMiniCheck(
        transformSource as MiniSizeTransform,
        (payload) => {
            const sizeValue = readSize(payload.value);
            if (sizeValue !== undefined && sizeValue !== value) {
                pushMiniIssue(payload, "invalid size", options);
            }
        },
        {
            check: "size_equals",
            size: value
        }
    );
}

/** @brief Return an exclusive lower-bound transform for ordered scalar sources. */
export function gt(
    value: number,
    options?: CheckMessageInput
): MiniNumberTransform;

export function gt(
    value: bigint,
    options?: CheckMessageInput
): MiniBigIntTransform;

export function gt(
    value: number | bigint,
    options?: CheckMessageInput
): unknown {
    if (typeof value === "bigint") {
        const transformSource = <TPresence extends Presence>(
            source: BigIntGuard<TPresence>
        ): BigIntGuard<TPresence> =>
            source.gt(value, options);
        return makeMiniCheck(
            transformSource,
            (payload) => {
                const current = numberValue(payload.value);
                if (typeof current === "bigint" && current <= value) {
                    pushMiniIssue(payload, "too small", options);
                }
            },
            {
                check: "greater_than",
                value,
                inclusive: false
            }
        );
    }
    const transformSource = <TPresence extends Presence>(
        source: NumberGuard<TPresence>
    ): NumberGuard<TPresence> =>
        source.gt(value, options);
    return makeMiniCheck(
        transformSource,
        (payload) => {
            const current = numberValue(payload.value);
            if (typeof current === "number" && current <= value) {
                pushMiniIssue(payload, "too small", options);
            }
        },
        {
            check: "greater_than",
            value,
            inclusive: false
        }
    );
}

/** @brief Return an inclusive lower-bound transform for ordered scalar sources. */
export function gte(
    value: number,
    options?: CheckMessageInput
): MiniNumberTransform;

export function gte(
    value: bigint,
    options?: CheckMessageInput
): MiniBigIntTransform;

export function gte(
    value: number | bigint,
    options?: CheckMessageInput
): unknown {
    if (typeof value === "bigint") {
        const transformSource = <TPresence extends Presence>(
            source: BigIntGuard<TPresence>
        ): BigIntGuard<TPresence> =>
            source.gte(value, options);
        return makeMiniCheck(
            transformSource,
            (payload) => {
                const current = numberValue(payload.value);
                if (typeof current === "bigint" && current < value) {
                    pushMiniIssue(payload, "too small", options);
                }
            },
            {
                check: "greater_than",
                value,
                inclusive: true
            }
        );
    }
    const transformSource = <TPresence extends Presence>(
        source: NumberGuard<TPresence>
    ): NumberGuard<TPresence> =>
        source.gte(value, options);
    return makeMiniCheck(
        transformSource,
        (payload) => {
            const current = numberValue(payload.value);
            if (typeof current === "number" && current < value) {
                pushMiniIssue(payload, "too small", options);
            }
        },
        {
            check: "greater_than",
            value,
            inclusive: true
        }
    );
}

/** @brief Alias of `gte` matching Zod Mini terminology. */
export const minimum = gte;

/** @brief Return an exclusive upper-bound transform for ordered scalar sources. */
export function lt(
    value: number,
    options?: CheckMessageInput
): MiniNumberTransform;

export function lt(
    value: bigint,
    options?: CheckMessageInput
): MiniBigIntTransform;

export function lt(
    value: number | bigint,
    options?: CheckMessageInput
): unknown {
    if (typeof value === "bigint") {
        const transformSource = <TPresence extends Presence>(
            source: BigIntGuard<TPresence>
        ): BigIntGuard<TPresence> =>
            source.lt(value, options);
        return makeMiniCheck(
            transformSource,
            (payload) => {
                const current = numberValue(payload.value);
                if (typeof current === "bigint" && current >= value) {
                    pushMiniIssue(payload, "too large", options);
                }
            },
            {
                check: "less_than",
                value,
                inclusive: false
            }
        );
    }
    const transformSource = <TPresence extends Presence>(
        source: NumberGuard<TPresence>
    ): NumberGuard<TPresence> =>
        source.lt(value, options);
    return makeMiniCheck(
        transformSource,
        (payload) => {
            const current = numberValue(payload.value);
            if (typeof current === "number" && current >= value) {
                pushMiniIssue(payload, "too large", options);
            }
        },
        {
            check: "less_than",
            value,
            inclusive: false
        }
    );
}

/** @brief Return an inclusive upper-bound transform for ordered scalar sources. */
export function lte(
    value: number,
    options?: CheckMessageInput
): MiniNumberTransform;

export function lte(
    value: bigint,
    options?: CheckMessageInput
): MiniBigIntTransform;

export function lte(
    value: number | bigint,
    options?: CheckMessageInput
): unknown {
    if (typeof value === "bigint") {
        const transformSource = <TPresence extends Presence>(
            source: BigIntGuard<TPresence>
        ): BigIntGuard<TPresence> =>
            source.lte(value, options);
        return makeMiniCheck(
            transformSource,
            (payload) => {
                const current = numberValue(payload.value);
                if (typeof current === "bigint" && current > value) {
                    pushMiniIssue(payload, "too large", options);
                }
            },
            {
                check: "less_than",
                value,
                inclusive: true
            }
        );
    }
    const transformSource = <TPresence extends Presence>(
        source: NumberGuard<TPresence>
    ): NumberGuard<TPresence> =>
        source.lte(value, options);
    return makeMiniCheck(
        transformSource,
        (payload) => {
            const current = numberValue(payload.value);
            if (typeof current === "number" && current > value) {
                pushMiniIssue(payload, "too large", options);
            }
        },
        {
            check: "less_than",
            value,
            inclusive: true
        }
    );
}

/** @brief Alias of `lte` matching Zod Mini terminology. */
export const maximum = lte;

/** @brief Return an exact divisibility transform for numeric sources. */
export function multipleOf(
    value: number,
    options?: CheckMessageInput
): MiniNumberTransform;

export function multipleOf(
    value: bigint,
    options?: CheckMessageInput
): MiniBigIntTransform;

export function multipleOf(
    value: number | bigint,
    options?: CheckMessageInput
): unknown {
    if (typeof value === "bigint") {
        const transformSource = <TPresence extends Presence>(
            source: BigIntGuard<TPresence>
        ): BigIntGuard<TPresence> =>
            source.multipleOf(value, options);
        return makeMiniCheck(
            transformSource,
            (payload) => {
                const current = numberValue(payload.value);
                if (typeof current === "bigint" && current % value !== 0n) {
                    pushMiniIssue(payload, "not a multiple", options);
                }
            },
            {
                check: "multiple_of",
                value
            }
        );
    }
    const transformSource = <TPresence extends Presence>(
        source: NumberGuard<TPresence>
    ): NumberGuard<TPresence> =>
        source.multipleOf(value, options);
    return makeMiniCheck(
        transformSource,
        (payload) => {
            const current = numberValue(payload.value);
            if (typeof current === "number" && current % value !== 0) {
                pushMiniIssue(payload, "not a multiple", options);
            }
        },
        {
            check: "multiple_of",
            value
        }
    );
}

/** @brief Alias of `multipleOf` matching Zod Mini terminology. */
export const step = multipleOf;

/** @brief Return a transform requiring a value greater than zero. */
export function positive(
    options?: CheckMessageInput
): MiniCheckTransform<MiniSignedTransform, number | bigint> {
    const transformSource = (
        source: NumberGuard<Presence> | BigIntGuard<Presence>
    ): NumberGuard<Presence> | BigIntGuard<Presence> =>
        source.positive(options);
    return makeMiniCheck(
        transformSource as MiniSignedTransform,
        (payload) => {
            const value = numberValue(payload.value);
            if ((typeof value === "number" && value <= 0) ||
                (typeof value === "bigint" && value <= 0n)) {
                pushMiniIssue(payload, "positive value expected", options);
            }
        },
        {
            check: "greater_than",
            value: 0,
            inclusive: false
        }
    );
}

/** @brief Return a transform requiring a value less than zero. */
export function negative(
    options?: CheckMessageInput
): MiniCheckTransform<MiniSignedTransform, number | bigint> {
    const transformSource = (
        source: NumberGuard<Presence> | BigIntGuard<Presence>
    ): NumberGuard<Presence> | BigIntGuard<Presence> =>
        source.negative(options);
    return makeMiniCheck(
        transformSource as MiniSignedTransform,
        (payload) => {
            const value = numberValue(payload.value);
            if ((typeof value === "number" && value >= 0) ||
                (typeof value === "bigint" && value >= 0n)) {
                pushMiniIssue(payload, "negative value expected", options);
            }
        },
        {
            check: "less_than",
            value: 0,
            inclusive: false
        }
    );
}

/** @brief Return a transform requiring a value no greater than zero. */
export function nonpositive(
    options?: CheckMessageInput
): MiniCheckTransform<MiniSignedTransform, number | bigint> {
    const transformSource = (
        source: NumberGuard<Presence> | BigIntGuard<Presence>
    ): NumberGuard<Presence> | BigIntGuard<Presence> =>
        source.nonpositive(options);
    return makeMiniCheck(
        transformSource as MiniSignedTransform,
        (payload) => {
            const value = numberValue(payload.value);
            if ((typeof value === "number" && value > 0) ||
                (typeof value === "bigint" && value > 0n)) {
                pushMiniIssue(payload, "nonpositive value expected", options);
            }
        },
        {
            check: "less_than",
            value: 0,
            inclusive: true
        }
    );
}

/** @brief Return a transform requiring a value no less than zero. */
export function nonnegative(
    options?: CheckMessageInput
): MiniCheckTransform<MiniSignedTransform, number | bigint> {
    const transformSource = (
        source: NumberGuard<Presence> | BigIntGuard<Presence>
    ): NumberGuard<Presence> | BigIntGuard<Presence> =>
        source.nonnegative(options);
    return makeMiniCheck(
        transformSource as MiniSignedTransform,
        (payload) => {
            const value = numberValue(payload.value);
            if ((typeof value === "number" && value < 0) ||
                (typeof value === "bigint" && value < 0n)) {
                pushMiniIssue(payload, "nonnegative value expected", options);
            }
        },
        {
            check: "greater_than",
            value: 0,
            inclusive: true
        }
    );
}

/** @brief Return a number transform restricted to safe integers. */
export function safe(
    options?: CheckMessageInput
): <TPresence extends Presence>(source: NumberGuard<TPresence>) => NumberGuard<TPresence> {
    return <TPresence extends Presence>(
        source: NumberGuard<TPresence>
    ): NumberGuard<TPresence> =>
        source.safe(options);
}

/** @brief Return a finite-number transform for Mini pipelines. */
export function finite(): <TPresence extends Presence>(
    source: NumberGuard<TPresence>
) => NumberGuard<TPresence> {
    return <TPresence extends Presence>(
        source: NumberGuard<TPresence>
    ): NumberGuard<TPresence> =>
        source.finite();
}

/** @brief Return a Date transform enforcing an inclusive minimum timestamp. */
export function minDate(
    value: Date,
    options?: CheckMessageInput
): <TPresence extends Presence>(source: DateGuard<TPresence>) => DateGuard<TPresence> {
    return <TPresence extends Presence>(
        source: DateGuard<TPresence>
    ): DateGuard<TPresence> =>
        source.min(value, options);
}

/** @brief Return a Date transform enforcing an inclusive maximum timestamp. */
export function maxDate(
    value: Date,
    options?: CheckMessageInput
): <TPresence extends Presence>(source: DateGuard<TPresence>) => DateGuard<TPresence> {
    return <TPresence extends Presence>(
        source: DateGuard<TPresence>
    ): DateGuard<TPresence> =>
        source.max(value, options);
}

/** @brief Return a decoder transform that replaces an accepted value. */
export function overwrite<TValue, TNext>(
    mapper: (value: TValue | undefined) => TNext
): MiniCheckTransform<(source: Guard<TValue, Presence>) => BaseDecoder<TNext>, TValue> {
    const transformSource = (source: Guard<TValue, Presence>): BaseDecoder<TNext> =>
        source.overwrite((value: TValue | undefined): TNext => mapper(value));
    return makeMiniCheck(
        transformSource,
        () => undefined,
        {
            check: "overwrite",
            tx: "overwrite"
        }
    );
}

/** @brief Preserve a source by identity for compatibility with Mini cloning APIs. */
export function clone<TSource extends Guard<unknown, Presence>>(source: TSource): TSource {
    return source.clone();
}

function hasSetSizeMethod(
    source:
        | StringGuard<Presence>
        | ArrayGuard<unknown, Presence>
        | MapGuard<unknown, unknown, Presence>
        | SetGuard<unknown, Presence>
): source is MapGuard<unknown, unknown, Presence> | SetGuard<unknown, Presence> {
    const probe = source as {
        readonly size?: unknown;
    };
    return typeof probe.size === "function";
}

export {
    $brand,
    $input,
    $output,
    TimePrecision,
    util
} from "./zod-compat.js";

export {
    unknownSchema as \u0061ny,
    neverSchema as never,
    nullSchema as null,
    undefinedSchema as undefined,
    unknownSchema as unknown,
    voidSchema as void
};

export {
    array,
    discriminatedUnion,
    intersect,
    intersect as intersection,
    looseRecord,
    map,
    partialRecord,
    record,
    set,
    templateLiteral,
    tuple,
    union,
    xor,
    type TemplateLiteralPart
} from "./builders/composite.js";
export {
    check,
    custom,
    exactOptional,
    lazy,
    describe,
    example,
    meta,
    message,
    metadata,
    nonoptional,
    nullable,
    nullish,
    optional,
    readonly,
    refine,
    superRefine,
    title,
    unwrap,
    undefinedable
} from "./builders/modifier.js";
export {
    FunctionContract,
    FunctionContract as ZodMiniFunction,
    FunctionContractBuilder,
    functionBuilder,
    functionBuilder as _function,
    functionBuilder as function,
    type FunctionContractOptions,
    type FunctionInputShape,
    type FunctionOutput,
    type InferFunctionArgs
} from "./builders/function.js";
export {
    ObjectGuard,
    atLeastOneKey,
    catchall,
    deepPartial,
    exactlyOneKey,
    extend,
    keyofObject as keyof,
    keyofObject,
    loose,
    looseObject,
    merge,
    nonpassthrough,
    nonstrict,
    object,
    omit,
    oneOfKeys,
    partial,
    passthrough,
    pick,
    required,
    safeExtend,
    strict,
    strictObject,
    strip,
    type DeepPartialObjectShape,
    type DeepPartialValue,
    type InferObject,
    type MaskSelectedKeys,
    type MergeObjectShapes,
    type ObjectKeyMask,
    type ObjectGuardMode,
    type ObjectShape,
    type OmitObjectShape,
    type OmitObjectShapeByMask,
    type PartialObjectShape,
    type PartialObjectShapeByMask,
    type PickObjectShape,
    type PickObjectShapeByMask,
    type RequiredObjectShape,
    type RequiredObjectShapeByMask
} from "./builders/object/index.js";
export {
    bigint,
    boolean,
    base64,
    base64url,
    cidrv4,
    cidrv6,
    cuid,
    cuid2,
    date,
    e164,
    email,
    emoji,
    enumValues,
    enumValues as enum,
    enumValues as nativeEnum,
    file,
    float32,
    float64,
    guid,
    hash,
    hex,
    hostname,
    httpUrl,
    ipv4,
    ipv6,
    iso,
    isoDate,
    isoDateTime,
    isoDuration,
    isoTime,
    jwt,
    int,
    int32,
    int64,
    literal,
    ksuid,
    mac,
    nan,
    nanoid,
    number,
    string,
    stringFormat,
    symbol,
    uint32,
    uint64,
    ulid,
    url,
    uuid,
    uuidv4,
    uuidv6,
    uuidv7,
    xid,
    type EnumLikeInput,
    type EnumLikeValue,
    type EnumValues,
    type IsoNamespace,
    type LiteralValues,
    type StringEmailOptions,
    type StringIsoDateTimeOptions,
    type StringIsoTimeOptions,
    type StringJwtOptions,
    type StringMacDelimiter,
    type StringMacOptions,
    type StringUrlOptions,
    type StringUuidOptions,
    type StringUuidVersion
} from "./builders/scalar.js";
export {
    instanceOf,
    instanceOf as instanceof,
    json,
    property,
    type InstanceConstructor,
    type JsonValue
} from "./builders/runtime.js";
export {
    parse,
    parseAsync,
    safeParse,
    safeParseAsync,
    spa
} from "./parse/index.js";
export {
    config,
    locales,
    type TypeSeaConfig,
    type TypeSeaConfigIssue,
    type TypeSeaCustomError,
    type TypeSeaLocales
} from "./config/index.js";
export {
    BaseCodec,
    BaseCodec as ZodMiniCodec,
    BaseDecoder,
    BaseDecoder as ZodMiniCatch,
    BaseDecoder as ZodMiniDefault,
    BaseDecoder as ZodMiniPipe,
    BaseDecoder as ZodMiniPrefault,
    BaseDecoder as ZodMiniSuccess,
    BaseDecoder as ZodMiniTransform,
    base64ToBytes,
    base64urlToBytes,
    bytesToUtf8,
    catchValue,
    catchValue as c\u0061tch,
    codec,
    codecs,
    coerce,
    coerceBigInt,
    coerceBoolean,
    coerceDate,
    coerceNumber,
    coerceString,
    decode,
    defaultValue,
    defaultValue as _default,
    decoder,
    epochMillisToDate,
    epochSecondsToDate,
    encode,
    encodeAsync,
    hexToBytes,
    invertCodec,
    isoDatetimeToDate,
    isCodecValue,
    isDecoderValue,
    jsonCodec,
    NEVER,
    numberToBigInt,
    pipe,
    prefault,
    preprocess,
    safeDecode,
    safeEncodeAsync,
    safeEncode,
    stringbool,
    stringToBigInt,
    stringToDate,
    stringToHttpURL,
    stringToInt,
    stringToNumber,
    stringToURL,
    success,
    transform,
    utf8ToBytes,
    type CatchContext,
    type CatchInput,
    type Codec,
    type DecodeSource,
    type Decoder,
    type InferCodecDecoded,
    type InferCodecEncoded,
    type InferDecoder,
    type Input,
    type JsonCodecValue,
    type Output,
    type StringBoolCase,
    type StringBoolOptions,
    type TransformContext,
    type TransformIssueInput,
    type TransformIssueSink
} from "./decoder/index.js";
export {
    BaseAsyncDecoder,
    PromiseAsyncDecoder as ZodMiniPromise,
    asyncDecoder,
    asyncPipe,
    asyncRefine,
    asyncTransform,
    decodeAsync,
    isAsyncDecoderValue,
    promise,
    safeDecodeAsync,
    type AsyncDecodeSource,
    type AsyncDecoder,
    type InferAsyncDecoder
} from "./async/index.js";
export {
    getErrorMap,
    resetErrorMap,
    setErrorMap,
    BaseGuard,
    BaseGuard as ZodMiniAny,
    BaseGuard as ZodMiniBoolean,
    BaseGuard as ZodMiniCustom,
    BaseGuard as ZodMiniDiscriminatedUnion,
    BaseGuard as ZodMiniExactOptional,
    BaseGuard as ZodMiniIntersection,
    BaseGuard as ZodMiniLazy,
    BaseGuard as ZodMiniNaN,
    BaseGuard as ZodMiniNever,
    BaseGuard as ZodMiniNonOptional,
    BaseGuard as ZodMiniNull,
    BaseGuard as ZodMiniNullable,
    BaseGuard as ZodMiniObject,
    BaseGuard as ZodMiniOptional,
    BaseGuard as ZodMiniReadonly,
    BaseGuard as ZodMiniRecord,
    BaseGuard as ZodMiniSymbol,
    BaseGuard as ZodMiniTemplateLiteral,
    BaseGuard as ZodMiniType,
    BaseGuard as ZodMiniUndefined,
    BaseGuard as ZodMiniUnknown,
    BaseGuard as ZodMiniVoid,
    ArrayGuard,
    ArrayGuard as ZodMiniArray,
    BigIntGuard,
    BigIntGuard as ZodMiniBigInt,
    BigIntGuard as ZodMiniBigIntFormat,
    DateGuard,
    DateGuard as ZodMiniDate,
    EnumGuard,
    EnumGuard as ZodMiniEnum,
    FileGuard,
    FileGuard as ZodMiniFile,
    LiteralGuard,
    LiteralGuard as ZodMiniLiteral,
    MapGuard,
    MapGuard as ZodMiniMap,
    NumberGuard,
    NumberGuard as ZodMiniNumber,
    NumberGuard as ZodMiniNumberFormat,
    SetGuard,
    SetGuard as ZodMiniSet,
    StringGuard,
    StringGuard as ZodMiniBase64,
    StringGuard as ZodMiniBase64URL,
    StringGuard as ZodMiniCIDRv4,
    StringGuard as ZodMiniCIDRv6,
    StringGuard as ZodMiniCUID,
    StringGuard as ZodMiniCUID2,
    StringGuard as ZodMiniCustomStringFormat,
    StringGuard as ZodMiniE164,
    StringGuard as ZodMiniEmail,
    StringGuard as ZodMiniEmoji,
    StringGuard as ZodMiniGUID,
    StringGuard as ZodMiniIPv4,
    StringGuard as ZodMiniIPv6,
    StringGuard as ZodMiniISODate,
    StringGuard as ZodMiniISODateTime,
    StringGuard as ZodMiniISODuration,
    StringGuard as ZodMiniISOTime,
    StringGuard as ZodMiniJWT,
    StringGuard as ZodMiniKSUID,
    StringGuard as ZodMiniMAC,
    StringGuard as ZodMiniNanoID,
    StringGuard as ZodMiniString,
    StringGuard as ZodMiniStringFormat,
    StringGuard as ZodMiniULID,
    StringGuard as ZodMiniURL,
    StringGuard as ZodMiniUUID,
    StringGuard as ZodMiniXID,
    TupleGuard,
    TupleGuard as ZodMiniTuple,
    UnionGuard,
    UnionGuard as ZodMiniUnion,
    XorGuard,
    XorGuard as ZodMiniXor,
    TypeSeaAssertionError,
    type Brand,
    type CheckMessageInput,
    type CheckMessageOptions,
    type EnumLiteralValue,
    type Guard,
    type GuardPresence,
    type GuardValue,
    type Infer,
    type ParseErrorInput,
    type ParseErrorMapper,
    type ParseErrorResult,
    type ParseIssueContext,
    type ParseOptions,
    type Presence,
    type ReadonlyValue,
    type RefineOptions,
    type RefineParams,
    type RefineWhenPayload,
    type RefineWhenPredicate,
    type RuntimeValue,
    type SafeParseFailure,
    type SafeParseResult,
    type SafeParseSuccess,
    type SuperRefineContext,
    type SuperRefineIssueInput,
    type UnwrappedGuardValue,
    type WithCheckCallback,
    type WithCheckInput,
    type WithCheckIssueSink,
    type WithCheckPayload,
    type WithCheckSource
} from "./guard/index.js";
export {
    globalRegistry,
    isSchemaRegistryValue,
    registry,
    SchemaRegistry,
    type GlobalRegistryMetadata,
    type SchemaRegistryEntry
} from "./registry/index.js";
export {
    regexes,
    type RegexNamespace
} from "./regexes/index.js";
export {
    flattenError,
    flattenIssues,
    formatError,
    formatIssue,
    formatIssues,
    prettifyError,
    toZodError,
    toZodIssue,
    toZodIssues,
    treeifyError,
    treeifyIssues,
    withMessages,
    defineMessages,
    type FlattenedIssueMessages,
    type FormattedIssueMessages,
    type IssueListError,
    type IssueMessageCatalog,
    type IssueSource,
    type TreeifiedIssueMessages,
    ZodIssueCode,
    type ZodErrorLike,
    type ZodIssue,
    type ZodIssueBoundValue,
    type ZodIssueDetails,
    type ZodIssueCode as ZodIssueCodeType
} from "./message/index.js";
export {
    fromJSONSchema,
    fromJsonSchema,
    schemaRegistryToJsonSchema,
    schemaToJsonSchema,
    toJSONSchema,
    toJsonSchema,
    type JsonSchema,
    type JsonSchemaCyclesMode,
    type JsonSchemaExportCode,
    type JsonSchemaExportIssue,
    type JsonSchemaImportCode,
    type JsonSchemaImportIssue,
    type JsonSchemaObject,
    type JsonSchemaOptions,
    type JsonSchemaOverride,
    type JsonSchemaOverrideContext,
    type JsonSchemaOverrideObject,
    type JsonSchemaPrimitive,
    type JsonSchemaRegistryDocument,
    type JsonSchemaReusedMode,
    type JsonSchemaTarget,
    type JsonSchemaTypeName,
    type JsonSchemaUnrepresentableMode,
    type JsonSchemaUriMapper
} from "./json-schema/index.js";
export {
    makeStandardSchemaProps,
    toStandardSchemaIssues,
    toStandardSchemaResult,
    type StandardSchemaV1,
    type StandardSchemaV1FailureResult,
    type StandardSchemaV1InferInput,
    type StandardSchemaV1InferOutput,
    type StandardSchemaV1Issue,
    type StandardSchemaV1Options,
    type StandardSchemaV1PathSegment,
    type StandardSchemaV1Props,
    type StandardSchemaV1Result,
    type StandardSchemaV1SuccessResult,
    type StandardSchemaV1Types
} from "./standard/index.js";
export type {
    CheckResult,
    Issue,
    IssueCode,
    PathSegment
} from "./issue/index.js";
export type {
    InferTuple,
    InferTupleWithRest,
    TupleShape
} from "./builders/types.js";
