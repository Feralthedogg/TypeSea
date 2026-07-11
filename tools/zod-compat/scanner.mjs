import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import ts from "typescript";

const zodModulePattern = /^zod(?:\/|$)/u;

export async function scanRepository(entry, root, files, catalog) {
    const aggregate = makeAggregate(entry);
    for (let index = 0; index < files.length; index += 1) {
        const path = files[index];
        if (path === undefined) {
            continue;
        }
        const source = await readFile(path, "utf8");
        const result = scanSource(path, source, catalog);
        if (result === undefined) {
            continue;
        }
        aggregate.zodFiles += 1;
        aggregate.bytes += Buffer.byteLength(source);
        aggregate.callCount += result.callCount;
        mergeCounts(aggregate.staticPaths, result.staticPaths);
        mergeCounts(aggregate.methods, result.methods);
        mergeCounts(aggregate.namedImports, result.namedImports);
        mergeCounts(aggregate.typeSymbols, result.typeSymbols);
        aggregate.internalAccesses += result.internalAccesses;
        if (result.selfContained) {
            aggregate.selfContained.push({
                logicalPath: `${entry.id}/${relative(root, path)}`,
                path,
                source
            });
        }
    }
    return aggregate;
}

export function finalizeAggregate(value) {
    return {
        id: value.id,
        repository: value.repository,
        commit: value.commit,
        license: value.license,
        sourceUrl: `https://github.com/${value.repository}/tree/${value.commit}`,
        zodFiles: value.zodFiles,
        bytes: value.bytes,
        callCount: value.callCount,
        internalAccesses: value.internalAccesses,
        selfContainedFiles: value.selfContained.length,
        staticPaths: sortedCounts(value.staticPaths),
        methods: sortedCounts(value.methods),
        namedImports: sortedSymbolCounts(value.namedImports),
        typeSymbols: sortedSymbolCounts(value.typeSymbols)
    };
}

export function mergeRepositoryAggregates(values) {
    const total = makeAggregate({
        id: "total",
        repository: "",
        commit: "",
        license: ""
    });
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value === undefined) {
            continue;
        }
        total.zodFiles += value.zodFiles;
        total.bytes += value.bytes;
        total.callCount += value.callCount;
        total.internalAccesses += value.internalAccesses;
        total.selfContained.push(...value.selfContained);
        mergeCounts(total.staticPaths, value.staticPaths);
        mergeCounts(total.methods, value.methods);
        mergeCounts(total.namedImports, value.namedImports);
        mergeCounts(total.typeSymbols, value.typeSymbols);
    }
    return total;
}

function scanSource(path, source, catalog) {
    const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind);
    const namespaceModules = new Map();
    const namedBindings = new Map();
    const namedImports = new Map();
    const moduleSpecifiers = [];
    let hasZodImport = false;
    let hasOtherImport = false;

    for (let index = 0; index < file.statements.length; index += 1) {
        const statement = file.statements[index];
        if (!ts.isImportDeclaration(statement) ||
            !ts.isStringLiteral(statement.moduleSpecifier)) {
            continue;
        }
        const specifier = statement.moduleSpecifier.text;
        moduleSpecifiers.push({ node: statement.moduleSpecifier, specifier });
        if (!zodModulePattern.test(specifier)) {
            hasOtherImport = true;
            continue;
        }
        hasZodImport = true;
        const clause = statement.importClause;
        if (clause?.name !== undefined) {
            namespaceModules.set(clause.name.text, specifier);
        }
        const bindings = clause?.namedBindings;
        if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
            namespaceModules.set(bindings.name.text, specifier);
        } else if (bindings !== undefined) {
            for (let itemIndex = 0; itemIndex < bindings.elements.length; itemIndex += 1) {
                const item = bindings.elements[itemIndex];
                const imported = item.propertyName?.text ?? item.name.text;
                if (imported === "z") {
                    namespaceModules.set(item.name.text, specifier);
                } else {
                    namedBindings.set(item.name.text, imported);
                    increment(namedImports, symbolKey(specifier, imported));
                }
            }
        }
    }
    if (!hasZodImport) {
        return undefined;
    }

    const namespaces = new Set(namespaceModules.keys());
    const localChains = discoverLocalChains(file, namespaces, namedBindings);
    const staticPaths = new Map();
    const methods = new Map();
    const typeSymbols = new Map();
    let callCount = 0;
    let internalAccesses = 0;

    function visit(node) {
        if (ts.isCallExpression(node)) {
            const steps = readSteps(node, namespaces, namedBindings, localChains);
            if (steps !== undefined) {
                const firstCall = steps.findIndex((step) => step.called);
                if (firstCall >= 0) {
                    const staticPath = steps.slice(0, firstCall + 1)
                        .map((step) => step.name).join(".");
                    const calledMethods = steps.slice(firstCall + 1)
                        .filter((step) => step.called);
                    const recognized = catalog.staticPaths.has(staticPath) &&
                        calledMethods.every((step) => catalog.methods.has(step.name));
                    if (recognized) {
                        increment(staticPaths, staticPath);
                        for (let index = 0; index < calledMethods.length; index += 1) {
                            const step = calledMethods[index];
                            if (step !== undefined) {
                                increment(methods, step.name);
                            }
                        }
                        callCount += 1;
                    }
                }
            }
        }
        if (ts.isQualifiedName(node)) {
            const root = qualifiedRoot(node);
            if (root !== undefined && namespaces.has(root.root)) {
                const specifier = namespaceModules.get(root.root);
                if (specifier !== undefined) {
                    increment(typeSymbols, symbolKey(specifier, root.path));
                }
            }
        }
        if (ts.isPropertyAccessExpression(node) &&
            (node.name.text === "_def" || node.name.text === "_zod")) {
            internalAccesses += 1;
        }
        ts.forEachChild(node, visit);
    }
    visit(file);

    return {
        callCount,
        staticPaths,
        methods,
        namedImports,
        typeSymbols,
        internalAccesses,
        selfContained: !hasOtherImport && moduleSpecifiers.length > 0
    };
}

