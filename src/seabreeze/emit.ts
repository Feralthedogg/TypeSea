/**
 * @file emit.ts
 * @brief Direct SeaBreeze reader-to-source predicate emitter.
 * @details This bridge consumes SeaBreeze typed-array reader data and emits a
 * predicate-only TypeSea source bundle without first materializing Schema,
 * Graph, GraphBuilder, or GraphNode objects.
 */

import { ObjectModeTag } from "../kind/index.js";
import {
    createEmitContext,
    stringRef
} from "../compile/context.js";
import { formatDebugSource } from "../compile/debug-source.js";
import { emitGraphFunctions } from "../compile/graph-predicate.js";
import { safeFunctionName } from "../compile/names.js";
import { emitHelperPrelude } from "../compile/source.js";
import type {
    CompiledSourceBundle,
    CompileMode,
    EmitContext,
    FunctionSource
} from "../compile/types.js";
import {
    SeaBreezeKind,
    SeaBreezePresence,
    type SeaBreezeNodeId
} from "./sea-breeze.js";
import type {
    SeaBreezeCyclePolicy,
    SeaBreezeSchemaObjectMode,
    SeaBreezeUnboundVarPolicy,
    SeaBreezeUnionMode
} from "./lower-schema.js";
import type { SeaBreezeReader } from "./reader.js";

export interface SeaBreezeEmitOptions {
    /**
     * @brief Intern table mapping arena field key ids to object property names.
     */
    readonly keyTable: readonly string[];

    /**
     * @brief Object unknown-key policy for emitted object predicates.
     * @default "strict"
     */
    readonly objectMode?: SeaBreezeSchemaObjectMode | undefined;

    /**
     * @brief Policy for a still-unbound HM variable.
     * @default "unknown"
     */
    readonly unboundVar?: SeaBreezeUnboundVarPolicy | undefined;

    /**
     * @brief Policy for recursive arena shapes encountered during emission.
     * @default "error"
     */
    readonly cycle?: SeaBreezeCyclePolicy | undefined;

    /**
     * @brief Preserve binary union shape or flatten nested union arms.
     * @default "flatten"
     */
    readonly unionMode?: SeaBreezeUnionMode | undefined;

    /**
     * @brief Property-access safety tier used by emitted code.
     * @default "safe"
     */
    readonly mode?: CompileMode | undefined;

    /**
     * @brief Requested predicate function name.
     * @default "seaBreezePredicate"
     */
    readonly name?: string | undefined;

    /**
     * @brief Emit formatted debug source instead of compact source.
     * @default false
     */
    readonly debugSource?: boolean | undefined;
}

interface DirectEmitContext {
    readonly reader: SeaBreezeReader;
    readonly options: SeaBreezeEmitOptions;
    readonly emit: EmitContext;
    readonly keyTable: readonly string[];
    readonly objectMode: ObjectModeTag;
    readonly unboundVar: SeaBreezeUnboundVarPolicy;
    readonly cycle: SeaBreezeCyclePolicy;
    readonly unionMode: SeaBreezeUnionMode;
    readonly functionNames: (string | undefined)[];
    readonly states: Uint8Array;
}

interface FunctionBodyState {
    readonly chunks: string[];
    temp: number;
}

const ROOT_FUNCTION_NAME = "seaBreezePredicate";

/**
 * @brief Emit a predicate-only source bundle directly from a SeaBreeze reader.
 * @param reader Typed-array reader facade over a SeaBreeze arena.
 * @param root Root type node id to emit.
 * @param options Key table, lowering policy, and source options.
 * @returns Generated source plus side tables consumed by PredicateFactory.
 */
