/**
 * @file from.ts
 * @brief JSON Schema import helpers.
 * @details The importer accepts the portable subset TypeSea can represent
 * without weakening validation semantics.
 */

import {
    array,
    intersect,
    tuple,
    union,
    xor
} from "../builders/composite.js";
import { lazy } from "../builders/modifier.js";
import {
    object,
    patternPropertiesObject,
    propertyCountObject,
    propertyNamesObject,
    strictObject
} from "../builders/object/index.js";
import {
    booleanGuard,
    email,
    ipv4,
    ipv6,
    isoDate,
    isoDateTime,
    ksuid,
    literal,
    neverGuard,
    nullGuard,
    numberGuard,
    stringGuard,
    unknownGuard,
    url,
    uuid,
    xid
} from "../builders/scalar.js";
import type { Guard, Presence } from "../guard/index.js";
import type { PathSegment } from "../issue/index.js";
import { err, ok, type Result } from "../result/index.js";
import type {
    JsonSchema,
    JsonSchemaImportIssue,
    JsonSchemaObject,
    JsonSchemaPrimitive,
    JsonSchemaTypeName
} from "./types.js";

type ImportedGuard = Guard<unknown, Presence>;

const EMPTY_PATH: readonly PathSegment[] = Object.freeze([]);
const EMPTY_PROPERTIES: Readonly<Record<string, JsonSchema>> = Object.freeze({});
const EMPTY_STRING_KEYS: readonly string[] = Object.freeze([]);
const REF_ANNOTATION_KEYS = Object.freeze([
    "$ref",
    "$schema",
    "$id",
    "$defs",
    "definitions",
    "title",
    "description",
    "examples"
] as const);
const PATTERN_SCAN_INVALID = -2;
const PATTERN_SCAN_NONE = -1;
const GROUP_NORMAL = 0;
const GROUP_LOOKBEHIND = 1;

interface ImportContext {
    readonly root: unknown;
    readonly cache: Map<string, ImportedGuard>;
    readonly resolving: Set<string>;
}

interface ArrayBoundGuard extends ImportedGuard {
    min(value: number): ArrayBoundGuard;
    max(value: number): ArrayBoundGuard;
}

interface ImportedPatternProperty {
    readonly source: string;
    readonly regex: RegExp;
    readonly guard: ImportedGuard;
}

/**
 * @brief Import a JSON Schema fragment as a TypeSea guard.
 * @param schema JSON Schema fragment supplied by the caller.
 * @returns Result carrying a guard or structured import issues.
 */
export function fromJsonSchema(
    schema: unknown
): Result<ImportedGuard, readonly JsonSchemaImportIssue[]> {
    const issues: JsonSchemaImportIssue[] = [];
    const context: ImportContext = {
        root: schema,
        cache: new Map<string, ImportedGuard>(),
        resolving: new Set<string>(["#"])
    };
    const guard = readSchema(schema, EMPTY_PATH, issues, context);
    if (guard !== undefined) {
        context.cache.set("#", guard);
    }
    if (guard === undefined || issues.length !== 0) {
        return err(freezeJsonSchemaImportIssues(issues));
    }
    return ok(guard);
}

export const fromJSONSchema = fromJsonSchema;

/**
 * @brief Recursively import one JSON Schema fragment.
 */
function readSchema(
    schema: unknown,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[],
    context: ImportContext
): ImportedGuard | undefined {
    if (schema === true) {
        return unknownGuard;
    }
    if (schema === false) {
        return neverGuard;
    }
    if (!isRecord(schema)) {
        pushImportIssue(path, issues, "invalid_schema", "JSON Schema node must be boolean or object");
        return undefined;
    }
    const object = schema as JsonSchemaObject;
    if (hasOwnDataProperty(object, "$ref")) {
        return readReferenceSchema(object, path, issues, context);
    }
    collectUnsupportedKeywords(object, path, issues);
    if (hasOwnDataProperty(object, "const")) {
        return readConstSchema(object, path, issues);
    }
    if (object.enum !== undefined) {
        return readEnumSchema(object.enum, path.concat("enum"), issues);
    }
    const combinator = readCombinatorSchema(object, path, issues, context);
    if (combinator !== undefined) {
        return combinator;
    }
    const type = object.type;
    if (Array.isArray(type)) {
        return readTypeUnion(object, type, path, issues, context);
    }
    if (typeof type === "string") {
        return readTypedSchema(object, type, path, issues, context);
    }
    if (type !== undefined) {
        pushImportIssue(path.concat("type"), issues, "unsupported_type", "type must be a string or string array");
        return undefined;
    }
    return readInferredSchema(object, path, issues, context);
}

/**
 * @brief Import a `const` schema.
 */
function readConstSchema(
    schema: JsonSchemaObject,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[]
): ImportedGuard | undefined {
    const value = schema.const;
    if (!isJsonSchemaPrimitive(value)) {
        pushImportIssue(path.concat("const"), issues, "invalid_schema", "const must be a JSON primitive");
        return undefined;
    }
    return literal(value);
}

/**
 * @brief Import an internal JSON Schema reference.
 */
function readReferenceSchema(
    schema: JsonSchemaObject,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[],
    context: ImportContext
): ImportedGuard | undefined {
    const ref = readOwnDataProperty(schema, "$ref");
    if (typeof ref !== "string") {
        pushImportIssue(path.concat("$ref"), issues, "invalid_schema", "$ref must be a string");
        return undefined;
    }
    if (!collectReferenceSiblingIssues(schema, path, issues)) {
        return undefined;
    }
    return resolveReference(ref, path.concat("$ref"), issues, context);
}

