import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, normalize, relative, resolve } from "node:path";

const DEFAULT_ROOTS = ["src", "test", "bench", "scripts", "tools/analyzer"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const NODE_PREFIX = "node:";
const LARGE_FILE_LINE_LIMIT = 700;
const HIGH_FAN_OUT_LIMIT = 18;
const HIGH_FAN_IN_LIMIT = 18;
const COGNITIVE_COMPLEXITY_LIMIT = 160;
const FUNCTION_COMPLEXITY_LIMIT = 85;
const HIGH_FUNCTION_CALL_OUT_LIMIT = 24;
const GENERATED_ABI_HELPERS = ["h", "gp", "l", "r", "k", "u", "d", "m", "mf", "sk"];
const DEFAULT_PROFILE_PATH = "tools/analyzer/profile.json";

const DEFAULT_PROFILE = {
    name: "TypeSea default static-analysis profile",
    warningBudget: 200,
    securityWarningBudget: 0,
    cycleBudget: 0,
    errorBudget: 0,
    rules: {},
    baseline: {
        ignoredFingerprints: []
    }
};

const RULE_CATALOG = [
    rule("runtime-bare-import", "error", "dependency", "Runtime src imports must stay relative or node: builtins.", "high", "high", "TypeSea zero-dependency boundary"),
    rule("unresolved-import", "error", "graph", "Relative imports must resolve to scanned source files or known generated artifacts.", "high", "high", "Module graph integrity"),
    rule("generated-artifact-import", "info", "graph", "Generated artifact imports are tracked outside the source graph.", "medium", "high", "Release and dist verification"),
    rule("layer-boundary", "warning", "architecture", "Runtime imports must not cross forbidden compiler layers.", "medium", "high", "Compiler layer architecture"),
    rule("lexical-error", "error", "lexer", "Source must lex without unterminated token states.", "high", "high", "Parser front-end"),
    rule("large-file", "warning", "maintainability", "Large modules should be split by responsibility.", "medium", "high", "Maintainability"),
    rule("todo-comment", "info", "maintainability", "TODO/FIXME/HACK comments are tracked as review debt.", "low", "high", "Maintainability"),
    rule("missing-public-jsdoc", "info", "documentation", "Exported public declarations should carry durable API documentation.", "low", "medium", "Public API documentation"),
    rule("duplicate-export-name", "info", "api", "Duplicate exported names should be reviewed for API ambiguity.", "low", "medium", "Public API surface"),
    rule("cycle", "warning", "graph", "Runtime import cycles should be eliminated or justified.", "medium", "high", "Module graph integrity"),
    rule("high-fan-out", "info", "graph", "High outgoing module fan-out indicates broad responsibility.", "low", "high", "Module graph maintainability"),
    rule("high-fan-in", "info", "graph", "High incoming module fan-in indicates a sensitive shared module.", "low", "high", "Module graph maintainability"),
    rule("dynamic-code-sink", "warning", "security", "Dynamic code construction must remain in approved JIT/AOT bridges.", "high", "high", "JIT code-generation security"),
    rule("direct-hostile-read", "warning", "security", "Safe/interpreter paths should avoid direct property reads on hostile input.", "medium", "medium", "Hostile input defense"),
    rule("descriptor-without-value-proof", "warning", "security", "Descriptor reads should be paired with own value-slot proof.", "medium", "medium", "Hostile accessor defense"),
    rule("generated-abi-helper-missing", "error", "compiler", "Generated-source ABI helpers must remain present.", "high", "high", "JIT/AOT ABI integrity"),
    rule("schema-tag-coverage-missing", "error", "compiler", "SchemaTag variants must be covered by every semantic stage.", "high", "medium", "Compiler exhaustiveness"),
    rule("node-tag-coverage-missing", "warning", "compiler", "NodeTag variants should be covered by IR consumers.", "medium", "medium", "IR exhaustiveness"),
    rule("high-cognitive-complexity", "warning", "maintainability", "High token-level cognitive complexity should be split or documented.", "medium", "medium", "Maintainability"),
    rule("high-function-complexity", "warning", "maintainability", "Function-level complexity should stay locally reviewable.", "medium", "medium", "Function summary analysis"),
    rule("high-function-call-out", "info", "maintainability", "Functions with broad call-out should be reviewed for hidden orchestration responsibility.", "low", "medium", "Function summary analysis"),
    rule("recursive-call-cycle", "warning", "reliability", "Recursive function cycles should be explicit and bounded.", "medium", "medium", "Interprocedural call graph"),
    rule("function-descriptor-without-value-proof", "warning", "security", "Descriptor value reads inside validation functions should be paired with value-slot proof in the same summary.", "medium", "medium", "Function-local hostile accessor defense"),
    rule("throw-in-library-core", "info", "reliability", "Throw statements in library core should be reviewed against Result-style contracts.", "low", "medium", "Result-oriented error handling")
];

const RULE_INDEX = new Map(RULE_CATALOG.map((entry) => [entry.id, entry]));

const LAYER_RULES = [
    ["src/index.ts", "root"],
    ["src/v3.ts", "root"],
    ["src/v4.ts", "root"],
    ["src/v4-mini.ts", "root"],
    ["src/zod.ts", "root"],
    ["src/zod-compat.ts", "root"],
    ["src/mini.ts", "root"],
    ["src/locales.ts", "root"]
];

const DIRECTORY_LAYERS = new Set([
    "adapters",
    "analyze",
    "aot",
    "async",
    "async-validation",
    "builders",
    "compile",
    "config",
    "decoder",
    "evaluate",
    "guard",
    "internal",
    "ir",
    "issue",
    "json-schema",
    "kind",
    "lower",
    "message",
    "optimize",
    "parse",
    "plan",
    "plugin",
    "regexes",
    "registry",
    "result",
    "schema",
    "seabreeze",
    "seaflow",
    "standard"
]);

export async function analyzeProject(options = {}) {
    const root = resolve(options.root ?? process.cwd());
    const roots = options.roots ?? DEFAULT_ROOTS;
    const profile = await readProfile(root, options.profilePath);
    const paths = await collectSourceFiles(root, roots);
    const fileAnalyses = [];
    const modules = new Map();

    for (let index = 0; index < paths.length; index += 1) {
        const path = paths[index];
        if (path === undefined) {
            continue;
        }
        const absolutePath = join(root, path);
        const source = await readFile(absolutePath, "utf8");
        const file = analyzeFile(path, source);
        fileAnalyses.push(file);
        modules.set(path, {
            path,
            layer: file.layer
        });
    }

    const functionIndex = buildFunctionIndex(fileAnalyses);
    const edgeResult = resolveEdges(root, fileAnalyses, modules);
    const graph = buildGraph(fileAnalyses, edgeResult.edges);
    const callGraph = buildCallGraph(functionIndex);
    const findings = applyProfile(enrichFindings([
        ...edgeResult.findings,
        ...analyzeFileFindings(fileAnalyses),
        ...analyzeGraphFindings(graph),
        ...analyzeFunctionFindings(functionIndex, callGraph),
        ...analyzeTypeSeaRules(fileAnalyses)
    ]), profile);

    const summary = summarize(fileAnalyses, graph, findings, functionIndex, callGraph);
    const qualityGate = computeQualityGate(summary, findings, profile);
    const ruleSummary = summarizeRules(findings);
    const hotspots = computeHotspots(fileAnalyses, findings);

    return {
        schemaVersion: 2,
        generatedAt: new Date().toISOString(),
        root,
        roots,
        profile: publicProfile(profile),
        summary,
        qualityGate,
        rules: RULE_CATALOG,
        ruleSummary,
        hotspots,
        findings: sortFindings(findings),
        graph,
        callGraph,
        functions: publicFunctions(functionIndex),
        files: fileAnalyses.map(publicFileSummary)
    };
}

export function analyzeFile(path, source) {
    const lexer = lexSource(source);
    const lines = countLines(source);
    const declarations = readDeclarations(lexer);
    const functions = readFunctions(path, lexer);
    const imports = readImports(path, lexer.tokens);
    const exports = declarations.filter((entry) => entry.exported);
    const comments = lexer.comments;
    const todoCount = comments.filter((comment) => /TODO|FIXME|HACK/u.test(comment.text)).length;
    const tokenCount = lexer.tokens.length;

    return {
        path,
        source,
        layer: sourceLayer(path),
        extension: extensionOf(path),
        lines,
        tokenCount,
        metrics: fileMetrics(lexer, lines),
        functions,
        imports,
        declarations,
        exports,
        comments,
        todoCount,
        lexicalErrors: lexer.errors
    };
}

export function toSarif(analysis) {
    return {
        version: "2.1.0",
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        runs: [{
            tool: {
                driver: {
                    name: "TypeSea Static Analyzer",
                    informationUri: "https://github.com/Feralthedogg/TypeSea",
                    rules: analysis.rules.map(sarifRule)
                }
            },
            invocations: [{
                executionSuccessful: analysis.qualityGate.status === "passed",
                properties: {
                    qualityGate: analysis.qualityGate,
                    profile: analysis.profile
                }
            }],
            results: analysis.findings
                .filter((item) => !item.suppressed)
                .map(sarifResult)
        }]
    };
}

function summarize(files, graph, findings, functionIndex, callGraph) {
    const counts = {
        error: 0,
        warning: 0,
        info: 0
    };
    for (let index = 0; index < findings.length; index += 1) {
        const item = findings[index];
        if (item?.suppressed) {
            continue;
        }
        const severity = item?.severity;
        if (severity === "error" || severity === "warning" || severity === "info") {
            counts[severity] += 1;
        }
    }

    return {
        files: files.length,
        lines: sum(files, "lines"),
        tokens: sum(files, "tokenCount"),
        runtimeEdges: graph.edges.filter((edge) => !edge.typeOnly).length,
        typeOnlyEdges: graph.edges.filter((edge) => edge.typeOnly).length,
        functions: functionIndex.functions.length,
        callEdges: callGraph.edges.length,
        functionCycles: callGraph.cycles.length,
        cycles: graph.cycles.length,
        findings: counts,
        suppressedFindings: findings.filter((item) => item.suppressed).length,
        layers: graph.layers.length
    };
}

function computeQualityGate(summary, findings, profile) {
    const failed = [];
    const errorBudget = profile.errorBudget;
    const cycleBudget = profile.cycleBudget;
    const securityWarningBudget = profile.securityWarningBudget;
    const warningBudget = profile.warningBudget;
    const activeFindings = findings.filter((item) => !item.suppressed);

    if (summary.findings.error > errorBudget) {
        failed.push("no-error-findings");
    }
    if (summary.cycles > cycleBudget) {
        failed.push("no-runtime-cycles");
    }
    if (countFindings(activeFindings, "security", "warning") > securityWarningBudget) {
        failed.push("no-security-warnings");
    }
    if (countFindings(findings, "compiler", "error") > 0) {
        failed.push("compiler-exhaustiveness");
    }
    if (summary.findings.warning > warningBudget) {
        failed.push(`warning-budget-${String(warningBudget)}`);
    }
    return {
        status: failed.length === 0 ? "passed" : "failed",
        failed,
        budgets: {
            errors: errorBudget,
            cycles: cycleBudget,
            securityWarnings: securityWarningBudget,
            warnings: warningBudget
        }
    };
}

function summarizeRules(findings) {
    const byRule = new Map();
    for (let index = 0; index < findings.length; index += 1) {
        const item = findings[index];
        if (item === undefined) {
            continue;
        }
        const current = byRule.get(item.rule) ?? {
            rule: item.rule,
            title: item.title,
            severity: item.severity,
            category: item.category,
            count: 0
        };
        current.count += 1;
        byRule.set(item.rule, current);
    }
    return [...byRule.values()].sort((left, right) => right.count - left.count || left.rule.localeCompare(right.rule));
}

function computeHotspots(files, findings) {
    const scoreByPath = new Map();
    const findingCountByPath = new Map();
    for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        if (file !== undefined) {
            scoreByPath.set(file.path, file.metrics.complexity + Math.floor(file.lines / 25));
            findingCountByPath.set(file.path, 0);
        }
    }
    for (let index = 0; index < findings.length; index += 1) {
        const item = findings[index];
        if (item === undefined) {
            continue;
        }
        const weight = item.severity === "error" ? 120 : item.severity === "warning" ? 30 : 3;
        scoreByPath.set(item.path, (scoreByPath.get(item.path) ?? 0) + weight);
        findingCountByPath.set(item.path, (findingCountByPath.get(item.path) ?? 0) + 1);
    }
    return [...scoreByPath.entries()]
        .map(([path, score]) => ({
            path,
            score,
            findings: findingCountByPath.get(path) ?? 0
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
        .slice(0, 25);
}

function publicFileSummary(file) {
    return {
        path: file.path,
        layer: file.layer,
        extension: file.extension,
        lines: file.lines,
        tokens: file.tokenCount,
        complexity: file.metrics.complexity,
        functionCount: file.functions.length,
        maxFunctionComplexity: maxFunctionComplexity(file.functions),
        dynamicCodeSinks: file.metrics.dynamicCodeSinks,
        imports: file.imports.length,
        exports: file.exports.length,
        declarations: file.declarations.length,
        todos: file.todoCount
    };
}

function sarifRule(ruleEntry) {
    return {
        id: ruleEntry.id,
        name: ruleEntry.id,
        shortDescription: {
            text: ruleEntry.title
        },
        fullDescription: {
            text: `${ruleEntry.title} Domain: ${ruleEntry.domain}. Precision: ${ruleEntry.precision}. Confidence: ${ruleEntry.confidence}.`
        },
        defaultConfiguration: {
            level: sarifLevel(ruleEntry.severity)
        },
        properties: {
            category: ruleEntry.category,
            precision: ruleEntry.precision,
            confidence: ruleEntry.confidence,
            domain: ruleEntry.domain
        }
    };
}

function sarifResult(item) {
    return {
        ruleId: item.rule,
        level: sarifLevel(item.severity),
        message: {
            text: item.message
        },
        locations: [{
            physicalLocation: {
                artifactLocation: {
                    uri: item.path
                },
                region: {
                    startLine: item.line
                }
            }
        }],
        partialFingerprints: {
            primaryLocationLineHash: item.fingerprint,
            typeSeaFingerprint: item.fingerprint
        },
        codeFlows: [{
            threadFlows: [{
                locations: item.flow.map((step) => ({
                    location: {
                        physicalLocation: {
                            artifactLocation: {
                                uri: step.path
                            },
                            region: {
                                startLine: step.line
                            }
                        },
                        message: {
                            text: step.message
                        }
                    }
                }))
            }]
        }],
        properties: {
            fingerprint: item.fingerprint,
            category: item.category,
            precision: item.precision,
            confidence: item.confidence,
            domain: item.domain
        }
    };
}

function sarifLevel(severity) {
    if (severity === "error") {
        return "error";
    }
    if (severity === "warning") {
        return "warning";
    }
    return "note";
}

async function collectSourceFiles(root, roots) {
    const out = [];
    for (let index = 0; index < roots.length; index += 1) {
        const entry = roots[index];
        if (entry === undefined) {
            continue;
        }
        const absolute = join(root, entry);
        const exists = await pathExists(absolute);
        if (!exists) {
            continue;
        }
        await collectPath(root, absolute, out);
    }
    return out.sort();
}

async function collectPath(root, absolute, out) {
    const info = await stat(absolute);
    if (info.isDirectory()) {
        const entries = await readdir(absolute, { withFileTypes: true });
        for (let index = 0; index < entries.length; index += 1) {
            const entry = entries[index];
            if (entry === undefined || entry.name === "node_modules" || entry.name === "dist") {
                continue;
            }
            await collectPath(root, join(absolute, entry.name), out);
        }
        return;
    }
    if (info.isFile() && SOURCE_EXTENSIONS.has(extensionOf(absolute))) {
        out.push(toRepoPath(root, absolute));
    }
}

async function pathExists(path) {
    return stat(path).then(
        () => true,
        () => false
    );
}

async function readProfile(root, profilePath) {
    const path = resolve(root, profilePath ?? DEFAULT_PROFILE_PATH);
    const text = await readFile(path, "utf8").then(
        (value) => value,
        () => undefined
    );
    if (text === undefined) {
        return DEFAULT_PROFILE;
    }
    const parsed = JSON.parse(text);
    return normalizeProfile(parsed);
}

function normalizeProfile(value) {
    const profile = value !== null && typeof value === "object" ? value : {};
    const rules = profile.rules !== null && typeof profile.rules === "object" ? profile.rules : {};
    const baseline = profile.baseline !== null && typeof profile.baseline === "object" ? profile.baseline : {};
    const ignored = Array.isArray(baseline.ignoredFingerprints)
        ? baseline.ignoredFingerprints.filter((item) => typeof item === "string")
        : [];
    return {
        name: typeof profile.name === "string" ? profile.name : DEFAULT_PROFILE.name,
        warningBudget: readNumber(profile.warningBudget, DEFAULT_PROFILE.warningBudget),
        securityWarningBudget: readNumber(profile.securityWarningBudget, DEFAULT_PROFILE.securityWarningBudget),
        cycleBudget: readNumber(profile.cycleBudget, DEFAULT_PROFILE.cycleBudget),
        errorBudget: readNumber(profile.errorBudget, DEFAULT_PROFILE.errorBudget),
        rules,
        baseline: {
            ignoredFingerprints: ignored
        }
    };
}

function publicProfile(profile) {
    return {
        name: profile.name,
        warningBudget: profile.warningBudget,
        securityWarningBudget: profile.securityWarningBudget,
        cycleBudget: profile.cycleBudget,
        errorBudget: profile.errorBudget,
        ignoredFingerprints: profile.baseline.ignoredFingerprints.length
    };
}

function applyProfile(findings, profile) {
    const ignored = new Set(profile.baseline.ignoredFingerprints);
    const out = [];
    for (let index = 0; index < findings.length; index += 1) {
        const item = findings[index];
        if (item === undefined) {
            continue;
        }
        const override = profile.rules[item.rule];
        if (override !== undefined && override.enabled === false) {
            continue;
        }
        const severity = readSeverity(override?.severity, item.severity);
        const fingerprint = issueFingerprint({
            ...item,
            severity
        });
        out.push({
            ...item,
            severity,
            fingerprint,
            suppressed: ignored.has(fingerprint),
            suppressionReason: ignored.has(fingerprint) ? "profile-baseline" : undefined
        });
    }
    return out;
}

function readNumber(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readSeverity(value, fallback) {
    return value === "error" || value === "warning" || value === "info" ? value : fallback;
}

function resolveEdges(root, files, modules) {
    const edges = [];
    const findings = [];

    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const file = files[fileIndex];
        if (file === undefined) {
            continue;
        }
        for (let importIndex = 0; importIndex < file.imports.length; importIndex += 1) {
            const entry = file.imports[importIndex];
            if (entry === undefined || entry.specifier === undefined) {
                continue;
            }
            if (entry.specifier.startsWith(NODE_PREFIX)) {
                continue;
            }
            if (!isRelativeSpecifier(entry.specifier)) {
                if (file.path.startsWith("src/") && !entry.typeOnly) {
                    findings.push(finding("error", "dependency", "runtime-bare-import", file.path, entry.line, `Runtime source import '${entry.specifier}' is not relative or node: builtin.`));
                }
                continue;
            }

            const resolved = resolveImport(root, file.path, entry.specifier, modules);
            if (resolved === undefined) {
                const generated = resolveExistingImport(root, file.path, entry.specifier);
                if (generated !== undefined) {
                    findings.push(finding("info", "graph", "generated-artifact-import", file.path, entry.line, `Relative import '${entry.specifier}' resolves to '${generated}', which is outside the scanned source graph.`));
                    continue;
                }
                findings.push(finding("error", "graph", "unresolved-import", file.path, entry.line, `Relative import '${entry.specifier}' does not resolve to a scanned source file.`));
                continue;
            }

            const target = modules.get(resolved);
            if (target === undefined) {
                continue;
            }

            const edge = {
                from: file.path,
                to: resolved,
                specifier: entry.specifier,
                line: entry.line,
                kind: entry.kind,
                typeOnly: entry.typeOnly,
                fromLayer: file.layer,
                toLayer: target.layer
            };
            edges.push(edge);

            if (!entry.typeOnly && forbiddenLayerEdge(edge.fromLayer, edge.toLayer)) {
                findings.push(finding("warning", "architecture", "layer-boundary", file.path, entry.line, `Runtime import from layer '${edge.fromLayer}' to '${edge.toLayer}' should be reviewed.`));
            }
        }
    }

    return {
        edges,
        findings
    };
}

function buildGraph(files, edges) {
    const nodes = files.map((file) => ({
        id: file.path,
        layer: file.layer,
        lines: file.lines,
        exports: file.exports.length,
        imports: file.imports.length
    }));
    const runtimeEdges = edges.filter((edge) => !edge.typeOnly);
    const cycles = findCycles(nodes, runtimeEdges);
    const fanIn = new Map();
    const fanOut = new Map();
    const layers = new Map();

    for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        if (node === undefined) {
            continue;
        }
        fanIn.set(node.id, 0);
        fanOut.set(node.id, 0);
        layers.set(node.layer, (layers.get(node.layer) ?? 0) + 1);
    }

    for (let index = 0; index < runtimeEdges.length; index += 1) {
        const edge = runtimeEdges[index];
        if (edge === undefined) {
            continue;
        }
        fanOut.set(edge.from, (fanOut.get(edge.from) ?? 0) + 1);
        fanIn.set(edge.to, (fanIn.get(edge.to) ?? 0) + 1);
    }

    return {
        nodes,
        edges,
        cycles,
        layers: [...layers.entries()].map(([name, count]) => ({ name, count })).sort(sortByName),
        fanIn: topCounts(fanIn),
        fanOut: topCounts(fanOut)
    };
}

function analyzeFileFindings(files) {
    const findings = [];
    const exportedNames = new Map();

    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const file = files[fileIndex];
        if (file === undefined) {
            continue;
        }
        for (let errorIndex = 0; errorIndex < file.lexicalErrors.length; errorIndex += 1) {
            const error = file.lexicalErrors[errorIndex];
            if (error !== undefined) {
                findings.push(finding("error", "lexer", "lexical-error", file.path, error.line, error.message));
            }
        }
        if (file.lines > LARGE_FILE_LINE_LIMIT) {
            findings.push(finding("warning", "maintainability", "large-file", file.path, 1, `File has ${String(file.lines)} lines; consider splitting it by responsibility.`));
        }
        if (file.todoCount > 0) {
            findings.push(finding("info", "maintainability", "todo-comment", file.path, 1, `File contains ${String(file.todoCount)} TODO/FIXME/HACK comment(s).`));
        }
        for (let declIndex = 0; declIndex < file.declarations.length; declIndex += 1) {
            const declaration = file.declarations[declIndex];
            if (declaration === undefined || !declaration.exported) {
                continue;
            }
            if (!declaration.documented && isPublicDocumentationCandidate(declaration)) {
                findings.push(finding("info", "documentation", "missing-public-jsdoc", file.path, declaration.line, `Exported ${declaration.kind} '${declaration.name}' is missing nearby JSDoc.`));
            }
            const previous = exportedNames.get(declaration.name);
            if (previous !== undefined && declaration.name !== "default") {
                findings.push(finding("info", "api", "duplicate-export-name", file.path, declaration.line, `Export name '${declaration.name}' also appears in ${previous.path}:${String(previous.line)}.`));
            } else {
                exportedNames.set(declaration.name, {
                    path: file.path,
                    line: declaration.line
                });
            }
        }
    }

    return findings;
}

function analyzeGraphFindings(graph) {
    const findings = [];
    for (let index = 0; index < graph.cycles.length; index += 1) {
        const cycle = graph.cycles[index];
        if (cycle !== undefined) {
            findings.push(finding("warning", "graph", "cycle", cycle[0] ?? "src", 1, `Runtime import cycle detected: ${cycle.join(" -> ")}.`));
        }
    }
    for (let index = 0; index < graph.fanOut.length; index += 1) {
        const entry = graph.fanOut[index];
        if (entry !== undefined && entry.count > HIGH_FAN_OUT_LIMIT) {
            findings.push(finding("info", "graph", "high-fan-out", entry.path, 1, `Module has ${String(entry.count)} runtime outgoing edges.`));
        }
    }
    for (let index = 0; index < graph.fanIn.length; index += 1) {
        const entry = graph.fanIn[index];
        if (entry !== undefined && entry.count > HIGH_FAN_IN_LIMIT) {
            findings.push(finding("info", "graph", "high-fan-in", entry.path, 1, `Module has ${String(entry.count)} runtime incoming edges.`));
        }
    }
    return findings;
}

function analyzeTypeSeaRules(files) {
    const findings = [];
    findings.push(...analyzeDynamicCodeSinks(files));
    findings.push(...analyzeSafeModeAccess(files));
    findings.push(...analyzeGeneratedAbi(files));
    findings.push(...analyzeTagCoverage(files));
    findings.push(...analyzeComplexity(files));
    findings.push(...analyzeThrowUsage(files));
    return findings;
}

function analyzeDynamicCodeSinks(files) {
    const findings = [];
    const allowed = new Set([
        "src/compile/guard.ts",
        "src/seabreeze/builder.ts",
        "test/sea-breeze.test.ts"
    ]);
    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const file = files[fileIndex];
        if (file === undefined || file.metrics.dynamicCodeSinks === 0) {
            continue;
        }
        const lineNumbers = linesMatching(file.source, /\b(?:new\s+Function|eval\s*\()/u);
        for (let index = 0; index < lineNumbers.length; index += 1) {
            const line = lineNumbers[index] ?? 1;
            const severity = allowed.has(file.path) ? "info" : "warning";
            findings.push(finding(severity, "security", "dynamic-code-sink", file.path, line, allowed.has(file.path)
                ? "Approved dynamic code bridge; keep side-table and source-emitter invariants covered."
                : "Dynamic code construction appears outside the approved TypeSea JIT bridge.", dynamicCodeFlow(file.path, line)));
        }
    }
    return findings;
}

function analyzeSafeModeAccess(files) {
    const findings = [];
    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const file = files[fileIndex];
        if (file === undefined || !isSafeModePath(file.path)) {
            continue;
        }
        const directReads = linesMatching(file.source, /\b(?:value|input|data|record)\.(?!length\b)[A-Za-z_$][A-Za-z0-9_$]*/u);
        for (let index = 0; index < directReads.length; index += 1) {
            const line = directReads[index] ?? 1;
            findings.push(finding("warning", "security", "direct-hostile-read", file.path, line, "Possible direct property read in a hostile-input validation path; prefer descriptor-backed own-data access."));
        }

        const descriptorLines = linesMatching(file.source, /Object\.getOwnPropertyDescriptor|(?<![A-Za-z0-9_$])gp\s*\(/u);
        if (descriptorLines.length !== 0 && !hasValueSlotProof(file.source)) {
            findings.push(finding("warning", "security", "descriptor-without-value-proof", file.path, descriptorLines[0] ?? 1, "Descriptor reads were found without an obvious hasOwnProperty(..., 'value') proof in the same file."));
        }
    }
    return findings;
}

function analyzeGeneratedAbi(files) {
    const findings = [];
    const sourceFile = findFile(files, "src/compile/source.ts");
    if (sourceFile === undefined) {
        return findings;
    }
    for (let index = 0; index < GENERATED_ABI_HELPERS.length; index += 1) {
        const helper = GENERATED_ABI_HELPERS[index];
        if (helper === undefined) {
            continue;
        }
        const pattern = new RegExp(`["']${escapeRegExp(helper)}["']`, "u");
        if (!pattern.test(sourceFile.source)) {
            findings.push(finding("error", "compiler", "generated-abi-helper-missing", sourceFile.path, 1, `Generated-source ABI helper '${helper}' is not referenced in source emission.`));
        }
    }
    return findings;
}

function analyzeTagCoverage(files) {
    const findings = [];
    const kindFile = findFile(files, "src/kind/index.ts");
    if (kindFile === undefined) {
        return findings;
    }
    const schemaTags = readConstObjectKeys(kindFile.source, "SchemaTag");
    const nodeTags = readConstObjectKeys(kindFile.source, "NodeTag");
    const schemaStages = [
        ["lower", ["src/lower/"]],
        ["evaluate", ["src/evaluate/", "src/plan/"]],
        ["compile", ["src/compile/"]],
        ["async", ["src/async-validation/"]],
        ["aot", ["src/aot/"]],
        ["json_schema", ["src/json-schema/"]]
    ];
    const nodeStages = [
        ["ir", ["src/ir/"]],
        ["optimize", ["src/optimize/"]],
        ["compile", ["src/compile/"]],
        ["plan", ["src/plan/"]]
    ];

    for (let stageIndex = 0; stageIndex < schemaStages.length; stageIndex += 1) {
        const stage = schemaStages[stageIndex];
        if (stage === undefined) {
            continue;
        }
        const missing = missingTagCoverage(files, schemaTags, "SchemaTag", stage[1]);
        if (missing.length !== 0) {
            findings.push(finding("error", "compiler", "schema-tag-coverage-missing", stage[1][0] ?? "src", 1, `${stage[0]} is missing SchemaTag coverage: ${missing.join(", ")}.`));
        }
    }

    for (let stageIndex = 0; stageIndex < nodeStages.length; stageIndex += 1) {
        const stage = nodeStages[stageIndex];
        if (stage === undefined) {
            continue;
        }
        const missing = missingTagCoverage(files, nodeTags, "NodeTag", stage[1]);
        if (missing.length !== 0) {
            findings.push(finding("warning", "compiler", "node-tag-coverage-missing", stage[1][0] ?? "src", 1, `${stage[0]} is missing NodeTag coverage: ${missing.join(", ")}.`));
        }
    }
    return findings;
}

function analyzeComplexity(files) {
    const findings = [];
    for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        if (file !== undefined && file.metrics.complexity > COGNITIVE_COMPLEXITY_LIMIT) {
            findings.push(finding("warning", "maintainability", "high-cognitive-complexity", file.path, 1, `Token-level cognitive complexity is ${String(file.metrics.complexity)}, above ${String(COGNITIVE_COMPLEXITY_LIMIT)}.`));
        }
    }
    return findings;
}

