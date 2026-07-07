# Contributing to TypeSea

Thank you for your interest in contributing to TypeSea! TypeSea is not just another validation library; it is a **Sea-of-Nodes JIT/AOT Compiler** disguised as a validation library. Our ultimate goal is to provide **Zero-cost Abstraction** with the highest possible performance and security on the V8 engine.

Before submitting a pull request, please read through our core philosophies and coding guidelines.

---

## 1. Core Philosophies

### 1.1. Zero Dependencies
TypeSea must have **0 dependencies** for its runtime and compiler. We do not rely on Babel, Prettier, or any external utilities to parse, optimize, or format our generated code. Everything is built from scratch to ensure a microscopic bundle size and cold-start time.

### 1.2. Extreme V8 Performance (Zero-cost Abstraction)
Our validation hot paths (`is()`, `check()`) must run at maximum speed (target: 40M+ ops/sec).
- **No Closure Allocations**: Avoid creating anonymous functions or closures in hot paths.
- **Use `break label`**: For control flow jumps (e.g., Union dispatch, Presence dispatch), prefer labeled blocks (`label: {}`) and `break label;` over function calls.
- **Side-table Literals**: Do not interpolate string literals directly into generated JS code to avoid V8 parsing overhead. Store them in a side-table array (`u[0]`, `l[1]`) and reference them by index.
- **Jump Tables**: Use `switch(typeof v)` or `switch(v)` to allow V8 to generate `O(1)` memory jump tables instead of `O(N)` if/else chains.

### 1.3. Uncompromising Security (Safe Mode)
Validation speed must not compromise security. We treat all incoming objects as potentially malicious.
- **Defend against Prototype Poisoning**: Do not blindly read `value.prop`.
- **Defend against Malicious Accessors**: In `safe` mode, ALWAYS use `Object.getOwnPropertyDescriptor` (`gp`) and check for hostile getters before reading `.value`. (e.g., `!h.call(d, "value")`).

---

## 2. Compiler Architecture

When contributing a new validation feature, you must understand the TypeSea compiler pipeline. A feature is never just a "function call". It must flow through the entire architecture:

1. **Builder API (`src/builders/`)**: The user-facing API (`t.string`, `t.object()`). Returns a `Schema` node (`SchemaTag`).
2. **IR Lowering (`src/lower/`)**: Converts the Builder Schema into a Sea-of-Nodes Intermediate Representation (`NodeTag`).
3. **Static Analysis & Optimization (`src/optimize/`)**:
   - **Constant Folding**: Remove redundant constraints (e.g., `.min(0).min(10)` -> `.min(10)`).
   - **Peephole Optimization**: Eliminate unreachable union branches (`t.never`) and redundant logic.
4. **Code Generation (`src/compile/`)**: Traverse the optimized IR graph and emit pure, unrolled JavaScript strings.

> **Requirement**: Any new schema feature must be supported across the **Interpreter**, **JIT Compiler**, **AOT/Async Compiler**, and **JSON Schema generator**.

---

## 3. Coding Style

### 3.1. Documentation (JSDoc)
All functions and complex types must include detailed C/C++ style JSDoc comments:
```typescript
/**
 * @brief Short description of the function.
 * @details Deeper explanation of how the optimization works.
 * @param value The value to inspect.
 * @returns True if successful.
 */
```

### 3.2. Strict TypeScript & Type Inference
- Use `readonly` everywhere for schema nodes and IR structures. Objects must be deeply immutable.
- All public types must be strictly tested using `expectTypeOf<>`.

### 3.3. Test-Driven & CI/CD Gates
Before opening a PR, you must pass the entire validation suite:
```bash
npm run check
```
This runs `policy`, `check:benchmarks`, `check:docs`, `typecheck`, `lint`, `test`, `build`, `check:dist`, `check:api`, and `check:pack`.

---

## 4. Good First Issues (For Beginners)

If you're new to TypeSea and intimidated by the Sea-of-Nodes compiler architecture, don't worry! There are plenty of meaningful ways to contribute without touching the core JIT/AOT code:

- **Error Message Improvements**: Enhancing the clarity of validation errors or adding custom string format validations.
- **Builder API Additions**: Adding simple utility wrappers around existing scalars (e.g., `t.string.uuid()`, `t.string.ip()`) or new metadata annotations.
- **Test Coverage**: Writing edge-case tests in `test/zod-like-features.test.ts` or `test/core.test.ts` to ensure our public API perfectly matches expected behaviors.
- **Documentation**: Improving JSDoc descriptions, adding code examples, or enhancing the Markdown files.

---

## 5. Submitting a Pull Request
1. Keep PRs highly focused. If you are adding a new IR optimization, include benchmark results (`npm run bench:compare`).
2. Ensure no regressions in `test/security-regression.test.ts`.
3. If changing the public API, ensure `check:api` is updated and approved.
