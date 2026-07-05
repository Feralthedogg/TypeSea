import {
    NumberCheckTag,
    PresenceTag,
    SchemaTag,
    StringCheckTag
} from "../kind/index.js";
import {
    GraphBuilder,
    type Graph,
    type NodeId,
    type ObjectShapeEntry,
    type UnionDispatchMask
} from "../ir/index.js";
import { optimizeGraph } from "../optimize/index.js";
import {
    EMAIL_PATTERN,
    IPV4_PATTERN,
    IPV6_PATTERN,
    ISO_DATETIME_PATTERN,
    ISO_DATE_PATTERN,
    ULID_PATTERN,
    URL_PATTERN,
    UUID_PATTERN,
    type Schema
} from "../schema/index.js";

/**
 * @brief Convert one schema root into a Sea-of-Nodes predicate graph.
 * @details The graph always starts with a single input parameter and ends in a
 * boolean return node. Keeping that calling convention uniform lets optimizer,
 * interpreter, compiler, and AOT code consume the same IR shape.
 * @param schema Root schema to lower into predicate IR.
 * @returns Graph with one parameter and one return node.
 */
export function lowerSchema(schema: Schema): Graph {
    const builder = new GraphBuilder();
    const entry = builder.start();
    const input = builder.param("input");
    const result = lowerPredicate(builder, schema, input);
    const ret = builder.ret(entry, result);
    return builder.finish(entry, ret);
}

/**
 * @brief Lower one schema node into a boolean-producing IR node.
 * @details Static schemas become explicit graph operations so later passes can
 * fold, reorder, or specialize them. Dynamic schemas stay behind SchemaCheck
 * nodes because their semantics require runtime callbacks or lazy resolution.
 * @param builder Graph builder owning the current graph.
 * @param schema Schema node to lower.
 * @param value Node id that produces the candidate value.
 * @returns Node id for the boolean predicate result.
 */
function lowerPredicate(
    builder: GraphBuilder,
    schema: Schema,
    value: NodeId
): NodeId {
    switch (schema.tag) {
        case SchemaTag.Unknown:
            return builder.constant(true);
        case SchemaTag.Never:
            return builder.constant(false);
        case SchemaTag.String:
            return lowerString(builder, schema, value);
        case SchemaTag.Number:
            return lowerNumber(builder, schema, value);
        case SchemaTag.Date:
            return builder.schemaCheck(value, schema);
        case SchemaTag.BigInt:
            return builder.isBigInt(value);
        case SchemaTag.Symbol:
            return builder.isSymbol(value);
        case SchemaTag.Boolean:
            return builder.isBoolean(value);
        case SchemaTag.Literal:
            return builder.equals(value, builder.constant(schema.value));
        case SchemaTag.Array:
            /*
             * Container checks stay as explicit siblings of iteration nodes. The
             * domain pass can later remove redundant guards when iteration already
             * proves the same container type.
             */
            return builder.and([
                builder.isArray(value),
                builder.arrayEvery(
                    value,
                    schema.item,
                    schema.checks,
                    lowerChildGraph(schema.item)
                )
            ]);
        case SchemaTag.Tuple:
            if (schema.rest !== undefined) {
                return builder.schemaCheck(value, schema);
            }
            return builder.and([
                builder.isArray(value),
                builder.tupleItems(value, schema.items, lowerChildGraphs(schema.items))
            ]);
        case SchemaTag.Record:
            return builder.and([
                builder.isObject(value),
                builder.recordEvery(value, schema.value, lowerChildGraph(schema.value))
            ]);
        case SchemaTag.Map:
        case SchemaTag.Set:
        case SchemaTag.InstanceOf:
        case SchemaTag.Property:
            return builder.schemaCheck(value, schema);
        case SchemaTag.Object:
            return lowerObject(builder, schema, value);
        case SchemaTag.Union:
            return lowerUnion(builder, schema.options, value);
        case SchemaTag.Intersection:
            return builder.and([
                lowerPredicate(builder, schema.left, value),
                lowerPredicate(builder, schema.right, value)
            ]);
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
            return builder.or([
                builder.isUndefined(value),
                lowerPredicate(builder, schema.inner, value)
            ]);
        case SchemaTag.Nullable:
            return builder.or([
                builder.isNull(value),
                lowerPredicate(builder, schema.inner, value)
            ]);
        case SchemaTag.DiscriminatedUnion:
            return lowerDiscriminatedUnion(builder, schema.key, schema.cases, value);
        case SchemaTag.Brand:
            return lowerPredicate(builder, schema.inner, value);
        case SchemaTag.Lazy:
        case SchemaTag.Refine:
            /*
             * Lazy resolution and user predicates are represented as opaque schema
             * checks. Lowering keeps the graph pure and lets runtime evaluation
             * decide those dynamic cases.
             */
            return builder.schemaCheck(value, schema);
    }
}