export function emitSeaBreezeBooleanSourceBundle(
    reader: SeaBreezeReader,
    root: SeaBreezeNodeId,
    options: SeaBreezeEmitOptions
): CompiledSourceBundle {
    const mode = options.mode ?? "safe";
    const context = makeDirectEmitContext(reader, options, mode);
    const functionName = safeFunctionName(options.name ?? ROOT_FUNCTION_NAME);
    const rootFunction = emitNodeFunction(
        context,
        root,
        canUseDirectRootFunctionName(functionName) ? functionName : undefined
    );
    const functionSource = emitGraphFunctions(context.emit);
    const runtimeBundle = `return ${rootFunction};`;
    const body = [
        functionSource,
        runtimeBundle
    ].join("");
    const helperPrelude = emitHelperPrelude(body, true);
    const compactSource = [
        "\"use strict\";",
        helperPrelude,
        body
    ].join("");
    const source = options.debugSource === true
        ? formatDebugSource(
            [
                "\"use strict\";",
                "/* TypeSea helper prelude: shared runtime helpers and side-table readers. */",
                helperPrelude,
                "/* TypeSea boolean predicates emitted directly from SeaBreeze reader data. */",
                functionSource,
                "/* TypeSea predicate-only runtime bundle. */",
                runtimeBundle
            ].join(""),
            functionName,
            mode
        )
        : compactSource;

    return {
        source,
        literals: context.emit.literals,
        regexps: context.emit.regexps,
        keysets: context.emit.keysets,
        strings: context.emit.strings,
        dynamicSchemas: context.emit.schemas
    };
}

/**
 * @brief Build one direct-emission context.
 */
function makeDirectEmitContext(
    reader: SeaBreezeReader,
    options: SeaBreezeEmitOptions,
    mode: CompileMode
): DirectEmitContext {
    return {
        reader,
        options,
        emit: createEmitContext(mode),
        keyTable: readKeyTable(options.keyTable),
        objectMode: readObjectMode(options.objectMode),
        unboundVar: options.unboundVar ?? "unknown",
        cycle: options.cycle ?? "error",
        unionMode: options.unionMode ?? "flatten",
        functionNames: new Array<string | undefined>(reader.nodeLength),
        states: new Uint8Array(reader.nodeLength)
    };
}

/**
 * @brief Emit or reuse one node predicate function.
 */
function emitNodeFunction(
    context: DirectEmitContext,
    node: SeaBreezeNodeId,
    preferredName?: string
): string {
    const root = context.reader.find(node);
    const cached = context.functionNames[root];
    if (cached !== undefined) {
        if (context.states[root] === 1 && context.cycle === "error") {
            throw new TypeError("cannot emit recursive SeaBreeze shape without cycle support");
        }
        return cached;
    }

    const name = preferredName ?? nextFunctionName(context.emit);
    const source: FunctionSource = {
        name,
        body: ""
    };
    context.functionNames[root] = name;
    context.states[root] = 1;
    context.emit.functions.push(source);
    source.body = emitNodeFunctionBody(context, root);
    context.states[root] = 2;
    return name;
}

/**
 * @brief Emit one predicate function body.
 */
function emitNodeFunctionBody(
    context: DirectEmitContext,
    root: SeaBreezeNodeId
): string {
    const state: FunctionBodyState = {
        chunks: [],
        temp: 0
    };
    emitNodeCheck(context, state, root, "v");
    state.chunks.push("return true;");
    return state.chunks.join("");
}

/**
 * @brief Emit fast-fail checks for one node against an expression.
 */
function emitNodeCheck(
    context: DirectEmitContext,
    state: FunctionBodyState,
    node: SeaBreezeNodeId,
    value: string
): void {
    const root = context.reader.find(node);
    switch (context.reader.kindOf(root)) {
        case SeaBreezeKind.Never:
            state.chunks.push("return false;");
            return;
        case SeaBreezeKind.Unknown:
            return;
        case SeaBreezeKind.Null:
            state.chunks.push(`if(${value}!==null)return false;`);
            return;
        case SeaBreezeKind.Undefined:
            state.chunks.push(`if(${value}!==undefined)return false;`);
            return;
        case SeaBreezeKind.Boolean:
            state.chunks.push(`if(typeof ${value}!=="boolean")return false;`);
            return;
        case SeaBreezeKind.Number:
            state.chunks.push(`if(!(typeof ${value}==="number"&&Number.isFinite(${value})))return false;`);
            return;
        case SeaBreezeKind.String:
            state.chunks.push(`if(typeof ${value}!=="string")return false;`);
            return;
        case SeaBreezeKind.BigInt:
            state.chunks.push(`if(typeof ${value}!=="bigint")return false;`);
            return;
        case SeaBreezeKind.Symbol:
            state.chunks.push(`if(typeof ${value}!=="symbol")return false;`);
            return;
        case SeaBreezeKind.Var:
            emitVarCheck(context, state);
            return;
        case SeaBreezeKind.Array:
            emitArrayCheck(context, state, root, value);
            return;
        case SeaBreezeKind.Object:
            emitObjectCheck(context, state, root, value);
            return;
        case SeaBreezeKind.Union:
            emitUnionCheck(context, state, root, value);
            return;
    }
}

