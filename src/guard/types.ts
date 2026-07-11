/**
 * @file types.ts
 * @brief Public guard type contracts.
 */

import type { CheckResult, Issue, PathSegment } from "../issue/index.js";
import type {
    BaseDecoder,
    CatchInput,
    DecodeSource,
    InferDecoder,
    TransformContext
} from "../decoder/index.js";
import type { BaseAsyncDecoder } from "../async/index.js";
import type { Graph } from "../ir/index.js";
import type {
    JsonSchema,
    JsonSchemaExportIssue,
    JsonSchemaOptions
} from "../json-schema/types.js";
import type { SchemaRegistry } from "../registry/index.js";
import type { Result } from "../result/index.js";
import type { Schema, SchemaMetadataInput } from "../schema/index.js";
import type { StandardSchemaV1Props } from "../standard/index.js";
import type { ArrayGuard } from "./array.js";
import type { BaseGuard } from "./base.js";
import type { TypeSeaAssertionError } from "./error.js";

/** @brief Type-only slot carrying a guard's validated value. */
export declare const TypeSymbol: unique symbol;

/** @brief Type-only slot carrying object-property presence semantics. */
export declare const PresenceSymbol: unique symbol;

/** @brief Type-only slot carrying nominal brand metadata. */
export declare const BrandSymbol: unique symbol;

/** @brief Type-only authenticity slot for reusable semantic checks. */
export declare const WithCheckSymbol: unique symbol;

/**
 * @brief Object-property presence mode carried by a guard.
 * @details Presence is a type-level property of guards, not a runtime schema
 * wrapper by itself. Object builders use it to decide required versus optional
 * field semantics during shape construction.
 */
export type Presence = "required" | "optional" | "exactOptional";

/**
 * @brief Runtime value accepted by a guard after presence is applied.
 */
export type RuntimeValue<TValue, TPresence extends Presence> =
    TPresence extends "optional" ? TValue | undefined : TValue;

type PrimitiveValue =
    | string
    | number
    | bigint
    | boolean
    | symbol
    | null
    | undefined;

/**
 * @brief Output type produced by readonly guards.
 * @details Mirrors TypeScript's shallow readonly containers while leaving
 * primitive values unchanged.
 */
export type ReadonlyValue<TValue> =
    TValue extends PrimitiveValue
        ? TValue
        : TValue extends (...args: never[]) => unknown
        ? TValue
        : TValue extends Map<infer TKey, infer TItem>
            ? ReadonlyMap<TKey, TItem>
            : TValue extends Set<infer TItem>
                ? ReadonlySet<TItem>
                : TValue extends readonly unknown[]
                    ? Readonly<TValue>
                    : TValue extends object
                        ? Readonly<TValue>
                        : TValue;

/**
 * @brief Optional diagnostic payload supplied to `context.addIssue()`.
 * @details The path is relative to the current refinement node. Message is
 * copied into the emitted Issue without running the message catalog renderer.
 */
export type SuperRefineIssueInput =
    string |
    {
        readonly path?: readonly PathSegment[];
        readonly message?: string;
        readonly [key: string]: unknown;
    };

/**
 * @brief Mutable issue sink exposed to Zod-style `with()` callbacks.
 * @details The sink intentionally supports only the operation TypeSea can
 * normalize without adopting Zod's full issue object model. Extra fields on
 * pushed objects are accepted and ignored after `message` and `path` are copied.
 */
export interface WithCheckIssueSink {
    readonly length: number;
    push(...issues: (SuperRefineIssueInput | undefined)[]): number;
}

/**
 * @brief Payload passed to `guard.with()` semantic callbacks.
 * @details This mirrors Zod's callback shape while keeping the reported issue
 * format in TypeSea's smaller refinement issue domain.
 */
export interface WithCheckPayload<TValue = unknown> {
    readonly value: TValue;
    readonly issues: WithCheckIssueSink;
}

