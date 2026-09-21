# Security Policy

## Supported Versions

TypeSea supports the latest published minor line. Security fixes are released as
patch versions whenever a fix can be shipped without changing the public API.

| Version | Supported |
| --- | --- |
| 1.3.x | yes |
| 1.2.x and earlier | no |

## Reporting A Vulnerability

Please report security issues through GitHub Security Advisories for
`Feralthedogg/TypeSea`. If that is unavailable, open a GitHub issue with the
minimum public detail needed to start coordination and mark the title as a
security report.

Useful reports include:

- affected TypeSea version
- minimal schema and input needed to reproduce the issue
- whether the issue affects `safe`, `unsafe`, `unchecked`, AOT, JSON Schema, or
  an adapter
- expected verdict and actual verdict
- generated source or stack output that helps reproduce the issue

## Security Boundary

The default validation mode is `safe`. It is intended for hostile plain-data
boundaries. Safe mode reads own data descriptors instead of ordinary accessor
properties, treats prototype-backed data as untrusted, handles `__proto__` and
`constructor` keys with null-prototype lookups, checks strict-object symbol and
non-enumerable extras, and returns explicit `Result` values for expected
failures.

Safe validation necessarily uses JavaScript reflection. If the input is a
`Proxy`, operations such as `Object.getOwnPropertyDescriptor()` and
`Reflect.ownKeys()` can execute traps. A hostile Proxy can also report a data
descriptor during validation and return a different value on a later property
read. Identity-preserving APIs such as `is()` and `check()` therefore cannot
guarantee stable post-validation property semantics for adversarial Proxy
objects. Normalize arbitrary JavaScript objects into plain owned data before
validation when Proxy inputs are possible; values produced by `JSON.parse()` do
not have this Proxy ambiguity.

`unsafe` and `unchecked` are performance escape hatches for trusted,
already-normalized data. They may execute getters, may accept prototype-backed
values, and may relax strict-object extra-key guarantees. Do not use these modes
on public input boundaries unless a separate normalization step has already
converted the input into plain owned data.

`compile()` uses `new Function` by design. If a deployment forbids dynamic code
generation through Content Security Policy, use normal guards or
`emitAotModule()` instead.

## Known Limitations And Reportability

Proxy trap execution and post-validation Proxy instability are known platform
limitations, not a promise of trap-free validation. Reports remain actionable
when safe mode executes an ordinary accessor getter, accepts a prototype-backed
field as an own field, mishandles pollution-sensitive keys, or diverges between
native and compiled safe verdicts on the same observable input.

## Release Integrity

The package is expected to have zero runtime, peer, optional, and bundled
dependencies. Release checks verify package contents, public API drift, docs,
tests, consumer install smoke, benchmarks, and dist policy before publishing.
Normal releases should go through GitHub Releases so npm provenance is attached.
