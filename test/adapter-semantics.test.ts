import { describe, expect, expectTypeOf, test } from "vitest";
import {
  t,
  toAsyncTrpcParser,
  toFastifyRouteSchema,
  toFastifyValidatorCompiler,
  toReactHookFormResolver,
  toTrpcParser,
  TypeSeaAssertionError,
  type InferSyncAdapter,
  type ReactHookFormErrors,
  type ReactHookFormFieldError
} from "../src/index.js";

describe("ecosystem adapters", () => {
  test("adapts sync and async tRPC-style parsers", async () => {
    const User = t.object({
      id: t.string.min(1),
      count: t.number.int()
    });
    const SyncParser = toTrpcParser(User);
    const AsyncParser = toAsyncTrpcParser(t.asyncTransform(
      User,
      async (value) => await Promise.resolve(value.id)
    ));

    expectTypeOf<InferSyncAdapter<typeof User>>().toEqualTypeOf<{
      readonly id: string;
      readonly count: number;
    }>();
    expectTypeOf<ReturnType<typeof SyncParser.parse>>().toEqualTypeOf<{
      readonly id: string;
      readonly count: number;
    }>();
    expectTypeOf<Awaited<ReturnType<typeof AsyncParser.parseAsync>>>()
      .toEqualTypeOf<string>();

    expect(SyncParser.parse({
      id: "u",
      count: 1
    })).toEqual({
      id: "u",
      count: 1
    });
    await expect(AsyncParser.parseAsync({
      id: "u",
      count: 1
    })).resolves.toBe("u");
    expect(() => SyncParser.parse({
      id: "",
      count: 1
    })).toThrow(TypeSeaAssertionError);
    await expect(AsyncParser.parseAsync({
      id: "",
      count: 1
    })).rejects.toBeInstanceOf(TypeSeaAssertionError);
  });

  test("adapts Fastify route schemas and validator compilers", () => {
    const Body = t.strictObject({
      id: t.string,
      count: t.number.int()
    });
    const schema = toFastifyRouteSchema(Body, {
      part: "body"
    });
    const querySchema = toFastifyRouteSchema(t.object({
      q: t.string
    }), {
      part: "querystring"
    });
    const validator = toFastifyValidatorCompiler(Body)({
      schema: {},
      method: "POST",
      url: "/users",
      httpPart: "body"
    });

    expect(schema.ok).toBe(true);
    if (schema.ok) {
      expect(schema.value.body).toEqual({
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {
          id: {
            type: "string"
          },
          count: {
            type: "integer"
          }
        },
        required: ["id", "count"],
        additionalProperties: false
      });
      expect(Object.isFrozen(schema.value)).toBe(true);
    }
    expect(querySchema.ok).toBe(true);
    if (querySchema.ok) {
      expect(querySchema.value.querystring).not.toBeUndefined();
    }
    expect(validator({
      id: "u",
      count: 1
    })).toEqual({
      value: {
        id: "u",
        count: 1
      }
    });
    const invalid = validator({
      id: "u",
      count: 1.5
    });
    expect("error" in invalid).toBe(true);
    if ("error" in invalid) {
      expect(invalid.error).toBeInstanceOf(TypeSeaAssertionError);
      expect(invalid.error.issues[0]?.code).toBe("expected_integer");
    }
  });

  test("selects Fastify validator compiler sources by route httpPart", () => {
    const Body = t.strictObject({
      id: t.string
    });
    const Query = t.strictObject({
      q: t.string
    });
    const compiler = toFastifyValidatorCompiler({
      body: Body,
      querystring: Query
    });
    const bodyValidator = compiler({
      schema: {},
      method: "POST",
      url: "/users",
      httpPart: "body"
    });
    const queryValidator = compiler({
      schema: {},
      method: "GET",
      url: "/users",
      httpPart: "querystring"
    });

    expect(bodyValidator({ id: "u" })).toEqual({
      value: {
        id: "u"
      }
    });
    expect(queryValidator({ q: "ada" })).toEqual({
      value: {
        q: "ada"
      }
    });
    expect("error" in bodyValidator({ q: "ada" })).toBe(true);
    expect("error" in queryValidator({ id: "u" })).toBe(true);
    expect(() => compiler({
      schema: {},
      method: "GET",
      url: "/users",
      httpPart: "headers"
    })).toThrow(TypeError);
  });

  test("adapts React Hook Form resolver results", async () => {
    const Form = t.object({
      user: t.object({
        name: t.string.min(2)
      }),
      tags: t.array(t.string.min(1))
    });
    const resolver = toReactHookFormResolver(Form, {
      messages: {
        locale: "ko"
      }
    });

    const valid = await resolver({
      user: {
        name: "Ada"
      },
      tags: ["ts"]
    }, undefined, undefined);
    const invalid = await resolver({
      user: {
        name: ""
      },
      tags: [""]
    }, undefined, undefined);

    expect(valid.errors).toEqual({});
    expect(valid.values).toEqual({
      user: {
        name: "Ada"
      },
      tags: ["ts"]
    });
    expect(invalid.values).toEqual({});
    expect(readFieldError(invalid.errors, ["user", "name"])?.type)
      .toBe("expected_min_length");
    expect(readFieldError(invalid.errors, ["tags", "0"])?.type)
      .toBe("expected_min_length");
    expect(readFieldError(invalid.errors, ["user", "name"])?.message)
      .toContain("$[\"user\"][\"name\"]");
    expect(Object.isFrozen(invalid.errors)).toBe(true);
    expect(Object.isFrozen(invalid.errors["user"])).toBe(true);
  });

  test("keeps React Hook Form errors for inherited property field names", async () => {
    const Form = t.object({
      constructor: t.string.min(2)
    });
    const resolver = toReactHookFormResolver(Form);
    const invalid = await resolver({
      constructor: ""
    }, undefined, undefined);
    const constructorKey = "constructor";

    expect(invalid.values).toEqual({});
    expect(Object.prototype.hasOwnProperty.call(invalid.errors, constructorKey))
      .toBe(true);
    expect(readFieldError(invalid.errors, [constructorKey])?.type)
      .toBe("expected_min_length");
  });

  test("rejects malformed adapter inputs", () => {
    const looseTrpc = toTrpcParser as unknown as (source: unknown) => unknown;
    const looseFastifySchema = toFastifyRouteSchema as unknown as (
      guard: unknown,
      options: unknown
    ) => unknown;

    expect(() => looseTrpc({})).toThrow(TypeError);
    expect(() => looseFastifySchema(t.string, {
      part: "cookies"
    })).toThrow(TypeError);
  });
});

function readFieldError(
  errors: ReactHookFormErrors,
  path: readonly string[]
): ReactHookFormFieldError | undefined {
  let current: ReactHookFormErrors | ReactHookFormFieldError | undefined = errors;
  for (let index = 0; index < path.length; index += 1) {
    if (!isReactHookFormErrors(current)) {
      return undefined;
    }
    const key = path[index];
    if (key === undefined) {
      return undefined;
    }
    current = current[key];
  }
  return isReactHookFormFieldError(current) ? current : undefined;
}

function isReactHookFormErrors(value: unknown): value is ReactHookFormErrors {
  return typeof value === "object" && value !== null && !isReactHookFormFieldError(value);
}

function isReactHookFormFieldError(value: unknown): value is ReactHookFormFieldError {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Readonly<Record<string, unknown>>;
  return typeof record["type"] === "string" && typeof record["message"] === "string";
}
