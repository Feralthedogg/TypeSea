/**
 * @file enum.ts
 * @brief Enum guard implementation.
 * @details EnumGuard keeps Zod-style `.options`, `.enum`, `.extract()`, and
 * `.exclude()` metadata while validation still runs through literal unions.
 */

import { SchemaTag } from "../kind/index.js";
import { normalizeUnionSchema, type Schema } from "../schema/index.js";
import { BaseGuard } from "./base.js";
import { defineReadonlyProperty } from "./props.js";
import type { Presence } from "./types.js";

export type EnumLiteralValue = string | number;

type EnumObject<TValue extends EnumLiteralValue> =
    Readonly<Record<string, TValue>>;

interface EnumState<TValue extends EnumLiteralValue> {
    readonly options: readonly TValue[];
    readonly enumObject: EnumObject<TValue>;
}

const enumStates = new WeakMap<object, EnumState<EnumLiteralValue>>();

/**
 * @brief Guard for a finite set of string or numeric enum values.
 */
export class EnumGuard<
    TValue extends EnumLiteralValue,
    TPresence extends Presence = "required"
> extends BaseGuard<TValue, TPresence> {
    public declare readonly options: readonly TValue[];
    public declare readonly enum: EnumObject<TValue>;

    /**
     * @brief Construct an enum guard facade.
     * @param values Unique enum values accepted by this guard.
     * @param enumObject Enum-like object exposed through `.enum`.
     */
    public constructor(
        values: readonly TValue[],
        enumObject: EnumObject<TValue>
    ) {
        const options = Object.freeze(values.slice());
        const exposedEnum = Object.freeze({ ...enumObject });
        super(enumSchema(options));
        defineReadonlyProperty(this, "options", options, true);
        defineReadonlyProperty(this, "enum", exposedEnum, true);
        enumStates.set(this, {
            options,
            enumObject: exposedEnum
        });
        Object.freeze(this);
    }

    /**
     * @brief Keep only selected enum values.
     * @param values Values to retain.
     * @returns Fresh EnumGuard containing the selected subset.
     */
    public extract<const TValues extends readonly [TValue, ...TValue[]]>(
        values: TValues
    ): EnumGuard<Extract<TValue, TValues[number]>, TPresence> {
        const state = readEnumState(this, "enum extract receiver");
        const selected = readEnumSelection(
            state,
            values,
            "extract values",
            "include"
        );
        return new EnumGuard<Extract<TValue, TValues[number]>, TPresence>(
            selected.options as readonly Extract<TValue, TValues[number]>[],
            selected.enumObject as EnumObject<Extract<TValue, TValues[number]>>
        );
    }

    /**
     * @brief Remove selected enum values.
     * @param values Values to remove.
     * @returns Fresh EnumGuard without the selected values.
     */
    public exclude<const TValues extends readonly [TValue, ...TValue[]]>(
        values: TValues
    ): EnumGuard<Exclude<TValue, TValues[number]>, TPresence> {
        const state = readEnumState(this, "enum exclude receiver");
        const excluded = readEnumSelection(
            state,
            values,
            "exclude values",
            "exclude"
        );
        return new EnumGuard<Exclude<TValue, TValues[number]>, TPresence>(
            excluded.options as readonly Exclude<TValue, TValues[number]>[],
            excluded.enumObject as EnumObject<Exclude<TValue, TValues[number]>>
        );
    }
}

/**
 * @brief Build a literal-union schema for enum values.
 */
function enumSchema(values: readonly EnumLiteralValue[]): Schema {
    const options = new Array<Schema>(values.length);
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (value === undefined) {
            continue;
        }
        options[index] = {
            tag: SchemaTag.Literal,
            value
        };
    }
    return normalizeUnionSchema(options);
}

/**
 * @brief Read enum state from a real EnumGuard receiver.
 */
function readEnumState(
    receiver: unknown,
    label: string
): EnumState<EnumLiteralValue> {
    if (typeof receiver !== "object" || receiver === null) {
        throw new TypeError(`${label} must be an EnumGuard`);
    }
    const state = enumStates.get(receiver);
    if (state === undefined) {
        throw new TypeError(`${label} must be an EnumGuard`);
    }
    return state;
}

/**
 * @brief Build an extracted or excluded enum subset.
 */
function readEnumSelection(
    state: EnumState<EnumLiteralValue>,
    values: readonly EnumLiteralValue[],
    label: string,
    mode: "include" | "exclude"
): EnumState<EnumLiteralValue> {
    if (!Array.isArray(values) || values.length === 0) {
        throw new TypeError(`${label} must be a non-empty array`);
    }
    validateSelectionValues(state.options, values, label);
    const selected =
        mode === "include"
            ? state.options.filter((value) => includesValue(values, value))
            : state.options.filter((value) => !includesValue(values, value));
    if (selected.length === 0) {
        throw new TypeError(`${label} must leave at least one enum value`);
    }
    return {
        options: Object.freeze(selected.slice()),
        enumObject: enumObjectForValues(state.enumObject, selected)
    };
}

/**
 * @brief Validate user-supplied subset values.
 */
function validateSelectionValues(
    options: readonly EnumLiteralValue[],
    values: readonly EnumLiteralValue[],
    label: string
): void {
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];
        if (!includesValue(options, value)) {
            throw new TypeError(`${label} must contain enum values`);
        }
        for (let seen = 0; seen < index; seen += 1) {
            if (Object.is(values[seen], value)) {
                throw new TypeError(`${label} must contain unique values`);
            }
        }
    }
}

/**
 * @brief Copy enum object entries whose values remain selected.
 */
function enumObjectForValues(
    enumObject: EnumObject<EnumLiteralValue>,
    values: readonly EnumLiteralValue[]
): EnumObject<EnumLiteralValue> {
    const next: Record<string, EnumLiteralValue> = {};
    const keys = Object.keys(enumObject);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined) {
            continue;
        }
        const value = enumObject[key];
        if (includesValue(values, value)) {
            next[key] = value;
        }
    }
    return Object.freeze(next);
}

/**
 * @brief Object.is membership scan for primitive enum values.
 */
function includesValue(
    values: readonly EnumLiteralValue[],
    value: unknown
): value is EnumLiteralValue {
    for (let index = 0; index < values.length; index += 1) {
        if (Object.is(values[index], value)) {
            return true;
        }
    }
    return false;
}
