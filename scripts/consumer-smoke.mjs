import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const workspace = await mkdtemp(join(tmpdir(), "typesea-consumer-"));
const runtimeDependencyFields = [
    "dependencies",
    "peerDependencies",
    "optionalDependencies",
    "bundleDependencies",
    "bundledDependencies"
];
const blockedSubpaths = [
    "typesea/dist/index.js",
    "typesea/dist/ir.js",
    "typesea/dist/schema.js"
];

const result = await main();
await rm(workspace, { recursive: true, force: true });
if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
}

/**
 * @brief Run this module top-level workflow.
 */
async function main() {
    const pack = await run(
        "npm",
        ["pack", "--pack-destination", workspace, "--json", "--ignore-scripts"],
        root
    );
    if (!pack.ok) {
        return pack;
    }
    const packed = parsePackOutput(pack.value.stdout);
    if (!packed.ok) {
        return packed;
    }
    const tarball = join(workspace, packed.value);
    const packageJson = {
        type: "module",
        private: true,
        dependencies: {
            typesea: `file:${tarball}`
        },
        devDependencies: {
            typescript: "^6.0.3"
        }
    };
    await writeFile(join(workspace, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
    await writeFile(join(workspace, "index.mjs"), runtimeSource());
    await writeFile(join(workspace, "index.ts"), typeSource());
    await writeFile(join(workspace, "mini.mjs"), miniRuntimeSource());
    await writeFile(join(workspace, "mini.ts"), miniTypeSource());
    await writeFile(join(workspace, "zod.mjs"), zodRuntimeSource());
    await writeFile(join(workspace, "zod.ts"), zodTypeSource());
    await writeFile(join(workspace, "seaflow.mjs"), seaflowRuntimeSource());
    await writeFile(join(workspace, "seaflow.ts"), seaflowTypeSource());
    await writeFile(join(workspace, "seabreeze.mjs"), seabreezeRuntimeSource());
    await writeFile(join(workspace, "seabreeze.ts"), seabreezeTypeSource());
    await writeFile(join(workspace, "plugin.mjs"), pluginRuntimeSource());
    await writeFile(join(workspace, "plugin.ts"), pluginTypeSource());
    await writeFile(join(workspace, "codegen.mjs"), codegenRuntimeSource());
    await writeFile(join(workspace, "codegen.ts"), codegenTypeSource());
    await writeFile(join(workspace, "seacurrent.mjs"), seacurrentRuntimeSource());
    await writeFile(join(workspace, "seacurrent.ts"), seacurrentTypeSource());
    await writeFile(join(workspace, "subpath.ts"), subpathTypeSource());
    await writeFile(join(workspace, "tsconfig.json"), tsconfigSource());
    for (let index = 0; index < blockedSubpaths.length; index += 1) {
        const subpath = blockedSubpaths[index];
        if (subpath !== undefined) {
            await writeFile(
                join(workspace, `subpath-${String(index)}.mjs`),
                subpathSource(subpath)
            );
        }
    }

    const install = await run("npm", ["install", "--ignore-scripts"], workspace);
    if (!install.ok) {
        return install;
    }
    const metadata = await checkInstalledPackageMetadata();
    if (!metadata.ok) {
        return metadata;
    }
    const runtime = await run("node", ["index.mjs"], workspace);
    if (!runtime.ok) {
        return runtime;
    }
    const miniRuntime = await run("node", ["mini.mjs"], workspace);
    if (!miniRuntime.ok) {
        return miniRuntime;
    }
    const zodRuntime = await run("node", ["zod.mjs"], workspace);
    if (!zodRuntime.ok) {
        return zodRuntime;
    }
    const seaflowRuntime = await run("node", ["seaflow.mjs"], workspace);
    if (!seaflowRuntime.ok) {
        return seaflowRuntime;
    }
    const seabreezeRuntime = await run("node", ["seabreeze.mjs"], workspace);
    if (!seabreezeRuntime.ok) {
        return seabreezeRuntime;
    }
    const pluginRuntime = await run("node", ["plugin.mjs"], workspace);
    if (!pluginRuntime.ok) {
        return pluginRuntime;
    }
    const codegenRuntime = await run("node", ["codegen.mjs"], workspace);
    if (!codegenRuntime.ok) {
        return codegenRuntime;
    }
    const seacurrentRuntime = await run("node", ["seacurrent.mjs"], workspace);
    if (!seacurrentRuntime.ok) {
        return seacurrentRuntime;
    }
    for (let index = 0; index < blockedSubpaths.length; index += 1) {
        const subpath = blockedSubpaths[index];
        if (subpath === undefined) {
            continue;
        }
        const blocked = await runExpectFailure(
            "node",
            [`subpath-${String(index)}.mjs`],
            workspace
        );
        if (!blocked.ok) {
            return blocked;
        }
    }
    const typeSubpath = await runExpectFailure(
        "npx",
        [
            "tsc",
            "subpath.ts",
            "--ignoreConfig",
            "--module",
            "NodeNext",
            "--moduleResolution",
            "NodeNext",
            "--target",
            "ES2023",
            "--noEmit"
        ],
        workspace
    );
    if (!typeSubpath.ok) {
        return typeSubpath;
    }
    const typeRoot = await run("npx", ["tsc", "-p", "tsconfig.json", "--noEmit"], workspace);
    if (!typeRoot.ok) {
        return typeRoot;
    }
    const miniTypes = await run(
        "npx",
        [
            "tsc",
            "mini.ts",
            "--ignoreConfig",
            "--module",
            "NodeNext",
            "--moduleResolution",
            "NodeNext",
            "--target",
            "ES2023",
            "--noEmit"
        ],
        workspace
    );
    if (!miniTypes.ok) {
        return miniTypes;
    }
    const seaflowTypes = await run(
        "npx",
        [
            "tsc",
            "seaflow.ts",
            "--ignoreConfig",
            "--module",
            "NodeNext",
            "--moduleResolution",
            "NodeNext",
            "--target",
            "ES2023",
            "--noEmit"
        ],
        workspace
    );
    if (!seaflowTypes.ok) {
        return seaflowTypes;
    }
    const seabreezeTypes = await run(
        "npx",
        [
            "tsc",
            "seabreeze.ts",
            "--ignoreConfig",
            "--module",
            "NodeNext",
            "--moduleResolution",
            "NodeNext",
            "--target",
            "ES2023",
            "--noEmit"
        ],
        workspace
    );
    if (!seabreezeTypes.ok) {
        return seabreezeTypes;
    }
    const pluginTypes = await run(
        "npx",
        [
            "tsc",
            "plugin.ts",
            "--ignoreConfig",
            "--module",
            "NodeNext",
            "--moduleResolution",
            "NodeNext",
            "--target",
            "ES2023",
            "--noEmit"
        ],
        workspace
    );
    if (!pluginTypes.ok) {
        return pluginTypes;
    }
    const codegenTypes = await run(
        "npx",
        [
            "tsc",
            "codegen.ts",
            "--ignoreConfig",
            "--module",
            "NodeNext",
            "--moduleResolution",
            "NodeNext",
            "--target",
            "ES2023",
            "--strict",
            "--noEmit"
        ],
        workspace
    );
    if (!codegenTypes.ok) {
        return codegenTypes;
    }
    const seacurrentTypes = await run(
        "npx",
        [
            "tsc",
            "seacurrent.ts",
            "--ignoreConfig",
            "--module",
            "NodeNext",
            "--moduleResolution",
            "NodeNext",
            "--target",
            "ES2023",
            "--strict",
            "--noEmit"
        ],
        workspace
    );
    if (!seacurrentTypes.ok) {
        return seacurrentTypes;
    }
    return run(
        "npx",
        [
            "tsc",
            "zod.ts",
            "--ignoreConfig",
            "--module",
            "NodeNext",
            "--moduleResolution",
            "NodeNext",
            "--target",
            "ES2023",
            "--noEmit"
        ],
        workspace
    );
}

async function checkInstalledPackageMetadata() {
    const source = await readFile(
        join(workspace, "node_modules", "typesea", "package.json"),
        "utf8"
    );
    const packageJson = JSON.parse(source);
    if (!isRecord(packageJson)) {
        return err("installed typesea package.json is not an object");
    }
    for (let index = 0; index < runtimeDependencyFields.length; index += 1) {
        const field = runtimeDependencyFields[index];
        if (field !== undefined && packageJson[field] !== undefined) {
            return err(`installed typesea package contains ${field}`);
        }
    }
    if (packageJson["version"] === "0.0.0") {
        return err("installed typesea package version is not release-ready");
    }
    if (packageJson["type"] !== "module") {
        return err("installed typesea package must be ESM-only");
    }
    if (typeof packageJson["author"] !== "string") {
        return err("installed typesea package author is missing");
    }
    if (!isRecord(packageJson["repository"])) {
        return err("installed typesea package repository is missing");
    }
    return ok(undefined);
}

function parsePackOutput(stdout) {
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed)) {
        return err("npm pack did not return an array");
    }
    const first = parsed[0];
    if (!isRecord(first)) {
        return err("npm pack returned an invalid record");
    }
    const filename = first["filename"];
    if (typeof filename !== "string") {
        return err("npm pack output did not include filename");
    }
    return ok(filename);
}

