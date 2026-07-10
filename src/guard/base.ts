/**
 * @file base.ts
 * @brief Base guard implementation.
 */

import { PresenceTag, SchemaTag } from "../kind/index.js";
import {
    catchValue,
    defaultValue,
    pipe as pipeDecoder,
    prefault as prefaultDecoder,
    transform as transformDecoder,
    type BaseDecoder,
    type CatchInput,
    type DecodeSource,
    type InferDecoder,
    type TransformContext
} from "../decoder/index.js";
import type { PromiseAsyncDecoder } from "../async/index.js";
import { checkSchema, isSchema } from "../evaluate/index.js";
import { makeValidationPlan } from "../plan/index.js";
import {
    registerGuardMetadata,
    type SchemaRegistry
} from "../registry/index.js";
import { freezeIssueArray, type CheckResult, type Issue } from "../issue/index.js";
import type { Graph } from "../ir/index.js";
import {
    err,
    type Result
} from "../result/index.js";
import { schemaToJsonSchema } from "../json-schema/export.js";
import {
    type JsonSchema,
    type JsonSchemaExportIssue,
    type JsonSchemaOptions
} from "../json-schema/types.js";
import {
    descriptionMetadata,
    exampleMetadata,
    mergeSchemaMetadata,
    normalizeUnionSchema,
    nonoptionalSchema,
    readSchemaMetadata,
    titleMetadata,
    type Schema,
    type SchemaMetadata,
    type SchemaMetadataInput,
    unwrapSchema
} from "../schema/index.js";
import { makeStandardSchemaProps, type StandardSchemaV1Props } from "../standard/index.js";
import { TypeSeaAssertionError } from "./error.js";
import {
    checkRefinementInput,
    readConstructorSchema,
    readGuardSchema
} from "./read.js";
import { applyParseOptions } from "./parse-options.js";
import { defineReadonlyProperty, isStrictTrue } from "./props.js";
import { FrozenReadonlySet } from "./readonly-set.js";
import { registerConstructedGuard } from "./registry.js";
import type { ArrayGuard } from "./array.js";
import type {
    Brand,
    Guard,
    GuardValue,
    Infer,
    Presence,
    PresenceSymbol,
    ParseOptions,
    RuntimeValue,
    ReadonlyValue,
    RefineParams,
    SafeParseResult,
    SuperRefineContext,
    WithCheckInput,
    WithCheckSource,
    TypeSymbol,
    UnwrappedGuardValue,
    ZodDef
} from "./types.js";
import {
    collectSuperRefineIssues,
    runSuperRefine
} from "./super-refine.js";
import {
    applyWithCheckSource,
    collectWithCheckIssues,
    isWithCheckSource,
    readWithCheckInputs,
    runWithChecks
} from "./with-check.js";
import { readRefineOptions } from "./refine-options.js";
import { makeZodDef } from "./zod-def.js";

type ArraySchemaRecord = Extract<Schema, { readonly tag: typeof SchemaTag.Array }>;
type ArrayGuardFactory = <TItem>(schema: ArraySchemaRecord) => ArrayGuard<TItem>;
type GuardRuntimeValue<TValue, TPresence extends Presence> =
    RuntimeValue<TValue, TPresence>;
type GuardPromiseFactory = <TValue, TPresence extends Presence>(
    source: Guard<TValue, TPresence>
) => PromiseAsyncDecoder<GuardRuntimeValue<TValue, TPresence>>;
type GuardDefaultInput<TValue, TPresence extends Presence> =
    GuardRuntimeValue<TValue, TPresence> |
    (() => GuardRuntimeValue<TValue, TPresence>);
type GuardCatchInput<TValue, TPresence extends Presence> =
    CatchInput<GuardRuntimeValue<TValue, TPresence>>;

let arrayGuardFactory: ArrayGuardFactory | undefined;
let guardPromiseFactory: GuardPromiseFactory | undefined;

/**
 * @brief Register the concrete array guard factory.
 * @param factory Constructor wrapper supplied by the array guard module.
 * @details BaseGuard cannot import ArrayGuard directly without creating an
 * initialization cycle. The guard barrel loads ArrayGuard, which installs this
 * factory before public code can call fluent `array()`.
 */
export function setArrayGuardFactory(factory: ArrayGuardFactory): void {
    arrayGuardFactory = factory;
}

/**
 * @brief Register the fluent promise decoder factory.
 * @param factory Constructor wrapper supplied by the async decoder module.
 * @details BaseGuard avoids a runtime import of the async module. The async
 * module installs this factory when it is loaded by the public builder table.
 */
export function setGuardPromiseFactory(factory: GuardPromiseFactory): void {
    guardPromiseFactory = factory;
}

/**
 * @brief Schema-backed guard base.
 * @details Methods accept an unknown receiver on purpose. Public JavaScript can
 * detach or forge methods, so every entry point re-reads the runtime schema
 * before executing validation.
 * @invariant The stored schema is immutable after construction.
 */
export class BaseGuard<
    TValue,
    TPresence extends Presence = "required"
