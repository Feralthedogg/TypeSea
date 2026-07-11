import { describe, expect, expectTypeOf, test } from "vitest";
import * as TypeSea from "../src/index.js";
import {
    createSeaBreeze,
    SeaBreezeArena,
    SeaBreezePresence,
    type SeaBreezeBuilder,
    type SeaBreezeBuilderCompileOptions,
    type SeaBreezeBuilderEmitOptions,
    type SeaBreezeBuilderGraphOptions,
    type SeaBreezeBuilderOptions,
    type SeaBreezeBuilderSchemaOptions,
    type SeaBreezeBuilderSnapshot,
    type SeaBreezeCompiledPredicate,
    type SeaBreezeNodeId,
    type SeaBreezeOptionalField,
    type SeaBreezeShape
} from "../src/seabreeze/index.js";
import {
    analyzeSchema,
    ArrayGuard,
    atLeastOneKey,
    BaseAsyncDecoder,
    BaseCodec,
    BaseDecoder,
    BaseGuard,
    BigIntGuard,
    compile,
    compileAsync,
    compileBoolean,
    config,
    createCompileCache,
    createTypeSeaRollupPlugin,
    DateGuard,
    decode,
    decodeAsync,
    encode,
    encodeAsync,
    EnumGuard,
    exactlyOneKey,
    FileGuard,
    flattenError,
    formatError,
    fromJSONSchema,
    fromJsonSchema,
    functionBuilder,
    getErrorMap,
    globalRegistry,
    isSchemaRegistryValue,
    meta,
    invertCodec,
    jsonCodec,
    locales,
    LiteralGuard,
    MapGuard,
    metadata,
    NEVER,
    nonoptional,
    NumberGuard,
    oneOfKeys,
    ObjectGuard,
    parse,
    parseAsync,
    prettifyError,
    registry,
    regexes,
    resetErrorMap,
    safeDecode,
    safeDecodeAsync,
    safeEncode,
    safeEncodeAsync,
    safeParse,
    safeParseAsync,
    setErrorMap,
    spa,
    SetGuard,
    success,
    StringGuard,
    stringToHttpURL,
    stringToInt,
    stringToDate,
    t,
    toZodError,
    toZodIssues,
    treeifyError,
    treeifyIssues,
    TupleGuard,
    TypeSeaAssertionError,
    TypeSeaZodError,
    toJSONSchema,
    toJsonSchema,
    schemaRegistryToJsonSchema,
    unwrap,
    warmup,
    z,
    ZodAny,
    ZodArray,
    ZodBigInt,
    ZodBranded,
    ZodCatch,
    ZodCodec,
    ZodDate,
    ZodDefault,
    ZodDiscriminatedUnion,
    ZodEffects,
    ZodEnum,
    ZodError,
    ZodFile,
    ZodFirstPartyTypeKind,
    ZodIntersection,
    ZodIssueCode,
    ZodLiteral,
    ZodMap,
    ZodNever,
    ZodNull,
    ZodNullable,
    ZodNullish,
    ZodNumber,
    ZodObject,
    ZodOptional,
    ZodPipeline,
    ZodReadonly,
    ZodRecord,
    ZodPrefault,
    ZodPromise,
    ZodSchema,
    ZodSet,
    ZodString,
    ZodTransform,
    ZodTuple,
    ZodType,
    ZodUndefined,
    ZodUnion,
    ZodUnknown,
    ZodVoid,
    ZodXor,
    UnionGuard,
    XorGuard,
    type AsyncCompiledGuard,
    type AsyncValidationOptions,
    type AnyZodObject,
    type Brand,
    type CatchContext,
    type CatchInput,
    type CheckMessageInput,
    type CheckMessageOptions,
    type CheckResult,
    type Codec,
    type CompileAsyncOptions,
    type CompileCache,
    type CompileMode,
    type CompileOptions,
    type CompiledBooleanGuard,
    type CompileSourceMode,
    type EnumLikeInput,
    type EnumLikeValue,
    type EnumLiteralValue,
    type FunctionContract,
    type FunctionContractBuilder,
    type FunctionContractOptions,
    type FunctionInputShape,
    type FunctionOutput,
    type FlattenedIssueMessages,
    type FormattedIssueMessages,
    type Guard,
    type GuardPresence,
    type GuardValue,
    type Infer,
    type infer as ZodInfer,
    type InferAsyncDecoder,
    type InferCodecDecoded,
    type InferCodecEncoded,
    type InferDecoder,
    type InferFunctionArgs,
    type GlobalRegistryMetadata,
    type Input,
    type input as ZodInput,
    type IsoNamespace,
    type Issue,
    type IssueListError,
    type IssueMessageCatalog,
    type IssueSource,
    type JsonSchemaCyclesMode,
    type JsonSchemaImportCode,
    type JsonSchemaImportIssue,
    type JsonSchemaOverride,
    type JsonSchemaOverrideContext,
    type JsonSchemaOverrideObject,
    type JsonSchemaRegistryDocument,
    type JsonSchemaReusedMode,
    type JsonSchemaTarget,
    type JsonSchemaUnrepresentableMode,
    type JsonSchemaUriMapper,
    type JsonCodecValue,
    type JsonValue,
    type LiteralValue,
    type LiteralValues,
    type Presence,
    type Output,
    type output as ZodOutput,
    type ParseErrorMapper,
    type ParseErrorResult,
    type ParseIssueContext,
    type ParseOptions,
    type ReadonlyValue,
    type RefineOptions,
    type RefineParams,
    type RefineWhenPayload,
    type RefineWhenPredicate,
    type RegexNamespace,
    type RuntimeValue,
    type SafeParseResult,
    type SchemaRegistry,
    type SchemaRegistryEntry,
    type SchemaAnalysisReport,
    type StringHashAlgorithm,
    type StringHashEncoding,
    type StringHashOptions,
    type StringEmailOptions,
    type StringIsoDateTimeOptions,
    type StringIsoTimeOptions,
    type StringJwtOptions,
    type StringMacDelimiter,
    type StringMacOptions,
    type StringNormalizationForm,
    type StringUrlOptions,
    type StringUuidOptions,
    type StringUuidVersion,
    type StringBoolCase,
    type StringBoolOptions,
    type SuperRefineIssueInput,
    type TemplateLiteralPart,
    type TransformContext,
    type TransformIssueInput,
    type TransformIssueSink,
    type TypeSeaConfig,
    type TypeSeaConfigIssue,
    type TypeSeaCustomError,
    type TypeSeaEsbuildLoader,
    type TypeSeaLocales,
    type TypeSeaPluginReadFile,
    type TreeifiedIssueMessages,
    type TypeOf,
    type UnwrappedGuardValue,
    type WithCheckCallback,
    type WithCheckInput,
    type WithCheckIssueSink,
    type WithCheckPayload,
    type WithCheckSource,
    type ZodErrorLike,
    type ZodDef,
    type ZodFirstPartyTypeKindValue,
    type ZodIssue,
    type ZodIssueBoundValue,
    type ZodIssueDetails,
    type ZodIssueCode as ZodIssueCodeType,
    type ZodTypeAny
} from "../src/index.js";