/**
 * @brief Run time source.
 */
function runtimeSource() {
    return [
        "import { compile, t, toJSONSchema, toJsonSchema } from 'typesea';",
        "const User = t.strictObject({",
        "  id: t.string.uuid(),",
        "  age: t.number.int().gte(0),",
        "  tags: t.array(t.string.min(1))",
        "});",
        "const FastUser = compile(User, { name: 'consumerUser' });",
        "const value = { id: '550e8400-e29b-41d4-a716-446655440000', age: 37, tags: ['ok'] };",
        "if (!User.is(value) || !FastUser.is(value) || !FastUser.check(value).ok) process.exit(1);",
        "const json = toJsonSchema(User);",
        "const jsonAlias = toJSONSchema(User);",
        "if (!json.ok || !jsonAlias.ok) process.exit(1);",
        "const openapi = toJsonSchema(t.object({ name: t.nullable(t.string.min(1)) }), { target: 'openapi-3.0' });",
        "if (!openapi.ok || typeof openapi.value === 'boolean' || openapi.value.$schema !== undefined) process.exit(1);",
        "const draft4 = toJsonSchema(t.literal('ok'), { target: 'draft-04' });",
        "if (!draft4.ok || typeof draft4.value === 'boolean' || draft4.value.enum?.[0] !== 'ok') process.exit(1);",
        "const openMode = 'a' + 'ny';",
        "const weakened = toJsonSchema(t.symbol, { unrepresentable: openMode });",
        "if (!weakened.ok || typeof weakened.value === 'boolean' || weakened.value.$schema !== 'http://json-schema.org/draft-07/schema#') process.exit(1);",
        "const withUri = toJSONSchema(t.string.meta({ id: 'ConsumerName' }), { uri: id => `https://schemas.example/${id}.json` });",
        "if (!withUri.ok || typeof withUri.value === 'boolean' || withUri.value.$id !== 'https://schemas.example/ConsumerName.json') process.exit(1);",
        "const docs = t.registry();",
        "docs.add(User, { id: 'ConsumerUser', title: 'Consumer User' });",
        "const documented = toJSONSchema(User, { metadata: docs, uri: id => `https://schemas.example/${id}.json` });",
        "if (!documented.ok || typeof documented.value === 'boolean' || documented.value.$id !== 'https://schemas.example/ConsumerUser.json') process.exit(1);",
        "const bundle = toJSONSchema(docs, { uri: id => `https://schemas.example/${id}.json` });",
        "if (!bundle.ok || bundle.value.schemas.ConsumerUser?.$id !== 'https://schemas.example/ConsumerUser.json') process.exit(1);",
        "const ReusedText = t.string.min(1).meta({ id: 'ConsumerText' });",
        "const reused = toJSONSchema(t.object({ a: ReusedText, b: ReusedText }), { reused: 'ref' });",
        "if (!reused.ok || typeof reused.value === 'boolean' || reused.value.definitions?.ConsumerText === undefined) process.exit(1);",
        "let RecursiveNode;",
        "RecursiveNode = t.lazy(() => t.object({ value: t.string, children: t.array(RecursiveNode) }));",
        "const recursive = toJSONSchema(RecursiveNode);",
        "if (!recursive.ok || typeof recursive.value === 'boolean' || recursive.value.properties?.children?.items?.$ref !== '#') process.exit(1);",
        "const uploadSchema = toJSONSchema(t.file().max(1024).mime('image/png'));",
        "if (!uploadSchema.ok || typeof uploadSchema.value === 'boolean' || uploadSchema.value.contentMediaType !== 'image/png') process.exit(1);",
        "const overridden = toJSONSchema(t.object({ name: t.string }), { override: ctx => { if (ctx.path[0] === 'name') ctx.jsonSchema.title = 'Name'; } });",
        "if (!overridden.ok || typeof overridden.value === 'boolean' || overridden.value.properties?.name?.title !== 'Name') process.exit(1);",
        "const NumberText = t.stringToInt();",
        "const asyncDecoded = await t.decodeAsync(NumberText, '42');",
        "const asyncEncoded = await t.encodeAsync(NumberText, 42);",
        "if (!asyncDecoded.ok || asyncDecoded.value !== 42 || !asyncEncoded.ok || asyncEncoded.value !== '42') process.exit(1);",
        "console.log('consumer runtime ok');",
        ""
    ].join("\n");
}