/**
 * @brief Emit an unbound-variable predicate according to caller policy.
 */
function emitVarCheck(
    context: DirectEmitContext,
    state: FunctionBodyState
): void {
    if (context.unboundVar === "error") {
        throw new TypeError("cannot emit unbound SeaBreeze variable");
    }
    state.chunks.push("");
}

/**
 * @brief Emit an array predicate directly from reader metadata.
 */
function emitArrayCheck(
    context: DirectEmitContext,
    state: FunctionBodyState,
    root: SeaBreezeNodeId,
    value: string
): void {
    const item = context.reader.arrayElement(root);
    const itemFunction = emitNodeFunction(context, item);
    state.chunks.push(`if(!Array.isArray(${value}))return false;`);

    if (isUnsafeMode(context)) {
        emitUnsafeArrayLoop(state, value, itemFunction);
        return;
    }
    if (nodeCanAcceptUndefined(context, item)) {
        emitPresentArrayLoop(state, value, itemFunction);
        return;
    }
    emitDenseArrayLoop(state, value, itemFunction);
}

/**
 * @brief Emit unsafe direct-index array iteration.
 */
function emitUnsafeArrayLoop(
    state: FunctionBodyState,
    value: string,
    itemFunction: string
): void {
    const index = nextTemp(state, "i");
    const item = nextTemp(state, "v");
    state.chunks.push(
        `for(let ${index}=0;${index}<${value}.length;${index}+=1){`,
        `const ${item}=${value}[${index}];`,
        `if(!${itemFunction}(${item}))return false;`,
        "}"
    );
}

/**
 * @brief Emit safe dense array iteration where holes are rejected.
 */
function emitDenseArrayLoop(
    state: FunctionBodyState,
    value: string,
    itemFunction: string
): void {
    const index = nextTemp(state, "i");
    const descriptor = nextTemp(state, "d");
    const item = nextTemp(state, "v");
    state.chunks.push(
        `for(let ${index}=0;${index}<${value}.length;${index}+=1){`,
        `const ${descriptor}=gp(${value},${index});`,
        `if(${descriptor}===undefined||!h.call(${descriptor},"value"))return false;`,
        `const ${item}=${descriptor}.value;`,
        `if(!${itemFunction}(${item}))return false;`,
        "}"
    );
}

/**
 * @brief Emit safe present-index array iteration where holes are accepted.
 */
function emitPresentArrayLoop(
    state: FunctionBodyState,
    value: string,
    itemFunction: string
): void {
    const index = nextTemp(state, "i");
    const key = nextTemp(state, "k");
    const descriptor = nextTemp(state, "d");
    const item = nextTemp(state, "v");
    const keys = nextTemp(state, "ks");
    state.chunks.push(
        `const ${keys}=Object.getOwnPropertyNames(${value});`,
        `for(let ${index}=0;${index}<${keys}.length;${index}+=1){`,
        `const ${key}=${keys}[${index}];`,
        `if(!ai(${key},${value}.length))continue;`,
        `const ${descriptor}=gp(${value},${key});`,
        `if(${descriptor}!==undefined&&!h.call(${descriptor},"value"))return false;`,
        `if(${descriptor}!==undefined){`,
        `const ${item}=${descriptor}.value;`,
        `if(!${itemFunction}(${item}))return false;`,
        "}",
        "}"
    );
}

/**
 * @brief Emit an object predicate directly from reader metadata.
 */
