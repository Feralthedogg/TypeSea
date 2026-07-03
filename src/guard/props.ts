/**
 * @file props.ts
 * @brief Guard object shape helpers.
 */

export function defineReadonlyProperty(
  target: object,
  key: string,
  value: unknown,
  enumerable: boolean
): void {
  Object.defineProperty(target, key, {
    configurable: false,
    enumerable,
    value,
    writable: false
  });
}

/**
 * @brief is strict true function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is strict true; ownership of newly created aggregates is transferred to the caller.
 */
export function isStrictTrue(value: unknown): boolean {
  return value === true;
}

/**
 * @brief is record function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is record; ownership of newly created aggregates is transferred to the caller.
 */
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief is plain reg exp function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is plain reg exp; ownership of newly created aggregates is transferred to the caller.
 */
export function isPlainRegExp(value: unknown): value is RegExp {
  return value instanceof RegExp &&
    Object.getPrototypeOf(value) === RegExp.prototype &&
    !Object.prototype.hasOwnProperty.call(value, "exec") &&
    !Object.prototype.hasOwnProperty.call(value, "test") &&
    !Object.prototype.hasOwnProperty.call(value, "source") &&
    !Object.prototype.hasOwnProperty.call(value, "flags");
}
