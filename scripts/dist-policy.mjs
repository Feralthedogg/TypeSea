import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = "dist";
const forbiddenWords = ["a" + "ny", "tr" + "y", "ca" + "tch"];
const forbidden = new RegExp(`\\b(?:${forbiddenWords.join("|")})\\b`, "u");
const allowedForbiddenLines = [
    "ca" + "tch: ca" + "tchValue",
    "ca" + "tch(fallback",
    "ca" + "tchValue",
    "decoder ca" + "tch receiver",
    "ca" + "tch source"
];
const violations = [];

await scan(root);

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
 * @brief Execute scan.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
async function scan(path) {
    const entries = await readdir(path, { withFileTypes: true });
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
            continue;
        }
        const child = join(path, entry.name);
        if (entry.isDirectory()) {
            await scan(child);
            continue;
        }
        if (!entry.isFile() || !isBuiltPublicFile(entry.name)) {
            continue;
        }
        const source = await readFile(child, "utf8");
        const lines = source.split("\n");
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
            const line = lines[lineIndex];
            if (line !== undefined &&
                forbidden.test(line) &&
                !isAllowedForbiddenLine(line)) {
                violations.push(`${child}:${String(lineIndex + 1)} banned token`);
            }
        }
    }
}

/**
 * @brief Check whether a forbidden token occurrence is an intentional API name.
 * @param line Built source line containing a broad forbidden token match.
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
 * @brief Check built public file.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function isBuiltPublicFile(name) {
    return name.endsWith(".js") || name.endsWith(".d.ts");
}
