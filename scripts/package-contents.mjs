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
    "SECURITY.md",
    "CHANGELOG.md",
    "dist/adapters/index.d.ts",
    "dist/adapters/index.d.ts.map",
    "dist/adapters/index.js",
    "dist/analyze/index.d.ts",
    "dist/analyze/index.d.ts.map",
    "dist/analyze/index.js",
    "dist/aot/index.d.ts",
    "dist/aot/index.d.ts.map",
    "dist/aot/index.js",
    "dist/async/index.d.ts",
    "dist/async/index.d.ts.map",
    "dist/async/index.js",
    "dist/async-validation/index.d.ts",
    "dist/async-validation/index.d.ts.map",
    "dist/async-validation/index.js",
    "dist/builders/composite.d.ts",
    "dist/builders/composite.d.ts.map",
    "dist/builders/composite.js",
    "dist/builders/function.d.ts",
    "dist/builders/function.d.ts.map",
    "dist/builders/function.js",
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
    "dist/builders/runtime.d.ts",
    "dist/builders/runtime.d.ts.map",
    "dist/builders/runtime.js",
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
    "dist/compile/cache.d.ts",
    "dist/compile/cache.d.ts.map",
    "dist/compile/cache.js",
    "dist/compile/context.d.ts",
    "dist/compile/context.d.ts.map",
    "dist/compile/context.js",
    "dist/compile/debug-source.d.ts",
    "dist/compile/debug-source.d.ts.map",
    "dist/compile/debug-source.js",
    "dist/compile/first.d.ts",
    "dist/compile/first.d.ts.map",
    "dist/compile/first.js",
    "dist/compile/guard.d.ts",
    "dist/compile/guard.d.ts.map",
    "dist/compile/guard.js",
    "dist/compile/graph-predicate.d.ts",
    "dist/compile/graph-predicate.d.ts.map",
    "dist/compile/graph-predicate.js",
    "dist/compile/index.d.ts",
    "dist/compile/index.d.ts.map",
    "dist/compile/index.js",
    "dist/compile/issue.d.ts",
    "dist/compile/issue.d.ts.map",
    "dist/compile/issue.js",
    "dist/compile/names.d.ts",
    "dist/compile/names.d.ts.map",
    "dist/compile/names.js",
    "dist/compile/union-preflight.d.ts",
    "dist/compile/union-preflight.d.ts.map",
    "dist/compile/union-preflight.js",
    "dist/compile/runtime.d.ts",
    "dist/compile/runtime.d.ts.map",
    "dist/compile/runtime.js",
    "dist/compile/source.d.ts",
    "dist/compile/source.d.ts.map",
    "dist/compile/source.js",
    "dist/compile/types.d.ts",
    "dist/compile/types.d.ts.map",
    "dist/compile/types.js",
    "dist/config/index.d.ts",
    "dist/config/index.d.ts.map",
    "dist/config/index.js",
    "dist/core.d.ts",
    "dist/core.d.ts.map",
    "dist/core.js",
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
    "dist/evaluate/finalize.d.ts",
    "dist/evaluate/finalize.d.ts.map",
    "dist/evaluate/finalize.js",
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
    "dist/guard/array.d.ts",
    "dist/guard/array.d.ts.map",
    "dist/guard/array.js",
    "dist/guard/base.d.ts",
    "dist/guard/base.d.ts.map",
    "dist/guard/base.js",
    "dist/guard/bigint.d.ts",
    "dist/guard/bigint.d.ts.map",
    "dist/guard/bigint.js",
    "dist/guard/check-message.d.ts",
    "dist/guard/check-message.d.ts.map",
    "dist/guard/check-message.js",
    "dist/guard/date.d.ts",
    "dist/guard/date.d.ts.map",
    "dist/guard/date.js",
    "dist/guard/enum.d.ts",
    "dist/guard/enum.d.ts.map",
    "dist/guard/enum.js",
    "dist/guard/error.d.ts",
    "dist/guard/error.d.ts.map",
    "dist/guard/error.js",
    "dist/guard/file.d.ts",
    "dist/guard/file.d.ts.map",
    "dist/guard/file.js",
    "dist/guard/index.d.ts",
    "dist/guard/index.d.ts.map",
    "dist/guard/index.js",
    "dist/guard/literal.d.ts",
    "dist/guard/literal.d.ts.map",
    "dist/guard/literal.js",
    "dist/guard/map.d.ts",
    "dist/guard/map.d.ts.map",
    "dist/guard/map.js",
    "dist/guard/number.d.ts",
    "dist/guard/number.d.ts.map",
    "dist/guard/number.js",
    "dist/guard/parse-options.d.ts",
    "dist/guard/parse-options.d.ts.map",
    "dist/guard/parse-options.js",
    "dist/guard/props.d.ts",
    "dist/guard/props.d.ts.map",
    "dist/guard/props.js",
    "dist/guard/readonly-set.d.ts",
    "dist/guard/readonly-set.d.ts.map",
    "dist/guard/readonly-set.js",
    "dist/guard/read.d.ts",
    "dist/guard/read.d.ts.map",
    "dist/guard/read.js",
    "dist/guard/refine-options.d.ts",
    "dist/guard/refine-options.d.ts.map",
    "dist/guard/refine-options.js",
    "dist/guard/registry.d.ts",
    "dist/guard/registry.d.ts.map",
    "dist/guard/registry.js",
    "dist/guard/set.d.ts",
    "dist/guard/set.d.ts.map",
    "dist/guard/set.js",
    "dist/guard/string.d.ts",
    "dist/guard/string.d.ts.map",
    "dist/guard/string.js",
    "dist/guard/super-refine.d.ts",
    "dist/guard/super-refine.d.ts.map",
    "dist/guard/super-refine.js",
    "dist/guard/tuple.d.ts",
    "dist/guard/tuple.d.ts.map",
    "dist/guard/tuple.js",
    "dist/guard/types.d.ts",
    "dist/guard/types.d.ts.map",
    "dist/guard/types.js",
    "dist/guard/union.d.ts",
    "dist/guard/union.d.ts.map",
    "dist/guard/union.js",
    "dist/guard/with-check.d.ts",
    "dist/guard/with-check.d.ts.map",
    "dist/guard/with-check.js",
    "dist/guard/zod-def.d.ts",
    "dist/guard/zod-def.d.ts.map",
    "dist/guard/zod-def.js",
    "dist/index.d.ts",
    "dist/index.d.ts.map",
    "dist/index.js",
    "dist/locales.d.ts",
    "dist/locales.d.ts.map",
    "dist/locales.js",
    "dist/mini.d.ts",
    "dist/mini.d.ts.map",
    "dist/mini.js",
    "dist/v3.d.ts",
    "dist/v3.d.ts.map",
    "dist/v3.js",
    "dist/v4.d.ts",
    "dist/v4.d.ts.map",
    "dist/v4.js",
    "dist/v4/core.d.ts",
    "dist/v4/core.d.ts.map",
    "dist/v4/core.js",
    "dist/v4/locales.d.ts",
    "dist/v4/locales.d.ts.map",
    "dist/v4/locales.js",
    "dist/v4/mini.d.ts",
    "dist/v4/mini.d.ts.map",
    "dist/v4/mini.js",
    "dist/v4-mini.d.ts",
    "dist/v4-mini.d.ts.map",
    "dist/v4-mini.js",
    "dist/zod-compat.d.ts",
    "dist/zod-compat.d.ts.map",
    "dist/zod-compat.js",
    "dist/zod.d.ts",
    "dist/zod.d.ts.map",
    "dist/zod.js",
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
    "dist/json-schema/emit-context.d.ts",
    "dist/json-schema/emit-context.d.ts.map",
    "dist/json-schema/emit-context.js",
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
    "dist/json-schema/export.d.ts",
    "dist/json-schema/export.d.ts.map",
    "dist/json-schema/export.js",
    "dist/json-schema/freeze.d.ts",
    "dist/json-schema/freeze.d.ts.map",
    "dist/json-schema/freeze.js",
    "dist/json-schema/from.d.ts",
    "dist/json-schema/from.d.ts.map",
    "dist/json-schema/from.js",
    "dist/json-schema/index.d.ts",
    "dist/json-schema/index.d.ts.map",
    "dist/json-schema/index.js",
    "dist/json-schema/issue.d.ts",
    "dist/json-schema/issue.d.ts.map",
    "dist/json-schema/issue.js",
    "dist/json-schema/metadata.d.ts",
    "dist/json-schema/metadata.d.ts.map",
    "dist/json-schema/metadata.js",
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
    "dist/optimize/algebraic.d.ts",
    "dist/optimize/algebraic.d.ts.map",
    "dist/optimize/algebraic.js",
    "dist/optimize/compact.d.ts",
    "dist/optimize/compact.d.ts.map",
    "dist/optimize/compact.js",
    "dist/optimize/domain.d.ts",
    "dist/optimize/domain.d.ts.map",
    "dist/optimize/domain.js",
    "dist/optimize/fold-boolean.d.ts",
    "dist/optimize/fold-boolean.d.ts.map",
    "dist/optimize/fold-boolean.js",
    "dist/optimize/fold-constraints.d.ts",
    "dist/optimize/fold-constraints.d.ts.map",
    "dist/optimize/fold-constraints.js",
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
    "dist/optimize/map-node.d.ts",
    "dist/optimize/map-node.d.ts.map",
    "dist/optimize/map-node.js",
    "dist/optimize/peephole.d.ts",
    "dist/optimize/peephole.d.ts.map",
    "dist/optimize/peephole.js",
    "dist/optimize/remap.d.ts",
    "dist/optimize/remap.d.ts.map",
    "dist/optimize/remap.js",
    "dist/optimize/rewrite.d.ts",
    "dist/optimize/rewrite.d.ts.map",
    "dist/optimize/rewrite.js",
    "dist/plan/cache.d.ts",
    "dist/plan/cache.d.ts.map",
    "dist/plan/cache.js",
    "dist/plan/index.d.ts",
    "dist/plan/index.d.ts.map",
    "dist/plan/index.js",
    "dist/plan/predicate.d.ts",
    "dist/plan/predicate.d.ts.map",
    "dist/plan/predicate.js",
    "dist/plan/schema-predicate.d.ts",
    "dist/plan/schema-predicate.d.ts.map",
    "dist/plan/schema-predicate.js",
    "dist/parse/index.d.ts",
    "dist/parse/index.d.ts.map",
    "dist/parse/index.js",
    "dist/registry/index.d.ts",
    "dist/registry/index.d.ts.map",
    "dist/registry/index.js",
    "dist/regexes/index.d.ts",
    "dist/regexes/index.d.ts.map",
    "dist/regexes/index.js",
    "dist/plugin/index.d.ts",
    "dist/plugin/index.d.ts.map",
    "dist/plugin/index.js",
    "dist/plan/types.d.ts",
    "dist/plan/types.d.ts.map",
    "dist/plan/types.js",
    "dist/result/index.d.ts",
    "dist/result/index.d.ts.map",
    "dist/result/index.js",
    "dist/seaflow/case.d.ts",
    "dist/seaflow/case.d.ts.map",
    "dist/seaflow/case.js",
    "dist/seaflow/composite.d.ts",
    "dist/seaflow/composite.d.ts.map",
    "dist/seaflow/composite.js",
    "dist/seaflow/emit.d.ts",
    "dist/seaflow/emit.d.ts.map",
    "dist/seaflow/emit.js",
    "dist/seaflow/index.d.ts",
    "dist/seaflow/index.d.ts.map",
    "dist/seaflow/index.js",
    "dist/seaflow/namespace.d.ts",
    "dist/seaflow/namespace.d.ts.map",
    "dist/seaflow/namespace.js",
    "dist/seaflow/options.d.ts",
    "dist/seaflow/options.d.ts.map",
    "dist/seaflow/options.js",
    "dist/seaflow/sample.d.ts",
    "dist/seaflow/sample.d.ts.map",
    "dist/seaflow/sample.js",
    "dist/seaflow/scalar.d.ts",
    "dist/seaflow/scalar.d.ts.map",
    "dist/seaflow/scalar.js",
    "dist/seaflow/source.d.ts",
    "dist/seaflow/source.d.ts.map",
    "dist/seaflow/source.js",
    "dist/seaflow/types.d.ts",
    "dist/seaflow/types.d.ts.map",
    "dist/seaflow/types.js",
    "dist/seabreeze/builder.d.ts",
    "dist/seabreeze/builder.d.ts.map",
    "dist/seabreeze/builder.js",
    "dist/seabreeze/emit.d.ts",
    "dist/seabreeze/emit.d.ts.map",
    "dist/seabreeze/emit.js",
    "dist/seabreeze/index.d.ts",
    "dist/seabreeze/index.d.ts.map",
    "dist/seabreeze/index.js",
    "dist/seabreeze/lower-graph.d.ts",
    "dist/seabreeze/lower-graph.d.ts.map",
    "dist/seabreeze/lower-graph.js",
    "dist/seabreeze/lower-schema.d.ts",
    "dist/seabreeze/lower-schema.d.ts.map",
    "dist/seabreeze/lower-schema.js",
    "dist/seabreeze/reader.d.ts",
    "dist/seabreeze/reader.d.ts.map",
    "dist/seabreeze/reader.js",
    "dist/seabreeze/sea-breeze.d.ts",
    "dist/seabreeze/sea-breeze.d.ts.map",
    "dist/seabreeze/sea-breeze.js",
    "dist/seabreeze/serialize.d.ts",
    "dist/seabreeze/serialize.d.ts.map",
    "dist/seabreeze/serialize.js",
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
    "dist/schema/metadata.d.ts",
    "dist/schema/metadata.d.ts.map",
    "dist/schema/metadata.js",
    "dist/schema/record-key.d.ts",
    "dist/schema/record-key.d.ts.map",
    "dist/schema/record-key.js",
    "dist/schema/record-keys.d.ts",
    "dist/schema/record-keys.d.ts.map",
    "dist/schema/record-keys.js",
    "dist/schema/types.d.ts",
    "dist/schema/types.d.ts.map",
    "dist/schema/types.js",
    "dist/schema/undefined.d.ts",
    "dist/schema/undefined.d.ts.map",
    "dist/schema/undefined.js",
    "dist/schema/unwrap.d.ts",
    "dist/schema/unwrap.d.ts.map",
    "dist/schema/unwrap.js",
    "dist/schema/union.d.ts",
    "dist/schema/union.d.ts.map",
    "dist/schema/union.js",
    "dist/schema/validate.d.ts",
    "dist/schema/validate.d.ts.map",
    "dist/schema/validate.js",
    "dist/standard/index.d.ts",
    "dist/standard/index.d.ts.map",
    "dist/standard/index.js",
    "package.json"
];

