import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import ts from "typescript";

const replacementSpecifiers = new Map([
    ["zod", "typesea/zod"],
    ["zod/v3", "typesea/v3"],
    ["zod/v4", "typesea/v4"],
    ["zod/v4-mini", "typesea/v4-mini"],
    ["zod/v4/mini", "typesea/v4/mini"],
    ["zod/v4/core", "typesea/v4/core"],
    ["zod/v4/locales", "typesea/v4/locales"]
]);

export async function compileSelfContained(files, workspace) {
    const baselineRoot = join(workspace, "baseline");
    const typeSeaRoot = join(workspace, "typesea");
    await mkdir(baselineRoot, { recursive: true });
    await mkdir(typeSeaRoot, { recursive: true });
    const baselineNames = [];
    const typeSeaNames = [];
    const logicalByPath = new Map();
    const selected = files.slice(0, 500);

    for (let index = 0; index < selected.length; index += 1) {
        const entry = selected[index];
        if (entry === undefined) {
            continue;
        }
        const extension = extname(entry.path);
        const name = `${String(index).padStart(4, "0")}${extension}`;
        const baselinePath = join(baselineRoot, name);
        const typeSeaPath = join(typeSeaRoot, name);
        await writeFile(baselinePath, entry.source);
        await writeFile(typeSeaPath, rewriteZodSpecifiers(entry.source, entry.path));
        baselineNames.push(baselinePath);
        typeSeaNames.push(typeSeaPath);
        logicalByPath.set(baselinePath, entry.logicalPath);
        logicalByPath.set(typeSeaPath, entry.logicalPath);
    }

    const baseline = collectDiagnostics(baselineNames, logicalByPath);
    const typeSea = collectDiagnostics(typeSeaNames, logicalByPath);
    const baselineKeys = new Set(baseline.map(diagnosticKey));
    const regressions = typeSea.filter((diagnostic) =>
        !baselineKeys.has(diagnosticKey(diagnostic)));
    return {
        candidateFiles: selected.length,
        baselineDiagnostics: baseline.length,
        typeSeaDiagnostics: typeSea.length,
        regressionDiagnostics: regressions.length,
        regressions: regressions.slice(0, 200)
    };
}

function rewriteZodSpecifiers(source, path) {
    const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind);
    const replacements = [];
    function visit(node) {
        if (ts.isStringLiteral(node)) {
            const replacement = replacementSpecifiers.get(node.text);
            if (replacement !== undefined && isModuleSpecifier(node)) {
                replacements.push({
                    start: node.getStart(file) + 1,
                    end: node.getEnd() - 1,
                    replacement
                });
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(file);
    replacements.sort((left, right) => right.start - left.start);
    let output = source;
    for (let index = 0; index < replacements.length; index += 1) {
        const item = replacements[index];
        if (item !== undefined) {
            output = output.slice(0, item.start) + item.replacement + output.slice(item.end);
        }
    }
    return output;
}

function isModuleSpecifier(node) {
    const parent = node.parent;
    return ((ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
            parent.moduleSpecifier === node) ||
        (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent) &&
            parent.parent.argument === parent) ||
        (ts.isCallExpression(parent) &&
            parent.expression.kind === ts.SyntaxKind.ImportKeyword);
}

function collectDiagnostics(rootNames, logicalByPath) {
    const program = ts.createProgram({
        rootNames,
        options: {
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
            types: ["node"]
        }
    });
    return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
        const start = diagnostic.file === undefined || diagnostic.start === undefined
            ? undefined
            : diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
        return {
            path: diagnostic.file === undefined
                ? "<global>"
                : logicalByPath.get(diagnostic.file.fileName) ?? diagnostic.file.fileName,
            code: diagnostic.code,
            line: start === undefined ? 0 : start.line + 1,
            character: start === undefined ? 0 : start.character + 1,
            message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")
        };
    });
}

function diagnosticKey(diagnostic) {
    return `${diagnostic.path}:${String(diagnostic.code)}:${String(diagnostic.line)}:${String(diagnostic.character)}`;
}
