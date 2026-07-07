/**
 * @file union.ts
 * @brief Union guard implementation.
 * @details UnionGuard and XorGuard expose Zod-style option introspection while
 * validation keeps using the existing union and xor schema records.
 */

import type { Schema } from "../schema/index.js";
import { BaseGuard } from "./base.js";
import { defineReadonlyProperty } from "./props.js";
import type {
    Guard,
    Infer,
    Presence
} from "./types.js";

type OptionTuple = readonly [Guard<unknown, Presence>, ...Guard<unknown, Presence>[]];

/**
 * @brief Guard for ordered union branches.
 */
export class UnionGuard<
    TOptions extends OptionTuple,
    TPresence extends Presence = "required"
> extends BaseGuard<Infer<TOptions[number]>, TPresence> {
    public declare readonly options: TOptions;

    /**
     * @brief Construct a union guard facade.
     * @param schema Normalized union schema consumed by validators.
     * @param options Original guard options exposed for introspection.
     */
    public constructor(schema: Schema, options: TOptions) {
        super(schema);
        defineReadonlyProperty(this, "options", Object.freeze(options.slice()), true);
        Object.freeze(this);
    }
}

/**
 * @brief Guard for ordered exclusive-union branches.
 */
export class XorGuard<
    TOptions extends OptionTuple,
    TPresence extends Presence = "required"
> extends BaseGuard<Infer<TOptions[number]>, TPresence> {
    public declare readonly options: TOptions;

    /**
     * @brief Construct an xor guard facade.
     * @param schema Xor schema consumed by validators.
     * @param options Original guard options exposed for introspection.
     */
    public constructor(schema: Schema, options: TOptions) {
        super(schema);
        defineReadonlyProperty(this, "options", Object.freeze(options.slice()), true);
        Object.freeze(this);
    }
}
