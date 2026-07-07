import { readFile, writeFile } from "node:fs/promises";

const sourceFiles = [
    {
        title: "README",
        titleKo: "README",
        id: "readme",
        path: "README.md",
        koPath: "docs/ko/readme.md"
    },
    {
        title: "API Reference",
        titleKo: "API 레퍼런스",
        id: "api-reference",
        path: "docs/api.md",
        koPath: "docs/ko/api.md"
    },
    {
        title: "SeaFlow Fuzzer",
        titleKo: "SeaFlow 퍼저",
        id: "seaflow",
        path: "docs/seaflow.md",
        koPath: "docs/ko/seaflow.md"
    },
    {
        title: "Engine Notes",
        titleKo: "엔진 설계 노트",
        id: "engine-notes",
        path: "docs/engine-notes.md",
        koPath: "docs/ko/engine-notes.md"
    }
];

const outputPath = "docs/index.html";
const isCheckMode = process.argv.includes("--check");

const result = await main();
if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
}

/**
 * @brief Build the static documentation site.
 * @details The output is plain HTML and CSS so GitHub Pages can serve it without runtime code.
 */
async function main() {
    const packageVersion = await readPackageVersion();
    const sources = [];
    for (let index = 0; index < sourceFiles.length; index += 1) {
        const file = sourceFiles[index];
        if (file !== undefined) {
            sources.push({
                ...file,
                markdown: await readFile(file.path, "utf8"),
                koMarkdown: await readFile(file.koPath, "utf8")
            });
        }
    }
    const html = renderSite(sources, packageVersion);
    if (isCheckMode) {
        const current = await readFile(outputPath, "utf8");
        if (current !== html) {
            return err("docs/index.html is stale; run npm run docs:build");
        }
        return ok(undefined);
    }
    await writeFile(outputPath, html, "utf8");
    return ok(undefined);
}

/**
 * @brief Read the package version shown in the generated documentation shell.
 * @returns Release version stored in package.json.
 */
async function readPackageVersion() {
    const text = await readFile("package.json", "utf8");
    const metadata = JSON.parse(text);
    if (!isRecord(metadata) || typeof metadata.version !== "string") {
        throw new Error("package.json must contain a string version");
    }
    return metadata.version;
}

/**
 * @brief Render the whole documentation shell.
 * @param sources Markdown source records.
 * @param packageVersion Release version displayed in the sidebar.
 * @returns Complete HTML document.
 */
