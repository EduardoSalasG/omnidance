// Paridad de keys entre locales: merge(base + parts) por locale,
// comparado contra es-CL. Uso: node scripts/i18n-parity.cjs
const fs = require("fs");
const path = require("path");

const LOCALES = ["es-CL", "en", "fr", "pt-PT"];
const merge = (a, b) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const prev = out[k];
    out[k] =
      v && typeof v === "object" && !Array.isArray(v) && prev && typeof prev === "object" && !Array.isArray(prev)
        ? merge(prev, v)
        : v;
  }
  return out;
};
const flat = (o, p = "") => {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, flat(v, key));
    else out[key] = 1;
  }
  return out;
};

const catalogs = {};
for (const l of LOCALES) {
  let cat = JSON.parse(fs.readFileSync(path.join(__dirname, `../messages/${l}.json`), "utf8"));
  const partsDir = path.join(__dirname, "../src/i18n/parts", l);
  if (fs.existsSync(partsDir)) {
    for (const f of fs.readdirSync(partsDir).filter((x) => x.endsWith(".json"))) {
      cat = merge(cat, JSON.parse(fs.readFileSync(path.join(partsDir, f), "utf8")));
    }
  } else {
    // parts de es-CL raíz para el default
    const esDir = path.join(__dirname, "../src/i18n/parts");
    for (const f of fs.readdirSync(esDir).filter((x) => x.endsWith(".json"))) {
      cat = merge(cat, JSON.parse(fs.readFileSync(path.join(esDir, f), "utf8")));
    }
  }
  catalogs[l] = flat(cat);
}

const ref = catalogs["es-CL"];
let fail = 0;
for (const l of LOCALES.slice(1)) {
  const c = catalogs[l];
  const missing = Object.keys(ref).filter((k) => !(k in c));
  const extra = Object.keys(c).filter((k) => !(k in ref));
  console.log(`${l}: ${Object.keys(c).length} keys · missing ${missing.length} · extra ${extra.length}`);
  if (missing.length) { console.log("  missing:", missing.slice(0, 20)); fail = 1; }
  if (extra.length) { console.log("  extra:", extra.slice(0, 20)); fail = 1; }
}
process.exit(fail);
