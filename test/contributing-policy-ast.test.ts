import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

type JsonObject = Readonly<Record<string, unknown>>;

interface BridgePosition {
    readonly line: number;
    readonly character: number;
    readonly offset: number;
}

interface BridgeSpan {
    readonly path: string;
    readonly start: BridgePosition;
    readonly end: BridgePosition;
    readonly encoding: "utf-16";
    readonly lineBase: 0;
    readonly columnBase: 0;
    readonly endExclusive: true;
}

interface BridgeReport extends JsonObject {
    readonly schemaVersion: number;
    readonly protocol: string;
    readonly typescriptVersion: string;
    readonly rangeEncoding: unknown;
    readonly project: JsonObject;
    readonly diagnostics: readonly JsonObject[];
    readonly files: readonly JsonObject[];
    readonly summary: JsonObject;
    readonly hm: unknown;
}

interface ProcessResult {
    readonly status: number;
    readonly stdout: string;
    readonly stderr: string;
}

interface SpannedRecord {
    readonly record: JsonObject;
    readonly span: BridgeSpan;
}

const repositoryRoot = resolve(import.meta.dirname, "..");
const fixtureRoot = join(repositoryRoot, "test", "fixtures", "contributing-policy");
const bridgePath = join(repositoryRoot, "scripts", "typescript-policy-bridge.mjs");
const workspaces: string[] = [];
const syntaxSources = new Map<string, string>();
const hmSources = new Map<string, string>();
const invalidSources = new Map<string, string>();
let syntaxWorkspace = "";
let hmWorkspace = "";
let invalidWorkspace = "";

beforeAll(async (): Promise<void> => {
    syntaxWorkspace = await createWorkspace("syntax", [
        ["ast-regression.ts.txt", "ast-regression.ts"],
        ["box.ts.txt", "box.ts"],
        ["frontend-edge.ts.txt", "frontend-edge.ts"]
    ], syntaxSources);
    hmWorkspace = await createWorkspace("hm", [
        ["hm-regression.ts.txt", "hm-regression.ts"]
    ], hmSources);
    invalidWorkspace = await createWorkspace("invalid", [
        ["invalid-regression.ts.txt", "invalid-regression.ts"],
        ["invalid-comment.ts.txt", "invalid-comment.ts"],
        ["broken-alias.ts.txt", "broken-alias.ts"]
    ], invalidSources);
});

afterAll(async (): Promise<void> => {
    await Promise.all(workspaces.map(async (workspace): Promise<void> => {
        await rm(workspace, { force: true, recursive: true });
    }));
});

