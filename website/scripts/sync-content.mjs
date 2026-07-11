import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import GithubSlugger from 'github-slugger';

const siteRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(siteRoot, '..');
const generatedRoot = join(siteRoot, 'src/lib/generated');
const contentRoot = join(generatedRoot, 'content');

const documents = [
    {
        slug: 'readme',
        group: 'reference',
        enPath: 'README.md',
        koPath: 'docs/ko/readme.md',
        sourcePath: 'README.md',
        title: { en: 'README', ko: 'README' },
        description: {
            en: 'Project goals, quick start, execution modes, benchmarks, and release workflow.',
            ko: '프로젝트 목표, 빠른 시작, 실행 모드, 벤치마크와 릴리스 절차를 설명합니다.'
        }
    },
    {
        slug: 'api',
        group: 'reference',
        enPath: 'docs/api.md',
        koPath: 'docs/ko/api.md',
        sourcePath: 'docs/api.md',
        title: { en: 'API reference', ko: 'API 레퍼런스' },
        description: {
            en: 'Builders, guards, decoders, compilation, adapters, JSON Schema, and Result contracts.',
            ko: 'Builder, guard, decoder, 컴파일, 어댑터, JSON Schema와 Result 계약을 정리합니다.'
        }
    },
    {
        slug: 'zod-compat',
        group: 'reference',
        enPath: 'docs/zod-real-world-compat.md',
        koPath: 'docs/ko/zod-real-world-compat.md',
        sourcePath: 'docs/zod-real-world-compat.md',
        title: { en: 'Zod compatibility corpus', ko: 'Zod 호환성 코퍼스' },
        description: {
            en: 'Pinned public-source API counts and replacement compilation diagnostics.',
            ko: '고정된 공개 소스의 API 사용량과 import 교체 컴파일 결과를 기록합니다.'
        }
    },
    {
        slug: 'seaflow',
        group: 'tools',
        enPath: 'docs/seaflow.md',
        koPath: 'docs/ko/seaflow.md',
        sourcePath: 'docs/seaflow.md',
        title: { en: 'SeaFlow fuzzer', ko: 'SeaFlow 퍼저' },
        description: {
            en: 'Schema-directed boundary, structural, and hostile-input case generation.',
            ko: '스키마를 역으로 해석해 경곗값, 구조 오류와 적대적 입력을 생성합니다.'
        }
    },
    {
        slug: 'seabreeze',
        group: 'tools',
        enPath: 'docs/sea-breeze.md',
        koPath: 'docs/ko/sea-breeze.md',
        sourcePath: 'docs/sea-breeze.md',
        title: { en: 'SeaBreeze inference', ko: 'SeaBreeze 추론' },
        description: {
            en: 'Arena-backed principal joins that infer compact schemas from observed values.',
            ko: '관측값을 arena 기반 principal join으로 합쳐 작은 스키마를 추론합니다.'
        }
    },
    {
        slug: 'engine',
        group: 'internals',
        enPath: 'docs/engine-notes.md',
        koPath: 'docs/ko/engine-notes.md',
        sourcePath: 'docs/engine-notes.md',
        title: { en: 'Engine notes', ko: '엔진 설계 노트' },
        description: {
            en: 'Hot-path rules, validation IR, compiler behavior, recursion, and benchmark scope.',
            ko: '핫패스 규칙, 검증 IR, 컴파일러 동작, 재귀와 벤치마크 범위를 다룹니다.'
        }
    }
];

await main();

async function main() {
    const packageText = await readFile(join(repositoryRoot, 'package.json'), 'utf8');
    const packageMetadata = JSON.parse(packageText);
    if (!isRecord(packageMetadata) || typeof packageMetadata.version !== 'string') {
        throw new Error('The root package.json must contain a string version');
    }

    await rm(generatedRoot, { recursive: true, force: true });
    await mkdir(contentRoot, { recursive: true });

    const manifestDocuments = [];
    const search = [];
    for (const document of documents) {
        const headings = {};
        for (const locale of ['en', 'ko']) {
            const sourcePath = locale === 'en' ? document.enPath : document.koPath;
            const source = await readFile(join(repositoryRoot, sourcePath), 'utf8');
            if (source.trim().length === 0) {
                throw new Error(`${sourcePath} must not be empty`);
            }
            const transformed = transformMarkdown(source, locale);
            const output = join(contentRoot, locale, `${document.slug}.md`);
            await mkdir(dirname(output), { recursive: true });
            await writeFile(output, transformed, 'utf8');

            const localizedHeadings = extractHeadings(transformed);
            headings[locale] = localizedHeadings;
            for (const heading of localizedHeadings) {
                search.push({
                    locale,
                    document: document.slug,
                    documentTitle: document.title[locale],
                    title: heading.text,
                    level: heading.level,
                    href: `/${document.slug}/#${heading.id}`
                });
            }
        }

        manifestDocuments.push({
            slug: document.slug,
            group: document.group,
            title: document.title,
            description: document.description,
            sourcePath: {
                en: document.enPath,
                ko: document.koPath
            },
            githubUrl: {
                en: `https://github.com/Feralthedogg/TypeSea/blob/main/${document.enPath}`,
                ko: `https://github.com/Feralthedogg/TypeSea/blob/main/${document.koPath}`
            },
            headings
        });
    }

    const manifest = {
        version: packageMetadata.version,
        documents: manifestDocuments,
        search
    };
    await writeFile(
        join(generatedRoot, 'site.json'),
        `${JSON.stringify(manifest, null, 4)}\n`,
        'utf8'
    );
    await copyFile(
        join(repositoryRoot, 'bench/results/latest.json'),
        join(generatedRoot, 'benchmark.json')
    );
    await copyFile(
        join(repositoryRoot, 'docs/assets/benchmark-headline.svg'),
        join(siteRoot, 'static/benchmark-headline.svg')
    );
}

