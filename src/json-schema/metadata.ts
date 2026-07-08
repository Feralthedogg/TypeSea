/**
 * @file metadata.ts
 * @brief JSON Schema metadata attachment helpers.
 * @details Registry metadata is documentation-only, but it still crosses the
 * JSON Schema public boundary and must be copied without invoking accessors.
 */

import type { GlobalRegistryMetadata } from "../registry/index.js";
import type {
    JsonSchema,
    JsonSchemaOutputTarget,
    JsonSchemaUriMapper,
    MutableJsonSchemaObject
} from "./types.js";

const RESERVED_REGISTRY_METADATA_KEYS = new Set([
    "id",
    "title",
    "description",
    "examples"
]);

/**
 * @brief Attach registry metadata as JSON Schema annotations and extensions.
 */
export function applyGlobalRegistryMetadata(
    emitted: JsonSchema,
    metadata: GlobalRegistryMetadata,
    outputTarget: JsonSchemaOutputTarget,
    uri: JsonSchemaUriMapper
): JsonSchema {
    if (emitted === false) {
        return false;
    }
    const target: MutableJsonSchemaObject = emitted === true ? {} : { ...emitted };
    copyRegistryMetadataExtensions(target, metadata);
    const id = readOwnDataProperty(metadata, "id");
    const title = readOwnDataProperty(metadata, "title");
    const description = readOwnDataProperty(metadata, "description");
    const examples = readOwnDataProperty(metadata, "examples");
    if (typeof id === "string" && outputTarget !== "openapi-3.0") {
        defineJsonSchemaDataProperty(target, "$id", uri(id));
    }
    if (typeof title === "string") {
        defineJsonSchemaDataProperty(target, "title", title);
    }
    if (typeof description === "string") {
        defineJsonSchemaDataProperty(target, "description", description);
    }
    if (Array.isArray(examples)) {
        defineJsonSchemaDataProperty(target, "examples", copyDataArray(examples));
    }
    return target;
}

/**
 * @brief Copy user extension fields while leaving known metadata normalized.
 */
function copyRegistryMetadataExtensions(
    target: MutableJsonSchemaObject,
    metadata: GlobalRegistryMetadata
): void {
    const keys = Object.keys(metadata);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined || RESERVED_REGISTRY_METADATA_KEYS.has(key)) {
            continue;
        }
        const value = readOwnDataProperty(metadata, key);
        if (value !== undefined) {
            defineJsonSchemaDataProperty(target, key, value);
        }
    }
}

/**
 * @brief Define a JSON Schema annotation without invoking object prototype setters.
 */
function defineJsonSchemaDataProperty(
    target: MutableJsonSchemaObject,
    key: PropertyKey,
    value: unknown
): void {
    Object.defineProperty(target, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true
    });
}

/**
 * @brief Copy array data slots without calling user-controlled `slice`.
 */
function copyDataArray(value: readonly unknown[]): readonly unknown[] {
    const output = new Array<unknown>(value.length);
    for (let index = 0; index < value.length; index += 1) {
        const item = readOwnDataProperty(value, String(index));
        output[index] = item;
    }
    return output;
}

/**
 * @brief Read one own data slot without invoking accessors.
 */
function readOwnDataProperty(value: object, key: PropertyKey): unknown {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        return undefined;
    }
    return descriptor.value;
}