/**
 * @brief Lower a string schema into independent scalar predicate nodes.
 * @details The base string check and each constraint remain separate in the IR
 * so algebraic and constraint passes can remove redundant bounds without
 * re-parsing the source schema.
 * @param builder Graph builder owning the current graph.
 * @param schema String schema with scalar checks.
 * @param value Node id that produces the candidate value.
 * @returns Node id for the combined string predicate.
 */
function lowerString(
    builder: GraphBuilder,
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.String }>,
    value: NodeId
): NodeId {
    const tests: NodeId[] = [builder.isString(value)];
    const checks = schema.checks;
    /*
     * String constraints are represented as independent nodes. Later algebraic
     * and domain passes can fold impossible or redundant checks.
     */
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case StringCheckTag.Min:
                tests.push(builder.stringMin(value, check.value));
                break;
            case StringCheckTag.Max:
                tests.push(builder.stringMax(value, check.value));
                break;
            case StringCheckTag.Regex:
                tests.push(builder.regex(value, check.regex, check.name));
                break;
            case StringCheckTag.Uuid:
                tests.push(builder.regex(value, UUID_PATTERN, "uuid"));
                break;
            case StringCheckTag.Email:
                tests.push(builder.regex(value, EMAIL_PATTERN, "email"));
                break;
            case StringCheckTag.Url:
                tests.push(builder.regex(value, URL_PATTERN, "url"));
                break;
            case StringCheckTag.IsoDate:
                tests.push(builder.regex(value, ISO_DATE_PATTERN, "iso_date"));
                break;
            case StringCheckTag.IsoDateTime:
                tests.push(builder.regex(value, ISO_DATETIME_PATTERN, "iso_datetime"));
                break;
            case StringCheckTag.Ulid:
                tests.push(builder.regex(value, ULID_PATTERN, "ulid"));
                break;
            case StringCheckTag.Ipv4:
                tests.push(builder.regex(value, IPV4_PATTERN, "ipv4"));
                break;
            case StringCheckTag.Ipv6:
                tests.push(builder.regex(value, IPV6_PATTERN, "ipv6"));
                break;
        }
    }
    return builder.and(tests);
}

/**
 * @brief Lower a number schema into numeric predicate nodes.
 * @details Bounds are represented as comparisons against Const nodes. That
 * gives constant folding one canonical place to intern literal limits and gives
 * constraint folding clean min/max facts.
 * @param builder Graph builder owning the current graph.
 * @param schema Number schema with scalar checks.
 * @param value Node id that produces the candidate value.
 * @returns Node id for the combined number predicate.
 */
function lowerNumber(
    builder: GraphBuilder,
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Number }>,
    value: NodeId
): NodeId {
    const tests: NodeId[] = [builder.isNumber(value)];
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case NumberCheckTag.Integer:
                tests.push(builder.isInteger(value));
                break;
            case NumberCheckTag.Gte:
                tests.push(builder.gte(value, builder.constant(check.value)));
                break;
            case NumberCheckTag.Lte:
                tests.push(builder.lte(value, builder.constant(check.value)));
                break;
            case NumberCheckTag.Gt:
                tests.push(builder.not(builder.lte(value, builder.constant(check.value))));
                break;
            case NumberCheckTag.Lt:
                tests.push(builder.not(builder.gte(value, builder.constant(check.value))));
                break;
            case NumberCheckTag.MultipleOf:
                tests.push(builder.schemaCheck(value, {
                    tag: SchemaTag.Number,
                    checks: [check]
                }));
                break;
        }
    }
    return builder.and(tests);
}

