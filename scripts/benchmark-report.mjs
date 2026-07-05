import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { dirname, join } from "node:path";

const rawPath = "bench/results/raw.json";
const summaryPath = "bench/results/latest.json";
const svgPath = "docs/assets/benchmark-headline.svg";

const suiteSpecs = [
    {
        id: "valid-is",
        title: "Valid object path",
        group: "ecosystem comparison valid"
    },
    {
        id: "valid-check",
        title: "Valid diagnostic path",
        group: "ecosystem comparison valid diagnostics"
    },
    {
        id: "invalid-is",
        title: "Invalid object fast-fail",
        group: "ecosystem comparison invalid"
    },
    {
        id: "invalid-check",
        title: "Invalid diagnostic path",
        group: "ecosystem comparison invalid diagnostics"
    }
];

const benchmarkNames = [
    {
        id: "typesea-interpreted",
        color: "#9ca3af",
        sourceNames: ["typesea interpreted", "typesea interpreted check"],
        label: "TypeSea interpreted"
    },
    {
        id: "typesea-safe",
        color: "#14b8a6",
        sourceNames: ["typesea compiled", "typesea compiled check"],
        label: "TypeSea safe compiled"
    },
    {
        id: "typesea-unsafe",
        color: "#f97316",
        sourceNames: ["typesea unsafe compiled", "typesea unsafe compiled check"],
        label: "TypeSea unsafe compiled"
    },
    {
        id: "typesea-unchecked",
        color: "#22c55e",
        sourceNames: ["typesea unchecked compiled", "typesea unchecked compiled check"],
        label: "TypeSea unchecked compiled"
    },
    {
        id: "zod",
        color: "#8b5cf6",
        sourceNames: ["zod safeParse"],
        label: "Zod safeParse"
    },
    {
        id: "valibot",
        color: "#ec4899",
        sourceNames: ["valibot safeParse"],
        label: "Valibot safeParse"
    },
    {
        id: "ajv",
        color: "#3b82f6",
        sourceNames: ["ajv compiled"],
        label: "Ajv compiled"
    }
];

const benchmarkFloors = [
    {
        suite: "valid-is",
        row: "typesea-unchecked",
        label: "unchecked valid hot path",
        minHz: 40_000_000
    },
    {
        suite: "invalid-is",
        row: "typesea-safe",
        label: "safe invalid fast-fail",
        minHz: 40_000_000
    },
    {
        suite: "valid-is",
        row: "typesea-safe",
        label: "safe valid path",
        minHz: 5_000_000
    }
];

const result = await main();
if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
}

/**
 * @brief Execute the benchmark report helper.
 * @details Record mode runs Vitest bench and regenerates committed benchmark
 * artifacts. Render and check modes operate only on the committed summary.
 */
async function main() {
    const mode = readMode(process.argv.slice(2));
    if (!mode.ok) {
        return mode;
    }
    switch (mode.value) {
        case "record":
            return recordBenchmarks();
        case "render":
            return renderBenchmarks();
        case "check":
            return checkBenchmarks();
        case "compare":
            return compareBenchmarks();
    }
}

/**
 * @brief Parse the helper mode from command-line arguments.
 * @param args Command-line arguments after the script path.
 * @returns Result containing the selected mode.
 */
function readMode(args) {
    if (args.length === 0 || args.includes("--record")) {
        return ok("record");
    }
    if (args.includes("--render")) {
        return ok("render");
    }
    if (args.includes("--check")) {
        return ok("check");
    }
    if (args.includes("--compare")) {
        return ok("compare");
    }
    return err("usage: benchmark-report.mjs [--record|--render|--check|--compare]");
}

/**
 * @brief Run Vitest benchmarks and refresh report artifacts.
 * @returns Empty success result when all files were written.
 */
async function recordBenchmarks() {
    await ensureOutputDirectories();
    const bench = runVitestBench();
    if (!bench.ok) {
        return bench;
    }
    const raw = await readJson(rawPath);
    if (!raw.ok) {
        return raw;
    }
    const summary = await summarizeRawBenchmarks(raw.value);
    if (!summary.ok) {
        return summary;
    }
    await writeFile(summaryPath, `${JSON.stringify(summary.value, null, 4)}\n`, "utf8");
    await writeFile(svgPath, renderSvg(summary.value), "utf8");
    return ok(undefined);
}

