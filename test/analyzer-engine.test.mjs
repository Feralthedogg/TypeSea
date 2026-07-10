import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { analyzeFile, analyzeProject } from "../tools/analyzer/engine.mjs";

const temporaryRoots = [];

afterAll(async () => {
    await Promise.all(temporaryRoots.map((root) => rm(root, { force: true, recursive: true })));
});

describe("TypeSea analyzer engine integration", () => {
    test("does not promote an explicit exported:false declaration", () => {
        const file = analyzeFile("src/private.ts", "const hidden = 1;\n", {
            exports: [{ name: "hidden" }],
            declarations: [{
                kind: "variable",
                name: "hidden",
                exported: false,
                span: span("src/private.ts", 0, 6, 0, 12)
            }],
            functions: [],
            imports: []
        });

        expect(file.declarations).toHaveLength(1);
        expect(file.declarations[0].exported).toBe(false);
        expect(file.exports).toEqual([]);
    });

    test("coalesces overload symbols, preserves v2 line fingerprints, and fingerprints exact columns", async () => {
        const root = await createWorkspace({
            "src/a.ts": "export function foo(): void {}\nconst generated = new Function(\"return 1\");\n",
            "src/b.ts": "export function foo(): void {}\n"
        });
        const frontend = frontendResult([
            frontendFile("src/a.ts", {
                declarations: [
                    declaration("src/a.ts", "foo", "sym:a:foo", false, 0, 16),
                    declaration("src/a.ts", "foo", "sym:a:foo", false, 0, 16)
                ]
            }),
            frontendFile("src/b.ts", {
                declarations: [declaration("src/b.ts", "foo", "sym:b:foo", false, 0, 16)]
            })
        ]);

        const analysis = await analyzeProject({
            root,
            roots: ["src"],
            typescriptFrontendResult: frontend
        });
        const missing = analysis.findings.filter((finding) => finding.rule === "missing-public-jsdoc");
        const duplicates = analysis.findings.filter((finding) => finding.rule === "duplicate-export-name");
        const dynamic = analysis.findings.find((finding) => finding.rule === "dynamic-code-sink");

        expect(missing).toHaveLength(2);
        expect(duplicates).toHaveLength(1);
        expect(missing[0].fingerprint).toBe(stableHash([
            "missing-public-jsdoc",
            "src/a.ts",
            "1",
            "17",
            "Exported function 'foo' is missing nearby JSDoc."
        ].join("\0")));
        expect(dynamic?.line).toBe(2);
        expect(dynamic?.column).toBeUndefined();
        expect(dynamic?.fingerprint).toBe(stableHash([
            "dynamic-code-sink",
            "src/a.ts",
            "2",
            "Dynamic code construction appears outside the approved TypeSea JIT bridge."
        ].join("\0")));
    });

    test("fails closed for an invalid frontend but treats explicit disablement as informational", async () => {
        const root = await createWorkspace({
            "src/value.ts": "export const value = 1;\n"
        });
        const degraded = await analyzeProject({
            root,
            roots: ["src"],
            typescriptFrontendResult: {
                ...frontendResult([]),
                schemaVersion: 999
            }
        });
        const degradedHealth = degraded.findings.find((finding) =>
            finding.rule === "typescript-frontend-unavailable");
        expect(degraded.frontend.status).toBe("degraded");
        expect(degradedHealth?.severity).toBe("error");
        expect(degraded.qualityGate.status).toBe("failed");

        const disabled = await analyzeProject({
            root,
            roots: ["src"],
            typescriptFrontend: false
        });
        const disabledHealth = disabled.findings.find((finding) =>
            finding.rule === "typescript-frontend-unavailable");
        expect(disabled.frontend.status).toBe("disabled");
        expect(disabledHealth?.severity).toBe("info");
        expect(disabled.summary.findings.error).toBe(0);
    });

    test("fails closed for an inconclusive implicit runtime call", async () => {
        const root = await createWorkspace({
            "src/decorator.ts": "export class Decorated {}\n"
        });
        const file = frontendFile("src/decorator.ts", {
            runtimeOwners: [{
                id: "runtime:class-static:init",
                kind: "class-static-init",
                name: "Decorated.<static-init>",
                synthetic: true,
                span: span("src/decorator.ts", 0, 7, 0, 22),
                metricSpans: [],
                calls: [{
                    id: "call:decorator",
                    kind: "decorator-application",
                    name: "@factory()",
                    inconclusiveRuntime: true,
                    span: span("src/decorator.ts", 0, 0, 0, 7)
                }]
            }],
            syntheticEdges: [],
            nonRuntimeSpans: []
        });
        const analysis = await analyzeProject({
            root,
            roots: ["src"],
            typescriptFrontendResult: frontendResult([file])
        });
        const ownership = analysis.findings.find((finding) =>
            finding.rule === "runtime-ownership-inconclusive");

        expect(ownership?.severity).toBe("error");
        expect(ownership?.analysisBasis).toBe("typescript-runtime-semantics");
        expect(analysis.qualityGate.status).toBe("failed");
    });

    test("publishes bounded compiler facts, functions, and call-graph records", async () => {
        const root = await createWorkspace({
            "src/many.ts": "export const marker = 1;\n"
        });
        const functions = Array.from({ length: 300 }, (_, index) => ({
            id: `fn:${String(index)}`,
            name: `fn${String(index)}`,
            kind: "function",
            exported: false,
            span: span("src/many.ts", 0, 0, 0, 6),
            bodySpan: span("src/many.ts", 0, 0, 0, 6),
            parameters: [],
            typeParameters: [],
            calls: [1, 2, 3]
                .map((distance) => index - distance)
                .filter((target) => target >= 0)
                .map((target) => ({
                    name: `fn${String(target)}`,
                    targetId: `fn:${String(target)}`,
                    span: span("src/many.ts", 0, 0, 0, 3)
                }))
        }));
        const facts = Array.from({ length: 100 }, (_, index) => ({
            id: `type:${String(index)}`,
            kind: "variable",
            name: `value${String(index)}`,
            inferredType: "number",
            typeFlags: { ["a" + "ny"]: false },
            span: span("src/many.ts", 0, 0, 0, 1)
        }));
        const inferenceFacts = Array.from({ length: 100 }, (_, index) => ({
            id: `hm:${String(index)}`,
            kind: "const",
            name: `value${String(index)}`,
            range: span("src/many.ts", 0, 0, 0, 1),
            typescript: { status: "resolved", display: "number" },
            hm: {
                status: "inferred",
                display: "number",
                type: { deliberately: { deeply: { nested: index } } }
            },
            selected: { trust: "authoritative", display: "number" }
        }));
        const diagnostics = Array.from({ length: 100 }, (_, index) => ({
            phase: "semantic",
            category: "message",
            code: 9000 + index,
            message: `diagnostic ${String(index)}`,
            span: span("src/many.ts", 0, 0, 0, 1)
        }));
        const typeEscapes = Array.from({ length: 100 }, (_, index) => ({
            kind: "explicit_any",
            message: `escape ${String(index)}`,
            span: span("src/many.ts", 0, 0, 0, 1)
        }));
        const file = frontendFile("src/many.ts", {
            functions,
            typeFacts: facts,
            inferenceFacts,
            inferenceDiagnostics: diagnostics,
            typeEscapes
        });
        const analysis = await analyzeProject({
            root,
            roots: ["src"],
            typescriptFrontendResult: frontendResult([file], diagnostics)
        });
        const publishedFile = analysis.frontend.files[0];

        expect(analysis.frontend.diagnostics).toHaveLength(64);
        expect(analysis.frontend.omitted.diagnostics).toBe(36);
        expect(publishedFile.typeFacts).toHaveLength(8);
        expect(publishedFile.inferenceFacts).toHaveLength(8);
        expect(publishedFile.inferenceDiagnostics).toHaveLength(8);
        expect(publishedFile.typeEscapes).toHaveLength(8);
        expect(publishedFile.inferenceFacts[0].hm.type).toBeUndefined();
        expect(analysis.summary.functions).toBe(300);
        expect(analysis.functions).toHaveLength(256);
        expect(analysis.callGraph.nodeCount).toBe(300);
        expect(analysis.callGraph.nodes).toHaveLength(256);
        expect(analysis.callGraph.edgeCount).toBeGreaterThan(512);
        expect(analysis.callGraph.edges).toHaveLength(512);
        expect(analysis.callGraph.omitted.edges).toBeGreaterThan(0);
    });
});