/**
 * @brief Lower an object schema into one structured shape node.
 * @details Object validation keeps key order, strict-mode metadata, and child
 * graphs together. Codegen can then emit one object-shaped fast path instead of
 * rediscovering shape facts from generic boolean nodes.
 * @param builder Graph builder owning the current graph.
 * @param schema Object schema with shape metadata.
 * @param value Node id that produces the candidate value.
 * @returns Node id for the object-shape predicate.
 */
function lowerObject(
    builder: GraphBuilder,
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    value: NodeId
): NodeId {
    return builder.objectShape(
        value,
        lowerObjectShapeEntries(schema.entries),
        schema.keys,
        schema.mode,
        schema.catchall,
        schema.catchall === undefined ? undefined : lowerChildGraph(schema.catchall)
    );
}

/**
 * @brief Lower and optimize a child schema before embedding it in a parent node.
 * @details Composite nodes store child graphs by value. Optimizing them at
 * construction time keeps array, tuple, record, object, and union codegen from
 * carrying avoidable dead nodes in every embedded child.
 * @param schema Child schema to lower.
 * @returns Optimized child graph suitable for dispatch or iteration nodes.
 */
function lowerChildGraph(schema: Schema): Graph {
    /*
     * Child graphs are optimized immediately because they are embedded into
     * dispatch and iteration nodes. Smaller child graphs make later codegen
     * and graph introspection cheaper.
     */
    return optimizeGraph(lowerSchema(schema));
}

/**
 * @brief Lower a schema vector into index-aligned child graphs.
 * @details Undefined holes are preserved so union and tuple branch indexes
 * remain stable for diagnostics and generated dispatch tables.
 * @param schemas Closed schema list.
 * @returns Child graph list preserving source indexes.
 */
function lowerChildGraphs(schemas: readonly Schema[]): readonly Graph[] {
    const graphs = new Array<Graph>(schemas.length);
    for (let index = 0; index < schemas.length; index += 1) {
        const schema = schemas[index];
        if (schema !== undefined) {
            graphs[index] = lowerChildGraph(schema);
        }
    }
    return graphs;
}

/**
 * @brief Lower object entries into IR entries with optimized child graphs.
 * @details The IR keeps the original schema beside each child graph so
 * diagnostics and dynamic fallback paths can still recover schema-level detail.
 * @param entries Object schema entries.
 * @returns IR object-shape entries with optimized child graphs.
 */
function lowerObjectShapeEntries(
    entries: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>["entries"]
): readonly ObjectShapeEntry[] {
    const lowered = new Array<ObjectShapeEntry>(entries.length);
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry !== undefined) {
            lowered[index] = {
                key: entry.key,
                schema: entry.schema,
                graph: lowerChildGraph(entry.schema),
                presence: entry.presence
            };
        }
    }
    return lowered;
}

/**
 * @brief Select the most specific IR shape for a union schema.
 * @details The lowering order is intentional: literal object discriminants are
 * most precise, primitive-only masks are cheapest for scalar unions, and the
 * general dispatch node preserves behavior for mixed or opaque branches.
 * @param builder Graph builder owning the current graph.
 * @param options Union option schemas.
 * @param value Node id that produces the candidate value.
 * @returns Node id for the selected union lowering strategy.
 */
