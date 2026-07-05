/**
 * @file compile/predicate.ts
 * @brief Boolean validator source emitter.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 */

import {
    ArrayCheckTag,
    DateCheckTag,
    NumberCheckTag,
    ObjectModeTag,
    PresenceTag,
    SchemaTag,
    StringCheckTag
} from "../kind/index.js";
import {
    EMAIL_PATTERN,
    IPV4_PATTERN,
    IPV6_PATTERN,
    ISO_DATETIME_PATTERN,
    ISO_DATE_PATTERN,
    ULID_PATTERN,
    URL_PATTERN,
    UUID_PATTERN,
    type ArrayCheck,
    type NumberCheck,
    type DiscriminatedUnionCase,
    type Schema
} from "../schema/index.js";
import {
    pushLiteral,
    pushRegex,
    pushSchema,
    stringRef
} from "./context.js";
import type { EmitContext, FunctionSource } from "./types.js";

/**
 * @brief emit function.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param schema Schema represented by the predicate.
 * @param context Shared code-generation context.
 * @returns Generated predicate function name.
 * @invariant The same schema object maps to one predicate function per bundle.
 */
export function emitFunction(schema: Schema, context: EmitContext): string {
    const cached = context.functionNames.get(schema);
    if (cached !== undefined) {
        return cached;
    }
    /*
     * Register before body emission so recursive references can point at the
     * function name even while its body is still under construction.
     */
    const name = `p${String(context.functions.length)}`;
    const source: FunctionSource = {
        name,
        body: ""
    };
    context.functionNames.set(schema, name);
    context.functions.push(source);
    source.body = emitBody(schema, "v", context);
    return name;
}

/**
 * @brief emit functions.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param context Shared code-generation context with accumulated predicate sources.
 * @returns Concatenated JavaScript function declarations.
 */
export function emitFunctions(context: EmitContext): string {
    const chunks = new Array<string>(context.functions.length);
    for (let index = 0; index < context.functions.length; index += 1) {
        const source = context.functions[index];
        if (source === undefined) {
            continue;
        }
        chunks[index] = `function ${source.name}(v){${source.body}}`;
    }
    return chunks.join("");
}

/**
 * @brief emit body.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param schema Schema represented by this predicate body.
 * @param value Generated expression for the candidate value.
 * @param context Shared code-generation context.
 * @returns JavaScript source for a predicate function body.
 */
function emitBody(schema: Schema, value: string, context: EmitContext): string {
    switch (schema.tag) {
        case SchemaTag.Array:
            return emitArrayBody(schema, value, context);
        case SchemaTag.Tuple:
            if (schema.rest !== undefined) {
                return `return d(${String(pushSchema(context, schema))},${value});`;
            }
            return emitTupleBody(schema.items, value, context);
        case SchemaTag.Record:
            return emitRecordBody(schema.value, value, context);
        case SchemaTag.Map:
        case SchemaTag.Set:
        case SchemaTag.InstanceOf:
        case SchemaTag.Property:
            return `return d(${String(pushSchema(context, schema))},${value});`;
        case SchemaTag.Object:
            return emitObjectBody(schema, value, context);
        case SchemaTag.DiscriminatedUnion:
            return emitDiscriminatedUnionBody(schema.key, schema.cases, value, context);
        default:
            return `return ${emitExpression(schema, value, context)};`;
    }
}

/**
 * @brief emit expression.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param schema Schema represented by the expression.
 * @param value Generated expression for the candidate value.
 * @param context Shared code-generation context.
 * @returns JavaScript expression that evaluates to a boolean.
 */