function emitObjectCheck(
    context: DirectEmitContext,
    state: FunctionBodyState,
    root: SeaBreezeNodeId,
    value: string
): void {
    const count = context.reader.fieldCount(root);
    const keys = readObjectKeys(context, root, count);
    state.chunks.push(`if(typeof ${value}!=="object"||${value}===null||Array.isArray(${value}))return false;`);
    if (isUnsafeMode(context)) {
        emitUnsafeObjectEntries(context, state, root, value, count, keys);
    } else {
        emitSafeObjectEntries(context, state, root, value, count);
    }
    emitStrictObjectKeys(context, state, value, keys);
}

/**
 * @brief Emit safe descriptor-backed object entries.
 */
function emitSafeObjectEntries(
    context: DirectEmitContext,
    state: FunctionBodyState,
    root: SeaBreezeNodeId,
    value: string,
    count: number
): void {
    for (let index = 0; index < count; index += 1) {
        const field = context.reader.fieldTypeAt(root, index);
        const key = readFieldKey(context, context.reader.fieldKeyAt(root, index));
        const keyRef = stringRef(context.emit, key);
        const descriptor = nextTemp(state, "d");
        const item = nextTemp(state, "v");
        const child = emitNodeFunction(context, field);
        state.chunks.push(`const ${descriptor}=gp(${value},${keyRef});`);
        if (context.reader.fieldPresenceAt(root, index) === SeaBreezePresence.Optional) {
            state.chunks.push(
                `if(${descriptor}!==undefined){`,
                `if(!h.call(${descriptor},"value"))return false;`,
                `const ${item}=${descriptor}.value;`,
                `if(!${child}(${item}))return false;`,
                `}else if(h.call(${value},${keyRef}))return false;`
            );
        } else {
            state.chunks.push(
                `if(${descriptor}===undefined||!h.call(${descriptor},"value"))return false;`,
                `const ${item}=${descriptor}.value;`,
                `if(!${child}(${item}))return false;`
            );
        }
    }
}

/**
 * @brief Emit unsafe direct-read object entries.
 */
function emitUnsafeObjectEntries(
    context: DirectEmitContext,
    state: FunctionBodyState,
    root: SeaBreezeNodeId,
    value: string,
    count: number,
    keys: readonly string[]
): void {
    for (let index = 0; index < count; index += 1) {
        const field = context.reader.fieldTypeAt(root, index);
        const key = keys[index];
        if (key === undefined) {
            state.chunks.push("return false;");
            continue;
        }
        const keyRef = unsafeStringLiteralExpression(key);
        const item = nextTemp(state, "v");
        const child = emitNodeFunction(context, field);
        state.chunks.push(
            `const ${item}=${unsafePropertyReadExpression(value, key)};`
        );
        if (context.reader.fieldPresenceAt(root, index) === SeaBreezePresence.Optional) {
            state.chunks.push(
                `if(${item}!==undefined){`,
                `if(!${child}(${item}))return false;`,
                `}else if(h.call(${value},${keyRef})&&!${child}(${item}))return false;`
            );
        } else {
            if (nodeCanAcceptUndefined(context, field)) {
                state.chunks.push(
                    `if(${item}===undefined&&!h.call(${value},${keyRef}))return false;`
                );
            }
            state.chunks.push(`if(!${child}(${item}))return false;`);
        }
    }
}

/**
 * @brief Emit strict unknown-key validation for objects.
 */
function emitStrictObjectKeys(
    context: DirectEmitContext,
    state: FunctionBodyState,
    value: string,
    keys: readonly string[]
): void {
    if (context.objectMode !== ObjectModeTag.Strict || isUncheckedMode(context)) {
        return;
    }
    if (isUnsafeMode(context)) {
        const key = nextTemp(state, "key");
        state.chunks.push(
            `for(const ${key} in ${value}){`,
            `if(h.call(${value},${key})&&!${unsafeKeyMembershipExpression(key, keys)})return false;`,
            "}"
        );
        return;
    }
    const present = nextTemp(state, "xs");
    const length = nextTemp(state, "n");
    const index = nextTemp(state, "i");
    const key = nextTemp(state, "key");
    state.chunks.push(
        `const ${present}=Reflect.ownKeys(${value});`,
        `const ${length}=${present}.length;`,
        `for(let ${index}=0;${index}<${length};${index}+=1){`,
        `const ${key}=${present}[${index}];`,
        `if(typeof ${key}!=="string"||!${keyMembershipExpression(context, key, keys)})return false;`,
        "}"
    );
}