function seaflowRuntimeSource() {
    return [
        "import * as root from 'typesea';",
        "import { fuzzCases } from 'typesea/seaflow';",
        "import { t } from 'typesea';",
        "if (Object.prototype.hasOwnProperty.call(root, 'fuzzCases')) process.exit(1);",
        "if (Object.prototype.hasOwnProperty.call(root, 'SeaFlow')) process.exit(1);",
        "const User = t.strictObject({ id: t.string.uuid(), age: t.number.int().gte(0) });",
        "const cases = [...fuzzCases(User, { intensity: 'high', maxYields: 32 })];",
        "if (cases.length === 0) process.exit(1);",
        "if (!cases.some(item => item.reason === 'object.proto')) process.exit(1);",
        "if (!cases.every(item => User.is(item.value) === item.valid)) process.exit(1);",
        "console.log('consumer seaflow runtime ok');",
        ""
    ].join("\n");
}

function seabreezeRuntimeSource() {
    return [
        "import * as root from 'typesea';",
        "import { createSeaBreeze, emitSeaBreezeBooleanSourceBundle, seaBreezeReader, SeaBreezeArena, SeaBreezePresence } from 'typesea/seabreeze';",
        "if (Object.prototype.hasOwnProperty.call(root, 'createSeaBreeze')) process.exit(1);",
        "const sea = createSeaBreeze({ maxNodes: 64, maxFields: 16 });",
        "const User = sea.object({",
        "  id: sea.string(),",
        "  age: sea.optional(sea.number()),",
        "  tags: sea.array(sea.string())",
        "});",
        "const FastUser = sea.compile(User, { name: 'consumerSeaBreezeUser' });",
        "if (!FastUser.is({ id: 'u1', tags: ['typed'] })) process.exit(1);",
        "if (FastUser.is({ id: 'u1', tags: [1] })) process.exit(1);",
        "const emitted = sea.emit(User, { name: 'consumerSeaBreezeSource' });",
        "if (emitted.dynamicSchemas.length !== 0 || !emitted.source.includes('function consumerSeaBreezeSource')) process.exit(1);",
        "const arena = new SeaBreezeArena({ maxNodes: 32, maxFields: 8 });",
        "const object = arena.allocObject();",
        "arena.appendField(object, 1, arena.number, SeaBreezePresence.Required);",
        "const direct = emitSeaBreezeBooleanSourceBundle(seaBreezeReader(arena), object, {",
        "  keyTable: ['', 'id'],",
        "  objectMode: 'strict',",
        "  mode: 'safe',",
        "  name: 'consumerSeaBreezeDirect'",
        "});",
        "if (direct.dynamicSchemas.length !== 0 || !direct.source.includes('function consumerSeaBreezeDirect')) process.exit(1);",
        "console.log('consumer seabreeze runtime ok');",
        ""
    ].join("\n");
}

