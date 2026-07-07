import { describe, expect, test } from "vitest";
import {
    analyzeSchema,
    compile,
    globalRegistry,
    registry,
    t,
    toJsonSchema
} from "../src/index.js";

describe("metadata, keyed-object rules, and schema analysis", () => {
    test("stores schema metadata in registries without changing validation", () => {
        const local = registry<{ readonly title: string; readonly order: number }>();
        const UserId = t.string.uuid();
        const returned = UserId.register(local, {
            title: "User id",
            order: 1
        });

        expect(returned).toBe(UserId);
        expect(local.has(UserId)).toBe(true);
        expect(local.get(UserId)).toEqual({
            title: "User id",
            order: 1
        });
        expect(UserId.is("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
        expect(UserId.is("not-a-uuid")).toBe(false);

        globalRegistry.add(UserId, {
            id: "user_id",
            title: "User id",
            description: "Stable user identifier"
        });
        expect(globalRegistry.get(UserId)?.id).toBe("user_id");
        expect(local.remove(UserId)).toBe(true);
        expect(local.has(UserId)).toBe(false);
    });

    test("applies schema-local messages in interpreted and compiled diagnostics", () => {
        const Name = t.string.min(3).message("name must contain at least three characters");
        const FastName = compile(Name, { name: "messagedName" });

        const interpreted = Name.check("Al");
        const compiled = FastName.check("Al");
        const first = FastName.checkFirst("Al");

        expect(interpreted.ok).toBe(false);
        expect(compiled).toEqual(interpreted);
        expect(first.ok).toBe(false);
        if (!interpreted.ok && !first.ok) {
            expect(interpreted.error[0]?.message)
                .toBe("name must contain at least three characters");
            expect(first.error[0]).toEqual(interpreted.error[0]);
        }
    });

    test("validates keyed-object cardinality across interpreted and compiled paths", () => {
        const Contact = t.object({
            email: t.optional(t.string.email()),
            phone: t.optional(t.string.min(1))
        }).oneOfKeys(["email", "phone"]);
        const AtLeast = t.atLeastOneKey(
            t.object({
                email: t.optional(t.string.email()),
                phone: t.optional(t.string.min(1))
            }),
            ["email", "phone"]
        );
        const FastContact = compile(Contact, { name: "contactOneOfKeys" });

        expect(Contact.is({ email: "ada@example.com" })).toBe(true);
        expect(Contact.is({ phone: "555-0100" })).toBe(true);
        expect(Contact.is({ email: "ada@example.com", phone: "555-0100" })).toBe(false);
        expect(Contact.is({})).toBe(false);
        expect(AtLeast.is({ phone: "555-0100" })).toBe(true);
        expect(AtLeast.is({})).toBe(false);

        const accessorValue = {};
        Object.defineProperty(accessorValue, "email", {
            enumerable: true,
            get(): string {
                return "ada@example.com";
            }
        });

        const invalidValues: readonly unknown[] = [
            {},
            { email: "ada@example.com", phone: "555-0100" },
            accessorValue
        ];
        for (let index = 0; index < invalidValues.length; index += 1) {
            const value = invalidValues[index];
            expect(FastContact.is(value), String(index)).toBe(Contact.is(value));
            expect(FastContact.check(value), String(index)).toEqual(Contact.check(value));
        }

        const none = Contact.check({});
        expect(none.ok).toBe(false);
        if (!none.ok) {
            expect(none.error[0]?.code).toBe("expected_key_count");
        }
    });

    test("exports metadata and keyed-object rules to JSON Schema", () => {
        const Contact = t.object({
            email: t.optional(t.string.email()),
            phone: t.optional(t.string.min(1))
        })
            .oneOfKeys(["email", "phone"])
            .meta({ id: "Contact" })
            .title("Contact")
            .describe("A reachable contact endpoint")
            .example({ email: "ada@example.com" });

        const exported = toJsonSchema(Contact);

        expect(exported.ok).toBe(true);
        if (!exported.ok) {
            return;
        }
        expect(exported.value).toEqual({
            $schema: "http://json-schema.org/draft-07/schema#",
            $id: "Contact",
            allOf: [
                {
                    type: "object",
                    properties: {
                        email: {
                            type: "string",
                            format: "email",
                            pattern: "^(?!\\.)(?!.*\\.\\.)[A-Z0-9!#$%&'*+/=?^_`{|}~.-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$"
                        },
                        phone: {
                            type: "string",
                            minLength: 1
                        }
                    },
                    additionalProperties: true
                },
                {
                    oneOf: [
                        { required: ["email"] },
                        { required: ["phone"] }
                    ]
                }
            ],
            title: "Contact",
            description: "A reachable contact endpoint",
            examples: [{ email: "ada@example.com" }]
        });
    });

    test("reports wide object unions and keyed-object usage", () => {
        const Wide = t.union(
            t.object({ eq: t.string }),
            t.object({ neq: t.string }),
            t.object({ gt: t.number }),
            t.object({ lt: t.number })
        );
        const Contact = t.object({
            email: t.optional(t.string),
            phone: t.optional(t.string)
        }).oneOfKeys(["email", "phone"]);

        const wideReport = analyzeSchema(Wide);
        const contactReport = analyzeSchema(Contact);

        expect(wideReport.warnings).toBe(1);
        expect(wideReport.issues.map((issue) => issue.code)).toContain("union_branch_scan");
        expect(wideReport.issues.map((issue) => issue.code)).toContain("prefer_keyed_object");
        expect(contactReport.infos).toBe(1);
        expect(contactReport.issues[0]?.code).toBe("prefer_keyed_object");
    });
});