/**
 * @brief Resolve one internal reference through the root schema.
 */
function resolveReference(
    ref: string,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[],
    context: ImportContext
): ImportedGuard | undefined {
    const cached = context.cache.get(ref);
    if (cached !== undefined) {
        return cached;
    }
    if (context.resolving.has(ref)) {
        return lazy((): ImportedGuard => context.cache.get(ref) ?? neverGuard);
    }
    const target = readJsonPointerTarget(context.root, ref, path, issues);
    if (target === undefined) {
        return undefined;
    }
    context.resolving.add(ref);
    const guard = readSchema(target, path, issues, context);
    context.resolving.delete(ref);
    if (guard !== undefined) {
        context.cache.set(ref, guard);
    }
    return guard;
}

/**
 * @brief Read an internal JSON pointer target.
 */
function readJsonPointerTarget(
    root: unknown,
    ref: string,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[]
): unknown {
    if (!ref.startsWith("#")) {
        pushImportIssue(path, issues, "unsupported_keyword", "only internal JSON Schema refs are supported");
        return undefined;
    }
    if (ref === "#") {
        return root;
    }
    if (!ref.startsWith("#/")) {
        pushImportIssue(path, issues, "invalid_schema", "$ref must be an internal JSON pointer");
        return undefined;
    }
    const tokens = ref.slice(2).split("/");
    let current = root;
    for (let index = 0; index < tokens.length; index += 1) {
        const token = decodeJsonPointerToken(tokens[index] ?? "");
        current = readPointerProperty(current, token, path, issues);
        if (current === undefined) {
            return undefined;
        }
    }
    return current;
}

/**
 * @brief Decode one JSON pointer token.
 */
function decodeJsonPointerToken(token: string): string {
    let output = "";
    for (let index = 0; index < token.length; index += 1) {
        const code = token.charCodeAt(index);
        if (code === 126 && index + 1 < token.length) {
            const next = token.charCodeAt(index + 1);
            if (next === 48) {
                output += "~";
                index += 1;
                continue;
            }
            if (next === 49) {
                output += "/";
                index += 1;
                continue;
            }
        }
        output += token[index] ?? "";
    }
    return output;
}

/**
 * @brief Read one referenced object or array property.
 */
function readPointerProperty(
    value: unknown,
    key: string,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[]
): unknown {
    if (Array.isArray(value)) {
        const index = Number(key);
        if (!Number.isInteger(index) || index < 0 || index >= value.length) {
            pushImportIssue(path, issues, "invalid_schema", "$ref points outside the schema");
            return undefined;
        }
        return value[index];
    }
    if (!isRecord(value)) {
        pushImportIssue(path, issues, "invalid_schema", "$ref points outside the schema");
        return undefined;
    }
    const property = readOwnDataProperty(value, key);
    if (property === undefined) {
        pushImportIssue(path, issues, "invalid_schema", "$ref target does not exist");
        return undefined;
    }
    return property;
}

/**
 * @brief Reject unsupported sibling keywords next to `$ref`.
 */
function collectReferenceSiblingIssues(
    schema: JsonSchemaObject,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[]
): boolean {
    const keys = Object.keys(schema);
    let ok = true;
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key !== undefined && !isReferenceAnnotationKey(key)) {
            pushImportIssue(path.concat(key), issues, "unsupported_keyword", `${key} next to $ref is not supported`);
            ok = false;
        }
    }
    return ok;
}

/**
 * @brief Test one `$ref` sibling keyword.
 */
function isReferenceAnnotationKey(key: string): boolean {
    for (let index = 0; index < REF_ANNOTATION_KEYS.length; index += 1) {
        if (REF_ANNOTATION_KEYS[index] === key) {
            return true;
        }
    }
    return false;
}

/**
 * @brief Import an `enum` schema.
 */
function readEnumSchema(
    values: readonly JsonSchemaPrimitive[],
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[]
): ImportedGuard | undefined {
    if (!Array.isArray(values) || values.length === 0) {
        pushImportIssue(path, issues, "invalid_schema", "enum must be a non-empty array");
        return undefined;
    }
    const copied = new Array<JsonSchemaPrimitive>(values.length);
    for (let index = 0; index < values.length; index += 1) {
        const value: unknown = values[index];
        if (!isJsonSchemaPrimitive(value)) {
            pushImportIssue(path.concat(index), issues, "invalid_schema", "enum value must be a JSON primitive");
            return undefined;
        }
        copied[index] = value;
    }
    return literal(copied as unknown as readonly [
        JsonSchemaPrimitive,
        ...JsonSchemaPrimitive[]
    ]);
}

/**
 * @brief Import combinator keywords.
 */
function readCombinatorSchema(
    schema: JsonSchemaObject,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[],
    context: ImportContext
): ImportedGuard | undefined {
    if (schema.anyOf !== undefined) {
        return readGuardList(schema.anyOf, path.concat("anyOf"), issues, context, "union");
    }
    if (schema.oneOf !== undefined) {
        return readGuardList(schema.oneOf, path.concat("oneOf"), issues, context, "xor");
    }
    if (schema.allOf !== undefined) {
        return readAllOf(schema.allOf, path.concat("allOf"), issues, context);
    }
    if (schema.not !== undefined) {
        return readNotSchema(schema, path, issues);
    }
    return undefined;
}