async function createWorkspace(files) {
    const root = await mkdtemp(join(tmpdir(), "typesea-engine-"));
    temporaryRoots.push(root);
    for (const [path, source] of Object.entries(files)) {
        const absolute = join(root, path);
        await mkdir(dirname(absolute), { recursive: true });
        await writeFile(absolute, source, "utf8");
    }
    return root;
}

function frontendResult(files, diagnostics = []) {
    return {
        schemaVersion: 1,
        protocol: "typesea.typescript-frontend/v1",
        typescriptVersion: "test",
        rangeEncoding: {
            name: "utf-16",
            encoding: "utf-16",
            lineBase: 0,
            columnBase: 0,
            endExclusive: true
        },
        files,
        diagnostics,
        summary: { files: files.length }
    };
}

function frontendFile(path, overrides = {}) {
    return {
        path,
        span: span(path, 0, 0, 0, 1),
        imports: [],
        exports: [],
        declarations: [],
        functions: [],
        typeFacts: [],
        inferenceFacts: [],
        inferenceDiagnostics: [],
        typeEscapes: [],
        ...overrides
    };
}

function declaration(path, name, symbolId, documented, line, character) {
    return {
        kind: "function",
        name,
        symbolId,
        exported: true,
        documented,
        span: span(path, line, character, line, character + name.length)
    };
}

function span(path, startLine, startCharacter, endLine, endCharacter) {
    return {
        path,
        start: {
            line: startLine,
            character: startCharacter,
            offset: startCharacter
        },
        end: {
            line: endLine,
            character: endCharacter,
            offset: endCharacter
        },
        encoding: "utf-16",
        lineBase: 0,
        columnBase: 0,
        endExclusive: true
    };
}

function stableHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `TSA-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