/**
 * @brief Zod-style semantic callback accepted by `guard.with()`.
 */
export type WithCheckCallback<TValue = unknown> =
    (payload: WithCheckPayload<TValue>) => void;

/**
 * @brief Constructor-owned reusable check source.
 * @details Created by `t.check(callback)` and consumed by `guard.with(source)`.
 * The symbol field is type-only; runtime authenticity is tracked in a WeakMap.
 */
export interface WithCheckSource<TValue = unknown> {
    readonly [WithCheckSymbol]: (value: TValue) => void;
}

/**
 * @brief One argument accepted by `guard.with()`.
 */
export type WithCheckInput<TValue = unknown> =
    | WithCheckCallback<TValue>
    | WithCheckSource<TValue>;

/**
 * @brief Zod-style options accepted by boolean refinements.
 * @details `error` becomes the emitted issue message, `path` is relative to the
 * refinement node, and `abort` is preserved for diagnostic collectors that
 * produce multiple refinement issues.
 */
/** @brief Conditional-refinement payload containing the value and prior issues. */
export interface RefineWhenPayload<TValue = unknown> {
    readonly value: TValue;
    readonly issues: readonly Issue[];
}

/** @brief Predicate deciding whether a refinement should execute. */
export type RefineWhenPredicate<TValue = unknown> =
    (payload: RefineWhenPayload<TValue>) => boolean;

/** @brief Message, path, abort, and scheduling options for refinements. */
export interface RefineOptions<TValue = unknown> {
    readonly error?: string | undefined;
    readonly message?: string | undefined;
    readonly path?: readonly PathSegment[] | undefined;
    readonly abort?: boolean | undefined;
    readonly when?: RefineWhenPredicate<TValue> | undefined;
}

/** @brief String shorthand or structured options accepted by `refine()`. */
export type RefineParams<TValue = unknown> = string | RefineOptions<TValue>;

/**
 * @brief Return value accepted from parse-time error mappers.
 * @details Strings become the final issue message. Returning undefined yields
 * control to the diagnostic already attached to the issue.
 */
export type ParseErrorResult =
    | string
    | {
        readonly message: string;
    }
    | undefined;

/**
 * @brief Context passed to parse-time error mappers.
 * @details The root input is exposed without walking the failing path. That
 * keeps hostile getter defenses intact while still matching the useful part of
 * Zod's per-parse customization surface.
 */
export interface ParseIssueContext {
    readonly input: unknown;
    readonly issue: Issue;
}

/**
 * @brief User callback used by parse-time message customization.
 * @param issue Issue being rendered.
 * @param context Root input and issue metadata.
 * @returns Replacement message, message object, or undefined to keep fallback text.
 */
export type ParseErrorMapper = (
    issue: Issue,
    context: ParseIssueContext
) => ParseErrorResult;

/**
 * @brief Static or callback parse-time error customization.
 */
export type ParseErrorInput = string | ParseErrorMapper;

/**
 * @brief Zod-style parse and safeParse options.
 * @details `error` accepts either one static message or a mapper run after
 * diagnostic validation fails. It never affects boolean `is()` validation.
 */
export interface ParseOptions {
    readonly error?: ParseErrorInput | undefined;
    readonly reportInput?: boolean | undefined;
}

/**
 * @brief Static message option accepted by schema check builders.
 * @details Builder-level messages are stored in the immutable schema, so only
 * string data enters the validation plan. Use parse options for callbacks.
 */
export interface CheckMessageOptions {
    readonly error?: string | undefined;
    readonly message?: string | undefined;
    readonly required_error?: string | undefined;
    readonly invalid_type_error?: string | undefined;
}

/**
 * @brief Static check message shorthand.
 */
export type CheckMessageInput = string | CheckMessageOptions;

/**
 * @brief Context object passed to super refinement callbacks.
 * @details `addIssue()` marks the refinement as failed. Optional payloads let
 * callback-style checks point at a nested path or attach a pre-rendered message.
 */
