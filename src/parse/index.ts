/**
 * @file parse/index.ts
 * @brief Throwing and tagged-result parse helpers for sync and async sources.
 * @details These functions are convenience boundaries over decoder results.
 * Validation itself remains Result-based and allocates assertion errors only
 * when a throwing parse API is selected.
 */

import {
    decode,
    type DecodeSource,
    type InferDecoder
} from "../decoder/index.js";
import {
    type AsyncDecodeSource,
    type InferAsyncDecoder,
    isAsyncDecoderValue
} from "../async/index.js";
import {
    type ParseOptions,
    type SafeParseResult
} from "../guard/index.js";
import { TypeSeaAssertionError } from "../guard/error.js";
import { applyParseOptions } from "../guard/parse-options.js";
import type { CheckResult } from "../issue/index.js";

/**
 * @brief Parse a value through a guard or decoder.
 * @param source Guard or decoder used for validation and decoding.
 * @param value Candidate runtime input.
 * @param options Optional parse-time message customization.
 * @returns Parsed output value.
 * @throws TypeSeaAssertionError when validation fails.
 */
export function parse<TSource extends DecodeSource>(
    source: TSource,
    value: unknown,
    options?: Partial<ParseOptions>
): InferDecoder<TSource> {
    const result = decode(source, value);
    if (!result.ok) {
        throw new TypeSeaAssertionError(applyParseOptions(result.error, value, options));
    }
    return result.value;
}

/**
 * @brief Parse a value into a Zod-style tagged result.
 * @param source Guard or decoder used for validation and decoding.
 * @param value Candidate runtime input.
 * @param options Optional parse-time message customization.
 * @returns Frozen success or failure result.
 */
export function safeParse<TSource extends DecodeSource>(
    source: TSource,
    value: unknown,
    options?: Partial<ParseOptions>
): SafeParseResult<InferDecoder<TSource>> {
    const result = decode(source, value);
    if (result.ok) {
        return Object.freeze({
            success: true,
            data: result.value
        });
    }
    return Object.freeze({
        success: false,
        error: new TypeSeaAssertionError(applyParseOptions(result.error, value, options))
    });
}

/**
 * @brief Parse a value through a guard, decoder, or async decoder.
 * @param source Sync or async source used for validation and decoding.
 * @param value Candidate runtime input.
 * @param options Optional parse-time message customization.
 * @returns Promise resolving to parsed output.
 * @throws TypeSeaAssertionError through rejection when validation fails.
 */
export async function parseAsync<TSource extends AsyncDecodeSource>(
    source: TSource,
    value: unknown,
    options?: Partial<ParseOptions>
): Promise<InferAsyncDecoder<TSource>> {
    const result = await decodeAsyncSource<InferAsyncDecoder<TSource>>(source, value);
    if (!result.ok) {
        return Promise.reject(new TypeSeaAssertionError(
            applyParseOptions(result.error, value, options)
        ));
    }
    return result.value;
}

/**
 * @brief Parse a value through a sync or async source into a tagged result.
 * @param source Sync or async source used for validation and decoding.
 * @param value Candidate runtime input.
 * @param options Optional parse-time message customization.
 * @returns Promise resolving to a frozen success or failure result.
 */
export async function safeParseAsync<TSource extends AsyncDecodeSource>(
    source: TSource,
    value: unknown,
    options?: Partial<ParseOptions>
): Promise<SafeParseResult<InferAsyncDecoder<TSource>>> {
    const result = await decodeAsyncSource<InferAsyncDecoder<TSource>>(source, value);
    if (result.ok) {
        return Object.freeze({
            success: true,
            data: result.value
        });
    }
    return Object.freeze({
        success: false,
        error: new TypeSeaAssertionError(applyParseOptions(result.error, value, options))
    });
}

/**
 * @brief Zod-compatible alias for safeParseAsync().
 * @param source Sync or async source used for validation and decoding.
 * @param value Candidate runtime input.
 * @param options Optional parse-time message customization.
 * @returns Promise resolving to a frozen success or failure result.
 */
export function spa<TSource extends AsyncDecodeSource>(
    source: TSource,
    value: unknown,
    options?: Partial<ParseOptions>
): Promise<SafeParseResult<InferAsyncDecoder<TSource>>> {
    return safeParseAsync(source, value, options);
}

/**
 * @brief Run one sync or async source into a Result.
 */
function decodeAsyncSource<TValue>(
    source: AsyncDecodeSource,
    value: unknown
): Promise<CheckResult<TValue>> {
    if (isAsyncDecoderValue(source)) {
        return source.decodeAsync(value) as Promise<CheckResult<TValue>>;
    }
    return Promise.resolve(decode(source, value) as CheckResult<TValue>);
}
