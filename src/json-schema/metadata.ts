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
    if (metadata.id !== undefined && outputTarget !== "openapi-3.0") {
        target.$id = uri(metadata.id);
    }
    if (metadata.title !== undefined) {
        target.title = metadata.title;
    }
    if (metadata.description !== undefined) {
        target.description = metadata.description;
    }
    if (metadata.examples !== undefined) {
        target.examples = metadata.examples.slice();
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
            target[key] = value;
        }
    }
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
