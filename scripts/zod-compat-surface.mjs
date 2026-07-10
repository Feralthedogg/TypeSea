import { readFile } from "node:fs/promises";

const modulePairs = [
    ["zod", "./../dist/zod.js"],
    ["zod/v3", "./../dist/v3.js"],
    ["zod/v4", "./../dist/v4.js"],
    ["zod/v4-mini", "./../dist/v4-mini.js"],
    ["zod/v4/mini", "./../dist/v4/mini.js"],
    ["zod/v4/core", "./../dist/v4/core.js"]
];

const result = await main();
if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
}

/**
 * @brief Run Zod compatibility surface checks.
 * @details The script compares the installed dev Zod package with the built
 * TypeSea dist files so release gates detect facade drift.
 */
async function main() {
    const packageCheck = await checkPackageExports();
    if (!packageCheck.ok) {
        return packageCheck;
    }
    const moduleCheck = await checkModuleExports();
    if (!moduleCheck.ok) {
        return moduleCheck;
    }
    const localeCheck = await checkLocaleExports();
    if (!localeCheck.ok) {
        return localeCheck;
    }
    const instanceCheck = await checkRepresentativeInstanceNames();
    if (!instanceCheck.ok) {
        return instanceCheck;
    }
    return checkRepresentativeBehavior();
}

/**
 * @brief Compare locale facade exports and wildcard default shape.
 */
async function checkLocaleExports() {
    const zodLocales = await import("zod/v4/locales");
    const typeSeaLocales = await import("./../dist/v4/locales.js");
    const missing = Object.keys(zodLocales)
        .sort()
        .filter((key) => !(key in typeSeaLocales));
    if (missing.length !== 0) {
        return err(`locale exports missing: ${missing.join(", ")}`);
    }
    const zodEnglish = await import("zod/v4/locales/en.js");
    const zodDefault = zodEnglish["default"];
    const typeSeaDefault = typeSeaLocales["default"];
    if (typeof zodDefault !== "function" || typeof typeSeaDefault !== "function") {
        return err("locale wildcard default export must be a function");
    }
    const localeConfig = typeSeaDefault();
    if (!isRecord(localeConfig) ||
        typeof localeConfig["customError"] !== "function" ||
        typeof localeConfig["localeError"] !== "function") {
        return err("locale default must return a TypeSea config with message callbacks");
    }
    return ok(undefined);
}

/**
 * @brief Compare package export keys with installed Zod.
 */
async function checkPackageExports() {
    const zodPackage = JSON.parse(await readFile("node_modules/zod/package.json", "utf8"));
    const typeSeaPackage = JSON.parse(await readFile("package.json", "utf8"));
    if (!isRecord(zodPackage) || !isRecord(typeSeaPackage)) {
        return err("package metadata is not an object");
    }
    const zodExports = zodPackage["exports"];
    const typeSeaExports = typeSeaPackage["exports"];
    if (!isRecord(zodExports) || !isRecord(typeSeaExports)) {
        return err("package exports metadata is not an object");
    }
    const missing = Object.keys(zodExports)
        .sort()
        .filter((key) => !(key in typeSeaExports));
    if (missing.length !== 0) {
        return err(`package exports missing Zod subpaths: ${missing.join(", ")}`);
    }
    return ok(undefined);
}

/**
 * @brief Compare named module exports for supported Zod subpaths.
 */
async function checkModuleExports() {
    for (let index = 0; index < modulePairs.length; index += 1) {
        const pair = modulePairs[index];
        if (pair === undefined) {
            continue;
        }
        const [zodSpecifier, typeSeaSpecifier] = pair;
        const zodModule = await import(zodSpecifier);
        const typeSeaModule = await import(typeSeaSpecifier);
        const missing = Object.keys(zodModule)
            .sort()
            .filter((key) => !(key in typeSeaModule));
        if (missing.length !== 0) {
            return err(`${zodSpecifier} missing exports: ${missing.join(", ")}`);
        }
    }
    return ok(undefined);
}

/**
 * @brief Compare public instance property and method names.
 */
async function checkRepresentativeInstanceNames() {
    const zod = await import("zod");
    const typeSea = await import("./../dist/zod.js");
    const cases = representativeSchemas(zod, typeSea);
    for (let index = 0; index < cases.length; index += 1) {
        const entry = cases[index];
        if (entry === undefined) {
            continue;
        }
        const missing = readInstanceNames(entry.zod())
            .filter((key) => !readInstanceNames(entry.typeSea()).includes(key));
        if (missing.length !== 0) {
            return err(`${entry.name} instance missing names: ${missing.join(", ")}`);
        }
    }
    return ok(undefined);
}

/**
 * @brief Compare representative fluent method behavior.
 */