/**
 * @brief Import the closed `not` subset emitted for draft-04 boolean schemas.
 */
function readNotSchema(
    schema: JsonSchemaObject,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[]
): ImportedGuard | undefined {
    if (!collectNotSiblingIssues(schema, path, issues)) {
        return undefined;
    }
    const negated = schema.not;
    if (negated === false) {
        return unknownGuard;
    }
    if (negated === true || isEmptyJsonSchemaObject(negated)) {
        return neverGuard;
    }
    pushImportIssue(path.concat("not"), issues, "unsupported_keyword", "only `not: {}` is supported");
    return undefined;
}

/**
 * @brief Reject validation siblings next to the importable `not` subset.
 */
function collectNotSiblingIssues(
    schema: JsonSchemaObject,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[]
): boolean {
    const keys = Object.keys(schema);
    let ok = true;
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key !== undefined && key !== "not" && !isReferenceAnnotationKey(key)) {
            pushImportIssue(path.concat(key), issues, "unsupported_keyword", `${key} next to not is not supported`);
            ok = false;
        }
    }
    return ok;
}

/**
 * @brief Test for the empty schema object.
 */
function isEmptyJsonSchemaObject(schema: JsonSchema | undefined): boolean {
    return isRecord(schema) && Object.keys(schema).length === 0;
}

/**
 * @brief Import `anyOf` and `oneOf` lists.
 */
function readGuardList(
    schemas: readonly JsonSchema[],
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[],
    context: ImportContext,
    mode: "union" | "xor"
): ImportedGuard | undefined {
    if (!Array.isArray(schemas) || schemas.length === 0) {
        return neverGuard;
    }
    const guards = readSchemaArray(schemas, path, issues, context);
    if (guards === undefined) {
        return undefined;
    }
    if (guards.length === 1) {
        return guards[0];
    }
    const input = guards as unknown as readonly [ImportedGuard, ...ImportedGuard[]];
    return mode === "union" ? union(...input) : xor(...input);
}

/**
 * @brief Import `allOf` as nested intersections.
 */
function readAllOf(
    schemas: readonly JsonSchema[],
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[],
    context: ImportContext
): ImportedGuard | undefined {
    if (!Array.isArray(schemas)) {
        pushImportIssue(path, issues, "invalid_schema", "allOf must be an array");
        return undefined;
    }
    if (schemas.length === 0) {
        return unknownGuard;
    }
    const guards = readSchemaArray(schemas, path, issues, context);
    if (guards === undefined) {
        return undefined;
    }
    let guard = guards[0];
    if (guard === undefined) {
        return undefined;
    }
    for (let index = 1; index < guards.length; index += 1) {
        const next = guards[index];
        if (next !== undefined) {
            guard = intersect(guard, next);
        }
    }
    return guard;
}

/**
 * @brief Import an array of child schema nodes.
 */
function readSchemaArray(
    schemas: readonly JsonSchema[],
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[],
    context: ImportContext
): ImportedGuard[] | undefined {
    const guards = new Array<ImportedGuard>(schemas.length);
    for (let index = 0; index < schemas.length; index += 1) {
        const child = readSchema(schemas[index], path.concat(index), issues, context);
        if (child === undefined) {
            return undefined;
        }
        guards[index] = child;
    }
    return guards;
}

/**
 * @brief Import `type: [...]`.
 */
function readTypeUnion(
    schema: JsonSchemaObject,
    types: readonly JsonSchemaTypeName[],
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[],
    context: ImportContext
): ImportedGuard | undefined {
    if (types.length === 0) {
        pushImportIssue(path.concat("type"), issues, "unsupported_empty_union", "type array must not be empty");
        return undefined;
    }
    const guards = new Array<ImportedGuard>(types.length);
    for (let index = 0; index < types.length; index += 1) {
        const type = types[index];
        const child = type === undefined
            ? undefined
            : readTypedSchema(schema, type, path.concat("type", index), issues, context);
        if (child === undefined) {
            return undefined;
        }
        guards[index] = child;
    }
    if (guards.length === 1) {
        return guards[0];
    }
    return union(...(guards as unknown as readonly [ImportedGuard, ...ImportedGuard[]]));
}

/**
 * @brief Import a schema with one concrete type keyword.
 */
function readTypedSchema(
    schema: JsonSchemaObject,
    type: JsonSchemaTypeName,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[],
    context: ImportContext
): ImportedGuard | undefined {
    switch (type) {
        case "null":
            return nullGuard;
        case "boolean":
            return booleanGuard;
        case "string":
            return readStringSchema(schema, path, issues);
        case "number":
            return readNumberSchema(schema, path, issues);
        case "integer":
            return readNumberSchema(schema, path, issues)?.int();
        case "array":
            return readArraySchema(schema, path, issues, context);
        case "object":
            return readObjectSchema(schema, path, issues, context);
    }
}

/**
 * @brief Import string constraints.
 */
