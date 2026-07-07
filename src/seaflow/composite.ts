/**
 * @file composite.ts
 * @brief Composite payload solvers for SeaFlow.
 */

import {
    ArrayCheckTag,
    ObjectModeTag,
    PresenceTag,
    SchemaTag
} from "../kind/index.js";
import type {
    ArrayCheck,
    ObjectEntry,
    Schema
} from "../schema/index.js";
import {
    childContext,
    descendContext,
    isHighOrExtreme,
    makeSeaFlowCase
} from "./case.js";
import { sampleValidValue } from "./sample.js";
import type {
    SeaFlowCase,
    SeaFlowContext,
    SeaFlowEmitter
} from "./types.js";

/**
 * @brief Dispatch composite schemas into structural SeaFlow probes.
 * @remarks Composite solvers are depth-limited because recursive schemas can
 * otherwise expand without bound. The dispatcher keeps wrappers transparent so
 * emitted paths still point at the child value that carries the failure.
 */
export function* emitCompositeCases(
    schema: Schema,
    context: SeaFlowContext,
    emitChild: SeaFlowEmitter
): IterableIterator<SeaFlowCase> {
    if (context.depth >= context.config.maxDepth && schema.tag !== SchemaTag.Lazy) {
        return;
    }
    switch (schema.tag) {
        case SchemaTag.Array:
            yield* emitArrayCases(schema, context, emitChild);
            break;
        case SchemaTag.Tuple:
            yield* emitTupleCases(schema, context, emitChild);
            break;
        case SchemaTag.Record:
            yield* emitRecordCases(schema, context, emitChild);
            break;
        case SchemaTag.Map:
            yield* emitMapCases(schema, context, emitChild);
            break;
        case SchemaTag.Set:
            yield* emitSetCases(schema, context, emitChild);
            break;
        case SchemaTag.Object:
            yield* emitObjectCases(schema, context, emitChild);
            break;
        case SchemaTag.Union:
        case SchemaTag.Xor:
            yield* emitUnionCases(schema.options, context, emitChild, schema.tag === SchemaTag.Xor);
            break;
        case SchemaTag.Intersection:
            yield* emitIntersectionCases(schema, context, emitChild);
            break;
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
            yield* emitChild(schema.inner, descendContext(context));
            yield makeSeaFlowCase(context, undefined, true, "valid", "wrapper.undefined");
            break;
        case SchemaTag.Nullable:
            yield* emitChild(schema.inner, descendContext(context));
            yield makeSeaFlowCase(context, null, true, "valid", "wrapper.null");
            break;
        case SchemaTag.DiscriminatedUnion:
            yield* emitDiscriminatedUnionCases(schema, context, emitChild);
            break;
        case SchemaTag.Brand:
        case SchemaTag.Metadata:
        case SchemaTag.Message:
        case SchemaTag.Readonly:
            yield* emitChild(schema.inner, descendContext(context));
            break;
        case SchemaTag.KeyedObject:
        case SchemaTag.PropertyCount:
        case SchemaTag.PropertyNames:
            yield* emitChild(schema.inner, descendContext(context));
            break;
        case SchemaTag.PatternProperties:
            yield* emitPatternPropertiesCases(schema, context, emitChild);
            break;
        case SchemaTag.Property:
            yield* emitPropertyCases(schema, context, emitChild);
            break;
        case SchemaTag.Refine:
            yield* emitRefineCases(schema.inner, context, emitChild);
            break;
        case SchemaTag.Lazy:
            yield* emitLazyCases(schema, context, emitChild);
            break;
        default:
            break;
    }
}

/**
 * @brief Emit array shape, item, length, and sparse-slot probes.
 * @remarks Sparse arrays are security-tagged because they expose differences
 * between index reads, descriptor reads, and dense iteration assumptions.
 */
