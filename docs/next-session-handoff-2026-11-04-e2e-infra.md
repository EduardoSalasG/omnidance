# Handoff: pendientes del cierre-2 (surveys-limit + e2e-flow-tests slice 1 + fix hub instructor)

**Rama**: `dev`. Working tree limpio. Stack dev corriendo en
background de esta sesión: API `pnpm --filter @omnidance/api dev`
(shell a58f81, con `THROTTLE_AUTH_LIMIT=120` ya exportado) y web
`pnpm --filter @omnidance/web dev` (shell 18636f). DB/Redis en docker
vivos. Si el puerto 3000 da EADDRINUSE de nuevo: `netstat -ano |
grep :3000` → `taskkill //PID <pid> //F` (maté el zombie 38776, ~3GB).

## Commits de la sesión

1. `93c1f0a6` fix(api): `?limit=` en `GET /academies/:id/surveys`
   (default 12, max 60, cap sobre grupos mes×serie - mismo contrato
   que `/instructors/:personId/surveys`; el front ya mandaba
   `limit=60` inerte). 3 tests en `academies-insights.controller.spec.ts`,
   openapi+postman regenerados, inventory §Series anotado. Change
   `surveys-limit` archivado (delta `academies/course-surveys`).
2. `<nuevo>` test(e2e): **slice 1 de e2e-flow-tests** + fix
   `academia-hub-instructor`.
   - Infra: `e2e/flow-map.json` (prefijos reales, primera regla gana),
     `scripts/e2e-which.mjs` + `pnpm test:e2e:which`,
     `grepInvert: /@visual|@destructive/` salvo `PW_ALL=1`,
     `e2e/helpers.ts` (+`profe` en USERS = Valeska Torres INSTRUCTOR,
     `dismissTours`, `acceptConsent`, `firePaymentWebhook` →
     `POST /api/payments/webhook {refId,status}`).
   - Reorden: `flows/transversal-notices` (@transversal @notices),
     `flows/transversal-states` (@transversal @states),
     `flows/academia-videos` (@academia @videos - era video-ficha),
     `visual/polish-visual` (@visual, fuera del default),
     `@smoke` en los 3 describes de smoke.spec.
   - Specs nuevos: `flows/public-login` (4 tests: login, ?next=
     round-trip, 401 alert, logout) y `flows/transversal-gates`
     (4 tests: staff sin academia → forbidden+CTA, anon → bounce
     ?next=, instructor puro en /academia sin error+retry, instructor
     en /particulares).

## Bug encontrado y resuelto (vía el spec de gates)

Instructor puro (AcademyInstructor sin staff/owner/admin) en
`/academia` veía "Algo salió mal + Reintentar" permanente:
`AcademyDashboard` llama `/dashboard` que es `requireStaff` → 403
determinístico. Fix en `academia/page.tsx`: el dashboard solo se
monta con `access !== null && !pureInstructor`. Change
`academia-hub-instructor` archivado (delta `academies/staff-roles`).

## Verificación citada

- Vitest `academies-insights.controller.spec.ts`: 5/5; suite
  academies completa 352/352. `tsc --noEmit` api y web limpios.
- Playwright chromium `--no-deps`: 21 tests verdes en la corrida
  final (smoke 3/3, notices 2/2, states 2/2, gates 4/4, login 4/4,
  setup 7 logins incl. profe). academia-videos NO se re-corrió tras
  el rename (era verde antes; solo cambió path+tags).
- Ojo: correr e2e con `next dev` recién levantado falla en masa por
  compiles fríos (7 falsos fallos a la vez). Primero calentar rutas
  o esperar; los resultados válidos son los de la segunda corrida.
- `openspec validate --changes`: 3 verdes (surveys-limit quedó
  archivado, e2e-flow-tests abierto, multipais-foundation).

## Pendiente (orden sugerido)

- **e2e-flow-tests tasks 9-21** (change abierto, tasks en
  `openspec/changes/e2e-flow-tests/tasks.md`): `dancer-eventos`,
  `dancer-checkout` (stub:// + firePaymentWebhook), `academia-cobros`,
  `academia-alumnos`, `academia-series`, `academia-clases` (usa
  `profe` ya seedeado), `dancer-membresia`, `productor-eventos`,
  `productor-colaboradores`, `staff-puerta`, `soporte-buscar`,
  `dancer-qr`, `academia-planes`. Precorrida: `pnpm db:enrich` para
  los specs marcados (enrich) en el diseño.
- Re-correr `academia-videos` (rename a flows/) en la próxima corrida
  completa para confirmar.
- `customer/collect` automático por job (PlatformChargesService
  listo, sigue pendiente del cierre-2).
- Smoke visual superficies pasada B (clases, series, particulares,
  hub) - polish-visual.spec no recorre esas rutas; el hub de
  instructor ya quedó cubierto por gates.
- multipais-foundation tasks 10/11/13 (épica, no slice de sesión).

## Notas operativas

- `academySeries.creating` (pendiente del cierre-2): verificado, la
  key ya no existe en el catálogo - era falsa alarma del handoff.
- `openspec archive` vuelve a dejar `.openspec-archive.lock` stale si
  el comando anterior falla a mitad: `rm
  openspec/changes/archive/.openspec-archive.lock` y reintentar con
  `--yes`.
- `e2e-which.mjs --files <paths>` permite probar el mapa sin diff.
- El snapshot de gates mostró un `role="alert"` vacío (host de
  notificaciones): asertar errores por texto/botón, no por count de
  role=alert. OnboardingRunner abre tours en primera visita de cada
  storageState (dismissTours existe si estorba).
- `dancer@omnidance.dev` ES instructora de "Mi mambo" en seed-dev:
  no sirve para tests de "sin acceso a academia"; usar `staff@` o
  `soporte@` (mine=[]).

## Update (misma sesión, continuación)

- `dancer-eventos` task 9: 4/4 verde chromium (commit 59ae0980).
- `dancer-checkout` task 10: spec escrito pero ROJO en este entorno —
  la API corre con `PAYMENT_GATEWAY=flow` y `POST /checkout/ticket`
  sale 500 (`flow payment/create 400: userEmail ... is not valid`).
  Corre solo con gateway stub (quitar PAYMENT_GATEWAY/FLOW_API_KEY).
  Documentado en el spec y en tasks.md.
- Ojo al elegir evento para checkout: la preventa debe estar ABIERTA
  (Bachatamanía de hoy 22:00 ya cerró; usar evento a futuro p.ej.
  Viernes Sabroso). Si el seed envejece, refrescar el id del spec.
- Filtro `?genre=` con valor inválido NO filtra (se ignora); para el
  empty usar `?venue=<inexistente>`.
- Tasks 11-21 sin tocar (specs academia/productor/staff/etc.) +
  customer/collect por job + smoke visual pasada B: siguen pendientes.
