import ts from "typescript";

const ENGINE_NAME = "algorithm-w-supplement";
const SCHEMA_VERSION = 1;
const DEFAULT_MAX_FRESH_VARIABLES = 32768;
const DEFAULT_MAX_UNIFICATIONS = 262144;
const DEFAULT_MAX_TYPE_DEPTH = 64;
const DEFAULT_MAX_CHECKER_PROPERTIES = 24;
const DEFAULT_MAX_CHECKER_TYPE_VISITS = 8192;
const DEFAULT_MAX_FORMAT_NODES = 512;
const DEFAULT_MAX_DISPLAY_LENGTH = 8192;
const DEFAULT_MAX_AST_VISITS = 262144;
const DEFAULT_MAX_SCHEDULER_OPERATIONS = 262144;
const INTERNAL_SCHEME = Symbol("hm-scheme");
const INTERNAL_OUTCOME = Symbol("hm-outcome");

const PRIMITIVE_TYPES = Object.freeze({
    bigint: primitive("bigint"),
    boolean: primitive("boolean"),
    null: primitive("null"),
    number: primitive("number"),
    string: primitive("string"),
    symbol: primitive("symbol"),
    undefined: primitive("undefined"),
    void: primitive("void")
});

/**
 * Infer advisory Hindley-Milner candidates for bindings in one TypeScript AST.
 * The TypeScript checker, when supplied, remains authoritative in every fact.
 */
export function inferHmCandidates(sourceFile, options = {}) {
    if (!isSourceFile(sourceFile)) {
        return invalidSourceFileReport(options.path);
    }

    const state = createState(sourceFile, options);
    const environment = createInitialEnvironment(state);
    processStatements(sourceFile.statements, environment, state, undefined);
    refreshBindingFacts(state);
    state.facts.sort(compareFacts);
    state.diagnostics.sort(compareDiagnostics);

    const status = state.budgetExceeded
        ? "budget-exceeded"
        : state.parseDiagnostics.length !== 0
            ? "parse-errors"
        : state.diagnostics.some((entry) => entry.category === "conflict")
            ? "completed-with-conflicts"
            : state.diagnostics.some((entry) => entry.category === "unsupported")
                ? "completed-with-unsupported-syntax"
                : "completed";

    return {
        schemaVersion: SCHEMA_VERSION,
        engine: {
            name: ENGINE_NAME,
            status,
            authoritative: false,
            role: "supplementary"
        },
        positionEncoding: "utf-16",
        rangesAreEndExclusive: true,
        path: state.path,
        facts: state.facts,
        diagnostics: state.diagnostics,
        stats: {
            bindings: state.facts.length,
            inferred: state.facts.filter((entry) => entry.hm.status === "inferred").length,
            partial: state.facts.filter((entry) => entry.hm.status === "partial").length,
            conflicts: state.diagnostics.filter((entry) => entry.category === "conflict").length,
            unsupported: state.diagnostics.filter((entry) => entry.category === "unsupported").length,
            budgetExceeded: state.budgetExceeded ? 1 : 0,
            freshVariables: state.freshVariables,
            unifications: state.unifications,
            astVisits: state.astVisits,
            schedulerOperations: state.schedulerOperations
        }
    };
}

export const inferHmSourceFile = inferHmCandidates;

/** Create a TypeScript SourceFile and run the supplementary inference pass. */
export function inferHmSourceText(source, options = {}) {
    const fileName = options.fileName ?? options.path ?? "hm-input.ts";
    const scriptKind = options.scriptKind ?? scriptKindForPath(fileName);
    let sourceFile;
    try {
        sourceFile = ts.createSourceFile(
            fileName,
            source,
            options.scriptTarget ?? ts.ScriptTarget.Latest,
            true,
            scriptKind
        );
    } catch (error) {
        return invalidSourceTextReport(fileName, error);
    }
    return inferHmCandidates(sourceFile, {
        ...options,
        path: options.path ?? fileName
    });
}

function invalidSourceTextReport(path, error) {
    const report = invalidSourceFileReport(path);
    const detail = error instanceof Error ? error.message : String(error);
    report.engine.status = "budget-exceeded";
    report.diagnostics = [{
        origin: "typescript",
        phase: "syntax",
        severity: "error",
        category: "budget-exceeded",
        code: "HM_PARSE_FAILURE",
        message: boundedText(`TypeScript parser could not safely construct an AST: ${detail}`, 1024),
        path: normalizePath(path),
        authoritative: true
    }];
    report.stats.budgetExceeded = 1;
    return report;
}

/**
 * Select display authority without allowing an HM candidate to replace a
 * TypeScript checker result. HM is selected only in syntax-only mode.
 */
export function selectTypeAuthority(input) {
    const annotation = normalizeAnnotationFact(input?.annotation);
    const typeScript = normalizeTypeScriptFact(input?.typescript);
    const hm = normalizeHmFact(input?.hm);

    if (annotation !== undefined && annotation.valid &&
        (typeScript.status === "resolved" || typeScript.status === "intentional-dynamic")) {
        return {
            source: "annotation",
            display: typeScript.display ?? annotation.display,
            trust: "authoritative",
            reason: "valid-explicit-annotation"
        };
    }

    if (typeScript.status !== "unavailable") {
        return {
            source: "typescript",
            display: typeScript.display ?? "<TypeScript error type>",
            trust: typeScript.status === "error-derived" ? "degraded" : "authoritative",
            reason: typeScript.status === "error-derived"
                ? "checker-result-retained-despite-diagnostic"
                : "typescript-checker-authority"
        };
    }

    if (hm.status === "inferred" || hm.status === "partial") {
        return {
            source: "hm",
            display: hm.display ?? "<inferred>",
            trust: "advisory",
            reason: "typescript-checker-unavailable"
        };
    }

    return {
        source: "unknown",
        display: "<unknown>",
        trust: "none",
        reason: "no-authoritative-or-advisory-type"
    };
}

/** Render an internal/serialized HM type or scheme deterministically. */
export function formatHmType(typeOrScheme) {
    const names = new Map();
    const budget = { nodes: 0, maxNodes: DEFAULT_MAX_FORMAT_NODES };
    if (isScheme(typeOrScheme)) {
        const quantified = [...typeOrScheme.vars].sort((left, right) => left - right);
        for (let index = 0; index < quantified.length; index += 1) {
            names.set(quantified[index], typeVariableName(index));
        }
        const body = formatType(
            typeOrScheme.type,
            names,
            0,
            DEFAULT_MAX_TYPE_DEPTH,
            new Set(),
            budget
        );
        if (quantified.length === 0) {
            return boundedText(body, DEFAULT_MAX_DISPLAY_LENGTH);
        }
        return boundedText(
            `forall ${quantified.map((id) => names.get(id)).join(" ")}. ${body}`,
            DEFAULT_MAX_DISPLAY_LENGTH
        );
    }
    return boundedText(
        formatType(typeOrScheme, names, 0, DEFAULT_MAX_TYPE_DEPTH, new Set(), budget),
        DEFAULT_MAX_DISPLAY_LENGTH
    );
}

function createState(sourceFile, options) {
    const suppliedDiagnostics = Array.isArray(options.compilerDiagnostics)
        ? options.compilerDiagnostics
        : [];
    const parseDiagnostics = Array.isArray(sourceFile.parseDiagnostics)
        ? sourceFile.parseDiagnostics
        : [];
    const compilerDiagnostics = mergeCompilerDiagnostics(suppliedDiagnostics, parseDiagnostics);
    const state = {
        sourceFile,
        path: normalizePath(options.path ?? sourceFile.fileName),
        checker: options.checker,
        typeScriptFact: typeof options.typeScriptFact === "function"
            ? options.typeScriptFact
            : undefined,
        compilerDiagnostics,
        parseDiagnostics,
        maxFreshVariables: readPositiveInteger(options.maxFreshVariables, DEFAULT_MAX_FRESH_VARIABLES),
        maxUnifications: readPositiveInteger(options.maxUnifications, DEFAULT_MAX_UNIFICATIONS),
        maxTypeDepth: readPositiveInteger(options.maxTypeDepth, DEFAULT_MAX_TYPE_DEPTH),
        maxCheckerProperties: readPositiveInteger(options.maxCheckerProperties, DEFAULT_MAX_CHECKER_PROPERTIES),
        maxCheckerTypeVisits: readPositiveInteger(
            options.maxCheckerTypeVisits,
            DEFAULT_MAX_CHECKER_TYPE_VISITS
        ),
        checkerTypeVisits: 0,
        checkerTypeCache: new Map(),
        maxAstVisits: readPositiveInteger(options.maxAstVisits, DEFAULT_MAX_AST_VISITS),
        astVisits: 0,
        maxSchedulerOperations: readPositiveInteger(
            options.maxSchedulerOperations,
            DEFAULT_MAX_SCHEDULER_OPERATIONS
        ),
        schedulerOperations: 0,
        budgetOpaqueType: opaqueType("<inference-budget-exceeded>"),
        nextVariableId: 0,
        freshVariables: 0,
        unifications: 0,
        unificationDepth: 0,
        constraintTransactionDepth: 0,
        expressionDepth: 0,
        statementDepth: 0,
        functionInferenceDepth: 0,
        unificationTrail: [],
        budgetExceeded: false,
        budgetDiagnosticRecorded: false,
        facts: [],
        diagnostics: [],
        diagnosticKeys: new Set(),
        level: 0
    };
    for (const diagnostic of parseDiagnostics) {
        recordParseDiagnostic(state, diagnostic);
    }
    return state;
}

function createInitialEnvironment(state) {
    const environment = new Map();
    environment.set("undefined", environmentEntry(mono(PRIMITIVE_TYPES.undefined), false));
    environment.set("NaN", environmentEntry(mono(PRIMITIVE_TYPES.number), false));
    environment.set("Infinity", environmentEntry(mono(PRIMITIVE_TYPES.number), false));
    const arrayElement = freshVariable(state, 0, false);
    const arrayConstructor = functionType(
        [arrayElement],
        constructorType("Array", [arrayElement], true),
        arrayElement.kind === "variable" ? [arrayElement.id] : []
    );
    environment.set("Array", environmentEntry(scheme(
        arrayElement.kind === "variable" ? new Set([arrayElement.id]) : new Set(),
        arrayConstructor
    ), false));
    return environment;
}

class FunctionScopeEnvironment {
    constructor(parent) {
        this.parent = parent;
        this.bindings = new Map();
        this.pendingBindings = new Map();
        this.generalizationVariables = parent.generalizationVariables;
    }

    get(name) {
        const own = this.bindings.get(name);
        if (own !== undefined || this.bindings.has(name)) {
            return own;
        }
        const inherited = this.parent.get(name);
        if (inherited === undefined || !inherited.pending) {
            return inherited;
        }
        const cached = this.pendingBindings.get(name);
        if (cached !== undefined) {
            return cached;
        }
        const visible = {
            ...inherited,
            pending: false,
            deferred: !inherited.deferredSafe
        };
        this.pendingBindings.set(name, visible);
        return visible;
    }

    set(name, entry) {
        this.pendingBindings.delete(name);
        this.bindings.set(name, entry);
        return this;
    }

    *[Symbol.iterator]() {
        const shadowed = new Set();
        for (const [name, entry] of this.bindings) {
            shadowed.add(name);
            yield [name, entry];
        }
        for (const [name] of this.parent) {
            if (!shadowed.has(name)) {
                yield [name, this.get(name)];
            }
        }
    }

    *values() {
        for (const [, entry] of this) {
            yield entry;
        }
    }
}

class NestedScopeEnvironment {
    constructor(parent) {
        this.parent = parent;
        this.bindings = new Map();
        this.generalizationVariables = parent.generalizationVariables;
    }

    get(name) {
        if (this.bindings.has(name)) {
            return this.bindings.get(name);
        }
        return this.parent.get(name);
    }

    set(name, entry) {
        this.bindings.set(name, entry);
        return this;
    }

    *[Symbol.iterator]() {
        const shadowed = new Set();
        for (const [name, entry] of this.bindings) {
            shadowed.add(name);
            yield [name, entry];
        }
        for (const [name, entry] of this.parent) {
            if (!shadowed.has(name)) {
                yield [name, entry];
            }
        }
    }

    *values() {
        for (const [, entry] of this) {
            yield entry;
        }
    }
}

class GeneralizationContext {
    constructor(parent = undefined) {
        this.parent = parent;
        this.variables = new Map();
    }

    has(id) {
        return this.variables.has(id) || this.parent?.has(id) === true;
    }

    set(id, variable) {
        this.variables.set(id, variable);
        return this;
    }
}

function processStatements(
    statements,
    environment,
    state,
    functionContext,
    inheritedGeneralizationVariables = undefined
) {
    state.statementDepth += 1;
    if (state.statementDepth > state.maxTypeDepth) {
        state.statementDepth -= 1;
        state.budgetExceeded = true;
        const origin = statements[0] ?? state.sourceFile;
        ensureBudgetDiagnostic(state, origin);
        return { partial: true };
    }
    const result = processStatementsStep(
        statements,
        environment,
        state,
        functionContext,
        inheritedGeneralizationVariables
    );
    state.statementDepth -= 1;
    return result;
}

