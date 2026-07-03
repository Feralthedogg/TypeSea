/**
 * @file emit.ts
 * @brief TypeSea schema to JSON Schema emitter dispatcher.
 */

import { SchemaTag } from "../kind/index.js";
import type { PathSegment } from "../issue/index.js";
import type { Schema } from "../schema/index.js";
import {
  emitDiscriminatedUnion,
  emitIntersection,
  emitNullable,
  emitUnion
} from "./emit-combinator.js";
import {
  emitArray,
  emitObject,
  emitRecord,
  emitTuple
} from "./emit-composite.js";
import {
  emitLiteral,
  emitNumber,
  emitString
} from "./emit-scalar.js";
import { pushJsonSchemaIssue } from "./issue.js";
import type {
  JsonSchema,
  JsonSchemaDialect,
  JsonSchemaExportIssue
} from "./types.js";

/**
 * @brief emit schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param path Borrowed input slot named path; validation or normalization happens before stored state changes.
 * @param issues Borrowed input slot named issues; validation or normalization happens before stored state changes.
 * @returns Result for emit schema; ownership of newly created aggregates is transferred to the caller.
 */
export function emitSchema(
  schema: Schema,
  path: PathSegment[],
  issues: JsonSchemaExportIssue[],
  dialect: JsonSchemaDialect
): JsonSchema | undefined {
  switch (schema.tag) {
    case SchemaTag.Unknown:
      return true;
    case SchemaTag.Never:
      return false;
    case SchemaTag.String:
      return emitString(schema, path, issues);
    case SchemaTag.Number:
      return emitNumber(schema, path, issues);
    case SchemaTag.BigInt:
      pushJsonSchemaIssue(path, issues, "unsupported_bigint", "JSON Schema has no bigint type");
      return undefined;
    case SchemaTag.Symbol:
      pushJsonSchemaIssue(path, issues, "unsupported_symbol", "JSON Schema has no symbol type");
      return undefined;
    case SchemaTag.Boolean:
      return { type: "boolean" };
    case SchemaTag.Literal:
      return emitLiteral(schema.value, path, issues);
    case SchemaTag.Array:
      return emitArray(schema.item, path, issues, emitSchema, dialect);
    case SchemaTag.Tuple:
      return emitTuple(schema.items, path, issues, emitSchema, dialect);
    case SchemaTag.Record:
      return emitRecord(schema.value, path, issues, emitSchema, dialect);
    case SchemaTag.Object:
      return emitObject(schema, path, issues, emitSchema, dialect);
    case SchemaTag.Union:
      return emitUnion(schema.options, path, issues, emitSchema, dialect);
    case SchemaTag.Intersection:
      return emitIntersection(schema.left, schema.right, path, issues, emitSchema, dialect);
    case SchemaTag.Optional:
    case SchemaTag.Undefinedable:
      pushJsonSchemaIssue(
        path,
        issues,
        "unsupported_undefined",
        "JSON Schema cannot represent undefined as a value"
      );
      return undefined;
    case SchemaTag.Nullable:
      return emitNullable(schema.inner, path, issues, emitSchema, dialect);
    case SchemaTag.DiscriminatedUnion:
      return emitDiscriminatedUnion(schema.cases, path, issues, emitSchema, dialect);
    case SchemaTag.Brand:
      return emitSchema(schema.inner, path, issues, dialect);
    case SchemaTag.Lazy:
      pushJsonSchemaIssue(path, issues, "unsupported_lazy", "Lazy schemas require recursion support");
      return undefined;
    case SchemaTag.Refine:
      pushJsonSchemaIssue(
        path,
        issues,
        "unsupported_refine",
        "Refinement predicates cannot be represented as JSON Schema"
      );
      return undefined;
  }
}
