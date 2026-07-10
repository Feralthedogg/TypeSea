import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import ts from "typescript";
import { inferHmCandidates } from "./hm-inference.mjs";

const SCHEMA_VERSION = 1;
const PROTOCOL = "typesea.typescript-frontend/v1";
const RANGE_ENCODING = Object.freeze({
    name: "utf-16",
    encoding: "utf-16",
    lineBase: 0,
    columnBase: 0,
    endExclusive: true
});

const PHASE_RANK = new Map([
    ["config", 0],
    ["options", 1],
    ["global", 2],
    ["syntactic", 3],
    ["semantic", 4]
]);

/**
 * Build a compact, JSON-safe TypeScript project model.
 *
 * TypeScript's Program and TypeChecker are authoritative. The returned model
 * deliberately contains semantic facts instead of serializing compiler AST or
 * Type objects, both of which are cyclic and tied to a compiler process.
 */
export async function analyzeTypeScriptProject(options = {}) {
    const cwd = resolve(options.cwd ?? options.root ?? process.cwd());
    const requestedConfig = options.tsconfigPath ?? "tsconfig.json";
    const configPath = isAbsolute(requestedConfig)
        ? resolve(requestedConfig)
        : resolve(cwd, requestedConfig);
    const configRead = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configRead.error !== undefined) {
        throw new Error(formatFatalDiagnostic(configRead.error, cwd));
    }

    const parsed = ts.parseJsonConfigFileContent(
        configRead.config,
        ts.sys,
        dirname(configPath),
        undefined,
        configPath
    );
    const outputRoots = normalizeOutputRoots(options.outputRoots);
    const programRootNames = options.programScope === "output" && outputRoots.length !== 0
        ? parsed.fileNames.filter((fileName) => pathMatchesOutputRoots(projectPath(cwd, fileName), outputRoots))
        : parsed.fileNames;
    // This process is analysis-only. Forcing noEmit preserves the configured
    // type system while avoiding emit-layout diagnostics caused solely by a
    // deliberately narrowed root set (for example TS5011 under TypeScript 6).
    const programOptions = {
        ...parsed.options,
        noEmit: true
    };
    const program = ts.createProgram({
        rootNames: programRootNames,
        options: programOptions,
        projectReferences: parsed.projectReferences
    });
    const checker = program.getTypeChecker();
    const detail = options.detail === "policy" || options.detail === "analyzer"
        ? options.detail
        : "full";
    const sourceFiles = program.getSourceFiles()
        .filter((sourceFile) => isProjectSourceFile(sourceFile, cwd))
        .filter((sourceFile) => pathMatchesOutputRoots(projectPath(cwd, sourceFile.fileName), outputRoots))
        .sort((left, right) => projectPath(cwd, left.fileName).localeCompare(projectPath(cwd, right.fileName)));
    const context = createContext(
        cwd,
        configPath,
        parsed,
        program,
        checker,
        sourceFiles,
        options.includeSourceText === true,
        detail,
        options.hm !== false
    );
    context.compilerDiagnostics = [
        ...program.getSyntacticDiagnostics(),
        ...program.getSemanticDiagnostics()
    ];

    indexFunctionLikeNodes(context);
    indexRuntimeOwners(context);
    const files = sourceFiles.map((sourceFile) => serializeSourceFile(sourceFile, context));
    const diagnostics = collectDiagnostics(parsed, program, context);
    const summary = summarizeFrontend(files, diagnostics);
    const base = {
        schemaVersion: SCHEMA_VERSION,
        protocol: PROTOCOL,
        typescriptVersion: ts.version,
        rangeEncoding: RANGE_ENCODING,
        project: {
            root: cwd.replaceAll("\\", "/"),
            tsconfigPath: projectPath(cwd, configPath),
            compilerOptions: jsonSafeClone(parsed.options, new Set(), new Set(["configFile"])),
            rootFileNames: parsed.fileNames.map((fileName) => projectPath(cwd, fileName)).sort(),
            analyzedRootFileNames: programRootNames.map((fileName) => projectPath(cwd, fileName)).sort(),
            projectReferences: jsonSafeClone(parsed.projectReferences ?? []),
            outputRoots,
            detail,
            authoritativeEngine: "typescript-program-type-checker"
        },
        diagnostics,
        files,
        summary
    };
    return {
        ...base,
        hm: aggregateHm(files)
    };
}

function createContext(cwd, configPath, parsed, program, checker, sourceFiles, includeSourceText, detail, hmEnabled) {
    const canonicalFileName = ts.sys.useCaseSensitiveFileNames
        ? (value) => value
        : (value) => value.toLowerCase();
    return {
        cwd,
        configPath,
        parsed,
        program,
        checker,
        sourceFiles,
        includeSourceText,
        detail,
        hmEnabled,
        moduleResolutionCache: ts.createModuleResolutionCache(cwd, canonicalFileName, parsed.options),
        functionIdByKey: new Map(),
        functionNodesByFile: new Map(),
        runtimeModelByFile: new Map(),
        runtimeRootOwnerByNode: new Map(),
        classConstructorTargetByNode: new Map(),
        symbolIdCache: new Map()
    };
}

function isProjectSourceFile(sourceFile, cwd) {
    if (sourceFile.isDeclarationFile) {
        return false;
    }
    const absolute = resolve(sourceFile.fileName);
    const rel = relative(cwd, absolute);
    if (rel !== "" && (rel.startsWith("..") || isAbsolute(rel))) {
        return false;
    }
    try {
        const physicalRoot = realpathSync(cwd);
        const physicalFile = realpathSync(absolute);
        const physicalRelative = relative(physicalRoot, physicalFile);
        return physicalRelative === "" ||
            (!physicalRelative.startsWith("..") && !isAbsolute(physicalRelative));
    } catch {
        return false;
    }
}

function normalizeOutputRoots(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    const seen = new Set();
    const roots = [];
    for (const entry of value) {
        if (typeof entry !== "string") continue;
        const normalized = entry.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/^\/+|\/+$/gu, "");
        if (normalized === "" || normalized === ".") {
            return [];
        }
        if (!seen.has(normalized)) {
            seen.add(normalized);
            roots.push(normalized);
        }
    }
    return roots.sort();
}

function pathMatchesOutputRoots(path, roots) {
    return roots.length === 0 || roots.some((root) => path === root || path.startsWith(`${root}/`));
}

function indexFunctionLikeNodes(context) {
    for (const sourceFile of context.sourceFiles) {
        const entries = [];
        walk(sourceFile, (node) => {
            if (!isRuntimeFunctionLike(node)) {
                return;
            }
            const id = functionId(node, context);
            context.functionIdByKey.set(nodeKey(node, context), id);
            entries.push(node);
        });
        context.functionNodesByFile.set(sourceFile, entries);
    }
}

function indexRuntimeOwners(context) {
    const descriptorsByFile = new Map();
    for (const sourceFile of context.sourceFiles) {
        const moduleOwnerId = runtimeOwnerId("module-init", sourceFile, context);
        context.runtimeRootOwnerByNode.set(sourceFile, moduleOwnerId);
        const moduleRoots = moduleRuntimeRoots(sourceFile);
        for (const root of moduleRoots) {
            context.runtimeRootOwnerByNode.set(root.node, moduleOwnerId);
        }
        const descriptors = [];
        walk(sourceFile, (node) => {
            if ((!ts.isClassDeclaration(node) && !ts.isClassExpression(node)) ||
                nodeIsAmbient(node)) {
                return;
            }
            const constructors = node.members.filter(ts.isConstructorDeclaration);
            const implementation = constructors.find((member) => member.body !== undefined);
            const staticRoots = classStaticRuntimeRoots(node);
            const instanceRoots = node.members
                .filter((member) => ts.isPropertyDeclaration(member) &&
                    !hasModifier(member, ts.SyntaxKind.StaticKeyword) &&
                    member.initializer !== undefined)
                .map((member) => ({ node: member.initializer, role: "instance-field-initializer" }));
            const classStart = node.getStart(sourceFile, false);
            const implicitConstructorId = implementation === undefined
                ? `runtime:implicit-constructor:${projectPath(context.cwd, sourceFile.fileName)}:${String(classStart)}`
                : null;
            const constructorTargetId = implementation === undefined
                ? implicitConstructorId
                : functionId(implementation, context);
            const descriptor = {
                node,
                sourceFile,
                classStart,
                name: classRuntimeName(node),
                classSymbolId: stableSymbolId(
                    node.name === undefined ? node.symbol : context.checker.getSymbolAtLocation(node.name),
                    context
                ),
                implementation,
                constructorTargetId,
                implicitConstructorId,
                staticRoots,
                instanceRoots,
                staticOwnerId: staticRoots.length === 0
                    ? null
                    : `runtime:class-static-init:${projectPath(context.cwd, sourceFile.fileName)}:${String(classStart)}`,
                instanceOwnerId: instanceRoots.length === 0
                    ? null
                    : `runtime:class-instance-init:${projectPath(context.cwd, sourceFile.fileName)}:${String(classStart)}`
            };
            descriptors.push(descriptor);
            context.classConstructorTargetByNode.set(node, constructorTargetId);
        });
        descriptorsByFile.set(sourceFile, { moduleOwnerId, moduleRoots, descriptors });
    }

    // Runtime expression roots are semantic boundaries just like functions.
    // Index all files before resolving enclosing owners so nested classes in a
    // field initializer/static block attach to that runtime unit, not the file.
    for (const { descriptors } of descriptorsByFile.values()) {
        for (const descriptor of descriptors) {
            if (descriptor.staticOwnerId !== null) {
                for (const root of descriptor.staticRoots) {
                    context.runtimeRootOwnerByNode.set(root.node, descriptor.staticOwnerId);
                }
            }
            if (descriptor.instanceOwnerId !== null) {
                for (const root of descriptor.instanceRoots) {
                    context.runtimeRootOwnerByNode.set(root.node, descriptor.instanceOwnerId);
                }
            }
        }
    }
    indexObjectLiteralComputedNameOwners(context);

    for (const sourceFile of context.sourceFiles) {
        const indexed = descriptorsByFile.get(sourceFile);
        if (indexed === undefined) continue;
        const owners = [runtimeOwnerRecord({
            id: indexed.moduleOwnerId,
            kind: "module-init",
            name: `<module:${projectPath(context.cwd, sourceFile.fileName)}>`,
            node: sourceFile,
            roots: indexed.moduleRoots,
            calls: [],
            phase: "module",
            context
        })];
        const edges = [];
        for (const descriptor of indexed.descriptors) {
            if (descriptor.implicitConstructorId !== null) {
                const base = baseConstructorResolution(descriptor.node, context);
                const implicitCalls = base.inconclusive
                    ? [serializeInconclusiveImplicitSuper(
                        descriptor.node,
                        descriptor.implicitConstructorId,
                        base.expression,
                        context
                    )]
                    : [];
                owners.push(runtimeOwnerRecord({
                    id: descriptor.implicitConstructorId,
                    kind: "implicit-constructor",
                    name: `${descriptor.name}.constructor`,
                    node: descriptor.node.name ?? descriptor.node,
                    roots: [],
                    calls: implicitCalls,
                    phase: "class-instance",
                    context,
                    descriptor
                }));
                if (base.targetId !== null) {
                    edges.push(runtimeEdge(
                        descriptor.implicitConstructorId,
                        base.targetId,
                        "implicit-super",
                        descriptor.node.name ?? descriptor.node,
                        context
                    ));
                }
            }
            if (descriptor.staticOwnerId !== null) {
                const calls = runtimeRootCalls(
                    descriptor.staticRoots,
                    descriptor.staticOwnerId,
                    "class-static",
                    context
                );
                owners.push(runtimeOwnerRecord({
                    id: descriptor.staticOwnerId,
                    kind: "class-static-init",
                    name: `${descriptor.name}.<static-init>`,
                    node: descriptor.node,
                    roots: descriptor.staticRoots,
                    calls,
                    phase: "class-static",
                    context,
                    descriptor
                }));
                const enclosingOwner = nearestRuntimeOwner(descriptor.node, context);
                if (enclosingOwner !== null) {
                    edges.push(runtimeEdge(
                        enclosingOwner,
                        descriptor.staticOwnerId,
                        "class-definition",
                        descriptor.node.name ?? descriptor.node,
                        context
                    ));
                }
            }
            if (descriptor.instanceOwnerId !== null) {
                const calls = runtimeRootCalls(
                    descriptor.instanceRoots,
                    descriptor.instanceOwnerId,
                    "class-instance",
                    context
                );
                owners.push(runtimeOwnerRecord({
                    id: descriptor.instanceOwnerId,
                    kind: "class-instance-init",
                    name: `${descriptor.name}.<instance-init>`,
                    node: descriptor.node,
                    roots: descriptor.instanceRoots,
                    calls,
                    phase: "class-instance",
                    context,
                    descriptor
                }));
                edges.push(runtimeEdge(
                    descriptor.constructorTargetId,
                    descriptor.instanceOwnerId,
                    "instance-initialization",
                    descriptor.node.name ?? descriptor.node,
                    context
                ));
            }
        }
        context.runtimeModelByFile.set(sourceFile, {
            moduleOwnerId: indexed.moduleOwnerId,
            owners: owners.sort(compareLocatedFacts),
            edges: edges.sort(compareRuntimeEdges)
        });
    }
}