/** @brief Exercise the published AOT plugin subpath at runtime. */
function pluginRuntimeSource() {
    return [
        "import { t } from 'typesea';",
        "import { createTypeSeaRollupPlugin } from 'typesea/plugin';",
        "const User = t.strictObject({ id: t.string });",
        "const plugin = createTypeSeaRollupPlugin({",
        "  entries: [{ id: 'consumer-user', guard: User }],",
        "  transformCompileCached: true",
        "});",
        "const resolved = plugin.resolveId('typesea:aot/consumer-user');",
        "if (resolved !== '\\0typesea:aot/consumer-user') process.exit(1);",
        "const source = plugin.load(resolved);",
        "if (source === null || !source.includes('export function is')) process.exit(1);",
        "console.log('consumer plugin runtime ok');",
        ""
    ].join("\n");
}

/** @brief Exercise the published description codegen subpath at runtime. */
function codegenRuntimeSource() {
    return [
        "import { t } from 'typesea';",
        "import { emitTypeDeclarations } from 'typesea/codegen';",
        "const User = t.object({ id: t.string.describe('Stable id') }).describe('User');",
        "const source = emitTypeDeclarations({",
        "  entries: [{ name: 'User', guard: User, source: './schema.js' }]",
        "});",
        "if (!source.includes('Stable id') || !source.includes('export type User')) process.exit(1);",
        "console.log('consumer codegen runtime ok');",
        ""
    ].join("\n");
}

/** @brief Exercise the published SeaCurrent planner subpath at runtime. */
function seacurrentRuntimeSource() {
    return [
        "import * as root from 'typesea';",
        "import { createSeaCurrent } from 'typesea/seacurrent';",
        "import { createSeaCurrentAotBridge } from 'typesea/seacurrent/aot';",
        "import { t } from 'typesea';",
        "if (Object.prototype.hasOwnProperty.call(root, 'createSeaCurrent')) process.exit(1);",
        "const User = t.strictObject({ id: t.string, age: t.number.int() });",
        "const current = createSeaCurrent({ targetKey: 'consumer-v8', checksums: true });",
        "const plan = current.plan(User, { frequency: 1000, uncertainty: 0.5 });",
        "if (plan.regions.length === 0 || plan.regions[0].exactProfile.status !== 'exact') process.exit(1);",
        "if (current.plan(User).cache.hits !== plan.regions.length) process.exit(1);",
        "const bridge = createSeaCurrentAotBridge(current);",
        "const profiled = bridge.compile(User);",
        "if (!profiled.is({ id: 'u1', age: 42 })) process.exit(1);",
        "const artifact = profiled.snapshot();",
        "if (artifact.regions[0]?.frequency !== 1 || artifact.regions[0]?.accepted !== 1) process.exit(1);",
        "const optimized = bridge.optimize(User, artifact);",
        "if (!optimized.ok || !optimized.value.is({ id: 'u1', age: 42 })) process.exit(1);",
        "if (!bridge.emit(User).ok) process.exit(1);",
        "if (!bridge.emitOptimized(User, artifact).ok) process.exit(1);",
        "console.log('consumer seacurrent runtime ok');",
        ""
    ].join("\n");
}

/**
 * @brief Run mini entry runtime source.
 */
function miniRuntimeSource() {
    return [
        "import * as mini from 'typesea/mini';",
        "const User = mini.object({",
        "  id: mini.string().uuid(),",
        "  name: mini.optional(mini.apply(mini.string(), mini.minLength(1), mini.maxLength(32)))",
        "});",
        "if (!User.is({ id: '550e8400-e29b-41d4-a716-446655440000', name: 'TypeSea' })) process.exit(1);",
        "const Trimmed = mini.apply(mini.string(), mini.trim());",
        "const decoded = mini.decode(Trimmed, ' sea ');",
        "if (!decoded.ok || decoded.value !== 'sea') process.exit(1);",
        "const NumberText = mini.stringToInt();",
        "const asyncDecoded = await mini.decodeAsync(NumberText, '42');",
        "const asyncEncoded = await mini.encodeAsync(NumberText, 42);",
        "if (!asyncDecoded.ok || asyncDecoded.value !== 42 || !asyncEncoded.ok || asyncEncoded.value !== '42') process.exit(1);",
        "console.log('consumer mini runtime ok');",
        ""
    ].join("\n");
}

