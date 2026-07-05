import { readFile } from "node:fs/promises";

const expectedValueExports = [
    "asyncDecoder",
    "asyncPipe",
    "asyncRefine",
    "asyncTransform",
    "ArrayGuard",
    "BaseAsyncDecoder",
    "BaseCodec",
    "BaseDecoder",
    "BaseGuard",
    "CompiledBaseGuard",
    "CompiledBooleanBaseGuard",
    "DateGuard",
    "NumberGuard",
    "StringGuard",
    "TypeSeaAssertionError",
    "array",
    "bigintGuard",
    "catchall",
    "catchValue",
    "checkAsync",
    "codec",
    "coerce",
    "coerceBoolean",
    "coerceNumber",
    "coerceString",
    "compile",
    "compileAsync",
    "compileBoolean",
    "compileCached",
    "createCompileCache",
    "createTypeSeaEsbuildPlugin",
    "createTypeSeaRollupPlugin",
    "createTypeSeaVitePlugin",
    "dateGuard",
    "deepPartial",
    "defaultValue",
    "decoder",
    "defineMessages",
    "discriminatedUnion",
    "emitAotModule",
    "enum",
    "enumValues",
    "extend",
    "flattenIssues",
    "formatIssue",
    "formatIssues",
    "instanceOf",
    "intersect",
    "isAsync",
    "isAsyncDecoderValue",
    "isCodecValue",
    "isDecoderValue",
    "lazy",
    "literal",
    "json",
    "map",
    "merge",
    "nullable",
    "neverGuard",
    "nullGuard",
    "nullish",
    "ObjectGuard",
    "object",
    "omit",
    "optional",
    "partial",
    "passthrough",
    "pipe",
    "pick",
    "prefault",
    "optimizeGraph",
    "property",
    "record",
    "refine",
    "required",
    "safeExtend",
    "set",
    "schemaToJsonSchema",
    "strict",
    "strictObject",
    "strip",
    "superRefine",
    "symbolGuard",
    "t",
    "toJsonSchema",
    "toAsyncTrpcParser",
    "toFastifyRouteSchema",
    "toFastifyValidatorCompiler",
    "toReactHookFormResolver",
    "toTrpcParser",
    "transform",
    "tuple",
    "union",
    "undefinedGuard",
    "undefinedable",
    "unknownGuard",
    "voidGuard",
    "warmup",
    "withMessages"
];

