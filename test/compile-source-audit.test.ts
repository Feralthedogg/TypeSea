import { describe, expect, test } from "vitest";
import { compile, t } from "../src/index.js";

describe("compiled source audit", () => {
  test("keeps runtime values in side tables instead of generated code text", () => {
    const escapedKey = "slot\"];globalThis.__TYPESEA_SOURCE_ESCAPE=1;//";
    const literalPayload = "typesea_literal_escape_payload";
    const regex = /^typesea_regex_escape_payload+$/u;
    const Guard = t.strictObject({
      [escapedKey]: t.literal(literalPayload),
      text: t.string.regex(regex, "source_audit_pattern"),
      dynamic: t.number.refine((value) => value > 0, "positive_payload")
    });
    const FastGuard = compile(Guard, { name: "sourceAudit" });
    const globalRecord = globalThis as typeof globalThis & Record<
      "__TYPESEA_SOURCE_ESCAPE",
      unknown
    >;

    delete globalRecord.__TYPESEA_SOURCE_ESCAPE;

    expect(FastGuard.source).toContain("\"use strict\";");
    expect(FastGuard.source).toContain("l[");
    expect(FastGuard.source).toContain("r[");
    expect(FastGuard.source).toContain("k[");
    expect(FastGuard.source).toContain("u[");
    expect(FastGuard.source).toContain("d(");
    expect(FastGuard.source).toContain("m(");
    expect(FastGuard.source).not.toContain("__TYPESEA_SOURCE_ESCAPE");
    expect(FastGuard.source).not.toContain(literalPayload);
    expect(FastGuard.source).not.toContain(regex.source);
    expect(FastGuard.source).not.toContain("source_audit_pattern");
    expect(FastGuard.source).not.toContain("positive_payload");
    expect(FastGuard.source).not.toContain("new RegExp");

    expect(
      FastGuard.is({
        [escapedKey]: literalPayload,
        text: "typesea_regex_escape_payload",
        dynamic: 1
      })
    ).toBe(true);
    expect(FastGuard.check({ [escapedKey]: "wrong", text: "no", dynamic: 0 }))
      .toEqual(Guard.check({ [escapedKey]: "wrong", text: "no", dynamic: 0 }));
    expect(globalRecord.__TYPESEA_SOURCE_ESCAPE).toBeUndefined();
  });

  test("sanitizes generated public function names", () => {
    const globalRecord = globalThis as typeof globalThis & Record<
      "__TYPESEA_NAME_ESCAPE",
      unknown
    >;
    const FastString = compile(t.string, {
      name: "9 bad-name;globalThis.__TYPESEA_NAME_ESCAPE=1"
    });

    delete globalRecord.__TYPESEA_NAME_ESCAPE;

    expect(FastString.source).toContain("function _9_bad_name_globalThis___TYPESEA_NAME_ESCAPE_1");
    expect(FastString.source).not.toContain("bad-name;globalThis");
    expect(FastString.is("ok")).toBe(true);
    expect(FastString.check(1)).toEqual(t.string.check(1));
    expect(globalRecord.__TYPESEA_NAME_ESCAPE).toBeUndefined();
  });

  test("bounds generated public function name length", () => {
    const tail = "TYPESEA_NAME_TAIL_SHOULD_NOT_APPEAR";
    const longName = `${"a".repeat(160)}${tail}`;
    const FastString = compile(t.string, { name: longName });
    const match = /return \{is:function ([^(]+)\(/u.exec(FastString.source);

    expect(match).not.toBeNull();
    if (match !== null) {
      expect(match[1]?.length).toBeLessThanOrEqual(96);
    }
    expect(FastString.source).not.toContain(tail);
    expect(FastString.is("ok")).toBe(true);
    expect(FastString.check(1)).toEqual(t.string.check(1));
  });

  test("prefixes strict-mode reserved public function names", () => {
    const names = ["class", "default", "eval", "arguments"] as const;

    for (let index = 0; index < names.length; index += 1) {
      const name = names[index];
      if (name === undefined) {
        continue;
      }
      const FastString = compile(t.string, { name });
      expect(FastString.source).toContain(`function _${name}`);
      expect(FastString.is("ok")).toBe(true);
      expect(FastString.check(1)).toEqual(t.string.check(1));
    }
  });
});