/**
 * @brief Run Zod facade runtime source.
 */
function zodRuntimeSource() {
    return [
        "import * as z from 'typesea/zod';",
        "import zDefault from 'typesea/zod';",
        "import z3, { DIRTY, OK, getParsedType, ostring } from 'typesea/v3';",
        "import z4, { core as v4Core, string as z4String } from 'typesea/v4';",
        "import * as z4Mini from 'typesea/v4-mini';",
        "import * as z4NestedMini from 'typesea/v4/mini';",
        "import { en, ko } from 'typesea/locales';",
        "import { en as v4En } from 'typesea/v4/locales';",
        "import { en as v4WildcardEn } from 'typesea/v4/locales/en';",
        "import v4WildcardDefault from 'typesea/v4/locales/en.js';",
        "import { $ZodCheck, $ZodString, _safeParse as coreSafeParse, _string as coreString, version as coreVersion } from 'typesea/v4/core';",
        "const User = z.strictObject({",
        "  id: z.string().uuid(),",
        "  status: z.union([z.literal('active'), z.literal('disabled')]),",
        "  nickname: z.exactOptional(z.string().min(1)),",
        "  score: z.number().int().gte(0)",
        "});",
        "const UserKey = z.keyof(User);",
        "const recovered = z.catch(z.string().min(2), 'fallback').safeParse('x');",
        "const FunctionalName = z.minLength(2)(z.string());",
        "const TrimmedName = z.trim()(z.string());",
        "const CheckedName = z.string().check(z.minLength(2));",
        "const CheckedTrimmedName = z.string().check(z.trim());",
        "const valid = User.safeParse({ id: '550e8400-e29b-41d4-a716-446655440000', status: 'active', score: 1 });",
        "const omitted = User.safeParse({ id: '550e8400-e29b-41d4-a716-446655440000', status: 'active', score: 1 });",
        "const undefinedNick = User.safeParse({ id: '550e8400-e29b-41d4-a716-446655440000', status: 'active', nickname: undefined, score: 1 });",
        "const invalid = User.safeParse({ id: 'bad', status: 'active', score: 1 });",
        "if (!valid.success || !omitted.success || undefinedNick.success || invalid.success) process.exit(1);",
        "if (!UserKey.is('status') || UserKey.is('missing')) process.exit(1);",
        "if (!recovered.success || recovered.data !== 'fallback') process.exit(1);",
        "if (!FunctionalName.is('ok') || FunctionalName.is('x')) process.exit(1);",
        "if (!CheckedName.is('ok') || CheckedName.is('x')) process.exit(1);",
        "if (z.string().decode('ok') !== 'ok') process.exit(1);",
        "if (z.string().safeDecode(1).success) process.exit(1);",
        "if (z.string().encode('ok') !== 'ok') process.exit(1);",
        "if (z.string().safeEncode(1).success) process.exit(1);",
        "if (z.string()._zod.def.type !== 'string' || !z.string()._zod.traits.has('ZodString')) process.exit(1);",
        "if (z.literal('ready').value !== 'ready') process.exit(1);",
        "if (z.string().exactOptional().is(undefined)) process.exit(1);",
        "const trimmed = TrimmedName.safeParse(' sea ');",
        "const checkedTrimmed = CheckedTrimmedName.safeParse(' sea ');",
        "if (!trimmed.success || trimmed.data !== 'sea') process.exit(1);",
        "if (!checkedTrimmed.success || checkedTrimmed.data !== 'sea') process.exit(1);",
        "if (!z.unknown().is(Symbol('value'))) process.exit(1);",
        "if (!zDefault.string().is('value')) process.exit(1);",
        "if (!zDefault.minLength(2)(zDefault.string()).is('ok')) process.exit(1);",
        "if (!ostring().is(undefined) || !ostring().is('value')) process.exit(1);",
        "if (z3.getParsedType(new Map()) !== 'map') process.exit(1);",
        "if (getParsedType(NaN) !== 'nan' || OK('x').status !== 'valid' || DIRTY('x').status !== 'dirty') process.exit(1);",
        "if (!z4.string().is('value') || !z4String().is('value')) process.exit(1);",
        "if (!z4Mini.string().is('value') || !z4NestedMini.string().is('value')) process.exit(1);",
        "if ($ZodString !== z.ZodString || v4Core.$ZodString !== z.ZodString) process.exit(1);",
        "const coreChecked = coreSafeParse(coreString(), 'value');",
        "if (!coreChecked.success || new $ZodCheck({ check: 'probe' })._zod.def.check !== 'probe') process.exit(1);",
        "if (coreVersion.major !== 4) process.exit(1);",
        "if (typeof en !== 'function' || typeof ko !== 'function' || typeof v4En !== 'function' || typeof v4WildcardEn !== 'function' || typeof v4WildcardDefault !== 'function') process.exit(1);",
        "if (typeof v4WildcardDefault().customError !== 'function' || typeof v4WildcardDefault().localeError !== 'function') process.exit(1);",
        "if (z.TimePrecision.Millisecond !== 3) process.exit(1);",
        "if (!z.null().is(null) || !z.undefined().is(undefined) || !z.void().is(undefined)) process.exit(1);",
        "console.log('consumer zod facade runtime ok');",
        ""
    ].join("\n");
}

