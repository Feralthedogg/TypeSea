import {
    type AsyncDecodeSource,
    type AsyncDecoder,
    type InferAsyncDecoder,
    isAsyncDecoderValue
} from "../async/index.js";
import {
    type DecodeSource,
    type InferDecoder,
    isDecoderValue
} from "../decoder/index.js";
import {
    TypeSeaAssertionError,
    type Guard,
    type Presence
} from "../guard/index.js";
import { isConstructedGuard } from "../guard/registry.js";
import type { CheckResult, Issue, PathSegment } from "../issue/index.js";
import {
    formatIssue,
    type IssueMessageOptions
} from "../message/index.js";
import type { Result } from "../result/index.js";
import {
    toJsonSchema,
    type JsonSchema,
    type JsonSchemaDialect,
    type JsonSchemaExportIssue
} from "../json-schema/index.js";
import { isSchemaValue } from "../schema/index.js";

/**
 * @brief sync adapter source.
 */
export type SyncAdapterSource = DecodeSource;

/**
 * @brief infer sync adapter.
 */
export type InferSyncAdapter<TSource> = InferDecoder<TSource>;

/**
 * @brief infer adapter.
 */
export type InferAdapter<TSource> = InferAsyncDecoder<TSource>;

/**
 * @brief trpc parser.
 */
export interface TrpcParser<TValue> {
    readonly parse: (value: unknown) => TValue;
}

/**
 * @brief async trpc parser.
 */
export interface AsyncTrpcParser<TValue> {
    readonly parseAsync: (value: unknown) => Promise<TValue>;
}

/**
 * @brief fastify route schema.
 */
export interface FastifyRouteSchema {
    readonly body?: JsonSchema;
    readonly querystring?: JsonSchema;
    readonly params?: JsonSchema;
    readonly headers?: JsonSchema;
    readonly response?: Readonly<Record<string, JsonSchema>>;
}

/**
 * @brief fastify http part.
 */
export type FastifyHttpPart =
    | "body"
    | "querystring"
    | "params"
    | "headers";

/**
 * @brief fastify route schema options.
 */
export interface FastifyRouteSchemaOptions {
    readonly part: FastifyHttpPart;

    /**
   * @brief schema id.
   * @details Forwards a concrete `$schema` marker to the JSON Schema exporter.
   * @invariant When omitted, TypeSea emits its conservative default dialect marker.
   */
    readonly schemaId?: string;

    /**
   * @brief dialect.
   * @details Selects the JSON Schema keyword set used by generated route schemas.
   * @invariant Tuple schemas remain validator-visible for the selected dialect.
   */
    readonly dialect?: JsonSchemaDialect;
}

/**
 * @brief fastify validator route.
 */
export interface FastifyValidatorRoute {
    readonly schema: unknown;
    readonly method: string | undefined;
    readonly url: string | undefined;
    readonly httpPart: string | undefined;
}

/**
 * @brief fastify validation result.
 */
export type FastifyValidationResult =
    | { readonly value: unknown }
    | { readonly error: TypeSeaAssertionError };

/**
 * @brief fastify validator.
 */
export type FastifyValidator = (value: unknown) => FastifyValidationResult;

/**
 * @brief fastify validator compiler.
 */
export type FastifyValidatorCompiler = (
    route: FastifyValidatorRoute
) => FastifyValidator;

/**
 * @brief fastify validator compiler source map.
 * @details Maps one Fastify payload channel to the TypeSea source that owns that channel.
 * @invariant Only supported Fastify HTTP parts are consulted by the compiler.
 */
export type FastifyValidatorCompilerSourceMap = Readonly<
    Partial<Record<FastifyHttpPart, SyncAdapterSource>>
>;

/**
 * @brief fastify validator compiler source.
 * @details Accepts the historical single-source form or an explicit route-part map.
 * @invariant A mapped source is selected by `route.httpPart` before validation.
 */
export type FastifyValidatorCompilerSource =
    | SyncAdapterSource
    | FastifyValidatorCompilerSourceMap;

type FastifyCompilerSourceLookup = Readonly<
    Record<FastifyHttpPart, SyncAdapterSource | undefined>
