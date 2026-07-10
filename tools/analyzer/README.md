# TypeSea Static Analyzer

Zero-dependency repository analysis workbench for TypeSea.

## Run

```bash
npm run analyzer
```

Then open `http://127.0.0.1:4178`.

## CLI

```bash
npm run analyzer:scan
npm run analyzer:gate
npm run analyzer:json
npm run analyzer:sarif > typesea-analysis.sarif
```

`analyzer:gate` exits non-zero when the configured quality gate fails.

## Scope

The analyzer scans `src`, `test`, `bench`, `scripts`, and `tools/analyzer`.
It builds a runtime module graph, separates type-only edges, resolves literal
dynamic imports, detects cycles, reports layer-boundary drift, highlights large
files, and surfaces missing public JSDoc candidates.

## Analyzer Model

The workbench uses a Coverity/SonarQube-style issue model:

- rule catalog with severity, category, precision, confidence, and TypeSea domain
- quality profile in `tools/analyzer/profile.json`
- quality gate with blocking budgets for errors, cycles, compiler exhaustiveness,
  security warnings, and warning volume
- deterministic issue fingerprints and baseline suppression
- SARIF 2.1.0 export for CI/code-scanning integrations
- function summaries with local complexity, descriptor-proof, dynamic-code,
  hostile-read, call-out, and throw counters
- function call graph with recursive SCC detection
- rule summary ordered by hit count
- risk-weighted hotspot ranking
- TypeSea-specific rules for JIT dynamic-code bridges, hostile-input property
  access, descriptor value-slot proofs, generated-source ABI helpers,
  SchemaTag/NodeTag stage coverage, runtime module boundaries, and complexity

The implementation uses only Node.js built-ins. The backend, frontend, and
analysis engine are kept under `tools/analyzer` so published TypeSea runtime
exports remain unaffected.
