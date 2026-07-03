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
 * @brief sync adapter source type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type SyncAdapterSource = DecodeSource;

/**
 * @brief infer sync adapter type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type InferSyncAdapter<TSource> = InferDecoder<TSource>;

/**
 * @brief infer adapter type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type InferAdapter<TSource> = InferAsyncDecoder<TSource>;

/**
 * @brief trpc parser interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface TrpcParser<TValue> {

  /**
   * @brief parse field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly parse: (value: unknown) => TValue;
}

/**
 * @brief async trpc parser interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface AsyncTrpcParser<TValue> {

  /**
   * @brief parse async field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly parseAsync: (value: unknown) => Promise<TValue>;
}

/**
 * @brief fastify route schema interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface FastifyRouteSchema {

  /**
   * @brief body field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly body?: JsonSchema;

  /**
   * @brief querystring field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly querystring?: JsonSchema;

  /**
   * @brief params field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly params?: JsonSchema;

  /**
   * @brief headers field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly headers?: JsonSchema;

  /**
   * @brief response field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly response?: Readonly<Record<string, JsonSchema>>;
}

/**
 * @brief fastify http part type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type FastifyHttpPart =
  | "body"
  | "querystring"
  | "params"
  | "headers";

/**
 * @brief fastify route schema options interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface FastifyRouteSchemaOptions {

  /**
   * @brief part field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly part: FastifyHttpPart;

  /**
   * @brief schema id field contract.
   * @details Forwards a concrete `$schema` marker to the JSON Schema exporter.
   * @invariant When omitted, TypeSea emits its conservative default dialect marker.
   */
  readonly schemaId?: string;

  /**
   * @brief dialect field contract.
   * @details Selects the JSON Schema keyword set used by generated route schemas.
   * @invariant Tuple schemas remain validator-visible for the selected dialect.
   */
  readonly dialect?: JsonSchemaDialect;
}

/**
 * @brief fastify validator route interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface FastifyValidatorRoute {

  /**
   * @brief schema field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly schema: unknown;

  /**
   * @brief method field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly method: string | undefined;

  /**
   * @brief url field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly url: string | undefined;

  /**
   * @brief http part field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly httpPart: string | undefined;
}

/**
 * @brief fastify validation result type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type FastifyValidationResult =
  | { readonly value: unknown }
  | { readonly error: TypeSeaAssertionError };

/**
 * @brief fastify validator type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type FastifyValidator = (value: unknown) => FastifyValidationResult;

/**
 * @brief fastify validator compiler type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type FastifyValidatorCompiler = (
  route: FastifyValidatorRoute
) => FastifyValidator;

/**
 * @brief fastify validator compiler source map type alias contract.
 * @details Maps one Fastify payload channel to the TypeSea source that owns that channel.
 * @invariant Only supported Fastify HTTP parts are consulted by the compiler.
 */
export type FastifyValidatorCompilerSourceMap = Readonly<
  Partial<Record<FastifyHttpPart, SyncAdapterSource>>
>;

/**
 * @brief fastify validator compiler source type alias contract.
 * @details Accepts the historical single-source form or an explicit route-part map.
 * @invariant A mapped source is selected by `route.httpPart` before validation.
 */
export type FastifyValidatorCompilerSource =
  | SyncAdapterSource
  | FastifyValidatorCompilerSourceMap;

/**
 * @brief react hook form field error interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface ReactHookFormFieldError {

  /**
   * @brief type field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly type: string;

  /**
   * @brief message field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly message: string;
}

/**
 * @brief react hook form errors interface contract.
 * @details Defines the nested field-error tree React Hook Form traverses by path segment.
 * @invariant Branches are frozen objects and leaves are frozen `ReactHookFormFieldError` values.
 */
export interface ReactHookFormErrors {
  readonly [key: string]: ReactHookFormFieldError | ReactHookFormErrors;
}