>;

/**
 * @brief react hook form field error.
 */
export interface ReactHookFormFieldError {
    readonly type: string;
    readonly message: string;
}

/**
 * @brief react hook form errors.
 * @details Defines the nested field-error tree React Hook Form traverses by path segment.
 * @invariant Branches are frozen objects and leaves are frozen `ReactHookFormFieldError` values.
 */
export interface ReactHookFormErrors {
    readonly [key: string]: ReactHookFormFieldError | ReactHookFormErrors;
}

/**
 * @brief react hook form resolver result.
 */
export interface ReactHookFormResolverResult<TValue> {
    readonly values: TValue | Readonly<Record<string, never>>;
    readonly errors: ReactHookFormErrors;
}

/**
 * @brief react hook form resolver.
 */
export type ReactHookFormResolver<TValue> = (
    values: unknown,
    context: unknown,
    options: unknown
) => Promise<ReactHookFormResolverResult<TValue>>;

/**
 * @brief react hook form resolver options.
 */
export interface ReactHookFormResolverOptions {
    readonly messages: Partial<IssueMessageOptions> | undefined;
}

/**
 * @brief to trpc parser.
 */
export function toTrpcParser<TSource extends SyncAdapterSource>(
    source: TSource
): TrpcParser<InferSyncAdapter<TSource>> {
    readSyncAdapterSource(source, "tRPC parser source");
    return Object.freeze({
        parse(value: unknown): InferSyncAdapter<TSource> {
            const result = decodeSyncSource<InferSyncAdapter<TSource>>(source, value);
            if (result.ok) {
                return result.value;
            }
            throw new TypeSeaAssertionError(result.error);
        }
    });
}

/**
 * @brief to async trpc parser.
 */
export function toAsyncTrpcParser<TSource extends AsyncDecodeSource>(
    source: TSource
): AsyncTrpcParser<InferAdapter<TSource>> {
    readAsyncAdapterSource(source, "async tRPC parser source");
    return Object.freeze({
        async parseAsync(value: unknown): Promise<InferAdapter<TSource>> {
            const result = await decodeAsyncSource<InferAdapter<TSource>>(source, value);
            if (result.ok) {
                return result.value;
            }
            throw new TypeSeaAssertionError(result.error);
        }
    });
}

/**
 * @brief to fastify route schema.
 */
export function toFastifyRouteSchema(
    guard: Guard<unknown, Presence>,
    options?: Partial<FastifyRouteSchemaOptions>
): Result<FastifyRouteSchema, readonly JsonSchemaExportIssue[]> {
    const part = readFastifyPart(options);
    const schema = toJsonSchema(guard, readFastifyJsonSchemaOptions(options));
    if (!schema.ok) {
        return schema;
    }
    return {
        ok: true,
        value: Object.freeze({
            [part]: schema.value
        })
    };
}

/**
 * @brief to fastify validator compiler.
 */
export function toFastifyValidatorCompiler(
    source: FastifyValidatorCompilerSource
): FastifyValidatorCompiler {
    const readSource = readFastifyValidatorCompilerSource(source);
    return Object.freeze((route: FastifyValidatorRoute): FastifyValidator => {
        const selectedSource = readSource(route);
        return (value: unknown): FastifyValidationResult => {
            const result = decodeSyncSource<unknown>(selectedSource, value);
            if (result.ok) {
                return {
                    value: result.value
                };
            }
            return {
                error: new TypeSeaAssertionError(result.error)
            };
        };
    });
}

/**
 * @brief to react hook form resolver.
 */
export function toReactHookFormResolver<TSource extends AsyncDecodeSource>(
    source: TSource,
    options?: Partial<ReactHookFormResolverOptions>
): ReactHookFormResolver<InferAdapter<TSource>> {
    const config = readReactHookFormOptions(options);
    readAsyncAdapterSource(source, "React Hook Form resolver source");
    return async (
        values: unknown
    ): Promise<ReactHookFormResolverResult<InferAdapter<TSource>>> => {
        const result = await decodeAsyncSource<InferAdapter<TSource>>(source, values);
        if (result.ok) {
            return Object.freeze({
                values: result.value,
                errors: emptyErrors
            });
        }
        return Object.freeze({
            values: emptyValues,
            errors: issuesToReactHookFormErrors(result.error, config.messages)
        });
    };
}