/**
 * @brief Emit a union predicate as ordered branch probes.
 */
function emitUnionCheck(
    context: DirectEmitContext,
    state: FunctionBodyState,
    root: SeaBreezeNodeId,
    value: string
): void {
    const arms: SeaBreezeNodeId[] = [];
    appendUnionArms(context, root, arms);
    if (arms.length === 0) {
        state.chunks.push("return false;");
        return;
    }
    for (let index = 0; index < arms.length; index += 1) {
        const arm = arms[index];
        if (arm !== undefined) {
            state.chunks.push(`if(${emitNodeFunction(context, arm)}(${value}))return true;`);
        }
    }
    state.chunks.push("return false;");
}

/**
 * @brief Append union arms with optional flattening.
 */
function appendUnionArms(
    context: DirectEmitContext,
    node: SeaBreezeNodeId,
    output: SeaBreezeNodeId[]
): void {
    const root = context.reader.find(node);
    if (context.unionMode !== "binary" &&
        context.reader.kindOf(root) === SeaBreezeKind.Union) {
        appendUnionArms(context, context.reader.unionLeft(root), output);
        appendUnionArms(context, context.reader.unionRight(root), output);
        return;
    }
    if (context.reader.kindOf(root) !== SeaBreezeKind.Never) {
        output.push(root);
    }
}

/**
 * @brief Return whether one SeaBreeze node accepts undefined values.
 */
function nodeCanAcceptUndefined(
    context: DirectEmitContext,
    node: SeaBreezeNodeId
): boolean {
    const root = context.reader.find(node);
    switch (context.reader.kindOf(root)) {
        case SeaBreezeKind.Unknown:
        case SeaBreezeKind.Undefined:
        case SeaBreezeKind.Var:
            return true;
        case SeaBreezeKind.Union:
            return nodeCanAcceptUndefined(context, context.reader.unionLeft(root)) ||
                nodeCanAcceptUndefined(context, context.reader.unionRight(root));
        default:
            return false;
    }
}

/**
 * @brief Read all object keys for strict-key emission.
 */
function readObjectKeys(
    context: DirectEmitContext,
    root: SeaBreezeNodeId,
    count: number
): readonly string[] {
    const keys = new Array<string>(count);
    const seen = Object.create(null) as Record<string, true>;
    for (let index = 0; index < count; index += 1) {
        const key = readFieldKey(context, context.reader.fieldKeyAt(root, index));
        if (Object.prototype.hasOwnProperty.call(seen, key)) {
            throw new TypeError(`SeaBreeze key table maps duplicate object key ${key}`);
        }
        Object.defineProperty(seen, key, {
            configurable: false,
            enumerable: true,
            value: true,
            writable: false
        });
        keys[index] = key;
    }
    return keys;
}

/**
 * @brief Read one field key from the caller-owned key table.
 */
function readFieldKey(context: DirectEmitContext, keyId: number): string {
    const key = context.keyTable[keyId];
    if (typeof key !== "string") {
        throw new RangeError(`missing SeaBreeze key table entry ${String(keyId)}`);
    }
    return key;
}

/**
 * @brief Reject malformed key tables before direct emission begins.
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
 * @brief Validate object-mode emission policy.
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
 * @brief Allocate one local variable name.
 */
function nextTemp(state: FunctionBodyState, prefix: string): string {
    const name = `${prefix}${String(state.temp)}`;
    state.temp += 1;
    return name;
}

/**
 * @brief Allocate one generated predicate name.
 */
function nextFunctionName(context: EmitContext): string {
    let index = context.functions.length;
    let name = `p${String(index)}`;
    while (hasFunctionName(context, name)) {
        index += 1;
        name = `p${String(index)}`;
    }
    return name;
}

/**
 * @brief Return whether an emitted function name is already occupied.
 */
