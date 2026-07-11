import { resolve } from "node:path";
import ts from "typescript";

export async function evaluateSupport(repositoryRoot, observed) {
    const typeSea = await import(resolve(repositoryRoot, "dist", "zod.js"));
    const methods = readMethodNames(typeSea);
    const staticPaths = observed.staticPaths.map((entry) => entry.name);
    const observedMethods = observed.methods.map((entry) => entry.name);
    const declarationSymbols = [
        ...observed.namedImports,
        ...observed.typeSymbols.map((entry) => ({
            ...entry,
            name: entry.name.split(".")[0] ?? ""
        }))
    ];
    const declarationCache = new Map();
    const missingDeclarationExports = [];
    for (let index = 0; index < declarationSymbols.length; index += 1) {
        const entry = declarationSymbols[index];
        if (entry === undefined || entry.name.length === 0) {
            continue;
        }
        let exports = declarationCache.get(entry.module);
        if (exports === undefined) {
            exports = readDeclarationExports(resolveDeclarationPath(
                repositoryRoot,
                entry.module
            ));
            declarationCache.set(entry.module, exports);
        }
        if (!exports.has(entry.name)) {
            missingDeclarationExports.push(`${entry.module}:${entry.name}`);
        }
    }
    return {
        missingStaticPaths: staticPaths.filter((path) => !hasPath(typeSea, path)),
        missingMethods: observedMethods.filter((name) => !methods.has(name)),
        missingDeclarationExports: [...new Set(missingDeclarationExports)].sort(),
        supportedStaticPaths: staticPaths.length,
        supportedMethods: observedMethods.length,
        declarationExportCount: [...declarationCache.values()]
            .reduce((total, exports) => total + exports.size, 0),
        instanceMethodCount: methods.size
    };
}

export function makeRuntimeCatalog(zod) {
    return {
        staticPaths: readCallablePaths(zod, 2),
        methods: readMethodNames(zod)
    };
}

function readMethodNames(zod) {
    const values = [
        zod.string(),
        zod.number(),
        zod.bigint(),
        zod.boolean(),
        zod.date(),
        zod.array(zod.unknown()),
        zod.object({ value: zod.string() }),
        zod.tuple([zod.string()]),
        zod.record(zod.string(), zod.unknown()),
        zod.union([zod.string(), zod.number()]),
        zod.literal("value"),
        zod.enum(["value", "other"]),
        zod.map(zod.string(), zod.unknown()),
        zod.set(zod.string()),
        zod.function(),
        zod.string().transform((value) => value),
        zod.string().optional(),
        zod.string().default("value")
    ];
    const names = new Set();
    for (let index = 0; index < values.length; index += 1) {
        let current = values[index];
        while (current !== null && current !== undefined) {
            const own = Reflect.ownKeys(current);
            for (let keyIndex = 0; keyIndex < own.length; keyIndex += 1) {
                const key = own[keyIndex];
                if (typeof key === "string") {
                    names.add(key);
                }
            }
            current = Object.getPrototypeOf(current);
        }
    }
    return names;
}

function readCallablePaths(root, maxDepth) {
    const paths = new Set();
    const visited = new Set();
    function visit(value, prefix, depth) {
        if ((typeof value !== "object" && typeof value !== "function") ||
            value === null || visited.has(value) || depth > maxDepth) {
            return;
        }
        visited.add(value);
        const keys = Reflect.ownKeys(value);
        for (let index = 0; index < keys.length; index += 1) {
            const key = keys[index];
            if (typeof key !== "string") {
                continue;
            }
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (descriptor === undefined || !("value" in descriptor)) {
                continue;
            }
            const path = prefix.length === 0 ? key : `${prefix}.${key}`;
            if (typeof descriptor.value === "function") {
                paths.add(path);
            }
            visit(descriptor.value, path, depth + 1);
        }
    }
    visit(root, "", 0);
    return paths;
}

function readDeclarationExports(path) {
    const program = ts.createProgram({
        rootNames: [path],
        options: {
            noEmit: true,
            skipLibCheck: true,
            module: ts.ModuleKind.NodeNext,
            moduleResolution: ts.ModuleResolutionKind.NodeNext,
            target: ts.ScriptTarget.ES2022
        }
    });
    const file = program.getSourceFile(path);
    const checker = program.getTypeChecker();
    const symbol = file === undefined ? undefined : checker.getSymbolAtLocation(file);
    if (symbol === undefined) {
        return new Set();
    }
    return new Set(checker.getExportsOfModule(symbol).map((entry) => entry.name));
}

function resolveDeclarationPath(repositoryRoot, module) {
    const relative = new Map([
        ["zod", "zod.d.ts"],
        ["zod/v3", "v3.d.ts"],
        ["zod/v4", "v4.d.ts"],
        ["zod/v4-mini", "v4-mini.d.ts"],
        ["zod/v4/mini", "v4/mini.d.ts"],
        ["zod/v4/core", "v4/core.d.ts"],
        ["zod/v4/locales", "v4/locales.d.ts"]
    ]).get(module);
    return resolve(repositoryRoot, "dist", relative ?? "zod.d.ts");
}

function hasPath(root, path) {
    const parts = path.split(".");
    let value = root;
    for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        if (part === undefined || value === null ||
            (typeof value !== "object" && typeof value !== "function") ||
            !(part in value)) {
            return false;
        }
        value = value[part];
    }
    return typeof value === "function";
}