> implements Guard<TValue, TPresence> {
    public declare readonly [TypeSymbol]: TValue;
    public declare readonly [PresenceSymbol]: TPresence;
    public declare readonly schema: Schema;
    public declare readonly "~standard": StandardSchemaV1Props<
        GuardRuntimeValue<TValue, TPresence>,
        GuardRuntimeValue<TValue, TPresence>
    >;

    /**
     * @brief Construct a schema-backed guard.
     * @param schema Runtime schema owned by the guard.
     * @post The schema slot is frozen and the receiver is registered for fast checks.
     */
    public constructor(schema: Schema) {
        const ownedSchema = readConstructorSchema(schema);
        defineReadonlyProperty(this, "schema", ownedSchema, true);
        defineReadonlyProperty(
            this,
            "~standard",
            makeStandardSchemaProps<
                GuardRuntimeValue<TValue, TPresence>,
                GuardRuntimeValue<TValue, TPresence>
            >((value: unknown): CheckResult<GuardRuntimeValue<TValue, TPresence>> =>
                checkSchema<GuardRuntimeValue<TValue, TPresence>>(ownedSchema, value)),
            false
        );
        registerConstructedGuard(this);
        if (new.target === BaseGuard) {
            /*
             * Direct BaseGuard instances have no subclass state. Freeze them here
             * so user code cannot mutate the public validation object after setup.
             */
            Object.freeze(this);
        }
    }

    /**
     * @brief Read the top-level documentation description.
     * @details Matches Zod's metadata surface: wrappers created after
     * `describe()` do not inherit the inner description as their own metadata.
     * @returns Description text stored on the outer metadata wrapper.
     */
    public get description(): string | undefined {
        return readTopLevelDescription(readGuardSchema(this, "description receiver"));
    }

    /**
     * @brief Read the compact Zod-style schema type label.
     * @returns Type label such as `string`, `object`, `array`, or `union`.
     */
    public get type(): string {
        return this.def.type;
    }

    /**
     * @brief Read key schema metadata for record-like guards.
     * @returns Child guard used for keys, or undefined when not applicable.
     */
    public get keyType(): unknown {
        return this.def.keyType;
    }

    /**
     * @brief Read value schema metadata for record, map, set, and property guards.
     * @returns Child guard used for values, or undefined when not applicable.
     */
    public get valueType(): unknown {
        return this.def.valueType;
    }

    /**
     * @brief Read Zod-style definition metadata.
     * @details This is a migration facade. It is computed only when requested and
     * is not part of TypeSea's validation execution plan.
     * @returns Frozen definition object with Zod-compatible naming.
     */
    public get def(): ZodDef {
        return makeZodDef(
            readGuardSchema(this, "def receiver"),
            this,
            (schema) => new BaseGuard<unknown>(schema)
        );
    }

    /**
     * @brief Read the classic Zod `_def` metadata field.
     * @details Alias for `def`; provided for ecosystem code that checks
     * `typeName`, `shape`, `options`, or `element`.
     * @returns Frozen definition object with Zod-compatible naming.
     */
    public get _def(): ZodDef {
        return this.def;
    }

    /**
     * @brief Read Zod v4 internal-style metadata.
     * @details This facade is for ecosystem probes only. It exposes immutable
     * `def`, constructor, trait, bag, and version fields without adopting Zod's
     * parser engine state.
     * @returns Frozen Zod-core-shaped metadata wrapper.
     */
    public get _zod(): Readonly<{
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
    }> {
        const def = this.def;
        return Object.freeze({
            def,
            constr: this.constructor,
            traits: new FrozenReadonlySet(readZodTraits(def.typeName)),
            bag: Object.freeze({}),
            version: Object.freeze({
                major: 4,
                minor: 4,
                patch: 3
            }),
            deferred: Object.freeze([])
        });
    }

    /**
     * @brief Test whether a value satisfies this guard.
     * @param value Candidate runtime value.
     * @returns True when the value is accepted by the guard schema.
     */
    public is(
        this: unknown,
        value: unknown
    ): value is RuntimeValue<TValue, TPresence> {
        /*
         * Methods may be detached from their instance in JavaScript. Re-reading
         * the schema from `this` makes receiver forgery fail before validation.
         */
        return isSchema(readGuardSchema(this, "guard receiver"), value);
    }

    /**
     * @brief Validate a value and return explicit diagnostics.
     * @param value Candidate runtime value.
     * @returns Result carrying the value on success or frozen issues on failure.
     */
    public check<TNext>(
        source: WithCheckSource<RuntimeValue<TValue, TPresence>> & ((guard: this) => TNext)
    ): TNext;

    public check(
        source: WithCheckSource<RuntimeValue<TValue, TPresence>>
    ): BaseGuard<TValue, TPresence>;

    public check(
        value: unknown,
        options?: Partial<ParseOptions>
    ): CheckResult<RuntimeValue<TValue, TPresence>>;

    public check(
        this: unknown,
        value: unknown,
        options?: unknown
    ): unknown {
        const inner = readGuardSchema(this, "guard receiver");
        if (isWithCheckSource(value)) {
            if (options !== undefined) {
                throw new TypeError("check source options are not supported");
            }
            const applied = applyWithCheckSource(
                value,
                this as Guard<unknown, Presence>
            );
            if (applied !== undefined) {
                return applied;
            }
            const ownedCallbacks = readWithCheckInputs([value]);
            return new BaseGuard<TValue, TPresence>({
                tag: SchemaTag.Refine,
                inner,
                predicate: (checked: unknown): boolean =>
                    runWithChecks(
                        ownedCallbacks,
                        checked as RuntimeValue<TValue, TPresence>
                    ),
                collect: (checked: unknown) =>
                    collectWithCheckIssues(
                        ownedCallbacks,
                        checked as RuntimeValue<TValue, TPresence>
                    ),
                name: "check"
            });
        }
        const result = checkSchema<RuntimeValue<TValue, TPresence>>(inner, value);
        if (result.ok) {
            return result;
        }
        return err(applyParseOptions(result.error, value, options as Partial<ParseOptions>));
    }

    /**
     * @brief Validate a value and keep only the first diagnostic.
     * @param value Candidate runtime value.
     * @returns Result carrying the value on success or one frozen issue on failure.
     */
    public checkFirst(
        this: unknown,
        value: unknown,
        options?: Partial<ParseOptions>
    ): CheckResult<RuntimeValue<TValue, TPresence>> {
        const result = checkSchema<RuntimeValue<TValue, TPresence>>(
            readGuardSchema(this, "guard receiver"),
            value
        );
        if (result.ok) {
            return result;
        }
        const first = freezeIssueArray(readFirstIssue(result.error));
        return err(applyParseOptions(first, value, options));
    }

    /**
     * @brief Validate a value and return it or throw.
     * @param value Candidate runtime value.
     * @returns Accepted runtime value.
     * @throws TypeSeaAssertionError when validation fails.
     */
    public parse(
        this: unknown,
        value: unknown,
        options?: Partial<ParseOptions>
    ): RuntimeValue<TValue, TPresence> {
        const result = checkSchema<RuntimeValue<TValue, TPresence>>(
            readGuardSchema(this, "guard receiver"),
            value
        );
        if (!result.ok) {
            throw new TypeSeaAssertionError(applyParseOptions(result.error, value, options));
        }
        return result.value;
    }

    /**
     * @brief Validate a value and return a Zod-style tagged result.
     * @param value Candidate runtime value.
     * @returns Success/data or failure/error result.
     */
    public safeParse(
        this: unknown,
        value: unknown,
        options?: Partial<ParseOptions>
    ): SafeParseResult<RuntimeValue<TValue, TPresence>> {
        const result = checkSchema<RuntimeValue<TValue, TPresence>>(
            readGuardSchema(this, "guard receiver"),
            value
        );
        if (result.ok) {
            return Object.freeze({
                success: true,
                data: result.value
            });
        }
        return Object.freeze({
            success: false,
            error: new TypeSeaAssertionError(applyParseOptions(result.error, value, options))
        });
    }

    /**
     * @brief Zod-style decode alias for plain guards.
     * @param value Candidate runtime value.
     * @returns Accepted runtime value.
     */
    public decode(
        this: unknown,
        value: unknown,
        options?: Partial<ParseOptions>
    ): RuntimeValue<TValue, TPresence> {
        return parseGuardValue<TValue, TPresence>(this, value, options);
    }

    /**
     * @brief Zod-style safeDecode alias for plain guards.
     * @param value Candidate runtime value.
     * @returns Tagged parse result.
     */
    public safeDecode(
        this: unknown,
        value: unknown,
        options?: Partial<ParseOptions>
    ): SafeParseResult<RuntimeValue<TValue, TPresence>> {
        return safeParseGuardValue<TValue, TPresence>(this, value, options);
    }

    /**
     * @brief Zod-style encode alias for plain guards.
     * @param value Candidate runtime value.
     * @returns Accepted runtime value.
     */
    public encode(
        this: unknown,
        value: unknown,
        options?: Partial<ParseOptions>
    ): RuntimeValue<TValue, TPresence> {
        return parseGuardValue<TValue, TPresence>(this, value, options);
    }

    /**
     * @brief Zod-style safeEncode alias for plain guards.
     * @param value Candidate runtime value.
     * @returns Tagged parse result.
     */
    public safeEncode(
        this: unknown,
        value: unknown,
        options?: Partial<ParseOptions>
    ): SafeParseResult<RuntimeValue<TValue, TPresence>> {
        return safeParseGuardValue<TValue, TPresence>(this, value, options);
    }

    /**
     * @brief Promise-returning parse compatibility method.
     * @param value Candidate runtime value.
     * @returns Promise resolving to the accepted runtime value.
     */
    public parseAsync(
        this: unknown,
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<RuntimeValue<TValue, TPresence>> {
        const result = checkSchema<RuntimeValue<TValue, TPresence>>(
            readGuardSchema(this, "guard receiver"),
            value
        );
        if (!result.ok) {
            return Promise.reject(new TypeSeaAssertionError(
                applyParseOptions(result.error, value, options)
            ));
        }
        return Promise.resolve(result.value);
    }

    /**
     * @brief Promise-returning safe parse compatibility method.
     * @param value Candidate runtime value.
     * @returns Promise resolving to a tagged parse result.
     */
    public safeParseAsync(
        this: unknown,
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<SafeParseResult<RuntimeValue<TValue, TPresence>>> {
        const result = checkSchema<RuntimeValue<TValue, TPresence>>(
            readGuardSchema(this, "guard receiver"),
            value
        );
        if (result.ok) {
            return Promise.resolve(Object.freeze({
                success: true,
                data: result.value
            }));
        }
        return Promise.resolve(Object.freeze({
            success: false,
            error: new TypeSeaAssertionError(applyParseOptions(result.error, value, options))
        }));
    }

    /**
     * @brief Promise-returning decode alias for plain guards.
     * @param value Candidate runtime value.
     * @returns Promise resolving to the accepted value.
     */
    public decodeAsync(
        this: unknown,
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<RuntimeValue<TValue, TPresence>> {
        return parseGuardValueAsync<TValue, TPresence>(this, value, options);
    }

    /**
     * @brief Promise-returning safeDecode alias for plain guards.
     * @param value Candidate runtime value.
     * @returns Promise resolving to a tagged parse result.
     */
    public safeDecodeAsync(
        this: unknown,
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<SafeParseResult<RuntimeValue<TValue, TPresence>>> {
        return safeParseGuardValueAsync<TValue, TPresence>(this, value, options);
    }

    /**
     * @brief Promise-returning encode alias for plain guards.
     * @param value Candidate runtime value.
     * @returns Promise resolving to the accepted value.
     */
    public encodeAsync(
        this: unknown,
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<RuntimeValue<TValue, TPresence>> {
        return parseGuardValueAsync<TValue, TPresence>(this, value, options);
    }

    /**
     * @brief Promise-returning safeEncode alias for plain guards.
     * @param value Candidate runtime value.
     * @returns Promise resolving to a tagged parse result.
     */
    public safeEncodeAsync(
        this: unknown,
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<SafeParseResult<RuntimeValue<TValue, TPresence>>> {
        return safeParseGuardValueAsync<TValue, TPresence>(this, value, options);
    }

    /**
     * @brief Zod-compatible alias for safeParseAsync.
     * @param value Candidate runtime value.
     * @returns Promise resolving to a tagged parse result.
     */
    public spa(
        this: unknown,
        value: unknown,
        options?: Partial<ParseOptions>
    ): Promise<SafeParseResult<RuntimeValue<TValue, TPresence>>> {
        const result = checkSchema<RuntimeValue<TValue, TPresence>>(
            readGuardSchema(this, "guard receiver"),
            value
        );
        if (result.ok) {
            return Promise.resolve(Object.freeze({
                success: true,
                data: result.value
            }));
        }
        return Promise.resolve(Object.freeze({
            success: false,
            error: new TypeSeaAssertionError(applyParseOptions(result.error, value, options))
        }));
    }

    /**
     * @brief Check whether this schema accepts undefined.
     * @returns True when undefined passes normal validation.
     */
    public isOptional(this: unknown): boolean {
        return isSchema(readGuardSchema(this, "guard receiver"), undefined);
    }

    /**
     * @brief Check whether this schema accepts null.
     * @returns True when null passes normal validation.
     */
    public isNullable(this: unknown): boolean {
        return isSchema(readGuardSchema(this, "guard receiver"), null);
    }

    /**
     * @brief Validate a value and throw TypeSeaAssertionError on failure.
     * @param value Candidate runtime value.
     * @throws TypeSeaAssertionError when validation fails.
     */
    public assert(
        this: unknown,
        value: unknown,
        options?: Partial<ParseOptions>
    ): asserts value is RuntimeValue<TValue, TPresence> {
        const result = checkSchema<RuntimeValue<TValue, TPresence>>(
            readGuardSchema(this, "guard receiver"),
            value
        );
        if (!result.ok) {
            throw new TypeSeaAssertionError(applyParseOptions(result.error, value, options));
        }
    }

    /**
     * @brief Return the optimized validation graph for introspection.
     * @returns Sea-of-Nodes graph derived from the guard schema.
     */
    public graph(this: unknown): Graph {
        return makeValidationPlan(readGuardSchema(this, "guard receiver")).graph;
    }

    /**
     * @brief Export this guard through the JSON Schema emitter.
     * @details This is the Zod-style method name for TypeSea's lossless
     * `toJsonSchema()` path. Unsupported schemas return a Result error instead
     * of weakening validation semantics.
     * @param options Optional dialect and schema id options.
     * @returns Result carrying a frozen JSON Schema document or export issues.
     */
    public toJSONSchema(
        this: unknown,
        options?: Partial<JsonSchemaOptions>
    ): Result<JsonSchema, readonly JsonSchemaExportIssue[]> {
        return schemaToJsonSchema(readGuardSchema(this, "toJSONSchema receiver"), options);
    }

    /**
     * @brief Register metadata in an external registry.
     * @param registry Registry receiving metadata for this guard's schema.
     * @param metadata Metadata payload.
     * @returns This guard unchanged.
     */
    public register<TMetadata>(
        registry: SchemaRegistry<TMetadata>,
        metadata: TMetadata
    ): this {
        registerGuardMetadata(this, registry, metadata);
        return this;
    }

    /**
     * @brief Attach JSON Schema/documentation metadata.
     * @param metadata Metadata fields to merge onto the schema.
     * @returns Fresh guard with unchanged validation behavior.
     */
    public metadata(metadata: SchemaMetadataInput): BaseGuard<TValue, TPresence> {
        return new BaseGuard<TValue, TPresence>(
            metadataSchema(
                readGuardSchema(this, "metadata inner"),
                readSchemaMetadata(metadata)
            )
        );
    }

    /**
     * @brief Attach JSON Schema/documentation metadata with Zod-compatible naming.
     * @param metadata Metadata fields to merge onto the schema.
     * @returns Fresh guard with unchanged validation behavior.
     */
    public meta(metadata: SchemaMetadataInput): BaseGuard<TValue, TPresence> {
        return this.metadata(metadata);
    }

    /**
     * @brief Attach a title annotation.
     * @param title Human-readable schema title.
     * @returns Fresh guard with unchanged validation behavior.
     */
    public title(title: string): BaseGuard<TValue, TPresence> {
        return new BaseGuard<TValue, TPresence>(
            metadataSchema(readGuardSchema(this, "title inner"), titleMetadata(title))
        );
    }

    /**
     * @brief Attach a description annotation.
     * @param description Human-readable schema description.
     * @returns Fresh guard with unchanged validation behavior.
     */
    public describe(description: string): BaseGuard<TValue, TPresence> {
        return new BaseGuard<TValue, TPresence>(
            metadataSchema(
                readGuardSchema(this, "describe inner"),
                descriptionMetadata(description)
            )
        );
    }

    /**
     * @brief Append one example annotation.
     * @param value Example value for documentation and JSON Schema export.
     * @returns Fresh guard with unchanged validation behavior.
     */
    public example(value: unknown): BaseGuard<TValue, TPresence> {
        return new BaseGuard<TValue, TPresence>(
            metadataSchema(readGuardSchema(this, "example inner"), exampleMetadata(value))
        );
    }

    /**
     * @brief Attach a local diagnostic message.
     * @param message Message copied onto child issues that do not already carry one.
     * @returns Fresh guard with unchanged validation behavior.
     */
    public message(message: string): BaseGuard<TValue, TPresence> {
        if (typeof message !== "string") {
            throw new TypeError("message must be a string");
        }
        return new BaseGuard<TValue, TPresence>({
            tag: SchemaTag.Message,
            inner: readGuardSchema(this, "message inner"),
            message
        });
    }

    /**
     * @brief Freeze accepted values returned by parse-like APIs.
     * @returns Fresh readonly guard with unchanged boolean validation.
     */
    public readonly(): BaseGuard<ReadonlyValue<TValue>, TPresence> {
        return new BaseGuard<ReadonlyValue<TValue>, TPresence>({
            tag: SchemaTag.Readonly,
            inner: readGuardSchema(this, "readonly inner")
        });
    }

    /**
     * @brief Return the payload schema carried by wrappers or arrays.
     * @returns Fresh guard for the inner schema.
     * @throws TypeError when this guard is not backed by an unwrappable schema.
     */
    public unwrap<TGuard extends Guard<unknown, Presence>>(
        this: TGuard
    ): BaseGuard<UnwrappedGuardValue<TGuard>> {
        return new BaseGuard<UnwrappedGuardValue<TGuard>>(
            unwrapSchema(readGuardSchema(this, "unwrap inner"))
        );
    }

    /**
     * @brief Remove optional presence and explicit undefined acceptance.
     * @returns Fresh required guard without top-level undefined semantics.
     */
    public nonoptional<TGuard extends Guard<unknown, Presence>>(
        this: TGuard
    ): BaseGuard<Exclude<GuardValue<TGuard>, undefined>> {
        return new BaseGuard<Exclude<GuardValue<TGuard>, undefined>>(
            nonoptionalSchema(readGuardSchema(this, "nonoptional inner"))
        );
    }

    /**
     * @brief Run a fluent helper against this guard.
     * @param callback Helper that receives this guard.
     * @returns The callback result without wrapping or schema mutation.
     */
    public apply<TResult>(callback: (guard: this) => TResult): TResult {
        readGuardSchema(this, "apply receiver");
        if (typeof callback !== "function") {
            throw new TypeError("apply callback must be a function");
        }
        return callback(this);
    }

    /**
     * @brief Return an equivalent guard instance.
     * @details TypeSea guards are immutable, so the clone surface can safely
     * return the receiver while preserving subclass methods and callable guard
     * facades.
     * @returns This guard unchanged.
     */
    public clone(): this {
        readGuardSchema(this, "clone receiver");
        return this;
    }

    /**
     * @brief Mark this guard as optional in object shapes.
     * @returns Fresh guard whose runtime value also allows absent object keys.
     */
    public optional(): BaseGuard<TValue, "optional"> {
        return new BaseGuard<TValue, "optional">({
            tag: SchemaTag.Optional,
            inner: readGuardSchema(this, "optional inner")
        });
    }

    /**
     * @brief Allow object-key omission without accepting standalone undefined.
     * @returns New guard carrying exact optional object presence.
     */
    public exactOptional(): BaseGuard<TValue, "exactOptional"> {
        const inner = readGuardSchema(this, "exactOptional inner");
        return new BaseGuard<TValue, "exactOptional">({
            tag: SchemaTag.Lazy,
            get: (): Schema => inner,
            objectPresence: (): PresenceTag => PresenceTag.Optional
        });
    }

    /**
     * @brief Allow the explicit undefined value.
     * @returns Fresh guard wrapping this schema in Undefinedable.
     */
    public undefinedable(): BaseGuard<TValue | undefined, TPresence> {
        return new BaseGuard<TValue | undefined, TPresence>({
            tag: SchemaTag.Undefinedable,
            inner: readGuardSchema(this, "undefinedable inner")
        });
    }

    /**
     * @brief Allow the explicit null value.
     * @returns Fresh guard wrapping this schema in Nullable.
     */
    public nullable(): BaseGuard<TValue | null, TPresence> {
        return new BaseGuard<TValue | null, TPresence>({
            tag: SchemaTag.Nullable,
            inner: readGuardSchema(this, "nullable inner")
        });
    }

    /**
     * @brief Allow null, undefined, and absent object keys.
     * @details This is the fluent form of `t.nullish(guard)`: optional presence
     * wraps a nullable value-domain wrapper, so object-key absence and explicit
     * null stay distinguishable in diagnostics.
     * @returns Fresh optional guard whose value domain also includes null.
     */
    public nullish(): BaseGuard<TValue | null, "optional"> {
        return new BaseGuard<TValue | null, "optional">({
            tag: SchemaTag.Optional,
            inner: {
                tag: SchemaTag.Nullable,
                inner: readGuardSchema(this, "nullish inner")
            }
        });
    }

    /**
     * @brief Build an array guard using this guard as the item schema.
     * @returns Fresh array guard.
     */
    public array(): ArrayGuard<RuntimeValue<TValue, TPresence>> {
        const schema: ArraySchemaRecord = {
            tag: SchemaTag.Array,
            item: readGuardSchema(this, "array item"),
            checks: []
        };
        if (arrayGuardFactory === undefined) {
            throw new TypeError("ArrayGuard factory is not initialized");
        }
        return arrayGuardFactory<RuntimeValue<TValue, TPresence>>(schema);
    }

    /**
     * @brief Attach a compile-time brand without changing runtime validation.
     * @returns Fresh branded guard with the same runtime schema.
     */
    public brand<TBrand extends string>(): BaseGuard<
        Brand<TValue, TBrand>,
        TPresence
    > {
        return new BaseGuard<Brand<TValue, TBrand>, TPresence>({
            tag: SchemaTag.Brand,
            inner: readGuardSchema(this, "brand inner"),
            brand: ""
        });
    }

    /**
     * @brief Append a user refinement predicate after this guard succeeds.
     * @param predicate Function that must return the boolean literal true.
     * @param name Diagnostic name for refinement failure.
     * @returns Fresh refined guard.
     */
    public refine(
        predicate: (value: RuntimeValue<TValue, TPresence>) => boolean,
        params?: RefineParams<RuntimeValue<TValue, TPresence>>
    ): BaseGuard<TValue, TPresence> {
        checkRefinementInput(predicate, params);
        const options = readRefineOptions(params);
        return new BaseGuard<TValue, TPresence>({
            tag: SchemaTag.Refine,
            inner: readGuardSchema(this, "refine inner"),
            /*
             * The predicate is wrapped so only strict true succeeds. Truthy
             * non-boolean values stay failures, matching the interpreter helper.
             */
            predicate: (value: unknown): boolean =>
                isStrictTrue(predicate(value)),
            path: options.path,
            message: options.message,
            abort: options.abort,
            when: options.when,
            name: options.name
        });
    }

    /**
     * @brief Append a callback-style semantic refinement.
     * @param callback Function that calls context.addIssue() to fail.
     * @param name Diagnostic name for refinement failure.
     * @returns Fresh refined guard.
     */
    public superRefine(
        callback: (
            value: RuntimeValue<TValue, TPresence>,
            context: SuperRefineContext
        ) => void,
        name?: string
    ): BaseGuard<TValue, TPresence> {
        if (typeof callback !== "function") {
            throw new TypeError("super refinement callback must be a function");
        }
        if (name !== undefined && typeof name !== "string") {
            throw new TypeError("refinement name must be a string");
        }
        const label = name ?? "refinement";
        return new BaseGuard<TValue, TPresence>({
            tag: SchemaTag.Refine,
            inner: readGuardSchema(this, "superRefine inner"),
            predicate: (value: unknown): boolean =>
                runSuperRefine(
                    callback,
                    value as RuntimeValue<TValue, TPresence>
                ),
            collect: (value: unknown) =>
                collectSuperRefineIssues(
                    callback,
                    value as RuntimeValue<TValue, TPresence>
                ),
            name: label
        });
    }

    /**
     * @brief Append Zod-style callback refinements.
     * @details TypeSea keeps its validation method named `check()`, so this
     * compatibility surface exposes direct callbacks and `t.check()` sources
     * through `with()`. Each callback receives `{ value, issues }`; a pushed
     * issue rejects.
     * @param checks Semantic callbacks or reusable check sources.
     * @returns Fresh refined guard.
     */
    public with(
        ...checks: WithCheckInput<RuntimeValue<TValue, TPresence>>[]
    ): BaseGuard<TValue, TPresence>;
    public with(
        ...checks: WithCheckInput[]
    ): BaseGuard<TValue, TPresence>;
    public with(
        ...checks: WithCheckInput[]
    ): BaseGuard<TValue, TPresence> {
        const inner = readGuardSchema(this, "with inner");
        if (checks.length === 0) {
            return this.clone();
        }
        const ownedCallbacks = readWithCheckInputs(checks);
        return new BaseGuard<TValue, TPresence>({
            tag: SchemaTag.Refine,
            inner,
            predicate: (value: unknown): boolean =>
                runWithChecks(
                    ownedCallbacks,
                    value as RuntimeValue<TValue, TPresence>
                ),
            collect: (value: unknown) =>
                collectWithCheckIssues(
                    ownedCallbacks,
                    value as RuntimeValue<TValue, TPresence>
                ),
            name: "with"
        });
    }

    /**
     * @brief Decode this guard and map the accepted value.
     * @details Validation remains separate from value production: `is()` keeps
     * returning a boolean, while transforms produce explicit Result values from
     * `decode()`.
     * @param mapper Pure mapper applied after this guard accepts the input.
     * @returns Decoder whose output is the mapper result.
     */
    public transform<TNext>(
        mapper: (value: RuntimeValue<TValue, TPresence>, context: TransformContext) => TNext
    ): BaseDecoder<TNext> {
        return transformDecoder(readThisGuard(this), mapper);
    }

    /**
     * @brief Zod-style output rewrite alias.
     * @details TypeSea keeps output-producing logic in decoders, so overwrite is
     * intentionally an alias for `transform()` instead of a predicate mutation.
     * @param mapper Mapper applied after this guard accepts the input.
     * @returns Decoder whose output is the mapper result.
     */
    public overwrite<TNext>(
        mapper: (value: RuntimeValue<TValue, TPresence>, context: TransformContext) => TNext
    ): BaseDecoder<TNext> {
        return this.transform(mapper);
    }

    /**
     * @brief Feed this guard's accepted value into another guard or decoder.
     * @param next Downstream guard or decoder.
     * @returns Decoder for the downstream output type.
     */
    public pipe<TNext extends DecodeSource>(
        next: TNext
    ): BaseDecoder<InferDecoder<TNext>> {
        return pipeDecoder(readThisGuard(this), next);
    }

    /**
     * @brief Return a fallback output when the input is undefined.
     * @details This matches Zod's default ergonomics without weakening guard
     * predicates: defaults live only on decoder `decode()` paths.
     * @param fallback Output value or zero-argument producer.
     * @returns Decoder that short-circuits undefined input to the fallback.
     */
    public default(
        fallback: GuardDefaultInput<TValue, TPresence>
    ): BaseDecoder<RuntimeValue<TValue, TPresence>> {
        const source = readRuntimeGuard<TValue, TPresence>(this);
        return defaultValue(source, fallback as never);
    }

    /**
     * @brief Substitute an input before validation when the input is undefined.
     * @param fallback Input value passed through this guard.
     * @returns Decoder that validates either the original input or fallback.
     */
    public prefault(
        fallback: unknown
    ): BaseDecoder<RuntimeValue<TValue, TPresence>> {
        return prefaultDecoder(readRuntimeGuard<TValue, TPresence>(this), fallback);
    }

    /**
     * @brief Return a fallback output after validation failure.
     * @param fallback Output value or zero-argument producer.
     * @returns Decoder that converts failed validation into fallback success.
     */
    public catch(
        fallback: GuardCatchInput<TValue, TPresence>
    ): BaseDecoder<RuntimeValue<TValue, TPresence>> {
        const source = readRuntimeGuard<TValue, TPresence>(this);
        return catchValue(source, fallback as never);
    }

    /**
     * @brief Decode a native Promise through this guard.
     * @details Fluent form of `t.promise(guard)`. It returns an async decoder
     * instead of changing synchronous guard predicates.
     * @returns Async decoder for the resolved value accepted by this guard.
     */
    public promise(): PromiseAsyncDecoder<RuntimeValue<TValue, TPresence>> {
        if (guardPromiseFactory === undefined) {
            throw new TypeError("promise decoder factory is not initialized");
        }
        return guardPromiseFactory(readThisGuard(this));
    }

    /**
     * @brief Build a union of this guard and another guard.
     * @param other Right-hand guard.
     * @returns Fresh union guard preserving both runtime schemas.
     */
    public or<TOther extends Guard<unknown, Presence>>(
        other: TOther
    ): BaseGuard<RuntimeValue<TValue, TPresence> | Infer<TOther>> {
        return new BaseGuard<
            RuntimeValue<TValue, TPresence> | Infer<TOther>
        >(normalizeUnionSchema([
            readGuardSchema(this, "union option 0"),
            readGuardSchema(other, "union option 1")
        ]));
    }

    /**
     * @brief Build an intersection of this guard and another guard.
     * @param other Right-hand guard.
     * @returns Fresh intersection guard requiring both schemas to pass.
     */
    public intersect<TOther extends Guard<unknown, Presence>>(
        other: TOther
    ): BaseGuard<RuntimeValue<TValue, TPresence> & Infer<TOther>> {
        return new BaseGuard<RuntimeValue<TValue, TPresence> & Infer<TOther>>({
            tag: SchemaTag.Intersection,
            left: readGuardSchema(this, "intersection left"),
            right: readGuardSchema(other, "intersection right")
        });
    }

    /**
     * @brief Zod-compatible alias for intersect().
     * @param other Right-hand guard.
     * @returns Fresh intersection guard requiring both schemas to pass.
     */
    public and<TOther extends Guard<unknown, Presence>>(
        other: TOther
    ): BaseGuard<RuntimeValue<TValue, TPresence> & Infer<TOther>> {
        return this.intersect(other);
    }

    /**
     * @brief Require one own data property after this guard succeeds.
     * @param key Own string property key to inspect.
     * @param value Guard applied to the property value.
     * @returns Fresh guard that preserves the base domain and property proof.
     */
    public property<
        const TKey extends string,
        TGuard extends Guard<unknown, Presence>
    >(
        key: TKey,
        value: TGuard
    ): BaseGuard<
        RuntimeValue<TValue, TPresence> & Readonly<Record<TKey, Infer<TGuard>>>
    > {
        if (typeof key !== "string") {
            throw new TypeError("property key must be a string");
        }
        return new BaseGuard<
            RuntimeValue<TValue, TPresence> & Readonly<Record<TKey, Infer<TGuard>>>
        >({
            tag: SchemaTag.Property,
            base: readGuardSchema(this, "property base"),
            key,
            value: readGuardSchema(value, "property value")
        });
    }
}

/**
 * @brief Build or merge a metadata wrapper.
 * @param inner Schema being annotated.
 * @param metadata Metadata to add.
 * @returns Metadata wrapper with nested metadata collapsed.
 */
function metadataSchema(inner: Schema, metadata: SchemaMetadata): Schema {
    if (inner.tag === SchemaTag.Metadata) {
        return {
            tag: SchemaTag.Metadata,
            inner: inner.inner,
            metadata: mergeSchemaMetadata(inner.metadata, metadata)
        };
    }
    return {
        tag: SchemaTag.Metadata,
        inner,
        metadata
    };
}

/**
 * @brief Narrow a BaseGuard receiver for decoder helper inference.
 * @param guard Guard instance after method dispatch.
 * @returns The same receiver as a public Guard source.
 */
function readThisGuard<TValue, TPresence extends Presence>(
    guard: BaseGuard<TValue, TPresence>
): Guard<TValue, TPresence> {
    return guard;
}

/**
 * @brief Re-type this guard by its fully resolved runtime value.
 * @details Decoder helpers infer through the public Guard interface. Keeping
 * this small cast local prevents overload-only compatibility methods from
 * widening the output type at fluent decoder call sites.
 */
function readRuntimeGuard<TValue, TPresence extends Presence>(
    guard: BaseGuard<TValue, TPresence>
): Guard<RuntimeValue<TValue, TPresence>> {
    return guard as unknown as Guard<RuntimeValue<TValue, TPresence>>;
}

/**
 * @brief Shared parse body for Zod encode/decode aliases.
 */
function parseGuardValue<TValue, TPresence extends Presence>(
    guard: unknown,
    value: unknown,
    options?: Partial<ParseOptions>
): RuntimeValue<TValue, TPresence> {
    const result = checkSchema<RuntimeValue<TValue, TPresence>>(
        readGuardSchema(guard, "guard receiver"),
        value
    );
    if (!result.ok) {
        throw new TypeSeaAssertionError(applyParseOptions(result.error, value, options));
    }
    return result.value;
}

/**
 * @brief Shared safe parse body for Zod encode/decode aliases.
 */
function safeParseGuardValue<TValue, TPresence extends Presence>(
    guard: unknown,
    value: unknown,
    options?: Partial<ParseOptions>
): SafeParseResult<RuntimeValue<TValue, TPresence>> {
    const result = checkSchema<RuntimeValue<TValue, TPresence>>(
        readGuardSchema(guard, "guard receiver"),
        value
    );
    if (result.ok) {
        return Object.freeze({
            success: true,
            data: result.value
        });
    }
    return Object.freeze({
        success: false,
        error: new TypeSeaAssertionError(applyParseOptions(result.error, value, options))
    });
}

/**
 * @brief Promise-returning parse body for Zod encode/decode aliases.
 */
function parseGuardValueAsync<TValue, TPresence extends Presence>(
    guard: unknown,
    value: unknown,
    options?: Partial<ParseOptions>
): Promise<RuntimeValue<TValue, TPresence>> {
    const result = checkSchema<RuntimeValue<TValue, TPresence>>(
        readGuardSchema(guard, "guard receiver"),
        value
    );
    if (!result.ok) {
        return Promise.reject(new TypeSeaAssertionError(
            applyParseOptions(result.error, value, options)
        ));
    }
    return Promise.resolve(result.value);
}

/**
 * @brief Promise-returning safe parse body for Zod encode/decode aliases.
 */
function safeParseGuardValueAsync<TValue, TPresence extends Presence>(
    guard: unknown,
    value: unknown,
    options?: Partial<ParseOptions>
): Promise<SafeParseResult<RuntimeValue<TValue, TPresence>>> {
    return Promise.resolve(safeParseGuardValue<TValue, TPresence>(guard, value, options));
}

function readTopLevelDescription(schema: Schema): string | undefined {
    if (schema.tag === SchemaTag.Metadata) {
        return schema.metadata.description;
    }
    return undefined;
}

/**
 * @brief Build the Zod-core-style trait name set for metadata probes.
 */
function readZodTraits(typeName: string): readonly string[] {
    return Object.freeze([
        typeName,
        `$${typeName}`,
        "ZodType",
        "$ZodType"
    ]);
}

/**
 * @brief Copy the first issue into a single-slot diagnostic vector.
 * @details The full checker owns the original frozen issue vector. checkFirst
 * publishes a narrower vector so callers cannot observe or retain extra issues.
 * @param issues Issue vector returned by the full checker.
 * @returns Mutable vector containing zero or one copied issue.
 */
function readFirstIssue(issues: readonly Issue[]): Issue[] {
    const first = issues[0];
    if (first === undefined) {
        return [];
    }
    return [
        {
            path: first.path.slice(),
            code: first.code,
            expected: first.expected,
            actual: first.actual,
            message: first.message
        }
    ];
}