function readStringSchema(
    schema: JsonSchemaObject,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[]
): ImportedGuard | undefined {
    let guard = stringFormatGuard(schema.format) ?? stringGuard;
    const pattern = schema.pattern === undefined
        ? undefined
        : readJsonSchemaPattern(schema.pattern, path.concat("pattern"), issues);
    if (schema.pattern !== undefined && pattern === undefined) {
        return undefined;
    }
    if (schema.minLength !== undefined) {
        guard = guard.min(schema.minLength);
    }
    if (schema.maxLength !== undefined) {
        guard = guard.max(schema.maxLength);
    }
    if (pattern !== undefined) {
        guard = guard.regex(pattern, "json_schema_pattern");
    }
    return guard;
}

/**
 * @brief Read one JSON Schema pattern as an unflagged ECMAScript RegExp.
 */
function readJsonSchemaPattern(
    value: unknown,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[]
): RegExp | undefined {
    if (typeof value !== "string") {
        pushImportIssue(path, issues, "invalid_schema", "pattern must be a string");
        return undefined;
    }
    if (!isJsonSchemaPatternSource(value)) {
        pushImportIssue(path, issues, "invalid_schema", "pattern must be a valid RegExp source");
        return undefined;
    }
    return new RegExp(value);
}

/**
 * @brief Scan a JSON Schema pattern before allocating a RegExp.
 * @param source Pattern source from the JSON Schema node.
 * @returns True when the source is accepted by the importer subset.
 * @details The scan covers structural failures that would otherwise escape the
 * Result-based import path: unterminated classes, broken groups, orphaned
 * repetition operators, and reversed literal character ranges.
 */
function isJsonSchemaPatternSource(source: string): boolean {
    const lookbehindStack: number[] = [];
    let index = 0;
    let atom = 0;
    while (index < source.length) {
        const code = source.charCodeAt(index);
        if (code === 92) {
            const next = readPatternEscape(source, index);
            if (next < 0) {
                return false;
            }
            atom = patternEscapeIsAssertion(source, index) ? 0 : 1;
            index = next;
            continue;
        }
        if (code === 91) {
            const next = readPatternCharacterClass(source, index);
            if (next < 0) {
                return false;
            }
            atom = 1;
            index = next;
            continue;
        }
        if (code === 40) {
            const next = readPatternGroupPrefix(source, index, lookbehindStack);
            if (next < 0) {
                return false;
            }
            atom = 0;
            index = next;
            continue;
        }
        if (code === 41) {
            const lookbehind = lookbehindStack.pop();
            if (lookbehind === undefined) {
                return false;
            }
            atom = lookbehind === GROUP_LOOKBEHIND ? 0 : 1;
            index += 1;
            continue;
        }
        if (code === 94 || code === 36) {
            atom = 0;
            index += 1;
            continue;
        }
        if (code === 124) {
            atom = 0;
            index += 1;
            continue;
        }
        if (code === 42 || code === 43) {
            if (atom !== 1) {
                return false;
            }
            atom = 2;
            index += 1;
            continue;
        }
        if (code === 63) {
            if (atom === 2) {
                atom = 3;
                index += 1;
                continue;
            }
            if (atom !== 1) {
                return false;
            }
            atom = 2;
            index += 1;
            continue;
        }
        if (code === 123) {
            const next = readPatternBraceQuantifier(source, index);
            if (next === PATTERN_SCAN_INVALID) {
                return false;
            }
            if (next !== PATTERN_SCAN_NONE) {
                if (atom !== 1) {
                    return false;
                }
                atom = 2;
                index = next;
                continue;
            }
        }
        atom = 1;
        index += 1;
    }
    return lookbehindStack.length === 0;
}

/**
 * @brief Read one escaped atom.
 */
function readPatternEscape(source: string, index: number): number {
    if (index + 1 >= source.length) {
        return PATTERN_SCAN_INVALID;
    }
    return index + 2;
}

/**
 * @brief Test whether an escaped token is a zero-width assertion.
 */
function patternEscapeIsAssertion(source: string, index: number): boolean {
    const next = source.charCodeAt(index + 1);
    return next === 98 || next === 66;
}

/**
 * @brief Read one character class.
 */
function readPatternCharacterClass(source: string, start: number): number {
    let index = start + 1;
    if (index < source.length && source.charCodeAt(index) === 94) {
        index += 1;
    }
    while (index < source.length) {
        if (source.charCodeAt(index) === 93) {
            return index + 1;
        }
        const first = readPatternClassEndpoint(source, index);
        if (first.next < 0) {
            return PATTERN_SCAN_INVALID;
        }
        index = first.next;
        if (index < source.length &&
            source.charCodeAt(index) === 45 &&
            index + 1 < source.length &&
            source.charCodeAt(index + 1) !== 93) {
            const second = readPatternClassEndpoint(source, index + 1);
            if (second.next < 0) {
                return PATTERN_SCAN_INVALID;
            }
            if (first.code !== undefined &&
                second.code !== undefined &&
                first.code > second.code) {
                return PATTERN_SCAN_INVALID;
            }
            index = second.next;
        }
    }
    return PATTERN_SCAN_INVALID;
}

/**
 * @brief Read a character class endpoint.
 */