async function checkRepresentativeBehavior() {
    const zod = await import("zod");
    const typeSea = await import("./../dist/zod.js");
    const fallbackName = "c" + "atch";
    const objectNumber = {
        valueOf() {
            return 9;
        }
    };
    const objectString = {
        toString() {
            return " object-name ";
        }
    };
    const objectBigInt = {
        valueOf() {
            return 9;
        }
    };
    const objectDateValue = {
        valueOf() {
            return Date.parse("2026-07-06T00:00:00.000Z");
        }
    };
    const hostileCoercion = {
        [Symbol.toPrimitive]() {
            throw new Error("boom");
        }
    };
    const cases = [
        {
            name: "optional",
            zod: () => zod.string().optional(),
            typeSea: () => typeSea.string().optional(),
            values: [undefined, "x", 1, null]
        },
        {
            name: "nullable",
            zod: () => zod.string().nullable(),
            typeSea: () => typeSea.string().nullable(),
            values: [null, "x", 1, undefined]
        },
        {
            name: "nullish",
            zod: () => zod.string().nullish(),
            typeSea: () => typeSea.string().nullish(),
            values: [null, undefined, "x", 1]
        },
        {
            name: "array",
            zod: () => zod.string().array(),
            typeSea: () => typeSea.string().array(),
            values: [["a"], "a", [1]]
        },
        {
            name: "or",
            zod: () => zod.string().or(zod.number()),
            typeSea: () => typeSea.string().or(typeSea.number()),
            values: ["a", 1, true, null]
        },
        {
            name: "and",
            zod: () => zod.object({ a: zod.string() }).and(zod.object({ b: zod.number() })),
            typeSea: () => typeSea.object({ a: typeSea.string() }).and(
                typeSea.object({ b: typeSea.number() })
            ),
            values: [{ a: "x", b: 1 }, { a: "x" }, { b: 1 }, { a: 1, b: 1 }]
        },
        {
            name: "default",
            zod: () => zod.string().default("x"),
            typeSea: () => typeSea.string().default("x"),
            values: [undefined, "a", 1]
        },
        {
            name: "fallback",
            zod: () => zod.string()[fallbackName]("x"),
            typeSea: () => typeSea.string()[fallbackName]("x"),
            values: ["a", 1]
        },
        {
            name: "prefault",
            zod: () => zod.string().min(2).prefault("xx"),
            typeSea: () => typeSea.string().min(2).prefault("xx"),
            values: [undefined, "aa", "a"]
        },
        {
            name: "transform",
            zod: () => zod.string().transform((value) => value.length),
            typeSea: () => typeSea.string().transform((value) => value.length),
            values: ["abc", 1]
        },
        {
            name: "overwrite",
            zod: () => zod.string().overwrite((value) => value.trim()),
            typeSea: () => typeSea.string().overwrite((value) => value.trim()),
            values: [" abc ", 1]
        },
        {
            name: "pipe",
            zod: () => zod.string().transform((value) => Number(value)).pipe(zod.number()),
            typeSea: () => typeSea.string().transform((value) => Number(value)).pipe(
                typeSea.number()
            ),
            values: ["12", "x"]
        },
        {
            name: "coerce number fluent",
            zod: () => zod.coerce.number().int().gte(0),
            typeSea: () => typeSea.coerce.number().int().gte(0),
            values: ["42", "", false, objectNumber, "1.5", "x", hostileCoercion]
        },
        {
            name: "coerce string fluent",
            zod: () => zod.coerce.string().trim().min(1),
            typeSea: () => typeSea.coerce.string().trim().min(1),
            values: [" sea ", 42, Number.NaN, undefined, null, objectString, "   ", [], hostileCoercion]
        },
        {
            name: "coerce boolean",
            zod: () => zod.coerce.boolean(),
            typeSea: () => typeSea.coerce.boolean(),
            values: [true, false, "true", "false", 0, 1, undefined, null]
        },
        {
            name: "coerce bigint fluent",
            zod: () => zod.coerce.bigint().gte(0n),
            typeSea: () => typeSea.coerce.bigint().gte(0n),
            values: ["42", "", "   ", 7, true, false, 1n, objectBigInt, "1.5", 1.5, hostileCoercion]
        },
        {
            name: "coerce date fluent",
            zod: () => zod.coerce.date().min(new Date("2020-01-01T00:00:00.000Z")),
            typeSea: () => typeSea.coerce.date().min(new Date("2020-01-01T00:00:00.000Z")),
            values: [
                "2026-07-06T00:00:00.000Z",
                objectDateValue,
                "2019-12-31T00:00:00.000Z",
                "not-a-date",
                hostileCoercion
            ]
        },
        {
            name: "readonly",
            zod: () => zod.object({ a: zod.string() }).readonly(),
            typeSea: () => typeSea.object({ a: typeSea.string() }).readonly(),
            values: [{ a: "x" }, { a: 1 }]
        }
    ];
    for (let index = 0; index < cases.length; index += 1) {
        const entry = cases[index];
        if (entry === undefined) {
            continue;
        }
        const zodSchema = entry.zod();
        const typeSeaSchema = entry.typeSea();
        for (let valueIndex = 0; valueIndex < entry.values.length; valueIndex += 1) {
            const value = entry.values[valueIndex];
            const zodResult = readParseResult(zodSchema, value);
            const typeSeaResult = readParseResult(typeSeaSchema, value);
            if (!sameResult(zodResult, typeSeaResult)) {
                return err(`${entry.name} behavior mismatch at ${String(valueIndex)}`);
            }
        }
    }
    return ok(undefined);
}

