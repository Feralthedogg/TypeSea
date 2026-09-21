#!/usr/bin/env node

/*
 * Opt-in native validation profile for the first-issue and state-allocation
 * changes. The module path is explicit so a baseline dist tree and a candidate
 * dist tree can be measured by the same file without changing source imports.
 */

import os from "node:os";
import process from "node:process";

const args = process.argv.slice(2);
const moduleFlag = args.indexOf("--module");
if (moduleFlag < 0 || args[moduleFlag + 1] === undefined) {
    throw new Error("usage: node bench/native-validation-profile.mjs --module /absolute/path/to/index.js");
}
const modulePath = args[moduleFlag + 1];
if (!modulePath.startsWith("/")) {
    throw new Error("--module must be an absolute path");
}

const { t } = await import(modulePath);

const rounds = 7;
const warmupRounds = 2;
const sink = { value: 0 };

function consume(result) {
    sink.value = (sink.value + (result.ok ? 1 : result.error.length + 3)) | 0;
}

function runOne(mode, guard, value) {
    if (mode === "is") {
        sink.value = (sink.value + (guard.is(value) ? 1 : 0)) | 0;
        return;
    }
    consume(mode === "checkFirst" ? guard.checkFirst(value) : guard.check(value));
}

function measure(name, mode, guard, values, iterations) {
    for (let round = 0; round < warmupRounds; round += 1) {
        for (let index = 0; index < iterations; index += 1) {
            runOne(mode, guard, values[index % values.length]);
        }
    }

    const samples = [];
    for (let round = 0; round < rounds; round += 1) {
        const start = process.hrtime.bigint();
        for (let index = 0; index < iterations; index += 1) {
            runOne(mode, guard, values[index % values.length]);
        }
        const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
        samples.push((elapsed * 1e6) / iterations);
    }
    const ordered = [...samples].sort((left, right) => left - right);
    return {
        case: name,
        mode,
        iterations,
        medianNs: ordered[Math.floor(ordered.length / 2)],
        rangeNs: {
            min: ordered[0],
            max: ordered[ordered.length - 1]
        },
        rounds,
        warmupRounds
    };
}

const primitive = t.number.int();
const nested = t.object({
    id: t.string,
    payload: t.object({
        count: t.number.int(),
        label: t.string
    })
});
const array = t.array(t.number.int());

const primitiveValues = [1, 2, 3, 4, 5, 6, 7, 8];
const nestedValues = Array.from({ length: 64 }, (_, index) => ({
    id: `id-${String(index)}`,
    payload: {
        count: index,
        label: `label-${String(index)}`
    }
}));
const firstFailure16 = [
    "bad",
    ...Array.from({ length: 15 }, (_, index) => index)
];
const lastFailure16 = [
    ...Array.from({ length: 15 }, (_, index) => index),
    "bad"
];
const firstFailure1024 = [
    "bad",
    ...Array.from({ length: 1023 }, (_, index) => index)
];
const lastFailure1024 = [
    ...Array.from({ length: 1023 }, (_, index) => index),
    "bad"
];

const cases = [
    ["primitive-number", primitive, primitiveValues, 200_000],
    ["nested-object-64", nested, nestedValues, 50_000],
    ["array-invalid-16-first", array, [firstFailure16], 20_000],
    ["array-invalid-16-last", array, [lastFailure16], 20_000],
    ["array-invalid-1024-first", array, [firstFailure1024], 1_000],
    ["array-invalid-1024-last", array, [lastFailure1024], 1_000]
];
const results = [];
for (const [name, guard, values, iterations] of cases) {
    for (const mode of ["is", "checkFirst", "check"]) {
        results.push(measure(name, mode, guard, values, iterations));
    }
}

console.log(JSON.stringify({
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    cpus: os.cpus().length,
    module: modulePath,
    sink: sink.value,
    results
}, null, 2));
