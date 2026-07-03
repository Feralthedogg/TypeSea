/**
 * @brief result type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type Result<TValue, TError> =
  | Ok<TValue>
  | Err<TError>;

/**
 * @brief ok interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface Ok<TValue> {

  /**
   * @brief ok field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly ok: true;

  /**
   * @brief value field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly value: TValue;
}

/**
 * @brief err interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface Err<TError> {

  /**
   * @brief ok field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly ok: false;

  /**
   * @brief error field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly error: TError;
}

/**
 * @brief ok function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for ok; ownership of newly created aggregates is transferred to the caller.
 */
export function ok<TValue>(value: TValue): Result<TValue, never> {
  const result: Ok<TValue> = {
    ok: true,
    value
  };
  return Object.freeze(result);
}

/**
 * @brief err function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param error Borrowed input slot named error; validation or normalization happens before stored state changes.
 * @returns Result for err; ownership of newly created aggregates is transferred to the caller.
 */
export function err<TError>(error: TError): Result<never, TError> {
  const result: Err<TError> = {
    ok: false,
    error
  };
  return Object.freeze(result);
}
