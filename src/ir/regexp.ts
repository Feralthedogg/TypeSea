/**
 * @file regexp.ts
 * @brief RegExp shape guard for graph nodes.
 */

export function isPlainRegExp(value: unknown): value is RegExp {
  return value instanceof RegExp &&
    Object.getPrototypeOf(value) === RegExp.prototype &&
    !Object.prototype.hasOwnProperty.call(value, "exec") &&
    !Object.prototype.hasOwnProperty.call(value, "test") &&
    !Object.prototype.hasOwnProperty.call(value, "source") &&
    !Object.prototype.hasOwnProperty.call(value, "flags");
}
