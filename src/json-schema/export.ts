/**
 * @file export.ts
 * @brief Schema-only JSON Schema export entry points.
 * @details This module intentionally avoids JSON Schema import helpers so guard
 * methods can call the exporter without creating builder initialization cycles.
 */

import type { PathSegment } from "../issue/index.js";
import { SchemaTag } from "../kind/index.js";
import { err, ok, type Result } from "../result/index.js";
import type { GlobalRegistryMetadata, SchemaRegistry } from "../registry/index.js";
import type { Schema } from "../schema/index.js";
import { escapeJsonPointerToken } from "./emit-context.js";
import { emitSchema } from "./emit.js";
import type { JsonSchemaEmitContext } from "./emit-types.js";
import {
    freezeJsonSchema,
    freezeJsonSchemaRegistryDocument,
    freezeJsonSchemaIssues
} from "./freeze.js";
import { applyGlobalRegistryMetadata } from "./metadata.js";
import {
    JSON_SCHEMA_2020_12_ID,
    JSON_SCHEMA_DRAFT_04_ID,
    JSON_SCHEMA_DRAFT_07_ID,
    readJsonSchemaOptions,
    readJsonSchemaSchema
} from "./read.js";
import type {
    JsonSchema,
    JsonSchemaExportIssue,
    JsonSchemaOutputTarget,
    JsonSchemaOptions,
    JsonSchemaRegistryDocument,
    MutableJsonSchemaObject
} from "./types.js";

type JsonSchemaDefinitionKeyword = "$defs" | "definitions";

interface JsonSchemaReferencePlan {
    readonly refs: ReadonlyMap<Schema, string>;
    readonly names: ReadonlyMap<Schema, string>;
    readonly keyword: JsonSchemaDefinitionKeyword;
}

interface JsonSchemaRegistryEntry {
    readonly schema: Schema;
    readonly id: string;
    readonly metadata: GlobalRegistryMetadata;
}

/**
 * @brief Export a raw TypeSea schema into a JSON Schema document.
 * @details This internal-facing helper skips guard extraction but still routes
 * through the same emitter and issue accumulator as the public guard API.
 * @param schema Schema value that already passed TypeSea construction checks.
 * @param options Optional dialect and schema id configuration.
 * @returns Export result with a frozen JSON Schema document or diagnostics.
 */
export function schemaToJsonSchema(
    schema: Schema,
    options?: Partial<JsonSchemaOptions>
): Result<JsonSchema, readonly JsonSchemaExportIssue[]> {
    return exportJsonSchema(readJsonSchemaSchema(schema), options);
}

/**
 * @brief Export every id-bearing live schema entry from a registry.
 */
export function schemaRegistryToJsonSchema(
    registry: SchemaRegistry<GlobalRegistryMetadata>,
    options?: Partial<JsonSchemaOptions>
): Result<JsonSchemaRegistryDocument, readonly JsonSchemaExportIssue[]> {
    const config = readJsonSchemaOptions(options);
    const issues: JsonSchemaExportIssue[] = [];
    const entries = readJsonSchemaRegistryEntries(registry, issues);
    if (issues.length !== 0) {
        return err(freezeJsonSchemaIssues(issues));
    }
    const refs = makeRegistryReferenceMap(entries, config);
    const schemas = makeJsonSchemaDefinitionTable();
    let failed = false;
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
            continue;
        }
        const path: PathSegment[] = [entry.id];
        const emitted = emitJsonSchemaFragment(
            entry.schema,
            path,
            issues,
            config,
            refs,
            entry.schema,
            Object.freeze([])
        );
        if (emitted === undefined) {
            failed = true;
            continue;
        }
        schemas[entry.id] = applyRegistryMetadata(emitted, entry.metadata, config);
    }
    if (failed || hasJsonSchemaIssues(issues)) {
        return err(freezeJsonSchemaIssues(issues));
    }
    return ok(freezeJsonSchemaRegistryDocument({
        schemas
    }));
}

/**
 * @brief Export the open schema document for explicitly weakened boundaries.
 */
export function openSchemaToJsonSchema(
    options?: Partial<JsonSchemaOptions>
): Result<JsonSchema, readonly JsonSchemaExportIssue[]> {
    return emitJsonSchemaDocument({}, readJsonSchemaOptions(options));
}

