/**
 * @file finalize-intersection.ts
 * @brief Descriptor-safe intersection output merging.
 * @details Intersection arms finalize independently from the same input. This
 * module joins their object projections without invoking accessors and uses an
 * explicit worklist so deeply nested or cyclic outputs do not consume the call
 * stack.
 */

export interface IntersectionFinalizeState {
    readonly outputs: WeakMap<object, WeakMap<object, unknown>>;
    readonly readonlyMarks: WeakSet<object>;
    readonly readonlyOutputs: object[];
    readonly rejectConflicts: boolean;
    conflicted: boolean;
}

interface IntersectionMergeTask {
    readonly left: object;
    readonly right: object;
    readonly output: object;
    readonly array: boolean;
}

interface CachedIntersectionOutput {
    readonly found: boolean;
    readonly value: unknown;
}

/**
 * @brief Allocate cycle and readonly state for one finalization run.
 * @details Pair-keyed output caching preserves aliases and terminates cyclic
 * intersections without retaining inputs after finalization completes.
 */
export function makeIntersectionFinalizeState(
    rejectConflicts = false
): IntersectionFinalizeState {
    return {
        outputs: new WeakMap<object, WeakMap<object, unknown>>(),
        readonlyMarks: new WeakSet<object>(),
        readonlyOutputs: [],
        rejectConflicts,
        conflicted: false
    };
}

/**
 * @brief Queue an intersection output for shallow freezing.
 * @details Freezing during graph construction would make later descriptor
 * writes fail, so readonly outputs are committed only after the worklist drains.
 */
export function markIntersectionOutputReadonly(
    value: unknown,
    state: IntersectionFinalizeState
): void {
    if (!isObjectLike(value) || state.readonlyMarks.has(value)) {
        return;
    }
    state.readonlyMarks.add(value);
    state.readonlyOutputs.push(value);
}

/** @brief Freeze readonly outputs after every cyclic edge has been populated. */
export function freezeIntersectionReadonlyOutputs(state: IntersectionFinalizeState): void {
    for (let index = 0; index < state.readonlyOutputs.length; index += 1) {
        const output = state.readonlyOutputs[index];
        if (output !== undefined) {
            Object.freeze(output);
        }
    }
}

/**
 * @brief Merge independently finalized intersection outputs.
 * @details Ordinary records and arrays are joined by own descriptors. Runtime
 * objects with internal slots remain atomic so Date, Map, Set, and class
 * instances are never replaced by objects that only imitate their prototype.
 */
export function mergeIntersectionOutputs(
    left: unknown,
    right: unknown,
    state: IntersectionFinalizeState
): unknown {
    const tasks: IntersectionMergeTask[] = [];
    const output = selectIntersectionOutput(left, right, state, tasks);
    while (tasks.length > 0 && !state.conflicted) {
        const task = tasks.pop();
        if (task !== undefined) {
            fillIntersectionOutput(task, state, tasks);
        }
    }
    return output;
}

function selectIntersectionOutput(
    left: unknown,
    right: unknown,
    state: IntersectionFinalizeState,
    tasks: IntersectionMergeTask[]
): unknown {
    if (Object.is(left, right)) {
        return isObjectLike(left)
            ? propagateReadonly(left, left, left, state)
            : left;
    }
    if (!isObjectLike(left) || !isObjectLike(right)) {
        markIntersectionConflict(state);
        return right;
    }
    const cached = readIntersectionOutput(left, right, state);
    if (cached.found) {
        return propagateReadonly(cached.value, left, right, state);
    }
    const leftArray = Array.isArray(left);
    const rightArray = Array.isArray(right);
    if (leftArray && rightArray) {
        if (left.length !== right.length) {
            markIntersectionConflict(state);
            return right;
        }
        return propagateReadonly(
            allocateIntersectionOutput(left, right, true, state, tasks),
            left,
            right,
            state
        );
    }
    if (leftArray || rightArray) {
        markIntersectionConflict(state);
        return propagateReadonly(leftArray ? left : right, left, right, state);
    }
    const leftRecord = isOrdinaryRecord(left);
    const rightRecord = isOrdinaryRecord(right);
    if (leftRecord && rightRecord) {
        return propagateReadonly(
            allocateIntersectionOutput(left, right, false, state, tasks),
            left,
            right,
            state
        );
    }
    if (leftRecord || rightRecord) {
        markIntersectionConflict(state);
        return propagateReadonly(leftRecord ? right : left, left, right, state);
    }
    markIntersectionConflict(state);
    return propagateReadonly(right, left, right, state);
}