const result = await main();
if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
}

/**
 * @brief Run this module top-level workflow.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
async function main() {
    const packageJson = JSON.parse(await readFile("package.json", "utf8"));
    if (!isRecord(packageJson)) {
        return err("package.json is not an object");
    }
    const dependencyCheck = checkZeroRuntimeDependencies(packageJson);
    if (!dependencyCheck.ok) {
        return dependencyCheck;
    }
    const metadataCheck = checkReleaseMetadata(packageJson);
    if (!metadataCheck.ok) {
        return metadataCheck;
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

/**
 * @brief Validate zero runtime dependencies.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function checkZeroRuntimeDependencies(packageJson) {
    for (let index = 0; index < runtimeDependencyFields.length; index += 1) {
        const field = runtimeDependencyFields[index];
        if (field !== undefined && packageJson[field] !== undefined) {
            return err(`${field} are not allowed`);
        }
    }
    return ok(undefined);
}

/**
 * @brief Validate release metadata.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function checkReleaseMetadata(packageJson) {
    if (packageJson["version"] === "0.0.0") {
        return err("package version must be release-ready");
    }
    if (packageJson["type"] !== "module") {
        return err("package must be ESM-only");
    }
    if (typeof packageJson["author"] !== "string" || packageJson["author"].length === 0) {
        return err("package author is required");
    }
    const repository = packageJson["repository"];
    if (!isRecord(repository) ||
        repository["type"] !== "git" ||
        typeof repository["url"] !== "string" ||
        repository["url"].length === 0) {
        return err("package repository git url is required");
    }
    const bugs = packageJson["bugs"];
    if (!isRecord(bugs) ||
        typeof bugs["url"] !== "string" ||
        bugs["url"].length === 0) {
        return err("package bugs url is required");
    }
    if (typeof packageJson["homepage"] !== "string" || packageJson["homepage"].length === 0) {
        return err("package homepage is required");
    }
    const exportsField = packageJson["exports"];
    if (!isRecord(exportsField)) {
        return err("package exports field is required");
    }
    const root = exportsField["."];
    if (!isRecord(root) || root["default"] !== "./dist/index.js") {
        return err("package root default export is required");
    }
    return ok(undefined);
}

/**
 * @brief Parse pack output.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
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

/**
 * @brief Run local helper.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
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

/**
 * @brief Check record.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Construct a successful result value.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function ok(value) {
    return { ok: true, value };
}

/**
 * @brief Construct a failed result value.
 * @details Script helpers keep release and policy checks deterministic for CI and local runs.
 */
function err(error) {
    return { ok: false, error };
}
