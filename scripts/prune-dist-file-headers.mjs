/**
 * @file prune-dist-file-headers.mjs
 * @brief Remove source-file headers duplicated into published JavaScript.
 * @details Source and declaration JSDoc remain intact. Runtime modules do not
 * need the same `@file` block, and removing only that parsed leading trivia
 * keeps the npm footprint bounded without minifying executable code.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";

const DIST_ROOT = "dist";

await pruneDirectory(DIST_ROOT);

/** @brief Visit every emitted JavaScript module below one directory. */
async function pruneDirectory(path) {
    const entries = await readdir(path, { withFileTypes: true });
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
            continue;
        }
        const child = join(path, entry.name);
        if (entry.isDirectory()) {
            await pruneDirectory(child);
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
            await pruneFileHeader(child);
        }
    }
}

/** @brief Remove one parser-proven leading `@file` block from a runtime module. */
async function pruneFileHeader(path) {
    const source = await readFile(path, "utf8");
    const ranges = ts.getLeadingCommentRanges(source, 0) ?? [];
    const first = ranges[0];
    if (first === undefined || first.kind !== ts.SyntaxKind.MultiLineCommentTrivia) {
        return;
    }
    const comment = source.slice(first.pos, first.end);
    if (!comment.startsWith("/**") || !comment.includes("@file")) {
        return;
    }
    let body = first.end;
    if (source.charCodeAt(body) === 13) {
        body += 1;
    }
    if (source.charCodeAt(body) === 10) {
        body += 1;
    }
    await writeFile(path, source.slice(body), "utf8");
}
