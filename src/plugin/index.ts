/**
 * @file plugin/index.ts
 * @brief Zero-dependency AOT bundler plugin helpers.
 * @details The plugin API is structural: TypeSea does not import Vite, Rollup,
 * or esbuild types at runtime. Bundlers consume the returned plain objects.
 */

import {
    emitAotModule,
    type AotCompileOptions,
    type AotIssue
} from "../aot/index.js";
import type { Guard, Presence } from "../guard/index.js";

const VIRTUAL_PREFIX = "typesea:aot/";
const RESOLVED_PREFIX = "\0typesea:aot/";

/**
 * @brief One AOT module entry known to the bundler plugin.
 * @details `id` maps to the virtual module `typesea:aot/<id>`. The guard is
 * compiled during bundling, not during application startup.
 */
export interface TypeSeaAotPluginEntry {
    /**
     * @brief Virtual module id below the `typesea:aot/` namespace.
     * @details The same id is also used by compileCached macro replacement, so it
     * should be stable and owned by the application.
     */
    readonly id: string;

    /**
     * @brief Guard compiled into the virtual AOT module.
     */
    readonly guard: Guard<unknown, Presence>;

    /**
     * @brief Entry-local AOT compiler options.
     * @details These options override only this generated module and do not mutate
     * plugin-level state.
     */
    readonly options?: Partial<AotCompileOptions> | undefined;
}

/**
 * @brief Shared AOT plugin options.
 * @details Macro replacement is conservative and only rewrites
 * compileCached("id", ...) calls whose id exists in entries.
 */
export interface TypeSeaAotPluginOptions {
    /**
     * @brief Static AOT entries exposed as virtual modules.
     */
    readonly entries: readonly TypeSeaAotPluginEntry[];

    /**
     * @brief Enable source rewriting for compileCached("id", ...) calls.
     * @details Only string-literal keys present in entries are rewritten, keeping
     * dynamic cache usage under normal runtime control.
     */
    readonly transformCompileCached?: boolean | undefined;

    /**
     * @brief Optional source reader used by esbuild macro replacement.
     * @details Supplying this hook lets tests or non-Node hosts provide source text
     * while preserving the same validation on the returned value.
     */
    readonly readFile?: TypeSeaPluginReadFile;
}

/**
 * @brief Source reader hook for esbuild integration.
 * @param path Absolute or bundler-resolved module path.
 * @returns Source text, or a promise that resolves to source text.
 */
export type TypeSeaPluginReadFile =
    (path: string) => unknown;

/**
 * @brief Rollup-compatible structural plugin shape.
 */
export interface TypeSeaRollupPlugin {
    /**
     * @brief Stable plugin name reported to Rollup-compatible hosts.
     */
    readonly name: string;

    /**
     * @brief Resolve TypeSea AOT virtual ids into private module ids.
     */
    resolveId(id: string): string | null;

    /**
     * @brief Load generated source for a resolved TypeSea AOT module.
     */
    load(id: string): string | null;

    /**
     * @brief Rewrite eligible compileCached calls before normal bundler lowering.
     */
    transform(
        code: string,
        id: string
    ): TypeSeaTransformResult | null;
}

/**
 * @brief Vite-compatible structural plugin shape.
 */
export interface TypeSeaVitePlugin extends TypeSeaRollupPlugin {
    /**
     * @brief Run before normal Vite transforms.
     * @details The macro pass must see user source before downstream loaders erase
     * the compileCached call shape.
     */
    readonly enforce: "pre";
}

/**
 * @brief esbuild-compatible structural plugin shape.
 */
export interface TypeSeaEsbuildPlugin {
    /**
     * @brief Stable plugin name reported to esbuild.
     */
    readonly name: string;

    /**
     * @brief Register TypeSea virtual module and source rewrite hooks.
     */
    setup(build: TypeSeaEsbuildBuild): void;
}

/**
 * @brief Minimal esbuild build object consumed by the plugin.
 */
export interface TypeSeaEsbuildBuild {
    /**
     * @brief Register a module resolution hook.
     */
    onResolve(
        options: TypeSeaEsbuildFilter,
        callback: (args: TypeSeaEsbuildResolveArgs) => TypeSeaEsbuildResolveResult
    ): void;

    /**
     * @brief Register a module load hook.
     */
    onLoad(
        options: TypeSeaEsbuildLoadFilter,
        callback: (args: TypeSeaEsbuildLoadArgs) =>
            TypeSeaEsbuildLoadResult |
            null |
            Promise<TypeSeaEsbuildLoadResult | null>
    ): void;
}

/**
 * @brief Minimal esbuild filter object.
 */
export interface TypeSeaEsbuildFilter {
    /**
     * @brief Regular expression used by esbuild before invoking a hook.
     */
    readonly filter: RegExp;
}

/**
 * @brief Minimal esbuild load-filter object.
 */
export interface TypeSeaEsbuildLoadFilter {
    /**
     * @brief Regular expression used by esbuild before invoking a load hook.
     */
    readonly filter: RegExp;

    /**
     * @brief Optional esbuild namespace restriction.
     */
    readonly namespace?: string;
}

/**
 * @brief Minimal esbuild resolve hook arguments used by TypeSea.
 */
export interface TypeSeaEsbuildResolveArgs {
    /**
     * @brief Requested module path.
     */
    readonly path: string;
}

/**
 * @brief Minimal esbuild load hook arguments used by TypeSea.
 */
export interface TypeSeaEsbuildLoadArgs {
    /**
     * @brief Resolved module path.
     */
    readonly path: string;
}

/**
 * @brief Minimal esbuild resolve result emitted by TypeSea.
 */
export interface TypeSeaEsbuildResolveResult {
    /**
     * @brief Resolved virtual entry id.
     */
    readonly path: string;

