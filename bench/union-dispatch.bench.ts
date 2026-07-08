import { beforeAll, bench, describe } from "vitest";
import { compile, t } from "../src/index.js";
import { warmupSync, type WarmupTask } from "./warmup.js";

const Operators = t.object({
    eq: t.optional(t.string),
    neq: t.optional(t.string),
    exists: t.optional(t.boolean),
    gt: t.optional(t.number),
    between: t.optional(t.tuple([t.number, t.number]))
});

const Query = t.union(
    t.object({ and: t.array(t.unknown).min(1) }),
    t.object({ or: t.array(t.unknown).min(1) }),
    t.object({ not: t.unknown }),
    t.object({
        elemMatch: t.object({
            path: t.string,
            where: t.unknown
        })
    }),
    t.object({
        path: t.string,
        eq: t.optional(t.string),
        gt: t.optional(t.number)
    }),
    t.record(Operators)
);

const FastQuery = compile(Query, { name: "benchPresenceQuery" });
const UnsafeQuery = compile(Query, {
    name: "benchUnsafePresenceQuery",
    mode: "unsafe"
});

const logicalQuery = {
    and: [
        { path: "user.age", gt: 20 },
        { path: "user.name", eq: "Ada" }
    ]
};

const fieldQuery = {
    "user.age": { gt: 20 },
    "user.name": { eq: "Ada" }
};

const invalidQuery = {
    and: []
};

const warmupTasks: readonly WarmupTask[] = [
    (): unknown => Query.is(logicalQuery),
    (): unknown => FastQuery.is(logicalQuery),
    (): unknown => UnsafeQuery.is(logicalQuery),
    (): unknown => Query.is(fieldQuery),
    (): unknown => FastQuery.is(fieldQuery),
    (): unknown => UnsafeQuery.is(fieldQuery),
    (): unknown => Query.is(invalidQuery),
    (): unknown => FastQuery.is(invalidQuery),
    (): unknown => UnsafeQuery.is(invalidQuery)
];

beforeAll((): void => {
    warmupSync(warmupTasks);
});

describe("presence-dispatched object unions", () => {
    bench("interpreted logical branch", () => {
        Query.is(logicalQuery);
    });

    bench("compiled logical branch", () => {
        FastQuery.is(logicalQuery);
    });

    bench("compiled unsafe logical branch", () => {
        UnsafeQuery.is(logicalQuery);
    });

    bench("interpreted fallback record branch", () => {
        Query.is(fieldQuery);
    });

    bench("compiled fallback record branch", () => {
        FastQuery.is(fieldQuery);
    });

    bench("compiled unsafe fallback record branch", () => {
        UnsafeQuery.is(fieldQuery);
    });

    bench("interpreted invalid branch", () => {
        Query.is(invalidQuery);
    });

    bench("compiled invalid branch", () => {
        FastQuery.is(invalidQuery);
    });

    bench("compiled unsafe invalid branch", () => {
        UnsafeQuery.is(invalidQuery);
    });
});
