import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = "dist";
const forbiddenWords = ["a" + "ny", "tr" + "y", "ca" + "tch"];
const forbidden = new RegExp(`\\b(?:${forbiddenWords.join("|")})\\b`, "u");
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
            if (line !== undefined && forbidden.test(line)) {
                violations.push(`${child}:${String(lineIndex + 1)} banned token`);
            }
        }
    }
}

/**
 * @brief Check built public file.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function isBuiltPublicFile(name) {
    return name.endsWith(".js") || name.endsWith(".d.ts");
}
