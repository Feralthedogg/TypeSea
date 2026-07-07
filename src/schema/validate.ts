/**
 * @file schema/validate.ts
 * @brief Runtime validators for direct schema objects.
 * @details Schema helpers enforce construction-time invariants before values reach
 * validation, compilation, or export.
 */

import {
    ArrayCheckTag,
    BigIntCheckTag,
    DateCheckTag,
    FileCheckTag,
    KeyRuleTag,
    NumberCheckTag,
    ObjectModeTag,
    PresenceTag,
    SchemaTag,
    StringCheckTag
} from "../kind/index.js";
import { isLiteralValue } from "./literal.js";
import {
    includesString,
    isMissingDataProperty,
    isObjectKeyLookup,
    isPlainRegExp,
    isRecord,
    isStringArray,
    isUnknownArray,
    readOwnDataProperty
} from "./common.js";
import type {
    ArrayCheck,
    BigIntCheck,
    DateCheck,
    FileCheck,
    LiteralValue,
    NumberCheck,
    PatternPropertyEntry,
    Schema,
    StringCheck
} from "./types.js";

/**
 * @brief Validate an unknown value as a TypeSea schema tree.
 * @param value Candidate schema object from a public boundary.
 * @returns True when the complete tree satisfies the internal schema layout.
 * @details This routine is intentionally stricter than normal JavaScript object
 * access: every record and vector must be data-only so later consumers can read
 * fields without invoking user code.
 */
export function isSchemaValue(value: unknown): value is Schema {
    return isSchemaValueInner(value, {
        validated: new WeakSet<object>(),
        visiting: new WeakSet<object>()
    });
}

/**
 * @brief Recursion bookkeeping for schema admission.
 * @details `visiting` rejects cycles while a branch is still being checked.
 * `validated` memoizes already accepted objects so shared schema subtrees do not
 * cost quadratic time.
 */
interface SchemaValidationState {
    readonly validated: WeakSet<object>;
    readonly visiting: WeakSet<object>;
}

/**
 * @brief Validate one schema node with cycle protection.
 * @details Schema helpers enforce construction-time invariants before values reach
 * validation, compilation, or export.
 * @param value Candidate node.
 * @param state Recursion state shared by the root validation pass.
 * @returns True when this node and its reachable children are well-formed.
 */
function isSchemaValueInner(
    value: unknown,
    state: SchemaValidationState
): value is Schema {
    if (!isRecord(value)) {
        return false;
    }
    if (state.validated.has(value)) {
        return true;
    }
    if (state.visiting.has(value)) {
        return false;
    }
    state.visiting.add(value);

    /*
     * The node is placed in `visiting` before child traversal so recursive
     * object graphs fail closed instead of creating an infinite walk.
     */
    const valid = isSchemaRecord(value, state);
    state.visiting.delete(value);
    if (valid) {
        state.validated.add(value);
    }
    return valid;
}

/**
 * @brief Dispatch validation by schema tag.
 * @param value Data-only record already accepted by isRecord.
 * @param state Recursion state for child schemas.
 * @returns True when the tag-specific payload is well-formed.
 * @details Tag and payload fields are read through readOwnDataProperty. This
 * preserves the rule that forged schema prototypes never participate in schema
 * admission.
 */