function indexObjectLiteralComputedNameOwners(context) {
    for (const nodes of context.functionNodesByFile.values()) {
        for (const node of nodes) {
            if (!ts.isObjectLiteralExpression(node.parent) ||
                node.name === undefined || !ts.isComputedPropertyName(node.name)) {
                continue;
            }
            // The method/accessor body is deferred, but its computed name runs
            // while the surrounding object literal is evaluated.
            const owner = nearestRuntimeOwner(node.parent, context);
            if (owner !== null) {
                context.runtimeRootOwnerByNode.set(node.name.expression, owner);
            }
        }
    }
}

function moduleRuntimeRoots(sourceFile) {
    const roots = [];
    for (const statement of sourceFile.statements) {
        if (nodeIsAmbient(statement) || ts.isImportDeclaration(statement) ||
            ts.isImportEqualsDeclaration(statement) || ts.isExportDeclaration(statement) ||
            ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) ||
            ts.isEmptyStatement(statement)) {
            continue;
        }
        if (ts.isVariableStatement(statement)) {
            for (const declaration of statement.declarationList.declarations) {
                if (declaration.initializer !== undefined) {
                    roots.push({ node: declaration.initializer, role: "module-variable-initializer" });
                }
            }
            continue;
        }
        if (ts.isFunctionDeclaration(statement)) {
            if (statement.body !== undefined) {
                roots.push({ node: statement, role: "module-function-binding" });
            }
            continue;
        }
        if (ts.isExportAssignment(statement)) {
            roots.push({ node: statement.expression, role: "module-export-expression" });
            continue;
        }
        roots.push({ node: statement, role: ts.isClassDeclaration(statement)
            ? "module-class-definition"
            : "module-statement" });
    }
    return roots;
}

function nodeIsAmbient(node) {
    let current = node;
    while (current !== undefined) {
        if ((current.flags & ts.NodeFlags.Ambient) !== 0 ||
            hasModifier(current, ts.SyntaxKind.DeclareKeyword)) {
            return true;
        }
        current = current.parent;
    }
    return false;
}

function classStaticRuntimeRoots(node) {
    const roots = [];
    for (const expression of decoratorExpressions(node)) {
        roots.push({ node: expression, role: "class-decorator", decoratorApplication: true });
    }
    for (const clause of node.heritageClauses ?? []) {
        if (clause.token !== ts.SyntaxKind.ExtendsKeyword) continue;
        for (const type of clause.types) {
            roots.push({ node: type.expression, role: "class-heritage" });
        }
    }
    for (const member of node.members) {
        for (const expression of decoratorExpressions(member)) {
            roots.push({ node: expression, role: "member-decorator", decoratorApplication: true });
        }
        for (const parameter of member.parameters ?? []) {
            for (const expression of decoratorExpressions(parameter)) {
                roots.push({ node: expression, role: "parameter-decorator", decoratorApplication: true });
            }
        }
        if (member.name !== undefined && ts.isComputedPropertyName(member.name)) {
            roots.push({ node: member.name.expression, role: "computed-member-name" });
        }
        if (ts.isPropertyDeclaration(member) &&
            hasModifier(member, ts.SyntaxKind.StaticKeyword) &&
            member.initializer !== undefined) {
            roots.push({ node: member.initializer, role: "static-field-initializer" });
        } else if (ts.isClassStaticBlockDeclaration(member)) {
            roots.push({ node: member.body, role: "static-block" });
        }
    }
    const seen = new Set();
    return roots.filter((entry) => {
        if (seen.has(entry.node)) return false;
        seen.add(entry.node);
        return true;
    });
}

function decoratorExpressions(node) {
    if (typeof ts.canHaveDecorators === "function" && ts.canHaveDecorators(node)) {
        return (ts.getDecorators(node) ?? []).map((decorator) => decorator.expression);
    }
    return (node.modifiers ?? [])
        .filter(ts.isDecorator)
        .map((decorator) => decorator.expression);
}

function runtimeRootCalls(roots, ownerId, phase, context) {
    const explicitCalls = roots.flatMap((entry) => collectCalls(entry.node, context, undefined));
    const implicitDecoratorCalls = roots
        .filter((entry) => entry.decoratorApplication === true)
        .map((entry) => serializeDecoratorApplication(entry.node, context));
    return withRuntimeCallOwner(
        dedupeCalls([...explicitCalls, ...implicitDecoratorCalls]),
        ownerId,
        phase
    );
}

function serializeDecoratorApplication(expression, context) {
    const rawSymbol = symbolAtDecoratorExpression(expression, context);
    const symbol = resolveAlias(rawSymbol, context.checker);
    const type = safeGetTypeAtLocation(expression, context);
    const signatures = type?.getCallSignatures?.() ?? [];
    const signatureDeclarations = signatures
        .map((signature) => signature.declaration)
        .filter((declaration) => declaration !== undefined);
    const symbolDeclarations = symbol?.getDeclarations?.() ?? [];
    const producedByFactoryCall = decoratorExpressionIsCall(expression);
    const declarations = [...new Set(producedByFactoryCall
        ? signatureDeclarations
        : [...signatureDeclarations, ...symbolDeclarations])];
    const targetId = functionTargetFromDeclarations(declarations, context);
    const producerExternal = symbolDeclarations.length !== 0 &&
        symbolDeclarations.every((declaration) => !isSerializableProjectDeclaration(declaration, context));
    const external = targetId === null && producerExternal && declarations.length !== 0 &&
        declarations.every((declaration) => !isSerializableProjectDeclaration(declaration, context));
    const span = spanFromNode(expression, context);
    return {
        id: `call:decorator-application:${span.path}:${String(span.start.offset)}`,
        kind: "decorator-application",
        name: `@${compactText(expression.getText(expression.getSourceFile()), 240)}`,
        qualifiedName: symbol === undefined ? null : safeSymbolToString(symbol, expression, context),
        enclosingFunctionId: null,
        callerId: null,
        symbolId: stableSymbolId(symbol, context),
        targetId,
        returnType: "decorator-application-result",
        receiverType: null,
        arguments: ["<decorated-value>", "<decorator-context>"],
        argumentIdentifiers: [],
        argumentTypes: [],
        typeArguments: [],
        optional: false,
        implicitRuntime: true,
        external,
        inconclusiveRuntime: targetId === null && !external,
        resolutionStatus: targetId !== null ? "resolved" : external ? "external" : "inconclusive",
        resolvedBy: "typescript-decorator-semantics",
        span
    };
}

function decoratorExpressionIsCall(expression) {
    let current = expression;
    while (ts.isParenthesizedExpression(current)) current = current.expression;
    return ts.isCallExpression(current);
}

function symbolAtDecoratorExpression(expression, context) {
    let current = expression;
    while (ts.isParenthesizedExpression(current)) current = current.expression;
    if (ts.isCallExpression(current)) {
        return context.checker.getSymbolAtLocation(current.expression);
    }
    return symbolAtCallee(current, context);
}

function withRuntimeCallOwner(calls, ownerId, phase) {
    return calls.map((call) => ({
        ...call,
        enclosingFunctionId: ownerId,
        callerId: ownerId,
        runtimeOwnerId: ownerId,
        executionPhase: phase
    }));
}

function runtimeOwnerRecord({ id, kind, name, node, roots, calls, phase, context, descriptor }) {
    return {
        id,
        kind,
        name,
        qualifiedName: `${projectPath(context.cwd, node.getSourceFile().fileName)}::${name}`,
        path: projectPath(context.cwd, node.getSourceFile().fileName),
        classSymbolId: descriptor?.classSymbolId ?? null,
        explicitConstructorId: descriptor?.implementation === undefined
            ? null
            : functionId(descriptor.implementation, context),
        synthetic: true,
        hasBody: true,
        parameters: [],
        span: spanFromNode(node, context),
        metricSpans: roots.map((entry) => ({
            role: entry.role,
            span: spanFromNode(entry.node, context)
        })),
        executionPhase: phase,
        calls
    };
}

function runtimeEdge(from, to, kind, node, context) {
    const span = spanFromNode(node, context);
    return {
        id: `runtime-edge:${span.path}:${String(span.start.offset)}:${kind}:${from}:${to}`,
        from,
        to,
        kind,
        edgeKind: kind,
        synthetic: true,
        executionPhase: kind === "class-definition" ? "class-static" : "class-instance",
        span
    };
}

function nearestRuntimeOwner(node, context) {
    let current = node;
    while (current !== undefined) {
        if (isRuntimeFunctionLike(current)) return functionId(current, context);
        const runtimeOwner = context.runtimeRootOwnerByNode.get(current);
        if (runtimeOwner !== undefined) return runtimeOwner;
        current = current.parent;
    }
    return null;
}

function baseConstructorResolution(node, context) {
    const extendsClause = (node.heritageClauses ?? [])
        .find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword);
    const expression = extendsClause?.types[0]?.expression;
    if (expression === undefined) {
        return { expression: undefined, targetId: null, inconclusive: false, external: false };
    }
    const symbol = resolveAlias(context.checker.getSymbolAtLocation(expression), context.checker);
    const symbolDeclarations = symbol?.getDeclarations?.() ?? [];
    const type = safeGetTypeAtLocation(expression, context);
    const signatureDeclarations = (type?.getConstructSignatures?.() ?? [])
        .map((signature) => signature.declaration)
        .filter((declaration) => declaration !== undefined);
    const declarations = [...new Set([...signatureDeclarations, ...symbolDeclarations])];
    const targetId = constructorTargetFromDeclarations(declarations, context);
    const external = targetId === null && declarations.length !== 0 &&
        declarations.every((declaration) => !isSerializableProjectDeclaration(declaration, context));
    return {
        expression,
        targetId,
        external,
        inconclusive: targetId === null && !external
    };
}

function serializeInconclusiveImplicitSuper(node, ownerId, expression, context) {
    const location = expression ?? node.name ?? node;
    const span = spanFromNode(location, context);
    return {
        id: `call:implicit-super:${span.path}:${String(span.start.offset)}`,
        kind: "implicit-super",
        name: "super<implicit>",
        qualifiedName: null,
        enclosingFunctionId: ownerId,
        callerId: ownerId,
        symbolId: null,
        targetId: null,
        returnType: null,
        receiverType: null,
        arguments: ["...constructor-arguments"],
        argumentIdentifiers: [],
        argumentTypes: [],
        typeArguments: [],
        optional: false,
        implicitRuntime: true,
        inconclusiveRuntime: true,
        resolutionStatus: "inconclusive",
        resolvedBy: "typescript-implicit-constructor-semantics",
        span
    };
}

function classRuntimeName(node) {
    if (node.name !== undefined) {
        return compactText(node.name.getText(node.getSourceFile()), 120);
    }
    const parent = node.parent;
    if ((ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent) ||
        ts.isPropertyAssignment(parent)) && parent.initializer === node) {
        return compactText(parent.name.getText(parent.getSourceFile()), 120);
    }
    if (ts.isBinaryExpression(parent) && parent.right === node) {
        return compactText(parent.left.getText(parent.getSourceFile()), 120);
    }
    return `<anonymous-class@${String(node.getStart(node.getSourceFile(), false))}>`;
}

function runtimeOwnerId(kind, node, context) {
    return `runtime:${kind}:${projectPath(context.cwd, node.getSourceFile().fileName)}:${String(node.getStart(node.getSourceFile(), false))}`;
}

function compareRuntimeEdges(left, right) {
    return left.span.path.localeCompare(right.span.path) ||
        left.span.start.offset - right.span.start.offset ||
        left.kind.localeCompare(right.kind) ||
        left.from.localeCompare(right.from) ||
        left.to.localeCompare(right.to);
}