function processStatementsStep(
    statements,
    environment,
    state,
    functionContext,
    inheritedGeneralizationVariables
) {
    const localEnvironment = environment;
    const functionGroup = prebindFunctionDeclarationGroup(statements, localEnvironment, state);
    const variableSlots = prebindVariableDeclarations(statements, localEnvironment, state);
    let partial = false;
    const functionPlan = planFunctionLikeDeclarations(
        statements,
        functionGroup,
        variableSlots,
        state
    );
    const preInferredVariables = new Set();

    const preludeEntries = planPreludeDeclarations(statements, functionGroup, state);
    const localVariableNames = new Set();
    for (const statement of statements) {
        if (!ts.isVariableStatement(statement)) {
            continue;
        }
        for (const declaration of statement.declarationList.declarations) {
            if (ts.isIdentifier(declaration.name)) {
                localVariableNames.add(declaration.name.text);
            }
        }
    }
    const locallyPreboundNames = new Set([...localVariableNames, ...functionPlan.names]);
    const baseGeneralizationVariables = inheritedGeneralizationVariables === undefined
        ? freeEnvironmentVariables(localEnvironment, locallyPreboundNames)
        : inheritedGeneralizationVariables;
    const preludeGeneralizationVariables = new GeneralizationContext(
        baseGeneralizationVariables
    );
    localEnvironment.generalizationVariables = preludeGeneralizationVariables;
    const temporarilyInitializedPrelude = [];
    for (const entry of preludeEntries) {
        const result = inferVariableDeclaration(
            entry.declaration,
            entry.declarationList,
            localEnvironment,
            state,
            variableSlots.get(entry.declaration),
            true,
            true,
            preludeGeneralizationVariables
        );
        preInferredVariables.add(entry.declaration);
        if (ts.isIdentifier(entry.declaration.name)) {
            const initialized = localEnvironment.get(entry.declaration.name.text);
            if (initialized !== undefined) {
                initialized.pending = false;
                temporarilyInitializedPrelude.push(initialized);
            }
        }
        partial = partial || !result.ok || result.partial;
    }
    for (const initialized of temporarilyInitializedPrelude) {
        initialized.pending = true;
    }

    const functionGeneralizationVariables = new GeneralizationContext(
        preludeGeneralizationVariables
    );
    localEnvironment.generalizationVariables = functionGeneralizationVariables;
    for (const component of functionPlan.components) {
        const result = inferFunctionLikeComponent(
            component,
            localEnvironment,
            state,
            functionGeneralizationVariables
        );
        for (const entry of component) {
            if (entry.kind === "const") {
                preInferredVariables.add(entry.declaration);
            }
        }
        partial = partial || result.partial;
    }

    const sequentialGeneralizationVariables = new GeneralizationContext(
        functionGeneralizationVariables
    );
    localEnvironment.generalizationVariables = sequentialGeneralizationVariables;
    for (const statement of statements) {
        if (ts.isFunctionDeclaration(statement)) {
            continue;
        }
        if (ts.isVariableStatement(statement)) {
            for (const declaration of statement.declarationList.declarations) {
                if (preInferredVariables.has(declaration)) {
                    if (ts.isIdentifier(declaration.name)) {
                        const entry = localEnvironment.get(declaration.name.text);
                        if (entry !== undefined) {
                            entry.pending = false;
                        }
                    }
                    continue;
                }
                const result = inferVariableDeclaration(
                    declaration,
                    statement.declarationList,
                    localEnvironment,
                    state,
                    variableSlots.get(declaration),
                    false,
                    false,
                    sequentialGeneralizationVariables
                );
                partial = partial || !result.ok || result.partial;
            }
            continue;
        }
        if (ts.isReturnStatement(statement)) {
            if (functionContext === undefined) {
                partial = true;
                recordUnsupported(state, statement, "HM_RETURN_OUTSIDE_FUNCTION", "return outside an inferred function body");
                continue;
            }
            functionContext.returnCount += 1;
            const expressionResult = statement.expression === undefined
                ? success(PRIMITIVE_TYPES.void, false, false)
                : inferExpression(statement.expression, localEnvironment, state);
            if (!expressionResult.ok) {
                partial = true;
                recordInferenceFailure(state, statement, expressionResult);
                continue;
            }
            if (functionContext.unionFallback) {
                partial = true;
                continue;
            }
            const unified = unify(functionContext.returnType, expressionResult.type, state, statement);
            if (!unified.ok) {
                partial = true;
                if (unified.code === "HM_TYPE_MISMATCH" && !functionContext.explicitReturn) {
                    const unionFallback = failure(
                        "unsupported",
                        "HM_TYPESCRIPT_UNION_REQUIRED",
                        "heterogeneous return paths require TypeScript union semantics"
                    );
                    recordInferenceFailure(state, statement, unionFallback);
                    functionContext.returnType = opaqueType("<typescript-union>");
                    functionContext.unionFallback = true;
                } else {
                    recordInferenceFailure(state, statement, unified);
                }
            }
            partial = partial || expressionResult.partial;
            continue;
        }
        if (ts.isExpressionStatement(statement)) {
            const result = inferExpression(statement.expression, localEnvironment, state);
            if (!result.ok) {
                recordInferenceFailure(state, statement.expression, result);
            }
            partial = partial || !result.ok || result.partial;
            continue;
        }
        if (ts.isBlock(statement)) {
            const child = processStatements(
                statement.statements,
                new NestedScopeEnvironment(localEnvironment),
                state,
                functionContext,
                sequentialGeneralizationVariables
            );
            partial = partial || child.partial;
            continue;
        }
        if (ts.isIfStatement(statement)) {
            partial = true;
            const condition = inferExpression(statement.expression, localEnvironment, state);
            if (!condition.ok) {
                recordInferenceFailure(state, statement.expression, condition);
            }
            partial = partial || !condition.ok || condition.partial;
            partial = processBranch(
                statement.thenStatement,
                localEnvironment,
                state,
                functionContext,
                sequentialGeneralizationVariables
            ) || partial;
            if (statement.elseStatement !== undefined) {
                partial = processBranch(
                    statement.elseStatement,
                    localEnvironment,
                    state,
                    functionContext,
                    sequentialGeneralizationVariables
                ) || partial;
            }
            continue;
        }
        if (ts.isThrowStatement(statement)) {
            if (statement.expression !== undefined) {
                const result = inferExpression(statement.expression, localEnvironment, state);
                if (!result.ok) {
                    recordInferenceFailure(state, statement.expression, result);
                }
                partial = partial || !result.ok || result.partial;
            }
            continue;
        }
        if (ts.isEmptyStatement(statement) || ts.isTypeAliasDeclaration(statement) ||
            ts.isInterfaceDeclaration(statement) || ts.isImportDeclaration(statement) ||
            ts.isExportDeclaration(statement)) {
            continue;
        }

        partial = true;
        recordUnsupported(
            state,
            statement,
            "HM_UNSUPPORTED_STATEMENT",
            `statement kind '${ts.SyntaxKind[statement.kind] ?? String(statement.kind)}' is outside the HM subset`
        );
    }

    return { partial };
}

function processBranch(
    statement,
    environment,
    state,
    functionContext,
    generalizationVariables
) {
    if (ts.isBlock(statement)) {
        return processStatements(
            statement.statements,
            new NestedScopeEnvironment(environment),
            state,
            functionContext,
            generalizationVariables
        ).partial;
    }
    return processStatements(
        [statement],
        new NestedScopeEnvironment(environment),
        state,
        functionContext,
        generalizationVariables
    ).partial;
}

function prebindFunctionDeclarationGroup(statements, environment, state) {
    const declarations = statements.filter((statement) =>
        ts.isFunctionDeclaration(statement) && statement.name !== undefined && statement.body !== undefined);
    const slots = new Map();
    const names = new Set();
    for (const declaration of declarations) {
        const slot = freshVariable(state, state.level + 1, false);
        slots.set(declaration, slot);
        names.add(declaration.name.text);
        installBindingEntry(
            environment,
            declaration.name.text,
            environmentEntry(mono(slot), false),
            false
        );
    }
    return { declarations, slots, names };
}

function prebindVariableDeclarations(statements, environment, state) {
    const slots = new Map();
    for (const statement of statements) {
        if (!ts.isVariableStatement(statement)) {
            continue;
        }
        const mutable = (statement.declarationList.flags & ts.NodeFlags.Const) === 0;
        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name)) {
                continue;
            }
            const slot = freshVariable(state, state.level + 1, false);
            slots.set(declaration, slot);
            installBindingEntry(
                environment,
                declaration.name.text,
                environmentEntry(
                    mono(slot),
                    mutable,
                    "complete",
                    true,
                    false,
                    new Set(),
                    new Set(),
                    new Set(),
                    new Set(),
                    declaration.getStart(state.sourceFile, false)
                ),
                false
            );
        }
    }
    return slots;
}

function planPreludeDeclarations(statements, functionGroup, state) {
    const allEntries = [];
    let firstFunctionLikePosition = Number.POSITIVE_INFINITY;
    for (const statement of statements) {
        if (ts.isFunctionDeclaration(statement)) {
            firstFunctionLikePosition = Math.min(firstFunctionLikePosition, statement.pos);
            continue;
        }
        if (!ts.isVariableStatement(statement)) {
            continue;
        }
        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name)) {
                continue;
            }
            const entry = { declaration, declarationList: statement.declarationList };
            allEntries.push(entry);
            const initializer = declaration.initializer === undefined
                ? undefined
                : unwrapParenthesizedExpression(declaration.initializer);
            if (initializer !== undefined &&
                (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) {
                firstFunctionLikePosition = Math.min(firstFunctionLikePosition, declaration.pos);
            }
        }
    }
    if (!Number.isFinite(firstFunctionLikePosition)) {
        return [];
    }

    const entryByName = new Map(allEntries.map((entry) => [entry.declaration.name.text, entry]));
    const allNames = new Set([...entryByName.keys(), ...functionGroup.names]);
    const initialized = new Set();
    const prelude = [];
    for (const entry of allEntries.sort((left, right) =>
        left.declaration.pos - right.declaration.pos)) {
        const declaration = entry.declaration;
        const initializer = declaration.initializer === undefined
            ? undefined
            : unwrapParenthesizedExpression(declaration.initializer);
        if (declaration.pos >= firstFunctionLikePosition || declaration.initializer === undefined ||
            (initializer !== undefined &&
                (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)))) {
            break;
        }
        const dependencies = collectBindingDependencies(
            declaration.initializer,
            allNames,
            entryByName,
            state
        );
        const safe = [...dependencies].every((dependency) => initialized.has(dependency));
        if (!safe) {
            break;
        }
        prelude.push(entry);
        initialized.add(declaration.name.text);
    }
    return prelude;
}

function planFunctionLikeDeclarations(statements, functionGroup, variableSlots, state) {
    const entries = [];
    for (const statement of statements) {
        if (ts.isFunctionDeclaration(statement) && statement.name !== undefined &&
            statement.body !== undefined) {
            entries.push({
                kind: "function",
                name: statement.name.text,
                nameNode: statement.name,
                declaration: statement,
                functionNode: statement,
                slot: functionGroup.slots.get(statement)
            });
            continue;
        }
        if (!ts.isVariableStatement(statement) ||
            (statement.declarationList.flags & ts.NodeFlags.Const) === 0) {
            continue;
        }
        for (const declaration of statement.declarationList.declarations) {
            const initializer = declaration.initializer === undefined
                ? undefined
                : unwrapParenthesizedExpression(declaration.initializer);
            if (ts.isIdentifier(declaration.name) && initializer !== undefined &&
                (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) {
                entries.push({
                    kind: "const",
                    name: declaration.name.text,
                    nameNode: declaration.name,
                    declaration,
                    declarationList: statement.declarationList,
                    functionNode: initializer,
                    slot: variableSlots.get(declaration)
                });
            }
        }
    }
    const entryByName = new Map(entries.map((entry) => [entry.name, entry]));
    const allNames = new Set(entryByName.keys());
    const dependencies = new Map(entries.map((entry) => [
        entry.name,
        collectBindingDependencies(entry.functionNode, allNames, entryByName, state)
    ]));
    if (!reserveSchedulerOperations(
        state,
        entries,
        dependencies,
        entries[0]?.declaration ?? state.sourceFile
    )) {
        return {
            names: new Set(entryByName.keys()),
            components: entries.length === 0 ? [] : [entries]
        };
    }
    const components = stronglyConnectedNamedComponents(
        entries,
        dependencies,
        (entry) => entry.name
    );
    const ordered = orderDependencyComponents(
        components,
        dependencies,
        (entry) => entry.name,
        entries
    );
    return {
        names: new Set(entryByName.keys()),
        components: ordered
    };
}

function collectBindingDependencies(node, names, entryByName, state) {
    const dependencies = new Set();
    const boundNameCounts = new Map();
    const stack = [{ node, exiting: false, bindings: undefined }];
    while (stack.length !== 0) {
        const frame = stack.pop();
        if (frame.exiting) {
            for (const name of frame.bindings) {
                const remaining = (boundNameCounts.get(name) ?? 1) - 1;
                if (remaining === 0) {
                    boundNameCounts.delete(name);
                } else {
                    boundNameCounts.set(name, remaining);
                }
            }
            continue;
        }
        const current = frame.node;
        if (!consumeAstVisit(state, current)) {
            break;
        }
        const bindings = dependencyScopeBindings(current, node);
        if (bindings !== undefined) {
            for (const name of bindings) {
                boundNameCounts.set(name, (boundNameCounts.get(name) ?? 0) + 1);
            }
            stack.push({ node: current, exiting: true, bindings });
        }
        if (ts.isIdentifier(current) && names.has(current.text) &&
            !boundNameCounts.has(current.text) && isValueIdentifierReference(current)) {
            if (state.checker === undefined || !entryByName.has(current.text)) {
                dependencies.add(current.text);
            } else {
                const reference = state.checker.getSymbolAtLocation(current);
                const target = state.checker.getSymbolAtLocation(
                    entryByName.get(current.text).nameNode
                );
                if (reference !== undefined && reference === target) {
                    dependencies.add(current.text);
                }
            }
        }
        const children = [];
        ts.forEachChild(current, (child) => {
            children.push(child);
        });
        for (let index = children.length - 1; index >= 0; index -= 1) {
            stack.push({ node: children[index], exiting: false, bindings: undefined });
        }
    }
    return dependencies;
}

function dependencyScopeBindings(node, root) {
    const bindings = new Set();
    if (isDependencyFunctionLike(node)) {
        for (const parameter of node.parameters) {
            addBindingNames(parameter.name, bindings);
        }
        if (ts.isFunctionExpression(node) && node.name !== undefined) {
            bindings.add(node.name.text);
        } else if (node !== root && ts.isFunctionDeclaration(node) && node.name !== undefined) {
            bindings.add(node.name.text);
        }
        return bindings;
    }
    if (ts.isBlock(node)) {
        for (const statement of node.statements) {
            if (ts.isVariableStatement(statement)) {
                for (const declaration of statement.declarationList.declarations) {
                    addBindingNames(declaration.name, bindings);
                }
            } else if ((ts.isFunctionDeclaration(statement) ||
                ts.isClassDeclaration(statement)) && statement.name !== undefined) {
                bindings.add(statement.name.text);
            }
        }
        return bindings;
    }
    if (ts.isCatchClause(node) && node.variableDeclaration !== undefined) {
        addBindingNames(node.variableDeclaration.name, bindings);
        return bindings;
    }
    if (ts.isForStatement(node) && node.initializer !== undefined &&
        ts.isVariableDeclarationList(node.initializer)) {
        for (const declaration of node.initializer.declarations) {
            addBindingNames(declaration.name, bindings);
        }
        return bindings;
    }
    if ((ts.isForInStatement(node) || ts.isForOfStatement(node)) &&
        ts.isVariableDeclarationList(node.initializer)) {
        for (const declaration of node.initializer.declarations) {
            addBindingNames(declaration.name, bindings);
        }
        return bindings;
    }
    return undefined;
}

function isDependencyFunctionLike(node) {
    return ts.isArrowFunction(node) || ts.isFunctionExpression(node) ||
        ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node) ||
        ts.isConstructorDeclaration(node);
}

function addBindingNames(name, output) {
    const stack = [name];
    while (stack.length !== 0) {
        const current = stack.pop();
        if (ts.isIdentifier(current)) {
            output.add(current.text);
            continue;
        }
        for (const element of current.elements) {
            if (!ts.isOmittedExpression(element)) {
                stack.push(element.name);
            }
        }
    }
}

function collectRuntimeCaptureEdges(
    node,
    environment,
    state,
    initiallyBoundNames = new Set(),
    analysisDepth = 0
) {
    const pendingCaptures = new Set();
    const invokedCaptures = new Set();
    const nestedBoundaryCaptures = new Set();
    const returnedBoundaryCaptures = new Set();
    let reliable = true;
    if (analysisDepth > state.maxTypeDepth) {
        state.budgetExceeded = true;
        ensureBudgetDiagnostic(state, node);
        return {
            pendingCaptures,
            invokedCaptures,
            nestedBoundaryCaptures,
            returnedBoundaryCaptures,
            reliable: false
        };
    }
    const boundNameCounts = new Map(
        [...initiallyBoundNames].map((name) => [name, 1])
    );
    const stack = [{ node, exiting: false, bindings: undefined }];
    while (stack.length !== 0) {
        const frame = stack.pop();
        if (frame.exiting) {
            for (const name of frame.bindings) {
                const remaining = (boundNameCounts.get(name) ?? 1) - 1;
                if (remaining === 0) {
                    boundNameCounts.delete(name);
                } else {
                    boundNameCounts.set(name, remaining);
                }
            }
            continue;
        }
        const current = frame.node;
        if (!consumeAstVisit(state, current)) {
            break;
        }
        if (ts.isVariableDeclarationList(current) &&
            (current.flags & (ts.NodeFlags.Const | ts.NodeFlags.Let)) === 0) {
            reliable = false;
            recordUnsupported(
                state,
                current,
                "HM_VAR_HOISTING_BOUNDARY",
                "function-scoped var hoisting is delegated to the TypeScript control-flow analyzer"
            );
        }
        if (current !== node && isDependencyFunctionLike(current) &&
            !isDirectCallReference(current)) {
            state.schedulerOperations += boundNameCounts.size;
            if (state.schedulerOperations > state.maxSchedulerOperations) {
                state.budgetExceeded = true;
                reliable = false;
                ensureBudgetDiagnostic(state, current);
                break;
            }
            const nestedCaptures = collectRuntimeCaptureEdges(
                current,
                environment,
                state,
                new Set(boundNameCounts.keys()),
                analysisDepth + 1
            );
            const pendingNestedCaptures = findPendingRuntimeCaptures(
                nestedCaptures.pendingCaptures,
                nestedCaptures.invokedCaptures,
                state,
                current
            );
            const boundaryCaptures = isDirectlyReturnedClosure(current, node)
                ? returnedBoundaryCaptures
                : nestedBoundaryCaptures;
            for (const capture of pendingNestedCaptures) {
                boundaryCaptures.add(capture);
            }
            for (const capture of nestedCaptures.nestedBoundaryCaptures) {
                boundaryCaptures.add(capture);
            }
            for (const capture of nestedCaptures.returnedBoundaryCaptures) {
                boundaryCaptures.add(capture);
            }
            continue;
        }
        const bindings = dependencyScopeBindings(current, node);
        if (bindings !== undefined) {
            for (const name of bindings) {
                boundNameCounts.set(name, (boundNameCounts.get(name) ?? 0) + 1);
            }
            stack.push({ node: current, exiting: true, bindings });
        }
        if (ts.isIdentifier(current) && !boundNameCounts.has(current.text) &&
            isValueIdentifierReference(current)) {
            const entry = environment.get(current.text);
            const bindingCell = entry === undefined
                ? undefined
                : ensureBindingCell(entry, current.text);
            if (entry?.pending) {
                pendingCaptures.add(bindingCell);
            }
            if (entry !== undefined && isDirectCallReference(current)) {
                invokedCaptures.add(bindingCell);
            }
        }
        const children = [];
        ts.forEachChild(current, (child) => {
            children.push(child);
        });
        for (let index = children.length - 1; index >= 0; index -= 1) {
            stack.push({ node: children[index], exiting: false, bindings: undefined });
        }
    }
    return {
        pendingCaptures,
        invokedCaptures,
        nestedBoundaryCaptures,
        returnedBoundaryCaptures,
        reliable
    };
}

