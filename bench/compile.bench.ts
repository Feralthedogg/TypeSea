import { beforeAll, bench, describe } from "vitest";
import { compile, t } from "../src/index.js";
import { warmupSync, type WarmupTask } from "./warmup.js";

const User = t.strictObject({
    id: t.string.uuid(),
    name: t.string.min(1).max(80),
    age: t.number.int().gte(0).lte(150),
    tags: t.array(t.string.min(1)),
    meta: t.record(t.union(t.string, t.number.int(), t.boolean))
});

const FastUser = compile(User, { name: "benchUser" });
const UnsafeFastUser = compile(User, {
    name: "benchUnsafeUser",
    mode: "unsafe"
});
const UncheckedFastUser = compile(User, {
    name: "benchUncheckedUser",
    mode: "unchecked"
});

const valid = {
    id: "550e8400-e29b-41d4-a716-446655440000",
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
    id: "not-a-uuid",
    name: "",
    age: -1,
    tags: ["compiler", 1],
    meta: {
        score: 0.5
    },
    extra: true
};

const warmupTasks: readonly WarmupTask[] = [
    (): unknown => User.is(valid),
    (): unknown => FastUser.is(valid),
    (): unknown => UnsafeFastUser.is(valid),
    (): unknown => UncheckedFastUser.is(valid),
    (): unknown => User.is(invalid),
    (): unknown => FastUser.is(invalid),
    (): unknown => UnsafeFastUser.is(invalid),
    (): unknown => UncheckedFastUser.is(invalid),
    (): unknown => User.check(valid),
    (): unknown => FastUser.check(valid),
    (): unknown => UnsafeFastUser.check(valid),
    (): unknown => UncheckedFastUser.check(valid),
    (): unknown => User.check(invalid),
    (): unknown => FastUser.check(invalid),
    (): unknown => UnsafeFastUser.check(invalid),
    (): unknown => UncheckedFastUser.check(invalid)
];

beforeAll((): void => {
    warmupSync(warmupTasks);
});

describe("is() runtime", () => {
    bench("interpreted valid", () => {
        User.is(valid);
    });

    bench("compiled valid", () => {
        FastUser.is(valid);
    });

    bench("compiled unsafe valid", () => {
        UnsafeFastUser.is(valid);
    });

    bench("compiled unchecked valid", () => {
        UncheckedFastUser.is(valid);
    });

    bench("interpreted invalid", () => {
        User.is(invalid);
    });

    bench("compiled invalid", () => {
        FastUser.is(invalid);
    });

    bench("compiled unsafe invalid", () => {
        UnsafeFastUser.is(invalid);
    });

    bench("compiled unchecked invalid", () => {
        UncheckedFastUser.is(invalid);
    });
});

describe("check() runtime", () => {
    bench("interpreted check valid", () => {
        User.check(valid);
    });

    bench("compiled check valid", () => {
        FastUser.check(valid);
    });

    bench("compiled unsafe check valid", () => {
        UnsafeFastUser.check(valid);
    });

    bench("compiled unchecked check valid", () => {
        UncheckedFastUser.check(valid);
    });

    bench("interpreted check invalid", () => {
        User.check(invalid);
    });

    bench("compiled check invalid", () => {
        FastUser.check(invalid);
    });

    bench("compiled unsafe check invalid", () => {
        UnsafeFastUser.check(invalid);
    });

    bench("compiled unchecked check invalid", () => {
        UncheckedFastUser.check(invalid);
    });
});
