import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileSelfContained } from "./compiler.mjs";
import { makeMarkdown } from "./report.mjs";
import {
    checkoutRepository,
    collectSourceFiles,
    loadManifest,
    removeWorkspace,
    writeJson
} from "./repository.mjs";
import {
    finalizeAggregate,
    mergeRepositoryAggregates,
    scanRepository
} from "./scanner.mjs";
import { evaluateSupport, makeRuntimeCatalog } from "./support.mjs";

const toolRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(toolRoot, "..", "..");
const manifestPath = join(toolRoot, "repositories.json");
const resultPath = join(toolRoot, "latest.json");
const reportPath = join(repositoryRoot, "docs", "zod-real-world-compat.md");
const packageMetadata = JSON.parse(await readFile(
    join(repositoryRoot, "package.json"),
    "utf8"
));
const zodMetadata = JSON.parse(await readFile(
    join(repositoryRoot, "node_modules", "zod", "package.json"),
    "utf8"
));
const mode = process.argv.includes("--check") ? "check" : "record";
const result = mode === "check" ? await checkSnapshot() : await recordSnapshot();
if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
}

async function recordSnapshot() {
    const manifestResult = await loadManifest(manifestPath);
    if (!manifestResult.ok) {
        return manifestResult;
    }
    const workspace = await mkdtemp(join(repositoryRoot, ".zod-compat-"));
    const zod = await import("zod");
    const catalog = makeRuntimeCatalog(zod);
    const repositories = [];
    const aggregates = [];
    for (let index = 0; index < manifestResult.value.repositories.length; index += 1) {
        const entry = manifestResult.value.repositories[index];
        if (entry === undefined) {
            continue;
        }
        console.log(`[${String(index + 1)}/${String(manifestResult.value.repositories.length)}] scanning ${entry.repository}@${entry.commit.slice(0, 12)}`);
        const checkout = await checkoutRepository(entry, workspace);
        if (!checkout.ok) {
            return checkout;
        }
        const files = await collectSourceFiles(checkout.value);
        const aggregate = await scanRepository(entry, checkout.value, files, catalog);
        aggregates.push(aggregate);
        repositories.push(finalizeAggregate(aggregate));
    }
    const observedAggregate = mergeRepositoryAggregates(aggregates);
    const observed = finalizeAggregate(observedAggregate);
    const compilation = await compileSelfContained(
        observedAggregate.selfContained,
        join(workspace, "compile")
    );
    const support = await evaluateSupport(repositoryRoot, observed);
    const report = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        typeseaVersion: packageMetadata.version,
        zodVersion: zodMetadata.version,
        manifestSchemaVersion: manifestResult.value.schemaVersion,
        repositories,
        totals: {
            repositories: repositories.length,
            zodFiles: observed.zodFiles,
            bytes: observed.bytes,
            callCount: observed.callCount,
            internalAccesses: observed.internalAccesses,
            selfContainedFiles: observed.selfContainedFiles
        },
        observed: {
            staticPaths: observed.staticPaths,
            methods: observed.methods,
            namedImports: observed.namedImports,
            typeSymbols: observed.typeSymbols
        },
        compilation,
        support
    };
    await writeJson(resultPath, report);
    await writeFile(reportPath, makeMarkdown(report));
    await removeWorkspace(workspace);
    console.log(`recorded ${String(report.totals.zodFiles)} Zod files and ${String(report.totals.callCount)} calls`);
    return ok(undefined);
}

async function checkSnapshot() {
    const report = JSON.parse(await readFile(resultPath, "utf8"));
    const manifestResult = await loadManifest(manifestPath);
    if (!manifestResult.ok) {
        return manifestResult;
    }
    if (report.schemaVersion !== 1 || report.totals?.repositories !==
        manifestResult.value.repositories.length) {
        return err("real-world compatibility snapshot does not match its manifest");
    }
    if (report.totals.zodFiles < 100 || report.totals.callCount < 500) {
        return err("real-world compatibility corpus is below its minimum coverage floor");
    }
    const budgets = manifestResult.value.budgets;
    if (typeof budgets?.maxCompilationRegressions !== "number" ||
        typeof budgets.maxMissingDeclarationExports !== "number") {
        return err("real-world compatibility manifest has no regression budgets");
    }
    if (report.compilation.regressionDiagnostics >
        budgets.maxCompilationRegressions ||
        report.support.missingDeclarationExports.length >
        budgets.maxMissingDeclarationExports) {
        return err("real-world compatibility snapshot exceeds its explicit budgets");
    }
    const support = await evaluateSupport(repositoryRoot, report.observed);
    if (support.missingStaticPaths.length > report.support.missingStaticPaths.length ||
        support.missingMethods.length > report.support.missingMethods.length ||
        support.missingDeclarationExports.length >
            report.support.missingDeclarationExports.length) {
        return err("TypeSea compatibility regressed against the real-world Zod snapshot");
    }
    console.log(`real-world Zod corpus ok: ${String(report.totals.zodFiles)} files, ${String(report.totals.callCount)} calls`);
    return ok(undefined);
}

function ok(value) {
    return { ok: true, value };
}

function err(error) {
    return { ok: false, error };
}
