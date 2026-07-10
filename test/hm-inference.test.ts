import ts from "typescript";
import { describe, expect, test } from "vitest";

interface HmOptions {
    readonly path?: string;
    readonly maxFreshVariables?: number;
    readonly maxUnifications?: number;
    readonly maxTypeDepth?: number;
    readonly maxCheckerProperties?: number;
    readonly maxCheckerTypeVisits?: number;
    readonly maxSchedulerOperations?: number;
    readonly checker?: ts.TypeChecker;
    readonly compilerDiagnostics?: readonly ts.Diagnostic[];
    readonly typeScriptFact?: () => TypeScriptFact;
}

interface TypeScriptFact {
    readonly status: "resolved" | "intentional-dynamic" | "error-derived" | "unavailable";
    readonly display?: string;
    readonly typeFlags?: number;
}

interface HmPosition {
    readonly line: number;
    readonly character: number;
    readonly offset: number;
}

interface HmRange {
    readonly start: HmPosition;
    readonly end: HmPosition;
    readonly encoding: "utf-16";
    readonly endExclusive: true;
}

interface HmScheme {
    readonly quantified: readonly string[];
}

interface HmProvenance {
    readonly authoritative: boolean;
    readonly role: string;
}

interface HmCandidate {
    readonly status: string;
    readonly confidence?: string;
    readonly code?: string;
    readonly message?: string;
    readonly display: string;
    readonly scheme: HmScheme;
    readonly provenance: HmProvenance;
}

interface ValueRestriction {
    readonly eligible: boolean;
    readonly generalized: boolean;
    readonly reason: string;
}

interface HmFact {
    readonly id: string;
    readonly name: string;
    readonly range: HmRange;
    readonly annotation?: {
        readonly display: string;
        readonly valid: boolean;
    };
    readonly typescript: TypeScriptFact & {
        readonly provenance: {
            readonly engine: string;
            readonly authoritative: boolean;
        };
    };
    readonly hm: HmCandidate;
    readonly selected: AuthoritySelection;
    readonly valueRestriction: ValueRestriction;
}

interface HmDiagnostic {
    readonly category: string;
    readonly code: string;
    readonly authoritative: boolean;
    readonly range?: HmRange;
}

interface HmReport {
    readonly engine: {
        readonly status: string;
    };
    readonly positionEncoding: "utf-16";
    readonly rangesAreEndExclusive: true;
    readonly facts: readonly HmFact[];
    readonly diagnostics: readonly HmDiagnostic[];
}

interface AuthoritySelection {
    readonly source: "annotation" | "typescript" | "hm" | "unknown";
    readonly display: string;
    readonly trust: "authoritative" | "degraded" | "advisory" | "none";
    readonly reason: string;
}

interface AuthorityInput {
    readonly annotation?: {
        readonly display: string;
        readonly valid?: boolean;
    };
    readonly typescript?: TypeScriptFact;
    readonly hm?: {
        readonly status: string;
        readonly display: string;
        readonly confidence?: string;
    };
}

interface HmModule {
    readonly inferHmCandidates: (sourceFile: ts.SourceFile, options?: HmOptions) => HmReport;
    readonly inferHmSourceText: (source: string, options?: HmOptions) => HmReport;
    readonly selectTypeAuthority: (input: AuthorityInput) => AuthoritySelection;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null;
}

function isHmModule(value: unknown): value is HmModule {
    return isRecord(value) &&
        typeof value["inferHmCandidates"] === "function" &&
        typeof value["inferHmSourceText"] === "function" &&
        typeof value["selectTypeAuthority"] === "function";
}

const hmModuleSpecifier = "../tools/analyzer/hm-inference.mjs";
const loadedHmModule: unknown = await import(hmModuleSpecifier);
if (!isHmModule(loadedHmModule)) {
    throw new Error("HM inference module does not expose the expected API");
}
const { inferHmCandidates, inferHmSourceText, selectTypeAuthority } = loadedHmModule;