function emptyRuntimeModel(sourceFile, context) {
    const moduleOwnerId = runtimeOwnerId("module-init", sourceFile, context);
    return {
        moduleOwnerId,
        owners: [runtimeOwnerRecord({
            id: moduleOwnerId,
            kind: "module-init",
            name: `<module:${projectPath(context.cwd, sourceFile.fileName)}>`,
            node: sourceFile,
            roots: [],
            calls: [],
            phase: "module",
            context
        })],
        edges: []
    };
}

function serializeSourceFile(sourceFile, context) {
    const fullExports = serializeExports(sourceFile, context);
    const exportContext = createExportContext(fullExports);
    const exports = context.detail === "full"
        ? fullExports
        : fullExports.map((entry) => ({
            ...entry,
            type: null,
            declarationSpans: []
        }));
    const imports = collectImports(sourceFile, context);
    const allDeclarations = collectDeclarations(sourceFile, context, exportContext);
    const declarations = context.detail === "policy"
        ? allDeclarations.filter((declaration) => declaration.exported)
        : allDeclarations;
    const functions = (context.functionNodesByFile.get(sourceFile) ?? [])
        .map((node) => serializeFunction(node, context, exportContext));
    const runtimeModel = context.runtimeModelByFile.get(sourceFile) ?? emptyRuntimeModel(sourceFile, context);
    const topLevelCalls = withRuntimeCallOwner(
        collectCalls(sourceFile, context, undefined),
        runtimeModel.moduleOwnerId,
        "module"
    );
    const runtimeOwners = runtimeModel.owners.map((owner) =>
        owner.kind === "module-init" ? { ...owner, calls: topLevelCalls } : owner);
    const initializationCalls = runtimeOwners
        .filter((owner) => owner.kind !== "module-init")
        .flatMap((owner) => owner.calls);
    const nonRuntimeSpans = collectNonRuntimeSpans(sourceFile, context);
    const typeEscapes = collectTypeEscapes(sourceFile, context);
    const regexps = collectRegexps(sourceFile, context);
    const fullTypeFacts = collectTypeFacts(sourceFile, context);
    const typeFacts = context.detail === "full"
        ? fullTypeFacts
        : fullTypeFacts.map((fact) => ({
            id: fact.id,
            kind: fact.kind,
            name: fact.name,
            symbolId: fact.symbolId,
            declaredType: fact.declaredType,
            inferredType: fact.inferredType,
            typeFlags: fact.typeFlags,
            span: fact.span
        }));
    const compact = context.detail !== "full";
    const comments = compact ? [] : collectComments(sourceFile, context);
    const syntaxDiagnostics = compact
        ? []
        : context.program.getSyntacticDiagnostics(sourceFile)
            .map((diagnostic) => serializeDiagnostic(diagnostic, "syntactic", context));
    const readonlyCount = countReadonlyNodes(sourceFile);
    const inference = context.hmEnabled
        ? inferHmForSourceFile(sourceFile, context)
        : disabledHmInference();
    const inferenceDiagnosticCount = inference.diagnostics.length;
    const inferenceDiagnostics = compact ? [] : inference.diagnostics;

    return {
        path: projectPath(context.cwd, sourceFile.fileName),
        languageVariant: sourceFile.languageVariant === ts.LanguageVariant.JSX ? "jsx" : "standard",
        scriptKind: scriptKindName(sourceFile.scriptKind),
        module: ts.isExternalModule(sourceFile),
        span: spanFromOffsets(sourceFile, 0, sourceFile.text.length, context),
        sourceText: context.includeSourceText ? sourceFile.text : undefined,
        imports,
        exports,
        declarations,
        functions,
        runtimeOwners,
        syntheticEdges: runtimeModel.edges,
        nonRuntimeSpans,
        topLevelCalls,
        initializationCalls,
        typeEscapes,
        regexps,
        typeFacts,
        comments,
        syntaxDiagnostics,
        readonlyCount,
        inferenceFacts: inference.facts,
        inferenceDiagnostics,
        inferenceStats: inference.stats,
        inferenceEngine: inference.engine,
        metrics: {
            characters: sourceFile.text.length,
            lines: sourceFile.getLineStarts().length,
            imports: imports.length,
            exports: exports.length,
            declarations: declarations.length,
            functions: functions.length,
            runtimeOwners: runtimeOwners.length,
            syntheticEdges: runtimeModel.edges.length,
            calls: functions.reduce(
                (total, entry) => total + entry.calls.length,
                topLevelCalls.length + initializationCalls.length
            ),
            typeEscapes: typeEscapes.length,
            regexps: regexps.length,
            typeFacts: typeFacts.length,
            readonly: readonlyCount,
            inferenceFacts: inference.facts.length,
            inferenceDiagnostics: inferenceDiagnosticCount,
            nonRuntimeSpanCount: nonRuntimeSpans.length
        }
    };
}

function collectNonRuntimeSpans(sourceFile, context) {
    const candidates = [];
    const add = (node) => {
        const span = spanFromNode(node, context);
        candidates.push({ span, start: span.start.offset, end: span.end.offset });
    };
    walk(sourceFile, (node) => {
        if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) ||
            ts.isTypeParameterDeclaration(node) ||
            (ts.isHeritageClause(node) && node.token === ts.SyntaxKind.ImplementsKeyword)) {
            add(node);
            return;
        }
        if ((node.flags & ts.NodeFlags.Ambient) !== 0 && isRuntimeDeclaration(node)) {
            add(node);
            return;
        }
        if (ts.isTypeNode(node) && !ts.isExpressionWithTypeArguments(node)) {
            add(node);
        }
    });
    candidates.sort((left, right) => left.start - right.start || right.end - left.end);
    const outermost = [];
    for (const candidate of candidates) {
        const previous = outermost.at(-1);
        if (previous !== undefined && candidate.start >= previous.start && candidate.end <= previous.end) {
            continue;
        }
        outermost.push(candidate);
    }
    return outermost.map((entry) => entry.span);
}

function isRuntimeDeclaration(node) {
    return ts.isClassDeclaration(node) || ts.isFunctionDeclaration(node) ||
        ts.isVariableStatement(node) || ts.isVariableDeclaration(node) ||
        ts.isModuleDeclaration(node) || ts.isEnumDeclaration(node);
}

function createExportContext(exports) {
    return {
        symbolIds: new Set(exports.flatMap((entry) => [entry.symbolId, entry.targetSymbolId].filter(Boolean))),
        declarationKeys: new Set(exports.flatMap((entry) => entry.declarationSpans.map(spanKey)))
    };
}

function serializeExports(sourceFile, context) {
    const moduleSymbol = context.checker.getSymbolAtLocation(sourceFile) ?? sourceFile.symbol;
    if (moduleSymbol === undefined) {
        return [];
    }
    let symbols = [];
    try {
        symbols = context.checker.getExportsOfModule(moduleSymbol);
    } catch {
        return [];
    }
    return symbols.map((exportSymbol) => {
        const target = resolveAlias(exportSymbol, context.checker);
        const declarations = target?.getDeclarations?.() ?? exportSymbol.getDeclarations?.() ?? [];
        const declarationSpans = declarations
            .filter((declaration) => declaration.getSourceFile !== undefined)
            .map((declaration) => spanFromNode(declaration.name ?? declaration, context));
        const location = exportSymbol.valueDeclaration ?? exportSymbol.declarations?.[0] ?? declarations[0] ?? sourceFile;
        const type = safeTypeOfSymbol(target ?? exportSymbol, location, context);
        return {
            name: exportSymbol.getName(),
            symbolId: stableSymbolId(exportSymbol, context),
            targetSymbolId: stableSymbolId(target, context),
            targetId: functionTargetFromDeclarations(declarations, context),
            typeOnly: !hasRuntimeValueDeclaration(target ?? exportSymbol),
            type,
            span: spanFromNode(location.name ?? location, context),
            declarationSpans
        };
    }).sort(compareLocatedNames);
}

function collectImports(sourceFile, context) {
    const imports = [];
    walk(sourceFile, (node) => {
        if (ts.isImportDeclaration(node) && isModuleText(node.moduleSpecifier)) {
            imports.push(serializeImportDeclaration(node, sourceFile, context));
            return;
        }
        if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined && isModuleText(node.moduleSpecifier)) {
            imports.push(serializeExportDeclaration(node, sourceFile, context));
            return;
        }
        if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
            const expression = node.moduleReference.expression;
            if (expression !== undefined && isModuleText(expression)) {
                imports.push(moduleFact("import-equals", expression.text, false, expression, node, sourceFile, context, [{
                    imported: "export=",
                    local: node.name.text,
                    typeOnly: node.isTypeOnly,
                    symbolId: stableSymbolId(context.checker.getSymbolAtLocation(node.name), context)
                }]));
            }
            return;
        }
        if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && isModuleText(node.argument.literal)) {
            imports.push(moduleFact("import-type", node.argument.literal.text, true, node.argument.literal, node, sourceFile, context, []));
            return;
        }
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            const argument = node.arguments[0];
            const specifier = staticString(argument);
            imports.push(moduleFact("dynamic", specifier, false, argument ?? node.expression, node, sourceFile, context, []));
        }
    });
    return imports.sort(compareLocatedFacts);
}

function serializeImportDeclaration(node, sourceFile, context) {
    const clause = node.importClause;
    const bindings = [];
    if (clause?.name !== undefined) {
        bindings.push({
            imported: "default",
            local: clause.name.text,
            typeOnly: clause.isTypeOnly,
            symbolId: stableSymbolId(context.checker.getSymbolAtLocation(clause.name), context)
        });
    }
    const named = clause?.namedBindings;
    if (named !== undefined && ts.isNamespaceImport(named)) {
        bindings.push({
            imported: "*",
            local: named.name.text,
            typeOnly: clause?.isTypeOnly ?? false,
            symbolId: stableSymbolId(context.checker.getSymbolAtLocation(named.name), context)
        });
    } else if (named !== undefined) {
        for (const element of named.elements) {
            bindings.push({
                imported: (element.propertyName ?? element.name).text,
                local: element.name.text,
                typeOnly: Boolean(clause?.isTypeOnly || element.isTypeOnly),
                symbolId: stableSymbolId(context.checker.getSymbolAtLocation(element.name), context)
            });
        }
    }
    const typeOnly = clause !== undefined && (clause.isTypeOnly || (
        clause.name === undefined && bindings.length !== 0 && bindings.every((entry) => entry.typeOnly)
    ));
    return moduleFact("static", node.moduleSpecifier.text, typeOnly, node.moduleSpecifier, node, sourceFile, context, bindings);
}

function serializeExportDeclaration(node, sourceFile, context) {
    const bindings = [];
    if (node.exportClause !== undefined && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
            const exported = element.name.text;
            bindings.push({
                imported: (element.propertyName ?? element.name).text,
                local: exported,
                typeOnly: Boolean(node.isTypeOnly || element.isTypeOnly),
                symbolId: stableSymbolId(context.checker.getSymbolAtLocation(element.name), context)
            });
        }
    } else if (node.exportClause !== undefined && ts.isNamespaceExport(node.exportClause)) {
        bindings.push({
            imported: "*",
            local: node.exportClause.name.text,
            typeOnly: node.isTypeOnly,
            symbolId: stableSymbolId(context.checker.getSymbolAtLocation(node.exportClause.name), context)
        });
    }
    const typeOnly = node.isTypeOnly || (bindings.length !== 0 && bindings.every((entry) => entry.typeOnly));
    return moduleFact("re-export", node.moduleSpecifier.text, typeOnly, node.moduleSpecifier, node, sourceFile, context, bindings);
}

function moduleFact(kind, specifier, typeOnly, specifierNode, statementNode, sourceFile, context, bindings) {
    const resolution = typeof specifier === "string"
        ? resolveModule(specifier, sourceFile, context)
        : emptyModuleResolution();
    return {
        specifier,
        typeOnly: Boolean(typeOnly),
        kind,
        resolved: resolution.resolved,
        external: resolution.external,
        extension: resolution.extension,
        packageId: resolution.packageId,
        bindings,
        span: spanFromNode(specifierNode, context),
        statementSpan: spanFromNode(statementNode, context)
    };
}

