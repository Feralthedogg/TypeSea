# TypeSea documentation site

The documentation site is a statically generated SvelteKit application. It uses
Paraglide JS for English and Korean routing, mdsvex for the project Markdown,
and Lily Svelte components for the interface.

## Development

Run all website commands from this directory with pnpm:

```sh
corepack pnpm install
corepack pnpm run dev
```

`pnpm run dev` synchronizes the root `README.md` and `docs/` tree into generated
mdsvex modules before starting Vite. Do not edit files under
`src/lib/generated/`; they are build artifacts.

## Content and translation

- `../README.md` and `../docs/*.md` are the English source documents.
- `../docs/ko/readme.md` and `../docs/ko/*.md` are their Korean counterparts.
- `messages/en.json` and `messages/ko.json` contain navigation and interface text.
- `scripts/sync-content.mjs` validates document pairs and creates the route
  manifest, search index, and mdsvex inputs.

When a document heading changes, update the corresponding translated heading so
both versions keep the same structure. Run `pnpm run check` to catch missing
translations or invalid Svelte code.

## Production build

Build for a root deployment:

```sh
corepack pnpm run build
```

GitHub Pages serves the repository below `/TypeSea`, so its workflow builds with:

```sh
BASE_PATH=/TypeSea corepack pnpm run build
```

The static output is written to `build/`. `pnpm run verify` runs formatting,
linting, Svelte diagnostics, and the production build in one command.