function fact(report: HmReport, name: string): HmFact {
    const value = report.facts.find((entry) => entry.name === name);
    if (value === undefined) {
        throw new Error(`missing HM fact for '${name}'`);
    }
    return value;
}

function createVirtualProgram(files: Readonly<Record<string, string>>): ts.Program {
    const options: ts.CompilerOptions = {
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        noEmit: true,
        strict: true,
        target: ts.ScriptTarget.ES2023
    };
    const host = ts.createCompilerHost(options);
    const defaultFileExists = host.fileExists.bind(host);
    const defaultReadFile = host.readFile.bind(host);
    const defaultGetSourceFile = host.getSourceFile.bind(host);
    host.fileExists = (path: string): boolean => files[path] !== undefined || defaultFileExists(path);
    host.readFile = (path: string): string | undefined => files[path] ?? defaultReadFile(path);
    host.getSourceFile = (
        path: string,
        languageVersion: ts.ScriptTarget,
        onError?: (message: string) => void,
        shouldCreateNewSourceFile?: boolean
    ): ts.SourceFile | undefined => {
        const source = files[path];
        return source === undefined
            ? defaultGetSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile)
            : ts.createSourceFile(path, source, languageVersion, true, ts.ScriptKind.TS);
    };
    return ts.createProgram(Object.keys(files), options, host);
}