function hasFunctionName(context: EmitContext, name: string): boolean {
    for (let index = 0; index < context.functions.length; index += 1) {
        if (context.functions[index]?.name === name) {
            return true;
        }
    }
    return false;
}

/**
 * @brief Decide whether the root predicate can use the public function name.
 */
function canUseDirectRootFunctionName(name: string): boolean {
    return !isRuntimeHelperName(name) &&
        !isFactoryParameterName(name) &&
        !isGeneratedFunctionName(name);
}

/**
 * @brief Test whether a name collides with generated runtime helpers.
 */
function isRuntimeHelperName(name: string): boolean {
    switch (name) {
        case "z":
        case "h":
        case "gp":
        case "o":
        case "ph":
        case "g":
        case "gv":
        case "ho":
        case "hd":
        case "fn":
        case "nc":
        case "dg":
        case "dt":
        case "sb":
        case "rx":
        case "ai":
        case "ea":
        case "eu":
        case "ev":
        case "er":
        case "dj":
        case "a":
        case "le":
        case "q":
        case "q1":
        case "q1s":
        case "q2":
        case "fq":
        case "fq1":
        case "fq1s":
        case "fq2":
            return true;
        default:
            return false;
    }
}

/**
 * @brief Test whether a name collides with factory parameters.
 */
function isFactoryParameterName(name: string): boolean {
    switch (name) {
        case "l":
        case "r":
        case "k":
        case "u":
        case "d":
        case "m":
        case "mf":
        case "sk":
        case "w":
            return true;
        default:
            return false;
    }
}

/**
 * @brief Test whether a name matches TypeSea generated child predicates.
 */
function isGeneratedFunctionName(name: string): boolean {
    if (name.length < 2) {
        return false;
    }
    const first = name.charCodeAt(0);
    if (first !== 112) {
        return false;
    }
    for (let index = 1; index < name.length; index += 1) {
        const code = name.charCodeAt(index);
        if (code < 48 || code > 57) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Test whether generated source should use unsafe read semantics.
 */
function isUnsafeMode(context: DirectEmitContext): boolean {
    return context.emit.mode !== "safe";
}

/**
 * @brief Test whether generated source should skip strict excess-key checks.
 */
function isUncheckedMode(context: DirectEmitContext): boolean {
    return context.emit.mode === "unchecked";
}

/**
 * @brief Build a side-table-backed key membership expression.
 */
function keyMembershipExpression(
    context: DirectEmitContext,
    key: string,
    keys: readonly string[]
): string {
    if (keys.length === 0) {
        return "false";
    }
    const parts = new Array<string>(keys.length);
    for (let index = 0; index < keys.length; index += 1) {
        const value = keys[index];
        parts[index] = value === undefined
            ? "false"
            : `${key}===${stringRef(context.emit, value)}`;
    }
    return `(${parts.join("||")})`;
}

/**
 * @brief Build a source-literal key membership expression for unsafe mode.
 */
function unsafeKeyMembershipExpression(
    key: string,
    keys: readonly string[]
): string {
    if (keys.length === 0) {
        return "false";
    }
    const parts = new Array<string>(keys.length);
    for (let index = 0; index < keys.length; index += 1) {
        const value = keys[index];
        parts[index] = value === undefined
            ? "false"
            : `${key}===${unsafeStringLiteralExpression(value)}`;
    }
    return `(${parts.join("||")})`;
}

/**
 * @brief Build a direct property read expression for unsafe mode.
 */
function unsafePropertyReadExpression(
    objectExpression: string,
    key: string
): string {
    if (isAsciiIdentifierName(key)) {
        return `${objectExpression}.${key}`;
    }
    return `${objectExpression}[${unsafeStringLiteralExpression(key)}]`;
}

/**
 * @brief Test whether a key is a compact JavaScript property identifier.
 */
function isAsciiIdentifierName(value: string): boolean {
    return /^[A-Za-z_$][0-9A-Za-z_$]*$/u.test(value);
}

/**
 * @brief Quote a string for unsafe generated JavaScript source.
 */
function unsafeStringLiteralExpression(value: string): string {
    return JSON.stringify(value)
        .replace(/\u2028/gu, "\\u2028")
        .replace(/\u2029/gu, "\\u2029");
}
