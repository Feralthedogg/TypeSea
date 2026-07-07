import { describe, expect, test } from "vitest";
import {
    BaseDecoder,
    decode,
    encode,
    safeDecode,
    safeEncode,
    stringToDate,
    t,
    toJsonSchema,
    z,
    type Decoder,
    type JsonCodecValue
} from "../src/index.js";

describe("decoder transform, pipe, and coerce semantics", () => {
    test("decodes transformed values through explicit Result containers", () => {
        const Length = t.transform(t.string.min(1), (value) => value.length);
        const PositiveLength = Length.pipe(t.number.int().gte(2));
        const valid = Length.decode("sea");
        const short = PositiveLength.decode("a");
        const invalidSource = Length.decode("");

        expect(valid).toEqual({
            ok: true,
            value: 3
        });
        expect(Object.isFrozen(valid)).toBe(true);
        expect(short.ok).toBe(false);
        if (!short.ok) {
            expect(short.error[0]?.code).toBe("expected_gte");
            expect(Object.isFrozen(short.error)).toBe(true);
        }
        expect(invalidSource.ok).toBe(false);
        if (!invalidSource.ok) {
            expect(invalidSource.error[0]?.code).toBe("expected_min_length");
        }
    });

    test("supports Zod-style transform context and z.NEVER aborts", () => {
        const NumberText = z.string().transform((value, context) => {
            const parsed = Number(value);
            if (!Number.isFinite(parsed)) {
                context.addIssue({
                    path: ["count"],
                    message: "numeric text expected"
                });
                return z.NEVER;
            }
            return parsed;
        });
        const EmptyRejected = t.string.transform((value, context) => {
            if (value.length === 0) {
                context.addIssue("non-empty text expected");
            }
            return value.length;
        });
        const UppercaseOnly = t.string.transform((value, context) => {
            if (value !== value.toUpperCase()) {
                expect(context.issues.length).toBe(0);
                const count = context.issues.push({
                    path: ["name"],
                    message: "uppercase text expected",
                    input: value
                });
                expect(count).toBe(1);
            }
            return value;
        });
        const DefaultAbort = t.string.transform(() => z.NEVER);

        expect(NumberText.decode("42")).toEqual({
            ok: true,
            value: 42
        });
        const failedNumber = NumberText.decode("x");
        expect(failedNumber.ok).toBe(false);
        if (!failedNumber.ok) {
            expect(failedNumber.error[0]).toMatchObject({
                path: ["count"],
                code: "expected_refinement",
                expected: "transform",
                actual: "string",
                message: "numeric text expected"
            });
        }
        const failedEmpty = EmptyRejected.decode("");
        expect(failedEmpty.ok).toBe(false);
        if (!failedEmpty.ok) {
            expect(failedEmpty.error[0]?.message).toBe("non-empty text expected");
        }
        const failedUppercase = UppercaseOnly.decode("Ada");
        expect(failedUppercase.ok).toBe(false);
        if (!failedUppercase.ok) {
            expect(failedUppercase.error[0]).toMatchObject({
                path: ["name"],
                code: "expected_refinement",
                message: "uppercase text expected"
            });
        }
        const failedDefault = DefaultAbort.decode("sea");
        expect(failedDefault.ok).toBe(false);
        if (!failedDefault.ok) {
            expect(failedDefault.error[0]).toMatchObject({
                code: "expected_refinement",
                expected: "transform"
            });
        }
    });

    test("coerces primitive values through fluent decoder paths", () => {
        const Count = t.coerce.number().int().gte(0);
        const Flag = t.coerce.boolean();
        const Text = t.coerce.string().trim().min(1);
        const DateValue = t.coerce.date().min(new Date("2020-01-01T00:00:00.000Z"));
        const Big = t.coerce.bigint().gte(0n);
        const objectNumber = {
            valueOf(): number {
                return 9;
            }
        };
        const objectString = {
            toString(): string {
                return " object-name ";
            }
        };
        const objectBigInt = {
            valueOf(): number {
                return 9;
            }
        };
        const objectDateValue = {
            valueOf(): number {
                return Date.parse("2026-07-06T00:00:00.000Z");
            }
        };
        const hostileCoercion = {
            [Symbol.toPrimitive](): never {
                throw new Error("boom");
            }
        };

        expect(Count.decode(" 42 ")).toEqual({
            ok: true,
            value: 42
        });
        expect(Count.decode(7)).toEqual({
            ok: true,
            value: 7
        });
        expect(Count.decode(objectNumber)).toEqual({
            ok: true,
            value: 9
        });
        expect(Flag.decode("false")).toEqual({
            ok: true,
            value: true
        });
        expect(Flag.decode(0)).toEqual({
            ok: true,
            value: false
        });
        expect(Text.decode(true)).toEqual({
            ok: true,
            value: "true"
        });
        expect(Text.decode(Number.NaN)).toEqual({
            ok: true,
            value: "NaN"
        });
        expect(Text.decode(objectString)).toEqual({
            ok: true,
            value: "object-name"
        });
        expect(DateValue.decode("2026-07-06T00:00:00.000Z")).toEqual({
            ok: true,
            value: new Date("2026-07-06T00:00:00.000Z")
        });
        expect(DateValue.decode(objectDateValue)).toEqual({
            ok: true,
            value: new Date("2026-07-06T00:00:00.000Z")
        });
        expect(Big.decode(" 42 ")).toEqual({
            ok: true,
            value: 42n
        });
        expect(Big.decode(7)).toEqual({
            ok: true,
            value: 7n
        });
        expect(Big.decode(objectBigInt)).toEqual({
            ok: true,
            value: 9n
        });

        const emptyNumber = Count.decode("");
        const invalidNumber = Count.decode("x");
        const hostileNumber = Count.decode(hostileCoercion);
        const fractional = Count.decode("1.5");
        const blankText = Text.decode("   ");
        const hostileText = Text.decode(hostileCoercion);
        const invalidDate = DateValue.decode("not-a-date");
        const beforeMinDate = DateValue.decode("2019-12-31T00:00:00.000Z");
        const objectDate = DateValue.decode({
            valueOf(): number {
                return 0;
            }
        });
        const hostileDate = DateValue.decode(hostileCoercion);
        const unsafeInteger = Big.decode(Number.MAX_SAFE_INTEGER + 1);
        const decimalBigInt = Big.decode("1.5");
        const hostileBigInt = Big.decode(hostileCoercion);

        expect(emptyNumber).toEqual({
            ok: true,
            value: 0
        });
        expect(invalidNumber.ok).toBe(false);
        if (!invalidNumber.ok) {
            expect(invalidNumber.error[0]?.code).toBe("expected_number");
        }
        expect(hostileNumber.ok).toBe(false);
        if (!hostileNumber.ok) {
            expect(hostileNumber.error[0]?.code).toBe("expected_number");
        }
        expect(fractional.ok).toBe(false);
        if (!fractional.ok) {
            expect(fractional.error[0]?.code).toBe("expected_integer");
        }
        expect(blankText.ok).toBe(false);
        if (!blankText.ok) {
            expect(blankText.error[0]?.code).toBe("expected_min_length");
        }
        expect(hostileText.ok).toBe(false);
        if (!hostileText.ok) {
            expect(hostileText.error[0]?.code).toBe("expected_string");
        }
        expect(invalidDate.ok).toBe(false);
        if (!invalidDate.ok) {
            expect(invalidDate.error[0]?.code).toBe("expected_date");
        }
        expect(beforeMinDate.ok).toBe(false);
        if (!beforeMinDate.ok) {
            expect(beforeMinDate.error[0]?.code).toBe("expected_gte");
        }
        expect(objectDate.ok).toBe(false);
        if (!objectDate.ok) {
            expect(objectDate.error[0]?.code).toBe("expected_gte");
        }
        expect(hostileDate.ok).toBe(false);
        if (!hostileDate.ok) {
            expect(hostileDate.error[0]?.code).toBe("expected_date");
        }
        expect(unsafeInteger).toEqual({
            ok: true,
            value: BigInt(Number.MAX_SAFE_INTEGER + 1)
        });
        expect(decimalBigInt.ok).toBe(false);
        if (!decimalBigInt.ok) {
            expect(decimalBigInt.error[0]?.code).toBe("expected_bigint");
        }
        expect(hostileBigInt.ok).toBe(false);
        if (!hostileBigInt.ok) {
            expect(hostileBigInt.error[0]?.code).toBe("expected_bigint");
        }
    });

    test("preprocesses raw input before validation", () => {
        const TrimmedId = t.preprocess(
            (value) => typeof value === "string" ? value.trim() : value,
            t.string.min(1)
        );
        const Count = t.preprocess(
            (value) => typeof value === "string" ? Number(value) : value,
            t.number.int().gte(0)
        );

        expect(TrimmedId.decode(" user_1 ")).toEqual({
            ok: true,
            value: "user_1"
        });
        expect(Count.decode("7")).toEqual({
            ok: true,
            value: 7
        });

        const empty = TrimmedId.decode("   ");
        const negative = Count.decode("-1");
        expect(empty.ok).toBe(false);
        if (!empty.ok) {
            expect(empty.error[0]?.code).toBe("expected_min_length");
        }
        expect(negative.ok).toBe(false);
        if (!negative.ok) {
            expect(negative.error[0]?.code).toBe("expected_gte");
        }
    });

    test("normalizes strings through decoder helpers", () => {
        const Normalized = t.string.normalize("NFC");
        const LowerNormalized = t.string
            .normalize("NFKC")
            .pipe(t.string.toLowerCase());
        const Slug = t.string.slugify();

        expect(Normalized.decode("e\u0301")).toEqual({
            ok: true,
            value: "\u00E9"
        });
        expect(LowerNormalized.decode("\uFF21BC")).toEqual({
            ok: true,
            value: "abc"
        });
        expect(Slug.decode("  Hello, TypeSea_URL  ")).toEqual({
            ok: true,
            value: "hello-typesea-url"
        });
        expect(() => t.string.normalize("BAD" as "NFC")).toThrow(TypeError);
    });

    test("decodes and encodes env-style boolean strings", () => {
        const Flag = t.stringbool();
        const CustomFlag = t.stringbool({
            truthy: ["aye", "yep"],
            falsy: ["nay", "nope"]
        });
        const SensitiveFlag = t.stringbool({
            truthy: ["YES"],
            falsy: ["NO"],
            case: "sensitive"
        });

        expect(Flag.decode("YES")).toEqual({
            ok: true,
            value: true
        });
        expect(Flag.decode(" disabled ")).toEqual({
            ok: true,
            value: false
        });
        expect(Flag.encode(true)).toEqual({
            ok: true,
            value: "true"
        });
        expect(Flag.encode(false)).toEqual({
            ok: true,
            value: "false"
        });
        expect(CustomFlag.decode("yep")).toEqual({
            ok: true,
            value: true
        });
        expect(CustomFlag.encode(false)).toEqual({
            ok: true,
            value: "nay"
        });
        expect(SensitiveFlag.decode("YES")).toEqual({
            ok: true,
            value: true
        });
        expect(SensitiveFlag.decode("yes").ok).toBe(false);
        expect(SensitiveFlag.encode(true)).toEqual({
            ok: true,
            value: "YES"
        });

        const invalid = Flag.decode("maybe");
        expect(invalid.ok).toBe(false);
        if (!invalid.ok) {
            expect(invalid.error[0]?.code).toBe("expected_boolean");
        }
        expect(() => t.stringbool({ truthy: ["yes"], falsy: ["YES"] }))
            .toThrow(TypeError);
        expect(() => t.stringbool({ case: "strict" as "sensitive" }))
            .toThrow(TypeError);
    });

    test("decodes object shapes that contain field decoders", () => {
        const User = t.object({
            id: t.string.min(1),
            createdAt: t.stringToDate(),
            count: t.coerce.number().pipe(t.number.int().gte(0)),
            role: t.default(t.string, "user"),
            nickname: t.optional(t.string)
        });

        const decoded = User.decode({
            id: "u_1",
            createdAt: "2026-07-06T00:00:00.000Z",
            count: "7",
            extra: true
        });

        expect(decoded).toEqual({
            ok: true,
            value: {
                id: "u_1",
                createdAt: new Date("2026-07-06T00:00:00.000Z"),
                count: 7,
                role: "user",
                extra: true
            }
        });
        expect("encode" in User).toBe(false);

        const invalid = User.decode({
            id: "",
            createdAt: "not-a-date",
            count: "1.5"
        });

        expect(invalid.ok).toBe(false);
        if (!invalid.ok) {
            expect(invalid.error.map((issue) => [issue.path, issue.code])).toEqual([
                [["id"], "expected_min_length"],
                [["createdAt"], "expected_date"],
                [["count"], "expected_integer"]
            ]);
        }
    });

    test("encodes object shapes when every transformed field is bidirectional", () => {
        const Event = t.strictObject({
            name: t.string.min(1),
            at: t.stringToDate(),
            active: t.stringbool()
        });

        const decoded = Event.decode({
            name: "launch",
            at: "2026-07-06T00:00:00.000Z",
            active: "true"
        });
        const encoded = Event.encode({
            name: "launch",
            at: new Date("2026-07-06T00:00:00.000Z"),
            active: false
        });
        const extra = Event.decode({
            name: "launch",
            at: "2026-07-06T00:00:00.000Z",
            active: "true",
            extra: 1
        });

        expect(decoded).toEqual({
            ok: true,
            value: {
                name: "launch",
                at: new Date("2026-07-06T00:00:00.000Z"),
                active: true
            }
        });
        expect(encoded).toEqual({
            ok: true,
            value: {
                name: "launch",
                at: "2026-07-06T00:00:00.000Z",
                active: "false"
            }
        });
        expect(extra.ok).toBe(false);
        if (!extra.ok) {
            expect(extra.error.map((issue) => [issue.path, issue.code])).toEqual([
                [["extra"], "unrecognized_key"]
            ]);
        }
    });

    test("decodes and encodes array and tuple containers with nested codecs", () => {
        const Dates = t.array(t.stringToDate());
        const Pair = t.tuple([t.stringToDate(), t.stringbool()] as const);
        const WithRest = t.tuple([t.string.min(1)] as const, t.stringToNumber());

        expect(Dates.decode([
            "2026-07-06T00:00:00.000Z",
            "2026-07-07T00:00:00.000Z"
        ])).toEqual({
            ok: true,
            value: [
                new Date("2026-07-06T00:00:00.000Z"),
                new Date("2026-07-07T00:00:00.000Z")
            ]
        });
        expect(Dates.encode([
            new Date("2026-07-06T00:00:00.000Z")
        ])).toEqual({
            ok: true,
            value: ["2026-07-06T00:00:00.000Z"]
        });
        expect(Pair.decode([
            "2026-07-06T00:00:00.000Z",
            "false"
        ])).toEqual({
            ok: true,
            value: [new Date("2026-07-06T00:00:00.000Z"), false]
        });
        expect(Pair.encode([
            new Date("2026-07-06T00:00:00.000Z"),
            true
        ])).toEqual({
            ok: true,
            value: ["2026-07-06T00:00:00.000Z", "true"]
        });
        expect(WithRest.decode(["count", "1", "2"])).toEqual({
            ok: true,
            value: ["count", 1, 2]
        });

        const invalid = Dates.decode(["not-a-date"]);
        const short = Pair.decode(["2026-07-06T00:00:00.000Z"]);

        expect(invalid.ok).toBe(false);
        if (!invalid.ok) {
            expect(invalid.error.map((issue) => [issue.path, issue.code])).toEqual([
                [[0], "expected_date"]
            ]);
        }
        expect(short.ok).toBe(false);
        if (!short.ok) {
            expect(short.error.map((issue) => [issue.path, issue.code])).toEqual([
                [[], "expected_tuple_length"]
            ]);
        }
    });

    test("decodes and encodes record, map, and set containers with nested codecs", () => {
        const DateRecord = t.record(t.stringToDate());
        const NamedDates = t.record(t.string.min(2), t.stringToDate());
        const RequiredDates = t.record(
            t.literal(["created", "updated"] as const),
            t.stringToDate()
        );
        const LooseDates = t.looseRecord(t.literal(["created"] as const), t.stringToDate());
        const DateMap = t.map(t.stringbool(), t.stringToDate());
        const DateSet = t.set(t.stringToDate());

        expect(DateRecord.decode({
            created: "2026-07-06T00:00:00.000Z"
        })).toEqual({
            ok: true,
            value: {
                created: new Date("2026-07-06T00:00:00.000Z")
            }
        });
        expect(DateRecord.encode({
            created: new Date("2026-07-06T00:00:00.000Z")
        })).toEqual({
            ok: true,
            value: {
                created: "2026-07-06T00:00:00.000Z"
            }
        });
        expect(LooseDates.decode({
            created: "2026-07-06T00:00:00.000Z",
            untouched: "raw"
        })).toEqual({
            ok: true,
            value: {
                created: new Date("2026-07-06T00:00:00.000Z"),
                untouched: "raw"
            }
        });
        expect(RequiredDates.decode({
            created: "2026-07-06T00:00:00.000Z",
            updated: "2026-07-07T00:00:00.000Z"
        })).toEqual({
            ok: true,
            value: {
                created: new Date("2026-07-06T00:00:00.000Z"),
                updated: new Date("2026-07-07T00:00:00.000Z")
            }
        });
        expect(DateMap.decode(new Map([
            ["true", "2026-07-06T00:00:00.000Z"]
        ]))).toEqual({
            ok: true,
            value: new Map([[true, new Date("2026-07-06T00:00:00.000Z")]])
        });
        expect(DateMap.encode(new Map([
            [false, new Date("2026-07-06T00:00:00.000Z")]
        ]))).toEqual({
            ok: true,
            value: new Map([["false", "2026-07-06T00:00:00.000Z"]])
        });
        expect(DateSet.decode(new Set([
            "2026-07-06T00:00:00.000Z"
        ]))).toEqual({
            ok: true,
            value: new Set([new Date("2026-07-06T00:00:00.000Z")])
        });

        const invalidRecord = NamedDates.decode({
            x: "2026-07-06T00:00:00.000Z",
            ok: "not-a-date"
        });
        const missingRequiredRecord = RequiredDates.decode({
            created: "2026-07-06T00:00:00.000Z"
        });
        const invalidMap = DateMap.decode(new Map([
            ["maybe", "not-a-date"]
        ]));
        const invalidSet = DateSet.decode(new Set(["not-a-date"]));

        expect(invalidRecord.ok).toBe(false);
        if (!invalidRecord.ok) {
            expect(invalidRecord.error.map((issue) => [issue.path, issue.code])).toEqual([
                [["x"], "expected_min_length"],
                [["ok"], "expected_date"]
            ]);
        }
        expect(missingRequiredRecord.ok).toBe(false);
        if (!missingRequiredRecord.ok) {
            expect(missingRequiredRecord.error.map((issue) => [issue.path, issue.code])).toEqual([
                [["updated"], "expected_record"]
            ]);
        }
        expect(invalidMap.ok).toBe(false);
        if (!invalidMap.ok) {
            expect(invalidMap.error.map((issue) => [issue.path, issue.code])).toEqual([
                [[0, "key"], "expected_boolean"],
                [[0, "value"], "expected_date"]
            ]);
        }
        expect(invalidSet.ok).toBe(false);
        if (!invalidSet.ok) {
            expect(invalidSet.error.map((issue) => [issue.path, issue.code])).toEqual([
                [[0], "expected_date"]
            ]);
        }
    });

    test("decodes and encodes built-in scalar codecs", () => {
        const NumberText = t.codecs.stringToNumber();
        const IntegerText = t.codecs.stringToInt();
        const BigIntText = t.codecs.stringToBigInt();
        const BigIntNumber = t.codecs.numberToBigInt();
        const DateText = stringToDate();
        const IsoDateText = t.codecs.isoDatetimeToDate();
        const EpochSeconds = t.codecs.epochSecondsToDate();
        const EpochMillis = t.codecs.epochMillisToDate();
        const Utf8Bytes = t.codecs.utf8ToBytes();
        const BytesUtf8 = t.codecs.bytesToUtf8();
        const Base64Bytes = t.codecs.base64ToBytes();
        const Base64UrlBytes = t.codecs.base64urlToBytes();
        const HexBytes = t.codecs.hexToBytes();
        const JsonText = t.codecs.jsonCodec();
        const UrlText = t.codecs.stringToURL();
        const HttpUrlText = t.codecs.stringToHttpURL();

        expect(NumberText.decode(" 42.5 ")).toEqual({
            ok: true,
            value: 42.5
        });
        expect(NumberText.encode(42.5)).toEqual({
            ok: true,
            value: "42.5"
        });
        expect(IntegerText.decode(" 42 ")).toEqual({
            ok: true,
            value: 42
        });
        expect(IntegerText.decode("1.5").ok).toBe(false);
        expect(BigIntText.decode(" 9007199254740993 ")).toEqual({
            ok: true,
            value: 9007199254740993n
        });
        expect(BigIntText.encode(9007199254740993n)).toEqual({
            ok: true,
            value: "9007199254740993"
        });
        expect(BigIntNumber.decode(42)).toEqual({
            ok: true,
            value: 42n
        });
        expect(BigIntNumber.encode(42n)).toEqual({
            ok: true,
            value: 42
        });
        expect(DateText.decode("2026-07-06T00:00:00.000Z")).toEqual({
            ok: true,
            value: new Date("2026-07-06T00:00:00.000Z")
        });
        expect(DateText.encode(new Date("2026-07-06T00:00:00.000Z"))).toEqual({
            ok: true,
            value: "2026-07-06T00:00:00.000Z"
        });
        expect(IsoDateText.decode("2026-07-06T00:00:00Z")).toEqual({
            ok: true,
            value: new Date("2026-07-06T00:00:00.000Z")
        });
        expect(EpochSeconds.decode(1)).toEqual({
            ok: true,
            value: new Date("1970-01-01T00:00:01.000Z")
        });
        expect(EpochSeconds.encode(new Date("1970-01-01T00:00:01.000Z"))).toEqual({
            ok: true,
            value: 1
        });
        expect(EpochMillis.decode(1000)).toEqual({
            ok: true,
            value: new Date("1970-01-01T00:00:01.000Z")
        });

        const utf8 = Utf8Bytes.decode("sea");
        const base64 = Base64Bytes.decode("c2Vh");
        const base64url = Base64UrlBytes.decode("c2Vh");
        const hex = HexBytes.decode("736561");
        const url = UrlText.decode("mailto:ada@example.com");
        const http = HttpUrlText.decode("https://example.com/a");

        expect(utf8.ok && Array.from(utf8.value)).toEqual([115, 101, 97]);
        expect(BytesUtf8.decode(new Uint8Array([115, 101, 97]))).toEqual({
            ok: true,
            value: "sea"
        });
        expect(base64.ok && Array.from(base64.value)).toEqual([115, 101, 97]);
        expect(base64url.ok && Array.from(base64url.value)).toEqual([115, 101, 97]);
        expect(hex.ok && Array.from(hex.value)).toEqual([115, 101, 97]);
        expect(Base64Bytes.encode(new Uint8Array([115, 101, 97]))).toEqual({
            ok: true,
            value: "c2Vh"
        });
        expect(Base64UrlBytes.encode(new Uint8Array([251, 255]))).toEqual({
            ok: true,
            value: "-_8"
        });
        expect(HexBytes.encode(new Uint8Array([115, 101, 97]))).toEqual({
            ok: true,
            value: "736561"
        });
        expect(JsonText.decode("{\"name\":\"Ada\",\"tags\":[\"ts\",1,true,null]}")).toEqual({
            ok: true,
            value: {
                name: "Ada",
                tags: ["ts", 1, true, null]
            }
        });
        expect(JsonText.decode("\"\\uD83C\\uDF0A\"")).toEqual({
            ok: true,
            value: "\uD83C\uDF0A"
        });
        expect(JsonText.encode({
            name: "Ada",
            tags: ["ts", 1, true, null]
        })).toEqual({
            ok: true,
            value: "{\"name\":\"Ada\",\"tags\":[\"ts\",1,true,null]}"
        });
        expect(url.ok && url.value.href).toBe("mailto:ada@example.com");
        expect(http.ok && http.value.href).toBe("https://example.com/a");
        expect(HttpUrlText.decode("mailto:ada@example.com").ok).toBe(false);

        const emptyNumber = NumberText.decode("");
        const invalidNumberEncode = NumberText.encode(Number.NaN);
        const invalidBigInt = BigIntText.decode("1.5");
        const invalidBigIntEncode = BigIntNumber.encode(9007199254740993n);
        const invalidDate = DateText.decode("not-a-date");
        const invalidIsoDate = IsoDateText.decode("2026-07-06");
        const invalidDateEncode = DateText.encode(new Date(Number.NaN));
        const invalidBase64 = Base64Bytes.decode("abcde");
        const invalidHex = HexBytes.decode("abc");
        const invalidJson = JsonText.decode("{\"x\":}");
        const cyclic: unknown[] = [];
        cyclic.push(cyclic);
        const invalidCycle = JsonText.encode(cyclic as unknown as JsonCodecValue);
        const accessor = {};
        Object.defineProperty(accessor, "x", {
            enumerable: true,
            get: () => 1
        });
        const invalidAccessor = JsonText.encode(accessor);

        expect(emptyNumber.ok).toBe(false);
        if (!emptyNumber.ok) {
            expect(emptyNumber.error[0]?.code).toBe("expected_number");
        }
        expect(invalidNumberEncode.ok).toBe(false);
        if (!invalidNumberEncode.ok) {
            expect(invalidNumberEncode.error[0]?.code).toBe("expected_number");
        }
        expect(invalidBigInt.ok).toBe(false);
        if (!invalidBigInt.ok) {
            expect(invalidBigInt.error[0]?.code).toBe("expected_bigint");
        }
        expect(invalidBigIntEncode.ok).toBe(false);
        expect(invalidDate.ok).toBe(false);
        if (!invalidDate.ok) {
            expect(invalidDate.error[0]?.code).toBe("expected_date");
        }
        expect(invalidIsoDate.ok).toBe(false);
        expect(invalidDateEncode.ok).toBe(false);
        if (!invalidDateEncode.ok) {
            expect(invalidDateEncode.error[0]?.code).toBe("expected_date");
        }
        expect(invalidBase64.ok).toBe(false);
        expect(invalidHex.ok).toBe(false);
        expect(invalidJson.ok).toBe(false);
        expect(invalidCycle.ok).toBe(false);
        expect(invalidAccessor.ok).toBe(false);
    });

    test("exposes top-level decode and encode helpers", () => {
        const NumberText = t.codec(
            t.string.regex(/^\d+$/u, "digits"),
            t.number.int().nonnegative(),
            {
                decode: (value) => Number(value),
                encode: (value) => String(value)
            }
        );
        const TextNumber = t.invertCodec(NumberText);

        expect(decode(NumberText, "42")).toEqual({
            ok: true,
            value: 42
        });
        expect(decode(TextNumber, 42)).toEqual({
            ok: true,
            value: "42"
        });
        expect(safeDecode(t.string.min(1), "sea")).toEqual({
            ok: true,
            value: "sea"
        });
        expect(encode(NumberText, 42)).toEqual({
            ok: true,
            value: "42"
        });
        expect(safeEncode(NumberText, 7)).toEqual({
            ok: true,
            value: "7"
        });
        expect(encode(TextNumber, "7")).toEqual({
            ok: true,
            value: 7
        });

        const invalidDecode = decode(NumberText, "bad");
        const invalidEncode = encode(NumberText, -1);

        expect(invalidDecode.ok).toBe(false);
        if (!invalidDecode.ok) {
            expect(invalidDecode.error[0]?.code).toBe("expected_pattern");
        }
        expect(invalidEncode.ok).toBe(false);
        if (!invalidEncode.ok) {
            expect(invalidEncode.error[0]?.code).toBe("expected_gte");
        }
    });

    test("passes failed decode issues into fallback producers", () => {
        let observedFrozenContext = false;
        const SafePort = t.number.int().gte(0).catch((context) => {
            observedFrozenContext =
                Object.isFrozen(context) &&
                Object.isFrozen(context.error);
            return context.error.length;
        });
        const TopLevelName = t.catch(t.string.min(3), (context) =>
            context.error[0]?.code ?? "missing_issue");

        expect(SafePort.decode("bad")).toEqual({
            ok: true,
            value: 1
        });
        expect(TopLevelName.decode("x")).toEqual({
            ok: true,
            value: "expected_min_length"
        });
        expect(observedFrozenContext).toBe(true);
    });

    test("exposes stringbool through the frozen builder table", () => {
        expect(t.stringbool().decode("on")).toEqual({
            ok: true,
            value: true
        });
        expect(Object.isFrozen(t)).toBe(true);
    });

    test("rejects malformed decoder construction and receivers", () => {
        const NumberDecoder = t.coerce.number();
        const looseDecoder = t.decoder as unknown as (source: unknown) => Decoder<unknown>;
        const looseTransform = t.transform as unknown as (
            source: unknown,
            mapper: unknown
        ) => Decoder<unknown>;
        const looseInvertCodec = t.invertCodec as unknown as (
            source: unknown
        ) => Decoder<unknown>;
        expect(() => new BaseDecoder("not_fn" as unknown as (value: unknown) => never))
            .toThrow(TypeError);
        expect(() => looseDecoder({})).toThrow(TypeError);
        expect(() => looseTransform(t.string, "not_fn")).toThrow(TypeError);
        expect(() => looseTransform({}, (value: unknown) => value)).toThrow(TypeError);
        expect(() => looseInvertCodec({})).toThrow(TypeError);
        expect(() => NumberDecoder.decode.call({}, "1")).toThrow(TypeError);
        expect(() => NumberDecoder.transform.call({}, (value: number) => value))
            .toThrow(TypeError);
        expect(() => NumberDecoder.pipe.call({}, t.number)).toThrow(TypeError);
    });

    test("rejects decoder JSON Schema export without semantic loss", () => {
        const exported = toJsonSchema(t.coerce.number());

        expect(exported.ok).toBe(false);
        if (!exported.ok) {
            expect(exported.error[0]?.code).toBe("unsupported_decoder");
            expect(Object.isFrozen(exported.error)).toBe(true);
            expect(Object.isFrozen(exported.error[0]?.path)).toBe(true);
        }
    });
});