describe("Algorithm-W supplementary inference", () => {
    test("generalizes a non-expansive const and freshly instantiates each call", () => {
        const report = inferHmSourceText([
            "const identity = value => value;",
            "const numberValue = identity(1);",
            "const stringValue = identity(\"sea\");"
        ].join("\n"));

        const identity = fact(report, "identity");
        expect(identity.hm.status).toBe("inferred");
        expect(identity.hm.display).toMatch(/^forall /u);
        expect(identity.hm.scheme.quantified).toHaveLength(1);
        expect(identity.valueRestriction).toEqual({
            eligible: true,
            generalized: true,
            reason: "non-expansive-const"
        });
        expect(fact(report, "numberValue").hm.display).toBe("number");
        expect(fact(report, "stringValue").hm.display).toBe("string");
    });

    test("keeps shadowed schemes in their lexical environment", () => {
        const report = inferHmSourceText([
            "const identity = value => value;",
            "{",
            "    const identity = value => 1;",
            "    const inner = identity(\"sea\");",
            "}",
            "const outer = identity(\"sea\");"
        ].join("\n"));
        const identities = report.facts.filter((entry) => entry.name === "identity");

        expect(identities).toHaveLength(2);
        expect(identities[0]?.hm.display).toMatch(/-> 'a$/u);
        expect(identities[1]?.hm.display).toMatch(/-> number$/u);
        expect(fact(report, "inner").hm.display).toBe("number");
        expect(fact(report, "outer").hm.display).toBe("string");
    });

    test("rejects infinite self-application types with an occurs check", () => {
        const report = inferHmSourceText("const omega = value => value(value);");
        const omega = fact(report, "omega");

        expect(omega.hm.status).toBe("conflict");
        expect(omega.hm.code).toBe("HM_OCCURS_CHECK");
        expect(report.diagnostics).toEqual([
            expect.objectContaining({
                category: "conflict",
                code: "HM_OCCURS_CHECK",
                authoritative: false
            })
        ]);
    });

    test("applies the value restriction to mutable and expansive bindings", () => {
        const report = inferHmSourceText([
            "const values = [];",
            "let mutableIdentity = value => value;"
        ].join("\n"));

        expect(fact(report, "values").valueRestriction).toEqual({
            eligible: false,
            generalized: false,
            reason: "expansive-expression"
        });
        expect(fact(report, "values").hm.scheme.quantified).toEqual([]);
        expect(fact(report, "mutableIdentity").valueRestriction).toEqual({
            eligible: false,
            generalized: false,
            reason: "mutable-binding"
        });
        expect(fact(report, "mutableIdentity").hm.scheme.quantified).toEqual([]);

        const captured = inferHmSourceText([
            "const values = [];",
            "const get = () => values[0];",
            "const numberValue = get() + 1;"
        ].join("\n"));
        expect(fact(captured, "get").hm.scheme.quantified).toEqual([]);
        expect(fact(captured, "get").hm.display).toContain("number");
    });

    test("keeps annotations and every TypeScript result authoritative", () => {
        const report = inferHmSourceText("const count: number = 1;", {
            typeScriptFact: (): TypeScriptFact => ({
                status: "resolved",
                display: "number",
                typeFlags: 8
            })
        });
        const count = fact(report, "count");
        const hm = { status: "inferred", display: "number", confidence: "medium" };
        const dynamicTypeName = "a" + "n" + "y";

        expect(count.annotation).toEqual(expect.objectContaining({
            display: "number",
            valid: true
        }));
        expect(count.selected.source).toBe("annotation");
        expect(count.hm.provenance).toEqual(expect.objectContaining({
            role: "supplementary",
            authoritative: false
        }));
        expect(selectTypeAuthority({
            typescript: { status: "error-derived", display: dynamicTypeName },
            hm
        })).toEqual({
            source: "typescript",
            display: dynamicTypeName,
            trust: "degraded",
            reason: "checker-result-retained-despite-diagnostic"
        });
        expect(selectTypeAuthority({
            typescript: { status: "unavailable" },
            hm
        }).source).toBe("hm");
    });

    test("reports TypeScript-specific syntax as unsupported without inventing a type", () => {
        const report = inferHmSourceText("const value = source?.nested;");
        const value = fact(report, "value");

        expect(value.hm.status).toBe("unsupported");
        expect(report.diagnostics.map((entry) => entry.code)).toContain("HM_UNSUPPORTED_OPTIONAL_CHAIN");
        expect(value.hm.provenance.authoritative).toBe(false);
    });

    test("makes budget exhaustion explicit and preserves deterministic fact IDs", () => {
        const source = "const identity = value => value;";
        const first = inferHmSourceText(source, {
            path: "fixture/stable.ts",
            maxFreshVariables: 2
        });
        const second = inferHmSourceText(source, {
            path: "fixture/stable.ts",
            maxFreshVariables: 2
        });

        expect(first.engine.status).toBe("budget-exceeded");
        expect(fact(first, "identity").hm.status).toBe("budget-exceeded");
        expect(first.facts.map((entry) => entry.id)).toEqual(second.facts.map((entry) => entry.id));
    });

    test("emits LSP-compatible zero-based UTF-16 end-exclusive ranges", () => {
        const source = "const mascot = \"🐕\"; const identity = value => value;";
        const report = inferHmSourceText(source, { path: "fixture/utf16.ts" });
        const identity = fact(report, "identity");
        const expectedOffset = source.indexOf("identity");

        expect(report.positionEncoding).toBe("utf-16");
        expect(report.rangesAreEndExclusive).toBe(true);
        expect(identity.range.start).toEqual({
            line: 0,
            character: expectedOffset,
            offset: expectedOffset
        });
        expect(identity.range.end.offset).toBe(expectedOffset + "identity".length);
        expect(identity.range.end.character).toBe(expectedOffset + "identity".length);
    });

    test("keeps output stable across repeated successful inference", () => {
        const source = "const identity = value => value; const result = identity(1);";
        const first = inferHmSourceText(source, { path: "fixture/deterministic.ts" });
        const second = inferHmSourceText(source, { path: "fixture/deterministic.ts" });

        expect(first).toEqual(second);
    });

    test("gives a live checker precedence over an unavailable callback", () => {
        const path = "/hm-authority.ts";
        const program = createVirtualProgram({ [path]: "const value = 1;" });
        const sourceFile = program.getSourceFile(path);
        if (sourceFile === undefined) {
            throw new Error("virtual authority source was not created");
        }
        const report = inferHmCandidates(sourceFile, {
            checker: program.getTypeChecker(),
            compilerDiagnostics: ts.getPreEmitDiagnostics(program),
            path: "hm-authority.ts",
            typeScriptFact: (): TypeScriptFact => ({ status: "unavailable" })
        });

        expect(fact(report, "value").selected.source).toBe("typescript");
        expect(fact(report, "value").typescript.provenance).toEqual({
            engine: "typescript",
            authoritative: true
        });
    });

    test("marks an indirect error type as degraded TypeScript authority", () => {
        const path = "/hm-broken-alias.ts";
        const program = createVirtualProgram({
            [path]: "type Broken = MissingType; const value: Broken = 1;"
        });
        const sourceFile = program.getSourceFile(path);
        if (sourceFile === undefined) {
            throw new Error("virtual broken-alias source was not created");
        }
        const report = inferHmCandidates(sourceFile, {
            checker: program.getTypeChecker(),
            compilerDiagnostics: ts.getPreEmitDiagnostics(program),
            path: "hm-broken-alias.ts"
        });
        const value = fact(report, "value");

        expect(value.annotation?.valid).toBe(false);
        expect(value.typescript.status).toBe("error-derived");
        expect(value.selected).toEqual(expect.objectContaining({
            source: "typescript",
            trust: "degraded"
        }));
    });

    test("propagates parser recovery and exact EOF diagnostics", () => {
        const source = "const value = (1;";
        const report = inferHmSourceText(source);
        const syntax = report.diagnostics.find((entry) => entry.code.startsWith("TS"));

        expect(report.engine.status).toBe("parse-errors");
        expect(syntax).toBeDefined();
        expect(syntax?.authoritative).toBe(true);
        expect(syntax?.range?.start.offset).toBeGreaterThanOrEqual(source.indexOf("("));
        expect(fact(report, "value").hm).toEqual(expect.objectContaining({
            status: "partial",
            confidence: "low",
            code: "HM_PARSE_RECOVERY"
        }));
    });

    test("distinguishes depth and fresh-variable budgets from occurs conflicts", () => {
        const depth = inferHmSourceText("const value: number[][] = [];", {
            maxTypeDepth: 1
        });
        const fresh = inferHmSourceText("const values = [];", {
            maxFreshVariables: 1
        });

        for (const report of [depth, fresh]) {
            expect(report.engine.status).toBe("budget-exceeded");
            expect(report.diagnostics.map((entry) => entry.code)).toEqual(["HM_BUDGET_EXCEEDED"]);
            expect(report.diagnostics[0]?.range?.start.offset).toBeGreaterThan(0);
            expect(report.facts[0]?.hm).toEqual(expect.objectContaining({
                status: "budget-exceeded",
                code: "HM_BUDGET_EXCEEDED"
            }));
        }
    });

    test("uses the real element access as a diagnostic origin", () => {
        const source = "const object = 1; const value = object[\"key\"];";
        const report = inferHmSourceText(source);
        const mismatch = report.diagnostics.find((entry) => entry.code === "HM_TYPE_MISMATCH");

        expect(mismatch?.range?.start.offset).toBe(source.indexOf("object[\"key\"]"));
        expect(mismatch?.range?.start.offset).not.toBe(0);
    });

    test("handles SCC polymorphism, deferred captures, and TDZ shadowing", () => {
        const scc = inferHmSourceText([
            "function use() { return identity; }",
            "function identity(value) { return value; }",
            "const numberValue = use()(1);",
            "const stringValue = use()(\"sea\");"
        ].join("\n"));
        expect(fact(scc, "numberValue").hm.display).toBe("number");
        expect(fact(scc, "stringValue").hm.display).toBe("string");

        const crossKind = inferHmSourceText([
            "function use() { return later; }",
            "const later = value => value;",
            "const numberValue = use()(1);",
            "const stringValue = use()(\"sea\");"
        ].join("\n"));
        expect(fact(crossKind, "numberValue").hm.display).toBe("number");
        expect(fact(crossKind, "stringValue").hm.display).toBe("string");

        const sourceOrdered = inferHmSourceText([
            "const seed = 1 + 0;",
            "const passthrough = value => { seed; return value; };",
            "const numberValue = passthrough(1);",
            "const stringValue = passthrough(\"sea\");"
        ].join("\n"));
        expect(fact(sourceOrdered, "passthrough").hm.status).toBe("inferred");
        expect(fact(sourceOrdered, "numberValue").hm.display).toBe("number");
        expect(fact(sourceOrdered, "stringValue").hm.display).toBe("string");

        const deferred = inferHmSourceText(
            "function read() { return later; } const later = 1; const result = read();"
        );
        expect(fact(deferred, "read").hm.display).toContain("number");
        expect(fact(deferred, "result").hm.display).toBe("number");

        const tdz = inferHmSourceText("const value = (() => value)();");
        expect(fact(tdz, "value").hm.status).toBe("partial");
        expect(tdz.diagnostics.map((entry) => entry.code)).toContain("HM_POSSIBLE_TDZ_IIFE");

        const intervening = inferHmSourceText(
            "const first = 1; later; const later = 2; function read() { return first; }"
        );
        expect(intervening.diagnostics.map((entry) => entry.code)).toContain("HM_TDZ_BINDING");
    });

    test("jointly generalizes recursive const functions with bounded linear scheduling", () => {
        const recursive = inferHmSourceText([
            "const first = value => second(value);",
            "const second = value => { first; return value; };",
            "const numberValue = first(1);",
            "const stringValue = first(\"sea\");"
        ].join("\n"));

        expect(fact(recursive, "first").hm.status).toBe("inferred");
        expect(fact(recursive, "second").hm.status).toBe("inferred");
        expect(fact(recursive, "numberValue").hm.display).toBe("number");
        expect(fact(recursive, "stringValue").hm.display).toBe("string");

        const mixed = inferHmSourceText([
            "function first(value) { return second(value); }",
            "const second = value => { first; return value; };",
            "const numberValue = first(1);",
            "const stringValue = first(\"sea\");"
        ].join("\n"));
        expect(fact(mixed, "first").hm.status).toBe("inferred");
        expect(fact(mixed, "second").hm.status).toBe("inferred");
        expect(fact(mixed, "numberValue").hm.display).toBe("number");
        expect(fact(mixed, "stringValue").hm.display).toBe("string");

        const shadowedDependency = inferHmSourceText([
            "const first = value => { if (true) return second(value); return value; };",
            "const second = first => first;",
            "const numberValue = second(1);",
            "const stringValue = second(\"sea\");"
        ].join("\n"));
        expect(fact(shadowedDependency, "numberValue").hm.display).toBe("number");
        expect(fact(shadowedDependency, "stringValue").hm.display).toBe("string");

        const unsafeCall = inferHmSourceText([
            "function first(value) { return second(value); }",
            "const result = first(1);",
            "const second = value => value;"
        ].join("\n"));
        expect(fact(unsafeCall, "result").hm.status).toBe("partial");
        expect(unsafeCall.diagnostics.map((entry) => entry.code)).toContain(
            "HM_POSSIBLE_TDZ_CALL"
        );

        const deferredClosure = inferHmSourceText(
            "function outer() { return () => later; } const result = outer(); const later = 1;"
        );
        expect(deferredClosure.diagnostics.map((entry) => entry.code)).not.toContain(
            "HM_POSSIBLE_TDZ_CALL"
        );
        expect(deferredClosure.diagnostics.map((entry) => entry.code)).not.toContain(
            "HM_NESTED_CLOSURE_TDZ_BOUNDARY"
        );

        const returnedClosureCall = inferHmSourceText(
            "const first = () => () => second; const result = first()(); const second = 1;"
        );
        expect(returnedClosureCall.diagnostics.map((entry) => entry.code)).toContain(
            "HM_NESTED_CLOSURE_TDZ_BOUNDARY"
        );

        const storedClosureCall = inferHmSourceText([
            "const outer = () => () => later;",
            "const inner = outer();",
            "{ const later = 0; const result = inner(); }",
            "const later = 1;"
        ].join("\n"));
        expect(storedClosureCall.diagnostics.map((entry) => entry.code)).toContain(
            "HM_NESTED_CLOSURE_TDZ_BOUNDARY"
        );

        const indirectClosureCall = inferHmSourceText([
            "const outer = () => () => later;",
            "const holder = { inner: outer() };",
            "holder.inner();",
            "const later = 1;"
        ].join("\n"));
        expect(indirectClosureCall.diagnostics.map((entry) => entry.code)).toContain(
            "HM_INDIRECT_CALL_TDZ_BOUNDARY"
        );

        const valueOnlyCycle = inferHmSourceText([
            "const first = () => second;",
            "const second = () => { first; return later; };",
            "const result = first();",
            "const later = 1;"
        ].join("\n"));
        expect(valueOnlyCycle.diagnostics.map((entry) => entry.code)).not.toContain(
            "HM_POSSIBLE_TDZ_CALL"
        );

        const makeChain = (length: number): string =>
            Array.from({ length }, (_, index) =>
                index + 1 === length
                    ? `const value${String(index)} = () => 1;`
                    : `const value${String(index)} = () => value${String(index + 1)}();`
            ).join("\n");
        const chainLength = 8000;
        const chain = makeChain(chainLength);
        const scheduled = inferHmSourceText(chain);
        expect(scheduled.engine.status).toBe("completed");
        expect(scheduled.facts).toHaveLength(chainLength);

        const ordinaryBindings = Array.from({ length: chainLength }, (_, index) =>
            `const ordinary${String(index)} = ${String(index)};`
        ).join("\n");
        const ordinary = inferHmSourceText(ordinaryBindings);
        expect(ordinary.engine.status).toBe("completed");
        expect(ordinary.facts).toHaveLength(chainLength);

        const prelude = inferHmSourceText(
            `${ordinaryBindings}\nfunction readFirst() { return ordinary0; }`
        );
        expect(prelude.engine.status).toBe("completed");
        expect(prelude.facts).toHaveLength(chainLength + 1);

        const scopedLength = 4000;
        const scoped = inferHmSourceText([
            Array.from({ length: scopedLength }, (_, index) =>
                `const top${String(index)} = ${String(index)};`).join("\n"),
            Array.from({ length: scopedLength }, (_, index) =>
                `{ const local${String(index)} = ${String(index)}; }`).join("\n")
        ].join("\n"));
        expect(scoped.engine.status).toBe("completed");
        expect(scoped.facts).toHaveLength(scopedLength * 2);

        const parenthesizedFunctions = Array.from({ length: scopedLength }, (_, index) =>
            `const wrapped${String(index)} = (() => ${String(index)});`
        ).join("\n");
        const wrapped = inferHmSourceText(
            `${parenthesizedFunctions}\nfunction readWrapped() { return wrapped0(); }`
        );
        expect(wrapped.engine.status).toBe("completed");
        expect(wrapped.facts).toHaveLength(scopedLength + 1);

        const bounded = inferHmSourceText(makeChain(16), { maxSchedulerOperations: 32 });
        expect(bounded.engine.status).toBe("budget-exceeded");
        expect(bounded.diagnostics.map((entry) => entry.code)).toContain("HM_BUDGET_EXCEEDED");
    });

    test("unifies open record rows across independent instantiations", () => {
        const valid = inferHmSourceText([
            "const readA = value => value.a;",
            "const numberValue = readA({ a: 1, b: \"extra\" });",
            "const stringValue = readA({ a: \"sea\", c: true });",
            "const repeatA = value => [value.a, value.a] as const;"
        ].join("\n"));

        expect(fact(valid, "numberValue").hm.display).toBe("number");
        expect(fact(valid, "stringValue").hm.display).toBe("string");
        expect(fact(valid, "repeatA").hm.status).toBe("inferred");
        expect(valid.engine.status).not.toBe("budget-exceeded");

        const missing = inferHmSourceText(
            "const readA = value => value.a; const result = readA({ b: 1 });"
        );
        expect(fact(missing, "result").hm.status).toBe("conflict");
        expect(missing.diagnostics.map((entry) => entry.code)).toContain("HM_RECORD_FIELD_MISMATCH");
    });

    test("rolls back every constraint from a failed composite expression", () => {
        const report = inferHmSourceText([
            "const values = [];",
            "values[0] - \"bad\";",
            "const after = values[0];"
        ].join("\n"));

        expect(fact(report, "values").hm.display).not.toContain("number");
        expect(fact(report, "after").hm.display).not.toBe("number");
        expect(report.diagnostics.map((entry) => entry.code)).toContain("HM_TYPE_MISMATCH");
    });

    test("delegates TypeScript joins and casts while retaining bigint arithmetic", () => {
        const flow = inferHmSourceText([
            "const maybe = flag => { if (flag) return 1; };",
            "const joined = null ?? \"sea\";",
            "const asserted = 1 as unknown as string;",
            "const checked = [1, 2] satisfies [number, number];",
            "const negative = -1n;",
            "const sum = 1n + 2n;"
        ].join("\n"));

        expect(fact(flow, "maybe").hm.status).toBe("partial");
        expect(flow.diagnostics.map((entry) => entry.code)).toEqual(expect.arrayContaining([
            "HM_TYPESCRIPT_UNION_REQUIRED",
            "HM_TYPE_ASSERTION_BOUNDARY",
            "HM_SATISFIES_BOUNDARY"
        ]));
        expect(fact(flow, "asserted").hm.status).toBe("partial");
        expect(fact(flow, "negative").hm.display).toBe("bigint");
        expect(fact(flow, "sum").hm.display).toBe("bigint");
    });

    test("bounds parentless, deeply nested, and shared checker graphs", () => {
        const parentless = ts.createSourceFile(
            "parentless.ts",
            "const values = [];",
            ts.ScriptTarget.Latest,
            false,
            ts.ScriptKind.TS
        );
        expect(inferHmCandidates(parentless).facts).toHaveLength(1);

        const nested = inferHmSourceText(
            `const value = ${"(".repeat(1000)}1${")".repeat(1000)};`,
            { maxTypeDepth: 16 }
        );
        expect(nested.engine.status).toBe("budget-exceeded");
        expect(nested.diagnostics[0]?.code).toMatch(/^HM_(?:PARSE_FAILURE|BUDGET_EXCEEDED)$/u);

        const chainLength = 500;
        const dependencyChain = Array.from({ length: chainLength }, (_, index) =>
            index + 1 === chainLength
                ? `function chain${String(index)}() { return 1; }`
                : `function chain${String(index)}() { return chain${String(index + 1)}(); }`
        ).join("\n");
        const chained = inferHmSourceText(dependencyChain, { maxTypeDepth: 16 });
        expect(chained.facts).toHaveLength(chainLength);
        expect(chained.diagnostics.map((entry) => entry.code)).not.toContain("HM_PARSE_FAILURE");

        const globalsPath = "/hm-shared-globals.d.ts";
        const mainPath = "/hm-shared-main.ts";
        const aliases = ["type Shared0 = { value: number };"].concat(
            Array.from({ length: 18 }, (_, index) =>
                `type Shared${String(index + 1)} = { left: Shared${String(index)}, right: Shared${String(index)} };`)
        );
        const program = createVirtualProgram({
            [globalsPath]: `${aliases.join("\n")}\ndeclare const shared: Shared18;`,
            [mainPath]: "const result = shared;"
        });
        const sourceFile = program.getSourceFile(mainPath);
        if (sourceFile === undefined) {
            throw new Error("virtual shared-graph source was not created");
        }
        const shared = inferHmCandidates(sourceFile, {
            checker: program.getTypeChecker(),
            compilerDiagnostics: ts.getPreEmitDiagnostics(program),
            maxCheckerTypeVisits: 1000,
            path: "hm-shared-main.ts"
        });
        const serialized = JSON.stringify(shared);

        expect(fact(shared, "result").hm.display.length).toBeLessThanOrEqual(8192);
        expect(serialized.length).toBeLessThan(200_000);
    });
});