    /**
     * @brief Namespace used to route the later load hook.
     */
    readonly namespace: string;
}

/**
 * @brief Minimal esbuild load result emitted by TypeSea.
 */
export interface TypeSeaEsbuildLoadResult {
    /**
     * @brief JavaScript or TypeScript source returned to esbuild.
     */
    readonly contents: string;

    /**
     * @brief Loader selected from the source path or generated module kind.
     */
    readonly loader: TypeSeaEsbuildLoader;
}

/**
 * @brief esbuild loader names TypeSea can return.
 */
export type TypeSeaEsbuildLoader = "js" | "jsx" | "ts" | "tsx";

/**
 * @brief Source transform result shared by Rollup and Vite.
 */
export interface TypeSeaTransformResult {
    /**
     * @brief Rewritten module source.
     */
    readonly code: string;

    /**
     * @brief Source map placeholder.
     * @details The macro keeps edits small and currently reports no source map.
     */
    readonly map: null;
}

interface AotPluginState {
    readonly entries: ReadonlyMap<string, TypeSeaAotPluginEntry>;
    readonly transformCompileCached: boolean;
    readonly readFile: TypeSeaPluginReadFile | undefined;
}

interface CompileCachedMatch {
    readonly start: number;
    readonly end: number;
    readonly key: string;
}

interface CompileCachedBindings {
    readonly functions: ReadonlySet<string>;
    readonly namespaces: ReadonlySet<string>;
}

interface IdentifierRead {
    readonly value: string;
    readonly end: number;
}

interface StringLiteralRead {
    readonly value: string;
    readonly end: number;
}

interface StaticImportRead {
    readonly clause: string;
    readonly source: string;
    readonly end: number;
}

interface CompileScanCodeFrame {
    readonly kind: "code";
    readonly braceBlocks: boolean[];
    readonly stopAtClosingBrace: boolean;
    blockDepth: number;
}

interface CompileScanTemplateFrame {
    readonly kind: "template";
}

interface CompileScanJsxFrame {
    readonly kind: "jsx";
    depth: number;
    mode: "tag" | "text";
    closing: boolean;
}

type CompileScanFrame =
    | CompileScanCodeFrame
    | CompileScanTemplateFrame
    | CompileScanJsxFrame;

const MAX_TEMPLATE_SCAN_DEPTH = 64;

/**
 * @brief Create a Rollup-compatible AOT plugin.
 * @param options Static AOT entries and optional macro transform flag.
 * @returns Rollup-compatible plugin object.
 */
export function createTypeSeaRollupPlugin(
    options: TypeSeaAotPluginOptions
): TypeSeaRollupPlugin {
    const state = makeAotPluginState(options);
    return Object.freeze({
        name: "typesea-aot",

        resolveId(id: string): string | null {
            if (!id.startsWith(VIRTUAL_PREFIX)) {
                return null;
            }
            return `${RESOLVED_PREFIX}${readVirtualId(id)}`;
        },

        load(id: string): string | null {
            if (!id.startsWith(RESOLVED_PREFIX)) {
                return null;
            }
            return emitAotEntrySource(state, id.slice(RESOLVED_PREFIX.length));
        },

        transform(code: string, id: string): TypeSeaTransformResult | null {
            if (!state.transformCompileCached || !isTransformableModule(id)) {
                return null;
            }
            return transformCompileCachedCalls(code, state, isJsxModule(id));
        }
    });
}

/**
 * @brief Create a Vite-compatible AOT plugin.
 * @param options Static AOT entries and optional macro transform flag.
 * @returns Vite-compatible plugin object.
 */
export function createTypeSeaVitePlugin(
    options: TypeSeaAotPluginOptions
): TypeSeaVitePlugin {
    const plugin = createTypeSeaRollupPlugin(options);
    return Object.freeze({
        ...plugin,
        enforce: "pre" as const
    });
}

/**
 * @brief Create an esbuild-compatible AOT plugin.
 * @param options Static AOT entries and optional macro transform flag.
 * @returns esbuild-compatible plugin object.
 * @details Virtual modules are served from the typesea-aot namespace. When
 * transformCompileCached is enabled, source files are read through the optional
 * readFile hook or a dynamic node:fs/promises import and rewritten before esbuild
 * applies its loader.
 */
export function createTypeSeaEsbuildPlugin(
    options: TypeSeaAotPluginOptions
): TypeSeaEsbuildPlugin {
    const state = makeAotPluginState(options);
    return Object.freeze({
        name: "typesea-aot",

        setup(build: TypeSeaEsbuildBuild): void {
            build.onResolve(
                { filter: /^typesea:aot\/.+$/u },
                (args): TypeSeaEsbuildResolveResult => ({
                    path: readVirtualId(args.path),
                    namespace: "typesea-aot"
                })
            );
            build.onLoad(
                {
                    filter: /.*/u,
                    namespace: "typesea-aot"
                },
                (args): TypeSeaEsbuildLoadResult => ({
                    contents: emitAotEntrySource(state, args.path),
                    loader: "js"
                })
            );
            if (state.transformCompileCached) {
                build.onLoad(
                    {
                        filter: /\.[cm]?[jt]sx?$/u,
                        namespace: "file"
                    },
                    async (args): Promise<TypeSeaEsbuildLoadResult> => {
                        const source = await readEsbuildSource(state, args.path);
                        const transformed = transformCompileCachedCalls(
                            source,
                            state,
                            isJsxModule(args.path)
                        );
                        return {
                            contents: transformed?.code ?? source,
                            loader: readEsbuildLoader(args.path)
                        };
                    }
                );
            }
        }
    });
}

