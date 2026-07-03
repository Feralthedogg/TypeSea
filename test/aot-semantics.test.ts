import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, expectTypeOf, test } from "vitest";
import {
  emitAotModule,
  t,
  type AotModule,
  type CheckResult
} from "../src/index.js";

interface AotRuntimeModule {
  readonly is: (value: unknown) => boolean;
  readonly check: (value: unknown) => CheckResult<unknown>;
  readonly assert: (value: unknown) => void;
  readonly default: {
    readonly is: (value: unknown) => boolean;
    readonly check: (value: unknown) => CheckResult<unknown>;
    readonly assert: (value: unknown) => void;
  };
}

describe("AOT module emission", () => {
  test("emits importable ESM validators matching interpreter semantics", async () => {
    const User = t.strictObject({
      id: t.string.min(1),
      count: t.number.int().gte(0),
      role: t.union(t.literal("admin"), t.literal("user")),
      meta: t.optional(t.object({
        nan: t.literal(Number.NaN),
        negativeZero: t.literal(-0),
        marker: t.literal(1n)
      }))
    });
    const emitted = emitAotModule(User, { name: "aotUser" });
    expect(emitted.ok).toBe(true);
    if (!emitted.ok) {
      return;
    }

    const runtime = await importAotModule(emitted.value);
    const values: readonly unknown[] = [
      {
        id: "u",
        count: 1,
        role: "admin"
      },
      {
        id: "u",
        count: 1,
        role: "user",
        meta: {
          nan: Number.NaN,
          negativeZero: -0,
          marker: 1n
        }
      },
      {
        id: "",
        count: 1,
        role: "admin"
      },
      {
        id: "u",
        count: 1.5,
        role: "admin"
      },
      {
        id: "u",
        count: 1,
        role: "guest"
      },
      {
        id: "u",
        count: 1,
        role: "admin",
        extra: true
      }
    ];

    expect(emitted.value.source).not.toContain("new Function");
    expect(emitted.value.declarationSource).toContain("AotCheckResult");
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      expect(runtime.is(value), `is ${String(index)}`).toBe(User.is(value));
      expect(runtime.default.is(value), `default is ${String(index)}`)
        .toBe(User.is(value));
      expect(runtime.check(value), `check ${String(index)}`).toEqual(User.check(value));
    }

    const invalid = runtime.check(values[2]);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(Object.isFrozen(invalid.error)).toBe(true);
      expect(Object.isFrozen(invalid.error[0]?.path)).toBe(true);
    }
    expect(() => {
      runtime.assert(values[2]);
    }).toThrow(Error);
  });

  test("rejects non-serializable AOT schemas", () => {
    const Refined = emitAotModule(t.string.refine(
      (value) => value.length > 0,
      "non_empty"
    ));
    const Lazy = emitAotModule(t.lazy(() => t.string));
    const SymbolLiteral = emitAotModule(t.literal(Symbol("marker")));

    expect(Refined.ok).toBe(false);
    if (!Refined.ok) {
      expect(Refined.error[0]?.code).toBe("unsupported_aot_refine");
      expect(Object.isFrozen(Refined.error)).toBe(true);
    }
    expect(Lazy.ok).toBe(false);
    if (!Lazy.ok) {
      expect(Lazy.error[0]?.code).toBe("unsupported_aot_lazy");
    }
    expect(SymbolLiteral.ok).toBe(false);
    if (!SymbolLiteral.ok) {
      expect(SymbolLiteral.error[0]?.code).toBe("unsupported_aot_symbol_literal");
    }
  });

  test("rejects strict object extras when required keys are non-enumerable", async () => {
    const Shape = t.strictObject({
      id: t.string,
      name: t.string
    });
    const emitted = emitAotModule(Shape, { name: "aotStrictDescriptorShape" });
    expect(emitted.ok).toBe(true);
    if (!emitted.ok) {
      return;
    }

    const runtime = await importAotModule(emitted.value);
    const value: Record<string, unknown> = {
      extra: true
    };
    Object.defineProperty(value, "id", {
      configurable: true,
      enumerable: false,
      value: "u-1"
    });
    Object.defineProperty(value, "name", {
      configurable: true,
      enumerable: false,
      value: "Ada"
    });

    expect(Shape.is(value)).toBe(false);
    expect(runtime.is(value)).toBe(false);
    expect(runtime.check(value)).toEqual(Shape.check(value));
  });

  test("preserves AOT module result types", () => {
    const emitted = emitAotModule(t.string);
    expectTypeOf<typeof emitted>().toEqualTypeOf<
      CheckResult<AotModule> extends never
        ? never
        : ReturnType<typeof emitAotModule>
    >();
    expect(emitted.ok).toBe(true);
  });
});

async function importAotModule(module: AotModule): Promise<AotRuntimeModule> {
  const root = await mkdtemp(join(tmpdir(), "typesea-aot-"));
  const file = join(root, "validator.mjs");
  await writeFile(file, module.source, "utf8");
  const imported = await import(pathToFileURL(file).href) as AotRuntimeModule;
  await rm(root, {
    recursive: true
  });
  return imported;
}