function readPatternClassEndpoint(
    source: string,
    index: number
): { readonly next: number; readonly code: number | undefined } {
    const code = source.charCodeAt(index);
    if (code !== 92) {
        return {
            next: index + 1,
            code
        };
    }
    if (index + 1 >= source.length) {
        return {
            next: PATTERN_SCAN_INVALID,
            code: undefined
        };
    }
    const escaped = source.charCodeAt(index + 1);
    if (escaped === 120) {
        return readPatternHexEndpoint(source, index, 2, 4);
    }
    if (escaped === 117) {
        return readPatternHexEndpoint(source, index, 4, 6);
    }
    if (escaped === 99 && index + 2 < source.length) {
        const control = source.charCodeAt(index + 2);
        if (isAsciiLetter(control)) {
            return {
                next: index + 3,
                code: control & 31
            };
        }
    }
    if (isPatternClassEscape(escaped)) {
        return {
            next: index + 2,
            code: undefined
        };
    }
    return {
        next: index + 2,
        code: escaped
    };
}

/**
 * @brief Read one fixed-width hexadecimal escape endpoint.
 */
function readPatternHexEndpoint(
    source: string,
    start: number,
    digits: number,
    next: number
): { readonly next: number; readonly code: number | undefined } {
    if (start + next > source.length) {
        return {
            next: start + 2,
            code: undefined
        };
    }
    let value = 0;
    for (let offset = 0; offset < digits; offset += 1) {
        const digit = readHexDigit(source.charCodeAt(start + 2 + offset));
        if (digit < 0) {
            return {
                next: start + 2,
                code: undefined
            };
        }
        value = (value << 4) | digit;
    }
    return {
        next: start + next,
        code: value
    };
}

/**
 * @brief Convert one ASCII hexadecimal digit.
 */
function readHexDigit(code: number): number {
    if (code >= 48 && code <= 57) {
        return code - 48;
    }
    if (code >= 65 && code <= 70) {
        return code - 55;
    }
    if (code >= 97 && code <= 102) {
        return code - 87;
    }
    return PATTERN_SCAN_INVALID;
}

/**
 * @brief Test for character-class escapes without a single endpoint code.
 */
function isPatternClassEscape(code: number): boolean {
    return code === 100 ||
        code === 68 ||
        code === 115 ||
        code === 83 ||
        code === 119 ||
        code === 87 ||
        code === 112 ||
        code === 80;
}

/**
 * @brief Read a group prefix.
 */
function readPatternGroupPrefix(
    source: string,
    start: number,
    lookbehindStack: number[]
): number {
    if (start + 1 >= source.length || source.charCodeAt(start + 1) !== 63) {
        lookbehindStack.push(GROUP_NORMAL);
        return start + 1;
    }
    if (start + 2 >= source.length) {
        return PATTERN_SCAN_INVALID;
    }
    const marker = source.charCodeAt(start + 2);
    if (marker === 58 || marker === 61 || marker === 33) {
        lookbehindStack.push(GROUP_NORMAL);
        return start + 3;
    }
    if (marker === 60) {
        return readPatternAngleGroupPrefix(source, start, lookbehindStack);
    }
    return PATTERN_SCAN_INVALID;
}

/**
 * @brief Read a lookbehind or named capture group prefix.
 */
function readPatternAngleGroupPrefix(
    source: string,
    start: number,
    lookbehindStack: number[]
): number {
    if (start + 3 >= source.length) {
        return PATTERN_SCAN_INVALID;
    }
    const marker = source.charCodeAt(start + 3);
    if (marker === 61 || marker === 33) {
        lookbehindStack.push(GROUP_LOOKBEHIND);
        return start + 4;
    }
    let index = start + 3;
    if (!isIdentifierStart(source.charCodeAt(index))) {
        return PATTERN_SCAN_INVALID;
    }
    index += 1;
    while (index < source.length && source.charCodeAt(index) !== 62) {
        if (!isIdentifierContinue(source.charCodeAt(index))) {
            return PATTERN_SCAN_INVALID;
        }
        index += 1;
    }
    if (index >= source.length) {
        return PATTERN_SCAN_INVALID;
    }
    lookbehindStack.push(GROUP_NORMAL);
    return index + 1;
}

/**
 * @brief Read a brace quantifier.
 */
function readPatternBraceQuantifier(source: string, start: number): number {
    let index = start + 1;
    const minStart = index;
    while (index < source.length && isAsciiDigit(source.charCodeAt(index))) {
        index += 1;
    }
    if (index === minStart) {
        return PATTERN_SCAN_NONE;
    }
    const min = source.slice(minStart, index);
    if (index < source.length && source.charCodeAt(index) === 125) {
        return index + 1;
    }
    if (index >= source.length || source.charCodeAt(index) !== 44) {
        return PATTERN_SCAN_NONE;
    }
    index += 1;
    const maxStart = index;
    while (index < source.length && isAsciiDigit(source.charCodeAt(index))) {
        index += 1;
    }
    if (index >= source.length || source.charCodeAt(index) !== 125) {
        return PATTERN_SCAN_NONE;
    }
    if (index !== maxStart && comparePatternQuantifierBounds(min, source.slice(maxStart, index)) > 0) {
        return PATTERN_SCAN_INVALID;
    }
    return index + 1;
}

/**
 * @brief Compare two non-negative decimal quantifier bounds.
 */
function comparePatternQuantifierBounds(left: string, right: string): number {
    const normalizedLeft = trimLeadingZeroes(left);
    const normalizedRight = trimLeadingZeroes(right);
    if (normalizedLeft.length !== normalizedRight.length) {
        return normalizedLeft.length - normalizedRight.length;
    }
    if (normalizedLeft > normalizedRight) {
        return 1;
    }
    if (normalizedLeft < normalizedRight) {
        return -1;
    }
    return 0;
}

