/**
 * @file regexp.ts
 * @brief RegExp shape guard for graph nodes.
 * @details IR helpers preserve Sea-of-Nodes invariants before graphs cross optimizer,
 * compiler, or public introspection boundaries.
 */

export function isPlainRegExp(value: unknown): value is RegExp {
    return value instanceof RegExp &&
        Object.getPrototypeOf(value) === RegExp.prototype &&
        !Object.prototype.hasOwnProperty.call(value, "exec") &&
        !Object.prototype.hasOwnProperty.call(value, "test") &&
        !Object.prototype.hasOwnProperty.call(value, "source") &&
        !Object.prototype.hasOwnProperty.call(value, "flags");
}
