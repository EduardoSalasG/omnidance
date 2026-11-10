#!/usr/bin/env node
// Verifica que los bloques ```mermaid de uno o más .md parseen con el
// parser real de mermaid. Uso:
//   node .devin/skills/mermaid-diagrams/scripts/check-mermaid.mjs docs/flows.md [más.md]
// Auto-instala mermaid@11 + jsdom en %TEMP%/omnidance-mermaid-check la
// primera vez (fuera del repo, sin tocar package.json).
import { execSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(tmpdir(), "omnidance-mermaid-check");
const self = dirname(fileURLToPath(import.meta.url));

const files = process.argv.slice(2);
if (!files.length) {
  console.error("uso: node check-mermaid.mjs <archivo.md> [más...]");
  process.exit(2);
}

if (!existsSync(join(DIR, "node_modules", "mermaid"))) {
  mkdirSync(DIR, { recursive: true });
  execSync("npm init -y", { cwd: DIR, stdio: "ignore" });
  console.log(`instalando mermaid + jsdom en ${DIR} (solo la 1ª vez)…`);
  execSync("npm i mermaid@11 jsdom", { cwd: DIR, stdio: "inherit" });
}

// run.mjs vive junto al node_modules del scratch dir: los imports
// bare ("mermaid", "jsdom") resuelven ahí, no en el repo.
copyFileSync(join(self, "run.mjs"), join(DIR, "run.mjs"));
const r = spawnSync(
  process.execPath,
  [join(DIR, "run.mjs"), ...files],
  { stdio: "inherit" },
);
process.exit(r.status ?? 1);