function isSchemaRecord(
    value: Readonly<Record<string, unknown>>,
    state: SchemaValidationState
): boolean {
    const tag = readOwnDataProperty(value, "tag");
    switch (tag) {
        case SchemaTag.Unknown:
        case SchemaTag.Never:
            return true;
        case SchemaTag.Symbol:
        case SchemaTag.Boolean:
            return isOptionalString(readOwnDataProperty(value, "message"));
        case SchemaTag.BigInt:
            return isOptionalString(readOwnDataProperty(value, "message")) &&
                isBigIntChecks(readOwnDataProperty(value, "checks"));
        case SchemaTag.Date:
            return isOptionalString(readOwnDataProperty(value, "message")) &&
                isDateChecks(readOwnDataProperty(value, "checks"));
        case SchemaTag.String:
            return isOptionalString(readOwnDataProperty(value, "message")) &&
                isStringChecks(readOwnDataProperty(value, "checks"));
        case SchemaTag.Number:
            return isOptionalString(readOwnDataProperty(value, "message")) &&
                isNumberChecks(readOwnDataProperty(value, "checks"));
        case SchemaTag.Literal: {
            const literal = readOwnDataProperty(value, "value");
            /*
             * `undefined` is a legal literal payload. The sentinel distinguishes
             * a missing `value` field from a stored undefined literal.
             */
            return !isMissingDataProperty(literal) && isLiteralValue(literal);
        }
        case SchemaTag.Array:
            return isSchemaValueInner(readOwnDataProperty(value, "item"), state) &&
                isArrayChecks(readOwnDataProperty(value, "checks"));
        case SchemaTag.Tuple:
            return isSchemaArray(readOwnDataProperty(value, "items"), state) &&
                isOptionalSchemaValue(readOwnDataProperty(value, "rest"), state);
        case SchemaTag.Record:
            return isOptionalSchemaValue(readOwnDataProperty(value, "key"), state) &&
                isSchemaValueInner(readOwnDataProperty(value, "value"), state) &&
                isOptionalStringArray(readOwnDataProperty(value, "requiredKeys")) &&
                typeof readOwnDataProperty(value, "loose") === "boolean";
        case SchemaTag.Map:
            return isSchemaValueInner(readOwnDataProperty(value, "key"), state) &&
                isSchemaValueInner(readOwnDataProperty(value, "value"), state) &&
                isArrayChecks(readOwnDataProperty(value, "checks"));
        case SchemaTag.Set:
            return isSchemaValueInner(readOwnDataProperty(value, "item"), state) &&
                isArrayChecks(readOwnDataProperty(value, "checks"));
        case SchemaTag.File:
            return isOptionalString(readOwnDataProperty(value, "message")) &&
                isFileChecks(readOwnDataProperty(value, "checks"));
        case SchemaTag.InstanceOf:
            return typeof readOwnDataProperty(value, "constructor") === "function" &&
                typeof readOwnDataProperty(value, "name") === "string";
        case SchemaTag.Property:
            return typeof readOwnDataProperty(value, "key") === "string" &&
                isSchemaValueInner(readOwnDataProperty(value, "base"), state) &&
                isSchemaValueInner(readOwnDataProperty(value, "value"), state);
        case SchemaTag.Object:
            return isObjectSchemaValue(value, state);
        case SchemaTag.Union:
        case SchemaTag.Xor:
            return isSchemaArray(readOwnDataProperty(value, "options"), state);
        case SchemaTag.Intersection:
            return isSchemaValueInner(readOwnDataProperty(value, "left"), state) &&
                isSchemaValueInner(readOwnDataProperty(value, "right"), state);
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
        case SchemaTag.Nullable:
            return isSchemaValueInner(readOwnDataProperty(value, "inner"), state);
        case SchemaTag.DiscriminatedUnion:
            return isDiscriminatedUnionSchemaValue(value, state);
        case SchemaTag.Brand:
            return typeof readOwnDataProperty(value, "brand") === "string" &&
                isSchemaValueInner(readOwnDataProperty(value, "inner"), state);
        case SchemaTag.Metadata:
            return isMetadataValue(readOwnDataProperty(value, "metadata")) &&
                isSchemaValueInner(readOwnDataProperty(value, "inner"), state);
        case SchemaTag.Message:
            return typeof readOwnDataProperty(value, "message") === "string" &&
                isSchemaValueInner(readOwnDataProperty(value, "inner"), state);
        case SchemaTag.Readonly:
            return isSchemaValueInner(readOwnDataProperty(value, "inner"), state);
        case SchemaTag.KeyedObject:
            return isStringArray(readOwnDataProperty(value, "keys")) &&
                isKeyRuleValue(readOwnDataProperty(value, "rule")) &&
                isSchemaValueInner(readOwnDataProperty(value, "inner"), state);
        case SchemaTag.PropertyCount:
            return isPropertyCountSchemaValue(value, state);
        case SchemaTag.PropertyNames:
            return isSchemaValueInner(readOwnDataProperty(value, "key"), state) &&
                isSchemaValueInner(readOwnDataProperty(value, "inner"), state);
        case SchemaTag.PatternProperties:
            return isPatternPropertiesSchemaValue(value, state);
        case SchemaTag.Lazy:
            return typeof readOwnDataProperty(value, "get") === "function" &&
                isOptionalFunction(readOwnDataProperty(value, "objectPresence"));
        case SchemaTag.Refine:
            return isOptionalRefinementCollector(readOwnDataProperty(value, "collect")) &&
                isOptionalPath(readOwnDataProperty(value, "path")) &&
                isOptionalString(readOwnDataProperty(value, "message")) &&
                isOptionalBoolean(readOwnDataProperty(value, "abort")) &&
                isOptionalFunction(readOwnDataProperty(value, "when")) &&
                typeof readOwnDataProperty(value, "name") === "string" &&
                typeof readOwnDataProperty(value, "predicate") === "function" &&
                isSchemaValueInner(readOwnDataProperty(value, "inner"), state);
        default:
            return false;
    }
}

