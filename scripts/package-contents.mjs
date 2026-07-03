import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const runtimeDependencyFields = [
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
  "bundleDependencies",
  "bundledDependencies"
];

const expectedFiles = [
  "LICENSE",
  "README.md",
  "dist/adapters/index.d.ts",
  "dist/adapters/index.d.ts.map",
  "dist/adapters/index.js",
  "dist/aot/index.d.ts",
  "dist/aot/index.d.ts.map",
  "dist/aot/index.js",
  "dist/async/index.d.ts",
  "dist/async/index.d.ts.map",
  "dist/async/index.js",
  "dist/builders/composite.d.ts",
  "dist/builders/composite.d.ts.map",
  "dist/builders/composite.js",
  "dist/builders/index.d.ts",
  "dist/builders/index.d.ts.map",
  "dist/builders/index.js",
  "dist/builders/modifier.d.ts",
  "dist/builders/modifier.d.ts.map",
  "dist/builders/modifier.js",
  "dist/builders/object/guard.d.ts",
  "dist/builders/object/guard.d.ts.map",
  "dist/builders/object/guard.js",
  "dist/builders/object/index.d.ts",
  "dist/builders/object/index.d.ts.map",
  "dist/builders/object/index.js",
  "dist/builders/object/schema.d.ts",
  "dist/builders/object/schema.d.ts.map",
  "dist/builders/object/schema.js",
  "dist/builders/object/types.d.ts",
  "dist/builders/object/types.d.ts.map",
  "dist/builders/object/types.js",
  "dist/builders/scalar.d.ts",
  "dist/builders/scalar.d.ts.map",
  "dist/builders/scalar.js",
  "dist/builders/table.d.ts",
  "dist/builders/table.d.ts.map",
  "dist/builders/table.js",
  "dist/builders/types.d.ts",
  "dist/builders/types.d.ts.map",
  "dist/builders/types.js",
  "dist/compile/check-composite.d.ts",
  "dist/compile/check-composite.d.ts.map",
  "dist/compile/check-composite.js",
  "dist/compile/check-scalar.d.ts",
  "dist/compile/check-scalar.d.ts.map",
  "dist/compile/check-scalar.js",
  "dist/compile/check.d.ts",
  "dist/compile/check.d.ts.map",
  "dist/compile/check.js",
  "dist/compile/context.d.ts",
  "dist/compile/context.d.ts.map",
  "dist/compile/context.js",
  "dist/compile/guard.d.ts",
  "dist/compile/guard.d.ts.map",
  "dist/compile/guard.js",
  "dist/compile/index.d.ts",
  "dist/compile/index.d.ts.map",
  "dist/compile/index.js",
  "dist/compile/issue.d.ts",
  "dist/compile/issue.d.ts.map",
  "dist/compile/issue.js",
  "dist/compile/names.d.ts",
  "dist/compile/names.d.ts.map",
  "dist/compile/names.js",
  "dist/compile/predicate.d.ts",
  "dist/compile/predicate.d.ts.map",
  "dist/compile/predicate.js",
  "dist/compile/runtime.d.ts",
  "dist/compile/runtime.d.ts.map",
  "dist/compile/runtime.js",
  "dist/compile/source.d.ts",
  "dist/compile/source.d.ts.map",
  "dist/compile/source.js",
  "dist/compile/types.d.ts",
  "dist/compile/types.d.ts.map",
  "dist/compile/types.js",
  "dist/decoder/index.d.ts",
  "dist/decoder/index.d.ts.map",
  "dist/decoder/index.js",
  "dist/evaluate/check-composite.d.ts",
  "dist/evaluate/check-composite.d.ts.map",
  "dist/evaluate/check-composite.js",
  "dist/evaluate/check-scalar.d.ts",
  "dist/evaluate/check-scalar.d.ts.map",
  "dist/evaluate/check-scalar.js",
  "dist/evaluate/check.d.ts",
  "dist/evaluate/check.d.ts.map",
  "dist/evaluate/check.js",
  "dist/evaluate/index.d.ts",
  "dist/evaluate/index.d.ts.map",
  "dist/evaluate/index.js",
  "dist/evaluate/issue.d.ts",
  "dist/evaluate/issue.d.ts.map",
  "dist/evaluate/issue.js",
  "dist/evaluate/predicate.d.ts",
  "dist/evaluate/predicate.d.ts.map",
  "dist/evaluate/predicate.js",
  "dist/evaluate/shared.d.ts",
  "dist/evaluate/shared.d.ts.map",
  "dist/evaluate/shared.js",
  "dist/evaluate/state.d.ts",
  "dist/evaluate/state.d.ts.map",
  "dist/evaluate/state.js",
  "dist/guard/base.d.ts",
  "dist/guard/base.d.ts.map",
  "dist/guard/base.js",
  "dist/guard/error.d.ts",
  "dist/guard/error.d.ts.map",
  "dist/guard/error.js",
  "dist/guard/index.d.ts",
  "dist/guard/index.d.ts.map",
  "dist/guard/index.js",
  "dist/guard/number.d.ts",
  "dist/guard/number.d.ts.map",
  "dist/guard/number.js",
  "dist/guard/props.d.ts",
  "dist/guard/props.d.ts.map",
  "dist/guard/props.js",
  "dist/guard/read.d.ts",
  "dist/guard/read.d.ts.map",
  "dist/guard/read.js",
  "dist/guard/registry.d.ts",
  "dist/guard/registry.d.ts.map",
  "dist/guard/registry.js",
  "dist/guard/string.d.ts",
  "dist/guard/string.d.ts.map",
  "dist/guard/string.js",
  "dist/guard/types.d.ts",
  "dist/guard/types.d.ts.map",
  "dist/guard/types.js",
  "dist/index.d.ts",
  "dist/index.d.ts.map",
  "dist/index.js",
  "dist/internal/index.d.ts",
  "dist/internal/index.d.ts.map",
  "dist/internal/index.js",
  "dist/ir/builder.d.ts",
  "dist/ir/builder.d.ts.map",
  "dist/ir/builder.js",
  "dist/ir/freeze.d.ts",
  "dist/ir/freeze.d.ts.map",
  "dist/ir/freeze.js",
  "dist/ir/index.d.ts",
  "dist/ir/index.d.ts.map",
  "dist/ir/index.js",
  "dist/ir/regexp.d.ts",
  "dist/ir/regexp.d.ts.map",
  "dist/ir/regexp.js",
  "dist/ir/types.d.ts",
  "dist/ir/types.d.ts.map",
  "dist/ir/types.js",
  "dist/ir/validate.d.ts",
  "dist/ir/validate.d.ts.map",
  "dist/ir/validate.js",
  "dist/issue/index.d.ts",
  "dist/issue/index.d.ts.map",
  "dist/issue/index.js",
  "dist/json-schema/emit-combinator.d.ts",
  "dist/json-schema/emit-combinator.d.ts.map",
  "dist/json-schema/emit-combinator.js",
  "dist/json-schema/emit-composite.d.ts",
  "dist/json-schema/emit-composite.d.ts.map",
  "dist/json-schema/emit-composite.js",
  "dist/json-schema/emit-scalar.d.ts",
  "dist/json-schema/emit-scalar.d.ts.map",
  "dist/json-schema/emit-scalar.js",
  "dist/json-schema/emit-types.d.ts",
  "dist/json-schema/emit-types.d.ts.map",
  "dist/json-schema/emit-types.js",
  "dist/json-schema/emit.d.ts",
  "dist/json-schema/emit.d.ts.map",
  "dist/json-schema/emit.js",
  "dist/json-schema/freeze.d.ts",
  "dist/json-schema/freeze.d.ts.map",
  "dist/json-schema/freeze.js",
  "dist/json-schema/index.d.ts",
  "dist/json-schema/index.d.ts.map",
  "dist/json-schema/index.js",
  "dist/json-schema/issue.d.ts",
  "dist/json-schema/issue.d.ts.map",
  "dist/json-schema/issue.js",
  "dist/json-schema/read.d.ts",
  "dist/json-schema/read.d.ts.map",
  "dist/json-schema/read.js",
  "dist/json-schema/types.d.ts",
  "dist/json-schema/types.d.ts.map",
  "dist/json-schema/types.js",
  "dist/kind/index.d.ts",
  "dist/kind/index.d.ts.map",
  "dist/kind/index.js",
  "dist/lower/index.d.ts",
  "dist/lower/index.d.ts.map",
  "dist/lower/index.js",
  "dist/message/index.d.ts",
  "dist/message/index.d.ts.map",
  "dist/message/index.js",
  "dist/optimize/compact.d.ts",
  "dist/optimize/compact.d.ts.map",
  "dist/optimize/compact.js",
  "dist/optimize/fold-boolean.d.ts",
  "dist/optimize/fold-boolean.d.ts.map",
  "dist/optimize/fold-boolean.js",
  "dist/optimize/fold-common.d.ts",
  "dist/optimize/fold-common.d.ts.map",
  "dist/optimize/fold-common.js",
  "dist/optimize/fold-scalar.d.ts",
  "dist/optimize/fold-scalar.d.ts.map",
  "dist/optimize/fold-scalar.js",
  "dist/optimize/fold.d.ts",
  "dist/optimize/fold.d.ts.map",
  "dist/optimize/fold.js",
  "dist/optimize/index.d.ts",
  "dist/optimize/index.d.ts.map",
  "dist/optimize/index.js",
  "dist/optimize/remap.d.ts",
  "dist/optimize/remap.d.ts.map",
  "dist/optimize/remap.js",
  "dist/optimize/rewrite.d.ts",
  "dist/optimize/rewrite.d.ts.map",
  "dist/optimize/rewrite.js",
  "dist/result/index.d.ts",
  "dist/result/index.d.ts.map",
  "dist/result/index.js",
  "dist/schema/common.d.ts",
  "dist/schema/common.d.ts.map",
  "dist/schema/common.js",
  "dist/schema/freeze.d.ts",
  "dist/schema/freeze.d.ts.map",
  "dist/schema/freeze.js",
  "dist/schema/index.d.ts",
  "dist/schema/index.d.ts.map",
  "dist/schema/index.js",
  "dist/schema/lazy.d.ts",
  "dist/schema/lazy.d.ts.map",
  "dist/schema/lazy.js",
  "dist/schema/literal.d.ts",
  "dist/schema/literal.d.ts.map",
  "dist/schema/literal.js",
  "dist/schema/types.d.ts",
  "dist/schema/types.d.ts.map",
  "dist/schema/types.js",
  "dist/schema/validate.d.ts",
  "dist/schema/validate.d.ts.map",
  "dist/schema/validate.js",
  "docs/api-surface.md",
  "docs/api.md",
  "docs/documentation-style.md",
  "docs/engine-notes.md",
  "docs/index.html",
  "docs/release-checklist.md",
  "package.json"
];

