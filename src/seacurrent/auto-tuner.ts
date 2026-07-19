/**
 * @file auto-tuner.ts
 * @brief Target-specific online meta-optimization for planner cost parameters.
 */

import type {
    SeaCurrentBenefitFeatures,
    SeaCurrentCostModel,
    SeaCurrentPriorityFeatures
} from "./types.js";

/** @brief Serializable parameters learned independently for one target. */
export interface SeaCurrentTargetTuningState {
    readonly targetKey: string;
    readonly lambda: number;
    readonly gamma: number;
    readonly epsilon: number;
    readonly pipelineWeight: number;
    readonly uncertaintyWeight: number;
    readonly observations: number;
}

/** @brief Persisted auto-tuner state suitable for build cache storage. */
export interface SeaCurrentAutoTunerSnapshot {
    readonly version: 1;
    readonly targets: readonly SeaCurrentTargetTuningState[];
}

/** @brief Bounded online-learning controls. */
export interface SeaCurrentAutoTunerOptions {
    readonly learningRate?: number | undefined;
    readonly initialLambda?: number | undefined;
    readonly initialGamma?: number | undefined;
    readonly initialEpsilon?: number | undefined;
    readonly initialPipelineWeight?: number | undefined;
    readonly initialUncertaintyWeight?: number | undefined;
}

/** @brief Feedback from a measured build or benchmark. */
export type SeaCurrentTuningObservation =
    | {
        readonly kind: "priority";
        readonly targetKey: string;
        readonly features: SeaCurrentPriorityFeatures;
        readonly actualValue: number;
    }
    | {
        readonly kind: "benefit";
        readonly targetKey: string;
        readonly features: SeaCurrentBenefitFeatures;
        readonly actualValue: number;
    };

interface MutableTargetState {
    targetKey: string;
    lambda: number;
    gamma: number;
    epsilon: number;
    pipelineWeight: number;
    uncertaintyWeight: number;
    observations: number;
}

const DEFAULT_LEARNING_RATE = 0.05;
const MIN_POSITIVE = 1e-9;
const MAX_PARAMETER = 1e6;

/**
 * @brief Deterministic online learner for architecture-specific cost models.
 * @details Normalized gradients and hard parameter bounds prevent one noisy
 * profile from destabilizing later plans. No model update occurs on a validation
 * hot path; callers feed observations between builds or during explicit tuning.
 */
export class SeaCurrentAutoTuner {
    readonly #states = new Map<string, MutableTargetState>();
    readonly #learningRate: number;
    readonly #initial: Omit<MutableTargetState, "targetKey" | "observations">;

