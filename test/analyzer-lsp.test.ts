import {
    spawn,
    type ChildProcessWithoutNullStreams
} from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, test } from "vitest";

type JsonObject = Readonly<Record<string, unknown>>;

interface LspClient {
    readonly child: ChildProcessWithoutNullStreams;
    readonly closed: Promise<number>;
    readonly messages: readonly JsonObject[];
    readonly send: (message: JsonObject) => void;
    readonly stderr: () => string;
    readonly verifyFraming: () => void;
    readonly waitFor: (
        predicate: (message: JsonObject) => boolean,
        description: string
    ) => Promise<JsonObject>;
}

interface Waiter {
    readonly predicate: (message: JsonObject) => boolean;
    readonly resolve: (message: JsonObject) => void;
    readonly reject: (error: Error) => void;
    timer: NodeJS.Timeout;
}

const repositoryRoot = resolve(import.meta.dirname, "..");
const lspPath = join(repositoryRoot, "tools", "analyzer", "lsp.mjs");
const liveChildren = new Set<ChildProcessWithoutNullStreams>();
const temporaryRoots: string[] = [];

afterAll(async (): Promise<void> => {
    for (const child of liveChildren) {
        if (child.exitCode === null) {
            child.kill("SIGTERM");
        }
    }
    await Promise.all(temporaryRoots.map(async (root): Promise<void> => {
        await rm(root, { force: true, recursive: true });
    }));
});

