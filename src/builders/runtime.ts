/**
 * @file runtime.ts
 * @brief Runtime-object guard builders.
 * @details These builders describe JavaScript object domains that JSON Schema
 * and AOT source cannot faithfully serialize.
 */

import { SchemaTag } from "../kind/index.js";
import { BaseGuard, type Guard, type Infer, type Presence } from "../guard/index.js";
import type { Schema } from "../schema/index.js";
import { readGuardSchema } from "../internal/index.js";

export type InstanceConstructor<TValue> =
    abstract new (...args: never[]) => TValue;

export type JsonPrimitive = string | number | boolean | null;

export interface JsonArray {
    readonly length: number;
    readonly [index: number]: JsonValue;
}

export interface JsonObject {
    readonly [key: string]: JsonValue;
}

export type JsonValue =
    | JsonPrimitive
    | JsonArray
    | JsonObject;

/**
 * @brief Build a guard backed by ordinary instanceof semantics.
 * @param constructor Constructor function used as the instance domain.
 * @returns Fresh guard accepting values whose prototype chain matches constructor.
 * @throws TypeError when constructor is not callable.
 */
export function instanceOf<TValue>(
    constructor: InstanceConstructor<TValue>
): BaseGuard<TValue> {
    const rawConstructor: unknown = constructor;
    if (typeof rawConstructor !== "function") {
        throw new TypeError("instanceOf constructor must be a function");
    }
    if (!hasObjectPrototype(rawConstructor)) {
        throw new TypeError("instanceOf constructor must expose an object prototype");
    }
    const ctor = rawConstructor as InstanceConstructor<TValue>;
    return new BaseGuard<TValue>({
        tag: SchemaTag.InstanceOf,
        constructor: ctor,
        name: readConstructorName(ctor)
    });
}

/**
 * @brief Require one own data property after a base guard succeeds.
 * @param base Guard applied to the candidate value first.
 * @param key Own string property key to inspect.
 * @param value Guard applied to the property value.
 * @returns Fresh guard preserving the base domain and recording the property type.
 */
export function property<
    TBase extends Guard<unknown, Presence>,
    const TKey extends string,
    TValue extends Guard<unknown, Presence>
>(
    base: TBase,
    key: TKey,
    value: TValue
): BaseGuard<Infer<TBase> & Readonly<Record<TKey, Infer<TValue>>>> {
    if (typeof key !== "string") {
        throw new TypeError("property key must be a string");
    }
    return new BaseGuard<Infer<TBase> & Readonly<Record<TKey, Infer<TValue>>>>({
        tag: SchemaTag.Property,
        base: readGuardSchema(base, "property base"),
        key,
        value: readGuardSchema(value, "property value")
    });
}

/**
 * @brief Build a recursive JSON-value guard.
 * @returns Fresh guard accepting JSON-serializable values.
 * @details The guard accepts finite numbers because TypeSea number semantics
 * reject NaN and infinities. Object values are string-keyed records.
 */
export function json(): BaseGuard<JsonValue> {
    let cached: Schema | undefined;
    const root = new BaseGuard<JsonValue>({
        tag: SchemaTag.Lazy,
        get: (): Schema => {
            cached ??= makeJsonSchema(root.schema);
            return cached;
        }
    });
    return root;
}

/**
 * @brief Materialize the recursive JSON schema after the root guard exists.
 * @param root Recursive root schema used by arrays and records.
 * @returns Union schema for every JSON value variant.
 */
function makeJsonSchema(root: Schema): Schema {
    return {
        tag: SchemaTag.Union,
        options: [
            {
                tag: SchemaTag.String,
                checks: []
            },
            {
                tag: SchemaTag.Number,
                checks: []
            },
            {
                tag: SchemaTag.Boolean
            },
            {
                tag: SchemaTag.Literal,
                value: null
            },
            {
                tag: SchemaTag.Array,
                item: root,
                checks: []
            },
            {
                tag: SchemaTag.Refine,
                inner: {
                    tag: SchemaTag.Record,
                    value: root
                },
                predicate: isJsonObject,
                name: "json_object"
            }
        ]
    };
}

/**
 * @brief Accept only JSON object containers.
 * @param value Candidate value already checked as a record.
 * @returns True for ordinary or null-prototype objects.
 */
function isJsonObject(value: unknown): boolean {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const prototype: unknown = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

/**
 * @brief Read a stable diagnostic name from a constructor function.
 * @param constructor Function supplied to instanceOf.
 * @returns Constructor name or a generic fallback.
 */
function readConstructorName(constructor: object): string {
    const descriptor = Object.getOwnPropertyDescriptor(constructor, "name");
    const name: unknown = descriptor !== undefined && "value" in descriptor
        ? descriptor.value
        : undefined;
    return descriptor !== undefined &&
        "value" in descriptor &&
        typeof name === "string" &&
        name.length !== 0
        ? name
        : "constructor";
}

/**
 * @brief Check that a function can participate in ordinary instance checks.
 * @param constructor Function supplied to instanceOf.
 * @returns True when the function exposes an object prototype slot.
 */
function hasObjectPrototype(constructor: object): boolean {
    const descriptor = Object.getOwnPropertyDescriptor(constructor, "prototype");
    if (descriptor === undefined ||
        !("value" in descriptor)) {
        return false;
    }
    const prototype: unknown = descriptor.value;
    return (typeof prototype === "object" && prototype !== null) ||
        typeof prototype === "function";
}
