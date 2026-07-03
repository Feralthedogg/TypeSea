/**
 * @file compile-names.ts
 * @brief Generated function-name and string literal helpers.
 *
 * @invariant User-provided names never enter generated source until they are
 * reduced to a strict-mode-safe identifier with a fixed length bound.
 */

const MAX_GENERATED_FUNCTION_NAME_LENGTH = 96;

/**
 * @brief safe function name function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for safe function name; ownership of newly created aggregates is transferred to the caller.
 */
export function safeFunctionName(value: string): string {
  const replaced = value.replace(/[^$_a-zA-Z0-9]/gu, "_");
  const bounded = replaced.length > MAX_GENERATED_FUNCTION_NAME_LENGTH
    ? replaced.slice(0, MAX_GENERATED_FUNCTION_NAME_LENGTH)
    : replaced;
  if (/^[$_a-zA-Z]/u.test(bounded) && !reservedFunctionNames.has(bounded)) {
    return bounded;
  }
  const prefixed = `_${bounded}`;
  return prefixed.length > MAX_GENERATED_FUNCTION_NAME_LENGTH
    ? prefixed.slice(0, MAX_GENERATED_FUNCTION_NAME_LENGTH)
    : prefixed;
}

/**
 * @brief string literal function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for string literal; ownership of newly created aggregates is transferred to the caller.
 */
export function stringLiteral(value: string): string {
  return JSON.stringify(value);
}

/**
 * @brief reserved function names constant contract.
 * @details Module-scope storage with stable identity, created once and reused by callers.
 * @invariant Initialization happens during module load and later code treats the binding as fixed.
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
