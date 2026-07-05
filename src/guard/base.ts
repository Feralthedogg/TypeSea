/**
 * @file base.ts
 * @brief Base guard implementation.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
 */

import { SchemaTag } from "../kind/index.js";
import {
    catchValue,
    defaultValue,
    pipe as pipeDecoder,
    prefault as prefaultDecoder,
    transform as transformDecoder,
    type BaseDecoder,
    type DecodeSource,
    type InferDecoder
} from "../decoder/index.js";
import { checkSchema, isSchema } from "../evaluate/index.js";
import { makeValidationPlan } from "../plan/index.js";
import { freezeIssueArray, type CheckResult, type Issue } from "../issue/index.js";
import type { Graph } from "../ir/index.js";
import { err } from "../result/index.js";
import { normalizeUnionSchema, type Schema } from "../schema/index.js";
import { TypeSeaAssertionError } from "./error.js";
import {
    checkRefinementInput,
    readConstructorSchema,
    readGuardSchema
} from "./read.js";
import { defineReadonlyProperty, isStrictTrue } from "./props.js";
import { registerConstructedGuard } from "./registry.js";
import type { ArrayGuard } from "./array.js";
import type {
    Brand,
    Guard,
    Infer,
    Presence,
    PresenceSymbol,
    RuntimeValue,
    TypeSymbol
} from "./types.js";

type ArraySchemaRecord = Extract<Schema, { readonly tag: typeof SchemaTag.Array }>;
type ArrayGuardFactory = <TItem>(schema: ArraySchemaRecord) => ArrayGuard<TItem>;
type GuardRuntimeValue<TValue, TPresence extends Presence> =
    RuntimeValue<TValue, TPresence>;
type GuardDefaultInput<TValue, TPresence extends Presence> =
    GuardRuntimeValue<TValue, TPresence> |
    (() => GuardRuntimeValue<TValue, TPresence>);

let arrayGuardFactory: ArrayGuardFactory | undefined;

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

    /**
     * @brief Construct a schema-backed guard.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
     * @param schema Runtime schema owned by the guard.
     * @post The schema slot is frozen and the receiver is registered for fast checks.
     */
    public constructor(schema: Schema) {
        defineReadonlyProperty(this, "schema", readConstructorSchema(schema), true);
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
     * @brief Test whether a value satisfies this guard.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
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
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
     * @param value Candidate runtime value.
     * @returns Result carrying the value on success or frozen issues on failure.
     */
    public check(
        this: unknown,
        value: unknown
    ): CheckResult<RuntimeValue<TValue, TPresence>> {
        return checkSchema<RuntimeValue<TValue, TPresence>>(
            readGuardSchema(this, "guard receiver"),
            value
        );
    }

    /**
     * @brief Validate a value and keep only the first diagnostic.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
     * @param value Candidate runtime value.
     * @returns Result carrying the value on success or one frozen issue on failure.
     */
    public checkFirst(
        this: unknown,
        value: unknown
    ): CheckResult<RuntimeValue<TValue, TPresence>> {
        const result = checkSchema<RuntimeValue<TValue, TPresence>>(
            readGuardSchema(this, "guard receiver"),
            value
        );
        if (result.ok) {
            return result;
        }
        return err(freezeIssueArray(readFirstIssue(result.error)));
    }

    /**
     * @brief Validate a value and throw TypeSeaAssertionError on failure.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
     * @param value Candidate runtime value.
     * @throws TypeSeaAssertionError when validation fails.
     */
    public assert(
        this: unknown,
        value: unknown
    ): asserts value is RuntimeValue<TValue, TPresence> {
        const result = checkSchema<RuntimeValue<TValue, TPresence>>(
            readGuardSchema(this, "guard receiver"),
            value
        );
        if (!result.ok) {
            throw new TypeSeaAssertionError(result.error);
        }
    }

    /**
     * @brief Return the optimized validation graph for introspection.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
     * @returns Sea-of-Nodes graph derived from the guard schema.
     */
    public graph(this: unknown): Graph {
        return makeValidationPlan(readGuardSchema(this, "guard receiver")).graph;
    }

    /**
     * @brief Mark this guard as optional in object shapes.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
     * @returns Fresh guard whose runtime value also allows absent object keys.
     */
    public optional(): BaseGuard<TValue, "optional"> {
        return new BaseGuard<TValue, "optional">({
            tag: SchemaTag.Optional,
            inner: readGuardSchema(this, "optional inner")
        });
    }

    /**
     * @brief Allow the explicit undefined value.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
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
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
     * @returns Fresh guard wrapping this schema in Nullable.
     */
    public nullable(): BaseGuard<TValue | null, TPresence> {
        return new BaseGuard<TValue | null, TPresence>({
            tag: SchemaTag.Nullable,
            inner: readGuardSchema(this, "nullable inner")
        });
    }

    /**
     * @brief Build an array guard using this guard as the item schema.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
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
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
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
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
     * @param predicate Function that must return the boolean literal true.
     * @param name Diagnostic name for refinement failure.
     * @returns Fresh refined guard.
     */
    public refine(
        predicate: (value: RuntimeValue<TValue, TPresence>) => boolean,
        name: string
    ): BaseGuard<TValue, TPresence> {
        checkRefinementInput(predicate, name);
        return new BaseGuard<TValue, TPresence>({
            tag: SchemaTag.Refine,
            inner: readGuardSchema(this, "refine inner"),
            /*
             * The predicate is wrapped so only strict true succeeds. Truthy
             * non-boolean values stay failures, matching the interpreter helper.
             */
            predicate: (value: unknown): boolean =>
                isStrictTrue(predicate(value)),
            name
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
        mapper: (value: RuntimeValue<TValue, TPresence>) => TNext
    ): BaseDecoder<TNext> {
        return transformDecoder(readThisGuard(this), mapper);
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
        return defaultValue(readThisGuard(this), fallback);
    }

    /**
     * @brief Substitute an input before validation when the input is undefined.
     * @param fallback Input value passed through this guard.
     * @returns Decoder that validates either the original input or fallback.
     */
    public prefault(
        fallback: unknown
    ): BaseDecoder<RuntimeValue<TValue, TPresence>> {
        return prefaultDecoder(readThisGuard(this), fallback);
    }

    /**
     * @brief Return a fallback output after validation failure.
     * @param fallback Output value or zero-argument producer.
     * @returns Decoder that converts failed validation into fallback success.
     */
    public catch(
        fallback: GuardDefaultInput<TValue, TPresence>
    ): BaseDecoder<RuntimeValue<TValue, TPresence>> {
        return catchValue(readThisGuard(this), fallback);
    }

    /**
     * @brief Build a union of this guard and another guard.
     * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
     * existing guard instance.
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
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
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