function isDirectlyReturnedClosure(node, owner) {
    let expression = node;
    let parent = node.parent;
    while (parent !== undefined && ts.isParenthesizedExpression(parent) &&
        parent.expression === expression) {
        expression = parent;
        parent = parent.parent;
    }
    return (parent !== undefined && ts.isReturnStatement(parent) &&
        parent.expression === expression) ||
        (ts.isArrowFunction(owner) && owner.body === expression);
}

function isDirectCallReference(node) {
    let expression = node;
    let parent = node.parent;
    while (parent !== undefined && ts.isParenthesizedExpression(parent) &&
        parent.expression === expression) {
        expression = parent;
        parent = parent.parent;
    }
    return parent !== undefined && ts.isCallExpression(parent) && parent.expression === expression;
}

function inferFunctionLikeComponent(component, environment, state, environmentVariables) {
    const componentNames = new Set(component.map((entry) => entry.name));
    for (const name of componentNames) {
        const entry = environment.get(name);
        if (entry !== undefined) {
            entry.deferredSafe = true;
        }
    }
    const runtimeCaptures = new Map();
    for (const entry of component) {
        runtimeCaptures.set(
            entry,
            collectRuntimeCaptureEdges(
                entry.functionNode,
                environment,
                state,
                new Set(),
                0
            )
        );
    }

    state.level += 1;
    const bodyGeneralizationVariables = new GeneralizationContext(environmentVariables);
    for (const entry of component) {
        if (entry.slot !== undefined) {
            addSchemeFreeVariables(bodyGeneralizationVariables, mono(entry.slot));
        }
    }
    const results = [];
    for (const entry of component) {
        const declaration = entry.declaration;
        let outcome = inferFunctionLike(
            entry.functionNode,
            environment,
            state,
            bodyGeneralizationVariables
        );
        if (entry.kind === "const") {
            const annotationType = translateTypeNode(declaration.type, state);
            if (outcome.ok && declaration.type !== undefined && annotationType === undefined) {
                outcome = success(outcome.type, outcome.expansive, true);
                if (!state.budgetExceeded) {
                    recordUnsupported(
                        state,
                        declaration.type,
                        "HM_UNSUPPORTED_TYPE_ANNOTATION",
                        "this TypeScript annotation is outside the HM type subset"
                    );
                }
            }
            if (outcome.ok && annotationType !== undefined) {
                const unified = unify(outcome.type, annotationType, state, declaration);
                if (!unified.ok) {
                    recordInferenceFailure(state, declaration, unified);
                    outcome = unified;
                } else {
                    outcome = success(annotationType, outcome.expansive, outcome.partial);
                }
            }
        }

        if (outcome.ok && entry.slot !== undefined) {
            const unified = unify(entry.slot, outcome.type, state, declaration);
            if (!unified.ok) {
                recordInferenceFailure(state, declaration, unified);
                outcome = unified;
            }
        }
        results.push({ entry, outcome });
    }
    state.level -= 1;

    const componentComplete = results.every(({ outcome }) =>
        outcome.ok && !outcome.partial && !outcome.expansive) &&
        state.parseDiagnostics.length === 0;
    const finalized = results.map((result) => {
        const bindingType = result.entry.slot ?? (result.outcome.ok
            ? result.outcome.type
            : checkerSeedForNode(result.entry.nameNode, state) ??
                freshVariable(state, state.level, true));
        const eligible = componentComplete && result.outcome.ok;
        const inferredScheme = eligible
            ? generalizeAtLevel(bindingType, state.level)
            : mono(bindingType);
        if (!eligible) {
            markWeakVariables(bindingType);
        }
        return { ...result, eligible, inferredScheme };
    });
    for (const result of finalized) {
        const analyzedCaptures = runtimeCaptures.get(result.entry);
        const captures = analyzedCaptures?.reliable !== false
            ? analyzedCaptures ?? {
                pendingCaptures: new Set(),
                invokedCaptures: new Set(),
                nestedBoundaryCaptures: new Set(),
                returnedBoundaryCaptures: new Set(),
                reliable: true
            }
            : {
                pendingCaptures: new Set(),
                invokedCaptures: new Set(),
                nestedBoundaryCaptures: new Set(),
                returnedBoundaryCaptures: new Set(),
                reliable: false
            };
        installBindingEntry(
            environment,
            result.entry.name,
            environmentEntry(
                result.inferredScheme,
                false,
                !result.outcome.ok
                    ? result.outcome.category
                    : result.outcome.partial
                        ? "partial"
                        : "complete",
                result.entry.kind === "const",
                true,
                captures.pendingCaptures,
                captures.invokedCaptures,
                captures.nestedBoundaryCaptures,
                captures.returnedBoundaryCaptures,
                result.entry.kind === "const"
                    ? result.entry.declaration.getStart(state.sourceFile, false)
                    : undefined
            )
        );

        const isFunctionDeclaration = result.entry.kind === "function";
        const valueRestriction = {
            eligible: result.eligible,
            generalized: result.inferredScheme.vars.size !== 0,
            reason: !result.outcome.ok
                ? "inference-not-complete"
                : !result.eligible
                    ? "partial-inference"
                    : result.inferredScheme.vars.size === 0
                        ? "no-free-type-variables"
                        : isFunctionDeclaration
                            ? "function-declaration-scc"
                            : "non-expansive-const"
        };
        recordBindingFact(
            result.entry.nameNode,
            result.entry.declaration,
            isFunctionDeclaration ? "function" : "const",
            result.outcome,
            result.inferredScheme,
            valueRestriction,
            state
        );
    }
    for (const result of finalized) {
        addSchemeFreeVariables(environmentVariables, result.inferredScheme);
    }
    return {
        partial: results.some(({ outcome }) => !outcome.ok || outcome.partial)
    };
}

function consumeAstVisit(state, node) {
    state.astVisits += 1;
    if (state.astVisits <= state.maxAstVisits) {
        return true;
    }
    state.budgetExceeded = true;
    ensureBudgetDiagnostic(state, node);
    return false;
}

function reserveSchedulerOperations(state, items, dependencies, origin) {
    let operations = items.length * 8;
    for (const dependencySet of dependencies.values()) {
        operations += dependencySet.size * 8;
    }
    state.schedulerOperations += operations;
    if (state.schedulerOperations <= state.maxSchedulerOperations) {
        return true;
    }
    state.budgetExceeded = true;
    ensureBudgetDiagnostic(state, origin);
    return false;
}

function orderDependencyComponents(components, dependencies, getName, sourceItems) {
    const componentByName = new Map();
    for (let index = 0; index < components.length; index += 1) {
        for (const item of components[index]) {
            componentByName.set(getName(item), index);
        }
    }
    const componentDependencies = components.map(() => new Set());
    for (let index = 0; index < components.length; index += 1) {
        for (const item of components[index]) {
            for (const dependency of dependencies.get(getName(item)) ?? []) {
                const dependencyIndex = componentByName.get(dependency);
                if (dependencyIndex !== undefined && dependencyIndex !== index) {
                    componentDependencies[index].add(dependencyIndex);
                }
            }
        }
    }

    const componentDependents = components.map(() => new Set());
    const indegrees = componentDependencies.map((component) => component.size);
    for (let index = 0; index < componentDependencies.length; index += 1) {
        for (const dependency of componentDependencies[index]) {
            componentDependents[dependency].add(index);
        }
    }

    const sourceComponentOrder = [];
    const sourceComponentsSeen = new Set();
    for (const item of sourceItems) {
        const index = componentByName.get(getName(item));
        if (index !== undefined && !sourceComponentsSeen.has(index)) {
            sourceComponentsSeen.add(index);
            sourceComponentOrder.push(index);
        }
    }
    const queue = sourceComponentOrder.filter((index) => indegrees[index] === 0);
    const ordered = [];
    const processed = new Set();
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const index = queue[cursor];
        if (processed.has(index)) {
            continue;
        }
        processed.add(index);
        ordered.push(components[index]);
        for (const dependent of componentDependents[index]) {
            indegrees[dependent] -= 1;
            if (indegrees[dependent] === 0) {
                queue.push(dependent);
            }
        }
    }

    for (const index of sourceComponentOrder) {
        if (!processed.has(index)) {
            ordered.push(components[index]);
        }
    }
    return ordered;
}

function stronglyConnectedNamedComponents(items, dependencies, getName) {
    const itemByName = new Map(items.map((item) => [getName(item), item]));
    const names = items.map((item) => getName(item));
    const graph = new Map(names.map((name) => [
        name,
        [...(dependencies.get(name) ?? [])].filter((dependency) =>
            itemByName.has(dependency))
    ]));
    const reverseGraph = new Map(names.map((name) => [name, []]));
    for (const [name, targets] of graph) {
        for (const target of targets) {
            reverseGraph.get(target).push(name);
        }
    }

    const visited = new Set();
    const finishOrder = [];
    for (const start of names) {
        if (visited.has(start)) {
            continue;
        }
        const stack = [{ name: start, expanded: false }];
        while (stack.length !== 0) {
            const frame = stack.pop();
            if (frame.expanded) {
                finishOrder.push(frame.name);
                continue;
            }
            if (visited.has(frame.name)) {
                continue;
            }
            visited.add(frame.name);
            stack.push({ name: frame.name, expanded: true });
            const targets = graph.get(frame.name) ?? [];
            for (let index = targets.length - 1; index >= 0; index -= 1) {
                if (!visited.has(targets[index])) {
                    stack.push({ name: targets[index], expanded: false });
                }
            }
        }
    }

    const assigned = new Set();
    const componentIndexByName = new Map();
    let componentCount = 0;
    for (let order = finishOrder.length - 1; order >= 0; order -= 1) {
        const start = finishOrder[order];
        if (assigned.has(start)) {
            continue;
        }
        const stack = [start];
        assigned.add(start);
        while (stack.length !== 0) {
            const name = stack.pop();
            componentIndexByName.set(name, componentCount);
            for (const source of reverseGraph.get(name) ?? []) {
                if (!assigned.has(source)) {
                    assigned.add(source);
                    stack.push(source);
                }
            }
        }
        componentCount += 1;
    }

    const components = Array.from({ length: componentCount }, () => []);
    for (const item of items) {
        const index = componentIndexByName.get(getName(item));
        if (index !== undefined) {
            components[index].push(item);
        }
    }
    return components;
}

function isValueIdentifierReference(node) {
    const parent = node.parent;
    if (parent === undefined) {
        return true;
    }
    if ((ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent) ||
        ts.isClassDeclaration(parent) || ts.isParameter(parent) ||
        ts.isVariableDeclaration(parent)) && parent.name === node) {
        return false;
    }
    if ((ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) ||
            ts.isPropertyDeclaration(parent)) && parent.name === node)) {
        return false;
    }
    if (ts.isTypeReferenceNode(parent) || ts.isTypeAliasDeclaration(parent) ||
        ts.isInterfaceDeclaration(parent) || ts.isImportSpecifier(parent) ||
        ts.isExportSpecifier(parent)) {
        return false;
    }
    return true;
}

function inferVariableDeclaration(
    declaration,
    declarationList,
    environment,
    state,
    preboundSlot,
    keepPending = false,
    deferredSafe = false,
    generalizationVariables = undefined
) {
    if (!ts.isIdentifier(declaration.name)) {
        const unsupported = failure(
            "unsupported",
            "HM_UNSUPPORTED_BINDING_PATTERN",
            "destructuring binding patterns are delegated to the TypeScript checker"
        );
        recordInferenceFailure(state, declaration.name, unsupported);
        return unsupported;
    }

    const isConst = (declarationList.flags & ts.NodeFlags.Const) !== 0;
    const isVarBinding = (declarationList.flags &
        (ts.NodeFlags.Const | ts.NodeFlags.Let)) === 0;
    const isMutableBinding = !isConst;
    if (isVarBinding && !state.budgetExceeded) {
        recordUnsupported(
            state,
            declaration,
            "HM_VAR_HOISTING_BOUNDARY",
            "function-scoped var hoisting is delegated to the TypeScript control-flow analyzer"
        );
    }
    state.level += 1;
    let inferred;
    if (declaration.initializer === undefined) {
        inferred = success(freshVariable(state, state.level, true), true, true);
    } else {
        inferred = inferExpression(declaration.initializer, environment, state);
    }
    if (isVarBinding && inferred.ok) {
        inferred = success(inferred.type, inferred.expansive, true);
    }

    const annotationType = translateTypeNode(declaration.type, state);
    if (inferred.ok && declaration.type !== undefined && annotationType === undefined) {
        inferred = success(inferred.type, inferred.expansive, true);
        if (!state.budgetExceeded) {
            recordUnsupported(
                state,
                declaration.type,
                "HM_UNSUPPORTED_TYPE_ANNOTATION",
                "this TypeScript annotation is outside the HM type subset"
            );
        }
    }
    if (inferred.ok && annotationType !== undefined) {
        const unified = unify(inferred.type, annotationType, state, declaration);
        if (!unified.ok) {
            recordInferenceFailure(state, declaration, unified);
            inferred = unified;
        } else {
            inferred = success(annotationType, inferred.expansive, inferred.partial);
        }
    }

    if (inferred.ok && preboundSlot !== undefined) {
        const unified = unify(preboundSlot, inferred.type, state, declaration);
        if (!unified.ok) {
            recordInferenceFailure(state, declaration, unified);
            inferred = unified;
        }
    }

    state.level -= 1;
    let bindingType;
    if (inferred.ok) {
        bindingType = preboundSlot ?? inferred.type;
    } else {
        bindingType = checkerSeedForNode(declaration.name, state) ??
            freshVariable(state, state.level, true);
    }

    const eligible = isConst && inferred.ok && !inferred.expansive &&
        !inferred.partial && state.parseDiagnostics.length === 0;
    const inferredScheme = eligible
        ? generalizeAtLevel(bindingType, state.level)
        : mono(bindingType);
    if (!eligible) {
        markWeakVariables(bindingType);
    }
    const directInitializer = declaration.initializer === undefined
        ? undefined
        : unwrapParenthesizedExpression(declaration.initializer);
    const inheritedPendingCaptures = directInitializer !== undefined && ts.isIdentifier(directInitializer)
        ? environment.get(directInitializer.text)?.pendingCaptures ?? new Set()
        : new Set();
    const inheritedInvokedCaptures = directInitializer !== undefined && ts.isIdentifier(directInitializer)
        ? environment.get(directInitializer.text)?.invokedCaptures ?? new Set()
        : new Set();
    const initializerCall = directInitializer !== undefined &&
        ts.isCallExpression(directInitializer)
        ? unwrapParenthesizedExpression(directInitializer.expression)
        : undefined;
    const returnedCallCaptures = initializerCall !== undefined && ts.isIdentifier(initializerCall)
        ? environment.get(initializerCall.text)?.returnedBoundaryCaptures ?? new Set()
        : new Set();
    const inheritedNestedBoundaryCaptures = directInitializer !== undefined &&
        ts.isIdentifier(directInitializer)
        ? environment.get(directInitializer.text)?.nestedBoundaryCaptures ?? new Set()
        : returnedCallCaptures;
    const inheritedReturnedBoundaryCaptures = directInitializer !== undefined &&
        ts.isIdentifier(directInitializer)
        ? environment.get(directInitializer.text)?.returnedBoundaryCaptures ?? new Set()
        : new Set();
    const installedEntry = environmentEntry(
        inferredScheme,
        isMutableBinding,
        !inferred.ok ? inferred.category : inferred.partial ? "partial" : "complete",
        keepPending,
        deferredSafe,
        inheritedPendingCaptures,
        inheritedInvokedCaptures,
        inheritedNestedBoundaryCaptures,
        inheritedReturnedBoundaryCaptures,
        declaration.getStart(state.sourceFile, false)
    );
    installedEntry.lostRuntimeCaptureCells = declaration.initializer === undefined
        ? new Set()
        : collectLostRuntimeCaptureCells(declaration.initializer, environment, state);
    installBindingEntry(environment, declaration.name.text, installedEntry);
    if (generalizationVariables !== undefined) {
        addSchemeFreeVariables(generalizationVariables, inferredScheme);
    }

    const valueRestriction = {
        eligible,
        generalized: inferredScheme.vars.size !== 0,
        reason: !isConst
            ? "mutable-binding"
            : !inferred.ok
                ? "inference-not-complete"
                : inferred.partial || state.parseDiagnostics.length !== 0
                    ? "partial-inference"
                : inferred.expansive
                    ? "expansive-expression"
                    : inferredScheme.vars.size === 0
                        ? "no-free-type-variables"
                        : "non-expansive-const"
    };
    recordBindingFact(
        declaration.name,
        declaration,
        isMutableBinding ? "mutable-variable" : "const",
        inferred,
        inferredScheme,
        valueRestriction,
        state
    );
    return inferred;
}

