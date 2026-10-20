# Handoff — 2026-10-20c (cierre de housekeeping OpenSpec + QA academy-approval-gate)

**Rama**: `dev` (19 commits ahead de origin/dev) · **Commits**: `ca6af39` i18n+docs, `f3c8cec` openspec archives.
**Stack**: levantado y verificado — db docker :5433, redis :6379, api :4000 (`/api/health` 200), web :3000 (200).

## Qué quedó hecho

- **Archivados 4 changes** (deltas volcados a specs canónicas):
  - `fix-hydration-localstorage` (estaba 5/5).
  - `admin-console-billing-nav` (estaba 16/16) → specs `admin-finance/console`, `admin/home-insights` (nueva), `responsive-app-shell`.
  - `2026-10-10-fix-ssr-api-url-socket` → task 5 marcada (tag `v0.8.1` + verificación prod ya documentada en handoff 10-20a).
  - `academy-approval-gate` → spec `academies/approval-gate` (nueva), updates a `academies/public-profile` y `admin`.
- **i18n**: namespaces `academyReview` + `adminValidation` traducidos a en/fr/pt-PT en `messages/*.json` (faltaban — el gate y role-pipeline los habían dejado solo en es-CL).
- **Docs**: `architecture.md` (fila admin + modelo `Academy.reviewStatus/photoUrl` + RBAC stale de SANDBOX corregido), `flows.md` (stateDiagram del gate + ciclo de roles actualizado), `docs/openapi.json` + postman regenerados (310 paths).
- **QA en vivo del review gate** (sesiones JWT minted local, JWT_SECRET dev):
  - `POST /academies` → nace `PENDING` → oculta del directorio público.
  - Owner ve `reviewStatus` + `checks` por ítem en `/academies/mine`.
  - `GET /admin/academy-review-queue` lista PENDING con checks + owner.
  - Admin reject → REJECTED → oculta (ficha 404 a bailarín sin privilegio; admin/manager sí la ve → 200).
  - Admin approve → APPROVED → visible + ficha 200.
  - Checklist completado (data seed) → **auto-promoción** a APPROVED en el siguiente `GET /academies` (dentro del request, no en el PATCH).

## Cierre posterior (misma sesión)

- **`analytics-query-engine` archivado**: task 6.3 cumplida vía Playwright headless con sesión admin (JWT minted local) — `/analitica` en 320/768/1024/1440: todas 200, **sin overflow horizontal** (`scrollWidth == clientWidth`), console renderiza catálogo+filtros+acciones. Screenshots en `test-results/qa-viewport/analitica-{320,768,1024,1440}.png`. Nota: socket.io polling 404 por el proxy dev de Next (en prod lo resuelve el redirect edge de netlify.toml) — ruido conocido, no del change. Specs: `analytics/query-console` (nueva) + `events/producer-export`.

## Brechas conocidas / pendientes

- ~~`analytics-query-engine` abierto~~ → **archivado** (ver arriba).
- **Deuda i18n amplia**: quedan ~207 keys faltantes en en/fr/pt-PT de otros cambios (`home.kpi.*`, `admin.users.*`, `academy.newAcademy`, etc.) + 4 extras. No es del scope del gate — candidata a un change propio de "i18n catch-up".
- **Sin specs del review gate**: ningún test cubre `academy-review.ts` ni la cola admin (el QA se hizo en vivo contra la API). Si se toca esa lógica, agregar spec antes.
- Lock stale `openspec/changes/archive/.openspec-archive.lock` reaparece tras cada `openspec archive` — hay que borrarlo entre corridas (bug del CLI, no del repo).
- Pendientes de handoffs previos siguen vivos: seed `SEED_ENV=dev` contra Neon prod, QA compra atribuida `?a=`, QA selector de idioma con sesión real, QA OTP en PWA.

## Nota operativa

- `pnpm --filter @omnidance/api build` (nest build) **borra `dist/main` y mata el `nest start --watch` del dev server** — correr build solo con el dev detenido, o reiniciar `pnpm dev` después.
