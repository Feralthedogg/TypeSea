/**
 * @file compile/source.ts
 * @brief Generated validator source bundle assembly.
 */

import type { Schema } from "../schema/index.js";
import { emitCheckFunction, emitCheckFunctions } from "./check.js";
import { createEmitContext } from "./context.js";
import { safeFunctionName } from "./names.js";
import { emitFunction, emitFunctions } from "./predicate.js";
import type { CompiledSourceBundle } from "./types.js";

/**
 * @brief emit compiled source bundle.
 */
export function emitCompiledSourceBundle(
  schema: Schema,
  name: string
): CompiledSourceBundle {
  const context = createEmitContext();
  const root = emitFunction(schema, context);
  const checkRoot = emitCheckFunction(schema, context);
  const functionName = safeFunctionName(name);
  const checkFunctionName = `${functionName}_check`;
  const source = [
    "\"use strict\";",
    "const h=Object.prototype.hasOwnProperty;",
    "const gp=Object.getOwnPropertyDescriptor;",
    "const o=function(v){return typeof v===\"object\"&&v!==null&&!Array.isArray(v);};",
    "const g=function(v,k){const d=gp(v,k);return d!==undefined&&h.call(d,\"value\")?d:undefined;};",
    "const a=function(v){if(v===null)return \"null\";if(Array.isArray(v))return \"array\";if(typeof v===\"bigint\")return \"bigint\";if(typeof v===\"symbol\")return \"symbol\";if(typeof v===\"number\"&&Number.isNaN(v))return \"nan\";return typeof v;};",
    "const le=function(v){if(v===null)return \"null\";if(v===undefined)return \"undefined\";if(typeof v===\"string\")return JSON.stringify(v);if(typeof v===\"number\"&&Object.is(v,-0))return \"-0\";if(typeof v===\"symbol\")return String(v);return String(v);};",
    "const q=function(s,p,c,e,x){s.push({path:p.slice(),code:c,expected:e,actual:x,message:undefined});};",
    emitFunctions(context),
    emitCheckFunctions(context),
    `return {is:function ${functionName}(x){return ${root}(x);},check:function ${checkFunctionName}(x){const s=[];${checkRoot}(x,[],s);return s;}};`
  ].join("");
  return {
    source,
    literals: context.literals,
    regexps: context.regexps,
    keysets: context.keysets,
    strings: context.strings,
    dynamicSchemas: context.schemas
  };
}
