/**
 * @file sea-breeze.ts
 * @brief Arena-backed Hindley-Milner and best-common-type solver.
 * @details The solver models validation types as dense node ids. Hindley-Milner
 * style variables are represented with union-find parents, while incompatible
 * concrete nodes fall back to a best-common validation type instead of failing.
 */

export const SeaBreezeKind = {
    Never: 0,
    Unknown: 1,
    Null: 2,
    Undefined: 3,
    Boolean: 4,
    Number: 5,
    String: 6,
    BigInt: 7,
    Symbol: 8,
    Var: 9,
    Array: 10,
    Object: 11,
    Union: 12
} as const;

export type SeaBreezeKind = (typeof SeaBreezeKind)[keyof typeof SeaBreezeKind];

export const SeaBreezePresence = {
    Required: 1,
    Optional: 2
} as const;

export type SeaBreezePresence =
    (typeof SeaBreezePresence)[keyof typeof SeaBreezePresence];

export type SeaBreezeNodeId = number;

const CANONICAL_NODE_COUNT = 9;

export interface SeaBreezeOptions {
    /**
     * @brief Maximum number of type nodes in the caller-owned arena.
     */
    readonly maxNodes: number;

    /**
     * @brief Maximum number of object fields in the caller-owned arena.
     */
    readonly maxFields: number;
}

export interface SeaBreezeSnapshot {
    readonly nodeLength: number;
    readonly fieldLength: number;
    readonly parents: Int32Array;
    readonly ranks: Uint8Array;
    readonly kinds: Uint8Array;
    readonly left: Int32Array;
    readonly right: Int32Array;
    readonly fieldStarts: Int32Array;
    readonly fieldCounts: Int32Array;
    readonly fieldKeys: Int32Array;
    readonly fieldTypes: Int32Array;
    readonly fieldPresence: Uint8Array;
}

/**
 * @brief Fixed-capacity type solver.
 * @details Hot operations mutate typed arrays and return numeric node ids. They
 * do not allocate JS objects unless the caller asks JavaScript to inspect values
 * through ordinary reflection around the solver.
 */
export class SeaBreezeArena {
    readonly #parents: Int32Array;
    readonly #ranks: Uint8Array;
    readonly #kinds: Uint8Array;
    readonly #left: Int32Array;
    readonly #right: Int32Array;
    readonly #fieldStarts: Int32Array;
    readonly #fieldCounts: Int32Array;
    readonly #fieldKeys: Int32Array;
    readonly #fieldTypes: Int32Array;
    readonly #fieldPresence: Uint8Array;
    readonly #occursMarks: Uint32Array;
    readonly #occursStack: Int32Array;
    #occursEpoch = 0;
    #nodeLength = 0;
    #fieldLength = 0;
    #neverNode = -1;
    #unknownNode = -1;
    #nullNode = -1;
    #undefinedNode = -1;
    #booleanNode = -1;
    #numberNode = -1;
    #stringNode = -1;
    #bigintNode = -1;
    #symbolNode = -1;

    /**
     * @brief Construct one fixed-capacity solver arena.
     * @param options Node and field capacity supplied by the caller.
     * @post Primitive canonical nodes are allocated and stable until reset().
     */
    public constructor(options: SeaBreezeOptions) {
        const maxNodes = readPositiveCapacity(options.maxNodes, "maxNodes");
        const maxFields = readPositiveCapacity(options.maxFields, "maxFields");
        this.#parents = new Int32Array(maxNodes);
        this.#ranks = new Uint8Array(maxNodes);
        this.#kinds = new Uint8Array(maxNodes);
        this.#left = new Int32Array(maxNodes);
        this.#right = new Int32Array(maxNodes);
        this.#fieldStarts = new Int32Array(maxNodes);
        this.#fieldCounts = new Int32Array(maxNodes);
        this.#fieldKeys = new Int32Array(maxFields);
        this.#fieldTypes = new Int32Array(maxFields);
        this.#fieldPresence = new Uint8Array(maxFields);
        this.#occursMarks = new Uint32Array(maxNodes);
        this.#occursStack = new Int32Array(maxNodes);
        this.reset();
    }

    /**
     * @brief Remove all caller-created nodes while preserving arena buffers.
     */
    public reset(): void {
        this.#nodeLength = 0;
        this.#fieldLength = 0;
        this.#neverNode = this.#allocRaw(SeaBreezeKind.Never, -1, -1);
        this.#unknownNode = this.#allocRaw(SeaBreezeKind.Unknown, -1, -1);
        this.#nullNode = this.#allocRaw(SeaBreezeKind.Null, -1, -1);
        this.#undefinedNode = this.#allocRaw(SeaBreezeKind.Undefined, -1, -1);
        this.#booleanNode = this.#allocRaw(SeaBreezeKind.Boolean, -1, -1);
        this.#numberNode = this.#allocRaw(SeaBreezeKind.Number, -1, -1);
        this.#stringNode = this.#allocRaw(SeaBreezeKind.String, -1, -1);
        this.#bigintNode = this.#allocRaw(SeaBreezeKind.BigInt, -1, -1);
        this.#symbolNode = this.#allocRaw(SeaBreezeKind.Symbol, -1, -1);
    }

