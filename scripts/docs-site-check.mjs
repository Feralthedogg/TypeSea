import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const result = await main();
if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
}

/**
 * @brief Run this module top-level workflow.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
async function main() {
    const source = await readFile("docs/index.html", "utf8");
    const required = [
        "<title>TypeSea Docs</title>",
        'id="overview"',
        'id="quick-start"',
        'id="architecture"',
        'id="api"',
        'id="adapters"',
        'id="benchmarks"',
        'id="release"',
        'id="files"',
        "Sea-of-Nodes validation IR",
        "Zod, Valibot, and Ajv",
        "npm run release:check",
        'href="https://github.com/Feralthedogg/TypeSea"',
        'href="https://github.com/Feralthedogg/TypeSea/blob/main/docs/api.md"',
        'href="https://github.com/Feralthedogg/TypeSea/blob/main/docs/engine-notes.md"'
    ];

    for (let index = 0; index < required.length; index += 1) {
        const needle = required[index];
        if (needle !== undefined && !source.includes(needle)) {
            return err(`docs/index.html missing ${needle}`);
        }
    }

    const hrefs = collectHrefs(source);
    for (let index = 0; index < hrefs.length; index += 1) {
        const href = hrefs[index];
        if (href === undefined) {
            continue;
        }
        if (href.startsWith("http://") || href.startsWith("https://")) {
            if (!href.startsWith("https://github.com/Feralthedogg/TypeSea")) {
                return err(`docs/index.html has unsupported remote link ${href}`);
            }
            continue;
        }
        if (href.startsWith("#")) {
            const id = href.slice(1);
            if (!source.includes(`id="${id}"`)) {
                return err(`docs/index.html has broken anchor ${href}`);
            }
        }
    }

    const published = await checkPublishedDocs("docs");
    if (!published.ok) {
        return published;
    }

    return ok(undefined);
}

/**
 * @brief Validate published docs.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
async function checkPublishedDocs(root) {
    const files = await collectPublishedFiles(root);
    for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        if (file === undefined) {
            continue;
        }
        const source = await readFile(file, "utf8");
        const active = checkActiveMarkup(file, source);
        if (!active.ok) {
            return active;
        }
        const refs = collectResourceRefs(source);
        for (let refIndex = 0; refIndex < refs.length; refIndex += 1) {
            const ref = refs[refIndex];
            if (ref === undefined) {
                continue;
            }
            const value = ref.value.trim();
            if (isExecutableReference(value)) {
                return err(`${file} has executable ${ref.name} ${value}`);
            }
            if (isRemoteReference(value) &&
                !value.startsWith("https://github.com/Feralthedogg/TypeSea")) {
                return err(`${file} has unsupported remote ${ref.name} ${value}`);
            }
        }
    }
    return ok(undefined);
}

/**
 * @brief Collect published files.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
async function collectPublishedFiles(root) {
    const files = [];
    const entries = await readdir(root, { withFileTypes: true });
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
            continue;
        }
        const path = join(root, entry.name);
        if (entry.isDirectory()) {
            files.push(...await collectPublishedFiles(path));
            continue;
        }
        if (isPublishedMarkup(path)) {
            files.push(path);
        }
    }
    return files;
}

/**
 * @brief Check published markup.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function isPublishedMarkup(path) {
    const extension = extname(path);
    return extension === ".html" || extension === ".svg";
}

/**
 * @brief Validate active markup.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function checkActiveMarkup(file, source) {
    const blocked = [
        /<script\b/iu,
        /<iframe\b/iu,
        /<object\b/iu,
        /<embed\b/iu,
        /<foreignObject\b/iu,
        /<form\b/iu,
        /\ssrcdoc\s*=/iu,
        /\son[a-z0-9_-]+\s*=/iu
    ];

    for (let index = 0; index < blocked.length; index += 1) {
        const pattern = blocked[index];
        if (pattern !== undefined && pattern.test(source)) {
            return err(`${file} has active markup`);
        }
    }

    return ok(undefined);
}

/**
 * @brief Collect resource refs.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function collectResourceRefs(source) {
    const refs = [];
    const pattern = /\b(href|src|srcset|xlink:href|action|formaction|poster)\s*=\s*(["'])(.*?)\2/giu;
    let match = pattern.exec(source);
    while (match !== null) {
        const name = match[1];
        const value = match[3];
        if (name !== undefined && value !== undefined) {
            const values = splitReferenceValues(name, value);
            for (let index = 0; index < values.length; index += 1) {
                const item = values[index];
                if (item !== undefined) {
                    refs.push({
                        name,
                        value: item
                    });
                }
            }
        }
        match = pattern.exec(source);
    }
    return refs;
}

/**
 * @brief Split reference values.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function splitReferenceValues(name, value) {
    if (name.toLowerCase() !== "srcset") {
        return [value];
    }
    const parts = value.split(",");
    const refs = [];
    for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        if (part === undefined) {
            continue;
        }
        const ref = part.trim().split(/\s+/u)[0];
        if (ref !== undefined && ref.length !== 0) {
            refs.push(ref);
        }
    }
    return refs;
}

/**
 * @brief Check executable reference.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function isExecutableReference(value) {
    const lowered = value.trim().toLowerCase();
    return lowered.startsWith("javascript:") ||
        lowered.startsWith("data:text/html");
}

/**
 * @brief Check remote reference.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function isRemoteReference(value) {
    return value.startsWith("http://") || value.startsWith("https://");
}

/**
 * @brief Collect hrefs.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function collectHrefs(source) {
    const hrefs = [];
    const pattern = /href="([^"]+)"/gu;
    let match = pattern.exec(source);
    while (match !== null) {
        const href = match[1];
        if (href !== undefined) {
            hrefs.push(href);
        }
        match = pattern.exec(source);
    }
    return hrefs;
}

/**
 * @brief Construct a successful result value.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function ok(value) {
    return { ok: true, value };
}

/**
 * @brief Construct a failed result value.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function err(error) {
    return { ok: false, error };
}