/**
 * @brief Run mini entry type source.
 */
function miniTypeSource() {
    return [
        "import * as mini from 'typesea/mini';",
        "const User = mini.object({",
        "  id: mini.apply(mini.string(), mini.minLength(1)),",
        "  tags: mini.apply(mini.array(mini.string()), mini.minSize(1))",
        "});",
        "type User = mini.Infer<typeof User>;",
        "const value: User = { id: 'u_1', tags: ['a'] };",
        "const NumberText = mini.stringToInt();",
        "const decodedAsync = mini.decodeAsync(NumberText, '1');",
        "const encodedAsync = mini.encodeAsync(NumberText, 1);",
        "value.tags[0]?.toUpperCase();",
        "void decodedAsync;",
        "void encodedAsync;",
        ""
    ].join("\n");
}

function seaflowTypeSource() {
    return [
        "import { fuzzCases, type SeaFlowCase, type SeaFlowOptions } from 'typesea/seaflow';",
        "import { t } from 'typesea';",
        "const options: SeaFlowOptions = { intensity: 'low', maxYields: 4 };",
        "const cases: SeaFlowCase[] = [...fuzzCases(t.string.min(1), options)];",
        "cases[0]?.reason.toUpperCase();",
        ""
    ].join("\n");
}

function seabreezeTypeSource() {
    return [
        "import { createSeaBreeze, SeaBreezeArena, SeaBreezeKind, SeaBreezePresence, type SeaBreezeBuilderOptions, type SeaBreezeShape } from 'typesea/seabreeze';",
        "const options: SeaBreezeBuilderOptions = { maxNodes: 64, maxFields: 16 };",
        "const sea = createSeaBreeze(options);",
        "const shape: SeaBreezeShape = {",
        "  id: sea.string(),",
        "  age: sea.optional(sea.number())",
        "};",
        "const user = sea.object(shape);",
        "const schema = sea.schema(user);",
        "const compiled = sea.compile(user, { name: 'typedSeaBreezeUser' });",
        "const arena = new SeaBreezeArena({ maxNodes: 16, maxFields: 4 });",
        "const variable = arena.allocVar(0);",
        "const joined = arena.principalJoin(variable, arena.string);",
        "if (arena.kindOf(joined) === SeaBreezeKind.String) {",
        "  compiled.is({ id: 'u1' });",
        "}",
        "arena.appendField(arena.allocObject(), 1, arena.number, SeaBreezePresence.Required);",
        "void schema;",
        ""
    ].join("\n");
}

/** @brief Compile the published AOT plugin subpath and optional configuration. */
function pluginTypeSource() {
    return [
        "import { t } from 'typesea';",
        "import { createTypeSeaVitePlugin, type TypeSeaAotPluginOptions } from 'typesea/plugin';",
        "const User = t.object({ id: t.string });",
        "const options: TypeSeaAotPluginOptions = { entries: [{ id: 'user', guard: User }] };",
        "const plugin = createTypeSeaVitePlugin(options);",
        "plugin.resolveId('typesea:aot/user');",
        ""
    ].join("\n");
}

/** @brief Compile the published description codegen options and emitter types. */
function codegenTypeSource() {
    return [
        "import { t } from 'typesea';",
        "import { emitTypeDeclarations, precompileSchemaDocs, type TypeSeaDeclarationOptions } from 'typesea/codegen';",
        "const User = t.object({ id: t.string.describe('Stable id') });",
        "const options: TypeSeaDeclarationOptions = {",
        "  entries: [{ name: 'User', guard: User, source: './schema.js' }]",
        "};",
        "emitTypeDeclarations(options).toUpperCase();",
        "precompileSchemaDocs(options).toUpperCase();",
        ""
    ].join("\n");
}

