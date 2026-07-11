/**
 * @file function.ts
 * @brief Function boundary validation helpers.
 * @details Function contracts are call-site wrappers, not schema nodes. They
 * validate argument and return boundaries with existing guards/decoders while
 * keeping the core validation IR focused on data shapes.
 */

import {
    decoder,
    isDecoderValue,
    type BaseDecoder,
    type DecodeSource,
    type InferDecoder
} from "../decoder/index.js";
import { TypeSeaAssertionError } from "../guard/index.js";
import {
    freezeIssueArray,
    makeIssue,
    type Issue,
    type PathSegment
} from "../issue/index.js";
import { isRecord, readOwnDataProperty } from "../internal/index.js";

/** @brief Ordered decode sources applied to wrapped function arguments. */
export type FunctionInputShape = readonly DecodeSource[];

/** @brief Mutable argument tuple inferred from a function input shape. */
export type InferFunctionArgs<TInput extends FunctionInputShape> = {
    -readonly [TKey in keyof TInput]: InferDecoder<TInput[TKey]>;
};

/** @brief Validated return type, or the implementation fallback when omitted. */
export type FunctionOutput<
    TOutput extends DecodeSource | undefined,
    TFallback
> = TOutput extends DecodeSource ? InferDecoder<TOutput> : TFallback;

/** @brief Input and optional output sources captured by a validated call boundary. */
export interface FunctionContractOptions<
    TInput extends FunctionInputShape,
    TOutput extends DecodeSource | undefined = undefined
> {
    readonly input: TInput;
    readonly output?: TOutput;
}

type SyncImplementation<TInput extends FunctionInputShape, TReturn> =
    (...args: InferFunctionArgs<TInput>) => TReturn;

type AsyncImplementation<TInput extends FunctionInputShape, TReturn> =
    (...args: InferFunctionArgs<TInput>) => TReturn | Promise<TReturn>;

type UnknownImplementation = (...args: unknown[]) => unknown;

const emptyFunctionInput: readonly [] = Object.freeze([]);

/**
 * @brief Zod-style function boundary contract.
 * @details Construction pre-lowers every input and output source into a decoder
 * so repeated calls pay only validation cost, not schema admission cost.
 */
export class FunctionContract<
    TInput extends FunctionInputShape,
    TOutput extends DecodeSource | undefined = undefined
> {
    private readonly inputSources: TInput;
    private readonly outputSource: TOutput;
    private readonly inputDecoders: readonly BaseDecoder<unknown>[];
    private readonly outputDecoder: BaseDecoder<unknown> | undefined;

    public constructor(options: FunctionContractOptions<TInput, TOutput>) {
        const input = copyFunctionInput(readFunctionInput(options));
        const output = readFunctionOutput<TOutput>(options);
        this.inputSources = input;
        this.outputSource = output;
        this.inputDecoders = freezeInputDecoders(input);
        this.outputDecoder = output === undefined ? undefined : sourceToDecoder(output);
        Object.freeze(this);
    }

    /**
     * @brief Return the declared argument sources.
     * @returns Frozen tuple of argument guards or decoders.
     */
    public parameters(): TInput {
        return this.inputSources;
    }

    /**
     * @brief Return the declared output source.
     * @returns Output guard, decoder, or undefined when no output was declared.
     */
    public returnType(): TOutput {
        return this.outputSource;
    }

    /**
     * @brief Wrap a synchronous implementation with argument and output checks.
     * @param implementation Function called after arguments have been decoded.
     * @returns Function with the same public argument contract.
     * @throws TypeSeaAssertionError when input or output validation fails.
     */
    public implement<TReturn>(
        implementation: SyncImplementation<TInput, TReturn>
    ): SyncImplementation<TInput, FunctionOutput<TOutput, TReturn>> {
        if (typeof implementation !== "function") {
            throw new TypeError("function implementation must be a function");
        }
        const inputDecoders = this.inputDecoders;
        const outputDecoder = this.outputDecoder;
        const raw = implementation as UnknownImplementation;
        return (...args: InferFunctionArgs<TInput>): FunctionOutput<TOutput, TReturn> => {
            const decoded = decodeArguments(inputDecoders, args);
            const output = raw(...decoded);
            return decodeOutput<TOutput, TReturn>(outputDecoder, output);
        };
    }

    /**
     * @brief Wrap an async implementation with argument and output checks.
     * @param implementation Async-capable function called after argument decode.
     * @returns Async function resolving to validated output.
     * @throws TypeSeaAssertionError when input or output validation fails.
     */
    public implementAsync<TReturn>(
        implementation: AsyncImplementation<TInput, TReturn>
    ): SyncImplementation<TInput, Promise<FunctionOutput<TOutput, Awaited<TReturn>>>> {
        if (typeof implementation !== "function") {
            throw new TypeError("async function implementation must be a function");
        }
        const inputDecoders = this.inputDecoders;
        const outputDecoder = this.outputDecoder;
        const raw = implementation as UnknownImplementation;
        return async (
            ...args: InferFunctionArgs<TInput>
        ): Promise<FunctionOutput<TOutput, Awaited<TReturn>>> => {
            const decoded = decodeArguments(inputDecoders, args);
            const output = await raw(...decoded);
            return decodeOutput<TOutput, Awaited<TReturn>>(outputDecoder, output);
        };
    }
}