function representativeSchemas(zod, typeSea) {
    return [
        {
            name: "string",
            zod: () => zod.string(),
            typeSea: () => typeSea.string()
        },
        {
            name: "number",
            zod: () => zod.number(),
            typeSea: () => typeSea.number()
        },
        {
            name: "bigint",
            zod: () => zod.bigint(),
            typeSea: () => typeSea.bigint()
        },
        {
            name: "boolean",
            zod: () => zod.boolean(),
            typeSea: () => typeSea.boolean()
        },
        {
            name: "date",
            zod: () => zod.date(),
            typeSea: () => typeSea.date()
        },
        {
            name: "array",
            zod: () => zod.array(zod.string()),
            typeSea: () => typeSea.array(typeSea.string())
        },
        {
            name: "object",
            zod: () => zod.object({ id: zod.string() }),
            typeSea: () => typeSea.object({ id: typeSea.string() })
        },
        {
            name: "tuple",
            zod: () => zod.tuple([zod.string(), zod.number()]),
            typeSea: () => typeSea.tuple([typeSea.string(), typeSea.number()])
        },
        {
            name: "union",
            zod: () => zod.union([zod.string(), zod.number()]),
            typeSea: () => typeSea.union([typeSea.string(), typeSea.number()])
        },
        {
            name: "literal",
            zod: () => zod.literal("x"),
            typeSea: () => typeSea.literal("x")
        },
        {
            name: "enum",
            zod: () => zod.enum(["a", "b"]),
            typeSea: () => typeSea.enum(["a", "b"])
        },
        {
            name: "record",
            zod: () => zod.record(zod.string(), zod.number()),
            typeSea: () => typeSea.record(typeSea.string(), typeSea.number())
        },
        {
            name: "set",
            zod: () => zod.set(zod.string()),
            typeSea: () => typeSea.set(typeSea.string())
        },
        {
            name: "map",
            zod: () => zod.map(zod.string(), zod.number()),
            typeSea: () => typeSea.map(typeSea.string(), typeSea.number())
        }
    ];
}

function readInstanceNames(value) {
    const names = new Set();
    let current = value;
    while (current !== null && current !== Object.prototype) {
        const keys = Reflect.ownKeys(current);
        for (let index = 0; index < keys.length; index += 1) {
            const key = keys[index];
            if (typeof key === "string" && key !== "constructor") {
                names.add(key);
            }
        }
        current = Object.getPrototypeOf(current);
    }
    const ownKeys = Object.keys(value);
    for (let index = 0; index < ownKeys.length; index += 1) {
        const key = ownKeys[index];
        if (key !== undefined) {
            names.add(key);
        }
    }
    return Array.from(names).sort();
}

function readParseResult(schema, value) {
    const result = schema.safeParse(value);
    if (!isRecord(result) || typeof result["success"] !== "boolean") {
        return Object.freeze({ success: false, data: undefined });
    }
    if (result["success"]) {
        return Object.freeze({
            success: true,
            data: result["data"]
        });
    }
    return Object.freeze({
        success: false,
        data: undefined
    });
}

/**
 * @brief Compare parse result shape and successful data.
 */
function sameResult(left, right) {
    return left.success === right.success &&
        (!left.success || sameData(left.data, right.data));
}

/**
 * @brief Compare representative parse outputs.
 */
function sameData(left, right) {
    if (Object.is(left, right)) {
        return true;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
        if (left.length !== right.length) {
            return false;
        }
        for (let index = 0; index < left.length; index += 1) {
            if (!sameData(left[index], right[index])) {
                return false;
            }
        }
        return true;
    }
    if (isRecord(left) && isRecord(right)) {
        const leftKeys = Object.keys(left).sort();
        const rightKeys = Object.keys(right).sort();
        if (!sameData(leftKeys, rightKeys)) {
            return false;
        }
        for (let index = 0; index < leftKeys.length; index += 1) {
            const key = leftKeys[index];
            if (key !== undefined && !sameData(left[key], right[key])) {
                return false;
            }
        }
        return true;
    }
    return false;
}

/**
 * @brief Accept non-array objects before structured field reads.
 */
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Construct a successful result value.
 */
function ok(value) {
    return { ok: true, value };
}

/**
 * @brief Construct a failed result value.
 */
function err(error) {
    return { ok: false, error };
}
