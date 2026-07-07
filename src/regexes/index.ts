/**
 * @file index.ts
 * @brief Public regular-expression presets for string format helpers.
 * @details These values mirror Zod's `regexes` namespace where practical while
 * staying zero-dependency and clone-safe when passed into TypeSea guards.
 */

export interface RegexNamespace {
    readonly email: RegExp;
    readonly html5Email: RegExp;
    readonly rfc5322Email: RegExp;
    readonly unicodeEmail: RegExp;
    readonly domain: RegExp;
    readonly uuid: RegExp;
    readonly guid: RegExp;
    readonly e164: RegExp;
    readonly nanoid: RegExp;
    readonly cuid: RegExp;
    readonly cuid2: RegExp;
    readonly xid: RegExp;
    readonly ksuid: RegExp;
    readonly ulid: RegExp;
    readonly ipv4: RegExp;
    readonly ipv6: RegExp;
    readonly cidrv4: RegExp;
    readonly cidrv6: RegExp;
    readonly mac: RegExp;
    readonly base64: RegExp;
    readonly base64url: RegExp;
    readonly hex: RegExp;
    readonly jwt: RegExp;
}

/**
 * @brief Frozen Zod-style regex preset namespace.
 * @details None of these expressions use the global or sticky flags, so callers
 * can inspect them directly. Guard construction still clones user-supplied
 * regexes before storing them in schemas.
 */
export const regexes: RegexNamespace = Object.freeze({
    email: /^(?!\.)(?!.*\.\.)[A-Z0-9!#$%&'*+/=?^_`{|}~.-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/iu,
    html5Email: /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)*$/iu,
    rfc5322Email: /^(?:[A-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[^"\\]|\\.)+")@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,}$/iu,
    unicodeEmail: /^(?!\.)(?!.*\.\.)[\p{L}\p{N}!#$%&'*+/=?^_`{|}~.-]+@(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+[\p{L}]{2,}$/iu,
    domain: /^([A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,}$/iu,
    uuid: /^(?:00000000-0000-0000-0000-000000000000|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu,
    guid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu,
    e164: /^\+[1-9]\d{1,14}$/u,
    nanoid: /^[A-Za-z0-9_-]{21}$/u,
    cuid: /^c[a-z0-9]{24}$/u,
    cuid2: /^[a-z][a-z0-9]{1,31}$/u,
    xid: /^[0-9a-v]{20}$/iu,
    ksuid: /^[A-Za-z0-9]{27}$/u,
    ulid: /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/iu,
    ipv4: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/u,
    ipv6: /^(?:(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,7}:|(?:[0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,5}(?::[0-9a-f]{1,4}){1,2}|(?:[0-9a-f]{1,4}:){1,4}(?::[0-9a-f]{1,4}){1,3}|(?:[0-9a-f]{1,4}:){1,3}(?::[0-9a-f]{1,4}){1,4}|(?:[0-9a-f]{1,4}:){1,2}(?::[0-9a-f]{1,4}){1,5}|[0-9a-f]{1,4}:(?:(?::[0-9a-f]{1,4}){1,6})|:(?:(?::[0-9a-f]{1,4}){1,7}|:))$/iu,
    cidrv4: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\/(?:3[0-2]|[12]?\d)$/u,
    cidrv6: /^(?:(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,7}:|(?:[0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,5}(?::[0-9a-f]{1,4}){1,2}|(?:[0-9a-f]{1,4}:){1,4}(?::[0-9a-f]{1,4}){1,3}|(?:[0-9a-f]{1,4}:){1,3}(?::[0-9a-f]{1,4}){1,4}|(?:[0-9a-f]{1,4}:){1,2}(?::[0-9a-f]{1,4}){1,5}|[0-9a-f]{1,4}:(?:(?::[0-9a-f]{1,4}){1,6})|:(?:(?::[0-9a-f]{1,4}){1,7}|:))\/(?:12[0-8]|1[01]\d|[1-9]?\d)$/iu,
    mac: /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/iu,
    base64: /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u,
    base64url: /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2}(?:==)?|[A-Za-z0-9_-]{3}=?)?$/u,
    hex: /^(?:[0-9a-f]{2})*$/iu,
    jwt: /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/u
});