function renderSite(sources, packageVersion) {
    const rendered = sources.map((source) => renderSourceDocument(source)).join("\n");
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta
      name="description"
      content="TypeSea documentation: complete README, API reference, and engine notes for zero-dependency TypeScript runtime validation."
    >
    <title>TypeSea Docs</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: #f6f8f7;
        --surface: #ffffff;
        --surface-2: #eef2ef;
        --ink: #1c2422;
        --muted: #5c6a64;
        --line: #dbe2dc;
        --accent: #0f7a5c;
        --accent-ink: #0b5c46;
        --accent-soft: #d9f2e7;
        --amber: #b45309;
        --amber-soft: #fdecd3;
        --violet: #6d28d9;
        --violet-soft: #ede9fe;
        --code-bg: #14181f;
        --code-ink: #e8eef5;
        --code-comment: #8b98a9;
        --sidebar-bg: #1d2422;
        --sidebar-ink: #e9efe9;
        --sidebar-muted: #9faea5;
        --sidebar-line: rgba(233, 239, 233, 0.12);
        --shadow: 0 10px 30px rgba(28, 36, 34, 0.07);
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #12171a;
          --surface: #191f23;
          --surface-2: #1f272c;
          --ink: #e4eae6;
          --muted: #97a49d;
          --line: #2a333a;
          --accent: #34c496;
          --accent-ink: #7fe0c0;
          --accent-soft: rgba(52, 196, 150, 0.16);
          --amber: #f0a24a;
          --amber-soft: rgba(240, 162, 74, 0.16);
          --violet: #a78bfa;
          --violet-soft: rgba(167, 139, 250, 0.16);
          --code-bg: #0d1116;
          --code-ink: #dde5ee;
          --sidebar-bg: #151b1e;
          --shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
        }
      }

      * {
        box-sizing: border-box;
      }

      html {
        scroll-behavior: smooth;
      }

      body {
        min-width: 320px;
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
        font-size: 15px;
        line-height: 1.62;
      }

      a {
        color: inherit;
        text-decoration: none;
      }

      code,
      pre {
        font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace;
      }

      p code,
      li code,
      td code {
        border-radius: 5px;
        padding: 1px 5px;
        background: var(--surface-2);
        font-size: 0.92em;
      }

      .language-radio {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
      }

      .shell {
        display: grid;
        min-height: 100vh;
        grid-template-columns: 284px minmax(0, 1fr);
      }

      .sidebar {
        position: sticky;
        top: 0;
        display: flex;
        flex-direction: column;
        height: 100vh;
        border-right: 1px solid var(--sidebar-line);
        background: var(--sidebar-bg);
        color: var(--sidebar-ink);
        overflow-y: auto;
      }

      .brand {
        display: flex;
        align-items: baseline;
        gap: 10px;
        padding: 26px 22px 6px;
      }

      .brand h1 {
        margin: 0;
        font-size: 22px;
        line-height: 1;
      }

      .brand .version {
        border-radius: 999px;
        padding: 2px 8px;
        background: rgba(52, 196, 150, 0.18);
        color: #7fe0c0;
        font-size: 11px;
        font-weight: 700;
      }

      .brand-tagline {
        margin: 0;
        padding: 0 22px 18px;
        border-bottom: 1px solid var(--sidebar-line);
        color: var(--sidebar-muted);
        font-size: 12.5px;
      }

      .nav {
        flex: 1;
        padding: 8px 12px 18px;
      }

      .nav-group {
        margin: 14px 0 4px;
        padding: 0 12px;
        color: var(--sidebar-muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .nav a {
        display: flex;
        align-items: center;
        min-height: 32px;
        border-left: 2px solid transparent;
        border-radius: 0 7px 7px 0;
        margin: 1px 0;
        padding: 5px 12px;
        color: var(--sidebar-ink);
        opacity: 0.84;
        font-size: 13px;
      }

      .nav a:hover,
      .nav a:focus {
        background: rgba(255, 255, 255, 0.07);
        opacity: 1;
      }

      .sidebar-foot {
        padding: 14px 22px 20px;
        border-top: 1px solid var(--sidebar-line);
        color: var(--sidebar-muted);
        font-size: 12px;
      }

      .content {
        min-width: 0;
      }

      .topbar {
        position: sticky;
        top: 0;
        z-index: 5;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 56px;
        border-bottom: 1px solid var(--line);
        padding: 0 34px;
        background: color-mix(in srgb, var(--bg) 90%, transparent);
        backdrop-filter: blur(10px);
      }

      .topbar-crumb {
        color: var(--muted);
        font-size: 13px;
      }

      .topbar-crumb strong {
        color: var(--ink);
        font-weight: 650;
      }

      .topbar-actions,
      .topbar-links {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
      }

      .topbar-links a,
      .language-switch label {
        border: 1px solid var(--line);
        border-radius: 7px;
        padding: 5px 11px;
        background: var(--surface);
        color: var(--ink);
        font-size: 12.5px;
      }

      .language-switch {
        display: inline-flex;
        gap: 4px;
      }

      .language-switch label {
        cursor: pointer;
        font-weight: 700;
      }

      #language-en:checked ~ .shell label[for="language-en"],
      #language-ko:checked ~ .shell label[for="language-ko"] {
        border-color: var(--accent);
        background: var(--accent-soft);
        color: var(--accent-ink);
      }

      .locale-ko,
      .i18n-ko {
        display: none;
      }

      #language-ko:checked ~ .shell .locale-en,
      #language-ko:checked ~ .shell .i18n-en {
        display: none;
      }

      #language-ko:checked ~ .shell .locale-ko {
        display: block;
      }

      #language-ko:checked ~ .shell .i18n-ko {
        display: inline;
      }

      main {
        max-width: 980px;
        margin: 0 auto;
        padding: 40px 34px 84px;
      }

      section,
      article.source-doc {
        padding: 30px 0 36px;
        border-bottom: 1px solid var(--line);
        scroll-margin-top: 74px;
      }

      section:first-child {
        padding-top: 0;
      }

      .eyebrow {
        margin: 0 0 6px;
        color: var(--accent);
        font-size: 12px;
        font-weight: 750;
        letter-spacing: 0.07em;
        text-transform: uppercase;
      }

      h2 {
        margin: 0 0 10px;
        font-size: 26px;
        line-height: 1.2;
      }

      h3 {
        margin: 24px 0 8px;
        font-size: 18px;
        line-height: 1.3;
      }

      h4 {
        margin: 20px 0 8px;
        font-size: 15px;
      }

      p {
        margin: 0 0 12px;
      }

      .lede {
        max-width: 760px;
        margin-bottom: 16px;
        color: var(--muted);
        font-size: 15.5px;
      }

      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 310px;
        gap: 28px;
        align-items: start;
      }

      .status-panel,
      .tile,
      .admonition {
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--surface);
        box-shadow: var(--shadow);
      }

      .status-panel header {
        border-bottom: 1px solid var(--line);
        padding: 11px 16px;
        background: var(--surface-2);
        font-size: 13px;
        font-weight: 700;
      }

      .status-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 40px;
        border-bottom: 1px solid var(--line);
        padding: 8px 16px;
        font-size: 13.5px;
      }

      .status-row:last-child {
        border-bottom: 0;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 2px 9px;
        background: var(--accent-soft);
        color: var(--accent-ink);
        font-size: 11.5px;
        font-weight: 700;
        white-space: nowrap;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-top: 16px;
      }

      .grid.two {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .tile {
        padding: 15px 16px;
      }

      .tile h3 {
        margin-top: 0;
        font-size: 14.5px;
      }

      .tile p {
        margin: 0 0 8px;
        color: var(--muted);
        font-size: 13px;
      }

      .checklist {
        display: grid;
        gap: 8px;
        margin: 16px 0 0;
        padding: 0;
        list-style: none;
      }

      .checklist li {
        position: relative;
        padding-left: 24px;
        color: var(--muted);
        font-size: 14px;
      }

      .checklist li::before {
        position: absolute;
        left: 0;
        top: 1px;
        color: var(--accent);
        font-weight: 700;
        content: "✓";
      }

      .doc-content a {
        color: var(--accent-ink);
        text-decoration: underline;
        text-underline-offset: 2px;
      }

      .doc-content ul,
      .doc-content ol {
        margin: 0 0 14px;
        padding-left: 24px;
      }

      .doc-content li {
        margin: 4px 0;
      }

      .code-block,
      .doc-content pre {
        margin: 16px 0;
        border-radius: 10px;
        overflow-x: auto;
        background: var(--code-bg);
        color: var(--code-ink);
      }

      .code-block pre,
      .doc-content pre {
        padding: 16px 18px;
        font-size: 13px;
        line-height: 1.6;
      }

      .doc-content pre code {
        background: transparent;
        padding: 0;
        color: inherit;
      }

      .table-wrap {
        margin: 16px 0;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--surface);
        overflow-x: auto;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13.5px;
      }

      th,
      td {
        border-bottom: 1px solid var(--line);
        padding: 10px 14px;
        text-align: left;
        vertical-align: top;
      }

      th {
        background: var(--surface-2);
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        white-space: nowrap;
      }

      tr:last-child td {
        border-bottom: 0;
      }

      .admonition {
        margin: 16px 0;
        border-left: 3px solid var(--accent);
        padding: 13px 15px;
        box-shadow: none;
      }

      .admonition.warning,
      .admonition.caution {
        border-left-color: var(--amber);
      }

      .admonition-title {
        display: block;
        margin-bottom: 5px;
        color: var(--ink);
        font-size: 13px;
        font-weight: 750;
      }

      .admonition p:last-child {
        margin-bottom: 0;
      }

      .source-doc > header {
        margin-bottom: 18px;
      }

      .source-doc > header p {
        color: var(--muted);
        font-size: 13.5px;
      }

      .benchmark-image {
        display: block;
        max-width: 100%;
        height: auto;
        margin: 16px 0;
        border-radius: 10px;
      }

      .muted-link {
        color: var(--muted);
      }

      hr {
        height: 1px;
        border: 0;
        margin: 28px 0;
        background: var(--line);
      }

      @media (max-width: 980px) {
        .shell {
          grid-template-columns: 1fr;
        }

        .sidebar {
          position: static;
          height: auto;
        }

        .hero {
          grid-template-columns: 1fr;
        }

        .grid,
        .grid.two {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 640px) {
        .topbar {
          position: static;
          flex-direction: column;
          align-items: flex-start;
          padding: 12px 18px;
        }

        .topbar-actions {
          justify-content: flex-start;
        }

        main {
          padding: 28px 18px 56px;
        }

        .grid,
        .grid.two {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <input class="language-radio" type="radio" name="docs-language" id="language-en" checked>
    <input class="language-radio" type="radio" name="docs-language" id="language-ko">
    <div class="shell">
      <aside class="sidebar" aria-label="Documentation navigation">
        <div class="brand">
          <h1>TypeSea</h1>
          <span class="version">v${escapeHtml(packageVersion)}</span>
        </div>
        <p class="brand-tagline">
          <span class="i18n-en">Complete docs from README.md, docs/api.md, and docs/engine-notes.md.</span>
          <span class="i18n-ko" lang="ko">README, API 레퍼런스, 엔진 노트를 한 곳에 모은 문서입니다.</span>
        </p>
        <nav class="nav">
          <p class="nav-group">
            <span class="i18n-en">Start</span>
            <span class="i18n-ko" lang="ko">시작</span>
          </p>
          <a href="#overview">
            <span class="i18n-en">Overview</span>
            <span class="i18n-ko" lang="ko">개요</span>
          </a>
          <a href="#quick-start">
            <span class="i18n-en">Quick start</span>
            <span class="i18n-ko" lang="ko">빠른 시작</span>
          </a>
          <a href="#architecture">
            <span class="i18n-en">Architecture</span>
            <span class="i18n-ko" lang="ko">아키텍처</span>
          </a>
          <a href="#api">
            <span class="i18n-en">API map</span>
            <span class="i18n-ko" lang="ko">API 지도</span>
          </a>
          <a href="#adapters">
            <span class="i18n-en">Adapters</span>
            <span class="i18n-ko" lang="ko">어댑터</span>
          </a>
          <a href="#benchmarks">
            <span class="i18n-en">Benchmarks</span>
            <span class="i18n-ko" lang="ko">벤치마크</span>
          </a>
          <a href="#release">
            <span class="i18n-en">Release gate</span>
            <span class="i18n-ko" lang="ko">릴리스 게이트</span>
          </a>
          <a href="#files">
            <span class="i18n-en">Source files</span>
            <span class="i18n-ko" lang="ko">원본 파일</span>
          </a>
          <p class="nav-group">
            <span class="i18n-en">Full Documents</span>
            <span class="i18n-ko" lang="ko">전체 문서</span>
          </p>
          <a href="#readme">README</a>
          <a href="#api-reference">
            <span class="i18n-en">API Reference</span>
            <span class="i18n-ko" lang="ko">API 레퍼런스</span>
          </a>
          <a href="#engine-notes">
            <span class="i18n-en">Engine Notes</span>
            <span class="i18n-ko" lang="ko">엔진 노트</span>
          </a>
        </nav>
        <p class="sidebar-foot">
          <span class="i18n-en">MIT License &middot; zero runtime dependencies</span>
          <span class="i18n-ko" lang="ko">MIT License &middot; 런타임 의존성 없음</span>
        </p>
      </aside>

      <div class="content">
        <div class="topbar">
          <span class="topbar-crumb">
            <strong>TypeSea</strong> /
            <span class="i18n-en">Documentation</span>
            <span class="i18n-ko" lang="ko">문서</span>
          </span>
          <div class="topbar-actions">
            <div class="language-switch" aria-label="Documentation language">
              <label for="language-en">EN</label>
              <label for="language-ko">한국어</label>
            </div>
            <div class="topbar-links">
              <a href="https://github.com/Feralthedogg/TypeSea">GitHub</a>
              <a href="https://github.com/Feralthedogg/TypeSea/blob/main/docs/api.md">
                <span class="i18n-en">API reference</span>
                <span class="i18n-ko" lang="ko">API 레퍼런스</span>
              </a>
              <a href="https://github.com/Feralthedogg/TypeSea/blob/main/docs/engine-notes.md">
                <span class="i18n-en">Engine notes</span>
                <span class="i18n-ko" lang="ko">엔진 노트</span>
              </a>
            </div>
          </div>
        </div>

        <main>
          ${renderStartGuide()}
          <section id="files" data-doc-section>
            <p class="eyebrow">
              <span class="i18n-en">Source files</span>
              <span class="i18n-ko" lang="ko">원본 파일</span>
            </p>
            <h2>
              <span class="i18n-en">The site below renders every maintained documentation source.</span>
              <span class="i18n-ko" lang="ko">아래에는 현재 유지보수 중인 문서 원본 전체가 그대로 들어 있습니다.</span>
            </h2>
            <div class="grid">
              <article class="tile">
                <h3>README.md</h3>
                <p>
                  <span class="i18n-en">Project goal, benchmark headline, quick start, API summary, edge semantics, and release workflow.</span>
                  <span class="i18n-ko" lang="ko">프로젝트 목표, 벤치마크 요약, 빠른 시작, API 개요, 경계 동작, 릴리스 흐름을 다룹니다.</span>
                </p>
                <code><a href="https://github.com/Feralthedogg/TypeSea">GitHub README</a></code>
              </article>
              <article class="tile">
                <h3>docs/api.md</h3>
                <p>
                  <span class="i18n-en">Guard, builder, decoder, compile, AOT, adapter, graph, JSON Schema, edge, and Result contracts.</span>
                  <span class="i18n-ko" lang="ko">가드, 빌더, 디코더, 컴파일, AOT, 어댑터, 그래프, JSON Schema, 경계 조건, Result 계약을 정리합니다.</span>
                </p>
                <code><a href="https://github.com/Feralthedogg/TypeSea/blob/main/docs/api.md">docs/api.md</a></code>
              </article>
              <article class="tile">
                <h3>docs/engine-notes.md</h3>
                <p>
                  <span class="i18n-en">Hot path rules, type-system rules, Sea-of-Nodes validation IR, compiler notes, recursion, and benchmark scope.</span>
                  <span class="i18n-ko" lang="ko">핫패스 규칙, 타입 시스템 규칙, Sea-of-Nodes 검증 IR, 컴파일러 설계, 재귀 처리, 벤치마크 범위를 설명합니다.</span>
                </p>
                <code><a href="https://github.com/Feralthedogg/TypeSea/blob/main/docs/engine-notes.md">docs/engine-notes.md</a></code>
              </article>
            </div>
          </section>
${rendered}
        </main>
      </div>
    </div>
  </body>
</html>
`;
}

/**
 * @brief Test whether an unknown JavaScript value is a string-keyed object.
 * @param value Candidate value.
 * @returns True when value can be read as a record.
 */
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Render the hand-authored start guide.
 * @returns HTML start guide.
 */
function renderStartGuide() {
    return `<section id="overview" data-doc-section>
            <div class="hero">
              <div>
                <p class="eyebrow">
                  <span class="i18n-en">Overview</span>
                  <span class="i18n-ko" lang="ko">개요</span>
                </p>
                <h2>
                  <span class="i18n-en">Zero-dependency TypeScript validation with compiled type guards.</span>
                  <span class="i18n-ko" lang="ko">컴파일된 타입 가드까지 제공하는, 런타임 의존성 없는 TypeScript 검증 라이브러리.</span>
                </h2>
                <p class="lede">
                  <span class="i18n-en">TypeSea turns immutable schemas into runtime guards, compiled validators, AOT modules, JSON Schema exports, framework adapters, and frozen diagnostic Result values.</span>
                  <span class="i18n-ko" lang="ko">TypeSea는 불변 스키마를 런타임 가드, 컴파일된 검증기, AOT 모듈, JSON Schema 출력, 프레임워크 어댑터, 동결된 진단 Result로 연결합니다.</span>
                </p>
                <ul class="checklist">
                  <li>
                    <span class="i18n-en"><strong>Zero dependencies</strong> &mdash; enforced before release.</span>
                    <span class="i18n-ko" lang="ko"><strong>의존성 없음</strong> &mdash; 릴리스 전에 정책 게이트로 강제합니다.</span>
                  </li>
                  <li>
                    <span class="i18n-en"><strong>Safe by default</strong> &mdash; descriptor reads avoid getter execution.</span>
                    <span class="i18n-ko" lang="ko"><strong>기본값은 안전 모드</strong> &mdash; descriptor read로 getter 실행을 피합니다.</span>
                  </li>
                  <li>
                    <span class="i18n-en"><strong>Fast when trusted</strong> &mdash; unsafe and unchecked modes trade hardening for direct reads.</span>
                    <span class="i18n-ko" lang="ko"><strong>신뢰된 데이터에서는 빠르게</strong> &mdash; unsafe/unchecked 모드는 일부 방어를 direct read 성능과 맞바꿉니다.</span>
                  </li>
                  <li>
                    <span class="i18n-en"><strong>Complete references</strong> &mdash; README, API reference, and engine notes are rendered below.</span>
                    <span class="i18n-ko" lang="ko"><strong>문서 전체 포함</strong> &mdash; README, API 레퍼런스, 엔진 노트 전문을 아래에서 볼 수 있습니다.</span>
                  </li>
                </ul>
              </div>
              <aside class="status-panel" aria-label="Package status">
                <header>
                  <span class="i18n-en">Package status</span>
                  <span class="i18n-ko" lang="ko">패키지 상태</span>
                </header>
                <div class="status-row">
                  <span>
                    <span class="i18n-en">Runtime dependencies</span>
                    <span class="i18n-ko" lang="ko">런타임 의존성</span>
                  </span>
                  <span class="pill">zero</span>
                </div>
                <div class="status-row">
                  <span>
                    <span class="i18n-en">Execution paths</span>
                    <span class="i18n-ko" lang="ko">실행 경로</span>
                  </span>
                  <span class="pill">plan &middot; jit &middot; aot</span>
                </div>
                <div class="status-row">
                  <span>
                    <span class="i18n-en">Module format</span>
                    <span class="i18n-ko" lang="ko">모듈 형식</span>
                  </span>
                  <span class="pill">ESM-only</span>
                </div>
                <div class="status-row">
                  <span>Node.js</span>
                  <span class="pill">&ge; 20.19</span>
                </div>
              </aside>
            </div>
          </section>

          <section id="quick-start" data-doc-section>
            <p class="eyebrow">
              <span class="i18n-en">Quick start</span>
              <span class="i18n-ko" lang="ko">빠른 시작</span>
            </p>
            <h2>
              <span class="i18n-en">Install, define, narrow, compile.</span>
              <span class="i18n-ko" lang="ko">설치하고, 스키마를 정의하고, 타입을 좁힌 뒤, 필요한 곳만 컴파일하세요.</span>
            </h2>
            <div class="code-block">
              <pre><code>npm install typesea</code></pre>
            </div>
            <div class="code-block">
              <pre><code>import { compile, t, toJsonSchema, type Infer } from "typesea";

const User = t.strictObject({
  id: t.string.uuid(),
  age: t.number.int().gte(0),
  role: t.union(t.literal("admin"), t.literal("user"))
});

type User = Infer&lt;typeof User&gt;;

if (User.is(input)) {
  input.id;
}

const checked = User.check(input);
const FastUser = compile(User, { name: "isUser" });
const schema = toJsonSchema(User);</code></pre>
            </div>
          </section>

          <section id="architecture" data-doc-section>
            <p class="eyebrow">
              <span class="i18n-en">Architecture</span>
              <span class="i18n-ko" lang="ko">아키텍처</span>
            </p>
            <h2>
              <span class="i18n-en">Builder -> frozen schema -> Sea-of-Nodes validation IR -> optimize -> validation plan.</span>
              <span class="i18n-ko" lang="ko">빌더 -> 동결된 스키마 -> Sea-of-Nodes 검증 IR -> 최적화 -> 검증 계획.</span>
            </h2>
            <p class="lede">
              <span class="i18n-en">The graph is the source for generated validators, while the plan-owned kernel keeps ordinary guard execution out of a generic node interpreter.</span>
              <span class="i18n-ko" lang="ko">그래프는 생성 검증기의 원본이고, 계획이 소유한 커널은 일반 가드 실행이 범용 노드 인터프리터를 거치지 않게 합니다.</span>
            </p>
          </section>

          <section id="api" data-doc-section>
            <p class="eyebrow">
              <span class="i18n-en">API map</span>
              <span class="i18n-ko" lang="ko">API 지도</span>
            </p>
            <h2>
              <span class="i18n-en">Core entry points.</span>
              <span class="i18n-ko" lang="ko">핵심 진입점.</span>
            </h2>
            <div class="grid">
              <article class="tile">
                <h3>Builders</h3>
                <p><code>t.string</code>, <code>t.number</code>, <code>t.object</code>, <code>t.strictObject</code>, <code>t.union</code>, <code>t.array</code>, <code>t.lazy</code>.</p>
              </article>
              <article class="tile">
                <h3>Validation</h3>
                <p>
                  <span class="i18n-en"><code>is()</code> for narrowing, <code>check()</code> for Result diagnostics, <code>assert()</code> for throwing integration boundaries.</span>
                  <span class="i18n-ko" lang="ko"><code>is()</code>는 타입 좁히기, <code>check()</code>는 Result 기반 진단, <code>assert()</code>는 예외가 필요한 연동 지점에 씁니다.</span>
                </p>
              </article>
              <article class="tile">
                <h3>Generated validators</h3>
                <p>
                  <span class="i18n-en"><code>compile()</code>, <code>emitAotModule()</code>, safe mode, unsafe mode, and unchecked mode.</span>
                  <span class="i18n-ko" lang="ko"><code>compile()</code>, <code>emitAotModule()</code>, safe/unsafe/unchecked 모드.</span>
                </p>
              </article>
              <article class="tile">
                <h3>Decoders</h3>
                <p>
                  <span class="i18n-en"><code>t.decoder</code>, <code>t.transform</code>, <code>t.pipe</code>, <code>t.coerce</code>, plus async variants.</span>
                  <span class="i18n-ko" lang="ko"><code>t.decoder</code>, <code>t.transform</code>, <code>t.pipe</code>, <code>t.coerce</code>와 async 변형.</span>
                </p>
              </article>
              <article class="tile">
                <h3>Messages</h3>
                <p><code>formatIssue</code>, <code>formatIssues</code>, <code>withMessages</code>, <code>defineMessages</code>.</p>
              </article>
              <article class="tile">
                <h3>Export</h3>
                <p>
                  <span class="i18n-en"><code>toJsonSchema</code> and <code>schemaToJsonSchema</code> succeed only when semantics are preserved.</span>
                  <span class="i18n-ko" lang="ko"><code>toJsonSchema</code>와 <code>schemaToJsonSchema</code>는 의미를 보존할 수 있을 때만 성공합니다.</span>
                </p>
              </article>
            </div>
          </section>

          <section id="adapters" data-doc-section>
            <p class="eyebrow">
              <span class="i18n-en">Adapters</span>
              <span class="i18n-ko" lang="ko">어댑터</span>
            </p>
            <h2>
              <span class="i18n-en">Structural adapters without framework dependencies.</span>
              <span class="i18n-ko" lang="ko">프레임워크 의존성 없이 제공되는 구조적 어댑터.</span>
            </h2>
            <div class="grid">
              <article class="tile">
                <h3>tRPC</h3>
                <p><code>toTrpcParser</code> and <code>toAsyncTrpcParser</code>.</p>
              </article>
              <article class="tile">
                <h3>Fastify</h3>
                <p><code>toFastifyRouteSchema</code> and <code>toFastifyValidatorCompiler</code>.</p>
              </article>
              <article class="tile">
                <h3>React Hook Form</h3>
                <p><code>toReactHookFormResolver</code>.</p>
              </article>
            </div>
          </section>

          <section id="benchmarks" data-doc-section>
            <p class="eyebrow">
              <span class="i18n-en">Benchmarks</span>
              <span class="i18n-ko" lang="ko">벤치마크</span>
            </p>
            <h2>
              <span class="i18n-en">Zod, Valibot, and Ajv comparisons are rendered in the README and engine notes below.</span>
              <span class="i18n-ko" lang="ko">Zod, Valibot, Ajv와의 비교는 아래 README와 엔진 노트에 포함되어 있습니다.</span>
            </h2>
            <p class="lede">
              <span class="i18n-en">Run <code>npm run bench -- bench/ecosystem.bench.ts --run</code> for the local benchmark suite.</span>
              <span class="i18n-ko" lang="ko">로컬 벤치마크는 <code>npm run bench -- bench/ecosystem.bench.ts --run</code>으로 실행합니다.</span>
            </p>
            <img class="benchmark-image" src="assets/benchmark-headline.svg" alt="TypeSea benchmark comparison">
          </section>

          <section id="release" data-doc-section>
            <p class="eyebrow">
              <span class="i18n-en">Release gate</span>
              <span class="i18n-ko" lang="ko">릴리스 게이트</span>
            </p>
            <h2>
              <span class="i18n-en">Use the same gate locally and in CI.</span>
              <span class="i18n-ko" lang="ko">로컬과 CI에서 같은 gate를 실행합니다.</span>
            </h2>
            <div class="code-block">
              <pre><code>npm run release:check</code></pre>
            </div>
          </section>`;
}

/**
 * @brief Render one source document.
 * @param source Source descriptor and markdown.
 * @returns Rendered article.
 */
function renderSourceDocument(source) {
    return `<article id="${source.id}" class="source-doc doc-content" data-doc-section>
            <header>
              <p class="eyebrow">
                <span class="i18n-en">${escapeHtml(source.title)}</span>
                <span class="i18n-ko" lang="ko">${escapeHtml(source.titleKo)}</span>
              </p>
              <h2>
                <span class="i18n-en">${escapeHtml(source.title)}</span>
                <span class="i18n-ko" lang="ko">${escapeHtml(source.titleKo)}</span>
              </h2>
              <p>
                <span class="i18n-en">Rendered from <code>${escapeHtml(source.path)}</code>.</span>
                <span class="i18n-ko" lang="ko"><code>${escapeHtml(source.koPath)}</code>에서 렌더링했습니다.</span>
              </p>
            </header>
            <div class="locale-en">
${renderMarkdown(source.markdown, `${source.id}-en`)}
            </div>
            <div class="locale-ko" lang="ko">
${renderMarkdown(source.koMarkdown, `${source.id}-ko`)}
            </div>
          </article>`;
}

/**
 * @brief Render Markdown lines.
 * @param markdown Markdown source.
 * @param prefix Prefix for generated heading ids.
 * @returns HTML fragment.
 */
function renderMarkdown(markdown, prefix) {
    const state = {
        ids: new Map(),
        prefix
    };
    return renderLines(markdown.split("\n"), state).join("\n");
}

/**
 * @brief Render block-level Markdown.
 * @param lines Source lines.
 * @param state Render state.
 * @returns HTML block list.
 */
function renderLines(lines, state) {
    const out = [];
    for (let index = 0; index < lines.length;) {
        const line = lines[index] ?? "";
        if (line.trim().length === 0) {
            index += 1;
            continue;
        }
        if (line.startsWith("```")) {
            const code = [];
            index += 1;
            while (index < lines.length && !(lines[index] ?? "").startsWith("```")) {
                code.push(lines[index] ?? "");
                index += 1;
            }
            index += 1;
            out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
            continue;
        }
        if (line.startsWith(">")) {
            const quote = [];
            while (index < lines.length && (lines[index] ?? "").startsWith(">")) {
                quote.push((lines[index] ?? "").replace(/^>\s?/u, ""));
                index += 1;
            }
            out.push(renderQuote(quote, state));
            continue;
        }
        if (isHeading(line)) {
            out.push(renderHeading(line, state));
            index += 1;
            continue;
        }
        if (isRule(line)) {
            out.push("<hr>");
            index += 1;
            continue;
        }
        if (isTableStart(lines, index)) {
            const table = [];
            table.push(lines[index] ?? "");
            table.push(lines[index + 1] ?? "");
            index += 2;
            while (index < lines.length && (lines[index] ?? "").includes("|")) {
                table.push(lines[index] ?? "");
                index += 1;
            }
            out.push(renderTable(table, state));
            continue;
        }
        if (isListLine(line)) {
            const list = [];
            while (index < lines.length && isListLine(lines[index] ?? "")) {
                list.push(lines[index] ?? "");
                index += 1;
            }
            out.push(renderList(list, state));
            continue;
        }
        const paragraph = [line.trim()];
        index += 1;
        while (index < lines.length && isParagraphContinuation(lines[index] ?? "", lines[index + 1] ?? "")) {
            paragraph.push((lines[index] ?? "").trim());
            index += 1;
        }
        out.push(`<p>${renderInline(paragraph.join(" "), state)}</p>`);
    }
    return out;
}

