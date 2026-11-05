# Handoff 2026-11-05 — flag `academy_explore`

## Completado (commit `f79dc706`)

- Flag global `academy_explore` en `FEATURE_FLAG_SEED` (default ON):
  kill-switch admin para los listados de descubrimiento del bailarín.
- Gate front-only, fail-closed (`flags.academy_explore === true`):
  - `/academias`: pill Explorar, buscador y CTAs ocultos; `?s=explorar`
    y el default sin-enrollments normalizan a `mias`.
  - `/clases`: pill + filtro de academia ocultos; `s=explorar` y
    `view=explore` legado → `mias` (browse sale `scope=enrolled`).
  - `/academias/[id]`: link "Explorar más clases" oculto vía
    `featureEnabled()` (nuevo `apps/web/src/lib/public-features.ts`,
    patrón `cityLandingEnabled`, revalidate 30s).
- Fichas `/academias/[id]` y `/clases/[id]` intactas por link directo
  (vía de reclutamiento de cada academia). Sin gate de API:
  `/academies` y `/classes/browse` sin cambios (dual-use con "mias").
- OpenSpec `academy-explore-flag` archivado → spec `academy-learner`
  actualizada. Docs: qa-flows-inventory + architecture.

## Verificado

- TDD: tests nuevos `academias/page.test.tsx` + `clases/page.test.tsx`
  (4/4; RED → GREEN). Suite web 9/9. Typecheck web+api. Lint limpio.
- Smoke real: seed crea flag → `GET /features` → `PATCH` admin con
  `AuditLog FEATURE_FLAG_TOGGLE` → ficha SSR sin/con link según flag.

## Contexto de negocio (decisión de producto)

- Motivación: primer cliente (academia) no quiere que sus alumnos vean
  la competencia. El flag es **kill-switch/seguro**, no la política
  final. Evaluado y diferido: `Academy.directoryListed` opt-in por
  academia, "muro" demand-side como entitlement pago, sponsored
  placement cuando haya 3+ academias, atribución explorar→enrollment.

## Propagación del flag (pregunta del usuario)

- API: hot-read inmediato (cache invalidada al escribir).
- `GET /features`: HTTP Cache-Control 30s.
- SSR `featureEnabled`: revalidate 30s.
- Cliente `useFeatures`: **un fetch por mount** — sesión abierta
  conserva flag viejo hasta reload/cold start. PWA iOS igual (el SW
  no cachea `/api/*`); si el usuario nunca cierra la app, puede
  demorar hasta el próximo cold start. Palanca futura si se requiere
  inmediatez: refetch en `visibilitychange` o gate server-side.

## Estado del ambiente

- Stack vivo: API :4000 (`pnpm dev`), web **producción** :3000
  (`next start`, tras `pnpm --filter @omnidance/web build`).
- Zombies eliminados (un `next start` viejo retenía :::3000).
- Dev server en :3000 funciona pero compila por ruta (primer hit
  30-100s) — por eso prod build.

## Próximo slice sugerido

- Smoke manual del toggle en la UI real (pendiente: el usuario iba a
  probarlo con la stack recién levantada).
- Follow-up producto: cuando entre el 2º cliente academia, evaluar
  `directoryListed` por academia + atribución de descubrimiento.

## Gaps conocidos

- No se verificó en browser real el comportamiento de las pills
  (cubierto por component tests + SSR ficha verificada por curl).
