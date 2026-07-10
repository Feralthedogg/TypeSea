#!/usr/bin/env node

import { existsSync, statSync, writeSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { analyzeDocument } from "./engine.mjs";

const JSON_RPC_VERSION = "2.0";
const MAX_HEADER_BYTES = 8 * 1024;
const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
const MAX_REGEX_POLICY_PATTERN_LENGTH = 32 * 1024;
const REGEX_ASCII_LIMIT = 128;
const REGEX_BOUNDED_REPEAT_RISK_THRESHOLD = 8;
const FILE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];
const EXCLUDED_DIRECTORIES = [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/coverage/**"
];
const UTF16_POSITION_ENCODING = "utf-16";

let input = Buffer.alloc(0);
let dispatchQueue = Promise.resolve();
let initialized = false;
let shutdownRequested = false;
let workspaceRoot = resolve(process.cwd());
let workspaceRealRoot = physicalPath(workspaceRoot) ?? workspaceRoot;
let projectVersion = 0;
let compilerOptions = inferredCompilerOptions();
let projectFiles = new Map();
let languageService;
let fatalProtocolFailure = false;

const openDocuments = new Map();

const languageServiceHost = {
    getCompilationSettings: () => compilerOptions,
    getCurrentDirectory: () => workspaceRoot,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    getDirectories: ts.sys.getDirectories,
    getNewLine: () => ts.sys.newLine,
    getProjectVersion: () => String(projectVersion),
    getScriptFileNames: () => scriptFileNames(),
    getScriptKind: (fileName) => scriptKind(fileName),
    getScriptSnapshot: (fileName) => scriptSnapshot(fileName),
    getScriptVersion: (fileName) => scriptVersion(fileName),
    readDirectory: ts.sys.readDirectory,
    readFile: ts.sys.readFile,
    directoryExists: ts.sys.directoryExists,
    fileExists: ts.sys.fileExists,
    realpath: ts.sys.realpath,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames
};

function inferredCompilerOptions() {
    return {
        allowJs: true,
        allowNonTsExtensions: true,
        checkJs: false,
        jsx: ts.JsxEmit.Preserve,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        target: ts.ScriptTarget.ES2023
    };
}

function canonicalPath(fileName) {
    const normalized = resolve(fileName);
    return ts.sys.useCaseSensitiveFileNames ? normalized : normalized.toLowerCase();
}

function absoluteProjectPath(fileName) {
    return isAbsolute(fileName) ? resolve(fileName) : resolve(workspaceRoot, fileName);
}

function scriptFileNames() {
    const files = new Map(projectFiles);
    for (const document of openDocuments.values()) {
        files.set(canonicalPath(document.fileName), document.fileName);
    }
    return [...files.values()];
}

function scriptSnapshot(fileName) {
    const document = openDocuments.get(canonicalPath(fileName));
    if (document !== undefined) {
        return ts.ScriptSnapshot.fromString(document.text);
    }

    const text = ts.sys.readFile(fileName);
    return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
}

function scriptVersion(fileName) {
    const document = openDocuments.get(canonicalPath(fileName));
    return document === undefined ? "0" : document.version;
}

function scriptKind(fileName) {
    const document = openDocuments.get(canonicalPath(fileName));
    const languageId = document?.languageId;
    if (languageId === "typescriptreact") {
        return ts.ScriptKind.TSX;
    }
    if (languageId === "javascriptreact") {
        return ts.ScriptKind.JSX;
    }
    if (languageId === "typescript") {
        return ts.ScriptKind.TS;
    }
    if (languageId === "javascript") {
        return ts.ScriptKind.JS;
    }
    switch (extname(fileName).toLowerCase()) {
        case ".ts":
        case ".mts":
        case ".cts":
            return ts.ScriptKind.TS;
        case ".tsx":
            return ts.ScriptKind.TSX;
        case ".js":
        case ".mjs":
        case ".cjs":
            return ts.ScriptKind.JS;
        case ".jsx":
            return ts.ScriptKind.JSX;
        case ".json":
            return ts.ScriptKind.JSON;
        default:
            return ts.ScriptKind.Unknown;
    }
}

function configureProject(parameters) {
    workspaceRoot = workspacePath(parameters);
    workspaceRealRoot = physicalPath(workspaceRoot) ?? workspaceRoot;
    const configured = configuredTsconfig(parameters);
    if (configured.error !== undefined) {
        return configured.error;
    }
    const configPath = configured.path ?? ts.findConfigFile(
        workspaceRoot,
        ts.sys.fileExists,
        "tsconfig.json"
    );

    if (configPath !== undefined) {
        let config;
        try {
            config = ts.readConfigFile(configPath, ts.sys.readFile);
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            return `Invalid TypeScript project configuration '${configPath}': ${detail}`;
        }
        if (config.error !== undefined) {
            return formatProjectConfigurationError(configPath, [config.error]);
        }

        let parsed;
        try {
            parsed = ts.parseJsonConfigFileContent(
                config.config,
                ts.sys,
                dirname(configPath),
                undefined,
                configPath
            );
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            return `Invalid TypeScript project configuration '${configPath}': ${detail}`;
        }
        if (parsed.errors.length > 0) {
            return formatProjectConfigurationError(configPath, parsed.errors);
        }
        compilerOptions = parsed.options;
        projectFiles = fileMap(parsed.fileNames);
    } else {
        compilerOptions = inferredCompilerOptions();
        projectFiles = discoverWorkspaceFiles();
    }

    projectVersion += 1;
    languageService?.dispose();
    languageService = ts.createLanguageService(
        languageServiceHost,
        ts.createDocumentRegistry(ts.sys.useCaseSensitiveFileNames, workspaceRoot)
    );
    return undefined;
}

function workspacePath(parameters) {
    const candidateUri = parameters?.workspaceFolders?.[0]?.uri ?? parameters?.rootUri;
    const uriPath = uriToFilePath(candidateUri);
    const candidate = uriPath ?? (
        typeof parameters?.rootPath === "string" ? resolve(parameters.rootPath) : process.cwd()
    );

    try {
        return statSync(candidate).isDirectory() ? resolve(candidate) : dirname(resolve(candidate));
    } catch {
        return resolve(candidate);
    }
}

function configuredTsconfig(parameters) {
    const configured = parameters?.initializationOptions?.tsconfigPath;
    if (typeof configured !== "string" || configured.length === 0) {
        return {};
    }

    const candidate = resolve(workspaceRoot, configured);
    if (!isPathInside(workspaceRoot, candidate)) {
        return {
            error: `Invalid TypeScript project configuration path '${configured}': path escapes the workspace.`
        };
    }
    if (!existsSync(candidate)) {
        return {
            error: `Invalid TypeScript project configuration path '${configured}': file does not exist.`
        };
    }
    try {
        if (!statSync(candidate).isFile()) {
            return {
                error: `Invalid TypeScript project configuration path '${configured}': path is not a file.`
            };
        }
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return {
            error: `Invalid TypeScript project configuration path '${configured}': ${detail}`
        };
    }
    const physical = physicalPath(candidate);
    if (
        physical === undefined ||
        !isPathInside(canonicalPath(workspaceRealRoot), canonicalPath(physical))
    ) {
        return {
            error: `Invalid TypeScript project configuration path '${configured}': symlink target escapes the workspace.`
        };
    }
    return { path: candidate };
}

function formatProjectConfigurationError(configPath, diagnostics) {
    const details = diagnostics.map((diagnostic) => {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
        if (diagnostic.file === undefined || diagnostic.start === undefined) {
            return `TS${String(diagnostic.code)}: ${message}`;
        }
        const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
        const path = relative(workspaceRoot, diagnostic.file.fileName).replaceAll("\\", "/");
        return `${path}:${String(position.line + 1)}:${String(position.character + 1)} TS${String(diagnostic.code)}: ${message}`;
    });
    return [
        `Invalid TypeScript project configuration '${configPath}'.`,
        ...details
    ].join("\n");
}

function discoverWorkspaceFiles() {
    const files = ts.sys.readDirectory(
        workspaceRoot,
        FILE_EXTENSIONS,
        EXCLUDED_DIRECTORIES,
        ["**/*"]
    );
    return fileMap(files);
}

function fileMap(fileNames) {
    return new Map(fileNames.map((fileName) => {
        const absolute = resolve(fileName);
        return [canonicalPath(absolute), absolute];
    }));
}

function isPathInside(parent, candidate) {
    const pathFromParent = relative(parent, candidate);
    return pathFromParent === "" || (
        pathFromParent !== ".." &&
        !pathFromParent.startsWith(`..${sep}`) &&
        !isAbsolute(pathFromParent)
    );
}

function physicalPath(fileName) {
    try {
        return ts.sys.realpath?.(fileName) ?? resolve(fileName);
    } catch {
        return undefined;
    }
}