export interface SuperRefineContext {
    addIssue(issue?: SuperRefineIssueInput): void;
}

/**
 * @brief Successful Zod-style parse result.
 */
export interface SafeParseSuccess<TValue> {
    readonly success: true;
    readonly data: TValue;
}

/**
 * @brief Failed Zod-style parse result.
 */
export interface SafeParseFailure {
    readonly success: false;
    readonly error: TypeSeaAssertionError;
}

/**
 * @brief Zod-compatible parse result union.
 */
export type SafeParseResult<TValue> =
    | SafeParseSuccess<TValue>
    | SafeParseFailure;

/**
 * @brief Zod-style schema definition facade.
 * @details This object is for migration tooling and ecosystem probes. Validation,
 * compilation, and JSON Schema export continue to use TypeSea's frozen schema tree.
 */
export interface ZodDef {
    readonly typeName: string;
    readonly type: string;
    readonly schema: Schema;
    readonly shape?: (() => Readonly<Record<string, unknown>>) | undefined;
    readonly element?: unknown;
    readonly options?: readonly unknown[] | undefined;
    readonly values?: unknown;
    readonly value?: unknown;
    readonly unknownKeys?: string | undefined;
    readonly catchall?: unknown;
    readonly innerType?: unknown;
    readonly items?: readonly unknown[] | undefined;
    readonly rest?: unknown;
    readonly keyType?: unknown;
    readonly valueType?: unknown;
    readonly left?: unknown;
    readonly right?: unknown;
    readonly discriminator?: string | undefined;
    readonly constructor?: unknown;
    readonly className?: string | undefined;
    readonly propertyKey?: string | undefined;
    readonly effect?: string | undefined;
    readonly checks?: readonly unknown[] | undefined;
    readonly getter?: (() => Schema) | undefined;
}

/**
 * @brief Infer the runtime value type accepted by a guard.
 * @details Optional guards add undefined at the type level so object shape
 * inference and standalone guard usage agree on accepted values.
 */
export type Infer<TGuard> =
    TGuard extends {
        readonly [TypeSymbol]: infer TValue;
        readonly [PresenceSymbol]: infer TPresence extends Presence;
    }
        ? RuntimeValue<TValue, TPresence>
        : never;

/**
 * @brief Extract the raw value type carried by a guard.
 */
export type GuardValue<TGuard> =
    TGuard extends { readonly [TypeSymbol]: infer TValue } ? TValue : never;

/**
 * @brief Extract the presence mode carried by a guard.
 */
export type GuardPresence<TGuard> =
    TGuard extends {
        readonly [PresenceSymbol]: infer TPresence extends Presence;
    } ? TPresence : never;

/**
 * @brief Infer the value exposed by `unwrap()`.
 * @details Array guards unwrap to their item guard. Other wrapper guards unwrap
 * by removing nullable and undefined shells from the value domain.
 */
export type UnwrappedGuardValue<TGuard> =
    TGuard extends ArrayGuard<infer TItem, Presence>
        ? TItem
        : Exclude<GuardValue<TGuard>, null | undefined>;

/**
 * @brief Phantom intersection used for compile-time nominal brands.
 * @details No runtime field is materialized; validators keep the same data
 * representation as the unbranded value.
 */
export type Brand<TValue, TBrand extends string> = TValue & {
    readonly [BrandSymbol]: TBrand;
};

/**
 * @brief Public structural guard contract.
 * @details The symbols carry inference-only type state. The schema property is
 * the runtime handle used by interpreters, compilers, and graph introspection.
 */