function analyzeThrowUsage(files) {
    const findings = [];
    for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        if (file === undefined || !file.path.startsWith("src/")) {
            continue;
        }
        const lines = linesMatching(file.source, /\bthrow\b/u);
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
            const line = lines[lineIndex] ?? 1;
            findings.push(finding("info", "reliability", "throw-in-library-core", file.path, line, "Throw in library core should be checked against TypeSea's explicit Result-style error philosophy."));
        }
    }
    return findings;
}

function readImports(path, tokens) {
    const imports = [];
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token === undefined || (token.value !== "import" && token.value !== "export")) {
            continue;
        }
        const end = findImportExportEnd(tokens, index);
        const entry = readImportStatement(path, tokens, index, end);
        if (entry !== undefined) {
            imports.push(entry);
        }
        index = end > index ? end - 1 : index;
    }
    return imports;
}

function readImportStatement(path, tokens, start, end) {
    const keyword = tokens[start]?.value;
    const line = tokens[start]?.line ?? 1;
    const cursor = start + 1;
    let specifier = undefined;
    let kind = keyword === "export" ? "re-export" : "static";
    let typeOnly = importExportIsTypeOnly(tokens, start, end);

    if (keyword === "import" && tokenValue(tokens, cursor) === "(") {
        const maybe = cursor + 1;
        if (tokenType(tokens, maybe) !== "string") {
            return undefined;
        }
        specifier = tokenValue(tokens, maybe);
        kind = "dynamic";
        typeOnly = false;
    } else if (keyword === "import" && tokenType(tokens, cursor) === "string") {
        specifier = tokenValue(tokens, cursor);
        kind = "side-effect";
    } else {
        for (let scan = cursor; scan < end; scan += 1) {
            if (tokenValue(tokens, scan) !== "from") {
                continue;
            }
            const maybe = scan + 1;
            if (tokenType(tokens, maybe) === "string") {
                specifier = tokenValue(tokens, maybe);
                break;
            }
        }
    }

    if (keyword === "export" && specifier === undefined) {
        return undefined;
    }
    if (specifier === undefined) {
        return undefined;
    }

    return {
        path,
        line,
        specifier,
        kind,
        typeOnly
    };
}