function isWorkspaceEditPath(fileName) {
    const absolute = resolve(fileName);
    if (!isPathInside(canonicalPath(workspaceRoot), canonicalPath(absolute))) {
        return false;
    }

    if (!existsSync(absolute)) {
        return openDocuments.has(canonicalPath(absolute));
    }
    const physical = physicalPath(absolute);
    return physical !== undefined && isPathInside(
        canonicalPath(workspaceRealRoot),
        canonicalPath(physical)
    );
}

function uriToFilePath(uri) {
    if (typeof uri !== "string") {
        return undefined;
    }
    try {
        const parsed = new URL(uri);
        return parsed.protocol === "file:" ? resolve(fileURLToPath(parsed)) : undefined;
    } catch {
        return undefined;
    }
}

function documentTarget(uri) {
    const fileName = uriToFilePath(uri);
    if (fileName === undefined) {
        return undefined;
    }

    const key = canonicalPath(fileName);
    if (!isPathInside(workspaceRoot, fileName) && !projectFiles.has(key)) {
        return undefined;
    }
    return { fileName, key };
}

function documentUri(fileName) {
    const absolute = absoluteProjectPath(fileName);
    return openDocuments.get(canonicalPath(absolute))?.uri ?? pathToFileURL(absolute).href;
}

function send(message) {
    const body = Buffer.from(JSON.stringify(message), "utf8");
    const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii");
    process.stdout.write(Buffer.concat([header, body]));
}

function sendResult(id, result) {
    send({ jsonrpc: JSON_RPC_VERSION, id, result });
}

function sendError(id, code, message) {
    send({ jsonrpc: JSON_RPC_VERSION, id, error: { code, message } });
}

function notify(method, params) {
    send({ jsonrpc: JSON_RPC_VERSION, method, params });
}

function readMessages(chunk) {
    input = Buffer.concat([input, chunk]);
    while (input.length > 0) {
        const boundary = headerBoundary(input);
        if (boundary === undefined) {
            if (input.length > MAX_HEADER_BYTES) {
                fatalProtocolError("message header is too large");
            }
            return;
        }
        if (boundary.offset > MAX_HEADER_BYTES) {
            fatalProtocolError("message header is too large");
            return;
        }

        const header = input.subarray(0, boundary.offset).toString("ascii");
        const parsedHeader = parseMessageHeader(header);
        if (parsedHeader.error !== undefined) {
            fatalProtocolError(parsedHeader.error);
            return;
        }

        const length = parsedHeader.length;
        if (!Number.isSafeInteger(length) || length < 0 || length > MAX_MESSAGE_BYTES) {
            fatalProtocolError("invalid Content-Length header");
            return;
        }

        const bodyStart = boundary.offset + boundary.length;
        if (input.length < bodyStart + length) {
            return;
        }

        const body = input.subarray(bodyStart, bodyStart + length).toString("utf8");
        input = input.subarray(bodyStart + length);
        let message;
        try {
            message = JSON.parse(body);
        } catch {
            sendError(null, -32700, "Parse error");
            continue;
        }

        dispatchQueue = dispatchQueue
            .then(() => dispatch(message))
            .catch(() => {
                if (Object.hasOwn(message, "id")) {
                    sendError(message.id, -32603, "Internal error");
                }
            });
    }
}

function parseMessageHeader(header) {
    let contentLength;
    for (const line of header.split(/\r?\n/u)) {
        const separator = line.indexOf(":");
        if (separator <= 0) {
            return { error: "malformed message header" };
        }
        const name = line.slice(0, separator).trim().toLowerCase();
        const value = line.slice(separator + 1).trim();
        if (name !== "content-length") {
            continue;
        }
        if (contentLength !== undefined) {
            return { error: "duplicate Content-Length header" };
        }
        if (!/^\d+$/u.test(value)) {
            return { error: "invalid Content-Length header" };
        }
        contentLength = Number(value);
    }
    return contentLength === undefined
        ? { error: "missing Content-Length header" }
        : { length: contentLength };
}

function headerBoundary(buffer) {
    const crlf = buffer.indexOf("\r\n\r\n");
    if (crlf >= 0) {
        return { offset: crlf, length: 4 };
    }
    const lf = buffer.indexOf("\n\n");
    return lf >= 0 ? { offset: lf, length: 2 } : undefined;
}

function fatalProtocolError(message) {
    if (fatalProtocolFailure) {
        return;
    }
    fatalProtocolFailure = true;
    languageService?.dispose();
    process.stdin.removeAllListeners();
    process.stdin.destroy();
    try {
        writeSync(process.stderr.fd, `[typesea-lsp] ${message}\n`);
    } finally {
        process.exit(1);
    }
}

async function dispatch(message) {
    if (message === null || typeof message !== "object" || message.jsonrpc !== JSON_RPC_VERSION) {
        sendError(Object.hasOwn(message ?? {}, "id") ? message.id : null, -32600, "Invalid Request");
        return;
    }

    const isRequest = Object.hasOwn(message, "id");
    const id = message.id;
    const method = message.method;

    if (method === "initialize" && isRequest) {
        const configurationError = configureProject(message.params ?? {});
        if (configurationError !== undefined) {
            sendError(id, -32001, configurationError);
            return;
        }
        initialized = true;
        sendResult(id, initializeResult());
        return;
    }
    if (method === "exit" && !isRequest) {
        languageService?.dispose();
        process.exit(shutdownRequested ? 0 : 1);
    }
    if (!initialized) {
        if (isRequest) {
            sendError(id, -32002, "Server not initialized");
        }
        return;
    }
    if (method === "shutdown" && isRequest) {
        shutdownRequested = true;
        sendResult(id, null);
        return;
    }
    if (shutdownRequested) {
        if (isRequest) {
            sendError(id, -32600, "Server has shut down");
        }
        return;
    }

    switch (method) {
        case "initialized":
        case "$/cancelRequest":
            return;
        case "textDocument/didOpen":
            didOpen(message.params);
            return;
        case "textDocument/didChange":
            didChange(message.params);
            return;
        case "textDocument/didClose":
            didClose(message.params);
            return;
        case "textDocument/codeAction":
            if (isRequest) {
                sendResult(id, codeActions(message.params));
            }
            return;
        case "textDocument/definition":
            if (isRequest) {
                sendResult(id, definitions(message.params));
            }
            return;
        case "textDocument/hover":
            if (isRequest) {
                sendResult(id, hover(message.params));
            }
            return;
        default:
            if (isRequest) {
                sendError(id, -32601, "Method not found");
            }
    }
}

function initializeResult() {
    return {
        capabilities: {
            codeActionProvider: {
                codeActionKinds: ["quickfix"],
                resolveProvider: false
            },
            definitionProvider: true,
            hoverProvider: true,
            positionEncoding: UTF16_POSITION_ENCODING,
            textDocumentSync: {
                change: 1,
                openClose: true
            }
        },
        serverInfo: {
            name: "TypeSea TypeScript Language Server",
            version: "1.0.0"
        }
    };
}

function didOpen(parameters) {
    const textDocument = parameters?.textDocument;
    const target = documentTarget(textDocument?.uri);
    if (target === undefined || typeof textDocument?.text !== "string") {
        return;
    }

    openDocuments.set(target.key, {
        fileName: target.fileName,
        languageId: textDocument.languageId,
        text: textDocument.text,
        uri: textDocument.uri,
        version: String(textDocument.version ?? 0)
    });
    projectVersion += 1;
    publishDiagnostics(target.fileName);
}

function didChange(parameters) {
    const textDocument = parameters?.textDocument;
    const target = documentTarget(textDocument?.uri);
    const current = target === undefined ? undefined : openDocuments.get(target.key);
    if (target === undefined || current === undefined || !Array.isArray(parameters?.contentChanges)) {
        return;
    }

    let text = current.text;
    for (const change of parameters.contentChanges) {
        if (typeof change?.text !== "string") {
            continue;
        }
        if (change.range === undefined) {
            text = change.text;
        } else {
            const start = offsetAt(text, change.range.start);
            const end = offsetAt(text, change.range.end);
            text = text.slice(0, Math.min(start, end)) + change.text + text.slice(Math.max(start, end));
        }
    }

    openDocuments.set(target.key, {
        ...current,
        text,
        version: String(textDocument.version ?? Number(current.version) + 1)
    });
    projectVersion += 1;
    publishDiagnostics(target.fileName);
}

function didClose(parameters) {
    const target = documentTarget(parameters?.textDocument?.uri);
    if (target === undefined) {
        return;
    }

    openDocuments.delete(target.key);
    projectVersion += 1;
    notify("textDocument/publishDiagnostics", {
        uri: parameters.textDocument.uri,
        diagnostics: []
    });
}