/** @brief Compile target-specific SeaCurrent planner and auto-tuner types. */
function seacurrentTypeSource() {
    return [
        "import { t } from 'typesea';",
        "import { createSeaCurrent, type SeaCurrentProgramPlan, type SeaCurrentRegionProfile } from 'typesea/seacurrent';",
        "import { createSeaCurrentAotBridge, type SeaCurrentProfileArtifact } from 'typesea/seacurrent/aot';",
        "const current = createSeaCurrent({",
        "  targetKey: 'consumer-v8',",
        "  adapter: { maxExpandedNodes: 1024 },",
        "  maxCacheEntries: 16,",
        "  checksums: true",
        "});",
        "const profile: SeaCurrentRegionProfile = { frequency: 1000, uncertainty: 0.5 };",
        "const plan: SeaCurrentProgramPlan = current.plan(t.string, profile);",
        "current.planRegions(t.string.schema, { root: profile });",
        "current.observe({",
        "  kind: 'benefit',",
        "  features: { frequency: 1000, costBefore: 4, costAfter: 3, sizeIncrease: 8, semanticRisk: 0 },",
        "  actualValue: 992,",
        "});",
        "current.load(current.snapshot());",
        "const bridge = createSeaCurrentAotBridge(current);",
        "const profiled = bridge.compile(t.string);",
        "const candidate: unknown = 'profiled';",
        "if (profiled.is(candidate)) candidate.toUpperCase();",
        "const artifact: SeaCurrentProfileArtifact = profiled.snapshot();",
        "bridge.profiles(t.string, artifact);",
        "const optimized = bridge.optimize(t.string, artifact);",
        "if (optimized.ok && optimized.value.is(candidate)) candidate.toUpperCase();",
        "bridge.emitOptimized(t.string, artifact);",
        "plan.regions[0]?.structuralHash.toUpperCase();",
        ""
    ].join("\n");
}

/**
 * @brief Run Zod facade type source.
 */
function zodTypeSource() {
    return [
        "import * as z from 'typesea/zod';",
        "import zDefault from 'typesea/zod';",
        "import z3, { DIRTY, OK, getParsedType, ostring } from 'typesea/v3';",
        "import z4, { core as v4Core, string as z4String, type infer as z4Infer } from 'typesea/v4';",
        "import * as z4Mini from 'typesea/v4-mini';",
        "import * as z4NestedMini from 'typesea/v4/mini';",
        "import { en, ko } from 'typesea/locales';",
        "import { en as v4En } from 'typesea/v4/locales';",
        "import { en as v4WildcardEn } from 'typesea/v4/locales/en';",
        "import v4WildcardDefault from 'typesea/v4/locales/en.js';",
        "import { $ZodCheck, $ZodString, _safeParse as coreSafeParse, _string as coreString, version as coreVersion } from 'typesea/v4/core';",
        "const User = z.strictObject({",
        "  id: z.string().uuid(),",
        "  status: z.union([z.literal('active'), z.literal('disabled')]),",
        "  nickname: z.exactOptional(z.string().min(1)),",
        "  score: z.number().int().gte(0)",
        "});",
        "const UserKey = z.keyof(User);",
        "type User = z.infer<typeof User>;",
        "type UserInput = z.input<typeof User>;",
        "type UserOutput = z.output<typeof User>;",
        "const value: User = { id: '550e8400-e29b-41d4-a716-446655440000', status: 'active', score: 1 };",
        "const namedValue: User = { id: '550e8400-e29b-41d4-a716-446655440000', status: 'active', nickname: 'Ada', score: 1 };",
        "const input: UserInput = value;",
        "const output: UserOutput = value;",
        "const checked = User.safeParse(input);",
        "const recovered = z.catch(z.string().min(2), 'fallback').safeParse('x');",
        "const keyChecked = UserKey.safeParse('status');",
        "const functionalName = z.minLength(2)(z.string());",
        "const lowerName = z.toLowerCase()(z.string());",
        "const checkedName = z.string().check(z.minLength(2));",
        "const checkedLowerName = z.string().check(z.toLowerCase());",
        "const exactName = z.string().exactOptional();",
        "const v4Name = z4.object({ name: z4String().min(1) });",
        "const miniName = z4Mini.apply(z4Mini.string(), z4Mini.minLength(1));",
        "const nestedMiniName = z4NestedMini.apply(z4NestedMini.string(), z4NestedMini.maxLength(32));",
        "const zodDefType: string = z.string()._zod.def.type;",
        "const literalValue: 'ready' = z.literal('ready').value;",
        "const optionalText = ostring();",
        "const parsedKind: string = getParsedType(new Set());",
        "const validStatus = OK('x');",
        "const dirtyStatus = DIRTY('x');",
        "const coreChecked = coreSafeParse(coreString(), 'TypeSea');",
        "const coreProbe = new $ZodCheck({ check: 'probe' });",
        "type V4Name = z4Infer<typeof v4Name>;",
        "const v4Value: V4Name = { name: 'TypeSea' };",
        "if (checked.success) {",
        "  checked.data.id.toUpperCase();",
        "}",
        "zDefault.string().parse('value');",
        "zDefault.maxLength(8)(zDefault.string()).parse('TypeSea');",
        "void output;",
        "void namedValue;",
        "void recovered;",
        "void keyChecked;",
        "void functionalName;",
        "void lowerName;",
        "void checkedName;",
        "void checkedLowerName;",
        "void exactName;",
        "void zodDefType;",
        "void literalValue;",
        "void optionalText;",
        "void parsedKind;",
        "void validStatus;",
        "void dirtyStatus;",
        "void z3;",
        "void v4Value;",
        "void miniName;",
        "void nestedMiniName;",
        "void en;",
        "void ko;",
        "void v4En;",
        "void v4WildcardEn;",
        "void v4WildcardDefault;",
        "void $ZodString;",
        "void coreChecked;",
        "void coreProbe;",
        "void coreVersion;",
        "void v4Core;",
        ""
    ].join("\n");
}

