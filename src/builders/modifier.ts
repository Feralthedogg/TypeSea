/**
 * @file modifier.ts
 * @brief Presence, lazy, and refinement guard builders.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 */

import { PresenceTag, SchemaTag } from "../kind/index.js";
import {
    BaseGuard,
    type Guard,
    type GuardPresence,
    type GuardValue,
    type Infer,
    type Presence,
    type ReadonlyValue,
    type RefineParams,
    type SuperRefineContext,
    type UnwrappedGuardValue,
    type WithCheckCallback,
    type WithCheckSource
} from "../guard/index.js";
import type { Schema } from "../schema/index.js";
import {
    descriptionMetadata,
    exampleMetadata,
    mergeSchemaMetadata,
    readSchemaMetadata,
    titleMetadata,
    type SchemaMetadata,
    type SchemaMetadataInput,
    nonoptionalSchema,
    unwrapSchema
} from "../schema/index.js";
import { isStrictTrue, readGuardSchema } from "../internal/index.js";
import {
    collectSuperRefineIssues,
    runSuperRefine
} from "../guard/super-refine.js";
import { createWithCheckSource } from "../guard/with-check.js";
import { readRefineOptions } from "../guard/refine-options.js";

type CustomPredicate<TValue> =
    | ((value: unknown) => value is TValue)
    | ((value: unknown) => boolean);

/**
 * @brief Mark a guard optional for object shape construction.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 * @param guard Guard whose value type is preserved.
 * @returns Fresh optional guard.
 */
export function optional<TGuard extends Guard<unknown, Presence>>(
    guard: TGuard
): BaseGuard<GuardValue<TGuard>, "optional"> {
    return new BaseGuard<GuardValue<TGuard>, "optional">({
        tag: SchemaTag.Optional,
        inner: readGuardSchema(guard, "optional inner")
    });
}

/**
 * @brief Allow object-key omission without accepting standalone undefined.
 * @param guard Guard used when the key is present.
 * @returns Fresh guard whose object presence is optional but whose value
 * validation remains the original guard.
 */
export function exactOptional<TGuard extends Guard<unknown, Presence>>(
    guard: TGuard
): BaseGuard<GuardValue<TGuard>, "exactOptional"> {
    const inner = readGuardSchema(guard, "exactOptional inner");
    return new BaseGuard<GuardValue<TGuard>, "exactOptional">({
        tag: SchemaTag.Lazy,
        get: (): Schema => inner,
        objectPresence: (): PresenceTag => PresenceTag.Optional
    });
}

/**
 * @brief Allow explicit undefined as a value.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 * @param guard Guard to wrap.
 * @returns Fresh undefinedable guard preserving original presence.
 */
export function undefinedable<TGuard extends Guard<unknown, Presence>>(
    guard: TGuard
): BaseGuard<GuardValue<TGuard> | undefined, GuardPresence<TGuard>> {
    return new BaseGuard<GuardValue<TGuard> | undefined, GuardPresence<TGuard>>({
        tag: SchemaTag.Undefinedable,
        inner: readGuardSchema(guard, "undefinedable inner")
    });
}

/**
 * @brief Allow explicit null as a value.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 * @param guard Guard to wrap.
 * @returns Fresh nullable guard preserving original presence.
 */
export function nullable<TGuard extends Guard<unknown, Presence>>(
    guard: TGuard
): BaseGuard<GuardValue<TGuard> | null, GuardPresence<TGuard>> {
    return new BaseGuard<GuardValue<TGuard> | null, GuardPresence<TGuard>>({
        tag: SchemaTag.Nullable,
        inner: readGuardSchema(guard, "nullable inner")
    });
}

/**
 * @brief Allow null, undefined, and absent object keys.
 * @param guard Guard to wrap.
 * @returns Fresh optional guard whose value domain also includes null.
 */
export function nullish<TGuard extends Guard<unknown, Presence>>(
    guard: TGuard
): BaseGuard<GuardValue<TGuard> | null, "optional"> {
    return new BaseGuard<GuardValue<TGuard> | null, "optional">({
        tag: SchemaTag.Optional,
        inner: {
            tag: SchemaTag.Nullable,
            inner: readGuardSchema(guard, "nullish inner")
        }
    });
}

/**
 * @brief Freeze accepted values returned by parse-like APIs.
 * @param guard Guard to wrap without changing boolean validation.
 * @returns Fresh readonly guard preserving presence.
 */
export function readonly<TGuard extends Guard<unknown, Presence>>(
    guard: TGuard
): BaseGuard<ReadonlyValue<GuardValue<TGuard>>, GuardPresence<TGuard>> {
    return new BaseGuard<ReadonlyValue<GuardValue<TGuard>>, GuardPresence<TGuard>>({
        tag: SchemaTag.Readonly,
        inner: readGuardSchema(guard, "readonly inner")
    });
}