    /**
     * @brief Canonical `never` node.
     */
    public get never(): SeaBreezeNodeId {
        return this.#neverNode;
    }

    /**
     * @brief Canonical `unknown` node.
     */
    public get unknown(): SeaBreezeNodeId {
        return this.#unknownNode;
    }

    /**
     * @brief Canonical `null` node.
     */
    public get null(): SeaBreezeNodeId {
        return this.#nullNode;
    }

    /**
     * @brief Canonical `undefined` node.
     */
    public get undefined(): SeaBreezeNodeId {
        return this.#undefinedNode;
    }

    /**
     * @brief Canonical boolean node.
     */
    public get boolean(): SeaBreezeNodeId {
        return this.#booleanNode;
    }

    /**
     * @brief Canonical number node.
     */
    public get number(): SeaBreezeNodeId {
        return this.#numberNode;
    }

    /**
     * @brief Canonical string node.
     */
    public get string(): SeaBreezeNodeId {
        return this.#stringNode;
    }

    /**
     * @brief Canonical bigint node.
     */
    public get bigint(): SeaBreezeNodeId {
        return this.#bigintNode;
    }

    /**
     * @brief Canonical symbol node.
     */
    public get symbol(): SeaBreezeNodeId {
        return this.#symbolNode;
    }

    /**
     * @brief Number of allocated nodes in the arena.
     */
    public get nodeLength(): number {
        return this.#nodeLength;
    }

    /**
     * @brief Number of allocated field slots in the arena.
     */
    public get fieldLength(): number {
        return this.#fieldLength;
    }

    /**
     * @brief Copy the live arena tables into a serializable typed-array payload.
     * @returns Snapshot containing only initialized node and field slots.
     * @details Snapshotting is intentionally outside the hot inference path. It
     * is the cache/AOT bridge for caller-owned arenas.
     */
    public snapshot(): SeaBreezeSnapshot {
        return Object.freeze({
            nodeLength: this.#nodeLength,
            fieldLength: this.#fieldLength,
            parents: this.#parents.slice(0, this.#nodeLength),
            ranks: this.#ranks.slice(0, this.#nodeLength),
            kinds: this.#kinds.slice(0, this.#nodeLength),
            left: this.#left.slice(0, this.#nodeLength),
            right: this.#right.slice(0, this.#nodeLength),
            fieldStarts: this.#fieldStarts.slice(0, this.#nodeLength),
            fieldCounts: this.#fieldCounts.slice(0, this.#nodeLength),
            fieldKeys: this.#fieldKeys.slice(0, this.#fieldLength),
            fieldTypes: this.#fieldTypes.slice(0, this.#fieldLength),
            fieldPresence: this.#fieldPresence.slice(0, this.#fieldLength)
        });
    }

    /**
     * @brief Restore the arena from a previously captured snapshot.
     * @param snapshot Snapshot produced by snapshot().
     * @post Existing arena buffers are reused; live lengths match the snapshot.
     */
    public load(snapshot: SeaBreezeSnapshot): void {
        validateSnapshot(snapshot);
        if (snapshot.nodeLength > this.#parents.length) {
            throw new RangeError("SeaBreezeArena snapshot node capacity exceeds arena capacity");
        }
        if (snapshot.fieldLength > this.#fieldKeys.length) {
            throw new RangeError("SeaBreezeArena snapshot field capacity exceeds arena capacity");
        }
        this.#parents.fill(0);
        this.#ranks.fill(0);
        this.#kinds.fill(0);
        this.#left.fill(0);
        this.#right.fill(0);
        this.#fieldStarts.fill(0);
        this.#fieldCounts.fill(0);
        this.#fieldKeys.fill(0);
        this.#fieldTypes.fill(0);
        this.#fieldPresence.fill(0);
        this.#parents.set(snapshot.parents);
        this.#ranks.set(snapshot.ranks);
        this.#kinds.set(snapshot.kinds);
        this.#left.set(snapshot.left);
        this.#right.set(snapshot.right);
        this.#fieldStarts.set(snapshot.fieldStarts);
        this.#fieldCounts.set(snapshot.fieldCounts);
        this.#fieldKeys.set(snapshot.fieldKeys);
        this.#fieldTypes.set(snapshot.fieldTypes);
        this.#fieldPresence.set(snapshot.fieldPresence);
        this.#nodeLength = snapshot.nodeLength;
        this.#fieldLength = snapshot.fieldLength;
        this.#neverNode = 0;
        this.#unknownNode = 1;
        this.#nullNode = 2;
        this.#undefinedNode = 3;
        this.#booleanNode = 4;
        this.#numberNode = 5;
        this.#stringNode = 6;
        this.#bigintNode = 7;
        this.#symbolNode = 8;
    }

    /**
     * @brief Allocate an unbound Hindley-Milner type variable.
     * @param level Generalization level carried by the variable.
     * @returns Node id for the new variable.
     */
    public allocVar(level: number): SeaBreezeNodeId {
        if (!Number.isInteger(level) || level < 0) {
            throw new RangeError("variable level must be a non-negative integer");
        }
        return this.#allocRaw(SeaBreezeKind.Var, level, -1);
    }