function offsetAt(text, position) {
    const requestedLine = nonNegativeInteger(position?.line);
    const requestedCharacter = nonNegativeInteger(position?.character);
    let line = 0;
    let offset = 0;

    while (line < requestedLine && offset < text.length) {
        const character = text.charCodeAt(offset);
        offset += 1;
        if (character === 13) {
            if (text.charCodeAt(offset) === 10) {
                offset += 1;
            }
            line += 1;
        } else if (character === 10 || character === 0x2028 || character === 0x2029) {
            line += 1;
        }
    }

    let lineEnd = offset;
    while (lineEnd < text.length) {
        const character = text.charCodeAt(lineEnd);
        if (character === 10 || character === 13 || character === 0x2028 || character === 0x2029) {
            break;
        }
        lineEnd += 1;
    }
    return Math.min(offset + requestedCharacter, lineEnd);
}

function nonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0 ? value : 0;
}

function publishDiagnostics(fileName) {
    const diagnostics = mergePublishedDiagnostics([
        ...collectDiagnostics(fileName).map(toLspDiagnostic),
        ...collectPolicyDiagnostics(fileName)
    ]);
    const document = openDocuments.get(canonicalPath(fileName));
    const parameters = {
        uri: documentUri(fileName),
        diagnostics
    };
    const version = Number(document?.version);
    if (Number.isInteger(version)) {
        parameters.version = version;
    }
    notify("textDocument/publishDiagnostics", parameters);
}

function collectPolicyDiagnostics(fileName) {
    const key = canonicalPath(fileName);
    const text = openDocuments.get(key)?.text ?? ts.sys.readFile(fileName);
    if (text === undefined) {
        return [];
    }
    const path = relative(workspaceRoot, fileName).replaceAll("\\", "/");
    if (path === "" || path === ".." || path.startsWith("../")) {
        return [];
    }

    const diagnostics = collectAstPolicyDiagnostics(fileName, text);
    try {
        const findings = analyzeDocument(path, text);
        diagnostics.push(...findings
            .filter((finding) => finding?.suppressed !== true && typeof finding?.rule === "string")
            .map((finding) => toPolicyDiagnostic(finding, text)));
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        diagnostics.push({
            code: "policy-analysis-failed",
            data: {
                remediation: "Fix the analyzer failure before relying on editor policy results."
            },
            message: `TypeSea policy analysis failed: ${detail}\nhelp: Fix the analyzer failure before relying on editor policy results.`,
            range: zeroRange(),
            severity: 1,
            source: "typesea-policy"
        });
    }

    const unique = new Map();
    for (const diagnostic of diagnostics) {
        const key = [
            diagnostic.code,
            diagnostic.severity,
            diagnostic.range.start.line,
            diagnostic.range.start.character,
            diagnostic.range.end.line,
            diagnostic.range.end.character
        ].join(":");
        if (!unique.has(key)) {
            unique.set(key, diagnostic);
        }
    }
    return [...unique.values()];
}

function collectAstPolicyDiagnostics(fileName, text) {
    let program;
    try {
        program = languageService.getProgram();
    } catch (error) {
        return [astPolicyFailureDiagnostic(error)];
    }
    if (program === undefined) {
        return [astPolicyFailureDiagnostic("TypeScript Program is unavailable")];
    }
    const sourceFile = programSourceFile(program, fileName);
    if (sourceFile === undefined || sourceFile.text !== text) {
        return [astPolicyFailureDiagnostic(
            sourceFile === undefined
                ? "the open document SourceFile is unavailable"
                : "the open document SourceFile is stale"
        )];
    }

    let checker;
    try {
        checker = program.getTypeChecker();
    } catch (error) {
        return [astPolicyFailureDiagnostic(error)];
    }
    const findings = [];
    const failures = new Map();
    const visit = (node) => {
        if (!failures.has("types.unsafe-escape")) {
            try {
                const typeEscape = typeEscapeFinding(node, sourceFile, checker, program);
                if (typeEscape !== undefined) {
                    findings.push(typeEscape);
                }
            } catch (error) {
                failures.set("types.unsafe-escape", error);
            }
        }
        if (!failures.has("security.redos-risk")) {
            try {
                const regexRisk = regexRiskFinding(node, sourceFile, checker, program);
                if (regexRisk !== undefined) {
                    findings.push(regexRisk);
                }
            } catch (error) {
                failures.set("security.redos-risk", error);
            }
        }
        ts.forEachChild(node, visit);
    };
    try {
        visit(sourceFile);
    } catch (error) {
        failures.set("policy-ast-traversal", error);
    }
    return [
        ...findings.map((finding) => toPolicyDiagnostic(finding, text)),
        ...[...failures].map(([rule, error]) => astRuleFailureDiagnostic(rule, error))
    ];
}

function programSourceFile(program, fileName) {
    const absolute = absoluteProjectPath(fileName);
    const direct = program.getSourceFile(absolute);
    if (direct !== undefined) {
        return direct;
    }
    const key = canonicalPath(absolute);
    return program.getSourceFiles().find((file) => canonicalPath(file.fileName) === key);
}

function astPolicyFailureDiagnostic(error) {
    const detail = error instanceof Error ? error.message : String(error);
    const remediation = "Restore the TypeScript Program before relying on AST policy diagnostics.";
    return {
        code: "policy-ast-unavailable",
        data: {
            analysisBasis: "typescript-program",
            remediation
        },
        message: `TypeSea AST policy analysis failed: ${detail}\nhelp: ${remediation}`,
        range: zeroRange(),
        severity: 1,
        source: "typesea-policy"
    };
}

function astRuleFailureDiagnostic(rule, error) {
    const detail = error instanceof Error ? error.message : String(error);
    const remediation = `Fix the ${rule} AST rule before relying on its editor diagnostics.`;
    return {
        code: `${rule}.analysis-failed`,
        data: {
            analysisBasis: "typescript-program-ast",
            remediation,
            rule
        },
        message: `TypeSea AST rule '${rule}' failed: ${detail}\nhelp: ${remediation}`,
        range: zeroRange(),
        severity: 1,
        source: "typesea-policy"
    };
}

function typeEscapeFinding(node, sourceFile, checker, program) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
        const escapeKind = isAssertionTypeNode(node) ? "as-any" : "explicit-any";
        return astPolicyFinding({
            confidence: "high",
            details: { escapeKind },
            message: escapeKind === "as-any"
                ? "An 'as any' assertion bypasses TypeChecker assignability guarantees at this boundary."
                : "An explicit 'any' type disables TypeChecker guarantees at this boundary.",
            node,
            precision: "high",
            rule: "types.unsafe-escape",
            severity: "warning",
            sourceFile,
            title: "Unchecked type escape weakens TypeChecker guarantees."
        });
    }

    if (node.kind === ts.SyntaxKind.NeverKeyword && isAssertionTypeNode(node)) {
        return astPolicyFinding({
            confidence: "high",
            details: { escapeKind: "as-never" },
            message: "An 'as never' assertion forges an impossible type and can satisfy unrelated target types without evidence.",
            node,
            precision: "high",
            rule: "types.unsafe-escape",
            severity: "warning",
            sourceFile,
            title: "Unchecked type escape weakens TypeChecker guarantees."
        });
    }

    if (
        isAssertionExpression(node) &&
        isDoubleAssertion(node) &&
        !hasOuterAssertion(node) &&
        isUnsafeDoubleAssertion(node, checker)
    ) {
        return astPolicyFinding({
            confidence: "high",
            details: { escapeKind: "double-assertion" },
            message: "A chained type assertion bypasses the normal assignability relationship between the source and target types.",
            node,
            precision: "high",
            rule: "types.unsafe-escape",
            severity: "warning",
            sourceFile,
            title: "Unchecked type escape weakens TypeChecker guarantees."
        });
    }

    if (
        ts.isNonNullExpression(node) &&
        typeMayIncludeNullish(checker.getTypeAtLocation(node.expression), checker)
    ) {
        return astPolicyFinding({
            confidence: "high",
            details: { escapeKind: "non-null-assertion" },
            end: node.end,
            message: "A non-null assertion suppresses a possible null or undefined value without a runtime proof.",
            node,
            precision: "high",
            rule: "types.unsafe-escape",
            severity: "warning",
            sourceFile,
            start: Math.max(node.getStart(sourceFile), node.end - 1),
            title: "Unchecked type escape weakens TypeChecker guarantees."
        });
    }

    if (
        isGlobalJsonParseCall(node, checker, program) &&
        jsonParseResultEscapes(node, checker)
    ) {
        return astPolicyFinding({
            confidence: "high",
            details: { escapeKind: "json-parse" },
            message: "JSON.parse returns unchecked data; validate an unknown value before treating it as a domain type.",
            node: node.expression,
            precision: "high",
            rule: "types.unsafe-escape",
            severity: "warning",
            sourceFile,
            title: "Unchecked type escape weakens TypeChecker guarantees."
        });
    }
    return undefined;
}

function isAssertionTypeNode(node) {
    const parent = node.parent;
    return parent !== undefined && isAssertionExpression(parent) && parent.type === node;
}