/**
 * @brief Regenerate the SVG from the committed summary.
 * @returns Empty success result when the SVG was written.
 */
async function renderBenchmarks() {
    const summary = await readJson(summaryPath);
    if (!summary.ok) {
        return summary;
    }
    await writeFile(svgPath, renderSvg(summary.value), "utf8");
    return ok(undefined);
}

/**
 * @brief Verify that generated benchmark assets are fresh.
 * @returns Empty success result when committed artifacts match the summary.
 */
async function checkBenchmarks() {
    const summary = await readJson(summaryPath);
    if (!summary.ok) {
        return summary;
    }
    const expected = renderSvg(summary.value);
    const current = await readFile(svgPath, "utf8");
    if (current !== expected) {
        return err("benchmark graph is stale; run npm run bench:render");
    }
    return compareBenchmarkFloors(summary.value, false);
}

/**
 * @brief Compare committed benchmark results against release floors.
 * @returns Empty success result when every floor is satisfied.
 */
async function compareBenchmarks() {
    const summary = await readJson(summaryPath);
    if (!summary.ok) {
        return summary;
    }
    return compareBenchmarkFloors(summary.value, true);
}

/**
 * @brief Check the benchmark floor table.
 * @param summary Benchmark summary JSON.
 * @param printRows Whether comparison rows should be printed.
 * @returns Empty success result when all floor checks pass.
 */
function compareBenchmarkFloors(summary, printRows) {
    let failed = false;
    const lines = [];
    for (let index = 0; index < benchmarkFloors.length; index += 1) {
        const floor = benchmarkFloors[index];
        if (floor === undefined) {
            continue;
        }
        const hz = readSummaryHz(summary, floor.suite, floor.row);
        if (hz === undefined) {
            return err(`missing benchmark floor row: ${floor.suite}/${floor.row}`);
        }
        const okRow = hz >= floor.minHz;
        failed = failed || !okRow;
        const delta = ((hz - floor.minHz) / floor.minHz) * 100;
        lines.push(`${floor.label}: ${formatHz(hz)} floor ${formatHz(floor.minHz)} ${formatSignedPercent(delta)} ${okRow ? "OK" : "FAIL"}`);
    }
    if (printRows) {
        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index];
            if (line !== undefined) {
                console.log(line);
            }
        }
    }
    if (failed) {
        return err("benchmark regression floor failed; run npm run bench:record only after investigating the slowdown");
    }
    return ok(undefined);
}

/**
 * @brief Create directories used by benchmark artifacts.
 */
async function ensureOutputDirectories() {
    await mkdir(dirname(rawPath), { recursive: true });
    await mkdir(dirname(svgPath), { recursive: true });
}

/**
 * @brief Execute Vitest bench with JSON output enabled.
 * @returns Empty result when the process exits successfully.
 */
function runVitestBench() {
    const executable = process.platform === "win32"
        ? join("node_modules", ".bin", "vitest.cmd")
        : join("node_modules", ".bin", "vitest");
    const child = spawnSync(executable, [
        "bench",
        "--run",
        "--outputJson",
        rawPath
    ], {
        stdio: "inherit"
    });
    if (child.error !== undefined) {
        return err(`vitest bench failed to start: ${String(child.error)}`);
    }
    if (child.status !== 0) {
        return err(`vitest bench exited with ${String(child.status)}`);
    }
    return ok(undefined);
}

/**
 * @brief Load and parse one JSON file.
 * @param path Path to the JSON file.
 * @returns Parsed JSON value.
 */
async function readJson(path) {
    return ok(JSON.parse(await readFile(path, "utf8")));
}

/**
 * @brief Convert raw Vitest bench output into a stable public report.
 * @param raw Raw JSON emitted by Vitest bench.
 * @returns Benchmark summary consumed by README graph generation.
 */