function inferExpression(node, environment, state) {
    state.expressionDepth += 1;
    if (state.expressionDepth > state.maxTypeDepth) {
        state.expressionDepth -= 1;
        state.budgetExceeded = true;
        return failure(
            "budget-exceeded",
            "HM_BUDGET_EXCEEDED",
            "expression traversal exceeded the configured depth budget"
        );
    }
    const result = inferExpressionStep(node, environment, state);
    state.expressionDepth -= 1;
    return result;
}

function inferExpressionStep(node, environment, state) {
    if (state.budgetExceeded) {
        return failure("budget-exceeded", "HM_BUDGET_EXCEEDED", "HM inference budget was exhausted");
    }
    if (ts.isParenthesizedExpression(node)) {
        return inferExpression(node.expression, environment, state);
    }
    if (ts.isIdentifier(node)) {
        const entry = environment.get(node.text);
        if (entry !== undefined) {
            if (entry.pending) {
                const pending = failure(
                    "unsupported",
                    "HM_TDZ_BINDING",
                    `binding '${node.text}' is not initialized at this expression`
                );
                recordInferenceFailure(state, node, pending);
                return pending;
            }
            return success(
                instantiate(entry.scheme, state),
                false,
                entry.quality !== "complete" || entry.deferred
            );
        }
        const seeded = checkerSeedForNode(node, state);
        if (seeded !== undefined) {
            return success(seeded, false, true);
        }
        const result = failure(
            "unsupported",
            "HM_UNBOUND_IDENTIFIER",
            `identifier '${node.text}' has no local HM binding or representable checker seed`
        );
        recordInferenceFailure(state, node, result);
        return result;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        return success(PRIMITIVE_TYPES.string, false, false);
    }
    if (ts.isTemplateExpression(node)) {
        let expansive = false;
        let partial = false;
        for (const span of node.templateSpans) {
            const expression = inferExpression(span.expression, environment, state);
            if (!expression.ok) {
                return expression;
            }
            expansive = expansive || expression.expansive;
            partial = partial || expression.partial;
        }
        return success(PRIMITIVE_TYPES.string, expansive, partial);
    }
    if (ts.isNumericLiteral(node)) {
        return success(PRIMITIVE_TYPES.number, false, false);
    }
    if (ts.isBigIntLiteral(node)) {
        return success(PRIMITIVE_TYPES.bigint, false, false);
    }
    if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
        return success(PRIMITIVE_TYPES.boolean, false, false);
    }
    if (node.kind === ts.SyntaxKind.NullKeyword) {
        return success(PRIMITIVE_TYPES.null, false, false);
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        return inferFunctionLike(node, environment, state);
    }
    if (ts.isCallExpression(node)) {
        return inferCallExpression(node, environment, state);
    }
    if (ts.isPropertyAccessExpression(node)) {
        return inferPropertyAccess(node, environment, state);
    }
    if (ts.isElementAccessExpression(node)) {
        return inferElementAccess(node, environment, state);
    }
    if (ts.isObjectLiteralExpression(node)) {
        return inferObjectLiteral(node, environment, state);
    }
    if (ts.isArrayLiteralExpression(node)) {
        return inferArrayLiteral(node, environment, state, isConstAssertionParent(node));
    }
    if (ts.isConditionalExpression(node)) {
        const condition = inferExpression(node.condition, environment, state);
        const whenTrue = inferExpression(
            node.whenTrue,
            new NestedScopeEnvironment(environment),
            state
        );
        const whenFalse = inferExpression(
            node.whenFalse,
            new NestedScopeEnvironment(environment),
            state
        );
        if (!condition.ok) {
            return condition;
        }
        if (!whenTrue.ok) {
            return whenTrue;
        }
        if (!whenFalse.ok) {
            return whenFalse;
        }
        const unified = unify(whenTrue.type, whenFalse.type, state, node);
        if (!unified.ok) {
            const unionFallback = failure(
                "unsupported",
                "HM_TYPESCRIPT_UNION_REQUIRED",
                "conditional branches require TypeScript union semantics"
            );
            recordInferenceFailure(state, node, unionFallback);
            const seeded = checkerSeedForNode(node, state);
            return seeded === undefined
                ? unionFallback
                : success(seeded, true, true);
        }
        return success(
            whenTrue.type,
            condition.expansive || whenTrue.expansive || whenFalse.expansive,
            condition.partial || whenTrue.partial || whenFalse.partial
        );
    }
    if (ts.isPrefixUnaryExpression(node)) {
        return inferPrefixUnary(node, environment, state);
    }
    if (ts.isBinaryExpression(node)) {
        return inferBinary(node, environment, state);
    }
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node)) {
        const expression = inferExpression(node.expression, environment, state);
        if (!expression.ok) {
            return expression;
        }
        if (ts.isAsExpression(node) && isConstTypeReference(node.type)) {
            return success(expression.type, expression.expansive, expression.partial);
        }
        const asserted = translateTypeNode(node.type, state);
        if (ts.isSatisfiesExpression(node)) {
            recordUnsupported(
                state,
                node,
                "HM_SATISFIES_BOUNDARY",
                "satisfies uses TypeScript contextual assignability and preserves the checker type"
            );
            return success(expression.type, expression.expansive, true);
        }
        recordUnsupported(
            state,
            node,
            "HM_TYPE_ASSERTION_BOUNDARY",
            "type assertions are checker-authoritative cast boundaries"
        );
        return success(asserted ?? expression.type, expression.expansive, true);
    }

    const seeded = checkerSeedForNode(node, state);
    if (seeded !== undefined) {
        return success(seeded, true, true);
    }
    const unsupported = failure(
        "unsupported",
        "HM_UNSUPPORTED_EXPRESSION",
        `expression kind '${ts.SyntaxKind[node.kind] ?? String(node.kind)}' is delegated to the TypeScript checker`
    );
    recordInferenceFailure(state, node, unsupported);
    return unsupported;
}

function inferFunctionLike(
    node,
    environment,
    state,
    outerGeneralizationVariables = undefined
) {
    state.functionInferenceDepth += 1;
    try {
        return inferFunctionLikeStep(
            node,
            environment,
            state,
            outerGeneralizationVariables
        );
    } finally {
        state.functionInferenceDepth -= 1;
    }
}

function inferFunctionLikeStep(node, environment, state, outerGeneralizationVariables) {
    if (node.body === undefined) {
        const unsupported = failure(
            "unsupported",
            "HM_OVERLOAD_SIGNATURE",
            "bodyless overload and ambient signatures are delegated to the TypeScript checker"
        );
        recordInferenceFailure(state, node, unsupported);
        return unsupported;
    }
    if (node.asteriskToken !== undefined || hasAsyncModifier(node)) {
        const unsupported = failure(
            "unsupported",
            "HM_UNSUPPORTED_FUNCTION_EFFECT",
            "async and generator functions are delegated to the TypeScript checker"
        );
        recordInferenceFailure(state, node, unsupported);
        return unsupported;
    }

    const local = new FunctionScopeEnvironment(environment);
    const functionGeneralizationVariables = new GeneralizationContext(
        outerGeneralizationVariables ?? environment.generalizationVariables ??
            freeEnvironmentVariables(environment)
    );
    local.generalizationVariables = functionGeneralizationVariables;
    const parameterTypes = [];
    const parameterNames = [];
    let partial = false;
    let selfType;
    state.level += 1;

    if (ts.isFunctionExpression(node) && node.name !== undefined) {
        selfType = freshVariable(state, state.level, false);
        local.set(node.name.text, environmentEntry(mono(selfType), false));
        addSchemeFreeVariables(functionGeneralizationVariables, mono(selfType));
    }

    for (const parameter of node.parameters) {
        if (!ts.isIdentifier(parameter.name) || parameter.dotDotDotToken !== undefined ||
            parameter.questionToken !== undefined) {
            partial = true;
            const fresh = freshVariable(state, state.level, true);
            parameterTypes.push(fresh);
            parameterNames.push(ts.isIdentifier(parameter.name) ? parameter.name.text : "_");
            addSchemeFreeVariables(functionGeneralizationVariables, mono(fresh));
            recordUnsupported(
                state,
                parameter,
                "HM_UNSUPPORTED_PARAMETER",
                "destructured, optional, and rest parameters are delegated to the TypeScript checker"
            );
            continue;
        }
        const annotated = translateTypeNode(parameter.type, state);
        if (parameter.type !== undefined && annotated === undefined) {
            partial = true;
            if (!state.budgetExceeded) {
                recordUnsupported(
                    state,
                    parameter.type,
                    "HM_UNSUPPORTED_TYPE_ANNOTATION",
                    "this parameter annotation is outside the HM type subset"
                );
            }
        }
        const parameterType = annotated ?? freshVariable(state, state.level, false);
        parameterTypes.push(parameterType);
        parameterNames.push(parameter.name.text);
        local.set(parameter.name.text, environmentEntry(mono(parameterType), true));
        addSchemeFreeVariables(functionGeneralizationVariables, mono(parameterType));
        if (parameter.initializer !== undefined) {
            partial = true;
            recordUnsupported(
                state,
                parameter,
                "HM_DEFAULT_PARAMETER",
                "default-parameter call arity is delegated to the TypeScript checker"
            );
            const defaultValue = inferExpression(parameter.initializer, local, state);
            if (!defaultValue.ok) {
                partial = true;
            } else {
                const unified = unify(parameterType, defaultValue.type, state, parameter);
                if (!unified.ok) {
                    partial = true;
                    recordInferenceFailure(state, parameter, unified);
                }
            }
        }
    }

    const annotatedReturn = translateTypeNode(node.type, state);
    if (node.type !== undefined && annotatedReturn === undefined) {
        partial = true;
        if (!state.budgetExceeded) {
            recordUnsupported(
                state,
                node.type,
                "HM_UNSUPPORTED_TYPE_ANNOTATION",
                "this return annotation is outside the HM type subset"
            );
        }
    }
    const returnType = annotatedReturn ?? freshVariable(state, state.level, false);
    let effectiveReturnType = returnType;
    if (ts.isBlock(node.body)) {
        const functionContext = {
            returnType,
            returnCount: 0,
            unionFallback: false,
            explicitReturn: annotatedReturn !== undefined
        };
        const body = processStatements(
            node.body.statements,
            local,
            state,
            functionContext,
            functionGeneralizationVariables
        );
        partial = partial || body.partial;
        effectiveReturnType = functionContext.returnType;
        if (functionContext.returnCount === 0 && annotatedReturn === undefined) {
            const unified = unify(returnType, PRIMITIVE_TYPES.void, state, node.body);
            if (!unified.ok) {
                state.level -= 1;
                recordInferenceFailure(state, node.body, unified);
                return unified;
            }
        }
    } else {
        const body = inferExpression(node.body, local, state);
        if (!body.ok) {
            state.level -= 1;
            recordInferenceFailure(state, node.body, body);
            return body;
        }
        partial = partial || body.partial;
        const unified = unify(returnType, body.type, state, node.body);
        if (!unified.ok) {
            state.level -= 1;
            recordInferenceFailure(state, node.body, unified);
            return unified;
        }
    }
    state.level -= 1;
    const inferredFunction = functionType(parameterTypes, effectiveReturnType, [], parameterNames);
    if (selfType !== undefined) {
        const unified = unify(selfType, inferredFunction, state, node);
        if (!unified.ok) {
            recordInferenceFailure(state, node, unified);
            return unified;
        }
    }
    return success(inferredFunction, false, partial);
}

function inferCallExpression(node, environment, state) {
    if (node.questionDotToken !== undefined || node.typeArguments !== undefined) {
        const seeded = checkerSeedForNode(node, state);
        if (seeded !== undefined) {
            return success(seeded, true, true);
        }
        const unsupported = failure(
            "unsupported",
            "HM_UNSUPPORTED_CALL_FORM",
            "optional calls and explicit TypeScript type arguments are delegated to the checker"
        );
        recordInferenceFailure(state, node, unsupported);
        return unsupported;
    }
    const callee = inferExpression(node.expression, environment, state);
    if (!callee.ok) {
        return callee;
    }
    const argumentsTypes = [];
    let partial = callee.partial;
    for (const argument of node.arguments) {
        if (ts.isSpreadElement(argument)) {
            const unsupported = failure(
                "unsupported",
                "HM_UNSUPPORTED_SPREAD_ARGUMENT",
                "spread calls are delegated to the TypeScript checker"
            );
            recordInferenceFailure(state, argument, unsupported);
            return unsupported;
        }
        const inferred = inferExpression(argument, environment, state);
        if (!inferred.ok) {
            return inferred;
        }
        argumentsTypes.push(inferred.type);
        partial = partial || inferred.partial;
    }
    const resultType = freshVariable(state, state.level, false);
    const expected = functionType(argumentsTypes, resultType);
    const unified = unify(callee.type, expected, state, node.expression);
    if (!unified.ok) {
        if (callee.partial) {
            return success(
                checkerSeedForNode(node, state) ?? freshVariable(state, state.level, true),
                true,
                true
            );
        }
        recordInferenceFailure(state, node, unified);
        return unified;
    }
    const directCallee = unwrapParenthesizedExpression(node.expression);
    const checkRuntimeTdz = state.functionInferenceDepth === 0;
    const iifeCaptures = checkRuntimeTdz &&
        (ts.isArrowFunction(directCallee) || ts.isFunctionExpression(directCallee))
        ? collectRuntimeCaptureEdges(directCallee, environment, state)
        : {
            pendingCaptures: new Set(),
            invokedCaptures: new Set(),
            nestedBoundaryCaptures: new Set(),
            returnedBoundaryCaptures: new Set()
        };
    const pendingIifeCaptures = findPendingRuntimeCaptures(
        iifeCaptures.pendingCaptures,
        iifeCaptures.invokedCaptures,
        state,
        node
    );
    const iifeCapturesPending = pendingIifeCaptures.length !== 0;
    if (iifeCapturesPending) {
        recordUnsupported(
            state,
            node,
            "HM_POSSIBLE_TDZ_IIFE",
            "an immediately-invoked function captures a binding that is not initialized yet"
        );
    }
    const calledEntry = ts.isIdentifier(directCallee)
        ? environment.get(directCallee.text)
        : undefined;
    const pendingCallCaptures = checkRuntimeTdz
        ? findPendingRuntimeCaptures(
            calledEntry?.pendingCaptures ?? [],
            calledEntry?.invokedCaptures ?? [],
            state,
            node
        )
        : [];
    if (pendingCallCaptures.length !== 0) {
        const shown = pendingCallCaptures.slice(0, 3)
            .map((bindingCell) => `'${bindingCell.name}'`)
            .join(", ");
        recordUnsupported(
            state,
            node,
            "HM_POSSIBLE_TDZ_CALL",
            `this call may evaluate ${shown} before initialization`
        );
    }
    const invokeReturnedClosure = isCallResultImmediatelyInvoked(node);
    const nestedBoundaryCaptures = checkRuntimeTdz
        ? [
            ...findPendingRuntimeCaptures(
                iifeCaptures.nestedBoundaryCaptures,
                [],
                state,
                node
            ),
            ...findPendingRuntimeCaptures(
                calledEntry?.nestedBoundaryCaptures ?? [],
                [],
                state,
                node
            ),
            ...(invokeReturnedClosure
                ? [
                    ...findPendingRuntimeCaptures(
                        iifeCaptures.returnedBoundaryCaptures,
                        [],
                        state,
                        node
                    ),
                    ...findPendingRuntimeCaptures(
                        calledEntry?.returnedBoundaryCaptures ?? [],
                        [],
                        state,
                        node
                    )
                ]
                : [])
        ]
        : [];
    if (nestedBoundaryCaptures.length !== 0) {
        recordUnsupported(
            state,
            node,
            "HM_NESTED_CLOSURE_TDZ_BOUNDARY",
            "a nested or returned closure may evaluate a binding before initialization"
        );
    }
    const calledEntryHasRuntimeMetadata = calledEntry !== undefined && [
        calledEntry.pendingCaptures,
        calledEntry.invokedCaptures,
        calledEntry.nestedBoundaryCaptures,
        calledEntry.returnedBoundaryCaptures
    ].some((captures) => (captures?.size ?? 0) !== 0);
    const indirectSyntax = ts.isPropertyAccessExpression(directCallee) ||
        ts.isElementAccessExpression(directCallee) || ts.isConditionalExpression(directCallee);
    const indirectLostRuntimeCells = new Set(calledEntry?.lostRuntimeCaptureCells ?? []);
    if (checkRuntimeTdz && indirectSyntax) {
        for (const bindingCell of collectLostRuntimeCaptureCells(
            directCallee,
            environment,
            state
        )) {
            indirectLostRuntimeCells.add(bindingCell);
        }
    }
    const pendingIndirectRuntimeCells = [...indirectLostRuntimeCells].filter((bindingCell) =>
        bindingCell.current.pending);
    const indirectCallBoundary = checkRuntimeTdz &&
        nestedBoundaryCaptures.length === 0 && pendingCallCaptures.length === 0 &&
        (pendingIndirectRuntimeCells.length !== 0 || (callee.partial &&
            (indirectSyntax || (ts.isIdentifier(directCallee) &&
                calledEntry?.quality !== "complete" && !calledEntryHasRuntimeMetadata))));
    if (indirectCallBoundary) {
        recordUnsupported(
            state,
            node,
            "HM_INDIRECT_CALL_TDZ_BOUNDARY",
            "capture timing was lost through an indirect container or control-flow join"
        );
    }
    return success(
        resultType,
        true,
        partial || iifeCapturesPending || pendingCallCaptures.length !== 0 ||
            nestedBoundaryCaptures.length !== 0 || indirectCallBoundary
    );
}