/**
 * @brief Render one quote block.
 * @param lines Quote lines.
 * @param state Render state.
 * @returns Quote HTML.
 */
function renderQuote(lines, state) {
    const first = lines[0]?.trim() ?? "";
    if (/^\[![A-Z]+\]$/u.test(first)) {
        const kind = first.slice(2, -1).toLowerCase();
        const title = first.slice(2, -1);
        const body = renderLines(lines.slice(1), state).join("\n");
        return `<aside class="admonition ${escapeHtml(kind)}"><strong class="admonition-title">${escapeHtml(title)}</strong>${body}</aside>`;
    }
    return `<blockquote>${renderLines(lines, state).join("\n")}</blockquote>`;
}

/**
 * @brief Render a heading.
 * @param line Markdown heading line.
 * @param state Render state.
 * @returns Heading HTML.
 */
function renderHeading(line, state) {
    const marker = line.match(/^#{1,6}/u)?.[0] ?? "##";
    const level = Math.min(marker.length + 1, 4);
    const text = line.slice(marker.length).trim();
    const id = uniqueId(`${state.prefix}-${slug(text)}`, state.ids);
    return `<h${String(level)} id="${id}">${renderInline(text, state)}</h${String(level)}>`;
}

/**
 * @brief Render a table.
 * @param lines Markdown table lines.
 * @param state Render state.
 * @returns Table HTML.
 */
function renderTable(lines, state) {
    const head = splitTableRow(lines[0] ?? "");
    const body = lines.slice(2).map((line) => splitTableRow(line));
    const headHtml = head.map((cell) => `<th>${renderInline(cell, state)}</th>`).join("");
    const rows = body.map((row) =>
        `<tr>${row.map((cell) => `<td>${renderInline(cell, state)}</td>`).join("")}</tr>`
    ).join("\n");
    return `<div class="table-wrap"><table><thead><tr>${headHtml}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/**
 * @brief Render a list.
 * @param lines Markdown list lines.
 * @param state Render state.
 * @returns List HTML.
 */
function renderList(lines, state) {
    const ordered = /^\s*\d+\.\s/u.test(lines[0] ?? "");
    const tag = ordered ? "ol" : "ul";
    const items = lines.map((line) =>
        `<li>${renderInline(line.replace(/^\s*(?:[-*]|\d+\.)\s+/u, ""), state)}</li>`
    ).join("");
    return `<${tag}>${items}</${tag}>`;
}

/**
 * @brief Render inline Markdown.
 * @param text Inline source.
 * @param state Render state.
 * @returns Inline HTML.
 */
function renderInline(text, state) {
    const segments = text.split(/(`[^`]*`)/u);
    return segments.map((segment) => {
        if (segment.startsWith("`") && segment.endsWith("`")) {
            return `<code>${escapeHtml(segment.slice(1, -1))}</code>`;
        }
        return renderInlinePlain(segment, state);
    }).join("");
}