async function summarizeRawBenchmarks(raw) {
    if (!isRecord(raw) || !Array.isArray(raw.files)) {
        return err("Vitest benchmark JSON has an unexpected shape");
    }
    const metadata = await readPackageMetadata();
    if (!metadata.ok) {
        return metadata;
    }
    const suites = [];
    for (let index = 0; index < suiteSpecs.length; index += 1) {
        const spec = suiteSpecs[index];
        if (spec === undefined) {
            continue;
        }
        const group = findBenchmarkGroup(raw.files, spec.group);
        if (group === undefined) {
            return err(`missing benchmark group: ${spec.group}`);
        }
        const rows = readRows(group);
        if (!rows.ok) {
            return rows;
        }
        suites.push({
            id: spec.id,
            title: spec.title,
            group: group.fullName,
            rows: rows.value
        });
    }
    return ok({
        schemaVersion: 1,
        package: metadata.value.name,
        version: metadata.value.version,
        recordedAt: new Date().toISOString(),
        command: "npm run bench:record",
        rawOutput: rawPath,
        environment: readEnvironment(),
        suites
    });
}

/**
 * @brief Read package name and version.
 * @returns Package metadata used in benchmark summaries.
 */
async function readPackageMetadata() {
    const metadata = await readJson("package.json");
    if (!metadata.ok) {
        return metadata;
    }
    if (!isRecord(metadata.value) ||
        typeof metadata.value.name !== "string" ||
        typeof metadata.value.version !== "string") {
        return err("package.json must contain string name and version");
    }
    return ok({
        name: metadata.value.name,
        version: metadata.value.version
    });
}

/**
 * @brief Capture machine metadata useful for benchmark reproduction.
 * @returns Stable record of the local benchmark environment.
 */
function readEnvironment() {
    const cpuList = cpus();
    return {
        node: process.version,
        v8: process.versions.v8,
        platform: process.platform,
        arch: process.arch,
        cpu: cpuList[0]?.model ?? "unknown",
        logicalCpus: cpuList.length
    };
}

/**
 * @brief Find a named benchmark group in Vitest output.
 * @param files Raw file records.
 * @param groupName Suffix of the benchmark group name.
 * @returns Matching benchmark group or undefined.
 */
function findBenchmarkGroup(files, groupName) {
    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const file = files[fileIndex];
        if (!isRecord(file) || !Array.isArray(file.groups)) {
            continue;
        }
        for (let groupIndex = 0; groupIndex < file.groups.length; groupIndex += 1) {
            const group = file.groups[groupIndex];
            if (isRecord(group) &&
                typeof group.fullName === "string" &&
                group.fullName.endsWith(groupName) &&
                Array.isArray(group.benchmarks)) {
                return group;
            }
        }
    }
    return undefined;
}

/**
 * @brief Read normalized rows from one benchmark group.
 * @param group Raw Vitest benchmark group.
 * @returns Rows in display order.
 */
function readRows(group) {
    const rows = [];
    for (let index = 0; index < benchmarkNames.length; index += 1) {
        const spec = benchmarkNames[index];
        if (spec === undefined) {
            continue;
        }
        const benchmark = findBenchmark(group.benchmarks, spec.sourceNames);
        if (benchmark === undefined) {
            return err(`missing benchmark row in ${group.fullName}: ${spec.label}`);
        }
        if (typeof benchmark.hz !== "number" ||
            typeof benchmark.rme !== "number" ||
            typeof benchmark.sampleCount !== "number") {
            return err(`malformed benchmark row in ${group.fullName}: ${spec.label}`);
        }
        rows.push({
            id: spec.id,
            label: spec.label,
            sourceName: benchmark.name,
            color: spec.color,
            hz: benchmark.hz,
            rme: benchmark.rme,
            sampleCount: benchmark.sampleCount
        });
    }
    return ok(rows);
}

/**
 * @brief Find one benchmark by one accepted source name.
 * @param benchmarks Raw benchmark rows.
 * @param names Accepted Vitest benchmark names.
 * @returns Raw benchmark row or undefined.
 */
function findBenchmark(benchmarks, names) {
    for (let index = 0; index < benchmarks.length; index += 1) {
        const benchmark = benchmarks[index];
        if (isRecord(benchmark) &&
            typeof benchmark.name === "string" &&
            names.includes(benchmark.name)) {
            return benchmark;
        }
    }
    return undefined;
}

/**
 * @brief Render the benchmark SVG used by README and the docs site.
 * @param summary Benchmark summary JSON.
 * @returns SVG source.
 */
