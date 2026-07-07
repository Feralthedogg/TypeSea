/**
 * @file compile/source.ts
 * @brief Generated validator source bundle assembly.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 */

import type { Schema } from "../schema/index.js";
import { emitCheckFunction, emitCheckFunctions } from "./check.js";
import { createEmitContext } from "./context.js";
import { formatDebugSource } from "./debug-source.js";
import { emitFirstFunction, emitFirstFunctions } from "./first.js";
import { emitGraphFunction, emitGraphFunctions } from "./graph-predicate.js";
import { safeFunctionName } from "./names.js";
import type { CompileMode, CompiledSourceBundle } from "./types.js";

/**
 * @brief emit compiled source bundle.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param schema Root schema to compile.
 * @param name Requested public function name.
 * @param mode Compile mode controlling safety and allocation tradeoffs.
 * @returns Generated source plus side tables consumed by the runtime factory.
 */
export function emitCompiledSourceBundle(
    schema: Schema,
    name: string,
    mode: CompileMode = "safe",
    debugSource = false
): CompiledSourceBundle {
    const context = createEmitContext(mode);
    const functionName = safeFunctionName(name);
    const directRoot = canUseDirectRootFunctionName(functionName);
    /*
     * A direct root function gives V8 a stable, named hot predicate. Names that
     * collide with helper or generated ids are wrapped to avoid shadowing.
     */
    const root = emitGraphFunction(
        schema,
        context,
        directRoot ? functionName : undefined
    );
    const checkRoot = emitCheckFunction(schema, context);
    const firstRoot = emitFirstFunction(schema, context);
    const checkFunctionName = `${functionName}_check`;
    const resultFunctionName = `${functionName}_result`;
    const firstFunctionName = `${functionName}_first`;
    const isProperty = directRoot
        ? `is:${root}`
        : `is:function(x){return ${root}(x);}`;
    const graphFunctions = emitGraphFunctions(context);
    const checkFunctions = emitCheckFunctions(context);
    const firstFunctions = emitFirstFunctions(context);
    const rootPathIsFrozen = canReuseFrozenRootPath(checkFunctions);
    const firstPathIsFrozen = canReuseFrozenRootPath(firstFunctions);
    const rootPath = rootPathIsFrozen ? "z" : "[]";
    const firstPath = firstPathIsFrozen ? "z" : "[]";
    /*
     * Boolean is() owns the hot path; check()/result() first reuse it so valid
     * data avoids diagnostic allocation. Only failing inputs enter the check tree.
     */
    const issueCollector = `check:function ${checkFunctionName}(x){if(${root}(x))return;const s=[];${checkRoot}(x,${rootPath},s);return s;}`;
    const resultCollector = `result:function ${resultFunctionName}(x){if(${root}(x))return ${emitSuccessResult(mode, "x")};const s=[];${checkRoot}(x,${rootPath},s);return Object.freeze({ok:false,error:Object.freeze(s)});}`;
    const firstCollector = `first:function ${firstFunctionName}(x){if(${root}(x))return ${emitSuccessResult(mode, "x")};const e=${firstRoot}(x,${firstPath});if(e===undefined)return ${emitSuccessResult(mode, "x")};return Object.freeze({ok:false,error:Object.freeze([e])});}`;
    const runtimeBundle = `return {${isProperty},${issueCollector},${resultCollector},${firstCollector}};`;
    const body = [
        graphFunctions,
        checkFunctions,
        firstFunctions,
        runtimeBundle
    ].join("");
    const helperPrelude = emitHelperPrelude(body, rootPathIsFrozen);
    const compactSource = [
        "\"use strict\";",
        helperPrelude,
        body
    ].join("");
    const source = debugSource
        ? formatDebugSource(
            [
                "\"use strict\";",
                "/* TypeSea helper prelude: shared runtime helpers and side-table readers. */",
                helperPrelude,
                "/* TypeSea boolean predicates emitted from optimized IR. */",
                graphFunctions,
                "/* TypeSea diagnostic collectors used by check(). */",
                checkFunctions,
                "/* TypeSea first-fault collectors used by checkFirst(). */",
                firstFunctions,
                "/* TypeSea public runtime bundle returned to CompiledBaseGuard. */",
                runtimeBundle
            ].join(""),
            functionName,
            mode
        )
        : compactSource;
    return {
        source,
        literals: context.literals,
        regexps: context.regexps,
        keysets: context.keysets,
        strings: context.strings,
        dynamicSchemas: context.schemas
    };
}

