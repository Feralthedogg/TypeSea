/**
 * @file schedule.ts
 * @brief Verified modulo-schedule warm starts for transformation planning.
 */

import type {
    SeaCurrentDependence,
    SeaCurrentDependenceGraph,
    SeaCurrentOperation,
    SeaCurrentSchedule,
    SeaCurrentTargetModel
} from "./types.js";

/**
 * @brief Build a conservative schedule and reject every unverified result.
 * @details CDC is not used as a correctness oracle here. Directed dependence
 * inequalities and target resources are rechecked over the complete graph.
 * @pre `graph` has passed the planner's dependence admission check.
 */
export function buildSeaCurrentSchedule(
    graph: SeaCurrentDependenceGraph,
    target: SeaCurrentTargetModel,
    maxII: number
): SeaCurrentSchedule | undefined {
    if (!target.supportsScheduling) {
        return undefined;
    }
    const operations = operationIndex(graph.operations);
    const recurrenceMII = recurrenceLowerBound(graph, target, operations);
    const resourceMII = resourceLowerBound(graph.operations, target);
    const minimum = Math.max(1, recurrenceMII, resourceMII);
    const limit = Math.max(minimum, Math.floor(maxII));
    for (let initiationInterval = minimum; initiationInterval <= limit; initiationInterval += 1) {
        const starts = solveDifferenceConstraints(graph, initiationInterval, target, operations);
        if (starts === undefined) {
            continue;
        }
        const adjusted = placeResources(graph.operations, starts, initiationInterval, target);
        const schedule: SeaCurrentSchedule = Object.freeze({
            initiationInterval,
            recurrenceMII,
            resourceMII,
            starts: Object.freeze(adjusted)
        });
        if (verifySeaCurrentSchedule(graph, target, schedule)) {
            return schedule;
        }
    }
    return undefined;
}

/** @brief Verify all directed inequalities and modulo resource capacities. */
export function verifySeaCurrentSchedule(
    graph: SeaCurrentDependenceGraph,
    target: SeaCurrentTargetModel,
    schedule: SeaCurrentSchedule
): boolean {
    const operations = operationIndex(graph.operations);
    const initiationInterval = schedule.initiationInterval;
    if (!Number.isSafeInteger(initiationInterval) || initiationInterval < 1) {
        return false;
    }
    for (const dependence of graph.dependences) {
        const source = schedule.starts[dependence.source];
        const destination = schedule.starts[dependence.destination];
        if (source === undefined || destination === undefined) {
            return false;
        }
        const required = effectiveLatency(dependence, target, operations) -
            initiationInterval * dependence.distance;
        if (destination - source < required) {
            return false;
        }
    }
    const use = new Map<string, Float64Array>();
    for (const operation of graph.operations) {
        const start = schedule.starts[operation.id];
        if (start === undefined) {
            return false;
        }
        const slot = modulo(start, initiationInterval);
        for (const resource of target.resources(operation)) {
            const slots = use.get(resource.resource) ?? new Float64Array(initiationInterval);
            slots[slot] = (slots[slot] ?? 0) + resource.units;
            use.set(resource.resource, slots);
        }
    }
    for (const [resource, slots] of use) {
        const capacity = target.resourceCapacity(resource);
        for (const units of slots) {
            if (units > capacity) {
                return false;
            }
        }
    }
    const pressure = target.registerPressure(schedule);
    const capacity = target.registerCapacity();
    return Number.isFinite(pressure) && pressure >= 0 &&
        Number.isFinite(capacity) && capacity >= 0 && pressure <= capacity;
}

/** @brief Individual recurrence-edge lower bound used before consensus search. */
function recurrenceLowerBound(
    graph: SeaCurrentDependenceGraph,
    target: SeaCurrentTargetModel,
    operations: ReadonlyMap<string, SeaCurrentOperation>
): number {
    let lowerBound = 1;
    for (const dependence of graph.dependences) {
        if (dependence.distance > 0) {
            lowerBound = Math.max(
                lowerBound,
                Math.ceil(effectiveLatency(dependence, target, operations) / dependence.distance)
            );
        }
    }
    return lowerBound;
}

/** @brief Aggregate resource demand lower bound across one initiation interval. */
function resourceLowerBound(
    operations: readonly SeaCurrentOperation[],
    target: SeaCurrentTargetModel
): number {
    const demand = new Map<string, number>();
    for (const operation of operations) {
        for (const resource of target.resources(operation)) {
            demand.set(resource.resource, (demand.get(resource.resource) ?? 0) + resource.units);
        }
    }
    let lowerBound = 1;
    for (const [resource, units] of demand) {
        const capacity = target.resourceCapacity(resource);
        if (!Number.isFinite(capacity) || capacity <= 0) {
            return Number.MAX_SAFE_INTEGER;
        }
        lowerBound = Math.max(lowerBound, Math.ceil(units / capacity));
    }
    return lowerBound;
}

