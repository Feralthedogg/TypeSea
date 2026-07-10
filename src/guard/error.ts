/**
 * @file error.ts
 * @brief TypeSea assertion error.
 */

import type { Issue } from "../issue/index.js";
import { copyIssueArray } from "../issue/index.js";
import {
    flattenIssues,
    formatError,
    type FlattenedIssueMessages,
    type FormattedIssueMessages,
    type IssueMessageOptions
} from "../message/index.js";
import { defineReadonlyProperty } from "./props.js";

/**
 * @brief Error thrown by assert() after validation has already produced issues.
 * @details The issue array is copied before publication so callers cannot mutate
 * diagnostic state through the error object.
 */
export class TypeSeaAssertionError extends Error {
    public declare readonly issues: readonly Issue[];

    /**
     * @brief Construct an assertion error from validation issues.
     * @details The copied issue array is exposed as the stable diagnostic payload.
     * @param issues Issues produced by checkSchema.
     * @post Published issues are copied and exposed through a readonly property.
     */
    public constructor(issues: readonly Issue[]) {
        super("TypeSea assertion failed");
        this.name = "TypeSeaAssertionError";
        defineReadonlyProperty(this, "issues", copyIssueArray(issues), true);
    }

    /**
     * @brief Return shallow form and field diagnostic buckets.
     * @param options Optional message rendering options.
     * @returns Frozen flattened diagnostic object.
     */
    public flatten(
        options?: Partial<IssueMessageOptions>
    ): FlattenedIssueMessages {
        return flattenIssues(this.issues, options);
    }

    /**
     * @brief Return legacy nested `_errors` diagnostic formatting.
     * @param options Optional message rendering options.
     * @returns Frozen nested diagnostic object.
     */
    public format(
        options?: Partial<IssueMessageOptions>
    ): FormattedIssueMessages {
        return formatError(this.issues, options);
    }
}
