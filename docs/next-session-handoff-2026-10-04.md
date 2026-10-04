# Handoff — 2026-10-04: limpieza OpenSpec + exportes PDF

Sesión sobre `dev` cerrando dos pendientes del handoff `…-28e.md`: la
higiene de OpenSpec y los exportes PDF.

## Completado

- **OpenSpec: `validate --changes` 15/15 verde** (antes 17/29).
  - 14 changes archivados a `changes/archive/2026-10-04-*`: 10 completados
    sin deltas (`--skip-specs`) + `admin-user-intel` (implementación
    verificada en código — user-intel/browse controllers, e2e, páginas
    `/admin/usuarios`, `/analitica/usuarios`, `/admin/datos`, PillTabs —
    solo faltaba marcar tasks) + 3 con deltas reales aplicados a
    `openspec/specs/` (private-lesson-product, dancer-academy-lens,
    multi-ticket-claim-links — todos aterrizados en git).
  - `pwa-shell-nav`: queda activo con `skip_specs: true` — única tarea
    real pendiente: confirmar el error push en el iPhone del usuario.
  - `dancer-profile-survey-analytics` (0/18): sigue activo, trabajo real
    pendiente (género/styleRoles, encuestas post-evento).
- **Exportes PDF** (spec §11 "CSV/PDF por evento y por serie"):
  - `GET /events/:id/export.pdf?dataset=sales|checkins|guestlist` y
    `GET /events/series/:seriesId/export.pdf?dataset=…` — mismo auth y
    datasets que el CSV; reporte imprimible A4 con título, fecha/scope,
    resumen (tickets+recaudado sin cancelados / check-ins+anulados /
    invitados+listas), tabla con header repetido y «Página X de Y».
  - Refactor: `exportSales/Checkins/Guestlist` retornan
    `{headers, rows, summary}` compartidos; CSV y PDF son serializadores.
  - `src/common/pdf-report.ts` (`buildTablePdf`) + `pdfkit@0.20.2`.
    OJO: pdfkit ≥0.16 ignora `lineBreak:false` y asigna `width` por
    defecto → todo `text()` puede paginar implícitamente. Por eso las
    celdas se truncan manual (`widthOfString`+«…») y se dibujan con
    `lineBreak:false` sin `width` (sin wrapper → cero paginación propia).
  - Respuesta vía `StreamableFile` — un Buffer desnudo en passthrough
    Nest lo serializa como JSON.
  - UI: `ExportSection` ahora lista cada dataset con botones CSV+PDF
    (evento y serie); i18n actualizado.
- **Fix flake preexistente**: `classes.controller.spec` "cancelación
  tardía SÍ consume" fallaba los domingos — `cls-soon` (hoy) y `cls-2`
  (mañana) cruzan la semana ISO y la cuota semanal no se heredaba.
  `cls-2` ahora comparte fecha con `cls-soon`.

## Verificación

- Suite API: **1229 tests verde** (la primera corrida mostró timeouts de
  5s en 6 e2e — era contención con el dev server vivo contra la misma
  DB; con la API apagada los 131 tests de esos 5 archivos pasan).
- `tsc --noEmit` api + web limpio.
- Smoke live (`node apps/api/scripts/smoke-export-pdf.cjs`, nuevo):
  pdf owner 200 con `%PDF-` real / stranger 403 / dataset 400 /
  evento+serie 404 / sin sesión 401 / serie pdf 200; CSV intacto con BOM.
- `openapi.json`/`postman` regenerados (**193 paths**, +2).
- `docs/architecture.md` actualizado (línea events).

## Remediación de proceso (misma sesión)

- Se creó `producer-exports-pdf` retroactivamente (el feature PDF se
  había implementado sin change OpenSpec) y se archivaron
  `producer-exports` + `producer-exports-pdf` — la spec canónica
  `openspec/specs/events/producer-export/spec.md` ahora cubre CSV, PDF,
  serie y serializadores compartidos (7 requirements). `validate
  --changes`: 15/15.
- Root cause del lock stale de `openspec archive`: el archivo quedó
  commiteado con un pid muerto — se quitó del tracking y se agregó a
  `.gitignore`.
- Fix UI: card de "Mis academias" en `/academias` — sin "Reservar
  clase", todo el card navega a la ficha (stretched link; videos z-10).

## Sesión tarde — pipeline multi-agente (2 features)

