// Debug genérico: llama un endpoint GET de Flow sandbox con firma.
// No imprime credenciales - solo la respuesta de Flow.
// Uso: node apps/api/scripts/flow-call.cjs <endpoint> key=value ...
// Ej:  node apps/api/scripts/flow-call.cjs customer/get customerId=cus_xxx
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const envPath = path.join(__dirname, "..", "..", "..", ".env");
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].split(/\s+#/)[0]]),
);

const apiKey = env.FLOW_API_KEY;
const secret = env.FLOW_SECRET_KEY;
const base = env.FLOW_BASE_URL ?? "https://sandbox.flow.cl/api";
const [endpoint, ...pairs] = process.argv.slice(2);
if (!apiKey || !secret || !endpoint || !pairs.length) {
  console.error("uso: node flow-call.cjs <endpoint> key=value ...");
  process.exit(1);
}

const params = { apiKey, ...Object.fromEntries(pairs.map((p) => p.split("="))) };
const toSign = Object.keys(params)
  .sort()
  .map((k) => k + params[k])
  .join("");
const s = crypto.createHmac("sha256", secret).update(toSign).digest("hex");
const qs = new URLSearchParams({ ...params, s }).toString();

fetch(`${base}/${endpoint}?${qs}`)
  .then(async (r) => {
    console.log("HTTP", r.status);
    console.log(JSON.stringify(await r.json(), null, 2));
  })
  .catch((e) => {
    console.error("ERROR", e.message);
    process.exit(1);
  });
