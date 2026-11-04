# Handoff: e2e-flow-tests slice 1+2 (infra + 5 specs) + fixes

**Rama**: `dev`. Working tree limpio. Stack dev corriendo en
background de la sesión anterior (shells a58f81 API + 18636f web);
si murieron, `pnpm dev`. API levantada con `THROTTLE_AUTH_LIMIT=120`
(necesario: el setup hace 7 logins). DB/Redis en docker.

## Commits de la sesión

1. `93c1f0a6` fix(api): `?limit=` en `GET /academies/:id/surveys`
   (default 12, max 60, cap grupos mes×serie; mismo contrato que
   `/instructors/:personId/surveys`). 3 tests, openapi+postman
   regenerados. Change `surveys-limit` archivado.
2. `4efabc93` test(e2e): infra e2e-flow-tests slice 1 +
   fix `academia-hub-instructor` (archivado, delta staff-roles).
3. `59ae0980` test(e2e): specs `dancer-eventos` (4/4) +
   `dancer-checkout` (escrito, rojo por env - ver abajo).
4. `d841ba9a` + `c58a474a` docs: este handoff.

## Estado del change `e2e-flow-tests` (ABIERTO)

Tasks 1-9 hechas. Layout: `e2e/flows/<dominio>-<flujo>.spec.ts`,
tags `@dominio @flujo`, `@smoke`/`@visual`/`@destructive` (los 2
últimos fuera del default, `PW_ALL=1` los habilita vía grepInvert en
playwright.config.ts). `e2e/flow-map.json` + `pnpm test:e2e:which`.
`helpers.ts`: `profe` en USERS (Valeska Torres INSTRUCTOR), 
`dismissTours`, `acceptConsent`, `firePaymentWebhook`
(`POST /api/payments/webhook {refId,status}`).

Specs verdes (chromium, --no-deps): smoke 3/3, transversal-notices
2/2, transversal-states 2/2, transversal-gates 4/4, public-login
4/4, dancer-eventos 4/4.

### dancer-checkout (task 10): spec escrito, ROJO por entorno
La API corre con `PAYMENT_GATEWAY=flow` → `POST /checkout/ticket`
500 (`flow payment/create 400: userEmail ... is not valid`, Flow
rechaza emails `*@omnidance.dev`). Los botones dev "Simular
aprobado/fallido" solo existen con gateway `stub://`. Para correrlo:
levantar API sin `FLOW_API_KEY`/`PAYMENT_GATEWAY` (stub). El spec
mismo está bien; documentado en el header y en tasks.md.

## Bugs resueltos esta sesión (vía los specs)

- **Instructor puro en /academia**: `AcademyDashboard` llama
  `/dashboard` (`requireStaff` → 403 determinístico) → error+retry
  permanente. Fix: dashboard solo con `access !== null &&
  !pureInstructor` (academia/page.tsx). Spec e2e lo cubre.
- **Checkout 500 con Flow + emails seed**: queda como gap conocido;
  el error llega genérico a la UI (form no avanza, sin aviso claro).

## Pendiente (orden sugerido)

- **e2e-flow-tests tasks 11-21** (ver tasks.md del change):
  academia-cobros, academia-alumnos, academia-series, academia-clases
  (usa `profe`), dancer-membresia, productor-eventos,
  productor-colaboradores, staff-puerta, soporte-buscar, dancer-qr,
  academia-planes. Precorrida `pnpm db:enrich` donde diga (enrich).
- Re-correr `academia-videos` (rename a flows/) en próxima corrida.
- Re-correr `dancer-checkout` con API en gateway stub.
- `customer/collect` automático por job (PlatformChargesService
  listo; pendiente desde cierre-2).
- Smoke visual superficies pasada B (clases, series, particulares,
  hub) - polish-visual.spec no recorre esas rutas.
- multipais-foundation tasks 10/11/13 (épica).

## Notas operativas (leer antes de correr e2e)

- **Compiles fríos**: correr e2e con `next dev` recién levantado
  falla en masa (7 falsos fallos a la vez, compiles de 10-60s).
  Calentar rutas o re-correr; resultados válidos en segunda corrida.
- **Zombie :3000**: EADDRINUSE = next dev zombie (`netstat -ano |
  grep :3000` → `taskkill //PID <pid> //F`).
- **git no en PATH**: `export PATH="/c/Program Files/Git/bin:$PATH"`.
- **openspec archive lock stale**: `rm
  openspec/changes/archive/.openspec-archive.lock` y reintentar `--yes`.
- **`?genre=` inválido se ignora** (no filtra): para empty usar
  `?venue=<inexistente>`.
- **Preventas del seed envejecen**: para checkout usar evento a
  futuro; refrescar el id del spec si el seed se re-corre.
- **Usuarios seed clave**: `staff@`/`soporte@` no tienen academia
  (mine=[], sirven para "sin acceso"); `dancer@` ES instructora de
  "Mi mambo"; `profe@` es instructor puro de varias academias.
- **role="alert" vacío** existe como host de notificaciones en el
  DOM: asertar errores por texto/botón, no por count de role=alert.
- OnboardingRunner abre tours en primera visita de cada storageState
  (usar `dismissTours(page)` si estorba).
- `academySeries.creating` del handoff anterior: verificado, la key
  ya no existe (falsa alarma).
