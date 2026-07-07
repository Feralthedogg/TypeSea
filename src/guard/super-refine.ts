/**
 * @file super-refine.ts
 * @brief Callback-style refinement wrappers.
 * @details Boolean refinement and diagnostic refinement share the same callback
 * contract while keeping diagnostic allocation out of successful hot paths.
 */

import type { PathSegment } from "../issue/index.js";
import type { RefinementIssue } from "../schema/index.js";
import type {
    SuperRefineContext,
    SuperRefineIssueInput
} from "./types.js";

export type SuperRefineCallback<TValue> =
    (value: TValue, context: SuperRefineContext) => void;

const EMPTY_PATH: readonly PathSegment[] = Object.freeze([]);

/**
 * @brief Execute a callback-style refinement as a boolean predicate.
 * @param callback User callback receiving a failure context.
 * @param value Value accepted by the inner schema.
 * @returns True when the callback did not report an issue.
 */
export function runSuperRefine<TValue>(
    callback: SuperRefineCallback<TValue>,
    value: TValue
): boolean {
    let ok = true;
    const context: SuperRefineContext = {
        addIssue: (issue?: SuperRefineIssueInput): void => {
            /*
             * Validate payloads even on the boolean path so is()/check() throw
             * consistently for malformed callback output.
             */
            readSuperRefineIssue(issue);
            ok = false;
        }
    };
    callback(value, context);
    return ok;
}

/**
 * @brief Execute a callback-style refinement as a diagnostic collector.
 * @param callback User callback receiving a failure context.
 * @param value Value accepted by the inner schema.
 * @returns Relative refinement issues, or undefined when the callback accepts.
 */
export function collectSuperRefineIssues<TValue>(
    callback: SuperRefineCallback<TValue>,
    value: TValue
): readonly RefinementIssue[] | undefined {
    const issues: RefinementIssue[] = [];
    const context: SuperRefineContext = {
        addIssue: (issue?: SuperRefineIssueInput): void => {
            issues.push(readSuperRefineIssue(issue));
        }
    };
    callback(value, context);
    return issues.length === 0 ? undefined : issues;
}

/**
 * @brief Normalize one user-supplied super refinement issue.
 * @param issue Optional issue payload passed to addIssue().
 * @returns Copied relative issue payload.
 * @throws TypeError when message or path fields have invalid runtime types.
 */
export function readSuperRefineIssue(
    issue: SuperRefineIssueInput | undefined
): RefinementIssue {
    if (issue === undefined) {
        return {
            path: EMPTY_PATH,
            message: undefined
        };
    }
    if (typeof issue === "string") {
        return {
            path: EMPTY_PATH,
            message: issue
        };
    }
    if (!isRecord(issue)) {
        throw new TypeError("super refinement issue must be a string or object");
    }
    const message = issue.message;
    if (message !== undefined && typeof message !== "string") {
        throw new TypeError("super refinement issue message must be a string");
    }
    return {
        path: copySuperRefinePath(issue.path),
        message
    };
}

/**
 * @brief Copy and validate a relative super refinement issue path.
 * @param value Optional path array.
 * @returns Frozen empty path or copied relative path.
 */
function copySuperRefinePath(value: unknown): readonly PathSegment[] {
    if (value === undefined) {
        return EMPTY_PATH;
    }
    if (!Array.isArray(value)) {
        throw new TypeError("super refinement issue path must be an array");
    }
    const path = value as readonly unknown[];
    if (path.length === 0) {
        return EMPTY_PATH;
    }
    const copied = new Array<PathSegment>(path.length);
    for (let index = 0; index < path.length; index += 1) {
        const segment = path[index];
        if (typeof segment === "string") {
            copied[index] = segment;
            continue;
        }
        if (typeof segment === "number" &&
            Number.isInteger(segment) &&
            segment >= 0) {
            copied[index] = segment;
            continue;
        }
        throw new TypeError("super refinement issue path segment must be a string or non-negative integer");
    }
    return copied;
}

/**
 * @brief Check whether a value can carry named data fields.
 * @param value Candidate payload.
 * @returns True for non-null non-array objects.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