/**
 * @brief Normalize plugin options into immutable lookup state.
 */
function makeAotPluginState(options: TypeSeaAotPluginOptions): AotPluginState {
    if (!isRecord(options)) {
        throw new TypeError("TypeSea AOT plugin options must be an object");
    }
    if (!Array.isArray(options.entries)) {
        throw new TypeError("TypeSea AOT plugin entries must be an array");
    }
    const entries = new Map<string, TypeSeaAotPluginEntry>();
    for (let index = 0; index < options.entries.length; index += 1) {
        const entry = readAotPluginEntryAt(options.entries, index);
        if (entry === undefined) {
            throw new TypeError("TypeSea AOT plugin entry is missing");
        }
        if (typeof entry.id !== "string" || entry.id.length === 0) {
            throw new TypeError("TypeSea AOT plugin entry id must be a non-empty string");
        }
        if (entry.id.includes("\0") || entry.id.includes("\n")) {
            throw new TypeError("TypeSea AOT plugin entry id contains an invalid character");
        }
        entries.set(entry.id, entry);
    }
    const transformCompileCached = options.transformCompileCached;
    if (transformCompileCached !== undefined &&
        typeof transformCompileCached !== "boolean") {
        throw new TypeError("TypeSea AOT transformCompileCached must be a boolean");
    }
    const readFile = options.readFile;
    if (readFile !== undefined && typeof readFile !== "function") {
        throw new TypeError("TypeSea AOT readFile must be a function");
    }
    return {
        entries,
        transformCompileCached: transformCompileCached ?? false,
        readFile
    };
}

/**
 * @brief Read an AOT entry array slot without widening through Array.isArray.
 */
function readAotPluginEntryAt(
    entries: readonly TypeSeaAotPluginEntry[],
    index: number
): TypeSeaAotPluginEntry | undefined {
    return entries[index];
}

/**
 * @brief Emit one configured AOT virtual module.
 */
function emitAotEntrySource(state: AotPluginState, id: string): string {
    const entry = state.entries.get(id);
    if (entry === undefined) {
        throw new Error(`Unknown TypeSea AOT entry: ${id}`);
    }
    const result = emitAotModule(entry.guard, entry.options);
    if (result.ok) {
        return result.value.source;
    }
    throw new Error(formatAotIssues(id, result.error));
}

/**
 * @brief Read source text for esbuild macro transformation.
 */
async function readEsbuildSource(
    state: AotPluginState,
    path: string
): Promise<string> {
    if (state.readFile !== undefined) {
        return readStringSource(await state.readFile(path));
    }
    const fs = await import("node:fs/promises");
    return fs.readFile(path, "utf8");
}

/**
 * @brief Accept only string source returned by a readFile hook.
 */
function readStringSource(value: unknown): string {
    if (typeof value !== "string") {
        throw new TypeError("TypeSea AOT readFile must return a string");
    }
    return value;
}

/**
 * @brief Infer an esbuild loader from a JavaScript or TypeScript file path.
 */
function readEsbuildLoader(path: string): TypeSeaEsbuildLoader {
    if (path.endsWith(".tsx")) {
        return "tsx";
    }
    if (path.endsWith(".ts") || path.endsWith(".mts") || path.endsWith(".cts")) {
        return "ts";
    }
    if (path.endsWith(".jsx")) {
        return "jsx";
    }
    return "js";
}

/**
 * @brief Transform compileCached("id", ...) calls into AOT imports.
 */
function transformCompileCachedCalls(
    code: string,
    state: AotPluginState,
    jsx: boolean
): TypeSeaTransformResult | null {
    const bindings = readCompileCachedBindings(code);
    if (bindings.functions.size === 0 && bindings.namespaces.size === 0) {
        return null;
    }
    const replacements = findCompileCachedCalls(code, state, bindings, jsx);
    if (replacements.length === 0) {
        return null;
    }
    const imports = makeAotImports(replacements);
    const chunks: string[] = [];
    let cursor = 0;
    for (let index = 0; index < replacements.length; index += 1) {
        const replacement = replacements[index];
        if (replacement === undefined) {
            continue;
        }
        chunks.push(code.slice(cursor, replacement.start));
        chunks.push(makeAotImportName(replacement.key));
        cursor = replacement.end;
    }
    chunks.push(code.slice(cursor));
    const transformed = chunks.join("");
    return {
        code: insertAotImports(transformed, imports),
        map: null
    };
}

/**
 * @brief Find module-scope TypeSea compileCached calls with static string keys.
 * @remarks Calls are matched only through bindings imported from TypeSea.
 * Strings, comments, template text, and nested statement blocks are left
 * untouched. Object literals and template expressions remain executable module
 * expressions and are scanned through an explicit bounded stack.
 */
