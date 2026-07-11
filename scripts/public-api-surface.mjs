import { readFile } from "node:fs/promises";

const expectedValueExports = [
    "analyzeSchema",
    "asyncDecoder",
    "asyncPipe",
    "asyncRefine",
    "asyncTransform",
    "ArrayDecoder",
    "ArrayGuard",
    "base64ToBytes",
    "BaseAsyncDecoder",
    "BaseCodec",
    "BaseDecoder",
    "base64urlToBytes",
    "BaseGuard",
    "BigIntGuard",
    "CompiledBaseGuard",
    "CompiledBooleanBaseGuard",
    "DateGuard",
    "EnumGuard",
    "FileGuard",
    "FunctionContract",
    "FunctionContractBuilder",
    "LiteralGuard",
    "MapGuard",
    "NumberGuard",
    "ObjectCodec",
    "ObjectDecoder",
    "StringGuard",
    "TupleGuard",
    "TypeSeaZodError",
    "TypeSeaAssertionError",
    "UnionGuard",
    "XorGuard",
    "ZodError",
    "ZodAny",
    "ZodArray",
    "ZodBase64",
    "ZodBase64URL",
    "ZodBigInt",
    "ZodBigIntFormat",
    "ZodBoolean",
    "ZodBranded",
    "ZodCatch",
    "ZodCIDRv4",
    "ZodCIDRv6",
    "ZodCodec",
    "ZodCUID",
    "ZodCUID2",
    "ZodCustom",
    "ZodCustomStringFormat",
    "ZodDate",
    "ZodDefault",
    "ZodDiscriminatedUnion",
    "ZodE164",
    "ZodEmail",
    "ZodEmoji",
    "ZodEffects",
    "ZodEnum",
    "ZodExactOptional",
    "ZodFile",
    "ZodFirstPartyTypeKind",
    "ZodFunction",
    "ZodGUID",
    "ZodIntersection",
    "ZodIPv4",
    "ZodIPv6",
    "ZodISODate",
    "ZodISODateTime",
    "ZodISODuration",
    "ZodISOTime",
    "ZodJWT",
    "ZodKSUID",
    "ZodLazy",
    "ZodLiteral",
    "ZodMAC",
    "ZodMap",
    "ZodNaN",
    "ZodNanoID",
    "ZodNever",
    "ZodNonOptional",
    "ZodNull",
    "ZodNullable",
    "ZodNullish",
    "ZodNumber",
    "ZodNumberFormat",
    "ZodObject",
    "ZodOptional",
    "ZodPipeline",
    "ZodPipe",
    "ZodPromise",
    "ZodPrefault",
    "ZodPreprocess",
    "ZodReadonly",
    "ZodRecord",
    "ZodRealError",
    "ZodSchema",
    "ZodSet",
    "ZodString",
    "ZodStringFormat",
    "ZodSuccess",
    "ZodSymbol",
    "ZodTemplateLiteral",
    "ZodTransform",
    "ZodTuple",
    "ZodType",
    "ZodUndefined",
    "ZodULID",
    "ZodUnion",
    "ZodUnknown",
    "ZodURL",
    "ZodUUID",
    "ZodVoid",
    "ZodXID",
    "ZodXor",
    "array",
    "atLeastOneKey",
    "base64",
    "base64url",
    "bigintGuard",
    "bytesToUtf8",
    "catchall",
    "catchValue",
    "check",
    "checkAsync",
    "cidrv4",
    "cidrv6",
    "codec",
    "codecs",
    "coerce",
    "coerceBigInt",
    "coerceBoolean",
    "coerceDate",
    "coerceNumber",
    "coerceString",
    "compile",
    "compileAsync",
    "compileBoolean",
    "compileCached",
    "config",
    "createCompileCache",
    "createTypeSeaEsbuildPlugin",
    "createTypeSeaRollupPlugin",
    "createTypeSeaVitePlugin",
    "custom",
    "cuid",
    "cuid2",
    "dateGuard",
    "decode",
    "decodeAsync",
    "deepPartial",
    "defaultValue",
    "decoder",
    "defineMessages",
    "describe",
    "discriminatedUnion",
    "e164",
    "email",
    "emitAotModule",
    "emoji",
    "encode",
    "encodeAsync",
    "enum",
    "enumValues",
    "exactOptional",
    "epochMillisToDate",
    "epochSecondsToDate",
    "exactlyOneKey",
    "example",
    "extend",
    "file",
    "float32",
    "float64",
    "flattenError",
    "flattenIssues",
    "formatError",
    "formatIssue",
    "formatIssues",
    "fromJSONSchema",
    "fromJsonSchema",
    "function",
    "functionBuilder",
    "getErrorMap",
    "guid",
    "globalRegistry",
    "hash",
    "hex",
    "hexToBytes",
    "hostname",
    "httpUrl",
    "instanceOf",
    "intersect",
    "int",
    "int32",
    "int64",
    "ipv4",
    "ipv6",
    "invertCodec",
    "iso",
    "isoDatetimeToDate",
    "isAsync",
    "isAsyncDecoderValue",
    "isCodecValue",
    "isDecoderValue",
    "jsonCodec",
    "isoDate",
    "isoDateTime",
    "isoDuration",
    "isoTime",
    "jwt",
    "ksuid",
    "lazy",
    "literal",
    "json",
    "keyofObject",
    "loose",
    "looseObject",
    "looseRecord",
    "locales",
    "map",
    "mac",
    "meta",
    "message",
    "makeStandardSchemaProps",
    "merge",
    "metadata",
    "nan",
    "nanoid",
    "NEVER",
    "nonpassthrough",
    "nonoptional",
    "nonstrict",
    "nullable",
    "neverGuard",
    "nullGuard",
    "nullish",
    "numberToBigInt",
    "ObjectGuard",
    "object",
    "omit",
    "oneOfKeys",
    "optional",
    "partial",
    "partialRecord",
    "parse",
    "parseAsync",
    "passthrough",
    "pipe",
    "pick",
    "prefault",
    "preprocess",
    "prettifyError",
    "optimizeGraph",
    "promise",
    "property",
    "record",
    "regexes",
    "registry",
    "readonly",
    "refine",
    "required",
    "safeDecode",
    "safeDecodeAsync",
    "safeEncode",
    "safeEncodeAsync",
    "safeExtend",
    "safeParse",
    "safeParseAsync",
    "set",
    "schemaRegistryToJsonSchema",
    "schemaToJsonSchema",
    "SchemaRegistry",
    "isSchemaRegistryValue",
    "resetErrorMap",
    "strict",
    "strictObject",
    "strip",
    "SetGuard",
    "setErrorMap",
    "stringFormat",
    "stringbool",
    "stringToBigInt",
    "stringToDate",
    "stringToHttpURL",
    "stringToInt",
    "stringToNumber",
    "stringToURL",
    "superRefine",
    "symbolGuard",
    "t",
    "z",
    "templateLiteral",
    "title",
    "spa",
    "success",
    "toJSONSchema",
    "toJsonSchema",
    "toZodError",
    "toZodIssue",
    "toZodIssues",
    "toStandardSchemaIssues",
    "toStandardSchemaResult",
    "toAsyncTrpcParser",
    "toFastifyRouteSchema",
    "toFastifyValidatorCompiler",
    "toReactHookFormResolver",
    "toTrpcParser",
    "transform",
    "treeifyError",
    "treeifyIssues",
    "tuple",
    "union",
    "unwrap",
    "uint32",
    "uint64",
    "ulid",
    "url",
    "utf8ToBytes",
    "uuid",
    "uuidv4",
    "uuidv6",
    "uuidv7",
    "xid",
    "undefinedGuard",
    "undefinedable",
    "unknownGuard",
    "voidGuard",
    "warmup",
    "withMessages",
    "xor",
    "ZodIssueCode"
];

