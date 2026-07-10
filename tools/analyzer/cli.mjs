#!/usr/bin/env node
import { analyzeProject, toSarif } from "./engine.mjs";

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const sarifMode = args.includes("--sarif");
const gateMode = args.includes("--gate");
const root = readArg("--root") ?? process.cwd();
const profilePath = readArg("--profile");

analyzeProject({ root, profilePath }).then(
    (analysis) => {
        if (sarifMode) {
            console.log(JSON.stringify(toSarif(analysis), null, 2));
            return;
        }
        if (jsonMode) {
            console.log(JSON.stringify(analysis, null, 2));
            return;
        }
        printSummary(analysis);
        if (gateMode && analysis.qualityGate.status !== "passed") {
            process.exitCode = 1;
        }
    },
    (error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`analyzer failed: ${message}`);
        process.exitCode = 1;
    }
);

function readArg(name) {
    const index = args.indexOf(name);
    if (index === -1) {
        return undefined;
    }
    return args[index + 1];
}

function printSummary(analysis) {
    const summary = analysis.summary;
    console.log("TypeSea Static Analyzer");
    console.log(`root: ${analysis.root}`);
    console.log(`files: ${String(summary.files)}`);
    console.log(`lines: ${String(summary.lines)}`);
    console.log(`runtime edges: ${String(summary.runtimeEdges)}`);
    console.log(`type-only edges: ${String(summary.typeOnlyEdges)}`);
    console.log(`functions: ${String(summary.functions)}`);
    console.log(`call edges: ${String(summary.callEdges)}`);
    console.log(`function cycles: ${String(summary.functionCycles)}`);
    console.log(`cycles: ${String(summary.cycles)}`);
    console.log(`findings: ${String(summary.findings.error)} error, ${String(summary.findings.warning)} warning, ${String(summary.findings.info)} info`);
    console.log(`quality gate: ${analysis.qualityGate.status}`);
    console.log("");

    console.log("Top rules:");
    const ruleLimit = Math.min(8, analysis.ruleSummary.length);
    for (let index = 0; index < ruleLimit; index += 1) {
        const rule = analysis.ruleSummary[index];
        if (rule !== undefined) {
            console.log(`- ${rule.rule}: ${String(rule.count)} (${rule.category})`);
        }
    }
    console.log("");

    const limit = Math.min(20, analysis.findings.length);
    for (let index = 0; index < limit; index += 1) {
        const item = analysis.findings[index];
        if (item === undefined) {
            continue;
        }
        console.log(`${item.severity.toUpperCase()} [${item.rule}] ${item.path}:${String(item.line)} ${item.message}`);
    }
    if (analysis.findings.length > limit) {
        console.log(`... ${String(analysis.findings.length - limit)} more finding(s)`);
    }
}