function findCompileCachedCalls(
    code: string,
    state: AotPluginState,
    bindings: CompileCachedBindings,
    jsx: boolean
): CompileCachedMatch[] {
    const matches: CompileCachedMatch[] = [];
    const frames: CompileScanFrame[] = [{
        kind: "code",
        braceBlocks: [],
        blockDepth: 0,
        stopAtClosingBrace: false
    }];
    let index = 0;
    let templateDepth = 0;
    while (index < code.length && frames.length > 0) {
        const frame = frames[frames.length - 1];
        if (frame === undefined) {
            break;
        }
        const current = code.charCodeAt(index);
        if (frame.kind === "jsx") {
            index = advanceJsxScanFrame(code, index, frame, frames);
            continue;
        }
        if (frame.kind === "template") {
            if (current === 92) {
                index += 2;
                continue;
            }
            if (current === 96) {
                frames.pop();
                templateDepth -= 1;
                index += 1;
                continue;
            }
            if (current === 36 && code.charCodeAt(index + 1) === 123) {
                frames.push({
                    kind: "code",
                    braceBlocks: [],
                    blockDepth: 0,
                    stopAtClosingBrace: true
                });
                index += 2;
                continue;
            }
            index += 1;
            continue;
        }
        if (current === 34 || current === 39) {
            index = skipString(code, index);
            continue;
        }
        if (current === 96) {
            if (templateDepth >= MAX_TEMPLATE_SCAN_DEPTH) {
                return matches;
            }
            frames.push({ kind: "template" });
            templateDepth += 1;
            index += 1;
            continue;
        }
        if (current === 47 && code.charCodeAt(index + 1) === 47) {
            index = skipLineComment(code, index + 2);
            continue;
        }
        if (current === 47 && code.charCodeAt(index + 1) === 42) {
            index = skipBlockComment(code, index + 2);
            continue;
        }
        if (current === 47 && isRegularExpressionStart(code, index)) {
            index = skipRegularExpression(code, index);
            continue;
        }
        if (jsx && current === 60 && isLikelyJsxStart(code, index)) {
            frames.push({
                kind: "jsx",
                depth: 1,
                mode: "tag",
                closing: false
            });
            index += 1;
            continue;
        }
        if (current === 123) {
            const block = !isExpressionBrace(code, index);
            frame.braceBlocks.push(block);
            if (block) {
                frame.blockDepth += 1;
            }
            index += 1;
            continue;
        }
        if (current === 125) {
            const block = frame.braceBlocks.pop();
            if (block === undefined) {
                if (frame.stopAtClosingBrace) {
                    frames.pop();
                }
                index += 1;
                continue;
            }
            if (block) {
                frame.blockDepth -= 1;
            }
            index += 1;
            continue;
        }
        const identifier = readIdentifier(code, index);
        if (identifier === undefined) {
            index += 1;
            continue;
        }
        if (frame.blockDepth === 0) {
            const match = readCompileCachedCallFromIdentifier(
                code,
                identifier,
                state,
                bindings
            );
            if (match !== undefined) {
                matches.push(match);
                index = match.end;
                continue;
            }
        }
        index = identifier.end;
    }
    return matches;
}

/** Advance one JSX tag or text token while exposing expression braces as code. */
function advanceJsxScanFrame(
    code: string,
    index: number,
    frame: CompileScanJsxFrame,
    frames: CompileScanFrame[]
): number {
    const current = code.charCodeAt(index);
    if (frame.mode === "text") {
        if (current === 123) {
            pushJsxExpressionFrame(frames);
            return index + 1;
        }
        if (current !== 60) {
            return index + 1;
        }
        if (code.charCodeAt(index + 1) === 47) {
            frame.mode = "tag";
            frame.closing = true;
            return index + 2;
        }
        frame.depth += 1;
        frame.mode = "tag";
        frame.closing = false;
        return index + 1;
    }
    if (current === 34 || current === 39) {
        return skipString(code, index);
    }
    if (current === 123) {
        pushJsxExpressionFrame(frames);
        return index + 1;
    }
    if (current === 47 && code.charCodeAt(index + 1) === 62) {
        frame.depth -= 1;
        closeJsxScanFrame(frame, frames);
        return index + 2;
    }
    if (current === 62) {
        if (frame.closing) {
            frame.depth -= 1;
        }
        closeJsxScanFrame(frame, frames);
        return index + 1;
    }
    return index + 1;
}

function pushJsxExpressionFrame(frames: CompileScanFrame[]): void {
    frames.push({
        kind: "code",
        braceBlocks: [],
        blockDepth: 0,
        stopAtClosingBrace: true
    });
}

function closeJsxScanFrame(
    frame: CompileScanJsxFrame,
    frames: CompileScanFrame[]
): void {
    if (frame.depth === 0) {
        frames.pop();
        return;
    }
    frame.mode = "text";
    frame.closing = false;
}

/**
 * @brief Distinguish expression object braces from statement blocks.
 * @param code Complete module source.
 * @param start Opening brace offset.
 * @returns True when the preceding token requires an expression.
 */
function isExpressionBrace(code: string, start: number): boolean {
    const previous = previousCodeIndex(code, start - 1);
    if (previous < 0) {
        return false;
    }
    const token = code.charCodeAt(previous);
    return token === 33 ||
        token === 37 ||
        token === 38 ||
        token === 40 ||
        token === 42 ||
        token === 43 ||
        token === 44 ||
        token === 45 ||
        token === 47 ||
        token === 58 ||
        token === 60 ||
        token === 61 ||
        token === 62 ||
        token === 63 ||
        token === 91 ||
        token === 94 ||
        token === 123 ||
        token === 124 ||
        token === 126;
}

/** Recognize statement positions immediately following control conditions. */
function followsControlCondition(code: string, close: number): boolean {
    let depth = 1;
    let index = close - 1;
    while (index >= 0) {
        const current = code.charCodeAt(index);
        if (current === 41) {
            depth += 1;
        } else if (current === 40) {
            depth -= 1;
            if (depth === 0) {
                break;
            }
        }
        index -= 1;
    }
    if (index < 0) {
        return false;
    }
    const keywordEnd = previousCodeIndex(code, index - 1);
    if (keywordEnd < 0 || !isIdentifierPartCode(code.charCodeAt(keywordEnd))) {
        return false;
    }
    let keywordStart = keywordEnd;
    while (keywordStart > 0 &&
        isIdentifierPartCode(code.charCodeAt(keywordStart - 1))) {
        keywordStart -= 1;
    }
    switch (code.slice(keywordStart, keywordEnd + 1)) {
        case "cat" + "ch":
        case "for":
        case "if":
        case "switch":
        case "while":
        case "with":
            return true;
        default:
            return false;
    }
}