const expectedTypeExports = [
    "AnyZodObject",
    "AsyncCompiledGuard",
    "Brand",
    "CatchContext",
    "CatchInput",
    "CheckMessageInput",
    "CheckMessageOptions",
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
    "EnumLikeInput",
    "EnumLikeValue",
    "EnumLiteralValue",
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
    "FunctionContractOptions",
    "FunctionInputShape",
    "FunctionOutput",
    "FormattedIssueMessages",
    "GlobalRegistryMetadata",
    "SchemaRegistryEntry",
    "Graph",
    "GraphNode",
    "Guard",
    "GuardPresence",
    "GuardValue",
    "Infer",
    "infer",
    "InferAdapter",
    "InferAsyncDecoder",
    "InferCodecDecoded",
    "InferCodecEncoded",
    "InferDecodedObject",
    "InferDecoder",
    "InferEncodedObject",
    "InferFunctionArgs",
    "InferObject",
    "InferSyncAdapter",
    "InferTuple",
    "InferTupleWithRest",
    "InferInputObject",
    "Input",
    "input",
    "InstanceConstructor",
    "IsoNamespace",
    "Issue",
    "IssueCode",
    "IssueMessageCatalog",
    "IssueMessageContext",
    "IssueMessageFormatter",
    "IssueMessageOptions",
    "IssueMessageTemplate",
    "IssueListError",
    "IssueSource",
    "JsonSchema",
    "JsonSchemaCyclesMode",
    "JsonSchemaExportCode",
    "JsonSchemaExportIssue",
    "JsonSchemaImportCode",
    "JsonSchemaImportIssue",
    "JsonSchemaObject",
    "JsonSchemaOptions",
    "JsonSchemaOverride",
    "JsonSchemaOverrideContext",
    "JsonSchemaOverrideObject",
    "JsonSchemaPrimitive",
    "JsonSchemaRegistryDocument",
    "JsonSchemaReusedMode",
    "JsonSchemaTarget",
    "JsonSchemaTypeName",
    "JsonSchemaUnrepresentableMode",
    "JsonSchemaUriMapper",
    "JsonCodecValue",
    "JsonValue",
    "LiteralValue",
    "LiteralValues",
    "MaskSelectedKeys",
    "MergeObjectShapes",
    "MessageLocale",
    "NodeId",
    "ObjectKeyMask",
    "ObjectCodecShape",
    "ObjectDecodeKeyMask",
    "ObjectDecodeMode",
    "ObjectDecodeShape",
    "ObjectGuardMode",
    "ObjectShape",
    "Output",
    "output",
    "ParseErrorInput",
    "ParseErrorMapper",
    "ParseErrorResult",
    "ParseIssueContext",
    "ParseOptions",
    "OmitObjectShape",
    "OmitObjectShapeByMask",
    "PartialObjectShape",
    "PartialObjectShapeByMask",
    "PathSegment",
    "PickObjectShape",
    "PickObjectShapeByMask",
    "Presence",
    "ReadonlyValue",
    "RefineOptions",
    "RefineParams",
    "RefineWhenPayload",
    "RefineWhenPredicate",
    "RegexNamespace",
    "ReactHookFormErrors",
    "ReactHookFormFieldError",
    "ReactHookFormResolver",
    "ReactHookFormResolverOptions",
    "ReactHookFormResolverResult",
    "RequiredObjectShape",
    "RequiredObjectShapeByMask",
    "RuntimeValue",
    "SafeParseFailure",
    "SafeParseResult",
    "SafeParseSuccess",
    "Schema",
    "SchemaAnalysisCode",
    "SchemaAnalysisIssue",
    "SchemaAnalysisReport",
    "SchemaAnalysisSeverity",
    "SeaFlowCase",
    "SeaFlowCaseKind",
    "SeaFlowConfig",
    "SeaFlowContext",
    "SeaFlowGuardSource",
    "SeaFlowIntensity",
    "SeaFlowOptions",
    "SeaFlowSource",
    "StringBoolCase",
    "StringBoolOptions",
    "StringEmailOptions",
    "StringHashAlgorithm",
    "StringHashEncoding",
    "StringHashOptions",
    "StringIsoDateTimeOptions",
    "StringIsoTimeOptions",
    "StringJwtOptions",
    "StringMacDelimiter",
    "StringMacOptions",
    "StringNormalizationForm",
    "StringUrlOptions",
    "StringUuidOptions",
    "StringUuidVersion",
    "StandardSchemaV1",
    "StandardSchemaV1FailureResult",
    "StandardSchemaV1InferInput",
    "StandardSchemaV1InferOutput",
    "StandardSchemaV1Issue",
    "StandardSchemaV1Options",
    "StandardSchemaV1PathSegment",
    "StandardSchemaV1Props",
    "StandardSchemaV1Result",
    "StandardSchemaV1SuccessResult",
    "StandardSchemaV1Types",
    "SyncAdapterSource",
    "SuperRefineContext",
    "SuperRefineIssueInput",
    "TemplateLiteralPart",
    "TrpcParser",
    "TransformContext",
    "TransformIssueInput",
    "TransformIssueSink",
    "TypeSeaConfig",
    "TypeSeaConfigIssue",
    "TypeSeaCustomError",
    "TypeSeaLocales",
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
    "TypeSource",
    "TreeifiedIssueMessages",
    "TypeOf",
    "UnwrappedGuardValue",
    "WithCheckCallback",
    "WithCheckInput",
    "WithCheckIssueSink",
    "WithCheckPayload",
    "WithCheckSource",
    "ZodDef",
    "ZodErrorLike",
    "ZodFirstPartyTypeKindValue",
    "ZodIssue",
    "ZodIssueBoundValue",
    "ZodTypeAny",
    "ZodIssueDetails",
    "WarmupEntry",
    "WarmupInput",
    "WarmupOptions",
    "TupleShape"
];

