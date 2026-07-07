/**
 * @file emit-combinator.ts
 * @brief Combinator TypeSea schema to JSON Schema emitters.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
 */

import { SchemaTag } from "../kind/index.js";
import type { PathSegment } from "../issue/index.js";
import type { Schema } from "../schema/index.js";
import type {
    JsonSchemaEmitContext,
    JsonSchemaEmitter
} from "./emit-types.js";
import {
    jsonSchemaIndexContext,
    jsonSchemaMemberContext
} from "./emit-context.js";
import { pushJsonSchemaIssue } from "./issue.js";
import type {
    JsonSchema,
    JsonSchemaExportIssue,
    JsonSchemaOutputTarget,
    JsonSchemaUnrepresentableMode,
    JsonSchemaUriMapper
} from "./types.js";

/**
 * @brief Emit a TypeSea union as a JSON Schema `anyOf` list.
 * @details Each branch is emitted with its index appended to the issue path so
 * unsupported children can be reported precisely. A single failed child aborts
 * the whole union because dropping a branch would make the exported schema
 * stricter than the TypeSea validator.
 * @param options Union option schemas in declaration order.
 * @param path Mutable issue path stack owned by the export walk.
 * @param issues Mutable export issue buffer.
 * @param emitChild Recursive schema emitter callback.
 * @param target Target JSON Schema dialect or OpenAPI profile.
 * @returns JSON Schema union, or undefined when a child cannot be emitted.
 */
export function emitUnion(
    options: readonly Schema[],
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    emitChild: JsonSchemaEmitter,
    target: JsonSchemaOutputTarget,
    unrepresentable: JsonSchemaUnrepresentableMode,
    uri: JsonSchemaUriMapper,
    context: JsonSchemaEmitContext
): JsonSchema | undefined {
    const emitted = new Array<JsonSchema>(options.length);
    let failed = false;
    for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        if (option === undefined) {
            continue;
        }
        path.push(index);
        const child = emitChild(
            option,
            path,
            issues,
            target,
            unrepresentable,
            uri,
            jsonSchemaIndexContext(jsonSchemaMemberContext(context, "anyOf"), index)
        );
        if (child === undefined) {
            pushJsonSchemaIssue(path, issues, "unsupported_child", "Union option schema is unsupported");
            failed = true;
            path.pop();
            continue;
        }
        path.pop();
        emitted[index] = child;
    }
    if (failed) {
        return undefined;
    }
    return {
        anyOf: emitted
    };
}

/**
 * @brief Emit a TypeSea exclusive union as a JSON Schema `oneOf` list.
 */
export function emitXor(
    options: readonly Schema[],
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    emitChild: JsonSchemaEmitter,
    target: JsonSchemaOutputTarget,
    unrepresentable: JsonSchemaUnrepresentableMode,
    uri: JsonSchemaUriMapper,
    context: JsonSchemaEmitContext
): JsonSchema | undefined {
    const emitted = new Array<JsonSchema>(options.length);
    let failed = false;
    for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        if (option === undefined) {
            continue;
        }
        path.push(index);
        const child = emitChild(
            option,
            path,
            issues,
            target,
            unrepresentable,
            uri,
            jsonSchemaIndexContext(jsonSchemaMemberContext(context, "oneOf"), index)
        );
        if (child === undefined) {
            pushJsonSchemaIssue(path, issues, "unsupported_child", "XOR option schema is unsupported");
            failed = true;
            path.pop();
            continue;
        }
        path.pop();
        emitted[index] = child;
    }
    if (failed) {
        return undefined;
    }
    return {
        oneOf: emitted
    };
}

/**
 * @brief Emit a TypeSea intersection as a JSON Schema `allOf` pair.
 * @details Both sides must be representable. If either side fails, the exported
 * schema would no longer model the same acceptance set, so the emitter reports
 * the failed side and returns undefined.
 * @param left Left intersection operand.
 * @param right Right intersection operand.
 * @param path Mutable issue path stack owned by the export walk.
 * @param issues Mutable export issue buffer.
 * @param emitChild Recursive schema emitter callback.
 * @param dialect Target JSON Schema dialect.
 * @returns JSON Schema intersection, or undefined when a side cannot be emitted.
 */
