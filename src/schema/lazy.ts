/**
 * @file schema/lazy.ts
 * @brief Lazy schema resolution.
 */

import { SchemaTag } from "../kind/index.js";
import { freezeSchema } from "./freeze.js";
import { isSchemaValue } from "./validate.js";
import type { LazySchema, Schema } from "./types.js";

/**
 * @brief resolve lazy schema function contract.
 * @details Treats parameters as borrowed input and makes state changes visible through the receiver or return value.
 * @param schema Borrowed input slot named schema; validation or normalization happens before stored state changes.
 * @param resolving Borrowed input slot named resolving; validation or normalization happens before stored state changes.
 * @returns Result for resolve lazy schema; ownership of newly created aggregates is transferred to the caller.
 */
export function resolveLazySchema(
  schema: LazySchema,
  resolving: WeakSet<object>
): Schema {
  if (resolving.has(schema)) {
    throw new TypeError("lazy schema cycle must resolve to a concrete schema");
  }
  resolving.add(schema);
  const resolved = schema.get();
  if (!isSchemaValue(resolved)) {
    throw new TypeError("lazy schema must resolve to a valid TypeSea schema");
  }
  const concrete = resolved.tag === SchemaTag.Lazy
    ? resolveLazySchema(resolved, resolving)
    : resolved;
  resolving.delete(schema);
  return freezeSchema(concrete);
}