/**
 * @brief Render non-code inline Markdown.
 * @param text Inline source.
 * @param state Render state.
 * @returns Inline HTML.
 */
function renderInlinePlain(text, state) {
    let out = "";
    const pattern = /(!?\[([^\]]*)\]\(([^)]+)\))/gu;
    let last = 0;
    let match = pattern.exec(text);
    while (match !== null) {
        out += renderPlainText(text.slice(last, match.index));
        const whole = match[1] ?? "";
        const label = match[2] ?? "";
        const href = match[3] ?? "";
        out += whole.startsWith("!")
            ? renderImage(label, href)
            : renderLink(label, href, state);
        last = match.index + whole.length;
        match = pattern.exec(text);
    }
    out += renderPlainText(text.slice(last));
    return out;
}

/**
 * @brief Render plain text decorations.
 * @param text Plain inline text.
 * @returns HTML text.
 */
function renderPlainText(text) {
    return escapeHtml(text)
        .replace(/\*\*([^*]+)\*\*/gu, "<strong>$1</strong>")
        .replace(/&mdash;/gu, "&mdash;")
        .replace(/&middot;/gu, "&middot;")
        .replace(/&ge;/gu, "&ge;");
}

/**
 * @brief Render a Markdown link.
 * @param label Link label.
 * @param href Link target.
 * @param state Render state.
 * @returns Link HTML.
 */
