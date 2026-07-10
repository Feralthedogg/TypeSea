/**
 * @file warmup.ts
 * @brief Shared benchmark warmup helpers.
 * @details Bench suites call these helpers before Vitest starts measuring so
 * V8 can parse generated source, populate inline caches, and tier hot
 * predicates before recorded samples are taken.
 */

export type WarmupTask = () => unknown;

export type AsyncWarmupTask = () => Promise<unknown>;

export const BENCH_SYNC_WARMUP_ITERATIONS = 50_000;

export const BENCH_ASYNC_WARMUP_ITERATIONS = 32;

export const BENCH_WARMUP_HOOK_TIMEOUT_MS = 60_000;

let warmupSink: unknown;

/**
 * @brief Run synchronous benchmark tasks before measurement starts.
 * @param tasks Tasks that mirror benchmark callbacks.
 * @param iterations Number of full task-table passes.
 */
export function warmupSync(
    tasks: readonly WarmupTask[],
    iterations = BENCH_SYNC_WARMUP_ITERATIONS
): void {
    for (let round = 0; round < iterations; round += 1) {
        for (let index = 0; index < tasks.length; index += 1) {
            const task = tasks[index];
            if (task !== undefined) {
                warmupSink = task();
            }
        }
    }
}

/**
 * @brief Run asynchronous benchmark tasks before measurement starts.
 * @param tasks Tasks that mirror asynchronous benchmark callbacks.
 * @param iterations Number of full task-table passes.
 */
export async function warmupAsync(
    tasks: readonly AsyncWarmupTask[],
    iterations = BENCH_ASYNC_WARMUP_ITERATIONS
): Promise<void> {
    for (let round = 0; round < iterations; round += 1) {
        for (let index = 0; index < tasks.length; index += 1) {
            const task = tasks[index];
            if (task !== undefined) {
                warmupSink = await task();
            }
        }
    }
}

/**
 * @brief Return the last warmup value so engines cannot discard the loop.
 * @returns Last value produced by a warmup task.
 */
export function readWarmupSink(): unknown {
    return warmupSink;
}
