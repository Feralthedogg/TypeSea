import ts from "typescript";
import { describe, expect, it } from "vitest";
import { t } from "../src/index.js";
import {
    emitTypeDeclarations,
    precompileSchemaDocs
} from "../src/codegen/index.js";

describe("schema documentation codegen", () => {
    const Address = t.object({
        street: t.string.describe("Street used for delivery")
    });
    const User = t.object({
        id: t.string.describe("Stable user identifier"),
        nickname: t.string.describe("Public display name").optional(),
        address: Address.describe("Mailing address")
    }).describe("Application user payload");

    it("emits top-level and nested description JSDoc", () => {
        const source = emitTypeDeclarations({
            entries: [{
                name: "User",
                guard: User,
                source: "./schema.js"
            }]
        });

        expect(source).toContain(" * Application user payload");
        expect(source).toContain(" * Stable user identifier");
        expect(source).toContain(" * Public display name");
        expect(source).toContain("readonly \"nickname\"?:");
        expect(source).toContain(" * Mailing address");
        expect(source).toContain(" * Street used for delivery");
        expect(source).toContain(
            "type $TypeSeaGeneratedSchema0 = " +
            "(typeof import(\"./schema.js\"))[\"User\"];"
        );
        expect(precompileSchemaDocs({
            entries: [{
                name: "User",
                guard: User,
                source: "./schema.js"
            }]
        })).toBe(source);

        const transpiled = ts.transpileModule(
            source,
            {
                compilerOptions: {
                    module: ts.ModuleKind.ESNext,
                    target: ts.ScriptTarget.ES2023
                },
                fileName: "user.generated.ts",
                reportDiagnostics: true
            }
        );
        expect(transpiled.diagnostics ?? []).toEqual([]);
    });

    it("keeps generated aliases exact and exposes descriptions to the checker", () => {
        const generatedPath = "/virtual/user.generated.ts";
        const schemaPath = "/virtual/schema.ts";
        const ambientPath = "/virtual/typesea.d.ts";
        const generated = `${emitTypeDeclarations({
            entries: [{
                name: "User",
                guard: User,
                source: "./schema"
            }]
        })}\ndeclare const user: User;\nuser.id;\nuser.address.street;\n`;
        const files = new Map<string, string>([
            [generatedPath, generated],
            [schemaPath, [
                "export declare const User: {",
                "  readonly __value: {",
                "    readonly id: string;",
                "    readonly nickname?: string;",
                "    readonly address: { readonly street: string };",
                "  };",
                "};"
            ].join("\n")],
            [ambientPath, [
                "declare module \"typesea\" {",
                "  export type Infer<TGuard> =",
                "    TGuard extends { readonly __value: infer TValue } ? TValue : never;",
                "}"
            ].join("\n")]
        ]);
        const compilerOptions: ts.CompilerOptions = {
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            noEmit: true,
            strict: true,
            target: ts.ScriptTarget.ES2023
        };
        const host = ts.createCompilerHost(compilerOptions);
        const fallbackGetSourceFile = host.getSourceFile.bind(host);
        const fallbackFileExists = host.fileExists.bind(host);
        const fallbackReadFile = host.readFile.bind(host);
        const fallbackDirectoryExists = host.directoryExists?.bind(host);
        host.getSourceFile = (
            fileName,
            languageVersion
        ): ts.SourceFile | undefined => {
            const source = files.get(fileName);
            return source === undefined
                ? fallbackGetSourceFile(fileName, languageVersion)
                : ts.createSourceFile(fileName, source, languageVersion, true);
        };
        host.fileExists = (fileName): boolean =>
            files.has(fileName) || fallbackFileExists(fileName);
        host.readFile = (fileName): string | undefined =>
            files.get(fileName) ?? fallbackReadFile(fileName);
        host.directoryExists = (directoryName): boolean =>
            directoryName === "/virtual" ||
            (fallbackDirectoryExists?.(directoryName) ?? false);
        const program = ts.createProgram({
            rootNames: [generatedPath, schemaPath, ambientPath],
            options: compilerOptions,
            host
        });
        const diagnostics = ts.getPreEmitDiagnostics(program).map((diagnostic) =>
            ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
        expect(diagnostics).toEqual([]);

        const sourceFile = program.getSourceFile(generatedPath);
        expect(sourceFile).toBeDefined();
        const checker = program.getTypeChecker();
        const descriptions = new Map<string, string>();
        const visit = (node: ts.Node): void => {
            if (ts.isPropertyAccessExpression(node)) {
                const text = node.getText(sourceFile);
                if (text === "user.id" || text === "user.address.street") {
                    const symbol = checker.getSymbolAtLocation(node.name);
                    descriptions.set(
                        text,
                        ts.displayPartsToString(
                            symbol?.getDocumentationComment(checker) ?? []
                        )
                    );
                }
            }
            ts.forEachChild(node, visit);
        };
        if (sourceFile !== undefined) {
            visit(sourceFile);
        }
        expect(descriptions.get("user.id")).toBe("Stable user identifier");
        expect(descriptions.get("user.address.street"))
            .toBe("Street used for delivery");
    });

    it("escapes comment terminators and rejects invalid output names", () => {
        const Escaped = t.object({
            value: t.string.describe("close */ safely\n@deprecated remains text")
        });
        const source = emitTypeDeclarations({
            banner: false,
            entries: [{
                name: "Escaped",
                guard: Escaped,
                source: "./schema.js"
            }]
        });
        expect(source).toContain("close *\\/ safely");
        expect(source).toContain("\\@deprecated remains text");
        expect(() => emitTypeDeclarations({
            entries: [{
                name: "type",
                guard: Escaped,
                source: "./schema.js"
            }]
        })).toThrow(TypeError);
    });

    it("moves internal aliases away from requested export names", () => {
        const source = emitTypeDeclarations({
            entries: [{
                name: "$TypeSeaGeneratedSchema0",
                guard: t.string.describe("Documented scalar"),
                source: "./schema.js",
                exportName: "Schema"
            }]
        });
        expect(source).toContain("type $TypeSeaGenerated$Schema0 =");
        expect(source).toContain("export type $TypeSeaGeneratedSchema0 =");
    });
});
