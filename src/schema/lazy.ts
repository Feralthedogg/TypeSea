/**
 * @file schema/lazy.ts
 * @brief Lazy schema resolution.
 */

import { SchemaTag } from "../kind/index.js";
import { freezeSchema } from "./freeze.js";
import { isSchemaValue } from "./validate.js";
import type { LazySchema, Schema } from "./types.js";

/**
 * @brief resolve lazy schema.
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