function importExportIsTypeOnly(tokens, start, end) {
    const keyword = tokenValue(tokens, start);
    const cursor = start + 1;
    if (tokenValue(tokens, cursor) === "type") {
        return true;
    }
    if (keyword === "import" && tokenType(tokens, cursor) === "string") {
        return false;
    }
    const from = findTokenValue(tokens, "from", cursor, end);
    if (from === undefined) {
        return false;
    }
    const brace = findTokenValue(tokens, "{", cursor, from);
    if (brace === undefined) {
        return false;
    }
    const close = findMatchingBrace(tokens, brace, from);
    if (close === undefined) {
        return false;
    }
    return namedSpecifiersAreTypeOnly(tokens, brace + 1, close);
}

function namedSpecifiersAreTypeOnly(tokens, start, end) {
    let sawSpecifier = false;
    let cursor = start;
    while (cursor < end) {
        while (cursor < end && tokenValue(tokens, cursor) === ",") {
            cursor += 1;
        }
        if (cursor >= end) {
            break;
        }
        sawSpecifier = true;
        if (tokenValue(tokens, cursor) !== "type") {
            return false;
        }
        let specifierEnd = cursor + 1;
        while (specifierEnd < end && tokenValue(tokens, specifierEnd) !== ",") {
            specifierEnd += 1;
        }
        const afterType = cursor + 1;
        if (afterType >= specifierEnd || tokenValue(tokens, afterType) === "as") {
            return false;
        }
        cursor = specifierEnd;
    }
    return sawSpecifier;
}

