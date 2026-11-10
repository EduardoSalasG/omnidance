# Handoff: release 1.18.0 versionada y promocionada a main

Sesión 2026-11-10 (noche, continuación de `push-smoke-y-cac`).
El owner pidió versionar el trabajo cerrado y promocionarlo. No se
escribió código nuevo: solo release + promoción.

## Trabajo completado

### Release 1.18.0 (commit `4ca40f35`, tag `v1.18.0`)

- Bump `version` 1.17.0 → 1.18.0 en `package.json` raíz,
  `apps/web` y `apps/api` (shared queda en 0.1.0, como siempre).
- Sección `## [1.18.0]` en `CHANGELOG.md`: canal invite cerrado
  con push de dispositivo (consume + bridge `/i/:inviteId` +
  lente academy), toast deep-link, cobertura completa de deep
  links, ficha `/admin/campanas/[id]`, adquisición orgánica
  first-touch, reporte de altas por canal (entidad `acquisition`
  en `/analitica` ADMIN), script `send-test-push.cjs`; fixes del
  rango (cookie lens 401, mail-campaigns 500, CTAs por tier/dedup,
  filtros enum multi).

### Promoción dev → main

- `git push origin dev` (23 commits + release) + push del tag.
- PR #4 `dev → main` creado y mergeado (`74ccba58`, merge commit,
  misma mecánica que PR #3 de 1.17.0).
- `v1.18.0` es ancestro de `origin/main` (verificado con
  `merge-base --is-ancestor`). `main` local fast-forwardeado.
- Netlify: deploy de `main` corre automático post-merge (mismo
  camino que 1.17.0). Deploy preview del PR quedó verde
  (`deploy-preview-4--omnidance.netlify.app`).

## Verificación corrida

- `pnpm test` completo antes de la release: shared 20/20, web
  101/101, api 2637/2637.
- Pre-push hook (suite API vitest) verde en el push: 136 files,
  2637 tests.
- Checks del PR #4: `static-unit` ×2 pass, `no-agent-attribution`
  ×2 pass, Netlify header/redirect rules pass, deploy preview
  ready, Pages changed skipped.
- Identidad de commit: EduardoSalasG (regla de commits cumplida;
  el hook commit-msg rechaza trailers de agente de todos modos).

## Notas

- Auto-merge de PRs no está habilitado en el repo
  (`enablePullRequestAutoMerge` off): el merge manual tras checks
  es el camino.
- El deploy de producción en Netlify gatilla con el merge a main;
  si se quiere verificar queda mirar el deploy
  `74ccba58` en el dashboard de Netlify.

## Pendientes

- `multipais-foundation` tasks 10/11/13: **el owner pidió no
  evaluarlas todavía** (quedan diferidas, sin abrir).
- Todo lo demás de la agenda anterior quedó cerrado por el owner:
  push iOS (descartado, cubierto por smoke laptop FCM), smoke de
  push real de dominio, ficha `sale_deal.responded` y URLs API en
  data de notificaciones.

## Próxima sesión sugerida

1. Verificar deploy Netlify de `74ccba58` en producción.
2. Cuando el owner lo habilite: multipais-foundation task 10/11/13
   (cada una entra por change OpenSpec separado).
