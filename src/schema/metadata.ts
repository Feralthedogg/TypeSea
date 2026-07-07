/**
 * @file metadata.ts
 * @brief Schema metadata normalization helpers.
 * @details Metadata is documentation-only. It must never participate in boolean
 * validation, but it still crosses public boundaries and is therefore copied and
 * frozen before entering schema records.
 */

import {
    isMissingDataProperty,
    isRecord,
    isUnknownArray,
    readOwnDataProperty
} from "./common.js";
import type { SchemaMetadata } from "./types.js";

export interface SchemaMetadataInput {
    readonly id?: string;
    readonly title?: string;
    readonly description?: string;
    readonly examples?: readonly unknown[];
}

/**
 * @brief Normalize user supplied schema metadata.
 * @param value Candidate metadata object.
 * @returns Frozen metadata payload stored in a schema wrapper.
 */
export function readSchemaMetadata(value: unknown): SchemaMetadata {
    if (!isRecord(value)) {
        throw new TypeError("schema metadata must be an object");
    }
    const id = readOptionalString(readOwnDataProperty(value, "id"), "metadata id");
    const title = readOptionalString(readOwnDataProperty(value, "title"), "metadata title");
    const description = readOptionalString(
        readOwnDataProperty(value, "description"),
        "metadata description"
    );
    const examples = readOptionalExamples(readOwnDataProperty(value, "examples"));
    return Object.freeze({
        id,
        title,
        description,
        examples
    });
}

/**
 * @brief Build a metadata payload containing only a title.
 * @param value Title text.
 * @returns Frozen metadata payload.
 */
export function titleMetadata(value: string): SchemaMetadata {
    if (typeof value !== "string") {
        throw new TypeError("schema title must be a string");
    }
    return Object.freeze({
        id: undefined,
        title: value,
        description: undefined,
        examples: undefined
    });
}

/**
 * @brief Build a metadata payload containing only a description.
 * @param value Description text.
 * @returns Frozen metadata payload.
 */
export function descriptionMetadata(value: string): SchemaMetadata {
    if (typeof value !== "string") {
        throw new TypeError("schema description must be a string");
    }
    return Object.freeze({
        id: undefined,
        title: undefined,
        description: value,
        examples: undefined
    });
}

/**
 * @brief Build a metadata payload containing one example.
 * @param value Example value copied by reference into a frozen vector.
 * @returns Frozen metadata payload.
 */
export function exampleMetadata(value: unknown): SchemaMetadata {
    return Object.freeze({
        id: undefined,
        title: undefined,
        description: undefined,
        examples: Object.freeze([value])
    });
}

/**
 * @brief Merge metadata with right-hand values taking precedence.
 * @param left Existing metadata payload.
 * @param right New metadata payload.
 * @returns Frozen merged metadata.
 */
export function mergeSchemaMetadata(
    left: SchemaMetadata,
    right: SchemaMetadata
): SchemaMetadata {
    const examples = mergeExamples(left.examples, right.examples);
    return Object.freeze({
        id: right.id ?? left.id,
        title: right.title ?? left.title,
        description: right.description ?? left.description,
        examples
    });
}

/**
 * @brief Read one optional string metadata field.
 * @param value Candidate field value.
 * @param label Error label.
 * @returns String value or undefined.
 */
function readOptionalString(value: unknown, label: string): string | undefined {
    if (value === undefined || isMissingDataProperty(value)) {
        return undefined;
    }
    if (typeof value !== "string") {
        throw new TypeError(`${label} must be a string`);
    }
    return value;
}

/**
 * @brief Copy an optional examples vector.
 * @param value Candidate examples field.
 * @returns Frozen example vector or undefined.
 */
function readOptionalExamples(value: unknown): readonly unknown[] | undefined {
    if (value === undefined || isMissingDataProperty(value)) {
        return undefined;
    }
    if (!isUnknownArray(value)) {
        throw new TypeError("metadata examples must be an array");
    }
    return Object.freeze(value.slice());
}

/**
 * @brief Merge two optional example vectors.
 */
function mergeExamples(
    left: readonly unknown[] | undefined,
    right: readonly unknown[] | undefined
): readonly unknown[] | undefined {
    if (left === undefined) {
        return right;
    }
    if (right === undefined) {
        return left;
    }
    return Object.freeze([...left, ...right]);
}