/**
 * @brief Run the JSON Schema emitter and attach the dialect marker.
 * @details The emitter writes structural failures into `issues` instead of
 * throwing so callers can inspect every unsupported node discovered during the
 * walk. Boolean schemas are wrapped to preserve a document-shaped top level.
 * @param schema TypeSea schema selected for export.
 * @param options User supplied export options, still unresolved.
 * @returns Frozen JSON Schema document on success, or frozen export issues.
 */
function exportJsonSchema(
    schema: Schema,
    options: Partial<JsonSchemaOptions> | undefined
): Result<JsonSchema, readonly JsonSchemaExportIssue[]> {
    const config = readJsonSchemaOptions(options);
    const issues: JsonSchemaExportIssue[] = [];
    const metadataEntries = readJsonSchemaMetadataEntries(config, issues);
    if (hasJsonSchemaIssues(issues)) {
        return err(freezeJsonSchemaIssues(issues));
    }
    const path: PathSegment[] = [];
    const emitted = emitJsonSchemaFragment(
        schema,
        path,
        issues,
        config,
        new Map<Schema, string>(),
        schema,
        metadataEntries
    );
    if (emitted === undefined || hasJsonSchemaIssues(issues)) {
        return err(freezeJsonSchemaIssues(issues));
    }
    return emitJsonSchemaDocument(emitted, config);
}

/**
 * @brief Emit one schema fragment without adding a top-level dialect marker.
 */
function emitJsonSchemaFragment(
    schema: Schema,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    config: ReturnType<typeof readJsonSchemaOptions>,
    externalRefs: ReadonlyMap<Schema, string>,
    active: Schema | undefined,
    metadataEntries: readonly JsonSchemaRegistryEntry[]
): JsonSchema | undefined {
    const plan = makeJsonSchemaReferencePlan(
        schema,
        config.target,
        config.reused,
        externalRefs,
        metadataEntries
    );
    if (plan.names.size !== 0 && config.target === "openapi-3.0") {
        issues.push({
            path: Object.freeze([]),
            code: "unsupported_target",
            message: "OpenAPI 3.0 cannot represent extracted schema references losslessly"
        });
        return undefined;
    }
    const context = makeJsonSchemaEmitContext(plan, active, "#", config);
    const emitted = emitSchema(
        schema,
        path,
        issues,
        config.target,
        config.unrepresentable,
        config.uri,
        context
    );
    if (emitted === undefined || hasJsonSchemaIssues(issues)) {
        return undefined;
    }
    const withDefinitions = emitJsonSchemaDefinitions(emitted, plan, path, issues, config);
    if (withDefinitions === undefined || hasJsonSchemaIssues(issues)) {
        return undefined;
    }
    return withDefinitions;
}

/**
 * @brief Extract repeated schema identities into a JSON Schema reference plan.
 */
function makeJsonSchemaReferencePlan(
    schema: Schema,
    target: JsonSchemaOutputTarget,
    reused: ReturnType<typeof readJsonSchemaOptions>["reused"],
    externalRefs: ReadonlyMap<Schema, string>,
    metadataEntries: readonly JsonSchemaRegistryEntry[]
): JsonSchemaReferencePlan {
    const keyword = target === "2020-12" ? "$defs" : "definitions";
    const refs = new Map<Schema, string>(externalRefs);
    if (reused === "inline" && metadataEntries.length === 0) {
        return {
            refs,
            names: new Map<Schema, string>(),
            keyword
        };
    }
    const counts = countSchemaUses(schema);
    const names = new Map<Schema, string>();
    const usedNames = new Set<string>();
    addMetadataDefinitionRefs(schema, metadataEntries, counts, refs, names, usedNames, keyword);
    if (reused === "inline") {
        return {
            refs,
            names,
            keyword
        };
    }
    let generated = 0;
    for (const [node, count] of counts) {
        if (node === schema || count < 2) {
            continue;
        }
        if (refs.has(node)) {
            continue;
        }
        generated += 1;
        const name = uniqueDefinitionName(node, generated, usedNames);
        names.set(node, name);
        refs.set(node, `#/${keyword}/${escapeJsonPointerToken(name)}`);
    }
    return {
        refs,
        names,
        keyword
    };
}

/**
 * @brief Extract reachable registry-id schemas into local definitions.
 */
function addMetadataDefinitionRefs(
    root: Schema,
    entries: readonly JsonSchemaRegistryEntry[],
    counts: ReadonlyMap<Schema, number>,
    refs: Map<Schema, string>,
    names: Map<Schema, string>,
    usedNames: Set<string>,
    keyword: JsonSchemaDefinitionKeyword
): void {
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined ||
            entry.schema === root ||
            !counts.has(entry.schema) ||
            refs.has(entry.schema)) {
            continue;
        }
        const name = uniqueDefinitionNameFromBase(
            normalizeDefinitionName(entry.id, index + 1),
            usedNames
        );
        names.set(entry.schema, name);
        refs.set(entry.schema, `#/${keyword}/${escapeJsonPointerToken(name)}`);
    }
}

