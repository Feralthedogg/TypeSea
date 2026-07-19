/**
 * @file profile.ts
 * @brief Hostile-safe admission of serialized SeaCurrent profile generations.
 */

import {
    err,
    ok,
    type Result
} from "../../result/index.js";
import {
    isArrayValue,
    isPlainRecord,
    readOwnDataProperty
} from "../../evaluate/shared.js";
import type { SeaCurrentRegionProfile } from "../types.js";
import type {
    SeaCurrentBridgeIssue,
    SeaCurrentBridgeIssueCode,
    SeaCurrentInstrumentationManifest,
    SeaCurrentProfileIngestOptions
} from "./types.js";

const READ_FAILURE = Symbol("SeaCurrentProfileReadFailure");

/** @brief Descriptor-only view over one admitted artifact array. */
interface ArtifactArrayView {
    readonly source: object;
    readonly length: number;
}

/**
 * @brief Validate an unknown profile artifact against one exact manifest.
 * @param manifest Instrumentation identity generated for the source graph.
 * @param artifact Unknown deserialized runtime value.
 * @param options Uncertainty assigned to accepted region profiles.
 * @returns Region profiles or frozen structural admission issues.
 */
export function ingestSeaCurrentProfile(
    manifest: SeaCurrentInstrumentationManifest,
    artifact: unknown,
    options: SeaCurrentProfileIngestOptions = {}
): Result<Readonly<Record<string, SeaCurrentRegionProfile>>, readonly SeaCurrentBridgeIssue[]> {
    const issues: SeaCurrentBridgeIssue[] = [];
    const root = readRecord(artifact);
    if (root === undefined) {
        return err(freezeIssues([
            issue("invalid_artifact", "SeaCurrent profile artifact must be a plain record")
        ]));
    }
    compareScalar(root, "version", 1, "unsupported_version", issues);
    compareScalar(root, "profileId", manifest.profileId, "profile_id_mismatch", issues);
    compareScalar(root, "targetKey", manifest.targetKey, "target_mismatch", issues);
    const overflow = readOwn(root, "overflow");
    if (overflow !== false) {
        issues.push(issue(
            overflow === true ? "counter_overflow" : "invalid_artifact",
            overflow === true
                ? "SeaCurrent profile counters exceeded the exact integer range"
                : "SeaCurrent profile overflow flag must be boolean false"
        ));
    }
    const sourceRegions = readArray(readOwn(root, "regions"));
    if (sourceRegions === undefined) {
        issues.push(issue("invalid_artifact", "SeaCurrent profile regions must be an array"));
        return err(freezeIssues(issues));
    }
    if (sourceRegions.length !== manifest.regions.length) {
        issues.push(issue("region_mismatch", "SeaCurrent profile region count does not match"));
    }
    const regionById = indexRegions(sourceRegions, manifest.regions.length, issues);
    const profiles: Record<string, SeaCurrentRegionProfile> = {};
    const uncertainty = normalizeUncertainty(options.uncertainty);
    for (const expected of manifest.regions) {
        const source = regionById.get(expected.id);
        if (source === undefined) {
            issues.push(issue(
                "region_mismatch",
                `SeaCurrent profile is missing region ${expected.id}`,
                expected.id
            ));
            continue;
        }
        const structuralHash = readOwn(source, "structuralHash");
        if (structuralHash !== expected.structuralHash) {
            issues.push(issue(
                "structural_hash_mismatch",
                `SeaCurrent region ${expected.id} has a stale structural hash`,
                expected.id
            ));
        }
        const frequency = readSafeCount(readOwn(source, "frequency"));
        if (frequency === undefined) {
            issues.push(issue(
                "invalid_artifact",
                `SeaCurrent region ${expected.id} has an invalid frequency`,
                expected.id
            ));
            continue;
        }
        const accepted = readSafeCount(readOwn(source, "accepted"));
        const rejected = readSafeCount(readOwn(source, "rejected"));
        if (accepted === undefined || rejected === undefined ||
            accepted + rejected !== frequency) {
            issues.push(issue(
                "outcome_mismatch",
                `SeaCurrent region ${expected.id} outcome counts do not match its frequency`,
                expected.id
            ));
            continue;
        }
        const edgeCounts = readEdgeCounts(source, expected, issues);
        validateChecksums(source, expected, issues);
        Object.defineProperty(profiles, expected.id, {
            configurable: false,
            enumerable: true,
            writable: false,
            value: Object.freeze({
                frequency,
                accepted,
                rejected,
                uncertainty,
                edgeCounts
            })
        });
    }
    if (issues.length !== 0) {
        return err(freezeIssues(issues));
    }
    return ok(Object.freeze(profiles));
}

/** @brief Index region records while rejecting malformed and duplicate ids. */
function indexRegions(
    regions: ArtifactArrayView,
    expectedLength: number,
    issues: SeaCurrentBridgeIssue[]
): ReadonlyMap<string, object> {
    const result = new Map<string, object>();
    if (regions.length !== expectedLength) {
        return result;
    }
    for (let index = 0; index < regions.length; index += 1) {
        const region = readRecord(readArrayElement(regions, index));
        const id = region === undefined ? READ_FAILURE : readOwn(region, "id");
        if (region === undefined || typeof id !== "string") {
            issues.push(issue("invalid_artifact", `SeaCurrent region ${String(index)} is invalid`));
            continue;
        }
        if (result.has(id)) {
            issues.push(issue("region_mismatch", `SeaCurrent region ${id} is duplicated`, id));
            continue;
        }
        result.set(id, region);
    }
    return result;
}