function renderSvg(summary) {
    const suites = Array.isArray(summary.suites) ? summary.suites : [];
    const valid = readSuite(suites, "valid-is");
    const invalid = readSuite(suites, "invalid-is");
    const invalidCheck = readSuite(suites, "invalid-check");
    const safeValid = readHz(valid, "typesea-safe");
    const uncheckedValid = readHz(valid, "typesea-unchecked");
    const zodValid = readHz(valid, "zod");
    const ajvValid = readHz(valid, "ajv");
    const safeInvalid = readHz(invalid, "typesea-safe");
    const zodInvalid = readHz(invalid, "zod");
    const ajvInvalid = readHz(invalid, "ajv");
    const date = formatRecordDate(summary.recordedAt);

    return `<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="930" viewBox="0 0 1120 930" role="img" aria-labelledby="title desc">
    <title id="title">TypeSea benchmark comparison</title>
    <desc id="desc">Local strict object benchmark generated from bench/results/latest.json.</desc>
    <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#071014"/>
            <stop offset="1" stop-color="#14211d"/>
        </linearGradient>
        <style>
            text { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
            .title { fill: #f8fafc; font-size: 40px; font-weight: 800; letter-spacing: 0; }
            .subtitle { fill: #a7b4ad; font-size: 15px; font-weight: 500; }
            .card-title { fill: #a7b4ad; font-size: 12px; font-weight: 800; text-transform: uppercase; }
            .card-value { fill: #f8fafc; font-size: 30px; font-weight: 900; }
            .card-note { fill: #d1d5db; font-size: 13px; font-weight: 600; }
            .panel-title { fill: #f3f4f6; font-size: 18px; font-weight: 800; }
            .panel-note { fill: #9ca3af; font-size: 12px; font-weight: 600; }
            .bar-label { fill: #cbd5e1; font-size: 12px; font-weight: 700; }
            .bar-value { fill: #f8fafc; font-size: 12px; font-weight: 800; }
            .axis { stroke: #334155; stroke-width: 1; }
        </style>
    </defs>
    <rect width="1120" height="930" rx="24" fill="url(#bg)"/>
    <text x="44" y="58" class="title">TypeSea benchmark comparison</text>
    <text x="46" y="88" class="subtitle">Generated from bench/results/latest.json. Local run ${escapeXml(date)}, ops/sec, higher is better.</text>
    ${renderCard(44, 118, "Unchecked valid hot path", uncheckedValid, `${ratio(uncheckedValid, zodValid)}x Zod, ${ratio(uncheckedValid, ajvValid)}x Ajv`)}
    ${renderCard(398, 118, "Safe invalid fast-fail", safeInvalid, `${ratio(safeInvalid, ajvInvalid)}x Ajv, ${ratio(safeInvalid, zodInvalid)}x Zod`)}
    ${renderCard(752, 118, "Safe valid path", safeValid, `${ratio(safeValid, ajvValid)}x Ajv while staying hostile-input safe`)}
    ${renderPanel(valid, 44, 248)}
    ${renderPanel(readSuite(suites, "valid-check"), 44, 414)}
    ${renderPanel(invalid, 44, 580)}
    ${renderPanel(invalidCheck, 44, 746)}
    <text x="44" y="900" class="panel-note">CPU: ${escapeXml(summary.environment?.cpu ?? "unknown")} / Node ${escapeXml(summary.environment?.node ?? "unknown")} / V8 ${escapeXml(summary.environment?.v8 ?? "unknown")}</text>
</svg>
`;
}

/**
 * @brief Render one headline metric card.
 */
function renderCard(x, y, title, value, note) {
    return `<g>
        <rect x="${String(x)}" y="${String(y)}" width="324" height="100" rx="12" fill="#111827" stroke="#243044"/>
        <text x="${String(x + 22)}" y="${String(y + 31)}" class="card-title">${escapeXml(title)}</text>
        <text x="${String(x + 22)}" y="${String(y + 68)}" class="card-value">${escapeXml(formatCompact(value))}</text>
        <text x="${String(x + 22)}" y="${String(y + 90)}" class="card-note">${escapeXml(note)}</text>
    </g>`;
}

/**
 * @brief Render one benchmark suite panel.
 */
