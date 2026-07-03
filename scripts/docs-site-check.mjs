import { readFile } from "node:fs/promises";

const result = await main();
if (!result.ok) {
  console.error(result.error);
  process.exitCode = 1;
}

async function main() {
  const source = await readFile("docs/index.html", "utf8");
  const required = [
    "<title>TypeSea Docs</title>",
    'id="overview"',
    'id="quick-start"',
    'id="architecture"',
    'id="api"',
    'id="adapters"',
    'id="benchmarks"',
    'id="release"',
    'id="files"',
    "Sea-of-Nodes validation IR",
    "Zod, Valibot, and Ajv",
    "npm run release:check",
    'href="https://github.com/Feralthedogg/TypeSea"',
    'href="https://github.com/Feralthedogg/TypeSea/blob/main/docs/api.md"',
    'href="https://github.com/Feralthedogg/TypeSea/blob/main/docs/engine-notes.md"'
  ];

  for (let index = 0; index < required.length; index += 1) {
    const needle = required[index];
    if (needle !== undefined && !source.includes(needle)) {
      return err(`docs/index.html missing ${needle}`);
    }
  }

  const hrefs = collectHrefs(source);
  for (let index = 0; index < hrefs.length; index += 1) {
    const href = hrefs[index];
    if (href === undefined) {
      continue;
    }
    if (href.startsWith("http://") || href.startsWith("https://")) {
      if (!href.startsWith("https://github.com/Feralthedogg/TypeSea")) {
        return err(`docs/index.html has unsupported remote link ${href}`);
      }
      continue;
    }
    if (href.startsWith("#")) {
      const id = href.slice(1);
      if (!source.includes(`id="${id}"`)) {
        return err(`docs/index.html has broken anchor ${href}`);
      }
    }
  }

  return ok(undefined);
}

function collectHrefs(source) {
  const hrefs = [];
  const pattern = /href="([^"]+)"/gu;
  let match = pattern.exec(source);
  while (match !== null) {
    const href = match[1];
    if (href !== undefined) {
      hrefs.push(href);
    }
    match = pattern.exec(source);
  }
  return hrefs;
}

function ok(value) {
  return { ok: true, value };
}

function err(error) {
  return { ok: false, error };
}