describe("TypeSea analyzer language server", () => {
    test("serves exact UTF-16 diagnostics and TypeScript editor features over stdio", async () => {
        const workspace = await createWorkspace();
        const mainPath = join(workspace, "main.ts");
        const libraryPath = join(workspace, "library.ts");
        const mainUri = pathToFileURL(mainPath).href;
        const libraryUri = pathToFileURL(libraryPath).href;
        const rootUri = pathToFileURL(workspace).href;
        const source = mainSource();
        const client = createClient(workspace);

        client.send({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                capabilities: {
                    general: {
                        positionEncodings: ["utf-16"]
                    }
                },
                initializationOptions: {
                    tsconfigPath: "tsconfig.json"
                },
                rootUri
            }
        });
        const initialized = await client.waitFor(hasId(1), "initialize response");
        const initializeResult = objectField(initialized, "result");
        const capabilities = objectField(initializeResult, "capabilities");
        expect(stringField(capabilities, "positionEncoding")).toBe("utf-16");
        expect(capabilities["hoverProvider"]).toBe(true);
        expect(capabilities["definitionProvider"]).toBe(true);
        expect(objectField(capabilities, "codeActionProvider")["codeActionKinds"])
            .toEqual(["quickfix"]);

        client.send({
            jsonrpc: "2.0",
            method: "initialized",
            params: {}
        });
        client.send({
            jsonrpc: "2.0",
            method: "textDocument/didOpen",
            params: {
                textDocument: {
                    languageId: "typescript",
                    text: source,
                    uri: mainUri,
                    version: 1
                }
            }
        });

        const publication = await client.waitFor((message): boolean =>
            stringField(message, "method") === "textDocument/publishDiagnostics" &&
            stringField(objectField(message, "params"), "uri") === mainUri,
        "publishDiagnostics notification");
        const publicationParams = objectField(publication, "params");
        const diagnostics = arrayField(publicationParams, "diagnostics").filter(isJsonObject);
        expect(publicationParams["version"]).toBe(1);
        expect(diagnostics).toHaveLength(1);
        const diagnostic = diagnostics[0];
        expect(diagnostic).toMatchObject({
            code: 2304,
            message: "Cannot find name 'missingHelper'.",
            severity: 1,
            source: "typescript",
            range: {
                start: { line: 0, character: 35 },
                end: { line: 0, character: 48 }
            }
        });
        expect(Buffer.byteLength(source.slice(0, 35))).toBe(37);

        client.send({
            jsonrpc: "2.0",
            id: 2,
            method: "textDocument/hover",
            params: {
                position: { line: 2, character: 16 },
                textDocument: { uri: mainUri }
            }
        });
        const hoverResponse = await client.waitFor(hasId(2), "hover response");
        const hover = objectField(hoverResponse, "result");
        const hoverContents = objectField(hover, "contents");
        expect(stringField(hoverContents, "kind")).toBe("markdown");
        expect(stringField(hoverContents, "value")).toContain("definedHelper");
        expect(hover["range"]).toEqual({
            start: { line: 2, character: 15 },
            end: { line: 2, character: 28 }
        });

        client.send({
            jsonrpc: "2.0",
            id: 3,
            method: "textDocument/definition",
            params: {
                position: { line: 2, character: 16 },
                textDocument: { uri: mainUri }
            }
        });
        const definitionResponse = await client.waitFor(hasId(3), "definition response");
        const definitions = arrayField(definitionResponse, "result").filter(isJsonObject);
        expect(definitions).toContainEqual({
            uri: libraryUri,
            range: {
                start: { line: 0, character: 16 },
                end: { line: 0, character: 29 }
            }
        });

        client.send({
            jsonrpc: "2.0",
            id: 4,
            method: "textDocument/codeAction",
            params: {
                context: {
                    diagnostics,
                    only: ["quickfix"]
                },
                range: diagnostic?.["range"],
                textDocument: { uri: mainUri }
            }
        });
        const actionResponse = await client.waitFor(hasId(4), "codeAction response");
        const actions = arrayField(actionResponse, "result").filter(isJsonObject);
        const importAction = actions.find((action) =>
            stringField(action, "title").includes("Update import"));
        expect(importAction).toBeDefined();
        expect(stringField(importAction, "kind")).toBe("quickfix");
        const changes = objectField(objectField(importAction, "edit"), "changes");
        const edits = arrayField(changes, mainUri).filter(isJsonObject);
        expect(edits.length).toBeGreaterThan(0);
        expect(edits.some((edit) => stringField(edit, "newText").includes("missingHelper")))
            .toBe(true);

        client.send({
            jsonrpc: "2.0",
            id: 5,
            method: "shutdown",
            params: null
        });
        const shutdown = await client.waitFor(hasId(5), "shutdown response");
        expect(shutdown["result"]).toBeNull();
        client.send({
            jsonrpc: "2.0",
            method: "exit",
            params: null
        });

        expect(await client.closed).toBe(0);
        client.verifyFraming();
        expect(client.stderr()).toBe("");
        expect(client.messages.filter((message) =>
            stringField(message, "method") === "textDocument/publishDiagnostics" &&
            stringField(objectField(message, "params"), "uri") === mainUri))
            .toHaveLength(1);
        for (const id of [1, 2, 3, 4, 5]) {
            expect(client.messages.filter((message) => message["id"] === id)).toHaveLength(1);
        }
    }, 20_000);

    test("publishes deduplicated document-local policy findings with exact UTF-16 ranges", async () => {
        const workspace = await createWorkspace();
        const mainPath = join(workspace, "main.ts");
        const mainUri = pathToFileURL(mainPath).href;
        const source = [
            "const ocean = \"🌊\"; const generated = new Function(\"return 1\");",
            "void ocean; void generated;",
            ""
        ].join("\n");
        await writeFile(mainPath, source, "utf8");
        const client = createClient(workspace);

        client.send({
            jsonrpc: "2.0",
            id: 10,
            method: "initialize",
            params: {
                initializationOptions: {
                    tsconfigPath: "tsconfig.json"
                },
                rootUri: pathToFileURL(workspace).href
            }
        });
        await client.waitFor(hasId(10), "policy initialize response");
        client.send({
            jsonrpc: "2.0",
            method: "textDocument/didOpen",
            params: {
                textDocument: {
                    languageId: "typescript",
                    text: source,
                    uri: mainUri,
                    version: 1
                }
            }
        });

        const publication = await client.waitFor((message): boolean =>
            stringField(message, "method") === "textDocument/publishDiagnostics" &&
            stringField(objectField(message, "params"), "uri") === mainUri,
        "policy publishDiagnostics notification");
        const diagnostics = arrayField(objectField(publication, "params"), "diagnostics")
            .filter(isJsonObject);
        const policyDiagnostics = diagnostics.filter((diagnostic) =>
            diagnostic["source"] === "typesea-policy" &&
            diagnostic["code"] === "dynamic-code-sink");
        expect(policyDiagnostics).toHaveLength(1);

        const start = source.indexOf("new Function");
        const policyDiagnostic = policyDiagnostics[0];
        expect(policyDiagnostic).toMatchObject({
            code: "dynamic-code-sink",
            severity: 2,
            source: "typesea-policy",
            range: {
                start: { line: 0, character: start },
                end: { line: 0, character: start + "new Function".length }
            }
        });
        expect(stringField(policyDiagnostic, "message")).toContain("help:");
        expect(stringField(objectField(policyDiagnostic, "data"), "remediation"))
            .toContain("statically typed");
        expect(Buffer.byteLength(source.slice(0, start), "utf8")).toBeGreaterThan(start);

        const correctedSource = [
            "const ocean = \"🌊\"; const generated = (): number => 1;",
            "void ocean; void generated;",
            ""
        ].join("\n");
        client.send({
            jsonrpc: "2.0",
            method: "textDocument/didChange",
            params: {
                contentChanges: [{ text: correctedSource }],
                textDocument: {
                    uri: mainUri,
                    version: 2
                }
            }
        });
        const correctedPublication = await client.waitFor((message): boolean => {
            if (stringField(message, "method") !== "textDocument/publishDiagnostics") {
                return false;
            }
            const params = objectField(message, "params");
            return params["version"] === 2 && stringField(params, "uri") === mainUri;
        }, "corrected policy publishDiagnostics notification");
        const correctedDiagnostics = arrayField(
            objectField(correctedPublication, "params"),
            "diagnostics"
        ).filter(isJsonObject);
        expect(correctedDiagnostics.some((diagnostic) =>
            diagnostic["source"] === "typesea-policy" &&
            diagnostic["code"] === "dynamic-code-sink"))
            .toBe(false);

        client.send({
            jsonrpc: "2.0",
            id: 11,
            method: "shutdown",
            params: null
        });
        await client.waitFor(hasId(11), "policy shutdown response");
        client.send({
            jsonrpc: "2.0",
            method: "exit",
            params: null
        });
        expect(await client.closed).toBe(0);
        client.verifyFraming();
        expect(client.stderr()).toBe("");
    });

    test("publishes AST-backed unsafe type escapes and ReDoS risks at exact UTF-16 spans", async () => {
        const workspace = await createWorkspace();
        const mainPath = join(workspace, "main.ts");
        const mainUri = pathToFileURL(mainPath).href;
        const unsafeTypeName = ["an", "y"].join("");
        const assertionEscapeKind = ["as", unsafeTypeName].join("-");
        const explicitEscapeKind = ["explicit", unsafeTypeName].join("-");
        const firstLine = `const ocean = "🌊"; const casted = ocean as ${unsafeTypeName}; const literalRisk = /^(a+)+$/;`;
        const constructorLine = "const constructorRisk = new RegExp(\"^(a|aa)+$\");";
        const source = [
            firstLine,
            `const explicit: ${unsafeTypeName} = ocean;`,
            "const doubled = 1 as unknown as string; const forged: number = \"not a number\" as never;",
            "const maybe: string | undefined = Math.random() > 0.5 ? ocean : undefined; const certain = maybe!; const safeNonNull = ocean!; const safeDouble = ocean as string as string;",
            "const parsed = JSON.parse(\"\\\"ok\\\"\"); const retained: unknown = JSON.parse(\"{}\"); JSON.parse(\"{}\");",
            constructorLine,
            "const staticPattern = \"^(b+)+$\"; const aliasRisk = new RegExp(staticPattern); const globalRisk = new globalThis.RegExp(\"^(c+)+$\"); const boundedRisk = /(a|aa){10}$/; const semanticRisk = /(a|[a-z])+$/; const classOverlapRisk = /(\\d|\\w)+$/;",
            `const inert = "as ${unsafeTypeName} /^(a+)+$/"; // as ${unsafeTypeName} /^(a+)+$/`,
            "const safeRegex = /^\\d+$/; const safeAlternation = /^(?:cat|dog)+$/; const safeFixed = /^(a{2})+$/; const safeOptional = /^(\\d+)?$/; const safeDisjoint = /^\\s+\\S+$/; const safeClasses = /^[A-Z]+[0-9]+$/;",
            "function localConstructor(RegExp: (pattern: string) => string): string { return RegExp(\"^(x+)+$\"); }",
            "void casted; void explicit; void doubled; void forged; void certain; void safeNonNull; void safeDouble; void parsed; void retained;",
            "void literalRisk; void constructorRisk; void aliasRisk; void globalRisk; void boundedRisk; void semanticRisk; void classOverlapRisk;",
            "void inert; void safeRegex; void safeAlternation; void safeFixed; void safeOptional; void safeDisjoint; void safeClasses;",
            "void localConstructor;",
            ""
        ].join("\n");
        await writeFile(mainPath, source, "utf8");
        const client = createClient(workspace);

        client.send({
            jsonrpc: "2.0",
            id: 20,
            method: "initialize",
            params: {
                initializationOptions: {
                    tsconfigPath: "tsconfig.json"
                },
                rootUri: pathToFileURL(workspace).href
            }
        });
        await client.waitFor(hasId(20), "AST policy initialize response");
        client.send({
            jsonrpc: "2.0",
            method: "textDocument/didOpen",
            params: {
                textDocument: {
                    languageId: "typescript",
                    text: source,
                    uri: mainUri,
                    version: 1
                }
            }
        });

        const publication = await client.waitFor((message): boolean =>
            stringField(message, "method") === "textDocument/publishDiagnostics" &&
            stringField(objectField(message, "params"), "uri") === mainUri,
        "AST policy publishDiagnostics notification");
        const diagnostics = arrayField(objectField(publication, "params"), "diagnostics")
            .filter(isJsonObject);
        const typeEscapes = diagnostics.filter((diagnostic) =>
            diagnostic["source"] === "typesea-policy" &&
            diagnostic["code"] === "types.unsafe-escape");
        const regexRisks = diagnostics.filter((diagnostic) =>
            diagnostic["source"] === "typesea-policy" &&
            diagnostic["code"] === "security.redos-risk");

        expect(typeEscapes.map((diagnostic) =>
            stringField(objectField(diagnostic, "data"), "escapeKind")).sort())
            .toEqual([
                assertionEscapeKind,
                "as-never",
                "double-assertion",
                explicitEscapeKind,
                "json-parse",
                "non-null-assertion"
            ]);
        expect(regexRisks).toHaveLength(7);
        expect(regexRisks.map((diagnostic) =>
            Number(objectField(diagnostic, "range")["start"] === undefined
                ? -1
                : objectField(objectField(diagnostic, "range"), "start")["line"])).sort((left, right) => left - right))
            .toEqual([0, 5, 6, 6, 6, 6, 6]);

        const unsafeStart = firstLine.indexOf(unsafeTypeName);
        const unsafeAssertion = typeEscapes.find((diagnostic) =>
            stringField(objectField(diagnostic, "data"), "escapeKind") === assertionEscapeKind);
        expect(unsafeAssertion?.["range"]).toEqual({
            start: { line: 0, character: unsafeStart },
            end: { line: 0, character: unsafeStart + unsafeTypeName.length }
        });
        expect(Buffer.byteLength(firstLine.slice(0, unsafeStart), "utf8")).toBeGreaterThan(unsafeStart);

        const sourceLines = source.split("\n");
        const doubleText = "1 as unknown as string";
        const doubleStart = sourceLines[2]?.indexOf(doubleText) ?? -1;
        const doubleAssertion = typeEscapes.find((diagnostic) =>
            stringField(objectField(diagnostic, "data"), "escapeKind") === "double-assertion");
        expect(doubleAssertion?.["range"]).toEqual({
            start: { line: 2, character: doubleStart },
            end: { line: 2, character: doubleStart + doubleText.length }
        });

        const nonNullStart = sourceLines[3]?.indexOf("maybe!") ?? -1;
        const nonNullAssertion = typeEscapes.find((diagnostic) =>
            stringField(objectField(diagnostic, "data"), "escapeKind") === "non-null-assertion");
        expect(nonNullAssertion?.["range"]).toEqual({
            start: { line: 3, character: nonNullStart + "maybe".length },
            end: { line: 3, character: nonNullStart + "maybe!".length }
        });

        const jsonStart = sourceLines[4]?.indexOf("JSON.parse") ?? -1;
        const jsonEscape = typeEscapes.find((diagnostic) =>
            stringField(objectField(diagnostic, "data"), "escapeKind") === "json-parse");
        expect(jsonEscape?.["range"]).toEqual({
            start: { line: 4, character: jsonStart },
            end: { line: 4, character: jsonStart + "JSON.parse".length }
        });

        const literalStart = firstLine.indexOf("/^(a+)+$/");
        const literalRisk = regexRisks.find((diagnostic) =>
            stringField(objectField(diagnostic, "data"), "construction") === "literal");
        expect(literalRisk?.["range"]).toEqual({
            start: { line: 0, character: literalStart },
            end: { line: 0, character: literalStart + "/^(a+)+$/".length }
        });

        const constructorStart = constructorLine.indexOf("\"^(a|aa)+$\"");
        const constructorRisk = regexRisks.find((diagnostic) =>
            stringField(objectField(diagnostic, "data"), "construction") === "constructor");
        expect(constructorRisk?.["range"]).toEqual({
            start: { line: 5, character: constructorStart },
            end: { line: 5, character: constructorStart + "\"^(a|aa)+$\"".length }
        });
        expect(stringField(literalRisk, "message")).toContain("help:");
        expect(stringField(objectField(literalRisk, "data"), "remediation"))
            .toContain("nested or overlapping repetition");

        const policyKeys = [...typeEscapes, ...regexRisks].map((diagnostic) =>
            `${String(diagnostic["code"])}:${JSON.stringify(diagnostic["range"])}`);
        expect(new Set(policyKeys).size).toBe(policyKeys.length);

        client.send({
            jsonrpc: "2.0",
            id: 21,
            method: "shutdown",
            params: null
        });
        await client.waitFor(hasId(21), "AST policy shutdown response");
        client.send({
            jsonrpc: "2.0",
            method: "exit",
            params: null
        });
        expect(await client.closed).toBe(0);
        client.verifyFraming();
        expect(client.stderr()).toBe("");
    });

    test.each([
        {
            configText: "{\n  \"compilerOptions\": { \"strict\": true },\n",
            expectedDiagnostic: /TS\d+:/u,
            label: "malformed JSON"
        },
        {
            configText: `${JSON.stringify({
                compilerOptions: {
                    target: "definitely-not-a-typescript-target"
                },
                include: ["*.ts"]
            }, null, 4)}\n`,
            expectedDiagnostic: /TS6046:/u,
            label: "invalid compiler option"
        }
    ])("rejects $label tsconfig instead of silently using inferred options", async ({
        configText,
        expectedDiagnostic
    }) => {
        const workspace = await createWorkspace();
        await writeFile(join(workspace, "tsconfig.json"), configText, "utf8");
        const client = createClient(workspace);
        client.send({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                initializationOptions: {
                    tsconfigPath: "tsconfig.json"
                },
                rootUri: pathToFileURL(workspace).href
            }
        });

        const response = await client.waitFor(hasId(1), "invalid-config initialize error");
        const error = objectField(response, "error");
        expect(error["code"]).toBe(-32001);
        expect(stringField(error, "message")).toContain("Invalid TypeScript project configuration");
        expect(stringField(error, "message")).toMatch(expectedDiagnostic);

        client.send({
            jsonrpc: "2.0",
            method: "exit",
            params: null
        });
        expect(await client.closed).toBe(1);
        client.verifyFraming();
        expect(client.stderr()).toBe("");
    });

    test.each([
        {
            expectedError: "missing Content-Length header",
            frame: "Content-Type: application/vscode-jsonrpc; charset=utf-8\r\n\r\n{}",
            initializeFirst: false,
            label: "missing length"
        },
        {
            expectedError: "duplicate Content-Length header",
            frame: "Content-Length: 2\r\nContent-Length: 2\r\n\r\n{}",
            initializeFirst: true,
            label: "duplicate length"
        }
    ])("terminates immediately on a $label protocol frame", async ({
        expectedError,
        frame,
        initializeFirst
    }) => {
        const workspace = await createWorkspace();
        const client = createClient(workspace);
        if (initializeFirst) {
            client.send({
                jsonrpc: "2.0",
                id: 1,
                method: "initialize",
                params: {
                    initializationOptions: {
                        tsconfigPath: "tsconfig.json"
                    },
                    rootUri: pathToFileURL(workspace).href
                }
            });
            await client.waitFor(hasId(1), "protocol-test initialize response");
        }
        client.child.stdin.write(Buffer.from(frame, "ascii"));

        expect(await client.closed).toBe(1);
        expect(client.stderr()).toContain(expectedError);
        expect(client.messages).toHaveLength(initializeFirst ? 1 : 0);
    });
});