function lowerUnion(
    builder: GraphBuilder,
    options: readonly Schema[],
    value: NodeId
): NodeId {
    const discriminant = inferObjectUnionDiscriminant(options);
    if (discriminant !== undefined) {
        /*
         * Object unions with a common required string literal key can dispatch by
         * one property read instead of probing every branch.
         */
        return builder.discriminantDispatch(
            value,
            discriminant.key,
            discriminant.literals,
            options,
            lowerChildGraphs(options)
        );
    }
    if (isPrimitiveUnionOptions(options)) {
        /*
         * Primitive-only unions lower to a compact mask dispatch so codegen can
         * group arms by typeof result.
         */
        return builder.primitiveUnion(
            value,
            lowerChildGraphs(options),
            lowerUnionMasks(options)
        );
    }
    return builder.unionDispatch(
        value,
        options,
        lowerChildGraphs(options),
        lowerUnionMasks(options)
    );
}

/**
 * @brief Bit positions used to summarize possible union root domains.
 * @details Masks let lowering and codegen skip branches whose root JavaScript
 * kind is impossible for the candidate value.
 */
const UnionMask = {
    None: 0,
    String: 1 << 0,
    Number: 1 << 1,
    Boolean: 1 << 2,
    BigInt: 1 << 3,
    Symbol: 1 << 4,
    Undefined: 1 << 5,
    Null: 1 << 6,
    Array: 1 << 7,
    Object: 1 << 8,
    Function: 1 << 9,
    Any: (1 << 10) - 1
} as const;

/**
 * @brief Mask containing only domains accepted by primitive-union dispatch.
 * @details Object and array domains are excluded because they need descriptor,
 * key, or child graph handling that primitive dispatch deliberately avoids.
 */
const PrimitiveUnionMask =
    UnionMask.String |
    UnionMask.Number |
    UnionMask.Boolean |
    UnionMask.BigInt |
    UnionMask.Symbol |
    UnionMask.Undefined |
    UnionMask.Null;

/**
 * @brief Decide whether a union can use primitive-domain dispatch.
 * @details The generated graph can replace ordered branch probing with a small
 * domain mask only when every reachable option is primitive-shaped. Empty
 * unions are rejected here so the caller does not emit a vacuous dispatcher.
 * @param options Union option schemas in public declaration order.
 * @returns True when every reachable option has a primitive-only mask.
 */
function isPrimitiveUnionOptions(options: readonly Schema[]): boolean {
    let sawReachable = false;
    for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        const mask = option === undefined ? UnionMask.None : schemaUnionMask(option);
        if (mask === UnionMask.None) {
            continue;
        }
        if ((mask & ~PrimitiveUnionMask) !== 0) {
            return false;
        }
        sawReachable = true;
    }
    return sawReachable;
}

/**
 * @brief Compute root-domain masks for every union option.
 * @details The returned array is index-aligned with the source options so
 * generated dispatch can keep branch order while cheaply rejecting impossible
 * arms by runtime kind.
 * @param options Union option schemas.
 * @returns Primitive-domain mask per union option.
 */
function lowerUnionMasks(options: readonly Schema[]): readonly UnionDispatchMask[] {
    const masks = new Array<UnionDispatchMask>(options.length);
    for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        masks[index] = option === undefined ? UnionMask.None : schemaUnionMask(option);
    }
    return masks;
}

/**
 * @brief Approximate the possible root runtime domains for a schema.
 * @details The mask is intentionally conservative. Static scalar and container
 * schemas narrow to precise domains, while lazy and refinement schemas widen to
 * the full mask because their behavior is not known during lowering.
 * @param schema Schema whose possible runtime domain is needed.
 * @returns Bit mask describing the schema's possible runtime domains.
 */