describe("contributing-policy TypeScript frontend", () => {
    test("parses nested syntax structurally and resolves function-like symbols", async () => {
        const report = await runBridge(syntaxWorkspace);
        const astFile = findFile(report, "ast-regression.ts");
        const boxFile = findFile(report, "box.ts");

        expect(report.protocol).toMatch(/typescript|policy|ast/iu);
        expect(report.typescriptVersion).toMatch(/^\d+\.\d+\.\d+/u);
        expect(JSON.stringify(report.rangeEncoding)).toMatch(/utf-?16/iu);
        expect(astFile).toBeDefined();
        expect(boxFile).toBeDefined();
        expect(report.diagnostics.filter(isErrorDiagnostic)).toEqual([]);

        const imports = arrayField(astFile, "imports");
        expect(JSON.stringify(imports)).toContain("./box.js");
        expect(JSON.stringify(imports)).not.toContain("phantom.js");
        const boxImport = imports.filter(isJsonObject)
            .find((item) => stringField(item, "specifier") === "./box.js");
        const importBindings = arrayField(boxImport, "bindings").filter(isJsonObject);
        expect(importBindings.find((item) => stringField(item, "local") === "Box")?.["typeOnly"])
            .toBe(true);
        expect(importBindings.find((item) => stringField(item, "local") === "boxed")?.["typeOnly"])
            .toBe(false);

        const declarations = arrayField(astFile, "declarations").filter(isJsonObject);
        expect(declarations.some((item) => stringField(item, "name") === "Deep" &&
            stringField(item, "kind").includes("type"))).toBe(true);

        const functions = [
            ...arrayField(astFile, "functions"),
            ...arrayField(boxFile, "functions")
        ].filter(isJsonObject);
        expect(functions.some((item) => stringField(item, "kind") === "method" &&
            stringField(item, "name") === "sail")).toBe(true);
        expect(functions.some((item) => stringField(item, "kind") === "constructor")).toBe(true);
        expect(functions.some((item) => stringField(item, "kind") === "arrow")).toBe(true);
        expect(functions.some((item) => stringField(item, "name") === "identity")).toBe(true);
        expect(functions.some((item) => stringField(item, "name") === "exerciseCalls")).toBe(true);
        expect(functions.some((item) => stringField(item, "name") === "phantomFunction")).toBe(false);

        const exercise = functions.find((item) => stringField(item, "name") === "exerciseCalls");
        expect(exercise).toBeDefined();
        const calls = arrayField(exercise, "calls").filter(isJsonObject);
        expect(calls.length).toBeGreaterThanOrEqual(6);
        expect(calls.every((call) => nonEmptyString(call["symbolId"]))).toBe(true);
        expect(calls.filter((call) => nonEmptyString(call["targetId"])).length)
            .toBeGreaterThanOrEqual(5);
        expect(calls.every((call) => isBridgeSpan(call["span"]))).toBe(true);
        expect(calls.every((call) => nonEmptyString(call["returnType"]))).toBe(true);
        expect(calls.every((call) => Array.isArray(call["argumentTypes"]))).toBe(true);
        const functionNamesById = new Map(functions.map((item) => [
            stringField(item, "id"),
            stringField(item, "name")
        ]));
        const resolvedCallNames = calls.map((call) =>
            functionNamesById.get(stringField(call, "targetId")) ?? "");
        expect(resolvedCallNames).toEqual(expect.arrayContaining([
            "boxed",
            "constructor",
            "identity",
            "sail",
            "tuple"
        ]));
        const interfaceCall = calls.find((call) => stringField(call, "name") === "localBox.get");
        expect(interfaceCall?.["targetId"]).toBeNull();
        expect(nonEmptyString(interfaceCall?.["symbolId"])).toBe(true);
        expect(stringField(interfaceCall, "returnType")).toContain("id");

        const typeFacts = arrayField(astFile, "typeFacts").filter(isJsonObject);
        expect(stringField(namedFact(typeFacts, "target"), "inferredType")).toBe("number");
        expect(stringField(namedFact(typeFacts, "methodResult"), "inferredType")).toBe("string");
        expect(stringField(namedFact(typeFacts, "inferred"), "inferredType"))
            .toMatch(/readonly id: 42/iu);

        const allSpans = collectSpannedRecords(report);
        assertSpanContract(allSpans, syntaxSources);
        expect(recordsForText(allSpans, syntaxSources, "<const T extends readonly unknown[]>(...items: T): T => items"))
            .not.toEqual([]);
        expect(recordsForText(allSpans, syntaxSources, "new Vessel(\"local\")"))
            .not.toEqual([]);
        expect(recordsForText(allSpans, syntaxSources, "localBox.get()"))
            .not.toEqual([]);
        expect(recordsForText(allSpans, syntaxSources, "maybe!"))
            .not.toEqual([]);
        expect(recordsForText(allSpans, syntaxSources, "phantomReceiver.phantomCall()"))
            .toEqual([]);

        const typeEscapes = arrayField(astFile, "typeEscapes").filter(isJsonObject);
        const nonNull = typeEscapes.find((item) => stringField(item, "kind") === "non_null_assertion");
        expect(nonNull).toBeDefined();
        expect(isBridgeSpan(nonNull?.["span"])).toBe(true);
    });

    test("uses zero-based UTF-16 end-exclusive ranges", async () => {
        const report = await runBridge(syntaxWorkspace);
        const spans = collectSpannedRecords(report);
        const target = recordsForText(spans, syntaxSources, "input!");

        expect(target).not.toEqual([]);
        const exact = target[0]?.span;
        expect(exact).toMatchObject({
            path: "ast-regression.ts",
            start: {
                line: 46,
                character: 35
            },
            end: {
                line: 46,
                character: 41
            },
            encoding: "utf-16",
            lineBase: 0,
            columnBase: 0,
            endExclusive: true
        });
        if (exact === undefined) {
            throw new Error("missing exact input non-null span");
        }
        const source = syntaxSources.get(exact.path);
        if (source === undefined) {
            throw new Error("missing source for exact input non-null span");
        }
        expect(source.slice(exact.start.offset, exact.end.offset)).toBe("input!");
        expect(Buffer.byteLength(source.slice(lineStartOffset(source, exact.start.offset), exact.start.offset)))
            .toBe(37);
    });

    test("separates class definition, initialization, and method calls and types destructuring leaves", async () => {
        const report = await runBridge(syntaxWorkspace);
        const file = findFile(report, "frontend-edge.ts");
        expect(file).toBeDefined();

        const topLevelNames = arrayField(file, "topLevelCalls")
            .filter(isJsonObject)
            .map((call) => stringField(call, "name"));
        expect(topLevelNames).not.toContain("mixin");
        expect(topLevelNames).not.toContain("computed");
        expect(topLevelNames).not.toEqual(expect.arrayContaining([
            "fieldCall",
            "initializer",
            "methodCall",
            "nestedMethodCall",
            "staticCall"
        ]));

        const initializationCalls = arrayField(file, "initializationCalls").filter(isJsonObject);
        const initializationNames = initializationCalls.map((call) => stringField(call, "name"));
        expect(initializationNames).toEqual(expect.arrayContaining([
            "fieldCall",
            "initializer",
            "localInit",
            "staticCall"
        ]));
        expect(initializationNames).not.toContain("callbackCall");
        expect(new Set(initializationCalls.map((call) => stringField(call, "id"))).size)
            .toBe(initializationCalls.length);

        const runtimeOwners = arrayField(file, "runtimeOwners").filter(isJsonObject);
        const childStatic = runtimeOwners.find((owner) =>
            stringField(owner, "name") === "Child.<static-init>");
        const expressionStatic = runtimeOwners.find((owner) =>
            stringField(owner, "name") === "Expression.<static-init>");
        const localStatic = runtimeOwners.find((owner) =>
            stringField(owner, "name") === "Local.<static-init>");
        const localInstance = runtimeOwners.find((owner) =>
            stringField(owner, "name") === "Local.<instance-init>");
        const localConstructor = runtimeOwners.find((owner) =>
            stringField(owner, "name") === "Local.constructor");
        const childConstructor = runtimeOwners.find((owner) =>
            stringField(owner, "name") === "Child.constructor");
        const childInstanceOwner = runtimeOwners.find((owner) =>
            stringField(owner, "name") === "Child.<instance-init>");
        const derivedConstructor = runtimeOwners.find((owner) =>
            stringField(owner, "name") === "DerivedChild.constructor");
        const aliasedConstructor = runtimeOwners.find((owner) =>
            stringField(owner, "name") === "AliasedDerived.constructor");
        const factoryDerivedConstructor = runtimeOwners.find((owner) =>
            stringField(owner, "name") === "FactoryDerived.constructor");
        const cyclicStatic = runtimeOwners.find((owner) =>
            stringField(owner, "name") === "Cyclic.<static-init>");
        const innerStatic = runtimeOwners.find((owner) =>
            stringField(owner, "name") === "Inner.<static-init>");
        const decoratedOuterStatic = runtimeOwners.find((owner) =>
            stringField(owner, "name") === "DecoratedOuter.<static-init>");
        const typedDecoratedStatic = runtimeOwners.find((owner) =>
            stringField(owner, "name") === "TypedDecorated.<static-init>");
        const factoryDecoratedStatic = runtimeOwners.find((owner) =>
            stringField(owner, "name") === "FactoryDecorated.<static-init>");
        const innerComputedStatic = runtimeOwners.find((owner) =>
            stringField(owner, "name") === "InnerComputed.<static-init>");
        expect(arrayField(childStatic, "calls").filter(isJsonObject)
            .map((call) => stringField(call, "name"))).toEqual(expect.arrayContaining([
            "mixin",
            "staticCall"
        ]));
        expect(arrayField(expressionStatic, "calls").filter(isJsonObject)
            .map((call) => stringField(call, "name"))).toEqual(expect.arrayContaining([
            "mixin",
            "computed"
        ]));
        expect(arrayField(localStatic, "calls").filter(isJsonObject)
            .map((call) => stringField(call, "name"))).toEqual(["mixin"]);
        expect(arrayField(localInstance, "calls").filter(isJsonObject)
            .map((call) => stringField(call, "name"))).toEqual(["localInit"]);

        const functions = arrayField(file, "functions").filter(isJsonObject);
        const overloadedConstructors = functions.filter((fn) =>
            stringField(fn, "kind") === "constructor" &&
            stringField(fn, "qualifiedName").includes("Overloaded"));
        expect(overloadedConstructors).toHaveLength(3);
        expect(new Set(overloadedConstructors.map((fn) => stringField(fn, "symbolId"))).size)
            .toBe(1);
        expect(nonEmptyString(overloadedConstructors[0]?.["symbolId"])).toBe(true);
        const owner = functions.find((fn) => stringField(fn, "name") === "owner");
        const ownerCalls = arrayField(owner, "calls").filter(isJsonObject)
            .map((call) => stringField(call, "name"));
        expect(ownerCalls).toEqual(expect.arrayContaining(["defaultCall", "direct", "Local"]));
        expect(ownerCalls).not.toEqual(expect.arrayContaining(["mixin", "localInit"]));
        const ownerId = stringField(owner, "id");
        const edges = arrayField(file, "syntheticEdges").filter(isJsonObject);
        expect(edges).toEqual(expect.arrayContaining([
            expect.objectContaining({
                from: ownerId,
                to: stringField(localStatic, "id"),
                kind: "class-definition"
            }),
            expect.objectContaining({
                from: stringField(localConstructor, "id"),
                to: stringField(localInstance, "id"),
                kind: "instance-initialization"
            }),
            expect.objectContaining({
                from: stringField(childConstructor, "id"),
                to: stringField(childInstanceOwner, "id"),
                kind: "instance-initialization"
            }),
            expect.objectContaining({
                from: stringField(derivedConstructor, "id"),
                to: stringField(childConstructor, "id"),
                kind: "implicit-super"
            }),
            expect.objectContaining({
                from: stringField(aliasedConstructor, "id"),
                to: stringField(childConstructor, "id"),
                kind: "implicit-super"
            })
        ]));
        expect(arrayField(factoryDerivedConstructor, "calls").filter(isJsonObject)).toContainEqual(
            expect.objectContaining({
                kind: "implicit-super",
                inconclusiveRuntime: true,
                resolutionStatus: "inconclusive"
            })
        );
        const localConstruction = arrayField(owner, "calls").filter(isJsonObject)
            .find((call) => stringField(call, "name") === "Local");
        expect(stringField(localConstruction, "targetId")).toBe(stringField(localConstructor, "id"));

        const staticCycle = functions.find((fn) => stringField(fn, "name") === "staticCycle");
        expect(edges).toContainEqual(expect.objectContaining({
            from: stringField(staticCycle, "id"),
            to: stringField(cyclicStatic, "id"),
            kind: "class-definition"
        }));
        expect(arrayField(cyclicStatic, "calls").filter(isJsonObject)).toContainEqual(
            expect.objectContaining({ targetId: stringField(staticCycle, "id") })
        );
        const recursiveDecorator = functions.find((fn) =>
            stringField(fn, "name") === "recursiveDecorator");
        for (const decoratorOwner of [innerStatic, decoratedOuterStatic]) {
            expect(arrayField(decoratorOwner, "calls").filter(isJsonObject)).toContainEqual(
                expect.objectContaining({
                    kind: "decorator-application",
                    targetId: stringField(recursiveDecorator, "id")
                })
            );
        }
        expect(edges).toContainEqual(expect.objectContaining({
            from: stringField(recursiveDecorator, "id"),
            to: stringField(innerStatic, "id"),
            kind: "class-definition"
        }));
        const typedDecorator = functions.find((fn) => stringField(fn, "name") === "typedDecorator");
        expect(arrayField(typedDecoratedStatic, "calls").filter(isJsonObject)).toContainEqual(
            expect.objectContaining({
                kind: "decorator-application",
                targetId: stringField(typedDecorator, "id")
            })
        );
        const factoryDecoratorCalls = arrayField(factoryDecoratedStatic, "calls").filter(isJsonObject);
        expect(factoryDecoratorCalls).toContainEqual(expect.objectContaining({
            name: "decoratorFactory",
            kind: "call"
        }));
        expect(factoryDecoratorCalls).toContainEqual(expect.objectContaining({
            kind: "decorator-application",
            inconclusiveRuntime: true,
            resolutionStatus: "inconclusive"
        }));
        const objectCycle = functions.find((fn) => stringField(fn, "name") === "objectCycle");
        expect(arrayField(objectCycle, "calls").filter(isJsonObject)).toContainEqual(
            expect.objectContaining({ targetId: stringField(objectCycle, "id") })
        );
        const objectComputedClassCycle = functions.find((fn) =>
            stringField(fn, "name") === "objectComputedClassCycle");
        expect(edges).toContainEqual(expect.objectContaining({
            from: stringField(objectComputedClassCycle, "id"),
            to: stringField(innerComputedStatic, "id"),
            kind: "class-definition"
        }));
        expect(arrayField(innerComputedStatic, "calls").filter(isJsonObject)).toContainEqual(
            expect.objectContaining({ targetId: stringField(objectComputedClassCycle, "id") })
        );
        const recursiveTag = functions.find((fn) => stringField(fn, "name") === "recursiveTag");
        expect(arrayField(recursiveTag, "calls").filter(isJsonObject)).toContainEqual(
            expect.objectContaining({
                targetId: stringField(recursiveTag, "id"),
                kind: "tagged-template"
            })
        );
        const getter = functions.find((fn) =>
            stringField(fn, "kind") === "getter" &&
            stringField(fn, "qualifiedName").includes("AccessorLoop"));
        const setter = functions.find((fn) =>
            stringField(fn, "kind") === "setter" &&
            stringField(fn, "qualifiedName").includes("AccessorLoop"));
        expect(arrayField(getter, "calls").filter(isJsonObject)).toContainEqual(
            expect.objectContaining({
                targetId: stringField(getter, "id"),
                kind: "accessor-get",
                name: "<destructure>.value<get>"
            })
        );
        const setterCalls = arrayField(setter, "calls").filter(isJsonObject);
        expect(setterCalls).toContainEqual(
            expect.objectContaining({
                targetId: stringField(setter, "id"),
                kind: "accessor-set",
                arguments: ["next"],
                argumentIdentifiers: ["next"]
            })
        );
        expect(setterCalls.filter((call) => stringField(call, "kind") === "accessor-set"))
            .toHaveLength(4);
        expect(setterCalls.filter((call) => stringField(call, "kind") === "accessor-set")
            .every((call) => stringField(call, "targetId") === stringField(setter, "id")))
            .toBe(true);
        const callback = functions.find((fn) =>
            stringField(fn, "kind") === "arrow" && stringField(fn, "name") === "callback");
        expect(arrayField(callback, "calls").filter(isJsonObject)
            .map((call) => stringField(call, "name"))).toEqual(["callbackCall"]);

        const moduleOwner = runtimeOwners.find((runtimeOwner) =>
            stringField(runtimeOwner, "kind") === "module-init");
        const moduleCalls = arrayField(moduleOwner, "calls").filter(isJsonObject);
        expect(moduleCalls).toContainEqual(expect.objectContaining({
            targetId: stringField(recursiveTag, "id"),
            kind: "tagged-template"
        }));
        expect(moduleCalls.find((call) => stringField(call, "name") === "Child")?.["targetId"])
            .toBe(stringField(childConstructor, "id"));
        expect(moduleCalls.find((call) => stringField(call, "name") === "DerivedChild")?.["targetId"])
            .toBe(stringField(derivedConstructor, "id"));

        const method = functions.find((fn) => stringField(fn, "name") === "method");
        expect(arrayField(method, "calls").filter(isJsonObject)
            .map((call) => stringField(call, "name"))).toEqual(["methodCall"]);

        const facts = arrayField(file, "typeFacts").filter(isJsonObject);
        expect(namedFact(facts, "a")).toMatchObject({ inferredType: "number" });
        expect(namedFact(facts, "b")).toMatchObject({ inferredType: "string" });
        expect(nonEmptyString(namedFact(facts, "a")["symbolId"])).toBe(true);
        expect(nonEmptyString(namedFact(facts, "b")["symbolId"])).toBe(true);
    });

    test("keeps TypeScript authoritative and uses HM only as a constrained fallback", async () => {
        const report = await runBridge(hmWorkspace);
        const facts = collectInferenceFacts(report);
        const identity = inferenceFact(facts, "identity");
        const numberIdentity = inferenceFact(facts, "numberIdentity");
        const stringIdentity = inferenceFact(facts, "stringIdentity");
        const annotationWins = inferenceFact(facts, "annotationWins");
        const validUnknown = inferenceFact(facts, "validUnknown");
        const explicitEscape = inferenceFact(facts, "explicitEscape");
        const occursCheck = inferenceFact(facts, "occursCheck");
        const unsupported = inferenceFact(facts, "unsupportedButTyped");
        const beforeShadow = inferenceFact(facts, "beforeShadow");
        const insideShadow = inferenceFact(facts, "insideShadow");
        const afterShadow = inferenceFact(facts, "afterShadow");

        expect(stringField(objectField(identity, "hm"), "status")).toBe("inferred");
        expect(stringField(objectField(identity, "hm"), "display")).toMatch(/forall|->|→/iu);
        expect(stringField(objectField(numberIdentity, "selected"), "source")).toBe("typescript");
        expect(stringField(objectField(numberIdentity, "hm"), "display")).toMatch(/number|1/iu);
        expect(stringField(objectField(stringIdentity, "selected"), "source")).toBe("typescript");
        expect(stringField(objectField(stringIdentity, "hm"), "display")).toMatch(/string|sea/iu);

        expect(stringField(objectField(annotationWins, "selected"), "source"))
            .toMatch(/annotation|typescript/iu);
        expect(stringField(objectField(annotationWins, "selected"), "source")).not.toBe("hm");
        expect(stringField(objectField(validUnknown, "selected"), "source")).not.toBe("hm");
        expect(stringField(objectField(explicitEscape, "selected"), "source")).not.toBe("hm");
        expect(stringField(objectField(occursCheck, "hm"), "status"))
            .toMatch(/conflict|occurs|unsupported/iu);
        expect(stringField(objectField(unsupported, "hm"), "status"))
            .toMatch(/partial|unsupported/iu);
        expect(stringField(objectField(unsupported, "selected"), "source")).toBe("typescript");
        expect(stringField(objectField(beforeShadow, "hm"), "display")).toMatch(/boolean|true/iu);
        expect(stringField(objectField(insideShadow, "hm"), "display")).toMatch(/string|inner/iu);
        expect(stringField(objectField(afterShadow, "hm"), "display")).toMatch(/number|2/iu);
        expect(stringField(objectField(explicitEscape, "typescript"), "status"))
            .toBe("intentional-dynamic");

        const firstMutable = inferenceFact(facts, "firstMutable");
        const secondMutable = inferenceFact(facts, "secondMutable");
        const mutableIdentity = inferenceFact(facts, "mutableIdentity");
        const mutableRecord = inferenceFact(facts, "mutableRecord");
        const mutableStatuses = [
            stringField(objectField(firstMutable, "hm"), "status"),
            stringField(objectField(secondMutable, "hm"), "status")
        ];
        expect(mutableStatuses.some((status) => status !== "inferred")).toBe(true);
        expect(objectField(mutableIdentity, "valueRestriction")["eligible"]).toBe(false);
        expect(objectField(mutableRecord, "valueRestriction")["eligible"]).toBe(false);

        for (const fact of facts) {
            const selected = objectField(fact, "selected");
            const hm = objectField(fact, "hm");
            if (stringField(selected, "source") === "hm") {
                expect(stringField(hm, "confidence")).toMatch(/low|medium/iu);
                expect(booleanField(fact, "blocking")).not.toBe(true);
            }
        }
    });

    test("reports malformed syntax with exact spans and deterministic output", async () => {
        const first = await runBridge(invalidWorkspace);
        const second = await runBridge(invalidWorkspace);

        expect(second).toEqual(first);
        expect(first.diagnostics.length).toBeGreaterThan(0);
        expect(first.diagnostics.some((item) => {
            const message = stringField(item, "message");
            return /expected|expression|template|unterminated/iu.test(message);
        })).toBe(true);
        const messages = first.diagnostics.map((item) => stringField(item, "message")).join("\n");
        expect(messages).toMatch(/unterminated template literal/iu);
        expect(messages).toMatch(/\*\//u);
        expect(messages).toMatch(/MissingType/u);
        const brokenFile = findFile(first, "broken-alias.ts");
        const aliasFact = arrayField(brokenFile, "inferenceFacts")
            .filter(isJsonObject)
            .find((fact) => stringField(fact, "name") === "aliasValue");
        expect(stringField(objectField(aliasFact, "typescript"), "status")).toBe("error-derived");
        expect(arrayField(objectField(aliasFact, "typescript"), "diagnosticCodes"))
            .toContain("TS2304");
        const diagnosticSpans = collectSpannedRecords(first)
            .filter((item) => invalidSources.has(item.span.path));
        expect(diagnosticSpans).not.toEqual([]);
        expect(diagnosticSpans.some((item) => item.span.path === "invalid-regression.ts")).toBe(true);
        expect(diagnosticSpans.some((item) => item.span.path === "invalid-comment.ts")).toBe(true);
        assertSpanContract(diagnosticSpans, invalidSources);
        expect(recordsForText(diagnosticSpans, invalidSources, "phantomFunction")).toEqual([]);
    });
});

async function createWorkspace(
    label: string,
    fixturePairs: readonly (readonly [string, string])[],
    sources: Map<string, string>
): Promise<string> {
    const workspace = await mkdtemp(join(tmpdir(), `typesea-policy-${label}-`));
    workspaces.push(workspace);
    for (const [fixtureName, targetName] of fixturePairs) {
        const source = await readFile(join(fixtureRoot, fixtureName), "utf8");
        sources.set(targetName, source);
        await writeFile(join(workspace, targetName), source, "utf8");
    }
    const tsconfig = {
        compilerOptions: {
            exactOptionalPropertyTypes: true,
            module: "NodeNext",
            moduleResolution: "NodeNext",
            noEmit: true,
            noImplicitAny: true,
            strict: true,
            target: "ES2023"
        },
        include: ["*.ts"]
    };
    await writeFile(
        join(workspace, "tsconfig.json"),
        `${JSON.stringify(tsconfig, null, 4)}\n`,
        "utf8"
    );
    return workspace;
}

async function runBridge(workspace: string): Promise<BridgeReport> {
    const result = await runProcess(workspace);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain(`${String.fromCharCode(27)}[`);
    const decoded: unknown = JSON.parse(result.stdout);
    assertBridgeReport(decoded);
    return decoded;
}

function runProcess(workspace: string): Promise<ProcessResult> {
    return new Promise((resolveProcess) => {
        const child = spawn(process.execPath, [
            bridgePath,
            "--root",
            workspace,
            "--tsconfig",
            join(workspace, "tsconfig.json")
        ], {
            cwd: workspace,
            env: {
                ...process.env,
                NO_COLOR: "1"
            },
            stdio: ["ignore", "pipe", "pipe"]
        });
        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];
        let launchError = "";
        child.stdout.on("data", (chunk: Buffer): void => {
            stdout.push(chunk);
        });
        child.stderr.on("data", (chunk: Buffer): void => {
            stderr.push(chunk);
        });
        child.on("error", (error): void => {
            launchError = error.message;
        });
        child.on("close", (status): void => {
            resolveProcess({
                status: status ?? -1,
                stdout: Buffer.concat(stdout).toString("utf8"),
                stderr: `${Buffer.concat(stderr).toString("utf8")}${launchError}`
            });
        });
    });
}

