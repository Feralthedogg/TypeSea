/**
 * @file record.ts
 * @brief Prototype-safe record construction for generated SeaFlow payloads.
 */

/**
 * @brief Define a SeaFlow field without invoking inherited setters.
 * @details Assignment is unsafe for keys such as `__proto__`; defining an own
 * data descriptor preserves the generated payload and its prototype.
 */
export function defineSeaFlowDataProperty(
    output: object,
    key: string,
    value: unknown
): void {
    Object.defineProperty(output, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true
    });
}

/**
 * @brief Copy enumerable own data slots without evaluating accessors.
 * @details Accessor descriptors are skipped because fuzz generation must not
 * execute behavior supplied by the value being mutated.
 */
export function copySeaFlowRecord(
    value: unknown,
    omitted?: string
): Record<string, unknown> {
    const output: Record<string, unknown> = {};
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return output;
    }
    const keys = Object.keys(value);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined || key === omitted) {
            continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor !== undefined &&
            Object.prototype.hasOwnProperty.call(descriptor, "value")) {
            defineSeaFlowDataProperty(output, key, descriptor.value);
        }
    }
    return output;
}
