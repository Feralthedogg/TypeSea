export function makeMarkdown(report) {
    const lines = [
        "# Real-world Zod compatibility corpus",
        "",
        `Generated: ${report.generatedAt}`,
        "",
        "The corpus scans pinned public TypeScript sources without vendoring them.",
        "Counts describe observed Zod usage; compilation diagnostics compare the",
        "same self-contained files before and after replacing Zod imports.",
        "This is a compatibility measurement, not a claim of full semantic parity.",
        "",
        "## Summary",
        "",
        "| Metric | Result |",
        "| --- | ---: |",
        `| Repositories | ${report.totals.repositories} |`,
        `| Files importing Zod | ${report.totals.zodFiles} |`,
        `| Observed Zod calls | ${report.totals.callCount} |`,
        `| Unique static paths | ${report.observed.staticPaths.length} |`,
        `| Unique fluent methods | ${report.observed.methods.length} |`,
        `| Self-contained files compiled | ${report.compilation.candidateFiles} |`,
        `| New TypeSea diagnostics | ${report.compilation.regressionDiagnostics} |`,
        `| Missing static paths | ${report.support.missingStaticPaths.length} |`,
        `| Missing fluent methods | ${report.support.missingMethods.length} |`,
        `| Missing declaration exports | ${report.support.missingDeclarationExports.length} |`,
        ""
    ];
    if (report.compilation.regressionDiagnostics === 0) {
        lines.push(
            "The sampled self-contained files compile without replacement-only diagnostics.",
            "This result measures the pinned corpus and does not prove full Zod semantic parity.",
            "The zero budgets prevent later compatibility drift from entering unnoticed.",
            ""
        );
    } else {
        lines.push(
            "The non-zero TypeSea diagnostic count means the facade is not a drop-in",
            "replacement for every observed program. The machine-readable snapshot keeps",
            "all diagnostics so later work can reduce, but not silently increase, this baseline.",
            ""
        );
    }
    lines.push(
        "## Repositories",
        "",
        "| Repository | Commit | License | Zod files | Calls |",
        "| --- | --- | --- | ---: | ---: |"
    );
    for (let index = 0; index < report.repositories.length; index += 1) {
        const entry = report.repositories[index];
        if (entry !== undefined) {
            lines.push(`| [${entry.repository}](${entry.sourceUrl}) | \`${entry.commit.slice(0, 12)}\` | ${entry.license} | ${entry.zodFiles} | ${entry.callCount} |`);
        }
    }
    lines.push(
        "",
        "## Compatibility gaps",
        "",
        `- Static paths: ${formatList(report.support.missingStaticPaths)}`,
        `- Fluent methods: ${formatList(report.support.missingMethods)}`,
        `- Type exports: ${formatList(report.support.missingDeclarationExports)}`,
        "",
        "## Most frequent static APIs",
        "",
        makeCountTable(report.observed.staticPaths.slice(0, 30)),
        "",
        "## Most frequent fluent methods",
        "",
        makeCountTable(report.observed.methods.slice(0, 30)),
        "",
        "## Compilation regressions",
        ""
    );
    if (report.compilation.regressions.length === 0) {
        lines.push("No TypeSea-only diagnostics were produced.");
    } else {
        for (let index = 0; index < report.compilation.regressions.length; index += 1) {
            const item = report.compilation.regressions[index];
            if (item !== undefined) {
                lines.push(`- \`${item.path}:${item.line}:${item.character}\` TS${item.code}: ${item.message}`);
            }
        }
    }
    lines.push("");
    return lines.join("\n");
}

function makeCountTable(items) {
    const lines = ["| API | Calls |", "| --- | ---: |"];
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (item !== undefined) {
            lines.push(`| \`${item.name}\` | ${item.count} |`);
        }
    }
    return lines.join("\n");
}

function formatList(items) {
    return items.length === 0 ? "none" : items.map((item) => `\`${item}\``).join(", ");
}
