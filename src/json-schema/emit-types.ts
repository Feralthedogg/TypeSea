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
 * @brief json schema emitter type alias contract.
 * @details Defines a closed compile-time contract used by nearby routines instead of an implicit side channel.
 * @invariant Values matching this contract keep the field layout described here.
 */
export type JsonSchemaEmitter = (
  schema: Schema,
  path: PathSegment[],
  issues: JsonSchemaExportIssue[],
  dialect: JsonSchemaDialect
) => JsonSchema | undefined;
