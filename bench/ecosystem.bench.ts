import { Ajv, type ValidateFunction } from "ajv";
import * as v from "valibot";
import { afterAll, bench, describe } from "vitest";
import { z } from "zod";
import { compile, t, toJsonSchema } from "../src/index.js";

const TypeSeaUser = t.strictObject({
  id: t.string.min(1).max(48),
  name: t.string.min(1).max(80),
  age: t.number.int().gte(0).lte(150),
  tags: t.array(t.string.min(1)),
  meta: t.record(t.union(t.string, t.number.int(), t.boolean))
});

const TypeSeaCompiledUser = compile(TypeSeaUser, {
  name: "ecosystemUser"
});

const ZodUser = z.strictObject({
  id: z.string().min(1).max(48),
  name: z.string().min(1).max(80),
  age: z.number().int().gte(0).lte(150),
  tags: z.array(z.string().min(1)),
  meta: z.record(
    z.string(),
    z.union([z.string(), z.number().int(), z.boolean()])
  )
});

const ValibotUser = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(48)),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
  age: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(150)
  ),
  tags: v.array(v.pipe(v.string(), v.minLength(1))),
  meta: v.record(
    v.string(),
    v.union([v.string(), v.pipe(v.number(), v.integer()), v.boolean()])
  )
});

const schemaResult = toJsonSchema(TypeSeaUser);

if (!schemaResult.ok) {
  throw new Error("ecosystem benchmark schema must export to JSON Schema");
}

const AjvUser: ValidateFunction = new Ajv({
  allErrors: false,
  validateFormats: false
}).compile(schemaResult.value);

let booleanSink = false;

afterAll(() => {
  if (booleanSink) {
    process.env["TYPESEA_BENCH_SINK"] = "1";
  }
});

const valid = {
  id: "user-550e8400",
  name: "Ada",
  age: 37,
  tags: ["compiler", "math"],
  meta: {
    score: 100,
    active: true,
    team: "runtime"
  }
};

const invalid = {
  id: "",
  name: "",
  age: -1,
  tags: ["compiler", 1],
  meta: {
    score: 0.5
  },
  extra: true
};

describe("ecosystem comparison valid", () => {
  bench("typesea interpreted", () => {
    booleanSink = TypeSeaUser.is(valid);
  });

  bench("typesea compiled", () => {
    booleanSink = TypeSeaCompiledUser.is(valid);
  });

  bench("zod safeParse", () => {
    booleanSink = ZodUser.safeParse(valid).success;
  });

  bench("valibot safeParse", () => {
    booleanSink = v.safeParse(ValibotUser, valid).success;
  });

  bench("ajv compiled", () => {
    booleanSink = AjvUser(valid);
  });
});

describe("ecosystem comparison valid diagnostics", () => {
  bench("typesea interpreted check", () => {
    booleanSink = TypeSeaUser.check(valid).ok;
  });

  bench("typesea compiled check", () => {
    booleanSink = TypeSeaCompiledUser.check(valid).ok;
  });

  bench("zod safeParse", () => {
    booleanSink = ZodUser.safeParse(valid).success;
  });

  bench("valibot safeParse", () => {
    booleanSink = v.safeParse(ValibotUser, valid).success;
  });

  bench("ajv compiled", () => {
    booleanSink = AjvUser(valid);
  });
});

describe("ecosystem comparison invalid", () => {
  bench("typesea interpreted", () => {
    booleanSink = TypeSeaUser.is(invalid);
  });

  bench("typesea compiled", () => {
    booleanSink = TypeSeaCompiledUser.is(invalid);
  });

  bench("zod safeParse", () => {
    booleanSink = ZodUser.safeParse(invalid).success;
  });

  bench("valibot safeParse", () => {
    booleanSink = v.safeParse(ValibotUser, invalid).success;
  });

  bench("ajv compiled", () => {
    booleanSink = AjvUser(invalid);
  });
});

describe("ecosystem comparison invalid diagnostics", () => {
  bench("typesea interpreted check", () => {
    booleanSink = TypeSeaUser.check(invalid).ok;
  });

  bench("typesea compiled check", () => {
    booleanSink = TypeSeaCompiledUser.check(invalid).ok;
  });

  bench("zod safeParse", () => {
    booleanSink = ZodUser.safeParse(invalid).success;
  });

  bench("valibot safeParse", () => {
    booleanSink = v.safeParse(ValibotUser, invalid).success;
  });

  bench("ajv compiled", () => {
    booleanSink = AjvUser(invalid);
  });
});
