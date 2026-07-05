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
    readonly options: Partial<AotCompileOptions> | undefined;
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
    readonly transformCompileCached: boolean | undefined;

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
            return transformCompileCachedCalls(code, state);
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
                        const transformed = transformCompileCachedCalls(source, state);
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
    state: AotPluginState
): TypeSeaTransformResult | null {
    if (!code.includes("compileCached")) {
        return null;
    }
    const replacements: CompileCachedMatch[] = [];
    let offset = 0;
    for (;;) {
        const match = findCompileCachedCall(code, offset);
        if (match === undefined) {
            break;
        }
        offset = match.end;
        if (state.entries.has(match.key)) {
            replacements.push(match);
        }
    }
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
    return {
        code: imports + chunks.join(""),
        map: null
    };
}

/**
 * @brief Find the next compileCached call with a static string key.
 */
function findCompileCachedCall(
    code: string,
    offset: number
): CompileCachedMatch | undefined {
    const needle = "compileCached";
    let index = code.indexOf(needle, offset);
    while (index >= 0) {
        if (isIdentifierBoundary(code, index - 1) &&
            isIdentifierBoundary(code, index + needle.length)) {
            const open = skipWhitespace(code, index + needle.length);
            if (code.charCodeAt(open) === 40) {
                return readCompileCachedCall(code, index, open);
            }
        }
        index = code.indexOf(needle, index + needle.length);
    }
    return undefined;
}

/**
 * @brief Read a compileCached call once the opening parenthesis is known.
 */
function readCompileCachedCall(
    code: string,
    start: number,
    open: number
): CompileCachedMatch | undefined {
    const keyStart = skipWhitespace(code, open + 1);
    const key = readStringLiteral(code, keyStart);
    if (key === undefined) {
        return undefined;
    }
    const end = findMatchingParen(code, open);
    if (end === undefined) {
        return undefined;
    }
    return {
        start,
        end: end + 1,
        key
    };
}

/**
 * @brief Read a single or double quoted string literal.
 */
function readStringLiteral(code: string, start: number): string | undefined {
    const quote = code.charCodeAt(start);
    if (quote !== 34 && quote !== 39) {
        return undefined;
    }
    const chars: string[] = [];
    let index = start + 1;
    while (index < code.length) {
        const current = code.charCodeAt(index);
        if (current === quote) {
            return chars.join("");
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
        output += "_";
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