/**
 * @brief Expose the payload schema of optional, nullable, or array guards.
 * @param guard Guard whose schema should be unwrapped.
 * @returns Fresh guard for the inner schema.
 */
export function unwrap<TGuard extends Guard<unknown, Presence>>(
    guard: TGuard
): BaseGuard<UnwrappedGuardValue<TGuard>> {
    return new BaseGuard<UnwrappedGuardValue<TGuard>>(
        unwrapSchema(readGuardSchema(guard, "unwrap inner"))
    );
}

/**
 * @brief Remove optional presence and explicit undefined acceptance.
 * @param guard Guard whose undefined acceptance should be removed.
 * @returns Fresh required guard preserving nullability.
 */
export function nonoptional<TGuard extends Guard<unknown, Presence>>(
    guard: TGuard
): BaseGuard<Exclude<GuardValue<TGuard>, undefined>> {
    return new BaseGuard<Exclude<GuardValue<TGuard>, undefined>>(
        nonoptionalSchema(readGuardSchema(guard, "nonoptional inner"))
    );
}

/**
 * @brief Build a user-defined guard from an unknown input predicate.
 * @details Custom guards keep the unknown input boundary explicit. The
 * predicate is optional for Zod migration ergonomics. When present, it must
 * return the literal boolean true; truthy non-booleans fail exactly like
 * refine().
 * @param predicate Runtime predicate for the target domain.
 * @param params Legacy label string or Zod-style refinement options.
 * @returns Fresh guard whose inferred value is supplied by the caller.
 */
export function custom<TValue = unknown>(
    predicate?: CustomPredicate<TValue>,
    params?: RefineParams<TValue>
): BaseGuard<TValue> {
    if (predicate !== undefined && typeof predicate !== "function") {
        throw new TypeError("custom predicate must be a function");
    }
    const options = readRefineOptions(params);
    return new BaseGuard<TValue>({
        tag: SchemaTag.Refine,
        inner: {
            tag: SchemaTag.Unknown
        },
        predicate: (value: unknown): boolean =>
            predicate === undefined || isStrictTrue(predicate(value)),
        path: options.path,
        message: options.message,
        abort: options.abort,
        when: options.when,
        name: params === undefined ? "custom" : options.name
    });
}

/**
 * @brief Resolve recursive schemas once and reuse the frozen schema handle.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 * @param get Resolver returning the recursive guard.
 * @returns Fresh lazy guard.
 * @throws TypeError when the resolver is not callable.
 */
export function lazy<TGuard extends Guard<unknown, Presence>>(
    get: () => TGuard
): BaseGuard<Infer<TGuard>> {
    if (typeof get !== "function") {
        throw new TypeError("lazy resolver must be a function");
    }
    let cached: Schema | undefined;
    return new BaseGuard<Infer<TGuard>>({
        tag: SchemaTag.Lazy,
        get: (): Schema => {
            /*
             * Cache the resolved schema rather than the guard wrapper. This keeps
             * recursive validation stable after the first successful resolution.
             */
            cached ??= readGuardSchema(get(), "lazy result");
            return cached;
        }
    });
}

/**
 * @brief Attach a boolean refinement while preserving TypeSea's strict true contract.
 * @details Builder helpers normalize user-facing fluent calls into immutable schema nodes
 * with stable metadata.
 * @param guard Guard that must pass before the predicate runs.
 * @param predicate User predicate that must return the boolean literal true.
 * @param name Diagnostic name for refinement failures.
 * @returns Fresh refined guard.
 */
export function refine<TGuard extends Guard<unknown, Presence>>(
    guard: TGuard,
    predicate: (value: Infer<TGuard>) => boolean,
    params?: RefineParams<Infer<TGuard>>
): BaseGuard<GuardValue<TGuard>, GuardPresence<TGuard>> {
    if (typeof predicate !== "function") {
        throw new TypeError("refinement predicate must be a function");
    }
    const options = readRefineOptions(params);
    return new BaseGuard<GuardValue<TGuard>, GuardPresence<TGuard>>({
        tag: SchemaTag.Refine,
        inner: readGuardSchema(guard, "refine inner"),
        /*
         * Truthy non-boolean values are rejected. This keeps refinement behavior
         * identical between interpreted and compiled validation paths.
         */
        predicate: (value: unknown): boolean =>
            isStrictTrue(predicate(value as Infer<TGuard>)),
        path: options.path,
        message: options.message,
        abort: options.abort,
        when: options.when,
        name: options.name
    });
}

/**
 * @brief Attach a callback-style semantic refinement.
 * @param guard Guard that must pass before the callback runs.
 * @param callback User callback that calls context.addIssue() to fail.
 * @param name Diagnostic name for refinement failures.
 * @returns Fresh refined guard.
 */
