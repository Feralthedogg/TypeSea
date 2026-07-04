/**
 * @file error.ts
 * @brief TypeSea assertion error.
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
 */

import type { Issue } from "../issue/index.js";
import { copyIssueArray } from "../issue/index.js";
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
 * @details Guard helpers build new immutable schema wrappers so fluent APIs never mutate an
 * existing guard instance.
     * @param issues Issues produced by checkSchema.
     * @post Published issues are copied and exposed through a readonly property.
     */
    public constructor(issues: readonly Issue[]) {
        super("TypeSea assertion failed");
        this.name = "TypeSeaAssertionError";
        defineReadonlyProperty(this, "issues", copyIssueArray(issues), true);
    }
}
