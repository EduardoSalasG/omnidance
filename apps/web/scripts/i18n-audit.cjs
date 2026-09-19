// Auditoría de claves i18n: extrae t("...") por namespace y compara con messages/es-CL.json
const fs = require("fs");
const path = require("path");
// Base + parts: mismo merge nivel-por-nivel que src/i18n/messages.ts,
// para que claves vivas solo en parts/* no reporten falso faltante.
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
const base = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../messages/es-CL.json"), "utf8"),
);
const partsDir = path.join(__dirname, "../src/i18n/parts");
const msgs = fs
  .readdirSync(partsDir)
  .filter((f) => f.endsWith(".json"))
  .reduce(
    (acc, f) =>
      merge(acc, JSON.parse(fs.readFileSync(path.join(partsDir, f), "utf8"))),
    base,
  );
const files = [];
const walk = (d) => {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const s = fs.statSync(p);
    if (s.isDirectory()) walk(p);
    else if (/\.(tsx?|jsx?)$/.test(f)) files.push(p);
  }
};
walk(path.join(__dirname, "../src"));
const missing = new Set();
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const vars = {};
  const decl = /(\w+)\s*=\s*useTranslations\(['"]([^'"]+)['"]\)/g;
  let m;
  while ((m = decl.exec(src))) vars[m[1]] = m[2];
  for (const [v, ns] of Object.entries(vars)) {
    const call = new RegExp(
      "\\b" + v + "\\(\\s*(?:`([^`]+)`|'([^']+)'|\"([^\"]+)\")",
      "g",
    );
    let c;
    while ((c = call.exec(src))) {
      const key = c[1] || c[2] || c[3];
      // Resolver namespace (puede contener puntos, ej. "realtime.toast")
      let nsNode = msgs;
      for (const part of ns.split(".")) nsNode = nsNode?.[part];
      if (key.includes("${")) {
        const prefix = key.split("${")[0];
        let node = nsNode;
        for (const part of prefix.split(".").filter(Boolean))
          node = node?.[part];
        if (!node) missing.add(`${ns}.${prefix}* (${path.basename(f)})`);
        continue;
      }
      let node = nsNode;
      for (const part of key.split(".")) node = node?.[part];
      if (node === undefined) missing.add(`${ns}.${key} (${path.basename(f)})`);
    }
  }
}
console.log(missing.size ? [...missing].join("\n") : "ALL_KEYS_OK");
