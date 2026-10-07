// Codemod de migración a tokens semánticos de tema (theme-light-mode).
// Reescribe clases night-*/white-* a canvas/surface/elevated/raised/
// ink/line/on-accent según la utilidad. Ejecutar desde apps/web:
//   node scripts/codemod-theme.cjs
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src");
const EXTS = new Set([".tsx", ".ts"]);

// night-* → semántico por utilidad. Bordes/divisores van a `line`
// (hairline sólido, equivale a night-700 en dark); fills y textos van
// a su token de superficie/tinta.
const NIGHT_BG = { 950: "canvas", 900: "surface", 800: "elevated", 700: "raised", 600: "raised" };
const LINE_PREFIXES = /^(border|divide|ring|ring-offset|outline|placeholder)-/;

function migrate(content) {
  // 1) Texto sobre acento: on-accent es fijo (siempre casi negro sobre
  //    el acento vivo) - va primero para que no lo capture el mapa night.
  content = content.replace(/(?<![-\w])text-night-950\b/g, "text-on-accent");
  // text-black solo aparece sobre bg-neon (botones) - mismo destino.
  content = content.replace(/(?<![-\w])text-black\b/g, "text-on-accent");

  // 2) bg-white suelto (container de chart en admin) → surface.
  content = content.replace(/(?<![-\w])bg-white(?![/\w-])/g, "bg-surface");

  // 3) white/* → ink/* conservando opacidad y variante. Cubre todos los
  //    prefijos de color de Tailwind. Las excepciones sobre fondos de
  //    color (badges) se revierten a mano tras el codemod.
  content = content.replace(
    /(?<![-\w])((?:[a-z-]+:)*)(bg|text|border|divide|placeholder|ring|ring-offset|from|via|to|stroke|fill|caret|decoration|accent|outline)-white(\/\d+(?:\.\d+)?)?\b/g,
    (_m, variants, util, alpha) => `${variants}${util}-ink${alpha ?? ""}`,
  );

  // 4) night-*: prefijos de línea → line; el resto según tabla.
  content = content.replace(
    /(?<![-\w])((?:[a-z-]+:)*)([a-z-]+)-night-(950|900|800|700|600)\b/g,
    (_m, variants, util, step) => {
      const token = LINE_PREFIXES.test(`${util}-`)
        ? "line"
        : util === "text" || util === "fill" || util === "stroke" || util === "caret" || util === "decoration"
          ? "ink"
          : NIGHT_BG[step];
      return `${variants}${util}-${token}`;
    },
  );

  return content;
}

let files = 0;
let changed = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walk(p);
    } else if (EXTS.has(path.extname(entry.name))) {
      files++;
      const before = fs.readFileSync(p, "utf8");
      const after = migrate(before);
      if (after !== before) {
        fs.writeFileSync(p, after);
        changed++;
        console.log(path.relative(SRC, p));
      }
    }
  }
}

walk(SRC);
console.log(`\n${changed}/${files} archivos migrados`);