    /**
     * @brief Allocate an array type node.
     * @param element Element type node id.
     * @returns Node id for the array type.
     */
    public allocArray(element: SeaBreezeNodeId): SeaBreezeNodeId {
        return this.#allocRaw(SeaBreezeKind.Array, this.find(element), -1);
    }

    /**
     * @brief Allocate an object type node.
     * @returns Empty object node ready for appendField().
     */
    public allocObject(): SeaBreezeNodeId {
        const node = this.#allocRaw(SeaBreezeKind.Object, -1, -1);
        this.#fieldStarts[node] = this.#fieldLength;
        return node;
    }

    /**
     * @brief Append one sorted field to an object node.
     * @param object Object node id returned by allocObject().
     * @param key Interned key id. Callers own string interning.
     * @param type Field type node id.
     * @param presence Required or optional field presence.
     */
    public appendField(
        object: SeaBreezeNodeId,
        key: number,
        type: SeaBreezeNodeId,
        presence: SeaBreezePresence
    ): void {
        const root = this.find(object);
        if (this.kindOf(root) !== SeaBreezeKind.Object) {
            throw new TypeError("appendField requires an object node");
        }
        if (!Number.isInteger(key) || key < 0) {
            throw new RangeError("field key must be a non-negative integer");
        }
        const rawPresence: number = presence;
        if (rawPresence !== SeaBreezePresence.Required &&
            rawPresence !== SeaBreezePresence.Optional) {
            throw new TypeError("field presence is invalid");
        }
        const start = this.#fieldStarts[root] ?? -1;
        const count = this.#fieldCounts[root] ?? 0;
        if (count > 0) {
            const previous = this.#fieldKeys[start + count - 1] ?? -1;
            if (key <= previous) {
                throw new RangeError("object fields must be appended in key order");
            }
        }
        if (this.#fieldLength >= this.#fieldKeys.length) {
            throw new RangeError("SeaBreezeArena field capacity exhausted");
        }
        const slot = start + count;
        if (slot < this.#fieldLength) {
            this.#shiftFieldSuffix(slot, root);
        }
        this.#fieldKeys[slot] = key;
        this.#fieldTypes[slot] = this.find(type);
        this.#fieldPresence[slot] = presence;
        this.#fieldLength += 1;
        this.#fieldCounts[root] = count + 1;
    }