/**
 * @brief react hook form resolver result interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface ReactHookFormResolverResult<TValue> {

  /**
   * @brief values field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly values: TValue | Readonly<Record<string, never>>;

  /**
   * @brief errors field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly errors: ReactHookFormErrors;
}

/**
 * @brief react hook form resolver type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type ReactHookFormResolver<TValue> = (
  values: unknown,
  context: unknown,
  options: unknown
) => Promise<ReactHookFormResolverResult<TValue>>;

/**
 * @brief react hook form resolver options interface contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export interface ReactHookFormResolverOptions {

  /**
   * @brief messages field contract.
   * @details Documents one concrete slot in the parent layout so the data shape is visible at the declaration site.
   * @invariant Storage follows the readonly or mutable qualifier written on this declaration.
   */
  readonly messages: Partial<IssueMessageOptions> | undefined;
}

/**
 * @brief to trpc parser function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param source Borrowed input slot named source; validation or normalization happens before stored state changes.
 * @returns Result for to trpc parser; ownership of newly created aggregates is transferred to the caller.
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
 * @brief to async trpc parser function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param source Borrowed input slot named source; validation or normalization happens before stored state changes.
 * @returns Result for to async trpc parser; ownership of newly created aggregates is transferred to the caller.
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
 * @brief to fastify route schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param guard Borrowed input slot named guard; validation or normalization happens before stored state changes.
 * @param options Borrowed input slot named options; validation or normalization happens before stored state changes.
 * @returns Result for to fastify route schema; ownership of newly created aggregates is transferred to the caller.
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
 * @brief to fastify validator compiler function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param source Borrowed input slot named source; validation or normalization happens before stored state changes.
 * @returns Result for to fastify validator compiler; ownership of newly created aggregates is transferred to the caller.
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
 * @brief to react hook form resolver function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param source Borrowed input slot named source; validation or normalization happens before stored state changes.
 * @param options Borrowed input slot named options; validation or normalization happens before stored state changes.
 * @returns Result for to react hook form resolver; ownership of newly created aggregates is transferred to the caller.
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
 * @brief decode sync source function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param source Borrowed input slot named source; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for decode sync source; ownership of newly created aggregates is transferred to the caller.
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
 * @brief decode async source function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param source Borrowed input slot named source; validation or normalization happens before stored state changes.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for decode async source; ownership of newly created aggregates is transferred to the caller.
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
 * @brief read guard function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @param label Borrowed input slot named label; validation or normalization happens before stored state changes.
 * @returns Result for read guard; ownership of newly created aggregates is transferred to the caller.
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
 * @brief read sync adapter source function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param source Borrowed input slot named source; validation or normalization happens before stored state changes.
 * @param label Borrowed input slot named label; validation or normalization happens before stored state changes.
 * @post No result value is produced; effects are limited to the documented receiver or output buffer.
 */
function readSyncAdapterSource(source: unknown, label: string): void {
  if (isDecoderValue(source)) {
    return;
  }
  readGuard(source, label);
}

/**
 * @brief read fastify validator compiler source function contract.
 * @details Normalizes a single validator source or a route-part source table into one selector.
 * @param source Borrowed input slot named source; validation happens before route compilation.
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
 * @brief is guard value function contract.
 * @details Performs the same structural guard check as `readGuard` without throwing.
 * @param value Borrowed input slot named value; validation does not execute user callbacks.
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
 * @brief read fastify compiler map function contract.
 * @details Validates every present route-part source before Fastify starts compiling routes.
 * @param source Borrowed input slot named source; only supported route-part keys are read.
 * @post No result value is produced; malformed sources throw TypeError.
 */
function readFastifyCompilerMap(source: FastifyValidatorCompilerSourceMap): void {
  readOptionalFastifyCompilerPart(source, "body");
  readOptionalFastifyCompilerPart(source, "querystring");
  readOptionalFastifyCompilerPart(source, "params");
  readOptionalFastifyCompilerPart(source, "headers");
}