export function emitExpression(
    schema: Schema,
    value: string,
    context: EmitContext
): string {
    switch (schema.tag) {
        case SchemaTag.Unknown:
            return "true";
        case SchemaTag.Never:
            return "false";
        case SchemaTag.String:
            return emitString(schema, value, context);
        case SchemaTag.Number:
            return emitNumber(schema, value);
        case SchemaTag.Date:
            return emitDate(schema, value);
        case SchemaTag.BigInt:
            return `(typeof ${value}==="bigint")`;
        case SchemaTag.Symbol:
            return `(typeof ${value}==="symbol")`;
        case SchemaTag.Boolean:
            return `(typeof ${value}==="boolean")`;
        case SchemaTag.Literal:
            return `Object.is(${value},l[${String(pushLiteral(context, schema.value))}])`;
        case SchemaTag.Array:
            /*
             * Composite schemas get their own functions. That keeps deeply nested
             * predicates readable to V8 and avoids duplicating loops at each use site.
             */
            return `${emitFunction(schema, context)}(${value})`;
        case SchemaTag.Tuple:
            if (schema.rest !== undefined) {
                return `d(${String(pushSchema(context, schema))},${value})`;
            }
            return `${emitFunction(schema, context)}(${value})`;
        case SchemaTag.Record:
            return `${emitFunction(schema, context)}(${value})`;
        case SchemaTag.Map:
        case SchemaTag.Set:
        case SchemaTag.InstanceOf:
        case SchemaTag.Property:
            return `d(${String(pushSchema(context, schema))},${value})`;
        case SchemaTag.Object:
            return `${emitFunction(schema, context)}(${value})`;
        case SchemaTag.Union:
            return emitUnion(schema.options, value, context);
        case SchemaTag.Intersection:
            return `(${emitExpression(schema.left, value, context)}&&${emitExpression(
                schema.right,
                value,
                context
            )})`;
        case SchemaTag.Optional:
        case SchemaTag.Undefinedable:
            return `(${value}===undefined||${emitExpression(schema.inner, value, context)})`;
        case SchemaTag.Nullable:
            return `(${value}===null||${emitExpression(schema.inner, value, context)})`;
        case SchemaTag.DiscriminatedUnion:
            return `${emitFunction(schema, context)}(${value})`;
        case SchemaTag.Brand:
            return emitExpression(schema.inner, value, context);
        case SchemaTag.Lazy:
        case SchemaTag.Refine:
            /*
             * User predicates and lazy resolution remain behind the runtime `d`
             * helper because generated source cannot inline their behavior.
             */
            return `d(${String(pushSchema(context, schema))},${value})`;
    }
}

/**
 * @brief Emit a Date predicate expression.
 * @param schema Date schema with normalized checks.
 * @param value Generated expression for the candidate value.
 * @returns JavaScript expression that accepts valid Date objects within bounds.
 */
function emitDate(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Date }>,
    value: string
): string {
    const checks = schema.checks;
    const parts = [
        `(${value} instanceof Date)`,
        `dg(${value})`
    ];
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case DateCheckTag.Min:
                parts.push(`dt(${value})>=${String(check.value)}`);
                break;
            case DateCheckTag.Max:
                parts.push(`dt(${value})<=${String(check.value)}`);
                break;
        }
    }
    return `(${parts.join("&&")})`;
}

/**
 * @brief emit array body.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param item Schema applied to each logical slot.
 * @param value Generated expression for the array value.
 * @param context Shared code-generation context.
 * @returns JavaScript source for an array predicate body.
 */
function emitArrayBody(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Array }>,
    value: string,
    context: EmitContext
): string {
    const item = schema.item;
    const itemFunction = emitFunction(item, context);
    /*
     * Descriptor reads block accessor-backed slots without executing getters.
     * Holes are forwarded as undefined so optional item schemas keep normal JS
     * sparse-array semantics.
     */
    return [
        `if(!Array.isArray(${value}))return false;`,
        emitArrayLengthBody(value, schema.checks),
        `for(let i=0;i<${value}.length;i+=1){`,
        `const d=gp(${value},i);`,
        `if(d!==undefined&&!h.call(d,"value"))return false;`,
        `if(!${itemFunction}(d===undefined?undefined:d.value))return false;`,
        "}",
        "return true;"
    ].join("");
}

/**
 * @brief Emit array length checks for direct predicate bodies.
 * @param value Generated expression for the candidate array.
 * @param checks Normalized array length checks.
 * @returns Straight-line early-return checks, or an empty string.
 */
function emitArrayLengthBody(
    value: string,
    checks: readonly ArrayCheck[]
): string {
    if (checks.length === 0) {
        return "";
    }
    const chunks: string[] = [];
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            chunks.push("return false;");
            continue;
        }
        switch (check.tag) {
            case ArrayCheckTag.Min:
                chunks.push(`if(${value}.length<${String(check.value)})return false;`);
                break;
            case ArrayCheckTag.Max:
                chunks.push(`if(${value}.length>${String(check.value)})return false;`);
                break;
        }
    }
    return chunks.join("");
}

