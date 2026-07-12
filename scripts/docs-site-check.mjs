import { readdir, readFile } from "node:fs/promises";

const documentPairs = [
    ["README.md", "docs/ko/readme.md"],
    ["docs/api.md", "docs/ko/api.md"],
    ["docs/zod-compatibility.md", "docs/ko/zod-compatibility.md"],
    ["docs/zod-real-world-compat.md", "docs/ko/zod-real-world-compat.md"],
    ["docs/aot-plugin.md", "docs/ko/aot-plugin.md"],
    ["docs/seaflow.md", "docs/ko/seaflow.md"],
    ["docs/sea-breeze.md", "docs/ko/sea-breeze.md"],
    ["docs/project-direction.md", "docs/ko/project-direction.md"],
    ["docs/engine-notes.md", "docs/ko/engine-notes.md"]
];

const result = await main();
if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
}

/**
 * @brief Validate the documentation source boundary without installing the site toolchain.
 * @details GitHub Pages performs the full pnpm build; the root release gate checks inputs
 * so package verification stays independent from website-only dependencies.
 */
async function main() {
    const failures = [];
    await checkDocumentPairs(failures);
    await checkMessages(failures);
    await checkSiteConfiguration(failures);
    await checkPagesWorkflow(failures);
    await checkLegacyOutputRemoved(failures);
    if (failures.length !== 0) {
        return err(failures.join("\n"));
    }
    return ok(undefined);
}

/** Validate that every maintained English document has a non-empty Korean peer. */
async function checkDocumentPairs(failures) {
    for (const pair of documentPairs) {
        const [englishPath, koreanPath] = pair;
        if (englishPath === undefined || koreanPath === undefined) {
            continue;
        }
        const [english, korean] = await Promise.all([
            readFile(englishPath, "utf8"),
            readFile(koreanPath, "utf8")
        ]);
        expect(english.trim().startsWith("# "), `${englishPath} must start with an H1`, failures);
        expect(korean.trim().startsWith("# "), `${koreanPath} must start with an H1`, failures);
        expect(english.trim().length !== 0, `${englishPath} must not be empty`, failures);
        expect(korean.trim().length !== 0, `${koreanPath} must not be empty`, failures);
        expect(
            countHeadings(english, 2) === countHeadings(korean, 2),
            `${englishPath} and ${koreanPath} must expose the same H2 count`,
            failures
        );
    }
}

/** Paraglide message keys are a compile-time UI contract and must remain symmetric. */
async function checkMessages(failures) {
    const [englishText, koreanText] = await Promise.all([
        readFile("website/messages/en.json", "utf8"),
        readFile("website/messages/ko.json", "utf8")
    ]);
    const english = JSON.parse(englishText);
    const korean = JSON.parse(koreanText);
    if (!isRecord(english) || !isRecord(korean)) {
        failures.push("Paraglide message catalogs must be objects");
        return;
    }
    const englishKeys = Object.keys(english).sort();
    const koreanKeys = Object.keys(korean).sort();
    expect(
        JSON.stringify(englishKeys) === JSON.stringify(koreanKeys),
        "English and Korean Paraglide catalogs must contain identical keys",
        failures
    );
    for (const key of englishKeys) {
        if (key === "$schema") {
            continue;
        }
        expect(isNonEmptyString(english[key]), `English message ${key} must be non-empty`, failures);
        expect(isNonEmptyString(korean[key]), `Korean message ${key} must be non-empty`, failures);
    }
}

/** Verify the framework, localization, and Lily source-copy boundaries. */
async function checkSiteConfiguration(failures) {
    const [packageText, inlangText, viteSource, componentsText] = await Promise.all([
        readFile("website/package.json", "utf8"),
        readFile("website/project.inlang/settings.json", "utf8"),
        readFile("website/vite.config.ts", "utf8"),
        readFile("website/components.json", "utf8")
    ]);
    const metadata = JSON.parse(packageText);
    const inlang = JSON.parse(inlangText);
    const components = JSON.parse(componentsText);
    expect(isRecord(metadata) && metadata.packageManager === "pnpm@10.13.1", "website must pin pnpm 10.13.1", failures);
    expect(
        isRecord(metadata) && isRecord(metadata.devDependencies) &&
            typeof metadata.devDependencies["@sveltejs/kit"] === "string" &&
            typeof metadata.devDependencies["@inlang/paraglide-js"] === "string",
        "website must declare SvelteKit and Paraglide",
        failures
    );
    expect(
        isRecord(inlang) && inlang.baseLocale === "en" &&
            Array.isArray(inlang.locales) && inlang.locales.join(",") === "en,ko",
        "inlang must declare English and Korean locales",
        failures
    );
    expect(viteSource.includes("strategy: ['url', 'cookie', 'baseLocale']"), "Paraglide URL strategy must remain explicit", failures);
    expect(viteSource.includes("adapter-static"), "website must use the SvelteKit static adapter", failures);
    expect(
        isRecord(components) && components.registry === "https://lily-svelte.pages.dev/registry",
        "website must retain the Lily registry boundary",
        failures
    );
}

/** Pages must install and build the isolated pnpm application. */
async function checkPagesWorkflow(failures) {
    const workflow = await readFile(".github/workflows/pages.yml", "utf8");
    expect(workflow.includes("pnpm/action-setup"), "Pages workflow must set up pnpm", failures);
    expect(workflow.includes("website/pnpm-lock.yaml"), "Pages workflow must cache the website lockfile", failures);
    expect(workflow.includes("path: website/build"), "Pages workflow must upload website/build", failures);
    expect(workflow.includes("BASE_PATH: /TypeSea"), "Pages workflow must configure the repository base path", failures);
}

/** A generated HTML copy would create a second, stale documentation source. */
async function checkLegacyOutputRemoved(failures) {
    const docsEntries = await readdir("docs");
    expect(!docsEntries.includes("index.html"), "docs/index.html must not be checked in", failures);
}

function countHeadings(source, level) {
    const marker = "#".repeat(level);
    return source.split("\n").filter((line) => line.startsWith(`${marker} `)).length;
}

function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length !== 0;
}

function expect(condition, message, failures) {
    if (!condition) {
        failures.push(message);
    }
}

function ok(value) {
    return { ok: true, value };
}

function err(error) {
    return { ok: false, error };
}