function isAssertionExpression(node) {
    return ts.isAsExpression(node) || ts.isTypeAssertionExpression(node);
}

function unwrapParentheses(node) {
    let current = node;
    while (ts.isParenthesizedExpression(current)) {
        current = current.expression;
    }
    return current;
}

function isDoubleAssertion(node) {
    return isAssertionExpression(unwrapParentheses(node.expression));
}

function isUnsafeDoubleAssertion(node, checker) {
    let source = unwrapParentheses(node.expression);
    while (isAssertionExpression(source)) {
        source = unwrapParentheses(source.expression);
    }
    const sourceType = checker.getTypeAtLocation(source);
    const targetType = checker.getTypeFromTypeNode(node.type);
    return !checker.isTypeAssignableTo(sourceType, targetType) &&
        !checker.isTypeAssignableTo(targetType, sourceType);
}

function typeMayIncludeNullish(type, checker, seen = new Set()) {
    if (seen.has(type)) {
        return false;
    }
    seen.add(type);
    if ((type.flags & (
        ts.TypeFlags.Any |
        ts.TypeFlags.Unknown |
        ts.TypeFlags.Undefined |
        ts.TypeFlags.Null |
        ts.TypeFlags.Void
    )) !== 0) {
        return true;
    }
    if (type.isUnion()) {
        return type.types.some((part) => typeMayIncludeNullish(part, checker, seen));
    }
    if ((type.flags & ts.TypeFlags.TypeParameter) !== 0) {
        const constraint = checker.getBaseConstraintOfType(type);
        return constraint === undefined || typeMayIncludeNullish(constraint, checker, seen);
    }
    return false;
}

function hasOuterAssertion(node) {
    let current = node;
    let parent = current.parent;
    while (parent !== undefined && ts.isParenthesizedExpression(parent)) {
        current = parent;
        parent = parent.parent;
    }
    return parent !== undefined && isAssertionExpression(parent) && parent.expression === current;
}

function isGlobalJsonParseCall(node, checker, program) {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
        return false;
    }
    const receiver = node.expression.expression;
    return ts.isIdentifier(receiver) &&
        receiver.text === "JSON" &&
        node.expression.name.text === "parse" &&
        isBuiltInGlobal(receiver, checker, program);
}

function jsonParseResultEscapes(node, checker) {
    if (ts.isExpressionStatement(node.parent) || ts.isVoidExpression(node.parent)) {
        return false;
    }
    if (
        (ts.isAsExpression(node.parent) || ts.isSatisfiesExpression(node.parent)) &&
        node.parent.expression === node &&
        typeNodeIsUnknown(node.parent.type)
    ) {
        return false;
    }
    const contextualType = checker.getContextualType(node);
    return contextualType === undefined || (contextualType.flags & ts.TypeFlags.Unknown) === 0;
}

function typeNodeIsUnknown(node) {
    return node.kind === ts.SyntaxKind.UnknownKeyword;
}

function isBuiltInGlobal(identifier, checker, program) {
    const symbol = checker.getSymbolAtLocation(identifier);
    const declarations = symbol?.declarations ?? [];
    return declarations.some((declaration) => (
        program.isSourceFileDefaultLibrary(declaration.getSourceFile())
    ));
}

function regexRiskFinding(node, sourceFile, checker, program) {
    let pattern;
    let locationNode;
    let construction;
    if (ts.isRegularExpressionLiteral(node)) {
        pattern = regexLiteralPattern(node, sourceFile);
        locationNode = node;
        construction = "literal";
    } else {
        const argument = staticRegExpPatternArgument(node, checker, program);
        if (argument !== undefined) {
            pattern = argument.text;
            locationNode = argument.locationNode;
            construction = "constructor";
        }
    }
    if (pattern === undefined || locationNode === undefined) {
        return undefined;
    }
    if (pattern.length > MAX_REGEX_POLICY_PATTERN_LENGTH) {
        return astPolicyFinding({
            confidence: "high",
            details: {
                analysisBudget: MAX_REGEX_POLICY_PATTERN_LENGTH,
                construction,
                patternLength: pattern.length
            },
            message: `The static regular expression has ${String(pattern.length)} UTF-16 code units, beyond the ${String(MAX_REGEX_POLICY_PATTERN_LENGTH)}-unit structural-analysis budget; ReDoS safety is inconclusive.`,
            node: locationNode,
            precision: "high",
            rule: "policy.regex-analysis-budget",
            severity: "warning",
            sourceFile,
            title: "Static regular-expression analysis budget exceeded."
        });
    }

    const reasons = regexRiskReasons(pattern);
    if (reasons.length === 0) {
        return undefined;
    }
    return astPolicyFinding({
        confidence: "medium",
        details: {
            construction,
            riskReasons: reasons
        },
        message: `This regular expression has backtracking-risk structure: ${reasons.map(regexRiskReasonText).join("; ")}.`,
        node: locationNode,
        precision: "medium",
        rule: "security.redos-risk",
        severity: "warning",
        sourceFile,
        title: "Potential catastrophic regular-expression backtracking."
    });
}

function staticRegExpPatternArgument(node, checker, program) {
    if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) {
        return undefined;
    }
    if (
        !isGlobalRegExpExpression(node.expression, checker, program)
    ) {
        return undefined;
    }
    const argument = node.arguments?.[0];
    const text = argument === undefined ? undefined : staticStringValue(argument, checker, new Set());
    return text === undefined ? undefined : { locationNode: argument, text };
}

function isGlobalRegExpExpression(expression, checker, program) {
    if (ts.isIdentifier(expression)) {
        return expression.text === "RegExp" && isBuiltInGlobal(expression, checker, program);
    }
    if (
        !ts.isPropertyAccessExpression(expression) ||
        expression.name.text !== "RegExp" ||
        !ts.isIdentifier(expression.expression) ||
        expression.expression.text !== "globalThis"
    ) {
        return false;
    }
    return isBuiltInGlobal(expression.name, checker, program);
}

function staticStringValue(node, checker, seen) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        return node.text;
    }
    if (!ts.isIdentifier(node)) {
        return undefined;
    }
    const symbol = checker.getSymbolAtLocation(node);
    if (symbol === undefined || seen.has(symbol)) {
        return undefined;
    }
    seen.add(symbol);
    const declaration = symbol.valueDeclaration;
    if (
        declaration === undefined ||
        !ts.isVariableDeclaration(declaration) ||
        declaration.initializer === undefined ||
        (declaration.parent.flags & ts.NodeFlags.Const) === 0
    ) {
        return undefined;
    }
    return staticStringValue(declaration.initializer, checker, seen);
}

function regexLiteralPattern(node, sourceFile) {
    const literal = node.getText(sourceFile);
    if (!literal.startsWith("/")) {
        return undefined;
    }
    let escaped = false;
    let inCharacterClass = false;
    for (let index = 1; index < literal.length; index += 1) {
        const character = literal[index];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (character === "\\") {
            escaped = true;
            continue;
        }
        if (character === "[") {
            inCharacterClass = true;
            continue;
        }
        if (character === "]") {
            inCharacterClass = false;
            continue;
        }
        if (character === "/" && !inCharacterClass) {
            return literal.slice(1, index);
        }
    }
    return undefined;
}

