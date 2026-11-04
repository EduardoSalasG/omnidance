#!/usr/bin/env node
// e2e-which: dado un diff de git, imprime los tags e2e a correr segun
// e2e/flow-map.json (prefijo de path, gana la primera regla que
// matchea; sin match -> defaultTags).
//
// Uso:
//   node scripts/e2e-which.mjs                 # diff HEAD (incluye unstaged)
//   node scripts/e2e-which.mjs origin/dev...HEAD
//   node scripts/e2e-which.mjs --files a.ts b/c.tsx   # paths explicitos
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const map = JSON.parse(readFileSync(join(root, "e2e", "flow-map.json"), "utf8"));

const args = process.argv.slice(2);
let files;
if (args[0] === "--files") {
  files = args.slice(1);
} else {
  const base = args[0] ?? "HEAD";
  files = execSync(`git diff --name-only ${base}`, {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

const tags = new Set();
const unmatched = [];
for (const file of files) {
  const rule = map.rules.find((r) =>
    r.paths.some((p) => file === p || file.startsWith(`${p}/`)),
  );
  if (rule) rule.tags.forEach((t) => tags.add(t));
  else unmatched.push(file);
}
if (unmatched.length) map.defaultTags.forEach((t) => tags.add(t));

const list = [...tags];
if (files.length === 0) {
  console.log("Sin archivos en el diff; nada que correr.");
  process.exit(0);
}
console.log(`Archivos: ${files.length} (${unmatched.length} sin regla -> defaultTags)`);
console.log(`Tags: ${list.join(" ")}`);
console.log(
  `\n  pnpm test:e2e --grep "${list.join("|")}" --project=chromium`,
);