const result = await main();
if (!result.ok) {
  console.error(result.error);
  process.exitCode = 1;
}

async function main() {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  if (!isRecord(packageJson)) {
    return err("package.json is not an object");
  }
  const dependencyCheck = checkZeroRuntimeDependencies(packageJson);
  if (!dependencyCheck.ok) {
    return dependencyCheck;
  }

  const pack = run(npm, ["pack", "--dry-run", "--json", "--ignore-scripts"]);
  if (!pack.ok) {
    return pack;
  }

  const parsed = parsePackOutput(pack.value.stdout);
  if (!parsed.ok) {
    return parsed;
  }

  const files = parsed.value;
  const expected = expectedFiles.slice().sort();
  const actual = files.slice().sort();
  const missing = expected.filter((path) => !actual.includes(path));
  const extra = actual.filter((path) => !expected.includes(path));
  if (missing.length !== 0 || extra.length !== 0) {
    return err([
      "package contents mismatch",
      `missing: ${missing.join(", ") || "<none>"}`,
      `extra: ${extra.join(", ") || "<none>"}`
    ].join("\n"));
  }

  return ok(undefined);
}

function checkZeroRuntimeDependencies(packageJson) {
  for (let index = 0; index < runtimeDependencyFields.length; index += 1) {
    const field = runtimeDependencyFields[index];
    if (field !== undefined && packageJson[field] !== undefined) {
      return err(`${field} are not allowed`);
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
  const rawFiles = first["files"];
  if (!Array.isArray(rawFiles)) {
    return err("npm pack output did not include files");
  }
  const files = [];
  for (let index = 0; index < rawFiles.length; index += 1) {
    const file = rawFiles[index];
    if (!isRecord(file)) {
      return err("npm pack returned an invalid file record");
    }
    const path = file["path"];
    if (typeof path !== "string") {
      return err("npm pack file record did not include path");
    }
    files.push(path);
  }
  return ok(files);
}

function run(command, args) {
  const child = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (child.error !== undefined) {
    return err(`${command} failed to start: ${String(child.error)}`);
  }
  if (child.status !== 0) {
    return err(`${command} ${args.join(" ")} failed with ${String(child.status)}\n${child.stdout}\n${child.stderr}`);
  }
  return ok({ stdout: child.stdout, stderr: child.stderr });
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
