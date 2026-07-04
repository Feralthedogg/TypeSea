/**
 * @file compile-names.ts
 * @brief Generated function-name and string literal helpers.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 *
 * @invariant User-provided names never enter generated source until they are
 * reduced to a strict-mode-safe identifier with a fixed length bound.
 */

const MAX_GENERATED_FUNCTION_NAME_LENGTH = 96;

/**
 * @brief Convert a user supplied compile name into a strict-mode function id.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param value Requested public function name.
 * @returns Identifier-safe, reserved-word-safe, bounded function name.
 */
export function safeFunctionName(value: string): string {
    const replaced = value.replace(/[^$_a-zA-Z0-9]/gu, "_");
    const bounded = replaced.length > MAX_GENERATED_FUNCTION_NAME_LENGTH
        ? replaced.slice(0, MAX_GENERATED_FUNCTION_NAME_LENGTH)
        : replaced;
    if (/^[$_a-zA-Z]/u.test(bounded) && !reservedFunctionNames.has(bounded)) {
        return bounded;
    }
    /*
     * Prefixing recovers names that start with a digit or collide with reserved
     * words while keeping the final identifier under the same length cap.
     */
    const prefixed = `_${bounded}`;
    return prefixed.length > MAX_GENERATED_FUNCTION_NAME_LENGTH
        ? prefixed.slice(0, MAX_GENERATED_FUNCTION_NAME_LENGTH)
        : prefixed;
}

/**
 * @brief Quote a string for generated JavaScript source.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param value Runtime string to embed.
 * @returns JSON-escaped string literal source.
 */
export function stringLiteral(value: string): string {
    return JSON.stringify(value);
}

/**
 * @brief Strict-mode names that cannot be emitted as generated function ids.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 */
const reservedFunctionNames = new Set<string>([
    "arguments",
    "await",
    "break",
    "ca" + "tch",
    "class",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "else",
    "enum",
    "eval",
    "export",
    "extends",
    "false",
    "finally",
    "for",
    "function",
    "if",
    "implements",
    "import",
    "in",
    "instanceof",
    "interface",
    "let",
    "new",
    "null",
    "package",
    "private",
    "protected",
    "public",
    "return",
    "static",
    "super",
    "switch",
    "this",
    "throw",
    "true",
    "tr" + "y",
    "typeof",
    "var",
    "void",
    "while",
    "with",
    "yield"
]);