function* emitArrayCases(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Array }>,
    context: SeaFlowContext,
    emitChild: SeaFlowEmitter
): IterableIterator<SeaFlowCase> {
    const valid = [sampleValidValue(schema.item, childContext(context, 0))];
    yield makeSeaFlowCase(context, valid, true, "valid", "array.sample");
    yield makeSeaFlowCase(context, {}, false, "invalid", "array.object");
    yield* emitArrayLengthCases(schema.checks, context);
    const invalidItem = firstInvalidValue(
        schema.item,
        childContext(context, 0),
        emitChild
    );
    yield makeSeaFlowCase(context, [invalidItem], false, "invalid", "array.item");
    if (isHighOrExtreme(context)) {
        const sparse: unknown[] = [];
        sparse.length = 1;
        yield makeSeaFlowCase(context, sparse, false, "security", "array.sparse");
    }
}

/**
 * @brief Emit array length neighbors for min and max checks.
 */
function* emitArrayLengthCases(
    checks: readonly ArrayCheck[],
    context: SeaFlowContext
): IterableIterator<SeaFlowCase> {
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        if (check.tag === ArrayCheckTag.Min && check.value > 0) {
            yield makeSeaFlowCase(
                context,
                new Array(Math.max(0, check.value - 1)).fill(undefined),
                false,
                "invalid",
                "array.min.boundary"
            );
        }
        if (check.tag === ArrayCheckTag.Max) {
            yield makeSeaFlowCase(
                context,
                new Array(check.value + 1).fill(undefined),
                false,
                "invalid",
                "array.max.boundary"
            );
        }
    }
}

/**
 * @brief Emit tuple arity and first-item corruption probes.
 * @remarks Tuple failures are intentionally local: one short tuple, one long
 * tuple, and one bad element keep the result readable while still testing the
 * generated arity branches.
 */
function* emitTupleCases(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Tuple }>,
    context: SeaFlowContext,
    emitChild: SeaFlowEmitter
): IterableIterator<SeaFlowCase> {
    const valid = schema.items.map((item, index) =>
        sampleValidValue(item, childContext(context, index)));
    yield makeSeaFlowCase(context, valid, true, "valid", "tuple.sample");
    yield makeSeaFlowCase(context, valid.slice(0, Math.max(0, valid.length - 1)), false, "invalid", "tuple.short");
    yield makeSeaFlowCase(context, [...valid, unknownExtra(schema, context)], false, "invalid", "tuple.long");
    const first = schema.items[0];
    if (first !== undefined) {
        yield makeSeaFlowCase(
            context,
            [firstInvalidValue(first, childContext(context, 0), emitChild), ...valid.slice(1)],
            false,
            "invalid",
            "tuple.item"
        );
    }
}

/**
 * @brief Emit record object, missing required key, and bad value probes.
 */
function* emitRecordCases(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Record }>,
    context: SeaFlowContext,
    emitChild: SeaFlowEmitter
): IterableIterator<SeaFlowCase> {
    const key = schema.requiredKeys?.[0] ?? "key";
    const value = sampleValidValue(schema.value, childContext(context, key));
    yield makeSeaFlowCase(context, { [key]: value }, true, "valid", "record.sample");
    yield makeSeaFlowCase(context, [], false, "invalid", "record.array");
    yield makeSeaFlowCase(
        context,
        { [key]: firstInvalidValue(schema.value, childContext(context, key), emitChild) },
        false,
        "invalid",
        "record.value"
    );
    if (schema.requiredKeys !== undefined && schema.requiredKeys.length !== 0) {
        yield makeSeaFlowCase(context, {}, false, "invalid", "record.requiredKey");
    }
}

/**
 * @brief Emit Map probes for container identity, key validation, and value validation.
 */
function* emitMapCases(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Map }>,
    context: SeaFlowContext,
    emitChild: SeaFlowEmitter
): IterableIterator<SeaFlowCase> {
    const key = sampleValidValue(schema.key, childContext(context, "key"));
    const value = sampleValidValue(schema.value, childContext(context, "value"));
    yield makeSeaFlowCase(context, new Map([[key, value]]), true, "valid", "map.sample");
    yield makeSeaFlowCase(context, {}, false, "invalid", "map.object");
    yield makeSeaFlowCase(
        context,
        new Map([[firstInvalidValue(schema.key, childContext(context, "key"), emitChild), value]]),
        false,
        "invalid",
        "map.key"
    );
    yield makeSeaFlowCase(
        context,
        new Map([[key, firstInvalidValue(schema.value, childContext(context, "value"), emitChild)]]),
        false,
        "invalid",
        "map.value"
    );
}