/**
 * @brief Run a synchronous adapter source against one submitted value.
 * @param source Guard or decoder selected for the adapter call.
 * @param value Framework payload being validated.
 * @returns TypeSea Result produced by the selected source.
 * @details Decoders already own their result shape. Guard-like values are first
 * normalized through readGuard so structural receivers cannot smuggle inherited
 * schema or check fields into adapter execution.
 */
function decodeSyncSource<TValue>(
    source: unknown,
    value: unknown
): CheckResult<TValue> {
    if (isDecoderValue(source)) {
        return source.decode(value) as CheckResult<TValue>;
    }
    const guard = readGuard(source, "adapter source");
    return guard.check(value) as CheckResult<TValue>;
}

/**
 * @brief Run a possibly asynchronous adapter source.
 * @param source Guard, decoder, or async decoder selected for the adapter call.
 * @param value Framework payload being validated.
 * @returns Promise resolving to a TypeSea Result.
 * @details The ordering keeps native async decoders on their own private runner
 * path while preserving the same hardened guard normalization used by sync
 * adapters.
 */
async function decodeAsyncSource<TValue>(
    source: unknown,
    value: unknown
): Promise<CheckResult<TValue>> {
    if (isAsyncDecoderValue(source)) {
        return await (source as AsyncDecoder<TValue>).decodeAsync(value);
    }
    if (isDecoderValue(source)) {
        return source.decode(value) as CheckResult<TValue>;
    }
    const guard = readGuard(source, "adapter source");
    return guard.check(value) as CheckResult<TValue>;
}

/**
 * @brief Normalize a guard-like adapter source.
 * @param value Candidate adapter source.
 * @param label Message prefix for TypeError diagnostics.
 * @returns Guard object safe to call through the adapter layer.
 * @throws TypeError when schema or check are not valid guard fields.
 * @details Constructed guards use registry identity. Structural guard support is
 * limited to own data `schema` and `check` slots so adapter entry points do not
 * execute prototype getters supplied by a framework payload or plugin wrapper.
 */
function readGuard(value: unknown, label: string): Guard<unknown, Presence> {
    if (isConstructedGuard(value)) {
        return value;
    }
    if (!isRecord(value)) {
        throw new TypeError(`${label} must be a TypeSea guard or decoder`);
    }
    const guard = value as Partial<Guard<unknown, Presence>>;
    const schema = readOwnDataProperty(value, "schema");
    const check = readOwnDataProperty(value, "check");
    if (!isSchemaValue(schema) || typeof check !== "function") {
        throw new TypeError(`${label} must be a TypeSea guard or decoder`);
    }
    return guard as Guard<unknown, Presence>;
}

/**
 * @brief Validate a source accepted by sync-only adapters.
 * @param source Candidate guard or decoder.
 * @param label Message prefix for TypeError diagnostics.
 */
function readSyncAdapterSource(source: unknown, label: string): void {
    if (isDecoderValue(source)) {
        return;
    }
    readGuard(source, label);
}

/**
 * @brief Normalize Fastify validator sources into a route selector.
 * @details A single source applies to all route parts. A source map is copied
 * into a null-prototype table so route selection cannot observe later prototype
 * mutations or inherited body/querystring/params/headers fields.
 * @param source Guard, decoder, or route-part source table supplied by the user.
 * @returns Source selector used by the Fastify compiler callback.
 */