/**
 * @brief Record incompatible normalized outputs when strict joining is enabled.
 * @details Guard intersections may retain historical right-biased merging, while
 * decoder intersections set `rejectConflicts` because accepting two different
 * decoded values would make the output contract ambiguous.
 */
function markIntersectionConflict(state: IntersectionFinalizeState): void {
    if (state.rejectConflicts) {
        state.conflicted = true;
    }
}

function propagateReadonly(
    output: unknown,
    left: object,
    right: object,
    state: IntersectionFinalizeState
): unknown {
    if (state.readonlyMarks.has(left) ||
        state.readonlyMarks.has(right) ||
        Object.isFrozen(left) ||
        Object.isFrozen(right)) {
        markIntersectionOutputReadonly(output, state);
    }
    return output;
}

function allocateIntersectionOutput(
    left: object,
    right: object,
    array: boolean,
    state: IntersectionFinalizeState,
    tasks: IntersectionMergeTask[]
): object {
    const output = array
        ? new Array<unknown>(Math.max(
            (left as readonly unknown[]).length,
            (right as readonly unknown[]).length
        ))
        : Object.create(selectPrototype(left, right)) as object;
    writeIntersectionOutput(left, right, output, state);
    tasks.push({ left, right, output, array });
    return output;
}

function fillIntersectionOutput(
    task: IntersectionMergeTask,
    state: IntersectionFinalizeState,
    tasks: IntersectionMergeTask[]
): void {
    const keys = collectKeys(task.left, task.right, task.array);
    for (let index = 0; index < keys.length && !state.conflicted; index += 1) {
        const key = keys[index];
        if (key === undefined) {
            continue;
        }
        const descriptor = mergeDescriptor(
            Object.getOwnPropertyDescriptor(task.left, key),
            Object.getOwnPropertyDescriptor(task.right, key),
            state,
            tasks
        );
        if (descriptor !== undefined) {
            Object.defineProperty(task.output, key, descriptor);
        }
    }
}

function mergeDescriptor(
    left: PropertyDescriptor | undefined,
    right: PropertyDescriptor | undefined,
    state: IntersectionFinalizeState,
    tasks: IntersectionMergeTask[]
): PropertyDescriptor | undefined {
    if (left === undefined) {
        return right;
    }
    if (right === undefined) {
        return left;
    }
    const leftData = Object.prototype.hasOwnProperty.call(left, "value");
    const rightData = Object.prototype.hasOwnProperty.call(right, "value");
    if (leftData && rightData) {
        return {
            ...right,
            value: selectIntersectionOutput(left.value, right.value, state, tasks)
        };
    }
    if (leftData || rightData) {
        markIntersectionConflict(state);
        return right;
    }
    if (left.get !== right.get ||
        left.set !== right.set ||
        left.enumerable !== right.enumerable ||
        left.configurable !== right.configurable) {
        markIntersectionConflict(state);
    }
    return right;
}

function collectKeys(left: object, right: object, array: boolean): PropertyKey[] {
    const seen = new Set<PropertyKey>();
    const output: PropertyKey[] = [];
    appendKeys(Reflect.ownKeys(left), array, seen, output);
    appendKeys(Reflect.ownKeys(right), array, seen, output);
    return output;
}

function appendKeys(
    keys: readonly PropertyKey[],
    array: boolean,
    seen: Set<PropertyKey>,
    output: PropertyKey[]
): void {
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined || (array && key === "length") || seen.has(key)) {
            continue;
        }
        seen.add(key);
        output.push(key);
    }
}

function isObjectLike(value: unknown): value is object {
    return (typeof value === "object" && value !== null) || typeof value === "function";
}

function isOrdinaryRecord(value: object): boolean {
    if (Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value) as object | null;
    return prototype === Object.prototype || prototype === null;
}

function selectPrototype(left: object, right: object): object | null {
    const leftPrototype = Object.getPrototypeOf(left) as object | null;
    const rightPrototype = Object.getPrototypeOf(right) as object | null;
    return leftPrototype === Object.prototype || leftPrototype === null
        ? rightPrototype
        : leftPrototype;
}

function readIntersectionOutput(
    left: object,
    right: object,
    state: IntersectionFinalizeState
): CachedIntersectionOutput {
    const outputs = state.outputs.get(left);
    if (outputs?.has(right) !== true) {
        return { found: false, value: undefined };
    }
    return { found: true, value: outputs.get(right) };
}

function writeIntersectionOutput(
    left: object,
    right: object,
    output: object,
    state: IntersectionFinalizeState
): void {
    let outputs = state.outputs.get(left);
    if (outputs === undefined) {
        outputs = new WeakMap<object, unknown>();
        state.outputs.set(left, outputs);
    }
    outputs.set(right, output);
}
