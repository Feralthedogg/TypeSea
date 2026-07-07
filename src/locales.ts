/**
 * @file locales.ts
 * @brief Zod-style locale subpath facade.
 * @details TypeSea currently ships English and Korean message catalogs. The
 * subpath keeps package-alias migrations from failing on `zod/locales`.
 */

import { locales as typeSeaLocales } from "./config/index.js";
import type { TypeSeaConfig } from "./config/index.js";

export function en(): TypeSeaConfig {
    return typeSeaLocales.en();
}

export function ko(): TypeSeaConfig {
    return typeSeaLocales.ko();
}

export const locales = typeSeaLocales;

const englishFallback = en;

export const ar = englishFallback;
export const az = englishFallback;
export const be = englishFallback;
export const bg = englishFallback;
export const ca = englishFallback;
export const cs = englishFallback;
export const da = englishFallback;
export const de = englishFallback;
export const el = englishFallback;
export const eo = englishFallback;
export const es = englishFallback;
export const fa = englishFallback;
export const fi = englishFallback;
export const fr = englishFallback;
export const frCA = englishFallback;
export const he = englishFallback;
export const hr = englishFallback;
export const hu = englishFallback;
export const hy = englishFallback;
export const id = englishFallback;
export const is = englishFallback;
export const it = englishFallback;
export const ja = englishFallback;
export const ka = englishFallback;
export const kh = englishFallback;
export const km = englishFallback;
export const lt = englishFallback;
export const mk = englishFallback;
export const ms = englishFallback;
export const nl = englishFallback;
export const no = englishFallback;
export const ota = englishFallback;
export const pl = englishFallback;
export const ps = englishFallback;
export const pt = englishFallback;
export const ro = englishFallback;
export const ru = englishFallback;
export const sl = englishFallback;
export const sv = englishFallback;
export const ta = englishFallback;
export const th = englishFallback;
export const tr = englishFallback;
export const ua = englishFallback;
export const uk = englishFallback;
export const ur = englishFallback;
export const uz = englishFallback;
export const vi = englishFallback;
export const yo = englishFallback;
export const zhCN = englishFallback;
export const zhTW = englishFallback;

export default en;