/**
 * @brief Validate documentation metadata stored on a schema wrapper.
 * @param value Candidate metadata record.
 * @returns True when every known field has the expected immutable shape.
 */
function isMetadataValue(value: unknown): boolean {
    if (!isRecord(value)) {
        return false;
    }
    const id = readOwnDataProperty(value, "id");
    const title = readOwnDataProperty(value, "title");
    const description = readOwnDataProperty(value, "description");
    const examples = readOwnDataProperty(value, "examples");
    return isOptionalString(id) &&
        isOptionalString(title) &&
        isOptionalString(description) &&
        (examples === undefined || isUnknownArray(examples));
}

/**
 * @brief Validate an optional string field.
 */
function isOptionalString(value: unknown): boolean {
    return isMissingDataProperty(value) ||
        value === undefined ||
        typeof value === "string";
}

/**
 * @brief Validate an optional string-array field.
 */
function isOptionalStringArray(value: unknown): boolean {
    return isMissingDataProperty(value) ||
        value === undefined ||
        isStringArray(value);
}

/**
 * @brief Validate an optional boolean field.
 */
function isOptionalBoolean(value: unknown): boolean {
    return isMissingDataProperty(value) ||
        value === undefined ||
        typeof value === "boolean";
}

/**
 * @brief Validate an optional function field.
 */
function isOptionalFunction(value: unknown): boolean {
    return isMissingDataProperty(value) ||
        value === undefined ||
        typeof value === "function";
}

/**
 * @brief Validate an optional issue path field.
 */
function isOptionalPath(value: unknown): boolean {
    if (isMissingDataProperty(value) || value === undefined) {
        return true;
    }
    if (!isUnknownArray(value)) {
        return false;
    }
    for (let index = 0; index < value.length; index += 1) {
        const segment = value[index];
        if (typeof segment === "string") {
            continue;
        }
        if (typeof segment === "number" &&
            Number.isInteger(segment) &&
            segment >= 0) {
            continue;
        }
        return false;
    }
    return true;
}

/**
 * @brief Validate a keyed-object rule tag.
 */
function isKeyRuleValue(value: unknown): value is KeyRuleTag {
    return value === KeyRuleTag.AtLeastOne || value === KeyRuleTag.ExactlyOne;
}

/**
 * @brief Validate a property-count wrapper schema.
 */
function isPropertyCountSchemaValue(
    value: Readonly<Record<string, unknown>>,
    state: SchemaValidationState
): boolean {
    const min = readOwnDataProperty(value, "min");
    const max = readOwnDataProperty(value, "max");
    return isOptionalNonNegativeInteger(min) &&
        isOptionalNonNegativeInteger(max) &&
        (min === undefined || max === undefined || min <= max) &&
        isSchemaValueInner(readOwnDataProperty(value, "inner"), state);
}

/**
 * @brief Validate a pattern-properties wrapper schema.
 */
function isPatternPropertiesSchemaValue(
    value: Readonly<Record<string, unknown>>,
    state: SchemaValidationState
): boolean {
    const additional = readOwnDataProperty(value, "additional");
    const keys = readOwnDataProperty(value, "keys");
    return isPatternPropertyEntries(readOwnDataProperty(value, "entries"), state) &&
        isStringArray(keys) &&
        isObjectKeyLookup(readOwnDataProperty(value, "keyLookup"), keys) &&
        typeof readOwnDataProperty(value, "allowAdditional") === "boolean" &&
        (additional === undefined || isSchemaValueInner(additional, state)) &&
        isSchemaValueInner(readOwnDataProperty(value, "inner"), state);
}