function resolveModule(specifier, sourceFile, context) {
    let result;
    try {
        result = ts.resolveModuleName(
            specifier,
            sourceFile.fileName,
            context.parsed.options,
            ts.sys,
            context.moduleResolutionCache
        ).resolvedModule;
    } catch {
        result = undefined;
    }
    if (result === undefined) {
        return emptyModuleResolution();
    }
    const absolute = resolve(result.resolvedFileName);
    const rel = relative(context.cwd, absolute);
    const inside = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
    const nodeModules = rel.replaceAll("\\", "/").split("/").includes("node_modules");
    const external = Boolean(result.isExternalLibraryImport || !inside || nodeModules);
    return {
        resolved: external ? null : projectPath(context.cwd, absolute),
        external,
        extension: result.extension === undefined ? null : String(result.extension),
        packageId: result.packageId === undefined
            ? null
            : [result.packageId.name, result.packageId.subModuleName, result.packageId.version]
                .filter((part) => part !== undefined && part !== "")
                .join("/")
    };
}

function emptyModuleResolution() {
    return {
        resolved: null,
        external: false,
        extension: null,
        packageId: null
    };
}

function collectDeclarations(sourceFile, context, exportContext) {
    const declarations = [];
    walk(sourceFile, (node) => {
        const kind = declarationKind(node);
        if (kind === undefined) {
            return;
        }
        const nameNode = declarationNameNode(node);
        const symbol = nameNode === undefined ? undefined : context.checker.getSymbolAtLocation(nameNode);
        const inferredType = safeTypeAtLocation(nameNode ?? node, context);
        const span = spanFromNode(node, context);
        const symbolId = stableSymbolId(symbol, context);
        declarations.push({
            id: `decl:${span.path}:${String(span.start.offset)}`,
            kind,
            syntaxKind: ts.SyntaxKind[node.kind] ?? String(node.kind),
            name: declarationName(node),
            qualifiedName: qualifiedNodeName(node, context),
            symbolId,
            exported: declarationIsExported(node, symbolId, span, exportContext),
            defaultExport: hasModifier(node, ts.SyntaxKind.DefaultKeyword),
            documented: isDocumented(node, symbol, context),
            documentation: context.detail === "full" ? documentationForSymbol(symbol, context) : "",
            ambient: hasModifier(node, ts.SyntaxKind.DeclareKeyword),
            typeOnly: declarationIsTypeOnly(node),
            declaredType: declaredTypeText(node),
            inferredType,
            span,
            nameSpan: nameNode === undefined ? span : spanFromNode(nameNode, context)
        });
    });
    return declarations.sort(compareLocatedFacts);
}

function serializeFunction(node, context, exportContext) {
    const sourceFile = node.getSourceFile();
    const span = spanFromNode(node, context);
    const nameNode = node.name;
    const symbol = functionSymbol(node, context);
    const signature = safeSignatureForDeclaration(node, context);
    const parameters = (node.parameters ?? []).map((parameter) => serializeParameter(parameter, context));
    const calls = collectCalls(node, context, node);
    const symbolId = stableSymbolId(symbol, context);
    const compact = context.detail !== "full";
    return {
        id: functionId(node, context),
        name: functionName(node),
        qualifiedName: qualifiedNodeName(node, context),
        kind: functionKind(node),
        syntaxKind: ts.SyntaxKind[node.kind] ?? String(node.kind),
        symbolId,
        exported: declarationIsExported(node, symbolId, span, exportContext),
        documented: isDocumented(node, symbol, context),
        documentation: compact ? "" : documentationForSymbol(symbol, context),
        defaultExport: hasModifier(node, ts.SyntaxKind.DefaultKeyword),
        async: hasModifier(node, ts.SyntaxKind.AsyncKeyword),
        generator: node.asteriskToken !== undefined,
        hasBody: node.body !== undefined,
        span,
        nameSpan: nameNode === undefined ? null : spanFromNode(nameNode, context),
        nameComputed: nameNode !== undefined && ts.isComputedPropertyName(nameNode),
        bodySpan: node.body === undefined ? null : spanFromNode(node.body, context),
        parameters,
        typeParameters: (node.typeParameters ?? []).map((parameter) => ({
            name: parameter.name.text,
            constraint: parameter.constraint?.getText(sourceFile) ?? null,
            default: parameter.default?.getText(sourceFile) ?? null,
            span: spanFromNode(parameter, context)
        })),
        declaredReturnType: node.type?.getText(sourceFile) ?? null,
        returnTypeSpan: node.type === undefined ? null : spanFromNode(node.type, context),
        returnType: signature === undefined ? null : safeTypeToString(context.checker.getReturnTypeOfSignature(signature), node, context),
        signature: signature === undefined ? null : safeSignatureToString(signature, node, context),
        calls
    };
}

function serializeParameter(parameter, context) {
    const name = parameter.name.getText(parameter.getSourceFile());
    const type = safeTypeAtLocation(parameter.name, context);
    return {
        name,
        symbolId: stableSymbolId(context.checker.getSymbolAtLocation(parameter.name), context),
        declaredType: parameter.type?.getText(parameter.getSourceFile()) ?? null,
        inferredType: type,
        optional: parameter.questionToken !== undefined || parameter.initializer !== undefined,
        rest: parameter.dotDotDotToken !== undefined,
        hasDefault: parameter.initializer !== undefined,
        initializerSpan: parameter.initializer === undefined
            ? null
            : spanFromNode(parameter.initializer, context),
        span: spanFromNode(parameter, context),
        nameSpan: context.detail === "full" ? spanFromNode(parameter.name, context) : undefined
    };
}

function collectCalls(rootNode, context, ownerFunction) {
    const calls = [];
    const visit = (node) => {
        // Creating a closure does not execute its body. Class definition-time
        // expressions are serialized by their dedicated runtime owner.
        if (isRuntimeFunctionLike(node)) {
            if (ts.isObjectLiteralExpression(node.parent) &&
                node.name !== undefined && ts.isComputedPropertyName(node.name)) {
                visit(node.name.expression);
            }
            return;
        }
        if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) return;
        if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
            calls.push(serializeCall(node, context, ownerFunction));
        }
        if (ts.isTaggedTemplateExpression(node)) {
            calls.push(serializeTaggedTemplateCall(node, context, ownerFunction));
        }
        if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)) {
            const sourceType = safeGetTypeAtLocation(node.initializer ?? node.name, context);
            calls.push(...serializeObjectDestructuringGets(node.name, sourceType, context, ownerFunction));
        }
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isObjectLiteralExpression(node.left)) {
            calls.push(...serializeObjectDestructuringGets(
                node.left,
                safeGetTypeAtLocation(node.right, context),
                context,
                ownerFunction
            ));
        }
        if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
            calls.push(...serializeAccessorInvocations(node, context, ownerFunction));
        }
        ts.forEachChild(node, visit);
    };
    if (ownerFunction === undefined && ts.isSourceFile(rootNode)) {
        for (const statement of rootNode.statements ?? []) {
            visit(statement);
        }
    } else if (ownerFunction !== undefined) {
        for (const parameter of ownerFunction.parameters ?? []) {
            if (ts.isObjectBindingPattern(parameter.name)) {
                calls.push(...serializeObjectDestructuringGets(
                    parameter.name,
                    safeGetTypeAtLocation(parameter, context),
                    context,
                    ownerFunction
                ));
            }
            if (parameter.initializer !== undefined) {
                visit(parameter.initializer);
            }
        }
        if (rootNode.body !== undefined) {
            visit(rootNode.body);
        }
    } else {
        visit(rootNode);
    }
    return calls.sort(compareLocatedFacts);
}

function serializeObjectDestructuringGets(pattern, sourceType, context, ownerFunction) {
    if (sourceType === undefined) return [];
    const entries = ts.isObjectBindingPattern(pattern)
        ? pattern.elements.map((element) => ({
            propertyNode: element.propertyName ?? element.name,
            propertyName: destructuringPropertyName(element.propertyName ?? element.name),
            target: element.name,
            rest: element.dotDotDotToken !== undefined
        }))
        : pattern.properties.flatMap((property) => {
            if (ts.isPropertyAssignment(property)) {
                return [{
                    propertyNode: property.name,
                    propertyName: destructuringPropertyName(property.name),
                    target: property.initializer,
                    rest: false
                }];
            }
            if (ts.isShorthandPropertyAssignment(property)) {
                return [{
                    propertyNode: property.name,
                    propertyName: property.name.text,
                    target: property.name,
                    rest: false
                }];
            }
            return [];
        });
    const calls = [];
    for (const entry of entries) {
        if (entry.rest || entry.propertyName === null) continue;
        const symbol = safePropertyOfType(sourceType, entry.propertyName, context);
        const declaration = symbol?.getDeclarations?.()
            .find((candidate) => ts.isGetAccessorDeclaration(candidate) &&
                isSerializableProjectDeclaration(candidate, context));
        if (declaration !== undefined) {
            const targetId = functionIdForDeclaration(declaration, context);
            if (targetId !== null) {
                calls.push(serializeDestructuringGetterCall(
                    entry.propertyNode,
                    entry.propertyName,
                    symbol,
                    targetId,
                    context,
                    ownerFunction
                ));
            }
        }
        if (ts.isObjectBindingPattern(entry.target) || ts.isObjectLiteralExpression(entry.target)) {
            const nestedType = symbol === undefined
                ? undefined
                : safeTypeOfSymbolAtLocation(symbol, entry.propertyNode, context);
            calls.push(...serializeObjectDestructuringGets(
                entry.target,
                nestedType,
                context,
                ownerFunction
            ));
        }
    }
    return calls;
}

function serializeDestructuringGetterCall(node, propertyName, symbol, targetId, context, ownerFunction) {
    const span = spanFromNode(node, context);
    const ownerId = ownerFunction === undefined ? null : functionId(ownerFunction, context);
    return {
        id: `call:destructure-get:${span.path}:${String(span.start.offset)}:${targetId}`,
        kind: "accessor-get",
        name: `<destructure>.${propertyName}<get>`,
        qualifiedName: safeSymbolToString(symbol, node, context),
        enclosingFunctionId: ownerId,
        callerId: ownerId,
        symbolId: stableSymbolId(symbol, context),
        targetId,
        returnType: safeTypeAtLocation(node, context),
        receiverType: null,
        arguments: [],
        argumentIdentifiers: [],
        argumentTypes: [],
        typeArguments: [],
        optional: false,
        implicitRuntime: true,
        resolvedBy: "typescript-destructuring-semantics",
        span
    };
}

function destructuringPropertyName(node) {
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node) ||
        ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
        return node.text;
    }
    if (ts.isComputedPropertyName(node)) return staticString(node.expression);
    return null;
}

function safePropertyOfType(type, name, context) {
    try {
        return context.checker.getPropertyOfType(type, name);
    } catch {
        return undefined;
    }
}

function safeTypeOfSymbolAtLocation(symbol, node, context) {
    try {
        return context.checker.getTypeOfSymbolAtLocation(symbol, node);
    } catch {
        return undefined;
    }
}

function dedupeCalls(calls) {
    const byId = new Map();
    for (const call of calls) {
        byId.set(call.id, call);
    }
    return [...byId.values()].sort(compareLocatedFacts);
}

function serializeCall(node, context, ownerFunction) {
    const expression = node.expression;
    const dynamicImport = expression.kind === ts.SyntaxKind.ImportKeyword;
    const signature = safeResolvedSignature(node, context);
    const rawSymbol = dynamicImport ? undefined : symbolAtCallee(expression, context);
    const symbol = resolveAlias(rawSymbol, context.checker);
    const declarations = signature?.declaration === undefined
        ? symbol?.getDeclarations?.() ?? []
        : [signature.declaration, ...(symbol?.getDeclarations?.() ?? [])];
    const directTargetId = functionTargetFromDeclarations(declarations, context);
    const constructorTargetId = (ts.isNewExpression(node) || expression.kind === ts.SyntaxKind.SuperKeyword)
        ? constructorTargetFromDeclarations(declarations, context)
        : null;
    const targetId = directTargetId ?? constructorTargetId;
    const targetDeclaration = declarations.find((declaration) => functionIdForDeclaration(declaration, context) !== null) ??
        declarations.find((declaration) => isSerializableProjectDeclaration(declaration, context));
    const resultType = safeTypeAtLocation(node, context);
    const returnType = signature === undefined
        ? resultType
        : safeTypeToString(context.checker.getReturnTypeOfSignature(signature), node, context);
    const span = spanFromNode(node, context);
    const compact = context.detail !== "full";
    return {
        id: `call:${span.path}:${String(span.start.offset)}`,
        kind: ts.isNewExpression(node) ? "construct" : dynamicImport ? "dynamic-import" : "call",
        name: dynamicImport ? "import" : compactText(expression.getText(expression.getSourceFile()), 240),
        qualifiedName: symbol === undefined ? null : safeSymbolToString(symbol, expression, context),
        enclosingFunctionId: ownerFunction === undefined ? null : functionId(ownerFunction, context),
        callerId: ownerFunction === undefined ? null : functionId(ownerFunction, context),
        symbolId: stableSymbolId(symbol, context),
        targetId,
        targetSpan: compact || targetDeclaration === undefined ? undefined : spanFromNode(targetDeclaration.name ?? targetDeclaration, context),
        signature: compact || signature === undefined ? undefined : safeSignatureToString(signature, node, context),
        returnType,
        receiverType: callReceiverType(expression, context),
        arguments: (node.arguments ?? []).map((argument) =>
            compactText(argument.getText(argument.getSourceFile()), 240)),
        argumentIdentifiers: uniqueStrings((node.arguments ?? [])
            .flatMap(referencedValueIdentifiers)),
        argumentTypes: (node.arguments ?? []).map((argument) => safeTypeAtLocation(argument, context)),
        typeArguments: (node.typeArguments ?? []).map((argument) => argument.getText(argument.getSourceFile())),
        optional: node.questionDotToken !== undefined,
        span,
        calleeSpan: compact ? undefined : spanFromNode(expression, context)
    };
}