function renderLink(label, href, state) {
    const safeHref = normalizeHref(href);
    const text = renderInline(label, state);
    if (safeHref === undefined) {
        return `<span class="muted-link">${text}</span>`;
    }
    return `<a href="${escapeAttribute(safeHref)}">${text}</a>`;
}

/**
 * @brief Render a Markdown image.
 * @param label Image alt text.
 * @param href Image source.
 * @returns Image HTML.
 */
function renderImage(label, href) {
    const source = normalizeImageSource(href);
    if (source === undefined) {
        return `<span class="muted-link">${escapeHtml(label)}</span>`;
    }
    return `<img class="benchmark-image" src="${escapeAttribute(source)}" alt="${escapeAttribute(label)}">`;
}

/**
 * @brief Normalize an href for the published site.
 * @param href Raw href.
 * @returns Safe href or undefined.
 */
function normalizeHref(href) {
    if (href === "docs/api.md") {
        return "#api-reference";
    }
    if (href === "../api.md") {
        return "#api-reference";
    }
    if (href === "docs/engine-notes.md") {
        return "#engine-notes";
    }
    if (href === "../engine-notes.md") {
        return "#engine-notes";
    }
    if (href === "./LICENSE") {
        return "https://github.com/Feralthedogg/TypeSea/blob/main/LICENSE";
    }
    if (href === "../../LICENSE") {
        return "https://github.com/Feralthedogg/TypeSea/blob/main/LICENSE";
    }
    if (href.startsWith("#")) {
        return href;
    }
    if (href.startsWith("https://github.com/Feralthedogg/TypeSea")) {
        return href;
    }
    if (href === "https://feralthedogg.github.io/TypeSea/") {
        return "#overview";
    }
    return undefined;
}

