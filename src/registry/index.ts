/**
 * @file registry/index.ts
 * @brief Weak schema metadata registries.
 * @details Registries associate immutable schema identities with caller-owned
 * metadata without wrapping schemas or changing validation behavior.
 */

import type { Guard, Presence } from "../guard/index.js";
import { readGuardSchema } from "../internal/index.js";
import type {
    Schema,
    SchemaMetadataInput
} from "../schema/index.js";

const RegistryStoreSymbol = Symbol("TypeSea.registry.store");
const RegistryRefsSymbol = Symbol("TypeSea.registry.refs");

/**
 * @brief Metadata accepted by the shared global registry.
 * @details Known fields mirror JSON Schema annotations. Additional fields are
 * allowed so applications can use one global registry for documentation tools.
 */
export interface GlobalRegistryMetadata extends SchemaMetadataInput {
    readonly id?: string;
    readonly [key: string]: unknown;
}

/**
 * @brief Schema metadata registry keyed by schema identity.
 * @details WeakMap storage prevents registered schemas from being kept alive by
 * documentation metadata after callers drop their guards.
 */
export class SchemaRegistry<TMetadata> {
    private declare readonly [RegistryStoreSymbol]: WeakMap<object, TMetadata>;
    private declare readonly [RegistryRefsSymbol]: WeakRef<object>[];

    /**
     * @brief Construct an empty registry.
     */
    public constructor() {
        defineReadonlyProperty(this, RegistryStoreSymbol, new WeakMap<object, TMetadata>());
        defineReadonlyProperty(this, RegistryRefsSymbol, new Array<WeakRef<object>>());
        Object.freeze(this);
    }

    /**
     * @brief Associate metadata with a guard's schema.
     * @param guard Guard whose immutable schema identity is used as the key.
     * @param metadata Caller-owned metadata payload.
     * @returns The same guard for fluent registration.
     */
    public add<TGuard extends Guard<unknown, Presence>>(
        guard: TGuard,
        metadata: TMetadata
    ): TGuard {
        const schema = readGuardSchema(guard, "registry guard");
        const store = readRegistryStore<TMetadata>(this, "registry receiver");
        assertRegistryIdAvailable(this, schema, metadata);
        if (!store.has(schema)) {
            readRegistryRefs(this, "registry receiver").push(new WeakRef<object>(schema));
        }
        store.set(schema, metadata);
        return guard;
    }

    /**
     * @brief Read metadata for a guard.
     * @param guard Guard whose schema identity is queried.
     * @returns Registered metadata, or undefined when absent.
     */
    public get(guard: Guard<unknown, Presence>): TMetadata | undefined {
        return readRegistryStore<TMetadata>(this, "registry receiver")
            .get(readGuardSchema(guard, "registry guard"));
    }

    /**
     * @brief Test whether a guard has registry metadata.
     * @param guard Guard whose schema identity is queried.
     * @returns True when metadata is registered.
     */
    public has(guard: Guard<unknown, Presence>): boolean {
        return readRegistryStore<TMetadata>(this, "registry receiver")
            .has(readGuardSchema(guard, "registry guard"));
    }

    /**
     * @brief Remove metadata for a guard.
     * @param guard Guard whose schema identity is removed.
     * @returns True when an entry existed and was deleted.
     */
    public remove(guard: Guard<unknown, Presence>): boolean {
        return readRegistryStore<TMetadata>(this, "registry receiver")
            .delete(readGuardSchema(guard, "registry guard"));
    }

    /**
     * @brief Remove every live registry entry.
     */
    public clear(): void {
        const store = readRegistryStore<TMetadata>(this, "registry receiver");
        const refs = readRegistryRefs(this, "registry receiver");
        for (let index = 0; index < refs.length; index += 1) {
            const schema = refs[index]?.deref();
            if (schema !== undefined) {
                store.delete(schema);
            }
        }
        refs.length = 0;
    }

    /**
     * @brief Snapshot live registry entries.
     * @returns Frozen entry list for schema documentation tooling.
     */
    public entries(): readonly SchemaRegistryEntry<TMetadata>[] {
        return snapshotRegistryEntries(this);
    }
}

/** @brief Schema and metadata stored under one registry identifier. */
export interface SchemaRegistryEntry<TMetadata> {
    readonly schema: Schema;
    readonly metadata: TMetadata;
}

/**
 * @brief Create a schema metadata registry.
 * @returns Empty registry with metadata type selected by the caller.
 */
export function registry<TMetadata>(): SchemaRegistry<TMetadata> {
    return new SchemaRegistry<TMetadata>();
}

/**
 * @brief Shared JSON Schema-compatible metadata registry.
 */
