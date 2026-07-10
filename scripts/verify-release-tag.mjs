import { readFile } from "node:fs/promises";

const result = await main();
if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
}

/**
 * @brief Run this module top-level workflow.
 */
async function main() {
    const source = await readFile("package.json", "utf8");
    const metadata = JSON.parse(source);
    if (!isRecord(metadata) || typeof metadata.version !== "string") {
        return err("package.json must contain a string version");
    }

    const expected = `v${metadata.version}`;
    const actual = process.env.GITHUB_REF_NAME;
    if (actual !== expected) {
        return err(`release tag must be ${expected}`);
    }

    return ok(undefined);
}

/**
 * @brief Accept non-array objects before structured field reads.
 */
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Construct a successful result value.
 */
function ok(value) {
    return { ok: true, value };
}

/**
 * @brief Construct a failed result value.
 */
function err(error) {
    return { ok: false, error };
}
