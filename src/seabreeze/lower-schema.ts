/**
 * @file lower-schema.ts
 * @brief Lower SeaBreeze arena nodes into TypeSea schema records.
 * @details This bridge keeps the inference core arena-backed while letting the
 * existing TypeSea lower/optimize/JIT pipeline consume inferred principal joins.
 */

import {
    ObjectModeTag,
    PresenceTag,
    SchemaTag
} from "../kind/index.js";
import {
    freezeSchema,
    normalizeUnionSchema,
    type ObjectEntry,
    type ObjectKeyLookup,
    type Schema
} from "../schema/index.js";
import {
    SeaBreezeKind,
    SeaBreezePresence,
    type SeaBreezeNodeId
} from "./sea-breeze.js";
import type { SeaBreezeArena } from "./sea-breeze.js";

/** @brief Object unknown-key policy applied during arena-to-schema lowering. */
export type SeaBreezeSchemaObjectMode =
    | "strict"
    | "passthrough"
    | "strip";

/** @brief Behavior when lowering reaches an unresolved inference variable. */
export type SeaBreezeUnboundVarPolicy =
    | "unknown"
    | "error";

/** @brief Behavior when an arena cycle cannot be represented without a lazy node. */
export type SeaBreezeCyclePolicy =
    | "unknown"
    | "error";

/** @brief Choice between normalized flat unions and preserved binary joins. */
export type SeaBreezeUnionMode =
    | "flatten"
    | "binary";

/** @brief Key interning table and semantic policies for schema materialization. */
export interface SeaBreezeSchemaLoweringOptions {
    /**
     * @brief Intern table mapping arena field key ids to object property names.
     */
    readonly keyTable: readonly string[];

    /**
     * @brief Object unknown-key policy for lowered object schemas.
     * @default "strict"
     */
    readonly objectMode?: SeaBreezeSchemaObjectMode | undefined;

    /**
     * @brief Policy for a still-unbound HM variable.
     * @default "unknown"
     */
    readonly unboundVar?: SeaBreezeUnboundVarPolicy | undefined;

    /**
     * @brief Policy for recursive arena shapes that cannot lower without lazy.
     * @default "error"
     */
    readonly cycle?: SeaBreezeCyclePolicy | undefined;

    /**
     * @brief Preserve binary union shape or flatten through TypeSea normalization.
     * @default "flatten"
     */
    readonly unionMode?: SeaBreezeUnionMode | undefined;
}

interface LoweringContext {
    readonly arena: SeaBreezeArena;
    readonly keyTable: readonly string[];
    readonly objectMode: ObjectModeTag;
    readonly unboundVar: SeaBreezeUnboundVarPolicy;
    readonly cycle: SeaBreezeCyclePolicy;
    readonly unionMode: SeaBreezeUnionMode;
    readonly cache: (Schema | undefined)[];
    readonly state: Uint8Array;
}

/**
 * @brief Lower a SeaBreeze node into a frozen TypeSea schema.
 * @param arena Inference arena owning the node ids.
 * @param root Root node id to lower.
 * @param options Key table and lowering policy.
 * @returns Frozen TypeSea schema suitable for BaseGuard and compile().
 */
export function lowerSeaBreezeToSchema(
    arena: SeaBreezeArena,
    root: SeaBreezeNodeId,
    options: SeaBreezeSchemaLoweringOptions
): Schema {
    const context: LoweringContext = {
        arena,
        keyTable: readKeyTable(options.keyTable),
        objectMode: readObjectMode(options.objectMode),
        unboundVar: options.unboundVar ?? "unknown",
        cycle: options.cycle ?? "error",
        unionMode: options.unionMode ?? "flatten",
        cache: new Array<Schema | undefined>(arena.nodeLength),
        state: new Uint8Array(arena.nodeLength)
    };
    return freezeSchema(lowerNode(context, root));
}

/**
 * @brief Lower one representative node.
 */
function lowerNode(context: LoweringContext, node: SeaBreezeNodeId): Schema {
    const root = context.arena.find(node);
    const cached = context.cache[root];
    if (cached !== undefined) {
        return cached;
    }
    if (context.state[root] === 1) {
        return lowerCycle(context);
    }
    context.state[root] = 1;
    const schema = lowerFreshNode(context, root);
    context.cache[root] = schema;
    context.state[root] = 2;
    return schema;
}

/**
 * @brief Lower a node that has not been cached.
 */
function lowerFreshNode(context: LoweringContext, root: SeaBreezeNodeId): Schema {
    switch (context.arena.kindOf(root)) {
        case SeaBreezeKind.Never:
            return {
                tag: SchemaTag.Never
            };
        case SeaBreezeKind.Unknown:
            return {
                tag: SchemaTag.Unknown
            };
        case SeaBreezeKind.Null:
            return {
                tag: SchemaTag.Literal,
                value: null
            };
        case SeaBreezeKind.Undefined:
            return {
                tag: SchemaTag.Literal,
                value: undefined
            };
        case SeaBreezeKind.Boolean:
            return {
                tag: SchemaTag.Boolean
            };
        case SeaBreezeKind.Number:
            return {
                tag: SchemaTag.Number,
                checks: []
            };
        case SeaBreezeKind.String:
            return {
                tag: SchemaTag.String,
                checks: []
            };
        case SeaBreezeKind.BigInt:
            return {
                tag: SchemaTag.BigInt,
                checks: []
            };
        case SeaBreezeKind.Symbol:
            return {
                tag: SchemaTag.Symbol
            };
        case SeaBreezeKind.Var:
            return lowerUnboundVar(context);
        case SeaBreezeKind.Array:
            return {
                tag: SchemaTag.Array,
                item: lowerNode(context, context.arena.arrayElement(root)),
                checks: []
            };
        case SeaBreezeKind.Object:
            return lowerObject(context, root);
        case SeaBreezeKind.Union:
            return lowerUnion(context, root);
    }
}

