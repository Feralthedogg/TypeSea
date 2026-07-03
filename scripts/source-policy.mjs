import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const roots = ["src", "test", "bench", "scripts", "eslint.config.mjs"];
const forbiddenWords = ["a" + "ny", "tr" + "y", "ca" + "tch"];
const forbidden = new RegExp(`\\b(?:${forbiddenWords.join("|")})\\b`, "u");
const forbiddenSnippets = [
  "function " + "contract",
  "routine " + "contract",
  "type alias " + "contract",
  "interface " + "contract",
  "constant " + "contract",
  "field " + "contract",
  "Borrowed input slot " + "named",
  "Documents one concrete " + "slot",
  "Defines a closed compile-time " + "contract"
];
const violations = [];

for (let index = 0; index < roots.length; index += 1) {
  const root = roots[index];
  if (root !== undefined) {
    await scanPath(root);
  }
}

if (violations.length !== 0) {
  for (let index = 0; index < violations.length; index += 1) {
    const violation = violations[index];
    if (violation !== undefined) {
      console.error(violation);
    }
  }
  process.exitCode = 1;
}

async function scanPath(path) {
  const entry = await lstat(path);
  if (entry.isDirectory()) {
    await scanDirectory(path);
    return;
  }
  if (entry.isFile() && isCheckedSourceFile(path)) {
    await scanFile(path);
  }
}

async function scanDirectory(path) {
  const entries = await readdir(path, { withFileTypes: true });
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) {
      continue;
    }
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      await scanDirectory(child);
      continue;
    }
    if (!entry.isFile() || !isCheckedSourceFile(entry.name)) {
      continue;
    }
    await scanFile(child);
  }
}

async function scanFile(path) {
  const source = await readFile(path, "utf8");
  const lines = source.split("\n");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line === undefined) {
      continue;
    }
    if (forbidden.test(line)) {
      violations.push(`${path}:${String(lineIndex + 1)} banned token`);
      continue;
    }
    const snippet = findForbiddenSnippet(line);
    if (snippet !== undefined) {
      violations.push(`${path}:${String(lineIndex + 1)} boilerplate comment: ${snippet}`);
    }
  }
}

function findForbiddenSnippet(line) {
  for (let index = 0; index < forbiddenSnippets.length; index += 1) {
    const snippet = forbiddenSnippets[index];
    if (snippet !== undefined && line.includes(snippet)) {
      return snippet;
    }
  }
  return undefined;
}

function isCheckedSourceFile(name) {
  return name.endsWith(".ts") || name.endsWith(".mjs");
}
