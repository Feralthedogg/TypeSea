# Contributing to TypeSea

Keep changes focused, preserve validation parity, and run the repository gates
before opening a pull request.

## 1. Core Philosophies

### 1.1. Zero Dependencies

- Published TypeSea code must keep zero runtime, peer, optional, and bundled
  dependencies.
- Runtime source may import only relative modules and `node:` built-ins.
- Development tooling is allowed only when it does not become part of the
  published runtime.

### 1.2. Extreme V8 Performance (Zero-cost Abstraction)

- Do not add closures, temporary collections, or repeated normalization to a
  validation hot path without benchmark evidence.
- Keep user-controlled literals, regular expressions, schemas, and key sets in
  compiler side tables instead of interpolating them into generated source.
- Preserve established emitter shapes such as indexed loops, labeled exits, and
  compact dispatch unless measurements support a change.
- The warmed unchecked valid-object benchmark target is at least 40M ops/sec on
  the recorded benchmark machine.
- Run `npm run bench:compare` for optimizer, evaluator, compiler, or hot-path
  changes. Update the committed benchmark snapshot only with
  `npm run bench:record`.

### 1.3. Uncompromising Security (Safe Mode)

- Treat validation input as hostile.
- Safe mode must not execute getters or accept prototype-backed fields. Read own
  property descriptors and prove a data `value` slot before loading it.
- Use descriptor-safe writes for keys such as `__proto__`, `constructor`, and
  `prototype`.
- Direct property and index access belongs only in explicit `unsafe` or
  `unchecked` paths. Keep the mode contract visible in code and tests.
- Expected `is()` and `check()` failures return typed results; they do not throw.

## 2. Compiler Architecture

The schema tree is the semantic source for builders and diagnostics. Boolean
compilation lowers schemas into optimized Sea-of-Nodes validation plans.

Feature work may affect these stages:

1. `src/builders/` and `src/guard/`: public construction and fluent APIs.
2. `src/schema/`: immutable schema variants and validation.
3. `src/lower/`, `src/ir/`, and `src/optimize/`: graph lowering and optimization.
4. `src/plan/` and `src/evaluate/`: interpreted predicates, diagnostics, and
   output finalization.
5. `src/compile/` and `src/aot/`: runtime and ahead-of-time source generation.
6. `src/async-validation/`, `src/json-schema/`, and compatibility surfaces:
   alternate execution and interchange paths.

> **Requirement**: A schema change must either support every relevant execution
> path or reject unsupported export/compilation explicitly. Add parity tests for
> interpreted, compiled, AOT, and async behavior where those paths apply.

## 3. Coding Style

### 3.1. Documentation (JSDoc)

- Document public APIs, generated-source ABI, hostile-input defenses, unsafe
  contracts, and non-obvious compiler invariants.
- Explain why a code shape must survive refactoring. Do not restate a function
  name, signature, or obvious return value.
- Public declarations should start with a concise `@brief`. Add `@details` only
  for behavior that is not expressible in the TypeScript type.
- Private helpers do not need JSDoc by default. Prefer a short block comment at
  the branch or loop whose security, allocation, or control-flow constraint is
  easy to break accidentally.
- Add `@param` and `@returns` only when ownership, sentinel values, mutation, or
  failure semantics are not obvious from the signature. Use `@pre`, `@post`,
  and `@invariant` for guarantees that callers or later compiler passes rely on.
- Call out hot-path consequences explicitly: allocation, descriptor reads,
  accessor execution, side-table indexes, V8 code shape, and recursion limits.
- Keep comments synchronized with behavior. A stale comment is a defect; a
  low-information comment should be deleted rather than expanded with filler.

Avoid declaration narration:

```typescript
/** @brief Emit graph body. */
function emitGraphBody(/* ... */): string;
```

Document the constraint that determines the implementation instead:

```typescript
/**
 * @brief Walk present array indexes when the item schema accepts undefined.
 * @details Enumerating own names allocates once but avoids a length-proportional
 * scan of hostile sparse arrays and never executes index accessors.
 */
function emitPresentArrayEveryCheck(/* ... */): void;
```

Use `//` for a narrow local fact, `/* ... */` for a multi-line algorithmic
rationale, and `/** ... */` only when tooling or declaration-level API context
benefits from JSDoc.

### 3.2. Strict TypeScript & Type Inference

- Use four spaces for indentation.
- `any`, `try`, and `catch` are prohibited by source policy. Use `unknown` at
  untrusted boundaries and narrow it explicitly.
- Prefer discriminated unions and `Result` values so invalid states remain
  unrepresentable.
- Keep schemas, IR nodes, plans, and public results readonly or frozen according
  to their contract.
- Add `expectTypeOf` coverage for public inference changes.
- Avoid type assertions unless the boundary has a local runtime proof.

### 3.3. Test-Driven & CI/CD Gates

Install and run the complete gate:

```bash
npm ci
npm run check
```

`npm run check` covers policy, static analysis, documentation, types, lint,
tests, build output, public API, Zod compatibility, and package contents.

> **Required**: Every contribution must pass
> `scripts/contributing-policy.pl` through `npm run check:contributing`. A pull
> request cannot be accepted while this gate fails. Do not bypass it with a
> suppression or budget change unless the underlying finding is a documented,
> reviewed false positive.

Useful focused commands:

```bash
npm test -- test/core.test.ts
npm run check:contributing
npm run analyzer:gate
npm run check:api
npm run check:zod-compat
```

Policy diagnostics are `error`, `warning`, or `notice`. Use the analyzer help
and rule explanation instead of reading its implementation:

```bash
perl scripts/contributing-policy.pl --help
perl scripts/contributing-policy.pl --explain RULE_CODE
```

Use suppressions only for reviewed false positives. The comment must sit directly
above the affected line or declaration and include an exact rule plus a reason:

```typescript
/*
 * TINL flow.complexity: generated dispatch remains flat for measured V8 locality
 */
emitDispatch();
```

`TINL` suppresses the next line. `TIND` suppresses the next declaration. Wildcard
rules and reasonless suppressions are not accepted.

For documentation-site changes:

```bash
corepack pnpm --dir website install --frozen-lockfile
corepack pnpm --dir website run verify
```

## 4. Good First Issues (For Beginners)

- Add focused regression tests for documented behavior.
- Improve actionable error messages without changing issue codes.
- Add a builder alias backed by an existing schema contract.
- Correct API examples or English/Korean documentation drift.

Avoid starting with compiler emitter or optimizer changes unless you can provide
parity tests and warmed benchmark evidence.

## 5. Submitting a Pull Request

1. Keep one behavioral change per pull request.
2. Include regression tests for every fixed bug or new contract.
3. Run `npm run check` and report any gate that could not be executed.
4. Include `npm run bench:compare` results for performance-sensitive changes.
5. Update API snapshots and documentation when the public surface changes.
6. Preserve `test/security-regression.test.ts` and fuzz parity for validation
   engine changes.
7. Do not weaken budgets, suppressions, or security checks merely to make CI
   pass.
