/**
 * @file readonly-set.ts
 * @brief Immutable ReadonlySet facade for public guard metadata.
 * @details Native Set instances remain mutable even after Object.freeze().
 * This facade exposes the ReadonlySet contract without mutation methods.
 */

/**
 * @brief ReadonlySet backed by a frozen primitive vector.
 */
export class FrozenReadonlySet<TValue> implements ReadonlySet<TValue> {
    public readonly [Symbol.toStringTag] = "Set";
    private readonly items: readonly TValue[];

    /**
     * @brief Construct a readonly set facade.
     * @param values Unique values stored by the facade.
     */
    public constructor(values: readonly TValue[]) {
        this.items = Object.freeze(values.slice());
        Object.freeze(this);
    }

    /**
     * @brief Number of stored values.
     */
    public get size(): number {
        return this.items.length;
    }

    /**
     * @brief Test membership using Object.is semantics.
     * @param value Candidate value.
     * @returns True when the value is present.
     */
    public has(value: TValue): boolean {
        const items = this.items;
        for (let index = 0; index < items.length; index += 1) {
            if (Object.is(items[index], value)) {
                return true;
            }
        }
        return false;
    }

    /**
     * @brief Iterate values.
     */
    public *values(): SetIterator<TValue> {
        const items = this.items;
        for (let index = 0; index < items.length; index += 1) {
            yield items[index] as TValue;
        }
    }

    /**
     * @brief Iterate keys, identical to values for Set.
     */
    public keys(): SetIterator<TValue> {
        return this.values();
    }

    /**
     * @brief Iterate value pairs, matching ReadonlySet entries.
     */
    public *entries(): SetIterator<[TValue, TValue]> {
        const items = this.items;
        for (let index = 0; index < items.length; index += 1) {
            const value = items[index] as TValue;
            yield [value, value];
        }
    }

    /**
     * @brief Execute a callback for each value.
     * @param callbackfn Callback invoked with value, value, and this set.
     * @param thisArg Optional callback receiver.
     */
    public forEach(
        callbackfn: (value: TValue, value2: TValue, set: ReadonlySet<TValue>) => void,
        thisArg?: unknown
    ): void {
        const items = this.items;
        for (let index = 0; index < items.length; index += 1) {
            const value = items[index] as TValue;
            callbackfn.call(thisArg, value, value, this);
        }
    }

    /**
     * @brief Default set iterator.
     */
    public [Symbol.iterator](): SetIterator<TValue> {
        return this.values();
    }
}
