import { spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const sourceExtensions = [".ts", ".tsx", ".mts", ".cts"];

export async function checkoutRepository(entry, parent) {
    const destination = join(parent, entry.id);
    await mkdir(destination, { recursive: true });
    let result = runGit(destination, ["init", "--quiet"]);
    if (!result.ok) {
        return result;
    }
    result = runGit(destination, [
        "remote",
        "add",
        "origin",
        `https://github.com/${entry.repository}.git`
    ]);
    if (!result.ok) {
        return result;
    }
    result = runGit(destination, ["sparse-checkout", "init", "--no-cone"]);
    if (!result.ok) {
        return result;
    }
    result = runGit(destination, [
        "sparse-checkout",
        "set",
        "--no-cone",
        "**/*.ts",
        "**/*.tsx",
        "**/*.mts",
        "**/*.cts"
    ]);
    if (!result.ok) {
        return result;
    }
    result = runGit(destination, [
        "fetch",
        "--quiet",
        "--depth=1",
        "origin",
        entry.commit
    ]);
    if (!result.ok) {
        return result;
    }
    result = runGit(destination, ["checkout", "--quiet", "--detach", "FETCH_HEAD"]);
    if (!result.ok) {
        return result;
    }
    return ok(destination);
}

export async function collectSourceFiles(root) {
    const output = [];
    await walk(root, output);
    output.sort();
    return output;
}

export async function loadManifest(path) {
    const value = JSON.parse(await readFile(path, "utf8"));
    if (typeof value !== "object" || value === null ||
        !Array.isArray(value.repositories)) {
        return err("real-world repository manifest is malformed");
    }
    return ok(value);
}

export async function writeJson(path, value) {
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function removeWorkspace(path) {
    await rm(path, { force: true, recursive: true });
}

async function walk(path, output) {
    const entries = await readdir(path, { withFileTypes: true });
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined || entry.name === ".git") {
            continue;
        }
        const child = join(path, entry.name);
        if (entry.isDirectory()) {
            await walk(child, output);
            continue;
        }
        if (entry.isFile() && sourceExtensions.some((extension) =>
            child.endsWith(extension))) {
            output.push(child);
        }
    }
}

function runGit(cwd, args) {
    const child = spawnSync("git", args, {
        cwd,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024
    });
    if (child.error !== undefined) {
        return err(`git ${args.join(" ")} failed to start: ${String(child.error)}`);
    }
    if (child.status !== 0) {
        return err(`git ${args.join(" ")} failed: ${child.stderr.trim()}`);
    }
    return ok(undefined);
}

function ok(value) {
    return { ok: true, value };
}

function err(error) {
    return { ok: false, error };
}