describe("public type contracts", () => {
    test("preserves object presence, wrappers, brands, arrays, and tuples", () => {
        const UserId = t.string.brand<"UserId">();
        const Shape = t.object({
            id: UserId,
            nickname: t.optional(t.string),
            title: t.undefinedable(t.string),
            maybeTitle: t.undefinedable(t.optional(t.string)),
            maybeNull: t.nullable(t.optional(t.string)),
            maybeRefined: t.refine(
                t.optional(t.string),
                (value) => value === undefined || value.length > 0,
                "present_non_empty"
            ),
            maybeSuperRefined: t.superRefine(
                t.optional(t.string),
                (value, context) => {
                    if (value?.length === 0) {
                        const issue: SuperRefineIssueInput = {
                            path: ["maybeSuperRefined"],
                            message: "must not be empty"
                        };
                        context.addIssue(issue);
                    }
                },
                "present_non_empty"
            ),
            tags: t.array(t.optional(t.number.int())),
            pair: t.tuple([t.literal("id"), UserId])
        });
        const OptionalName = t.optional(t.string);
        const UnwrappedName = OptionalName.unwrap();
        const BuilderUnwrappedName = unwrap(OptionalName);
        const ArrayItems = t.array(t.number.int());
        const ArrayElement = ArrayItems.element;
        const UnwrappedItem = ArrayItems.unwrap();
        const MaybeName = t.nullish(t.string).nonoptional();
        const BuilderMaybeCount = nonoptional(t.nullish(t.number));
        interface PairValue {
            readonly left: string;
            readonly right: string;
        }
        const refineWhen: RefineWhenPredicate<PairValue> = (payload) =>
            payload.value.left.length === payload.value.right.length ||
            payload.issues.length >= 0;
        const refineOptions: RefineOptions<PairValue> = {
            error: "values must match",
            path: ["right"],
            abort: true,
            when: refineWhen
        };
        const checkMessageOptions: CheckMessageOptions = {
            error: "field failed"
        };
        const checkMessageInput: CheckMessageInput = checkMessageOptions;
        const MessageName = t.string.min(2, checkMessageOptions);
        const MessageEmail = t.string.email({
            pattern: regexes.html5Email,
            error: "email required"
        });
        const MessageUuid = t.string.uuid({
            version: "v7",
            message: "uuid required"
        });
        const MessageCount = t.number.int("whole number");
        const MessageBigInt = t.bigint.gte(1n, "big count required");
        const MessageDate = t.date.min(new Date("2026-01-01T00:00:00.000Z"), {
            error: "date required"
        });
        const ConstructorName = t.string({ error: "name must be text" });
        const ConstructorCount = t.number("count must be numeric");
        const ConstructorFlag = t.boolean({ message: "flag must be boolean" });
        const MessageTags = t.array(t.string).nonempty({
            message: "tag required"
        });
        const MessageSet = t.set(t.string).min(1, checkMessageInput);
        const MessageFile = t.file().mime("text/plain", {
            message: "plain text required"
        });
        const parseMapper: ParseErrorMapper = (issue, context) => {
            const sameIssue: Issue = context.issue;
            expectTypeOf<typeof context>().toEqualTypeOf<ParseIssueContext>();
            return sameIssue.code === issue.code
                ? {
                    message: issue.code
                }
                : undefined;
        };
        const parseErrorResult: ParseErrorResult = parseMapper({
            path: [],
            code: "expected_string",
            expected: "string",
            actual: "number",
            message: undefined
        }, {
            input: 1,
            issue: {
                path: [],
                code: "expected_string",
                expected: "string",
                actual: "number",
                message: undefined
            }
        });
        const previousErrorMap = setErrorMap(parseMapper);
        const currentErrorMap = getErrorMap();
        const clearedErrorMap = resetErrorMap();
        const typedLocales: TypeSeaLocales = z.locales;
        const localeConfig = locales.ko();
        const typedCustomError: TypeSeaCustomError = (
            issue: TypeSeaConfigIssue
        ): ParseErrorResult => {
            expectTypeOf<typeof issue.input>().toEqualTypeOf<unknown>();
            expectTypeOf<typeof issue.received>().toEqualTypeOf<string | undefined>();
            return `${issue.code}:${String(issue.path.length)}`;
        };
        const typedConfig: TypeSeaConfig = {
            customError: typedCustomError
        };
        const previousConfig = config(typedConfig);
        const previousZodConfig = z.config(localeConfig);
        const clearedConfigMap = resetErrorMap();
        const parseOptions: ParseOptions = {
            error: parseMapper,
            reportInput: true
        };
        const jsonSchemaTarget: JsonSchemaTarget = "draft-2020-12";
        const draft04JsonSchemaTarget: JsonSchemaTarget = "draft-04";
        const openApiJsonSchemaTarget: JsonSchemaTarget = "openapi-3.0";
        const openUnrepresentable: JsonSchemaUnrepresentableMode =
            "ANY".toLowerCase() as JsonSchemaUnrepresentableMode;
        const jsonSchemaUri: JsonSchemaUriMapper = (id) => `https://schemas.example/${id}.json`;
        const jsonSchemaReused: JsonSchemaReusedMode = "ref";
        const jsonSchemaCycles: JsonSchemaCyclesMode = "ref";
        const jsonSchemaOverride: JsonSchemaOverride = (
            context: JsonSchemaOverrideContext
        ): void => {
            const mutable: JsonSchemaOverrideObject = context.jsonSchema;
            mutable["x-typesea-target"] = context.target;
            mutable["x-typesea-path"] = context.path.join(".");
            void context.schema;
        };
        const refineParams: RefineParams<PairValue> = refineOptions;
        const MatchingPair = t.object({
            left: t.string,
            right: t.string
        }).refine((value) => value.left === value.right, refineOptions);
        const LabelFreeName = t.string.refine((value) => value.length > 0);
        const FunctionalLabelFreeCount = t.refine(t.number, (value) => value > 0);
        const LabelFreeSuperName = t.string.superRefine((value, context) => {
            if (value.length === 0) {
                context.addIssue("required");
            }
        });
        const FunctionalLabelFreeSuperCount = t.superRefine(
            t.number,
            (value, context) => {
                if (value <= 0) {
                    context.addIssue({
                        message: "positive required"
                    });
                }
            }
        );

        type Shape = Infer<typeof Shape>;
        expectTypeOf<Shape>().toEqualTypeOf<{
            readonly id: Brand<string, "UserId">;
            readonly nickname?: string;
            readonly title: string | undefined;
            readonly maybeTitle?: string | undefined;
            readonly maybeNull?: string | null;
            readonly maybeRefined?: string;
            readonly maybeSuperRefined?: string;
            readonly tags: (number | undefined)[];
            readonly pair: readonly ["id", Brand<string, "UserId">];
        }>();
        expectTypeOf<Infer<typeof UnwrappedName>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof BuilderUnwrappedName>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof UnwrappedItem>>().toEqualTypeOf<number>();
        expectTypeOf<Infer<typeof ArrayElement>>().toEqualTypeOf<number>();
        expectTypeOf<Infer<typeof MaybeName>>().toEqualTypeOf<string | null>();
        expectTypeOf<Infer<typeof BuilderMaybeCount>>().toEqualTypeOf<number | null>();
        expectTypeOf<UnwrappedGuardValue<typeof ArrayItems>>().toEqualTypeOf<number>();
        expectTypeOf<typeof refineOptions>().toEqualTypeOf<RefineOptions<PairValue>>();
        expectTypeOf<typeof refineParams>().toEqualTypeOf<RefineOptions<PairValue>>();
        expectTypeOf<RefineWhenPayload<PairValue>["value"]>().toEqualTypeOf<PairValue>();
        expectTypeOf<typeof checkMessageOptions>().toEqualTypeOf<CheckMessageOptions>();
        expectTypeOf<typeof checkMessageInput>().toEqualTypeOf<CheckMessageOptions>();
        expectTypeOf<Infer<typeof MessageName>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof MessageEmail>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof MessageUuid>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof MessageCount>>().toEqualTypeOf<number>();
        expectTypeOf<Infer<typeof MessageBigInt>>().toEqualTypeOf<bigint>();
        expectTypeOf<Infer<typeof MessageDate>>().toEqualTypeOf<Date>();
        expectTypeOf<Infer<typeof ConstructorName>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof ConstructorCount>>().toEqualTypeOf<number>();
        expectTypeOf<Infer<typeof ConstructorFlag>>().toEqualTypeOf<boolean>();
        expectTypeOf<Infer<typeof MessageTags>>().toEqualTypeOf<string[]>();
        expectTypeOf<Infer<typeof MessageSet>>().toEqualTypeOf<ReadonlySet<string>>();
        expectTypeOf<Infer<typeof MessageFile>>().toEqualTypeOf<File>();
        expectTypeOf<typeof parseOptions>().toEqualTypeOf<ParseOptions>();
        expectTypeOf<typeof parseErrorResult>().toEqualTypeOf<ParseErrorResult>();
        expectTypeOf<typeof previousErrorMap>()
            .toEqualTypeOf<ParseErrorMapper | undefined>();
        expectTypeOf<typeof currentErrorMap>()
            .toEqualTypeOf<ParseErrorMapper | undefined>();
        expectTypeOf<typeof clearedErrorMap>()
            .toEqualTypeOf<ParseErrorMapper | undefined>();
        expectTypeOf<typeof typedLocales>().toEqualTypeOf<TypeSeaLocales>();
        expectTypeOf<typeof localeConfig>().toEqualTypeOf<TypeSeaConfig>();
        expectTypeOf<typeof typedConfig>().toEqualTypeOf<TypeSeaConfig>();
        expectTypeOf<typeof previousConfig>()
            .toEqualTypeOf<ParseErrorMapper | undefined>();
        expectTypeOf<typeof previousZodConfig>()
            .toEqualTypeOf<ParseErrorMapper | undefined>();
        expectTypeOf<typeof clearedConfigMap>()
            .toEqualTypeOf<ParseErrorMapper | undefined>();
        expectTypeOf<Infer<typeof LabelFreeName>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof FunctionalLabelFreeCount>>().toEqualTypeOf<number>();
        expectTypeOf<Infer<typeof LabelFreeSuperName>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof FunctionalLabelFreeSuperCount>>()
            .toEqualTypeOf<number>();
        expect(refineParams).toBe(refineOptions);
        expect(checkMessageInput).toBe(checkMessageOptions);
        expect(MessageName.check("").ok).toBe(false);
        expect(MessageEmail.check("not email").ok).toBe(false);
        expect(MessageUuid.check("not uuid").ok).toBe(false);
        expect(MessageCount.check(1.5).ok).toBe(false);
        expect(MessageBigInt.check(0n).ok).toBe(false);
        expect(MessageDate.check(new Date("2025-01-01T00:00:00.000Z")).ok)
            .toBe(false);
        expect(ConstructorName.check(1).ok).toBe(false);
        expect(ConstructorCount.check("1").ok).toBe(false);
        expect(ConstructorFlag.check("true").ok).toBe(false);
        expect(MessageTags.check([]).ok).toBe(false);
        expect(MessageSet.check(new Set<string>()).ok).toBe(false);
        expect(MessageFile.check(new File(["ok"], "ok.txt", { type: "text/html" })).ok)
            .toBe(false);
        expect(parseOptions.error).toBe(parseMapper);
        expect(parseErrorResult).toEqual({
            message: "expected_string"
        });
        expect(jsonSchemaTarget).toBe("draft-2020-12");
        expect(draft04JsonSchemaTarget).toBe("draft-04");
        expect(openApiJsonSchemaTarget).toBe("openapi-3.0");
        expect(jsonSchemaReused).toBe("ref");
        expect(jsonSchemaCycles).toBe("ref");
        expect(typeof jsonSchemaOverride).toBe("function");
        expect(openUnrepresentable).toBe("ANY".toLowerCase());
        expect(jsonSchemaUri("User")).toBe("https://schemas.example/User.json");
        expect(previousErrorMap).toBeUndefined();
        expect(currentErrorMap).toBe(parseMapper);
        expect(clearedErrorMap).toBe(parseMapper);
        expect(typedLocales.en().customError).toBeTypeOf("function");
        expect(previousConfig).toBeUndefined();
        expect(typeof previousZodConfig).toBe("function");
        expect(typeof clearedConfigMap).toBe("function");
        expect(UnwrappedName.is("Ada")).toBe(true);
        expect(BuilderUnwrappedName.is("Ada")).toBe(true);
        expect(UnwrappedItem.is(1)).toBe(true);
        expect(ArrayElement.is(1)).toBe(true);
        expect(ArrayElement.is(1.5)).toBe(false);
        expect(MaybeName.is(null)).toBe(true);
        expect(BuilderMaybeCount.is(undefined)).toBe(false);
        expect(MatchingPair.is({ left: "a", right: "b" })).toBe(false);
        expect(LabelFreeName.is("Ada")).toBe(true);
        expect(LabelFreeName.is("")).toBe(false);
        expect(FunctionalLabelFreeCount.is(1)).toBe(true);
        expect(FunctionalLabelFreeCount.is(0)).toBe(false);
        expect(LabelFreeSuperName.is("Ada")).toBe(true);
        expect(LabelFreeSuperName.is("")).toBe(false);
        expect(FunctionalLabelFreeSuperCount.is(1)).toBe(true);
        expect(FunctionalLabelFreeSuperCount.is(0)).toBe(false);
    });

    test("keeps guard helper types and compiled presence stable", async () => {
        const OptionalName = t.optional(t.string);
        const FluentNullishName = t.string.nullish();
        const DescribedName = t.string.describe("Display name");
        const ClonedName = DescribedName.clone();
        const OverwrittenName = DescribedName.overwrite((value) => value.trim());
        const OverwrittenResult = OverwrittenName.decode(" Ada ");
        const withCallback: WithCheckCallback<string> = (payload) => {
            if (payload.value.length === 0) {
                payload.issues.push({
                    code: "custom",
                    input: payload.value,
                    message: "required"
                });
            }
        };
        const withSource: WithCheckSource<string> = t.check(withCallback);
        const withInput: WithCheckInput<string> = withSource;
        const propertySource = t.property("length", t.number);
        const zNamespacePropertySource = z.property("length", z.number.min(1));
        const WithName = t.string.with(withCallback, withSource);
        const WithPropertyName = t.string.with(propertySource);
        const withPayload: WithCheckPayload<string> = {
            value: "Ada",
            issues: {
                length: 0,
                push: (...issues) => issues.length
            } satisfies WithCheckIssueSink
        };
        const JsonSchemaResult = DescribedName.toJSONSchema();
        const FunctionJsonSchemaResult = toJsonSchema(DescribedName);
        const FunctionJsonSchemaAliasResult = toJSONSchema(DescribedName);
        const Description = DescribedName.description;
        const cache: CompileCache = createCompileCache();
        const FastOptionalName = compile(OptionalName, {
            name: "optionalName",
            debugSource: true
        });
        const BooleanOptionalName = compileBoolean(OptionalName, {
            name: "booleanOptionalName"
        });
        const AsyncOptionalName = compileAsync(OptionalName, {
            name: "asyncOptionalName",
            yieldEvery: 16,
            yieldTimeout: 0
        });
        const CachedOptionalName = cache.compile("optional-name", () => OptionalName, {
            name: "optionalName",
            debugSource: true
        });
        const WarmedOptionalName = warmup([OptionalName], {
            cache,
            namePrefix: "warmType"
        });
        const result = FastOptionalName.check("Ada");
        const firstResult = FastOptionalName.checkFirst("Ada");
        const parseResult = FastOptionalName.parse("Ada");
        const safeParseResult = FastOptionalName.safeParse("Ada");
        const parseAsyncResult = FastOptionalName.parseAsync("Ada");
        const safeParseAsyncResult = FastOptionalName.safeParseAsync("Ada");
        const spaResult = FastOptionalName.spa("Ada");
        const optionalProbe = FastOptionalName.isOptional();
        const nullableProbe = FastOptionalName.isNullable();
        const plugin = createTypeSeaRollupPlugin({
            entries: [
                {
                    id: "optional-name",
                    guard: OptionalName,
                    options: { name: "optionalName" }
                }
            ],
            transformCompileCached: true
        });

        expectTypeOf<GuardValue<typeof OptionalName>>().toEqualTypeOf<string>();
        expectTypeOf<GuardPresence<typeof OptionalName>>().toEqualTypeOf<"optional">();
        expectTypeOf<Infer<typeof OptionalName>>().toEqualTypeOf<string | undefined>();
        expectTypeOf<GuardValue<typeof FluentNullishName>>()
            .toEqualTypeOf<string | null>();
        expectTypeOf<GuardPresence<typeof FluentNullishName>>()
            .toEqualTypeOf<"optional">();
        expectTypeOf<Infer<typeof FluentNullishName>>()
            .toEqualTypeOf<string | null | undefined>();
        expectTypeOf<typeof JsonSchemaResult>()
            .toEqualTypeOf<typeof FunctionJsonSchemaResult>();
        expectTypeOf<typeof Description>().toEqualTypeOf<string | undefined>();
        expectTypeOf<typeof ClonedName>().toEqualTypeOf<typeof DescribedName>();
        expectTypeOf<InferDecoder<typeof OverwrittenName>>().toEqualTypeOf<string>();
        expectTypeOf<typeof OverwrittenResult>().toEqualTypeOf<CheckResult<string>>();
        expectTypeOf<Infer<typeof WithName>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof WithPropertyName>>().toEqualTypeOf<string>();
        expectTypeOf<typeof withSource>().toEqualTypeOf<WithCheckSource<string>>();
        expectTypeOf<typeof propertySource>().toEqualTypeOf<WithCheckSource>();
        expectTypeOf<typeof zNamespacePropertySource>()
            .toEqualTypeOf<WithCheckSource>();
        expectTypeOf<typeof withPayload.value>().toEqualTypeOf<string>();
        expect(WithPropertyName.is("Ada")).toBe(true);
        expect(t.string.with(zNamespacePropertySource).is("Ada")).toBe(true);
        expectTypeOf<Infer<typeof FastOptionalName>>().toEqualTypeOf<string | undefined>();
        expectTypeOf<typeof CachedOptionalName>().toEqualTypeOf<typeof FastOptionalName>();
        expectTypeOf<typeof BooleanOptionalName>()
            .toExtend<CompiledBooleanGuard<string, "optional">>();
        expectTypeOf<typeof AsyncOptionalName>()
            .toExtend<AsyncCompiledGuard<string, "optional">>();
        expectTypeOf<CompileAsyncOptions["yieldEvery"]>()
            .toEqualTypeOf<number | undefined>();
        expectTypeOf<AsyncValidationOptions["yieldTimeout"]>()
            .toEqualTypeOf<number | undefined>();
        expectTypeOf<CompileSourceMode>().toEqualTypeOf<"compact" | "debug">();
        expectTypeOf<TypeSeaEsbuildLoader>()
            .toEqualTypeOf<"js" | "jsx" | "ts" | "tsx">();
        expectTypeOf<TypeSeaPluginReadFile>()
            .toEqualTypeOf<(path: string) => unknown>();
        expectTypeOf<typeof result>().toEqualTypeOf<CheckResult<string | undefined>>();
        expectTypeOf<typeof firstResult>().toEqualTypeOf<CheckResult<string | undefined>>();
        expectTypeOf<typeof parseResult>().toEqualTypeOf<string | undefined>();
        expectTypeOf<typeof safeParseResult>()
            .toEqualTypeOf<SafeParseResult<string | undefined>>();
        expectTypeOf<typeof parseAsyncResult>()
            .toEqualTypeOf<Promise<string | undefined>>();
        expectTypeOf<typeof safeParseAsyncResult>()
            .toEqualTypeOf<Promise<SafeParseResult<string | undefined>>>();
        expectTypeOf<typeof spaResult>()
            .toEqualTypeOf<Promise<SafeParseResult<string | undefined>>>();
        expectTypeOf<typeof optionalProbe>().toEqualTypeOf<boolean>();
        expectTypeOf<typeof nullableProbe>().toEqualTypeOf<boolean>();
        expectTypeOf<RuntimeValue<string, "optional">>().toEqualTypeOf<
            string | undefined
        >();
        expectTypeOf<RuntimeValue<string, "required">>().toEqualTypeOf<string>();
        expect(WarmedOptionalName[0]?.is("Ada")).toBe(true);
        expect(CachedOptionalName.is("Ada")).toBe(true);
        expect(BooleanOptionalName.is("Ada")).toBe(true);
        expect(AsyncOptionalName.sync.is("Ada")).toBe(true);
        expect(plugin.resolveId("typesea:aot/optional-name")).toBe(
            "\0typesea:aot/optional-name"
        );
        expect(result.ok).toBe(true);
        expect(firstResult.ok).toBe(true);
        expect(parseResult).toBe("Ada");
        expect(safeParseResult.success).toBe(true);
        await expect(parseAsyncResult).resolves.toBe("Ada");
        await expect(safeParseAsyncResult).resolves.toMatchObject({
            success: true
        });
        await expect(spaResult).resolves.toMatchObject({
            success: true
        });
        expect(optionalProbe).toBe(true);
        expect(nullableProbe).toBe(false);
        expect(FluentNullishName.is(null)).toBe(true);
        expect(FluentNullishName.is(undefined)).toBe(true);
        expect(JsonSchemaResult.ok).toBe(true);
        expect(FunctionJsonSchemaResult.ok).toBe(true);
        expect(FunctionJsonSchemaAliasResult).toEqual(FunctionJsonSchemaResult);
        expect(Description).toBe("Display name");
        expect(ClonedName.is("Ada")).toBe(true);
        expect(WithName.is("Ada")).toBe(true);
        expect(withInput).toBe(withSource);
        expect(withPayload.issues.push()).toBe(0);
        expect(OverwrittenResult).toEqual({
            ok: true,
            value: "Ada"
        });
    });

    test("exposes compile mode types", () => {
        const FastUnsafeString = compile(t.string, {
            name: "unsafeTypeContract",
            mode: "unsafe"
        });

        expectTypeOf<CompileMode>().toEqualTypeOf<"safe" | "unsafe" | "unchecked">();
        expectTypeOf<CompileOptions["mode"]>()
            .toEqualTypeOf<CompileMode | undefined>();
        expect(FastUnsafeString.is("ok")).toBe(true);
    });

    test("preserves union and discriminated union inference", () => {
        const Mixed = t.string.or(t.number.int()).or(t.boolean);
        const BuiltUnion = t.union(t.string, t.number);
        const Exclusive = t.xor(t.string, t.number);
        const Template = t.templateLiteral(["id_", t.number]);
        const CssSize = t.templateLiteral([t.number, t.enum(["px", "em", "rem"])]);
        const HighFive = t.templateLiteral(["high", t.literal(5)]);
        const NullableGrass = t.templateLiteral([t.nullable(t.literal("grassy"))]);
        const Upload = t.file().max(1024).mime("text/plain");
        const templateParts: readonly TemplateLiteralPart[] = ["id_", t.number];
        const DynamicTemplate = t.templateLiteral(templateParts);
        const Event = t.discriminatedUnion("kind", {
            user: t.object({
                kind: t.literal("user"),
                id: t.string
            }),
            order: t.object({
                kind: t.literal("order"),
                total: t.number
            })
        });

        expectTypeOf<Infer<typeof Mixed>>().toEqualTypeOf<string | number | boolean>();
        expectTypeOf<typeof BuiltUnion.options>().toEqualTypeOf<readonly [
            typeof t.string,
            typeof t.number
        ]>();
        expectTypeOf<Infer<typeof Exclusive>>().toEqualTypeOf<string | number>();
        expectTypeOf<typeof BuiltUnion>().toExtend<UnionGuard<
            readonly [Guard<unknown, Presence>, ...Guard<unknown, Presence>[]]
        >>();
        expectTypeOf<typeof Exclusive>().toExtend<XorGuard<
            readonly [Guard<unknown, Presence>, ...Guard<unknown, Presence>[]]
        >>();
        expectTypeOf<Infer<typeof Template>>().toEqualTypeOf<`id_${number}`>();
        expectTypeOf<Infer<typeof CssSize>>().toEqualTypeOf<
            `${number}px` | `${number}em` | `${number}rem`
        >();
        expectTypeOf<Infer<typeof HighFive>>().toEqualTypeOf<"high5">();
        expectTypeOf<Infer<typeof NullableGrass>>()
            .toEqualTypeOf<"grassy" | "null">();
        expectTypeOf<typeof Upload>().toExtend<FileGuard>();
        expectTypeOf<Infer<typeof Upload>>().toEqualTypeOf<File>();
        expectTypeOf<Infer<typeof DynamicTemplate>>().toEqualTypeOf<string>();
        expectTypeOf<typeof templateParts>()
            .toEqualTypeOf<readonly TemplateLiteralPart[]>();
        expectTypeOf<Infer<typeof Event>>().toEqualTypeOf<
            | {
                    readonly kind: "user";
                    readonly id: string;
                }
            | {
                    readonly kind: "order";
                    readonly total: number;
                }
        >();
        expect(Mixed.is(true)).toBe(true);
        expect(BuiltUnion.options[0].is("value")).toBe(true);
        expect(Exclusive.is("value")).toBe(true);
        expect(Template.is("id_1")).toBe(true);
        expect(CssSize.is("1px")).toBe(true);
        expect(HighFive.is("high5")).toBe(true);
        expect(NullableGrass.is("null")).toBe(true);
        expect(DynamicTemplate.is("id_1")).toBe(true);
        expect(Upload.is(new File(["ok"], "ok.txt", { type: "text/plain" }))).toBe(true);
        expect(templateParts.length).toBe(2);
        expect(Event.is({ kind: "order", total: 1 })).toBe(true);
    });

    test("preserves Zod-style scalar convenience types", () => {
        const Guid = t.guid();
        const UuidV4 = t.uuidv4();
        const UuidWithVersion = t.uuid({ version: "v7" });
        const EmailWithPattern = t.email({
            pattern: /^[^@]+@example\.com$/u
        });
        const UrlWithParts = t.url({
            protocol: /^https?$/u,
            hostname: /^example\.com$/u
        });
        const NormalizedUrl = t.url({
            normalize: true
        });
        const NormalizedMethodUrl = t.string.url({
            normalize: true
        });
        const LiteralState = t.literal(["draft", "published"]);
        const Fish = t.enum(["Salmon", "Tuna", "Trout"]);
        const TunaOnly = Fish.extract(["Tuna"]);
        const WithoutTuna = Fish.exclude(["Tuna"]);
        const NumericStatus = t.enum({
            Ok: 200,
            NotFound: 404
        } as const);
        const Xid = t.xid();
        const Ksuid = t.ksuid();
        const Hash = t.hash("sha256", { enc: "hex" });
        const MethodHash = t.string.hash("sha1", { enc: "base64" });
        const JwtWithAlg = t.jwt({ alg: "HS256" });
        const MacWithOptions = t.mac({ delimiter: "-" });
        const CustomFormat = t.stringFormat("token", (value) => value.length > 0);
        const CustomParams = t.custom<URLSearchParams>(
            (value): value is URLSearchParams => value instanceof URLSearchParams,
            "url_search_params"
        );
        const CustomOpaque = t.custom<{ readonly id: string }>();
        const CustomWithOptions = t.custom<number>(
            (value): value is number => typeof value === "number",
            {
                error: "number expected",
                path: ["value"],
                abort: true
            }
        );
        const CustomWithUndefinedPredicate = t.custom<number>(undefined, {
            error: "number-ish"
        });
        const FastCustomParams = compile(CustomParams, {
            name: "urlSearchParams"
        });
        const Normalized = t.string.normalize("NFKC");
        const Slugified = t.string.slugify();
        const Nan = t.nan();
        const SafeInt = t.int();
        const Int32 = t.int32();
        const UInt32 = t.uint32();
        const Float32 = t.float32();
        const Float64 = t.float64();
        const Int64 = t.int64();
        const UInt64 = t.uint64();
        const IsoDate = t.iso.date();
        const IsoDateTime = t.iso.datetime();
        const OffsetDateTime = t.iso.datetime({ offset: true });
        const LocalDateTime = t.iso.datetime({ local: true, precision: -1 });
        const IsoTime = t.iso.time();
        const PreciseTime = t.iso.time({ precision: 3 });
        const IsoDuration = t.iso.duration();
        const MethodIsoDate = t.string.date();
        const MethodIsoDateTime = t.string.datetime();
        const MethodIsoTime = t.string.time();
        const MethodIsoDuration = t.string.duration();
        const BoundedName = t.string.min(2).max(5);
        const BigCount = t.bigint.gte(1n).multipleOf(2n);
        const ReadonlyTags = t.array(t.string).readonly();
        const ReadonlyTagsFromTable = t.readonly(t.array(t.string));
        const algorithm: StringHashAlgorithm = "sha512";
        const encoding: StringHashEncoding = "base64url";
        const hashOptions: StringHashOptions = {
            enc: encoding
        };
        const uuidOptions: StringUuidOptions = {
            version: "v7"
        };
        const emailOptions: StringEmailOptions = {
            pattern: /^[^@]+@example\.com$/u
        };
        const urlOptions: StringUrlOptions = {
            protocol: /^https?$/u,
            hostname: /^example\.com$/u,
            normalize: undefined
        };
        const isoDateTimeOptions: StringIsoDateTimeOptions = {
            offset: true,
            local: false,
            precision: 3
        };
        const isoTimeOptions: StringIsoTimeOptions = {
            precision: 3
        };
        const jwtOptions: StringJwtOptions = {
            alg: "HS256"
        };
        const macOptions: StringMacOptions = {
            delimiter: "-"
        };
        const macDelimiter: StringMacDelimiter = "-";
        const normalizationForm: StringNormalizationForm = "NFC";

        expectTypeOf<Infer<typeof Guid>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof UuidV4>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof UuidWithVersion>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof EmailWithPattern>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof UrlWithParts>>().toEqualTypeOf<string>();
        expectTypeOf<InferDecoder<typeof NormalizedUrl>>().toEqualTypeOf<string>();
        expectTypeOf<InferDecoder<typeof NormalizedMethodUrl>>().toEqualTypeOf<string>();
        expectTypeOf<Output<typeof NormalizedUrl>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof LiteralState>>()
            .toEqualTypeOf<"draft" | "published">();
        expectTypeOf<typeof LiteralState>()
            .toExtend<LiteralGuard<"draft" | "published">>();
        expectTypeOf<typeof Fish>()
            .toExtend<EnumGuard<"Salmon" | "Tuna" | "Trout">>();
        expectTypeOf<typeof TunaOnly>().toExtend<EnumGuard<"Tuna">>();
        expectTypeOf<typeof WithoutTuna>().toExtend<EnumGuard<"Salmon" | "Trout">>();
        expectTypeOf<Infer<typeof NumericStatus>>().toEqualTypeOf<200 | 404>();
        expectTypeOf<Infer<typeof Xid>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof Ksuid>>().toEqualTypeOf<string>();
        expect(Xid.is("9m4e2mr0ui3e8a215n4g")).toBe(true);
        expect(Ksuid.is("0ujtsYcgvSTl8PAuAdqWYSMnLOv")).toBe(true);
        expectTypeOf<Infer<typeof Hash>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof MethodHash>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof JwtWithAlg>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof MacWithOptions>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof CustomFormat>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof CustomParams>>().toEqualTypeOf<URLSearchParams>();
        expectTypeOf<Infer<typeof CustomOpaque>>()
            .toEqualTypeOf<{ readonly id: string }>();
        expectTypeOf<Infer<typeof CustomWithOptions>>().toEqualTypeOf<number>();
        expectTypeOf<Infer<typeof CustomWithUndefinedPredicate>>()
            .toEqualTypeOf<number>();
        expectTypeOf<InferDecoder<typeof Normalized>>().toEqualTypeOf<string>();
        expectTypeOf<InferDecoder<typeof Slugified>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof Nan>>().toEqualTypeOf<number>();
        expectTypeOf<Infer<typeof SafeInt>>().toEqualTypeOf<number>();
        expectTypeOf<Infer<typeof Int32>>().toEqualTypeOf<number>();
        expectTypeOf<Infer<typeof UInt32>>().toEqualTypeOf<number>();
        expectTypeOf<Infer<typeof Float32>>().toEqualTypeOf<number>();
        expectTypeOf<Infer<typeof Float64>>().toEqualTypeOf<number>();
        expectTypeOf<Infer<typeof Int64>>().toEqualTypeOf<bigint>();
        expectTypeOf<Infer<typeof UInt64>>().toEqualTypeOf<bigint>();
        expect(UInt32.is(1)).toBe(true);
        expect(Float32.is(1)).toBe(true);
        expect(Float64.is(1)).toBe(true);
        expect(Int64.is(1n)).toBe(true);
        expect(UInt64.is(1n)).toBe(true);
        expectTypeOf<typeof t.iso>().toEqualTypeOf<IsoNamespace>();
        expectTypeOf<Infer<typeof IsoDate>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof IsoDateTime>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof OffsetDateTime>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof LocalDateTime>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof IsoTime>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof PreciseTime>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof IsoDuration>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof MethodIsoDate>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof MethodIsoDateTime>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof MethodIsoTime>>().toEqualTypeOf<string>();
        expectTypeOf<Infer<typeof MethodIsoDuration>>().toEqualTypeOf<string>();
        expectTypeOf<typeof t.string.type>().toEqualTypeOf<"string">();
        expectTypeOf<typeof t.string.format>().toEqualTypeOf<string | null>();
        expectTypeOf<typeof Guid.format>().toEqualTypeOf<string | null>();
        expectTypeOf<typeof t.number.type>().toEqualTypeOf<"number">();
        expectTypeOf<typeof t.number.format>().toEqualTypeOf<string | null>();
        expectTypeOf<typeof SafeInt.format>().toEqualTypeOf<string | null>();
        expectTypeOf<typeof BoundedName.minLength>().toEqualTypeOf<number | null>();
        expectTypeOf<typeof BoundedName.maxLength>().toEqualTypeOf<number | null>();
        expectTypeOf<typeof SafeInt.minValue>().toEqualTypeOf<number>();
        expectTypeOf<typeof SafeInt.maxValue>().toEqualTypeOf<number>();
        expectTypeOf<typeof SafeInt.isInt>().toEqualTypeOf<boolean>();
        expectTypeOf<typeof SafeInt.isFinite>().toEqualTypeOf<boolean>();
        expectTypeOf<Infer<typeof BigCount>>().toEqualTypeOf<bigint>();
        expectTypeOf<typeof BigCount>().toExtend<BigIntGuard>();
        expectTypeOf<Infer<typeof ReadonlyTags>>().toEqualTypeOf<readonly string[]>();
        expectTypeOf<Infer<typeof ReadonlyTagsFromTable>>()
            .toEqualTypeOf<readonly string[]>();
        expectTypeOf<ReadonlyValue<string[]>>().toEqualTypeOf<readonly string[]>();
        expectTypeOf<ReadonlyValue<string>>().toEqualTypeOf<string>();
        expectTypeOf<StringHashAlgorithm>()
            .toEqualTypeOf<"md5" | "sha1" | "sha256" | "sha384" | "sha512">();
        expectTypeOf<StringHashEncoding>()
            .toEqualTypeOf<"hex" | "base64" | "base64url">();
        expectTypeOf<typeof hashOptions>().toEqualTypeOf<StringHashOptions>();
        expectTypeOf<typeof uuidOptions>().toEqualTypeOf<StringUuidOptions>();
        expectTypeOf<StringUuidVersion>()
            .toEqualTypeOf<"v1" | "v2" | "v3" | "v4" | "v5" | "v6" | "v7" | "v8">();
        expectTypeOf<typeof emailOptions>().toEqualTypeOf<StringEmailOptions>();
        expectTypeOf<typeof urlOptions>().toEqualTypeOf<StringUrlOptions>();
        expectTypeOf<typeof isoDateTimeOptions>()
            .toEqualTypeOf<StringIsoDateTimeOptions>();
        expectTypeOf<typeof isoTimeOptions>().toEqualTypeOf<StringIsoTimeOptions>();
        expectTypeOf<typeof jwtOptions>().toEqualTypeOf<StringJwtOptions>();
        expectTypeOf<typeof macOptions>().toEqualTypeOf<StringMacOptions>();
        expectTypeOf<StringMacDelimiter>().toEqualTypeOf<":" | "-">();
        expectTypeOf<StringNormalizationForm>()
            .toEqualTypeOf<"NFC" | "NFD" | "NFKC" | "NFKD">();
        expectTypeOf<EnumLiteralValue>().toEqualTypeOf<string | number>();
        expectTypeOf<EnumLikeInput>().toEqualTypeOf<
            Readonly<Record<string, string | number>>
        >();
        expectTypeOf<EnumLikeValue<{ readonly Ok: 200; readonly NotFound: 404 }>>()
            .toEqualTypeOf<200 | 404>();
        expectTypeOf<LiteralValues>().toEqualTypeOf<
            readonly [LiteralValue, ...LiteralValue[]]
        >();

        expect(CustomOpaque.is({ id: "u_1" })).toBe(true);
        expect(CustomWithOptions.is(1)).toBe(true);
        expect(CustomWithUndefinedPredicate.is("external")).toBe(true);
        expect(Guid.is("01890f5c-7f6b-7cc2-18c4-dc0c0c07398f")).toBe(true);
        expect(uuidOptions.version).toBe("v7");
        expect(emailOptions.pattern?.test("ada@example.com")).toBe(true);
        expect(urlOptions.protocol?.test("https")).toBe(true);
        expect(isoDateTimeOptions.precision).toBe(3);
        expect(isoTimeOptions.precision).toBe(3);
        expect(jwtOptions.alg).toBe("HS256");
        expect(macOptions.delimiter).toBe(macDelimiter);
        expect(UuidV4.is("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
        expect(UuidWithVersion.is("01890f5c-7f6b-7cc2-98c4-dc0c0c07398f"))
            .toBe(true);
        expect(EmailWithPattern.is("ada@example.com")).toBe(true);
        expect(EmailWithPattern.is("ada@other.test")).toBe(false);
        expect(UrlWithParts.is("https://example.com/path")).toBe(true);
        expect(UrlWithParts.is("https://other.test/path")).toBe(false);
        expect(NormalizedUrl.decode("HTTP://ExAmPle.com:80/./a/../b?X=1#f oo"))
            .toEqual({
                ok: true,
                value: "http://example.com/b?X=1#f%20oo"
            });
        expect(NormalizedMethodUrl.decode("https://example.com/./a/../b")).toEqual({
            ok: true,
            value: "https://example.com/b"
        });
        expect(LiteralState.values.has("draft")).toBe(true);
        expect(Fish.options.length).toBe(3);
        expect(TunaOnly.is("Tuna")).toBe(true);
        expect(WithoutTuna.is("Tuna")).toBe(false);
        expect(NumericStatus.is(200)).toBe(true);
        expect(Hash.is("a".repeat(64))).toBe(true);
        expect(MethodHash.is("q".repeat(27) + "=")).toBe(true);
        expect(t.hash(algorithm, hashOptions).is("a".repeat(86))).toBe(true);
        expect(JwtWithAlg.is("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.sig"))
            .toBe(true);
        expect(JwtWithAlg.is("eyJhbGciOiJub25lIn0.e30.sig")).toBe(false);
        expect(MacWithOptions.is("00-1A-2B-3C-4D-5E")).toBe(true);
        expect(CustomFormat.is("token")).toBe(true);
        expect(CustomParams.is(new URLSearchParams("a=1"))).toBe(true);
        expect(FastCustomParams.is(new URLSearchParams("a=1"))).toBe(true);
        expect(CustomParams.is("a=1")).toBe(false);
        expect(Normalized.decode("\uFF21").ok).toBe(true);
        expect(Slugified.decode("Hello Sea").ok).toBe(true);
        expect(t.string.normalize(normalizationForm).decode("A").ok).toBe(true);
        expect(Nan.is(Number.NaN)).toBe(true);
        expect(SafeInt.is(1)).toBe(true);
        expect(Int32.is(1)).toBe(true);
        expect(IsoDate.is("2026-07-06")).toBe(true);
        expect(IsoDateTime.is("2026-07-06T03:15:00Z")).toBe(true);
        expect(IsoDateTime.is("2026-07-06T03:15:00+02:00")).toBe(false);
        expect(OffsetDateTime.is("2026-07-06T03:15:00+02:00")).toBe(true);
        expect(LocalDateTime.is("2026-07-06T03:15")).toBe(true);
        expect(IsoTime.is("03:15:00.999")).toBe(true);
        expect(PreciseTime.is("03:15:00.999")).toBe(true);
        expect(PreciseTime.is("03:15:00.99")).toBe(false);
        expect(IsoDuration.is("P3Y6M4DT12H30M5S")).toBe(true);
        expect(MethodIsoDate.is("2026-07-06")).toBe(true);
        expect(MethodIsoDateTime.is("2026-07-06T03:15:00Z")).toBe(true);
        expect(MethodIsoTime.is("03:15:00.999")).toBe(true);
        expect(MethodIsoDuration.is("P3Y6M4DT12H30M5S")).toBe(true);
        expect(BoundedName.minLength).toBe(2);
        expect(BoundedName.maxLength).toBe(5);
        expect(SafeInt.isInt).toBe(true);
        expect(SafeInt.isFinite).toBe(true);
        expect(SafeInt.minValue).toBe(Number.MIN_SAFE_INTEGER);
        expect(SafeInt.maxValue).toBe(Number.MAX_SAFE_INTEGER);
        expect(BigCount.is(2n)).toBe(true);
        expect(ReadonlyTags.is(["a"])).toBe(true);
        expect(ReadonlyTagsFromTable.is(["a"])).toBe(true);
    });

    test("preserves object combinator and intersection inference", () => {
        const Base = t.strictObject({
            id: t.string,
            count: t.number,
            label: t.optional(t.string)
        });
        const Loose = t.looseObject({
            id: t.string
        });
        const Extended = Base.extend({
            count: t.number.int().gte(0),
            active: t.boolean
        });
        const Picked = Extended.pick(["id", "active"]);
        const MaskPicked = Extended.pick({
            id: true,
            active: true
        });
        const Omitted = Extended.omit(["label"]);
        const MaskOmitted = Extended.omit({
            label: true
        });
        const ExtendedKey = Extended.keyof();
        const ExtendedKeyFromTable = t.keyof(Extended);
        const DeepPartial = Extended.deepPartial();
        const Partial = t.partial(Extended);
        const LooseMode = Extended.loose();
        const NonstrictMode = Extended.nonstrict();
        const StrictMode = LooseMode.nonpassthrough();
        const StripMode = StrictMode.strip();
        const LooseModeFromTable = t.loose(Extended);
        const NonstrictModeFromTable = t.nonstrict(Extended);
        const StrictModeFromTable = t.nonpassthrough(LooseMode);
        const StripModeFromTable = t.strip(StrictMode);
        const MaskPartial = Extended.partial({
            active: true
        });
        const MaskRequired = t.required(
            t.object({
                id: t.string,
                label: t.optional(t.string)
            }),
            {
                label: true
            }
        );
        const Intersected = t.intersect(
            t.object({
                id: t.string
            }),
            t.object({
                active: t.boolean
            })
        );

        expectTypeOf<Infer<typeof Extended>>().toEqualTypeOf<{
            readonly id: string;
            readonly count: number;
            readonly label?: string;
            readonly active: boolean;
        }>();
        expectTypeOf<typeof Extended.shape.id>().toEqualTypeOf<typeof t.string>();
        expectTypeOf<Infer<typeof Extended.shape.count>>().toEqualTypeOf<number>();
        expectTypeOf<GuardPresence<typeof Extended.shape.label>>()
            .toEqualTypeOf<"optional">();
        expectTypeOf<typeof Extended.shape.active>().toEqualTypeOf<typeof t.boolean>();
        expectTypeOf<Infer<typeof Picked>>().toEqualTypeOf<{
            readonly id: string;
            readonly active: boolean;
        }>();
        expectTypeOf<Infer<typeof MaskPicked>>().toEqualTypeOf<{
            readonly id: string;
            readonly active: boolean;
        }>();
        expectTypeOf<Infer<typeof Omitted>>().toEqualTypeOf<{
            readonly id: string;
            readonly count: number;
            readonly active: boolean;
        }>();
        expectTypeOf<Infer<typeof MaskOmitted>>().toEqualTypeOf<{
            readonly id: string;
            readonly count: number;
            readonly active: boolean;
        }>();
        expectTypeOf<Infer<typeof ExtendedKey>>()
            .toEqualTypeOf<"id" | "count" | "label" | "active">();
        expectTypeOf<Infer<typeof ExtendedKeyFromTable>>()
            .toEqualTypeOf<"id" | "count" | "label" | "active">();
        expectTypeOf<Infer<typeof Partial>>().toEqualTypeOf<{
            readonly id?: string;
            readonly count?: number;
            readonly label?: string;
            readonly active?: boolean;
        }>();
        expectTypeOf<Infer<typeof MaskPartial>>().toEqualTypeOf<{
            readonly id: string;
            readonly count: number;
            readonly label?: string;
            readonly active?: boolean;
        }>();
        expectTypeOf<Infer<typeof MaskRequired>>().toEqualTypeOf<{
            readonly id: string;
            readonly label: string;
        }>();
        expectTypeOf<Infer<typeof DeepPartial>>().toEqualTypeOf<{
            readonly id?: string;
            readonly count?: number;
            readonly label?: string;
            readonly active?: boolean;
        }>();
        expectTypeOf<Infer<typeof Intersected>>().toEqualTypeOf<
            {
                readonly id: string;
            } & {
                readonly active: boolean;
            }
        >();
        expectTypeOf<Infer<typeof Loose>>().toEqualTypeOf<{
            readonly id: string;
        }>();
        expectTypeOf<Infer<typeof LooseMode>>().toEqualTypeOf<Infer<typeof Extended>>();
        expectTypeOf<Infer<typeof NonstrictMode>>().toEqualTypeOf<Infer<typeof Extended>>();
        expectTypeOf<Infer<typeof StrictMode>>().toEqualTypeOf<Infer<typeof Extended>>();
        expectTypeOf<Infer<typeof StripMode>>().toEqualTypeOf<Infer<typeof Extended>>();
        expectTypeOf<Infer<typeof LooseModeFromTable>>().toEqualTypeOf<Infer<typeof Extended>>();
        expectTypeOf<Infer<typeof NonstrictModeFromTable>>()
            .toEqualTypeOf<Infer<typeof Extended>>();
        expectTypeOf<Infer<typeof StrictModeFromTable>>().toEqualTypeOf<Infer<typeof Extended>>();
        expectTypeOf<Infer<typeof StripModeFromTable>>().toEqualTypeOf<Infer<typeof Extended>>();

        expect(Picked.is({ id: "u", active: true })).toBe(true);
        expect(MaskPicked.is({ id: "u", active: true })).toBe(true);
        expect(Omitted.is({ id: "u", count: 1, active: true })).toBe(true);
        expect(MaskOmitted.is({ id: "u", count: 1, active: true })).toBe(true);
        expect(ExtendedKey.is("label")).toBe(true);
        expect(ExtendedKeyFromTable.is("missing")).toBe(false);
        expect(Partial.is({})).toBe(true);
        expect(MaskPartial.is({ id: "u", count: 1 })).toBe(true);
        expect(MaskRequired.is({ id: "u" })).toBe(false);
        expect(DeepPartial.is({})).toBe(true);
        expect(Intersected.is({ id: "u", active: true })).toBe(true);
        expect(Loose.is({ id: "u", extra: true })).toBe(true);
        expect(LooseMode.is({ id: "u", count: 1, active: true, extra: true })).toBe(true);
        expect(NonstrictMode.is({ id: "u", count: 1, active: true, extra: true })).toBe(true);
        expect(StrictMode.is({ id: "u", count: 1, active: true, extra: true })).toBe(false);
        expect(StripMode.is({ id: "u", count: 1, active: true, extra: true })).toBe(true);
        expect(LooseModeFromTable.is({ id: "u", count: 1, active: true, extra: true }))
            .toBe(true);
        expect(NonstrictModeFromTable.is({ id: "u", count: 1, active: true, extra: true }))
            .toBe(true);
        expect(StrictModeFromTable.is({ id: "u", count: 1, active: true, extra: true }))
            .toBe(false);
        expect(StripModeFromTable.is({ id: "u", count: 1, active: true, extra: true }))
            .toBe(true);
    });

    test("preserves metadata, keyed-object, and analyzer public types", () => {
        const ContactBase = t.object({
            email: t.optional(t.string),
            phone: t.optional(t.string)
        });
        const Contact = ContactBase
            .oneOfKeys(["email", "phone"])
            .metadata({ id: "Contact", title: "Contact" })
            .describe("Reachable contact endpoint")
            .example({ email: "ada@example.com" })
            .message("contact is invalid");
        const FunctionalContact = metadata(
            oneOfKeys(ContactBase, ["email", "phone"]),
            { description: "Functional contact" }
        );
        const MetaContact = meta(ContactBase, {
            title: "Meta contact"
        });
        const MethodMetaContact = ContactBase.meta({
            title: "Method meta contact"
        });
        const AtLeast = atLeastOneKey(ContactBase, ["email", "phone"]);
        const Exactly = exactlyOneKey(ContactBase, ["email", "phone"]);
        const report = analyzeSchema(Contact);

        expectTypeOf<Infer<typeof Contact>>().toEqualTypeOf<{
            readonly email?: string;
            readonly phone?: string;
        }>();
        expectTypeOf<Infer<typeof FunctionalContact>>().toEqualTypeOf<
            Infer<typeof Contact>
        >();
        expectTypeOf<Infer<typeof MetaContact>>().toEqualTypeOf<Infer<typeof ContactBase>>();
        expectTypeOf<Infer<typeof MethodMetaContact>>()
            .toEqualTypeOf<Infer<typeof ContactBase>>();
        expectTypeOf<typeof report>().toEqualTypeOf<SchemaAnalysisReport>();
        expect(Contact.is({ email: "ada@example.com" })).toBe(true);
        expect(FunctionalContact.is({ phone: "555-0100" })).toBe(true);
        expect(MetaContact.is({})).toBe(true);
        expect(MethodMetaContact.is({})).toBe(true);
        expect(t.meta(ContactBase, { description: "table alias" }).is({})).toBe(true);
        expect(AtLeast.is({ email: "ada@example.com" })).toBe(true);
        expect(Exactly.is({ email: "ada@example.com", phone: "555-0100" }))
            .toBe(false);
        expect(report.issues.length).toBeGreaterThanOrEqual(1);
    });

    test("preserves tuple rest and runtime object inference", () => {
        class Box {
            public readonly id: string = "box";
        }

        const Row = t.tuple([t.literal("row")], t.number);
        const FluentRow = t.tuple([t.literal("row")]).rest(t.number);
        const ReplacedRestRow = FluentRow.rest(t.string);
        const Scores = t.map(t.string, t.number).min(1).max(3).size(1).nonempty();
        const ScoreRecord = t.record(
            t.union(t.literal("score_math"), t.literal("score_eng")),
            t.number
        );
        const NumericScoreRecord = t.record(
            t.number.int().gte(0),
            t.string
        );
        const PartialScoreRecord = t.partialRecord(
            t.union(t.literal("score_math"), t.literal("score_eng")),
            t.number
        );
        const LoosePhoneRecord = t.looseRecord(
            t.enum(["home_phone", "work_phone"]),
            t.e164()
        );
        const FastLoosePhoneRecord = compile(LoosePhoneRecord, {
            name: "loosePhoneRecord"
        });
        const Tags = t.set(t.string).min(1).max(3).size(2).nonempty();
        const MaybeName = t.nullish(t.string);
        const Json = t.json();
        const BoxWithId = t.instanceOf(Box).property("id", t.string);

        expectTypeOf<Infer<typeof Row>>()
            .toEqualTypeOf<readonly ["row", ...number[]]>();
        expectTypeOf<typeof FluentRow>().toExtend<TupleGuard<
            readonly ["row", ...number[]]
        >>();
        expectTypeOf<Infer<typeof FluentRow>>()
            .toEqualTypeOf<readonly ["row", ...number[]]>();
        expectTypeOf<typeof FluentRow.items>().toEqualTypeOf<readonly [
            BaseGuard<"row">
        ]>();
        expectTypeOf<Infer<typeof ReplacedRestRow>>()
            .toEqualTypeOf<readonly ["row", ...string[]]>();
        expectTypeOf<Infer<typeof Scores>>()
            .toEqualTypeOf<ReadonlyMap<string, number>>();
        expectTypeOf<typeof Scores>().toExtend<MapGuard<string, number>>();
        expectTypeOf<Infer<typeof ScoreRecord>>().toEqualTypeOf<
            Readonly<Record<"score_math" | "score_eng", number>>
        >();
        expectTypeOf<Infer<typeof NumericScoreRecord>>()
            .toEqualTypeOf<Readonly<Record<number, string>>>();
        expectTypeOf<Infer<typeof PartialScoreRecord>>().toEqualTypeOf<
            Readonly<Partial<Record<"score_math" | "score_eng", number>>>
        >();
        expectTypeOf<Infer<typeof LoosePhoneRecord>>().toEqualTypeOf<
            Readonly<
                Partial<Record<"home_phone" | "work_phone", string>> &
                Record<string, unknown>
            >
        >();
        expectTypeOf<Infer<typeof Tags>>()
            .toEqualTypeOf<ReadonlySet<string>>();
        expectTypeOf<typeof Tags>().toExtend<SetGuard<string>>();
        expectTypeOf<Infer<typeof MaybeName>>()
            .toEqualTypeOf<string | null | undefined>();
        expectTypeOf<Infer<typeof Json>>().toEqualTypeOf<JsonValue>();
        expectTypeOf<Infer<typeof BoxWithId>>()
            .toEqualTypeOf<Box & Readonly<Record<"id", string>>>();

        expect(Row.is(["row", 1, 2])).toBe(true);
        expect(FluentRow.is(["row", 1, 2])).toBe(true);
        expect(FluentRow.items[0].is("row")).toBe(true);
        expect(ReplacedRestRow.is(["row", "next"])).toBe(true);
        expect(Scores.is(new Map([["a", 1]]))).toBe(true);
        expect(Scores.is(new Map())).toBe(false);
        expect(ScoreRecord.is({ score_math: 1, score_eng: 2 })).toBe(true);
        expect(NumericScoreRecord.is({ 0: "zero", 1: "one" })).toBe(true);
        expect(NumericScoreRecord.is({ 1.5: "fraction" })).toBe(false);
        expect(PartialScoreRecord.is({ score_math: 1 })).toBe(true);
        expect(LoosePhoneRecord.is({
            home_phone: "+12345678900",
            name: 42
        })).toBe(true);
        expect(FastLoosePhoneRecord.is({
            home_phone: "+12345678900",
            name: 42
        })).toBe(true);
        expect(LoosePhoneRecord.is({
            home_phone: "not-phone",
            name: 42
        })).toBe(false);
        expect(Tags.is(new Set(["a", "b"]))).toBe(true);
        expect(MaybeName.is(null)).toBe(true);
        expect(Json.is(["x", 1, null])).toBe(true);
        expect(BoxWithId.is(new Box())).toBe(true);
    });

    test("preserves decoder transform, pipe, and coerce inference", async () => {
        const Length = t.transform(t.string.min(1), (value) => value.length);
        const ContextLength = t.transform(t.string, (value, context) => {
            if (value.length === 0) {
                context.addIssue({
                    message: "non-empty text expected"
                });
                return z.NEVER;
            }
            return value.length;
        });
        const PositiveLength = Length.pipe(t.number.int().gte(1));
        const CoercedCount = t.pipe(t.coerce.number(), t.number.int().gte(0));
        const CoercedDate = t.coerce.date();
        const CoercedBigInt = t.coerce.bigint();
        const NumberText = t.codec(
            t.string.regex(/^\d+$/u, "digits"),
            t.number.int(),
            {
                decode: (value) => Number(value),
                encode: (value) => String(value)
            }
        );
        const TextNumber = t.invertCodec(NumberText);
        const NamedTextNumber = invertCodec(NumberText);
        const BuiltInNumberText = t.codecs.stringToNumber();
        const BuiltInIntegerText = stringToInt();
        const BuiltInBigIntText = t.stringToBigInt();
        const BuiltInDateText = stringToDate();
        const BuiltInHttpUrlText = stringToHttpURL();
        const BuiltInJsonText = jsonCodec();
        const CaughtIssueCount = t.number.catch((context) => context.error.length);
        const PreprocessedCount = t.preprocess(
            (value) => typeof value === "string" ? Number(value) : value,
            t.number
        );
        const AppliedString = t.string.apply((schema) => schema.min(1));
        const AppliedDecoder = t.string.apply((schema) => schema.trim());
        const ParsedFlag = t.coerce.boolean();
        const EnvFlag = t.stringbool({
            truthy: ["enabled"],
            falsy: ["disabled"]
        });
        const DecodedObject = t.object({
            id: t.string,
            count: t.coerce.number()
        });
        const CodecObject = t.strictObject({
            id: t.string,
            at: t.stringToDate()
        });
        const DateList = t.array(t.stringToDate());
        const DateTuple = t.tuple([t.stringToDate(), t.stringbool()] as const);
        const DateTupleRest = t.tuple([t.string] as const, t.stringToNumber());
        const DateRecord = t.record(t.stringToDate());
        const NamedDateRecord = t.record(t.literal(["created"] as const), t.stringToDate());
        const LooseDateRecord = t.looseRecord(
            t.literal(["created"] as const),
            t.stringToDate()
        );
        const DateMap = t.map(t.stringbool(), t.stringToDate());
        const DateSet = t.set(t.stringToDate());
        const FunctionCount = t.number.int();
        const FunctionSchema = t.function({
            input: [t.string, FunctionCount] as const,
            output: t.boolean
        });
        const BuilderFunctionSchema = functionBuilder({
            input: [t.string] as const,
            output: t.number
        });
        const ChainFunctionSchema = z.function()
            .args(t.string, t.number)
            .returns(t.boolean);
        const implemented = FunctionSchema.implement((name, count) =>
            name.length === count);
        const asyncImplemented = BuilderFunctionSchema.implementAsync((name) =>
            Promise.resolve(name.length));
        const chainImplemented = ChainFunctionSchema.implement((name, count) =>
            name.length === count);
        const asyncChainImplemented = z.function()
            .args(t.string)
            .returns(t.number)
            .implementAsync((name) => Promise.resolve(name.length));
        const functionParameters = FunctionSchema.parameters();
        const functionReturn = FunctionSchema.returnType();
        const chainParameters = ChainFunctionSchema.parameters();
        const chainReturn = ChainFunctionSchema.returnType();
        const stringBoolOptions: StringBoolOptions = {
            truthy: ["yes"],
            falsy: ["no"],
            case: "sensitive"
        };
        const stringBoolCase: StringBoolCase = "insensitive";
        const functionOptions: FunctionContractOptions<readonly [typeof t.string], typeof t.number> = {
            input: [t.string],
            output: t.number
        };
        const functionInputShape: FunctionInputShape = [t.string, t.number];
        const lengthResult = Length.decode("sea");
        const contextLengthResult = ContextLength.decode("sea");
        const rejectedContextLengthResult = ContextLength.decode("");
        const positiveResult = PositiveLength.decode("sea");
        const countResult = CoercedCount.decode("42");
        const dateResult = CoercedDate.decode(0);
        const bigIntResult = CoercedBigInt.decode("42");
        const decodedText = decode(NumberText, "42");
        const safelyDecodedText = safeDecode(NumberText, "42");
        const decodedTextAsync = decodeAsync(NumberText, "42");
        const safelyDecodedTextAsync = safeDecodeAsync(NumberText, "42");
        const parsedText = NumberText.parse("42");
        const safeParsedText = NumberText.safeParse("42");
        const parsedTextAsync = NumberText.parseAsync("42");
        const safeParsedTextAsync = NumberText.safeParseAsync("42");
        const spaText = NumberText.spa("42");
        const topParsedText = parse(NumberText, "42");
        const topSafeParsedText = safeParse(NumberText, "42");
        const topParsedTextAsync = parseAsync(NumberText, "42");
        const topSafeParsedTextAsync = safeParseAsync(NumberText, "42");
        const topSpaText = spa(NumberText, "42");
        const zParsedText = z.parse(NumberText, "42");
        const zSafeParsedText = z.safeParse(NumberText, "42");
        const zParsedTextAsync = z.parseAsync(NumberText, "42");
        const zSafeParsedTextAsync = z.safeParseAsync(NumberText, "42");
        const zSpaText = z.spa(NumberText, "42");
        const encodedNumber = encode(NumberText, 42);
        const safelyEncodedNumber = safeEncode(NumberText, 42);
        const encodedNumberAsync = encodeAsync(NumberText, 42);
        const safelyEncodedNumberAsync = safeEncodeAsync(NumberText, 42);
        const decodedNumberText = decode(TextNumber, 42);
        const namedDecodedNumberText = decode(NamedTextNumber, 7);
        const encodedTextNumber = encode(TextNumber, "42");
        const decodedBuiltInNumber = decode(BuiltInNumberText, "42");
        const decodedBuiltInInteger = decode(BuiltInIntegerText, "42");
        const encodedBuiltInNumber = encode(BuiltInNumberText, 42);
        const decodedBuiltInBigInt = decode(BuiltInBigIntText, "42");
        const decodedBuiltInHttpUrl = decode(BuiltInHttpUrlText, "https://example.com");
        const decodedBuiltInJson = decode(BuiltInJsonText, "{\"ok\":true}");
        const encodedBuiltInDate = encode(
            BuiltInDateText,
            new Date("2026-07-06T00:00:00.000Z")
        );
        const caughtIssueCount = CaughtIssueCount.decode("bad");
        const preprocessedResult = PreprocessedCount.decode("42");
        const flagResult = ParsedFlag.decode("true");
        const envFlagResult = EnvFlag.decode("enabled");
        const decodedObjectResult = DecodedObject.decode({
            id: "item",
            count: "3"
        });
        const codecObjectResult = CodecObject.decode({
            id: "item",
            at: "2026-07-06T00:00:00.000Z"
        });
        const encodedObjectResult = CodecObject.encode({
            id: "item",
            at: new Date("2026-07-06T00:00:00.000Z")
        });
        const dateListResult = DateList.decode(["2026-07-06T00:00:00.000Z"]);
        const encodedDateListResult = DateList.encode([
            new Date("2026-07-06T00:00:00.000Z")
        ]);
        const dateTupleResult = DateTuple.decode([
            "2026-07-06T00:00:00.000Z",
            "true"
        ]);
        const encodedDateTupleResult = DateTuple.encode([
            new Date("2026-07-06T00:00:00.000Z"),
            false
        ]);
        const dateTupleRestResult = DateTupleRest.decode(["count", "1", "2"]);
        const dateRecordResult = DateRecord.decode({
            created: "2026-07-06T00:00:00.000Z"
        });
        const encodedDateRecordResult = DateRecord.encode({
            created: new Date("2026-07-06T00:00:00.000Z")
        });
        const namedDateRecordResult = NamedDateRecord.decode({
            created: "2026-07-06T00:00:00.000Z"
        });
        const looseDateRecordResult = LooseDateRecord.decode({
            created: "2026-07-06T00:00:00.000Z",
            raw: 1
        });
        const dateMapResult = DateMap.decode(new Map([
            ["true", "2026-07-06T00:00:00.000Z"]
        ]));
        const encodedDateMapResult = DateMap.encode(new Map([
            [false, new Date("2026-07-06T00:00:00.000Z")]
        ]));
        const dateSetResult = DateSet.decode(new Set([
            "2026-07-06T00:00:00.000Z"
        ]));
        const encodedDateSetResult = DateSet.encode(new Set([
            new Date("2026-07-06T00:00:00.000Z")
        ]));
        const tree = treeifyIssues([]);
        const aliasedTree = treeifyError([]);
        const flattened = flattenError([]);
        const formatted = formatError([]);
        const zodIssues = toZodIssues([]);
        const zodError = toZodError([]);
        const zodIssueDetails: ZodIssueDetails = {
            minimum: 1,
            inclusive: true,
            origin: "string"
        };
        const zodIssueBoundValue: ZodIssueBoundValue = 1n;
        const zNamespaceTree = z.treeifyError([]);
        const zNamespaceNativeTree = z.treeifyIssues([]);
        const zNamespaceFlattened = z.flattenError([]);
        const zNamespaceNativeFlattened = z.flattenIssues([]);
        const zNamespaceFormatted = z.formatError([]);
        const zNamespaceMessages = z.formatIssues([]);
        const zNamespacePretty = z.prettifyError([]);
        const zNamespaceIssues = z.toZodIssues([]);
        const zNamespaceError = z.toZodError([]);
        const zNamespaceCatalog = z.defineMessages({
            expected_string: "text required"
        });
        const zNamespaceMessaged = z.withMessages(t.string.check(1), {
            catalog: zNamespaceCatalog
        });
        const assertionError = new TypeSeaAssertionError([]);
        const zodAliasError = new ZodError([]);
        const zodAliasUser = z.object({
            id: z.string,
            count: z.number.int()
        });
        const zodDef = zodAliasUser.def;
        const zodPrivateDef = zodAliasUser._def;
        const zodTypeKind: ZodFirstPartyTypeKindValue = ZodFirstPartyTypeKind.ZodObject;
        const zodCallableUser = z.object({
            id: z.string().uuid(),
            count: z.number().int(),
            active: z.boolean(),
            at: z.date(),
            serial: z.bigint(),
            marker: z.symbol()
        });
        const zodShortcutUser = z.object({
            id: z.ostring(),
            count: z.onumber(),
            active: z.oboolean(),
            at: z.odate(),
            serial: z.obigint(),
            marker: z.osymbol()
        });
        type ZodWildcardPrefix = "an";
        type ZodWildcardKey = `${ZodWildcardPrefix}y`;
        const zodWildcardKey = ("an" + "y") as ZodWildcardKey;
        const zodWildcardValue = z[zodWildcardKey]();
        const zodAliasNull = z.null();
        const zodAliasNativeEnum = z.nativeEnum({
            Ready: "ready",
            Done: "done"
        });
        const zodAliasUnion = z.union([z.string, z.number] as const);
        const zodAliasXor = z.xor([z.string, z.number] as const);
        const zodAliasInstance = z.instanceof(Date);
        const zodAliasEvent = z.discriminatedUnion("kind", [
            z.object({
                kind: z.literal("user"),
                id: z.string
            }),
            z.object({
                kind: z.literal("order"),
                total: z.number
            })
        ] as const);
        const SuccessfulString = success(t.string.min(1));
        const ZodSuccessfulString = z.success(z.string.min(1));
        const successfulStringResult = SuccessfulString.decode("ok");
        const zodSuccessfulStringResult = ZodSuccessfulString.decode("ok");
        type ZodAliasUser = TypeSea.infer<typeof zodAliasUser>;
        type ZodAliasUserInput = TypeSea.input<typeof zodAliasUser>;
        type ZodAliasUserOutput = TypeSea.output<typeof zodAliasUser>;
        type ZodAliasUserTypeOf = TypeOf<typeof zodAliasUser>;
        type ZodCallableUser = TypeSea.infer<typeof zodCallableUser>;
        type ZodShortcutUser = TypeSea.infer<typeof zodShortcutUser>;
        type ZodShortcutName = TypeSea.infer<ReturnType<typeof z.ostring>>;
        type ZodWildcardValue = TypeSea.infer<typeof zodWildcardValue>;
        type ZodAliasNull = TypeSea.infer<typeof zodAliasNull>;
        type ZodAliasNativeEnum = TypeSea.infer<typeof zodAliasNativeEnum>;
        type ZodAliasUnion = TypeSea.infer<typeof zodAliasUnion>;
        type ZodAliasXor = TypeSea.infer<typeof zodAliasXor>;
        type ZodAliasInstance = TypeSea.infer<typeof zodAliasInstance>;
        type ZodAliasEvent = TypeSea.infer<typeof zodAliasEvent>;
        type ZodAliasUserViaImport = ZodInfer<typeof zodAliasUser>;
        type ZodAliasUserInputViaImport = ZodInput<typeof zodAliasUser>;
        type ZodAliasUserOutputViaImport = ZodOutput<typeof zodAliasUser>;
        const zodFlattened = zodError.flatten();
        const zodFormatted = zodError.format();
        const assertionFlattened = assertionError.flatten();
        const assertionFormatted = assertionError.format();
        const zodIssueCode: ZodIssueCodeType = ZodIssueCode.custom;
        const zNamespaceIssueCode: ZodIssueCodeType = z.ZodIssueCode.custom;
        const transformIssue: TransformIssueInput = {
            path: ["name"],
            message: "name required"
        };
        const transformIssueSink: TransformIssueSink = {
            length: 0,
            push(...issues: (TransformIssueInput | undefined)[]): number {
                expect(issues[0]).toBe(transformIssue);
                return issues.length;
            }
        };
        const transformContext: TransformContext = {
            issues: transformIssueSink,
            addIssue(issue?: TransformIssueInput): void {
                expect(issue).toBe(transformIssue);
            }
        };
        const importedJsonSchema = fromJsonSchema({
            type: "string"
        });
        const importedJsonSchemaAlias = fromJSONSchema(false);
        const jsonSchemaImportCode: JsonSchemaImportCode = "unsupported_keyword";
        type JsonSchemaImportResult =
            | {
                readonly ok: true;
                readonly value: Guard<unknown, Presence>;
            }
            | {
                readonly ok: false;
                readonly error: readonly JsonSchemaImportIssue[];
            };

        expectTypeOf<InferDecoder<typeof Length>>().toEqualTypeOf<number>();
        expectTypeOf<InferDecoder<typeof ContextLength>>().toEqualTypeOf<number>();
        expectTypeOf<InferDecoder<typeof PositiveLength>>().toEqualTypeOf<number>();
        expectTypeOf<InferDecoder<typeof CoercedCount>>().toEqualTypeOf<number>();
        expectTypeOf<InferDecoder<typeof CoercedDate>>().toEqualTypeOf<Date>();
        expectTypeOf<InferDecoder<typeof CoercedBigInt>>().toEqualTypeOf<bigint>();
        expectTypeOf<InferDecoder<typeof NumberText>>().toEqualTypeOf<number>();
        expectTypeOf<InferCodecEncoded<typeof NumberText>>().toEqualTypeOf<string>();
        expectTypeOf<InferCodecDecoded<typeof NumberText>>().toEqualTypeOf<number>();
        expectTypeOf<InferCodecEncoded<typeof TextNumber>>().toEqualTypeOf<number>();
        expectTypeOf<InferCodecDecoded<typeof TextNumber>>().toEqualTypeOf<string>();
        expectTypeOf<InferCodecEncoded<typeof NamedTextNumber>>().toEqualTypeOf<number>();
        expectTypeOf<InferCodecDecoded<typeof NamedTextNumber>>().toEqualTypeOf<string>();
        expectTypeOf<InferCodecEncoded<typeof BuiltInNumberText>>().toEqualTypeOf<string>();
        expectTypeOf<InferCodecDecoded<typeof BuiltInNumberText>>().toEqualTypeOf<number>();
        expectTypeOf<InferCodecEncoded<typeof BuiltInBigIntText>>().toEqualTypeOf<string>();
        expectTypeOf<InferCodecDecoded<typeof BuiltInBigIntText>>().toEqualTypeOf<bigint>();
        expectTypeOf<InferCodecEncoded<typeof BuiltInDateText>>().toEqualTypeOf<string>();
        expectTypeOf<InferCodecDecoded<typeof BuiltInDateText>>().toEqualTypeOf<Date>();
        expectTypeOf<typeof BuiltInNumberText>().toExtend<Codec<string, number>>();
        expectTypeOf<Input<typeof NumberText>>().toEqualTypeOf<string>();
        expectTypeOf<Output<typeof NumberText>>().toEqualTypeOf<number>();
        expectTypeOf<Input<typeof TextNumber>>().toEqualTypeOf<number>();
        expectTypeOf<Output<typeof TextNumber>>().toEqualTypeOf<string>();
        expectTypeOf<Input<typeof t.string>>().toEqualTypeOf<string>();
        expectTypeOf<Output<typeof t.string>>().toEqualTypeOf<string>();
        expectTypeOf<ZodShortcutName>().toEqualTypeOf<string | undefined>();
        expectTypeOf<ZodShortcutUser>().toEqualTypeOf<{
            readonly id?: string;
            readonly count?: number;
            readonly active?: boolean;
            readonly at?: Date;
            readonly serial?: bigint;
            readonly marker?: symbol;
        }>();
        expectTypeOf<Input<typeof PreprocessedCount>>().toEqualTypeOf<unknown>();
        expectTypeOf<Output<typeof PreprocessedCount>>().toEqualTypeOf<number>();
        expectTypeOf<InferDecoder<typeof PreprocessedCount>>().toEqualTypeOf<number>();
        expectTypeOf<Infer<typeof AppliedString>>().toEqualTypeOf<string>();
        expectTypeOf<InferDecoder<typeof AppliedDecoder>>().toEqualTypeOf<string>();
        expectTypeOf<InferDecoder<typeof ParsedFlag>>().toEqualTypeOf<boolean>();
        expectTypeOf<InferDecoder<typeof EnvFlag>>().toEqualTypeOf<boolean>();
        expectTypeOf<InferDecoder<typeof DecodedObject>>().toEqualTypeOf<{
            readonly id: string;
            readonly count: number;
        }>();
        expectTypeOf<InferDecoder<typeof CodecObject>>().toEqualTypeOf<{
            readonly id: string;
            readonly at: Date;
        }>();
        expectTypeOf<Input<typeof CodecObject>>().toEqualTypeOf<{
            readonly id: string;
            readonly at: string;
        }>();
        expectTypeOf<Output<typeof CodecObject>>().toEqualTypeOf<{
            readonly id: string;
            readonly at: Date;
        }>();
        expectTypeOf<typeof CodecObject>().toExtend<Codec<
            {
                readonly id: string;
                readonly at: string;
            },
            {
                readonly id: string;
                readonly at: Date;
            }
        >>();
        expectTypeOf<InferDecoder<typeof DateList>>()
            .toEqualTypeOf<readonly Date[]>();
        expectTypeOf<Input<typeof DateList>>()
            .toEqualTypeOf<readonly string[]>();
        expectTypeOf<Output<typeof DateList>>()
            .toEqualTypeOf<readonly Date[]>();
        expectTypeOf<InferDecoder<typeof DateTuple>>()
            .toEqualTypeOf<readonly [Date, boolean]>();
        expectTypeOf<Input<typeof DateTuple>>()
            .toEqualTypeOf<readonly [string, string]>();
        expectTypeOf<Output<typeof DateTuple>>()
            .toEqualTypeOf<readonly [Date, boolean]>();
        expectTypeOf<InferDecoder<typeof DateTupleRest>>()
            .toEqualTypeOf<readonly [string, ...number[]]>();
        expectTypeOf<InferDecoder<typeof DateRecord>>()
            .toEqualTypeOf<Readonly<Record<string, Date>>>();
        expectTypeOf<Input<typeof DateRecord>>()
            .toEqualTypeOf<Readonly<Record<string, string>>>();
        expectTypeOf<InferDecoder<typeof NamedDateRecord>>()
            .toEqualTypeOf<Readonly<Record<"created", Date>>>();
        expectTypeOf<InferDecoder<typeof LooseDateRecord>>()
            .toEqualTypeOf<Readonly<Partial<Record<"created", Date>> & Record<string, unknown>>>();
        expectTypeOf<InferDecoder<typeof DateMap>>()
            .toEqualTypeOf<ReadonlyMap<boolean, Date>>();
        expectTypeOf<Input<typeof DateMap>>()
            .toEqualTypeOf<ReadonlyMap<string, string>>();
        expectTypeOf<InferDecoder<typeof DateSet>>()
            .toEqualTypeOf<ReadonlySet<Date>>();
        expectTypeOf<Input<typeof DateSet>>()
            .toEqualTypeOf<ReadonlySet<string>>();
        expectTypeOf<typeof FunctionSchema>()
            .toExtend<FunctionContract<readonly [typeof t.string, typeof FunctionCount], typeof t.boolean>>();
        expectTypeOf<typeof implemented>().toEqualTypeOf<(name: string, count: number) => boolean>();
        expectTypeOf<typeof asyncImplemented>().toEqualTypeOf<(name: string) => Promise<number>>();
        expectTypeOf<typeof ChainFunctionSchema>()
            .toExtend<FunctionContractBuilder<readonly [typeof t.string, typeof t.number], typeof t.boolean>>();
        expectTypeOf<typeof chainImplemented>().toEqualTypeOf<(name: string, count: number) => boolean>();
        expectTypeOf<typeof asyncChainImplemented>().toEqualTypeOf<(name: string) => Promise<number>>();
        expectTypeOf<typeof functionParameters>()
            .toEqualTypeOf<readonly [typeof t.string, typeof FunctionCount]>();
        expectTypeOf<typeof functionReturn>().toEqualTypeOf<typeof t.boolean>();
        expectTypeOf<typeof chainParameters>()
            .toEqualTypeOf<readonly [typeof t.string, typeof t.number]>();
        expectTypeOf<typeof chainReturn>().toEqualTypeOf<typeof t.boolean>();
        expectTypeOf<InferFunctionArgs<readonly [typeof t.string, typeof t.number]>>()
            .toEqualTypeOf<[string, number]>();
        expectTypeOf<FunctionOutput<typeof t.boolean, string>>().toEqualTypeOf<boolean>();
        expectTypeOf<typeof lengthResult>().toEqualTypeOf<CheckResult<number>>();
        expectTypeOf<typeof countResult>().toEqualTypeOf<CheckResult<number>>();
        expectTypeOf<typeof dateResult>().toEqualTypeOf<CheckResult<Date>>();
        expectTypeOf<typeof bigIntResult>().toEqualTypeOf<CheckResult<bigint>>();
        expectTypeOf<typeof decodedText>().toEqualTypeOf<CheckResult<number>>();
        expectTypeOf<typeof safelyDecodedText>().toEqualTypeOf<CheckResult<number>>();
        expectTypeOf<typeof decodedTextAsync>().toEqualTypeOf<Promise<CheckResult<number>>>();
        expectTypeOf<typeof safelyDecodedTextAsync>()
            .toEqualTypeOf<Promise<CheckResult<number>>>();
        expectTypeOf<typeof parsedText>().toEqualTypeOf<number>();
        expectTypeOf<typeof safeParsedText>().toEqualTypeOf<SafeParseResult<number>>();
        expectTypeOf<typeof parsedTextAsync>().toEqualTypeOf<Promise<number>>();
        expectTypeOf<typeof safeParsedTextAsync>()
            .toEqualTypeOf<Promise<SafeParseResult<number>>>();
        expectTypeOf<typeof spaText>().toEqualTypeOf<Promise<SafeParseResult<number>>>();
        expectTypeOf<typeof topParsedText>().toEqualTypeOf<number>();
        expectTypeOf<typeof topSafeParsedText>().toEqualTypeOf<SafeParseResult<number>>();
        expectTypeOf<typeof topParsedTextAsync>().toEqualTypeOf<Promise<number>>();
        expectTypeOf<typeof topSafeParsedTextAsync>()
            .toEqualTypeOf<Promise<SafeParseResult<number>>>();
        expectTypeOf<typeof topSpaText>().toEqualTypeOf<Promise<SafeParseResult<number>>>();
        expectTypeOf<typeof zParsedText>().toEqualTypeOf<number>();
        expectTypeOf<typeof zSafeParsedText>().toEqualTypeOf<SafeParseResult<number>>();
        expectTypeOf<typeof zParsedTextAsync>().toEqualTypeOf<Promise<number>>();
        expectTypeOf<typeof zSafeParsedTextAsync>()
            .toEqualTypeOf<Promise<SafeParseResult<number>>>();
        expectTypeOf<typeof zSpaText>().toEqualTypeOf<Promise<SafeParseResult<number>>>();
        expectTypeOf<typeof encodedNumber>().toEqualTypeOf<CheckResult<string>>();
        expectTypeOf<typeof safelyEncodedNumber>().toEqualTypeOf<CheckResult<string>>();
        expectTypeOf<typeof encodedNumberAsync>().toEqualTypeOf<Promise<CheckResult<string>>>();
        expectTypeOf<typeof safelyEncodedNumberAsync>()
            .toEqualTypeOf<Promise<CheckResult<string>>>();
        expectTypeOf<typeof decodedNumberText>().toEqualTypeOf<CheckResult<string>>();
        expectTypeOf<typeof namedDecodedNumberText>().toEqualTypeOf<CheckResult<string>>();
        expectTypeOf<typeof encodedTextNumber>().toEqualTypeOf<CheckResult<number>>();
        expectTypeOf<typeof decodedBuiltInNumber>().toEqualTypeOf<CheckResult<number>>();
        expectTypeOf<typeof decodedBuiltInInteger>().toEqualTypeOf<CheckResult<number>>();
        expectTypeOf<typeof encodedBuiltInNumber>().toEqualTypeOf<CheckResult<string>>();
        expectTypeOf<typeof decodedBuiltInBigInt>().toEqualTypeOf<CheckResult<bigint>>();
        expectTypeOf<typeof decodedBuiltInHttpUrl>().toEqualTypeOf<CheckResult<URL>>();
        expectTypeOf<typeof decodedBuiltInJson>().toEqualTypeOf<CheckResult<JsonCodecValue>>();
        expectTypeOf<typeof encodedBuiltInDate>().toEqualTypeOf<CheckResult<string>>();
        expect(decodedBuiltInInteger.ok).toBe(true);
        expect(decodedBuiltInHttpUrl.ok).toBe(true);
        expect(decodedBuiltInJson.ok).toBe(true);
        expectTypeOf<typeof caughtIssueCount>().toEqualTypeOf<CheckResult<number>>();
        expectTypeOf<CatchInput<number>>().toEqualTypeOf<
            number | (() => number) | ((context: CatchContext) => number)
        >();
        expectTypeOf<CatchContext["error"]>().toEqualTypeOf<readonly Issue[]>();
        expectTypeOf<typeof preprocessedResult>().toEqualTypeOf<CheckResult<number>>();
        expectTypeOf<typeof envFlagResult>().toEqualTypeOf<CheckResult<boolean>>();
        expectTypeOf<typeof decodedObjectResult>().toEqualTypeOf<CheckResult<{
            readonly id: string;
            readonly count: number;
        }>>();
        expectTypeOf<typeof codecObjectResult>().toEqualTypeOf<CheckResult<{
            readonly id: string;
            readonly at: Date;
        }>>();
        expectTypeOf<typeof encodedObjectResult>().toEqualTypeOf<CheckResult<{
            readonly id: string;
            readonly at: string;
        }>>();
        expectTypeOf<typeof dateListResult>().toEqualTypeOf<CheckResult<readonly Date[]>>();
        expectTypeOf<typeof encodedDateListResult>().toEqualTypeOf<CheckResult<readonly string[]>>();
        expectTypeOf<typeof dateTupleResult>().toEqualTypeOf<CheckResult<readonly [Date, boolean]>>();
        expectTypeOf<typeof encodedDateTupleResult>().toEqualTypeOf<CheckResult<readonly [string, string]>>();
        expectTypeOf<typeof dateTupleRestResult>().toEqualTypeOf<CheckResult<readonly [string, ...number[]]>>();
        expectTypeOf<typeof dateRecordResult>().toEqualTypeOf<CheckResult<Readonly<Record<string, Date>>>>();
        expectTypeOf<typeof encodedDateRecordResult>().toEqualTypeOf<CheckResult<Readonly<Record<string, string>>>>();
        expectTypeOf<typeof namedDateRecordResult>().toEqualTypeOf<CheckResult<Readonly<Record<"created", Date>>>>();
        expectTypeOf<typeof looseDateRecordResult>().toEqualTypeOf<CheckResult<Readonly<Partial<Record<"created", Date>> & Record<string, unknown>>>>();
        expectTypeOf<typeof dateMapResult>().toEqualTypeOf<CheckResult<ReadonlyMap<boolean, Date>>>();
        expectTypeOf<typeof encodedDateMapResult>().toEqualTypeOf<CheckResult<ReadonlyMap<string, string>>>();
        expectTypeOf<typeof dateSetResult>().toEqualTypeOf<CheckResult<ReadonlySet<Date>>>();
        expectTypeOf<typeof encodedDateSetResult>().toEqualTypeOf<CheckResult<ReadonlySet<string>>>();
        expectTypeOf<typeof stringBoolOptions>().toEqualTypeOf<StringBoolOptions>();
        expectTypeOf<typeof stringBoolCase>().toExtend<StringBoolCase>();
        expectTypeOf<typeof functionOptions>()
            .toEqualTypeOf<FunctionContractOptions<readonly [typeof t.string], typeof t.number>>();
        expectTypeOf<typeof functionInputShape>().toEqualTypeOf<FunctionInputShape>();
        expectTypeOf<typeof regexes>().toEqualTypeOf<RegexNamespace>();
        expectTypeOf<typeof t.regexes>().toEqualTypeOf<RegexNamespace>();
        expect(regexes.xid.test("9m4e2mr0ui3e8a215n4g")).toBe(true);
        expect(t.regexes.ksuid.test("0ujtsYcgvSTl8PAuAdqWYSMnLOv")).toBe(true);
        expect(stringBoolCase).toBe("insensitive");
        expectTypeOf<{ readonly issues: [] }>().toExtend<IssueListError>();
        expectTypeOf<{ readonly issues: [] }>().toExtend<IssueSource>();
        expectTypeOf<typeof tree>().toEqualTypeOf<TreeifiedIssueMessages>();
        expectTypeOf<typeof aliasedTree>().toEqualTypeOf<TreeifiedIssueMessages>();
        expectTypeOf<typeof flattened.formErrors>().toEqualTypeOf<readonly string[]>();
        expectTypeOf<typeof formatted>().toEqualTypeOf<FormattedIssueMessages>();
        expectTypeOf<typeof zodIssues>().toEqualTypeOf<readonly ZodIssue[]>();
        expectTypeOf<typeof zodIssueDetails>().toEqualTypeOf<ZodIssueDetails>();
        expectTypeOf<typeof zodIssueBoundValue>().toExtend<ZodIssueBoundValue>();
        expectTypeOf<typeof zodError>().toEqualTypeOf<TypeSeaZodError>();
        expectTypeOf<typeof zodError>().toExtend<ZodErrorLike>();
        expectTypeOf<typeof zNamespaceTree>().toEqualTypeOf<TreeifiedIssueMessages>();
        expectTypeOf<typeof zNamespaceNativeTree>().toEqualTypeOf<TreeifiedIssueMessages>();
        expectTypeOf<typeof zNamespaceFlattened>().toEqualTypeOf<FlattenedIssueMessages>();
        expectTypeOf<typeof zNamespaceNativeFlattened>()
            .toEqualTypeOf<FlattenedIssueMessages>();
        expectTypeOf<typeof zNamespaceFormatted>().toEqualTypeOf<FormattedIssueMessages>();
        expectTypeOf<typeof zNamespaceMessages>().toEqualTypeOf<readonly string[]>();
        expectTypeOf<typeof zNamespaceIssues>().toEqualTypeOf<readonly ZodIssue[]>();
        expectTypeOf<typeof zNamespaceError>().toEqualTypeOf<TypeSeaZodError>();
        expectTypeOf<typeof zNamespaceCatalog>().toEqualTypeOf<IssueMessageCatalog>();
        expectTypeOf<typeof zNamespaceMessaged>().toEqualTypeOf<CheckResult<string>>();
        expectTypeOf<typeof zodDef>().toEqualTypeOf<ZodDef>();
        expectTypeOf<typeof zodPrivateDef>().toEqualTypeOf<ZodDef>();
        expectTypeOf<typeof zodTypeKind>().toExtend<ZodFirstPartyTypeKindValue>();
        expectTypeOf<typeof ZodType>().toEqualTypeOf<typeof ZodSchema>();
        expectTypeOf<Guard<unknown, Presence>>().toExtend<ZodTypeAny>();
        expectTypeOf<typeof zodAliasUser>().toExtend<AnyZodObject>();
        expectTypeOf<ZodEffects<string>>().toExtend<BaseDecoder<string>>();
        expectTypeOf<ZodPipeline<number>>().toExtend<BaseDecoder<number>>();
        expectTypeOf<ZodTransform<boolean>>().toExtend<BaseDecoder<boolean>>();
        expectTypeOf<ZodDefault<string>>().toExtend<BaseDecoder<string>>();
        expectTypeOf<ZodCatch<string>>().toExtend<BaseDecoder<string>>();
        expectTypeOf<ZodPrefault<string>>().toExtend<BaseDecoder<string>>();
        expectTypeOf<ZodCodec<string, number>>().toExtend<BaseCodec<string, number>>();
        expectTypeOf<ZodAny<unknown>>().toExtend<BaseGuard<unknown>>();
        expectTypeOf<ZodBranded<string>>().toExtend<BaseGuard<string>>();
        expectTypeOf<ZodDiscriminatedUnion<ZodAliasEvent>>()
            .toExtend<BaseGuard<ZodAliasEvent>>();
        expectTypeOf<ZodIntersection<{ readonly id: string }>>()
            .toExtend<BaseGuard<{ readonly id: string }>>();
        expectTypeOf<ZodMap<string, number>>()
            .toExtend<MapGuard<string, number>>();
        expectTypeOf<ZodNever<never>>().toExtend<BaseGuard<never>>();
        expectTypeOf<ZodNull<null>>().toExtend<BaseGuard<null>>();
        expectTypeOf<ZodNullable<string | null>>()
            .toExtend<BaseGuard<string | null>>();
        expectTypeOf<ZodNullish<string | null>>()
            .toExtend<BaseGuard<string | null>>();
        expectTypeOf<ZodOptional<string>>().toExtend<BaseGuard<string>>();
        expectTypeOf<ZodReadonly<readonly string[]>>()
            .toExtend<BaseGuard<readonly string[]>>();
        expectTypeOf<ZodRecord<Readonly<Record<string, number>>>>()
            .toExtend<BaseGuard<Readonly<Record<string, number>>>>();
        expectTypeOf<ZodTuple<readonly [string, number]>>()
            .toExtend<BaseGuard<readonly [string, number]>>();
        expectTypeOf<ZodTuple<readonly [string, number]>>()
            .toExtend<TupleGuard<readonly [string, number]>>();
        expectTypeOf<ZodUndefined<undefined>>().toExtend<BaseGuard<undefined>>();
        expectTypeOf<ZodUnknown<unknown>>().toExtend<BaseGuard<unknown>>();
        expectTypeOf<ZodVoid<undefined>>().toExtend<BaseGuard<undefined>>();
        expectTypeOf<ZodAliasUser>().toEqualTypeOf<{
            readonly id: string;
            readonly count: number;
        }>();
        expectTypeOf<ZodAliasUserInput>().toEqualTypeOf<ZodAliasUser>();
        expectTypeOf<ZodAliasUserOutput>().toEqualTypeOf<ZodAliasUser>();
        expectTypeOf<ZodAliasUserViaImport>().toEqualTypeOf<ZodAliasUser>();
        expectTypeOf<ZodAliasUserInputViaImport>().toEqualTypeOf<ZodAliasUser>();
        expectTypeOf<ZodAliasUserOutputViaImport>().toEqualTypeOf<ZodAliasUser>();
        expectTypeOf<ZodCallableUser>().toEqualTypeOf<{
            readonly id: string;
            readonly count: number;
            readonly active: boolean;
            readonly at: Date;
            readonly serial: bigint;
            readonly marker: symbol;
        }>();
        expectTypeOf<ZodWildcardValue>().toEqualTypeOf<unknown>();
        expectTypeOf<ZodAliasNull>().toEqualTypeOf<null>();
        expectTypeOf<ZodAliasNativeEnum>().toEqualTypeOf<"ready" | "done">();
        expectTypeOf<ZodAliasUnion>().toEqualTypeOf<string | number>();
        expectTypeOf<ZodAliasXor>().toEqualTypeOf<string | number>();
        expectTypeOf<ZodAliasInstance>().toEqualTypeOf<Date>();
        expectTypeOf<ZodAliasEvent>().toEqualTypeOf<
            | {
                readonly kind: "user";
                readonly id: string;
            }
            | {
                readonly kind: "order";
                readonly total: number;
            }
        >();
        expectTypeOf<typeof zodFlattened>().toEqualTypeOf<FlattenedIssueMessages>();
        expectTypeOf<typeof zodFormatted>().toEqualTypeOf<FormattedIssueMessages>();
        expectTypeOf<typeof assertionError>().toEqualTypeOf<TypeSeaAssertionError>();
        expectTypeOf<typeof assertionFlattened>().toEqualTypeOf<FlattenedIssueMessages>();
        expectTypeOf<typeof assertionFormatted>().toEqualTypeOf<FormattedIssueMessages>();
        expectTypeOf<typeof successfulStringResult>().toEqualTypeOf<CheckResult<boolean>>();
        expectTypeOf<typeof zodSuccessfulStringResult>().toEqualTypeOf<CheckResult<boolean>>();
        expectTypeOf<ZodAliasUserTypeOf>().toEqualTypeOf<ZodAliasUser>();
        expect(aliasedTree.errors).toEqual([]);
        expect(flattened.formErrors).toEqual([]);
        expect(formatted._errors).toEqual([]);
        expect(zodIssues).toEqual([]);
        expect(zodError.name).toBe("ZodError");
        expect(zodError).toBeInstanceOf(TypeSeaZodError);
        expect(zNamespaceTree.errors).toEqual([]);
        expect(zNamespaceNativeTree.errors).toEqual([]);
        expect(zNamespaceFlattened.formErrors).toEqual([]);
        expect(zNamespaceNativeFlattened.formErrors).toEqual([]);
        expect(zNamespaceFormatted._errors).toEqual([]);
        expect(zNamespaceMessages).toEqual([]);
        expect(zNamespacePretty).toBe("Validation succeeded.");
        expect(zNamespaceIssues).toEqual([]);
        expect(zNamespaceError).toBeInstanceOf(TypeSeaZodError);
        expect(zNamespaceIssueCode).toBe("custom");
        expect(zNamespaceMessaged.ok).toBe(false);
        if (!zNamespaceMessaged.ok) {
            expect(zNamespaceMessaged.error[0]?.message).toBe("text required");
        }
        expect(ZodAny).toBe(BaseGuard);
        expect(ZodArray).toBe(ArrayGuard);
        expect(ZodBigInt).toBe(BigIntGuard);
        expect(ZodBranded).toBe(BaseGuard);
        expect(ZodCatch).toBe(BaseDecoder);
        expect(ZodCodec).toBe(BaseCodec);
        expect(ZodDate).toBe(DateGuard);
        expect(ZodDefault).toBe(BaseDecoder);
        expect(ZodDiscriminatedUnion).toBe(BaseGuard);
        expect(ZodEffects).toBe(BaseDecoder);
        expect(ZodEnum).toBe(EnumGuard);
        expect(ZodFile).toBe(FileGuard);
        expect(ZodLiteral).toBe(LiteralGuard);
        expect(ZodMap).toBe(MapGuard);
        expect(ZodNever).toBe(BaseGuard);
        expect(ZodNull).toBe(BaseGuard);
        expect(ZodNullable).toBe(BaseGuard);
        expect(ZodNullish).toBe(BaseGuard);
        expect(ZodNumber).toBe(NumberGuard);
        expect(ZodObject).toBe(ObjectGuard);
        expect(ZodOptional).toBe(BaseGuard);
        expect(ZodPipeline).toBe(BaseDecoder);
        expect(ZodPrefault).toBe(BaseDecoder);
        expect(Object.getPrototypeOf(ZodPromise)).toBe(BaseAsyncDecoder);
        expect(ZodReadonly).toBe(BaseGuard);
        expect(ZodRecord).toBe(BaseGuard);
        expect(ZodSet).toBe(SetGuard);
        expect(ZodString).toBe(StringGuard);
        expect(ZodTransform).toBe(BaseDecoder);
        expect(ZodTuple).toBe(TupleGuard);
        expect(ZodUnion).toBe(UnionGuard);
        expect(ZodUndefined).toBe(BaseGuard);
        expect(ZodUnknown).toBe(BaseGuard);
        expect(ZodVoid).toBe(BaseGuard);
        expect(ZodXor).toBe(XorGuard);
        expect(z.object).not.toBe(t.object);
        expect(z.object({ id: z.string }).parse({ id: "u1", extra: true }))
            .toEqual({ id: "u1" });
        expect(t.object({ id: t.string }).parse({ id: "u1", extra: true }))
            .toEqual({ id: "u1", extra: true });
        expect(z.string()).toBe(t.string());
        expect(z.number()).toBe(t.number());
        expect(z.boolean()).toBe(t.boolean());
        expect(z.date()).toBe(t.date());
        expect(z.bigint()).toBe(t.bigint());
        expect(z.symbol()).toBe(t.symbol());
        expect(zodCallableUser.is({
            id: "550e8400-e29b-41d4-a716-446655440000",
            count: 1,
            active: true,
            at: new Date("2026-07-07T00:00:00.000Z"),
            serial: 1n,
            marker: Symbol("marker")
        })).toBe(true);
        expect(zodShortcutUser.is({})).toBe(true);
        expect(zodShortcutUser.is({
            id: "u1",
            count: 1,
            active: true,
            at: new Date("2026-07-07T00:00:00.000Z"),
            serial: 1n,
            marker: Symbol("marker")
        })).toBe(true);
        expect(zodWildcardValue.is(() => undefined)).toBe(true);
        expect(zodAliasNull.is(null)).toBe(true);
        expect(z.undefined().is(undefined)).toBe(true);
        expect(zodAliasNativeEnum.is("ready")).toBe(true);
        expect(zodAliasUnion.is(1)).toBe(true);
        expect(zodAliasXor.is("ready")).toBe(true);
        expect(zodAliasInstance.is(new Date("2026-07-07T00:00:00.000Z"))).toBe(true);
        expect(zodAliasEvent.is({ kind: "order", total: 1 })).toBe(true);
        expect(ZodError).toBe(TypeSeaZodError);
        expect(ZodType).toBe(ZodSchema);
        expect(zodDef.typeName).toBe(ZodFirstPartyTypeKind.ZodObject);
        expect(zodPrivateDef.type).toBe("object");
        expect(zodTypeKind).toBe("ZodObject");
        expect(zodAliasUser.is({ id: "a", count: 1 })).toBe(true);
        expect(zodAliasError).toBeInstanceOf(TypeSeaZodError);
        expect(zodFlattened.formErrors).toEqual([]);
        expect(zodFormatted._errors).toEqual([]);
        expect(zodIssueDetails.minimum).toBe(1);
        expect(zodIssueBoundValue).toBe(1n);
        expect(assertionError).toBeInstanceOf(TypeSeaAssertionError);
        expect(assertionFlattened.formErrors).toEqual([]);
        expect(assertionFormatted._errors).toEqual([]);
        expect(successfulStringResult).toEqual({ ok: true, value: true });
        expect(zodSuccessfulStringResult).toEqual({ ok: true, value: true });
        expect(zodIssueCode).toBe("custom");
        expect(NEVER).toBe(z.NEVER);
        transformContext.addIssue(transformIssue);
        expect(ZodIssueCode.invalid_key).toBe("invalid_key");
        expect(ZodIssueCode.invalid_element).toBe("invalid_element");
        expectTypeOf<typeof importedJsonSchema>()
            .toEqualTypeOf<JsonSchemaImportResult>();
        expectTypeOf<typeof importedJsonSchemaAlias>()
            .toEqualTypeOf<JsonSchemaImportResult>();
        expectTypeOf<JsonSchemaImportIssue>().toEqualTypeOf<{
            readonly path: readonly (string | number)[];
            readonly code: JsonSchemaImportCode;
            readonly message: string;
        }>();

        expect(lengthResult.ok).toBe(true);
        expect(contextLengthResult.ok).toBe(true);
        expect(rejectedContextLengthResult.ok).toBe(false);
        expect(positiveResult.ok).toBe(true);
        expect(decodedNumberText.ok).toBe(true);
        expect(namedDecodedNumberText.ok).toBe(true);
        expect(encodedTextNumber.ok).toBe(true);
        expect(decodedBuiltInNumber.ok).toBe(true);
        expect(encodedBuiltInNumber.ok).toBe(true);
        expect(decodedBuiltInBigInt.ok).toBe(true);
        expect(encodedBuiltInDate.ok).toBe(true);
        expect(caughtIssueCount.ok).toBe(true);
        expect(countResult.ok).toBe(true);
        expect(dateResult.ok).toBe(true);
        expect(bigIntResult.ok).toBe(true);
        expect(decodedText.ok).toBe(true);
        expect(safelyDecodedText.ok).toBe(true);
        await expect(decodedTextAsync).resolves.toMatchObject({
            ok: true
        });
        await expect(safelyDecodedTextAsync).resolves.toMatchObject({
            ok: true
        });
        expect(parsedText).toBe(42);
        expect(safeParsedText.success).toBe(true);
        expect(topParsedText).toBe(42);
        expect(topSafeParsedText.success).toBe(true);
        expect(zParsedText).toBe(42);
        expect(zSafeParsedText.success).toBe(true);
        await expect(parsedTextAsync).resolves.toBe(42);
        await expect(safeParsedTextAsync).resolves.toMatchObject({
            success: true
        });
        await expect(spaText).resolves.toMatchObject({
            success: true
        });
        await expect(topParsedTextAsync).resolves.toBe(42);
        await expect(topSafeParsedTextAsync).resolves.toMatchObject({
            success: true
        });
        await expect(topSpaText).resolves.toMatchObject({
            success: true
        });
        await expect(zParsedTextAsync).resolves.toBe(42);
        await expect(zSafeParsedTextAsync).resolves.toMatchObject({
            success: true
        });
        await expect(zSpaText).resolves.toMatchObject({
            success: true
        });
        expect(encodedNumber.ok).toBe(true);
        expect(safelyEncodedNumber.ok).toBe(true);
        await expect(encodedNumberAsync).resolves.toMatchObject({
            ok: true
        });
        await expect(safelyEncodedNumberAsync).resolves.toMatchObject({
            ok: true
        });
        expect(preprocessedResult.ok).toBe(true);
        expect(decodedObjectResult.ok).toBe(true);
        expect(codecObjectResult.ok).toBe(true);
        expect(encodedObjectResult.ok).toBe(true);
        expect(dateListResult.ok).toBe(true);
        expect(encodedDateListResult.ok).toBe(true);
        expect(dateTupleResult.ok).toBe(true);
        expect(encodedDateTupleResult.ok).toBe(true);
        expect(dateTupleRestResult.ok).toBe(true);
        expect(dateRecordResult.ok).toBe(true);
        expect(encodedDateRecordResult.ok).toBe(true);
        expect(namedDateRecordResult.ok).toBe(true);
        expect(looseDateRecordResult.ok).toBe(true);
        expect(dateMapResult.ok).toBe(true);
        expect(encodedDateMapResult.ok).toBe(true);
        expect(dateSetResult.ok).toBe(true);
        expect(encodedDateSetResult.ok).toBe(true);
        expect(chainImplemented("sea", 3)).toBe(true);
        await expect(asyncChainImplemented("sea")).resolves.toBe(3);
        expect(functionParameters[0]).toBe(t.string);
        expect(functionReturn).toBe(t.boolean);
        expect(chainParameters[1]).toBe(t.number);
        expect(chainReturn).toBe(t.boolean);
        expect(AppliedString.is("sea")).toBe(true);
        expect(AppliedDecoder.decode(" sea ")).toEqual({
            ok: true,
            value: "sea"
        });
        expect(flagResult.ok).toBe(true);
        expect(envFlagResult.ok).toBe(true);
        expect(implemented("sea", 3)).toBe(true);
        expect(asyncImplemented("sea")).toBeInstanceOf(Promise);
        expect(functionOptions.input.length).toBe(1);
        expect(functionInputShape.length).toBe(2);
        expect(prettifyError([])).toBe("Validation succeeded.");
        expect(tree.errors).toEqual([]);
        expect(importedJsonSchema.ok).toBe(true);
        expect(importedJsonSchemaAlias.ok).toBe(true);
        expect(jsonSchemaImportCode).toBe("unsupported_keyword");
        expect(stringBoolOptions.truthy?.[0]).toBe("yes");
    });

    test("preserves registry metadata helper types", () => {
        const local = registry<{ readonly title: string; readonly order: number }>();
        const localThroughTable = t.registry<{ readonly title: string }>();
        const registered = t.string.register(local, {
            order: 1,
            title: "String value"
        });
        const registeredThroughTable = t.number.register(localThroughTable, {
            title: "Number value"
        });
        const entries = local.entries();
        const firstEntry = entries[0];
        const metadataValue: GlobalRegistryMetadata = {
            id: "User",
            title: "User",
            custom: true
        };
        const docs = registry<GlobalRegistryMetadata>();
        docs.add(t.string, {
            id: "RegistryString",
            title: "Registry string"
        });
        const exportedRegistry = schemaRegistryToJsonSchema(docs);
        const exportedRegistryAlias = toJSONSchema(docs);
        const exportedWithMetadata = toJSONSchema(t.string, {
            metadata: docs
        });
        const exportedRegistryDocument: JsonSchemaRegistryDocument | undefined =
            exportedRegistry.ok ? exportedRegistry.value : undefined;

        globalRegistry.add(t.object({ name: t.string }), metadataValue);

        expectTypeOf<typeof local>()
            .toEqualTypeOf<SchemaRegistry<{ readonly title: string; readonly order: number }>>();
        expectTypeOf<typeof localThroughTable>()
            .toEqualTypeOf<SchemaRegistry<{ readonly title: string }>>();
        expectTypeOf<typeof entries>()
            .toEqualTypeOf<readonly SchemaRegistryEntry<{
                readonly title: string;
                readonly order: number;
            }>[]>();
        expectTypeOf<typeof registered>().toEqualTypeOf<typeof t.string>();
        expectTypeOf<typeof registeredThroughTable>().toEqualTypeOf<typeof t.number>();
        expectTypeOf<typeof metadataValue>().toEqualTypeOf<GlobalRegistryMetadata>();
        expectTypeOf<typeof exportedRegistry>()
            .toEqualTypeOf<ReturnType<typeof schemaRegistryToJsonSchema>>();
        expectTypeOf<typeof exportedRegistryAlias>()
            .toEqualTypeOf<ReturnType<typeof schemaRegistryToJsonSchema>>();
        expectTypeOf<typeof exportedRegistryDocument>()
            .toEqualTypeOf<JsonSchemaRegistryDocument | undefined>();

        expect(local.get(t.string)?.title).toBe("String value");
        expect(localThroughTable.get(t.number)?.title).toBe("Number value");
        expect(firstEntry?.metadata.title).toBe("String value");
        expect(registered).toBe(t.string);
        expect(registeredThroughTable).toBe(t.number);
        expect(isSchemaRegistryValue(local)).toBe(true);
        expect(isSchemaRegistryValue(t.string)).toBe(false);
        expect(exportedRegistry.ok).toBe(true);
        expect(exportedRegistryAlias.ok).toBe(true);
        expect(exportedWithMetadata.ok).toBe(true);
        expect(exportedRegistryDocument?.schemas["RegistryString"]).toBeDefined();
        expect(globalRegistry.has(t.object({ name: t.string }))).toBe(false);

        local.clear();
        expect(local.entries()).toEqual([]);
    });

    test("preserves async decoder inference", async () => {
        const KnownUser = t.asyncRefine(
            t.string,
            async (value) => await Promise.resolve(value.length > 0),
            "known_user"
        );
        const Length = t.asyncTransform(
            KnownUser,
            async (value) => await Promise.resolve(value.length)
        );
        const PositiveLength = t.asyncPipe(Length, t.number.int().gte(1));
        const PromisedLength = t.promise(PositiveLength);
        const FluentPromisedName = t.string.min(1).promise();
        const result = await PositiveLength.decodeAsync("ada");
        const promisedResult = await PromisedLength.decodeAsync(Promise.resolve("ada"));
        const fluentPromisedResult = await FluentPromisedName.decodeAsync(
            Promise.resolve("ada")
        );
        const parsed = PositiveLength.parseAsync("ada");
        const safelyParsed = PositiveLength.safeParseAsync("ada");
        const spaParsed = PositiveLength.spa("ada");
        const topParsed = parseAsync(PositiveLength, "ada");
        const topSafelyParsed = safeParseAsync(PositiveLength, "ada");
        const topSpaParsed = spa(PositiveLength, "ada");
        const topDecoded = decodeAsync(PositiveLength, "ada");
        const topSafelyDecoded = safeDecodeAsync(PositiveLength, "ada");

        expectTypeOf<InferAsyncDecoder<typeof KnownUser>>().toEqualTypeOf<string>();
        expectTypeOf<InferAsyncDecoder<typeof Length>>().toEqualTypeOf<number>();
        expectTypeOf<InferAsyncDecoder<typeof PositiveLength>>()
            .toEqualTypeOf<number>();
        expectTypeOf<InferAsyncDecoder<typeof PromisedLength>>()
            .toEqualTypeOf<number>();
        expectTypeOf<InferAsyncDecoder<typeof FluentPromisedName>>()
            .toEqualTypeOf<string>();
        expectTypeOf<typeof result>().toEqualTypeOf<CheckResult<number>>();
        expectTypeOf<typeof promisedResult>().toEqualTypeOf<CheckResult<number>>();
        expectTypeOf<typeof fluentPromisedResult>().toEqualTypeOf<CheckResult<string>>();
        expectTypeOf<typeof parsed>().toEqualTypeOf<Promise<number>>();
        expectTypeOf<typeof safelyParsed>().toEqualTypeOf<Promise<SafeParseResult<number>>>();
        expectTypeOf<typeof spaParsed>().toEqualTypeOf<Promise<SafeParseResult<number>>>();
        expectTypeOf<typeof topParsed>().toEqualTypeOf<Promise<number>>();
        expectTypeOf<typeof topSafelyParsed>().toEqualTypeOf<Promise<SafeParseResult<number>>>();
        expectTypeOf<typeof topSpaParsed>().toEqualTypeOf<Promise<SafeParseResult<number>>>();
        expectTypeOf<typeof topDecoded>().toEqualTypeOf<Promise<CheckResult<number>>>();
        expectTypeOf<typeof topSafelyDecoded>().toEqualTypeOf<Promise<CheckResult<number>>>();
        expect(result.ok).toBe(true);
        expect(promisedResult.ok).toBe(true);
        expect(fluentPromisedResult.ok).toBe(true);
        await expect(parsed).resolves.toBe(3);
        await expect(safelyParsed).resolves.toMatchObject({
            success: true
        });
        await expect(spaParsed).resolves.toMatchObject({
            success: true
        });
        await expect(topParsed).resolves.toBe(3);
        await expect(topSafelyParsed).resolves.toMatchObject({
            success: true
        });
        await expect(topSpaParsed).resolves.toMatchObject({
            success: true
        });
        await expect(topDecoded).resolves.toMatchObject({
            ok: true
        });
        await expect(topSafelyDecoded).resolves.toMatchObject({
            ok: true
        });
    });

    test("keeps brands nominal at compile time", () => {
        const UserId = t.string.brand<"UserId">();
        type UserId = Infer<typeof UserId>;
        const branded = "user_1" as UserId;
        const plain: string = branded;

        // @ts-expect-error rejected public type contract: plain string is not a branded UserId.
        const rejected: UserId = "user_1";

        expect(plain).toBe("user_1");
        expect(rejected).toBe("user_1");
    });

    test("preserves SeaBreeze builder subpath types", () => {
        const options: SeaBreezeBuilderOptions = {
            maxNodes: 64,
            maxFields: 16
        };
        const sea = createSeaBreeze(options);
        const id = sea.string();
        const age = sea.optional(sea.number());
        const shape: SeaBreezeShape = {
            id,
            age,
            tags: sea.array(sea.string())
        };
        const user = sea.object(shape);
        const compiled = sea.compile(user, {
            objectMode: "strict",
            mode: "safe",
            name: "isPublicTypeSeaBreezeUser"
        });
        const bundle = sea.emit(user, {
            mode: "safe"
        });
        const snapshot = sea.snapshot();
        const arena = new SeaBreezeArena(options);
        const object = arena.allocObject();
        arena.appendField(object, 1, arena.string, SeaBreezePresence.Required);

        expectTypeOf<typeof sea>().toEqualTypeOf<SeaBreezeBuilder>();
        expectTypeOf<typeof id>().toEqualTypeOf<SeaBreezeNodeId>();
        expectTypeOf<typeof age>().toEqualTypeOf<SeaBreezeOptionalField>();
        expectTypeOf<typeof user>().toEqualTypeOf<SeaBreezeNodeId>();
        expectTypeOf<typeof compiled>().toEqualTypeOf<SeaBreezeCompiledPredicate>();
        expectTypeOf<typeof bundle.source>().toEqualTypeOf<string>();
        expectTypeOf<typeof snapshot>().toEqualTypeOf<SeaBreezeBuilderSnapshot>();
        expectTypeOf<SeaBreezeBuilderCompileOptions["mode"]>()
            .toEqualTypeOf<CompileMode | undefined>();
        expectTypeOf<SeaBreezeBuilderEmitOptions["objectMode"]>()
            .toEqualTypeOf<"strict" | "passthrough" | "strip" | undefined>();
        expectTypeOf<SeaBreezeBuilderSchemaOptions["cycle"]>()
            .toEqualTypeOf<"unknown" | "error" | undefined>();
        expectTypeOf<SeaBreezeBuilderGraphOptions["optimize"]>()
            .toEqualTypeOf<boolean | undefined>();
        expect(compiled.is({
            id: "u1",
            tags: []
        })).toBe(true);
        expect(bundle.source).toContain("seaBreezePredicate");
        expect(snapshot.keyTable).toEqual(["", "id", "age", "tags"]);
    });

    test("rejects invalid builder inputs at compile time", () => {
        const runRejectedExamples = Date.now() < 0;

        if (runRejectedExamples) {
            // @ts-expect-error rejected public API call: union requires one or more guards.
            t.union();

            // @ts-expect-error rejected public API call: literal accepts only primitive literal values.
            t.literal({ value: 1 });

            // @ts-expect-error rejected public API call: array item must be a guard.
            t.array(t.string.schema);

            // @ts-expect-error rejected public API call: compile mode is closed.
            compile(t.string, { mode: "loose" });

            // @ts-expect-error rejected public API call: object properties must be guards.
            t.object({ broken: undefined });

            // @ts-expect-error rejected public API call: picked keys must exist.
            t.object({ id: t.string }).pick(["missing"]);

            // @ts-expect-error rejected public API call: transform mapper must accept narrowed input.
            t.transform(t.string, (value: number) => value);

            // @ts-expect-error rejected public API call: async predicate must accept narrowed input.
            t.asyncRefine(
                t.string,
                async (value: number) => await Promise.resolve(value > 0),
                "positive"
            );

            t.discriminatedUnion("kind", {
                // @ts-expect-error rejected public API call: case literal must match the case key.
                user: t.object({
                    kind: t.literal("order")
                })
            });

            t.discriminatedUnion("kind", {
                // @ts-expect-error rejected public API call: each case must require the discriminant.
                user: t.object({
                    id: t.string
                })
            });

            t.discriminatedUnion("kind", {
                // @ts-expect-error rejected public API call: optional discriminants are not dispatch-safe.
                user: t.object({
                    kind: t.optional(t.literal("user"))
                })
            });

            t.discriminatedUnion("kind", {
                // @ts-expect-error rejected public API call: each case must infer an object with the discriminant.
                user: t.string
            });
        }

        expect(runRejectedExamples).toBe(false);
    });
});