function assertBridgeReport(value: unknown): asserts value is BridgeReport {
    if (!isJsonObject(value) ||
        typeof value["schemaVersion"] !== "number" ||
        typeof value["protocol"] !== "string" ||
        typeof value["typescriptVersion"] !== "string" ||
        !isJsonObject(value["project"]) ||
        !Array.isArray(value["diagnostics"]) ||
        !value["diagnostics"].every(isJsonObject) ||
        !Array.isArray(value["files"]) ||
        !value["files"].every(isJsonObject) ||
        !isJsonObject(value["summary"]) ||
        !("hm" in value)) {
        throw new Error("TypeScript policy bridge returned an invalid protocol payload");
    }
}

function findFile(report: BridgeReport, path: string): JsonObject | undefined {
    return report.files.find((file) => stringField(file, "path") === path);
}

function isErrorDiagnostic(value: JsonObject): boolean {
    return stringField(value, "severity") === "error" ||
        stringField(value, "category") === "error";
}

function arrayField(value: JsonObject | undefined, key: string): readonly unknown[] {
    const field = value?.[key];
    return Array.isArray(field) ? field : [];
}

function objectField(value: JsonObject | undefined, key: string): JsonObject {
    const field = value?.[key];
    return isJsonObject(field) ? field : {};
}

