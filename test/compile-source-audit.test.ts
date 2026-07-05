import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { compile, t } from "../src/index.js";

describe("compiled source audit", () => {
    test("pins representative hot path generated source fingerprints", () => {
        const User = t.strictObject({
            id: t.string.uuid(),
            name: t.string.min(1).max(80),
            age: t.number.int().gte(0).lte(150),
            tags: t.array(t.string.min(1)),
            meta: t.record(t.union(t.string, t.number.int(), t.boolean))
        });
        const SafeUser = compile(User, { name: "snapshotUser" });
        const UnsafeUser = compile(User, {
            name: "snapshotUserUnsafe",
            mode: "unsafe"
        });
        const UncheckedUser = compile(User, {
            name: "snapshotUserUnchecked",
            mode: "unchecked"
        });

        expect(readSourceFingerprint(SafeUser.source)).toEqual({
            length: 9644,
            sha256: "2aa67201f52038c88275a31e984dbab4622361169be0aec45b418bfb4adf113a"
        });
        expect(readSourceFingerprint(UnsafeUser.source)).toEqual({
            length: 6514,
            sha256: "635205ba12b14059fed65c3ae289b255687cf8cd785cc55efaa95b2378eabd4e"
        });
        expect(readSourceFingerprint(UncheckedUser.source)).toEqual({
            length: 5754,
            sha256: "e6f50a917d5bcac6e21d4dc138431a81a5265eed53bffa236f15571244c2a4cc"
        });
    });

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
        expect(FastGuard.source).toContain("u[");
        expect(FastGuard.source).toContain("d(");
        expect(FastGuard.source).toContain("m(");
        expect(FastGuard.source).toContain("c0(x,[],s)");
        expect(FastGuard.source).toContain("const n=p.length");
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

    test("does not allocate issue arrays on successful compiled checks", () => {
        const FastString = compile(t.string, { name: "checkAllocationAudit" });

        expect(FastString.source).toContain("const z=Object.freeze([]);");
        expect(FastString.source).not.toContain("const e=Object.freeze([]);");
        expect(FastString.source).toContain("const q=function(s,p,c,e,x)");
        expect(FastString.source).toContain("const fq=function(p,c,e,x)");
        expect(FastString.source).toContain("path:z,code:c");
        expect(FastString.source).toContain("check:function checkAllocationAudit_check(x){if(checkAllocationAudit(x))return;const s=[];");
        expect(FastString.source).toContain("c0(x,z,s)");
        expect(FastString.source).toContain("result:function checkAllocationAudit_result(x){if(checkAllocationAudit(x))return Object.freeze({ok:true,value:x});");
        expect(FastString.source).toContain("first:function checkAllocationAudit_first(x){if(checkAllocationAudit(x))return Object.freeze({ok:true,value:x});const e=f0(x,z);");
        expect(FastString.source).not.toContain("first:function checkAllocationAudit_first(x){if(checkAllocationAudit(x))return Object.freeze({ok:true,value:x});const s=[];");
        expect(FastString.check("ok")).toEqual(t.string.check("ok"));
        expect(Object.isFrozen(FastString.check("ok"))).toBe(true);
        expect(FastString.check(1)).toEqual(t.string.check(1));
        expect(FastString.checkFirst(1)).toEqual(t.string.checkFirst(1));
    });

    test("reuses frozen root field paths for static diagnostics", () => {
        const User = t.strictObject({
            age: t.number.int().gte(10)
        });
        const FastUser = compile(User, { name: "staticPathAudit" });
        const result = FastUser.check({ age: 1.5 });

        expect(FastUser.source).toContain("const w=function()");
        expect(FastUser.source).toContain("const q1s=function(s,p,i,c,e,x)");
        expect(FastUser.source).toContain("path:w[i],code:c");
        expect(FastUser.source).toContain("q1s(s,p,0,\"expected_integer\"");
        expect(FastUser.source).toContain("q1s(s,p,0,\"expected_gte\"");
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toHaveLength(2);
            expect(result.error[0]?.path).toBe(result.error[1]?.path);
            expect(Object.isFrozen(result.error[0]?.path)).toBe(true);
        }
        expect(result).toEqual(User.check({ age: 1.5 }));
    });

    test("omits success result freeze in unsafe compiled checks", () => {
        const FastString = compile(t.string, {
            name: "unsafeResultAudit",
            mode: "unsafe"
        });
        const UncheckedString = compile(t.string, {
            name: "uncheckedResultAudit",
            mode: "unchecked"
        });

        expect(FastString.source).toContain(
            "result:function unsafeResultAudit_result(x){if(unsafeResultAudit(x))return {ok:true,value:x};"
        );
        expect(UncheckedString.source).toContain(
            "result:function uncheckedResultAudit_result(x){if(uncheckedResultAudit(x))return {ok:true,value:x};"
        );
        expect(FastString.source).toContain("Object.freeze({ok:false,error:Object.freeze(s)})");
        expect(UncheckedString.source).toContain("Object.freeze({ok:false,error:Object.freeze(s)})");
        expect(FastString.check("ok")).toEqual(t.string.check("ok"));
        expect(UncheckedString.check("ok")).toEqual(t.string.check("ok"));
        expect(Object.isFrozen(FastString.check("ok"))).toBe(false);
        expect(Object.isFrozen(UncheckedString.check("ok"))).toBe(false);
        expect(FastString.check(1)).toEqual(t.string.check(1));
        expect(UncheckedString.check(1)).toEqual(t.string.check(1));
    });

    test("installs trusted compiled hot methods as own non-enumerable slots", () => {
        const FastString = compile(t.string, { name: "trustedHotMethods" });
        const isDescriptor = Object.getOwnPropertyDescriptor(FastString, "is");
        const checkDescriptor = Object.getOwnPropertyDescriptor(FastString, "check");
        const assertDescriptor = Object.getOwnPropertyDescriptor(FastString, "assert");

        expect(isDescriptor?.enumerable).toBe(false);
        expect(isDescriptor?.writable).toBe(false);
        expect(checkDescriptor?.enumerable).toBe(false);
        expect(checkDescriptor?.writable).toBe(false);
        expect(assertDescriptor?.enumerable).toBe(false);
        expect(assertDescriptor?.writable).toBe(false);
        expect(FastString.is("ok")).toBe(true);
        expect(FastString.check("ok")).toEqual(t.string.check("ok"));
        expect(() => {
            Reflect.apply(isDescriptor?.value as (value: unknown) => boolean, null, ["ok"]);
        }).toThrow(TypeError);
        expect(Object.keys(FastString)).toEqual(["schema", "source"]);
    });

    test("omits unused helpers from simple compiled validators", () => {
        const FastString = compile(t.string, { name: "simpleString" });

        expect(FastString.source).not.toContain("const e=Object.freeze([]);");
        expect(FastString.source).toContain("const a=function");
        expect(FastString.source).toContain("const q=function");
        expect(FastString.source).not.toContain("Object.getOwnPropertyDescriptor");
        expect(FastString.source).not.toContain("Object.prototype.hasOwnProperty");
        expect(FastString.source).not.toContain("const o=function");
        expect(FastString.source).not.toContain("const er=function");
        expect(FastString.is("ok")).toBe(true);
        expect(FastString.check(1)).toEqual(t.string.check(1));
    });

    test("emits readable debug source only when requested", () => {
        const User = t.object({
            id: t.string,
            age: t.number.int()
        });
        const CompactUser = compile(User, { name: "debuggableUser" });
        const DebugUser = compile(User, {
            name: "debuggableUser",
            debugSource: true
        });

        expect(CompactUser.source).not.toContain("TypeSea generated validator");
        expect(DebugUser.source).toContain("TypeSea generated validator");
        expect(DebugUser.source).toContain("TypeSea helper prelude");
        expect(DebugUser.source).toContain("TypeSea boolean predicates");
        expect(DebugUser.source).toContain("TypeSea diagnostic collectors");
        expect(DebugUser.source).toContain("sourceURL=typesea-debuggableUser.generated.js");
        expect(DebugUser.source).toContain("\n    ");
        expect(DebugUser.is({ id: "u1", age: 37 })).toBe(true);
        expect(DebugUser.check({ id: "u1", age: 1.5 }))
            .toEqual(User.check({ id: "u1", age: 1.5 }));
    });

    test("warns in development when compile repeatedly code-generates per callsite", () => {
        const previousEnv = process.env["NODE_ENV"];
        const previousWarn = console.warn;
        const messages: string[] = [];

        process.env["NODE_ENV"] = "development";
        console.warn = (message?: unknown): void => {
            messages.push(String(message));
        };
        for (let index = 0; index < 32; index += 1) {
            compile(t.object({ id: t.string }), { name: "coldStartAudit" });
        }
        console.warn = previousWarn;
        if (previousEnv === undefined) {
            delete process.env["NODE_ENV"];
        } else {
            process.env["NODE_ENV"] = previousEnv;
        }

        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain("TypeSea warning: compile() was called 32 times");
        expect(messages[0]).toContain("compileCached()/createCompileCache()");
    });

    test("does not retain helpers because of public function name text", () => {
        const names = ["foo", "g", "h", "o"] as const;

        for (let index = 0; index < names.length; index += 1) {
            const name = names[index];
            if (name === undefined) {
                continue;
            }
            const FastString = compile(t.string, { name });

            if (name === "foo") {
                expect(FastString.source).toContain(`function ${name}(`);
            } else {
                expect(FastString.source).toContain("is:function(x){return p0(x);}");
                expect(FastString.source).not.toContain(`function ${name}(`);
            }
            expect(FastString.source).not.toContain("const g=function");
            expect(FastString.source).not.toContain("const h=Object.prototype.hasOwnProperty");
            expect(FastString.source).not.toContain("const o=function");
            expect(FastString.source).not.toContain("Object.getOwnPropertyDescriptor");
            expect(FastString.is("ok")).toBe(true);
            expect(FastString.check(1)).toEqual(t.string.check(1));
        }
    });

    test("omits regex lastIndex reset for non-stateful patterns", () => {
        const Emailish = t.string.regex(/^[^@]+@[^@]+$/u, "emailish");
        const FastEmailish = compile(Emailish, { name: "plainRegexAudit" });
        const predicateSource = readGeneratedFunctionSource(
            FastEmailish.source,
            "p0"
        );

        expect(predicateSource).toContain("r[0].test(v)");
        expect(predicateSource).not.toContain("lastIndex=0");
        expect(FastEmailish.is("ada@example.test")).toBe(true);
        expect(FastEmailish.check("bad")).toEqual(Emailish.check("bad"));
    });

    test("keeps regex lastIndex reset for global and sticky patterns", () => {
        const Global = t.string.regex(/^a$/gu, "global_a");
        const Sticky = t.string.regex(/^a$/y, "sticky_a");
        const FastGlobal = compile(Global, { name: "globalRegexAudit" });
        const FastSticky = compile(Sticky, { name: "stickyRegexAudit" });
        const globalPredicate = readGeneratedFunctionSource(
            FastGlobal.source,
            "p0"
        );
        const stickyPredicate = readGeneratedFunctionSource(
            FastSticky.source,
            "p0"
        );

        expect(globalPredicate).toContain("lastIndex=0");
        expect(stickyPredicate).toContain("lastIndex=0");
        expect(FastGlobal.is("a")).toBe(true);
        expect(FastGlobal.is("a")).toBe(true);
        expect(FastSticky.is("a")).toBe(true);
        expect(FastSticky.is("a")).toBe(true);
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
        const match = readIsFunctionName(FastString.source);

        expect(match).not.toBeNull();
        if (match !== null) {
            expect(match.length).toBeLessThanOrEqual(96);
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

    test("rejects unknown compile modes", () => {
        expect(() => {
            compile(t.string, { mode: "loose" as never });
        }).toThrow(TypeError);
    });

    test("emits all-required safe strict key counts before field reads", () => {
        const User = t.strictObject({
            id: t.string,
            name: t.string
        });
        const FastUser = compile(User, { name: "safeStrictOwnKeyCountAudit" });
        const predicateSource = readGeneratedFunctionSource(FastUser.source, "p0");
        const keyCountIndex = predicateSource.indexOf(
            "Object.getOwnPropertyNames(v).length!==2"
        );
        const firstDescriptorIndex = predicateSource.indexOf("const d");
        const symbolExtra = Symbol("extra");
        const withHidden: Record<PropertyKey, unknown> = {
            id: "u1",
            name: "Ada"
        };
        const withSymbol: Record<PropertyKey, unknown> = {
            id: "u1",
            name: "Ada",
            [symbolExtra]: true
        };

        Object.defineProperty(withHidden, "hidden", {
            enumerable: false,
            value: true
        });

        expect(keyCountIndex).toBeGreaterThanOrEqual(0);
        expect(firstDescriptorIndex).toBeGreaterThan(keyCountIndex);
        expect(predicateSource).toContain("Object.getOwnPropertySymbols(v).length!==0");
        expect(predicateSource).not.toContain("Reflect.ownKeys");
        expect(FastUser.is({
            id: "u1",
            name: "Ada"
        })).toBe(true);
        expect(FastUser.is(withHidden)).toBe(false);
        expect(FastUser.is(withSymbol)).toBe(false);
        expect(FastUser.check(withHidden)).toEqual(User.check(withHidden));
        expect(FastUser.check(withSymbol)).toEqual(User.check(withSymbol));
    });

    test("emits unsafe object reads and allocation-free strict key loops", () => {
        const User = t.strictObject({
            id: t.string,
            age: t.number.int()
        });
        const FastUser = compile(User, {
            name: "unsafeUser",
            mode: "unsafe"
        });
        const predicateSource = readGeneratedFunctionSource(
            FastUser.source,
            "p0"
        );
        const checkSource = readGeneratedFunctionSource(FastUser.source, "c0");

        expect(predicateSource).toContain("v.id");
        expect(predicateSource).toContain("v.age");
        expect(predicateSource).toContain("for(const key");
        expect(predicateSource).not.toContain("gp(v,u[0])");
        expect(predicateSource).not.toContain("gp(v,u[1])");
        expect(predicateSource).not.toContain("[u[0]]");
        expect(predicateSource).not.toContain("[u[1]]");
        expect(predicateSource).not.toContain("Object.getOwnPropertyNames");
        expect(predicateSource).not.toContain("Object.getOwnPropertySymbols");
        expect(predicateSource).toContain("===\"id\"");
        expect(predicateSource).toContain("===\"age\"");
        expect(checkSource).toContain("const v0=v.id;");
        expect(checkSource).toContain("const v1=v.age;");
        expect(checkSource).toContain("for(const key in v)");
        expect(checkSource).toContain("if(h.call(v,key)&&!(key===\"id\"||key===\"age\"))");
        expect(checkSource).not.toContain("gp(v,u[0])");
        expect(checkSource).not.toContain("gp(v,u[1])");
        expect(checkSource).not.toContain("Reflect.ownKeys");
        expect(FastUser.is({ id: "u1", age: 37 })).toBe(true);
        expect(FastUser.is({ id: "u1", age: 1.5 })).toBe(false);
        expect(FastUser.check({ id: "u1", age: 1.5 }))
            .toEqual(User.check({ id: "u1", age: 1.5 }));
    });

    test("emits distinct safe and unsafe presence-dispatch gates", () => {
        const Operators = t.object({
            eq: t.optional(t.string),
            gt: t.optional(t.number)
        });
        const Query = t.union(
            t.object({ and: t.array(t.unknown).min(1) }),
            t.object({ or: t.array(t.unknown).min(1) }),
            t.object({ not: t.unknown }),
            t.object({ path: t.string, eq: t.optional(t.string) }),
            t.record(Operators)
        );
        const SafeQuery = compile(Query, { name: "safePresenceAudit" });
        const UnsafeQuery = compile(Query, {
            name: "unsafePresenceAudit",
            mode: "unsafe"
        });
        const safeSource = readGeneratedFunctionSource(
            SafeQuery.source,
            "safePresenceAudit"
        );
        const unsafeSource = readGeneratedFunctionSource(
            UnsafeQuery.source,
            "unsafePresenceAudit"
        );
        let reads = 0;
        const accessor: { readonly and?: readonly unknown[] } = {};

        Object.defineProperty(accessor, "and", {
            enumerable: true,
            get(): readonly unknown[] {
                reads += 1;
                return [1];
            }
        });

        expect(safeSource).toContain("gp(v,u[0])");
        expect(safeSource).toContain("if(d1===undefined)break pb0");
        expect(safeSource).toContain("!h.call");
        expect(safeSource).not.toContain("if(h.call(v,\"and\"))");
        expect(unsafeSource).toContain("if(h.call(v,\"and\"))");
        expect(unsafeSource).toContain("const v1=v.and;");
        expect(unsafeSource).not.toContain("gp(v,u[0])");
        expect(SafeQuery.is({ and: [1] })).toBe(true);
        expect(UnsafeQuery.is({ and: [1] })).toBe(true);
        expect(SafeQuery.is(accessor)).toBe(false);
        expect(reads).toBe(0);
        expect(UnsafeQuery.is(accessor)).toBe(true);
        expect(reads).toBe(1);
    });

    test("escapes unsafe static property keys in generated source", () => {
        const escapedKey = "slot\"];globalThis.__TYPESEA_UNSAFE_ESCAPE=1;//";
        const Guard = t.strictObject({
            [escapedKey]: t.string
        });
        const globalRecord = globalThis as typeof globalThis & Record<
            "__TYPESEA_UNSAFE_ESCAPE",
            unknown
        >;

        delete globalRecord.__TYPESEA_UNSAFE_ESCAPE;

        const FastGuard = compile(Guard, {
            name: "unsafeSourceEscapeAudit",
            mode: "unsafe"
        });
        const value = {
            [escapedKey]: "ok"
        };

        expect(FastGuard.is(value)).toBe(true);
        expect(FastGuard.is({ [escapedKey]: 1 })).toBe(false);
        expect(globalRecord.__TYPESEA_UNSAFE_ESCAPE).toBeUndefined();
    });

    test("unsafe arrays use direct indexed loads", () => {
        const Values = t.array(t.string.min(1));
        const FastValues = compile(Values, {
            name: "unsafeArrayAudit",
            mode: "unsafe"
        });
        const predicateSource = readGeneratedFunctionSource(
            FastValues.source,
            "unsafeArrayAudit"
        );
        const checkSource = readGeneratedFunctionSource(FastValues.source, "c0");
        const sparse = new Array<unknown>(1);

        expect(predicateSource).toMatch(/for\(let i\d+=0;i\d+<v\.length;i\d+\+=1\)/u);
        expect(predicateSource).toMatch(/const v\d+=v\[i\d+\];/u);
        expect(predicateSource).not.toContain("gp(v,");
        expect(checkSource).toContain("for(let i=0;i<v.length;i+=1)");
        expect(checkSource).toContain("const av=v[i];");
        expect(checkSource).not.toContain("gp(v,i)");
        expect(checkSource).not.toContain("d.value");
        expect(FastValues.is(["x", "y"])).toBe(true);
        expect(FastValues.is([""])).toBe(false);
        expect(FastValues.is(sparse)).toBe(false);
        expect(FastValues.check(sparse).ok).toBe(false);
    });

    test("unsafe tuple diagnostics use direct indexed loads", () => {
        const Tuple = t.tuple([t.string, t.number.int()]);
        const FastTuple = compile(Tuple, {
            name: "unsafeTupleAudit",
            mode: "unsafe"
        });
        const checkSource = readGeneratedFunctionSource(FastTuple.source, "c0");
        const sparse = new Array<unknown>(2);
        sparse[1] = 1;

        expect(checkSource).toContain("const tv0=v[0];");
        expect(checkSource).toContain("const tv1=v[1];");
        expect(checkSource).not.toContain("gp(v,0)");
        expect(checkSource).not.toContain("gp(v,1)");
        expect(checkSource).not.toContain("d.value");
        expect(FastTuple.check(sparse).ok).toBe(false);
    });

    test("unsafe object mode accepts accessor-backed required fields", () => {
        const Shape = t.strictObject({
            id: t.string
        });
        const SafeShape = compile(Shape, { name: "safeAccessorShape" });
        const UnsafeShape = compile(Shape, {
            name: "unsafeAccessorShape",
            mode: "unsafe"
        });
        let reads = 0;
        const accessor: { readonly id?: string } = {};

        Object.defineProperty(accessor, "id", {
            enumerable: true,
            get(): string {
                reads += 1;
                return "u1";
            }
        });

        expect(SafeShape.is(accessor)).toBe(false);
        expect(reads).toBe(0);
        expect(UnsafeShape.is(accessor)).toBe(true);
        expect(reads).toBe(1);
        expect(UnsafeShape.check(accessor).ok).toBe(true);
    });

    test("unsafe optional own undefined fields preserve child guards", () => {
        const Child = t.intersect(
            t.strictObject({
                a: t.string
            }),
            t.tuple([t.string, t.string.uuid()])
        );
        const Shape = t.object({
            a: Child
        }).partial();
        const SafeShape = compile(Shape, { name: "safeOwnUndefinedShape" });
        const UnsafeShape = compile(Shape, {
            name: "unsafeOwnUndefinedShape",
            mode: "unsafe"
        });
        const value = {
            a: undefined
        };

        expect(() => UnsafeShape.is(value)).not.toThrow();
        expect(UnsafeShape.is(value)).toBe(SafeShape.is(value));
        expect(UnsafeShape.check(value).ok).toBe(SafeShape.check(value).ok);
    });

    test("unsafe strict objects ignore symbol and non-enumerable extras", () => {
        const Shape = t.strictObject({
            id: t.string
        });
        const SafeShape = compile(Shape, { name: "safeExtraShape" });
        const UnsafeShape = compile(Shape, {
            name: "unsafeExtraShape",
            mode: "unsafe"
        });
        const symbolExtra = Symbol("extra");
        const withSymbol = {
            id: "u1",
            [symbolExtra]: 1
        };
        const withHidden: { id: string; readonly extra?: number } = {
            id: "u1"
        };

        Object.defineProperty(withHidden, "extra", {
            enumerable: false,
            value: 1
        });

        expect(SafeShape.is(withSymbol)).toBe(false);
        expect(UnsafeShape.is(withSymbol)).toBe(true);
        expect(SafeShape.is(withHidden)).toBe(false);
        expect(UnsafeShape.is(withHidden)).toBe(true);
    });

    test("unchecked mode trusts strict object shapes and skips extra key loops", () => {
        const Shape = t.strictObject({
            id: t.string
        });
        const UnsafeShape = compile(Shape, {
            name: "unsafeStrictShape",
            mode: "unsafe"
        });
        const UncheckedShape = compile(Shape, {
            name: "uncheckedStrictShape",
            mode: "unchecked"
        });
        const predicateSource = readGeneratedFunctionSource(
            UncheckedShape.source,
            "uncheckedStrictShape"
        );
        const checkSource = readGeneratedFunctionSource(
            UncheckedShape.source,
            "c0"
        );
        const value = {
            id: "u1",
            extra: true
        };

        expect(predicateSource).toContain("v.id");
        expect(predicateSource).not.toContain("for(const key");
        expect(predicateSource).not.toContain("Object.getOwnPropertyNames");
        expect(checkSource).toContain("const v0=v.id;");
        expect(checkSource).not.toContain("for(const key");
        expect(checkSource).not.toContain("Reflect.ownKeys");
        expect(UnsafeShape.is(value)).toBe(false);
        expect(UncheckedShape.is(value)).toBe(true);
        expect(UncheckedShape.check(value).ok).toBe(true);
    });

    test("unchecked records skip own-key filters inside value loops", () => {
        const Row = t.record(t.string.min(1));
        const UnsafeRow = compile(Row, {
            name: "unsafeRecordShape",
            mode: "unsafe"
        });
        const UncheckedRow = compile(Row, {
            name: "uncheckedRecordShape",
            mode: "unchecked"
        });
        const predicateSource = readGeneratedFunctionSource(
            UncheckedRow.source,
            "uncheckedRecordShape"
        );
        const inherited = Object.create({
            ghost: ""
        }) as Record<string, unknown>;

        expect(predicateSource).toContain("for(const key");
        expect(predicateSource).toContain("const v");
        expect(predicateSource).not.toContain("if(!h.call");
        expect(UnsafeRow.is(inherited)).toBe(true);
        expect(UncheckedRow.is(inherited)).toBe(false);
    });

    test("emits tuple item checks as straight-line descriptor reads", () => {
        const Tuple = t.tuple([t.literal("point"), t.number.int()]);
        const FastTuple = compile(Tuple, { name: "tupleAudit" });
        const predicateSource = readGeneratedFunctionSource(
            FastTuple.source,
            "p0"
        );

        expect(FastTuple.source).toContain(".length!==2");
        expect(FastTuple.source).toContain("gp(v,0)");
        expect(FastTuple.source).toContain("gp(v,1)");
        expect(FastTuple.source).not.toContain("ev(v,0");
        expect(FastTuple.source).not.toContain("ev(v,1");
        expect(predicateSource).toContain("if(d0===undefined)return false");
        expect(predicateSource).toContain("if(d2===undefined)return false");
        expect(predicateSource).not.toContain("===undefined||!h.call");
        expect(predicateSource).toContain(".value;");
        expect(predicateSource).not.toContain("===undefined?undefined");
        expect(FastTuple.is(["point", 1])).toBe(true);
        expect(FastTuple.is(["point", 1.5])).toBe(false);
        expect(FastTuple.check(["x", 1])).toEqual(Tuple.check(["x", 1]));
    });

    test("fails missing array item descriptors early when item rejects undefined", () => {
        const Values = t.array(t.string.min(1));
        const FastValues = compile(Values, { name: "arrayDenseAudit" });
        const predicateSource = readGeneratedFunctionSource(
            FastValues.source,
            "p0"
        );
        const sparse = new Array<unknown>(1);
        const accessor = [] as unknown[];
        let reads = 0;

        Object.defineProperty(accessor, "0", {
            configurable: true,
            enumerable: true,
            get(): string {
                reads += 1;
                return "x";
            }
        });
        accessor.length = 1;

        expect(predicateSource).toContain("if(d1===undefined)return false");
        expect(predicateSource).not.toContain("===undefined||!h.call");
        expect(predicateSource).toContain(".value;");
        expect(predicateSource).not.toContain("===undefined?undefined");
        expect(FastValues.is(["x"])).toBe(true);
        expect(FastValues.is(sparse)).toBe(false);
        expect(FastValues.is(accessor)).toBe(false);
        expect(reads).toBe(0);
        expect(FastValues.check(sparse)).toEqual(Values.check(sparse));
    });

    test("splits compiled array diagnostics for missing and data slots", () => {
        const Values = t.array(t.string.min(1));
        const FastValues = compile(Values, { name: "arrayCheckAudit" });
        const checkSource = readGeneratedFunctionSource(
            FastValues.source,
            "c0"
        );
        const sparse = new Array<unknown>(1);

        expect(checkSource).toContain("if(d===undefined){q1(s,p,i,\"expected_string\",\"string\",\"undefined\");}");
        expect(checkSource).toContain("else{const av=d.value;if(typeof av!==\"string\")");
        expect(checkSource).not.toContain("typeof d.value");
        expect(checkSource).not.toContain("typeof undefined");
        expect(checkSource).not.toContain("undefined.length");
        expect(checkSource).toContain("q1(s,p,i");
        expect(checkSource).not.toContain("p.push(i);");
        expect(checkSource).not.toContain("c1(");
        expect(checkSource).not.toContain("d===undefined?undefined");
        expect(FastValues.source).toContain("const q1=function(s,p,k,c,e,x)");
        expect(FastValues.check(sparse)).toEqual(Values.check(sparse));
    });

    test("splits compiled tuple diagnostics for missing and data slots", () => {
        const Tuple = t.tuple([t.string, t.number]);
        const FastTuple = compile(Tuple, { name: "tupleCheckAudit" });
        const checkSource = readGeneratedFunctionSource(
            FastTuple.source,
            "c0"
        );
        const sparse = new Array<unknown>(2);
        sparse[1] = 1;

        expect(checkSource).toContain("if(d===undefined){q1(s,p,0,\"expected_string\",\"string\",\"undefined\");}");
        expect(checkSource).toContain("else{const tv0=d.value;if(typeof tv0!==\"string\")");
        expect(checkSource).not.toContain("typeof d.value");
        expect(checkSource).not.toContain("typeof undefined");
        expect(checkSource).not.toContain("undefined.length");
        expect(checkSource).toContain("q1(s,p,0");
        expect(checkSource).not.toContain("p.push(0);");
        expect(checkSource).not.toContain("c1(");
        expect(checkSource).not.toContain("d===undefined?undefined");
        expect(FastTuple.check(sparse)).toEqual(Tuple.check(sparse));
    });

    test("keeps sparse array path when item accepts undefined", () => {
        const Values = t.array(t.undefinedable(t.string));
        const FastValues = compile(Values, { name: "arraySparseAudit" });
        const predicateSource = readGeneratedFunctionSource(
            FastValues.source,
            "p0"
        );
        const sparse = new Array<unknown>(1);

        expect(predicateSource).toContain("Object.getOwnPropertyNames(v)");
        expect(predicateSource).toContain("!ai(");
        expect(predicateSource).toContain("!==undefined&&!h.call");
        expect(predicateSource).not.toContain("===undefined?undefined");
        expect(FastValues.is(sparse)).toBe(true);
        expect(FastValues.check(sparse)).toEqual(Values.check(sparse));
    });

    test("keeps sparse array holes valid for undefined literals", () => {
        const Values = t.array(t.literal(undefined));
        const FastValues = compile(Values, { name: "arrayUndefinedLiteralAudit" });
        const checkSource = readGeneratedFunctionSource(
            FastValues.source,
            "c0"
        );
        const sparse = new Array<unknown>(1);

        expect(checkSource).toContain("Object.getOwnPropertyNames(v)");
        expect(checkSource).toContain("!ai(");
        expect(checkSource).toContain("Number(");
        expect(checkSource).not.toContain("if(d===undefined)");
        expect(checkSource).not.toContain("typeof undefined");
        expect(FastValues.is(sparse)).toBe(true);
        expect(FastValues.check(sparse)).toEqual(Values.check(sparse));
    });

    test("specializes always-true array item graphs without dropping slot checks", () => {
        const Values = t.array(t.unknown);
        const FastValues = compile(Values, { name: "arrayUnknownAudit" });
        const predicateSource = readGeneratedFunctionSource(
            FastValues.source,
            "p0"
        );
        const sparse = new Array<unknown>(1);
        const accessor = new Array<unknown>(1);
        Object.defineProperty(accessor, "0", {
            enumerable: true,
            get(): unknown {
                return "x";
            }
        });

        expect(FastValues.source).not.toContain("function p1");
        expect(predicateSource).toContain("Object.getOwnPropertyNames(v)");
        expect(predicateSource).toContain("!ai(");
        expect(predicateSource).toContain("!==undefined&&!h.call");
        expect(predicateSource).not.toMatch(/for\(let i\d+=0;i\d+<v\.length/u);
        expect(predicateSource).not.toContain("if(!true)");
        expect(predicateSource).not.toContain("===undefined?undefined");
        expect(FastValues.is(["x", 1])).toBe(true);
        expect(FastValues.is(sparse)).toBe(true);
        expect(FastValues.is(accessor)).toBe(false);
        expect(FastValues.check(accessor)).toEqual(Values.check(accessor));
    });

    test("keeps sparse array work proportional to present indexes", () => {
        const Values = t.array(t.unknown);
        const FastValues = compile(Values, { name: "arrayHugeSparseAudit" });
        const sparse = new Array<unknown>(10_000_000);
        const accessor = new Array<unknown>(10_000_000);

        Object.defineProperty(accessor, "9999999", {
            configurable: true,
            enumerable: true,
            get(): never {
                throw new Error("array getter must not execute");
            }
        });

        expect(FastValues.is(sparse)).toBe(true);
        expect(FastValues.check(sparse)).toEqual(Values.check(sparse));
        expect(FastValues.is(accessor)).toBe(false);
        expect(FastValues.check(accessor)).toEqual(Values.check(accessor));
    });

    test("specializes always-false array item graphs to a length guard", () => {
        const Values = t.array(t.never);
        const FastValues = compile(Values, { name: "arrayNeverAudit" });
        const predicateSource = readGeneratedFunctionSource(
            FastValues.source,
            "p0"
        );

        expect(FastValues.source).not.toContain("function p1");
        expect(predicateSource).toContain(".length!==0");
        expect(predicateSource).not.toContain("for(let i");
        expect(predicateSource).not.toContain("if(!false)");
        expect(FastValues.is([])).toBe(true);
        expect(FastValues.is([undefined])).toBe(false);
        expect(FastValues.check([undefined])).toEqual(Values.check([undefined]));
    });

    test("specializes always-true record value graphs without dropping accessor checks", () => {
        const Row = t.record(t.unknown);
        const FastRow = compile(Row, { name: "recordUnknownAudit" });
        const predicateSource = readGeneratedFunctionSource(
            FastRow.source,
            "p0"
        );
        const accessor: Record<string, unknown> = {};
        Object.defineProperty(accessor, "name", {
            enumerable: true,
            get(): unknown {
                return "Ada";
            }
        });

        expect(FastRow.source).not.toContain("function p1");
        expect(predicateSource).toContain("for(const key");
        expect(predicateSource).toContain("gp(");
        expect(predicateSource).not.toContain("if(!true)");
        expect(predicateSource).not.toMatch(/p\d+\(v\d+\)/u);
        expect(FastRow.is({ name: "Ada", age: 37 })).toBe(true);
        expect(FastRow.is(Object.create({ inherited: 1 }))).toBe(true);
        expect(FastRow.is(accessor)).toBe(false);
        expect(FastRow.check(accessor)).toEqual(Row.check(accessor));
    });

    test("specializes always-false record value graphs to an own-key guard", () => {
        const Row = t.record(t.never);
        const FastRow = compile(Row, { name: "recordNeverAudit" });
        const predicateSource = readGeneratedFunctionSource(
            FastRow.source,
            "p0"
        );

        expect(FastRow.source).not.toContain("function p1");
        expect(predicateSource).toContain("for(const key");
        expect(predicateSource).toContain("if(h.call(");
        expect(predicateSource).not.toContain("gp(");
        expect(predicateSource).not.toContain("if(!false)");
        expect(FastRow.is({})).toBe(true);
        expect(FastRow.is(Object.create({ inherited: 1 }))).toBe(true);
        expect(FastRow.is({ value: undefined })).toBe(false);
        expect(FastRow.check({ value: undefined }))
            .toEqual(Row.check({ value: undefined }));
    });

    test("emits record diagnostics without Object.keys allocation", () => {
        const Row = t.record(t.string);
        const FastRow = compile(Row, { name: "recordCheckLoopAudit" });
        const checkSource = readGeneratedFunctionSource(
            FastRow.source,
            "c0"
        );

        expect(checkSource).toContain("for(const key in v)");
        expect(checkSource).toContain("if(!h.call(v,key))continue;");
        expect(checkSource).toContain("q1(s,p,key,\"expected_string\"");
        expect(checkSource).not.toContain("p.push(key);");
        expect(checkSource).not.toContain("Object.keys");
        expect(FastRow.check({ ok: "x", bad: 1 })).toEqual(Row.check({
            ok: "x",
            bad: 1
        }));
    });

    test("unsafe record diagnostics use direct value loads", () => {
        const Row = t.record(t.string.min(1));
        const FastRow = compile(Row, {
            name: "unsafeRecordCheckAudit",
            mode: "unsafe"
        });
        const UncheckedRow = compile(Row, {
            name: "uncheckedRecordCheckAudit",
            mode: "unchecked"
        });
        const unsafeCheck = readGeneratedFunctionSource(FastRow.source, "c0");
        const uncheckedCheck = readGeneratedFunctionSource(UncheckedRow.source, "c0");
        const inherited = Object.create({
            ghost: ""
        }) as Record<string, unknown>;

        expect(unsafeCheck).toContain("for(const key in v)");
        expect(unsafeCheck).toContain("if(!h.call(v,key))continue;");
        expect(unsafeCheck).toContain("const rv=v[key];");
        expect(unsafeCheck).not.toContain("gp(v,key)");
        expect(uncheckedCheck).toContain("for(const key in v)");
        expect(uncheckedCheck).toContain("const rv=v[key];");
        expect(uncheckedCheck).not.toContain("if(!h.call(v,key))continue;");
        expect(uncheckedCheck).not.toContain("gp(v,key)");
        expect(FastRow.check(inherited).ok).toBe(true);
        expect(UncheckedRow.check(inherited).ok).toBe(false);
    });

    test("fuses object string bounds into one branch", () => {
        const User = t.strictObject({
            id: t.string.min(1).max(48)
        });
        const FastUser = compile(User, { name: "stringBoundsAudit" });
        const predicateSource = readGeneratedFunctionSource(
            FastUser.source,
            "p0"
        );
        const checkSource = readGeneratedFunctionSource(FastUser.source, "c0");

        expect(predicateSource).toContain(
            "typeof v1!==\"string\"||v1.length<1||v1.length>48"
        );
        expect(predicateSource).not.toContain("if(!(typeof v1===\"string\"))");
        expect(checkSource).toContain("q1s(s,p,0,\"expected_min_length\"");
        expect(checkSource).toContain("q1s(s,p,0,\"expected_max_length\"");
        expect(checkSource).not.toContain("p.push(u[0]);");
        expect(checkSource).not.toContain("c1(");
        expect(FastUser.is({ id: "x" })).toBe(true);
        expect(FastUser.is({ id: "" })).toBe(false);
        expect(FastUser.is({ id: "x".repeat(49) })).toBe(false);
        expect(FastUser.check({ id: "" })).toEqual(User.check({ id: "" }));
    });

    test("fuses object number constraints into one branch", () => {
        const User = t.strictObject({
            age: t.number.int().gte(0).lte(150)
        });
        const FastUser = compile(User, { name: "numberBoundsAudit" });
        const predicateSource = readGeneratedFunctionSource(
            FastUser.source,
            "p0"
        );
        const checkSource = readGeneratedFunctionSource(FastUser.source, "c0");

        expect(predicateSource).toContain(
            "!Number.isInteger(v1)||v1<0||v1>150"
        );
        expect(predicateSource).not.toContain("if(!Number.isInteger(v1))");
        expect(checkSource).toContain("q1s(s,p,0,\"expected_integer\"");
        expect(checkSource).toContain("q1s(s,p,0,\"expected_gte\"");
        expect(checkSource).toContain("q1s(s,p,0,\"expected_lte\"");
        expect(checkSource).not.toContain("p.push(u[0]);");
        expect(checkSource).not.toContain("c1(");
        expect(FastUser.is({ age: 37 })).toBe(true);
        expect(FastUser.is({ age: 1.5 })).toBe(false);
        expect(FastUser.is({ age: -1 })).toBe(false);
        expect(FastUser.is({ age: 151 })).toBe(false);
        expect(FastUser.check({ age: 1.5 })).toEqual(User.check({ age: 1.5 }));
    });

    test("omits empty scalar diagnostic else blocks", () => {
        const User = t.strictObject({
            id: t.string,
            age: t.number,
            enabled: t.boolean
        });
        const FastUser = compile(User, { name: "plainScalarCheckAudit" });
        const checkSource = readGeneratedFunctionSource(FastUser.source, "c0");

        expect(checkSource).not.toContain("else{}");
        expect(checkSource).toContain("if(typeof v0!==\"string\")");
        expect(checkSource).toContain("if(typeof v1!==\"number\"||!Number.isFinite(v1))");
        expect(checkSource).toContain("if(typeof v2!==\"boolean\")");
        expect(FastUser.check({
            id: "u1",
            age: 37,
            enabled: true
        })).toEqual(User.check({
            id: "u1",
            age: 37,
            enabled: true
        }));
        expect(FastUser.check({
            id: 1,
            age: Number.POSITIVE_INFINITY,
            enabled: "yes"
        })).toEqual(User.check({
            id: 1,
            age: Number.POSITIVE_INFINITY,
            enabled: "yes"
        }));
    });

    test("emits safe strict object diagnostics with inline key membership", () => {
        const User = t.strictObject({
            id: t.string,
            name: t.string
        });
        const FastUser = compile(User, { name: "safeStrictKeyAudit" });
        const checkSource = readGeneratedFunctionSource(FastUser.source, "c0");
        const symbol = Symbol("extra");
        const invalid = {
            id: "u1",
            name: "Ada",
            extra: true,
            [symbol]: true
        };
        const missingWithExtra = {
            id: "u1",
            extra: true
        };

        expect(checkSource).toContain("Object.getOwnPropertyNames(v)");
        expect(checkSource).toContain("Object.getOwnPropertySymbols(v)");
        expect(checkSource).toContain("!(key===u[0]||key===u[1])");
        expect(checkSource).toContain("q1(s,p,String(key),\"unrecognized_key\"");
        expect(checkSource).not.toContain("Reflect.ownKeys(v)");
        expect(checkSource).not.toContain("typeof key===\"string\"?key:String(key)");
        expect(checkSource).not.toContain(".includes(key)");
        expect(checkSource).not.toContain("k[");
        expect(FastUser.check(invalid)).toEqual(User.check(invalid));
        expect(FastUser.check(missingWithExtra)).toEqual(User.check(missingWithExtra));
    });

    test("inlines object array field diagnostics with two-segment paths", () => {
        const User = t.strictObject({
            tags: t.array(t.string.min(1))
        });
        const FastUser = compile(User, { name: "objectArrayFieldAudit" });
        const checkSource = readGeneratedFunctionSource(FastUser.source, "c0");
        const invalid = {
            tags: ["ok", 1],
            extra: true
        };

        expect(checkSource).toContain("q2(s,p,u[0],i,\"expected_string\"");
        expect(checkSource).not.toContain("p.push(u[0]);");
        expect(checkSource).not.toContain("c1(d.value");
        expect(FastUser.check(invalid)).toEqual(User.check(invalid));
        expect(FastUser.check({
            tags: 1,
            extra: true
        })).toEqual(User.check({
            tags: 1,
            extra: true
        }));
    });

    test("unsafe object array field diagnostics use direct indexed loads", () => {
        const User = t.strictObject({
            tags: t.array(t.string.min(1))
        });
        const FastUser = compile(User, {
            name: "unsafeObjectArrayFieldAudit",
            mode: "unsafe"
        });
        const checkSource = readGeneratedFunctionSource(FastUser.source, "c0");
        const invalid = {
            tags: ["ok", 1]
        };

        expect(checkSource).toContain("const v0=v.tags;");
        expect(checkSource).toContain("const av=v0[i];");
        expect(checkSource).toContain("q2(s,p,\"tags\",i,\"expected_string\"");
        expect(checkSource).not.toContain("gp(v0,i)");
        expect(checkSource).not.toContain("vd.value");
        expect(FastUser.check(invalid).ok).toBe(false);
    });

    test("unsafe object record field diagnostics use direct value loads", () => {
        const User = t.strictObject({
            meta: t.record(t.string.min(1))
        });
        const FastUser = compile(User, {
            name: "unsafeObjectRecordFieldAudit",
            mode: "unsafe"
        });
        const checkSource = readGeneratedFunctionSource(FastUser.source, "c0");
        const invalid = {
            meta: {
                ok: "x",
                bad: ""
            }
        };

        expect(checkSource).toContain("const v0=v.meta;");
        expect(checkSource).toContain("for(const key in v0)");
        expect(checkSource).toContain("const rv=v0[key];");
        expect(checkSource).toContain("q2(s,p,\"meta\",key,\"expected_min_length\"");
        expect(checkSource).not.toContain("gp(v0,key)");
        expect(checkSource).not.toContain("rd.value");
        expect(FastUser.check(invalid).ok).toBe(false);
    });

    test("emits object literal unions as discriminant switches", () => {
        const Entity = t.union(
            t.object({
                kind: t.literal("user"),
                id: t.string
            }),
            t.object({
                kind: t.literal("order"),
                id: t.string
            })
        );
        const FastEntity = compile(Entity, { name: "entityAudit" });
        const predicateSource = readGeneratedFunctionSource(
            FastEntity.source,
            "p0"
        );

        expect(FastEntity.source).toContain("switch(");
        expect(FastEntity.source).not.toContain("const ut");
        expect(predicateSource).toContain(
            "if(typeof v!==\"object\"||v===null||Array.isArray(v))return false;"
        );
        expect(predicateSource).not.toContain("if(!o(v))return false;");
        expect(predicateSource).not.toContain("g(v,");
        expect(countOccurrences(predicateSource, "gp(v,")).toBe(3);
        expect(predicateSource).toContain("typeof d0.value!==\"string\"");
        expect(predicateSource).not.toContain("!h.call(d0,\"value\")");
        expect(predicateSource).not.toContain("Object.is(d0.value");
        expect(FastEntity.is({ kind: "user", id: "u1" })).toBe(true);
        expect(FastEntity.is({ kind: "order", id: "o1" })).toBe(true);
        expect(FastEntity.is({ kind: "user", id: 1 })).toBe(false);
        expect(FastEntity.is({ kind: "missing", id: "x" })).toBe(false);
        expect(FastEntity.check({ kind: "user", id: 1 }))
            .toEqual(Entity.check({ kind: "user", id: 1 }));
    });

    test("unsafe discriminated union diagnostics use direct tag reads", () => {
        const Event = t.discriminatedUnion("kind", {
            user: t.object({
                kind: t.literal("user"),
                id: t.string.min(1)
            }),
            order: t.object({
                kind: t.literal("order"),
                total: t.number.gte(0)
            })
        });
        const FastEvent = compile(Event, {
            name: "unsafeDiscriminantAudit",
            mode: "unsafe"
        });
        const predicateSource = readGeneratedFunctionSource(
            FastEvent.source,
            "unsafeDiscriminantAudit"
        );
        const checkSource = readGeneratedFunctionSource(FastEvent.source, "c0");

        expect(predicateSource).toContain("const v0=v.kind;");
        expect(checkSource).toContain("const dv=v.kind;");
        expect(checkSource).toContain("if(dv===\"user\")");
        expect(checkSource).toContain("if(dv===\"order\")");
        expect(checkSource).not.toContain("gp(v,\"kind\")");
        expect(checkSource).not.toContain("Object.is(dv");
        expect(FastEvent.check({ kind: "user", id: "" }).ok).toBe(false);
        expect(FastEvent.check({ kind: "missing" }).ok).toBe(false);
    });

    test("emits union arms as labelled refined branches", () => {
        const Value = t.union(
            t.string.min(1),
            t.boolean,
            t.array(t.string)
        );
        const FastValue = compile(Value, { name: "unionAudit" });
        const predicateSource = readGeneratedFunctionSource(
            FastValue.source,
            "p0"
        );

        expect(predicateSource).toContain("ub");
        expect(predicateSource).toContain("break ub");
        expect(predicateSource).not.toContain("p1(u0)");
        expect(predicateSource).not.toContain("const u0=v");
        expect(countOccurrences(predicateSource, "const ut0=typeof v;")).toBe(1);
        expect(countOccurrences(predicateSource, "Array.isArray(v)")).toBe(1);
        expect(FastValue.is("x")).toBe(true);
        expect(FastValue.is("")).toBe(false);
        expect(FastValue.is(true)).toBe(true);
        expect(FastValue.is(["x", "y"])).toBe(true);
        expect(FastValue.is(["x", 1])).toBe(false);
        expect(FastValue.check(["x", 1])).toEqual(Value.check(["x", 1]));
    });

    test("emits presence-gated object union branches", () => {
        const Operators = t.object({
            eq: t.optional(t.string),
            gt: t.optional(t.number)
        });
        const Query = t.union(
            t.object({ and: t.array(t.unknown).min(1) }),
            t.object({ or: t.array(t.unknown).min(1) }),
            t.object({ not: t.unknown }),
            t.object({ path: t.string, eq: t.optional(t.string) }),
            t.record(Operators)
        );
        const FastQuery = compile(Query, { name: "presenceUnionAudit" });
        const predicateSource = readGeneratedFunctionSource(
            FastQuery.source,
            "presenceUnionAudit"
        );

        expect(predicateSource).toContain("pb");
        expect(predicateSource).toContain("break pb");
        expect(countOccurrences(predicateSource, "gp(v,u[")).toBeGreaterThanOrEqual(4);
        expect(predicateSource).toContain("if(d1===undefined)break pb0");
        expect(predicateSource).toContain("if(d17===undefined||!h.call(d17,\"value\"))break pb16");
        expect(predicateSource).not.toContain("p1(v)");
        expect(FastQuery.is({ and: [{}] })).toBe(true);
        expect(FastQuery.is({ and: [] })).toBe(false);
        expect(FastQuery.is({ "user.age": { gt: 30 } })).toBe(true);
        expect(FastQuery.is({ "user.age": { gt: "old" } })).toBe(false);
        expect(FastQuery.check({ "user.age": { gt: "old" } }))
            .toEqual(Query.check({ "user.age": { gt: "old" } }));
    });

    test("emits number union arms with typeof-refined finite checks", () => {
        const Value = t.union(
            t.number.gte(0),
            t.string
        );
        const FastValue = compile(Value, { name: "numberUnionAudit" });
        const predicateSource = readGeneratedFunctionSource(
            FastValue.source,
            "p0"
        );

        expect(predicateSource).not.toContain("const u0=v");
        expect(countOccurrences(predicateSource, "typeof v")).toBe(1);
        expect(predicateSource).toContain("ut0===\"number\"");
        expect(predicateSource).toContain("Number.isFinite(v)");
        expect(predicateSource).not.toContain("typeof v===\"number\"&&Number.isFinite");
        expect(FastValue.is(1)).toBe(true);
        expect(FastValue.is(-1)).toBe(false);
        expect(FastValue.is(Number.NaN)).toBe(false);
        expect(FastValue.is(Number.POSITIVE_INFINITY)).toBe(false);
        expect(FastValue.is("x")).toBe(true);
        expect(FastValue.check(Number.NaN)).toEqual(Value.check(Number.NaN));
    });

    test("groups adjacent union arms with the same type mask", () => {
        const Value = t.union(
            t.literal("a"),
            t.literal("b"),
            t.string.min(2),
            t.number
        );
        const FastValue = compile(Value, { name: "sameMaskAudit" });
        const predicateSource = readGeneratedFunctionSource(
            FastValue.source,
            "p0"
        );

        expect(predicateSource).not.toContain("const u0=v");
        expect(countOccurrences(predicateSource, "ut0===\"string\"")).toBe(1);
        expect(countOccurrences(predicateSource, "ut0===\"number\"")).toBe(1);
        expect(countOccurrences(predicateSource, "ub")).toBeGreaterThanOrEqual(4);
        expect(FastValue.is("a")).toBe(true);
        expect(FastValue.is("b")).toBe(true);
        expect(FastValue.is("cc")).toBe(true);
        expect(FastValue.is("c")).toBe(false);
        expect(FastValue.is(1)).toBe(true);
        expect(FastValue.is(Number.NaN)).toBe(false);
        expect(FastValue.check("c")).toEqual(Value.check("c"));
    });

    test("emits literal equality without Object.is except numeric edge cases", () => {
        const Text = t.union(
            t.literal("a"),
            t.literal("b"),
            t.string.min(2)
        );
        const NumericEdges = t.union(
            t.literal(Number.NaN),
            t.literal(-0),
            t.literal(0)
        );
        const FastText = compile(Text, { name: "textLiteralAudit" });
        const FastNumericEdges = compile(NumericEdges, {
            name: "numericLiteralAudit"
        });
        const textSource = readGeneratedFunctionSource(FastText.source, "p0");
        const numericSource = readGeneratedFunctionSource(
            FastNumericEdges.source,
            "p0"
        );

        expect(textSource).toContain("v===l[");
        expect(textSource).not.toContain("Object.is(v");
        expect(numericSource).toContain("Number.isNaN(v)");
        expect(countOccurrences(numericSource, "Object.is(v")).toBe(2);
        expect(FastText.is("a")).toBe(true);
        expect(FastText.is("b")).toBe(true);
        expect(FastText.is("cc")).toBe(true);
        expect(FastText.is("c")).toBe(false);
        expect(FastNumericEdges.is(Number.NaN)).toBe(true);
        expect(FastNumericEdges.is(-0)).toBe(true);
        expect(FastNumericEdges.is(0)).toBe(true);
        expect(FastNumericEdges.is(1)).toBe(false);
        expect(FastNumericEdges.check(1)).toEqual(NumericEdges.check(1));
    });

    test("inlines primitive unions inside record loops", () => {
        const Row = t.record(t.union(
            t.string.min(1),
            t.number.int(),
            t.boolean
        ));
        const FastRow = compile(Row, { name: "primitiveRecordAudit" });
        const predicateSource = readGeneratedFunctionSource(
            FastRow.source,
            "p0"
        );
        const checkSource = readGeneratedFunctionSource(
            FastRow.source,
            "c0"
        );

        expect(predicateSource).toContain("break us");
        expect(predicateSource).toContain("ut");
        expect(predicateSource).toContain("Number.isInteger");
        expect(predicateSource).toContain("for(const key");
        expect(predicateSource).toContain("if(!h.call(");
        expect(predicateSource).not.toMatch(/const u\d+=v\d+;/u);
        expect(predicateSource).not.toContain("if((ut");
        expect(predicateSource).not.toContain("Object.keys");
        expect(predicateSource).not.toMatch(/p\d+\(v\d+\)/u);
        expect(checkSource).toContain("Number.isInteger(rv)");
        expect(checkSource).toContain("Number.isFinite(rv)");
        expect(checkSource).toContain("q1(s,p,key,\"expected_union\"");
        expect(checkSource).not.toContain("p.push(key);");
        expect(checkSource).not.toContain("c1(");
        expect(FastRow.is({
            name: "Ada",
            age: 37,
            active: true
        })).toBe(true);
        expect(FastRow.is(Object.create({ inherited: 1 }))).toBe(true);
        expect(FastRow.is({ empty: "" })).toBe(false);
        expect(FastRow.is({ bad: 1.5 })).toBe(false);
        expect(FastRow.check({ bad: 1.5 })).toEqual(Row.check({ bad: 1.5 }));
    });

    test("inlines primitive unions inside unsafe object record diagnostics", () => {
        const User = t.strictObject({
            meta: t.record(t.union(
                t.string.min(1),
                t.number.int(),
                t.boolean
            ))
        });
        const FastUser = compile(User, {
            name: "unsafeObjectRecordUnionAudit",
            mode: "unsafe"
        });
        const checkSource = readGeneratedFunctionSource(FastUser.source, "c0");

        expect(checkSource).toContain("const v0=v.meta;");
        expect(checkSource).toContain("for(const key in v0)");
        expect(checkSource).toContain("const rv=v0[key];");
        expect(checkSource).toContain("q2(s,p,\"meta\",key,\"expected_union\"");
        expect(checkSource).not.toContain("p.push(\"meta\");");
        expect(checkSource).not.toContain("p.push(key);");
        expect(checkSource).not.toContain("c1(");
        expect(FastUser.check({
            meta: {
                score: 1.5
            }
        }).ok).toBe(false);
    });
});

/**
 * @brief Read stable generated source fingerprint.
 * @details The fingerprint is intentionally exact: if codegen shape changes,
 * the source audit should force a deliberate review before benchmark baselines
 * are refreshed.
 */
function readSourceFingerprint(source: string): {
    readonly length: number;
    readonly sha256: string;
} {
    return {
        length: source.length,
        sha256: createHash("sha256").update(source).digest("hex")
    };
}

/**
 * @brief Read generated function source.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function readGeneratedFunctionSource(
    source: string,
    name: string
): string {
    const actualName = name === "p0"
        ? readIsFunctionName(source) ?? name
        : name;
    const start = source.indexOf(`function ${actualName}`);
    expect(start).toBeGreaterThanOrEqual(0);
    const bodyStart = source.indexOf("{", start);
    expect(bodyStart).toBeGreaterThanOrEqual(start);
    let depth = 0;
    for (let index = bodyStart; index < source.length; index += 1) {
        const char = source[index];
        if (char === "{") {
            depth += 1;
        } else if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                return source.slice(start, index + 1);
            }
        }
    }
    return source.slice(start);
}

/**
 * @brief Read is function name.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function readIsFunctionName(source: string): string | null {
    const direct = /return \{is:([A-Za-z_$][\w$]*)[,}]/u.exec(source);
    if (direct?.[1] !== undefined) {
        return direct[1];
    }
    const wrapped = /return \{is:function ([^(]+)\(/u.exec(source);
    return wrapped?.[1] ?? null;
}

/**
 * @brief Execute count occurrences.
 * @details Test helpers pin observable behavior so engine rewrites keep the same external result.
 */
function countOccurrences(source: string, pattern: string): number {
    let count = 0;
    let offset = 0;
    for (;;) {
        const index = source.indexOf(pattern, offset);
        if (index < 0) {
            return count;
        }
        count += 1;
        offset = index + pattern.length;
    }
}