function unwrapParenthesizedExpression(node) {
    let current = node;
    while (ts.isParenthesizedExpression(current)) {
        current = current.expression;
    }
    return current;
}

function isCallResultImmediatelyInvoked(node) {
    let expression = node;
    let parent = node.parent;
    while (parent !== undefined && ts.isParenthesizedExpression(parent) &&
        parent.expression === expression) {
        expression = parent;
        parent = parent.parent;
    }
    return parent !== undefined && ts.isCallExpression(parent) && parent.expression === expression;
}

function findPendingRuntimeCaptures(
    initialPendingCaptures,
    initialInvokedCaptures,
    state,
    origin
) {
    const pending = [];
    const visited = new Map();
    const stack = [
        ...[...initialPendingCaptures].map((bindingCell) => ({ bindingCell, invoke: false })),
        ...[...initialInvokedCaptures].map((bindingCell) => ({ bindingCell, invoke: true }))
    ];
    while (stack.length !== 0) {
        const current = stack.pop();
        const previous = visited.get(current.bindingCell);
        if (previous === true || (previous === false && !current.invoke)) {
            continue;
        }
        visited.set(current.bindingCell, current.invoke || previous === true);
        state.schedulerOperations += 1;
        if (state.schedulerOperations > state.maxSchedulerOperations) {
            state.budgetExceeded = true;
            ensureBudgetDiagnostic(state, origin);
            break;
        }
        const entry = current.bindingCell.current;
        if (entry?.pending) {
            pending.push(current.bindingCell);
            continue;
        }
        if (!current.invoke) {
            continue;
        }
        for (const inherited of entry?.pendingCaptures ?? []) {
            stack.push({ bindingCell: inherited, invoke: false });
        }
        for (const inherited of entry?.invokedCaptures ?? []) {
            if (visited.get(inherited) !== true) {
                stack.push({ bindingCell: inherited, invoke: true });
            }
        }
    }
    return pending;
}

function collectLostRuntimeCaptureCells(node, environment, state) {
    const lost = new Set();
    const stack = [node];
    while (stack.length !== 0) {
        const current = stack.pop();
        if (!consumeAstVisit(state, current)) {
            break;
        }
        if (isDependencyFunctionLike(current)) {
            const captures = collectRuntimeCaptureEdges(current, environment, state);
            addPendingRuntimeCells(captures, lost, state, current);
            continue;
        }
        if (ts.isIdentifier(current) && isValueIdentifierReference(current)) {
            const entry = environment.get(current.text);
            if (entry !== undefined) {
                addPendingRuntimeCells(entry, lost, state, current);
                for (const bindingCell of entry.lostRuntimeCaptureCells ?? []) {
                    if (bindingCell.current.pending) {
                        lost.add(bindingCell);
                    }
                }
            }
        }
        const children = [];
        ts.forEachChild(current, (child) => {
            children.push(child);
        });
        for (let index = children.length - 1; index >= 0; index -= 1) {
            stack.push(children[index]);
        }
    }
    return lost;
}

function addPendingRuntimeCells(source, output, state, origin) {
    const groups = [
        findPendingRuntimeCaptures(
            source.pendingCaptures ?? [],
            source.invokedCaptures ?? [],
            state,
            origin
        ),
        findPendingRuntimeCaptures(
            source.nestedBoundaryCaptures ?? [],
            [],
            state,
            origin
        ),
        findPendingRuntimeCaptures(
            source.returnedBoundaryCaptures ?? [],
            [],
            state,
            origin
        )
    ];
    for (const group of groups) {
        for (const bindingCell of group) {
            output.add(bindingCell);
        }
    }
}

function inferPropertyAccess(node, environment, state) {
    if (node.questionDotToken !== undefined) {
        const unsupported = failure(
            "unsupported",
            "HM_UNSUPPORTED_OPTIONAL_CHAIN",
            "optional chaining requires TypeScript union and control-flow semantics"
        );
        recordInferenceFailure(state, node, unsupported);
        return unsupported;
    }
    return inferNamedProperty(node.expression, node.name.text, node, environment, state);
}

function inferNamedProperty(targetNode, propertyName, originNode, environment, state) {
    const target = inferExpression(targetNode, environment, state);
    if (!target.ok) {
        return target;
    }
    const pruned = prune(target.type);
    if (pruned.kind === "constructor" &&
        (pruned.name === "Array" || pruned.name === "ReadonlyArray") &&
        propertyName === "length") {
        return success(PRIMITIVE_TYPES.number, true, target.partial);
    }
    const propertyType = freshVariable(state, state.level, false);
    const row = freshVariable(state, state.level, false);
    const expected = recordType(new Map([[propertyName, propertyType]]), row, false);
    const unified = unify(target.type, expected, state, targetNode);
    if (!unified.ok) {
        recordInferenceFailure(state, originNode, unified);
        return unified;
    }
    return success(propertyType, true, target.partial);
}

function inferElementAccess(node, environment, state) {
    if (node.questionDotToken !== undefined || node.argumentExpression === undefined) {
        const unsupported = failure(
            "unsupported",
            "HM_UNSUPPORTED_ELEMENT_ACCESS",
            "optional or missing element access is delegated to the TypeScript checker"
        );
        recordInferenceFailure(state, node, unsupported);
        return unsupported;
    }
    if (ts.isStringLiteral(node.argumentExpression)) {
        return inferNamedProperty(
            node.expression,
            node.argumentExpression.text,
            node,
            environment,
            state
        );
    }
    const target = inferExpression(node.expression, environment, state);
    const index = inferExpression(node.argumentExpression, environment, state);
    if (!target.ok) {
        return target;
    }
    if (!index.ok) {
        return index;
    }
    const element = freshVariable(state, state.level, false);
    const constraints = withConstraintTransaction(state, () => {
        const unifiedIndex = unify(index.type, PRIMITIVE_TYPES.number, state, node.argumentExpression);
        if (!unifiedIndex.ok) {
            return unifiedIndex;
        }
        return unify(
            target.type,
            constructorType("Array", [element], true),
            state,
            node.expression
        );
    });
    if (!constraints.ok) {
        recordInferenceFailure(state, node, constraints);
        return constraints;
    }
    return success(element, true, target.partial || index.partial);
}

function inferObjectLiteral(node, environment, state) {
    const fields = new Map();
    let partial = false;
    for (const property of node.properties) {
        if (ts.isPropertyAssignment(property) && isStaticPropertyName(property.name)) {
            const value = inferExpression(property.initializer, environment, state);
            if (!value.ok) {
                return value;
            }
            fields.set(staticPropertyName(property.name), value.type);
            partial = partial || value.partial;
            continue;
        }
        if (ts.isShorthandPropertyAssignment(property)) {
            const value = inferExpression(property.name, environment, state);
            if (!value.ok) {
                return value;
            }
            fields.set(property.name.text, value.type);
            partial = partial || value.partial;
            continue;
        }
        const unsupported = failure(
            "unsupported",
            "HM_UNSUPPORTED_OBJECT_MEMBER",
            "spread, methods, accessors, and computed object members are delegated to the checker"
        );
        recordInferenceFailure(state, property, unsupported);
        return unsupported;
    }
    return success(recordType(fields, undefined, true), true, partial);
}

function inferArrayLiteral(node, environment, state, tupleContext) {
    const elements = [];
    let partial = false;
    for (const element of node.elements) {
        if (ts.isSpreadElement(element) || ts.isOmittedExpression(element)) {
            const unsupported = failure(
                "unsupported",
                "HM_UNSUPPORTED_ARRAY_ELEMENT",
                "spread and omitted array elements are delegated to the TypeScript checker"
            );
            recordInferenceFailure(state, element, unsupported);
            return unsupported;
        }
        const inferred = inferExpression(element, environment, state);
        if (!inferred.ok) {
            return inferred;
        }
        elements.push(inferred.type);
        partial = partial || inferred.partial;
    }
    if (tupleContext) {
        const tuple = tupleType(elements, true);
        return success(tuple, true, partial);
    }
    const elementType = freshVariable(state, state.level, false);
    const constraints = withConstraintTransaction(state, () => {
        for (const element of elements) {
            const unified = unify(elementType, element, state, node);
            if (!unified.ok) {
                return unified;
            }
        }
        return success(elementType, false, false);
    });
    if (!constraints.ok) {
        const unionFallback = constraints.code === "HM_TYPE_MISMATCH"
            ? failure(
                "unsupported",
                "HM_TYPESCRIPT_UNION_REQUIRED",
                "heterogeneous array elements require TypeScript union semantics"
            )
            : constraints;
        recordInferenceFailure(state, node, unionFallback);
        return unionFallback;
    }
    const array = constructorType("Array", [elementType], true);
    return success(array, true, partial);
}

function inferPrefixUnary(node, environment, state) {
    const operand = inferExpression(node.operand, environment, state);
    if (!operand.ok) {
        return operand;
    }
    if (node.operator === ts.SyntaxKind.ExclamationToken) {
        return success(PRIMITIVE_TYPES.boolean, operand.expansive, operand.partial);
    }
    const operandType = prune(operand.type);
    if ((node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.TildeToken) &&
        isPrimitiveNamed(operandType, "bigint")) {
        return success(PRIMITIVE_TYPES.bigint, operand.expansive, operand.partial);
    }
    if (node.operator === ts.SyntaxKind.PlusToken || node.operator === ts.SyntaxKind.MinusToken ||
        node.operator === ts.SyntaxKind.TildeToken) {
        const unified = unify(operand.type, PRIMITIVE_TYPES.number, state, node.operand);
        if (!unified.ok) {
            recordInferenceFailure(state, node, unified);
            return unified;
        }
        return success(PRIMITIVE_TYPES.number, operand.expansive, operand.partial);
    }
    if (node.operator === ts.SyntaxKind.TypeOfKeyword) {
        return success(PRIMITIVE_TYPES.string, operand.expansive, operand.partial);
    }
    if (node.operator === ts.SyntaxKind.VoidKeyword) {
        return success(PRIMITIVE_TYPES.undefined, operand.expansive, operand.partial);
    }
    const unsupported = failure(
        "unsupported",
        "HM_UNSUPPORTED_UNARY_OPERATOR",
        "this unary operator is delegated to the TypeScript checker"
    );
    recordInferenceFailure(state, node, unsupported);
    return unsupported;
}

function inferBinary(node, environment, state) {
    if (isAssignmentOperator(node.operatorToken.kind)) {
        const unsupported = failure(
            "unsupported",
            "HM_MUTATION_BOUNDARY",
            "assignment is a mutable boundary and is not generalized by the HM supplement"
        );
        recordInferenceFailure(state, node, unsupported);
        return unsupported;
    }
    const left = inferExpression(node.left, environment, state);
    const right = inferExpression(node.right, environment, state);
    if (!left.ok) {
        return left;
    }
    if (!right.ok) {
        return right;
    }
    const partial = left.partial || right.partial;
    const expansive = left.expansive || right.expansive;
    if (isComparisonOperator(node.operatorToken.kind)) {
        return success(PRIMITIVE_TYPES.boolean, expansive, partial);
    }
    if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
        const unified = unify(left.type, right.type, state, node);
        if (!unified.ok) {
            const unionFallback = failure(
                "unsupported",
                "HM_TYPESCRIPT_UNION_REQUIRED",
                "logical and nullish joins require TypeScript union and flow semantics"
            );
            recordInferenceFailure(state, node, unionFallback);
            const seeded = checkerSeedForNode(node, state);
            return seeded === undefined
                ? unionFallback
                : success(seeded, expansive, true);
        }
        return success(left.type, expansive, partial);
    }
    if (node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const leftType = prune(left.type);
        const rightType = prune(right.type);
        if (isPrimitiveNamed(leftType, "string") || isPrimitiveNamed(rightType, "string")) {
            return success(PRIMITIVE_TYPES.string, expansive, partial);
        }
    }
    const leftType = prune(left.type);
    const rightType = prune(right.type);
    if ((isPrimitiveNamed(leftType, "bigint") || isPrimitiveNamed(rightType, "bigint")) &&
        isBigIntArithmeticOperator(node.operatorToken.kind)) {
        const constraints = withConstraintTransaction(state, () => {
            const leftBigInt = unify(left.type, PRIMITIVE_TYPES.bigint, state, node.left);
            if (!leftBigInt.ok) {
                return leftBigInt;
            }
            return unify(right.type, PRIMITIVE_TYPES.bigint, state, node.right);
        });
        if (!constraints.ok) {
            recordInferenceFailure(state, node, constraints);
            return constraints;
        }
        return success(PRIMITIVE_TYPES.bigint, expansive, partial);
    }
    if (isArithmeticOperator(node.operatorToken.kind)) {
        const constraints = withConstraintTransaction(state, () => {
            const leftNumber = unify(left.type, PRIMITIVE_TYPES.number, state, node.left);
            if (!leftNumber.ok) {
                return leftNumber;
            }
            return unify(right.type, PRIMITIVE_TYPES.number, state, node.right);
        });
        if (!constraints.ok) {
            recordInferenceFailure(state, node, constraints);
            return constraints;
        }
        return success(PRIMITIVE_TYPES.number, expansive, partial);
    }
    const unsupported = failure(
        "unsupported",
        "HM_UNSUPPORTED_BINARY_OPERATOR",
        "this binary operator requires TypeScript-specific coercion or union semantics"
    );
    recordInferenceFailure(state, node, unsupported);
    return unsupported;
}