/**
 * @brief Chain builder for legacy Zod function syntax.
 * @details The builder delays construction until implement time, then delegates
 * to FunctionContract so argument and return validation stay centralized.
 */
export class FunctionContractBuilder<
    TInput extends FunctionInputShape = readonly [],
    TOutput extends DecodeSource | undefined = undefined
> {
    private readonly input: TInput;
    private readonly output: TOutput;

    public constructor(input: TInput, output: TOutput) {
        this.input = copyFunctionInput(input);
        this.output = output;
        Object.freeze(this);
    }

    /**
     * @brief Return the current argument source tuple.
     * @returns Frozen tuple of argument guards or decoders.
     */
    public parameters(): TInput {
        return this.input;
    }

    /**
     * @brief Return the current output source.
     * @returns Output guard, decoder, or undefined when no output is set.
     */
    public returnType(): TOutput {
        return this.output;
    }

    /**
     * @brief Replace the argument schema list.
     * @param input Ordered argument guards or decoders.
     * @returns Builder carrying the new argument tuple.
     */
    public args<const TNextInput extends FunctionInputShape>(
        ...input: TNextInput
    ): FunctionContractBuilder<TNextInput, TOutput> {
        return new FunctionContractBuilder(input, this.output);
    }

    /**
     * @brief Attach a return value schema.
     * @param output Guard or decoder used on the implementation result.
     * @returns Builder carrying the new return source.
     */
    public returns<TNextOutput extends DecodeSource>(
        output: TNextOutput
    ): FunctionContractBuilder<TInput, TNextOutput> {
        return new FunctionContractBuilder(this.input, output);
    }

    /**
     * @brief Wrap a synchronous implementation.
     * @param implementation Function called after argument decoding.
     * @returns Validating wrapper.
     */
    public implement<TReturn>(
        implementation: SyncImplementation<TInput, TReturn>
    ): SyncImplementation<TInput, FunctionOutput<TOutput, TReturn>> {
        return this.toContract().implement(implementation);
    }

    /**
     * @brief Wrap an async implementation.
     * @param implementation Async-capable function called after argument decoding.
     * @returns Async validating wrapper.
     */
    public implementAsync<TReturn>(
        implementation: AsyncImplementation<TInput, TReturn>
    ): SyncImplementation<TInput, Promise<FunctionOutput<TOutput, Awaited<TReturn>>>> {
        return this.toContract().implementAsync(implementation);
    }

    private toContract(): FunctionContract<TInput, TOutput> {
        return new FunctionContract<TInput, TOutput>({
            input: this.input,
            output: this.output
        });
    }
}

/**
 * @brief Start a fluent call boundary or construct one from explicit sources.
 * @details Input and output sources are normalized once during construction so
 * wrapped calls do not rebuild decoders.
 */
export function functionBuilder(): FunctionContractBuilder;

export function functionBuilder<const TInput extends FunctionInputShape>(
    options: FunctionContractOptions<TInput>
): FunctionContract<TInput>;

export function functionBuilder<
    const TInput extends FunctionInputShape,
    TOutput extends DecodeSource
>(
    options: FunctionContractOptions<TInput, TOutput>
): FunctionContract<TInput, TOutput>;

