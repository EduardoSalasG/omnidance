# Handoff - 2026-10-04: limpieza OpenSpec + exportes PDF

Sesión sobre `dev` cerrando dos pendientes del handoff `…-28e.md`: la
higiene de OpenSpec y los exportes PDF.

## Completado

- **OpenSpec: `validate --changes` 15/15 verde** (antes 17/29).
  - 14 changes archivados a `changes/archive/2026-10-04-*`: 10 completados
    sin deltas (`--skip-specs`) + `admin-user-intel` (implementación
    verificada en código - user-intel/browse controllers, e2e, páginas
    `/admin/usuarios`, `/analitica/usuarios`, `/admin/datos`, PillTabs -
    solo faltaba marcar tasks) + 3 con deltas reales aplicados a
    `openspec/specs/` (private-lesson-product, dancer-academy-lens,
    multi-ticket-claim-links - todos aterrizados en git).
  - `pwa-shell-nav`: queda activo con `skip_specs: true` - única tarea
    real pendiente: confirmar el error push en el iPhone del usuario.
  - `dancer-profile-survey-analytics` (0/18): sigue activo, trabajo real
    pendiente (género/styleRoles, encuestas post-evento).
- **Exportes PDF** (spec §11 "CSV/PDF por evento y por serie"):
  - `GET /events/:id/export.pdf?dataset=sales|checkins|guestlist` y
    `GET /events/series/:seriesId/export.pdf?dataset=…` - mismo auth y
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
  - Respuesta vía `StreamableFile` - un Buffer desnudo en passthrough
    Nest lo serializa como JSON.
  - UI: `ExportSection` ahora lista cada dataset con botones CSV+PDF
    (evento y serie); i18n actualizado.
- **Fix flake preexistente**: `classes.controller.spec` "cancelación
  tardía SÍ consume" fallaba los domingos - `cls-soon` (hoy) y `cls-2`
  (mañana) cruzan la semana ISO y la cuota semanal no se heredaba.
  `cls-2` ahora comparte fecha con `cls-soon`.

## Verificación

