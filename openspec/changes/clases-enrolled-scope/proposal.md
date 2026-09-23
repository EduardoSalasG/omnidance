# clases-enrolled-scope — /clases prioriza las academias del alumno

## Why

`/clases` lista y calendario muestran clases de **todas** las academias activas, mezcladas con las del alumno. El resultado es ruido: un dancer inscrito en 1-2 academias ve la parrilla completa de la escena y sus reservas quedan diluidas. Además, `POST /classes/:id/book` hoy permite reservar sin inscripción — la regla de producto es que la reserva requiere inscripción vigente (la academia inscribe al alumno; no hay auto-inscripción).

La vista "Mis clases" (`view=mine`, ícono marcador) queda redundante una vez que lista/calendario se acotan a mis academias y ganan el filtro de reservadas.

## What Changes

- **API** `GET /classes/browse?scope=enrolled` — acota el listado a las academias donde el autenticado tiene Enrollment en `ACTIVE | TRIAL | ONLINE`. Sin `scope` mantiene `all` (compat). Cada item gana `enrolled: boolean` para que la UI resuelva el CTA sin query extra.
- **API** `POST /classes/:id/book` — **BREAKING**: exige Enrollment vigente (`ACTIVE | TRIAL | ONLINE`) en la academia de la clase; sin ella responde `403`. `GET /classes/:id` gana `enrolled: boolean` para que `ClassBookingCta` muestre el estado correcto.
- **Web `/clases`** — vistas: `list` | `calendar` | `history` | `explore`:
  - `list` y `calendar` consultan `browse?scope=enrolled`.
  - Filtro segmentado **Todas | Reservadas** en ambas vistas (extiende el toggle hoy exclusivo de calendario; `scope=mias` → `scope=reservadas`). En `reservadas` se muestran las cards wallet de `/classes/mine` (badge + link QR) — absorbe la función de la vista `mine`, que desaparece.
  - El ícono marcador del header se reemplaza por uno de explorar (brújula) → `view=explore`: parrilla con **todas** las academias; en academias sin inscripción el CTA es un estado muted "Requiere inscripción".
  - `view=mine` legado redirige a `list + scope=reservadas`.
  - Sin inscripciones vigentes, `list`/`calendar` muestran empty state con CTA a explorar.
- **Historial** — sin cambios: incluye todas las clases tomadas, inscrito actualmente o no.
- **Docs** — regla "reserva requiere inscripción vigente" en `omni-dance.md`, endpoints en `architecture.md`, openapi/postman regenerados, handoff.
- **Tests** — browse `scope=enrolled`, gate de `book` (403 sin inscripción / 200 con ella), flag `enrolled` en detail.

## Capabilities

### Modified Capabilities
- `academy-learner`: lista/calendario de `/clases` se acotan a las academias del alumno; "Mis clases" se pliega al filtro Reservadas; nace la vista Explorar con todas las academias; la reserva exige inscripción vigente (`ACTIVE | TRIAL | ONLINE`).

## Impact

- `apps/api/src/academies/infrastructure/classes.controller.ts` — param `scope`, flag `enrolled` en browse/detail, gate en `book`.
- `apps/web/src/app/(app)/clases/page.tsx` — reestructura de vistas/filtros.
- `apps/web/src/components/classes/class-booking-cta.tsx` — estado "Requiere inscripción".
- `apps/web/src/i18n/parts/classes.json` + `tours` — keys nuevas/renombradas.
- Tests e2e de classes; `omni-dance.md`, `docs/architecture.md`, openapi/postman.
- Riesgo: usuarios demo sin enrollment pierden acceso a reserva — verificar seed (dancer demo ya tiene Enrollment ACTIVE en Muvet).