/**
 * @brief Emit Set probes for container identity and member validation.
 */
function* emitSetCases(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Set }>,
    context: SeaFlowContext,
    emitChild: SeaFlowEmitter
): IterableIterator<SeaFlowCase> {
    const value = sampleValidValue(schema.item, childContext(context, 0));
    yield makeSeaFlowCase(context, new Set([value]), true, "valid", "set.sample");
    yield makeSeaFlowCase(context, [], false, "invalid", "set.array");
    yield makeSeaFlowCase(
        context,
        new Set([firstInvalidValue(schema.item, childContext(context, 0), emitChild)]),
        false,
        "invalid",
        "set.item"
    );
}

/**
 * @brief Emit object structural probes and hostile own-property payloads.
 * @remarks Object solvers preserve own property descriptors when injecting
 * accessors. That keeps hostile-input tests aligned with safe-mode descriptor
 * semantics instead of accidentally reading a getter during generation.
 */
function* emitObjectCases(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    context: SeaFlowContext,
    emitChild: SeaFlowEmitter
): IterableIterator<SeaFlowCase> {
    const valid = sampleValidValue(schema, context);
    yield makeSeaFlowCase(context, valid, true, "valid", "object.sample");
    yield makeSeaFlowCase(context, null, false, "invalid", "object.null");
    const required = firstRequiredEntry(schema.entries);
    if (required !== undefined) {
        yield makeSeaFlowCase(
            context,
            omitOwnKey(valid, required.key),
            false,
            "invalid",
            "object.requiredKey"
        );
        yield makeSeaFlowCase(
            context,
            setOwnKey(
                valid,
                required.key,
                firstInvalidValue(required.schema, childContext(context, required.key), emitChild)
            ),
            false,
            "invalid",
            "object.field"
        );
        if (isHighOrExtreme(context)) {
            yield makeSeaFlowCase(
                context,
                setAccessorKey(valid, required.key, sampleValidValue(required.schema, context)),
                false,
                "security",
                "object.accessor"
            );
        }
    }
    if (schema.mode === ObjectModeTag.Strict) {
        yield makeSeaFlowCase(
            context,
            setOwnKey(valid, "__extra", true),
            false,
            "invalid",
            "object.strict.extra"
        );
    }
    if (isHighOrExtreme(context)) {
        yield makeSeaFlowCase(
            context,
            setOwnKey(valid, "__proto__", { polluted: true }),
            schema.mode !== ObjectModeTag.Strict,
            "security",
            "object.proto"
        );
        yield makeSeaFlowCase(
            context,
            setOwnKey(valid, "constructor", { prototype: { polluted: true } }),
            schema.mode !== ObjectModeTag.Strict,
            "security",
            "object.constructor"
        );
        yield makeSeaFlowCase(
            context,
            setOwnKey(valid, "prototype", { polluted: true }),
            schema.mode !== ObjectModeTag.Strict,
            "security",
            "object.prototype"
        );
    }
}

/**
 * @brief Emit union branch samples, a first-branch failure, and object hybrids.
 * @remarks Hybrid objects are useful against presence-dispatched unions: they
 * combine fields from two branches and verify that dispatch does not accept a
 * value by observing only one side of the shape.
 */
function* emitUnionCases(
    options: readonly Schema[],
    context: SeaFlowContext,
    emitChild: SeaFlowEmitter,
    exclusive: boolean
): IterableIterator<SeaFlowCase> {
    for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        if (option === undefined) {
            continue;
        }
        yield makeSeaFlowCase(
            context,
            sampleValidValue(option, childContext(context, index)),
            true,
            "valid",
            exclusive ? "xor.option" : "union.option"
        );
    }
    const first = options[0];
    if (first !== undefined) {
        const invalid = firstInvalidValue(first, childContext(context, 0), emitChild);
        yield makeSeaFlowCase(context, invalid, false, "invalid", "union.invalidFirst");
    }
    const hybrid = makeHybridObject(options, context);
    if (hybrid !== undefined) {
        yield makeSeaFlowCase(context, hybrid, false, "security", "union.hybrid");
    }
}

