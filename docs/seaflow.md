# SeaFlow Fuzzer

SeaFlow is TypeSea's schema-directed symbolic fuzzer. It reads the immutable
schema tree backward and emits bounded payloads for boundary testing, invalid
shape testing, and hostile-input smoke tests. It is published as
`typesea/seaflow`, so production validator bundles do not include it unless the
subpath is imported.

SeaFlow is deterministic. It is not a random load generator, and `maxYields` is
an upper bound rather than a target. Small schemas can naturally emit fewer
cases when their finite edge set is exhausted.

## Basic Usage

```ts
import { fuzzCases } from "typesea/seaflow";
import { t } from "typesea";

const User = t.strictObject({
  id: t.string.uuid(),
  email: t.string.email(),
  age: t.number.int().gte(0).lte(150)
});

for (const item of fuzzCases(User, { intensity: "high", maxYields: 64 })) {
  console.log(item.kind, item.valid, item.reason, item.value);
}
```

`fuzzCases(schema, options)` yields structured cases:

```ts
interface SeaFlowCase {
  readonly value: unknown;
  readonly valid: boolean;
  readonly kind: "valid" | "invalid" | "security";
  readonly reason: string;
  readonly path: readonly PathSegment[];
}
```

Use `fuzz(schema, options)` when a harness only needs values.

## Unit Test Pattern

A useful first test is semantic parity: every generated case should match the
guard verdict that SeaFlow predicted from the schema.

```ts
import { describe, expect, test } from "vitest";
import { fuzzCases } from "typesea/seaflow";
import { t } from "typesea";

const User = t.strictObject({
  id: t.string.uuid(),
  email: t.string.email(),
  age: t.number.int().gte(0)
});

describe("user boundary", () => {
  test("schema and generated edge cases agree", () => {
    for (const item of fuzzCases(User, { includeSecurity: true })) {
      expect(User.is(item.value), item.reason).toBe(item.valid);
    }
  });
});
```

For business logic, validate at the boundary first, then pass only accepted
values into the service under test:

```ts
test("accepted payloads do not crash the service", () => {
  for (const item of fuzzCases(User, { includeSecurity: true, maxYields: 128 })) {
    const parsed = User.safeParse(item.value);
    expect(parsed.success, item.reason).toBe(item.valid);

    if (parsed.success) {
      expect(() => createUser(parsed.data)).not.toThrow();
    }
  }
});
```

## Generated Case Families

| Family | Examples |
| --- | --- |
| Valid samples | Minimal valid objects, enum members, tuple values, record/map/set values |
| Numeric boundaries | Minimum, maximum, just outside the boundary, integer/float confusion, `NaN`, infinities |
| String boundaries | Minimum/maximum length, empty string, known format failures, SQLi/XSS probe strings |
| Object structure | Required-key deletion, optional-key variants, strict-object extra keys, object-union hybrids |
| Hostile input | `__proto__`, `constructor`, accessor properties, sparse arrays, symbol and non-enumerable extras |
| Recursive schemas | Lazy schemas stop at `maxDepth` so recursive graphs remain finite |

Safe strict objects reject undeclared own string, symbol, and non-enumerable
keys without walking prototypes. The safe runtime and compiled paths use
`Reflect.ownKeys` or equivalent own-name plus own-symbol fast paths, so
undeclared `__proto__` and `constructor` data keys are treated as ordinary
extra keys instead of prototype state.

## Options

```ts
interface SeaFlowOptions {
  readonly intensity?: "low" | "high" | "extreme";
  readonly maxDepth?: number;
  readonly maxYields?: number;
  readonly includeInvalid?: boolean;
  readonly includeSecurity?: boolean;
}
```

Use `intensity: "low"` for narrow CI smoke tests, `high` for normal boundary
testing, and `extreme` when you want rare numeric and structural probes. Set
`includeSecurity: false` for pure semantic tests that should avoid injection
strings and hostile object shapes.

