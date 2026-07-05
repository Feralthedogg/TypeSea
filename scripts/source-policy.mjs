import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const roots = ["src", "test", "bench", "scripts", "eslint.config.mjs"];
const forbiddenWords = ["a" + "ny", "tr" + "y", "ca" + "tch"];
const forbidden = new RegExp(`\\b(?:${forbiddenWords.join("|")})\\b`, "u");
const allowedForbiddenLines = [
    "ca" + "tch: ca" + "tchValue",
    "ca" + "tch(fallback",
    "    ca" + "tch(",
    "public ca" + "tch(",
    "decoder ca" + "tch receiver",
    "ca" + "tch source",
    "t.ca" + "tch(",
    ".ca" + "tch(",
    "    tr" + "y {",
    "    } ca" + "tch {"
];
const forbiddenSnippets = [
    "function " + "contract",
    "routine " + "contract",
    "type alias " + "contract",
    "interface " + "contract",
    "constant " + "contract",
    "field " + "contract",
    "Borrowed input slot " + "named",
    "Documents one concrete " + "slot",
    "Defines a closed compile-time " + "contract"
];
const violations = [];

for (let index = 0; index < roots.length; index += 1) {
    const root = roots[index];
    if (root !== undefined) {
        await scanPath(root);
    }
}

if (violations.length !== 0) {
    for (let index = 0; index < violations.length; index += 1) {
        const violation = violations[index];
        if (violation !== undefined) {
            console.error(violation);
        }
    }
    process.exitCode = 1;
}

/**
 * @brief Execute scan path.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
async function scanPath(path) {
    const entry = await lstat(path);
    if (entry.isDirectory()) {
        await scanDirectory(path);
        return;
    }
    if (entry.isFile() && isCheckedSourceFile(path)) {
        await scanFile(path);
    }
}

/**
 * @brief Execute scan directory.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
async function scanDirectory(path) {
    const entries = await readdir(path, { withFileTypes: true });
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
            continue;
        }
        const child = join(path, entry.name);
        if (entry.isDirectory()) {
            await scanDirectory(child);
            continue;
        }
        if (!entry.isFile() || !isCheckedSourceFile(entry.name)) {
            continue;
        }
        await scanFile(child);
    }
}

/**
 * @brief Execute scan file.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
async function scanFile(path) {
    const source = await readFile(path, "utf8");
    const lines = source.split("\n");
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        if (line === undefined) {
            continue;
        }
        if (forbidden.test(line) && !isAllowedForbiddenLine(line)) {
            violations.push(`${path}:${String(lineIndex + 1)} banned token`);
            continue;
        }
        const snippet = findForbiddenSnippet(line);
        if (snippet !== undefined) {
            violations.push(`${path}:${String(lineIndex + 1)} boilerplate comment: ${snippet}`);
        }
    }
}

/**
 * @brief Check whether a forbidden token occurrence is an intentional API name.
 * @param line Source line containing a broad forbidden token match.
 * @returns True when the line belongs to the decoder fallback API surface.
 */
function isAllowedForbiddenLine(line) {
    for (let index = 0; index < allowedForbiddenLines.length; index += 1) {
        const snippet = allowedForbiddenLines[index];
        if (snippet !== undefined && line.includes(snippet)) {
            return true;
        }
    }
    return false;
}

/**
 * @brief Execute find forbidden snippet.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function findForbiddenSnippet(line) {
    for (let index = 0; index < forbiddenSnippets.length; index += 1) {
        const snippet = forbiddenSnippets[index];
        if (snippet !== undefined && line.includes(snippet)) {
            return snippet;
        }
    }
    return undefined;
}

/**
 * @brief Check checked source file.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function isCheckedSourceFile(name) {
    return name.endsWith(".ts") || name.endsWith(".mjs");
}