/**
 * @brief Find the previous non-whitespace source offset.
 */
function previousCodeIndex(code: string, start: number): number {
    let index = start;
    while (index >= 0) {
        const current = code.charCodeAt(index);
        if (current !== 9 && current !== 10 && current !== 13 && current !== 32) {
            return index;
        }
        index -= 1;
    }
    return -1;
}

/**
 * Recognize JSX only where JavaScript grammar permits a fresh expression.
 * Ambiguous generic-arrow prefixes remain ordinary TypeScript code.
 */
function isLikelyJsxStart(code: string, start: number): boolean {
    const next = code.charCodeAt(start + 1);
    if (next !== 62 && !isIdentifierStartCode(next)) {
        return false;
    }
    if (isIdentifierStartCode(next)) {
        const tag = readIdentifier(code, start + 1);
        const afterTag = tag === undefined ? start + 1 : skipWhitespace(code, tag.end);
        if (code.charCodeAt(afterTag) === 44 ||
            code.charCodeAt(afterTag) === 61 ||
            identifierAt(code, afterTag, "extends")) {
            return false;
        }
        if (code.charCodeAt(afterTag) === 62 &&
            code.charCodeAt(skipTrivia(code, afterTag + 1)) === 40) {
            return false;
        }
    }
    const previous = previousCodeIndex(code, start - 1);
    if (previous < 0) {
        return true;
    }
    const token = code.charCodeAt(previous);
    if (token === 33 || token === 38 || token === 40 || token === 44 ||
        token === 58 || token === 59 || token === 61 || token === 63 ||
        token === 91 || token === 123 || token === 124) {
        return true;
    }
    if (token === 62 && code.charCodeAt(previous - 1) === 61) {
        return true;
    }
    if (!isIdentifierPartCode(token)) {
        return false;
    }
    let wordStart = previous;
    while (wordStart > 0 && isIdentifierPartCode(code.charCodeAt(wordStart - 1))) {
        wordStart -= 1;
    }
    switch (code.slice(wordStart, previous + 1)) {
        case "await":
        case "case":
        case "return":
        case "throw":
        case "yield":
            return true;
        default:
            return false;
    }
}

/** Determine whether a slash begins a regular-expression literal. */
function isRegularExpressionStart(code: string, start: number): boolean {
    const next = code.charCodeAt(start + 1);
    if (next === 47 || next === 42) {
        return false;
    }
    const lineStart = code.lastIndexOf("\n", start - 1) + 1;
    if (skipWhitespace(code, lineStart) === start) {
        return true;
    }
    const previous = previousCodeIndex(code, start - 1);
    if (previous < 0) {
        return true;
    }
    const token = code.charCodeAt(previous);
    if (token === 41 && followsControlCondition(code, previous)) {
        return true;
    }
    if (token === 33 || token === 37 || token === 38 || token === 40 ||
        token === 42 || token === 43 || token === 44 || token === 45 ||
        token === 58 || token === 59 || token === 60 || token === 61 ||
        token === 62 || token === 63 || token === 91 || token === 94 ||
        token === 123 || token === 124 || token === 126) {
        return true;
    }
    if (!isIdentifierPartCode(token)) {
        return false;
    }
    let wordStart = previous;
    while (wordStart > 0 && isIdentifierPartCode(code.charCodeAt(wordStart - 1))) {
        wordStart -= 1;
    }
    switch (code.slice(wordStart, previous + 1)) {
        case "await":
        case "case":
        case "delete":
        case "do":
        case "else":
        case "in":
        case "instanceof":
        case "of":
        case "return":
        case "throw":
        case "typeof":
        case "void":
        case "yield":
            return true;
        default:
            return false;
    }
}

/** Skip a regular-expression body, character classes, escapes, and flags. */
function skipRegularExpression(code: string, start: number): number {
    let index = start + 1;
    let characterClass = false;
    while (index < code.length) {
        const current = code.charCodeAt(index);
        if (current === 10 || current === 13) {
            return start + 1;
        }
        if (current === 92) {
            index += 2;
            continue;
        }
        if (current === 91) {
            characterClass = true;
            index += 1;
            continue;
        }
        if (current === 93 && characterClass) {
            characterClass = false;
            index += 1;
            continue;
        }
        if (current === 47 && !characterClass) {
            index += 1;
            while (index < code.length && isIdentifierPartCode(code.charCodeAt(index))) {
                index += 1;
            }
            return index;
        }
        index += 1;
    }
    return start + 1;
}

/**
 * @brief Read one possible TypeSea compileCached invocation.
 */
function readCompileCachedCallFromIdentifier(
    code: string,
    identifier: IdentifierRead,
    state: AotPluginState,
    bindings: CompileCachedBindings
): CompileCachedMatch | undefined {
    if (bindings.functions.has(identifier.value)) {
        const open = skipTrivia(code, identifier.end);
        if (code.charCodeAt(open) === 40) {
            return readCompileCachedCall(
                code,
                identifier.end - identifier.value.length,
                open,
                state
            );
        }
    }
    if (!bindings.namespaces.has(identifier.value)) {
        return undefined;
    }
    const dot = skipTrivia(code, identifier.end);
    if (code.charCodeAt(dot) !== 46) {
        return undefined;
    }
    const member = readIdentifier(code, skipTrivia(code, dot + 1));
    if (member?.value !== "compileCached") {
        return undefined;
    }
    const open = skipTrivia(code, member.end);
    if (code.charCodeAt(open) !== 40) {
        return undefined;
    }
    return readCompileCachedCall(
        code,
        identifier.end - identifier.value.length,
        open,
        state
    );
}

/**
 * @brief Read a compileCached call once the opening parenthesis is known.
 */