function discoverLocalChains(file, namespaces, namedBindings) {
    const chains = new Map();
    let changed = true;
    while (changed) {
        changed = false;
        function visit(node) {
            if (ts.isVariableDeclaration(node) &&
                ts.isIdentifier(node.name) &&
                node.initializer !== undefined &&
                !chains.has(node.name.text)) {
                const steps = readSteps(node.initializer, namespaces, namedBindings, chains);
                if (steps !== undefined && steps.some((step) => step.called)) {
                    chains.set(node.name.text, steps);
                    changed = true;
                }
            }
            ts.forEachChild(node, visit);
        }
        visit(file);
    }
    return chains;
}

function readSteps(node, namespaces, namedBindings, localChains) {
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) ||
        ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node) ||
        ts.isSatisfiesExpression(node)) {
        return readSteps(node.expression, namespaces, namedBindings, localChains);
    }
    if (ts.isIdentifier(node)) {
        if (namespaces.has(node.text)) {
            return [];
        }
        const imported = namedBindings.get(node.text);
        if (imported !== undefined) {
            return [{ name: imported, called: false }];
        }
        const local = localChains.get(node.text);
        return local === undefined ? undefined : local.map((step) => ({ ...step }));
    }
    if (ts.isPropertyAccessExpression(node)) {
        const base = readSteps(node.expression, namespaces, namedBindings, localChains);
        if (base === undefined) {
            return undefined;
        }
        base.push({ name: node.name.text, called: false });
        return base;
    }
    if (ts.isElementAccessExpression(node) &&
        node.argumentExpression !== undefined &&
        ts.isStringLiteral(node.argumentExpression)) {
        const base = readSteps(node.expression, namespaces, namedBindings, localChains);
        if (base === undefined) {
            return undefined;
        }
        base.push({ name: node.argumentExpression.text, called: false });
        return base;
    }
    if (ts.isCallExpression(node)) {
        const base = readSteps(node.expression, namespaces, namedBindings, localChains);
        if (base === undefined || base.length === 0) {
            return undefined;
        }
        const last = base[base.length - 1];
        if (last !== undefined) {
            last.called = true;
        }
        return base;
    }
    return undefined;
}

function qualifiedRoot(node) {
    const parts = [];
    let current = node;
    while (ts.isQualifiedName(current)) {
        parts.unshift(current.right.text);
        current = current.left;
    }
    if (!ts.isIdentifier(current)) {
        return undefined;
    }
    return {
        root: current.text,
        path: parts.join(".")
    };
}

function makeAggregate(entry) {
    return {
        ...entry,
        zodFiles: 0,
        bytes: 0,
        callCount: 0,
        internalAccesses: 0,
        selfContained: [],
        staticPaths: new Map(),
        methods: new Map(),
        namedImports: new Map(),
        typeSymbols: new Map()
    };
}

function mergeCounts(target, source) {
    for (const [name, count] of source) {
        target.set(name, (target.get(name) ?? 0) + count);
    }
}

function increment(target, name) {
    if (name.length !== 0) {
        target.set(name, (target.get(name) ?? 0) + 1);
    }
}

function sortedCounts(values) {
    return [...values.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((left, right) => right.count - left.count ||
            left.name.localeCompare(right.name));
}

function sortedSymbolCounts(values) {
    return [...values.entries()]
        .map(([key, count]) => {
            const separator = key.indexOf("\u0000");
            return {
                module: key.slice(0, separator),
                name: key.slice(separator + 1),
                count
            };
        })
        .sort((left, right) => right.count - left.count ||
            left.module.localeCompare(right.module) ||
            left.name.localeCompare(right.name));
}

function symbolKey(module, name) {
    return `${module}\u0000${name}`;
}
