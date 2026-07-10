import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, expectTypeOf, test } from "vitest";
import {
    createTypeSeaEsbuildPlugin,
    createTypeSeaRollupPlugin,
    emitAotModule,
    t,
    type AotCompileOptions,
    type AotModule,
    type CheckResult,
    type TypeSeaEsbuildBuild,
    type TypeSeaEsbuildFilter,
    type TypeSeaEsbuildLoadArgs,
    type TypeSeaEsbuildLoadFilter,
    type TypeSeaEsbuildLoadResult,
    type TypeSeaEsbuildResolveArgs,
    type TypeSeaEsbuildResolveResult
} from "../src/index.js";

interface AotRuntimeModule {
    readonly is: (value: unknown) => boolean;
    readonly check: (value: unknown) => CheckResult<unknown>;
    readonly checkFirst: (value: unknown) => CheckResult<unknown>;
    readonly assert: (value: unknown) => void;
    readonly default: {
        readonly is: (value: unknown) => boolean;
        readonly check: (value: unknown) => CheckResult<unknown>;
        readonly checkFirst: (value: unknown) => CheckResult<unknown>;
        readonly assert: (value: unknown) => void;
    };
}

interface EsbuildResolveRegistration {
    readonly options: TypeSeaEsbuildFilter;
    readonly callback: (args: TypeSeaEsbuildResolveArgs) =>
        TypeSeaEsbuildResolveResult;
}

interface EsbuildLoadRegistration {
    readonly options: TypeSeaEsbuildLoadFilter;
    readonly callback: (args: TypeSeaEsbuildLoadArgs) =>
        TypeSeaEsbuildLoadResult |
        null |
        Promise<TypeSeaEsbuildLoadResult | null>;
}