/** @brief Read the exact expected edge vector into a null-prototype record. */
function readEdgeCounts(
    source: object,
    expected: SeaCurrentInstrumentationManifest["regions"][number],
    issues: SeaCurrentBridgeIssue[]
): Readonly<Record<string, number>> {
    const values = readArray(readOwn(source, "edges"));
    const counts = Object.create(null) as Record<string, number>;
    if (values === undefined) {
        issues.push(issue(
            "counter_mismatch",
            `SeaCurrent region ${expected.id} edge counters must be an array`,
            expected.id
        ));
        return Object.freeze(counts);
    }
    if (values.length !== expected.counters.length) {
        issues.push(issue(
            "counter_mismatch",
            `SeaCurrent region ${expected.id} edge counter count does not match`,
            expected.id
        ));
        return Object.freeze(counts);
    }
    const byEdge = new Map<string, number>();
    for (let index = 0; index < values.length; index += 1) {
        const value = readRecord(readArrayElement(values, index));
        const edge = value === undefined ? READ_FAILURE : readOwn(value, "edge");
        const count = value === undefined ? undefined : readSafeCount(readOwn(value, "count"));
        if (typeof edge !== "string" || count === undefined || byEdge.has(edge)) {
            issues.push(issue(
                "counter_mismatch",
                `SeaCurrent region ${expected.id} has an invalid edge counter`,
                expected.id
            ));
            continue;
        }
        byEdge.set(edge, count);
    }
    for (const descriptor of expected.counters) {
        const count = byEdge.get(descriptor.edge);
        if (count === undefined) {
            issues.push(issue(
                "counter_mismatch",
                `SeaCurrent region ${expected.id} is missing edge ${descriptor.edge}`,
                expected.id
            ));
        } else {
            Object.defineProperty(counts, descriptor.edge, {
                configurable: false,
                enumerable: true,
                writable: false,
                value: count
            });
        }
    }
    return Object.freeze(counts);
}

/** @brief Validate checksum labels, modulus values, and bounded residues. */
function validateChecksums(
    source: object,
    expected: SeaCurrentInstrumentationManifest["regions"][number],
    issues: SeaCurrentBridgeIssue[]
): void {
    const values = readArray(readOwn(source, "checksums"));
    if (values?.length !== expected.checksums.length) {
        issues.push(issue(
            "checksum_mismatch",
            `SeaCurrent region ${expected.id} checksum layout does not match`,
            expected.id
        ));
        return;
    }
    const expectedByLabel = new Map(expected.checksums.map((value) => [value.label, value]));
    const seen = new Set<number>();
    for (let index = 0; index < values.length; index += 1) {
        const value = readRecord(readArrayElement(values, index));
        const label = value === undefined ? undefined : readSafeCount(readOwn(value, "label"));
        const residue = value === undefined ? undefined : readSafeCount(readOwn(value, "value"));
        const modulus = value === undefined ? undefined : readSafeCount(readOwn(value, "modulus"));
        const descriptor = label === undefined ? undefined : expectedByLabel.get(label);
        if (label === undefined || descriptor === undefined || residue === undefined ||
            modulus !== descriptor.modulus ||
            residue >= descriptor.modulus || seen.has(label)) {
            issues.push(issue(
                "checksum_mismatch",
                `SeaCurrent region ${expected.id} has an invalid checksum`,
                expected.id
            ));
            continue;
        }
        seen.add(label);
    }
}

/** @brief Compare one scalar artifact identity field. */
function compareScalar(
    source: object,
    key: string,
    expected: string | number,
    code: SeaCurrentBridgeIssueCode,
    issues: SeaCurrentBridgeIssue[]
): void {
    if (readOwn(source, key) !== expected) {
        issues.push(issue(code, `SeaCurrent profile ${key} does not match`));
    }
}

/** @brief Build one immutable issue record. */
function issue(
    code: SeaCurrentBridgeIssueCode,
    message: string,
    region?: string
): SeaCurrentBridgeIssue {
    return Object.freeze({ code, message, region });
}

/** @brief Freeze the issue vector before returning it to callers. */
function freezeIssues(issues: SeaCurrentBridgeIssue[]): readonly SeaCurrentBridgeIssue[] {
    return Object.freeze(issues);
}

/** @brief Clamp caller-owned profile uncertainty to its probability domain. */
function normalizeUncertainty(value: number | undefined): number {
    return value !== undefined && Number.isFinite(value)
        ? Math.max(0, Math.min(1, value))
        : 0;
}

/** @brief Admit a non-negative exact JavaScript integer count. */
function readSafeCount(value: unknown): number | undefined {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
        ? value
        : undefined;
}

/** @brief Admit a non-array object without leaking revoked-proxy failures. */
function readRecord(value: unknown): object | undefined {
    return isPlainRecord(value) ? value : undefined;
}

/** @brief Admit an array through its own length descriptor only. */
function readArray(value: unknown): ArtifactArrayView | undefined {
    if (!isArrayValue(value)) {
        return undefined;
    }
    const length = readOwnDataProperty(value, "length")?.value;
    if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) {
        return undefined;
    }
    return Object.freeze({ source: value, length });
}

/** @brief Read one dense artifact element without invoking an index accessor. */
function readArrayElement(view: ArtifactArrayView, index: number): unknown {
    return readOwn(view.source, index);
}

/** @brief Read one own data property without invoking accessors. */
function readOwn(source: object, key: PropertyKey): unknown {
    return readOwnDataProperty(source, key)?.value ?? READ_FAILURE;
}
