/**
 * @file builder.ts
 * @brief Builder facade for SeaBreeze arenas.
 * @details The builder owns the caller-visible key table and delegates every
 * type operation to SeaBreezeArena. The produced roots remain numeric node ids,
 * so compiled predicates execute without a builder object in the validation
 * loop.
 */

import {
    makeDynamicCheck,
    makeDynamicFirstIssueCheck,
    makeDynamicIssueCheck,
    strictKeys,
    type BooleanPredicate,
    type PredicateFactory
} from "../compile/runtime.js";
import type { CompiledSourceBundle } from "../compile/types.js";
import type { Graph } from "../ir/index.js";
import type { Schema } from "../schema/index.js";
import {
    emitSeaBreezeBooleanSourceBundle,
    type SeaBreezeEmitOptions
} from "./emit.js";
import {
    lowerSeaBreezeToGraph,
    type SeaBreezeGraphLoweringOptions
} from "./lower-graph.js";
import {
    lowerSeaBreezeToSchema,
    type SeaBreezeSchemaLoweringOptions
} from "./lower-schema.js";
import { seaBreezeReader, type SeaBreezeReader } from "./reader.js";
import {
    SeaBreezeArena,
    SeaBreezePresence,
    type SeaBreezeNodeId,
    type SeaBreezeOptions,
    type SeaBreezeSnapshot
} from "./sea-breeze.js";
import { serializeSeaBreezeArena } from "./serialize.js";

export interface SeaBreezeBuilderOptions extends SeaBreezeOptions {
    /**
     * @brief Optional pre-interned field key table.
     * @details Omit this for the normal builder path. The default table reserves
     * slot zero for readability, so first object field keys start at one.
     */
    readonly keyTable?: readonly string[] | undefined;
}

/**
 * @brief Optional object-field marker consumed by SeaBreezeBuilder.object().
 * @details The marker is allocated only while building arena shapes. It is not
 * reachable from emitted predicates.
 */
export interface SeaBreezeOptionalField {
    /**
     * @brief Internal marker used by object() when selecting field presence.
     */
    readonly seaBreezeOptional: true;

    /**
     * @brief Arena node accepted when the field is present.
     */
    readonly node: SeaBreezeNodeId;
}

/**
 * @brief Value accepted inside a SeaBreezeBuilder object shape.
 */
export type SeaBreezeShapeValue =
    | SeaBreezeNodeId
    | SeaBreezeOptionalField;

/**
 * @brief String-keyed object shape consumed by SeaBreezeBuilder.object().
 */
export type SeaBreezeShape = Readonly<Record<string, SeaBreezeShapeValue>>;

/**
 * @brief Schema-lowering options with builder-owned keyTable removed.
 */
export type SeaBreezeBuilderSchemaOptions =
    Omit<SeaBreezeSchemaLoweringOptions, "keyTable">;

/**
 * @brief Graph-lowering options with builder-owned keyTable removed.
 */
export type SeaBreezeBuilderGraphOptions =
    Omit<SeaBreezeGraphLoweringOptions, "keyTable">;

/**
 * @brief Direct-emission options with builder-owned keyTable removed.
 */
export type SeaBreezeBuilderEmitOptions =
    Omit<SeaBreezeEmitOptions, "keyTable">;

/**
 * @brief Runtime compile options for SeaBreezeBuilder.compile().
 */
export type SeaBreezeBuilderCompileOptions = SeaBreezeBuilderEmitOptions;

/**
 * @brief Predicate generated from one SeaBreeze builder root.
 */
export interface SeaBreezeCompiledPredicate {
    /**
     * @brief Generated predicate factory source.
     */
    readonly source: string;

    /**
     * @brief V8-visible predicate generated from the current arena root.
     */
    readonly is: BooleanPredicate;
}

/**
 * @brief Serializable builder state.
 */
export interface SeaBreezeBuilderSnapshot {
    /**
     * @brief Snapshot of the low-level SeaBreeze typed-array arena.
     */
    readonly arena: SeaBreezeSnapshot;

    /**
     * @brief Field-key table paired with the arena snapshot.
     */
    readonly keyTable: readonly string[];
}

/**
 * @brief Public builder facade over one SeaBreezeArena.
 * @details Methods return SeaBreezeNodeId values except where they explicitly
 * lower, emit, compile, or snapshot the arena state.
 */
export interface SeaBreezeBuilder {
    /**
     * @brief Low-level arena owned by this builder.
     */
    readonly arena: SeaBreezeArena;

