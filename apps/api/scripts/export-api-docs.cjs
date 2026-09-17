#!/usr/bin/env node
/**
 * Exporta el documento OpenAPI del API corriendo y genera:
 *   docs/openapi.json
 *   docs/postman/omni-dance.postman_collection.json
 *
 * Uso:  node scripts/export-api-docs.cjs [baseUrl]
 * Default baseUrl: http://localhost:4000
 *
 * Requiere el API arriba (pnpm --filter @omnidance/api dev).
 */
const { writeFileSync, mkdirSync } = require("fs");
const { join } = require("path");

const BASE = process.argv[2] ?? "http://localhost:4000";
const DOCS_DIR = join(__dirname, "..", "..", "..", "docs");

const METHODS_WITH_BODY = new Set(["post", "put", "patch"]);

/** Genera un body de ejemplo plano a partir de un schema OpenAPI. */
function exampleFromSchema(schema, components, depth = 0) {
  if (!schema || depth > 4) return {};
  if (schema.$ref) {
    const name = schema.$ref.split("/").pop();
    return exampleFromSchema(components?.schemas?.[name], components, depth + 1);
  }
  if (schema.type === "array") {
    return [exampleFromSchema(schema.items, components, depth + 1)];
  }
  if (schema.type === "object" || schema.properties) {
    const out = {};
    for (const [k, v] of Object.entries(schema.properties ?? {})) {
      out[k] = exampleFromSchema(v, components, depth + 1);
    }
    return out;
  }
  if (schema.enum?.length) return schema.enum[0];
  switch (schema.type) {
    case "string":
      return schema.format === "email"
        ? "persona@ejemplo.cl"
        : schema.format === "date-time"
          ? new Date().toISOString()
          : "string";
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return true;
    default:
      return null;
  }
}

function toPostman(openapi) {
  const components = openapi.components;
  const items = [];

  for (const [path, ops] of Object.entries(openapi.paths ?? {})) {
    for (const [method, op] of Object.entries(ops)) {
      if (!op || typeof op !== "object") continue;
      const tag = op.tags?.[0] ?? path.split("/")[2] ?? "misc";
      const url = `{{baseUrl}}${path}`;

      const request = {
        method: method.toUpperCase(),
        header: [],
        url: {
          raw: url,
          host: ["{{baseUrl}}"],
          path: path.split("/").filter(Boolean),
        },
        description: op.summary ?? op.description,
      };

      const params = (op.parameters ?? []).filter(
        (p) => p.in === "query" || p.in === "path",
      );
      if (params.length) {
        request.url.variable = params
          .filter((p) => p.in === "path")
          .map((p) => ({ key: p.name, value: `:${p.name}` }));
        request.url.query = params
          .filter((p) => p.in === "query")
          .map((p) => ({ key: p.name, value: "", disabled: true }));
      }

      const body = op.requestBody?.content?.["application/json"];
      if (METHODS_WITH_BODY.has(method) && body) {
        request.header.push({ key: "Content-Type", value: "application/json" });
        const example =
          body.example ??
          body.examples?.[Object.keys(body.examples)[0]]?.value ??
          exampleFromSchema(body.schema, components);
        request.body = {
          mode: "raw",
          raw: JSON.stringify(example, null, 2),
          options: { raw: { language: "json" } },
        };
      }

      let folder = items.find((f) => f.name === tag);
      if (!folder) {
        folder = { name: tag, item: [] };
        items.push(folder);
      }
      folder.item.push({
        name: op.summary ?? `${method.toUpperCase()} ${path}`,
        request,
      });
    }
  }

  return {
    info: {
      name: "omni-dance API",
      description:
        "Generada desde /api/docs-json — regenerar con `node apps/api/scripts/export-api-docs.cjs` tras cambios de endpoints.",
      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    variable: [{ key: "baseUrl", value: BASE }],
    item: items,
  };
}

async function main() {
  const res = await fetch(`${BASE}/api/docs-json`);
  if (!res.ok) {
    console.error(`GET ${BASE}/api/docs-json → ${res.status} — ¿está el API arriba?`);
    process.exit(1);
  }
  const openapi = await res.json();

  mkdirSync(join(DOCS_DIR, "postman"), { recursive: true });
  writeFileSync(
    join(DOCS_DIR, "openapi.json"),
    JSON.stringify(openapi, null, 2),
  );
  writeFileSync(
    join(DOCS_DIR, "postman", "omni-dance.postman_collection.json"),
    JSON.stringify(toPostman(openapi), null, 2),
  );

  const paths = Object.keys(openapi.paths ?? {}).length;
  console.log(`openapi.json: ${paths} paths exportados`);
  console.log(`postman collection: ${paths} requests agrupados por tag`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
