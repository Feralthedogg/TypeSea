import siteData from '$lib/generated/site.json';

export const documentSlugs = [
    'readme',
    'api',
    'zod-compat',
    'seaflow',
    'seabreeze',
    'engine'
] as const;

export type Locale = 'en' | 'ko';
export type DocumentSlug = (typeof documentSlugs)[number];
export type DocumentGroup = 'reference' | 'tools' | 'internals';

export interface HeadingEntry {
    readonly level: number;
    readonly text: string;
    readonly id: string;
}

export interface DocumentEntry {
    readonly slug: DocumentSlug;
    readonly group: DocumentGroup;
    readonly title: Readonly<Record<Locale, string>>;
    readonly description: Readonly<Record<Locale, string>>;
    readonly sourcePath: Readonly<Record<Locale, string>>;
    readonly githubUrl: Readonly<Record<Locale, string>>;
    readonly headings: Readonly<Record<Locale, readonly HeadingEntry[]>>;
}

export interface SearchEntry {
    readonly locale: Locale;
    readonly document: DocumentSlug;
    readonly documentTitle: string;
    readonly title: string;
    readonly level: number;
    readonly href: string;
}

interface SiteManifest {
    readonly version: string;
    readonly documents: readonly DocumentEntry[];
    readonly search: readonly SearchEntry[];
}

export const site = siteData as SiteManifest;

export function isDocumentSlug(value: string): value is DocumentSlug {
    return documentSlugs.includes(value as DocumentSlug);
}

export function getDocument(slug: DocumentSlug): DocumentEntry {
    const document = site.documents.find((candidate) => candidate.slug === slug);
    if (document === undefined) {
        throw new Error(`Unknown documentation slug: ${slug}`);
    }
    return document;
}

export function getAdjacentDocuments(slug: DocumentSlug) {
    const index = site.documents.findIndex((candidate) => candidate.slug === slug);
    return {
        previous: index > 0 ? site.documents[index - 1] : undefined,
        next:
            index >= 0 && index + 1 < site.documents.length ? site.documents[index + 1] : undefined
    };
}

export function getSearchEntries(locale: Locale) {
    return site.search.filter((entry) => entry.locale === locale);
}

export function getLocalizedHeadingId(
    slug: DocumentSlug,
    locale: Locale,
    englishId: string
): string {
    const document = getDocument(slug);
    const index = document.headings.en.findIndex((heading) => heading.id === englishId);
    const localized = index < 0 ? undefined : document.headings[locale][index];
    if (localized === undefined) {
        throw new Error(`Missing localized heading ${slug}#${englishId} for ${locale}`);
    }
    return localized.id;
}