/**
 * @brief Emit a predicate-only compiled source bundle.
 * @param schema Root schema to compile.
 * @param name Requested public predicate name.
 * @param mode Compile mode controlling safety and allocation tradeoffs.
 * @param debugSource Whether to emit readable source formatting.
 * @returns Generated factory source that returns only the boolean predicate.
 * @details This path intentionally skips diagnostic collector emission. It is
 * the fail-fast contract for callers that need only true/false.
 */
export function emitCompiledBooleanSourceBundle(
    schema: Schema,
    name: string,
    mode: CompileMode = "safe",
    debugSource = false
): CompiledSourceBundle {
    const context = createEmitContext(mode);
    const functionName = safeFunctionName(name);
    const root = emitGraphFunction(
        schema,
        context,
        canUseDirectRootFunctionName(functionName) ? functionName : undefined
    );
    const graphFunctions = emitGraphFunctions(context);
    const runtimeBundle = `return ${root};`;
    const body = [
        graphFunctions,
        runtimeBundle
    ].join("");
    const helperPrelude = emitHelperPrelude(body, true);
    const compactSource = [
        "\"use strict\";",
        helperPrelude,
        body
    ].join("");
    const source = debugSource
        ? formatDebugSource(
            [
                "\"use strict\";",
                "/* TypeSea helper prelude: shared runtime helpers and side-table readers. */",
                helperPrelude,
                "/* TypeSea boolean predicate emitted from optimized IR. */",
                graphFunctions,
                "/* TypeSea predicate-only runtime bundle. */",
                runtimeBundle
            ].join(""),
            functionName,
            mode
        )
        : compactSource;
    return {
        source,
        literals: context.literals,
        regexps: context.regexps,
        keysets: context.keysets,
        strings: context.strings,
        dynamicSchemas: context.schemas
    };
}

/**
 * @brief Emit the success Result expression for compiled result().
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param mode Compile mode controlling object freezing.
 * @param value Generated expression for the accepted runtime value.
 * @returns JavaScript source for the success branch.
 */
function emitSuccessResult(mode: CompileMode, value: string): string {
    if (mode === "safe") {
        return `Object.freeze({ok:true,value:${value}})`;
    }
    return `{ok:true,value:${value}}`;
}

/**
 * @brief Decide whether the root predicate can use the public function name.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param name Sanitized generated function name.
 * @returns True when the name cannot shadow helpers or generated child ids.
 */
function canUseDirectRootFunctionName(name: string): boolean {
    return !isRuntimeHelperName(name) &&
        !isFactoryParameterName(name) &&
        !isGeneratedFunctionName(name);
}

/**
 * @brief Decide whether the generated check tree mutates the path stack.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param checkFunctions Generated diagnostic function source.
 * @returns True when the frozen empty path singleton can be reused.
 */
function canReuseFrozenRootPath(checkFunctions: string): boolean {
    return !checkFunctions.includes("p.push(");
}

/**
 * @brief Test whether a name is a generated factory parameter.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param name Candidate identifier.
 * @returns True when the name would shadow a factory side table.
 */
function isFactoryParameterName(name: string): boolean {
    switch (name) {
        case "l":
        case "r":
        case "k":
        case "u":
        case "d":
        case "m":
        case "mf":
        case "sk":
        case "w":
            return true;
        default:
            return false;
    }
}

/**
 * @brief Test whether a name matches TypeSea child function naming.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param name Candidate identifier.
 * @returns True for generated predicate/check names such as `p0` or `c12`.
 */
function isGeneratedFunctionName(name: string): boolean {
    if (name.length < 2) {
        return false;
    }
    const first = name.charCodeAt(0);
    if (first !== 99 && first !== 102 && first !== 112) {
        return false;
    }
    for (let index = 1; index < name.length; index += 1) {
        const code = name.charCodeAt(index);
        if (code < 48 || code > 57) {
            return false;
        }
    }
    return true;
}

/**
 * @brief emit helper prelude.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param body Generated factory body without helper definitions.
 * @param rootPathIsFrozen True when path helpers may use the frozen empty path.
 * @returns JavaScript source for only the helpers referenced by `body`.
 */