const expectedTypeExports = [
    "AsyncCompiledGuard",
    "Brand",
    "CheckResult",
    "Codec",
    "CompileAsyncOptions",
    "CompileCache",
    "CompileMode",
    "CompileOptions",
    "CompileSourceMode",
    "CompiledBooleanGuard",
    "CompiledGuard",
    "AsyncDecodeSource",
    "AsyncDecoder",
    "AsyncValidationOptions",
    "AotCompileOptions",
    "AotIssue",
    "AotIssueCode",
    "AotModule",
    "AsyncTrpcParser",
    "DecodeSource",
    "Decoder",
    "DeepPartialObjectShape",
    "DeepPartialValue",
    "EnumValues",
    "FastifyHttpPart",
    "FastifyRouteSchema",
    "FastifyRouteSchemaOptions",
    "FastifyValidationResult",
    "FastifyValidator",
    "FastifyValidatorCompiler",
    "FastifyValidatorCompilerSource",
    "FastifyValidatorCompilerSourceMap",
    "FastifyValidatorRoute",
    "FlattenedIssueMessages",
    "Graph",
    "GraphNode",
    "Guard",
    "GuardPresence",
    "GuardValue",
    "Infer",
    "InferAdapter",
    "InferAsyncDecoder",
    "InferDecoder",
    "InferObject",
    "InferSyncAdapter",
    "InferTuple",
    "InferTupleWithRest",
    "InstanceConstructor",
    "Issue",
    "IssueCode",
    "IssueMessageCatalog",
    "IssueMessageContext",
    "IssueMessageFormatter",
    "IssueMessageOptions",
    "IssueMessageTemplate",
    "JsonSchema",
    "JsonSchemaExportCode",
    "JsonSchemaExportIssue",
    "JsonSchemaObject",
    "JsonSchemaOptions",
    "JsonSchemaPrimitive",
    "JsonSchemaTypeName",
    "JsonValue",
    "LiteralValue",
    "MaskSelectedKeys",
    "MergeObjectShapes",
    "MessageLocale",
    "NodeId",
    "ObjectKeyMask",
    "ObjectGuardMode",
    "ObjectShape",
    "OmitObjectShape",
    "OmitObjectShapeByMask",
    "PartialObjectShape",
    "PathSegment",
    "PickObjectShape",
    "PickObjectShapeByMask",
    "Presence",
    "ReactHookFormErrors",
    "ReactHookFormFieldError",
    "ReactHookFormResolver",
    "ReactHookFormResolverOptions",
    "ReactHookFormResolverResult",
    "RequiredObjectShape",
    "RuntimeValue",
    "Schema",
    "SyncAdapterSource",
    "SuperRefineContext",
    "SuperRefineIssueInput",
    "TrpcParser",
    "TypeSeaAotPluginEntry",
    "TypeSeaAotPluginOptions",
    "TypeSeaEsbuildBuild",
    "TypeSeaEsbuildFilter",
    "TypeSeaEsbuildLoadArgs",
    "TypeSeaEsbuildLoadFilter",
    "TypeSeaEsbuildLoadResult",
    "TypeSeaEsbuildLoader",
    "TypeSeaEsbuildPlugin",
    "TypeSeaEsbuildResolveArgs",
    "TypeSeaEsbuildResolveResult",
    "TypeSeaPluginReadFile",
    "TypeSeaRollupPlugin",
    "TypeSeaTransformResult",
    "TypeSeaVitePlugin",
    "WarmupEntry",
    "WarmupInput",
    "WarmupOptions",
    "TupleShape"
];

const result = await main();
if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
}