function readFastifyValidatorCompilerSource(
    source: FastifyValidatorCompilerSource
): (route: FastifyValidatorRoute) => SyncAdapterSource {
    if (isDecoderValue(source) || isGuardValue(source)) {
        readSyncAdapterSource(source, "Fastify validator source");
        return (): SyncAdapterSource => source;
    }
    if (!isRecord(source)) {
        throw new TypeError("Fastify validator source must be a TypeSea guard, decoder, or route map");
    }
    /*
     * Route maps are copied once before Fastify requests per-route validators.
     * Later route selection reads the hardened copy, not caller-controlled
     * prototype state.
     */
    const sourceMap = readFastifyCompilerMap(source);
    return (route: FastifyValidatorRoute): SyncAdapterSource => {
        const part = readFastifyRouteHttpPart(route);
        const selected = sourceMap[part];
        if (selected === undefined) {
            throw new TypeError(`Fastify validator source is missing ${part}`);
        }
        return selected;
    };
}

/**
 * @brief Test whether a value is usable as a guard source.
 * @details Performs the same structural guard check as `readGuard` without
 * throwing, which lets the Fastify source normalizer distinguish a single guard
 * from a route-part map.
 * @param value Candidate source.
 * @returns True when the value is a TypeSea guard object.
 */
function isGuardValue(value: unknown): value is Guard<unknown, Presence> {
    if (isConstructedGuard(value)) {
        return true;
    }
    if (!isRecord(value)) {
        return false;
    }
    const schema = readOwnDataProperty(value, "schema");
    const check = readOwnDataProperty(value, "check");
    return isSchemaValue(schema) && typeof check === "function";
}

/**
 * @brief Copy and validate a Fastify route-part source map.
 * @details Validates every present route-part source before Fastify starts
 * compiling routes. The returned table is a frozen null-prototype copy owned by
 * TypeSea.
 * @param source Route-part source table supplied by the user.
 * @returns Frozen null-prototype map containing only own data-property sources.
 * @post Accessor properties are rejected without executing getters.
 */
function readFastifyCompilerMap(
    source: FastifyValidatorCompilerSourceMap
): FastifyCompilerSourceLookup {
    /*
     * Null prototype prevents inherited body/querystring/params/headers slots
     * from becoming validator sources during route selection.
     */
    const target = Object.create(null) as Record<FastifyHttpPart, SyncAdapterSource | undefined>;
    readOptionalFastifyCompilerPart(source, target, "body");
    readOptionalFastifyCompilerPart(source, target, "querystring");
    readOptionalFastifyCompilerPart(source, target, "params");
    readOptionalFastifyCompilerPart(source, target, "headers");
    return Object.freeze(target);
}

/**
 * @brief Copy one optional Fastify route-part source.
 * @details Copies one own data-property source without consulting prototype
 * state. Missing parts stay undefined so route selection can fail with the
 * concrete missing part later.
 * @param source User supplied route-part source table.
 * @param target Hardened lookup receiving validated sources.
 * @param part Fastify HTTP part to copy.
 * @post Malformed present sources throw TypeError before the compiler is returned.
 */
function readOptionalFastifyCompilerPart(
    source: FastifyValidatorCompilerSourceMap,
    target: Record<FastifyHttpPart, SyncAdapterSource | undefined>,
    part: FastifyHttpPart
): void {
    /*
     * getOwnPropertyDescriptor observes own metadata without reading the value
     * through the prototype chain or invoking an accessor getter.
     */
    const descriptor = Object.getOwnPropertyDescriptor(source, part);
    if (descriptor === undefined) {
        return;
    }
    if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        throw new TypeError(`Fastify validator source for ${part} must be a data property`);
    }
    const partSource: unknown = descriptor.value;
    if (partSource === undefined) {
        throw new TypeError(`Fastify validator source for ${part} must be defined`);
    }
    readSyncAdapterSource(partSource, `Fastify validator source for ${part}`);
    target[part] = partSource as SyncAdapterSource;
}

/**
 * @brief Normalize Fastify route metadata into a supported HTTP part.
 * @details Converts Fastify's route descriptor slot into TypeSea's closed part
 * union so one validator source is never silently reused for a different part.
 * @param route Fastify validator route descriptor.
 * @returns Validated Fastify HTTP part.
 */
function readFastifyRouteHttpPart(route: FastifyValidatorRoute): FastifyHttpPart {
    switch (route.httpPart) {
        case "body":
        case "querystring":
        case "params":
        case "headers":
            return route.httpPart;
        default:
            throw new TypeError("Fastify validator route httpPart is invalid");
    }
}

