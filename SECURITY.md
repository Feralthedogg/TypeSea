# Security Policy

## Supported Versions

TypeSea supports the latest published minor line. Security fixes are released as
patch versions whenever a fix can be shipped without changing the public API.

| Version | Supported |
| --- | --- |
| 0.3.x | yes |
| 0.2.x | no |

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

The default validation mode is `safe`. It is the mode intended for hostile
boundary data. Safe mode avoids user getter execution, treats prototype-backed
data as untrusted, handles `__proto__` and `constructor` keys with
null-prototype lookups, checks strict-object symbol and non-enumerable extras,
and returns explicit `Result` values for expected failures.

`unsafe` and `unchecked` are performance escape hatches for trusted,
already-normalized data. They may execute getters, may accept prototype-backed
values, and may relax strict-object extra-key guarantees. Do not use these modes
on public input boundaries unless a separate normalization step has already
converted the input into plain owned data.

`compile()` uses `new Function` by design. If a deployment forbids dynamic code
generation through Content Security Policy, use normal guards or
`emitAotModule()` instead.

## Release Integrity

The package is expected to have zero runtime, peer, optional, and bundled
dependencies. Release checks verify package contents, public API drift, docs,
tests, consumer install smoke, benchmarks, and dist policy before publishing.
Normal releases should go through GitHub Releases so npm provenance is attached.
