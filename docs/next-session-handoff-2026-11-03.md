# Handoff 2026-11-03 - Inicio academia (dashboard owner)

## Estado

Branch `dev`. API :4000 y web :3000 corriendo (`pnpm dev` por lado). Login demo: `gabriel@omnidance.dev` / `omnidance123`; lente academy owner via `localStorage["omnidance:active-role"]="ACADEMY_OWNER"`.

## Hecho esta sesión

- **Card del agenda "Niveles y cupos"**: alto por contenido (`height:auto`, posicionada por hora de inicio) - aire interno eliminado de raíz tras ~6 iteraciones de flex. Padding compacto (`pb-0`, footer `pt-1.5 pb-1.5`, separador métricas `mt-1.5 pt-1.5 pb-1.5`), "de N" del footer a `text-xs`.
- **Home Extendido**: fila de KPIs del mes (alumnos activos / clases·sem / asistencia·clase→`/academia/asistencia` / Reservas hoy=ΣbookedCount de todayClasses) con hint visible bajo el valor y delta MTD; `AcademyKpiCards` ganó slot `extra`. Sección Facturación propia (facturado + ticket/alumno). Alumnos-activos y facturado describen "con plan vigente este mes" / "cobrado este mes a la fecha".
- **Operación del día** (ambos modos): colas accionables en fila de 4 desktop (cobros por revisar, particulares, planes que vencen, sin nivel) + Clases de hoy | Cumpleaños (3 filas + ver todos).
- **Home Simplificado**: 2 KPI cards (alumnos, facturado) + sección Operación del día completa.
- **`/academia/niveles`**: página funcionando tras mover los endpoints `class-levels` de `EnrollmentsController` a `AcademiesController` (era 404 real, no auth); skeleton infinito→error con retry; `levelsConfig` i18n a nivel raíz del namespace academy.
- **Seed (`enrich-academy-seed.cjs`)**: un nivel por (enrollment,tipo) y el owner de cada academia excluido de rosters de asistencia/reserva (no es alumno).
- **Docs**: `openapi.json` + postman regenerados (366 paths); inventario QA actualizado con la estructura nueva del home.

## Deploy / release (cierre de sesión)

- **`v1.15.4` en producción**: Netlify `omnidance.tech` ready, `Deploy omnidance API` en main verde, QA verde en main y dev.
- **Gitflow usado**: dev → merge a main → `release: X.Y.Z` (bump 3 package.json) → tag `vX.Y.Z` → push main + tag.
- **Bucle de fixes de deploy** (QA/Deploy morían en cadena):
  1. seed `ClassLevel`: upsert por `name` inválido con unique compuesta → `findFirst` + update/create (el `where` compuesto no acepta `academyId: null`)
  2. spec `enrollment-levels.controller.spec.ts`: mocks sin `enrollment`/`attendances`/`bookings`/`person` (el select real) — nunca corrían porque el workflow moría antes en el seed
  3. `ClassLevel.academyId` se había subido por `db push` sin migración → `migrations/20261123000000_academy_class_levels`
  4. `PaymentClaim.kind` + FK `TicketClaim.producerId` (SET NULL) → `migrations/20261124000000_paymentclaim_kind_ticketclaim_fk`; `migrate diff --from-migrations --to-schema-datamodel` confirma cero drift
- **Regla reforzada**: TODO cambio de schema va por migración versionada (`prisma migrate dev` o archivo manual + `migrate resolve`), nunca `db push` — el CI aplica migraciones a una DB limpia y cualquier drift rompe el seed ahí.
- **Netlify**: repo vinculado localmente (`apps/web/.netlify`, site `omnidance` id 20e676ea); `netlify api listSiteDeploys` para estado.
- Idea registrada en la spec: asistente IA de academia (módulo Analítica, solo tier PRO).

## Gaps / próximos

- E2E Playwright del home nuevo no corrido esta sesión.
- La fila KPI Extendido queda con 4 cards solo si `dashboard` cargó (el extra `Reservas hoy` depende de todayClasses).
- Insight "one level per type" se cumple en editor+seed; la API `PATCH /enrollments/:id/levels` aún acepta levelIds[] multi por tipo (el editor ya no los manda).
- Pendiente si se quiere: botón "Volver a la línea global" en `/academia/niveles` (hoy se sale borrando customs libres).