function schemaUnionMask(schema: Schema): UnionDispatchMask {
    switch (schema.tag) {
        case SchemaTag.Unknown:
            return UnionMask.Any;
        case SchemaTag.Never:
            return UnionMask.None;
        case SchemaTag.String:
            return UnionMask.String;
        case SchemaTag.Number:
            return UnionMask.Number;
        case SchemaTag.Date:
            return UnionMask.Object;
        case SchemaTag.BigInt:
            return UnionMask.BigInt;
        case SchemaTag.Symbol:
            return UnionMask.Symbol;
        case SchemaTag.Boolean:
            return UnionMask.Boolean;
        case SchemaTag.Literal:
            return literalUnionMask(schema.value);
        case SchemaTag.Array:
        case SchemaTag.Tuple:
            return UnionMask.Array;
        case SchemaTag.Object:
        case SchemaTag.Record:
        case SchemaTag.Map:
        case SchemaTag.Set:
        case SchemaTag.InstanceOf:
        case SchemaTag.Property:
        case SchemaTag.DiscriminatedUnion:
            return UnionMask.Object;
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
            return UnionMask.Undefined | schemaUnionMask(schema.inner);
        case SchemaTag.Nullable:
            return UnionMask.Null | schemaUnionMask(schema.inner);
        case SchemaTag.Brand:
            return schemaUnionMask(schema.inner);
        case SchemaTag.Intersection:
            /*
             * Intersections accept values accepted by both sides, so their
             * possible runtime domain is the bitwise intersection of both masks.
             */
            return schemaUnionMask(schema.left) & schemaUnionMask(schema.right);
        case SchemaTag.Union:
            return unionOptionsMask(schema.options);
        case SchemaTag.Lazy:
        case SchemaTag.Refine:
            return UnionMask.Any;
    }
}

/**
 * @brief Merge root-domain masks for a union option vector.
 * @details This summary feeds recursive mask analysis for nested unions without
 * expanding branch graphs during a simple domain query.
 * @param options Union option schemas.
 * @returns Bitwise union of all option masks.
 */
function unionOptionsMask(options: readonly Schema[]): UnionDispatchMask {
    let mask = UnionMask.None;
    for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        if (option !== undefined) {
            mask |= schemaUnionMask(option);
        }
    }
    return mask;
}

/**
 * @brief Map a literal value to the matching root-domain bit.
 * @details Literal schemas participate in union dispatch by their JavaScript
 * runtime kind. Object literals are not supported by TypeSea literal schemas and
 * therefore fall back to the empty mask.
 * @param value Literal value from a literal schema.
 * @returns Domain bit for the literal's runtime type.
 */
function literalUnionMask(value: unknown): UnionDispatchMask {
    if (value === null) {
        return UnionMask.Null;
    }
    switch (typeof value) {
        case "string":
            return UnionMask.String;
        case "number":
            return UnionMask.Number;
        case "boolean":
            return UnionMask.Boolean;
        case "bigint":
            return UnionMask.BigInt;
        case "symbol":
            return UnionMask.Symbol;
        case "undefined":
            return UnionMask.Undefined;
        default:
            return UnionMask.None;
    }
}

/**
 * @brief Lower an explicit discriminated union into table dispatch IR.
 * @details Builder validation already proved that every branch requires its
 * literal tag. Lowering can therefore store the literal table directly and let
 * codegen emit a single property read plus branch selection.
 * @param builder Graph builder owning the current graph.
 * @param key Discriminant property name.
 * @param cases Closed discriminated union cases.
 * @param value Node id that produces the candidate value.
 * @returns Node id for discriminant dispatch.
 */
function lowerDiscriminatedUnion(
    builder: GraphBuilder,
    key: string,
    cases: Extract<Schema, {
        readonly tag: typeof SchemaTag.DiscriminatedUnion
    }>["cases"],
    value: NodeId
): NodeId {
    const literals = new Array<string>(cases.length);
    const schemas = new Array<Schema>(cases.length);
    for (let index = 0; index < cases.length; index += 1) {
        const unionCase = cases[index];
        if (unionCase !== undefined) {
            literals[index] = unionCase.literal;
            schemas[index] = unionCase.schema;
        }
    }
    return builder.discriminantDispatch(
        value,
        key,
        literals,
        schemas,
        lowerChildGraphs(schemas)
    );
}

/**
 * @brief Static proof that a plain object union can use discriminant dispatch.
 * @details Inferred discriminants reuse the same IR shape as explicit
 * discriminated unions, but only after each branch proves a unique required
 * string literal for the same key.
 */