export const globalRegistry = registry<GlobalRegistryMetadata>();

/**
 * @brief Register metadata through a guard method implementation.
 * @param guard Guard receiver.
 * @param target Registry receiving metadata.
 * @param metadata Metadata payload.
 * @returns The same guard receiver.
 */
export function registerGuardMetadata<TMetadata, TGuard extends Guard<unknown, Presence>>(
    guard: TGuard,
    target: SchemaRegistry<TMetadata>,
    metadata: TMetadata
): TGuard {
    return target.add(guard, metadata);
}

/**
 * @brief Read metadata by raw schema identity for exporter internals.
 */
export function readRegistrySchemaMetadata<TMetadata>(
    target: SchemaRegistry<TMetadata>,
    schema: Schema
): TMetadata | undefined {
    return readRegistryStore<TMetadata>(target, "registry receiver").get(schema);
}

/**
 * @brief Test whether a value is a TypeSea schema registry.
 */
export function isSchemaRegistryValue(value: unknown): value is SchemaRegistry<unknown> {
    if (!isRecord(value)) {
        return false;
    }
    return readOwnDataProperty(value, RegistryStoreSymbol) instanceof WeakMap &&
        Array.isArray(readOwnDataProperty(value, RegistryRefsSymbol));
}

/**
 * @brief Read the private WeakMap from a registry receiver.
 */
function readRegistryStore<TMetadata>(
    value: unknown,
    label: string
): WeakMap<object, TMetadata> {
    if (!isRecord(value)) {
        throw new TypeError(`${label} must be a TypeSea registry`);
    }
    const store = readOwnDataProperty(value, RegistryStoreSymbol);
    if (!(store instanceof WeakMap)) {
        throw new TypeError(`${label} must be a TypeSea registry`);
    }
    return store as WeakMap<object, TMetadata>;
}

/**
 * @brief Read weak schema references from a registry receiver.
 */
function readRegistryRefs(
    value: unknown,
    label: string
): WeakRef<object>[] {
    if (!isRecord(value)) {
        throw new TypeError(`${label} must be a TypeSea registry`);
    }
    const refs = readOwnDataProperty(value, RegistryRefsSymbol);
    if (!Array.isArray(refs)) {
        throw new TypeError(`${label} must be a TypeSea registry`);
    }
    return refs as WeakRef<object>[];
}

/**
 * @brief Snapshot live entries without making dead weak references visible.
 */
function snapshotRegistryEntries<TMetadata>(
    registry: SchemaRegistry<TMetadata>
): readonly SchemaRegistryEntry<TMetadata>[] {
    const store = readRegistryStore<TMetadata>(registry, "registry receiver");
    const refs = readRegistryRefs(registry, "registry receiver");
    const output: SchemaRegistryEntry<TMetadata>[] = [];
    const seen = new WeakSet<object>();
    for (let index = 0; index < refs.length; index += 1) {
        const schema = refs[index]?.deref();
        if (schema === undefined || seen.has(schema) || !store.has(schema)) {
            continue;
        }
        seen.add(schema);
        output.push(Object.freeze({
            schema: schema as Schema,
            metadata: store.get(schema) as TMetadata
        }));
    }
    return Object.freeze(output);
}

/**
 * @brief Reject duplicate metadata ids across different schema identities.
 */
function assertRegistryIdAvailable<TMetadata>(
    registry: SchemaRegistry<TMetadata>,
    schema: object,
    metadata: TMetadata
): void {
    const id = readMetadataId(metadata);
    if (id === undefined) {
        return;
    }
    const entries = snapshotRegistryEntries(registry);
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined || entry.schema === schema) {
            continue;
        }
        if (readMetadataId(entry.metadata) === id) {
            throw new Error(`Registry metadata id ${id} is already registered`);
        }
    }
}

/**
 * @brief Read the special registry metadata id without invoking accessors.
 */
function readMetadataId(metadata: unknown): string | undefined {
    if (!isRecord(metadata)) {
        return undefined;
    }
    const id = readOwnDataProperty(metadata, "id");
    return typeof id === "string" ? id : undefined;
}

/**
 * @brief Define one immutable registry instance slot.
 */
function defineReadonlyProperty(
    target: object,
    key: PropertyKey,
    value: unknown
): void {
    Object.defineProperty(target, key, {
        configurable: false,
        enumerable: false,
        value,
        writable: false
    });
}

/**
 * @brief Read one own data slot without invoking accessors.
 */
function readOwnDataProperty(value: object, key: PropertyKey): unknown {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        return undefined;
    }
    return descriptor.value;
}

/**
 * @brief Check whether a value can carry own data slots.
 */
function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
