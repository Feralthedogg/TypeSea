import { base } from '$app/paths';
import { getLocale } from '$lib/paraglide/runtime';
import type { Locale } from '$lib/content/catalog';

export function currentLocale(): Locale {
    return getLocale() === 'ko' ? 'ko' : 'en';
}

export function localizedPath(path: string, locale: Locale = currentLocale()): string {
    const canonical = stripLocalePrefix(stripBase(path));
    if (locale === 'en') {
        return withBase(canonical);
    }
    const localized = canonical === '/' ? '/ko/' : `/ko${canonical}`;
    return withBase(localized);
}

export function localeSwitchPath(currentPath: string, locale: Locale): string {
    const canonical = stripLocalePrefix(stripBase(currentPath));
    return localizedPath(canonical, locale);
}

export function canonicalPath(currentPath: string): string {
    return stripLocalePrefix(stripBase(currentPath));
}

function stripBase(path: string): string {
    if (base === '' || !path.startsWith(base)) {
        return path;
    }
    const stripped = path.slice(base.length);
    return stripped.length === 0 ? '/' : stripped;
}

function withBase(path: string): string {
    if (base === '' || path === base || path.startsWith(`${base}/`)) {
        return path;
    }
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function stripLocalePrefix(path: string): string {
    const stripped = path.replace(/^\/(?:en|ko)(?=\/|$)/u, '');
    return stripped.length === 0 ? '/' : stripped;
}