function readCompileCachedCall(
    code: string,
    start: number,
    open: number,
    state: AotPluginState
): CompileCachedMatch | undefined {
    const keyStart = skipTrivia(code, open + 1);
    const key = readStringLiteral(code, keyStart);
    if (key === undefined || !state.entries.has(key.value)) {
        return undefined;
    }
    const end = findMatchingParen(code, open);
    if (end === undefined) {
        return undefined;
    }
    return {
        start,
        end: end + 1,
        key: key.value
    };
}

/**
 * @brief Read a single or double quoted string literal.
 */
function readStringLiteral(code: string, start: number): StringLiteralRead | undefined {
    const quote = code.charCodeAt(start);
    if (quote !== 34 && quote !== 39) {
        return undefined;
    }
    const chars: string[] = [];
    let index = start + 1;
    while (index < code.length) {
        const current = code.charCodeAt(index);
        if (current === quote) {
            return {
                value: chars.join(""),
                end: index + 1
            };
        }
        if (current === 92) {
            const escaped = code[index + 1];
            if (escaped === undefined) {
                return undefined;
            }
            chars.push(escaped);
            index += 2;
            continue;
        }
        chars.push(code[index] ?? "");
        index += 1;
    }
    return undefined;
}

/**
 * @brief Collect TypeSea compileCached bindings from static imports.
 */
function readCompileCachedBindings(code: string): CompileCachedBindings {
    const functions = new Set<string>();
    const namespaces = new Set<string>();
    let index = 0;
    let blockDepth = 0;
    while (index < code.length) {
        const skipped = skipNonCode(code, index);
        if (skipped !== index) {
            index = skipped;
            continue;
        }
        const current = code.charCodeAt(index);
        if (current === 123) {
            blockDepth += 1;
            index += 1;
            continue;
        }
        if (current === 125) {
            blockDepth = Math.max(0, blockDepth - 1);
            index += 1;
            continue;
        }
        const identifier = readIdentifier(code, index);
        if (identifier === undefined) {
            index += 1;
            continue;
        }
        if (blockDepth === 0 && identifier.value === "import") {
            const declaration = readStaticImport(code, identifier.end);
            if (declaration !== undefined) {
                if (isTypeSeaImportSource(declaration.source)) {
                    readCompileCachedBindingsFromImport(
                        declaration.clause,
                        functions,
                        namespaces
                    );
                }
                index = declaration.end;
                continue;
            }
        }
        index = identifier.end;
    }
    return {
        functions,
        namespaces
    };
}

/**
 * @brief Read one static import declaration after the import keyword.
 */
function readStaticImport(code: string, afterImport: number): StaticImportRead | undefined {
    const cursor = skipTrivia(code, afterImport);
    if (code.charCodeAt(cursor) === 40) {
        return undefined;
    }
    if (identifierAt(code, cursor, "type")) {
        return undefined;
    }
    const sideEffectSource = readStringLiteral(code, cursor);
    if (sideEffectSource !== undefined) {
        return {
            clause: "",
            source: sideEffectSource.value,
            end: skipOptionalSemicolon(code, sideEffectSource.end)
        };
    }
    const from = findImportFrom(code, cursor);
    if (from === undefined) {
        return undefined;
    }
    const source = readStringLiteral(code, skipTrivia(code, from + "from".length));
    if (source === undefined) {
        return undefined;
    }
    return {
        clause: code.slice(cursor, from),
        source: source.value,
        end: skipOptionalSemicolon(code, source.end)
    };
}

/**
 * @brief Locate the from keyword in a static import clause.
 */
function findImportFrom(code: string, start: number): number | undefined {
    let index = start;
    let braceDepth = 0;
    while (index < code.length) {
        const skipped = skipNonCode(code, index);
        if (skipped !== index) {
            index = skipped;
            continue;
        }
        const current = code.charCodeAt(index);
        if (current === 59) {
            return undefined;
        }
        if (current === 123) {
            braceDepth += 1;
            index += 1;
            continue;
        }
        if (current === 125) {
            braceDepth = Math.max(0, braceDepth - 1);
            index += 1;
            continue;
        }
        const identifier = readIdentifier(code, index);
        if (identifier === undefined) {
            index += 1;
            continue;
        }
        if (braceDepth === 0 && identifier.value === "from") {
            return index;
        }
        index = identifier.end;
    }
    return undefined;
}

/**
 * @brief Extract compileCached named and namespace imports from one clause.
 */
function readCompileCachedBindingsFromImport(
    clause: string,
    functions: Set<string>,
    namespaces: Set<string>
): void {
    readNamespaceImportBinding(clause, namespaces);
    const named = readNamedImportClause(clause);
    if (named !== undefined) {
        readNamedCompileCachedBindings(named, functions);
    }
}

/**
 * @brief Extract `import * as ns` bindings.
 */
function readNamespaceImportBinding(clause: string, namespaces: Set<string>): void {
    const star = skipTrivia(clause, 0);
    if (clause.charCodeAt(star) !== 42) {
        return;
    }
    const keyword = readIdentifier(clause, skipTrivia(clause, star + 1));
    if (keyword?.value !== "as") {
        return;
    }
    const local = readIdentifier(clause, skipTrivia(clause, keyword.end));
    if (local !== undefined) {
        namespaces.add(local.value);
    }
}

/**
 * @brief Read the contents of a named import brace pair.
 */
function readNamedImportClause(clause: string): string | undefined {
    const open = clause.indexOf("{");
    if (open < 0) {
        return undefined;
    }
    let depth = 0;
    for (let index = open; index < clause.length; index += 1) {
        const current = clause.charCodeAt(index);
        if (current === 123) {
            depth += 1;
            continue;
        }
        if (current === 125) {
            depth -= 1;
            if (depth === 0) {
                return clause.slice(open + 1, index);
            }
        }
    }
    return undefined;
}

