/**
 * @file index.ts
 * @brief Standard Schema V1 interoperability.
 * @details TypeSea publishes this surface directly on guards and decoders so
 * ecosystem tools can validate values without TypeSea-specific adapters.
 */

import type { CheckResult, Issue } from "../issue/index.js";

export interface StandardSchemaV1<Input = unknown, Output = Input> {
    readonly "~standard": StandardSchemaV1Props<Input, Output>;
}

export interface StandardSchemaV1Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: "typesea";
    readonly validate: (
        value: unknown,
        options?: StandardSchemaV1Options
    ) => StandardSchemaV1Result<Output> | Promise<StandardSchemaV1Result<Output>>;
    readonly types?: StandardSchemaV1Types<Input, Output> | undefined;
}

export interface StandardSchemaV1Options {
    readonly libraryOptions?: Record<string, unknown> | undefined;
}

export type StandardSchemaV1Result<Output> =
    | StandardSchemaV1SuccessResult<Output>
    | StandardSchemaV1FailureResult;

export interface StandardSchemaV1SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
}

export interface StandardSchemaV1FailureResult {
    readonly issues: readonly StandardSchemaV1Issue[];
}

export interface StandardSchemaV1Issue {
    readonly message: string;
    readonly path?: readonly (PropertyKey | StandardSchemaV1PathSegment)[] | undefined;
}

export interface StandardSchemaV1PathSegment {
    readonly key: PropertyKey;
}

export interface StandardSchemaV1Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
}

export type StandardSchemaV1InferInput<TSchema extends StandardSchemaV1> =
    NonNullable<TSchema["~standard"]["types"]>["input"];

export type StandardSchemaV1InferOutput<TSchema extends StandardSchemaV1> =
    NonNullable<TSchema["~standard"]["types"]>["output"];

/**
 * @brief Build Standard Schema properties for one TypeSea validator.
 * @param validate Validator that returns a TypeSea Result.
 * @returns Frozen Standard Schema property object.
 */
export function makeStandardSchemaProps<Input, Output>(
    validate: (value: unknown) => CheckResult<Output>
): StandardSchemaV1Props<Input, Output> {
    return Object.freeze({
        version: 1,
        vendor: "typesea",
        validate: (value: unknown): StandardSchemaV1Result<Output> =>
            toStandardSchemaResult(validate(value))
    });
}

/**
 * @brief Convert a TypeSea Result into Standard Schema result shape.
 * @param result TypeSea validation result.
 * @returns Frozen Standard Schema result.
 */
export function toStandardSchemaResult<Output>(
    result: CheckResult<Output>
): StandardSchemaV1Result<Output> {
    if (result.ok) {
        return Object.freeze({
            value: result.value
        });
    }
    return Object.freeze({
        issues: toStandardSchemaIssues(result.error)
    });
}

/**
 * @brief Convert TypeSea issues into Standard Schema issues.
 * @param issues TypeSea diagnostic array.
 * @returns Frozen Standard Schema issue array.
 */
export function toStandardSchemaIssues(
    issues: readonly Issue[]
): readonly StandardSchemaV1Issue[] {
    const output = new Array<StandardSchemaV1Issue>(issues.length);
    for (let index = 0; index < issues.length; index += 1) {
        const issue = issues[index];
        if (issue !== undefined) {
            output[index] = Object.freeze({
                message: standardIssueMessage(issue),
                path: issue.path.length === 0 ? undefined : Object.freeze(issue.path.slice())
            });
        }
    }
    return Object.freeze(output);
}

/**
 * @brief Render one compact Standard Schema issue message.
 * @param issue TypeSea issue.
 * @returns Message string required by Standard Schema.
 */
function standardIssueMessage(issue: Issue): string {
    if (issue.message !== undefined) {
        return issue.message;
    }
    if (issue.expected !== undefined && issue.actual !== undefined) {
        return `${issue.code}: expected ${issue.expected}, received ${issue.actual}`;
    }
    if (issue.expected !== undefined) {
        return `${issue.code}: expected ${issue.expected}`;
    }
    return issue.code;
}