function regexRiskReasons(pattern) {
    const reasons = new Set();
    const frames = [regexFrame(0)];
    let index = 0;
    while (index < pattern.length) {
        const frame = frames.at(-1);
        const character = pattern[index];
        if (character === "\\") {
            const escaped = pattern[index + 1];
            setRegexAtom(frame, {
                broad: escaped !== undefined && "dDsSwWpP".includes(escaped),
                characterSet: regexEscapeCharacterSet(escaped),
                key: escaped === undefined ? "escape" : `\\${escaped}`
            });
            index += Math.min(2, pattern.length - index);
            continue;
        }
        if (character === "[") {
            const end = regexCharacterClassEnd(pattern, index + 1);
            const rawClass = pattern.slice(index, end);
            setRegexAtom(frame, {
                broad: true,
                characterSet: regexCharacterClassSet(rawClass),
                key: rawClass
            });
            index = end;
            continue;
        }
        if (character === "(") {
            const contentStart = regexGroupContentStart(pattern, index);
            frames.push(regexFrame(contentStart));
            index = contentStart;
            continue;
        }
        if (character === ")" && frames.length > 1) {
            const child = frames.pop();
            const parent = frames.at(-1);
            if (child.hasAlternation) {
                child.alternatives.push(pattern.slice(child.alternativeStart, index));
            }
            parent.containsQuantifier ||= child.containsQuantifier;
            const quantifier = regexQuantifierAt(pattern, index + 1);
            const atom = {
                broad: child.hasBroadAtom || child.alternatives.length > 1,
                key: "group"
            };
            if (quantifier !== undefined) {
                if (quantifier.riskRepeating) {
                    if (child.containsQuantifier) {
                        reasons.add("nested-quantifier");
                    }
                    if (regexAlternativesAreAmbiguous(child.alternatives)) {
                        reasons.add("ambiguous-repeated-alternation");
                    }
                }
                if (quantifier.unbounded) {
                    registerQuantifiedRegexAtom(parent, atom, reasons);
                } else {
                    setRegexAtom(parent, atom);
                }
                parent.containsQuantifier ||= quantifier.variable;
                index = skipLazyQuantifier(pattern, quantifier.end);
            } else {
                setRegexAtom(parent, atom);
                index += 1;
            }
            continue;
        }
        if (character === "|") {
            frame.alternatives.push(pattern.slice(frame.alternativeStart, index));
            frame.hasAlternation = true;
            frame.alternativeStart = index + 1;
            frame.pendingAtom = undefined;
            frame.lastBroadQuantifier = undefined;
            index += 1;
            continue;
        }

        const quantifier = regexQuantifierAt(pattern, index);
        if (quantifier !== undefined && frame.pendingAtom !== undefined) {
            if (quantifier.variable) {
                frame.containsQuantifier = true;
            }
            if (quantifier.unbounded) {
                registerQuantifiedRegexAtom(frame, frame.pendingAtom, reasons);
            } else {
                frame.lastBroadQuantifier = undefined;
            }
            frame.pendingAtom = undefined;
            index = skipLazyQuantifier(pattern, quantifier.end);
            continue;
        }
        if (character === "^" || character === "$") {
            frame.pendingAtom = undefined;
            frame.lastBroadQuantifier = undefined;
            index += 1;
            continue;
        }
        setRegexAtom(frame, {
            broad: character === ".",
            characterSet: character === "."
                ? unknownRegexCharacterSet()
                : singletonRegexCharacterSet(character),
            key: character
        });
        index += 1;
    }
    return [...reasons].sort();
}

function regexFrame(contentStart) {
    return {
        alternativeStart: contentStart,
        alternatives: [],
        containsQuantifier: false,
        hasBroadAtom: false,
        hasAlternation: false,
        lastBroadQuantifier: undefined,
        pendingAtom: undefined
    };
}

function setRegexAtom(frame, atom) {
    frame.pendingAtom = atom;
    frame.hasBroadAtom ||= atom.broad;
    if (!atom.broad) {
        frame.lastBroadQuantifier = undefined;
    }
}

function registerQuantifiedRegexAtom(frame, atom, reasons) {
    if (
        atom.broad &&
        frame.lastBroadQuantifier !== undefined &&
        regexCharacterSetsMayOverlap(frame.lastBroadQuantifier.characterSet, atom.characterSet)
    ) {
        reasons.add("repeated-broad-quantifier");
    }
    frame.lastBroadQuantifier = atom.broad ? atom : undefined;
}

function regexCharacterClassEnd(pattern, start) {
    let escaped = false;
    for (let index = start; index < pattern.length; index += 1) {
        const character = pattern[index];
        if (escaped) {
            escaped = false;
        } else if (character === "\\") {
            escaped = true;
        } else if (character === "]") {
            return index + 1;
        }
    }
    return pattern.length;
}

function unknownRegexCharacterSet() {
    return {
        ascii: new Uint8Array(REGEX_ASCII_LIMIT),
        complementClass: undefined,
        outsideLiterals: new Set(),
        unknownAll: true,
        unknownOutside: true
    };
}

function emptyRegexCharacterSet() {
    return {
        ascii: new Uint8Array(REGEX_ASCII_LIMIT),
        complementClass: undefined,
        outsideLiterals: new Set(),
        unknownAll: false,
        unknownOutside: false
    };
}

function singletonRegexCharacterSet(character) {
    const set = emptyRegexCharacterSet();
    if (character === undefined || character.length === 0) {
        return set;
    }
    const codePoint = character.codePointAt(0);
    if (codePoint < REGEX_ASCII_LIMIT) {
        set.ascii[codePoint] = 1;
    } else {
        set.outsideLiterals.add(String.fromCodePoint(codePoint));
    }
    return set;
}

function regexEscapeCharacterSet(character) {
    const set = emptyRegexCharacterSet();
    const lower = character?.toLowerCase();
    if (lower === "d" || lower === "w" || lower === "s") {
        if (lower === "d" || lower === "w") {
            addAsciiRange(set, 48, 57);
        }
        if (lower === "w") {
            addAsciiRange(set, 65, 90);
            addAsciiRange(set, 97, 122);
            set.ascii[95] = 1;
        }
        if (lower === "s") {
            for (const code of [9, 10, 11, 12, 13, 32]) {
                set.ascii[code] = 1;
            }
            set.unknownOutside = true;
        }
        const negated = character !== lower;
        set.complementClass = { key: lower, negated };
        if (negated) {
            invertAsciiSet(set);
            set.unknownOutside = true;
        }
        return set;
    }
    if (lower === "p") {
        return unknownRegexCharacterSet();
    }
    const escapedCharacters = new Map([
        ["0", "\0"],
        ["b", "\b"],
        ["f", "\f"],
        ["n", "\n"],
        ["r", "\r"],
        ["t", "\t"],
        ["v", "\v"]
    ]);
    return singletonRegexCharacterSet(escapedCharacters.get(character) ?? character);
}

function regexCharacterClassSet(rawClass) {
    if (!rawClass.startsWith("[") || !rawClass.endsWith("]")) {
        return unknownRegexCharacterSet();
    }
    let index = 1;
    const negated = rawClass[index] === "^";
    if (negated) {
        index += 1;
    }
    const result = emptyRegexCharacterSet();
    const contentEnd = rawClass.length - 1;
    while (index < contentEnd) {
        const first = regexClassAtom(rawClass, index, contentEnd);
        if (first === undefined) {
            return unknownRegexCharacterSet();
        }
        index = first.end;
        if (rawClass[index] === "-" && index + 1 < contentEnd) {
            const second = regexClassAtom(rawClass, index + 1, contentEnd);
            if (second === undefined || first.codePoint === undefined || second.codePoint === undefined) {
                return unknownRegexCharacterSet();
            }
            addCharacterRange(result, first.codePoint, second.codePoint);
            index = second.end;
        } else {
            mergeRegexCharacterSets(result, first.characterSet);
        }
    }
    if (negated) {
        invertAsciiSet(result);
        result.unknownOutside = true;
        result.outsideLiterals.clear();
    }
    return result;
}

function regexClassAtom(rawClass, start, end) {
    const character = rawClass[start];
    if (character === undefined || start >= end) {
        return undefined;
    }
    if (character === "\\") {
        const escaped = rawClass[start + 1];
        if (escaped === undefined) {
            return undefined;
        }
        const characterSet = regexEscapeCharacterSet(escaped);
        const singleton = regexCharacterSetSingleton(characterSet);
        return {
            characterSet,
            codePoint: singleton,
            end: start + 2
        };
    }
    const codePoint = rawClass.codePointAt(start);
    const width = codePoint > 0xffff ? 2 : 1;
    return {
        characterSet: singletonRegexCharacterSet(String.fromCodePoint(codePoint)),
        codePoint,
        end: start + width
    };
}

function regexCharacterSetSingleton(set) {
    if (set.unknownAll || set.unknownOutside || set.outsideLiterals.size > 1) {
        return undefined;
    }
    let found;
    for (let code = 0; code < set.ascii.length; code += 1) {
        if (set.ascii[code] === 0) {
            continue;
        }
        if (found !== undefined || set.outsideLiterals.size !== 0) {
            return undefined;
        }
        found = code;
    }
    if (found !== undefined) {
        return found;
    }
    const outside = [...set.outsideLiterals][0];
    return outside === undefined ? undefined : outside.codePointAt(0);
}

function addCharacterRange(set, start, end) {
    const lower = Math.min(start, end);
    const upper = Math.max(start, end);
    if (upper - lower > MAX_REGEX_POLICY_PATTERN_LENGTH) {
        set.unknownOutside = true;
        return;
    }
    for (let codePoint = lower; codePoint <= upper; codePoint += 1) {
        if (codePoint < REGEX_ASCII_LIMIT) {
            set.ascii[codePoint] = 1;
        } else if (codePoint <= 0x10ffff) {
            set.outsideLiterals.add(String.fromCodePoint(codePoint));
        }
    }
}

function addAsciiRange(set, start, end) {
    for (let code = start; code <= end; code += 1) {
        set.ascii[code] = 1;
    }
}

function invertAsciiSet(set) {
    for (let code = 0; code < set.ascii.length; code += 1) {
        set.ascii[code] = set.ascii[code] === 0 ? 1 : 0;
    }
}

function mergeRegexCharacterSets(target, source) {
    if (source.unknownAll) {
        target.unknownAll = true;
    }
    target.unknownOutside ||= source.unknownOutside;
    for (let code = 0; code < target.ascii.length; code += 1) {
        target.ascii[code] ||= source.ascii[code];
    }
    for (const literal of source.outsideLiterals) {
        target.outsideLiterals.add(literal);
    }
}

