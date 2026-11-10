// Valida bloques ```mermaid de archivos .md con el parser real de
// mermaid (jison). Corre DENTRO del scratch dir que arma
// check-mermaid.mjs, junto al node_modules con mermaid + jsdom.
// Salida: OK/FAIL por bloque con línea del fence + resumen. Exit 1 si
// algún bloque falla.
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("uso: node run.mjs <archivo.md> [más...]");
  process.exit(2);
}

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});

const { default: mermaid } = await import("mermaid");
mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });

let total = 0;
let fails = 0;
for (const file of files) {
  const md = readFileSync(file, "utf8");
  const lines = md.split(/\r?\n/);
  let inBlock = false;
  let start = 0;
  let buf = [];
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!inBlock && l.trim() === "```mermaid") {
      inBlock = true;
      start = i + 1;
      buf = [];
    } else if (inBlock && l.trim() === "```") {
      n++;
      total++;
      try {
        await mermaid.parse(buf.join("\n"));
        console.log(`OK    ${file}#${n}  línea ${start}`);
      } catch (e) {
        fails++;
        const msg = String(e?.message ?? e)
          .split("\n")
          .slice(0, 6)
          .join("\n      ");
        console.log(`FAIL  ${file}#${n}  línea ${start}\n      ${msg}`);
      }
      inBlock = false;
    } else if (inBlock) {
      buf.push(l);
    }
  }
}
console.log(`\n${total} bloques, ${fails} con error`);
process.exit(fails ? 1 : 0);