export function emitIntersection(
    left: Schema,
    right: Schema,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    emitChild: JsonSchemaEmitter,
    target: JsonSchemaOutputTarget,
    unrepresentable: JsonSchemaUnrepresentableMode,
    uri: JsonSchemaUriMapper,
    context: JsonSchemaEmitContext
): JsonSchema | undefined {
    path.push("left");
    const leftSchema = emitChild(
        left,
        path,
        issues,
        target,
        unrepresentable,
        uri,
        jsonSchemaIndexContext(jsonSchemaMemberContext(context, "allOf"), 0)
    );
    if (leftSchema === undefined) {
        pushJsonSchemaIssue(path, issues, "unsupported_child", "Intersection left schema is unsupported");
        path.pop();
        return undefined;
    }
    path.pop();
    path.push("right");
    const rightSchema = emitChild(
        right,
        path,
        issues,
        target,
        unrepresentable,
        uri,
        jsonSchemaIndexContext(jsonSchemaMemberContext(context, "allOf"), 1)
    );
    if (rightSchema === undefined) {
        pushJsonSchemaIssue(path, issues, "unsupported_child", "Intersection right schema is unsupported");
        path.pop();
        return undefined;
    }
    path.pop();
    return {
        allOf: [
            leftSchema,
            rightSchema
        ]
    };
}

/**
 * @brief Emit a discriminated union through the general union exporter.
 * @details JSON Schema output does not need TypeSea's dispatch table; it only
 * needs the branch schemas. The discriminant proof has already been enforced at
 * builder time, so preserving branch order is enough for diagnostics.
 * @param cases Discriminated-union cases from the TypeSea schema.
 * @param path Mutable issue path stack owned by the export walk.
 * @param issues Mutable export issue buffer.
 * @param emitChild Recursive schema emitter callback.
 * @param dialect Target JSON Schema dialect.
 * @returns JSON Schema union, or undefined when a child cannot be emitted.
 */
export function emitDiscriminatedUnion(
    cases: Extract<Schema, {
        readonly tag: typeof SchemaTag.DiscriminatedUnion
    }>["cases"],
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    emitChild: JsonSchemaEmitter,
    target: JsonSchemaOutputTarget,
    unrepresentable: JsonSchemaUnrepresentableMode,
    uri: JsonSchemaUriMapper,
    context: JsonSchemaEmitContext
): JsonSchema | undefined {
    const options = new Array<Schema>(cases.length);
    for (let index = 0; index < cases.length; index += 1) {
        const unionCase = cases[index];
        if (unionCase !== undefined) {
            options[index] = unionCase.schema;
        }
    }
    return emitUnion(options, path, issues, emitChild, target, unrepresentable, uri, context);
}

/**
 * @brief Emit a nullable wrapper as an `anyOf` with `null`.
 * @details The wrapped schema is emitted first so unsupported inner constructs
 * are reported at a stable `nullable` path segment instead of silently widening
 * to just null.
 * @param inner Inner TypeSea schema.
 * @param path Mutable issue path stack owned by the export walk.
 * @param issues Mutable export issue buffer.
 * @param emitChild Recursive schema emitter callback.
 * @param target Target JSON Schema dialect or OpenAPI profile.
 * @returns Nullable JSON Schema, or undefined when the inner schema fails.
 */
export function emitNullable(
    inner: Schema,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    emitChild: JsonSchemaEmitter,
    target: JsonSchemaOutputTarget,
    unrepresentable: JsonSchemaUnrepresentableMode,
    uri: JsonSchemaUriMapper,
    context: JsonSchemaEmitContext
): JsonSchema | undefined {
    path.push("nullable");
    const childContext = target === "openapi-3.0"
        ? context
        : jsonSchemaIndexContext(jsonSchemaMemberContext(context, "anyOf"), 0);
    const emitted = emitChild(inner, path, issues, target, unrepresentable, uri, childContext);
    if (emitted === undefined) {
        pushJsonSchemaIssue(path, issues, "unsupported_child", "Nullable inner schema is unsupported");
        path.pop();
        return undefined;
    }
    path.pop();
    if (target === "openapi-3.0") {
        return emitOpenApiNullable(emitted);
    }
    return {
        anyOf: [
            emitted,
            {
                type: "null"
            }
        ]
    };
}

/**
 * @brief Render TypeSea nullable schemas with the OpenAPI 3.0 nullable flag.
 */
function emitOpenApiNullable(schema: JsonSchema): JsonSchema {
    if (schema === true) {
        return {};
    }
    if (schema === false) {
        return {
            nullable: true,
            enum: [null]
        };
    }
    return {
        ...schema,
        nullable: true
    };
}