function regexCharacterSetsMayOverlap(left, right) {
    if (left === undefined || right === undefined || left.unknownAll || right.unknownAll) {
        return true;
    }
    if (
        left.complementClass !== undefined &&
        right.complementClass !== undefined &&
        left.complementClass.key === right.complementClass.key &&
        left.complementClass.negated !== right.complementClass.negated
    ) {
        return false;
    }
    for (let code = 0; code < REGEX_ASCII_LIMIT; code += 1) {
        if (left.ascii[code] !== 0 && right.ascii[code] !== 0) {
            return true;
        }
    }
    if (
        (left.unknownOutside && (right.unknownOutside || right.outsideLiterals.size > 0)) ||
        (right.unknownOutside && left.outsideLiterals.size > 0)
    ) {
        return true;
    }
    for (const literal of left.outsideLiterals) {
        if (right.outsideLiterals.has(literal)) {
            return true;
        }
    }
    return false;
}

function singleRegexAtomCharacterSet(branch) {
    if (branch.startsWith("\\") && branch.length === 2) {
        return regexEscapeCharacterSet(branch[1]);
    }
    if (branch.startsWith("[")) {
        const end = regexCharacterClassEnd(branch, 1);
        return end === branch.length ? regexCharacterClassSet(branch) : undefined;
    }
    if (branch === ".") {
        return unknownRegexCharacterSet();
    }
    const characters = [...branch];
    return characters.length === 1 ? singletonRegexCharacterSet(characters[0]) : undefined;
}

function regexGroupContentStart(pattern, open) {
    if (pattern[open + 1] !== "?") {
        return open + 1;
    }
    const marker = pattern[open + 2];
    if (marker === ":" || marker === "=" || marker === "!") {
        return open + 3;
    }
    if (marker === "<") {
        const lookbehind = pattern[open + 3];
        if (lookbehind === "=" || lookbehind === "!") {
            return open + 4;
        }
        const close = pattern.indexOf(">", open + 3);
        return close < 0 ? open + 2 : close + 1;
    }
    return open + 2;
}

function regexQuantifierAt(pattern, start) {
    const character = pattern[start];
    if (character === "*" || character === "+" || character === "?") {
        return {
            end: start + 1,
            riskRepeating: character !== "?",
            unbounded: character !== "?",
            variable: true
        };
    }
    if (character !== "{") {
        return undefined;
    }
    let index = start + 1;
    const minimumStart = index;
    while (isDecimalDigit(pattern[index])) {
        index += 1;
    }
    if (index === minimumStart) {
        return undefined;
    }
    const minimum = pattern.slice(minimumStart, index);
    let maximum = minimum;
    if (pattern[index] === ",") {
        index += 1;
        const maximumStart = index;
        while (isDecimalDigit(pattern[index])) {
            index += 1;
        }
        maximum = pattern.slice(maximumStart, index);
    }
    return pattern[index] === "}"
        ? {
            end: index + 1,
            riskRepeating: maximum === "" || decimalAtLeast(
                maximum,
                REGEX_BOUNDED_REPEAT_RISK_THRESHOLD
            ),
            unbounded: maximum === "",
            variable: maximum === "" || minimum !== maximum
        }
        : undefined;
}

function decimalAtLeast(value, threshold) {
    const normalized = value.replace(/^0+/u, "") || "0";
    const limit = String(threshold);
    return normalized.length > limit.length || (
        normalized.length === limit.length && normalized >= limit
    );
}

function isDecimalDigit(character) {
    return character !== undefined && character >= "0" && character <= "9";
}

function skipLazyQuantifier(pattern, end) {
    return pattern[end] === "?" ? end + 1 : end;
}

function regexAlternativesAreAmbiguous(alternatives) {
    if (alternatives.length < 2 || alternatives.some((branch) => branch.length === 0)) {
        return alternatives.length >= 2;
    }
    const seen = new Set();
    for (const branch of alternatives) {
        if (seen.has(branch)) {
            return true;
        }
        seen.add(branch);
    }
    const sorted = [...seen].sort();
    for (let index = 1; index < sorted.length; index += 1) {
        if (sorted[index].startsWith(sorted[index - 1])) {
            return true;
        }
    }
    const characterSets = alternatives.map(singleRegexAtomCharacterSet);
    for (let left = 0; left < characterSets.length; left += 1) {
        const first = characterSets[left];
        if (first === undefined) {
            continue;
        }
        for (let right = left + 1; right < characterSets.length; right += 1) {
            const second = characterSets[right];
            if (second !== undefined && regexCharacterSetsMayOverlap(first, second)) {
                return true;
            }
        }
    }
    return false;
}

function regexRiskReasonText(reason) {
    switch (reason) {
        case "nested-quantifier":
            return "a quantified group contains another quantifier";
        case "ambiguous-repeated-alternation":
            return "a repeated alternation has overlapping branches";
        case "repeated-broad-quantifier":
            return "multiple broad quantified atoms can consume the same input";
        default:
            return reason;
    }
}

function astPolicyFinding({
    confidence,
    details,
    end,
    message,
    node,
    precision,
    rule,
    severity,
    sourceFile,
    start,
    title
}) {
    const safeStart = Math.max(0, Math.min(
        start ?? node.getStart(sourceFile),
        sourceFile.text.length
    ));
    const safeEnd = Math.max(safeStart, Math.min(
        end ?? node.end,
        sourceFile.text.length
    ));
    return {
        analysisBasis: "typescript-program-ast",
        confidence,
        details,
        domain: rule.startsWith("security.") ? "security" : "types",
        message,
        precision,
        rule,
        severity,
        span: {
            encoding: UTF16_POSITION_ENCODING,
            end: {
                ...sourceFile.getLineAndCharacterOfPosition(safeEnd),
                column: sourceFile.getLineAndCharacterOfPosition(safeEnd).character,
                offset: safeEnd
            },
            endExclusive: true,
            lineBase: 0,
            columnBase: 0,
            path: sourceFile.fileName,
            start: {
                ...sourceFile.getLineAndCharacterOfPosition(safeStart),
                column: sourceFile.getLineAndCharacterOfPosition(safeStart).character,
                offset: safeStart
            }
        },
        title
    };
}

function toPolicyDiagnostic(finding, text) {
    const remediation = policyRemediation(finding.rule);
    const title = typeof finding.title === "string" && finding.title !== finding.rule
        ? `${finding.title.replace(/[.:]\s*$/u, "")}: `
        : "";
    return {
        code: finding.rule,
        data: {
            analysisBasis: finding.analysisBasis,
            confidence: finding.confidence,
            ...(finding.details ?? {}),
            domain: finding.domain,
            fingerprint: finding.fingerprint,
            precision: finding.precision,
            remediation,
            title: finding.title
        },
        message: `${title}${finding.message}\nhelp: ${remediation}`,
        range: policyFindingRange(finding, text),
        severity: policySeverity(finding.severity),
        source: "typesea-policy"
    };
}

function policyFindingRange(finding, text) {
    const spanRange = canonicalPolicySpan(finding?.span, text);
    if (spanRange !== undefined) {
        return spanRange;
    }

    const line = Math.max(0, Math.min(
        positiveLineCount(text) - 1,
        Number.isInteger(finding?.line) ? finding.line - 1 : 0
    ));
    if (Number.isInteger(finding?.column) && finding.column > 0) {
        const start = normalizedPosition(text, {
            line,
            character: finding.column - 1
        });
        const requestedEnd = {
            line: Number.isInteger(finding?.endLine) && finding.endLine > 0
                ? finding.endLine - 1
                : line,
            character: Number.isInteger(finding?.endColumn) && finding.endColumn > 0
                ? finding.endColumn - 1
                : start.character + 1
        };
        const end = normalizedPosition(text, requestedEnd);
        return compareLspPositions(start, end) <= 0 ? { start, end } : { start, end: start };
    }

    const lineStart = offsetAt(text, { line, character: 0 });
    const lineEnd = lineEndOffset(text, lineStart);
    const lineText = text.slice(lineStart, lineEnd);
    const anchor = policyAnchor(finding, lineText);
    if (anchor !== undefined) {
        return {
            start: positionAt(text, lineStart + anchor.start),
            end: positionAt(text, lineStart + anchor.end)
        };
    }
    const leading = /^\s*/u.exec(lineText)?.[0].length ?? 0;
    const trailing = /\s*$/u.exec(lineText)?.[0].length ?? 0;
    const contentEnd = Math.max(leading, lineText.length - trailing);
    return {
        start: positionAt(text, lineStart + leading),
        end: positionAt(text, lineStart + contentEnd)
    };
}