export function superRefine<TGuard extends Guard<unknown, Presence>>(
    guard: TGuard,
    callback: (value: Infer<TGuard>, context: SuperRefineContext) => void,
    name?: string
): BaseGuard<GuardValue<TGuard>, GuardPresence<TGuard>> {
    if (typeof callback !== "function") {
        throw new TypeError("super refinement callback must be a function");
    }
    if (name !== undefined && typeof name !== "string") {
        throw new TypeError("refinement name must be a string");
    }
    const label = name ?? "refinement";
    return new BaseGuard<GuardValue<TGuard>, GuardPresence<TGuard>>({
        tag: SchemaTag.Refine,
        inner: readGuardSchema(guard, "superRefine inner"),
        predicate: (value: unknown): boolean =>
            runSuperRefine(
                callback,
                value as Infer<TGuard>
            ),
        collect: (value: unknown) =>
            collectSuperRefineIssues(
                callback,
                value as Infer<TGuard>
            ),
        name: label
    });
}

/**
 * @brief Create a reusable Zod-style callback check source.
 * @param callback Callback receiving `{ value, issues }`.
 * @returns Frozen source accepted by `guard.with()`.
 */
export function check<TValue = unknown>(
    callback: WithCheckCallback<TValue>
): WithCheckSource<TValue> {
    return createWithCheckSource(callback);
}

/**
 * @brief Attach JSON Schema/documentation metadata.
 * @param guard Guard to annotate.
 * @param value Metadata object accepted by TypeSea.
 * @returns Fresh guard with unchanged validation semantics.
 */
export function metadata<TGuard extends Guard<unknown, Presence>>(
    guard: TGuard,
    value: SchemaMetadataInput
): BaseGuard<GuardValue<TGuard>, GuardPresence<TGuard>> {
    return new BaseGuard<GuardValue<TGuard>, GuardPresence<TGuard>>(
        metadataSchema(
            readGuardSchema(guard, "metadata inner"),
            readSchemaMetadata(value)
        )
    );
}

/**
 * @brief Attach JSON Schema/documentation metadata with Zod-compatible naming.
 */
export function meta<TGuard extends Guard<unknown, Presence>>(
    guard: TGuard,
    value: SchemaMetadataInput
): BaseGuard<GuardValue<TGuard>, GuardPresence<TGuard>> {
    return metadata(guard, value);
}

/**
 * @brief Attach a title annotation.
 */
export function title<TGuard extends Guard<unknown, Presence>>(
    guard: TGuard,
    value: string
): BaseGuard<GuardValue<TGuard>, GuardPresence<TGuard>> {
    return new BaseGuard<GuardValue<TGuard>, GuardPresence<TGuard>>(
        metadataSchema(readGuardSchema(guard, "title inner"), titleMetadata(value))
    );
}

/**
 * @brief Attach a description annotation.
 */
export function describe<TGuard extends Guard<unknown, Presence>>(
    guard: TGuard,
    value: string
): BaseGuard<GuardValue<TGuard>, GuardPresence<TGuard>> {
    return new BaseGuard<GuardValue<TGuard>, GuardPresence<TGuard>>(
        metadataSchema(
            readGuardSchema(guard, "describe inner"),
            descriptionMetadata(value)
        )
    );
}

/**
 * @brief Append one example annotation.
 */
export function example<TGuard extends Guard<unknown, Presence>>(
    guard: TGuard,
    value: unknown
): BaseGuard<GuardValue<TGuard>, GuardPresence<TGuard>> {
    return new BaseGuard<GuardValue<TGuard>, GuardPresence<TGuard>>(
        metadataSchema(readGuardSchema(guard, "example inner"), exampleMetadata(value))
    );
}

/**
 * @brief Attach a local diagnostic message to a schema.
 */
export function message<TGuard extends Guard<unknown, Presence>>(
    guard: TGuard,
    value: string
): BaseGuard<GuardValue<TGuard>, GuardPresence<TGuard>> {
    if (typeof value !== "string") {
        throw new TypeError("message must be a string");
    }
    return new BaseGuard<GuardValue<TGuard>, GuardPresence<TGuard>>({
        tag: SchemaTag.Message,
        inner: readGuardSchema(guard, "message inner"),
        message: value
    });
}

/**
 * @brief Build or merge a metadata wrapper.
 */
function metadataSchema(inner: Schema, metadataValue: SchemaMetadata): Schema {
    if (inner.tag === SchemaTag.Metadata) {
        return {
            tag: SchemaTag.Metadata,
            inner: inner.inner,
            metadata: mergeSchemaMetadata(inner.metadata, metadataValue)
        };
    }
    return {
        tag: SchemaTag.Metadata,
        inner,
        metadata: metadataValue
    };
}