/**
 * @brief read optional fastify compiler part function contract.
 * @details Checks one optional source-map slot without consulting prototype state.
 * @param source Borrowed input slot named source; route-part entries are not mutated.
 * @param part Borrowed input slot named part; controls which source-map slot is read.
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
 * @brief read fastify route http part function contract.
 * @details Converts Fastify's route descriptor slot into TypeSea's closed part union.
 * @param route Borrowed input slot named route; no route object mutation is performed.
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
 * @brief read async adapter source function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param source Borrowed input slot named source; validation or normalization happens before stored state changes.
 * @param label Borrowed input slot named label; validation or normalization happens before stored state changes.
 * @post No result value is produced; effects are limited to the documented receiver or output buffer.
 */
function readAsyncAdapterSource(source: unknown, label: string): void {
  if (isAsyncDecoderValue(source) || isDecoderValue(source)) {
    return;
  }
  readGuard(source, label);
}

/**
 * @brief read fastify part function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param options Borrowed input slot named options; validation or normalization happens before stored state changes.
 * @returns Result for read fastify part; ownership of newly created aggregates is transferred to the caller.
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
 * @brief read fastify json schema options function contract.
 * @details Copies only JSON Schema exporter options out of the adapter options object.
 * @param options Borrowed input slot named options; validation or normalization happens before stored state changes.
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
 * @brief read react hook form options function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param options Borrowed input slot named options; validation or normalization happens before stored state changes.
 * @returns Result for read react hook form options; ownership of newly created aggregates is transferred to the caller.
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
 * @brief issues to react hook form errors function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @param options Borrowed input slot named options; validation or normalization happens before stored state changes.
 * @returns Result for issues to react hook form errors; ownership of newly created aggregates is transferred to the caller.
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
 * @brief mutable react hook form errors interface contract.
 * @details Internal null-prototype tree used while mapping TypeSea issues to field errors.
 * @invariant Branch objects have a null prototype; leaf error objects do not.
 */
interface MutableReactHookFormErrors {
  [key: string]: ReactHookFormFieldError | MutableReactHookFormErrors;
}

/**
 * @brief make react hook form error branch function contract.
 * @details Allocates one null-prototype object so form field names cannot collide with inherited keys.
 * @returns Mutable branch owned by the caller.
 */
function makeReactHookFormErrorBranch(): MutableReactHookFormErrors {
  return Object.create(null) as MutableReactHookFormErrors;
}

/**
 * @brief insert react hook form issue function contract.
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
 * @brief react hook form path key function contract.
 * @details Converts one TypeSea path segment into the object key React Hook Form traverses.
 * @param segment Borrowed input path segment.
 * @returns Stable string key for object or array-index lookup.
 */
function reactHookFormPathKey(segment: PathSegment): string {
  return typeof segment === "number" ? String(segment) : segment;
}

/**
 * @brief freeze react hook form errors function contract.
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
 * @brief is react hook form error branch function contract.
 * @details Distinguishes internal branch objects from frozen leaf error objects.
 * @param value Borrowed input slot named value.
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
 * @brief root issue path constant contract.
 * @details Module-scope path used when a TypeSea issue points at the submitted root value.
 * @invariant The singleton is never mutated after module initialization.
 */
const rootIssuePath: readonly PathSegment[] = Object.freeze(["root"]);

/**
 * @brief is record function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param value Borrowed input slot named value; validation or normalization happens before stored state changes.
 * @returns Result for is record; ownership of newly created aggregates is transferred to the caller.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief empty errors constant contract.
 * @details Module-scope storage with stable identity, created once and reused by callers.
 * @invariant Initialization happens during module load and later code treats the binding as fixed.
 */
const emptyErrors: ReactHookFormErrors = Object.freeze({});

/**
 * @brief empty values constant contract.
 * @details Module-scope storage with stable identity, created once and reused by callers.
 * @invariant Initialization happens during module load and later code treats the binding as fixed.
 */
const emptyValues: Readonly<Record<string, never>> = Object.freeze({});