/**
 * @brief Normalize an image source for the published site.
 * @param href Raw image source.
 * @returns Safe image source or undefined.
 */
function normalizeImageSource(href) {
    if (href === "./docs/assets/benchmark-headline.svg" ||
        href === "../assets/benchmark-headline.svg" ||
        href === "docs/assets/benchmark-headline.svg") {
        return "assets/benchmark-headline.svg";
    }
    return undefined;
}

/**
 * @brief Split a Markdown table row.
 * @param line Table row.
 * @returns Cell text list.
 */
function splitTableRow(line) {
    const trimmed = line.trim().replace(/^\|/u, "").replace(/\|$/u, "");
    const cells = [];
    let current = "";
    for (let index = 0; index < trimmed.length; index += 1) {
        const char = trimmed[index];
        const prev = trimmed[index - 1];
        if (char === "|" && prev !== "\\") {
            cells.push(current.trim().replace(/\\\|/gu, "|"));
            current = "";
            continue;
        }
        current += char;
    }
    cells.push(current.trim().replace(/\\\|/gu, "|"));
    return cells;
}

/**
 * @brief Test for a heading line.
 * @param line Source line.
 * @returns True when line is a Markdown heading.
 */
function isHeading(line) {
    return /^#{1,6}\s/u.test(line);
}

