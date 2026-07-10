# TypeSea Static Analyzer

Repository analysis workbench for TypeSea. The published TypeSea runtime keeps
its zero-runtime-dependency boundary; repository-only developer tooling uses the
`typescript` dev dependency for compiler-grade parsing, symbol resolution, and
type checking.

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
npm run analyzer:typescript-frontend > typesea-typescript-ir.json
```

`analyzer:gate` exits non-zero when the configured quality gate fails.

`analyzer:typescript-frontend` runs the same JSON bridge consumed by
`scripts/contributing-policy.pl`. It is useful for inspecting the compiler IR
without running every policy rule; stdout is reserved for JSON so the output can
be piped to another tool or a file. The npm script uses the compact protocol;
invoke `node scripts/typescript-policy-bridge.mjs --pretty` directly only when a
full, substantially larger debugging payload is required.

## TypeScript Frontend and Type Inference

The TypeScript `Program`, AST, and `TypeChecker` are the authoritative frontend.
They handle nested syntax, comments, template literals, generics, overloads,
contextual typing, and control-flow narrowing using the repository's
`tsconfig.json`. Structural locations and types must come from this frontend,
not from regular-expression matches.

The small Hindley-Milner inference layer is deliberately supplement-only. It
may attach a labeled, lower-confidence fallback when TypeScript reports an
unusable `any`, `unknown`, error type, or when the checker is unavailable. It
never replaces or overrides a usable TypeScript type. TypeScript's structural,
union, intersection, conditional, mapped, and overloaded types are outside
plain HM's sound model.

The compiler bridge emits ranges with one canonical contract:

- offsets and columns count UTF-16 code units
- lines and columns are zero-based
- end positions are exclusive
- schema metadata records `encoding: "utf-16"`, `lineBase: 0`,
  `columnBase: 0`, and `endExclusive: true`

Terminal rendering converts those spans to one-based human-readable positions,
and SARIF/LSP adapters perform their format-specific conversion. This matters
for exact columns before emoji and other non-BMP characters.

The fact model also carries explicit runtime owners for module initialization,
class-static evaluation, implicit constructors, and instance-field evaluation,
plus semantic edges between them. Getter/setter dispatch, object computed names,
and decorator application are represented even though the source contains no
explicit call expression; unresolved decorator factory results fail closed.
Type-only AST spans are separately enumerated and excluded from local runtime
metrics. As a result, an `eval(` method inside a type literal is not a
dynamic-code call, a constructor signature is not an allocation, and a deferred
field callback body is not treated as having run while the class is defined.

`scripts/contributing-policy.pl` remains the policy, quality-gate, and reporting
orchestrator. It invokes the Node bridge once, consumes AST/type facts and exact
spans, then renders its Rust-style terminal diagnostics or machine output.

## Editor Language Server

Start the stdio language server through an LSP-capable editor client:

```bash
npm run --silent analyzer:lsp
```

Configure the client command as `npm`, arguments as
`["run", "--silent", "analyzer:lsp"]`, transport as `stdio`, and the workspace
root as this repository. The optional initialization setting
`initializationOptions.tsconfigPath` can select a workspace-relative tsconfig;
otherwise the nearest root `tsconfig.json` is used.

The server currently provides:

- full-document synchronization for TypeScript and JavaScript-family files
- TypeScript syntactic, semantic, and suggestion diagnostics with exact ranges
- document-local TypeSea diagnostics, including AST-detected type escapes and
  statically detectable regex risks, with remediation text
- Markdown hover showing the compiler-inferred type and documentation
- TypeScript quick-fix code actions for published diagnostics
- go-to-definition locations resolved through the TypeScript language service
- UTF-16 position negotiation, matching LSP's widely supported coordinate model

It is a language server process, not an editor extension: it does not install or
register itself in VS Code. Completion, rename, references, and incremental text
sync are not advertised yet. Repository-global findings such as import cycles,
release evidence, and cross-file quality budgets still come from the full
policy/analyzer run; editor publication intentionally uses the safe local subset.

## Scope

The analyzer scans `src`, `test`, `bench`, `scripts`, and `tools/analyzer`.
It builds a runtime module graph, separates type-only edges, resolves literal
dynamic imports, detects cycles, reports layer-boundary drift, highlights large
files, and surfaces missing public JSDoc candidates.

Files admitted by `tsconfig.json` use the authoritative Compiler API frontend.
JavaScript-family tooling files outside that project remain explicitly labeled
legacy token heuristics; they are never presented as TypeChecker-derived facts.

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

The dashboard and reporting stack otherwise use Node.js built-ins. Compiler
integration uses the repository's TypeScript dev dependency. All analyzer,
frontend, and LSP code stays under `tools/analyzer` or `scripts`, so published
TypeSea runtime exports and install-time dependencies remain unaffected.