/**
 * @brief Lower an object node into entries, keys, and lookup metadata.
 */
function lowerObject(context: LoweringContext, root: SeaBreezeNodeId): Schema {
    const count = context.arena.fieldCount(root);
    const entries = new Array<ObjectEntry>(count);
    const keys = new Array<string>(count);
    const keyLookup = makeObjectKeyLookup();

    for (let index = 0; index < count; index += 1) {
        const key = readFieldKey(context, context.arena.fieldKeyAt(root, index));
        if (hasObjectKey(keyLookup, key)) {
            throw new TypeError(`SeaBreeze key table maps duplicate object key ${key}`);
        }
        defineObjectKey(keyLookup, key);
        keys[index] = key;
        entries[index] = {
            key,
            schema: lowerNode(context, context.arena.fieldTypeAt(root, index)),
            presence: context.arena.fieldPresenceAt(root, index) === SeaBreezePresence.Required
                ? PresenceTag.Required
                : PresenceTag.Optional
        };
    }

    return {
        tag: SchemaTag.Object,
        entries,
        keys,
        keyLookup,
        mode: context.objectMode,
        catchall: undefined
    };
}

/**
 * @brief Lower a binary arena union into TypeSea union schema.
 */
function lowerUnion(context: LoweringContext, root: SeaBreezeNodeId): Schema {
    if (context.unionMode === "binary") {
        return {
            tag: SchemaTag.Union,
            options: [
                lowerNode(context, context.arena.unionLeft(root)),
                lowerNode(context, context.arena.unionRight(root))
            ]
        };
    }
    const options: Schema[] = [];
    appendUnionOptions(context, root, options);
    return normalizeUnionSchema(options);
}

/**
 * @brief Append flattened union arms.
 */
function appendUnionOptions(
    context: LoweringContext,
    node: SeaBreezeNodeId,
    output: Schema[]
): void {
    const root = context.arena.find(node);
    if (context.arena.kindOf(root) !== SeaBreezeKind.Union) {
        output.push(lowerNode(context, root));
        return;
    }
    appendUnionOptions(context, context.arena.unionLeft(root), output);
    appendUnionOptions(context, context.arena.unionRight(root), output);
}

/**
 * @brief Lower an unbound HM variable according to caller policy.
 */
function lowerUnboundVar(context: LoweringContext): Schema {
    if (context.unboundVar === "error") {
        throw new TypeError("cannot lower unbound SeaBreeze variable");
    }
    return {
        tag: SchemaTag.Unknown
    };
}

/**
 * @brief Lower a recursive arena cycle according to caller policy.
 */
function lowerCycle(context: LoweringContext): Schema {
    if (context.cycle === "error") {
        throw new TypeError("cannot lower recursive SeaBreeze shape without lazy bridge");
    }
    return {
        tag: SchemaTag.Unknown
    };
}

/**
 * @brief Read one field key from the caller-owned key table.
 */
function readFieldKey(context: LoweringContext, keyId: number): string {
    const key = context.keyTable[keyId];
    if (typeof key !== "string") {
        throw new RangeError(`missing SeaBreeze key table entry ${String(keyId)}`);
    }
    return key;
}

/**
 * @brief Validate object-mode lowering policy.
 */
function readObjectMode(value: SeaBreezeSchemaObjectMode | undefined): ObjectModeTag {
    switch (value ?? "strict") {
        case "strict":
            return ObjectModeTag.Strict;
        case "passthrough":
            return ObjectModeTag.Passthrough;
        case "strip":
            return ObjectModeTag.Strip;
    }
}

/**
 * @brief Reject malformed key tables before lowering begins.
 */
function readKeyTable(value: readonly string[]): readonly string[] {
    const raw: unknown = value;
    if (!Array.isArray(raw)) {
        throw new TypeError("SeaBreeze keyTable must be an array");
    }
    const input = raw as readonly unknown[];
    const output = new Array<string>(input.length);
    for (let index = 0; index < input.length; index += 1) {
        const entry = input[index];
        if (typeof entry !== "string") {
            throw new TypeError("SeaBreeze keyTable entries must be strings");
        }
        output[index] = entry;
    }
    return Object.freeze(output);
}

/**
 * @brief Create a hostile-key-safe lookup object.
 */
function makeObjectKeyLookup(): ObjectKeyLookup {
    return Object.create(null) as ObjectKeyLookup;
}

/**
 * @brief Define one lookup key without invoking __proto__ behavior.
 */
function defineObjectKey(lookup: ObjectKeyLookup, key: string): void {
    Object.defineProperty(lookup, key, {
        configurable: false,
        enumerable: true,
        value: true,
        writable: false
    });
}

/**
 * @brief Test whether a lookup already contains one key.
 */
function hasObjectKey(lookup: ObjectKeyLookup, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(lookup, key);
}
