/**
 * @file emit-types.ts
 * @brief Internal JSON Schema emitter contracts.
 */

import type { PathSegment } from "../issue/index.js";
import type { GlobalRegistryMetadata, SchemaRegistry } from "../registry/index.js";
import type { Schema } from "../schema/index.js";
import type {
    JsonSchema,
    JsonSchemaCyclesMode,
    JsonSchemaOverride,
    JsonSchemaOutputTarget,
    JsonSchemaExportIssue,
    JsonSchemaUnrepresentableMode,
    JsonSchemaUriMapper
} from "./types.js";

/**
 * @brief Shared reference, cycle, override, and registry state for one export walk.
 * @details Mutable collections are run-local and never escape the exporter.
 */
export interface JsonSchemaEmitContext {
    readonly refs: ReadonlyMap<Schema, string>;
    readonly active: Schema | undefined;
    readonly cycles: JsonSchemaCyclesMode;
    readonly location: string;
    readonly cycleRefs: Map<Schema, string>;
    readonly lazyResolving: WeakSet<object>;
    readonly override: JsonSchemaOverride | undefined;
    readonly metadata: SchemaRegistry<GlobalRegistryMetadata> | undefined;
}

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
    target: JsonSchemaOutputTarget,
    unrepresentable: JsonSchemaUnrepresentableMode,
    uri: JsonSchemaUriMapper,
    context: JsonSchemaEmitContext
) => JsonSchema | undefined;