/**
 * @brief emit record body.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param item Schema applied to each own enumerable string key.
 * @param value Generated expression for the record value.
 * @param context Shared code-generation context.
 * @returns JavaScript source for a record predicate body.
 */
function emitRecordBody(
    item: Schema,
    value: string,
    context: EmitContext
): string {
    const itemFunction = emitFunction(item, context);
    /*
     * Object.keys intentionally ignores inherited and non-enumerable keys,
     * matching TypeSea record semantics while keeping iteration predictable.
     */
    return [
        `if(!o(${value}))return false;`,
        `const ks=Object.keys(${value});`,
        "for(let i=0;i<ks.length;i+=1){",
        "const key=ks[i];",
        `const d=key===undefined?undefined:gp(${value},key);`,
        `if(d===undefined||!h.call(d,"value")||!${itemFunction}(d.value))return false;`,
        "}",
        "return true;"
    ].join("");
}

/**
 * @brief emit tuple body.
 * @details Emits tuple validation as straight-line descriptor reads and early returns.
 * @param items Tuple item schemas.
 * @param value Generated expression for the tuple value.
 * @param context Shared code-generation context.
 * @returns Generated tuple predicate body.
 */
function emitTupleBody(
    items: readonly Schema[],
    value: string,
    context: EmitContext
): string {
    const chunks: string[] = [
        `if(!Array.isArray(${value})||${value}.length!==${String(items.length)})return false;`
    ];
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (item === undefined) {
            continue;
        }
        const descriptor = `d${String(index)}`;
        const itemValue = `v${String(index)}`;
        /*
         * Tuple arity is already checked above. Each index still needs descriptor
         * validation because an accessor slot would execute user code if read.
         */
        chunks.push(
            `const ${descriptor}=gp(${value},${String(index)});`,
            `if(${descriptor}!==undefined&&!h.call(${descriptor},"value"))return false;`,
            `const ${itemValue}=${descriptor}===undefined?undefined:${descriptor}.value;`,
            `if(!${emitExpression(item, itemValue, context)})return false;`
        );
    }
    chunks.push("return true;");
    return chunks.join("");
}

/**
 * @brief emit object body.
 * @details Emits object validation as Ajv-style straight-line code with local descriptor variables.
 * @param schema Object schema to emit.
 * @param value Generated expression for the object value.
 * @param context Shared code-generation context.
 * @returns Generated object predicate body.
 */
function emitObjectBody(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    value: string,
    context: EmitContext
): string {
    const chunks: string[] = [`if(!o(${value}))return false;`];
    chunks.push(emitStrictObjectKeyBody(schema, value, context));
    const entries = schema.entries;
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry === undefined) {
            continue;
        }
        const key = stringRef(context, entry.key);
        const descriptor = `d${String(index)}`;
        const itemValue = `v${String(index)}`;
        chunks.push(`const ${descriptor}=gp(${value},${key});`);
        if (entry.presence === PresenceTag.Optional) {
            /*
             * Optional own accessors are rejected. A missing descriptor is valid,
             * but an own non-data property at the key is still hostile input.
             */
            chunks.push(
                `if(${descriptor}!==undefined){`,
                `if(!h.call(${descriptor},"value"))return false;`,
                `const ${itemValue}=${descriptor}.value;`,
                `if(!${emitExpression(entry.schema, itemValue, context)})return false;`,
                `}else if(h.call(${value},${key}))return false;`
            );
        } else {
            chunks.push(
                `if(${descriptor}===undefined||!h.call(${descriptor},"value"))return false;`,
                `const ${itemValue}=${descriptor}.value;`,
                `if(!${emitExpression(entry.schema, itemValue, context)})return false;`
            );
        }
    }
    chunks.push(emitObjectCatchallBody(schema, value, context));
    chunks.push("return true;");
    return chunks.join("");
}

/**
 * @brief Emit catchall checks for undeclared object keys.
 * @param schema Object schema with optional catchall.
 * @param value Generated expression for the object value.
 * @param context Shared code-generation context.
 * @returns Generated source that validates extra own keys.
 */