function serializeTaggedTemplateCall(node, context, ownerFunction) {
    const expression = node.tag;
    const signature = safeResolvedSignature(node, context);
    const rawSymbol = symbolAtCallee(expression, context);
    const symbol = resolveAlias(rawSymbol, context.checker);
    const declarations = signature?.declaration === undefined
        ? symbol?.getDeclarations?.() ?? []
        : [signature.declaration, ...(symbol?.getDeclarations?.() ?? [])];
    const targetId = functionTargetFromDeclarations(declarations, context);
    const targetDeclaration = declarations.find((declaration) =>
        functionIdForDeclaration(declaration, context) !== null) ??
        declarations.find((declaration) => isSerializableProjectDeclaration(declaration, context));
    const span = spanFromNode(node, context);
    const ownerId = ownerFunction === undefined ? null : functionId(ownerFunction, context);
    const substitutions = ts.isTemplateExpression(node.template)
        ? node.template.templateSpans.map((templateSpan) => templateSpan.expression)
        : [];
    const compact = context.detail !== "full";
    return {
        id: `call:tagged-template:${span.path}:${String(span.start.offset)}`,
        kind: "tagged-template",
        name: compactText(expression.getText(expression.getSourceFile()), 240),
        qualifiedName: symbol === undefined ? null : safeSymbolToString(symbol, expression, context),
        enclosingFunctionId: ownerId,
        callerId: ownerId,
        symbolId: stableSymbolId(symbol, context),
        targetId,
        targetSpan: compact || targetDeclaration === undefined
            ? undefined
            : spanFromNode(targetDeclaration.name ?? targetDeclaration, context),
        signature: compact || signature === undefined
            ? undefined
            : safeSignatureToString(signature, node, context),
        returnType: safeTypeAtLocation(node, context),
        receiverType: callReceiverType(expression, context),
        arguments: substitutions.map((argument) =>
            compactText(argument.getText(argument.getSourceFile()), 240)),
        argumentIdentifiers: uniqueStrings(substitutions.flatMap(referencedValueIdentifiers)),
        argumentTypes: ["TemplateStringsArray", ...substitutions.map((argument) =>
            safeTypeAtLocation(argument, context))],
        typeArguments: (node.typeArguments ?? []).map((argument) =>
            argument.getText(argument.getSourceFile())),
        optional: false,
        span,
        calleeSpan: compact ? undefined : spanFromNode(expression, context)
    };
}

function serializeAccessorInvocations(node, context, ownerFunction) {
    const modes = accessorInvocationModes(node);
    if (modes.length === 0) return [];
    const rawSymbol = context.checker.getSymbolAtLocation(node.name ?? node.argumentExpression ?? node);
    const symbol = resolveAlias(rawSymbol, context.checker);
    const declarations = symbol?.getDeclarations?.() ?? [];
    const calls = [];
    for (const mode of modes) {
        const declaration = declarations.find((candidate) => mode === "get"
            ? ts.isGetAccessorDeclaration(candidate)
            : ts.isSetAccessorDeclaration(candidate));
        if (declaration === undefined || !isSerializableProjectDeclaration(declaration, context)) continue;
        const targetId = functionIdForDeclaration(declaration, context);
        if (targetId === null) continue;
        const span = spanFromNode(node, context);
        const ownerId = ownerFunction === undefined ? null : functionId(ownerFunction, context);
        const setterArgument = mode === "set" ? accessorSetterArgument(node) : undefined;
        calls.push({
            id: `call:accessor:${span.path}:${String(span.start.offset)}:${mode}:${targetId}`,
            kind: mode === "get" ? "accessor-get" : "accessor-set",
            name: `${compactText(node.getText(node.getSourceFile()), 240)}<${mode}>`,
            qualifiedName: safeSymbolToString(symbol, node, context),
            enclosingFunctionId: ownerId,
            callerId: ownerId,
            symbolId: stableSymbolId(symbol, context),
            targetId,
            returnType: safeTypeAtLocation(node, context),
            receiverType: callReceiverType(node, context),
            arguments: setterArgument === undefined
                ? []
                : [compactText(setterArgument.getText(setterArgument.getSourceFile()), 240)],
            argumentIdentifiers: setterArgument === undefined
                ? []
                : uniqueStrings(referencedValueIdentifiers(setterArgument)),
            argumentTypes: setterArgument === undefined
                ? []
                : [safeTypeAtLocation(setterArgument, context)],
            typeArguments: [],
            optional: node.questionDotToken !== undefined,
            implicitRuntime: true,
            resolvedBy: "typescript-accessor-semantics",
            span
        });
    }
    return calls;
}

function accessorSetterArgument(node) {
    const assignment = accessorAssignmentContext(node);
    if (assignment !== undefined) return assignment.value;
    const parent = node.parent;
    if ((ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) && parent.operand === node) {
        return node;
    }
    return undefined;
}

function accessorInvocationModes(node) {
    const parent = node.parent;
    if (ts.isDeleteExpression(parent) && parent.expression === node) return [];
    const assignment = accessorAssignmentContext(node);
    if (assignment !== undefined) return assignment.readBeforeWrite ? ["get", "set"] : ["set"];
    if ((ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) &&
        parent.operand === node &&
        (parent.operator === ts.SyntaxKind.PlusPlusToken || parent.operator === ts.SyntaxKind.MinusMinusToken)) {
        return ["get", "set"];
    }
    return ["get"];
}

function accessorAssignmentContext(node) {
    let current = node;
    let parent = current.parent;
    while (parent !== undefined) {
        if (ts.isBinaryExpression(parent) && parent.left === current &&
            isAssignmentOperator(parent.operatorToken.kind)) {
            return {
                value: parent.right,
                readBeforeWrite: parent.operatorToken.kind !== ts.SyntaxKind.EqualsToken
            };
        }
        if ((ts.isForOfStatement(parent) || ts.isForInStatement(parent)) &&
            parent.initializer === current) {
            return { value: parent.expression, readBeforeWrite: false };
        }
        if ((ts.isParenthesizedExpression(parent) && parent.expression === current) ||
            (ts.isSpreadElement(parent) && parent.expression === current) ||
            (ts.isPropertyAssignment(parent) && parent.initializer === current) ||
            (ts.isArrayLiteralExpression(parent) && parent.elements.some((element) => element === current)) ||
            (ts.isObjectLiteralExpression(parent) && parent.properties.some((property) => property === current))) {
            current = parent;
            parent = current.parent;
            continue;
        }
        break;
    }
    return undefined;
}

function isAssignmentOperator(kind) {
    return kind === ts.SyntaxKind.EqualsToken ||
        kind === ts.SyntaxKind.PlusEqualsToken ||
        kind === ts.SyntaxKind.MinusEqualsToken ||
        kind === ts.SyntaxKind.AsteriskEqualsToken ||
        kind === ts.SyntaxKind.AsteriskAsteriskEqualsToken ||
        kind === ts.SyntaxKind.SlashEqualsToken ||
        kind === ts.SyntaxKind.PercentEqualsToken ||
        kind === ts.SyntaxKind.LessThanLessThanEqualsToken ||
        kind === ts.SyntaxKind.GreaterThanGreaterThanEqualsToken ||
        kind === ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken ||
        kind === ts.SyntaxKind.AmpersandEqualsToken ||
        kind === ts.SyntaxKind.BarEqualsToken ||
        kind === ts.SyntaxKind.CaretEqualsToken ||
        kind === ts.SyntaxKind.BarBarEqualsToken ||
        kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken ||
        kind === ts.SyntaxKind.QuestionQuestionEqualsToken;
}

function referencedValueIdentifiers(root) {
    const names = [];
    walk(root, (node) => {
        if (!ts.isIdentifier(node) || !identifierIsValueReference(node)) return;
        names.push(node.text);
    });
    return names;
}

function identifierIsValueReference(node) {
    const parent = node.parent;
    if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
    if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
    if (ts.isMethodDeclaration(parent) && parent.name === node) return false;
    if (ts.isPropertyDeclaration(parent) && parent.name === node) return false;
    if (ts.isBindingElement(parent) && parent.propertyName === node) return false;
    if (ts.isTypeNode(parent)) return false;
    return true;
}

function uniqueStrings(values) {
    return [...new Set(values)].sort();
}

function functionTargetFromDeclarations(declarations, context) {
    for (const declaration of declarations ?? []) {
        const id = functionIdForDeclaration(declaration, context);
        if (id !== null) {
            return id;
        }
    }
    return null;
}

function constructorTargetFromDeclarations(declarations, context, seen = new Set()) {
    for (const declaration of declarations ?? []) {
        if (seen.has(declaration)) continue;
        seen.add(declaration);
        let classNode;
        if (ts.isClassDeclaration(declaration) || ts.isClassExpression(declaration)) {
            classNode = declaration;
        } else if (ts.isConstructorDeclaration(declaration) &&
            (ts.isClassDeclaration(declaration.parent) || ts.isClassExpression(declaration.parent))) {
            classNode = declaration.parent;
        }
        if (classNode !== undefined) {
            const target = context.classConstructorTargetByNode.get(classNode);
            if (target !== undefined) return target;
        }
        if ((ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration) ||
            ts.isPropertyAssignment(declaration)) && declaration.initializer !== undefined) {
            const target = constructorTargetFromExpression(declaration.initializer, context, seen);
            if (target !== null) return target;
        }
    }
    return null;
}

function constructorTargetFromExpression(expression, context, seen = new Set()) {
    if (seen.has(expression)) return null;
    seen.add(expression);
    if (ts.isClassExpression(expression)) {
        return context.classConstructorTargetByNode.get(expression) ?? null;
    }
    const symbol = resolveAlias(context.checker.getSymbolAtLocation(expression), context.checker);
    const symbolTarget = constructorTargetFromDeclarations(
        symbol?.getDeclarations?.() ?? [],
        context,
        seen
    );
    if (symbolTarget !== null) return symbolTarget;
    const type = safeGetTypeAtLocation(expression, context);
    const signatureDeclarations = (type?.getConstructSignatures?.() ?? [])
        .map((signature) => signature.declaration)
        .filter((declaration) => declaration !== undefined);
    return constructorTargetFromDeclarations(signatureDeclarations, context, seen);
}

function functionIdForDeclaration(declaration, context) {
    if (declaration === undefined) {
        return null;
    }
    if (isRuntimeFunctionLike(declaration)) {
        return context.functionIdByKey.get(nodeKey(declaration, context)) ?? null;
    }
    if (ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration) || ts.isPropertyAssignment(declaration)) {
        const initializer = declaration.initializer;
        if (initializer !== undefined && isRuntimeFunctionLike(initializer)) {
            return context.functionIdByKey.get(nodeKey(initializer, context)) ?? null;
        }
    }
    return null;
}

