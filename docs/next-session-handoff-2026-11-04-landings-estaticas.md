# Handoff: landings-estaticas completado + archivado

**Rama**: `dev`. Stack: DB/Redis en docker (arriba). Web dev corriendo
en background (shell web2, :3000). **API apagada** - la maté para el
smoke de "landings sin backend"; levantar con `pnpm dev:api` si se
necesita (`THROTTLE_AUTH_LIMIT=120` para e2e).

## Commit de la sesión

- feat(web): landings estaticas - data desde catalogos JSON commiteados
  (change `landings-estaticas` creado, implementado, verificado y
  **archivado** como `2026-11-04-landings-estaticas`).

## Qué quedó

- `/`, `/pro`, `/para-academias`, `/para-productores`: cero requests al
  API en render. Eventos/academias salen de `apps/web/src/content/
  events.json` + `academies.json` (commiteados, editables a mano).
- `src/lib/marketing-content.ts`: `marketingEvents()`,
  `marketingAcademies()`, `thisWeek()`, tipo `PublicAcademy`.
- `apps/web/scripts/sync-marketing-content.mjs` →
  `pnpm --filter @omnidance/web content:sync` (documentado en AGENTS.md).
  Regenera los JSONs desde `/api/events` + `/api/academies/public`;
  aborta sin escribir si el API falla.
- ISR `revalidate=3600` en las 4 páginas: solo re-ejecuta el render
  (recalcula "esta semana" sin API).
- Eliminados `lib/public-events.ts` y `lib/public-academies.ts`.
  `lib/public-cities.ts` se conserva (lo usan `/ciudades` + `sitemap`,
  que quedaron dinámicas por decisión del usuario).
- Spec nueva `openspec/specs/marketing-content` + delta en
  `landing-marketing` archivados.

## Alcance REAL (el usuario acotó en sesión)

"Landing" = inicio, pro, para-academias, para-productores (+ legales,
que ya eran estáticas). `/ciudades`, `/pase`, `/e/[id]`, `/reclamar`
**no** son landings para el usuario: quedan dinámicas, no tocarlas.

## Verificación (evidencia)

- API matada (curl 000): las 4 landings + /terminos + /privacidad →
  200; `/` muestra "26 eventos" y JsonLd DanceEvent del catálogo;
  `/para-academias` muestra "Academia Tumbao" del catálogo.
- `pnpm --filter @omnidance/web typecheck` limpio; `lint` 0 errores
  (74 warnings pre-existentes).
- `openspec validate --changes` verde pre-archive; archive aplicó
  +3 requisitos nuevos, ~1 modificado.

## Incidentes de infra

- Zombie :3000 otra vez (node 4.9GB): taskkill + `rm -rf .next`, dev
  reiniciado limpio.

## Pendiente (resto del backlog, sin cambios)

- **e2e-flow-tests cierre**: task 8 (corrida completa chromium +
  `e2e-which` + inventory §0) y decisión `dancer-checkout` (gateway
  stub vs skip) → `openspec archive`. Specs ya verdes tasks 9-21.
- `customer/collect` automático por job (PlatformChargesService listo).
- Smoke visual superficies pasada B (clases, series, particulares, hub).
- multipais-foundation tasks 10/11/13 (épica).

## Notas operativas (vigentes)

- `git` no está en PATH: `export PATH="/c/Program Files/Git/bin:$PATH"`.
- Re-sync de catálogos cuando cambie la cartelera pública:
  `pnpm --filter @omnidance/web content:sync` con API viva + commitear.
- Specs e2e: `pnpm exec playwright test e2e/flows/<spec>
  --project=chromium --no-deps`.
- `openspec archive` lock stale: `rm
  openspec/changes/archive/.openspec-archive.lock` y reintentar.
