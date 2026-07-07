/**
 * @file runtime.ts
 * @brief Runtime-object guard builders.
 * @details These builders describe JavaScript object domains that JSON Schema
 * and AOT source cannot faithfully serialize.
 */

import { SchemaTag } from "../kind/index.js";
import {
    BaseGuard,
    type Guard,
    type Infer,
    type Presence,
    type WithCheckSource
} from "../guard/index.js";
import { isSchema } from "../evaluate/index.js";
import type { Schema } from "../schema/index.js";
import { readGuardSchema } from "../internal/index.js";
import { createWithCheckSource } from "../guard/with-check.js";

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
export function property(
    key: string | number,
    value: Guard<unknown, Presence>
): WithCheckSource;

export function property<
    TBase extends Guard<unknown, Presence>,
    const TKey extends string,
    TValue extends Guard<unknown, Presence>
>(
    base: TBase,
    key: TKey,
    value: TValue
): BaseGuard<Infer<TBase> & Readonly<Record<TKey, Infer<TValue>>>>;

export function property(
    first: Guard<unknown, Presence> | string | number,
    second: Guard<unknown, Presence> | string,
    third?: Guard<unknown, Presence>
): BaseGuard<unknown> | WithCheckSource {
    if (third === undefined) {
        return propertyCheckSource(first, second);
    }
    const key = second;
    if (typeof key !== "string") {
        throw new TypeError("property key must be a string");
    }
    const baseSchema = readGuardSchema(first, "property base");
    const valueSchema = readGuardSchema(third, "property value");
    return new BaseGuard<unknown>({
        tag: SchemaTag.Property,
        base: baseSchema,
        key,
        value: valueSchema
    });
}

/**
 * @brief Build a Zod-style public-property semantic source.
 * @param key Public property name to read after the base guard accepts.
 * @param value Guard applied to the property value.
 * @returns Reusable source accepted by `guard.with()`.
 */
function propertyCheckSource(
    key: Guard<unknown, Presence> | string | number,
    value: Guard<unknown, Presence> | string
): WithCheckSource {
    if (typeof key !== "string" && typeof key !== "number") {
        throw new TypeError("property key must be a string or number");
    }
    const schema = readGuardSchema(value, "property value");
    const propertyName = String(key);
    const path = Object.freeze([key]);
    return createWithCheckSource((payload) => {
        const input = payload.value;
        if (input === null || input === undefined) {
            payload.issues.push({
                path,
                message: `expected property ${propertyName}`
            });
            return;
        }
        const propertyValue = Reflect.get(Object(input), propertyName) as unknown;
        if (!isSchema(schema, propertyValue)) {
            payload.issues.push({
                path,
                message: `expected property ${propertyName}`
            });
        }
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
                    key: undefined,
                    value: root,
                    loose: false
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