    /**
     * @brief Copy of the builder-owned field key table.
     */
    readonly keyTable: readonly string[];

    /**
     * @brief Canonical never node.
     */
    never(): SeaBreezeNodeId;

    /**
     * @brief Canonical unknown node.
     */
    unknown(): SeaBreezeNodeId;

    /**
     * @brief Canonical null node.
     */
    null(): SeaBreezeNodeId;

    /**
     * @brief Canonical undefined node.
     */
    undefined(): SeaBreezeNodeId;

    /**
     * @brief Canonical boolean node.
     */
    boolean(): SeaBreezeNodeId;

    /**
     * @brief Canonical number node.
     */
    number(): SeaBreezeNodeId;

    /**
     * @brief Canonical string node.
     */
    string(): SeaBreezeNodeId;

    /**
     * @brief Canonical bigint node.
     */
    bigint(): SeaBreezeNodeId;

    /**
     * @brief Canonical symbol node.
     */
    symbol(): SeaBreezeNodeId;

    /**
     * @brief Allocate a Hindley-Milner variable node.
     * @param level Generalization level carried by the variable.
     * @returns Node id for the allocated variable.
     */
    variable(level?: number): SeaBreezeNodeId;

    /**
     * @brief Allocate an array node.
     * @param element Element type node id.
     * @returns Node id for the array type.
     */
    array(element: SeaBreezeNodeId): SeaBreezeNodeId;

    /**
     * @brief Allocate an object node from a string-keyed shape.
     * @param shape Object shape containing required nodes or optional markers.
     * @returns Node id for the object type.
     */
    object(shape: SeaBreezeShape): SeaBreezeNodeId;

    /**
     * @brief Mark an object field as optional.
     * @param node Field type node id.
     * @returns Optional marker accepted by object().
     */
    optional(node: SeaBreezeNodeId): SeaBreezeOptionalField;

    /**
     * @brief Join one or more nodes through SeaBreeze principal inference.
     * @param first First node id in the join set.
     * @param rest Remaining node ids joined from left to right.
     * @returns Representative node id for the joined validation type.
     */
    join(first: SeaBreezeNodeId, ...rest: readonly SeaBreezeNodeId[]): SeaBreezeNodeId;

    /**
     * @brief Join two or more nodes as a validation union.
     * @param first First node id.
     * @param second Second node id.
     * @param rest Remaining node ids joined from left to right.
     * @returns Representative node id for the joined validation type.
     */
    union(
        first: SeaBreezeNodeId,
        second: SeaBreezeNodeId,
        ...rest: readonly SeaBreezeNodeId[]
    ): SeaBreezeNodeId;

    /**
     * @brief Build a typed reader for the current arena.
     * @returns Reader facade without copying arena data.
     */
    reader(): SeaBreezeReader;

    /**
     * @brief Lower one root into a TypeSea schema.
     * @param root Root node id to lower.
     * @param options Lowering options supplied by the caller.
     * @returns Frozen schema produced from the current arena state.
     */
    schema(root: SeaBreezeNodeId, options?: SeaBreezeBuilderSchemaOptions): Schema;

    /**
     * @brief Lower one root into TypeSea predicate graph IR.
     * @param root Root node id to lower.
     * @param options Graph lowering options supplied by the caller.
     * @returns Predicate graph produced from the current arena state.
     */
    graph(root: SeaBreezeNodeId, options?: SeaBreezeBuilderGraphOptions): Graph;

    /**
     * @brief Emit a predicate source bundle directly from SeaBreeze nodes.
     * @param root Root node id to emit.
     * @param options Direct-emission options supplied by the caller.
     * @returns Source bundle and side tables consumed by PredicateFactory.
     */
    emit(
        root: SeaBreezeNodeId,
        options?: SeaBreezeBuilderEmitOptions
    ): CompiledSourceBundle;

    /**
     * @brief Compile one root into an executable boolean predicate.
     * @param root Root node id to compile.
     * @param options Direct-emission options supplied by the caller.
     * @returns Generated predicate and source text.
     */
    compile(
        root: SeaBreezeNodeId,
        options?: SeaBreezeBuilderCompileOptions
    ): SeaBreezeCompiledPredicate;

    /**
     * @brief Snapshot arena buffers plus the field key table.
     * @returns Serializable arena snapshot paired with the key table.
     */
    snapshot(): SeaBreezeBuilderSnapshot;
}

interface ShapeField {
    readonly key: number;
    readonly node: SeaBreezeNodeId;
    readonly presence: SeaBreezePresence;
}