/**
 * @brief Extract compileCached local names from a named import list.
 */
function readNamedCompileCachedBindings(named: string, functions: Set<string>): void {
    const parts = named.split(",");
    for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        if (part === undefined) {
            continue;
        }
        const names = readImportSpecifierIdentifiers(part);
        if (names[0] !== "compileCached") {
            continue;
        }
        const asIndex = names.indexOf("as");
        functions.add(asIndex >= 0
            ? names[asIndex + 1] ?? "compileCached"
            : "compileCached");
    }
}

/**
 * @brief Read identifiers from one import specifier while ignoring `type`.
 */
function readImportSpecifierIdentifiers(specifier: string): string[] {
    const names: string[] = [];
    let index = 0;
    while (index < specifier.length) {
        const skipped = skipNonCode(specifier, index);
        if (skipped !== index) {
            index = skipped;
            continue;
        }
        const identifier = readIdentifier(specifier, index);
        if (identifier === undefined) {
            index += 1;
            continue;
        }
        if (identifier.value !== "type") {
            names.push(identifier.value);
        }
        index = identifier.end;
    }
    return names;
}

/**
 * @brief Check whether an import source belongs to TypeSea.
 */
function isTypeSeaImportSource(source: string): boolean {
    return source === "typesea" || source.startsWith("typesea/");
}

/**
 * @brief Read an identifier at one source index.
 */
function readIdentifier(code: string, start: number): IdentifierRead | undefined {
    const first = code.charCodeAt(start);
    if (!isIdentifierStartCode(first)) {
        return undefined;
    }
    let index = start + 1;
    while (index < code.length && isIdentifierPartCode(code.charCodeAt(index))) {
        index += 1;
    }
    return {
        value: code.slice(start, index),
        end: index
    };
}

/**
 * @brief Check for a whole identifier at one index.
 */
function identifierAt(code: string, start: number, expected: string): boolean {
    return code.startsWith(expected, start) &&
        isIdentifierBoundary(code, start - 1) &&
        isIdentifierBoundary(code, start + expected.length);
}

/**
 * @brief Find a matching closing parenthesis while skipping strings/comments.
 */
function findMatchingParen(code: string, open: number): number | undefined {
    let depth = 0;
    let index = open;
    while (index < code.length) {
        const current = code.charCodeAt(index);
        if (current === 34 || current === 39 || current === 96) {
            index = skipString(code, index);
            continue;
        }
        if (current === 47 && code.charCodeAt(index + 1) === 47) {
            index = skipLineComment(code, index + 2);
            continue;
        }
        if (current === 47 && code.charCodeAt(index + 1) === 42) {
            index = skipBlockComment(code, index + 2);
            continue;
        }
        if (current === 47 && isRegularExpressionStart(code, index)) {
            index = skipRegularExpression(code, index);
            continue;
        }
        if (current === 40) {
            depth += 1;
        }
        if (current === 41) {
            depth -= 1;
            if (depth === 0) {
                return index;
            }
        }
        index += 1;
    }
    return undefined;
}

/**
 * @brief Skip a quoted string or template body conservatively.
 */
function skipString(code: string, start: number): number {
    const quote = code.charCodeAt(start);
    let index = start + 1;
    while (index < code.length) {
        const current = code.charCodeAt(index);
        if (current === 92) {
            index += 2;
            continue;
        }
        if (current === quote) {
            return index + 1;
        }
        index += 1;
    }
    return code.length;
}

/**
 * @brief Skip a line comment.
 */
function skipLineComment(code: string, start: number): number {
    let index = start;
    while (index < code.length && code.charCodeAt(index) !== 10) {
        index += 1;
    }
    return index;
}

/**
 * @brief Skip a block comment.
 */
function skipBlockComment(code: string, start: number): number {
    let index = start;
    while (index < code.length) {
        if (code.charCodeAt(index) === 42 && code.charCodeAt(index + 1) === 47) {
            return index + 2;
        }
        index += 1;
    }
    return code.length;
}

/**
 * @brief Build import statements for transformed AOT guards.
 */
function makeAotImports(matches: readonly CompileCachedMatch[]): string {
    const seen = new Set<string>();
    const chunks: string[] = [];
    for (let index = 0; index < matches.length; index += 1) {
        const match = matches[index];
        if (match === undefined || seen.has(match.key)) {
            continue;
        }
        seen.add(match.key);
        chunks.push(
            `import ${makeAotImportName(match.key)} from ${JSON.stringify(`${VIRTUAL_PREFIX}${match.key}`)};\n`
        );
    }
    return chunks.join("");
}

/** Preserve executable preambles before adding generated module imports. */
function insertAotImports(code: string, imports: string): string {
    const insertion = findAotImportInsertionPoint(code);
    const prefix = code.slice(0, insertion);
    const separator = insertion > 0 &&
        code.charCodeAt(insertion - 1) !== 10 &&
        code.charCodeAt(insertion - 1) !== 13
        ? "\n"
        : "";
    return `${prefix}${separator}${imports}${code.slice(insertion)}`;
}

/** Find the first offset after a shebang and directive prologue. */
function findAotImportInsertionPoint(code: string): number {
    let cursor = 0;
    if (code.startsWith("#!")) {
        const newline = code.indexOf("\n");
        cursor = newline < 0 ? code.length : newline + 1;
    }
    for (;;) {
        const statement = skipTrivia(code, cursor);
        const directive = readStringLiteral(code, statement);
        if (directive === undefined) {
            return statement;
        }
        const end = readDirectiveEnd(code, directive.end);
        if (end === undefined) {
            return statement;
        }
        cursor = end;
    }
}

