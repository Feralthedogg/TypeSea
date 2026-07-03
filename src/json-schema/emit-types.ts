/**
 * @file emit-types.ts
 * @brief Internal JSON Schema emitter contracts.
 */

import type { PathSegment } from "../issue/index.js";
import type { Schema } from "../schema/index.js";
import type {
  JsonSchema,
  JsonSchemaDialect,
  JsonSchemaExportIssue
} from "./types.js";

/**
 * @brief json schema emitter.
 */
export type JsonSchemaEmitter = (
  schema: Schema,
  path: PathSegment[],
  issues: JsonSchemaExportIssue[],
  dialect: JsonSchemaDialect
) => JsonSchema | undefined;