function stringField(value: JsonObject | undefined, key: string): string {
    const field = value?.[key];
    return typeof field === "string" ? field : "";
}

function booleanField(value: JsonObject | undefined, key: string): boolean | undefined {
    const field = value?.[key];
    return typeof field === "boolean" ? field : undefined;
}

function nonEmptyString(value: unknown): boolean {
    return typeof value === "string" && value.length !== 0;
}

function isJsonObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBridgePosition(value: unknown): value is BridgePosition {
    return isJsonObject(value) &&
        Number.isInteger(value["line"]) &&
        Number.isInteger(value["character"]) &&
        Number.isInteger(value["offset"]);
}

function isBridgeSpan(value: unknown): value is BridgeSpan {
    return isJsonObject(value) &&
        typeof value["path"] === "string" &&
        isBridgePosition(value["start"]) &&
        isBridgePosition(value["end"]) &&
        value["encoding"] === "utf-16" &&
        value["lineBase"] === 0 &&
        value["columnBase"] === 0 &&
        value["endExclusive"] === true;
}

function collectSpannedRecords(value: unknown): SpannedRecord[] {
    const result: SpannedRecord[] = [];
    walkSpans(value, undefined, result);
    return result;
}

function walkSpans(
    value: unknown,
    parent: JsonObject | undefined,
    result: SpannedRecord[]
): void {
    if (isBridgeSpan(value)) {
        result.push({
            record: parent ?? { span: value },
            span: value
        });
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            walkSpans(item, parent, result);
        }
        return;
    }
    if (!isJsonObject(value)) {
        return;
    }
    for (const child of Object.values(value)) {
        walkSpans(child, value, result);
    }
}