function emitObjectCatchallBody(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    value: string,
    context: EmitContext
): string {
    if (schema.catchall === undefined) {
        return "";
    }
    const keys = schema.keys;
    const membership = keyMembershipExpression("key", keys, context);
    return [
        `const cx=Reflect.ownKeys(${value});`,
        "for(let ci=0;ci<cx.length;ci+=1){",
        "const key=cx[ci];",
        `if(typeof key==="string"&&${membership})continue;`,
        `const cd=gp(${value},key);`,
        "if(cd===undefined||!h.call(cd,\"value\"))return false;",
        `if(!${emitExpression(schema.catchall, "cd.value", context)})return false;`,
        "}"
    ].join("");
}

/**
 * @brief emit strict object key body.
 * @details Emits a low-allocation known-key check specialized for one object shape.
 * @param schema Object schema with mode and entries.
 * @param value Generated expression for the object value.
 * @param context Shared code-generation context.
 * @returns Generated strict-key prelude, or an empty string for passthrough objects.
 */
function emitStrictObjectKeyBody(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Object }>,
    value: string,
    context: EmitContext
): string {
    if (schema.mode !== ObjectModeTag.Strict || schema.catchall !== undefined) {
        return "";
    }
    const entries = schema.entries;
    const comparisons: string[] = [];
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (entry !== undefined) {
            comparisons.push(`key!==${stringRef(context, entry.key)}`);
        }
    }
    if (comparisons.length === 0) {
        return `if(Reflect.ownKeys(${value}).length!==0)return false;`;
    }
    /*
     * Reflect.ownKeys is required for strict objects because symbol and
     * non-enumerable extras are still extras.
     */
    return [
        `const xs=Reflect.ownKeys(${value});`,
        "for(let i=0;i<xs.length;i+=1){",
        "const key=xs[i];",
        `if(typeof key!=="string"||(${comparisons.join("&&")}))return false;`,
        "}"
    ].join("");
}

/**
 * @brief emit discriminated union body.
 * @details Emits discriminant selection once and dispatches to branch validators.
 * @param key Discriminant property name.
 * @param cases Closed discriminated union cases.
 * @param value Generated expression for the candidate object.
 * @param context Shared code-generation context.
 * @returns Generated discriminated-union predicate body.
 */
function emitDiscriminatedUnionBody(
    key: string,
    cases: readonly DiscriminatedUnionCase[],
    value: string,
    context: EmitContext
): string {
    const keyRef = stringRef(context, key);
    const chunks: string[] = [
        `if(!o(${value}))return false;`,
        `const d=gp(${value},${keyRef});`,
        `if(d===undefined||!h.call(d,"value"))return false;`,
        "const dv=d.value;",
        `if(typeof dv!=="string")return false;`
    ];
    for (let index = 0; index < cases.length; index += 1) {
        const unionCase = cases[index];
        if (unionCase === undefined) {
            continue;
        }
        chunks.push(
            `if(Object.is(dv,l[${String(pushLiteral(context, unionCase.literal))}]))return ${emitExpression(
                unionCase.schema,
                value,
                context
            )};`
        );
    }
    chunks.push("return false;");
    return chunks.join("");
}

/**
 * @brief emit string.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param schema String schema with scalar checks.
 * @param value Generated expression for the candidate value.
 * @param context Shared code-generation context.
 * @returns JavaScript expression for the string predicate.
 */
function emitString(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.String }>,
    value: string,
    context: EmitContext
): string {
    const parts: string[] = [`(typeof ${value}==="string")`];
    const checks = schema.checks;
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case StringCheckTag.Min:
                parts.push(`(${value}.length>=${String(check.value)})`);
                break;
            case StringCheckTag.Max:
                parts.push(`(${value}.length<=${String(check.value)})`);
                break;
            case StringCheckTag.Regex:
                parts.push(emitRegex(value, check.regex, context));
                break;
            case StringCheckTag.Uuid:
                parts.push(emitRegex(value, UUID_PATTERN, context));
                break;
            case StringCheckTag.Email:
                parts.push(emitRegex(value, EMAIL_PATTERN, context));
                break;
            case StringCheckTag.Url:
                parts.push(emitRegex(value, URL_PATTERN, context));
                break;
            case StringCheckTag.IsoDate:
                parts.push(emitRegex(value, ISO_DATE_PATTERN, context));
                break;
            case StringCheckTag.IsoDateTime:
                parts.push(emitRegex(value, ISO_DATETIME_PATTERN, context));
                break;
            case StringCheckTag.Ulid:
                parts.push(emitRegex(value, ULID_PATTERN, context));
                break;
            case StringCheckTag.Ipv4:
                parts.push(emitRegex(value, IPV4_PATTERN, context));
                break;
            case StringCheckTag.Ipv6:
                parts.push(emitRegex(value, IPV6_PATTERN, context));
                break;
        }
    }
    return `(${parts.join("&&")})`;
}

