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
    ["tsc", "subpath.ts", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2023", "--noEmit"],
    workspace
  );
  if (!typeSubpath.ok) {
    return typeSubpath;
  }
  return run("npx", ["tsc", "-p", "tsconfig.json", "--noEmit"], workspace);
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

function runtimeSource() {
  return [
    "import { compile, t, toJsonSchema } from 'typesea';",
    "const User = t.strictObject({",
    "  id: t.string.uuid(),",
    "  age: t.number.int().gte(0),",
    "  tags: t.array(t.string.min(1))",
    "});",
    "const FastUser = compile(User, { name: 'consumerUser' });",
    "const value = { id: '550e8400-e29b-41d4-a716-446655440000', age: 37, tags: ['ok'] };",
    "if (!User.is(value) || !FastUser.is(value) || !FastUser.check(value).ok) process.exit(1);",
    "const json = toJsonSchema(User);",
    "if (!json.ok) process.exit(1);",
    "console.log('consumer runtime ok');",
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
    "import { compile, t, type Infer, type JsonSchema } from 'typesea';",
    "const User = t.object({ id: t.string, age: t.number.int(), name: t.optional(t.string) });",
    "type User = Infer<typeof User>;",
    "const input: unknown = { id: 'u_1', age: 1 };",
    "const FastUser = compile(User);",
    "if (FastUser.is(input)) {",
    "  const user: User = input;",
    "  user.id.toUpperCase();",
    "}",
    "const schema: JsonSchema = true;",
    "void schema;",
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

function run(command, args, cwd) {
  return runProcess(command, args, cwd, true);
}

function runExpectFailure(command, args, cwd) {
  return runProcess(command, args, cwd, false);
}

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

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ok(value) {
  return { ok: true, value };
}

function err(error) {
  return { ok: false, error };
}
