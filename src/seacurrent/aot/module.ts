/**
 * @file module.ts
 * @brief Standalone ESM wrapping for instrumented SeaCurrent predicates.
 */

import {
    serializeAotLiteralArray,
    serializeAotRegExpArray
} from "../../aot/serialize.js";
import type { CompiledSourceBundle } from "../../compile/index.js";
import {
    CHECKSUM_TABLE,
    COUNTER_TABLE,
    FREQUENCY_TABLE,
    OVERFLOW_TABLE
} from "./layout.js";
import type { SeaCurrentInstrumentationManifest } from "./types.js";

/** @brief Standalone source and declaration pair produced by this serializer. */
export interface SeaCurrentModuleSource {
    readonly source: string;
    readonly declarationSource: string;
}

/**
 * @brief Wrap one instrumented predicate bundle as a standalone ESM module.
 * @param bundle Portable predicate source and side tables.
 * @param manifest Frozen counter and region layout.
 * @returns JavaScript module and TypeScript declaration source.
 */
export function emitSeaCurrentModuleSource(
    bundle: CompiledSourceBundle,
    manifest: SeaCurrentInstrumentationManifest
): SeaCurrentModuleSource {
    const encodedManifest = JSON.stringify(manifest);
    const source = [
        `const ${COUNTER_TABLE}=new Float64Array(${String(manifest.counterSlots)});`,
        `const ${FREQUENCY_TABLE}=new Float64Array(${String(manifest.regions.length)});`,
        `const ${CHECKSUM_TABLE}=new Uint32Array(${String(manifest.checksumSlots)});`,
        `const ${OVERFLOW_TABLE}=new Uint8Array(1);`,
        `const __sc_manifest=${encodedManifest};`,
        "const l=",
        serializeAotLiteralArray(bundle.literals),
        ";const r=",
        serializeAotRegExpArray(bundle.regexps),
        ";const k=",
        JSON.stringify(bundle.keysets),
        ";const u=",
        JSON.stringify(bundle.strings),
        ";const d=function(){return false;};",
        "const m=function(){return;};",
        "const mf=function(){return;};",
        "const sk=function(v,ks){if(typeof v!==\"object\"||v===null||Array.isArray(v))return false;const ps=Reflect.ownKeys(v);for(let i=0;i<ps.length;i+=1){const key=ps[i];if(typeof key!==\"string\"||!ks.includes(key))return false;}return true;};",
        "const __sc_predicate=(function(l,r,k,u,d,m,mf,sk){",
        bundle.source,
        "})(l,r,k,u,d,m,mf,sk);",
        emitHostileInputBoundarySource(`${OVERFLOW_TABLE}[0]=1;`),
        emitSnapshotFunctionSource(),
        `export function reset(){${COUNTER_TABLE}.fill(0);${FREQUENCY_TABLE}.fill(0);${CHECKSUM_TABLE}.fill(0);${OVERFLOW_TABLE}.fill(0);}`,
        "export default Object.freeze({is,snapshot,reset});",
        ""
    ].join("");
    return Object.freeze({
        source,
        declarationSource: emitDeclarationSource()
    });
}

/** @brief Wrap one transformed boolean bundle as an uninstrumented ESM module. */
export function emitSeaCurrentOptimizedModuleSource(
    bundle: CompiledSourceBundle
): SeaCurrentModuleSource {
    const source = [
        "const l=",
        serializeAotLiteralArray(bundle.literals),
        ";const r=",
        serializeAotRegExpArray(bundle.regexps),
        ";const k=",
        JSON.stringify(bundle.keysets),
        ";const u=",
        JSON.stringify(bundle.strings),
        ";const d=function(){return false;};",
        "const m=function(){return;};",
        "const mf=function(){return;};",
        "const sk=function(v,ks){if(typeof v!==\"object\"||v===null||Array.isArray(v))return false;const ps=Reflect.ownKeys(v);for(let i=0;i<ps.length;i+=1){const key=ps[i];if(typeof key!==\"string\"||!ks.includes(key))return false;}return true;};",
        "const __sc_predicate=(function(l,r,k,u,d,m,mf,sk){",
        bundle.source,
        "})(l,r,k,u,d,m,mf,sk);",
        emitHostileInputBoundarySource(""),
        "export default Object.freeze({is});",
        ""
    ].join("");
    return Object.freeze({
        source,
        declarationSource: [
            "export declare function is(value: unknown): boolean;",
            "declare const guard: { readonly is: typeof is; };",
            "export default guard;",
            ""
        ].join("\n")
    });
}