function assertSpanContract(
    records: readonly SpannedRecord[],
    sources: ReadonlyMap<string, string>
): void {
    expect(records.length).toBeGreaterThan(0);
    for (const { span } of records) {
        const source = sources.get(span.path);
        if (source === undefined) {
            continue;
        }
        expect(span.start.offset).toBeGreaterThanOrEqual(0);
        expect(span.end.offset).toBeGreaterThanOrEqual(span.start.offset);
        expect(span.end.offset).toBeLessThanOrEqual(source.length);
        expect(span.start).toEqual({
            ...positionAt(source, span.start.offset),
            offset: span.start.offset
        });
        expect(span.end).toEqual({
            ...positionAt(source, span.end.offset),
            offset: span.end.offset
        });
    }
}

function positionAt(source: string, offset: number): Omit<BridgePosition, "offset"> {
    const prefix = source.slice(0, offset);
    const lines = prefix.split(/\r\n|\r|\n/u);
    return {
        line: lines.length - 1,
        character: lines[lines.length - 1]?.length ?? 0
    };
}

function lineStartOffset(source: string, offset: number): number {
    const newline = source.lastIndexOf("\n", Math.max(0, offset - 1));
    return newline === -1 ? 0 : newline + 1;
}

function recordsForText(
    records: readonly SpannedRecord[],
    sources: ReadonlyMap<string, string>,
    expected: string
): SpannedRecord[] {
    return records.filter(({ span }) => {
        const source = sources.get(span.path);
        return source?.slice(span.start.offset, span.end.offset) === expected;
    });
}