function emitHelperPrelude(body: string, rootPathIsFrozen: boolean): string {
    const needed = readNeededHelpers(body);
    const chunks: string[] = [];
    pushHelper(chunks, needed, "z", "const z=Object.freeze([]);");
    pushHelper(chunks, needed, "h", "const h=Object.prototype.hasOwnProperty;");
    pushHelper(chunks, needed, "gp", "const gp=Object.getOwnPropertyDescriptor;");
    pushHelper(chunks, needed, "o", "const o=function(v){return typeof v===\"object\"&&v!==null&&!Array.isArray(v);};");
    pushHelper(chunks, needed, "ph", "const ph=function(v){return (typeof v===\"object\"&&v!==null)||typeof v===\"function\";};");
    pushHelper(chunks, needed, "g", "const g=function(v,k){const d=gp(v,k);return d!==undefined&&h.call(d,\"value\")?d:undefined;};");
    pushHelper(chunks, needed, "gv", "const gv=function(v,k){if(!ph(v))return undefined;const d=gp(v,k);return d!==undefined&&h.call(d,\"value\")?d.value:undefined;};");
    pushHelper(chunks, needed, "ho", "const ho=function(v,k){return ph(v)&&h.call(v,k);};");
    pushHelper(chunks, needed, "hd", "const hd=function(v,k){if(!ph(v))return false;const d=gp(v,k);return d!==undefined&&h.call(d,\"value\");};");
    pushHelper(chunks, needed, "fn", "const fn=function(v){return typeof v===\"number\"&&Number.isFinite(v);};");
    pushHelper(chunks, needed, "nc", "const nc=function(x,y,gte){return typeof x===\"number\"&&typeof y===\"number\"&&(gte?x>=y:x<=y);};");
    pushHelper(chunks, needed, "dg", "const __tg=Date.prototype.getTime;const dg=function(v){if(!(v instanceof Date))return false;tr" +
        "y{return Number.isFinite(__tg.call(v));}ca" +
        "tch{return false;}};const dt=function(v){return __tg.call(v);};");
    pushHelper(chunks, needed, "sb", "const sb=function(v,b,min){return typeof v===\"string\"&&(min?v.length>=b:v.length<=b);};");
    pushHelper(chunks, needed, "rx", "const rx=function(v,re){if(typeof v!==\"string\")return false;re.lastIndex=0;const ok=re.test(v);re.lastIndex=0;return ok;};");
    pushHelper(chunks, needed, "ai", "const ai=function(k,n){if(k.length===0||k===\"length\")return false;const i=Number(k);return Number.isInteger(i)&&i>=0&&i<=4294967294&&i<n&&String(i)===k;};");
    pushHelper(chunks, needed, "ea", "const ea=function(v,f){if(!Array.isArray(v))return false;for(let i=0;i<v.length;i+=1){const d=gp(v,i);if(d===undefined||!h.call(d,\"value\")||!f(d.value))return false;}return true;};");
    pushHelper(chunks, needed, "eu", "const eu=function(v,f){if(!Array.isArray(v))return false;const xs=Object.getOwnPropertyNames(v);for(let i=0;i<xs.length;i+=1){const k=xs[i];if(!ai(k,v.length))continue;const d=gp(v,k);if(d!==undefined&&!h.call(d,\"value\"))return false;if(d!==undefined&&!f(d.value))return false;}return true;};");
    pushHelper(chunks, needed, "ev", "const ev=function(v,i,f){const d=gp(v,i);if(d!==undefined&&!h.call(d,\"value\"))return false;return f(d===undefined?undefined:d.value);};");
    pushHelper(chunks, needed, "er", "const er=function(v,f){if(!o(v))return false;for(const key in v){if(!h.call(v,key))continue;const d=gp(v,key);if(d===undefined||!h.call(d,\"value\")||!f(d.value))return false;}return true;};");
    pushHelper(chunks, needed, "dj", "const dj=function(v,key,ks){if(!o(v))return false;const d=g(v,key);if(d===undefined||typeof d.value!==\"string\")return false;const i=ks.indexOf(d.value);return i>=0&&arguments[i+3](v);};");
    pushHelper(chunks, needed, "a", "const a=function(v){if(v===null)return \"null\";if(Array.isArray(v))return \"array\";if(v instanceof Date)return \"date\";if(typeof File===\"function\"&&v instanceof File)return \"file\";if(v instanceof Map)return \"map\";if(v instanceof Set)return \"set\";if(typeof v===\"number\"&&Number.isNaN(v))return \"nan\";return typeof v;};");
    pushHelper(chunks, needed, "le", "const le=function(v){if(v===null)return \"null\";if(v===undefined)return \"undefined\";if(typeof v===\"string\")return JSON.stringify(v);if(typeof v===\"number\"&&Object.is(v,-0))return \"-0\";if(typeof v===\"symbol\")return String(v);return String(v);};");
    pushHelper(chunks, needed, "w", "const w=function(){const x=new Array(u.length);for(let i=0;i<u.length;i+=1)x[i]=Object.freeze([u[i]]);return x;}();");
    pushHelper(chunks, needed, "q", rootPathIsFrozen
        ? "const q=function(s,p,c,e,x,m){s.push(Object.freeze({path:z,code:c,expected:e,actual:x,message:m}));};"
        : "const q=function(s,p,c,e,x,m){const y=p.length===0?z:Object.freeze(p.slice());s.push(Object.freeze({path:y,code:c,expected:e,actual:x,message:m}));};");
    pushHelper(chunks, needed, "q1", rootPathIsFrozen
        ? "const q1=function(s,p,k,c,e,x,m){s.push(Object.freeze({path:Object.freeze([k]),code:c,expected:e,actual:x,message:m}));};"
        : "const q1=function(s,p,k,c,e,x,m){const n=p.length;const y=n===0?[k]:p.slice();if(n!==0)y.push(k);Object.freeze(y);s.push(Object.freeze({path:y,code:c,expected:e,actual:x,message:m}));};");
    pushHelper(chunks, needed, "q1s", rootPathIsFrozen
        ? "const q1s=function(s,p,i,c,e,x,m){s.push(Object.freeze({path:w[i],code:c,expected:e,actual:x,message:m}));};"
        : "const q1s=function(s,p,i,c,e,x,m){const n=p.length;if(n===0){s.push(Object.freeze({path:w[i],code:c,expected:e,actual:x,message:m}));return;}const y=p.slice();y.push(u[i]);Object.freeze(y);s.push(Object.freeze({path:y,code:c,expected:e,actual:x,message:m}));};");
    pushHelper(chunks, needed, "q2", rootPathIsFrozen
        ? "const q2=function(s,p,a,b,c,e,x,m){s.push(Object.freeze({path:Object.freeze([a,b]),code:c,expected:e,actual:x,message:m}));};"
        : "const q2=function(s,p,a,b,c,e,x,m){const n=p.length;const y=n===0?[a,b]:p.slice();if(n!==0){y.push(a);y.push(b);}Object.freeze(y);s.push(Object.freeze({path:y,code:c,expected:e,actual:x,message:m}));};");
    pushHelper(chunks, needed, "fq", "const fq=function(p,c,e,x,m){const y=p.length===0?z:Object.freeze(p.slice());return Object.freeze({path:y,code:c,expected:e,actual:x,message:m});};");
    pushHelper(chunks, needed, "fq1", "const fq1=function(p,k,c,e,x,m){const n=p.length;const y=n===0?[k]:p.slice();if(n!==0)y.push(k);Object.freeze(y);return Object.freeze({path:y,code:c,expected:e,actual:x,message:m});};");
    pushHelper(chunks, needed, "fq1s", "const fq1s=function(p,i,c,e,x,m){if(p.length===0)return Object.freeze({path:w[i],code:c,expected:e,actual:x,message:m});const y=p.slice();y.push(u[i]);Object.freeze(y);return Object.freeze({path:y,code:c,expected:e,actual:x,message:m});};");
    pushHelper(chunks, needed, "fq2", "const fq2=function(p,a,b,c,e,x,m){const n=p.length;const y=n===0?[a,b]:p.slice();if(n!==0){y.push(a);y.push(b);}Object.freeze(y);return Object.freeze({path:y,code:c,expected:e,actual:x,message:m});};");
    return chunks.join("");
}

