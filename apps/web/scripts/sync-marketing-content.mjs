#!/usr/bin/env node
/**
 * sync-marketing-content: regenera los catálogos JSON de las landings
 * (src/content/) desde los endpoints públicos del API. El resultado se
 * commitea - los archivos también son editables a mano (spec
 * marketing-content).
 *
 *   pnpm --filter @omnidance/web content:sync
 *
 * Resolución del API: API_URL > API_PROXY_TARGET > http://127.0.0.1:4000
 * (IPv4 explícito, mismo criterio que next.config.mjs: "localhost" en
 * Windows a veces resuelve ::1 y el API solo escucha IPv4).
 *
 * Reglas: recolecta TODO antes de escribir; cualquier fallo aborta con
 * exit 1 sin tocar archivos (nunca se pisa data buena con vacío).
 * Idempotente: misma data → mismos archivos.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const API =
  process.env.API_URL ??
  process.env.API_PROXY_TARGET ??
  "http://127.0.0.1:4000";

const CONTENT = fileURLToPath(new URL("../src/content/", import.meta.url));

async function getJson(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

function jsonFile(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

async function main() {
  // 1. Recolectar todo primero - cualquier error aborta sin escribir.
  const [events, academies] = await Promise.all([
    getJson("/api/events"),
    getJson("/api/academies/public"),
  ]);
  if (!Array.isArray(events)) throw new Error("/api/events no devolvió array");
  if (!Array.isArray(academies))
    throw new Error("/api/academies/public no devolvió array");

  // 2. Escribir los catálogos (una sola fecha para el lote).
  const generatedAt = new Date().toISOString();
  await writeFile(
    join(CONTENT, "events.json"),
    jsonFile({ generatedAt, events }),
  );
  await writeFile(
    join(CONTENT, "academies.json"),
    jsonFile({ generatedAt, academies }),
  );

  console.log(
    `content:sync ok - ${events.length} eventos, ${academies.length} academias (${API})`,
  );
}

main().catch((err) => {
  console.error(`content:sync falló: ${err.message}`);
  console.error("Los catálogos existentes quedaron intactos.");
  process.exit(1);
});
