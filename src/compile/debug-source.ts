/**
 * @file debug-source.ts
 * @brief Human-readable generated validator source formatting.
 * @details The formatter is used only when callers explicitly request debug
 * source. Compact source remains the default hot path.
 */

const INDENT = "    ";

/**
 * @brief Build a debug-friendly generated source body.
 * @param source Compact generated JavaScript source.
 * @param name Sanitized public validator function name.
 * @param mode Compile mode used by the generated validator.
 * @returns Source with comments, indentation, and sourceURL metadata.
 */
export function formatDebugSource(
    source: string,
    name: string,
    mode: string
): string {
    return [
        "/*",
        " * TypeSea generated validator.",
        ` * name: ${name}`,
        ` * mode: ${mode}`,
        " * source mode: debug",
        " * Sections below are emitted code; user literals and dynamic schemas",
        " * stay in side tables rather than being interpolated into this source.",
        " */",
        formatJavaScript(source),
        `//# sourceURL=typesea-${name}.generated.js`,
        ""
    ].join("\n");
}

/**
 * @brief Format generated JavaScript without parsing user data as code.
 * @param source Compact generated JavaScript source.
 * @returns Readable source preserving string literal contents exactly.
 */
function formatJavaScript(source: string): string {
    const output: string[] = [];
    let indent = 0;
    let index = 0;
    let lineStart = true;

    while (index < source.length) {
        const char = source[index];
        if (char === undefined) {
            break;
        }
        if (char === "\"" || char === "'" || char === "`") {
            write(output, readQuoted(source, index), indent, lineStart);
            lineStart = false;
            index = skipQuoted(source, index);
            continue;
        }
        if (char === "{") {
            write(output, char, indent, lineStart);
            indent += 1;
            lineStart = newline(output);
            index += 1;
            continue;
        }
        if (char === "}") {
            if (!lineStart) {
                lineStart = newline(output);
            }
            indent = Math.max(0, indent - 1);
            write(output, char, indent, lineStart);
            lineStart = false;
            index += 1;
            if (!isTightFollower(source[index])) {
                lineStart = newline(output);
            }
            continue;
        }
        if (char === ";") {
            write(output, char, indent, lineStart);
            lineStart = newline(output);
            index += 1;
            continue;
        }
        if (isWhitespace(char)) {
            const previous = lastOutputChar(output);
            const next = nextNonWhitespace(source, index + 1);
            if (previous !== undefined &&
                next !== undefined &&
                isIdentifierPart(previous) &&
                isIdentifierPart(next)) {
                write(output, " ", indent, lineStart);
                lineStart = false;
            }
            index += 1;
            continue;
        }
        write(output, char, indent, lineStart);
        lineStart = false;
        index += 1;
    }
    return output.join("").trimEnd();
}

/**
 * @brief Write a token with indentation when starting a line.
 */
function write(
    output: string[],
    token: string,
    indent: number,
    lineStart: boolean
): void {
    if (lineStart) {
        for (let index = 0; index < indent; index += 1) {
            output.push(INDENT);
        }
    }
    output.push(token);
}

/**
 * @brief Append a newline unless the output already ends with one.
 * @returns True because the next write starts a new line.
 */
function newline(output: string[]): boolean {
    if (output[output.length - 1] !== "\n") {
        output.push("\n");
    }
    return true;
}

/**
 * @brief Read one quoted JavaScript literal from generated source.
 */
function readQuoted(source: string, start: number): string {
    return source.slice(start, skipQuoted(source, start));
}

/**
 * @brief Skip one quoted JavaScript literal.
 * @returns Index immediately after the closing quote, or source length.
 */
function skipQuoted(source: string, start: number): number {
    const quote = source[start];
    let index = start + 1;
    while (index < source.length) {
        const char = source[index];
        if (char === "\\") {
            index += 2;
            continue;
        }
        index += 1;
        if (char === quote) {
            return index;
        }
    }
    return source.length;
}

/**
 * @brief Check whether a character should remain attached to a closing brace.
 */
function isTightFollower(char: string | undefined): boolean {
    return char === ";" ||
        char === "," ||
        char === ")" ||
        char === "]" ||
        char === undefined;
}

/**
 * @brief Check for whitespace emitted by compact codegen.
 */
function isWhitespace(char: string): boolean {
    return char === " " ||
        char === "\n" ||
        char === "\r" ||
        char === "\t";
}

/**
 * @brief Read the last emitted character.
 */
function lastOutputChar(output: readonly string[]): string | undefined {
    for (let index = output.length - 1; index >= 0; index -= 1) {
        const chunk = output[index];
        if (chunk !== undefined && chunk.length !== 0) {
            return chunk[chunk.length - 1];
        }
    }
    return undefined;
}

/**
 * @brief Find the next non-whitespace character in source.
 */
function nextNonWhitespace(source: string, start: number): string | undefined {
    for (let index = start; index < source.length; index += 1) {
        const char = source[index];
        if (char !== undefined && !isWhitespace(char)) {
            return char;
        }
    }
    return undefined;
}

/**
 * @brief Check whether a character can be part of a JavaScript identifier.
 */
function isIdentifierPart(char: string): boolean {
    const code = char.charCodeAt(0);
    return (code >= 48 && code <= 57) ||
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122) ||
        char === "_" ||
        char === "$";
}