/**
 * @brief Emit one valid intersection sample and one invalid left-side sample.
 */
function* emitIntersectionCases(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Intersection }>,
    context: SeaFlowContext,
    emitChild: SeaFlowEmitter
): IterableIterator<SeaFlowCase> {
    yield makeSeaFlowCase(
        context,
        sampleValidValue(schema, context),
        true,
        "valid",
        "intersection.sample"
    );
    yield makeSeaFlowCase(
        context,
        firstInvalidValue(schema.left, descendContext(context), emitChild),
        false,
        "invalid",
        "intersection.left"
    );
}

/**
 * @brief Emit discriminated union cases and a corrupted discriminant probe.
 */
function* emitDiscriminatedUnionCases(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.DiscriminatedUnion }>,
    context: SeaFlowContext,
    emitChild: SeaFlowEmitter
): IterableIterator<SeaFlowCase> {
    for (let index = 0; index < schema.cases.length; index += 1) {
        const item = schema.cases[index];
        if (item !== undefined) {
            yield makeSeaFlowCase(
                context,
                sampleValidValue(item.schema, childContext(context, index)),
                true,
                "valid",
                "discriminatedUnion.case"
            );
        }
    }
    const first = schema.cases[0];
    if (first !== undefined) {
        yield makeSeaFlowCase(
            context,
            setOwnKey(
                sampleValidValue(first.schema, childContext(context, 0)),
                schema.key,
                "__typesea_bad_discriminant"
            ),
            false,
            "invalid",
            "discriminatedUnion.key"
        );
        yield makeSeaFlowCase(
            context,
            firstInvalidValue(first.schema, childContext(context, 0), emitChild),
            false,
            "invalid",
            "discriminatedUnion.caseInvalid"
        );
    }
}

/**
 * @brief Emit pattern-property child probes while preserving the base schema.
 */
function* emitPatternPropertiesCases(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.PatternProperties }>,
    context: SeaFlowContext,
    emitChild: SeaFlowEmitter
): IterableIterator<SeaFlowCase> {
    yield* emitChild(schema.inner, descendContext(context));
    const entry = schema.entries[0];
    if (entry !== undefined) {
        yield makeSeaFlowCase(
            context,
            setOwnKey(
                sampleValidValue(schema.inner, context),
                entry.source,
                firstInvalidValue(entry.schema, childContext(context, entry.source), emitChild)
            ),
            false,
            "invalid",
            "patternProperties.value"
        );
    }
}

/**
 * @brief Emit a property-schema valid sample and one corrupted property value.
 */
function* emitPropertyCases(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Property }>,
    context: SeaFlowContext,
    emitChild: SeaFlowEmitter
): IterableIterator<SeaFlowCase> {
    yield makeSeaFlowCase(context, sampleValidValue(schema, context), true, "valid", "property.sample");
    yield makeSeaFlowCase(
        context,
        setOwnKey(
            sampleValidValue(schema.base, descendContext(context)),
            schema.key,
            firstInvalidValue(schema.value, childContext(context, schema.key), emitChild)
        ),
        false,
        "invalid",
        "property.value"
    );
}

/**
 * @brief Forward only invalid inner cases through refinement wrappers.
 * @remarks SeaFlow cannot derive arbitrary user refinement predicates, so it
 * keeps structural failures from the inner schema and leaves semantic success
 * generation to the base valid sample.
 */
function* emitRefineCases(
    inner: Schema,
    context: SeaFlowContext,
    emitChild: SeaFlowEmitter
): IterableIterator<SeaFlowCase> {
    for (const item of emitChild(inner, descendContext(context))) {
        if (!item.valid) {
            yield item;
        }
    }
}

/**
 * @brief Expand a lazy schema until the configured depth cap is reached.
 */
function* emitLazyCases(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Lazy }>,
    context: SeaFlowContext,
    emitChild: SeaFlowEmitter
): IterableIterator<SeaFlowCase> {
    if (context.depth >= context.config.maxDepth) {
        yield makeSeaFlowCase(context, undefined, false, "invalid", "lazy.depth");
        return;
    }
    yield* emitChild(schema.get(), descendContext(context));
}