export function functionBuilder(
    options?: FunctionContractOptions<FunctionInputShape, DecodeSource | undefined>
): FunctionContractBuilder | FunctionContract<FunctionInputShape, DecodeSource | undefined> {
    if (options === undefined) {
        return new FunctionContractBuilder(emptyFunctionInput, undefined);
    }
    return new FunctionContract(options);
}

function readFunctionInput<TInput extends FunctionInputShape>(
    options: FunctionContractOptions<TInput, DecodeSource | undefined>
): TInput {
    if (!isRecord(options)) {
        throw new TypeError("function options must be an object");
    }
    const input = readOwnDataProperty(options, "input");
    if (!Array.isArray(input)) {
        throw new TypeError("function input must be an array of guards or decoders");
    }
    return input as unknown as TInput;
}

function readFunctionOutput<TOutput extends DecodeSource | undefined>(
    options: FunctionContractOptions<FunctionInputShape, TOutput>
): TOutput {
    return readOwnDataProperty(options, "output") as TOutput;
}

function copyFunctionInput<TInput extends FunctionInputShape>(input: TInput): TInput {
    const copied = new Array<DecodeSource>(input.length);
    for (let index = 0; index < input.length; index += 1) {
        const source = input[index];
        if (source === undefined) {
            throw new TypeError("function input entries must be guards or decoders");
        }
        copied[index] = source;
    }
    return Object.freeze(copied) as unknown as TInput;
}

function freezeInputDecoders(input: FunctionInputShape): readonly BaseDecoder<unknown>[] {
    const decoders = new Array<BaseDecoder<unknown>>(input.length);
    for (let index = 0; index < input.length; index += 1) {
        const source = input[index];
        if (source === undefined) {
            throw new TypeError("function input entries must be guards or decoders");
        }
        decoders[index] = sourceToDecoder(source);
    }
    return Object.freeze(decoders);
}

function decodeArguments(
    decoders: readonly BaseDecoder<unknown>[],
    args: readonly unknown[]
): unknown[] {
    if (args.length !== decoders.length) {
        throw new TypeSeaAssertionError(freezeIssueArray([
            makeIssue(
                [],
                "expected_tuple_length",
                String(decoders.length),
                String(args.length),
                undefined
            )
        ]));
    }
    const decoded = new Array<unknown>(decoders.length);
    for (let index = 0; index < decoders.length; index += 1) {
        const source = decoders[index];
        if (source === undefined) {
            throw new TypeError("function input decoder disappeared");
        }
        const result = source.decode(args[index]);
        if (!result.ok) {
            throw new TypeSeaAssertionError(prependIssues(index, result.error));
        }
        decoded[index] = result.value;
    }
    return decoded;
}

function decodeOutput<TOutput extends DecodeSource | undefined, TReturn>(
    output: BaseDecoder<unknown> | undefined,
    value: unknown
): FunctionOutput<TOutput, TReturn> {
    if (output === undefined) {
        return value as FunctionOutput<TOutput, TReturn>;
    }
    const result = output.decode(value);
    if (!result.ok) {
        throw new TypeSeaAssertionError(prependIssues("return", result.error));
    }
    return result.value as FunctionOutput<TOutput, TReturn>;
}

function sourceToDecoder(source: DecodeSource): BaseDecoder<unknown> {
    if (isDecoderValue(source)) {
        return decoder(source);
    }
    return decoder(source);
}

function prependIssues(
    segment: PathSegment,
    issues: readonly Issue[]
): readonly Issue[] {
    const copied = new Array<Issue>(issues.length);
    for (let index = 0; index < issues.length; index += 1) {
        const issue = issues[index];
        if (issue === undefined) {
            throw new TypeError("function issue disappeared");
        }
        copied[index] = makeIssue(
            prependPath(segment, issue.path),
            issue.code,
            issue.expected,
            issue.actual,
            issue.message
        );
    }
    return freezeIssueArray(copied);
}

function prependPath(segment: PathSegment, path: readonly PathSegment[]): readonly PathSegment[] {
    const copied = new Array<PathSegment>(path.length + 1);
    copied[0] = segment;
    for (let index = 0; index < path.length; index += 1) {
        const current = path[index];
        if (current === undefined) {
            throw new TypeError("function issue path disappeared");
        }
        copied[index + 1] = current;
    }
    return copied;
}