- Suite API: **1229 tests verde** (la primera corrida mostró timeouts de
  5s en 6 e2e - era contención con el dev server vivo contra la misma
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
  `producer-exports` + `producer-exports-pdf` - la spec canónica
  `openspec/specs/events/producer-export/spec.md` ahora cubre CSV, PDF,
  serie y serializadores compartidos (7 requirements). `validate
  --changes`: 15/15.
- Root cause del lock stale de `openspec archive`: el archivo quedó
  commiteado con un pid muerto - se quitó del tracking y se agregó a
  `.gitignore`.
- Fix UI: card de "Mis academias" en `/academias` - sin "Reservar
  clase", todo el card navega a la ficha (stretched link; videos z-10).

## Sesión tarde - pipeline multi-agente (2 features)

- **Clase de prueba comprable** (`trial-plan-purchase` → archivado,
  spec canónica `payments/trial-plan-purchase`): `checkout.service` y
  `membershipQuote` ya no rechazan `TRIAL`; requiere `price > 0` (la
  gratis sigue por asignación staff). `settleMembership` crea siempre
  Enrollment TRIAL nuevo - un ACTIVE vigente queda intacto; re-compra
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
  `/crm/people` (score/tag) - un inscrito sin score no es seleccionable
  individualmente (sí por `allStudents`). `personIds` no valida
  pertenencia al actor (pre-existente; fix separado si se decide).

## Sesión noche - barrido OpenSpec + feature survey completo

- **12 changes stale auditados y archivados** (batches A/B/C con
  veredicto por evidencia): ~80 requirements canonizados. Deltas
  corregidos a la realidad donde mentían (nav-reorg sheet/prácticas/
  TicketWallet/Rsvp-repurposed, song-suggestions 1xpersona/evento,
  table-reservations autenticados, params s=/v= de /clases).
- **`crm-personids-scoping`** (mini-change): personIds intersectado con
  el universo del actor - archivado en `crm/campaign-audience`.
- **`dancer-profile-survey-analytics` IMPLEMENTADO** (0/18 → archivado,
  3 specs canónicas: `dancer-dance-profile`, `post-event-survey`,
  `event-analytics`):
  - `Person.gender` M/F/OTHER (nullable) + `EventRating.overall` +
    `Event.surveyNotifiedAt` - migración `20261004173000` aplicada.
  - `PATCH /me` con gender; `GET /me/pending-surveys` con fan-out lazy
    (claim `updateMany` atómico → notifySafe `event.survey` a todos los
    asistentes una sola vez); `GET /events/:id/analytics` (owner/admin):
    attendees + genderSplit + roleSplit + byDim, **k-anonymity ≥3 por
    dimensión** (fix del review - el promedio de 1-2 evals exponía
    puntajes individuales).
  - Web: género en `/perfil/datos` (solo modo social - gap conocido:
    en modo academia no hay UI), card en `/inicio` cualquier lente,
    `/eventos/[id]/evaluar` (overall obligatorio + dims expandibles),
    sección Analítica en `/productor/eventos/[id]`, sidebar con grupo
    "Analítica" propio (card quitada de `/admin`).
  - Commits: `ce57e93` `678966c` `531669f` `d5b9cd3` + openspec.
  - **Flags del review documentados**: fan-out es 1-shot lazy - si el
    request muere a mitad del loop el flag ya quedó (trade-off aceptado);
    el fan-out notifica también a quien ya evaluó (recordatorio); no hay
    prefill de evaluación existente en `/evaluar` (re-envío = upsert).
- `pwa-shell-nav` sigue abierto (19/20) - solo falta confirmar push iOS.

## Sesión noche 2 - auditoría DANCER/ALUMNO + pivote SaaS

**Auditoría UX completa** (4 auditores paralelos + pase transversal):
~90 hallazgos sobre las ~24 rutas del rol. Cierre por slices en serie:

- **F1** `f9a4587` - crash `ticket.event===null` (TicketWallet+detalle+
  test wallet-sort), `stillPending` con timeout en los 3 checkouts,
  `/clases/particular` alcanzable (sheet academia + chip en /clases +
  deep-links notifs + fallback `data.path`).
- **F2** `ccc23b8` - error+retry en ~8 páginas, error-vs-empty en
  /eventos y /locales/[id] (500→404 arreglado), MyQr con estado de
  error (pantalla de puerta), copys (mias academias, completar loadError,
  tablesSoldOut).
- **F3** `93dad39` - checkout: Enter ya no envía la orden, endpoint
  `GET /checkout/discount-quote` (preview del código antes de pagar),
  `presaleEndsAt` expuesto en `GET /events/:id` (estimado correcto
  post-corte 19:00), `songSuggestion` opcional en checkout (max 140),
  radiogroup de mesa + total aria-live, `stub://` en drop-in/particular,
  `Payment.eventId` expuesto, return con tryAgain.
  OpenAPI/Postman regen `9a738e7` (197 paths).
- **F4** `608e684` - a11y: touch ≥44px, focus-visible en cards/links,
  contraste /40|45→/50, StarRating APG correcto (arrows navegan,
  Enter/Space confirma - ya no POSTea por flecha), calendario locales
  con SR, Escape cierra dropdown, X en sheet.
- **F5a** `552f4b7`+`e84cb7b` - i18n hardcodeados→catálogo (events/
  locales/payments.ledger 12 tipos traducidos), imports a `@/i18n/messages`
  unificados, tours sin prometer availability, TRIAL gratis sin CTA
  ni fee, empties honestos, 409 phone_exists, Apple→Google Maps.
- **F5b** `f9f4315` - átomo `components/ui/icons` compartido; cero
  glyphs-como-icono en superficie dancer; hero sin kicker (Badge
  inline); retries re-ejecutan loaders (no reload); busy con Spinner
  en SessionCard.
- **Verificación cierre**: tsc web+api limpios, web tests 3/3,
  impeccable `[]`, i18n ALL_KEYS_OK, tree limpio.
- **Restos menores conocidos**: HomeHub muestra "Tu sesión expiró" en
  error 5xx (copy engañoso, sin retry); glyphs en consolas producer/
  CRM/admin/landing quedan para la auditoría de esos roles;
  `Segmented` bounce-easing es física intencional (no bug).
- **Backlog usuario**: bloqueo de usuarios (API lista, sin UI),
  `sessions.declare` retro-declarar, N+1 videos /academias, recorte
  select público de eventos.

**Pivote de monetización** - `academy-saas-billing` IMPLEMENTADO
completo y archivado (commits `eaf758e` spec, `e4db820` S1,
`5d880c6` S2, `1d166aa` S3, `8a01e36`+`964cce5` S4, `b34c35c` S5,
`890d919`+`8b4a8ff` S6; specs canónicas nuevas en `openspec/specs/`):
- Academia: suscripción recurrente Flow (`PlatformSubscription
  kind=ACADEMY`) por tier de alumnos activos - STARTER ≤50 $49.990 /
  PRO ≤150 $99.990 / STUDIO ≤400 $189.990 + ENTERPRISE manual; ciclos
  semestral −2% / anual −4%; trial 30d (existentes: backfill 60d).
  `tier_limit` 400 si no cabe; downgrade/ciclo → pending al renovar.
- Mora: renovación fallida → 5d gracia (`billingGraceUntil` + notif) →
  job diario `enforceAcademyBlocks` → `billingBlockedAt`: consola
  read-only (gate central en `AcademyAccess.*Write`), fuera de
  explorar/browse/landing, sin reservas ni checkouts; endpoints de
  billing exentos para poder pagar. `RENEWAL_SETTLED` desbloquea.
- Alumno: `service_fee=0` en MEMBERSHIP/WORKSHOP/PRIVATE (defensivo
  en 9 puntos); payout academia = bruto − `GATEWAY_FEE_PASSTHROUGH`
  (`Payout.gatewayFee`, `gateway_fee.academy_passthrough_pct` 3.19).
  `billingBlocked` expuesto en ficha/enrolled/class → UI disabled.
- Productor: `platformFeePct` intacto + **Producer Pro**
  (`PlatformSubscription kind=PRODUCER`, `Person.proTier`): tier por
  facturación 90d - PRO_STARTER ≤$2,5M $99.990 / PRO_GROWTH ≤$8M
  $249.990 / PRO_BIG manual; mismos descuentos de ciclo. Gate por
  `isProActive` → 403 `pro.required` en analytics avanzada, exports
  CSV/PDF, CRM con actor producer, multi-staff `POST /events/:id/staff`.
  Grandfathering: `Person.proTrialEndsAt` +90d a productores con
  `ProducerParams`. La mora de Pro **nunca** corta venta ni check-in.
- Web: `/academia/suscripcion` (consola completa: tier/uso/invoices/
  selector 3×3/checkout Flow/cambios/cancel) + banners gracia/bloqueo
  (`academy-billing-banner` en `AcademyGate`); `ProducerProSection`
  en `/productor/parametros` + `ProPaywall` en analytics/exports/
  staff/CRM (proactive vía `effectivePro` de `/me` + fallback
  `isProRequired`); ficha academy/clases con estados "no disponible".
- Decisiones registradas: `platformFee=0` en eventos academy-produced
  (suscripción reemplaza toda comisión); precios como `PlatformParam`
  (ajustables en /admin); Pro se suma a la comisión - take efectivo
  ~12-14% para STARTER (flag comercial documentado en design.md).
- Verificación por slice: 1371→1405 tests API, e2e academy 74/74,
  payments 316 + e2e 62, tsc api+web, impeccable `[]`, i18n OK.
- Migraciones aplicadas a DB local: `…_saas-billing`,
  `…_platform_sub_pending_change`, `…_payout_gateway_fee`,
  `…_producer_pro_trial` (backfill: 3 productores con trial).

## Sesión noche 3 - observabilidad winston (`api-observability`, archivado)

- `winston@3.19` + `nest-winston@1.10.2` (v1 - la 2.x exige Nest ≥11).
- `src/common/logging/`: `logger.factory` (nestLike dev / JSON prod,
  `LOG_LEVEL` env, default debug/info), `log-context` (AsyncLocalStorage
  → `requestId` en todos los logs del request), `request-logger.middleware`
  (hereda/genera `x-request-id`, línea resumen por request con status/
  duration/personId, niveles info/warn/error, excluye health+docs).
- `redactMeta` enmascara claves `authorization|cookie|password|secret|
  token|jwt|session|qr` a todo nivel - bug encontrado y corregido en
  verificación: claves sensibles top-level del record no se enmascaraban.
- Verificación: 11/11 tests nuevos, tsc limpio, formatos dev/prod
  verificados con script tsx (requestId + `[redacted]` confirmados),
  header echo en vivo en el dev server del usuario.
- Nota ops: había **dos** dev servers compitiendo por :4000 (orphan +
  el mío) - el watch reinicia sin matar al anterior y el segundo muere
  con `EADDRINUSE`. Si aparece, matar el proceso huérfano (netstat -ano |
  findstr :4000).

## Pendientes

1. **Validación Flow sandbox real** - sigue bloqueando producción
   (credenciales + tarjeta + checkout en browser del usuario).
2. ~~Confirmar push iOS~~ - **validado** 2026-10-05: el error original
   era contexto no-seguro (HTTP LAN) + PWA no instalada; vía tunnel
   HTTPS (VS Code ports) + PWA instalada, suscripción OK y push llega
   con PWA cerrada y equipo bloqueado. `pwa-shell-nav` archivado -
   **0 changes activos**. Tokens stale de orígenes viejos quedan en
   `PushToken` (4 filas, endpoints apple previos) - el sender los
   limpiará al recibir 410.
3. ~~`dancer-profile-survey-analytics`~~ - implementado y archivado esta
   sesión (ver arriba). Gap conocido: género solo editable en modo social.
4. Nota ops: correr `pnpm test` con la API dev arriba produce timeouts
   de e2e espurios (misma DB) - apagar `dev:api` antes de la suite.