function readDeclarations(lexer) {
    const declarations = [];
    const tokens = lexer.tokens;
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token === undefined) {
            continue;
        }
        let exported = false;
        let cursor = index;
        if (token.value === "export") {
            exported = true;
            cursor += 1;
            if (tokenValue(tokens, cursor) === "default") {
                cursor += 1;
            }
        }
        const kind = tokenValue(tokens, cursor);
        if (!isDeclarationKind(kind)) {
            continue;
        }
        const nameIndex = findDeclarationName(tokens, cursor);
        const name = nameIndex === undefined ? "default" : tokenValue(tokens, nameIndex);
        const line = tokenLine(tokens, cursor);
        declarations.push({
            kind,
            name,
            line,
            exported,
            documented: hasNearbyJsDoc(lexer.jsdocs, line)
        });
        index = cursor;
    }
    return declarations;
}

function readFunctions(path, lexer) {
    const functions = [];
    const tokens = lexer.tokens;
    for (let index = 0; index < tokens.length; index += 1) {
        if (tokenValue(tokens, index) !== "function") {
            continue;
        }
        const nameIndex = tokenType(tokens, index + 1) === "identifier" ? index + 1 : undefined;
        const name = nameIndex === undefined ? "anonymous" : tokenValue(tokens, nameIndex);
        const paramsOpen = findTokenValue(tokens, "(", index + 1, Math.min(tokens.length, index + 12));
        if (paramsOpen === undefined) {
            continue;
        }
        const paramsClose = findMatchingParen(tokens, paramsOpen, tokens.length);
        if (paramsClose === undefined) {
            continue;
        }
        const bodyOpen = findTokenValue(tokens, "{", paramsClose + 1, Math.min(tokens.length, paramsClose + 24));
        if (bodyOpen === undefined) {
            continue;
        }
        const bodyClose = findMatchingBrace(tokens, bodyOpen, tokens.length);
        if (bodyClose === undefined) {
            continue;
        }
        const bodyTokens = tokens.slice(bodyOpen + 1, bodyClose);
        const line = tokenLine(tokens, index);
        const endLine = tokenLine(tokens, bodyClose);
        const params = readParameterNames(tokens, paramsOpen + 1, paramsClose);
        const calls = readFunctionCalls(bodyTokens);
        const metrics = functionMetrics(bodyTokens);
        functions.push({
            id: functionId(path, name, line),
            path,
            name,
            line,
            endLine,
            params,
            exported: isExportedFunction(tokens, index),
            calls,
            metrics
        });
        index = bodyClose;
    }
    return functions;
}