describe("AOT module emission", () => {
    test("serves AOT virtual modules and rewrites compileCached macros", () => {
        const User = t.strictObject({
            id: t.string,
            age: t.number.int()
        });
        const plugin = createTypeSeaRollupPlugin({
            entries: [
                {
                    id: "user",
                    guard: User,
                    options: { name: "aotUser" }
                }
            ],
            transformCompileCached: true
        });
        const resolved = plugin.resolveId("typesea:aot/user");
        const transformed = plugin.transform(
            "import { compileCached } from \"typesea\";\nconst User = compileCached(\"user\", () => makeUser(), { name: \"aotUser\" });\nexport { User };",
            "/project/src/user.ts"
        );

        expect(resolved).toBe("\0typesea:aot/user");
        expect(plugin.load("\0typesea:aot/user")).toContain("export function is");
        expect(transformed?.code).toContain("import __typesea_aotuser from \"typesea:aot/user\";");
        expect(transformed?.code).toContain("const User = __typesea_aotuser;");
        expect(transformed?.code).not.toContain("compileCached(");
    });

    test("rewrites compileCached macros through the esbuild source loader", async () => {
        const User = t.strictObject({
            id: t.string,
            age: t.number.int()
        });
        const resolves: EsbuildResolveRegistration[] = [];
        const loads: EsbuildLoadRegistration[] = [];
        const build: TypeSeaEsbuildBuild = {
            onResolve(options, callback): void {
                resolves.push({ options, callback });
            },

            onLoad(options, callback): void {
                loads.push({ options, callback });
            }
        };
        const plugin = createTypeSeaEsbuildPlugin({
            entries: [
                {
                    id: "user",
                    guard: User,
                    options: { name: "aotUser" }
                }
            ],
            transformCompileCached: true,
            readFile(path): string {
                expect(path).toBe("/project/src/user.ts");
                return "import { compileCached } from \"typesea\";\nconst User = compileCached(\"user\", () => makeUser(), { name: \"aotUser\" });\nexport { User };";
            }
        });

        plugin.setup(build);
        const sourceLoad = loads.find((entry) => entry.options.namespace === "file");
        const virtualLoad = loads.find((entry) => entry.options.namespace === "typesea-aot");
        const resolved = resolves[0]?.callback({ path: "typesea:aot/user" });
        const virtualModule = await virtualLoad?.callback({ path: "user" });
        const transformed = await sourceLoad?.callback({
            path: "/project/src/user.ts"
        });

        expect(resolved).toEqual({
            path: "user",
            namespace: "typesea-aot"
        });
        expect(virtualModule?.contents).toContain("export function is");
        expect(transformed?.loader).toBe("ts");
        expect(transformed?.contents)
            .toContain("import __typesea_aotuser from \"typesea:aot/user\";");
        expect(transformed?.contents).toContain("const User = __typesea_aotuser;");
        expect(transformed?.contents).not.toContain("compileCached(");
    });

    test("rewrites only TypeSea compileCached bindings outside comments and strings", () => {
        const User = t.strictObject({
            id: t.string
        });
        const plugin = createTypeSeaRollupPlugin({
            entries: [
                {
                    id: "user",
                    guard: User,
                    options: undefined
                }
            ],
            transformCompileCached: true
        });
        const transformed = plugin.transform([
            "import { compileCached as cached } from \"typesea\";",
            "const text = \"compileCached('user', () => bad)\";",
            "// compileCached(\"user\", () => bad)",
            "/* compileCached(\"user\", () => bad) */",
            "const User = cached(\"user\", () => makeUser());"
        ].join("\n"), "/project/src/user.ts");
        const local = plugin.transform([
            "const compileCached = (value: string) => value;",
            "const value = compileCached(\"user\");"
        ].join("\n"), "/project/src/local.ts");

        expect(transformed?.code).toContain("import __typesea_aotuser from \"typesea:aot/user\";");
        expect(transformed?.code).toContain("const User = __typesea_aotuser;");
        expect(transformed?.code).toContain("\"compileCached('user', () => bad)\"");
        expect(transformed?.code).toContain("// compileCached(\"user\", () => bad)");
        expect(transformed?.code).toContain("/* compileCached(\"user\", () => bad) */");
        expect(local).toBeNull();
    });

    test("rewrites macros in object literals and template expressions", () => {
        const User = t.strictObject({
            id: t.string
        });
        const plugin = createTypeSeaRollupPlugin({
            entries: [
                {
                    id: "user",
                    guard: User,
                    options: undefined
                }
            ],
            transformCompileCached: true
        });
        const transformed = plugin.transform([
            "import { compileCached as cached } from \"typesea\";",
            "const Guards = { User: cached(\"user\", () => makeUser()) };",
            "const Label = `${cached(\"user\", () => makeUser()).is(value)}`;",
            "function local() { return cached(\"user\", () => makeUser()); }"
        ].join("\n"), "/project/src/expressions.ts");

        expect(transformed?.code)
            .toContain("const Guards = { User: __typesea_aotuser };");
        expect(transformed?.code)
            .toContain("const Label = `${__typesea_aotuser.is(value)}`;");
        expect(transformed?.code)
            .toContain("function local() { return cached(\"user\", () => makeUser()); }");
        expect(transformed?.code.match(/typesea:aot\/user/gu)).toHaveLength(1);
    });

    test("emits importable ESM validators matching interpreter semantics", async () => {
        const User = t.strictObject({
            id: t.string.min(1),
            count: t.number.int().gte(0),
            role: t.union(t.literal("admin"), t.literal("user")),
            meta: t.optional(t.object({
                nan: t.literal(Number.NaN),
                negativeZero: t.literal(-0),
                marker: t.literal(1n)
            }))
        });
        const emitted = emitAotModule(User, { name: "aotUser" });
        expect(emitted.ok).toBe(true);
        if (!emitted.ok) {
            return;
        }

        const runtime = await importAotModule(emitted.value);
        const values: readonly unknown[] = [
            {
                id: "u",
                count: 1,
                role: "admin"
            },
            {
                id: "u",
                count: 1,
                role: "user",
                meta: {
                    nan: Number.NaN,
                    negativeZero: -0,
                    marker: 1n
                }
            },
            {
                id: "",
                count: 1,
                role: "admin"
            },
            {
                id: "u",
                count: 1.5,
                role: "admin"
            },
            {
                id: "u",
                count: 1,
                role: "guest"
            },
            {
                id: "u",
                count: 1,
                role: "admin",
                extra: true
            }
        ];

        expect(emitted.value.source).not.toContain("new Function");
        expect(emitted.value.declarationSource).toContain("AotCheckResult");
        for (let index = 0; index < values.length; index += 1) {
            const value = values[index];
            expect(runtime.is(value), `is ${String(index)}`).toBe(User.is(value));
            expect(runtime.default.is(value), `default is ${String(index)}`)
                .toBe(User.is(value));
            expect(runtime.check(value), `check ${String(index)}`).toEqual(User.check(value));
            expect(runtime.checkFirst(value), `checkFirst ${String(index)}`)
                .toEqual(User.checkFirst(value));
        }

        const invalid = runtime.check(values[2]);
        expect(invalid.ok).toBe(false);
        if (!invalid.ok) {
            expect(Object.isFrozen(invalid.error)).toBe(true);
            expect(Object.isFrozen(invalid.error[0]?.path)).toBe(true);
        }
        expect(() => {
            runtime.assert(values[2]);
        }).toThrow(Error);
    });

    test("emits metadata, message, and keyed-object wrappers without dynamic fallback", async () => {
        const Contact = t.object({
            email: t.optional(t.string.email().message("email must be valid")),
            phone: t.optional(t.string.min(1))
        })
            .oneOfKeys(["email", "phone"])
            .describe("Reachable contact endpoint");
        const emitted = emitAotModule(Contact, { name: "aotContact" });
        expect(emitted.ok).toBe(true);
        if (!emitted.ok) {
            return;
        }

        const runtime = await importAotModule(emitted.value);
        const values: readonly unknown[] = [
            { email: "ada@example.com" },
            { phone: "555-0100" },
            {},
            { email: "ada@example.com", phone: "555-0100" },
            { email: "not-email" }
        ];

        expect(emitted.value.source).not.toContain("m(");
        for (let index = 0; index < values.length; index += 1) {
            const value = values[index];
            expect(runtime.is(value), String(index)).toBe(Contact.is(value));
            expect(runtime.check(value), String(index)).toEqual(Contact.check(value));
            expect(runtime.checkFirst(value), String(index)).toEqual(Contact.checkFirst(value));
        }
        const invalid = runtime.check({ email: "not-email" });
        expect(invalid.ok).toBe(false);
        if (!invalid.ok) {
            expect(invalid.error[0]?.message).toBe("email must be valid");
        }
    });

    test("emits BigInt bound checks when no modulo fallback is needed", async () => {
        const Count = t.bigint.gte(1n).lt(10n);
        const emitted = emitAotModule(Count, { name: "aotBigIntCount" });

        expect(emitted.ok).toBe(true);
        if (!emitted.ok) {
            return;
        }

        const runtime = await importAotModule(emitted.value);

        expect(runtime.is(1n)).toBe(true);
        expect(runtime.is(9n)).toBe(true);
        expect(runtime.is(0n)).toBe(false);
        expect(runtime.is(10n)).toBe(false);
        expect(runtime.check(0n)).toEqual(Count.check(0n));
        expect(runtime.checkFirst(10n)).toEqual(Count.checkFirst(10n));
    });

    test("rejects non-serializable AOT schemas", () => {
        const Refined = emitAotModule(t.string.refine(
            (value) => value.length > 0,
            "non_empty"
        ));
        const SuperRefined = emitAotModule(t.string.superRefine((value, context) => {
            if (value.length === 0) {
                context.addIssue();
            }
        }, "non_empty"));
        const Lazy = emitAotModule(t.lazy(() => t.string));
        const DateGuard = emitAotModule(t.date);
        const BigIntRange = emitAotModule(t.bigint.multipleOf(2n));
        const ReadonlyGuard = emitAotModule(t.object({ name: t.string }).readonly());
        const SymbolLiteral = emitAotModule(t.literal(Symbol("marker")));

        expect(Refined.ok).toBe(false);
        if (!Refined.ok) {
            expect(Refined.error[0]?.code).toBe("unsupported_aot_refine");
            expect(Object.isFrozen(Refined.error)).toBe(true);
        }
        expect(SuperRefined.ok).toBe(false);
        if (!SuperRefined.ok) {
            expect(SuperRefined.error[0]?.code).toBe("unsupported_aot_refine");
        }
        expect(Lazy.ok).toBe(false);
        if (!Lazy.ok) {
            expect(Lazy.error[0]?.code).toBe("unsupported_aot_lazy");
        }
        expect(DateGuard.ok).toBe(false);
        if (!DateGuard.ok) {
            expect(DateGuard.error[0]?.code).toBe("unsupported_aot_date");
        }
        expect(BigIntRange.ok).toBe(false);
        if (!BigIntRange.ok) {
            expect(BigIntRange.error[0]?.code).toBe("unsupported_aot_bigint_checks");
        }
        expect(ReadonlyGuard.ok).toBe(false);
        if (!ReadonlyGuard.ok) {
            expect(ReadonlyGuard.error[0]?.code).toBe("unsupported_aot_readonly");
        }
        expect(SymbolLiteral.ok).toBe(false);
        if (!SymbolLiteral.ok) {
            expect(SymbolLiteral.error[0]?.code).toBe("unsupported_aot_symbol_literal");
        }
    });

    test("rejects strict object extras when required keys are non-enumerable", async () => {
        const Shape = t.strictObject({
            id: t.string,
            name: t.string
        });
        const emitted = emitAotModule(Shape, { name: "aotStrictDescriptorShape" });
        expect(emitted.ok).toBe(true);
        if (!emitted.ok) {
            return;
        }

        const runtime = await importAotModule(emitted.value);
        const value: Record<string, unknown> = {
            extra: true
        };
        Object.defineProperty(value, "id", {
            configurable: true,
            enumerable: false,
            value: "u-1"
        });
        Object.defineProperty(value, "name", {
            configurable: true,
            enumerable: false,
            value: "Ada"
        });

        expect(Shape.is(value)).toBe(false);
        expect(runtime.is(value)).toBe(false);
        expect(runtime.check(value)).toEqual(Shape.check(value));
    });

    test("emits unsafe AOT validators for trusted normalized data", async () => {
        const Shape = t.strictObject({
            id: t.string
        });
        const emitted = emitAotModule(Shape, {
            name: "aotUnsafeShape",
            mode: "unsafe"
        });
        expect(emitted.ok).toBe(true);
        if (!emitted.ok) {
            return;
        }

        const runtime = await importAotModule(emitted.value);
        let reads = 0;
        const accessor: { readonly id?: string } = {};

        Object.defineProperty(accessor, "id", {
            enumerable: true,
            get(): string {
                reads += 1;
                return "u1";
            }
        });

        const predicateSource = readGeneratedFunctionSource(
            emitted.value.source,
            "aotUnsafeShape"
        );

        expect(predicateSource).toContain("v.id");
        expect(predicateSource).not.toContain("gp(v,u[0])");
        expect(predicateSource).not.toContain("[u[0]]");
        expect(Shape.is(accessor)).toBe(false);
        expect(reads).toBe(0);
        expect(runtime.is(accessor)).toBe(true);
        expect(reads).toBe(1);
        expect(runtime.check(accessor).ok).toBe(true);
    });

    test("rejects unknown AOT compile modes", () => {
        expect(() => {
            emitAotModule(t.string, { mode: "loose" as never });
        }).toThrow(TypeError);
    });

    test("emits unchecked AOT validators that trust strict object shapes", async () => {
        const Shape = t.strictObject({
            id: t.string
        });
        const emitted = emitAotModule(Shape, {
            name: "aotUncheckedShape",
            mode: "unchecked"
        });
        expect(emitted.ok).toBe(true);
        if (!emitted.ok) {
            return;
        }

        const runtime = await importAotModule(emitted.value);
        const predicateSource = readGeneratedFunctionSource(
            emitted.value.source,
            "aotUncheckedShape"
        );
        const value = {
            id: "u1",
            extra: true
        };

        expect(predicateSource).toContain("v.id");
        expect(predicateSource).not.toContain("for(const key");
        expect(Shape.is(value)).toBe(false);
        expect(runtime.is(value)).toBe(true);
        expect(runtime.check(value).ok).toBe(true);
    });

    test("preserves AOT module result types", () => {
        const emitted = emitAotModule(t.string);
        expectTypeOf<typeof emitted>().toEqualTypeOf<
            CheckResult<AotModule> extends never
                ? never
                : ReturnType<typeof emitAotModule>
        >();
        expectTypeOf<AotCompileOptions["mode"]>()
            .toEqualTypeOf<"safe" | "unsafe" | "unchecked" | undefined>();
        expect(emitted.ok).toBe(true);
    });
});

/**
 * @brief Read generated function source.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function readGeneratedFunctionSource(
    source: string,
    name: string
): string {
    const start = source.indexOf(`function ${name}`);
    expect(start).toBeGreaterThanOrEqual(0);
    const bodyStart = source.indexOf("{", start);
    expect(bodyStart).toBeGreaterThanOrEqual(start);
    let depth = 0;
    for (let index = bodyStart; index < source.length; index += 1) {
        const char = source[index];
        if (char === "{") {
            depth += 1;
        } else if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                return source.slice(start, index + 1);
            }
        }
    }
    return source.slice(start);
}

/**
 * @brief Execute import aot module.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
async function importAotModule(module: AotModule): Promise<AotRuntimeModule> {
    const root = await mkdtemp(join(tmpdir(), "typesea-aot-"));
    const file = join(root, "validator.mjs");
    await writeFile(file, module.source, "utf8");
    const imported = await import(pathToFileURL(file).href) as AotRuntimeModule;
    await rm(root, {
        recursive: true
    });
    return imported;
}