function collectTypeEscapes(sourceFile, context) {
    const entries = [];
    const seen = new Set();
    const add = (kind, message, nodeOrSpan, details = {}) => {
        const span = nodeOrSpan?.start !== undefined && nodeOrSpan?.encoding === "utf-16"
            ? nodeOrSpan
            : spanFromNode(nodeOrSpan, context);
        const key = `${kind}\0${span.path}\0${String(span.start.offset)}\0${String(span.end.offset)}`;
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        entries.push({ kind, message, span, ...details });
    };
    walk(sourceFile, (node) => {
        if (node.kind === ts.SyntaxKind.AnyKeyword && !isAssertionTypeNode(node)) {
            add("explicit_any", "explicit any bypasses TypeScript's unknown-first type boundary", node);
        }
        if (isTypeAssertion(node) && node.type.kind === ts.SyntaxKind.AnyKeyword) {
            add("as_any", "assertion to any bypasses TypeScript narrowing", node.type, {
                expressionType: safeTypeAtLocation(node.expression, context),
                resultType: safeTypeAtLocation(node, context)
            });
        }
        if (isTypeAssertion(node) && isTypeAssertion(node.expression) &&
            (node.expression.type.kind === ts.SyntaxKind.UnknownKeyword || node.expression.type.kind === ts.SyntaxKind.AnyKeyword)) {
            add("double_assertion", "double assertion crosses an unchecked type boundary", node, {
                sourceType: safeTypeAtLocation(node.expression.expression, context),
                intermediateType: node.expression.type.getText(sourceFile),
                resultType: safeTypeAtLocation(node, context)
            });
        }
        if (ts.isNonNullExpression(node)) {
            add("non_null_assertion", "non-null assertion removes nullishness without a runtime proof", node.exclamationToken ?? node, {
                sourceType: safeTypeAtLocation(node.expression, context),
                resultType: safeTypeAtLocation(node, context)
            });
        }
        if (ts.isCallExpression(node) && isJsonParseCall(node, context)) {
            add("unchecked_json_parse", "JSON.parse returns unchecked data that requires validation before trusted use", node, {
                resultType: safeTypeAtLocation(node, context)
            });
        }
    });
    for (const suppression of collectTsSuppressionComments(sourceFile, context)) {
        add("ts_suppression", suppression.message, suppression.span, { directive: suppression.directive });
    }
    return entries.sort(compareLocatedFacts);
}

function collectTsSuppressionComments(sourceFile, context) {
    const entries = [];
    const scanner = ts.createScanner(sourceFile.languageVersion, false, sourceFile.languageVariant, sourceFile.text);
    for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
        if (kind !== ts.SyntaxKind.SingleLineCommentTrivia && kind !== ts.SyntaxKind.MultiLineCommentTrivia) {
            continue;
        }
        const text = scanner.getTokenText();
        const start = scanner.getTokenPos();
        const pattern = /@ts-(ignore|expect-error|nocheck)\b/gu;
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const directive = `@ts-${match[1]}`;
            const offset = start + match.index;
            entries.push({
                directive,
                message: `${directive} suppresses TypeScript checker evidence`,
                span: spanFromOffsets(sourceFile, offset, offset + directive.length, context)
            });
        }
    }
    return entries;
}

function collectRegexps(sourceFile, context) {
    const entries = [];
    walk(sourceFile, (node) => {
        if (ts.isRegularExpressionLiteral(node)) {
            const raw = node.getText(sourceFile);
            const split = splitRegexLiteral(raw);
            const start = node.getStart(sourceFile, false);
            entries.push({
                kind: "literal",
                pattern: split.pattern,
                flags: split.flags,
                dynamic: false,
                inferredType: safeTypeAtLocation(node, context),
                span: spanFromNode(node, context),
                patternSpan: spanFromOffsets(sourceFile, start + 1, start + 1 + split.pattern.length, context)
            });
            return;
        }
        if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && isRegExpConstruction(node, context)) {
            const patternNode = node.arguments?.[0];
            const flagsNode = node.arguments?.[1];
            const pattern = staticString(patternNode);
            const flags = staticString(flagsNode);
            entries.push({
                kind: "constructor",
                pattern,
                flags,
                dynamic: pattern === null || (flagsNode !== undefined && flags === null),
                inferredType: safeTypeAtLocation(node, context),
                span: spanFromNode(node, context),
                patternSpan: patternNode === undefined ? null : spanFromNode(patternNode, context),
                flagsSpan: flagsNode === undefined ? null : spanFromNode(flagsNode, context)
            });
        }
    });
    return entries.sort(compareLocatedFacts);
}

function collectTypeFacts(sourceFile, context) {
    const facts = [];
    walk(sourceFile, (node) => {
        if (ts.isVariableDeclaration(node)) {
            appendBindingTypeFacts(facts, "variable", node.name, node, node.initializer, context);
            return;
        }
        if (ts.isParameter(node)) {
            if (context.detail !== "full") return;
            appendBindingTypeFacts(facts, "parameter", node.name, node, node.initializer, context);
            return;
        }
        if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) {
            if (context.detail !== "full") return;
            facts.push(bindingTypeFact("property", node.name, node, node.initializer, context));
            return;
        }
        if (isRuntimeFunctionLike(node)) {
            if (context.detail !== "full") return;
            const signature = safeSignatureForDeclaration(node, context);
            facts.push({
                id: typeFactId("return", node, context),
                kind: "return",
                name: functionName(node),
                symbolId: stableSymbolId(functionSymbol(node, context), context),
                declaredType: node.type?.getText(sourceFile) ?? null,
                inferredType: signature === undefined ? null : safeTypeToString(context.checker.getReturnTypeOfSignature(signature), node, context),
                contextualType: null,
                initializerType: null,
                typeFlags: signature === undefined ? emptyTypeFlags() : classifyType(context.checker.getReturnTypeOfSignature(signature)),
                span: spanFromNode(node.type ?? node.name ?? node, context)
            });
            return;
        }
    });
    return facts.sort(compareLocatedFacts);
}

function appendBindingTypeFacts(facts, kind, nameNode, declaration, initializer, context) {
    if (ts.isIdentifier(nameNode)) {
        facts.push(bindingTypeFact(kind, nameNode, declaration, initializer, context));
        return;
    }
    if (!ts.isObjectBindingPattern(nameNode) && !ts.isArrayBindingPattern(nameNode)) {
        facts.push(bindingTypeFact(kind, nameNode, declaration, initializer, context));
        return;
    }
    for (const element of nameNode.elements) {
        if (ts.isOmittedExpression(element)) continue;
        appendBindingTypeFacts(
            facts,
            kind,
            element.name,
            element,
            element.initializer,
            context
        );
    }
}

function bindingTypeFact(kind, nameNode, declaration, initializer, context) {
    const type = safeGetTypeAtLocation(nameNode, context);
    const contextual = initializer === undefined ? undefined : safeContextualType(initializer, context);
    return {
        id: typeFactId(kind, nameNode, context),
        kind,
        name: compactText(nameNode.getText(nameNode.getSourceFile()), 240),
        symbolId: stableSymbolId(context.checker.getSymbolAtLocation(nameNode), context),
        declaredType: declaration.type?.getText(declaration.getSourceFile()) ?? null,
        inferredType: safeTypeToString(type, nameNode, context),
        contextualType: safeTypeToString(contextual, initializer ?? nameNode, context),
        initializerType: initializer === undefined ? null : safeTypeAtLocation(initializer, context),
        widenedType: safeWidenedType(type, nameNode, context),
        apparentType: safeApparentType(type, nameNode, context),
        typeFlags: classifyType(type),
        span: spanFromNode(nameNode, context)
    };
}

function collectComments(sourceFile, context) {
    const comments = [];
    const scanner = ts.createScanner(sourceFile.languageVersion, false, sourceFile.languageVariant, sourceFile.text);
    for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
        if (kind !== ts.SyntaxKind.SingleLineCommentTrivia && kind !== ts.SyntaxKind.MultiLineCommentTrivia) {
            continue;
        }
        const start = scanner.getTokenPos();
        const end = scanner.getTextPos();
        const text = scanner.getTokenText();
        comments.push({
            kind: kind === ts.SyntaxKind.SingleLineCommentTrivia ? "line" : "block",
            jsdoc: kind === ts.SyntaxKind.MultiLineCommentTrivia && text.startsWith("/**"),
            text: compactText(text, 2_000),
            span: spanFromOffsets(sourceFile, start, end, context)
        });
    }
    return comments;
}

function countReadonlyNodes(sourceFile) {
    let count = 0;
    walk(sourceFile, (node) => {
        if (node.kind === ts.SyntaxKind.ReadonlyKeyword) {
            count += 1;
        }
    });
    return count;
}