interface InferredObjectUnionDiscriminant {
    /**
     * @brief Shared required object key used for dispatch.
     * @details Every inferred branch must prove this key before table dispatch is emitted.
     */
    readonly key: string;

    /**
     * @brief Unique string literal per union option, preserving option order.
     * @details The array index matches the source union branch index used by child graphs.
     */
    readonly literals: readonly string[];
}

/**
 * @brief Search a plain object union for an implicit discriminant key.
 * @details Only required string literal fields from the first branch are
 * candidates. Every other branch must prove the same key with a unique literal
 * before the union can use table dispatch.
 * @param options Union option schemas.
 * @returns Shared discriminant key and literals, or undefined when not provable.
 */
function inferObjectUnionDiscriminant(
    options: readonly Schema[]
): InferredObjectUnionDiscriminant | undefined {
    if (options.length < 2) {
        return undefined;
    }
    const first = options[0];
    if (first?.tag !== SchemaTag.Object) {
        return undefined;
    }
    const entries = first.entries;
    for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
        const entry = entries[entryIndex];
        if (entry === undefined) {
            continue;
        }
        const firstLiteral = readRequiredStringLiteral(entry);
        if (firstLiteral === undefined) {
            continue;
        }
        /*
         * Only keys already required by the first option are candidates. Every
         * other option must carry a unique required string literal for that key.
         */
        const literals = readObjectUnionDiscriminantLiterals(options, entry.key);
        if (literals !== undefined) {
            return {
                key: entry.key,
                literals
            };
        }
    }
    return undefined;
}

/**
 * @brief Build the literal dispatch table for an inferred object union.
 * @details The table is usable only when each branch owns the candidate key,
 * requires it, and binds it to a unique string literal. Repeated or missing
 * literals make branch selection ambiguous, so this helper returns undefined
 * and the lowerer keeps the general union path.
 * @param options Union option schemas in branch order.
 * @param key Candidate discriminant key shared by the branches.
 * @returns Literal table when every option has a unique required string literal.
 */
function readObjectUnionDiscriminantLiterals(
    options: readonly Schema[],
    key: string
): readonly string[] | undefined {
    const literals = new Array<string>(options.length);
    const seen = new Set<string>();
    for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        if (option?.tag !== SchemaTag.Object) {
            return undefined;
        }
        const literal = readObjectDiscriminantLiteral(option, key);
        if (literal === undefined || seen.has(literal)) {
            /*
             * Missing or repeated literals make direct dispatch ambiguous, so the
             * union must fall back to general branch probing.
             */
            return undefined;
        }
        seen.add(literal);
        literals[index] = literal;
    }
    return literals;
}

/**
 * @brief Locate the required string literal carried by one object branch.
 * @details Optional and wrapped non-literal fields are rejected because direct
 * dispatch must prove that accepting the branch also proves the tag value.
 * @param schema Object schema to inspect.
 * @param key Candidate discriminant key.
 * @returns Required string literal value for the key, or undefined.
 */
function readObjectDiscriminantLiteral(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    key: string
): string | undefined {
    const entries = schema.entries;
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry?.key === key) {
            return readRequiredStringLiteral(entry);
        }
    }
    return undefined;
}

/**
 * @brief Prove that an object entry is a required string literal tag.
 * @details The discriminant optimizer deliberately refuses optional,
 * undefinedable, or refined tags. Those forms may still validate correctly, but
 * they do not provide a branch-selection proof before child validation runs.
 * @param entry Object entry to inspect.
 * @returns Literal string when the entry is required and exactly string-literal.
 */
function readRequiredStringLiteral(
    entry: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>["entries"][number]
): string | undefined {
    if (entry.presence !== PresenceTag.Required ||
        entry.schema.tag !== SchemaTag.Literal ||
        typeof entry.schema.value !== "string") {
        return undefined;
    }
    return entry.schema.value;
}