/**
 * @brief Create an ergonomic SeaBreeze builder.
 * @param options Arena capacity and optional key table.
 * @returns Builder whose methods allocate numeric arena node ids.
 */
export function createSeaBreeze(options: SeaBreezeBuilderOptions): SeaBreezeBuilder {
    return new SeaBreezeBuilderCore(options);
}

/**
 * @brief Builder implementation kept private behind SeaBreezeBuilder.
 */
class SeaBreezeBuilderCore implements SeaBreezeBuilder {
    readonly #arena: SeaBreezeArena;
    readonly #keyTable: string[];
    readonly #keyIds: Map<string, number>;

    public constructor(options: SeaBreezeBuilderOptions) {
        this.#arena = new SeaBreezeArena(options);
        this.#keyTable = [];
        this.#keyIds = new Map<string, number>();
        this.#loadKeyTable(readInitialKeyTable(options.keyTable));
    }

    public get arena(): SeaBreezeArena {
        return this.#arena;
    }

    public get keyTable(): readonly string[] {
        return Object.freeze(this.#keyTable.slice());
    }

    public never(): SeaBreezeNodeId {
        return this.#arena.never;
    }

    public unknown(): SeaBreezeNodeId {
        return this.#arena.unknown;
    }

    public null(): SeaBreezeNodeId {
        return this.#arena.null;
    }

    public undefined(): SeaBreezeNodeId {
        return this.#arena.undefined;
    }

    public boolean(): SeaBreezeNodeId {
        return this.#arena.boolean;
    }

    public number(): SeaBreezeNodeId {
        return this.#arena.number;
    }

    public string(): SeaBreezeNodeId {
        return this.#arena.string;
    }

    public bigint(): SeaBreezeNodeId {
        return this.#arena.bigint;
    }

    public symbol(): SeaBreezeNodeId {
        return this.#arena.symbol;
    }

    public variable(level = 0): SeaBreezeNodeId {
        return this.#arena.allocVar(level);
    }

    public array(element: SeaBreezeNodeId): SeaBreezeNodeId {
        return this.#arena.allocArray(element);
    }

    public object(shape: SeaBreezeShape): SeaBreezeNodeId {
        const fields = this.#readShape(shape);
        fields.sort(compareShapeField);
        const object = this.#arena.allocObject();
        for (let index = 0; index < fields.length; index += 1) {
            const field = fields[index];
            if (field !== undefined) {
                this.#arena.appendField(
                    object,
                    field.key,
                    field.node,
                    field.presence
                );
            }
        }
        return object;
    }

    public optional(node: SeaBreezeNodeId): SeaBreezeOptionalField {
        const root = this.#arena.find(node);
        return Object.freeze({
            seaBreezeOptional: true,
            node: root
        });
    }

    public join(
        first: SeaBreezeNodeId,
        ...rest: readonly SeaBreezeNodeId[]
    ): SeaBreezeNodeId {
        let root = this.#arena.find(first);
        for (let index = 0; index < rest.length; index += 1) {
            const node = rest[index];
            if (node !== undefined) {
                root = this.#arena.principalJoin(root, node);
            }
        }
        return root;
    }

    public union(
        first: SeaBreezeNodeId,
        second: SeaBreezeNodeId,
        ...rest: readonly SeaBreezeNodeId[]
    ): SeaBreezeNodeId {
        return this.join(this.#arena.principalJoin(first, second), ...rest);
    }

    public reader(): SeaBreezeReader {
        return seaBreezeReader(this.#arena);
    }

    public schema(
        root: SeaBreezeNodeId,
        options: SeaBreezeBuilderSchemaOptions = {}
    ): Schema {
        return lowerSeaBreezeToSchema(this.#arena, root, {
            ...options,
            keyTable: this.#keyTable
        });
    }

    public graph(
        root: SeaBreezeNodeId,
        options: SeaBreezeBuilderGraphOptions = {}
    ): Graph {
        return lowerSeaBreezeToGraph(this.#arena, root, {
            ...options,
            keyTable: this.#keyTable
        });
    }

    public emit(
        root: SeaBreezeNodeId,
        options: SeaBreezeBuilderEmitOptions = {}
    ): CompiledSourceBundle {
        return emitSeaBreezeBooleanSourceBundle(
            this.reader(),
            root,
            {
                ...options,
                keyTable: this.#keyTable
            }
        );
    }