async function createWorkspace(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "typesea-lsp-"));
    temporaryRoots.push(root);
    await writeFile(join(root, "main.ts"), mainSource(), "utf8");
    await writeFile(join(root, "library.ts"), librarySource(), "utf8");
    await writeFile(join(root, "tsconfig.json"), `${JSON.stringify({
        compilerOptions: {
            module: "NodeNext",
            moduleResolution: "NodeNext",
            noEmit: true,
            strict: true,
            target: "ES2023"
        },
        include: ["*.ts"]
    }, null, 4)}\n`, "utf8");
    return root;
}

function mainSource(): string {
    return [
        "const ocean = \"🌊\"; const broken = missingHelper(1);",
        "import { definedHelper } from \"./library.js\";",
        "const result = definedHelper(1);",
        "void ocean; void broken; void result;",
        ""
    ].join("\n");
}

function librarySource(): string {
    return [
        "export function definedHelper(value: number): number { return value + 1; }",
        "export function missingHelper(value: number): number { return value - 1; }",
        ""
    ].join("\n");
}

function createClient(cwd: string): LspClient {
    const child = spawn(process.execPath, [lspPath], {
        cwd,
        env: {
            ...process.env,
            NO_COLOR: "1"
        },
        stdio: ["pipe", "pipe", "pipe"]
    });
    liveChildren.add(child);
    const messages: JsonObject[] = [];
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const waiters: Waiter[] = [];
    let pending = Buffer.alloc(0);
    let framingError = "";

    const closed = new Promise<number>((resolveClosed) => {
        child.on("close", (status): void => {
            liveChildren.delete(child);
            resolveClosed(status ?? -1);
        });
    });

    function rejectWaiters(message: string): void {
        framingError = message;
        while (waiters.length !== 0) {
            const waiter = waiters.pop();
            if (waiter !== undefined) {
                clearTimeout(waiter.timer);
                waiter.reject(new Error(message));
            }
        }
    }

    function dispatchMessage(message: JsonObject): void {
        messages.push(message);
        for (let index = waiters.length - 1; index >= 0; index -= 1) {
            const waiter = waiters[index];
            if (waiter?.predicate(message) === true) {
                waiters.splice(index, 1);
                clearTimeout(waiter.timer);
                waiter.resolve(message);
            }
        }
    }

    function readFrames(chunk: Buffer): void {
        stdoutChunks.push(chunk);
        pending = Buffer.concat([pending, chunk]);
        while (pending.length !== 0) {
            const boundary = pending.indexOf("\r\n\r\n");
            if (boundary < 0) {
                return;
            }
            const header = pending.subarray(0, boundary).toString("ascii");
            const match = /^Content-Length:\s*(\d+)\s*$/iu.exec(header);
            const lengthText = match?.[1];
            if (lengthText === undefined) {
                rejectWaiters(`invalid LSP response header: ${header}`);
                child.kill("SIGTERM");
                return;
            }
            const length = Number(lengthText);
            const bodyOffset = boundary + 4;
            if (pending.length < bodyOffset + length) {
                return;
            }
            const body = pending.subarray(bodyOffset, bodyOffset + length).toString("utf8");
            pending = pending.subarray(bodyOffset + length);
            const decoded: unknown = JSON.parse(body);
            if (!isJsonObject(decoded)) {
                rejectWaiters("LSP response body is not a JSON object");
                child.kill("SIGTERM");
                return;
            }
            dispatchMessage(decoded);
        }
    }

    child.stdout.on("data", readFrames);
    child.stderr.on("data", (chunk: Buffer): void => {
        stderrChunks.push(chunk);
    });
    child.on("error", (error): void => {
        rejectWaiters(`failed to launch LSP server: ${error.message}`);
    });

    return {
        child,
        closed,
        messages,
        send(message: JsonObject): void {
            const body = Buffer.from(JSON.stringify(message), "utf8");
            const header = Buffer.from(`Content-Length: ${String(body.length)}\r\n\r\n`, "ascii");
            child.stdin.write(Buffer.concat([header, body]));
        },
        stderr(): string {
            return Buffer.concat(stderrChunks).toString("utf8");
        },
        verifyFraming(): void {
            expect(framingError).toBe("");
            expect(pending.length).toBe(0);
            expect(Buffer.concat(stdoutChunks).toString("utf8")).toMatch(/^Content-Length:\s*\d+\r\n\r\n/u);
        },
        waitFor(predicate, description): Promise<JsonObject> {
            const existing = messages.find(predicate);
            if (existing !== undefined) {
                return Promise.resolve(existing);
            }
            return new Promise((resolveMessage, rejectMessage) => {
                const waiter: Waiter = {
                    predicate,
                    reject: rejectMessage,
                    resolve: resolveMessage,
                    timer: setTimeout((): void => {
                        const index = waiters.indexOf(waiter);
                        if (index >= 0) {
                            waiters.splice(index, 1);
                        }
                        rejectMessage(new Error(`timed out waiting for ${description}`));
                    }, 10_000)
                };
                waiters.push(waiter);
            });
        }
    };
}

function hasId(id: number): (message: JsonObject) => boolean {
    return (message): boolean => message["id"] === id;
}

function isJsonObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectField(value: JsonObject | undefined, key: string): JsonObject {
    const field = value?.[key];
    return isJsonObject(field) ? field : {};
}

function arrayField(value: JsonObject | undefined, key: string): readonly unknown[] {
    const field = value?.[key];
    return Array.isArray(field) ? field : [];
}

function stringField(value: JsonObject | undefined, key: string): string {
    const field = value?.[key];
    return typeof field === "string" ? field : "";
}