function unify(leftInput, rightInput, state, origin, depth = 0) {
    const rootTransaction = state.unificationDepth === 0 &&
        state.constraintTransactionDepth === 0;
    const trailStart = state.unificationTrail.length;
    state.unificationDepth += 1;
    const result = unifyStep(leftInput, rightInput, state, origin, depth);
    state.unificationDepth -= 1;
    if (rootTransaction && !result.ok) {
        rollbackUnification(state, trailStart);
    } else if (rootTransaction) {
        state.unificationTrail.length = trailStart;
    }
    return result;
}

function withConstraintTransaction(state, operation) {
    const rootTransaction = state.constraintTransactionDepth === 0 &&
        state.unificationDepth === 0;
    const trailStart = state.unificationTrail.length;
    state.constraintTransactionDepth += 1;
    const result = operation();
    state.constraintTransactionDepth -= 1;
    if (rootTransaction && !result.ok) {
        rollbackUnification(state, trailStart);
    } else if (rootTransaction) {
        state.unificationTrail.length = trailStart;
    }
    return result;
}

function unifyStep(leftInput, rightInput, state, origin, depth = 0) {
    state.unifications += 1;
    if (state.unifications > state.maxUnifications || depth > state.maxTypeDepth) {
        state.budgetExceeded = true;
        return failure(
            "budget-exceeded",
            "HM_BUDGET_EXCEEDED",
            "unification exceeded the configured operation or type-depth budget"
        );
    }
    const left = prune(leftInput);
    const right = prune(rightInput);
    if (left === right) {
        return success(left, false, false);
    }
    if (left.kind === "variable") {
        return bindVariable(left, right, state, origin, depth);
    }
    if (right.kind === "variable") {
        return bindVariable(right, left, state, origin, depth);
    }
    if (left.kind === "primitive" && right.kind === "primitive") {
        return left.name === right.name
            ? success(left, false, false)
            : typeMismatch(left, right);
    }
    if (left.kind === "constructor" && right.kind === "constructor") {
        if (left.name !== right.name || left.arguments.length !== right.arguments.length) {
            return typeMismatch(left, right);
        }
        for (let index = 0; index < left.arguments.length; index += 1) {
            const unified = unify(left.arguments[index], right.arguments[index], state, origin, depth + 1);
            if (!unified.ok) {
                return unified;
            }
        }
        return success(left, false, false);
    }
    if (left.kind === "function" && right.kind === "function") {
        if (left.parameters.length !== right.parameters.length) {
            return failure(
                "conflict",
                "HM_ARITY_MISMATCH",
                `cannot unify function arity ${left.parameters.length} with ${right.parameters.length}`
            );
        }
        for (let index = 0; index < left.parameters.length; index += 1) {
            const unified = unify(left.parameters[index], right.parameters[index], state, origin, depth + 1);
            if (!unified.ok) {
                return unified;
            }
        }
        return unify(left.result, right.result, state, origin, depth + 1);
    }
    if (left.kind === "tuple" && right.kind === "tuple") {
        if (left.elements.length !== right.elements.length || left.readonly !== right.readonly) {
            return typeMismatch(left, right);
        }
        for (let index = 0; index < left.elements.length; index += 1) {
            const unified = unify(left.elements[index], right.elements[index], state, origin, depth + 1);
            if (!unified.ok) {
                return unified;
            }
        }
        return success(left, false, false);
    }
    if (left.kind === "record" && right.kind === "record") {
        return unifyRecords(left, right, state, origin, depth + 1);
    }
    if (left.kind === "opaque" && right.kind === "opaque" && left.display === right.display) {
        return success(left, false, true);
    }
    return typeMismatch(left, right);
}

function bindVariable(variable, target, state, origin, depth) {
    if (target.kind === "variable" && target.id === variable.id) {
        return success(variable, false, false);
    }
    const occurrence = occurs(variable.id, target, new Set(), depth, state.maxTypeDepth);
    if (occurrence === "budget-exceeded") {
        state.budgetExceeded = true;
        return failure(
            "budget-exceeded",
            "HM_BUDGET_EXCEEDED",
            "occurs-check exceeded the configured type-depth budget"
        );
    }
    if (occurrence === "found") {
        return failure(
            "conflict",
            "HM_OCCURS_CHECK",
            `infinite type rejected: ${formatHmType(variable)} occurs in ${formatHmType(target)}`
        );
    }
    if (variable.weak) {
        markWeakVariables(target, new Set(), state);
    }
    lowerLevels(target, variable.level, new Set(), state);
    state.unificationTrail.push({
        kind: "link",
        target: variable,
        previous: variable.link
    });
    variable.link = target;
    return success(target, false, false);
}

function rollbackUnification(state, trailStart) {
    for (let index = state.unificationTrail.length - 1; index >= trailStart; index -= 1) {
        const entry = state.unificationTrail[index];
        if (entry.kind === "link") {
            entry.target.link = entry.previous;
        } else if (entry.kind === "level") {
            entry.target.level = entry.previous;
        } else if (entry.kind === "weak") {
            entry.target.weak = entry.previous;
        }
    }
    state.unificationTrail.length = trailStart;
}

function unifyRecords(left, right, state, origin, depth) {
    const leftOnly = new Map();
    const rightOnly = new Map();
    for (const [name, leftType] of left.fields) {
        const rightType = right.fields.get(name);
        if (rightType === undefined) {
            leftOnly.set(name, leftType);
            continue;
        }
        const unified = unify(leftType, rightType, state, origin, depth + 1);
        if (!unified.ok) {
            return unified;
        }
    }
    for (const [name, rightType] of right.fields) {
        if (!left.fields.has(name)) {
            rightOnly.set(name, rightType);
        }
    }

    if (left.row !== undefined && right.row !== undefined) {
        const leftRow = prune(left.row);
        const rightRow = prune(right.row);
        if (leftOnly.size === 0 && rightOnly.size === 0) {
            return unify(leftRow, rightRow, state, origin, depth + 1);
        }
        if (leftRow === rightRow) {
            return recordFieldMismatch(leftOnly, rightOnly);
        }
        const shared = freshVariable(state, Math.min(typeLevel(left.row), typeLevel(right.row)), false);
        const leftTail = recordType(rightOnly, shared, false);
        const rightTail = recordType(leftOnly, shared, false);
        const leftUnified = unify(left.row, leftTail, state, origin, depth + 1);
        if (!leftUnified.ok) {
            return leftUnified;
        }
        return unify(right.row, rightTail, state, origin, depth + 1);
    }
    if (left.row !== undefined) {
        if (leftOnly.size !== 0) {
            return recordFieldMismatch(leftOnly, rightOnly);
        }
        return unify(left.row, recordType(rightOnly, undefined, false), state, origin, depth + 1);
    }
    if (right.row !== undefined) {
        if (rightOnly.size !== 0) {
            return recordFieldMismatch(leftOnly, rightOnly);
        }
        return unify(right.row, recordType(leftOnly, undefined, false), state, origin, depth + 1);
    }
    if (leftOnly.size !== 0 || rightOnly.size !== 0) {
        return recordFieldMismatch(leftOnly, rightOnly);
    }
    return success(left, false, false);
}

function recordFieldMismatch(leftOnly, rightOnly) {
    const missing = [...leftOnly.keys(), ...rightOnly.keys()].sort();
    return failure(
        "conflict",
        "HM_RECORD_FIELD_MISMATCH",
        `record fields do not unify: ${missing.join(", ")}`
    );
}

function typeMismatch(left, right) {
    return failure(
        "conflict",
        "HM_TYPE_MISMATCH",
        `cannot unify ${formatHmType(left)} with ${formatHmType(right)}`
    );
}

function generalize(type, environment) {
    const environmentVariables = freeEnvironmentVariables(environment);
    return generalizeAgainstEnvironmentVariables(type, environmentVariables);
}

function generalizeAgainstEnvironmentVariables(type, environmentVariables) {
    const typeVariables = freeVariables(type);
    const quantified = new Set();
    for (const variable of typeVariables.values()) {
        if (!environmentVariables.has(variable.id) && !variable.weak) {
            quantified.add(variable.id);
        }
    }
    return scheme(quantified, type);
}

function generalizeAtLevel(type, environmentLevel) {
    const quantified = new Set();
    for (const variable of freeVariables(type).values()) {
        if (variable.level > environmentLevel && !variable.weak) {
            quantified.add(variable.id);
        }
    }
    return scheme(quantified, type);
}

function instantiate(inputScheme, state) {
    if (inputScheme.vars.size === 0) {
        return inputScheme.type;
    }
    const replacements = new Map();
    for (const id of inputScheme.vars) {
        replacements.set(id, freshVariable(state, state.level, false));
    }
    return cloneType(inputScheme.type, replacements, new Map(), 0, state.maxTypeDepth);
}

function cloneType(typeInput, replacements, seen, depth, maxDepth) {
    const type = prune(typeInput);
    if (depth > maxDepth) {
        return opaqueType("<type-depth-budget>");
    }
    if (type.kind === "variable") {
        return replacements.get(type.id) ?? type;
    }
    const previous = seen.get(type);
    if (previous !== undefined) {
        return previous;
    }
    if (type.kind === "primitive" || type.kind === "opaque") {
        return type;
    }
    if (type.kind === "constructor") {
        const clone = constructorType(type.name, [], type.mutable);
        seen.set(type, clone);
        clone.arguments = type.arguments.map((argument) =>
            cloneType(argument, replacements, seen, depth + 1, maxDepth));
        return clone;
    }
    if (type.kind === "function") {
        const clone = functionType([], opaqueType("<pending>"), [], type.parameterNames);
        seen.set(type, clone);
        clone.parameters = type.parameters.map((parameter) =>
            cloneType(parameter, replacements, seen, depth + 1, maxDepth));
        clone.result = cloneType(type.result, replacements, seen, depth + 1, maxDepth);
        return clone;
    }
    if (type.kind === "tuple") {
        const clone = tupleType([], type.readonly);
        seen.set(type, clone);
        clone.elements = type.elements.map((element) =>
            cloneType(element, replacements, seen, depth + 1, maxDepth));
        return clone;
    }
    if (type.kind === "record") {
        const clone = recordType(new Map(), undefined, type.mutable);
        seen.set(type, clone);
        for (const [name, field] of type.fields) {
            clone.fields.set(name, cloneType(field, replacements, seen, depth + 1, maxDepth));
        }
        clone.row = type.row === undefined
            ? undefined
            : cloneType(type.row, replacements, seen, depth + 1, maxDepth);
        return clone;
    }
    return opaqueType("<unsupported-type-clone>");
}

function freeVariables(typeInput, output = new Map(), seen = new Set()) {
    const type = prune(typeInput);
    if (seen.has(type)) {
        return output;
    }
    seen.add(type);
    if (type.kind === "variable") {
        output.set(type.id, type);
        return output;
    }
    forEachChildType(type, (child) => freeVariables(child, output, seen));
    return output;
}

function freeEnvironmentVariables(environment, excludedNames = new Set()) {
    const output = new Map();
    for (const [name, entry] of environment) {
        if (excludedNames.has(name)) {
            continue;
        }
        addSchemeFreeVariables(output, entry.scheme);
    }
    return output;
}

function addSchemeFreeVariables(output, inputScheme) {
    const variables = freeVariables(inputScheme.type);
    for (const [id, variable] of variables) {
        if (!inputScheme.vars.has(id)) {
            output.set(id, variable);
        }
    }
}

function occurs(variableId, typeInput, seen, depth, maxDepth) {
    if (depth > maxDepth) {
        return "budget-exceeded";
    }
    const type = prune(typeInput);
    if (type.kind === "variable") {
        return type.id === variableId ? "found" : "clear";
    }
    if (seen.has(type)) {
        return "clear";
    }
    seen.add(type);
    let result = "clear";
    forEachChildType(type, (child) => {
        if (result === "clear") {
            result = occurs(variableId, child, seen, depth + 1, maxDepth);
        }
    });
    return result;
}

function lowerLevels(typeInput, level, seen, state) {
    const type = prune(typeInput);
    if (seen.has(type)) {
        return;
    }
    seen.add(type);
    if (type.kind === "variable") {
        const lowered = Math.min(type.level, level);
        if (lowered !== type.level) {
            state.unificationTrail.push({
                kind: "level",
                target: type,
                previous: type.level
            });
            type.level = lowered;
        }
        return;
    }
    forEachChildType(type, (child) => lowerLevels(child, level, seen, state));
}

function markWeakVariables(typeInput, seen = new Set(), state = undefined) {
    const type = prune(typeInput);
    if (seen.has(type)) {
        return;
    }
    seen.add(type);
    if (type.kind === "variable") {
        if (!type.weak) {
            if (state !== undefined) {
                state.unificationTrail.push({
                    kind: "weak",
                    target: type,
                    previous: type.weak
                });
            }
            type.weak = true;
        }
        return;
    }
    forEachChildType(type, (child) => markWeakVariables(child, seen, state));
}

function forEachChildType(type, visit) {
    if (type.kind === "constructor") {
        type.arguments.forEach(visit);
        return;
    }
    if (type.kind === "function") {
        type.parameters.forEach(visit);
        visit(type.result);
        return;
    }
    if (type.kind === "tuple") {
        type.elements.forEach(visit);
        return;
    }
    if (type.kind === "record") {
        type.fields.forEach(visit);
        if (type.row !== undefined) {
            visit(type.row);
        }
    }
}

function prune(type) {
    let current = type;
    const seen = new Set();
    while (current?.kind === "variable" && current.link !== undefined) {
        if (seen.has(current)) {
            return opaqueType("<cyclic-type-link>");
        }
        seen.add(current);
        current = current.link;
    }
    return current;
}

function freshVariable(state, level, weak) {
    if (state.budgetExceeded) {
        return state.budgetOpaqueType;
    }
    state.freshVariables += 1;
    if (state.freshVariables > state.maxFreshVariables) {
        state.budgetExceeded = true;
        return state.budgetOpaqueType;
    }
    const id = state.nextVariableId;
    state.nextVariableId += 1;
    return {
        kind: "variable",
        id,
        level,
        weak,
        link: undefined
    };
}

function primitive(name) {
    return Object.freeze({ kind: "primitive", name });
}

function opaqueType(display) {
    return { kind: "opaque", display };
}

function constructorType(name, argumentsTypes, mutable = false) {
    return {
        kind: "constructor",
        name,
        arguments: argumentsTypes,
        mutable
    };
}

function functionType(parameters, result, quantified = [], parameterNames = []) {
    return {
        kind: "function",
        parameters,
        result,
        quantified,
        parameterNames
    };
}

function tupleType(elements, readonly) {
    return { kind: "tuple", elements, readonly };
}

function recordType(fields, row, mutable) {
    return { kind: "record", fields, row, mutable };
}

function scheme(vars, type) {
    return { vars, type };
}

function mono(type) {
    return scheme(new Set(), type);
}

function isScheme(value) {
    return value !== null && typeof value === "object" && value.vars instanceof Set && value.type !== undefined;
}

function environmentEntry(
    inputScheme,
    mutable,
    quality = "complete",
    pending = false,
    deferredSafe = false,
    pendingCaptures = new Set(),
    invokedCaptures = new Set(),
    nestedBoundaryCaptures = new Set(),
    returnedBoundaryCaptures = new Set(),
    initializationOffset = undefined
) {
    return {
        scheme: inputScheme,
        mutable,
        quality,
        pending,
        deferred: false,
        deferredSafe,
        pendingCaptures,
        invokedCaptures,
        nestedBoundaryCaptures,
        returnedBoundaryCaptures,
        initializationOffset
    };
}

function ensureBindingCell(entry, name) {
    if (entry.bindingCell === undefined) {
        entry.bindingCell = { name, current: entry };
    }
    return entry.bindingCell;
}

function installBindingEntry(environment, name, entry, reuseExisting = true) {
    const previous = reuseExisting ? environment.get(name) : undefined;
    const bindingCell = previous?.bindingCell ?? { name, current: entry };
    bindingCell.current = entry;
    entry.bindingCell = bindingCell;
    environment.set(name, entry);
    return entry;
}

function success(type, expansive, partial) {
    return { ok: true, type, expansive, partial };
}

function failure(category, code, message) {
    return { ok: false, category, code, message };
}

