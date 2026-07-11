/**
 * @file locales.ts
 * @brief Zod-style locale subpath facade.
 * @details TypeSea currently ships English and Korean message catalogs. The
 * subpath keeps package-alias migrations from failing on `zod/locales`.
 */

import { locales as typeSeaLocales } from "./config/index.js";
import type { TypeSeaConfig } from "./config/index.js";

/** @brief Construct the built-in English TypeSea message configuration. */
export function en(): TypeSeaConfig {
    return typeSeaLocales.en();
}

/** @brief Construct the built-in Korean TypeSea message configuration. */
export function ko(): TypeSeaConfig {
    return typeSeaLocales.ko();
}

/** @brief Locale registry containing native TypeSea message catalogs. */
export const locales = typeSeaLocales;

const englishFallback = en;

/**
 * @brief Zod locale-name compatibility exports backed by the English catalog.
 * @details TypeSea does not claim translated diagnostics for these names. They
 * exist so package aliases resolve deterministically until native catalogs are
 * implemented.
 */
export const ar = englishFallback,
    az = englishFallback,
    be = englishFallback,
    bg = englishFallback,
    ca = englishFallback,
    cs = englishFallback,
    da = englishFallback,
    de = englishFallback,
    el = englishFallback,
    eo = englishFallback,
    es = englishFallback,
    fa = englishFallback,
    fi = englishFallback,
    fr = englishFallback,
    frCA = englishFallback,
    he = englishFallback,
    hr = englishFallback,
    hu = englishFallback,
    hy = englishFallback,
    id = englishFallback,
    is = englishFallback,
    it = englishFallback,
    ja = englishFallback,
    ka = englishFallback,
    kh = englishFallback,
    km = englishFallback,
    lt = englishFallback,
    mk = englishFallback,
    ms = englishFallback,
    nl = englishFallback,
    no = englishFallback,
    ota = englishFallback,
    pl = englishFallback,
    ps = englishFallback,
    pt = englishFallback,
    ro = englishFallback,
    ru = englishFallback,
    sl = englishFallback,
    sv = englishFallback,
    ta = englishFallback,
    th = englishFallback,
    tr = englishFallback,
    ua = englishFallback,
    uk = englishFallback,
    ur = englishFallback,
    uz = englishFallback,
    vi = englishFallback,
    yo = englishFallback,
    zhCN = englishFallback,
    zhTW = englishFallback;

export default en;