    public constructor(options: SeaCurrentAutoTunerOptions = {}) {
        this.#learningRate = bounded(
            options.learningRate ?? DEFAULT_LEARNING_RATE,
            MIN_POSITIVE,
            1
        );
        this.#initial = {
            lambda: nonNegative(options.initialLambda ?? 0.1),
            gamma: nonNegative(options.initialGamma ?? 1),
            epsilon: bounded(options.initialEpsilon ?? 1e-6, MIN_POSITIVE, MAX_PARAMETER),
            pipelineWeight: bounded(options.initialPipelineWeight ?? 1, MIN_POSITIVE, MAX_PARAMETER),
            uncertaintyWeight: bounded(options.initialUncertaintyWeight ?? 1, MIN_POSITIVE, MAX_PARAMETER)
        };
    }

    /** @brief Return a live cost-model view for one target architecture. */
    public model(targetKey: string): SeaCurrentCostModel {
        const state = this.state(targetKey);
        return Object.freeze({
            targetKey,
            priority: (features: SeaCurrentPriorityFeatures): number => priority(state, features),
            benefit: (features: SeaCurrentBenefitFeatures): number => benefit(state, features)
        });
    }

    /** @brief Apply one normalized stochastic-gradient observation. */
    public observe(observation: SeaCurrentTuningObservation): SeaCurrentTargetTuningState {
        const state = this.state(observation.targetKey);
        if (!Number.isFinite(observation.actualValue)) {
            return freezeState(state);
        }
        if (observation.kind === "priority") {
            updatePriority(state, observation.features, observation.actualValue, this.#learningRate);
        } else {
            updateBenefit(state, observation.features, observation.actualValue, this.#learningRate);
        }
        state.observations += 1;
        return freezeState(state);
    }

    /** @brief Export stable target states for an incremental build cache. */
    public snapshot(): SeaCurrentAutoTunerSnapshot {
        const targets = Array.from(this.#states.values())
            .sort((left, right) => left.targetKey.localeCompare(right.targetKey))
            .map(freezeState);
        return Object.freeze({ version: 1, targets: Object.freeze(targets) });
    }

    /** @brief Load validated states without sharing mutable caller storage. */
    public load(snapshot: SeaCurrentAutoTunerSnapshot): void {
        for (const source of snapshot.targets) {
            if (source.targetKey.length === 0) {
                continue;
            }
            const state = this.state(source.targetKey);
            state.lambda = bounded(source.lambda, 0, MAX_PARAMETER);
            state.gamma = bounded(source.gamma, 0, MAX_PARAMETER);
            state.epsilon = bounded(source.epsilon, MIN_POSITIVE, MAX_PARAMETER);
            state.pipelineWeight = bounded(
                source.pipelineWeight,
                MIN_POSITIVE,
                MAX_PARAMETER
            );
            state.uncertaintyWeight = bounded(
                source.uncertaintyWeight,
                MIN_POSITIVE,
                MAX_PARAMETER
            );
            state.observations = Math.max(0, Math.floor(source.observations));
        }
    }

    /** @brief Read one immutable target state for diagnostics. */
    public targetState(targetKey: string): SeaCurrentTargetTuningState {
        return freezeState(this.state(targetKey));
    }

    private state(targetKey: string): MutableTargetState {
        const cached = this.#states.get(targetKey);
        if (cached !== undefined) {
            return cached;
        }
        const state: MutableTargetState = {
            targetKey,
            ...this.#initial,
            observations: 0
        };
        this.#states.set(targetKey, state);
        return state;
    }
}

/** @brief Evaluate the adaptive region-selection equation. */
function priority(state: MutableTargetState, features: SeaCurrentPriorityFeatures): number {
    const frequency = nonNegative(features.frequency);
    const pipeline = nonNegative(features.pipelinePotential) * state.pipelineWeight;
    const uncertainty = nonNegative(features.profileUncertainty) * state.uncertaintyWeight;
    const denominator = nonNegative(features.instrumentationCost) +
        nonNegative(features.codeSizeCost) + state.epsilon;
    return finiteOrZero((frequency * pipeline * uncertainty) / denominator);
}

/** @brief Evaluate measured speedup minus learned size and semantic penalties. */
function benefit(state: MutableTargetState, features: SeaCurrentBenefitFeatures): number {
    const speedup = nonNegative(features.frequency) *
        (finiteOrZero(features.costBefore) - finiteOrZero(features.costAfter));
    return finiteOrZero(
        speedup -
        state.lambda * nonNegative(features.sizeIncrease) -
        state.gamma * nonNegative(features.semanticRisk)
    );
}

/** @brief Learn priority numerator weights and denominator epsilon. */
function updatePriority(
    state: MutableTargetState,
    features: SeaCurrentPriorityFeatures,
    actual: number,
    learningRate: number
): void {
    const predicted = priority(state, features);
    const error = actual - predicted;
    const frequency = nonNegative(features.frequency);
    const pipeline = nonNegative(features.pipelinePotential);
    const uncertainty = nonNegative(features.profileUncertainty);
    const denominator = nonNegative(features.instrumentationCost) +
        nonNegative(features.codeSizeCost) + state.epsilon;
    const pipelineGradient = frequency * pipeline * uncertainty *
        state.uncertaintyWeight / denominator;
    const uncertaintyGradient = frequency * pipeline * state.pipelineWeight *
        uncertainty / denominator;
    const epsilonGradient = -(frequency * pipeline * state.pipelineWeight *
        uncertainty * state.uncertaintyWeight) / (denominator * denominator);
    const normalization = 1 + pipelineGradient * pipelineGradient +
        uncertaintyGradient * uncertaintyGradient + epsilonGradient * epsilonGradient;
    const step = learningRate * error / normalization;
    state.pipelineWeight = bounded(
        state.pipelineWeight + step * pipelineGradient,
        MIN_POSITIVE,
        MAX_PARAMETER
    );
    state.uncertaintyWeight = bounded(
        state.uncertaintyWeight + step * uncertaintyGradient,
        MIN_POSITIVE,
        MAX_PARAMETER
    );
    state.epsilon = bounded(
        state.epsilon + step * epsilonGradient,
        MIN_POSITIVE,
        MAX_PARAMETER
    );
}

/** @brief Learn lambda and gamma from measured post-transform benefit. */
function updateBenefit(
    state: MutableTargetState,
    features: SeaCurrentBenefitFeatures,
    actual: number,
    learningRate: number
): void {
    const predicted = benefit(state, features);
    const error = actual - predicted;
    const sizeGradient = -nonNegative(features.sizeIncrease);
    const riskGradient = -nonNegative(features.semanticRisk);
    const normalization = 1 + sizeGradient * sizeGradient + riskGradient * riskGradient;
    const step = learningRate * error / normalization;
    state.lambda = bounded(state.lambda + step * sizeGradient, 0, MAX_PARAMETER);
    state.gamma = bounded(state.gamma + step * riskGradient, 0, MAX_PARAMETER);
}

/** @brief Freeze a detached diagnostic state. */
function freezeState(state: MutableTargetState): SeaCurrentTargetTuningState {
    return Object.freeze({
        targetKey: state.targetKey,
        lambda: state.lambda,
        gamma: state.gamma,
        epsilon: state.epsilon,
        pipelineWeight: state.pipelineWeight,
        uncertaintyWeight: state.uncertaintyWeight,
        observations: state.observations
    });
}

/** @brief Replace NaN and infinities at model boundaries. */
function finiteOrZero(value: number): number {
    return Number.isFinite(value) ? value : 0;
}

/** @brief Clamp an estimate to the non-negative finite domain. */
function nonNegative(value: number): number {
    return bounded(value, 0, MAX_PARAMETER);
}

/** @brief Deterministic parameter projection. */
function bounded(value: number, minimum: number, maximum: number): number {
    if (!Number.isFinite(value)) {
        return minimum;
    }
    return Math.min(maximum, Math.max(minimum, value));
}