function subpathSource(specifier) {
    return [
        `await import(${JSON.stringify(specifier)});`,
        "console.log('subpath import unexpectedly succeeded');",
        ""
    ].join("\n");
}

function subpathTypeSource() {
    return [
        "import { GraphBuilder } from 'typesea/dist/ir.js';",
        "void GraphBuilder;",
        ""
    ].join("\n");
}

function typeSource() {
    return [
        "import { compile, isSchemaRegistryValue, schemaRegistryToJsonSchema, t, toJSONSchema, type GlobalRegistryMetadata, type Infer, type JsonSchema, type JsonSchemaCyclesMode, type JsonSchemaOverride, type JsonSchemaRegistryDocument, type JsonSchemaReusedMode, type JsonSchemaTarget, type JsonSchemaUnrepresentableMode, type JsonSchemaUriMapper, type SchemaRegistryEntry } from 'typesea';",
        "const User = t.object({ id: t.string, age: t.number.int(), name: t.optional(t.string) });",
        "type User = Infer<typeof User>;",
        "const target: JsonSchemaTarget = 'openapi-3.0';",
        "const legacyTarget: JsonSchemaTarget = 'draft-4';",
        "const fallbackMode: JsonSchemaUnrepresentableMode = `${'a'}${'ny'}`;",
        "const uriMapper: JsonSchemaUriMapper = id => id;",
        "const cyclesMode: JsonSchemaCyclesMode = 'ref';",
        "const reusedMode: JsonSchemaReusedMode = 'ref';",
        "const overrideHook: JsonSchemaOverride = ctx => { ctx.jsonSchema.description = ctx.target; };",
        "const input: unknown = { id: 'u_1', age: 1 };",
        "const FastUser = compile(User);",
        "const schemaAliasResult = toJSONSchema(User);",
        "const docs = t.registry<GlobalRegistryMetadata>();",
        "docs.add(User, { id: 'TypeUser', title: 'Type User' });",
        "const registryBundle = schemaRegistryToJsonSchema(docs);",
        "const registryBundleAlias = toJSONSchema(docs);",
        "const documentedSchema = toJSONSchema(User, { metadata: docs });",
        "const NumberText = t.stringToInt();",
        "const typedDecodedAsync = t.decodeAsync(NumberText, '1');",
        "const typedEncodedAsync = t.encodeAsync(NumberText, 1);",
        "const registryEntries: readonly SchemaRegistryEntry<GlobalRegistryMetadata>[] = docs.entries();",
        "const registryDocument: JsonSchemaRegistryDocument | undefined = registryBundle.ok ? registryBundle.value : undefined;",
        "if (registryBundleAlias.ok) {",
        "  const bundleDocument: JsonSchemaRegistryDocument = registryBundleAlias.value;",
        "  void bundleDocument;",
        "}",
        "if (FastUser.is(input)) {",
        "  const user: User = input;",
        "  user.id.toUpperCase();",
        "}",
        "const schema: JsonSchema = true;",
        "void schema;",
        "void target;",
        "void legacyTarget;",
        "void fallbackMode;",
        "void uriMapper;",
        "void cyclesMode;",
        "void reusedMode;",
        "void overrideHook;",
        "void schemaAliasResult;",
        "void registryEntries;",
        "void registryDocument;",
        "void documentedSchema;",
        "void typedDecodedAsync;",
        "void typedEncodedAsync;",
        "void isSchemaRegistryValue(docs);",
        ""
    ].join("\n");
}

function tsconfigSource() {
    return JSON.stringify({
        compilerOptions: {
            exactOptionalPropertyTypes: true,
            module: "NodeNext",
            moduleResolution: "NodeNext",
            noUncheckedIndexedAccess: true,
            strict: true,
            target: "ES2023"
        },
        include: ["index.ts"]
    }, null, 2);
}

/**
 * @brief Run local helper.
 */
function run(command, args, cwd) {
    return runProcess(command, args, cwd, true);
}

/**
 * @brief Run expect failure.
 */
function runExpectFailure(command, args, cwd) {
    return runProcess(command, args, cwd, false);
}

/**
 * @brief Run process.
 */
function runProcess(command, args, cwd, expectSuccess) {
    return new Promise((resolvePromise) => {
        const child = spawn(command, args, {
            cwd,
            stdio: ["ignore", "pipe", "pipe"]
        });
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
            stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk;
        });
        child.on("error", (error) => {
            resolvePromise(err(`${command} failed to start: ${String(error)}`));
        });
        child.on("close", (code) => {
            if ((code === 0) === expectSuccess) {
                resolvePromise(ok({ stdout, stderr }));
                return;
            }
            const expectation = expectSuccess ? "succeed" : "fail";
            resolvePromise(err(`${command} ${args.join(" ")} was expected to ${expectation}, got ${String(code)}\n${stdout}\n${stderr}`));
        });
    });
}

/**
 * @brief Accept non-array objects before structured field reads.
 */
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Construct a successful result value.
 */
function ok(value) {
    return { ok: true, value };
}

/**
 * @brief Construct a failed result value.
 */
function err(error) {
    return { ok: false, error };
}
