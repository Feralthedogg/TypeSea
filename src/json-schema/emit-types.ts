/**
 * @file emit-types.ts
 * @brief Internal JSON Schema emitter contracts.
 * @details JSON Schema helpers emit only representations that preserve TypeSea semantics or
 * report a structured export issue.
 */

import type { PathSegment } from "../issue/index.js";
import type { Schema } from "../schema/index.js";
import type {
    JsonSchema,
    JsonSchemaDialect,
    JsonSchemaExportIssue
} from "./types.js";

/**
 * @brief Recursive emitter callback shared by JSON Schema emitter modules.
 * @details Child emitters receive the same path stack and issue buffer as their
 * parent, which avoids allocating intermediate diagnostic collections during a
 * deep schema walk.
 * @param schema Schema node to convert.
 * @param path Mutable issue path stack owned by the export walk.
 * @param issues Mutable export issue buffer.
 * @param dialect Target JSON Schema dialect.
 * @returns JSON Schema fragment, boolean schema, or undefined on failure.
 */
export type JsonSchemaEmitter = (
    schema: Schema,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    dialect: JsonSchemaDialect
) => JsonSchema | undefined;
