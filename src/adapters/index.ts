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
 * @brief decode sync source.
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
 * @brief decode async source.
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
 * @brief read guard.
 */
function readGuard(value: unknown, label: string): Guard<unknown, Presence> {
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be a TypeSea guard or decoder`);
  }
  const guard = value as Partial<Guard<unknown, Presence>>;
  const schema = value["schema"];
  if (!isSchemaValue(schema) || typeof guard.check !== "function") {
    throw new TypeError(`${label} must be a TypeSea guard or decoder`);
  }
  return guard as Guard<unknown, Presence>;
}

/**
 * @brief read sync adapter source.
 */
function readSyncAdapterSource(source: unknown, label: string): void {
  if (isDecoderValue(source)) {
    return;
  }
  readGuard(source, label);
}

/**
 * @brief read fastify validator compiler source.
 * @details Normalizes a single validator source or a route-part source table into one selector.
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
  readFastifyCompilerMap(source);
  return (route: FastifyValidatorRoute): SyncAdapterSource => {
    const part = readFastifyRouteHttpPart(route);
    const selected = source[part];
    if (selected === undefined) {
      throw new TypeError(`Fastify validator source is missing ${part}`);
    }
    return selected;
  };
}

/**
 * @brief is guard value.
 * @details Performs the same structural guard check as `readGuard` without throwing.
 * @returns True when the value is a TypeSea guard object.
 */
function isGuardValue(value: unknown): value is Guard<unknown, Presence> {
  if (!isRecord(value)) {
    return false;
  }
  const guard = value as Partial<Guard<unknown, Presence>>;
  return isSchemaValue(value["schema"]) && typeof guard.check === "function";
}

/**
 * @brief read fastify compiler map.
 * @details Validates every present route-part source before Fastify starts compiling routes.
 * @post No result value is produced; malformed sources throw TypeError.
 */
function readFastifyCompilerMap(source: FastifyValidatorCompilerSourceMap): void {
  readOptionalFastifyCompilerPart(source, "body");
  readOptionalFastifyCompilerPart(source, "querystring");
  readOptionalFastifyCompilerPart(source, "params");
  readOptionalFastifyCompilerPart(source, "headers");
}

/**
 * @brief read optional fastify compiler part.
 * @details Checks one optional source-map slot without consulting prototype state.
 * @post No result value is produced; malformed present sources throw TypeError.
 */
function readOptionalFastifyCompilerPart(
  source: FastifyValidatorCompilerSourceMap,
  part: FastifyHttpPart
): void {
  if (!Object.prototype.hasOwnProperty.call(source, part)) {
    return;
  }
  const partSource = source[part];
  if (partSource === undefined) {
    throw new TypeError(`Fastify validator source for ${part} must be defined`);
  }
  readSyncAdapterSource(partSource, `Fastify validator source for ${part}`);
}

/**
 * @brief read fastify route http part.
 * @details Converts Fastify's route descriptor slot into TypeSea's closed part union.
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
 * @brief read async adapter source.
 */
function readAsyncAdapterSource(source: unknown, label: string): void {
  if (isAsyncDecoderValue(source) || isDecoderValue(source)) {
    return;
  }
  readGuard(source, label);
}

/**
 * @brief read fastify part.
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
 * @brief read fastify json schema options.
 * @details Copies only JSON Schema exporter options out of the adapter options object.
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
 * @brief read react hook form options.
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
 * @brief issues to react hook form errors.
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
 * @brief make react hook form error branch.
 * @details Allocates one null-prototype object so form field names cannot collide with inherited keys.
 * @returns Mutable branch owned by the caller.
 */
function makeReactHookFormErrorBranch(): MutableReactHookFormErrors {
  return Object.create(null) as MutableReactHookFormErrors;
}

/**
 * @brief insert react hook form issue.
 * @details Inserts one TypeSea issue into a nested React Hook Form error tree.
 * @param errors Borrowed output branch that receives the leaf error when absent.
 * @param issue Borrowed input issue; its path is converted into string map keys.
 * @param options Borrowed input message options used only for new leaf formatting.
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
 * @brief react hook form path key.
 * @details Converts one TypeSea path segment into the object key React Hook Form traverses.
 * @param segment Borrowed input path segment.
 * @returns Stable string key for object or array-index lookup.
 */
function reactHookFormPathKey(segment: PathSegment): string {
  return typeof segment === "number" ? String(segment) : segment;
}

/**
 * @brief freeze react hook form errors.
 * @details Recursively freezes the null-prototype tree after all issues have been inserted.
 * @param errors Borrowed mutable branch that becomes immutable before publication.
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
 * @brief is react hook form error branch.
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
 * @brief is record.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief empty errors.
 */
const emptyErrors: ReactHookFormErrors = Object.freeze({});

/**
 * @brief empty values.
 */
const emptyValues: Readonly<Record<string, never>> = Object.freeze({});
