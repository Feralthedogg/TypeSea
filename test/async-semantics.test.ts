import { describe, expect, test } from "vitest";
import {
  BaseAsyncDecoder,
  t,
  toJsonSchema,
  type AsyncDecoder
} from "../src/index.js";

describe("async decoder semantics", () => {
  test("runs async refinement through explicit Result containers", async () => {
    const KnownUser = t.asyncRefine(
      t.string.min(1),
      async (value) => await Promise.resolve(value === "ada"),
      "known_user"
    );
    const valid = await KnownUser.decodeAsync("ada");
    const unknownUser = await KnownUser.decodeAsync("root");
    const invalidInput = await KnownUser.decodeAsync("");

    expect(valid).toEqual({
      ok: true,
      value: "ada"
    });
    expect(Object.isFrozen(valid)).toBe(true);
    expect(unknownUser.ok).toBe(false);
    if (!unknownUser.ok) {
      expect(unknownUser.error[0]?.code).toBe("expected_refinement");
      expect(unknownUser.error[0]?.expected).toBe("known_user");
      expect(Object.isFrozen(unknownUser.error)).toBe(true);
    }
    expect(invalidInput.ok).toBe(false);
    if (!invalidInput.ok) {
      expect(invalidInput.error[0]?.code).toBe("expected_min_length");
    }
  });

  test("pipes sync and async decoders without losing diagnostics", async () => {
    const Count = t.asyncPipe(
      t.coerce.number(),
      t.asyncRefine(
        t.number.int(),
        async (value) => await Promise.resolve(value % 2 === 0),
        "even"
      )
    );
    const Label = t.asyncTransform(
      Count,
      async (value) => await Promise.resolve(`count:${String(value)}`)
    );
    const valid = await Label.decodeAsync("42");
    const odd = await Label.decodeAsync("3");
    const fractional = await Label.decodeAsync("1.5");

    expect(valid).toEqual({
      ok: true,
      value: "count:42"
    });
    expect(odd.ok).toBe(false);
    if (!odd.ok) {
      expect(odd.error[0]?.code).toBe("expected_refinement");
      expect(odd.error[0]?.expected).toBe("even");
    }
    expect(fractional.ok).toBe(false);
    if (!fractional.ok) {
      expect(fractional.error[0]?.code).toBe("expected_integer");
    }
  });

  test("rejects malformed async decoder construction and receivers", () => {
    const Count = t.asyncDecoder(t.number);
    const looseAsyncDecoder = t.asyncDecoder as unknown as (
      source: unknown
    ) => AsyncDecoder<unknown>;
    const looseAsyncRefine = t.asyncRefine as unknown as (
      source: unknown,
      predicate: unknown,
      name: unknown
    ) => AsyncDecoder<unknown>;

    expect(() => new BaseAsyncDecoder("not_fn" as unknown as (
      value: unknown
    ) => Promise<never>)).toThrow(TypeError);
    expect(() => looseAsyncDecoder({})).toThrow(TypeError);
    expect(() => looseAsyncRefine(t.string, "not_fn", "name")).toThrow(TypeError);
    expect(() => looseAsyncRefine(
      t.string,
      async () => await Promise.resolve(true),
      1
    )).toThrow(TypeError);
    expect(() => Count.decodeAsync.call({}, 1)).toThrow(TypeError);
    expect(() => Count.refineAsync.call(
      {},
      async () => await Promise.resolve(true),
      "same"
    ))
      .toThrow(TypeError);
    expect(() => Count.transformAsync.call(
      {},
      async (value: number) => await Promise.resolve(value)
    ))
      .toThrow(TypeError);
    expect(() => Count.pipeAsync.call({}, t.number)).toThrow(TypeError);
  });

  test("rejects async decoder JSON Schema export without semantic loss", () => {
    const exported = toJsonSchema(t.asyncRefine(
      t.string,
      async (value) => await Promise.resolve(value.length > 0),
      "non_empty"
    ));

    expect(exported.ok).toBe(false);
    if (!exported.ok) {
      expect(exported.error[0]?.code).toBe("unsupported_async_decoder");
      expect(Object.isFrozen(exported.error)).toBe(true);
      expect(Object.isFrozen(exported.error[0]?.path)).toBe(true);
    }
  });
});
