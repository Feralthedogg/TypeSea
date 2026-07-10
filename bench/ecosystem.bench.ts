import { Ajv, type ValidateFunction } from "ajv";
import * as v from "valibot";
import { afterAll, beforeAll, bench, describe } from "vitest";
import { z } from "zod";
import { compile, t, toJsonSchema } from "../src/index.js";
import {
    BENCH_WARMUP_HOOK_TIMEOUT_MS,
    readWarmupSink,
    warmupSync,
    type WarmupTask
} from "./warmup.js";

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

const TypeSeaUnsafeCompiledUser = compile(TypeSeaUser, {
    name: "ecosystemUnsafeUser",
    mode: "unsafe"
});

const TypeSeaUncheckedCompiledUser = compile(TypeSeaUser, {
    name: "ecosystemUncheckedUser",
    mode: "unchecked"
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

const warmupTasks: readonly WarmupTask[] = [
    (): unknown => TypeSeaUser.is(valid),
    (): unknown => TypeSeaCompiledUser.is(valid),
    (): unknown => TypeSeaUnsafeCompiledUser.is(valid),
    (): unknown => TypeSeaUncheckedCompiledUser.is(valid),
    (): unknown => ZodUser.safeParse(valid).success,
    (): unknown => v.safeParse(ValibotUser, valid).success,
    (): unknown => AjvUser(valid),
    (): unknown => TypeSeaUser.check(valid).ok,
    (): unknown => TypeSeaCompiledUser.check(valid).ok,
    (): unknown => TypeSeaUnsafeCompiledUser.check(valid).ok,
    (): unknown => TypeSeaUncheckedCompiledUser.check(valid).ok,
    (): unknown => TypeSeaUser.is(invalid),
    (): unknown => TypeSeaCompiledUser.is(invalid),
    (): unknown => TypeSeaUnsafeCompiledUser.is(invalid),
    (): unknown => TypeSeaUncheckedCompiledUser.is(invalid),
    (): unknown => ZodUser.safeParse(invalid).success,
    (): unknown => v.safeParse(ValibotUser, invalid).success,
    (): unknown => AjvUser(invalid),
    (): unknown => TypeSeaUser.check(invalid).ok,
    (): unknown => TypeSeaCompiledUser.check(invalid).ok,
    (): unknown => TypeSeaUnsafeCompiledUser.check(invalid).ok,
    (): unknown => TypeSeaUncheckedCompiledUser.check(invalid).ok
];

beforeAll((): void => {
    warmupSync(warmupTasks);
    booleanSink = readWarmupSink() === true;
}, BENCH_WARMUP_HOOK_TIMEOUT_MS);

describe("ecosystem comparison valid", () => {
    bench("typesea interpreted", () => {
        booleanSink = TypeSeaUser.is(valid);
    });

    bench("typesea compiled", () => {
        booleanSink = TypeSeaCompiledUser.is(valid);
    });

    bench("typesea unsafe compiled", () => {
        booleanSink = TypeSeaUnsafeCompiledUser.is(valid);
    });

    bench("typesea unchecked compiled", () => {
        booleanSink = TypeSeaUncheckedCompiledUser.is(valid);
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

    bench("typesea unsafe compiled check", () => {
        booleanSink = TypeSeaUnsafeCompiledUser.check(valid).ok;
    });

    bench("typesea unchecked compiled check", () => {
        booleanSink = TypeSeaUncheckedCompiledUser.check(valid).ok;
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

    bench("typesea unsafe compiled", () => {
        booleanSink = TypeSeaUnsafeCompiledUser.is(invalid);
    });

    bench("typesea unchecked compiled", () => {
        booleanSink = TypeSeaUncheckedCompiledUser.is(invalid);
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

    bench("typesea unsafe compiled check", () => {
        booleanSink = TypeSeaUnsafeCompiledUser.check(invalid).ok;
    });

    bench("typesea unchecked compiled check", () => {
        booleanSink = TypeSeaUncheckedCompiledUser.check(invalid).ok;
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