function collectDiagnostics(parsed, program, context) {
    const diagnostics = [];
    const selectedFiles = new Set(context.sourceFiles.map((sourceFile) => resolve(sourceFile.fileName)));
    const add = (phase, values, scoped = false) => {
        for (const diagnostic of values) {
            if (scoped && diagnostic.file !== undefined &&
                !selectedFiles.has(resolve(diagnostic.file.fileName))) {
                continue;
            }
            diagnostics.push(serializeDiagnostic(diagnostic, phase, context));
        }
    };
    add("config", parsed.errors);
    add("options", program.getOptionsDiagnostics());
    add("global", program.getGlobalDiagnostics());
    add("syntactic", program.getSyntacticDiagnostics(), true);
    add("semantic", program.getSemanticDiagnostics(), true);
    const seen = new Set();
    return diagnostics.filter((diagnostic) => {
        const key = `${diagnostic.phase}\0${String(diagnostic.code)}\0${diagnostic.span?.path ?? ""}\0${String(diagnostic.span?.start.offset ?? -1)}\0${diagnostic.message}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    }).sort(compareDiagnostics);
}

function serializeDiagnostic(diagnostic, phase, context) {
    const related = (diagnostic.relatedInformation ?? []).map((entry) => ({
        category: diagnosticCategory(entry.category),
        code: entry.code,
        message: ts.flattenDiagnosticMessageText(entry.messageText, "\n"),
        span: spanFromDiagnostic(entry, context)
    }));
    return {
        phase,
        category: diagnosticCategory(diagnostic.category),
        code: diagnostic.code,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        messageChain: serializeMessageChain(diagnostic.messageText),
        span: spanFromDiagnostic(diagnostic, context),
        related,
        suggestions: [],
        reportsUnnecessary: diagnostic.reportsUnnecessary === true,
        reportsDeprecated: diagnostic.reportsDeprecated === true
    };
}

function serializeMessageChain(messageText) {
    if (typeof messageText === "string") {
        return [{ message: messageText, category: "message", code: 0, depth: 0 }];
    }
    const out = [];
    const visit = (chain, depth) => {
        out.push({
            message: chain.messageText,
            category: diagnosticCategory(chain.category),
            code: chain.code,
            depth
        });
        for (const child of chain.next ?? []) {
            visit(child, depth + 1);
        }
    };
    visit(messageText, 0);
    return out;
}

function spanFromDiagnostic(diagnostic, context) {
    if (diagnostic.file === undefined || diagnostic.start === undefined) {
        return null;
    }
    const start = diagnostic.start;
    const end = start + (diagnostic.length ?? 0);
    return spanFromOffsets(diagnostic.file, start, end, context);
}

function spanFromNode(node, context) {
    const sourceFile = node.getSourceFile();
    const start = node.getStart(sourceFile, false);
    return spanFromOffsets(sourceFile, start, node.getEnd(), context);
}

function spanFromOffsets(sourceFile, rawStart, rawEnd, context) {
    const startOffset = Math.max(0, Math.min(sourceFile.text.length, rawStart));
    const endOffset = Math.max(startOffset, Math.min(sourceFile.text.length, rawEnd));
    const start = sourceFile.getLineAndCharacterOfPosition(startOffset);
    const end = sourceFile.getLineAndCharacterOfPosition(endOffset);
    return {
        path: projectPath(context.cwd, sourceFile.fileName),
        start: {
            line: start.line,
            character: start.character,
            offset: startOffset
        },
        end: {
            line: end.line,
            character: end.character,
            offset: endOffset
        },
        encoding: "utf-16",
        lineBase: 0,
        columnBase: 0,
        endExclusive: true
    };
}

function stableSymbolId(input, context) {
    if (input === undefined || input === null) {
        return null;
    }
    const symbol = resolveAlias(input, context.checker) ?? input;
    if (context.symbolIdCache.has(symbol)) {
        return context.symbolIdCache.get(symbol);
    }
    const declarations = symbol.getDeclarations?.() ?? [];
    const declaration = declarations.find((entry) => isSerializableProjectDeclaration(entry, context)) ?? declarations[0];
    const name = symbol.getName?.() ?? "anonymous";
    const external = declaration !== undefined && !isSerializableProjectDeclaration(declaration, context);
    const id = declaration === undefined
        ? `sym:external:${externalSymbolName(symbol, context)}:${String(symbol.flags ?? 0)}`
        : external
            ? `sym:external:${externalDeclarationPath(declaration, context)}:${String(declaration.getStart(declaration.getSourceFile(), false))}:${name}`
            : `sym:${projectPath(context.cwd, declaration.getSourceFile().fileName)}:${String(declaration.getStart(declaration.getSourceFile(), false))}:${name}`;
    context.symbolIdCache.set(symbol, id);
    return id;
}

function externalSymbolName(symbol, context) {
    try {
        return context.checker.getFullyQualifiedName(symbol)
            .replaceAll(context.cwd.replaceAll("\\", "/"), ".");
    } catch {
        return symbol.getName?.() ?? "anonymous";
    }
}

function externalDeclarationPath(declaration, context) {
    const fileName = declaration.getSourceFile().fileName.replaceAll("\\", "/");
    const nodeModules = fileName.lastIndexOf("/node_modules/");
    if (nodeModules >= 0) {
        return fileName.slice(nodeModules + 1);
    }
    const local = projectPath(context.cwd, fileName);
    return isAbsolute(local) ? `typescript-lib/${basename(fileName)}` : local;
}

function resolveAlias(symbol, checker) {
    if (symbol === undefined || symbol === null) {
        return undefined;
    }
    if ((symbol.flags & ts.SymbolFlags.Alias) === 0) {
        return symbol;
    }
    try {
        return checker.getAliasedSymbol(symbol);
    } catch {
        return symbol;
    }
}

function summarizeFrontend(files, diagnostics) {
    const diagnosticCounts = { error: 0, warning: 0, suggestion: 0, message: 0 };
    const phaseCounts = {};
    for (const diagnostic of diagnostics) {
        diagnosticCounts[diagnostic.category] = (diagnosticCounts[diagnostic.category] ?? 0) + 1;
        phaseCounts[diagnostic.phase] = (phaseCounts[diagnostic.phase] ?? 0) + 1;
    }
    const sumMetric = (name) => files.reduce((total, file) => total + (file.metrics[name] ?? 0), 0);
    return {
        files: files.length,
        lines: sumMetric("lines"),
        characters: sumMetric("characters"),
        diagnostics: diagnostics.length,
        diagnosticCounts,
        diagnosticPhases: phaseCounts,
        imports: sumMetric("imports"),
        exports: sumMetric("exports"),
        declarations: sumMetric("declarations"),
        functions: sumMetric("functions"),
        runtimeOwners: sumMetric("runtimeOwners"),
        syntheticEdges: sumMetric("syntheticEdges"),
        calls: sumMetric("calls"),
        typeEscapes: sumMetric("typeEscapes"),
        regexps: sumMetric("regexps"),
        typeFacts: sumMetric("typeFacts"),
        inferenceFacts: sumMetric("inferenceFacts"),
        inferenceDiagnostics: sumMetric("inferenceDiagnostics"),
        nonRuntimeSpanCount: sumMetric("nonRuntimeSpanCount")
    };
}

function inferHmForSourceFile(sourceFile, context) {
    try {
        return inferHmCandidates(sourceFile, {
            checker: context.checker,
            compilerDiagnostics: context.compilerDiagnostics,
            path: projectPath(context.cwd, sourceFile.fileName),
            typeScriptFact: (nameNode, details) => typeScriptAuthorityFact(nameNode, details, context)
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            facts: [],
            diagnostics: [{
                category: "internal",
                code: "HM_INTERNAL",
                message,
                range: spanFromOffsets(sourceFile, 0, 0, context)
            }],
            stats: {
                bindings: 0,
                inferred: 0,
                partial: 0,
                conflicts: 0,
                unsupported: 0,
                budgetExceeded: 0,
                freshVariables: 0,
                unifications: 0
            },
            engine: {
                name: "algorithm-w-supplement",
                status: "failed",
                authoritative: false,
                role: "supplementary"
            }
        };
    }
}

function disabledHmInference() {
    return {
        facts: [],
        diagnostics: [],
        stats: {
            bindings: 0,
            inferred: 0,
            partial: 0,
            conflicts: 0,
            unsupported: 0,
            budgetExceeded: 0,
            freshVariables: 0,
            unifications: 0
        },
        engine: {
            name: "algorithm-w-supplement",
            status: "disabled",
            authoritative: false,
            role: "supplementary"
        }
    };
}

function typeScriptAuthorityFact(nameNode, details, context) {
    const type = safeGetTypeAtLocation(nameNode, context);
    if (type === undefined) {
        return {
            status: "unavailable",
            display: undefined,
            typeFlags: undefined,
            diagnosticCodes: [],
            provenance: { engine: "typescript", authoritative: true }
        };
    }
    const declaration = details?.declaration ?? nameNode;
    const start = declaration.getStart(declaration.getSourceFile(), false);
    const end = declaration.getEnd();
    const directOverlaps = context.compilerDiagnostics.filter((diagnostic) =>
        diagnostic.file === declaration.getSourceFile() &&
        typeof diagnostic.start === "number" &&
        diagnostic.start < end && diagnostic.start + Math.max(1, diagnostic.length ?? 1) > start);
    const annotation = declaration.type;
    const referencedOverlaps = diagnosticsFromReferencedTypeDeclarations(annotation, context);
    const overlaps = uniqueCompilerDiagnostics([...directOverlaps, ...referencedOverlaps]);
    const explicitDynamic = annotation !== undefined &&
        (annotation.kind === ts.SyntaxKind.AnyKeyword || annotation.kind === ts.SyntaxKind.UnknownKeyword);
    const dynamic = (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0;
    const implicitErrorAny = (type.flags & ts.TypeFlags.Any) !== 0 && !explicitDynamic;
    return {
        status: overlaps.length !== 0 || implicitErrorAny
            ? "error-derived"
            : dynamic && explicitDynamic
                ? "intentional-dynamic"
                : "resolved",
        display: safeTypeToString(type, nameNode, context),
        typeFlags: Number(type.flags),
        diagnosticCodes: overlaps.map((diagnostic) => `TS${String(diagnostic.code)}`).sort(),
        provenance: { engine: "typescript", authoritative: true }
    };
}

function diagnosticsFromReferencedTypeDeclarations(annotation, context) {
    if (annotation === undefined) return [];
    const declarations = new Set();
    walk(annotation, (node) => {
        if (!ts.isIdentifier(node)) return;
        const symbol = resolveAlias(context.checker.getSymbolAtLocation(node), context.checker);
        for (const declaration of symbol?.getDeclarations?.() ?? []) {
            if (ts.isTypeAliasDeclaration(declaration) ||
                ts.isInterfaceDeclaration(declaration) ||
                ts.isTypeParameterDeclaration(declaration)) {
                declarations.add(declaration);
            }
        }
    });
    return context.compilerDiagnostics.filter((diagnostic) => {
        if (diagnostic.file === undefined || typeof diagnostic.start !== "number") return false;
        const diagnosticEnd = diagnostic.start + Math.max(1, diagnostic.length ?? 1);
        for (const declaration of declarations) {
            if (declaration.getSourceFile() !== diagnostic.file) continue;
            const start = declaration.getStart(diagnostic.file, false);
            if (diagnostic.start < declaration.getEnd() && diagnosticEnd > start) return true;
        }
        return false;
    });
}

function uniqueCompilerDiagnostics(diagnostics) {
    const seen = new Set();
    return diagnostics.filter((diagnostic) => {
        const key = `${diagnostic.file?.fileName ?? ""}\0${String(diagnostic.start ?? -1)}\0${String(diagnostic.code)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function aggregateHm(files) {
    const stats = {
        files: files.length,
        facts: 0,
        diagnostics: 0,
        inferred: 0,
        partial: 0,
        conflicts: 0,
        unsupported: 0,
        budgetExceeded: 0,
        freshVariables: 0,
        unifications: 0
    };
    const statuses = {};
    for (const file of files) {
        const engineStatus = file.inferenceEngine?.status ?? "unknown";
        statuses[engineStatus] = (statuses[engineStatus] ?? 0) + 1;
        stats.facts += file.inferenceFacts.length;
        stats.diagnostics += file.metrics?.inferenceDiagnostics ?? file.inferenceDiagnostics.length;
        stats.inferred += file.inferenceStats?.inferred ?? 0;
        stats.partial += file.inferenceStats?.partial ?? 0;
        stats.conflicts += file.inferenceStats?.conflicts ?? 0;
        stats.unsupported += file.inferenceStats?.unsupported ?? 0;
        stats.budgetExceeded += file.inferenceStats?.budgetExceeded ?? 0;
        stats.freshVariables += file.inferenceStats?.freshVariables ?? 0;
        stats.unifications += file.inferenceStats?.unifications ?? 0;
    }
    return {
        mode: "supplement-only",
        authoritative: false,
        authority: "typescript-program-type-checker",
        engine: "algorithm-w-supplement",
        status: stats.diagnostics === 0 ? "completed" : "completed-with-diagnostics",
        statuses,
        stats
    };
}

function declarationKind(node) {
    if (ts.isVariableDeclaration(node)) {
        return variableDeclarationKind(node);
    }
    if (ts.isFunctionDeclaration(node)) return "function";
    if (ts.isClassDeclaration(node)) return "class";
    if (ts.isInterfaceDeclaration(node)) return "interface";
    if (ts.isTypeAliasDeclaration(node)) return "type";
    if (ts.isEnumDeclaration(node)) return "enum";
    if (ts.isModuleDeclaration(node)) return "namespace";
    if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) return "method";
    if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) return "property";
    if (ts.isConstructorDeclaration(node)) return "constructor";
    if (ts.isGetAccessorDeclaration(node)) return "getter";
    if (ts.isSetAccessorDeclaration(node)) return "setter";
    if (ts.isEnumMember(node)) return "enum-member";
    return undefined;
}

function variableDeclarationKind(node) {
    const list = node.parent;
    if (!ts.isVariableDeclarationList(list)) {
        return "variable";
    }
    if ((list.flags & ts.NodeFlags.Const) !== 0) return "const";
    if ((list.flags & ts.NodeFlags.Let) !== 0) return "let";
    return "var";
}

function declarationNameNode(node) {
    if (node.name !== undefined) {
        return node.name;
    }
    return undefined;
}

function declarationName(node) {
    const name = declarationNameNode(node);
    if (name === undefined) {
        return hasModifier(node, ts.SyntaxKind.DefaultKeyword) ? "default" : "anonymous";
    }
    return compactText(name.getText(name.getSourceFile()), 240);
}

function declaredTypeText(node) {
    return node.type?.getText(node.getSourceFile()) ?? null;
}

function declarationIsTypeOnly(node) {
    return ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isMethodSignature(node) || ts.isPropertySignature(node);
}

function declarationIsExported(node, symbolId, span, exportContext) {
    if (hasModifier(node, ts.SyntaxKind.ExportKeyword)) {
        return true;
    }
    if (symbolId !== null && exportContext.symbolIds.has(symbolId)) {
        return true;
    }
    if (exportContext.declarationKeys.has(spanKey(span))) {
        return true;
    }
    return false;
}

function isDocumented(node, symbol, context) {
    try {
        if (ts.getJSDocCommentsAndTags(node).length !== 0) {
            return true;
        }
    } catch {
        // Some recovered nodes cannot expose JSDoc; symbol documentation is the fallback.
    }
    return documentationForSymbol(symbol, context) !== "";
}

function documentationForSymbol(symbol, context) {
    if (symbol === undefined) {
        return "";
    }
    try {
        return compactText(ts.displayPartsToString(symbol.getDocumentationComment(context.checker)), 2_000);
    } catch {
        return "";
    }
}

function isRuntimeFunctionLike(node) {
    return ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isConstructorDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node);
}

function functionKind(node) {
    if (ts.isFunctionDeclaration(node)) return "function";
    if (ts.isFunctionExpression(node)) return "function-expression";
    if (ts.isArrowFunction(node)) return "arrow";
    if (ts.isMethodDeclaration(node)) return "method";
    if (ts.isConstructorDeclaration(node)) return "constructor";
    if (ts.isGetAccessorDeclaration(node)) return "getter";
    if (ts.isSetAccessorDeclaration(node)) return "setter";
    return "function-like";
}

function functionName(node) {
    if (node.name !== undefined) {
        return compactText(node.name.getText(node.getSourceFile()), 240);
    }
    const parent = node.parent;
    if ((ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertyAssignment(parent)) && parent.initializer === node) {
        return compactText(parent.name.getText(parent.getSourceFile()), 240);
    }
    if (ts.isBinaryExpression(parent) && parent.right === node) {
        return compactText(parent.left.getText(parent.getSourceFile()), 240);
    }
    return ts.isConstructorDeclaration(node) ? "constructor" : "anonymous";
}

function qualifiedNodeName(node, context) {
    const names = [isRuntimeFunctionLike(node) ? functionName(node) : declarationName(node)];
    let parent = node.parent;
    while (parent !== undefined && !ts.isSourceFile(parent)) {
        if (ts.isClassDeclaration(parent) || ts.isClassExpression(parent) || ts.isModuleDeclaration(parent)) {
            if (parent.name !== undefined) {
                names.unshift(compactText(parent.name.getText(parent.getSourceFile()), 120));
            }
        } else if (isRuntimeFunctionLike(parent)) {
            names.unshift(functionName(parent));
        }
        parent = parent.parent;
    }
    const path = projectPath(context.cwd, node.getSourceFile().fileName);
    return `${path}::${names.join(".")}`;
}

function functionId(node, context) {
    return `fn:${projectPath(context.cwd, node.getSourceFile().fileName)}:${String(node.getStart(node.getSourceFile(), false))}`;
}

function nodeKey(node, context) {
    return `${projectPath(context.cwd, node.getSourceFile().fileName)}\0${String(node.getStart(node.getSourceFile(), false))}\0${String(node.kind)}`;
}

function functionSymbol(node, context) {
    if (node.name !== undefined) {
        return context.checker.getSymbolAtLocation(node.name);
    }
    const parent = node.parent;
    if (ts.isConstructorDeclaration(node) &&
        (ts.isClassDeclaration(parent) || ts.isClassExpression(parent))) {
        return parent.name === undefined
            ? parent.symbol
            : context.checker.getSymbolAtLocation(parent.name);
    }
    if ((ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertyAssignment(parent)) && parent.initializer === node) {
        return context.checker.getSymbolAtLocation(parent.name);
    }
    return undefined;
}

function symbolAtCallee(expression, context) {
    if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
        return context.checker.getSymbolAtLocation(expression.name ?? expression.argumentExpression ?? expression);
    }
    return context.checker.getSymbolAtLocation(expression);
}