function collectInferenceFacts(report: BridgeReport): JsonObject[] {
    const result: JsonObject[] = [];
    walkInferenceFacts(report, result);
    return result;
}

function walkInferenceFacts(value: unknown, result: JsonObject[]): void {
    if (Array.isArray(value)) {
        for (const item of value) {
            walkInferenceFacts(item, result);
        }
        return;
    }
    if (!isJsonObject(value)) {
        return;
    }
    const typescript = value["typescript"] ?? value["ts"];
    if (isJsonObject(typescript) &&
        isJsonObject(value["hm"]) &&
        isJsonObject(value["selected"])) {
        result.push(value);
    }
    for (const child of Object.values(value)) {
        walkInferenceFacts(child, result);
    }
}

function inferenceFact(facts: readonly JsonObject[], name: string): JsonObject {
    const fact = facts.find((item) => stringField(item, "name") === name ||
        stringField(item, "symbolName") === name ||
        stringField(item, "binding") === name);
    expect(fact, `missing inference fact for ${name}`).toBeDefined();
    return fact ?? {};
}

function namedFact(facts: readonly JsonObject[], name: string): JsonObject {
    const fact = facts.find((item) => stringField(item, "name") === name);
    expect(fact, `missing fact for ${name}`).toBeDefined();
    return fact ?? {};
}