/**
 * @brief Validate JSON Schema pattern-property entries.
 */
function isPatternPropertyEntries(
    value: unknown,
    state: SchemaValidationState
): value is readonly PatternPropertyEntry[] {
    if (!isUnknownArray(value)) {
        return false;
    }
    for (let index = 0; index < value.length; index += 1) {
        const entry = value[index];
        if (!isRecord(entry) ||
            typeof readOwnDataProperty(entry, "source") !== "string" ||
            !isPlainRegExp(readOwnDataProperty(entry, "regex")) ||
            !isSchemaValueInner(readOwnDataProperty(entry, "schema"), state)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Validate an optional object property-count bound.
 */
function isOptionalNonNegativeInteger(value: unknown): value is number | undefined {
    return value === undefined ||
        (typeof value === "number" && Number.isInteger(value) && value >= 0);
}

/**
 * @brief Validate an optional refinement diagnostic collector.
 * @param value Candidate collector slot.
 * @returns True when the slot is absent or callable.
 */
function isOptionalRefinementCollector(value: unknown): boolean {
    return isMissingDataProperty(value) ||
        value === undefined ||
        typeof value === "function";
}

/**
 * @brief Validate an optional schema payload.
 * @param value Candidate child schema or undefined.
 * @param state Recursion state for child schemas.
 * @returns True when the value is absent or a valid schema.
 */
function isOptionalSchemaValue(
    value: unknown,
    state: SchemaValidationState
): boolean {
    return value === undefined || isSchemaValueInner(value, state);
}

/**
 * @brief Validate the check vector attached to a string schema.
 * @param value Candidate check vector.
 * @returns True when every check is data-only and semantically usable.
 * @details Bounds are constrained at admission so interpreter and codegen do not
 * need to repeat defensive numeric checks in their hot paths.
 */
function isStringChecks(value: unknown): value is readonly StringCheck[] {
    if (!isUnknownArray(value)) {
        return false;
    }
    for (let index = 0; index < value.length; index += 1) {
        const check = value[index];
        if (!isRecord(check)) {
            return false;
        }
        if (!isOptionalString(readOwnDataProperty(check, "message"))) {
            return false;
        }
        switch (readOwnDataProperty(check, "tag")) {
            case StringCheckTag.Min:
            case StringCheckTag.Max: {
                const bound = readOwnDataProperty(check, "value");
                if (typeof bound !== "number" || !Number.isInteger(bound) || bound < 0) {
                    return false;
                }
                break;
            }
            case StringCheckTag.Regex:
                /*
                 * Regex checks carry executable engine state. Only a plain
                 * RegExp plus a stable diagnostic name can enter the schema.
                 */
                if (!isPlainRegExp(readOwnDataProperty(check, "regex")) ||
                    typeof readOwnDataProperty(check, "name") !== "string") {
                    return false;
                }
                break;
            case StringCheckTag.Uuid:
            case StringCheckTag.Email:
            case StringCheckTag.Url:
            case StringCheckTag.IsoDate:
            case StringCheckTag.IsoDateTime:
            case StringCheckTag.Ulid:
            case StringCheckTag.Xid:
            case StringCheckTag.Ksuid:
            case StringCheckTag.Ipv4:
            case StringCheckTag.Ipv6:
                break;
            default:
                return false;
        }
    }
    return true;
}

/**
 * @brief Validate the check vector attached to a number schema.
 * @details Schema helpers enforce construction-time invariants before values reach
 * validation, compilation, or export.
 * @param value Candidate check vector.
 * @returns True when all numeric bounds are finite and tag-compatible.
 */
function isNumberChecks(value: unknown): value is readonly NumberCheck[] {
    if (!isUnknownArray(value)) {
        return false;
    }
    for (let index = 0; index < value.length; index += 1) {
        const check = value[index];
        if (!isRecord(check)) {
            return false;
        }
        if (!isOptionalString(readOwnDataProperty(check, "message"))) {
            return false;
        }
        switch (readOwnDataProperty(check, "tag")) {
            case NumberCheckTag.Integer:
                break;
            case NumberCheckTag.Gte:
            case NumberCheckTag.Lte:
            case NumberCheckTag.Gt:
            case NumberCheckTag.Lt: {
                const bound = readOwnDataProperty(check, "value");
                if (typeof bound !== "number" || !Number.isFinite(bound)) {
                    return false;
                }
                break;
            }
            case NumberCheckTag.MultipleOf: {
                const divisor = readOwnDataProperty(check, "value");
                if (typeof divisor !== "number" ||
                    !Number.isFinite(divisor) ||
                    divisor <= 0) {
                    return false;
                }
                break;
            }
            default:
                return false;
        }
    }
    return true;
}

/**
 * @brief Validate the check vector attached to a bigint schema.
 */
function isBigIntChecks(value: unknown): value is readonly BigIntCheck[] {
    if (!isUnknownArray(value)) {
        return false;
    }
    for (let index = 0; index < value.length; index += 1) {
        const check = value[index];
        if (!isRecord(check)) {
            return false;
        }
        if (!isOptionalString(readOwnDataProperty(check, "message"))) {
            return false;
        }
        switch (readOwnDataProperty(check, "tag")) {
            case BigIntCheckTag.Gte:
            case BigIntCheckTag.Lte:
            case BigIntCheckTag.Gt:
            case BigIntCheckTag.Lt:
                if (typeof readOwnDataProperty(check, "value") !== "bigint") {
                    return false;
                }
                break;
            case BigIntCheckTag.MultipleOf:
                if (typeof readOwnDataProperty(check, "value") !== "bigint" ||
                    readOwnDataProperty(check, "value") === 0n) {
                    return false;
                }
                break;
            default:
                return false;
        }
    }
    return true;
}

/**
 * @brief Validate the check vector attached to a Date schema.
 * @param value Candidate check vector.
 * @returns True when every Date bound is finite epoch milliseconds.
 */
function isDateChecks(value: unknown): value is readonly DateCheck[] {
    if (!isUnknownArray(value)) {
        return false;
    }
    for (let index = 0; index < value.length; index += 1) {
        const check = value[index];
        if (!isRecord(check)) {
            return false;
        }
        if (!isOptionalString(readOwnDataProperty(check, "message"))) {
            return false;
        }
        switch (readOwnDataProperty(check, "tag")) {
            case DateCheckTag.Min:
            case DateCheckTag.Max: {
                const bound = readOwnDataProperty(check, "value");
                if (typeof bound !== "number" || !Number.isFinite(bound)) {
                    return false;
                }
                break;
            }
            default:
                return false;
        }
    }
    return true;
}

/**
 * @brief Validate the check vector attached to an array schema.
 * @param value Candidate check vector.
 * @returns True when every array length bound is a non-negative integer.
 * @details Array length checks are admitted once at schema construction so
 * interpreters and code generators can emit direct `length` comparisons later.
 */
function isArrayChecks(value: unknown): value is readonly ArrayCheck[] {
    if (!isUnknownArray(value)) {
        return false;
    }
    for (let index = 0; index < value.length; index += 1) {
        const check = value[index];
        if (!isRecord(check)) {
            return false;
        }
        if (!isOptionalString(readOwnDataProperty(check, "message"))) {
            return false;
        }
        switch (readOwnDataProperty(check, "tag")) {
            case ArrayCheckTag.Min:
            case ArrayCheckTag.Max: {
                const bound = readOwnDataProperty(check, "value");
                if (typeof bound !== "number" || !Number.isInteger(bound) || bound < 0) {
                    return false;
                }
                break;
            }
            default:
                return false;
        }
    }
    return true;
}

/**
 * @brief Validate the check vector attached to a File schema.
 * @param value Candidate check vector.
 * @returns True when every file-size and MIME check is structurally valid.
 */
function isFileChecks(value: unknown): value is readonly FileCheck[] {
    if (!isUnknownArray(value)) {
        return false;
    }
    for (let index = 0; index < value.length; index += 1) {
        const check = value[index];
        if (!isRecord(check)) {
            return false;
        }
        if (!isOptionalString(readOwnDataProperty(check, "message"))) {
            return false;
        }
        switch (readOwnDataProperty(check, "tag")) {
            case FileCheckTag.Min:
            case FileCheckTag.Max: {
                const bound = readOwnDataProperty(check, "value");
                if (typeof bound !== "number" || !Number.isInteger(bound) || bound < 0) {
                    return false;
                }
                break;
            }
            case FileCheckTag.Mime:
                if (!isMimeArray(readOwnDataProperty(check, "values"))) {
                    return false;
                }
                break;
            default:
                return false;
        }
    }
    return true;
}

/**
 * @brief Validate normalized MIME pattern arrays.
 * @param value Candidate value list.
 * @returns True when every entry is a unique non-empty string.
 */
function isMimeArray(value: unknown): value is readonly string[] {
    if (!isStringArray(value) || value.length === 0) {
        return false;
    }
    for (let index = 0; index < value.length; index += 1) {
        const item = value[index];
        if (item === undefined || item.length === 0 || hasLaterMime(value, item, index + 1)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Check whether a MIME pattern appears again after one index.
 */
function hasLaterMime(values: readonly string[], value: string, start: number): boolean {
    for (let index = start; index < values.length; index += 1) {
        if (Object.is(values[index], value)) {
            return true;
        }
    }
    return false;
}

/**
 * @brief Validate a dense vector of child schemas.
 * @details Schema helpers enforce construction-time invariants before values reach
 * validation, compilation, or export.
 * @param value Candidate schema vector.
 * @param state Recursion state shared with the parent node.
 * @returns True when every vector slot is a valid schema.
 */
function isSchemaArray(value: unknown, state: SchemaValidationState): boolean {
    if (!isUnknownArray(value)) {
        return false;
    }
    for (let index = 0; index < value.length; index += 1) {
        if (!isSchemaValueInner(value[index], state)) {
            return false;
        }
    }
    return true;
}

/**
 * @brief Validate object-schema payload invariants.
 * @param value Candidate object schema record.
 * @param state Recursion state for property schemas.
 * @returns True when entries, key order, lookup, and presence metadata agree.
 * @details Object validation depends on three redundant views: ordered entries
 * for stable codegen, ordered keys for strict key checks, and lookup for fast
 * membership. Admission rejects drift between those views.
 */
function isObjectSchemaValue(
    value: Readonly<Record<string, unknown>>,
    state: SchemaValidationState
): boolean {
    const mode = readOwnDataProperty(value, "mode");
    if (mode !== ObjectModeTag.Passthrough &&
        mode !== ObjectModeTag.Strict &&
        mode !== ObjectModeTag.Strip) {
        return false;
    }
    const entries = readOwnDataProperty(value, "entries");
    const keys = readOwnDataProperty(value, "keys");
    const keyLookup = readOwnDataProperty(value, "keyLookup");
    const catchall = readOwnDataProperty(value, "catchall");
    if (!isUnknownArray(entries) || !isStringArray(keys) ||
        !isObjectKeyLookup(keyLookup, keys) || entries.length !== keys.length) {
        return false;
    }
    if (catchall !== undefined && !isSchemaValueInner(catchall, state)) {
        return false;
    }
    const seen: string[] = [];
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (!isRecord(entry)) {
            return false;
        }
        const key = readOwnDataProperty(entry, "key");
        const presence = readOwnDataProperty(entry, "presence");
        const schema = readOwnDataProperty(entry, "schema");
        /*
         * The entry key must match the parallel `keys` slot. That keeps emitted
         * object code deterministic and prevents a lookup table from describing
         * a different shape than the property graph.
         */
        if (typeof key !== "string" ||
            key !== keys[index] ||
            includesString(seen, key) ||
            (presence !== PresenceTag.Required &&
                presence !== PresenceTag.Optional &&
                presence !== PresenceTag.Deferred) ||
            !isSchemaValueInner(schema, state)) {
            return false;
        }
        seen.push(key);
    }
    return true;
}

/**
 * @brief Validate discriminated-union dispatch metadata.
 * @param value Candidate discriminated union record.
 * @param state Recursion state for case schemas.
 * @returns True when each case owns a unique literal and proves the tag field.
 * @details The case schema must require the discriminant literal. Without that
 * proof, dispatch could choose a branch before the branch actually validates the
 * same discriminant field.
 */
function isDiscriminatedUnionSchemaValue(
    value: Readonly<Record<string, unknown>>,
    state: SchemaValidationState
): boolean {
    const cases = readOwnDataProperty(value, "cases");
    const key = readOwnDataProperty(value, "key");
    if (typeof key !== "string" || !isUnknownArray(cases) || cases.length === 0) {
        return false;
    }
    const literals: LiteralValue[] = [];
    for (let index = 0; index < cases.length; index += 1) {
        const unionCase = cases[index];
        if (!isRecord(unionCase)) {
            return false;
        }
        const literal = readOwnDataProperty(unionCase, "literal");
        const schema = readOwnDataProperty(unionCase, "schema");
        if (!isLiteralValue(literal) ||
            includesLiteralValue(literals, literal) ||
            !isSchemaValueInner(schema, state) ||
            !caseRequiresDiscriminant(schema, key, literal)) {
            return false;
        }
        literals.push(literal);
    }
    return true;
}

/**
 * @brief Prove that one case schema requires the requested discriminant value.
 * @details Schema helpers enforce construction-time invariants before values reach
 * validation, compilation, or export.
 * @param schema Case schema after structural validation.
 * @param key Discriminant property name.
 * @param literal Required literal value for this case.
 * @returns True when an object case contains a required matching literal field.
 */
function caseRequiresDiscriminant(
    schema: Schema,
    key: string,
    literal: LiteralValue
): boolean {
    const objectSchema = unwrapCaseObjectSchema(schema);
    if (objectSchema === undefined) {
        return false;
    }
    const entries = objectSchema.entries;
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry?.key !== key) {
            continue;
        }
        return entry.presence === PresenceTag.Required &&
            schemaRequiresLiteral(entry.schema, literal);
    }
    return false;
}

/**
 * @brief Peel transparent wrappers until an object case schema is reached.
 * @param schema Case schema.
 * @returns The object schema used for discriminant proof, or undefined.
 * @details Intersections and transparent wrappers can carry the object branch
 * while still adding extra validation. Lazy and union nodes are not unwrapped
 * here because they do not give a local, branch-stable object proof.
 */
function unwrapCaseObjectSchema(
    schema: Schema
): Extract<Schema, { readonly tag: typeof SchemaTag.Object }> | undefined {
    switch (schema.tag) {
        case SchemaTag.Object:
            return schema;
        case SchemaTag.Intersection:
            return unwrapCaseObjectSchema(schema.left) ?? unwrapCaseObjectSchema(schema.right);
        case SchemaTag.Brand:
        case SchemaTag.Metadata:
        case SchemaTag.Message:
        case SchemaTag.KeyedObject:
        case SchemaTag.PropertyCount:
        case SchemaTag.PropertyNames:
        case SchemaTag.PatternProperties:
        case SchemaTag.Refine:
            return unwrapCaseObjectSchema(schema.inner);
        default:
            return undefined;
    }
}

/**
 * @brief Check whether a schema forces one exact literal.
 * @details Schema helpers enforce construction-time invariants before values reach
 * validation, compilation, or export.
 * @param schema Property schema.
 * @param literal Required literal value.
 * @returns True when the schema cannot accept a different discriminant value.
 */
function schemaRequiresLiteral(schema: Schema, literal: LiteralValue): boolean {
    switch (schema.tag) {
        case SchemaTag.Literal:
            return Object.is(schema.value, literal);
        case SchemaTag.Intersection:
            return schemaRequiresLiteral(schema.left, literal) ||
                schemaRequiresLiteral(schema.right, literal);
        case SchemaTag.Brand:
        case SchemaTag.Metadata:
        case SchemaTag.Message:
        case SchemaTag.KeyedObject:
        case SchemaTag.PropertyCount:
        case SchemaTag.PropertyNames:
        case SchemaTag.PatternProperties:
        case SchemaTag.Refine:
            return schemaRequiresLiteral(schema.inner, literal);
        default:
            return false;
    }
}

/**
 * @brief Test whether a literal vector already contains a SameValue literal.
 */
function includesLiteralValue(values: readonly LiteralValue[], value: LiteralValue): boolean {
    for (let index = 0; index < values.length; index += 1) {
        if (Object.is(values[index], value)) {
            return true;
        }
    }
    return false;
}