function canonicalPolicySpan(span, text) {
    if (
        span === null ||
        typeof span !== "object" ||
        (span.encoding !== undefined && !/^utf-?16$/iu.test(span.encoding))
    ) {
        return undefined;
    }
    const start = frontendPosition(span.start);
    const end = frontendPosition(span.end);
    if (start === undefined || end === undefined) {
        return undefined;
    }
    const normalizedStart = normalizedPosition(text, start);
    const normalizedEnd = normalizedPosition(text, end);
    return compareLspPositions(normalizedStart, normalizedEnd) <= 0
        ? { start: normalizedStart, end: normalizedEnd }
        : undefined;
}

function frontendPosition(value) {
    if (value === null || typeof value !== "object") {
        return undefined;
    }
    const character = value.column ?? value.character;
    return isNonNegativeInteger(value.line) && isNonNegativeInteger(character)
        ? { line: value.line, character }
        : undefined;
}

function normalizedPosition(text, position) {
    return positionAt(text, offsetAt(text, position));
}

function positionAt(text, requestedOffset) {
    const target = Math.max(0, Math.min(
        Number.isInteger(requestedOffset) ? requestedOffset : 0,
        text.length
    ));
    let line = 0;
    let character = 0;
    let offset = 0;
    while (offset < target) {
        const code = text.charCodeAt(offset);
        if (code === 13) {
            offset += 1;
            if (offset < target && text.charCodeAt(offset) === 10) {
                offset += 1;
            }
            line += 1;
            character = 0;
            continue;
        }
        offset += 1;
        if (code === 10 || code === 0x2028 || code === 0x2029) {
            line += 1;
            character = 0;
        } else {
            character += 1;
        }
    }
    return { line, character };
}

function lineEndOffset(text, start) {
    let offset = start;
    while (offset < text.length) {
        const code = text.charCodeAt(offset);
        if (code === 10 || code === 13 || code === 0x2028 || code === 0x2029) {
            break;
        }
        offset += 1;
    }
    return offset;
}

function positiveLineCount(text) {
    let count = 1;
    for (let offset = 0; offset < text.length; offset += 1) {
        const code = text.charCodeAt(offset);
        if (code === 13) {
            if (text.charCodeAt(offset + 1) === 10) {
                offset += 1;
            }
            count += 1;
        } else if (code === 10 || code === 0x2028 || code === 0x2029) {
            count += 1;
        }
    }
    return count;
}

function policyAnchor(finding, lineText) {
    let pattern;
    switch (finding?.rule) {
        case "dynamic-code-sink":
            pattern = /\b(?:new\s+Function|eval)(?=\s*\()/u;
            break;
        case "todo-comment":
            pattern = /TODO|FIXME|HACK/u;
            break;
        case "direct-hostile-read":
            pattern = /\b(?:value|input|data|record)\.(?!length\b)[A-Za-z_$][A-Za-z0-9_$]*/u;
            break;
        case "descriptor-without-value-proof":
        case "function-descriptor-without-value-proof":
            pattern = /Object\.getOwnPropertyDescriptor|(?<![A-Za-z0-9_$])gp\s*\(/u;
            break;
        case "throw-in-library-core":
            pattern = /\bthrow\b/u;
            break;
        default:
            pattern = quotedFindingNamePattern(finding?.message);
    }
    const match = pattern?.exec(lineText);
    return match === null || match === undefined
        ? undefined
        : { start: match.index, end: match.index + match[0].length };
}

function quotedFindingNamePattern(message) {
    if (typeof message !== "string") {
        return undefined;
    }
    const name = /'([^']+)'/u.exec(message)?.[1];
    return name === undefined ? undefined : new RegExp(escapeRegExp(name), "u");
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function policyRemediation(rule) {
    switch (rule) {
        case "types.unsafe-escape":
            return "Keep the value unknown, validate or narrow it with a runtime proof, and replace assertions with the proven precise type.";
        case "security.redos-risk":
            return "Remove nested or overlapping repetition, bound the input and quantifiers, or use a linear-time parser for attacker-controlled text.";
        case "policy.regex-analysis-budget":
            return "Split or replace the pattern so its structure can be audited, or raise the analyzer budget only with a documented performance proof.";
        case "dynamic-code-sink":
            return "Replace eval/new Function with a statically typed implementation, or move the audited bridge into an approved code-generation module.";
        case "direct-hostile-read":
            return "Read hostile input through an own-property descriptor and prove it has a data value before using it.";
        case "descriptor-without-value-proof":
        case "function-descriptor-without-value-proof":
            return "Check Object.prototype.hasOwnProperty.call(descriptor, \"value\") before reading descriptor.value.";
        case "large-file":
            return "Split the module along stable responsibilities while preserving its public entry points.";
        case "missing-public-jsdoc":
            return "Add nearby JSDoc that states the public contract, inputs, output, and important failure behavior.";
        case "duplicate-export-name":
            return "Rename or consolidate the export so its public meaning is unambiguous.";
        case "high-cognitive-complexity":
        case "high-function-complexity":
            return "Extract named branches or helpers and add focused tests for each resulting decision path.";
        case "high-function-call-out":
            return "Extract orchestration responsibilities or document why this function must coordinate many callees.";
        case "recursive-call-cycle":
            return "Add an explicit termination condition and a bounded recursion test, or replace the cycle with iteration.";
        case "todo-comment":
            return "Resolve the debt or link it to a tracked issue with a concrete removal condition.";
        case "throw-in-library-core":
            return "Return the library's explicit Result-style failure value unless throwing is part of the documented contract.";
        case "lexical-error":
            return "Close or correct the malformed token before relying on further policy analysis.";
        default:
            return "Review the highlighted construct against the TypeSea contributing policy and apply the smallest contract-preserving fix.";
    }
}

function policySeverity(severity) {
    if (severity === "error") {
        return 1;
    }
    if (severity === "warning") {
        return 2;
    }
    return 3;
}

function compareLspPositions(left, right) {
    return left.line - right.line || left.character - right.character;
}

function mergePublishedDiagnostics(diagnostics) {
    const unique = new Map();
    for (const diagnostic of diagnostics) {
        const key = [
            diagnostic.source,
            diagnostic.code,
            diagnostic.severity,
            diagnostic.range.start.line,
            diagnostic.range.start.character,
            diagnostic.range.end.line,
            diagnostic.range.end.character,
            diagnostic.message
        ].join(":");
        if (!unique.has(key)) {
            unique.set(key, diagnostic);
        }
    }
    return [...unique.values()].sort((left, right) => (
        compareLspPositions(left.range.start, right.range.start) ||
        compareLspPositions(left.range.end, right.range.end) ||
        (left.severity ?? 3) - (right.severity ?? 3) ||
        String(left.source).localeCompare(String(right.source)) ||
        String(left.code).localeCompare(String(right.code))
    ));
}

function collectDiagnostics(fileName) {
    const groups = [
        safeDiagnostics(() => languageService.getSyntacticDiagnostics(fileName)),
        safeDiagnostics(() => languageService.getSemanticDiagnostics(fileName)),
        safeDiagnostics(() => languageService.getSuggestionDiagnostics(fileName))
    ];
    const unique = new Map();
    for (const diagnostic of groups.flat()) {
        if (diagnostic.file === undefined || diagnostic.start === undefined) {
            continue;
        }
        const key = [
            diagnostic.code,
            diagnostic.category,
            diagnostic.start,
            diagnostic.length ?? 0,
            ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
        ].join(":");
        unique.set(key, diagnostic);
    }
    return [...unique.values()].sort((left, right) => (
        (left.start ?? 0) - (right.start ?? 0) || left.code - right.code
    ));
}

function safeDiagnostics(read) {
    try {
        return read();
    } catch {
        return [];
    }
}

function toLspDiagnostic(diagnostic) {
    const result = {
        code: diagnostic.code,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        range: diagnosticRange(diagnostic),
        severity: diagnosticSeverity(diagnostic.category),
        source: "typescript"
    };

    const tags = [];
    if (diagnostic.reportsUnnecessary === true) {
        tags.push(1);
    }
    if (diagnostic.reportsDeprecated === true) {
        tags.push(2);
    }
    if (tags.length > 0) {
        result.tags = tags;
    }

    const relatedInformation = (diagnostic.relatedInformation ?? [])
        .filter((related) => related.file !== undefined && related.start !== undefined)
        .map((related) => ({
            location: {
                uri: documentUri(related.file.fileName),
                range: diagnosticRange(related)
            },
            message: ts.flattenDiagnosticMessageText(related.messageText, "\n")
        }));
    if (relatedInformation.length > 0) {
        result.relatedInformation = relatedInformation;
    }
    return result;
}

function diagnosticRange(diagnostic) {
    const file = diagnostic.file;
    if (file === undefined) {
        return zeroRange();
    }
    return textSpanRange(file, diagnostic.start ?? 0, diagnostic.length ?? 0);
}

function textSpanRange(sourceFile, start, length) {
    const safeStart = Math.max(0, Math.min(start, sourceFile.text.length));
    const safeEnd = Math.max(safeStart, Math.min(safeStart + Math.max(0, length), sourceFile.text.length));
    return {
        start: sourceFile.getLineAndCharacterOfPosition(safeStart),
        end: sourceFile.getLineAndCharacterOfPosition(safeEnd)
    };
}

function zeroRange() {
    return {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 }
    };
}