/**
 * @brief Trim decimal leading zeroes without returning an empty string.
 */
function trimLeadingZeroes(value: string): string {
    let index = 0;
    while (index + 1 < value.length && value.charCodeAt(index) === 48) {
        index += 1;
    }
    return value.slice(index);
}

/**
 * @brief Test for an ASCII decimal digit.
 */
function isAsciiDigit(code: number): boolean {
    return code >= 48 && code <= 57;
}

/**
 * @brief Test for an ASCII alphabetic code unit.
 */
function isAsciiLetter(code: number): boolean {
    return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

/**
 * @brief Test for an ASCII identifier start.
 */
function isIdentifierStart(code: number): boolean {
    return isAsciiLetter(code) || code === 95 || code === 36;
}

/**
 * @brief Test for an ASCII identifier continuation.
 */
function isIdentifierContinue(code: number): boolean {
    return isIdentifierStart(code) || isAsciiDigit(code);
}

/**
 * @brief Select a TypeSea string guard for one JSON Schema format.
 */
function stringFormatGuard(format: string | undefined): typeof stringGuard | undefined {
    switch (format) {
        case undefined:
            return undefined;
        case "uuid":
            return uuid();
        case "email":
            return email();
        case "uri":
            return url();
        case "date":
            return isoDate();
        case "date-time":
            return isoDateTime();
        case "xid":
            return xid();
        case "ksuid":
            return ksuid();
        case "ipv4":
            return ipv4();
        case "ipv6":
            return ipv6();
        default:
            return stringGuard;
    }
}

/**
 * @brief Import number constraints.
 */
function readNumberSchema(
    schema: JsonSchemaObject,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[]
): typeof numberGuard | undefined {
    const lowerGuard = applyMinimumSchema(numberGuard, schema, path, issues);
    if (lowerGuard === undefined) {
        return undefined;
    }
    let guard = applyMaximumSchema(lowerGuard, schema, path, issues);
    if (guard === undefined) {
        return undefined;
    }
    if (schema.multipleOf !== undefined) {
        guard = guard.multipleOf(schema.multipleOf);
    }
    return guard;
}

/**
 * @brief Import minimum and exclusiveMinimum from modern or draft-04 syntax.
 */
function applyMinimumSchema(
    guard: typeof numberGuard,
    schema: JsonSchemaObject,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[]
): typeof numberGuard | undefined {
    const exclusiveMinimum = schema.exclusiveMinimum;
    if (typeof exclusiveMinimum === "boolean") {
        if (schema.minimum === undefined) {
            pushImportIssue(path.concat("exclusiveMinimum"), issues, "invalid_schema", "boolean exclusiveMinimum requires minimum");
            return undefined;
        }
        return exclusiveMinimum ? guard.gt(schema.minimum) : guard.gte(schema.minimum);
    }
    let output = guard;
    if (schema.minimum !== undefined) {
        output = output.gte(schema.minimum);
    }
    if (exclusiveMinimum !== undefined) {
        output = output.gt(exclusiveMinimum);
    }
    return output;
}

/**
 * @brief Import maximum and exclusiveMaximum from modern or draft-04 syntax.
 */
function applyMaximumSchema(
    guard: typeof numberGuard,
    schema: JsonSchemaObject,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[]
): typeof numberGuard | undefined {
    const exclusiveMaximum = schema.exclusiveMaximum;
    if (typeof exclusiveMaximum === "boolean") {
        if (schema.maximum === undefined) {
            pushImportIssue(path.concat("exclusiveMaximum"), issues, "invalid_schema", "boolean exclusiveMaximum requires maximum");
            return undefined;
        }
        return exclusiveMaximum ? guard.lt(schema.maximum) : guard.lte(schema.maximum);
    }
    let output = guard;
    if (schema.maximum !== undefined) {
        output = output.lte(schema.maximum);
    }
    if (exclusiveMaximum !== undefined) {
        output = output.lt(exclusiveMaximum);
    }
    return output;
}

/**
 * @brief Import array and tuple schemas.
 */
function readArraySchema(
    schema: JsonSchemaObject,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[],
    context: ImportContext
): ImportedGuard | undefined {
    const tupleSchemas = readTupleSchemas(schema);
    if (tupleSchemas !== undefined) {
        return readTupleSchema(tupleSchemas, schema, path, issues, context);
    }
    const itemSchema = schema.items;
    const item = itemSchema === undefined
        ? unknownGuard
        : readSchema(itemSchema, path.concat("items"), issues, context);
    if (item === undefined) {
        return undefined;
    }
    return applyArrayBounds(array(item), schema);
}

/**
 * @brief Read fixed tuple child schemas from draft-07 or 2020-12 keywords.
 */
function readTupleSchemas(schema: JsonSchemaObject): readonly JsonSchema[] | undefined {
    if (schema.prefixItems !== undefined) {
        return schema.prefixItems;
    }
    return Array.isArray(schema.items) ? schema.items : undefined;
}

/**
 * @brief Import a tuple schema.
 */
function readTupleSchema(
    schemas: readonly JsonSchema[],
    schema: JsonSchemaObject,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[],
    context: ImportContext
): ImportedGuard | undefined {
    const tupleItems = readSchemaArray(
        schemas,
        schema.prefixItems !== undefined ? path.concat("prefixItems") : path.concat("items"),
        issues,
        context
    );
    if (tupleItems === undefined) {
        return undefined;
    }
    if (schema.additionalItems !== undefined && schema.additionalItems !== false) {
        const rest = readSchema(schema.additionalItems, path.concat("additionalItems"), issues, context);
        return rest === undefined ? undefined : tuple(tupleItems, rest);
    }
    return tuple(tupleItems);
}

/**
 * @brief Apply array length bounds when available.
 */
function applyArrayBounds(
    guard: ArrayBoundGuard,
    schema: JsonSchemaObject
): ImportedGuard {
    let result = guard;
    if (schema.minItems !== undefined) {
        result = result.min(schema.minItems);
    }
    if (schema.maxItems !== undefined) {
        result = result.max(schema.maxItems);
    }
    return result;
}

/**
 * @brief Import object, strict object, and record schemas.
 */
function readObjectSchema(
    schema: JsonSchemaObject,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[],
    context: ImportContext
): ImportedGuard | undefined {
    const propertyCount = readObjectPropertyCountBounds(schema, path, issues);
    if (propertyCount === undefined) {
        return undefined;
    }
    const propertyNames = readObjectPropertyNameSchema(schema, path, issues, context);
    if (schema.propertyNames !== undefined && propertyNames === undefined) {
        return undefined;
    }
    const patternProperties = readObjectPatternProperties(schema, path, issues, context);
    if (schema.patternProperties !== undefined && patternProperties === undefined) {
        return undefined;
    }
    const properties: Readonly<Record<string, JsonSchema>> =
        schema.properties ?? EMPTY_PROPERTIES;
    const required = readRequiredKeys(schema.required, path.concat("required"), issues);
    if (required === undefined) {
        return undefined;
    }
    const shape: Record<string, ImportedGuard> = Object.create(null) as Record<string, ImportedGuard>;
    const keys = Object.keys(properties);
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (key === undefined) {
            continue;
        }
        const child = readSchema(properties[key], path.concat("properties", key), issues, context);
        if (child === undefined) {
            return undefined;
        }
        shape[key] = required[key] === true ? child : child.optional();
    }
    const additional = schema.additionalProperties;
    if (patternProperties !== undefined && patternProperties.length !== 0) {
        const patternAdditional = readPatternAdditionalProperties(
            additional,
            path,
            issues,
            context
        );
        if (patternAdditional === undefined &&
            additional !== undefined &&
            additional !== false &&
            additional !== true) {
            return undefined;
        }
        return applyObjectPropertyRules(
            object(shape),
            propertyCount,
            propertyNames,
            patternProperties,
            keys,
            patternAdditional,
            additional !== false
        );
    }
    if (additional === false) {
        return applyObjectPropertyRules(strictObject(shape), propertyCount, propertyNames);
    }
    if (additional !== undefined && additional !== true) {
        const extra = readSchema(additional, path.concat("additionalProperties"), issues, context);
        if (extra === undefined) {
            return undefined;
        }
        return applyObjectPropertyRules(object(shape).catchall(extra), propertyCount, propertyNames);
    }
    return applyObjectPropertyRules(object(shape), propertyCount, propertyNames);
}

