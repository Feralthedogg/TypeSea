/**
 * @file props.ts
 * @brief Guard object shape helpers.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
 */

/**
 * @brief Define one immutable public property.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
 * @param target Object receiving the property.
 * @param key Property key.
 * @param value Stored property value.
 * @param enumerable Whether the property should appear in enumeration.
 * @post The property is non-configurable and non-writable.
 */
export function defineReadonlyProperty(
    target: object,
    key: string,
    value: unknown,
    enumerable: boolean
): void {
    Object.defineProperty(target, key, {
        configurable: false,
        enumerable,
        value,
        writable: false
    });
}

/**
 * @brief Test for the only accepted refinement success value.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
 * @param value Predicate return value.
 * @returns True only for the boolean literal true.
 */
export function isStrictTrue(value: unknown): boolean {
    return value === true;
}

/**
 * @brief Test whether a value is a non-array object record.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
 * @param value Candidate runtime value.
 * @returns True for object values that can carry string properties.
 */
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Accept only unmodified RegExp instances for schema storage.
 * @details User-owned exec/test/source/flags overrides can change validation
 * behavior after construction, so they are rejected at the API boundary.
 * @param value Candidate pattern.
 * @returns True for plain RegExp instances without own behavioral overrides.
 */
export function isPlainRegExp(value: unknown): value is RegExp {
    return value instanceof RegExp &&
        Object.getPrototypeOf(value) === RegExp.prototype &&
        !Object.prototype.hasOwnProperty.call(value, "exec") &&
        !Object.prototype.hasOwnProperty.call(value, "test") &&
        !Object.prototype.hasOwnProperty.call(value, "source") &&
        !Object.prototype.hasOwnProperty.call(value, "flags");
}