    /**
     * @brief Open one slot inside the packed field table.
     * @param slot Insertion point owned by the object receiving a new field.
     * @param owner Object root whose start remains fixed.
     * @details Sequential construction stays on the direct append path. This
     * branch handles interleaved and recursive object construction without
     * allocating a temporary field vector.
     */
    #shiftFieldSuffix(slot: number, owner: SeaBreezeNodeId): void {
        for (let index = this.#fieldLength; index > slot; index -= 1) {
            this.#fieldKeys[index] = this.#fieldKeys[index - 1] ?? 0;
            this.#fieldTypes[index] = this.#fieldTypes[index - 1] ?? 0;
            this.#fieldPresence[index] = this.#fieldPresence[index - 1] ?? 0;
        }
        for (let node = 0; node < this.#nodeLength; node += 1) {
            if (node === owner || this.#kinds[node] !== SeaBreezeKind.Object) {
                continue;
            }
            const start = this.#fieldStarts[node] ?? 0;
            const count = this.#fieldCounts[node] ?? 0;
            if (start > slot || (start === slot && count > 0)) {
                this.#fieldStarts[node] = start + 1;
            }
        }
    }

    /**
     * @brief Find a node's current union-find representative.
     * @param node Candidate node id.
     * @returns Root node id after path compression.
     */
    public find(node: SeaBreezeNodeId): SeaBreezeNodeId {
        this.#checkNode(node);
        let root = node;
        while (this.#parents[root] !== root) {
            root = this.#parents[root] ?? root;
        }
        let cursor = node;
        while (this.#parents[cursor] !== root) {
            const next = this.#parents[cursor] ?? root;
            this.#parents[cursor] = root;
            cursor = next;
        }
        return root;
    }

    /**
     * @brief Read the representative kind for a node.
     */
    public kindOf(node: SeaBreezeNodeId): SeaBreezeKind {
        return this.#kinds[this.find(node)] as SeaBreezeKind;
    }

    /**
     * @brief Read an array node's element type.
     */
    public arrayElement(node: SeaBreezeNodeId): SeaBreezeNodeId {
        const root = this.find(node);
        if (this.kindOf(root) !== SeaBreezeKind.Array) {
            throw new TypeError("arrayElement requires an array node");
        }
        return this.find(this.#left[root] ?? -1);
    }

    /**
     * @brief Read an object's field count.
     */
    public fieldCount(node: SeaBreezeNodeId): number {
        const root = this.find(node);
        if (this.kindOf(root) !== SeaBreezeKind.Object) {
            throw new TypeError("fieldCount requires an object node");
        }
        return this.#fieldCounts[root] ?? 0;
    }

    /**
     * @brief Read a field key by dense field index.
     */
    public fieldKeyAt(node: SeaBreezeNodeId, index: number): number {
        return this.#fieldKeySlot(node, index);
    }

    /**
     * @brief Read a field type by dense field index.
     */
    public fieldTypeAt(node: SeaBreezeNodeId, index: number): SeaBreezeNodeId {
        const slot = this.#fieldSlot(node, index);
        return this.find(this.#fieldTypes[slot] ?? -1);
    }

    /**
     * @brief Read a field presence tag by dense field index.
     */
    public fieldPresenceAt(node: SeaBreezeNodeId, index: number): SeaBreezePresence {
        const slot = this.#fieldSlot(node, index);
        return this.#fieldPresence[slot] as SeaBreezePresence;
    }

    /**
     * @brief Read the left arm of a binary union node.
     */
    public unionLeft(node: SeaBreezeNodeId): SeaBreezeNodeId {
        const root = this.find(node);
        if (this.kindOf(root) !== SeaBreezeKind.Union) {
            throw new TypeError("unionLeft requires a union node");
        }
        return this.find(this.#left[root] ?? -1);
    }

    /**
     * @brief Read the right arm of a binary union node.
     */
    public unionRight(node: SeaBreezeNodeId): SeaBreezeNodeId {
        const root = this.find(node);
        if (this.kindOf(root) !== SeaBreezeKind.Union) {
            throw new TypeError("unionRight requires a union node");
        }
        return this.find(this.#right[root] ?? -1);
    }

    /**
     * @brief Compute the principal TypeSea common type for two nodes.
     * @details Variables bind like Hindley-Milner. Compatible constructors join
     * recursively. Incompatible concrete constructors produce a compact union
     * instead of failing like ordinary HM unification.
     */
    public principalJoin(
        left: SeaBreezeNodeId,
        right: SeaBreezeNodeId
    ): SeaBreezeNodeId {
        const leftRoot = this.find(left);
        const rightRoot = this.find(right);
        if (leftRoot === rightRoot) {
            return leftRoot;
        }

        const leftKind = this.#kinds[leftRoot] as SeaBreezeKind;
        const rightKind = this.#kinds[rightRoot] as SeaBreezeKind;

        if (leftKind === SeaBreezeKind.Never) {
            return rightRoot;
        }
        if (rightKind === SeaBreezeKind.Never) {
            return leftRoot;
        }
        if (leftKind === SeaBreezeKind.Unknown || rightKind === SeaBreezeKind.Unknown) {
            return this.#unknownNode;
        }
        if (leftKind === SeaBreezeKind.Var) {
            return this.#bindVar(leftRoot, rightRoot);
        }
        if (rightKind === SeaBreezeKind.Var) {
            return this.#bindVar(rightRoot, leftRoot);
        }
        if (leftKind === rightKind && isScalarKind(leftKind)) {
            return this.#linkSameKind(leftRoot, rightRoot);
        }
        if (leftKind === SeaBreezeKind.Array && rightKind === SeaBreezeKind.Array) {
            return this.allocArray(this.principalJoin(
                this.#left[leftRoot] ?? -1,
                this.#left[rightRoot] ?? -1
            ));
        }
        if (leftKind === SeaBreezeKind.Object && rightKind === SeaBreezeKind.Object) {
            return this.#joinObjects(leftRoot, rightRoot);
        }
        return this.#allocUnion(leftRoot, rightRoot);
    }

    /**
     * @brief Allocate a node in the fixed arena.
     */
    #allocRaw(kind: SeaBreezeKind, left: number, right: number): SeaBreezeNodeId {
        if (this.#nodeLength >= this.#parents.length) {
            throw new RangeError("SeaBreezeArena node capacity exhausted");
        }
        const id = this.#nodeLength;
        this.#parents[id] = id;
        this.#ranks[id] = 0;
        this.#kinds[id] = kind;
        this.#left[id] = left;
        this.#right[id] = right;
        this.#fieldStarts[id] = -1;
        this.#fieldCounts[id] = 0;
        this.#nodeLength += 1;
        return id;
    }

    /**
     * @brief Bind one HM variable to another representative.
     */
    #bindVar(variable: SeaBreezeNodeId, target: SeaBreezeNodeId): SeaBreezeNodeId {
        const targetRoot = this.find(target);
        if (this.#occurs(variable, targetRoot)) {
            return this.#unknownNode;
        }
        this.#parents[variable] = targetRoot;
        return targetRoot;
    }

    /**
     * @brief Link two scalar representatives with identical constructors.
     */
    #linkSameKind(left: SeaBreezeNodeId, right: SeaBreezeNodeId): SeaBreezeNodeId {
        const leftRank = this.#ranks[left] ?? 0;
        const rightRank = this.#ranks[right] ?? 0;
        if (leftRank < rightRank) {
            this.#parents[left] = right;
            return right;
        }
        this.#parents[right] = left;
        if (leftRank === rightRank) {
            this.#ranks[left] = leftRank + 1;
        }
        return left;
    }

    /**
     * @brief Join two sorted object field vectors.
     */
    #joinObjects(left: SeaBreezeNodeId, right: SeaBreezeNodeId): SeaBreezeNodeId {
        const output = this.allocObject();
        const leftStart = this.#fieldStarts[left] ?? -1;
        const rightStart = this.#fieldStarts[right] ?? -1;
        const leftCount = this.#fieldCounts[left] ?? 0;
        const rightCount = this.#fieldCounts[right] ?? 0;
        let leftIndex = 0;
        let rightIndex = 0;

        while (leftIndex < leftCount && rightIndex < rightCount) {
            const leftSlot = leftStart + leftIndex;
            const rightSlot = rightStart + rightIndex;
            const leftKey = this.#fieldKeys[leftSlot] ?? -1;
            const rightKey = this.#fieldKeys[rightSlot] ?? -1;

            if (leftKey === rightKey) {
                const joined = this.principalJoin(
                    this.#fieldTypes[leftSlot] ?? -1,
                    this.#fieldTypes[rightSlot] ?? -1
                );
                const presence = this.#fieldPresence[leftSlot] === SeaBreezePresence.Required &&
                    this.#fieldPresence[rightSlot] === SeaBreezePresence.Required
                    ? SeaBreezePresence.Required
                    : SeaBreezePresence.Optional;
                this.appendField(output, leftKey, joined, presence);
                leftIndex += 1;
                rightIndex += 1;
            } else if (leftKey < rightKey) {
                this.appendField(
                    output,
                    leftKey,
                    this.#fieldTypes[leftSlot] ?? -1,
                    SeaBreezePresence.Optional
                );
                leftIndex += 1;
            } else {
                this.appendField(
                    output,
                    rightKey,
                    this.#fieldTypes[rightSlot] ?? -1,
                    SeaBreezePresence.Optional
                );
                rightIndex += 1;
            }
        }

        while (leftIndex < leftCount) {
            const slot = leftStart + leftIndex;
            this.appendField(
                output,
                this.#fieldKeys[slot] ?? -1,
                this.#fieldTypes[slot] ?? -1,
                SeaBreezePresence.Optional
            );
            leftIndex += 1;
        }

        while (rightIndex < rightCount) {
            const slot = rightStart + rightIndex;
            this.appendField(
                output,
                this.#fieldKeys[slot] ?? -1,
                this.#fieldTypes[slot] ?? -1,
                SeaBreezePresence.Optional
            );
            rightIndex += 1;
        }

        return output;
    }

    /**
     * @brief Allocate a minimal binary union for incompatible constructors.
     */
    #allocUnion(left: SeaBreezeNodeId, right: SeaBreezeNodeId): SeaBreezeNodeId {
        const leftRoot = this.find(left);
        const rightRoot = this.find(right);
        if (leftRoot === rightRoot) {
            return leftRoot;
        }
        if (this.#kinds[leftRoot] === SeaBreezeKind.Never) {
            return rightRoot;
        }
        if (this.#kinds[rightRoot] === SeaBreezeKind.Never) {
            return leftRoot;
        }
        if (this.#kinds[leftRoot] === SeaBreezeKind.Unknown ||
            this.#kinds[rightRoot] === SeaBreezeKind.Unknown) {
            return this.#unknownNode;
        }
        const first = leftRoot < rightRoot ? leftRoot : rightRoot;
        const second = leftRoot < rightRoot ? rightRoot : leftRoot;
        return this.#allocRaw(SeaBreezeKind.Union, first, second);
    }

    /**
     * @brief Reject bindings that would place a variable inside its own type.
     * @details Epoch marks and a preallocated typed-array worklist avoid both
     * per-call allocation and call-stack growth while traversing cyclic arenas.
     */
    #occurs(variable: SeaBreezeNodeId, target: SeaBreezeNodeId): boolean {
        let epoch = (this.#occursEpoch + 1) >>> 0;
        if (epoch === 0) {
            this.#occursMarks.fill(0);
            epoch = 1;
        }
        this.#occursEpoch = epoch;
        const root = this.find(target);
        if (root === variable) {
            return true;
        }
        let stackLength = 1;
        this.#occursMarks[root] = epoch;
        this.#occursStack[0] = root;
        while (stackLength > 0) {
            stackLength -= 1;
            const current = this.#occursStack[stackLength] ?? -1;
            const kind = this.#kinds[current] as SeaBreezeKind;
            if (kind === SeaBreezeKind.Array) {
                const child = this.find(this.#left[current] ?? -1);
                if (child === variable) {
                    return true;
                }
                if (this.#occursMarks[child] !== epoch) {
                    this.#occursMarks[child] = epoch;
                    this.#occursStack[stackLength] = child;
                    stackLength += 1;
                }
                continue;
            }
            if (kind === SeaBreezeKind.Union) {
                const left = this.find(this.#left[current] ?? -1);
                const right = this.find(this.#right[current] ?? -1);
                if (left === variable || right === variable) {
                    return true;
                }
                if (this.#occursMarks[left] !== epoch) {
                    this.#occursMarks[left] = epoch;
                    this.#occursStack[stackLength] = left;
                    stackLength += 1;
                }
                if (this.#occursMarks[right] !== epoch) {
                    this.#occursMarks[right] = epoch;
                    this.#occursStack[stackLength] = right;
                    stackLength += 1;
                }
                continue;
            }
            if (kind !== SeaBreezeKind.Object) {
                continue;
            }
            const start = this.#fieldStarts[current] ?? -1;
            const count = this.#fieldCounts[current] ?? 0;
            for (let index = 0; index < count; index += 1) {
                const child = this.find(this.#fieldTypes[start + index] ?? -1);
                if (child === variable) {
                    return true;
                }
                if (this.#occursMarks[child] !== epoch) {
                    this.#occursMarks[child] = epoch;
                    this.#occursStack[stackLength] = child;
                    stackLength += 1;
                }
            }
        }
        return false;
    }

    /**
     * @brief Validate a caller-supplied node id.
     */
    #checkNode(node: SeaBreezeNodeId): void {
        if (!Number.isInteger(node) || node < 0 || node >= this.#nodeLength) {
            throw new RangeError("invalid SeaBreeze node id");
        }
    }

    /**
     * @brief Resolve one object field slot.
     */
    #fieldSlot(node: SeaBreezeNodeId, index: number): number {
        const root = this.find(node);
        if (this.kindOf(root) !== SeaBreezeKind.Object) {
            throw new TypeError("field access requires an object node");
        }
        const count = this.#fieldCounts[root] ?? 0;
        if (!Number.isInteger(index) || index < 0 || index >= count) {
            throw new RangeError("field index is out of range");
        }
        return (this.#fieldStarts[root] ?? 0) + index;
    }

    /**
     * @brief Resolve one object field key.
     */
    #fieldKeySlot(node: SeaBreezeNodeId, index: number): number {
        const slot = this.#fieldSlot(node, index);
        return this.#fieldKeys[slot] ?? -1;
    }
}

/**
 * @brief Test whether a constructor has no child nodes.
 */
function isScalarKind(kind: SeaBreezeKind): boolean {
    return kind === SeaBreezeKind.Null ||
        kind === SeaBreezeKind.Undefined ||
        kind === SeaBreezeKind.Boolean ||
        kind === SeaBreezeKind.Number ||
        kind === SeaBreezeKind.String ||
        kind === SeaBreezeKind.BigInt ||
        kind === SeaBreezeKind.Symbol;
}

/**
 * @brief Validate a fixed arena capacity.
 */
function readPositiveCapacity(value: number, label: string): number {
    if (!Number.isInteger(value) || value <= 0) {
        throw new RangeError(`${label} must be a positive integer`);
    }
    return value;
}

/**
 * @brief Validate a serialized arena payload before loading it.
 */
function validateSnapshot(snapshot: SeaBreezeSnapshot): void {
    const payload: unknown = snapshot;
    if (typeof payload !== "object" || payload === null) {
        throw new TypeError("SeaBreeze snapshot must be an object");
    }
    if (!Number.isInteger(snapshot.nodeLength) || snapshot.nodeLength < 9) {
        throw new RangeError("SeaBreeze snapshot nodeLength is invalid");
    }
    if (!Number.isInteger(snapshot.fieldLength) || snapshot.fieldLength < 0) {
        throw new RangeError("SeaBreeze snapshot fieldLength is invalid");
    }
    validateInt32NodeTable(snapshot.parents, snapshot.nodeLength, "parents");
    validateUint8NodeTable(snapshot.ranks, snapshot.nodeLength, "ranks");
    validateUint8NodeTable(snapshot.kinds, snapshot.nodeLength, "kinds");
    validateInt32NodeTable(snapshot.left, snapshot.nodeLength, "left");
    validateInt32NodeTable(snapshot.right, snapshot.nodeLength, "right");
    validateInt32NodeTable(snapshot.fieldStarts, snapshot.nodeLength, "fieldStarts");
    validateInt32NodeTable(snapshot.fieldCounts, snapshot.nodeLength, "fieldCounts");
    validateInt32FieldTable(snapshot.fieldKeys, snapshot.fieldLength, "fieldKeys");
    validateInt32FieldTable(snapshot.fieldTypes, snapshot.fieldLength, "fieldTypes");
    validateUint8FieldTable(snapshot.fieldPresence, snapshot.fieldLength, "fieldPresence");
    validateCanonicalSnapshotKinds(snapshot.kinds);
    validateSnapshotParents(snapshot.parents, snapshot.nodeLength);
    validateSnapshotNodeRows(snapshot);
    validateSnapshotStructuralAcyclic(snapshot);
}

/**
 * @brief Validate one Int32 node-indexed typed table.
 */
function validateInt32NodeTable(
    table: unknown,
    nodeLength: number,
    label: string
): void {
    if (!(table instanceof Int32Array) || table.length !== nodeLength) {
        throw new RangeError(`SeaBreeze snapshot ${label} length mismatch`);
    }
}

/**
 * @brief Validate one Uint8 node-indexed typed table.
 */
function validateUint8NodeTable(
    table: unknown,
    nodeLength: number,
    label: string
): void {
    if (!(table instanceof Uint8Array) || table.length !== nodeLength) {
        throw new RangeError(`SeaBreeze snapshot ${label} length mismatch`);
    }
}

/**
 * @brief Validate one Int32 field-indexed typed table.
 */
function validateInt32FieldTable(
    table: unknown,
    fieldLength: number,
    label: string
): void {
    if (!(table instanceof Int32Array) || table.length !== fieldLength) {
        throw new RangeError(`SeaBreeze snapshot ${label} length mismatch`);
    }
}

/**
 * @brief Validate one Uint8 field-indexed typed table.
 */
function validateUint8FieldTable(
    table: unknown,
    fieldLength: number,
    label: string
): void {
    if (!(table instanceof Uint8Array) || table.length !== fieldLength) {
        throw new RangeError(`SeaBreeze snapshot ${label} length mismatch`);
    }
}

/**
 * @brief Require canonical primitive nodes to occupy the stable prefix.
 */
function validateCanonicalSnapshotKinds(kinds: Uint8Array): void {
    if (kinds[0] !== SeaBreezeKind.Never ||
        kinds[1] !== SeaBreezeKind.Unknown ||
        kinds[2] !== SeaBreezeKind.Null ||
        kinds[3] !== SeaBreezeKind.Undefined ||
        kinds[4] !== SeaBreezeKind.Boolean ||
        kinds[5] !== SeaBreezeKind.Number ||
        kinds[6] !== SeaBreezeKind.String ||
        kinds[7] !== SeaBreezeKind.BigInt ||
        kinds[8] !== SeaBreezeKind.Symbol) {
        throw new TypeError("SeaBreeze snapshot canonical prefix is invalid");
    }
}

/**
 * @brief Validate union-find parent pointers terminate in-bounds.
 */
function validateSnapshotParents(parents: Int32Array, nodeLength: number): void {
    for (let node = 0; node < nodeLength; node += 1) {
        let cursor = node;
        for (let depth = 0; depth < nodeLength; depth += 1) {
            const parent = parents[cursor] ?? -1;
            if (!isValidNodeId(parent, nodeLength)) {
                throw new RangeError("SeaBreeze snapshot parent id is invalid");
            }
            if (parent === cursor) {
                break;
            }
            cursor = parent;
            if (depth + 1 === nodeLength) {
                throw new RangeError("SeaBreeze snapshot parent graph is cyclic");
            }
        }
    }
}

/**
 * @brief Validate node-specific child and field invariants.
 */
function validateSnapshotNodeRows(snapshot: SeaBreezeSnapshot): void {
    const fieldOwners = new Uint8Array(snapshot.fieldLength);
    for (let node = 0; node < snapshot.nodeLength; node += 1) {
        const kind = snapshot.kinds[node] as SeaBreezeKind;
        if (!isValidKind(kind)) {
            throw new TypeError("SeaBreeze snapshot node kind is invalid");
        }
        if (node < CANONICAL_NODE_COUNT && snapshot.parents[node] !== node) {
            throw new RangeError("SeaBreeze snapshot canonical parent is invalid");
        }
        validateSnapshotNodeByKind(snapshot, node, kind, fieldOwners);
    }
    for (let slot = 0; slot < fieldOwners.length; slot += 1) {
        if (fieldOwners[slot] === 0) {
            throw new RangeError("SeaBreeze snapshot field slot has no object owner");
        }
    }
}

/**
 * @brief Validate one node row according to its constructor.
 */
function validateSnapshotNodeByKind(
    snapshot: SeaBreezeSnapshot,
    node: number,
    kind: SeaBreezeKind,
    fieldOwners: Uint8Array
): void {
    if (isLeafKind(kind)) {
        validateNoNodeChildren(snapshot, node);
        return;
    }
    if (kind === SeaBreezeKind.Var) {
        if (!Number.isInteger(snapshot.left[node]) || (snapshot.left[node] ?? -1) < 0) {
            throw new RangeError("SeaBreeze snapshot variable level is invalid");
        }
        validateRightSentinel(snapshot, node);
        validateNoFieldSpan(snapshot, node);
        return;
    }
    if (kind === SeaBreezeKind.Array) {
        validateNodeReference(snapshot.left[node] ?? -1, snapshot.nodeLength, "array element");
        validateRightSentinel(snapshot, node);
        validateNoFieldSpan(snapshot, node);
        return;
    }
    if (kind === SeaBreezeKind.Union) {
        const left = snapshot.left[node] ?? -1;
        const right = snapshot.right[node] ?? -1;
        validateNodeReference(left, snapshot.nodeLength, "union left");
        validateNodeReference(right, snapshot.nodeLength, "union right");
        if (left === node || right === node || left === right) {
            throw new RangeError("SeaBreeze snapshot union edges are invalid");
        }
        validateNoFieldSpan(snapshot, node);
        return;
    }
    if (kind === SeaBreezeKind.Object) {
        validateLeftRightSentinel(snapshot, node);
        validateObjectFieldSpan(snapshot, node, fieldOwners);
        return;
    }
    throw new TypeError("SeaBreeze snapshot node kind is invalid");
}

/**
 * @brief Validate that structural edges form a finite DAG.
 */
function validateSnapshotStructuralAcyclic(snapshot: SeaBreezeSnapshot): void {
    const marks = new Uint8Array(snapshot.nodeLength);
    for (let node = 0; node < snapshot.nodeLength; node += 1) {
        visitSnapshotNode(snapshot, node, marks);
    }
}

/**
 * @brief DFS one representative node for structural cycle detection.
 */
function visitSnapshotNode(
    snapshot: SeaBreezeSnapshot,
    node: number,
    marks: Uint8Array
): void {
    const root = snapshotRepresentative(snapshot.parents, node);
    const mark = marks[root];
    if (mark === 1) {
        throw new RangeError("SeaBreeze snapshot structural graph is cyclic");
    }
    if (mark === 2) {
        return;
    }
    marks[root] = 1;
    const kind = snapshot.kinds[root] as SeaBreezeKind;
    if (kind === SeaBreezeKind.Array) {
        visitSnapshotNode(snapshot, snapshot.left[root] ?? -1, marks);
    } else if (kind === SeaBreezeKind.Union) {
        visitSnapshotNode(snapshot, snapshot.left[root] ?? -1, marks);
        visitSnapshotNode(snapshot, snapshot.right[root] ?? -1, marks);
    } else if (kind === SeaBreezeKind.Object) {
        const start = snapshot.fieldStarts[root] ?? -1;
        const count = snapshot.fieldCounts[root] ?? 0;
        for (let index = 0; index < count; index += 1) {
            visitSnapshotNode(snapshot, snapshot.fieldTypes[start + index] ?? -1, marks);
        }
    }
    marks[root] = 2;
}

/**
 * @brief Resolve a snapshot parent representative without mutating the table.
 */
function snapshotRepresentative(parents: Int32Array, node: number): number {
    let cursor = node;
    for (;;) {
        const parent = parents[cursor] ?? -1;
        if (parent === cursor) {
            return cursor;
        }
        cursor = parent;
    }
}

/**
 * @brief Validate an object node's field span and field rows.
 */
function validateObjectFieldSpan(
    snapshot: SeaBreezeSnapshot,
    node: number,
    fieldOwners: Uint8Array
): void {
    const start = snapshot.fieldStarts[node] ?? -1;
    const count = snapshot.fieldCounts[node] ?? -1;
    if (!Number.isInteger(start) ||
        !Number.isInteger(count) ||
        start < 0 ||
        count < 0 ||
        start + count > snapshot.fieldLength) {
        throw new RangeError("SeaBreeze snapshot object field span is invalid");
    }
    let previousKey = -1;
    for (let offset = 0; offset < count; offset += 1) {
        const slot = start + offset;
        if (fieldOwners[slot] !== 0) {
            throw new RangeError("SeaBreeze snapshot object field span overlaps");
        }
        fieldOwners[slot] = 1;
        const key = snapshot.fieldKeys[slot] ?? -1;
        const type = snapshot.fieldTypes[slot] ?? -1;
        const presence = snapshot.fieldPresence[slot] ?? -1;
        if (!Number.isInteger(key) || key < 0 || key <= previousKey) {
            throw new RangeError("SeaBreeze snapshot field key order is invalid");
        }
        validateNodeReference(type, snapshot.nodeLength, "field type");
        if (presence !== SeaBreezePresence.Required &&
            presence !== SeaBreezePresence.Optional) {
            throw new TypeError("SeaBreeze snapshot field presence is invalid");
        }
        previousKey = key;
    }
}

/**
 * @brief Validate an in-bounds node reference.
 */
function validateNodeReference(value: number, nodeLength: number, label: string): void {
    if (!isValidNodeId(value, nodeLength)) {
        throw new RangeError(`SeaBreeze snapshot ${label} reference is invalid`);
    }
}

/**
 * @brief Test for an in-bounds node id.
 */
function isValidNodeId(value: number, nodeLength: number): boolean {
    return Number.isInteger(value) && value >= 0 && value < nodeLength;
}

/**
 * @brief Test one valid serialized node kind.
 */
function isValidKind(kind: number): kind is SeaBreezeKind {
    return kind === SeaBreezeKind.Never ||
        kind === SeaBreezeKind.Unknown ||
        kind === SeaBreezeKind.Null ||
        kind === SeaBreezeKind.Undefined ||
        kind === SeaBreezeKind.Boolean ||
        kind === SeaBreezeKind.Number ||
        kind === SeaBreezeKind.String ||
        kind === SeaBreezeKind.BigInt ||
        kind === SeaBreezeKind.Symbol ||
        kind === SeaBreezeKind.Var ||
        kind === SeaBreezeKind.Array ||
        kind === SeaBreezeKind.Object ||
        kind === SeaBreezeKind.Union;
}

/**
 * @brief Test whether a kind stores no child edges or field span.
 */
function isLeafKind(kind: SeaBreezeKind): boolean {
    return kind === SeaBreezeKind.Never ||
        kind === SeaBreezeKind.Unknown ||
        isScalarKind(kind);
}

/**
 * @brief Validate that a leaf node has no children.
 */
function validateNoNodeChildren(snapshot: SeaBreezeSnapshot, node: number): void {
    validateLeftRightSentinel(snapshot, node);
    validateNoFieldSpan(snapshot, node);
}

/**
 * @brief Validate left and right child sentinels.
 */
function validateLeftRightSentinel(snapshot: SeaBreezeSnapshot, node: number): void {
    if (snapshot.left[node] !== -1 || snapshot.right[node] !== -1) {
        throw new RangeError("SeaBreeze snapshot unexpected child edge");
    }
}

/**
 * @brief Validate the right child sentinel.
 */
function validateRightSentinel(snapshot: SeaBreezeSnapshot, node: number): void {
    if (snapshot.right[node] !== -1) {
        throw new RangeError("SeaBreeze snapshot unexpected right edge");
    }
}

/**
 * @brief Validate that a non-object node does not own fields.
 */
function validateNoFieldSpan(snapshot: SeaBreezeSnapshot, node: number): void {
    if (snapshot.fieldStarts[node] !== -1 || snapshot.fieldCounts[node] !== 0) {
        throw new RangeError("SeaBreeze snapshot unexpected field span");
    }
}