function buildFunctionIndex(files) {
    const functions = [];
    const byName = new Map();
    const byId = new Map();
    const byFileName = new Map();
    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const file = files[fileIndex];
        if (file === undefined) {
            continue;
        }
        for (let functionIndex = 0; functionIndex < file.functions.length; functionIndex += 1) {
            const fn = file.functions[functionIndex];
            if (fn === undefined) {
                continue;
            }
            functions.push(fn);
            byId.set(fn.id, fn);
            const bucket = byName.get(fn.name) ?? [];
            bucket.push(fn);
            byName.set(fn.name, bucket);
            const fileBucketKey = `${fn.path}\0${fn.name}`;
            const fileBucket = byFileName.get(fileBucketKey) ?? [];
            fileBucket.push(fn);
            byFileName.set(fileBucketKey, fileBucket);
        }
    }
    return {
        functions,
        byId,
        byName,
        byFileName
    };
}

function buildCallGraph(functionIndex) {
    const edges = [];
    for (let index = 0; index < functionIndex.functions.length; index += 1) {
        const fn = functionIndex.functions[index];
        if (fn === undefined) {
            continue;
        }
        const seen = new Set();
        for (let callIndex = 0; callIndex < fn.calls.length; callIndex += 1) {
            const call = fn.calls[callIndex];
            if (call === undefined || seen.has(call.name)) {
                continue;
            }
            seen.add(call.name);
            const sameFileTargets = functionIndex.byFileName.get(`${fn.path}\0${call.name}`) ?? [];
            const globalTargets = functionIndex.byName.get(call.name) ?? [];
            const targets = sameFileTargets.length !== 0
                ? sameFileTargets
                : globalTargets.length === 1
                    ? globalTargets
                    : [];
            for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
                const target = targets[targetIndex];
                if (target === undefined) {
                    continue;
                }
                edges.push({
                    from: fn.id,
                    to: target.id,
                    name: call.name,
                    line: call.line,
                    crossFile: fn.path !== target.path
                });
            }
        }
    }
    const cycles = findFunctionCycles(functionIndex.functions, edges);
    return {
        nodes: functionIndex.functions.map(publicFunction),
        edges,
        cycles,
        fanIn: functionFanCounts(edges, "to"),
        fanOut: functionFanCounts(edges, "from")
    };
}

function publicFunctions(functionIndex) {
    return functionIndex.functions.map(publicFunction);
}

function publicFunction(fn) {
    return {
        id: fn.id,
        path: fn.path,
        name: fn.name,
        line: fn.line,
        endLine: fn.endLine,
        params: fn.params,
        exported: fn.exported,
        calls: fn.calls.length,
        complexity: fn.metrics.complexity,
        descriptorReads: fn.metrics.descriptorReads,
        descriptorValueReads: fn.metrics.descriptorValueReads,
        valueProofs: fn.metrics.valueProofs,
        dynamicCodeSinks: fn.metrics.dynamicCodeSinks,
        hostileReads: fn.metrics.hostileReads,
        throws: fn.metrics.throws
    };
}

function analyzeFunctionFindings(functionIndex, callGraph) {
    const findings = [];
    for (let index = 0; index < functionIndex.functions.length; index += 1) {
        const fn = functionIndex.functions[index];
        if (fn === undefined) {
            continue;
        }
        if (fn.metrics.complexity > FUNCTION_COMPLEXITY_LIMIT) {
            findings.push(finding("warning", "maintainability", "high-function-complexity", fn.path, fn.line, `Function '${fn.name}' has complexity ${String(fn.metrics.complexity)}, above ${String(FUNCTION_COMPLEXITY_LIMIT)}.`));
        }
        if (fn.calls.length > HIGH_FUNCTION_CALL_OUT_LIMIT) {
            findings.push(finding("info", "maintainability", "high-function-call-out", fn.path, fn.line, `Function '${fn.name}' calls ${String(fn.calls.length)} sites; review orchestration responsibility.`));
        }
        if (isSafeModePath(fn.path) &&
            fn.metrics.descriptorReads !== 0 &&
            fn.metrics.descriptorValueReads !== 0 &&
            fn.metrics.valueProofs === 0) {
            findings.push(finding("warning", "security", "function-descriptor-without-value-proof", fn.path, fn.line, `Function '${fn.name}' reads descriptor.value without a local value-slot proof summary.`));
        }
    }
    for (let index = 0; index < callGraph.cycles.length; index += 1) {
        const cycle = callGraph.cycles[index];
        if (cycle === undefined || cycle.length === 0) {
            continue;
        }
        const first = functionIndex.byId.get(cycle[0]);
        findings.push(finding("warning", "reliability", "recursive-call-cycle", first?.path ?? "src", first?.line ?? 1, `Recursive function cycle detected: ${cycle.join(" -> ")}.`));
    }
    return findings;
}

function functionMetrics(tokens) {
    return {
        complexity: computeComplexity(tokens),
        descriptorReads: countTokenPattern(tokens, ["Object", ".", "getOwnPropertyDescriptor"]) + countCallToken(tokens, "gp"),
        descriptorValueReads: countTokenPattern(tokens, ["descriptor", ".", "value"]),
        valueProofs: countTokenPattern(tokens, ["hasOwnProperty", ".", "call"]) + countTokenPattern(tokens, ["h", ".", "call"]) + countCallToken(tokens, "isDataPropertyDescriptor"),
        dynamicCodeSinks: countDynamicCodeSinks(tokens),
        hostileReads: countHostileReads(tokens),
        throws: countTokenValue(tokens, "throw")
    };
}


function fileMetrics(lexer, lines) {
    const tokens = lexer.tokens;
    return {
        complexity: computeComplexity(tokens),
        dynamicCodeSinks: countDynamicCodeSinks(tokens),
        declarations: countDeclarationTokens(tokens),
        lines
    };
}

function readParameterNames(tokens, start, end) {
    const params = [];
    let segmentStart = start;
    let depth = 0;
    for (let index = start; index <= end; index += 1) {
        const value = tokenValue(tokens, index);
        if (value === "(" || value === "{" || value === "[") {
            depth += 1;
            continue;
        }
        if (value === ")" || value === "}" || value === "]") {
            depth = Math.max(0, depth - 1);
            continue;
        }
        if ((value === "," && depth === 0) || index === end) {
            const param = readParameterSegmentName(tokens, segmentStart, index);
            if (param !== undefined) {
                params.push(param);
            }
            segmentStart = index + 1;
        }
    }
    return params;
}

function readParameterSegmentName(tokens, start, end) {
    for (let index = start; index < end; index += 1) {
        const value = tokenValue(tokens, index);
        if (value === ":" || value === "=") {
            return undefined;
        }
        if (tokenType(tokens, index) === "identifier" &&
            value !== "readonly" &&
            value !== "public" &&
            value !== "private" &&
            value !== "protected") {
            return value;
        }
    }
    return undefined;
}

function readFunctionCalls(tokens) {
    const calls = [];
    for (let index = 0; index < tokens.length - 1; index += 1) {
        if (tokenType(tokens, index) !== "identifier" || tokenValue(tokens, index + 1) !== "(") {
            continue;
        }
        const name = tokenValue(tokens, index);
        if (isNonCallKeyword(name) ||
            tokenValue(tokens, index - 1) === "." ||
            tokenValue(tokens, index - 1) === "new") {
            continue;
        }
        calls.push({
            name,
            line: tokenLine(tokens, index)
        });
    }
    return calls;
}

function isExportedFunction(tokens, index) {
    return tokenValue(tokens, index - 1) === "export" ||
        (tokenValue(tokens, index - 2) === "export" && tokenValue(tokens, index - 1) === "default");
}

function findMatchingParen(tokens, start, end) {
    let depth = 0;
    for (let index = start; index < end; index += 1) {
        const value = tokenValue(tokens, index);
        if (value === "(") {
            depth += 1;
        } else if (value === ")") {
            depth -= 1;
            if (depth === 0) {
                return index;
            }
        }
    }
    return undefined;
}

function functionId(path, name, line) {
    return `${path}#${name}:${String(line)}`;
}

function countTokenPattern(tokens, pattern) {
    let count = 0;
    for (let index = 0; index <= tokens.length - pattern.length; index += 1) {
        let ok = true;
        for (let partIndex = 0; partIndex < pattern.length; partIndex += 1) {
            if (tokenValue(tokens, index + partIndex) !== pattern[partIndex]) {
                ok = false;
                break;
            }
        }
        if (ok) {
            count += 1;
        }
    }
    return count;
}

function countCallToken(tokens, name) {
    let count = 0;
    for (let index = 0; index < tokens.length - 1; index += 1) {
        if (tokenValue(tokens, index) === name && tokenValue(tokens, index + 1) === "(") {
            count += 1;
        }
    }
    return count;
}

function countTokenValue(tokens, value) {
    let count = 0;
    for (let index = 0; index < tokens.length; index += 1) {
        if (tokenValue(tokens, index) === value) {
            count += 1;
        }
    }
    return count;
}