/**
 * @brief Test for a horizontal rule.
 * @param line Source line.
 * @returns True when line is a Markdown rule.
 */
function isRule(line) {
    return /^-{3,}\s*$/u.test(line.trim());
}

/**
 * @brief Test for a table start.
 * @param lines Source lines.
 * @param index Current index.
 * @returns True when a table begins here.
 */
function isTableStart(lines, index) {
    const line = lines[index] ?? "";
    const next = lines[index + 1] ?? "";
    return line.includes("|") && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(next);
}

/**
 * @brief Test for a list line.
 * @param line Source line.
 * @returns True for unordered or ordered Markdown list items.
 */
function isListLine(line) {
    return /^\s*(?:[-*]|\d+\.)\s+/u.test(line);
}

/**
 * @brief Test if the next line belongs to the current paragraph.
 * @param line Candidate line.
 * @param next Following line.
 * @returns True when paragraph accumulation should continue.
 */
function isParagraphContinuation(line, next) {
    if (line.trim().length === 0) {
        return false;
    }
    if (line.startsWith("```") || line.startsWith(">") || isHeading(line) ||
        isRule(line) || isListLine(line)) {
        return false;
    }
    if (line.includes("|") && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(next)) {
        return false;
    }
    return true;
}

/**
 * @brief Build a unique id.
 * @param base Base id.
 * @param ids Id counter map.
 * @returns Unique id.
 */