function recordBindingFact(nameNode, declaration, kind, outcome, inputScheme, valueRestriction, state) {
    const annotationNode = readAnnotationNode(declaration);
    const annotation = annotationNode === undefined
        ? undefined
        : annotationFact(annotationNode, declaration, state);
    const typeScript = readTypeScriptFact(nameNode, declaration, state);
    const hm = {
        status: "not-run",
        confidence: "low",
        display: "<pending>",
        provenance: {
            engine: ENGINE_NAME,
            algorithm: "W-with-row-constraints",
            role: "supplementary",
            authoritative: false,
            valueRestriction: true
        }
    };
    const range = nodeRange(nameNode, state);
    const declarationRange = nodeRange(declaration, state);
    const fact = {
        id: stableFactId(state.path, kind, range),
        name: nameNode.text,
        kind,
        range,
        declarationRange,
        annotation,
        typescript: typeScript,
        hm,
        selected: selectTypeAuthority({ annotation, typescript: typeScript, hm }),
        valueRestriction
    };
    fact[INTERNAL_SCHEME] = inputScheme;
    fact[INTERNAL_OUTCOME] = outcome;
    state.facts.push(fact);
}

function refreshBindingFacts(state) {
    for (const fact of state.facts) {
        const inputScheme = fact[INTERNAL_SCHEME];
        const outcome = fact[INTERNAL_OUTCOME];
        if (inputScheme === undefined || outcome === undefined) {
            continue;
        }
        fact.hm = hmFact(outcome, inputScheme, fact.valueRestriction, state);
        if (state.budgetExceeded) {
            ensureBudgetDiagnostic(state, {
                pos: fact.range.start.offset,
                end: fact.range.end.offset
            });
        }
        fact.selected = selectTypeAuthority({
            annotation: fact.annotation,
            typescript: fact.typescript,
            hm: fact.hm
        });
        delete fact[INTERNAL_SCHEME];
        delete fact[INTERNAL_OUTCOME];
    }
}

function hmFact(outcome, inputScheme, valueRestriction, state) {
    const provenance = {
        engine: ENGINE_NAME,
        algorithm: "W-with-row-constraints",
        role: "supplementary",
        authoritative: false,
        valueRestriction: true
    };
    const serializedType = serializeType(inputScheme.type, state);
    const serializedScheme = serializeScheme(inputScheme, state);
    if (!outcome.ok) {
        const budgetExceeded = state.budgetExceeded || outcome.category === "budget-exceeded";
        return {
            status: budgetExceeded ? "budget-exceeded" : outcome.category,
            confidence: "low",
            display: formatHmType(inputScheme),
            type: serializedType,
            scheme: serializedScheme,
            code: budgetExceeded ? "HM_BUDGET_EXCEEDED" : outcome.code,
            message: budgetExceeded
                ? "HM inference exceeded a configured resource budget"
                : outcome.message,
            provenance
        };
    }
    const status = state.budgetExceeded
        ? "budget-exceeded"
        : state.parseDiagnostics.length !== 0
            ? "partial"
        : outcome.partial
            ? "partial"
            : "inferred";
    return {
        status,
        confidence: status === "inferred" && !valueRestriction.eligible
            ? "medium"
            : status === "inferred"
                ? "medium"
                : "low",
        display: formatHmType(inputScheme),
        type: serializedType,
        scheme: serializedScheme,
        code: status === "budget-exceeded"
            ? "HM_BUDGET_EXCEEDED"
            : state.parseDiagnostics.length !== 0
                ? "HM_PARSE_RECOVERY"
                : undefined,
        message: status === "budget-exceeded"
            ? "HM inference exceeded a configured resource budget"
            : state.parseDiagnostics.length !== 0
                ? "candidate was inferred from a parser-recovered AST and is low-confidence"
                : undefined,
        provenance
    };
}

function annotationFact(annotationNode, declaration, state) {
    const overlaps = diagnosticsOverlapping(declaration, state);
    const annotationType = state.checker === undefined
        ? undefined
        : state.checker.getTypeAtLocation(annotationNode);
    const indirectErrors = annotationType !== undefined &&
        (annotationType.flags & ts.TypeFlags.Any) !== 0 &&
        annotationNode.kind !== ts.SyntaxKind.AnyKeyword
        ? compilerErrorsForSourceFile(state)
        : [];
    const evidence = mergeCompilerDiagnostics(overlaps, indirectErrors);
    return {
        display: boundedText(annotationNode.getText(state.sourceFile), DEFAULT_MAX_DISPLAY_LENGTH),
        valid: evidence.length === 0,
        range: nodeRange(annotationNode, state),
        diagnosticCodes: diagnosticCodeList(evidence)
    };
}

function readTypeScriptFact(nameNode, declaration, state) {
    if (state.typeScriptFact !== undefined) {
        const supplied = state.typeScriptFact(nameNode, {
            declaration,
            sourceFile: state.sourceFile,
            path: state.path
        });
        const normalized = hardenTypeScriptFact(
            normalizeTypeScriptFact(supplied),
            declaration,
            state
        );
        if (normalized.status !== "unavailable" || state.checker === undefined) {
            return normalized;
        }
    }
    if (state.checker === undefined) {
        return normalizeTypeScriptFact(undefined);
    }
    const type = state.checker.getTypeAtLocation(nameNode);
    const display = boundedText(
        state.checker.typeToString(
            type,
            nameNode,
            ts.TypeFormatFlags.NoTruncation |
                ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope |
                ts.TypeFormatFlags.WriteArrowStyleSignature
        ),
        DEFAULT_MAX_DISPLAY_LENGTH
    );
    const overlaps = diagnosticsOverlapping(declaration, state);
    const annotationNode = readAnnotationNode(declaration);
    const explicitDynamic = annotationNode !== undefined &&
        (annotationNode.kind === ts.SyntaxKind.AnyKeyword || annotationNode.kind === ts.SyntaxKind.UnknownKeyword);
    const dynamic = (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0;
    const implicitErrorType = (type.flags & ts.TypeFlags.Any) !== 0 && !explicitDynamic;
    const evidence = implicitErrorType
        ? mergeCompilerDiagnostics(overlaps, compilerErrorsForSourceFile(state))
        : overlaps;
    return {
        status: evidence.length !== 0
            ? "error-derived"
            : dynamic && explicitDynamic
                ? "intentional-dynamic"
                : "resolved",
        display,
        typeFlags: Number(type.flags),
        diagnosticCodes: diagnosticCodeList(evidence),
        provenance: {
            engine: "typescript",
            authoritative: true
        }
    };
}

function hardenTypeScriptFact(fact, declaration, state) {
    if (fact.status === "unavailable" || fact.status === "error-derived") {
        return fact;
    }
    const overlaps = diagnosticsOverlapping(declaration, state);
    const annotationNode = readAnnotationNode(declaration);
    const implicitErrorType = typeof fact.typeFlags === "number" &&
        (fact.typeFlags & ts.TypeFlags.Any) !== 0 &&
        annotationNode?.kind !== ts.SyntaxKind.AnyKeyword;
    const evidence = implicitErrorType
        ? mergeCompilerDiagnostics(overlaps, compilerErrorsForSourceFile(state))
        : overlaps;
    if (evidence.length === 0) {
        return fact;
    }
    return {
        ...fact,
        status: "error-derived",
        diagnosticCodes: diagnosticCodeList(evidence),
        provenance: {
            ...fact.provenance,
            engine: "typescript",
            authoritative: true
        }
    };
}

function compilerErrorsForSourceFile(state) {
    return state.compilerDiagnostics.filter((diagnostic) => {
        const sameFile = diagnostic.file === undefined || diagnostic.file === state.sourceFile ||
            normalizePath(diagnostic.file.fileName) === normalizePath(state.sourceFile.fileName);
        return sameFile && (diagnostic.category === undefined ||
            diagnostic.category === ts.DiagnosticCategory.Error);
    });
}

function normalizeAnnotationFact(value) {
    if (value === undefined || value === null || typeof value !== "object") {
        return undefined;
    }
    return {
        display: typeof value.display === "string"
            ? boundedText(value.display, DEFAULT_MAX_DISPLAY_LENGTH)
            : "<annotation>",
        valid: value.valid !== false
    };
}

function normalizeTypeScriptFact(value) {
    const validStatuses = new Set([
        "resolved",
        "intentional-dynamic",
        "error-derived",
        "unavailable"
    ]);
    if (value === undefined || value === null || typeof value !== "object") {
        return {
            status: "unavailable",
            display: undefined,
            typeFlags: undefined,
            diagnosticCodes: [],
            provenance: {
                engine: "typescript",
                authoritative: true
            }
        };
    }
    return {
        status: validStatuses.has(value.status) ? value.status : "unavailable",
        display: typeof value.display === "string"
            ? boundedText(value.display, DEFAULT_MAX_DISPLAY_LENGTH)
            : undefined,
        typeFlags: typeof value.typeFlags === "number" ? value.typeFlags : undefined,
        diagnosticCodes: Array.isArray(value.diagnosticCodes)
            ? value.diagnosticCodes.filter((entry) => typeof entry === "string")
            : [],
        provenance: {
            ...(value.provenance ?? {}),
            engine: "typescript",
            authoritative: true
        }
    };
}

function normalizeHmFact(value) {
    if (value === undefined || value === null || typeof value !== "object") {
        return { status: "not-run", display: undefined };
    }
    return {
        status: typeof value.status === "string" ? value.status : "not-run",
        display: typeof value.display === "string"
            ? boundedText(value.display, DEFAULT_MAX_DISPLAY_LENGTH)
            : undefined
    };
}

function mergeCompilerDiagnostics(primary, secondary) {
    const output = [];
    const seen = new Set();
    for (const diagnostic of [...primary, ...secondary]) {
        const key = compilerDiagnosticKey(diagnostic);
        if (!seen.has(key)) {
            seen.add(key);
            output.push(diagnostic);
        }
    }
    return output;
}

function diagnosticCodeList(diagnostics) {
    return [...new Set(diagnostics.map((diagnostic) => `TS${String(diagnostic.code)}`))].sort();
}

function compilerDiagnosticKey(diagnostic) {
    const path = normalizePath(diagnostic.file?.fileName ?? "");
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText ?? "", "\n");
    return `${path}\0${String(diagnostic.start ?? -1)}\0${String(diagnostic.length ?? 0)}\0` +
        `${String(diagnostic.code ?? "parse")}\0${message}`;
}

function recordParseDiagnostic(state, diagnostic) {
    const code = `TS${String(diagnostic.code ?? "PARSE")}`;
    const range = diagnosticRange(diagnostic, state);
    const message = boundedText(
        ts.flattenDiagnosticMessageText(
            diagnostic.messageText ?? "TypeScript parse error",
            "\n"
        ),
        DEFAULT_MAX_DISPLAY_LENGTH
    );
    const key = `${code}\0${String(range.start.offset)}\0${message}`;
    if (state.diagnosticKeys.has(key)) {
        return;
    }
    state.diagnosticKeys.add(key);
    state.diagnostics.push({
        origin: "typescript",
        phase: "syntax",
        severity: "error",
        category: "parse",
        code,
        message,
        path: state.path,
        range,
        authoritative: true
    });
}

function diagnosticRange(diagnostic, state) {
    const sourceLength = state.sourceFile.text.length;
    const rawStart = typeof diagnostic.start === "number" ? diagnostic.start : 0;
    const rawLength = typeof diagnostic.length === "number" ? diagnostic.length : 0;
    const startOffset = Math.max(0, Math.min(sourceLength, rawStart));
    const endOffset = Math.max(startOffset, Math.min(sourceLength, startOffset + Math.max(0, rawLength)));
    return offsetRange(startOffset, endOffset, state);
}

function ensureBudgetDiagnostic(state, node) {
    if (state.budgetDiagnosticRecorded) {
        return;
    }
    state.budgetDiagnosticRecorded = true;
    recordInferenceFailure(
        state,
        node,
        failure(
            "budget-exceeded",
            "HM_BUDGET_EXCEEDED",
            "HM inference exceeded a configured resource budget"
        )
    );
}

function diagnosticsOverlapping(node, state) {
    const start = node.getStart(state.sourceFile, false);
    const end = node.getEnd();
    return state.compilerDiagnostics.filter((diagnostic) => {
        if (diagnostic.file !== undefined && diagnostic.file !== state.sourceFile &&
            normalizePath(diagnostic.file.fileName) !== normalizePath(state.sourceFile.fileName)) {
            return false;
        }
        if (typeof diagnostic.start !== "number") {
            return false;
        }
        if ((diagnostic.length ?? 0) === 0) {
            return diagnostic.start >= start && diagnostic.start <= end;
        }
        const diagnosticEnd = diagnostic.start + diagnostic.length;
        return diagnostic.start < end && diagnosticEnd > start;
    });
}

function checkerSeedForNode(node, state) {
    if (state.checker === undefined) {
        return undefined;
    }
    state.checkerTypeVisits = 0;
    state.checkerTypeCache = new Map();
    const type = state.checker.getTypeAtLocation(node);
    return translateCheckerType(type, node, state, new Set(), 0);
}

function translateCheckerType(type, node, state, seen, depth) {
    if (state.budgetExceeded || depth > state.maxTypeDepth || seen.has(type)) {
        return undefined;
    }
    if (state.checkerTypeCache.has(type)) {
        return state.checkerTypeCache.get(type);
    }
    state.checkerTypeVisits += 1;
    if (state.checkerTypeVisits > state.maxCheckerTypeVisits) {
        state.budgetExceeded = true;
        return undefined;
    }
    seen.add(type);
    state.checkerTypeCache.set(type, undefined);
    const translated = translateCheckerTypeValue(type, node, state, seen, depth);
    state.checkerTypeCache.set(type, translated);
    return translated;
}

function translateCheckerTypeValue(type, node, state, seen, depth) {
    const flags = type.flags;
    if ((flags & ts.TypeFlags.StringLike) !== 0) {
        return PRIMITIVE_TYPES.string;
    }
    if ((flags & ts.TypeFlags.NumberLike) !== 0) {
        return PRIMITIVE_TYPES.number;
    }
    if ((flags & ts.TypeFlags.BooleanLike) !== 0) {
        return PRIMITIVE_TYPES.boolean;
    }
    if ((flags & ts.TypeFlags.BigIntLike) !== 0) {
        return PRIMITIVE_TYPES.bigint;
    }
    if ((flags & ts.TypeFlags.ESSymbolLike) !== 0) {
        return PRIMITIVE_TYPES.symbol;
    }
    if ((flags & ts.TypeFlags.Undefined) !== 0) {
        return PRIMITIVE_TYPES.undefined;
    }
    if ((flags & ts.TypeFlags.Null) !== 0) {
        return PRIMITIVE_TYPES.null;
    }
    if ((flags & ts.TypeFlags.Void) !== 0) {
        return PRIMITIVE_TYPES.void;
    }
    if ((flags & ts.TypeFlags.Any) !== 0 || (flags & ts.TypeFlags.Unknown) !== 0 ||
        (flags & ts.TypeFlags.Never) !== 0 || (flags & ts.TypeFlags.TypeParameter) !== 0) {
        return opaqueType(state.checker.typeToString(type, node, ts.TypeFormatFlags.NoTruncation));
    }
    if (type.isUnion?.()) {
        const translated = type.types.map((member) =>
            translateCheckerType(member, node, state, new Set(seen), depth + 1));
        if (translated.length !== 0 && translated.every((member) =>
            member !== undefined && formatHmType(member) === formatHmType(translated[0]))) {
            return translated[0];
        }
        return undefined;
    }
    if (state.checker.isArrayType(type) || state.checker.isTupleType(type)) {
        const argumentsTypes = state.checker.getTypeArguments(type);
        const translated = argumentsTypes.map((argument) =>
            translateCheckerType(argument, node, state, new Set(seen), depth + 1));
        if (translated.some((entry) => entry === undefined)) {
            return undefined;
        }
        if (state.checker.isTupleType(type)) {
            return tupleType(translated, false);
        }
        return constructorType("Array", translated, true);
    }
    const signatures = state.checker.getSignaturesOfType(type, ts.SignatureKind.Call);
    if (signatures.length === 1 && signatures[0].typeParameters === undefined) {
        const signature = signatures[0];
        const parameters = [];
        for (const parameter of signature.parameters) {
            const parameterType = state.checker.getTypeOfSymbolAtLocation(parameter, node);
            const translated = translateCheckerType(parameterType, node, state, new Set(seen), depth + 1);
            if (translated === undefined) {
                return undefined;
            }
            parameters.push(translated);
        }
        const result = translateCheckerType(
            signature.getReturnType(),
            node,
            state,
            new Set(seen),
            depth + 1
        );
        return result === undefined ? undefined : functionType(parameters, result);
    }
    const properties = state.checker.getPropertiesOfType(type);
    if (properties.length !== 0 && properties.length <= state.maxCheckerProperties) {
        const fields = new Map();
        for (const property of properties) {
            const propertyType = state.checker.getTypeOfSymbolAtLocation(property, node);
            const translated = translateCheckerType(propertyType, node, state, new Set(seen), depth + 1);
            if (translated === undefined) {
                return undefined;
            }
            fields.set(property.getName(), translated);
        }
        return recordType(fields, freshVariable(state, state.level, false), false);
    }
    return undefined;
}