interface PropertyCountBounds {
    readonly min: number | undefined;
    readonly max: number | undefined;
}

/**
 * @brief Attach property-count bounds when the JSON Schema uses them.
 */
function applyObjectPropertyCount(
    guard: ImportedGuard,
    bounds: PropertyCountBounds
): ImportedGuard {
    if (bounds.min === undefined && bounds.max === undefined) {
        return guard;
    }
    return propertyCountObject(guard, bounds.min, bounds.max);
}

/**
 * @brief Attach object property-count and property-name rules.
 */
function applyObjectPropertyRules(
    guard: ImportedGuard,
    bounds: PropertyCountBounds,
    propertyNames: ImportedGuard | undefined,
    patternProperties?: readonly ImportedPatternProperty[],
    keys?: readonly string[],
    additional?: ImportedGuard,
    allowAdditional?: boolean
): ImportedGuard {
    const counted = applyObjectPropertyCount(guard, bounds);
    const named = propertyNames === undefined
        ? counted
        : propertyNamesObject(counted, propertyNames);
    if (patternProperties === undefined || patternProperties.length === 0) {
        return named;
    }
    return patternPropertiesObject(
        named,
        patternProperties,
        keys ?? EMPTY_STRING_KEYS,
        additional,
        allowAdditional ?? true
    );
}

/**
 * @brief Read a JSON Schema property-name rule.
 */
function readObjectPropertyNameSchema(
    schema: JsonSchemaObject,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[],
    context: ImportContext
): ImportedGuard | undefined {
    if (schema.propertyNames === undefined) {
        return undefined;
    }
    return readSchema(schema.propertyNames, path.concat("propertyNames"), issues, context);
}

/**
 * @brief Read JSON Schema pattern-property rules.
 */
function readObjectPatternProperties(
    schema: JsonSchemaObject,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[],
    context: ImportContext
): readonly ImportedPatternProperty[] | undefined {
    if (schema.patternProperties === undefined) {
        return undefined;
    }
    const table = schema.patternProperties;
    const tablePath = path.concat("patternProperties");
    if (!isRecord(table)) {
        pushImportIssue(tablePath, issues, "invalid_schema", "patternProperties must be an object");
        return undefined;
    }
    const keys = Object.keys(table);
    const entries = new Array<ImportedPatternProperty>(keys.length);
    for (let index = 0; index < keys.length; index += 1) {
        const source = keys[index];
        if (source === undefined) {
            return undefined;
        }
        const regex = readJsonSchemaPattern(source, tablePath.concat(source), issues);
        const guard = readSchema(table[source], tablePath.concat(source), issues, context);
        if (regex === undefined || guard === undefined) {
            return undefined;
        }
        entries[index] = {
            source,
            regex,
            guard
        };
    }
    return entries;
}