/** @brief Emit the standalone equivalent of compileBoolean's fail-closed edge. */
function emitHostileInputBoundarySource(onHostile: string): string {
    const inspectable = "const __sc_inspectable=function(v){if(typeof v!==\"object\"||v===null)return true;tr" +
        "y{Array.isArray(v);Object.getPrototypeOf(v);const ks=Reflect.ownKeys(v);if(ks.length!==0)Object.getOwnPropertyDescriptor(v,ks[0]);return true;}ca" +
        "tch{return false;}};";
    const predicate = "export function is(value){tr" +
        "y{return __sc_predicate(value)===true;}ca" +
        "tch{if(__sc_inspectable(value))throw new TypeError(\"SeaCurrent generated predicate failed\");";
    return [
        inspectable,
        predicate,
        onHostile,
        "return false;}}"
    ].join("");
}

/** @brief Emit allocation-on-demand artifact materialization source. */
function emitSnapshotFunctionSource(): string {
    return [
        "export function snapshot(){const regions=new Array(__sc_manifest.regions.length);",
        "for(let i=0;i<regions.length;i+=1){const m=__sc_manifest.regions[i];",
        "const edges=new Array(m.counters.length);for(let j=0;j<edges.length;j+=1){const c=m.counters[j];edges[j]=Object.freeze({edge:c.edge,count:",
        COUNTER_TABLE,
        "[c.slot]});}",
        "const checksums=new Array(m.checksums.length);for(let j=0;j<checksums.length;j+=1){const c=m.checksums[j];checksums[j]=Object.freeze({label:c.label,value:",
        CHECKSUM_TABLE,
        "[c.slot],modulus:c.modulus});}",
        "regions[i]=Object.freeze({id:m.id,structuralHash:m.structuralHash,frequency:",
        FREQUENCY_TABLE,
        "[m.frequencySlot],accepted:",
        COUNTER_TABLE,
        "[m.acceptedSlot],rejected:",
        COUNTER_TABLE,
        "[m.rejectedSlot],edges:Object.freeze(edges),checksums:Object.freeze(checksums)});}",
        "return Object.freeze({version:1,profileId:__sc_manifest.profileId,targetKey:__sc_manifest.targetKey,overflow:",
        OVERFLOW_TABLE,
        "[0]===1,regions:Object.freeze(regions)});}",
    ].join("");
}

/** @brief Emit declarations for the profiled standalone predicate module. */
function emitDeclarationSource(): string {
    return [
        "export interface SeaCurrentProfileEdge { readonly edge: string; readonly count: number; }",
        "export interface SeaCurrentProfileChecksum { readonly label: number; readonly value: number; readonly modulus: number; }",
        "export interface SeaCurrentProfileRegion { readonly id: string; readonly structuralHash: string; readonly frequency: number; readonly accepted: number; readonly rejected: number; readonly edges: readonly SeaCurrentProfileEdge[]; readonly checksums: readonly SeaCurrentProfileChecksum[]; }",
        "export interface SeaCurrentProfileArtifact { readonly version: 1; readonly profileId: string; readonly targetKey: string; readonly overflow: boolean; readonly regions: readonly SeaCurrentProfileRegion[]; }",
        "export declare function is(value: unknown): boolean;",
        "export declare function snapshot(): SeaCurrentProfileArtifact;",
        "export declare function reset(): void;",
        "declare const guard: { readonly is: typeof is; readonly snapshot: typeof snapshot; readonly reset: typeof reset; };",
        "export default guard;",
        ""
    ].join("\n");
}