function transformMarkdown(source, locale) {
    const transformed = source
        .replaceAll('https://feralthedogg.github.io/TypeSea/ko/api/', '../api/')
        .replaceAll('https://feralthedogg.github.io/TypeSea/ko/zod-compat/', '../zod-compat/')
        .replaceAll('https://feralthedogg.github.io/TypeSea/ko/seaflow/', '../seaflow/')
        .replaceAll('https://feralthedogg.github.io/TypeSea/ko/seabreeze/', '../seabreeze/')
        .replaceAll('https://feralthedogg.github.io/TypeSea/ko/engine/', '../engine/')
        .replaceAll('https://feralthedogg.github.io/TypeSea/api/', '../api/')
        .replaceAll('https://feralthedogg.github.io/TypeSea/zod-compat/', '../zod-compat/')
        .replaceAll('https://feralthedogg.github.io/TypeSea/seaflow/', '../seaflow/')
        .replaceAll('https://feralthedogg.github.io/TypeSea/seabreeze/', '../seabreeze/')
        .replaceAll('https://feralthedogg.github.io/TypeSea/engine/', '../engine/')
        .replaceAll('https://feralthedogg.github.io/TypeSea/#api-reference', '../api/')
        .replaceAll('https://feralthedogg.github.io/TypeSea/#engine-notes', '../engine/')
        .replaceAll('https://feralthedogg.github.io/TypeSea/#seaflow', '../seaflow/')
        .replaceAll('https://feralthedogg.github.io/TypeSea/#seabreeze', '../seabreeze/')
        .replaceAll(
            'https://feralthedogg.github.io/TypeSea/assets/benchmark-headline.svg',
            '__TYPESEA_BENCHMARK__'
        )
        .replaceAll(
            'https://feralthedogg.github.io/TypeSea/benchmark-headline.svg',
            '__TYPESEA_BENCHMARK__'
        )
        .replaceAll('https://feralthedogg.github.io/TypeSea/', '../')
        .replaceAll('./docs/assets/benchmark-headline.svg', '__TYPESEA_BENCHMARK__')
        .replaceAll('../assets/benchmark-headline.svg', '__TYPESEA_BENCHMARK__')
        .replaceAll('docs/assets/benchmark-headline.svg', '__TYPESEA_BENCHMARK__')
        .replaceAll('(docs/api.md)', '(../api/)')
        .replaceAll('(../api.md)', '(../api/)')
        .replaceAll('(./docs/zod-real-world-compat.md)', '(../zod-compat/)')
        .replaceAll('(docs/zod-real-world-compat.md)', '(../zod-compat/)')
        .replaceAll('(../zod-real-world-compat.md)', '(../zod-compat/)')
        .replaceAll('(./zod-real-world-compat.md)', '(../zod-compat/)')
        .replaceAll('(docs/engine-notes.md)', '(../engine/)')
        .replaceAll('(../engine-notes.md)', '(../engine/)')
        .replaceAll(
            '(../../bench/results/latest.json)',
            '(https://github.com/Feralthedogg/TypeSea/blob/main/bench/results/latest.json)'
        )
        .replaceAll(
            '(../../bench/results/raw.json)',
            '(https://github.com/Feralthedogg/TypeSea/blob/main/bench/results/raw.json)'
        )
        .replaceAll('(./LICENSE)', '(https://github.com/Feralthedogg/TypeSea/blob/main/LICENSE)')
        .replaceAll(
            '(../../LICENSE)',
            '(https://github.com/Feralthedogg/TypeSea/blob/main/LICENSE)'
        );

    if (!transformed.includes('__TYPESEA_BENCHMARK__')) {
        return transformed;
    }
    const alternative = locale === 'ko' ? 'TypeSea 벤치마크 비교' : 'TypeSea benchmark comparison';
    const image = `<img src={docsBase + "/benchmark-headline.svg"} alt="${alternative}" />`;
    return `<script>\n    import { base as docsBase } from '$app/paths';\n</script>\n\n${transformed.replace(/!\[TypeSea benchmark comparison\]\(__TYPESEA_BENCHMARK__\)/gu, image)}`;
}

function extractHeadings(source) {
    const slugger = new GithubSlugger();
    const headings = [];
    const lines = source.split('\n');
    let fenced = false;
    for (const line of lines) {
        if (line.startsWith('```')) {
            fenced = !fenced;
            continue;
        }
        if (fenced) {
            continue;
        }
        const match = /^(#{1,3})\s+(.+)$/u.exec(line);
        if (match === null) {
            continue;
        }
        const marker = match[1];
        const rawText = match[2];
        if (marker === undefined || rawText === undefined) {
            continue;
        }
        const text = stripMarkdown(rawText);
        headings.push({
            level: marker.length,
            text,
            id: slugger.slug(text)
        });
    }
    return headings;
}

function stripMarkdown(source) {
    return source
        .replace(/!\[([^\]]*)\]\([^)]+\)/gu, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
        .replace(/<[^>]+>/gu, '')
        .replace(/[`*_~]/gu, '')
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .trim();
}

function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