/**
 * @brief Run this module top-level workflow.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
async function main() {
    const declarations = await readFile("dist/index.d.ts", "utf8");
    const runtime = await readFile("dist/index.js", "utf8");
    const packageJson = JSON.parse(await readFile("package.json", "utf8"));
    const parsed = parseExports(declarations);
    if (!parsed.ok) {
        return parsed;
    }
    const runtimeParsed = parseExports(runtime);
    if (!runtimeParsed.ok) {
        return runtimeParsed;
    }
    const valueCheck = compareSet("value exports", expectedValueExports, parsed.values);
    if (!valueCheck.ok) {
        return valueCheck;
    }
    const typeCheck = compareSet("type exports", expectedTypeExports, parsed.types);
    if (!typeCheck.ok) {
        return typeCheck;
    }
    const runtimeValueCheck = compareSet(
        "runtime value exports",
        expectedValueExports,
        runtimeParsed.values
    );
    if (!runtimeValueCheck.ok) {
        return runtimeValueCheck;
    }
    const runtimeTypeCheck = compareSet("runtime type exports", [], runtimeParsed.types);
    if (!runtimeTypeCheck.ok) {
        return runtimeTypeCheck;
    }
    const packageCheck = checkPackageExports(packageJson);
    if (!packageCheck.ok) {
        return packageCheck;
    }
    return ok(undefined);
}

/**
 * @brief Parse exports.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function parseExports(source) {
    const values = [];
    const types = [];
    const wildcardPattern = /export\s+(?:type\s+)?\*\s+from\s+["'][^"']+["']/u;
    if (wildcardPattern.test(source)) {
        return {
            ok: false,
            error: "public API surface must not contain wildcard exports"
        };
    }
    const exportPattern = /export\s+(type\s+)?\{([^}]+)\}/gu;
    let match = exportPattern.exec(source);
    while (match !== null) {
        const typeOnly = match[1] !== undefined;
        const body = match[2];
        if (body !== undefined) {
            const entries = body.split(",");
            for (let index = 0; index < entries.length; index += 1) {
                const raw = entries[index];
                if (raw === undefined) {
                    continue;
                }
                const rawName = raw.trim();
                const inlineTypeOnly = rawName.startsWith("type ");
                const name = readExportedName(rawName);
                if (name.length === 0) {
                    continue;
                }
                if (typeOnly || inlineTypeOnly) {
                    types.push(name);
                } else {
                    values.push(name);
                }
            }
        }
        match = exportPattern.exec(source);
    }
    const typePattern = /export\s+(?:declare\s+)?(?:type|interface)\s+([A-Za-z_$][\w$]*)/gu;
    match = typePattern.exec(source);
    while (match !== null) {
        const name = match[1];
        if (name !== undefined) {
            types.push(name);
        }
        match = typePattern.exec(source);
    }
    const valuePattern = /export\s+(?:declare\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gu;
    match = valuePattern.exec(source);
    while (match !== null) {
        const name = match[1];
        if (name !== undefined) {
            values.push(name);
        }
        match = valuePattern.exec(source);
    }
    const enumPattern = /export\s+(?:declare\s+)?enum\s+([A-Za-z_$][\w$]*)/gu;
    match = enumPattern.exec(source);
    while (match !== null) {
        const name = match[1];
        if (name !== undefined) {
            values.push(name);
            types.push(name);
        }
        match = enumPattern.exec(source);
    }
    values.sort();
    types.sort();
    return {
        ok: true,
        values,
        types
    };
}

/**
 * @brief Read exported name.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function readExportedName(name) {
    if (name.startsWith("type ")) {
        const typeName = name.slice(5).trim();
        return readExportedName(typeName);
    }
    const alias = /\s+as\s+/u;
    const parts = name.split(alias);
    const exported = parts.length > 1 ? parts[parts.length - 1] : parts[0];
    return exported?.trim() ?? "";
}

/**
 * @brief Execute compare set.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function compareSet(label, expected, actual) {
    const expectedSorted = expected.slice().sort();
    const actualSorted = actual.slice().sort();
    const duplicates = findDuplicates(actualSorted);
    const missing = expectedSorted.filter((name) => !actualSorted.includes(name));
    const extra = actualSorted.filter((name) => !expectedSorted.includes(name));
    if (duplicates.length === 0 && missing.length === 0 && extra.length === 0) {
        return ok(undefined);
    }
    return err([
        `${label} mismatch`,
        `duplicates: ${duplicates.join(", ") || "<none>"}`,
        `missing: ${missing.join(", ") || "<none>"}`,
        `extra: ${extra.join(", ") || "<none>"}`
    ].join("\n"));
}

/**
 * @brief Execute find duplicates.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function findDuplicates(values) {
    const duplicates = [];
    let previous = "";
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value === undefined) {
            continue;
        }
        if (value === previous && !duplicates.includes(value)) {
            duplicates.push(value);
        }
        previous = value;
    }
    return duplicates;
}

/**
 * @brief Validate package exports.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function checkPackageExports(packageJson) {
    if (!isRecord(packageJson)) {
        return err("package.json is not an object");
    }
    const exportsField = packageJson["exports"];
    if (!isRecord(exportsField)) {
        return err("package.json exports field is not an object");
    }
    const exportKeys = Object.keys(exportsField);
    if (exportKeys.length !== 1 || exportKeys[0] !== ".") {
        return err(`package exports must expose only '.', got ${exportKeys.join(", ")}`);
    }
    const root = exportsField["."];
    if (!isRecord(root)) {
        return err("package root export is not an object");
    }
    if (root["types"] !== "./dist/index.d.ts") {
        return err("package root types export must point to ./dist/index.d.ts");
    }
    if (root["import"] !== "./dist/index.js") {
        return err("package root import export must point to ./dist/index.js");
    }
    if (root["default"] !== "./dist/index.js") {
        return err("package root default export must point to ./dist/index.js");
    }
    if (packageJson["types"] !== "./dist/index.d.ts") {
        return err("package types field must point to ./dist/index.d.ts");
    }
    if (packageJson["main"] !== "./dist/index.js") {
        return err("package main field must point to ./dist/index.js");
    }
    return ok(undefined);
}

/**
 * @brief Check record.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Construct a successful result value.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function ok(value) {
    return { ok: true, value };
}

/**
 * @brief Construct a failed result value.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function err(error) {
    return { ok: false, error };
}