/** Read the terminator of one directive-prologue string expression. */
function readDirectiveEnd(code: string, start: number): number | undefined {
    let index = start;
    for (;;) {
        while (code.charCodeAt(index) === 9 || code.charCodeAt(index) === 32) {
            index += 1;
        }
        if (code.charCodeAt(index) !== 47 || code.charCodeAt(index + 1) !== 42) {
            break;
        }
        index = skipBlockComment(code, index + 2);
    }
    if (code.charCodeAt(index) === 59) {
        return index + 1;
    }
    if (index >= code.length ||
        code.charCodeAt(index) === 10 ||
        code.charCodeAt(index) === 13) {
        return start;
    }
    if (code.charCodeAt(index) === 47 && code.charCodeAt(index + 1) === 47) {
        const newline = skipLineComment(code, index + 2);
        return newline < code.length ? newline + 1 : newline;
    }
    return undefined;
}

/**
 * @brief Make a stable local import binding for one entry id.
 */
function makeAotImportName(id: string): string {
    let output = "__typesea_aot";
    for (let index = 0; index < id.length; index += 1) {
        const code = id.charCodeAt(index);
        if ((code >= 48 && code <= 57) ||
            (code >= 65 && code <= 90) ||
            (code >= 97 && code <= 122)) {
            output += id[index] ?? "";
            continue;
        }
        output += `_${code.toString(16)}_`;
    }
    return output;
}

/**
 * @brief Read the user-facing id from a virtual module id.
 */
function readVirtualId(id: string): string {
    return id.slice(VIRTUAL_PREFIX.length);
}

/**
 * @brief Decide whether transform() should inspect this module id.
 */
function isTransformableModule(id: string): boolean {
    return id.endsWith(".ts") ||
        id.endsWith(".tsx") ||
        id.endsWith(".js") ||
        id.endsWith(".jsx") ||
        id.endsWith(".mts") ||
        id.endsWith(".cts") ||
        id.endsWith(".mjs") ||
        id.endsWith(".cjs");
}

function isJsxModule(id: string): boolean {
    return id.endsWith(".tsx") || id.endsWith(".jsx");
}

/**
 * @brief Skip ASCII whitespace.
 */
function skipWhitespace(code: string, start: number): number {
    let index = start;
    while (index < code.length) {
        const current = code.charCodeAt(index);
        if (current !== 9 && current !== 10 && current !== 13 && current !== 32) {
            return index;
        }
        index += 1;
    }
    return index;
}

/**
 * @brief Skip whitespace and comments between tokens.
 */
function skipTrivia(code: string, start: number): number {
    let index = start;
    for (;;) {
        const whitespace = skipWhitespace(code, index);
        if (whitespace !== index) {
            index = whitespace;
            continue;
        }
        if (code.charCodeAt(index) === 47 && code.charCodeAt(index + 1) === 47) {
            index = skipLineComment(code, index + 2);
            continue;
        }
        if (code.charCodeAt(index) === 47 && code.charCodeAt(index + 1) === 42) {
            index = skipBlockComment(code, index + 2);
            continue;
        }
        return index;
    }
}

/**
 * @brief Skip source regions that are not executable tokens.
 */
function skipNonCode(code: string, start: number): number {
    const current = code.charCodeAt(start);
    if (current === 34 || current === 39 || current === 96) {
        return skipString(code, start);
    }
    if (current === 47 && code.charCodeAt(start + 1) === 47) {
        return skipLineComment(code, start + 2);
    }
    if (current === 47 && code.charCodeAt(start + 1) === 42) {
        return skipBlockComment(code, start + 2);
    }
    if (current === 47 && isRegularExpressionStart(code, start)) {
        return skipRegularExpression(code, start);
    }
    return start;
}

/**
 * @brief Skip one optional semicolon after an import source literal.
 */
function skipOptionalSemicolon(code: string, start: number): number {
    const semicolon = skipTrivia(code, start);
    return code.charCodeAt(semicolon) === 59 ? semicolon + 1 : semicolon;
}

/**
 * @brief Check identifier start code points used by JavaScript ASCII names.
 */
function isIdentifierStartCode(code: number): boolean {
    return code === 36 ||
        code === 95 ||
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122);
}

/**
 * @brief Check identifier continuation code points used by JavaScript ASCII names.
 */
function isIdentifierPartCode(code: number): boolean {
    return isIdentifierStartCode(code) ||
        (code >= 48 && code <= 57);
}

/**
 * @brief Check identifier boundary around compileCached text.
 */
function isIdentifierBoundary(code: string, index: number): boolean {
    if (index < 0 || index >= code.length) {
        return true;
    }
    const current = code.charCodeAt(index);
    return !(
        current === 36 ||
        current === 95 ||
        (current >= 48 && current <= 57) ||
        (current >= 65 && current <= 90) ||
        (current >= 97 && current <= 122)
    );
}

/**
 * @brief Render AOT scanner issues into one build error.
 */
function formatAotIssues(
    id: string,
    issues: readonly AotIssue[]
): string {
    const chunks = [`TypeSea AOT entry ${id} cannot be emitted:`];
    for (let index = 0; index < issues.length; index += 1) {
        const issue = issues[index];
        if (issue !== undefined) {
            chunks.push(`- ${issue.code} at ${formatPath(issue.path)}: ${issue.message}`);
        }
    }
    return chunks.join("\n");
}

/**
 * @brief Format a path for build-time errors.
 */
function formatPath(path: readonly (string | number)[]): string {
    if (path.length === 0) {
        return "<root>";
    }
    return path.join(".");
}

/**
 * @brief Check plain record shape.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