function uniqueId(base, ids) {
    const current = ids.get(base) ?? 0;
    ids.set(base, current + 1);
    if (current === 0) {
        return base;
    }
    return `${base}-${String(current + 1)}`;
}

/**
 * @brief Slug a heading.
 * @param text Heading text.
 * @returns URL fragment id.
 */
function slug(text) {
    const slugged = text.toLowerCase()
        .replace(/`([^`]*)`/gu, "$1")
        .replace(/[^a-z0-9가-힣]+/gu, "-")
        .replace(/^-+|-+$/gu, "");
    return slugged.length === 0 ? "section" : slugged;
}

/**
 * @brief Escape HTML text.
 * @param value Raw text.
 * @returns Escaped text.
 */
function escapeHtml(value) {
    return value
        .replace(/&/gu, "&amp;")
        .replace(/</gu, "&lt;")
        .replace(/>/gu, "&gt;")
        .replace(/"/gu, "&quot;");
}

/**
 * @brief Escape an HTML attribute.
 * @param value Raw attribute.
 * @returns Escaped attribute.
 */
function escapeAttribute(value) {
    return escapeHtml(value).replace(/'/gu, "&#39;");
}

/**
 * @brief Construct a successful result value.
 * @param value Result payload.
 * @returns Successful result.
 */
function ok(value) {
    return {
        ok: true,
        value
    };
}

/**
 * @brief Construct a failed result value.
 * @param error Error payload.
 * @returns Failed result.
 */
function err(error) {
    return {
        ok: false,
        error
    };
}