/**
 * @brief Read id-bearing entries from the optional metadata registry.
 */
function readJsonSchemaMetadataEntries(
    config: ReturnType<typeof readJsonSchemaOptions>,
    issues: JsonSchemaExportIssue[]
): readonly JsonSchemaRegistryEntry[] {
    if (config.metadata === undefined) {
        return Object.freeze([]);
    }
    return readJsonSchemaRegistryEntries(config.metadata, issues);
}

/**
 * @brief Select registry entries that carry string ids.
 */
function readJsonSchemaRegistryEntries(
    registry: SchemaRegistry<GlobalRegistryMetadata>,
    issues: JsonSchemaExportIssue[]
): readonly JsonSchemaRegistryEntry[] {
    const entries = registry.entries();
    const usedIds = new Set<string>();
    const output: JsonSchemaRegistryEntry[] = [];
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
            continue;
        }
        const metadata = entry.metadata;
        const id = metadata.id;
        if (id === undefined) {
            continue;
        }
        if (usedIds.has(id)) {
            issues.push({
                path: Object.freeze([id]),
                code: "duplicate_registry_id",
                message: `JSON Schema registry id ${id} is duplicated`
            });
            continue;
        }
        usedIds.add(id);
        output.push({
            schema: entry.schema,
            id,
            metadata
        });
    }
    return Object.freeze(output);
}

/**
 * @brief Build cross-document refs from registry ids.
 */
function makeRegistryReferenceMap(
    entries: readonly JsonSchemaRegistryEntry[],
    config: ReturnType<typeof readJsonSchemaOptions>
): ReadonlyMap<Schema, string> {
    const refs = new Map<Schema, string>();
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry !== undefined) {
            refs.set(entry.schema, config.uri(entry.id));
        }
    }
    return refs;
}

/**
 * @brief Attach registry metadata to one emitted schema fragment.
 */
function applyRegistryMetadata(
    emitted: JsonSchema,
    metadata: GlobalRegistryMetadata,
    config: ReturnType<typeof readJsonSchemaOptions>
): JsonSchema {
    return applyGlobalRegistryMetadata(emitted, metadata, config.target, config.uri);
}

/**
 * @brief Attach reusable schema definitions to the emitted document.
 */
function emitJsonSchemaDefinitions(
    emitted: JsonSchema,
    plan: JsonSchemaReferencePlan,
    path: PathSegment[],
    issues: JsonSchemaExportIssue[],
    config: ReturnType<typeof readJsonSchemaOptions>
): JsonSchema | undefined {
    if (plan.names.size === 0) {
        return emitted;
    }
    const definitions = makeJsonSchemaDefinitionTable();
    let failed = false;
    for (const [schema, name] of plan.names) {
        path.push(plan.keyword, name);
        const location = "#/" + plan.keyword + "/" + escapeJsonPointerToken(name);
        const context = makeJsonSchemaEmitContext(plan, schema, location, config);
        const definition = emitSchema(
            schema,
            path,
            issues,
            config.target,
            config.unrepresentable,
            config.uri,
            context
        );
        if (definition === undefined) {
            failed = true;
        } else {
            definitions[name] = definition;
        }
        path.pop();
        path.pop();
    }
    if (failed) {
        return undefined;
    }
    if (emitted === false) {
        return false;
    }
    const target: MutableJsonSchemaObject = emitted === true ? {} : { ...emitted };
    if (plan.keyword === "$defs") {
        target.$defs = definitions;
    } else {
        target.definitions = definitions;
    }
    return target;
}

/**
 * @brief Build the ref context consumed by recursive emitters.
 */
function makeJsonSchemaEmitContext(
    plan: JsonSchemaReferencePlan,
    active: Schema | undefined,
    location: string,
    config: ReturnType<typeof readJsonSchemaOptions>
): JsonSchemaEmitContext {
    return {
        refs: plan.refs,
        active,
        cycles: config.cycles,
        location,
        cycleRefs: new Map<Schema, string>(),
        lazyResolving: new WeakSet<object>(),
        override: config.override,
        metadata: config.metadata
    };
}

/**
 * @brief Count schema object identities without expanding an identity twice.
 */