export interface Guard<TValue, TPresence extends Presence = "required"> {
    readonly [TypeSymbol]: TValue;
    readonly [PresenceSymbol]: TPresence;
    readonly _input: RuntimeValue<TValue, TPresence>;
    readonly _output: RuntimeValue<TValue, TPresence>;
    readonly _presence: TPresence;
    readonly schema: Schema;
    readonly def: ZodDef;
    readonly _def: ZodDef;
    readonly _zod: Readonly<{
        readonly def: ZodDef;
        readonly constr: unknown;
        readonly traits: ReadonlySet<string>;
        readonly bag: Readonly<Record<string, never>>;
        readonly version: Readonly<{
            readonly major: number;
            readonly minor: number;
            readonly patch: number;
        }>;
        readonly deferred: readonly unknown[];
    }>;
    readonly description: string | undefined;
    readonly type: string;
    readonly keyType: unknown;
    readonly valueType: unknown;
    readonly "~standard": StandardSchemaV1Props<
        RuntimeValue<TValue, TPresence>,
        RuntimeValue<TValue, TPresence>
    >;

    /**
     * @brief Test whether a runtime value is accepted.
     * @details This is the boolean hot path. It avoids diagnostic allocation and
     * is the method used by compiled predicates for tight validation loops.
     * @param value Candidate runtime value.
     * @returns True when the guard accepts the value.
     */
    is(value: unknown): value is RuntimeValue<TValue, TPresence>;

    /**
     * @brief Validate a runtime value and return explicit issues on failure.
     * @details Use this path when callers need structured diagnostics. Success
     * returns the original value with the guard's inferred runtime type.
     * @param value Candidate runtime value.
     * @returns Check result with either the accepted value or frozen issues.
     */
    check<TNext>(
        source: WithCheckSource<RuntimeValue<TValue, TPresence>> & ((guard: this) => TNext)
    ): TNext;

    check(
        source: WithCheckSource<RuntimeValue<TValue, TPresence>>
    ): BaseGuard<TValue, TPresence>;

    check(
        value: unknown,
        options?: Partial<ParseOptions>
    ): CheckResult<RuntimeValue<TValue, TPresence>>;

    /**
     * @brief Validate a runtime value and keep only the first issue.
     * @details This diagnostic path is intended for hot rejection checks where
     * callers need one machine-readable failure and do not want full-tree issue
     * collection. Success returns the original value with the guard's inferred type.
     * @param value Candidate runtime value.
     * @returns Check result with at most one frozen issue on failure.
     */
    checkFirst(
        value: unknown,
        options?: Partial<ParseOptions>
    ): CheckResult<RuntimeValue<TValue, TPresence>>;

    /**
     * @brief Validate a value and return it or throw TypeSeaAssertionError.
     * @details This is the Zod-style throwing parse surface. The existing
     * Result-returning `check()` method remains the preferred TypeSea-native API.
     * @param value Candidate runtime value.
     * @returns Accepted value.
     * @throws TypeSeaAssertionError when validation fails.
     */
    parse(value: unknown, options?: Partial<ParseOptions>): RuntimeValue<TValue, TPresence>;

    /**
     * @brief Validate a value and return a Zod-style tagged result.
     * @param value Candidate runtime value.
     * @returns `success/data` on acceptance or `success/error` on failure.
     */
    safeParse(
        value: unknown,
        options?: Partial<ParseOptions>
    ): SafeParseResult<this["_output"]>;

    /**
     * @brief Zod-style decode alias for plain guard schemas.
     * @param value Candidate runtime value.
     * @returns Accepted value or throws TypeSeaAssertionError.
     */
    decode(value: unknown, options?: Partial<ParseOptions>): RuntimeValue<TValue, TPresence>;

    /**
     * @brief Zod-style safeDecode alias for plain guard schemas.
     * @param value Candidate runtime value.
     * @returns Tagged parse result.
     */
    safeDecode(
        value: unknown,
        options?: Partial<ParseOptions>
    ): SafeParseResult<RuntimeValue<TValue, TPresence>>;

    /**
     * @brief Zod-style encode alias for plain guard schemas.
     * @param value Candidate runtime value.
     * @returns Accepted value or throws TypeSeaAssertionError.
     */
    encode(value: unknown, options?: Partial<ParseOptions>): RuntimeValue<TValue, TPresence>;

