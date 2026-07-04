/**
 * @file base.ts
 * @brief Base guard implementation.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
 */

import { SchemaTag } from "../kind/index.js";
import { checkSchema, isSchema } from "../evaluate/index.js";
import { makeValidationPlan } from "../plan/index.js";
import type { CheckResult } from "../issue/index.js";
import type { Graph } from "../ir/index.js";
import type { Schema } from "../schema/index.js";
import { TypeSeaAssertionError } from "./error.js";
import {
    checkRefinementInput,
    readConstructorSchema,
    readGuardSchema
} from "./read.js";
import { defineReadonlyProperty, isStrictTrue } from "./props.js";
import { registerConstructedGuard } from "./registry.js";
import type {
    Brand,
    Guard,
    Infer,
    Presence,
    PresenceSymbol,
    RuntimeValue,
    TypeSymbol
} from "./types.js";

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
    public array(): BaseGuard<RuntimeValue<TValue, TPresence>[]> {
        return new BaseGuard<RuntimeValue<TValue, TPresence>[]>({
            tag: SchemaTag.Array,
            item: readGuardSchema(this, "array item")
        });
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
        >({
            tag: SchemaTag.Union,
            options: [
                readGuardSchema(this, "union option 0"),
                readGuardSchema(other, "union option 1")
            ]
        });
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
}