function renderPanel(suite, x, y) {
    const rows = Array.isArray(suite.rows) ? suite.rows : [];
    const max = Math.max(...rows.map((row) => Number(row.hz) || 0), 1);
    const chunks = [
        `<g>`,
        `<rect x="${String(x)}" y="${String(y)}" width="1032" height="148" rx="12" fill="#101820" stroke="#243044"/>`,
        `<text x="${String(x + 22)}" y="${String(y + 30)}" class="panel-title">${escapeXml(suite.title ?? "Benchmark")}</text>`,
        `<text x="${String(x + 246)}" y="${String(y + 30)}" class="panel-note">linear scale to ${escapeXml(formatCompact(max))}</text>`,
        `<line x1="${String(x + 292)}" y1="${String(y + 48)}" x2="${String(x + 922)}" y2="${String(y + 48)}" class="axis"/>`
    ];
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        if (!isRecord(row)) {
            continue;
        }
        const rowY = y + 61 + index * 13;
        const hz = Number(row.hz) || 0;
        const barWidth = hz <= 0 ? 0 : Math.max(2, Math.round((hz / max) * 630));
        chunks.push(`<text x="${String(x + 22)}" y="${String(rowY + 7)}" class="bar-label">${escapeXml(row.label ?? "")}</text>`);
        chunks.push(`<rect x="${String(x + 292)}" y="${String(rowY)}" width="${String(barWidth)}" height="8" rx="4" fill="${escapeXml(row.color ?? "#94a3b8")}"/>`);
        chunks.push(`<text x="${String(x + 936)}" y="${String(rowY + 7)}" class="bar-value">${escapeXml(formatHz(hz))}</text>`);
    }
    chunks.push("</g>");
    return chunks.join("\n    ");
}

/**
 * @brief Locate one suite in the benchmark summary.
 */
function readSuite(suites, id) {
    for (let index = 0; index < suites.length; index += 1) {
        const suite = suites[index];
        if (isRecord(suite) && suite.id === id) {
            return suite;
        }
    }
    return {
        id,
        title: id,
        rows: []
    };
}

/**
 * @brief Read the hz value for one row id.
 */
function readHz(suite, id) {
    const rows = Array.isArray(suite.rows) ? suite.rows : [];
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        if (isRecord(row) && row.id === id && typeof row.hz === "number") {
            return row.hz;
        }
    }
    return 0;
}

/**
 * @brief Read one committed benchmark row by suite and row id.
 */
function readSummaryHz(summary, suiteId, rowId) {
    const suites = Array.isArray(summary.suites) ? summary.suites : [];
    const suite = readSuite(suites, suiteId);
    const rows = Array.isArray(suite.rows) ? suite.rows : [];
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        if (isRecord(row) && row.id === rowId && typeof row.hz === "number") {
            return row.hz;
        }
    }
    return undefined;
}

/**
 * @brief Format an exact integer hz value with grouping separators.
 */
function formatHz(value) {
    return `${Math.round(value).toLocaleString("en-US")} hz`;
}

/**
 * @brief Format a signed percentage delta.
 */
function formatSignedPercent(value) {
    const sign = value >= 0 ? "+" : "";
    return `(${sign}${value.toFixed(1)}%)`;
}

/**
 * @brief Format a compact headline number.
 */
function formatCompact(value) {
    if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(2)}M`;
    }
    if (value >= 1_000) {
        return `${(value / 1_000).toFixed(0)}K`;
    }
    return String(Math.round(value));
}

/**
 * @brief Format a ratio for display.
 */
function ratio(left, right) {
    if (right <= 0) {
        return "n/a";
    }
    return (left / right).toFixed(left / right >= 10 ? 0 : 2);
}

/**
 * @brief Format an ISO timestamp as a short date.
 */
function formatRecordDate(value) {
    if (typeof value !== "string") {
        return "unknown date";
    }
    return value.slice(0, 10);
}

/**
 * @brief Escape XML text.
 */
function escapeXml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;");
}

/**
 * @brief Check record shape.
 */
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Construct success result.
 */
function ok(value) {
    return {
        ok: true,
        value
    };
}

/**
 * @brief Construct error result.
 */
function err(error) {
    return {
        ok: false,
        error
    };
}
