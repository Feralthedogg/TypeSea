import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const attempts = 8;
const delayMs = 15_000;

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
    const source = await readFile("package.json", "utf8");
    const metadata = JSON.parse(source);
    if (!isRecord(metadata) ||
        typeof metadata.name !== "string" ||
        typeof metadata.version !== "string") {
        return err("package.json must contain string name and version fields");
    }

    for (let index = 0; index < attempts; index += 1) {
        const published = readPublishedVersion(metadata.name);
        if (published.ok && published.value === metadata.version) {
            console.log(`${metadata.name}@${metadata.version} is visible on npm`);
            return ok(undefined);
        }
        if (index + 1 < attempts) {
            wait(delayMs);
        }
    }

    return err(`${metadata.name}@${metadata.version} is not visible on npm`);
}

/**
 * @brief Read the latest published package version.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 * @param name Package name from package.json.
 * @returns Result containing the npm registry version string.
 */
function readPublishedVersion(name) {
    const child = spawnSync(npm, [
        "view",
        name,
        "version",
        "--json",
        "--registry=https://registry.npmjs.org",
        "--prefer-online"
    ], {
        encoding: "utf8"
    });
    if (child.error !== undefined) {
        return err(`npm view failed to start: ${String(child.error)}`);
    }
    if (child.status !== 0) {
        return err(`npm view failed with ${String(child.status)}`);
    }
    const version = readJsonString(child.stdout);
    if (version === undefined) {
        return err("npm view did not return a version string");
    }
    return ok(version);
}

/**
 * @brief Read a simple JSON string.
 * @details npm returns the version as a quoted JSON string; release versions use
 * ASCII semver characters only, so a small reader is enough here.
 * @param source Raw npm stdout.
 * @returns Version string or undefined.
 */
function readJsonString(source) {
    const text = source.trim();
    if (text.length < 2 || text[0] !== "\"" || text[text.length - 1] !== "\"") {
        return undefined;
    }
    const value = text.slice(1, -1);
    return /^[0-9A-Za-z.+-]+$/u.test(value) ? value : undefined;
}

/**
 * @brief Wait for a bounded interval.
 * @details Atomics.wait gives this release helper a synchronous sleep without
 * adding dependencies or shell-specific commands.
 * @param durationMs Milliseconds to pause.
 */
function wait(durationMs) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, durationMs);
}

/**
 * @brief Check record.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
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