/**
 * @brief Longest-path relaxation over modulo dependence constraints.
 * @details An update after |O| rounds proves a positive constraint cycle for
 * the attempted II, so the candidate is rejected instead of partially applied.
 */
function solveDifferenceConstraints(
    graph: SeaCurrentDependenceGraph,
    initiationInterval: number,
    target: SeaCurrentTargetModel,
    operations: ReadonlyMap<string, SeaCurrentOperation>
): Record<string, number> | undefined {
    const starts: Record<string, number> = Object.create(null) as Record<string, number>;
    for (const operation of graph.operations) {
        starts[operation.id] = 0;
    }
    for (let round = 0; round < graph.operations.length; round += 1) {
        let changed = false;
        for (const dependence of graph.dependences) {
            const source = starts[dependence.source] ?? 0;
            const required = source + effectiveLatency(dependence, target, operations) -
                initiationInterval * dependence.distance;
            if ((starts[dependence.destination] ?? 0) < required) {
                starts[dependence.destination] = required;
                changed = true;
            }
        }
        if (!changed) {
            normalizeStarts(starts);
            return starts;
        }
    }
    return undefined;
}

/** @brief Index operation records once for target latency lookup. */
function operationIndex(
    operations: readonly SeaCurrentOperation[]
): ReadonlyMap<string, SeaCurrentOperation> {
    return new Map(operations.map((operation) => [operation.id, operation]));
}

/** @brief Combine conservative adapter latency with architecture latency. */
function effectiveLatency(
    dependence: SeaCurrentDependence,
    target: SeaCurrentTargetModel,
    operations: ReadonlyMap<string, SeaCurrentOperation>
): number {
    const source = operations.get(dependence.source);
    const targetLatency = source === undefined ? 0 : target.operationLatency(source);
    const normalizedTarget = Number.isFinite(targetLatency) && targetLatency >= 0
        ? targetLatency
        : 0;
    return Math.max(dependence.latency, normalizedTarget);
}

/** @brief Shift negative warm-start times without changing inequalities. */
function normalizeStarts(starts: Record<string, number>): void {
    let minimum = 0;
    for (const value of Object.values(starts)) {
        minimum = Math.min(minimum, value);
    }
    if (minimum === 0) {
        return;
    }
    for (const key of Object.keys(starts)) {
        starts[key] = (starts[key] ?? 0) - minimum;
    }
}

/**
 * @brief Greedily move operations to legal resource slots.
 * @details The complete verifier detects dependences invalidated by movement;
 * failed placement simply causes the planner to increase II.
 */
function placeResources(
    operations: readonly SeaCurrentOperation[],
    starts: Readonly<Record<string, number>>,
    initiationInterval: number,
    target: SeaCurrentTargetModel
): Record<string, number> {
    const output: Record<string, number> = Object.create(null) as Record<string, number>;
    const use = new Map<string, Float64Array>();
    const ordered = operations.slice().sort((left, right) =>
        (starts[left.id] ?? 0) - (starts[right.id] ?? 0) || left.id.localeCompare(right.id));
    for (const operation of ordered) {
        const base = starts[operation.id] ?? 0;
        let placed = base;
        for (let offset = 0; offset < initiationInterval; offset += 1) {
            const candidate = base + offset;
            if (resourceSlotAvailable(operation, candidate, initiationInterval, target, use)) {
                placed = candidate;
                reserveResources(operation, candidate, initiationInterval, target, use);
                break;
            }
        }
        output[operation.id] = placed;
    }
    return output;
}

/** @brief Test target capacities for one proposed modulo slot. */
function resourceSlotAvailable(
    operation: SeaCurrentOperation,
    start: number,
    initiationInterval: number,
    target: SeaCurrentTargetModel,
    use: ReadonlyMap<string, Float64Array>
): boolean {
    const slot = modulo(start, initiationInterval);
    for (const resource of target.resources(operation)) {
        const used = use.get(resource.resource)?.[slot] ?? 0;
        if (used + resource.units > target.resourceCapacity(resource.resource)) {
            return false;
        }
    }
    return true;
}

/** @brief Commit one operation's resource usage. */
function reserveResources(
    operation: SeaCurrentOperation,
    start: number,
    initiationInterval: number,
    target: SeaCurrentTargetModel,
    use: Map<string, Float64Array>
): void {
    const slot = modulo(start, initiationInterval);
    for (const resource of target.resources(operation)) {
        const slots = use.get(resource.resource) ?? new Float64Array(initiationInterval);
        slots[slot] = (slots[slot] ?? 0) + resource.units;
        use.set(resource.resource, slots);
    }
}

/** @brief Mathematical modulo for normalized resource slots. */
function modulo(value: number, divisor: number): number {
    const result = value % divisor;
    return result < 0 ? result + divisor : result;
}
