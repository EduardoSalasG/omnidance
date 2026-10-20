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

## Cierre posterior 2 (misma sesión)

- **i18n catch-up completo** (`f460b07`): las 207 keys faltantes traducidas a en/fr/pt-PT (187 `admin.*` → `parts/<loc>/admin.json`; 20 `home.*`/`academy.newAcademy`/`adminCatalogs.*` → `messages/<loc>.json`), 4 extras eliminadas (`admin.academies.students/top/atRisk/noneAtRisk`), y fix de 2 valores en chino colados en es-CL (`noStudents`, `noPlans`). Parity: `3823 keys · missing 0 · extra 0` ×3 locales; audit `ALL_KEYS_OK`. Change openspec omitido explícitamente (no toca comportamiento).
- **Spec del review gate** (`79dd0ef`): `academy-review.spec.ts` — 7 tests (isAcademyVisible, evaluateAcademyChecks por campo, promoteCompletedAcademies) verdes.
- **QA vivo preventa atribuida `?a=`** (gap del handoff 11-03): deal `Latin Dancing` 20% sobre "Desafío de Tronos" INVITED→ACTIVE → compra dancer con `academyId` → webhook stub PAID → `Payment.soldByAcademyId` + `academyCommissionClp=1200`, `producerNetClp=5520` intacto → deuda `pendingClp:1200` en `sale-deals` → `mark-paid` materializa `AcademySaleSettlement` con `evidenceUrl`.
- **QA vivo selector de idioma**: `PATCH /me {language:"en"}` persiste (GET /me lo devuelve); idioma inválido → 400.

## Brechas conocidas / pendientes

- ~~`analytics-query-engine` abierto~~ → **archivado** (ver arriba).
- ~~Deuda i18n~~ → **cerrada** (catch-up commiteado, paridad total).
- ~~Sin specs del review gate~~ → **cubierto** (academy-review.spec.ts, 7 tests).
- Lock stale `openspec/changes/archive/.openspec-archive.lock` reaparece tras cada `openspec archive` — hay que borrarlo entre corridas (bug del CLI, no del repo).
- Pendientes de handoffs previos: seed `SEED_ENV=dev` contra Neon prod (requiere URL directa), QA OTP en PWA instalada.

## Nota operativa

- `pnpm --filter @omnidance/api build` (nest build) **borra `dist/main` y mata el `nest start --watch` del dev server** — correr build solo con el dev detenido, o reiniciar `pnpm dev` después.

## Release 1.1.0 — armado, BLOQUEADO por suite e2e

- Version bump + CHANGELOG commiteados en `7d93df8` (dev). **Sin merge a main ni tag**: `pnpm test` tiene 38 fallos en 6 specs (pre-existentes, no de esta sesión).
- Ya reparado en `3baddea`: fixtures de academia → `reviewStatus:"APPROVED"` (6 specs), SANDBOX→PENDING (admin.e2e), admin con PRODUCER APPROVED (gap-producer). Bajó de 45→38 fallos.
- **Patrón restante**: fixtures de productor sin `proTier`/`proTrialEndsAt` → `requireProSelf` lanza PRO_REQUIRED (events.controller.spec y similares); revisar los 6 archivos rojos con `pnpm --filter @omnidance/api test` y agregar `proTrialEndsAt: future` o `proTier:"PRO_STARTER"` al fixture del productor.
- Después de suite verde → `git checkout main && git merge dev && git tag v1.1.0 && push` → el deploy corre migrate → **recién ahí** lanzar `SEED_ENV=dev pnpm --filter @omnidance/api prisma db seed` con la DATABASE_URL de Neon (el seed ya lleva `reviewStatus:"APPROVED"` en academias demo).
- Foto upload en prod: infra ya montada por el usuario (`/mnt/omnidance/uploads` + compose + nginx `client_max_body_size`).