const expectedSeaBreezeValueExports = [
    "SeaBreezeArena",
    "SeaBreezeKind",
    "SeaBreezePresence",
    "createSeaBreeze",
    "emitSeaBreezeBooleanSourceBundle",
    "loadSeaBreezeSnapshot",
    "lowerSeaBreezeToGraph",
    "lowerSeaBreezeToSchema",
    "seaBreezeReader",
    "serializeSeaBreezeArena"
];

const expectedSeaBreezeTypeExports = [
    "SeaBreezeBuilder",
    "SeaBreezeBuilderCompileOptions",
    "SeaBreezeBuilderEmitOptions",
    "SeaBreezeBuilderGraphOptions",
    "SeaBreezeBuilderOptions",
    "SeaBreezeBuilderSchemaOptions",
    "SeaBreezeBuilderSnapshot",
    "SeaBreezeCompiledPredicate",
    "SeaBreezeCyclePolicy",
    "SeaBreezeEmitOptions",
    "SeaBreezeGraphLoweringOptions",
    "SeaBreezeNodeId",
    "SeaBreezeOptions",
    "SeaBreezeOptionalField",
    "SeaBreezeReader",
    "SeaBreezeSchemaLoweringOptions",
    "SeaBreezeSchemaObjectMode",
    "SeaBreezeShape",
    "SeaBreezeShapeValue",
    "SeaBreezeSnapshot",
    "SeaBreezeUnboundVarPolicy",
    "SeaBreezeUnionMode"
];