function translateTypeNode(node, state, depth = 0) {
    if (node === undefined) {
        return undefined;
    }
    if (depth > state.maxTypeDepth) {
        state.budgetExceeded = true;
        return undefined;
    }
    const keyword = keywordType(node.kind);
    if (keyword !== undefined) {
        return keyword;
    }
    if (ts.isParenthesizedTypeNode(node)) {
        return translateTypeNode(node.type, state, depth + 1);
    }
    if (ts.isArrayTypeNode(node)) {
        const element = translateTypeNode(node.elementType, state, depth + 1);
        return element === undefined ? undefined : constructorType("Array", [element], true);
    }
    if (ts.isTupleTypeNode(node)) {
        const elements = node.elements.map((element) => {
            const target = ts.isNamedTupleMember(element) ? element.type : element;
            return translateTypeNode(target, state, depth + 1);
        });
        return elements.some((element) => element === undefined)
            ? undefined
            : tupleType(elements, false);
    }
    if (ts.isFunctionTypeNode(node)) {
        const parameters = node.parameters.map((parameter) =>
            translateTypeNode(parameter.type, state, depth + 1));
        const result = translateTypeNode(node.type, state, depth + 1);
        return result === undefined || parameters.some((parameter) => parameter === undefined)
            ? undefined
            : functionType(parameters, result);
    }
    if (ts.isTypeLiteralNode(node)) {
        const fields = new Map();
        for (const member of node.members) {
            if (!ts.isPropertySignature(member) || member.type === undefined ||
                !isStaticPropertyName(member.name) || member.questionToken !== undefined) {
                return undefined;
            }
            const type = translateTypeNode(member.type, state, depth + 1);
            if (type === undefined) {
                return undefined;
            }
            fields.set(staticPropertyName(member.name), type);
        }
        return recordType(fields, freshVariable(state, state.level, false), false);
    }
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
        const argumentsTypes = (node.typeArguments ?? []).map((argument) =>
            translateTypeNode(argument, state, depth + 1));
        if (argumentsTypes.some((argument) => argument === undefined)) {
            return undefined;
        }
        if (node.typeName.text === "Array" || node.typeName.text === "ReadonlyArray" ||
            node.typeName.text === "Promise") {
            return constructorType(node.typeName.text, argumentsTypes, node.typeName.text === "Array");
        }
    }
    return undefined;
}

function keywordType(kind) {
    if (kind === ts.SyntaxKind.StringKeyword) {
        return PRIMITIVE_TYPES.string;
    }
    if (kind === ts.SyntaxKind.NumberKeyword) {
        return PRIMITIVE_TYPES.number;
    }
    if (kind === ts.SyntaxKind.BooleanKeyword) {
        return PRIMITIVE_TYPES.boolean;
    }
    if (kind === ts.SyntaxKind.BigIntKeyword) {
        return PRIMITIVE_TYPES.bigint;
    }
    if (kind === ts.SyntaxKind.SymbolKeyword) {
        return PRIMITIVE_TYPES.symbol;
    }
    if (kind === ts.SyntaxKind.UndefinedKeyword) {
        return PRIMITIVE_TYPES.undefined;
    }
    if (kind === ts.SyntaxKind.VoidKeyword) {
        return PRIMITIVE_TYPES.void;
    }
    return undefined;
}

function serializeScheme(inputScheme, state) {
    return {
        quantified: [...inputScheme.vars].sort((left, right) => left - right).map((id) => `t${String(id)}`),
        body: serializeType(inputScheme.type, state)
    };
}

function serializeType(typeInput, state, seen = new Map(), depth = 0) {
    const type = prune(typeInput);
    if (depth > state.maxTypeDepth) {
        state.budgetExceeded = true;
        return { kind: "opaque", display: "<type-depth-budget>" };
    }
    if (type.kind === "variable") {
        return {
            kind: "variable",
            id: `t${String(type.id)}`,
            weak: type.weak
        };
    }
    if (type.kind === "primitive") {
        return { kind: "primitive", name: type.name };
    }
    if (type.kind === "opaque") {
        return { kind: "opaque", display: type.display };
    }
    if (seen.has(type)) {
        return { kind: "reference", id: seen.get(type) };
    }
    const id = `n${String(seen.size)}`;
    seen.set(type, id);
    if (type.kind === "constructor") {
        return {
            kind: "constructor",
            id,
            name: type.name,
            mutable: type.mutable,
            arguments: type.arguments.map((argument) => serializeType(argument, state, seen, depth + 1))
        };
    }
    if (type.kind === "function") {
        return {
            kind: "function",
            id,
            parameters: type.parameters.map((parameter, index) => ({
                name: type.parameterNames[index],
                type: serializeType(parameter, state, seen, depth + 1)
            })),
            returns: serializeType(type.result, state, seen, depth + 1)
        };
    }
    if (type.kind === "tuple") {
        return {
            kind: "tuple",
            id,
            readonly: type.readonly,
            elements: type.elements.map((element) => serializeType(element, state, seen, depth + 1))
        };
    }
    if (type.kind === "record") {
        return {
            kind: "record",
            id,
            mutable: type.mutable,
            fields: [...type.fields.entries()].sort(([left], [right]) => left.localeCompare(right)).map(
                ([name, field]) => ({ name, type: serializeType(field, state, seen, depth + 1) })
            ),
            row: type.row === undefined ? undefined : serializeType(type.row, state, seen, depth + 1)
        };
    }
    return { kind: "opaque", display: "<unserializable-type>" };
}

function formatType(typeInput, names, depth, maxDepth, seen = new Set(), budget = undefined) {
    const activeBudget = budget ?? { nodes: 0, maxNodes: DEFAULT_MAX_FORMAT_NODES };
    activeBudget.nodes += 1;
    if (depth > maxDepth || activeBudget.nodes > activeBudget.maxNodes) {
        return "...";
    }
    if (typeInput === undefined || typeInput === null || typeof typeInput !== "object") {
        return "<unknown>";
    }
    if (isSerializedScheme(typeInput)) {
        return formatSerializedScheme(typeInput);
    }
    const type = typeInput.kind === "reference" ? typeInput : prune(typeInput);
    if (type.kind === "variable") {
        const numericId = typeof type.id === "number"
            ? type.id
            : Number.parseInt(String(type.id).replace(/^t/u, ""), 10);
        if (!names.has(numericId)) {
            names.set(numericId, typeVariableName(names.size));
        }
        return `${type.weak ? "_" : ""}${names.get(numericId)}`;
    }
    if (type.kind === "primitive") {
        return type.name;
    }
    if (type.kind === "opaque") {
        return type.display;
    }
    if (type.kind === "reference") {
        return `#${type.id}`;
    }
    if (seen.has(type)) {
        return "<recursive>";
    }
    seen.add(type);
    if (type.kind === "constructor") {
        const argumentsTypes = type.arguments ?? [];
        return argumentsTypes.length === 0
            ? type.name
            : `${type.name}<${argumentsTypes.map((argument) =>
                formatType(argument, names, depth + 1, maxDepth, seen, activeBudget)).join(", ")}>`;
    }
    if (type.kind === "function") {
        const parameters = type.parameters ?? [];
        const rendered = parameters.map((parameter, index) => {
            const parameterType = parameter?.type ?? parameter;
            const serializedName = parameter !== null && typeof parameter === "object" &&
                Object.hasOwn(parameter, "type")
                ? parameter.name
                : undefined;
            const name = type.parameterNames?.[index] ?? serializedName;
            const prefix = typeof name === "string" && name !== "" ? `${name}: ` : "";
            return `${prefix}${formatType(
                parameterType,
                names,
                depth + 1,
                maxDepth,
                new Set(seen),
                activeBudget
            )}`;
        });
        const result = type.result ?? type.returns;
        return `(${rendered.join(", ")}) -> ${formatType(
            result,
            names,
            depth + 1,
            maxDepth,
            new Set(seen),
            activeBudget
        )}`;
    }
    if (type.kind === "tuple") {
        const elements = type.elements ?? [];
        const prefix = type.readonly ? "readonly " : "";
        return `${prefix}[${elements.map((element) =>
            formatType(
                element,
                names,
                depth + 1,
                maxDepth,
                new Set(seen),
                activeBudget
            )).join(", ")}]`;
    }
    if (type.kind === "record") {
        const entries = type.fields instanceof Map
            ? [...type.fields.entries()].map(([name, field]) => ({ name, type: field }))
            : type.fields ?? [];
        entries.sort((left, right) => left.name.localeCompare(right.name));
        const fields = entries.map((entry) =>
            `${entry.name}: ${formatType(
                entry.type,
                names,
                depth + 1,
                maxDepth,
                new Set(seen),
                activeBudget
            )}`);
        const row = type.row === undefined
            ? ""
            : ` | ${formatType(
                type.row,
                names,
                depth + 1,
                maxDepth,
                new Set(seen),
                activeBudget
            )}`;
        return `{ ${fields.join(", ")}${row} }`;
    }
    return "<unsupported-type>";
}

function formatSerializedScheme(value) {
    const quantified = Array.isArray(value.quantified) ? value.quantified : [];
    const body = formatHmType(value.body);
    return quantified.length === 0 ? body : `forall ${quantified.join(" ")}. ${body}`;
}

function isSerializedScheme(value) {
    return Array.isArray(value.quantified) && value.body !== undefined;
}

function nodeRange(node, state) {
    const startOffset = typeof node.getStart === "function"
        ? node.getStart(state.sourceFile, false)
        : node.pos ?? 0;
    const endOffset = typeof node.getEnd === "function" ? node.getEnd() : node.end ?? startOffset;
    return offsetRange(startOffset, endOffset, state);
}

function offsetRange(startOffset, endOffset, state) {
    const start = state.sourceFile.getLineAndCharacterOfPosition(startOffset);
    const end = state.sourceFile.getLineAndCharacterOfPosition(endOffset);
    return {
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
        endExclusive: true
    };
}

function recordInferenceFailure(state, node, result) {
    if (result.code === "HM_BUDGET_EXCEEDED") {
        state.budgetDiagnosticRecorded = true;
    }
    const range = nodeRange(node, state);
    const key = `${result.code}\0${String(range.start.offset)}\0${result.message}`;
    if (state.diagnosticKeys.has(key)) {
        return;
    }
    state.diagnosticKeys.add(key);
    state.diagnostics.push({
        origin: "hm",
        severity: "info",
        category: result.category,
        code: result.code,
        message: result.message,
        path: state.path,
        range,
        authoritative: false
    });
}

function recordUnsupported(state, node, code, message) {
    recordInferenceFailure(state, node, failure("unsupported", code, message));
}

function readAnnotationNode(declaration) {
    return declaration?.type;
}

function invalidSourceFileReport(path) {
    return {
        schemaVersion: SCHEMA_VERSION,
        engine: {
            name: ENGINE_NAME,
            status: "invalid-input",
            authoritative: false,
            role: "supplementary"
        },
        positionEncoding: "utf-16",
        rangesAreEndExclusive: true,
        path: normalizePath(path ?? "<unknown>"),
        facts: [],
        diagnostics: [{
            origin: "hm",
            severity: "info",
            category: "unsupported",
            code: "HM_INVALID_SOURCE_FILE",
            message: "inferHmCandidates requires a TypeScript SourceFile",
            authoritative: false
        }],
        stats: {
            bindings: 0,
            inferred: 0,
            partial: 0,
            conflicts: 0,
            unsupported: 0,
            budgetExceeded: 0,
            freshVariables: 0,
            unifications: 0,
            astVisits: 0,
            schedulerOperations: 0
        }
    };
}

function stableFactId(path, kind, range) {
    const input = `${path}\0${kind}\0${String(range.start.offset)}\0${String(range.end.offset)}`;
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `HM-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function compareFacts(left, right) {
    return left.range.start.offset - right.range.start.offset || left.id.localeCompare(right.id);
}

function compareDiagnostics(left, right) {
    return (left.range?.start.offset ?? -1) - (right.range?.start.offset ?? -1) ||
        left.code.localeCompare(right.code);
}

function normalizePath(path) {
    return String(path).replaceAll("\\", "/");
}

function boundedText(value, maximumLength) {
    const text = String(value);
    if (text.length <= maximumLength) {
        return text;
    }
    return `${text.slice(0, Math.max(0, maximumLength - 3))}...`;
}

function readPositiveInteger(value, fallback) {
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function typeVariableName(index) {
    const alphabet = "abcdefghijklmnopqrstuvwxyz";
    const letter = alphabet[index % alphabet.length];
    const cycle = Math.floor(index / alphabet.length);
    return `'${letter}${cycle === 0 ? "" : String(cycle)}`;
}

function typeLevel(typeInput) {
    const type = prune(typeInput);
    return type.kind === "variable" ? type.level : 0;
}

function isPrimitiveNamed(type, name) {
    return type.kind === "primitive" && type.name === name;
}

function hasAsyncModifier(node) {
    return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
}

function isConstAssertionParent(node) {
    return node.parent !== undefined && ts.isAsExpression(node.parent) &&
        isConstTypeReference(node.parent.type);
}

function isConstTypeReference(node) {
    return ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && node.typeName.text === "const";
}

function isStaticPropertyName(node) {
    return ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node);
}

function staticPropertyName(node) {
    return ts.isIdentifier(node) ? node.text : node.text;
}

function isComparisonOperator(kind) {
    return kind === ts.SyntaxKind.EqualsEqualsToken ||
        kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        kind === ts.SyntaxKind.ExclamationEqualsToken ||
        kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        kind === ts.SyntaxKind.LessThanToken ||
        kind === ts.SyntaxKind.LessThanEqualsToken ||
        kind === ts.SyntaxKind.GreaterThanToken ||
        kind === ts.SyntaxKind.GreaterThanEqualsToken ||
        kind === ts.SyntaxKind.InKeyword ||
        kind === ts.SyntaxKind.InstanceOfKeyword;
}

function isArithmeticOperator(kind) {
    return kind === ts.SyntaxKind.PlusToken ||
        kind === ts.SyntaxKind.MinusToken ||
        kind === ts.SyntaxKind.AsteriskToken ||
        kind === ts.SyntaxKind.SlashToken ||
        kind === ts.SyntaxKind.PercentToken ||
        kind === ts.SyntaxKind.AsteriskAsteriskToken ||
        kind === ts.SyntaxKind.AmpersandToken ||
        kind === ts.SyntaxKind.BarToken ||
        kind === ts.SyntaxKind.CaretToken ||
        kind === ts.SyntaxKind.LessThanLessThanToken ||
        kind === ts.SyntaxKind.GreaterThanGreaterThanToken ||
        kind === ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken;
}

function isBigIntArithmeticOperator(kind) {
    return isArithmeticOperator(kind) &&
        kind !== ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken;
}

function isAssignmentOperator(kind) {
    return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

function scriptKindForPath(path) {
    if (/\.tsx$/iu.test(path)) {
        return ts.ScriptKind.TSX;
    }
    if (/\.jsx$/iu.test(path)) {
        return ts.ScriptKind.JSX;
    }
    if (/\.(?:js|mjs|cjs)$/iu.test(path)) {
        return ts.ScriptKind.JS;
    }
    return ts.ScriptKind.TS;
}

function isSourceFile(value) {
    return value !== null && typeof value === "object" && value.kind === ts.SyntaxKind.SourceFile &&
        typeof value.getLineAndCharacterOfPosition === "function";
}
