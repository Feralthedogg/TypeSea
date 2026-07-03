import { bench, describe } from "vitest";
import { compile, t } from "../src/index.js";

const User = t.strictObject({
  id: t.string.uuid(),
  name: t.string.min(1).max(80),
  age: t.number.int().gte(0).lte(150),
  tags: t.array(t.string.min(1)),
  meta: t.record(t.union(t.string, t.number.int(), t.boolean))
});

const FastUser = compile(User, { name: "benchUser" });

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

describe("is() runtime", () => {
  bench("interpreted valid", () => {
    User.is(valid);
  });

  bench("compiled valid", () => {
    FastUser.is(valid);
  });

  bench("interpreted invalid", () => {
    User.is(invalid);
  });

  bench("compiled invalid", () => {
    FastUser.is(invalid);
  });
});

describe("check() runtime", () => {
  bench("interpreted check valid", () => {
    User.check(valid);
  });

  bench("compiled check valid", () => {
    FastUser.check(valid);
  });

  bench("interpreted check invalid", () => {
    User.check(invalid);
  });

  bench("compiled check invalid", () => {
    FastUser.check(invalid);
  });
});