/**
 * @brief Extract the first invalid child value emitted for a schema.
 * @remarks Composite probes need a single corrupt field. Reusing the child's
 * own solver keeps that corruption schema-aware instead of inventing a broad
 * fallback at every call site.
 */
function firstInvalidValue(
    schema: Schema,
    context: SeaFlowContext,
    emitChild: SeaFlowEmitter
): unknown {
    for (const item of emitChild(schema, context)) {
        if (!item.valid) {
            return item.value;
        }
    }
    return unknownExtra(schema, context);
}

/**
 * @brief Produce a conservative fallback value outside the common schema kind.
 */
function unknownExtra(schema: Schema, context: SeaFlowContext): unknown {
    switch (schema.tag) {
        case SchemaTag.String:
            return 0;
        case SchemaTag.Number:
            return "0";
        case SchemaTag.Boolean:
            return 1;
        case SchemaTag.Array:
        case SchemaTag.Tuple:
            return {};
        case SchemaTag.Object:
        case SchemaTag.Record:
            return null;
        case SchemaTag.Lazy:
            return context.depth >= context.config.maxDepth
                ? null
                : unknownExtra(schema.get(), descendContext(context));
        default:
            return "__typesea_invalid__";
    }
}

/**
 * @brief Locate the first required object entry for minimal object corruption.
 */
function firstRequiredEntry(entries: readonly ObjectEntry[]): ObjectEntry | undefined {
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry?.presence === PresenceTag.Required) {
            return entry;
        }
    }
    return undefined;
}

/**
 * @brief Copy an object while deleting one own enumerable key.
 */
function omitOwnKey(value: unknown, key: string): Record<string, unknown> {
    const output: Record<string, unknown> = {};
    if (isRecord(value)) {
        const keys = Object.keys(value);
        for (let index = 0; index < keys.length; index += 1) {
            const item = keys[index];
            if (item !== undefined && item !== key) {
                output[item] = value[item];
            }
        }
    }
    return output;
}

/**
 * @brief Copy an object and define a data property with safe descriptors.
 */
function setOwnKey(
    value: unknown,
    key: string,
    child: unknown
): Record<string, unknown> {
    const output = copyRecord(value);
    Object.defineProperty(output, key, {
        value: child,
        enumerable: true,
        configurable: true,
        writable: true
    });
    return output;
}

/**
 * @brief Copy an object and define an accessor property for hostile-input probes.
 */
function setAccessorKey(
    value: unknown,
    key: string,
    child: unknown
): Record<string, unknown> {
    const output = copyRecord(value);
    Object.defineProperty(output, key, {
        get() {
            return child;
        },
        enumerable: true,
        configurable: true
    });
    return output;
}

/**
 * @brief Copy own enumerable data into a plain record.
 */
function copyRecord(value: unknown): Record<string, unknown> {
    const output: Record<string, unknown> = {};
    if (!isRecord(value)) {
        return output;
    }
    const keys = Object.keys(value);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key !== undefined) {
            output[key] = value[key];
        }
    }
    return output;
}

/**
 * @brief Combine samples from the first two object union branches.
 */
function makeHybridObject(
    options: readonly Schema[],
    context: SeaFlowContext
): Record<string, unknown> | undefined {
    let left: Extract<Schema, { readonly tag: typeof SchemaTag.Object }> | undefined;
    let right: Extract<Schema, { readonly tag: typeof SchemaTag.Object }> | undefined;
    for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        if (option?.tag !== SchemaTag.Object) {
            continue;
        }
        if (left === undefined) {
            left = option;
            continue;
        }
        right = option;
        break;
    }
    if (left === undefined || right === undefined) {
        return undefined;
    }
    return {
        ...sampleValidValue(left, descendContext(context)) as Record<string, unknown>,
        ...sampleValidValue(right, descendContext(context)) as Record<string, unknown>
    };
}

/**
 * @brief Accept plain object-like records while excluding arrays and null.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
