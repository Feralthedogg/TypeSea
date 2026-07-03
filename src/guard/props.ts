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
 * @brief is strict true.
 */
export function isStrictTrue(value: unknown): boolean {
  return value === true;
}

/**
 * @brief is record.
 */
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief is plain reg exp.
 */
export function isPlainRegExp(value: unknown): value is RegExp {
  return value instanceof RegExp &&
    Object.getPrototypeOf(value) === RegExp.prototype &&
    !Object.prototype.hasOwnProperty.call(value, "exec") &&
    !Object.prototype.hasOwnProperty.call(value, "test") &&
    !Object.prototype.hasOwnProperty.call(value, "source") &&
    !Object.prototype.hasOwnProperty.call(value, "flags");
}