/**
 * @brief Validate a source accepted by async-capable adapters.
 * @param source Candidate guard, decoder, or async decoder.
 * @param label Message prefix for TypeError diagnostics.
 * @details Async decoders and sync decoders already prove identity through
 * private registries. Guard-like values still pass through readGuard.
 */
function readAsyncAdapterSource(source: unknown, label: string): void {
    if (isAsyncDecoderValue(source) || isDecoderValue(source)) {
        return;
    }
    readGuard(source, label);
}

/**
 * @brief Resolve the Fastify route part used for JSON Schema output.
 * @param options Optional Fastify route schema options.
 * @returns The selected HTTP part, defaulting to body.
 */
function readFastifyPart(
    options: Partial<FastifyRouteSchemaOptions> | undefined
): FastifyHttpPart {
    if (options?.part === undefined) {
        return "body";
    }
    switch (options.part) {
        case "body":
        case "querystring":
        case "params":
        case "headers":
            return options.part;
        default:
            throw new TypeError("Fastify schema part is invalid");
    }
}

/**
 * @brief Extract JSON Schema exporter options from Fastify options.
 * @details Copies only JSON Schema exporter options out of the adapter options
 * object. The returned object avoids exact-optional undefined fields.
 * @param options Optional Fastify route schema options.
 * @returns Partial JSON Schema options without exact-optional undefined slots.
 */
function readFastifyJsonSchemaOptions(
    options: Partial<FastifyRouteSchemaOptions> | undefined
): Partial<{
    readonly dialect: JsonSchemaDialect;
    readonly schemaId: string;
}> {
    const output: {
        dialect?: JsonSchemaDialect;
        schemaId?: string;
    } = {};
    if (options?.dialect !== undefined) {
        output.dialect = options.dialect;
    }
    if (options?.schemaId !== undefined) {
        output.schemaId = options.schemaId;
    }
    return output;
}

/**
 * @brief Normalize React Hook Form resolver options.
 * @param options Optional resolver options.
 * @returns Required options object used by the resolver.
 * @throws TypeError when options are not object-like.
 */
function readReactHookFormOptions(
    options: Partial<ReactHookFormResolverOptions> | undefined
): Required<ReactHookFormResolverOptions> {
    if (options === undefined) {
        return {
            messages: undefined
        };
    }
    if (!isRecord(options)) {
        throw new TypeError("React Hook Form resolver options must be an object");
    }
    return {
        messages: options.messages
    };
}

/**
 * @brief Convert TypeSea issues into React Hook Form field errors.
 * @param issues Frozen TypeSea issue vector.
 * @param options Message formatting options.
 * @returns Frozen nested FieldErrors-compatible object.
 * @details React Hook Form resolves nested fields by object traversal, so
 * TypeSea paths are inserted as nested branches rather than flat dotted keys.
 */
function issuesToReactHookFormErrors(
    issues: readonly Issue[],
    options: Partial<IssueMessageOptions> | undefined
): ReactHookFormErrors {
    const errors = makeReactHookFormErrorBranch();
    for (let index = 0; index < issues.length; index += 1) {
        const issue = issues[index];
        if (issue === undefined) {
            continue;
        }
        insertReactHookFormIssue(errors, issue, options);
    }
    return freezeReactHookFormErrors(errors);
}

/**
 * @brief mutable react hook form errors.
 * @details Internal null-prototype tree used while mapping TypeSea issues to field errors.
 * @invariant Branch objects have a null prototype; leaf error objects do not.
 */
interface MutableReactHookFormErrors {
    [key: string]: ReactHookFormFieldError | MutableReactHookFormErrors;
}

/**
 * @brief Allocate one mutable React Hook Form error branch.
 * @details Null prototype branches keep field names such as `constructor` or
 * `__proto__` from colliding with inherited object members.
 * @returns Mutable branch owned by the caller.
 */
function makeReactHookFormErrorBranch(): MutableReactHookFormErrors {
    return Object.create(null) as MutableReactHookFormErrors;
}

