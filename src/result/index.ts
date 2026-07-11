/**
 * @file result/index.ts
 * @brief Minimal discriminated Result algebra for expected failure boundaries.
 * @details The closed `ok` discriminant keeps validation and decoding failures
 * explicit without exceptions or package dependencies.
 */

/**
 * @brief Explicit success-or-failure value used instead of implicit exceptions.
 * @details Public validators return Result so failure is visible in the type
 * system and callers must handle diagnostics deliberately.
 */
export type Result<TValue, TError> =
    | Ok<TValue>
    | Err<TError>;

/**
 * @brief Successful Result variant.
 * @details The payload is named `value` so consumers can destructure success
 * without colliding with the failure-side `error` field.
 */
export interface Ok<TValue> {
    readonly ok: true;
    readonly value: TValue;
}

/**
 * @brief Failed Result variant.
 * @details Errors remain typed payloads rather than thrown control flow, which
 * keeps validation and decoding APIs predictable under composition.
 */
export interface Err<TError> {
    readonly ok: false;
    readonly error: TError;
}

/**
 * @brief Construct a frozen successful Result.
 * @details Result helpers keep success and failure explicit in value space instead of
 * relying on implicit control flow.
 * @param value Value produced by a successful operation.
 * @returns Immutable success variant.
 */
export function ok<TValue>(value: TValue): Result<TValue, never> {
    const result: Ok<TValue> = {
        ok: true,
        value
    };
    return Object.freeze(result);
}

/**
 * @brief Construct a frozen failed Result.
 * @details Result helpers keep success and failure explicit in value space instead of
 * relying on implicit control flow.
 * @param error Typed failure payload.
 * @returns Immutable failure variant.
 */
export function err<TError>(error: TError): Result<never, TError> {
    const result: Err<TError> = {
        ok: false,
        error
    };
    return Object.freeze(result);
}
/**
 * @file result/index.ts
 * @brief Minimal discriminated Result algebra used at expected failure boundaries.
 * @details The closed `ok` discriminant keeps validation and decoding failures
 * explicit without exceptions or package dependencies.
 */
