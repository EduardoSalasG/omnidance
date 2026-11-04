# Handoff: e2e-flow-tests slice 3 (7 specs nuevos verdes)

**Rama**: `dev`. Stack dev vivo en background de esta sesión
(shell `api` = nest :4000 con `THROTTLE_AUTH_LIMIT=120`, shell `web`
= next :3000). DB/Redis en docker. `pnpm db:enrich` corrido hoy
(idempotente).

## Commits de la sesión

1. `7fc7d347` test(e2e): academia-cobros, academia-alumnos,
   academia-series, academia-clases (tasks 11-14) + fixture
   `e2e/fixtures/receipt.png` + helpers `apiAs`/`myAcademyId`.
2. `1e40b86f` test(e2e): soporte-buscar, dancer-qr, academia-planes
   (tasks 19-21) + tasks.md actualizado.

## Estado del change `e2e-flow-tests` (ABIERTO)

Tasks hechas: 1-14, 19-21. **Quedan 15-18**: `dancer-membresia`
(TRANSFER multi-actor dancer→academia, checkout membresía +
comprobante + aprobación en cobros), `productor-eventos` (absorbe
smoke crear→publicar + ficha copiar link), `productor-colaboradores`
(cupo free → 403 tier), `staff-puerta` (boot manifest, check-in
manual, dup 409). Ver `openspec/changes/e2e-flow-tests/tasks.md`.

Specs verdes hoy (chromium, --no-deps, stack vivo): academia-cobros
3/3, academia-alumnos 3/3, academia-series 1/1, academia-clases 2/2,
soporte-buscar 1/1, dancer-qr 2/2, academia-planes 1/1.

## Aprendizajes de esta sesión (útiles para los specs que faltan)

- **`apiAs(role)` + `myAcademyId()`** en `e2e/helpers.ts`: contexto de
  API autenticado por storageState (cookies localhost aplican a
  :4000). Leer `res.json()` ANTES de `ctx.dispose()`.
- **Claims PENDING por API**: `POST /api/academies/:id/claims`
  multipart con `e2e/fixtures/receipt.png` + `amount` + `note`
  única `QA *` (el note viaja al card de la cola → localizador
  estable). Aprobar/rechazar consume el claim: cada test crea el
  suyo.
- **`role="alert"` ambiguo**: `__next-route-announcer__` de Next
  también es role=alert → filtrar SIEMPRE por texto del estado.
- **`classStart` = medianoche UTC + HH:MM**: los slots se interpretan
  en UTC; para clases "de hoy" componer horarios en UTC
  (`hhmmUtc()` en academia-clases.spec).
- **`/series/:id/classes` parte por `date` cruda**: una clase de hoy
  cae en `past` aunque no haya empezado - buscar en ambas listas.
- **muvet = STUDIO**: sin KPIs/insights (feature PRO), no asertarlos
  en /academia/alumnos.
- **Marcaje de asistencia** exige booking BOOKED: dancer@ tiene
  enrollment ACTIVE en MuéveteOnTour → `POST /api/classes/:id/book`.
- **`qr.loadError` existe** ("No pudimos generar tu QR.") aunque no
  esté en el monolito es-CL.json.
- Zombie :3000 resucitó otra vez (5.4GB RAM): taskkill al PID del
  listener antes de `pnpm dev:web`.

## Pendiente (orden sugerido)

- **e2e-flow-tests tasks 15-18** (ver arriba; membresia y puerta son
  los más pesados - multi-actor y manifest/IndexedDB).
- Re-correr `academia-videos` y `dancer-checkout` (checkout ya corre:
  API sin PAYMENT_GATEWAY/FLOW_API_KEY → stub:// activo).
- **Landings 100% estáticas** (pedido del usuario 2026-11-04):
  eliminar requests al API desde `(marketing)`. Diagnóstico
  completo en el handoff `next-session-handoff-2026-11-04-e2e-infra.md`
  §Pendiente: `/` pega `/api/events`, `/ciudades` pega
  `/api/features`+`/api/cities`, `/pase` pega `/api/features`,
  `/e/[id]` pega `/api/events/:id`. Crear change OpenSpec al tomarlo.
- `customer/collect` automático por job (PlatformChargesService
  listo; pendiente desde cierre-2).
- Smoke visual superficies pasada B.
- multipais-foundation tasks 10/11/13 (épica).

## Notas operativas (heredadas, siguen vigentes)

- Compiles fríos: calentar rutas o re-correr; resultados válidos en
  segunda corrida.
- `?genre=` inválido se ignora: para empty usar `?venue=<inexistente>`.
- Usuarios seed: `staff@`/`soporte@` sin academia; `dancer@`
  instructora de "Mi mambo" + alumna ACTIVE de MuéveteOnTour;
  `profe@` instructor puro de 9 academias incl. MuéveteOnTour.
- OnboardingRunner: `dismissTours(page)` tras cada goto a superficie
  nueva del storageState.
- `openspec archive` lock stale: `rm
  openspec/changes/archive/.openspec-archive.lock` y reintentar.