function countSchemaUses(schema: Schema): Map<Schema, number> {
    const counts = new Map<Schema, number>();
    const expanded = new Set<Schema>();
    const active = new Set<Schema>();
    countSchemaUse(schema, counts, expanded, active);
    return counts;
}

/**
 * @brief Visit schema children for reusable-definition planning.
 */
function countSchemaUse(
    schema: Schema,
    counts: Map<Schema, number>,
    expanded: Set<Schema>,
    active: Set<Schema>
): void {
    counts.set(schema, (counts.get(schema) ?? 0) + 1);
    if (expanded.has(schema) || active.has(schema)) {
        return;
    }
    expanded.add(schema);
    active.add(schema);
    switch (schema.tag) {
        case SchemaTag.Unknown:
        case SchemaTag.Never:
        case SchemaTag.String:
        case SchemaTag.Number:
        case SchemaTag.Date:
        case SchemaTag.BigInt:
        case SchemaTag.Symbol:
        case SchemaTag.Boolean:
        case SchemaTag.Literal:
        case SchemaTag.File:
        case SchemaTag.InstanceOf:
        case SchemaTag.Lazy:
            break;
        case SchemaTag.Array:
            countSchemaUse(schema.item, counts, expanded, active);
            break;
        case SchemaTag.Object:
            countObjectSchemaUses(schema, counts, expanded, active);
            break;
        case SchemaTag.Union:
        case SchemaTag.Xor:
            countSchemaListUses(schema.options, counts, expanded, active);
            break;
        case SchemaTag.Intersection:
            countSchemaUse(schema.left, counts, expanded, active);
            countSchemaUse(schema.right, counts, expanded, active);
            break;
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
        case SchemaTag.Nullable:
        case SchemaTag.Brand:
        case SchemaTag.Metadata:
        case SchemaTag.Message:
        case SchemaTag.Readonly:
        case SchemaTag.Refine:
            countSchemaUse(schema.inner, counts, expanded, active);
            break;
        case SchemaTag.DiscriminatedUnion:
            for (let index = 0; index < schema.cases.length; index += 1) {
                const unionCase = schema.cases[index];
                if (unionCase !== undefined) {
                    countSchemaUse(unionCase.schema, counts, expanded, active);
                }
            }
            break;
        case SchemaTag.Tuple:
            countSchemaListUses(schema.items, counts, expanded, active);
            if (schema.rest !== undefined) {
                countSchemaUse(schema.rest, counts, expanded, active);
            }
            break;
        case SchemaTag.Record:
            if (schema.key !== undefined) {
                countSchemaUse(schema.key, counts, expanded, active);
            }
            countSchemaUse(schema.value, counts, expanded, active);
            break;
        case SchemaTag.Map:
            countSchemaUse(schema.key, counts, expanded, active);
            countSchemaUse(schema.value, counts, expanded, active);
            break;
        case SchemaTag.Set:
            countSchemaUse(schema.item, counts, expanded, active);
            break;
        case SchemaTag.Property:
            countSchemaUse(schema.base, counts, expanded, active);
            countSchemaUse(schema.value, counts, expanded, active);
            break;
        case SchemaTag.KeyedObject:
        case SchemaTag.PropertyCount:
            countSchemaUse(schema.inner, counts, expanded, active);
            break;
        case SchemaTag.PropertyNames:
            countSchemaUse(schema.inner, counts, expanded, active);
            countSchemaUse(schema.key, counts, expanded, active);
            break;
        case SchemaTag.PatternProperties:
            countSchemaUse(schema.inner, counts, expanded, active);
            for (let index = 0; index < schema.entries.length; index += 1) {
                const entry = schema.entries[index];
                if (entry !== undefined) {
                    countSchemaUse(entry.schema, counts, expanded, active);
                }
            }
            if (schema.additional !== undefined) {
                countSchemaUse(schema.additional, counts, expanded, active);
            }
            break;
    }
    active.delete(schema);
}

/**
 * @brief Count child schemas carried by object entries and catchall contracts.
 */
function countObjectSchemaUses(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    counts: Map<Schema, number>,
    expanded: Set<Schema>,
    active: Set<Schema>
): void {
    for (let index = 0; index < schema.entries.length; index += 1) {
        const entry = schema.entries[index];
        if (entry !== undefined) {
            countSchemaUse(entry.schema, counts, expanded, active);
        }
    }
    if (schema.catchall !== undefined) {
        countSchemaUse(schema.catchall, counts, expanded, active);
    }
}

