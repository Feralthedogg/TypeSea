#!/usr/bin/env node
import { analyzeTypeScriptProject } from "../tools/analyzer/typescript-frontend.mjs";

const args = process.argv.slice(2);

main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`typescript policy bridge failed: ${message}\n`);
    process.exitCode = 1;
});

async function main() {
    const parsed = parseArguments(args);
    const report = await analyzeTypeScriptProject({
        cwd: parsed.root,
        tsconfigPath: parsed.tsconfig,
        includeSourceText: false,
        outputRoots: parsed.scopes,
        detail: parsed.compact ? "policy" : "full",
        programScope: parsed.compact ? "output" : "project"
    });
    const indentation = parsed.pretty ? 2 : 0;
    process.stdout.write(`${JSON.stringify(report, null, indentation)}\n`);
}

function parseArguments(values) {
    let root = process.cwd();
    let tsconfig = "tsconfig.json";
    let pretty = false;
    let compact = false;
    const scopes = [];
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value === "--pretty") {
            pretty = true;
            continue;
        }
        if (value === "--compact") {
            compact = true;
            continue;
        }
        if (value === "--root" || value === "--tsconfig" || value === "--scope") {
            const next = values[index + 1];
            if (next === undefined || next.startsWith("--")) {
                throw new Error(`missing value for ${value}`);
            }
            if (value === "--root") root = next;
            if (value === "--tsconfig") tsconfig = next;
            if (value === "--scope") scopes.push(next);
            index += 1;
            continue;
        }
        if (value === "--help" || value === "-h") {
            process.stderr.write("usage: node scripts/typescript-policy-bridge.mjs [--root PATH] [--tsconfig PATH] [--scope PATH] [--compact] [--pretty]\n");
            process.exit(0);
        }
        throw new Error(`unknown argument '${value}'`);
    }
    return { root, tsconfig, scopes, compact, pretty };
}