/**
 * @brief Append one helper definition when referenced by generated code.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param chunks Mutable helper source list.
 * @param needed Helper names discovered in generated function bodies.
 * @param name Helper identifier.
 * @param source Helper source text.
 */
function pushHelper(
    chunks: string[],
    needed: ReadonlySet<string>,
    name: string,
    source: string
): void {
    if (needed.has(name)) {
        chunks.push(source);
    }
}

/**
 * @brief Discover runtime helpers referenced by generated validator bodies.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param body Generated factory body without helper definitions.
 * @returns Closed helper-name set including transitive helper dependencies.
 */
function readNeededHelpers(body: string): Set<string> {
    const needed = new Set<string>();
    markCalledHelpers(body, needed);
    closeHelperDependencies(needed);
    return needed;
}

/**
 * @brief Scan generated source for helper calls without allocating RegExp objects.
 * @details Helper names are intentionally short. Scanning by identifier prevents
 * false positives such as the `o(` suffix in a user function named `foo`.
 * @param body Generated factory body without helper definitions.
 * @param needed Mutable helper-name set.
 */
function markCalledHelpers(body: string, needed: Set<string>): void {
    let index = 0;
    while (index < body.length) {
        const code = body.charCodeAt(index);
        if (!isIdentifierStartCode(code)) {
            index += 1;
            continue;
        }
        const start = index;
        index += 1;
        while (index < body.length && isIdentifierPartCode(body.charCodeAt(index))) {
            index += 1;
        }
        const name = body.slice(start, index);
        if (name === "z") {
            /*
             * The frozen empty path is referenced as a value, not a call. It gets
             * special handling because the call scanner would otherwise miss it.
             */
            needed.add("z");
            continue;
        }
        if (!isRuntimeHelperName(name) || isFunctionNamePosition(body, start)) {
            continue;
        }
        if (body.charCodeAt(index) === 40) {
            needed.add(name);
            continue;
        }
        if (name === "h" && body.startsWith(".call(", index)) {
            /*
             * hasOwnProperty is used through h.call(...). This is still a helper
             * dependency even though it is not written as h(...).
             */
            needed.add("h");
        }
    }
}

