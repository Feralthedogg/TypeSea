/**
 * @file compile/source.ts
 * @brief Generated validator source bundle assembly.
 */

import type { Schema } from "../schema/index.js";
import { emitCheckFunction, emitCheckFunctions } from "./check.js";
import { createEmitContext } from "./context.js";
import { emitGraphFunction, emitGraphFunctions } from "./graph-predicate.js";
import { safeFunctionName } from "./names.js";
import type { CompiledSourceBundle } from "./types.js";

/**
 * @brief emit compiled source bundle.
 */
export function emitCompiledSourceBundle(
  schema: Schema,
  name: string
): CompiledSourceBundle {
  const context = createEmitContext();
  const root = emitGraphFunction(schema, context);
  const checkRoot = emitCheckFunction(schema, context);
  const functionName = safeFunctionName(name);
  const checkFunctionName = `${functionName}_check`;
  const source = [
    "\"use strict\";",
    "const h=Object.prototype.hasOwnProperty;",
    "const gp=Object.getOwnPropertyDescriptor;",
    "const o=function(v){return typeof v===\"object\"&&v!==null&&!Array.isArray(v);};",
    "const ph=function(v){return (typeof v===\"object\"&&v!==null)||typeof v===\"function\";};",
    "const g=function(v,k){const d=gp(v,k);return d!==undefined&&h.call(d,\"value\")?d:undefined;};",
    "const gv=function(v,k){if(!ph(v))return undefined;const d=gp(v,k);return d!==undefined&&h.call(d,\"value\")?d.value:undefined;};",
    "const ho=function(v,k){return ph(v)&&h.call(v,k);};",
    "const hd=function(v,k){if(!ph(v))return false;const d=gp(v,k);return d!==undefined&&h.call(d,\"value\");};",
    "const fn=function(v){return typeof v===\"number\"&&Number.isFinite(v);};",
    "const nc=function(x,y,gte){return typeof x===\"number\"&&typeof y===\"number\"&&(gte?x>=y:x<=y);};",
    "const sb=function(v,b,min){return typeof v===\"string\"&&(min?v.length>=b:v.length<=b);};",
    "const rx=function(v,re){if(typeof v!==\"string\")return false;re.lastIndex=0;const ok=re.test(v);re.lastIndex=0;return ok;};",
    "const ea=function(v,f){if(!Array.isArray(v))return false;for(let i=0;i<v.length;i+=1){const d=gp(v,i);if(d!==undefined&&!h.call(d,\"value\"))return false;if(!f(d===undefined?undefined:d.value))return false;}return true;};",
    "const ev=function(v,i,f){const d=gp(v,i);if(d!==undefined&&!h.call(d,\"value\"))return false;return f(d===undefined?undefined:d.value);};",
    "const er=function(v,f){if(!o(v))return false;const ks=Object.keys(v);for(let i=0;i<ks.length;i+=1){const key=ks[i];if(key===undefined)return false;const d=gp(v,key);if(d===undefined||!h.call(d,\"value\")||!f(d.value))return false;}return true;};",
    "const dj=function(v,key,ks){if(!o(v))return false;const d=g(v,key);if(d===undefined||typeof d.value!==\"string\")return false;const i=ks.indexOf(d.value);return i>=0&&arguments[i+3](v);};",
    "const a=function(v){if(v===null)return \"null\";if(Array.isArray(v))return \"array\";if(typeof v===\"bigint\")return \"bigint\";if(typeof v===\"symbol\")return \"symbol\";if(typeof v===\"number\"&&Number.isNaN(v))return \"nan\";return typeof v;};",
    "const le=function(v){if(v===null)return \"null\";if(v===undefined)return \"undefined\";if(typeof v===\"string\")return JSON.stringify(v);if(typeof v===\"number\"&&Object.is(v,-0))return \"-0\";if(typeof v===\"symbol\")return String(v);return String(v);};",
    "const q=function(s,p,c,e,x){s.push({path:p.slice(),code:c,expected:e,actual:x,message:undefined});};",
    emitGraphFunctions(context),
    emitCheckFunctions(context),
    `return {is:function ${functionName}(x){return ${root}(x);},check:function ${checkFunctionName}(x){const s=[];if(${root}(x))return s;${checkRoot}(x,[],s);return s;}};`
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