function diagnosticSeverity(category) {
    switch (category) {
        case ts.DiagnosticCategory.Error:
            return 1;
        case ts.DiagnosticCategory.Warning:
            return 2;
        case ts.DiagnosticCategory.Suggestion:
            return 4;
        default:
            return 3;
    }
}

function codeActions(parameters) {
    const target = documentTarget(parameters?.textDocument?.uri);
    const diagnostics = parameters?.context?.diagnostics;
    if (
        target === undefined ||
        !Array.isArray(diagnostics) ||
        !supportsRequestedQuickFixes(parameters?.context?.only)
    ) {
        return [];
    }

    const sourceText = openDocuments.get(target.key)?.text ?? ts.sys.readFile(target.fileName);
    if (sourceText === undefined) {
        return [];
    }

    const actions = new Map();
    for (const diagnostic of diagnostics) {
        if (diagnostic?.source !== undefined && diagnostic.source !== "typescript") {
            continue;
        }
        const code = typescriptDiagnosticCode(diagnostic?.code);
        const range = diagnostic?.range;
        if (code === undefined || !isLspRange(range)) {
            continue;
        }

        const start = offsetAt(sourceText, range.start);
        const end = offsetAt(sourceText, range.end);
        const fixes = safeCodeFixes(target.fileName, start, end, code);
        for (const fix of fixes) {
            if ((fix.commands?.length ?? 0) > 0) {
                continue;
            }
            const edit = workspaceEditForFix(fix);
            if (edit === undefined) {
                continue;
            }

            const key = `${fix.description}\n${JSON.stringify(edit)}`;
            const existing = actions.get(key);
            if (existing !== undefined) {
                existing.diagnostics.push(diagnostic);
                continue;
            }
            actions.set(key, {
                title: fix.description,
                kind: "quickfix",
                diagnostics: [diagnostic],
                edit
            });
        }
    }
    return [...actions.values()];
}

function supportsRequestedQuickFixes(only) {
    if (!Array.isArray(only) || only.length === 0) {
        return true;
    }
    return only.some((kind) => (
        typeof kind === "string" &&
        (kind === "quickfix" || "quickfix".startsWith(`${kind}.`))
    ));
}

function typescriptDiagnosticCode(value) {
    if (Number.isInteger(value) && value >= 0) {
        return value;
    }
    if (typeof value === "string" && /^\d+$/u.test(value)) {
        const parsed = Number(value);
        return Number.isSafeInteger(parsed) ? parsed : undefined;
    }
    return undefined;
}

function isLspRange(range) {
    return range !== null &&
        typeof range === "object" &&
        isNonNegativeInteger(range.start?.line) &&
        isNonNegativeInteger(range.start?.character) &&
        isNonNegativeInteger(range.end?.line) &&
        isNonNegativeInteger(range.end?.character);
}

function isNonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0;
}

function safeCodeFixes(fileName, start, end, code) {
    try {
        return languageService.getCodeFixesAtPosition(
            fileName,
            Math.min(start, end),
            Math.max(start, end),
            [code],
            formatCodeSettings(),
            userPreferences()
        );
    } catch {
        return [];
    }
}

function formatCodeSettings() {
    return {
        baseIndentSize: 0,
        convertTabsToSpaces: true,
        indentSize: 4,
        indentStyle: ts.IndentStyle.Smart,
        insertSpaceAfterCommaDelimiter: true,
        insertSpaceAfterSemicolonInForStatements: true,
        insertSpaceBeforeAndAfterBinaryOperators: true,
        newLineCharacter: ts.sys.newLine,
        semicolons: ts.SemicolonPreference.Insert,
        tabSize: 4
    };
}

function userPreferences() {
    return {
        allowTextChangesInNewFiles: false,
        includeCompletionsForModuleExports: true,
        includeCompletionsWithInsertText: true,
        quotePreference: "double"
    };
}

function workspaceEditForFix(fix) {
    if (!Array.isArray(fix.changes) || fix.changes.length === 0) {
        return undefined;
    }

    const changes = {};
    for (const fileChange of fix.changes) {
        const fileName = absoluteProjectPath(fileChange.fileName);
        if (fileChange.isNewFile === true || !isWorkspaceEditPath(fileName)) {
            return undefined;
        }
        const sourceFile = sourceFileFor(fileName);
        if (sourceFile === undefined || !Array.isArray(fileChange.textChanges)) {
            return undefined;
        }

        const uri = documentUri(fileName);
        const edits = changes[uri] ?? [];
        for (const textChange of fileChange.textChanges) {
            edits.push({
                range: textSpanRange(
                    sourceFile,
                    textChange.span.start,
                    textChange.span.length
                ),
                newText: textChange.newText
            });
        }
        changes[uri] = edits;
    }
    return Object.keys(changes).length === 0 ? undefined : { changes };
}

function definitions(parameters) {
    const target = documentTarget(parameters?.textDocument?.uri);
    if (target === undefined) {
        return [];
    }

    const text = openDocuments.get(target.key)?.text ?? ts.sys.readFile(target.fileName);
    if (text === undefined) {
        return [];
    }
    const position = offsetAt(text, parameters?.position);
    let definitionEntries;
    try {
        definitionEntries = languageService.getDefinitionAtPosition(target.fileName, position) ?? [];
    } catch {
        return [];
    }

    const locations = new Map();
    for (const definition of definitionEntries) {
        const fileName = absoluteProjectPath(definition.fileName);
        const sourceFile = sourceFileFor(fileName);
        if (sourceFile === undefined) {
            continue;
        }
        const location = {
            uri: documentUri(fileName),
            range: textSpanRange(
                sourceFile,
                definition.textSpan.start,
                definition.textSpan.length
            )
        };
        locations.set(`${location.uri}:${JSON.stringify(location.range)}`, location);
    }
    return [...locations.values()];
}

function sourceFileFor(fileName) {
    const absolute = absoluteProjectPath(fileName);
    const program = languageService.getProgram();
    const direct = program?.getSourceFile(absolute);
    if (direct !== undefined) {
        return direct;
    }
    const key = canonicalPath(absolute);
    const programFile = program?.getSourceFiles().find((file) => canonicalPath(file.fileName) === key);
    if (programFile !== undefined) {
        return programFile;
    }

    const text = openDocuments.get(key)?.text ?? ts.sys.readFile(absolute);
    if (text === undefined) {
        return undefined;
    }
    return ts.createSourceFile(
        absolute,
        text,
        compilerOptions.target ?? ts.ScriptTarget.Latest,
        true,
        scriptKind(absolute)
    );
}

function hover(parameters) {
    const target = documentTarget(parameters?.textDocument?.uri);
    if (target === undefined) {
        return null;
    }

    const text = openDocuments.get(target.key)?.text ?? ts.sys.readFile(target.fileName);
    if (text === undefined) {
        return null;
    }
    const position = offsetAt(text, parameters?.position);
    let quickInfo;
    try {
        quickInfo = languageService.getQuickInfoAtPosition(target.fileName, position);
    } catch {
        return null;
    }
    if (quickInfo === undefined) {
        return null;
    }

    const sourceFile = sourceFileFor(target.fileName);
    if (sourceFile === undefined) {
        return null;
    }
    const value = hoverMarkdown(quickInfo);
    return {
        contents: { kind: "markdown", value },
        range: textSpanRange(sourceFile, quickInfo.textSpan.start, quickInfo.textSpan.length)
    };
}

function hoverMarkdown(quickInfo) {
    const display = ts.displayPartsToString(quickInfo.displayParts);
    const documentation = ts.displayPartsToString(quickInfo.documentation);
    const sections = [];
    if (display.length > 0) {
        sections.push(`\`\`\`typescript\n${escapeCodeFence(display)}\n\`\`\``);
    }
    if (documentation.length > 0) {
        sections.push(documentation);
    }
    for (const tag of quickInfo.tags ?? []) {
        const text = typeof tag.text === "string" ? tag.text : ts.displayPartsToString(tag.text);
        sections.push(`*@${tag.name}*${text.length > 0 ? ` — ${text}` : ""}`);
    }
    return sections.join("\n\n");
}

function escapeCodeFence(value) {
    return value.replaceAll("```", "``\u200b`");
}

process.stdin.on("data", readMessages);
process.stdin.on("error", () => {
    process.exitCode = 1;
});
process.stdin.on("end", () => {
    languageService?.dispose();
    process.exitCode = shutdownRequested ? 0 : 1;
});
process.on("SIGTERM", () => {
    languageService?.dispose();
    process.exit(0);
});
