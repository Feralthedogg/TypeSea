# Documentation Style

TypeSea documentation uses a hybrid style: TypeScript/TSDoc for tool-friendly
API extraction, and C/Doxygen for contract-heavy implementation comments.

The rules are based on these sources:

- TypeDoc doc comments: Markdown in comments, fenced examples, and declaration
  discovery.
- TSDoc: standardized TypeScript doc comments with parseable tags.
- Doxygen: brief description first, detailed description after, and one comment
  block per documented entity.
- Google developer documentation style: clear, consistent, reader-specific
  technical writing.

## Reader Order

Write docs in this order:

1. State what the symbol or section does.
2. State when to use it.
3. State failure behavior, ownership, allocation, and immutability contracts.
4. Show the smallest useful TypeScript example.
5. Put edge cases after the normal path.

This keeps README-level docs fast to scan while preserving the low-level
contracts that matter for the engine.

## Markdown Documents

- Start each page with a one-sentence contract.
- Use short task-oriented headings.
- Prefer tables for API maps and invariant lists.
- Keep examples compilable and minimal.
- Link to deeper documents instead of repeating full explanations.
- Use `unknown` for untrusted input in examples.
- Mention allocation and freezing only where it changes caller behavior.

## Declaration Comments

Every exported declaration and internal engine declaration should have a block
comment directly above it. Do not add per-field comments that merely repeat the
property name or readonly modifier; field comments are reserved for hidden
ownership, allocation, or invariant details.

Use this shape:

```ts
/**
 * @brief Builds a strict object guard.
 *
 * @details The returned guard rejects unknown own enumerable keys and stores a
 * frozen schema snapshot before the object reaches the validation engine.
 *
 * @param shape Borrowed object shape. The builder validates and freezes the
 * accepted schema representation.
 * @returns Frozen guard whose `Infer` type matches the supplied shape.
 *
 * @invariant The stored object mode is strict.
 * @post No mutable shape collection crosses the public boundary.
 */
function strictObject(shape: ObjectShape): ObjectGuard<InferShape<ObjectShape>>;
```

Rules:

- `@brief` is one sentence.
- `@details` explains the contract, not the TypeScript spelling.
- `@param` names caller ownership and validation expectations.
- `@returns` states the semantic result.
- `@invariant` records state that must remain true after construction.
- `@post` records mutation, freezing, allocation, or visibility effects.
- `@throws` appears only on intentional throwing APIs such as assertion helpers.
- Repeated template suffixes and generated parameter prose are forbidden because
  they hide the actual invariant.

## C Flavor

C-style comments in this project should make hidden costs explicit:

- borrowed input versus copied or frozen storage
- caller-owned values versus TypeSea-owned snapshots
- null-prototype records and dense numeric ids
- allocation behavior on hot and cold paths
- failure return shape
- mutation barriers before public exposure

Avoid comments that merely repeat the signature. A comment should describe the
contract a caller or maintainer can break.

## TypeScript Flavor

TypeScript comments should explain type-level behavior:

- how `Infer` changes through a builder
- when a method narrows a value
- why a decoder does not expose an `is()` predicate
- which wrappers preserve object-key presence
- which runtime contracts cannot be represented in JSON Schema or AOT output

Prefer parseable TSDoc/JSDoc tags where TypeDoc can consume them. Keep Markdown
inside comments simple: fenced `ts` examples are fine; deeply nested lists are
not.

## Review Checklist

- A new public symbol has a README or API-reference entry when it changes user
  behavior.
- A new engine symbol has a Doxygen-style contract comment.
- The normal path appears before edge cases.
- Failure behavior is explicit.
- Examples use `unknown` at boundaries.
- Docs do not promise weaker behavior than tests enforce.
- `npm run check:docs` passes after changing the static documentation site.