function safeSignatureForDeclaration(node, context) {
    try {
        return context.checker.getSignatureFromDeclaration(node);
    } catch {
        return undefined;
    }
}

function safeResolvedSignature(node, context) {
    try {
        return context.checker.getResolvedSignature(node);
    } catch {
        return undefined;
    }
}

function safeGetTypeAtLocation(node, context) {
    if (node === undefined) {
        return undefined;
    }
    try {
        return context.checker.getTypeAtLocation(node);
    } catch {
        return undefined;
    }
}

function safeTypeAtLocation(node, context) {
    return safeTypeToString(safeGetTypeAtLocation(node, context), node, context);
}

function safeTypeToString(type, node, context) {
    if (type === undefined || node === undefined) {
        return null;
    }
    try {
        return compactText(context.checker.typeToString(
            type,
            node,
            ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope |
                ts.TypeFormatFlags.WriteArrowStyleSignature |
                ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType
        ), 4_000);
    } catch {
        return null;
    }
}

function safeTypeOfSymbol(symbol, location, context) {
    if (symbol === undefined || location === undefined) {
        return null;
    }
    try {
        const type = (symbol.flags & ts.SymbolFlags.TypeAlias) !== 0 || (symbol.flags & ts.SymbolFlags.Interface) !== 0
            ? context.checker.getDeclaredTypeOfSymbol(symbol)
            : context.checker.getTypeOfSymbolAtLocation(symbol, location);
        return safeTypeToString(type, location, context);
    } catch {
        return null;
    }
}

function safeSignatureToString(signature, node, context) {
    try {
        return compactText(context.checker.signatureToString(signature, node, ts.TypeFormatFlags.WriteArrowStyleSignature), 4_000);
    } catch {
        return null;
    }
}

function safeSymbolToString(symbol, node, context) {
    try {
        return compactText(context.checker.symbolToString(symbol, node), 1_000);
    } catch {
        return symbol.getName?.() ?? null;
    }
}

function safeContextualType(node, context) {
    if (node === undefined || typeof context.checker.getContextualType !== "function") {
        return undefined;
    }
    try {
        return context.checker.getContextualType(node);
    } catch {
        return undefined;
    }
}

function safeWidenedType(type, node, context) {
    if (type === undefined || typeof context.checker.getWidenedType !== "function") {
        return null;
    }
    try {
        return safeTypeToString(context.checker.getWidenedType(type), node, context);
    } catch {
        return null;
    }
}

function safeApparentType(type, node, context) {
    if (type === undefined) {
        return null;
    }
    try {
        return safeTypeToString(context.checker.getApparentType(type), node, context);
    } catch {
        return null;
    }
}

function classifyType(type) {
    if (type === undefined) {
        return emptyTypeFlags();
    }
    const flags = type.flags ?? 0;
    return {
        raw: flags,
        any: (flags & ts.TypeFlags.Any) !== 0,
        unknown: (flags & ts.TypeFlags.Unknown) !== 0,
        never: (flags & ts.TypeFlags.Never) !== 0,
        union: (flags & ts.TypeFlags.Union) !== 0,
        intersection: (flags & ts.TypeFlags.Intersection) !== 0,
        typeParameter: (flags & ts.TypeFlags.TypeParameter) !== 0,
        object: (flags & ts.TypeFlags.Object) !== 0,
        literal: (flags & (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral | ts.TypeFlags.BooleanLiteral | ts.TypeFlags.BigIntLiteral)) !== 0,
        nullable: (flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) !== 0 ||
            (typeof type.isUnion === "function" && type.isUnion() && type.types.some((part) =>
                (part.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) !== 0))
    };
}

function emptyTypeFlags() {
    return {
        raw: 0,
        any: false,
        unknown: false,
        never: false,
        union: false,
        intersection: false,
        typeParameter: false,
        object: false,
        literal: false,
        nullable: false
    };
}

function typeFactId(kind, node, context) {
    const span = spanFromNode(node, context);
    return `type:${kind}:${span.path}:${String(span.start.offset)}`;
}

function callReceiverType(expression, context) {
    if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
        return safeTypeAtLocation(expression.expression, context);
    }
    return null;
}

function isAssertionTypeNode(node) {
    const parent = node.parent;
    return isTypeAssertion(parent) && parent.type === node;
}

function isTypeAssertion(node) {
    return node !== undefined && (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node));
}

function isJsonParseCall(node, context) {
    if (!ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== "parse") {
        return false;
    }
    if (node.expression.expression.getText(node.getSourceFile()) !== "JSON") {
        return false;
    }
    const symbol = resolveAlias(context.checker.getSymbolAtLocation(node.expression.name), context.checker);
    if (symbol === undefined) {
        return true;
    }
    return (symbol.getDeclarations?.() ?? []).some((declaration) => declaration.getSourceFile().isDeclarationFile);
}

function isRegExpConstruction(node, context) {
    const text = node.expression.getText(node.getSourceFile());
    if (text !== "RegExp" && text !== "globalThis.RegExp") {
        return false;
    }
    const symbol = resolveAlias(symbolAtCallee(node.expression, context), context.checker);
    if (symbol === undefined) {
        return true;
    }
    const declarations = symbol.getDeclarations?.() ?? [];
    return declarations.length === 0 || declarations.some((declaration) => declaration.getSourceFile().isDeclarationFile);
}

function splitRegexLiteral(raw) {
    const close = raw.lastIndexOf("/");
    if (!raw.startsWith("/") || close <= 0) {
        return { pattern: raw, flags: "" };
    }
    return {
        pattern: raw.slice(1, close),
        flags: raw.slice(close + 1)
    };
}

function staticString(node) {
    if (node === undefined) {
        return null;
    }
    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        return node.text;
    }
    return null;
}

function isModuleText(node) {
    return ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function hasModifier(node, kind) {
    return node.modifiers?.some((modifier) => modifier.kind === kind) ?? false;
}

function hasRuntimeValueDeclaration(symbol) {
    if (symbol === undefined) {
        return false;
    }
    if (symbol.valueDeclaration !== undefined) {
        return true;
    }
    return (symbol.flags & ts.SymbolFlags.Value) !== 0;
}

function spanKey(span) {
    return `${span.path}\0${String(span.start.offset)}\0${String(span.end.offset)}`;
}

function projectPath(cwd, fileName) {
    const absolute = resolve(fileName);
    const rel = relative(cwd, absolute);
    if (rel === "") {
        return basename(absolute);
    }
    if (!rel.startsWith("..") && !isAbsolute(rel)) {
        return rel.replaceAll("\\", "/");
    }
    return absolute.replaceAll("\\", "/");
}

function isInsideProject(fileName, cwd) {
    if (fileName === undefined) {
        return false;
    }
    const rel = relative(cwd, resolve(fileName));
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function isSerializableProjectDeclaration(declaration, context) {
    const sourceFile = declaration?.getSourceFile?.();
    if (sourceFile === undefined || sourceFile.isDeclarationFile) {
        return false;
    }
    const path = projectPath(context.cwd, sourceFile.fileName);
    return isInsideProject(sourceFile.fileName, context.cwd) && !path.split("/").includes("node_modules");
}

function scriptKindName(kind) {
    return (ts.ScriptKind[kind] ?? String(kind)).toLowerCase();
}

function diagnosticCategory(category) {
    if (category === ts.DiagnosticCategory.Error) return "error";
    if (category === ts.DiagnosticCategory.Warning) return "warning";
    if (category === ts.DiagnosticCategory.Suggestion) return "suggestion";
    return "message";
}

function formatFatalDiagnostic(diagnostic, cwd) {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    if (diagnostic.file === undefined || diagnostic.start === undefined) {
        return `TS${String(diagnostic.code)}: ${message}`;
    }
    const point = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    return `${projectPath(cwd, diagnostic.file.fileName)}:${String(point.line + 1)}:${String(point.character + 1)} TS${String(diagnostic.code)}: ${message}`;
}

function compareLocatedFacts(left, right) {
    const leftSpan = left.span;
    const rightSpan = right.span;
    return (leftSpan?.path ?? "").localeCompare(rightSpan?.path ?? "") ||
        (leftSpan?.start.offset ?? 0) - (rightSpan?.start.offset ?? 0) ||
        String(left.kind ?? left.name ?? "").localeCompare(String(right.kind ?? right.name ?? ""));
}

function compareLocatedNames(left, right) {
    return left.name.localeCompare(right.name) || compareLocatedFacts(left, right);
}

function compareDiagnostics(left, right) {
    return (PHASE_RANK.get(left.phase) ?? 99) - (PHASE_RANK.get(right.phase) ?? 99) ||
        (left.span?.path ?? "").localeCompare(right.span?.path ?? "") ||
        (left.span?.start.offset ?? 0) - (right.span?.start.offset ?? 0) ||
        left.code - right.code;
}

function compactText(value, limit) {
    if (value === undefined || value === null) {
        return "";
    }
    const text = String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "");
    return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function jsonSafeClone(value, seen = new Set(), skippedKeys = new Set()) {
    if (value === null || value === undefined || typeof value === "string" || typeof value === "boolean") {
        return value ?? null;
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "bigint") {
        return value.toString();
    }
    if (typeof value === "function" || typeof value === "symbol") {
        return undefined;
    }
    if (seen.has(value)) {
        return undefined;
    }
    seen.add(value);
    if (Array.isArray(value)) {
        const array = value.map((entry) => jsonSafeClone(entry, seen, skippedKeys)).filter((entry) => entry !== undefined);
        seen.delete(value);
        return array;
    }
    if (value instanceof Map) {
        const object = {};
        for (const [key, entry] of value.entries()) {
            const cloned = jsonSafeClone(entry, seen, skippedKeys);
            if (cloned !== undefined) object[String(key)] = cloned;
        }
        seen.delete(value);
        return object;
    }
    if (value instanceof Set) {
        const array = [...value].map((entry) => jsonSafeClone(entry, seen, skippedKeys)).filter((entry) => entry !== undefined);
        seen.delete(value);
        return array;
    }
    const object = {};
    for (const [key, entry] of Object.entries(value)) {
        if (skippedKeys.has(key)) continue;
        const cloned = jsonSafeClone(entry, seen, skippedKeys);
        if (cloned !== undefined) object[key] = cloned;
    }
    seen.delete(value);
    return object;
}

function walk(node, visitor) {
    visitor(node);
    ts.forEachChild(node, (child) => walk(child, visitor));
}