    /**
     * @brief Zod-style safeEncode alias for plain guard schemas.
     * @param value Candidate runtime value.
     * @returns Tagged parse result.
     */
    safeEncode(
        value: unknown,
        options?: Partial<ParseOptions>
    ): SafeParseResult<RuntimeValue<TValue, TPresence>>;

    /**
     * @brief Promise-returning parse compatibility method.
     * @details TypeSea guards are synchronous unless async validation wrappers are
     * used, but this method removes migration friction for Zod-style consumers.
     * @param value Candidate runtime value.
     * @returns Promise resolving to the accepted value.
     */
    parseAsync(
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<RuntimeValue<TValue, TPresence>>;

    /**
     * @brief Promise-returning safe parse compatibility method.
     * @param value Candidate runtime value.
     * @returns Promise resolving to a Zod-style tagged result.
     */
    safeParseAsync(
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<SafeParseResult<RuntimeValue<TValue, TPresence>>>;

    /**
     * @brief Promise-returning decode alias for plain guard schemas.
     * @param value Candidate runtime value.
     * @returns Promise resolving to the accepted value.
     */
    decodeAsync(
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<RuntimeValue<TValue, TPresence>>;

    /**
     * @brief Promise-returning safeDecode alias for plain guard schemas.
     * @param value Candidate runtime value.
     * @returns Promise resolving to a tagged parse result.
     */
    safeDecodeAsync(
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<SafeParseResult<RuntimeValue<TValue, TPresence>>>;

    /**
     * @brief Promise-returning encode alias for plain guard schemas.
     * @param value Candidate runtime value.
     * @returns Promise resolving to the accepted value.
     */
    encodeAsync(
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<RuntimeValue<TValue, TPresence>>;

    /**
     * @brief Promise-returning safeEncode alias for plain guard schemas.
     * @param value Candidate runtime value.
     * @returns Promise resolving to a tagged parse result.
     */
    safeEncodeAsync(
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<SafeParseResult<RuntimeValue<TValue, TPresence>>>;

    /**
     * @brief Alias for safeParseAsync.
     * @param value Candidate runtime value.
     * @returns Promise resolving to a Zod-style tagged result.
     */
    spa(
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<SafeParseResult<RuntimeValue<TValue, TPresence>>>;

    /**
     * @brief Test whether undefined is accepted by this schema.
     * @returns True when undefined passes normal validation.
     */
    isOptional(): boolean;

    /**
     * @brief Test whether null is accepted by this schema.
     * @returns True when null passes normal validation.
     */
    isNullable(): boolean;

    /**
     * @brief Validate a runtime value or throw TypeSeaAssertionError.
     * @details This convenience wrapper is intentionally explicit in the method
     * name because most TypeSea APIs prefer Result-based control flow.
     * @param value Candidate runtime value.
     */
    assert(
        value: unknown,
        options?: Partial<ParseOptions>
    ): asserts value is RuntimeValue<TValue, TPresence>;

    /**
     * @brief Return the optimized validation graph for introspection.
     * @details The graph is immutable and may be reused by tooling, debugging,
     * or code generation without exposing schema internals directly.
     * @returns Optimized Sea-of-Nodes validation graph.
     */
    graph(): Graph;

    /**
     * @brief Export this guard through the JSON Schema emitter.
     * @param options Optional dialect and schema id options.
     * @returns Result carrying a frozen JSON Schema document or export issues.
     */
    toJSONSchema(
        options?: Partial<JsonSchemaOptions>
    ): Result<JsonSchema, readonly JsonSchemaExportIssue[]>;

    /**
     * @brief Register metadata in an external schema registry.
     * @param registry Registry receiving metadata for this schema identity.
     * @param metadata Metadata payload accepted by the registry.
     * @returns This guard unchanged.
     */
    register<TMetadata>(
        registry: SchemaRegistry<TMetadata>,
        metadata: TMetadata
    ): Guard<TValue, TPresence>;

    /**
     * @brief Attach JSON Schema/documentation metadata.
     * @param metadata Title, description, or examples to store on the schema.
     * @returns New guard with the same validation semantics.
     */
    metadata(metadata: SchemaMetadataInput): BaseGuard<TValue, TPresence>;

    /**
     * @brief Attach JSON Schema/documentation metadata with Zod-compatible naming.
     * @param metadata Title, description, or examples to store on the schema.
     * @returns New guard with the same validation semantics.
     */
    meta(metadata: SchemaMetadataInput): BaseGuard<TValue, TPresence>;

    /**
     * @brief Attach a human title annotation.
     * @param title Short schema title.
     * @returns New guard with the same validation semantics.
     */
    title(title: string): BaseGuard<TValue, TPresence>;

    /**
     * @brief Attach a description annotation.
     * @param description Human-readable schema description.
     * @returns New guard with the same validation semantics.
     */
    describe(description: string): BaseGuard<TValue, TPresence>;

    /**
     * @brief Append one example annotation.
     * @param value Example value stored for JSON Schema/documentation export.
     * @returns New guard with the same validation semantics.
     */
    example(value: unknown): BaseGuard<TValue, TPresence>;

    /**
     * @brief Attach a local diagnostic message.
     * @param message Message copied onto child issues that lack a message.
     * @returns New guard with unchanged validation semantics.
     */
    message(message: string): BaseGuard<TValue, TPresence>;

    /**
     * @brief Freeze values accepted by parse-like APIs.
     * @returns New guard whose inferred value type is shallow readonly.
     */
    readonly(): BaseGuard<ReadonlyValue<TValue>, TPresence>;

    /**
     * @brief Expose the inner schema carried by optional, nullable, or array nodes.
     * @details Annotation wrappers such as metadata and messages are skipped so
     * fluent documentation calls do not hide the payload schema.
     * @returns New guard for the unwrapped payload schema.
     */
    unwrap<TGuard extends Guard<unknown, Presence>>(
        this: TGuard
    ): BaseGuard<UnwrappedGuardValue<TGuard>>;

    /**
     * @brief Reject optional presence and explicit undefined values.
     * @details Nullability is preserved; `nullish().nonoptional()` accepts null
     * but rejects absent object keys and standalone undefined values.
     * @returns New required guard without undefined acceptance.
     */
    nonoptional<TGuard extends Guard<unknown, Presence>>(
        this: TGuard
    ): BaseGuard<Exclude<GuardValue<TGuard>, undefined>>;

    /**
     * @brief Run a guard-to-guard helper inside a fluent chain.
     * @details This mirrors Zod's apply helper: TypeSea calls the callback with
     * this guard and returns exactly what the callback returns.
     * @param callback Helper function receiving this guard.
     * @returns The callback result.
     */
    apply<TResult>(callback: (guard: this) => TResult): TResult;

    /**
     * @brief Return an equivalent immutable guard.
     * @details TypeSea guards are immutable; the returned value preserves the
     * same validation semantics and fluent surface.
     * @returns Equivalent guard value.
     */
    clone(): this;

    /**
     * @brief Mark this guard optional for object shape usage.
     * @details Optionality changes object field presence and standalone
     * inference by adding undefined; it does not mutate the source guard.
     * @returns New guard carrying optional presence.
     */
    optional(): BaseGuard<TValue, "optional">;

    /**
     * @brief Allow object-key omission without accepting standalone undefined.
     * @returns New guard carrying exact optional object presence.
     */
    exactOptional(): BaseGuard<TValue, "exactOptional">;

    /**
     * @brief Allow the explicit undefined value.
     * @details This widens the value domain while preserving the field presence
     * mode. In object shapes, an undefinedable required field still has to be
     * present.
     * @returns New guard whose value type includes undefined.
     */
    undefinedable(): BaseGuard<TValue | undefined, TPresence>;

    /**
     * @brief Allow the explicit null value.
     * @details Nullability is modeled as a value-domain wrapper rather than an
     * object-presence change, so it composes predictably with optional fields.
     * @returns New guard whose value type includes null.
     */
    nullable(): BaseGuard<TValue | null, TPresence>;

    /**
     * @brief Allow null, undefined, and absent object keys.
     * @details This matches Zod's `nullish()` shorthand while preserving
     * TypeSea's separation between object-key presence and value-domain wrappers.
     * @returns New optional guard whose value type includes null.
     */
    nullish(): BaseGuard<TValue | null, "optional">;

    /**
     * @brief Build an array guard from this guard.
     * @details The item schema is the current guard's runtime value domain after
     * presence has been applied, matching direct `is` semantics.
     * @returns Guard that accepts arrays of values accepted by this guard.
     */
    array(): BaseGuard<RuntimeValue<TValue, TPresence>[]>;

    /**
     * @brief Apply a compile-time brand without changing runtime data.
     * @details Brands are phantom types. Validation behavior and emitted IR stay
     * identical to the unbranded guard.
     * @returns New guard carrying the requested nominal brand.
     */
    brand<TBrand extends string>(): BaseGuard<Brand<TValue, TBrand>, TPresence>;

    /**
     * @brief Append a user refinement predicate.
     * @details Refinements run after the base schema accepts the value. They are
     * intentionally opaque to JSON Schema and AOT export because the predicate is
     * arbitrary user code.
     * @param predicate Function that returns literal true for success.
     * @param name Diagnostic name for failed refinements.
     * @returns New guard with the refinement appended.
     */
    refine(
        predicate: (value: RuntimeValue<TValue, TPresence>) => boolean,
        params?: RefineParams<RuntimeValue<TValue, TPresence>>
    ): BaseGuard<TValue, TPresence>;

    /**
     * @brief Append a callback-style semantic refinement.
     * @details The callback runs after the base schema accepts the value. Calling
     * `context.addIssue()` marks the refinement as failed.
     * @param callback Function that can report a semantic failure through context.
     * @param name Diagnostic name for failed refinements.
     * @returns New guard with the refinement appended.
     */
    superRefine(
        callback: (
            value: RuntimeValue<TValue, TPresence>,
            context: SuperRefineContext
        ) => void,
        name?: string
    ): BaseGuard<TValue, TPresence>;

    /**
     * @brief Append one or more Zod-style semantic callbacks.
     * @details Each callback receives `{ value, issues }`. Pushing an issue marks
     * the refinement as failed; pushed objects may carry Zod-like extra fields,
     * but TypeSea only stores `message` and relative `path`.
     * @param callbacks Semantic callbacks run after structural validation.
     * @returns New guard with the callbacks appended.
     */
    with(
        ...checks: WithCheckInput<RuntimeValue<TValue, TPresence>>[]
    ): BaseGuard<TValue, TPresence>;
    with(
        ...checks: WithCheckInput[]
    ): BaseGuard<TValue, TPresence>;

    /**
     * @brief Decode this guard and map the accepted value.
     * @details The returned decoder owns output production. The guard predicate
     * remains a pure validation/narrowing contract.
     * @param mapper Function applied only after validation succeeds.
     * @returns Decoder for the mapped output type.
     */
    transform<TNext>(
        mapper: (value: RuntimeValue<TValue, TPresence>, context: TransformContext) => TNext
    ): BaseDecoder<TNext>;

    /**
     * @brief Zod-style output rewrite alias.
     * @details TypeSea exposes output-producing logic as decoders, so this is a
     * decoder-returning alias for `transform()`.
     * @param mapper Function applied only after validation succeeds.
     * @returns Decoder for the mapped output type.
     */
    overwrite<TNext>(
        mapper: (value: RuntimeValue<TValue, TPresence>, context: TransformContext) => TNext
    ): BaseDecoder<TNext>;

    /**
     * @brief Decode this guard and then validate or decode through another source.
     * @param next Downstream guard or decoder.
     * @returns Decoder for the downstream output type.
     */
    pipe<TNext extends DecodeSource>(
        next: TNext
    ): BaseDecoder<InferDecoder<TNext>>;

    /**
     * @brief Return a fallback output when input is undefined.
     * @param fallback Output value or zero-argument producer.
     * @returns Decoder that short-circuits undefined input to the fallback.
     */
    default(
        fallback: Exclude<RuntimeValue<TValue, TPresence>, undefined> |
            (() => Exclude<RuntimeValue<TValue, TPresence>, undefined>)
    ): BaseDecoder<Exclude<RuntimeValue<TValue, TPresence>, undefined>>;

    /**
     * @brief Substitute an input before validation when input is undefined.
     * @param fallback Input value passed through this guard.
     * @returns Decoder that validates either the original input or fallback.
     */
    prefault(fallback: unknown): BaseDecoder<RuntimeValue<TValue, TPresence>>;

    /**
     * @brief Return a fallback output after validation failure.
     * @param fallback Output value or zero-argument producer.
     * @returns Decoder that converts failed validation into fallback success.
     */
    catch(
        fallback: CatchInput<RuntimeValue<TValue, TPresence>>
    ): BaseDecoder<RuntimeValue<TValue, TPresence>>;

    /**
     * @brief Decode a native Promise through this guard.
     * @returns Async decoder for the resolved value accepted by this guard.
     */
    promise(): BaseAsyncDecoder<RuntimeValue<TValue, TPresence>>;

    /**
     * @brief Build a union with another guard.
     * @details Union order is preserved so diagnostics and generated code follow
     * the same branch precedence as the fluent call chain.
     * @param other Guard accepted as the second union arm.
     * @returns Guard accepting values accepted by either guard.
     */
    or<TOther extends Guard<unknown, Presence>>(
        other: TOther
    ): BaseGuard<RuntimeValue<TValue, TPresence> | Infer<TOther>>;

    or<TOther extends DecodeSource>(
        other: TOther
    ): BaseDecoder<RuntimeValue<TValue, TPresence> | InferDecoder<TOther>>;

    /**
     * @brief Build an intersection with another guard.
     * @details Both guards must accept the same value. The resulting type is the
     * TypeScript intersection of their inferred runtime domains.
     * @param other Guard accepted as the second intersection arm.
     * @returns Guard accepting only values accepted by both guards.
     */
    intersect<TOther extends Guard<unknown, Presence>>(
        other: TOther
    ): BaseGuard<RuntimeValue<TValue, TPresence> & Infer<TOther>>;

    intersect<TOther extends DecodeSource>(
        other: TOther
    ): BaseDecoder<RuntimeValue<TValue, TPresence> & InferDecoder<TOther>>;

    /**
     * @brief Alias for intersect().
     * @param other Guard accepted as the second intersection arm.
     * @returns Guard accepting only values accepted by both guards.
     */
    and<TOther extends Guard<unknown, Presence>>(
        other: TOther
    ): BaseGuard<RuntimeValue<TValue, TPresence> & Infer<TOther>>;

    and<TOther extends DecodeSource>(
        other: TOther
    ): BaseDecoder<RuntimeValue<TValue, TPresence> & InferDecoder<TOther>>;

    /**
     * @brief Require one own data property after this guard succeeds.
     * @details This is a safe property proof: only own data descriptors are
     * accepted, so validation does not execute getters.
     * @param key Own string property key to inspect.
     * @param value Guard applied to the property value.
     * @returns Guard carrying the base type plus the property proof.
     */
    property<
        const TKey extends string,
        TGuard extends Guard<unknown, Presence>
    >(
        key: TKey,
        value: TGuard
    ): BaseGuard<
        RuntimeValue<TValue, TPresence> & Readonly<Record<TKey, Infer<TGuard>>>
    >;
}