/**
 * @brief close helper dependencies.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param needed Mutable helper-name set.
 * @post Every helper required by another helper has been inserted.
 */
function closeHelperDependencies(needed: Set<string>): void {
    let changed = true;
    while (changed) {
        changed = false;
        changed = addDependencies(needed, "g", ["gp", "h"]) || changed;
        changed = addDependencies(needed, "gv", ["ph", "gp", "h"]) || changed;
        changed = addDependencies(needed, "ho", ["ph", "h"]) || changed;
        changed = addDependencies(needed, "hd", ["ph", "gp", "h"]) || changed;
        changed = addDependencies(needed, "ea", ["gp", "h"]) || changed;
        changed = addDependencies(needed, "eu", ["ai", "gp", "h"]) || changed;
        changed = addDependencies(needed, "ev", ["gp", "h"]) || changed;
        changed = addDependencies(needed, "er", ["o", "gp", "h"]) || changed;
        changed = addDependencies(needed, "dj", ["o", "g"]) || changed;
        changed = addDependencies(needed, "dt", ["dg"]) || changed;
        changed = addDependencies(needed, "q", ["z"]) || changed;
        changed = addDependencies(needed, "q1s", ["w"]) || changed;
        changed = addDependencies(needed, "fq", ["z"]) || changed;
        changed = addDependencies(needed, "fq1", ["z"]) || changed;
        changed = addDependencies(needed, "fq1s", ["w"]) || changed;
    }
}

/**
 * @brief add dependencies.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param needed Mutable helper-name set.
 * @param name Helper whose dependencies should be inserted.
 * @param dependencies Helper names required by `name`.
 * @returns True when the set changed.
 */
function addDependencies(
    needed: Set<string>,
    name: string,
    dependencies: readonly string[]
): boolean {
    if (!needed.has(name)) {
        return false;
    }
    let changed = false;
    for (let index = 0; index < dependencies.length; index += 1) {
        const dependency = dependencies[index];
        if (dependency !== undefined && !needed.has(dependency)) {
            needed.add(dependency);
            changed = true;
        }
    }
    return changed;
}

/**
 * @brief Test whether an identifier is a generated runtime helper.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param name Candidate identifier.
 * @returns True when `name` is reserved for helper prelude emission.
 */
function isRuntimeHelperName(name: string): boolean {
    switch (name) {
        case "h":
        case "z":
        case "gp":
        case "o":
        case "ph":
        case "g":
        case "gv":
        case "ho":
        case "hd":
        case "fn":
        case "nc":
        case "dg":
        case "dt":
        case "sb":
        case "rx":
        case "ai":
        case "ea":
        case "eu":
        case "ev":
        case "er":
        case "dj":
        case "a":
        case "le":
        case "w":
        case "q":
        case "q1":
        case "q1s":
        case "q2":
        case "fq":
        case "fq1":
        case "fq1s":
        case "fq2":
            return true;
        default:
            return false;
    }
}

/**
 * @brief Test whether an identifier occurrence is a function declaration name.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param source Full generated source being scanned.
 * @param start Start offset of the identifier.
 * @returns True when the identifier follows `function `.
 */
function isFunctionNamePosition(source: string, start: number): boolean {
    const prefix = "function ";
    return start >= prefix.length &&
        source.slice(start - prefix.length, start) === prefix;
}

/**
 * @brief Test ASCII identifier-start characters used by generated code.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param code Character code under inspection.
 * @returns True for `$`, `_`, and ASCII letters.
 */
function isIdentifierStartCode(code: number): boolean {
    return code === 36 ||
        code === 95 ||
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122);
}

/**
 * @brief Test ASCII identifier-part characters used by generated code.
 * @details Generated-source helpers keep the side-table ABI and JavaScript source shape
 * stable across runtime and AOT emission.
 * @param code Character code under inspection.
 * @returns True for identifier-start characters and digits.
 */
function isIdentifierPartCode(code: number): boolean {
    return isIdentifierStartCode(code) || (code >= 48 && code <= 57);
}
