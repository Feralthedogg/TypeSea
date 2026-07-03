# Release Checklist

Run the release gate before publishing:

```sh
npm run release:check
```

The release gate runs these checks in order:

```sh
npm run check
npm run check:consumer
npm run bench -- --run
npm run pack:dry
```

Required invariants:

- Source policy passes: no `any`, `try`, or `catch` in `src`, `test`, `bench`,
  `scripts`, or the root ESLint config.
- Documentation site smoke passes for required sections, local anchors, local
  reference links, and no remote resource URLs.
- TypeScript emits `dist` declarations and JavaScript.
- Built package artifacts contain no `any`, `try`, or `catch` in emitted
  JavaScript or declaration files.
- Root runtime and declaration public API surfaces match the checked export
  snapshot.
- Packed package contents match the checked tarball file snapshot.
- Test suite passes.
- IR semantic evaluator tests pass against representative guard predicates,
  including strict object extra-key rejection.
- Public type contract tests pass for `Infer`, presence, brands, compiled guards,
  and rejected builder inputs.
- Compiled `is` and `check` parity tests pass.
- Compiled source audit tests pass for side-table value storage and generated
  function-name sanitization.
- Benchmark smoke includes TypeSea interpreted, TypeSea compiled, Zod, Valibot,
  and Ajv over the same JSON-compatible strict-object contract.
- Recursive `lazy` cycle and compiled fallback diagnostics tests pass.
- JSON Schema export tests pass.
- JSON Schema semantic export tests pass over JSON-compatible values.
- JSON Schema unsupported-path tests pass for nested object, array, tuple,
  record, union, and nullable children.
- Packed tarball installs in a clean consumer project.
- Installed package metadata has no runtime, peer, optional, or bundled
  dependency fields.
- Consumer ESM runtime import works.
- Consumer subpath imports are rejected by the `exports` map.
- Consumer TypeScript declarations typecheck under strict settings.
- `npm pack --dry-run` includes only intended package files.
- `package.json` has no runtime, peer, optional, or bundled dependencies.
- `package.json` version, repository, author, ESM-only exports, and changelog
  entries are current before publishing.
- CI runs `npm run check` on Node 20.19, 22, and 24.
- CI runs the same `npm run release:check` gate used locally.
- Publish workflow uses npm provenance.

The package is zero runtime dependency by policy. Benchmark comparison packages
are dev dependencies only and must never appear in runtime, peer, optional, or
bundled dependency fields.