function countHostileReads(tokens) {
    let count = 0;
    for (let index = 0; index < tokens.length - 2; index += 1) {
        const subject = tokenValue(tokens, index);
        const property = tokenValue(tokens, index + 2);
        if ((subject === "value" || subject === "input" || subject === "data" || subject === "record") &&
            tokenValue(tokens, index + 1) === "." &&
            property !== "length") {
            count += 1;
        }
    }
    return count;
}

function maxFunctionComplexity(functions) {
    let max = 0;
    for (let index = 0; index < functions.length; index += 1) {
        max = Math.max(max, functions[index]?.metrics.complexity ?? 0);
    }
    return max;
}

function isNonCallKeyword(name) {
    return name === "if" ||
        name === "for" ||
        name === "while" ||
        name === "switch" ||
        name === "catch" ||
        name === "function" ||
        name === "return";
}

function computeComplexity(tokens) {
    let score = 1;
    let blockDepth = 0;
    for (let index = 0; index < tokens.length; index += 1) {
        const value = tokenValue(tokens, index);
        if (value === "{") {
            blockDepth += 1;
            continue;
        }
        if (value === "}") {
            blockDepth = Math.max(0, blockDepth - 1);
            continue;
        }
        if (isDecisionToken(value)) {
            score += 1 + Math.min(blockDepth, 6);
        }
    }
    return score;
}

function countDynamicCodeSinks(tokens) {
    let count = 0;
    for (let index = 0; index < tokens.length; index += 1) {
        if (tokenValue(tokens, index) === "eval" && tokenValue(tokens, index + 1) === "(") {
            count += 1;
        }
        if (tokenValue(tokens, index) === "new" && tokenValue(tokens, index + 1) === "Function") {
            count += 1;
        }
    }
    return count;
}

function countDeclarationTokens(tokens) {
    let count = 0;
    for (let index = 0; index < tokens.length; index += 1) {
        if (isDeclarationKind(tokenValue(tokens, index))) {
            count += 1;
        }
    }
    return count;
}

function lexSource(source) {
    const tokens = [];
    const strings = [];
    const comments = [];
    const jsdocs = [];
    const errors = [];
    let index = 0;
    let line = 1;
    let column = 1;

    while (index < source.length) {
        const char = source[index];
        const next = source[index + 1];

        if (char === "\n") {
            index += 1;
            line += 1;
            column = 1;
            continue;
        }
        if (isWhitespace(char)) {
            index += 1;
            column += 1;
            continue;
        }
        if (char === "/" && next === "/") {
            const part = readLineComment(source, index, line, column);
            comments.push(part.comment);
            index = part.index;
            column = part.column;
            continue;
        }
        if (char === "/" && next === "*") {
            const part = readBlockComment(source, index, line, column);
            comments.push(part.comment);
            if (part.comment.jsdoc) {
                jsdocs.push(part.comment);
            }
            errors.push(...part.errors);
            index = part.index;
            line = part.line;
            column = part.column;
            continue;
        }
        if (char === "/" && looksLikeRegexStart(tokens)) {
            const part = readRegex(source, index, line, column);
            tokens.push(makeToken("regex", part.value, line, column));
            errors.push(...part.errors);
            index = part.index;
            line = part.line;
            column = part.column;
            continue;
        }
        if (char === "\"" || char === "'") {
            const part = readQuoted(source, index, line, column, char);
            tokens.push(makeToken("string", part.value, line, column));
            strings.push({
                value: part.value,
                line,
                column
            });
            errors.push(...part.errors);
            index = part.index;
            line = part.line;
            column = part.column;
            continue;
        }
        if (char === "`") {
            const part = readTemplate(source, index, line, column);
            tokens.push(...part.tokens);
            strings.push(...part.strings);
            comments.push(...part.comments);
            jsdocs.push(...part.jsdocs);
            errors.push(...part.errors);
            index = part.index;
            line = part.line;
            column = part.column;
            continue;
        }
        if (isIdentifierStart(char)) {
            const start = index;
            const startColumn = column;
            index += 1;
            column += 1;
            while (index < source.length && isIdentifierPart(source[index])) {
                index += 1;
                column += 1;
            }
            tokens.push(makeToken("identifier", source.slice(start, index), line, startColumn));
            continue;
        }
        if (isDigit(char)) {
            const start = index;
            const startColumn = column;
            index += 1;
            column += 1;
            while (index < source.length && /[0-9._A-Fa-fxob]/u.test(source[index] ?? "")) {
                index += 1;
                column += 1;
            }
            tokens.push(makeToken("number", source.slice(start, index), line, startColumn));
            continue;
        }
        const operator = readOperator(source, index);
        if (operator !== undefined) {
            tokens.push(makeToken("operator", operator, line, column));
            index += operator.length;
            column += operator.length;
            continue;
        }
        tokens.push(makeToken("punctuation", char ?? "", line, column));
        index += 1;
        column += 1;
    }

    return {
        tokens,
        strings,
        comments,
        jsdocs,
        errors
    };
}

function readLineComment(source, index, line, column) {
    const start = index;
    const startColumn = column;
    while (index < source.length && source[index] !== "\n") {
        index += 1;
        column += 1;
    }
    return {
        index,
        column,
        comment: {
            text: source.slice(start, index),
            line,
            column: startColumn,
            jsdoc: false
        }
    };
}

function readBlockComment(source, index, line, column) {
    const start = index;
    const startLine = line;
    const startColumn = column;
    const jsdoc = source[index + 2] === "*";
    const errors = [];
    index += 2;
    column += 2;
    while (index < source.length) {
        if (source[index] === "*" && source[index + 1] === "/") {
            index += 2;
            column += 2;
            return {
                index,
                line,
                column,
                errors,
                comment: {
                    text: source.slice(start, index),
                    line: startLine,
                    column: startColumn,
                    jsdoc
                }
            };
        }
        if (source[index] === "\n") {
            index += 1;
            line += 1;
            column = 1;
            continue;
        }
        index += 1;
        column += 1;
    }
    errors.push({
        line: startLine,
        message: "unterminated block comment"
    });
    return {
        index,
        line,
        column,
        errors,
        comment: {
            text: source.slice(start, index),
            line: startLine,
            column: startColumn,
            jsdoc
        }
    };
}

function readQuoted(source, index, line, column, quote) {
    const start = index;
    const startLine = line;
    const errors = [];
    index += 1;
    column += 1;
    while (index < source.length) {
        const char = source[index];
        if (char === "\\") {
            index += 2;
            column += 2;
            continue;
        }
        if (char === quote) {
            const value = source.slice(start + 1, index);
            index += 1;
            column += 1;
            return {
                value,
                index,
                line,
                column,
                errors
            };
        }
        if (char === "\n") {
            line += 1;
            column = 1;
            index += 1;
            continue;
        }
        index += 1;
        column += 1;
    }
    errors.push({
        line: startLine,
        message: "unterminated quoted string literal"
    });
    return {
        value: source.slice(start + 1, index),
        index,
        line,
        column,
        errors
    };
}

function readRegex(source, index, line, column) {
    const start = index;
    const startLine = line;
    const errors = [];
    let inClass = false;
    index += 1;
    column += 1;
    while (index < source.length) {
        const char = source[index];
        if (char === "\\") {
            index += 2;
            column += 2;
            continue;
        }
        if (char === "\n") {
            errors.push({
                line: startLine,
                message: "unterminated regular expression literal"
            });
            return {
                value: source.slice(start, index),
                index,
                line,
                column,
                errors
            };
        }
        if (char === "[") {
            inClass = true;
            index += 1;
            column += 1;
            continue;
        }
        if (char === "]") {
            inClass = false;
            index += 1;
            column += 1;
            continue;
        }
        if (char === "/" && !inClass) {
            index += 1;
            column += 1;
            while (index < source.length && /[A-Za-z]/u.test(source[index] ?? "")) {
                index += 1;
                column += 1;
            }
            return {
                value: source.slice(start, index),
                index,
                line,
                column,
                errors
            };
        }
        index += 1;
        column += 1;
    }
    errors.push({
        line: startLine,
        message: "unterminated regular expression literal"
    });
    return {
        value: source.slice(start, index),
        index,
        line,
        column,
        errors
    };
}

function readTemplate(source, index, line, column) {
    const startLine = line;
    const tokens = [];
    const strings = [];
    const comments = [];
    const jsdocs = [];
    const errors = [];
    index += 1;
    column += 1;

    while (index < source.length) {
        const char = source[index];
        if (char === "\\") {
            index += 2;
            column += 2;
            continue;
        }
        if (char === "`") {
            index += 1;
            column += 1;
            return {
                index,
                line,
                column,
                tokens,
                strings,
                comments,
                jsdocs,
                errors
            };
        }
        if (char === "$" && source[index + 1] === "{") {
            const part = readTemplateExpression(source, index + 2, line, column + 2);
            tokens.push(...part.tokens);
            strings.push(...part.strings);
            comments.push(...part.comments);
            jsdocs.push(...part.jsdocs);
            errors.push(...part.errors);
            index = part.index;
            line = part.line;
            column = part.column;
            continue;
        }
        if (char === "\n") {
            index += 1;
            line += 1;
            column = 1;
            continue;
        }
        index += 1;
        column += 1;
    }

    errors.push({
        line: startLine,
        message: "unterminated template literal"
    });
    return {
        index,
        line,
        column,
        tokens,
        strings,
        comments,
        jsdocs,
        errors
    };
}