/**
 * @brief Insert one TypeSea issue into a nested React Hook Form tree.
 * @details Existing leaf errors are preserved because React Hook Form reports
 * the first error for a field by default.
 * @param errors Mutable root branch receiving the leaf error when absent.
 * @param issue Issue whose path is converted into branch keys.
 * @param options Message options used only when a leaf is created.
 * @post Existing first errors are preserved to match React Hook Form resolver behavior.
 */
function insertReactHookFormIssue(
    errors: MutableReactHookFormErrors,
    issue: Issue,
    options: Partial<IssueMessageOptions> | undefined
): void {
    const path = issue.path.length === 0 ? rootIssuePath : issue.path;
    let cursor = errors;
    for (let index = 0; index < path.length - 1; index += 1) {
        const segment = path[index];
        if (segment === undefined) {
            continue;
        }
        const key = reactHookFormPathKey(segment);
        const child = cursor[key];
        if (child === undefined) {
            const branch = makeReactHookFormErrorBranch();
            cursor[key] = branch;
            cursor = branch;
            continue;
        }
        if (!isReactHookFormErrorBranch(child)) {
            return;
        }
        cursor = child;
    }
    const last = path[path.length - 1];
    if (last === undefined) {
        return;
    }
    const key = reactHookFormPathKey(last);
    if (Object.prototype.hasOwnProperty.call(cursor, key)) {
        return;
    }
    cursor[key] = Object.freeze({
        type: issue.code,
        message: issue.message ?? formatIssue(issue, options)
    });
}

/**
 * @brief Normalize one TypeSea path segment for React Hook Form traversal.
 * @details Converts one TypeSea path segment into the object key React Hook Form traverses.
 * @param segment Path segment from a TypeSea issue.
 * @returns Stable string key for object or array-index lookup.
 */
function reactHookFormPathKey(segment: PathSegment): string {
    return typeof segment === "number" ? String(segment) : segment;
}

/**
 * @brief Publish the completed React Hook Form error tree as immutable data.
 * @details Recursively freezes the null-prototype tree after all issues have been inserted.
 * @param errors Mutable branch that becomes immutable before publication.
 * @returns Frozen React Hook Form error tree.
 */
function freezeReactHookFormErrors(
    errors: MutableReactHookFormErrors
): ReactHookFormErrors {
    const keys = Object.keys(errors);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined) {
            continue;
        }
        const child = errors[key];
        if (isReactHookFormErrorBranch(child)) {
            errors[key] = freezeReactHookFormErrors(child);
        }
    }
    return Object.freeze(errors);
}

/**
 * @brief Test whether a React Hook Form node is an internal branch.
 * @details Distinguishes internal branch objects from frozen leaf error objects.
 * @param value Candidate branch or leaf error value.
 * @returns True when value is a null-prototype branch object.
 */
function isReactHookFormErrorBranch(
    value: unknown
): value is MutableReactHookFormErrors {
    return typeof value === "object" &&
        value !== null &&
        Object.getPrototypeOf(value) === null;
}

/**
 * @brief root issue path.
 * @details Module-scope path used when a TypeSea issue points at the submitted root value.
 * @invariant The singleton is never mutated after module initialization.
 */
const rootIssuePath: readonly PathSegment[] = Object.freeze(["root"]);

/**
 * @brief Accept non-array objects before structured field reads.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Read one own data slot from an adapter input object.
 * @param value Object being normalized.
 * @param key Field name or symbol.
 * @returns Stored field value, or undefined when absent.
 */
function readOwnDataProperty(
    value: object,
    key: PropertyKey
): unknown {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        return undefined;
    }
    return descriptor.value;
}

/**
 * @brief Shared immutable success errors object for React Hook Form.
 * @details Reusing this object avoids allocating a fresh empty tree on every
 * successful resolver call.
 */
const emptyErrors: ReactHookFormErrors = Object.freeze({});

/**
 * @brief Shared immutable values object used when resolver validation fails.
 * @details React Hook Form expects failed resolvers to return no accepted values.
 */
const emptyValues: Readonly<Record<string, never>> = Object.freeze({});