/**
 * @brief emit number.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param schema Number schema with scalar checks.
 * @param value Generated expression for the candidate value.
 * @returns JavaScript expression for the number predicate.
 */
function emitNumber(
    schema: Extract<Schema, { readonly tag: typeof SchemaTag.Number }>,
    value: string
): string {
    const integer = numberChecksRequireInteger(schema.checks);
    const parts: string[] = integer
        ? [`Number.isInteger(${value})`]
        : [
            `(typeof ${value}==="number")`,
            `Number.isFinite(${value})`
        ];
    const checks = schema.checks;
    /*
     * Number.isInteger already proves finite number, so integer schemas avoid
     * emitting a separate typeof/finite pair.
     */
    for (let index = 0; index < checks.length; index += 1) {
        const check = checks[index];
        if (check === undefined) {
            continue;
        }
        switch (check.tag) {
            case NumberCheckTag.Integer:
                break;
            case NumberCheckTag.Gte:
                parts.push(`(${value}>=${String(check.value)})`);
                break;
            case NumberCheckTag.Lte:
                parts.push(`(${value}<=${String(check.value)})`);
                break;
            case NumberCheckTag.Gt:
                parts.push(`(${value}>${String(check.value)})`);
                break;
            case NumberCheckTag.Lt:
                parts.push(`(${value}<${String(check.value)})`);
                break;
            case NumberCheckTag.MultipleOf:
                parts.push(`(${value}%${String(check.value)}===0)`);
                break;
        }
    }
    return `(${parts.join("&&")})`;
}

/**
 * @brief Test whether a number schema contains an integer constraint.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param checks Number check list.
 * @returns True when Number.isInteger can replace the broader number guard.
 */
function numberChecksRequireInteger(checks: readonly NumberCheck[]): boolean {
    for (let index = 0; index < checks.length; index += 1) {
        if (checks[index]?.tag === NumberCheckTag.Integer) {
            return true;
        }
    }
    return false;
}

/**
 * @brief emit union.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param options Union option schemas.
 * @param value Generated expression for the candidate value.
 * @param context Shared code-generation context.
 * @returns JavaScript expression for the union predicate.
 */
export function emitUnion(
    options: readonly Schema[],
    value: string,
    context: EmitContext
): string {
    const parts: string[] = [];
    for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        if (option !== undefined) {
            parts.push(emitExpression(option, value, context));
        }
    }
    if (parts.length === 0) {
        return "false";
    }
    return `(${parts.join("||")})`;
}

/**
 * @brief emit regex.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param value Generated expression for the candidate string.
 * @param regex Pattern to test.
 * @param context Shared code-generation context.
 * @returns JavaScript expression that resets lastIndex and tests the regex.
 */
function emitRegex(value: string, regex: RegExp, context: EmitContext): string {
    const index = pushRegex(context, regex);
    const access = `r[${String(index)}]`;
    return `((${access}.lastIndex=0),${access}.test(${value}))`;
}

/**
 * @brief Emit a side-table backed key membership expression.
 * @param key Generated expression containing the candidate property key.
 * @param keys Known object shape keys.
 * @param context Shared code-generation context.
 * @returns JavaScript expression that is true for known string keys.
 */
function keyMembershipExpression(
    key: string,
    keys: readonly string[],
    context: EmitContext
): string {
    if (keys.length === 0) {
        return "false";
    }
    const parts = new Array<string>(keys.length);
    for (let index = 0; index < keys.length; index += 1) {
        const value = keys[index];
        parts[index] = value === undefined
            ? "false"
            : `${key}===${stringRef(context, value)}`;
    }
    return `(${parts.join("||")})`;
}