    public compile(
        root: SeaBreezeNodeId,
        options: SeaBreezeBuilderCompileOptions = {}
    ): SeaBreezeCompiledPredicate {
        const bundle = this.emit(root, options);
        return Object.freeze({
            source: bundle.source,
            is: makeSeaBreezePredicate(bundle)
        });
    }

    public snapshot(): SeaBreezeBuilderSnapshot {
        return Object.freeze({
            arena: serializeSeaBreezeArena(this.#arena),
            keyTable: Object.freeze(this.#keyTable.slice())
        });
    }

    #loadKeyTable(keys: readonly unknown[]): void {
        for (let index = 0; index < keys.length; index += 1) {
            const key = keys[index];
            if (typeof key !== "string") {
                throw new TypeError("SeaBreeze keyTable entries must be strings");
            }
            if (this.#keyIds.has(key)) {
                throw new TypeError(`SeaBreeze keyTable contains duplicate key ${key}`);
            }
            this.#keyIds.set(key, index);
            this.#keyTable.push(key);
        }
    }

    #readShape(shape: unknown): ShapeField[] {
        if (typeof shape !== "object" || shape === null || Array.isArray(shape)) {
            throw new TypeError("SeaBreeze object shape must be a plain object");
        }
        const keys = Reflect.ownKeys(shape);
        const fields = new Array<ShapeField>();
        for (let index = 0; index < keys.length; index += 1) {
            const key = keys[index];
            if (typeof key !== "string") {
                throw new TypeError("SeaBreeze object shape keys must be strings");
            }
            fields.push(this.#readShapeField(shape, key));
        }
        return fields;
    }

    #readShapeField(shape: object, key: string): ShapeField {
        const descriptor = Object.getOwnPropertyDescriptor(shape, key);
        if (descriptor === undefined || !hasOwn(descriptor, "value")) {
            throw new TypeError("SeaBreeze object shape fields must be data properties");
        }
        const value: unknown = descriptor.value;
        if (isOptionalField(value)) {
            return {
                key: this.#internKey(key),
                node: this.#arena.find(value.node),
                presence: SeaBreezePresence.Optional
            };
        }
        if (typeof value !== "number") {
            throw new TypeError("SeaBreeze object shape values must be node ids");
        }
        return {
            key: this.#internKey(key),
            node: this.#arena.find(value),
            presence: SeaBreezePresence.Required
        };
    }

    #internKey(key: string): number {
        const existing = this.#keyIds.get(key);
        if (existing !== undefined) {
            return existing;
        }
        const id = this.#keyTable.length;
        this.#keyIds.set(key, id);
        this.#keyTable.push(key);
        return id;
    }
}

/**
 * @brief Instantiate one SeaBreeze predicate bundle.
 */
function makeSeaBreezePredicate(bundle: CompiledSourceBundle): BooleanPredicate {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const factory = new Function(
        "l",
        "r",
        "k",
        "u",
        "d",
        "m",
        "mf",
        "sk",
        bundle.source
    ) as PredicateFactory;
    return factory(
        bundle.literals,
        bundle.regexps,
        bundle.keysets,
        bundle.strings,
        makeDynamicCheck(bundle.dynamicSchemas),
        makeDynamicIssueCheck(bundle.dynamicSchemas),
        makeDynamicFirstIssueCheck(bundle.dynamicSchemas),
        strictKeys
    );
}

/**
 * @brief Check whether a shape value marks an optional field.
 */
function isOptionalField(value: unknown): value is SeaBreezeOptionalField {
    const candidate = value as {
        readonly seaBreezeOptional?: unknown;
        readonly node?: unknown;
    };
    return typeof value === "object" &&
        value !== null &&
        hasOwn(value, "seaBreezeOptional") &&
        candidate.seaBreezeOptional === true &&
        typeof candidate.node === "number";
}

/**
 * @brief Compare two object shape fields by interned key id.
 */
function compareShapeField(left: ShapeField, right: ShapeField): number {
    return left.key - right.key;
}

/**
 * @brief Read the optional initial key table supplied to createSeaBreeze().
 */
function readInitialKeyTable(value: readonly string[] | undefined): readonly unknown[] {
    if (value === undefined) {
        return [""];
    }
    if (!Array.isArray(value)) {
        throw new TypeError("SeaBreeze keyTable must be an array");
    }
    return value as readonly unknown[];
}

/**
 * @brief Call Object.prototype.hasOwnProperty without borrowing the method.
 */
function hasOwn(value: object, key: PropertyKey): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}