function readTemplateExpression(source, index, line, column) {
    const startLine = line;
    const tokens = [];
    const strings = [];
    const comments = [];
    const jsdocs = [];
    const errors = [];
    let depth = 1;

    while (index < source.length) {
        const char = source[index];
        const next = source[index + 1];
        if (char === "/" && next === "/") {
            const part = readLineComment(source, index, line, column);
            comments.push(part.comment);
            index = part.index;
            column = part.column;
            continue;
        }
        if (char === "/" && next === "*") {
            const part = readBlockComment(source, index, line, column);
            comments.push(part.comment);
            if (part.comment.jsdoc) {
                jsdocs.push(part.comment);
            }
            errors.push(...part.errors);
            index = part.index;
            line = part.line;
            column = part.column;
            continue;
        }
        if (char === "/" && looksLikeRegexStart(tokens)) {
            const part = readRegex(source, index, line, column);
            tokens.push(makeToken("regex", part.value, line, column));
            errors.push(...part.errors);
            index = part.index;
            line = part.line;
            column = part.column;
            continue;
        }
        if (char === "\"" || char === "'") {
            const part = readQuoted(source, index, line, column, char);
            tokens.push(makeToken("string", part.value, line, column));
            strings.push({
                value: part.value,
                line,
                column
            });
            errors.push(...part.errors);
            index = part.index;
            line = part.line;
            column = part.column;
            continue;
        }
        if (char === "`") {
            const part = readTemplate(source, index, line, column);
            tokens.push(...part.tokens);
            strings.push(...part.strings);
            comments.push(...part.comments);
            jsdocs.push(...part.jsdocs);
            errors.push(...part.errors);
            index = part.index;
            line = part.line;
            column = part.column;
            continue;
        }
        if (char === "{") {
            depth += 1;
            tokens.push(makeToken("punctuation", char, line, column));
            index += 1;
            column += 1;
            continue;
        }
        if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                index += 1;
                column += 1;
                return {
                    index,
                    line,
                    column,
                    tokens,
                    strings,
                    comments,
                    jsdocs,
                    errors
                };
            }
            tokens.push(makeToken("punctuation", char, line, column));
            index += 1;
            column += 1;
            continue;
        }
        if (char === "\n") {
            index += 1;
            line += 1;
            column = 1;
            continue;
        }
        if (isWhitespace(char)) {
            index += 1;
            column += 1;
            continue;
        }
        if (isIdentifierStart(char)) {
            const start = index;
            const startColumn = column;
            index += 1;
            column += 1;
            while (index < source.length && isIdentifierPart(source[index])) {
                index += 1;
                column += 1;
            }
            tokens.push(makeToken("identifier", source.slice(start, index), line, startColumn));
            continue;
        }
        const operator = readOperator(source, index);
        if (operator !== undefined) {
            tokens.push(makeToken("operator", operator, line, column));
            index += operator.length;
            column += operator.length;
            continue;
        }
        tokens.push(makeToken("punctuation", char ?? "", line, column));
        index += 1;
        column += 1;
    }

    errors.push({
        line: startLine,
        message: "unterminated template interpolation"
    });
    return {
        index,
        line,
        column,
        tokens,
        strings,
        comments,
        jsdocs,
        errors
    };
}

function findImportExportEnd(tokens, start) {
    let moduleStringLine = undefined;
    let depth = 0;
    for (let index = start + 1; index < tokens.length; index += 1) {
        const value = tokenValue(tokens, index);
        const line = tokenLine(tokens, index);
        if (depth === 0) {
            if (value === ";") {
                return index + 1;
            }
            if (index > start + 1 && (value === "import" || value === "export")) {
                return index;
            }
            if (moduleStringLine !== undefined && line > moduleStringLine && !isImportAttributeContinuation(value)) {
                return index;
            }
        }
        if (value === "(" || value === "{" || value === "[") {
            depth += 1;
        } else if (value === ")" || value === "}" || value === "]") {
            depth = Math.max(0, depth - 1);
        } else if (depth === 0 && tokenType(tokens, index) === "string") {
            moduleStringLine = line;
        }
    }
    return tokens.length;
}

function findDeclarationName(tokens, kindIndex) {
    const kind = tokenValue(tokens, kindIndex);
    if (kind === "const" || kind === "let" || kind === "var") {
        const next = kindIndex + 1;
        return tokenType(tokens, next) === "identifier" ? next : undefined;
    }
    const next = kindIndex + 1;
    return tokenType(tokens, next) === "identifier" ? next : undefined;
}

function hasNearbyJsDoc(jsdocs, line) {
    for (let index = 0; index < jsdocs.length; index += 1) {
        const comment = jsdocs[index];
        if (comment !== undefined && line - comment.line <= 3 && line >= comment.line) {
            return true;
        }
    }
    return false;
}

function resolveImport(root, from, specifier, modules) {
    const base = normalize(join(dirname(from), specifier)).replaceAll("\\", "/");
    const candidates = importCandidates(base);
    for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        if (candidate !== undefined && modules.has(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

function resolveExistingImport(root, from, specifier) {
    const base = normalize(join(dirname(from), specifier)).replaceAll("\\", "/");
    const candidates = importCandidates(base);
    for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        if (candidate !== undefined && existsSync(join(root, candidate))) {
            return candidate;
        }
    }
    return undefined;
}

function importCandidates(base) {
    const candidates = [];
    if (base.endsWith(".js") || base.endsWith(".mjs") || base.endsWith(".cjs")) {
        candidates.push(base.replace(/\.(?:mjs|cjs|js)$/u, ".ts"));
        candidates.push(base);
    } else {
        candidates.push(`${base}.ts`);
        candidates.push(`${base}.tsx`);
        candidates.push(`${base}.mjs`);
        candidates.push(`${base}.js`);
        candidates.push(`${base}/index.ts`);
        candidates.push(`${base}/index.mjs`);
    }
    return candidates;
}

function findFile(files, path) {
    for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        if (file !== undefined && file.path === path) {
            return file;
        }
    }
    return undefined;
}

function linesMatching(source, pattern) {
    const out = [];
    const lines = source.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
            out.push(index + 1);
        }
    }
    return out;
}