- **Clase de prueba comprable** (`trial-plan-purchase` → archivado,
  spec canónica `payments/trial-plan-purchase`): `checkout.service` y
  `membershipQuote` ya no rechazan `TRIAL`; requiere `price > 0` (la
  gratis sigue por asignación staff). `settleMembership` crea siempre
  Enrollment TRIAL nuevo — un ACTIVE vigente queda intacto; re-compra
  = fila histórica. Quote TRIAL parte de `now`, `currentEndsAt` null
  (fix de review). Notif `payment.membership` con title
  `Clase de prueba comprada`. Commits `a4226f3`, `092b785`, `0218d5d`.
  Sin cambios web (`recurring:false` → compra única).
- **Audiencias CRM por grupo** (`academy-audience-groups` → archivado,
  spec `crm/campaign-audience`): `CampaignSegment` suma `allStudents`,
  `enrollmentStatus[]`, `planId`, `seriesId` (solo ACADEMY, 400 en otro
  actor; pertenencia validada). `POST /crm/campaigns/preview` → `{count}`
  sin side-effects. Form: sección Alumnos (chips estados + selects
  plan/serie), picker de personas (checkboxes → `personIds`), contador
  debounced 300ms. Lista: `audienceLabel` cubre los criterios nuevos.
  Commits `cb80a56`, `016dc29`, `90c3899`. 10/10 specs CRM + 30/30 e2e
  gap-crm (4 nuevos del preview).
- Reviews de ambos changes: PASS_WITH_NOTES, hallazgos integrados por
  el orquestador. Limitación del picker documentada: lista el universo
  `/crm/people` (score/tag) — un inscrito sin score no es seleccionable
  individualmente (sí por `allStudents`). `personIds` no valida
  pertenencia al actor (pre-existente; fix separado si se decide).

## Sesión noche — barrido OpenSpec + feature survey completo

- **12 changes stale auditados y archivados** (batches A/B/C con
  veredicto por evidencia): ~80 requirements canonizados. Deltas
  corregidos a la realidad donde mentían (nav-reorg sheet/prácticas/
  TicketWallet/Rsvp-repurposed, song-suggestions 1xpersona/evento,
  table-reservations autenticados, params s=/v= de /clases).
- **`crm-personids-scoping`** (mini-change): personIds intersectado con
  el universo del actor — archivado en `crm/campaign-audience`.
- **`dancer-profile-survey-analytics` IMPLEMENTADO** (0/18 → archivado,
  3 specs canónicas: `dancer-dance-profile`, `post-event-survey`,
  `event-analytics`):
  - `Person.gender` M/F/OTHER (nullable) + `EventRating.overall` +
    `Event.surveyNotifiedAt` — migración `20261004173000` aplicada.
  - `PATCH /me` con gender; `GET /me/pending-surveys` con fan-out lazy
    (claim `updateMany` atómico → notifySafe `event.survey` a todos los
    asistentes una sola vez); `GET /events/:id/analytics` (owner/admin):
    attendees + genderSplit + roleSplit + byDim, **k-anonymity ≥3 por
    dimensión** (fix del review — el promedio de 1-2 evals exponía
    puntajes individuales).
  - Web: género en `/perfil/datos` (solo modo social — gap conocido:
    en modo academia no hay UI), card en `/inicio` cualquier lente,
    `/eventos/[id]/evaluar` (overall obligatorio + dims expandibles),
    sección Analítica en `/productor/eventos/[id]`, sidebar con grupo
    "Analítica" propio (card quitada de `/admin`).
  - Commits: `ce57e93` `678966c` `531669f` `d5b9cd3` + openspec.
  - **Flags del review documentados**: fan-out es 1-shot lazy — si el
    request muere a mitad del loop el flag ya quedó (trade-off aceptado);
    el fan-out notifica también a quien ya evaluó (recordatorio); no hay
    prefill de evaluación existente en `/evaluar` (re-envío = upsert).
- `pwa-shell-nav` sigue abierto (19/20) — solo falta confirmar push iOS.

## Pendientes

1. **Validación Flow sandbox real** — sigue bloqueando producción
   (credenciales + tarjeta + checkout en browser del usuario).
2. **Confirmar push iOS en iPhone del usuario** — única tarea viva de
   `pwa-shell-nav` (el detalle del error ya se muestra en UI).
3. ~~`dancer-profile-survey-analytics`~~ — implementado y archivado esta
   sesión (ver arriba). Gap conocido: género solo editable en modo social.
4. Nota ops: correr `pnpm test` con la API dev arriba produce timeouts
   de e2e espurios (misma DB) — apagar `dev:api` antes de la suite.