const result = await main();
if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
}

/**
 * @brief Run this module top-level workflow.
 */
async function main() {
    const declarations = await readFile("dist/index.d.ts", "utf8");
    const runtime = await readFile("dist/index.js", "utf8");
    const seaBreezeDeclarations = await readFile("dist/seabreeze/index.d.ts", "utf8");
    const seaBreezeRuntime = await readFile("dist/seabreeze/index.js", "utf8");
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
    const seaBreezeParsed = parseExports(seaBreezeDeclarations);
    if (!seaBreezeParsed.ok) {
        return seaBreezeParsed;
    }
    const seaBreezeRuntimeParsed = parseExports(seaBreezeRuntime);
    if (!seaBreezeRuntimeParsed.ok) {
        return seaBreezeRuntimeParsed;
    }
    const seaBreezeValueCheck = compareSet(
        "seabreeze value exports",
        expectedSeaBreezeValueExports,
        seaBreezeParsed.values
    );
    if (!seaBreezeValueCheck.ok) {
        return seaBreezeValueCheck;
    }
    const seaBreezeTypeCheck = compareSet(
        "seabreeze type exports",
        expectedSeaBreezeTypeExports,
        seaBreezeParsed.types
    );
    if (!seaBreezeTypeCheck.ok) {
        return seaBreezeTypeCheck;
    }
    const seaBreezeRuntimeValueCheck = compareSet(
        "seabreeze runtime value exports",
        expectedSeaBreezeValueExports,
        seaBreezeRuntimeParsed.values
    );
    if (!seaBreezeRuntimeValueCheck.ok) {
        return seaBreezeRuntimeValueCheck;
    }
    const seaBreezeRuntimeTypeCheck = compareSet(
        "seabreeze runtime type exports",
        [],
        seaBreezeRuntimeParsed.types
    );
    if (!seaBreezeRuntimeTypeCheck.ok) {
        return seaBreezeRuntimeTypeCheck;
    }
    const packageCheck = checkPackageExports(packageJson);
    if (!packageCheck.ok) {
        return packageCheck;
    }
    return ok(undefined);
}

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
 * @brief Compare expected and actual public names for snapshot drift.
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