function hasValueSlotProof(source) {
    return /hasOwnProperty\.call\([^)]*["']value["']\)/u.test(source) ||
        /\bh\.call\([^)]*["']value["']\)/u.test(source) ||
        /\bisDataPropertyDescriptor\s*\(/u.test(source);
}

function isSafeModePath(path) {
    return path.startsWith("src/evaluate/") ||
        path.startsWith("src/plan/") ||
        path.startsWith("src/async-validation/");
}

function readConstObjectKeys(source, name) {
    const pattern = new RegExp(`export\\s+const\\s+${escapeRegExp(name)}\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*as\\s+const`, "u");
    const match = pattern.exec(source);
    if (match === null || match[1] === undefined) {
        return [];
    }
    const keys = [];
    const keyPattern = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:/gmu;
    let keyMatch = keyPattern.exec(match[1]);
    while (keyMatch !== null) {
        if (keyMatch[1] !== undefined) {
            keys.push(keyMatch[1]);
        }
        keyMatch = keyPattern.exec(match[1]);
    }
    return keys;
}

function missingTagCoverage(files, tags, enumName, roots) {
    const stageSource = files
        .filter((file) => roots.some((root) => file.path.startsWith(root)))
        .map((file) => file.source)
        .join("\n");
    const missing = [];
    for (let index = 0; index < tags.length; index += 1) {
        const tag = tags[index];
        if (tag === undefined) {
            continue;
        }
        const pattern = new RegExp(`${escapeRegExp(enumName)}\\s*\\.\\s*${escapeRegExp(tag)}\\b`, "u");
        if (!pattern.test(stageSource)) {
            missing.push(tag);
        }
    }
    return missing;
}

function countFindings(findings, category, severity) {
    let count = 0;
    for (let index = 0; index < findings.length; index += 1) {
        const item = findings[index];
        if (item !== undefined && item.category === category && item.severity === severity) {
            count += 1;
        }
    }
    return count;
}

function findCycles(nodes, edges) {
    const adjacency = new Map();
    for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        if (node !== undefined) {
            adjacency.set(node.id, []);
        }
    }
    for (let index = 0; index < edges.length; index += 1) {
        const edge = edges[index];
        if (edge !== undefined) {
            adjacency.get(edge.from)?.push(edge.to);
        }
    }

    const indexOf = new Map();
    const lowlink = new Map();
    const onStack = new Set();
    const stack = [];
    const cycles = [];
    let nextIndex = 0;

    for (const root of adjacency.keys()) {
        if (indexOf.has(root)) {
            continue;
        }
        const frames = [{
            node: root,
            edgeIndex: 0,
            entered: false
        }];
        while (frames.length !== 0) {
            const frame = frames[frames.length - 1];
            if (frame === undefined) {
                break;
            }
            const node = frame.node;
            if (!frame.entered) {
                indexOf.set(node, nextIndex);
                lowlink.set(node, nextIndex);
                nextIndex += 1;
                stack.push(node);
                onStack.add(node);
                frame.entered = true;
            }
            const neighbors = adjacency.get(node) ?? [];
            if (frame.edgeIndex < neighbors.length) {
                const next = neighbors[frame.edgeIndex];
                frame.edgeIndex += 1;
                if (next === undefined) {
                    continue;
                }
                if (!indexOf.has(next)) {
                    frames.push({
                        node: next,
                        edgeIndex: 0,
                        entered: false
                    });
                    continue;
                }
                if (onStack.has(next)) {
                    lowlink.set(node, Math.min(lowlink.get(node) ?? 0, indexOf.get(next) ?? 0));
                }
                continue;
            }
            frames.pop();
            const parent = frames[frames.length - 1];
            if (parent !== undefined) {
                lowlink.set(parent.node, Math.min(lowlink.get(parent.node) ?? 0, lowlink.get(node) ?? 0));
            }
            if (lowlink.get(node) !== indexOf.get(node)) {
                continue;
            }
            const component = [];
            while (stack.length !== 0) {
                const member = stack.pop();
                if (member === undefined) {
                    break;
                }
                onStack.delete(member);
                component.push(member);
                if (member === node) {
                    break;
                }
            }
            const hasSelfEdge = (adjacency.get(node) ?? []).includes(node);
            if (component.length > 1 || hasSelfEdge) {
                cycles.push(component.sort());
            }
        }
    }

    return cycles;
}

function findFunctionCycles(functions, edges) {
    const nodes = functions.map((fn) => ({
        id: fn.id
    }));
    return findCycles(nodes, edges);
}

function functionFanCounts(edges, field) {
    const counts = new Map();
    for (let index = 0; index < edges.length; index += 1) {
        const edge = edges[index];
        if (edge === undefined) {
            continue;
        }
        const key = edge[field];
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
        .map(([id, count]) => ({ id, count }))
        .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id))
        .slice(0, 25);
}

function readOperator(source, index) {
    for (let size = 4; size >= 2; size -= 1) {
        const value = source.slice(index, index + size);
        if (isOperator(value)) {
            return value;
        }
    }
    return undefined;
}

function isOperator(value) {
    return value === ">>>=" ||
        value === "===" ||
        value === "!==" ||
        value === ">>>" ||
        value === "<<=" ||
        value === ">>=" ||
        value === "**=" ||
        value === "&&=" ||
        value === "||=" ||
        value === "??=" ||
        value === "=>" ||
        value === "==" ||
        value === "!=" ||
        value === "<=" ||
        value === ">=" ||
        value === "++" ||
        value === "--" ||
        value === "&&" ||
        value === "||" ||
        value === "??" ||
        value === "?." ||
        value === "**" ||
        value === "<<" ||
        value === ">>" ||
        value === "+=" ||
        value === "-=" ||
        value === "*=" ||
        value === "/=" ||
        value === "%=" ||
        value === "&=" ||
        value === "|=" ||
        value === "^=" ||
        value === "...";
}

function looksLikeRegexStart(tokens) {
    const previous = tokens[tokens.length - 1]?.value;
    if (previous === undefined) {
        return true;
    }
    return previous === "(" ||
        previous === "[" ||
        previous === "{" ||
        previous === "," ||
        previous === ":" ||
        previous === ";" ||
        previous === "=" ||
        previous === "=>" ||
        previous === "!" ||
        previous === "?" ||
        previous === "??" ||
        previous === "||" ||
        previous === "&&" ||
        previous === "return" ||
        previous === "case" ||
        previous === "throw";
}

function findTokenValue(tokens, value, start, end) {
    for (let index = start; index < end; index += 1) {
        if (tokenValue(tokens, index) === value) {
            return index;
        }
    }
    return undefined;
}

function findMatchingBrace(tokens, start, end) {
    let depth = 0;
    for (let index = start; index < end; index += 1) {
        const value = tokenValue(tokens, index);
        if (value === "{") {
            depth += 1;
        } else if (value === "}") {
            depth -= 1;
            if (depth === 0) {
                return index;
            }
        }
    }
    return undefined;
}

function sourceLayer(path) {
    for (let index = 0; index < LAYER_RULES.length; index += 1) {
        const rule = LAYER_RULES[index];
        if (rule !== undefined && path === rule[0]) {
            return rule[1];
        }
    }
    const parts = path.split("/");
    if (parts[0] === "src" && parts[1] !== undefined && DIRECTORY_LAYERS.has(parts[1])) {
        return parts[1];
    }
    return parts[0] ?? "unknown";
}

function forbiddenLayerEdge(from, to) {
    if (from === to) {
        return false;
    }
    if (from === "schema" && (to === "compile" || to === "evaluate" || to === "aot")) {
        return true;
    }
    if (from === "kind" && to !== "kind") {
        return true;
    }
    if (from === "result" && to !== "result") {
        return true;
    }
    if (from === "regexes" && to !== "regexes") {
        return true;
    }
    return false;
}

function rule(id, severity, category, title, precision, confidence, domain) {
    return {
        id,
        severity,
        category,
        title,
        precision,
        confidence,
        domain
    };
}

function isDecisionToken(value) {
    return value === "if" ||
        value === "for" ||
        value === "while" ||
        value === "case" ||
        value === "catch" ||
        value === "?" ||
        value === "&&" ||
        value === "||" ||
        value === "??";
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function dynamicCodeFlow(path, line) {
    return [
        {
            path: "src/compile/source.ts",
            line: 1,
            message: "Generated validator source and side-table ABI are assembled here."
        },
        {
            path,
            line,
            message: "Dynamic Function constructor consumes generated source."
        }
    ];
}

function enrichFindings(findings) {
    return findings.map((item) => {
        const meta = RULE_INDEX.get(item.rule);
        if (meta === undefined) {
            return item;
        }
        return {
            ...item,
            title: meta.title,
            precision: meta.precision,
            confidence: meta.confidence,
            domain: meta.domain
        };
    });
}

function issueFingerprint(item) {
    return stableHash(`${item.rule}\0${item.path}\0${String(item.line)}\0${item.message}`);
}

function stableHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `TSA-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function finding(severity, category, rule, path, line, message, flow = []) {
    const meta = RULE_INDEX.get(rule);
    return {
        severity,
        category,
        rule,
        title: meta?.title ?? rule,
        precision: meta?.precision ?? "medium",
        confidence: meta?.confidence ?? "medium",
        domain: meta?.domain ?? category,
        path,
        line,
        message,
        flow: flow.length === 0
            ? [{
                path,
                line,
                message
            }]
            : flow
    };
}

function sortFindings(findings) {
    const rank = {
        error: 0,
        warning: 1,
        info: 2
    };
    return findings.sort((left, right) => {
        const rankDiff = (rank[left.severity] ?? 9) - (rank[right.severity] ?? 9);
        if (rankDiff !== 0) {
            return rankDiff;
        }
        const pathDiff = left.path.localeCompare(right.path);
        if (pathDiff !== 0) {
            return pathDiff;
        }
        return left.line - right.line;
    });
}

function topCounts(map) {
    return [...map.entries()]
        .map(([path, count]) => ({ path, count }))
        .filter((entry) => entry.count > 0)
        .sort((left, right) => right.count - left.count || left.path.localeCompare(right.path))
        .slice(0, 25);
}

function countLines(source) {
    if (source.length === 0) {
        return 0;
    }
    return source.split("\n").length;
}

function sum(files, key) {
    let total = 0;
    for (let index = 0; index < files.length; index += 1) {
        total += files[index]?.[key] ?? 0;
    }
    return total;
}

function extensionOf(path) {
    const dot = path.lastIndexOf(".");
    return dot === -1 ? "" : path.slice(dot);
}

function toRepoPath(root, absolute) {
    return relative(root, absolute).replaceAll("\\", "/");
}

function isRelativeSpecifier(value) {
    return value.startsWith("./") || value.startsWith("../");
}

function isDeclarationKind(value) {
    return value === "function" ||
        value === "class" ||
        value === "interface" ||
        value === "type" ||
        value === "const" ||
        value === "let" ||
        value === "var" ||
        value === "enum";
}

function isPublicDocumentationCandidate(declaration) {
    return declaration.kind === "function" ||
        declaration.kind === "class" ||
        declaration.kind === "interface" ||
        declaration.kind === "type";
}

function isImportAttributeContinuation(value) {
    return value === "with" || value === "assert";
}

function isWhitespace(char) {
    return char === " " || char === "\t" || char === "\r";
}

function isIdentifierStart(char) {
    return /^[A-Za-z_$]$/u.test(char ?? "");
}

function isIdentifierPart(char) {
    return /^[A-Za-z0-9_$]$/u.test(char ?? "");
}

function isDigit(char) {
    return /^[0-9]$/u.test(char ?? "");
}

function makeToken(type, value, line, column) {
    return {
        type,
        value,
        line,
        column
    };
}

function tokenValue(tokens, index) {
    return tokens[index]?.value ?? "";
}

function tokenType(tokens, index) {
    return tokens[index]?.type ?? "";
}

function tokenLine(tokens, index) {
    return tokens[index]?.line ?? 1;
}

function sortByName(left, right) {
    return left.name.localeCompare(right.name);
}
