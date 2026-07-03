/**
 * @brief result.
 */
export type Result<TValue, TError> =
  | Ok<TValue>
  | Err<TError>;

/**
 * @brief ok.
 */
export interface Ok<TValue> {
  readonly ok: true;
  readonly value: TValue;
}

/**
 * @brief err.
 */
export interface Err<TError> {
  readonly ok: false;
  readonly error: TError;
}

/**
 * @brief ok.
 */
export function ok<TValue>(value: TValue): Result<TValue, never> {
  const result: Ok<TValue> = {
    ok: true,
    value
  };
  return Object.freeze(result);
}

/**
 * @brief err.
 */
export function err<TError>(error: TError): Result<never, TError> {
  const result: Err<TError> = {
    ok: false,
    error
  };
  return Object.freeze(result);
}