/**
 * @brief Count schemas in a fixed child array.
 */
function countSchemaListUses(
    schemas: readonly Schema[],
    counts: Map<Schema, number>,
    expanded: Set<Schema>,
    active: Set<Schema>
): void {
    for (let index = 0; index < schemas.length; index += 1) {
        const child = schemas[index];
        if (child !== undefined) {
            countSchemaUse(child, counts, expanded, active);
        }
    }
}

/**
 * @brief Derive a stable definition key for a reused schema.
 */
function uniqueDefinitionName(
    schema: Schema,
    index: number,
    used: Set<string>
): string {
    const base = schema.tag === SchemaTag.Metadata && schema.metadata.id !== undefined
        ? normalizeDefinitionName(schema.metadata.id, index)
        : "Schema" + String(index);
    return uniqueDefinitionNameFromBase(base, used);
}

/**
 * @brief Select a unique definition name from an already normalized base.
 */
function uniqueDefinitionNameFromBase(
    base: string,
    used: Set<string>
): string {
    let candidate = base;
    let suffix = 1;
    while (used.has(candidate)) {
        suffix += 1;
        candidate = base + "_" + String(suffix);
    }
    used.add(candidate);
    return candidate;
}

/**
 * @brief Normalize metadata ids into definition-table keys.
 */
function normalizeDefinitionName(value: string, index: number): string {
    let result = "";
    for (let offset = 0; offset < value.length; offset += 1) {
        const code = value.charCodeAt(offset);
        if ((code >= 48 && code <= 57) ||
            (code >= 65 && code <= 90) ||
            (code >= 97 && code <= 122) ||
            code === 45 ||
            code === 95) {
            result += value.charAt(offset);
        } else if (result.length !== 0 && !result.endsWith("_")) {
            result += "_";
        }
    }
    if (result.length === 0) {
        return "Schema" + String(index);
    }
    const first = result.charCodeAt(0);
    if (first >= 48 && first <= 57) {
        return "Schema_" + result;
    }
    return result;
}

/**
 * @brief Allocate a null-prototype definition table.
 */
function makeJsonSchemaDefinitionTable(): Record<string, JsonSchema> {
    return Object.create(null) as Record<string, JsonSchema>;
}

/**
 * @brief Test whether the shared exporter issue buffer contains diagnostics.
 */
function hasJsonSchemaIssues(issues: readonly JsonSchemaExportIssue[]): boolean {
    return issues.length !== 0;
}

/**
 * @brief Attach the selected top-level dialect metadata.
 */
function emitJsonSchemaDocument(
    emitted: JsonSchema,
    config: ReturnType<typeof readJsonSchemaOptions>
): Result<JsonSchema, readonly JsonSchemaExportIssue[]> {
    if (config.target === "openapi-3.0") {
        if (emitted === false) {
            return err(freezeJsonSchemaIssues([
                {
                    path: Object.freeze([]),
                    code: "unsupported_target",
                    message: "OpenAPI 3.0 cannot represent the false schema"
                }
            ]));
        }
        return ok(freezeJsonSchema(emitted === true ? {} : emitted));
    }
    const schemaId = config.schemaId ?? defaultJsonSchemaSchemaId(config.target);
    if (typeof emitted === "boolean") {
        if (config.target === "draft-04") {
            return ok(freezeJsonSchema({
                $schema: schemaId,
                ...emitDraft04BooleanSchema(emitted)
            }));
        }
        return ok(freezeJsonSchema({
            $schema: schemaId,
            anyOf: [emitted]
        }));
    }
    return ok(freezeJsonSchema({
        ...emitted,
        $schema: schemaId
    }));
}

/**
 * @brief Select the default JSON Schema dialect marker.
 * @param dialect Normalized dialect option.
 * @returns Stable schema identifier for the selected dialect.
 */
function defaultJsonSchemaSchemaId(target: JsonSchemaOutputTarget): string {
    if (target === "draft-04") {
        return JSON_SCHEMA_DRAFT_04_ID;
    }
    if (target === "2020-12") {
        return JSON_SCHEMA_2020_12_ID;
    }
    return JSON_SCHEMA_DRAFT_07_ID;
}

/**
 * @brief Lower a boolean schema into the draft-04 object vocabulary.
 * @details Draft-04 predates boolean schemas. The empty object is true, while
 * `not: {}` is false because every JSON value matches the empty schema.
 */
function emitDraft04BooleanSchema(value: boolean): { readonly not?: JsonSchema } {
    return value ? {} : { not: {} };
}