/**
 * @brief Read additionalProperties for a pattern-property wrapper.
 */
function readPatternAdditionalProperties(
    additional: JsonSchema | undefined,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[],
    context: ImportContext
): ImportedGuard | undefined {
    if (additional === undefined || additional === true || additional === false) {
        return undefined;
    }
    return readSchema(additional, path.concat("additionalProperties"), issues, context);
}

/**
 * @brief Read JSON Schema object property-count bounds.
 */
function readObjectPropertyCountBounds(
    schema: JsonSchemaObject,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[]
): PropertyCountBounds | undefined {
    const min = readPropertyCountBound(schema.minProperties, path.concat("minProperties"), issues);
    if (schema.minProperties !== undefined && min === undefined) {
        return undefined;
    }
    const max = readPropertyCountBound(schema.maxProperties, path.concat("maxProperties"), issues);
    if (schema.maxProperties !== undefined && max === undefined) {
        return undefined;
    }
    if (min !== undefined && max !== undefined && min > max) {
        pushImportIssue(path.concat("minProperties"), issues, "invalid_schema", "minProperties must be less than or equal to maxProperties");
        return undefined;
    }
    return {
        min,
        max
    };
}

/**
 * @brief Read one JSON Schema property-count bound.
 */
function readPropertyCountBound(
    value: unknown,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[]
): number | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
        pushImportIssue(path, issues, "invalid_schema", "property count must be a non-negative integer");
        return undefined;
    }
    return value;
}

/**
 * @brief Normalize required object keys.
 */
function readRequiredKeys(
    required: readonly string[] | undefined,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[]
): Readonly<Record<string, true>> | undefined {
    const lookup: Record<string, true> = Object.create(null) as Record<string, true>;
    if (required === undefined) {
        return Object.freeze(lookup);
    }
    if (!Array.isArray(required)) {
        pushImportIssue(path, issues, "invalid_schema", "required must be an array");
        return undefined;
    }
    for (let index = 0; index < required.length; index += 1) {
        const key: unknown = required[index];
        if (typeof key !== "string") {
            pushImportIssue(path.concat(index), issues, "invalid_schema", "required key must be a string");
            return undefined;
        }
        lookup[key] = true;
    }
    return Object.freeze(lookup);
}

/**
 * @brief Infer schema kind from structural keywords when type is omitted.
 */
function readInferredSchema(
    schema: JsonSchemaObject,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[],
    context: ImportContext
): ImportedGuard | undefined {
    if (schema.properties !== undefined ||
        schema.additionalProperties !== undefined ||
        schema.minProperties !== undefined ||
        schema.maxProperties !== undefined ||
        schema.propertyNames !== undefined ||
        schema.patternProperties !== undefined) {
        return readObjectSchema(schema, path, issues, context);
    }
    if (schema.items !== undefined || schema.prefixItems !== undefined) {
        return readArraySchema(schema, path, issues, context);
    }
    return unknownGuard;
}

/**
 * @brief Reject keywords TypeSea does not import yet.
 */
function collectUnsupportedKeywords(
    schema: object,
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[]
): void {
    const unsupported = ["if", "then", "else"] as const;
    for (let index = 0; index < unsupported.length; index += 1) {
        const key = unsupported[index];
        if (key !== undefined && hasOwnDataProperty(schema, key)) {
            pushImportIssue(path.concat(key), issues, "unsupported_keyword", `${key} is not supported`);
        }
    }
}

/**
 * @brief Append one import issue.
 */
function pushImportIssue(
    path: readonly PathSegment[],
    issues: JsonSchemaImportIssue[],
    code: JsonSchemaImportIssue["code"],
    message: string
): void {
    issues.push({
        path: Object.freeze(path.slice()),
        code,
        message
    });
}

/**
 * @brief Freeze import issues before publishing.
 */
function freezeJsonSchemaImportIssues(
    issues: readonly JsonSchemaImportIssue[]
): readonly JsonSchemaImportIssue[] {
    for (let index = 0; index < issues.length; index += 1) {
        const issue = issues[index];
        if (issue !== undefined) {
            Object.freeze(issue.path);
            Object.freeze(issue);
        }
    }
    return Object.freeze(issues);
}

/**
 * @brief Test one JSON primitive.
 */
function isJsonSchemaPrimitive(value: unknown): value is JsonSchemaPrimitive {
    return value === null ||
        typeof value === "string" ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value));
}

/**
 * @brief Test object-like schema records.
 */
function isRecord(value: unknown): value is Readonly<Record<PropertyKey, unknown>> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Test whether an own data property exists.
 */
function hasOwnDataProperty(value: object, key: PropertyKey): boolean {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined &&
        Object.prototype.hasOwnProperty.call(descriptor, "value");
}

/**
 * @brief Read one own data property without invoking accessors.
 */
function readOwnDataProperty(value: object, key: PropertyKey): unknown {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        return undefined;
    }
    return (descriptor as { readonly value: unknown }).value;
}