function checkPackageExports(packageJson) {
    if (!isRecord(packageJson)) {
        return err("package.json is not an object");
    }
    const exportsField = packageJson["exports"];
    if (!isRecord(exportsField)) {
        return err("package.json exports field is not an object");
    }
    const expectedEntries = {
        ".": ["./dist/index.d.ts", "./dist/index.js"],
        "./mini": ["./dist/mini.d.ts", "./dist/mini.js"],
        "./locales": ["./dist/locales.d.ts", "./dist/locales.js"],
        "./seaflow": ["./dist/seaflow/index.d.ts", "./dist/seaflow/index.js"],
        "./seabreeze": ["./dist/seabreeze/index.d.ts", "./dist/seabreeze/index.js"],
        "./zod": ["./dist/zod.d.ts", "./dist/zod.js"],
        "./v3": ["./dist/v3.d.ts", "./dist/v3.js"],
        "./v4": ["./dist/v4.d.ts", "./dist/v4.js"],
        "./v4-mini": ["./dist/v4-mini.d.ts", "./dist/v4-mini.js"],
        "./v4/mini": ["./dist/v4/mini.d.ts", "./dist/v4/mini.js"],
        "./v4/core": ["./dist/v4/core.d.ts", "./dist/v4/core.js"],
        "./v4/locales": ["./dist/v4/locales.d.ts", "./dist/v4/locales.js"],
        "./v4/locales/*": ["./dist/v4/locales.d.ts", "./dist/v4/locales.js"]
    };
    const exportKeys = Object.keys(exportsField);
    const expectedKeys = Object.keys(expectedEntries).concat("./package.json");
    const missing = expectedKeys.filter((key) => !exportKeys.includes(key));
    const extra = exportKeys.filter((key) => !expectedKeys.includes(key));
    if (missing.length !== 0 || extra.length !== 0) {
        return err([
            "package exports mismatch",
            `missing: ${missing.join(", ") || "<none>"}`,
            `extra: ${extra.join(", ") || "<none>"}`
        ].join("\n"));
    }
    const packageJsonExport = exportsField["./package.json"];
    if (packageJsonExport !== "./package.json") {
        return err("package.json export must point to ./package.json");
    }
    for (const [specifier, target] of Object.entries(expectedEntries)) {
        const entry = exportsField[specifier];
        if (!isRecord(entry)) {
            return err(`package export ${specifier} is not an object`);
        }
        const typesTarget = target[0];
        const importTarget = target[1];
        if (entry["types"] !== typesTarget) {
            return err(`package export ${specifier} types must point to ${typesTarget}`);
        }
        if (entry["import"] !== importTarget) {
            return err(`package export ${specifier} import must point to ${importTarget}`);
        }
        if (entry["default"] !== importTarget) {
            return err(`package export ${specifier} default must point to ${importTarget}`);
        }
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
 * @brief Accept non-array objects before structured field reads.
 */
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Construct a successful result value.
 */
function ok(value) {
    return { ok: true, value };
}

/**
 * @brief Construct a failed result value.
 */
function err(error) {
    return { ok: false, error };
}
