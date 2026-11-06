## 1. Flag en catálogo

- [x] 1.1 Agregar `academy_videos` (label "Videos de academia", default `enabled: true`) a `FEATURE_FLAG_SEED` en `apps/api/prisma/seed-common.ts`. Verificar: `pnpm db:seed` corre sin error y `GET /features` incluye `academy_videos: true`; re-correr el seed tras un toggle admin no pisa `enabled`. NOTA: el paso de seed queda documentado para el orquestador (no se corre en este alcance); hasta correrlo el flag resuelve OFF (fail-closed) y el módulo queda oculto.

## 2. Gate compartido y páginas

- [x] 2.1 Crear `apps/web/src/components/feature-flag-gate.tsx`: gate client-side por flag (`useFeatures`); `loading` → skeleton, flag OFF/ausente → estado "desactivado" (copy por prop, i18n del caller), ON → children. Fail-closed igual que el mapa público.
- [x] 2.2 Envolver el contenido de `/academia/videos`, `/academia/videos/nuevo` y `/academia/videos/[id]` con el gate, evaluado antes de `AcademyTierGate` (flag OFF nunca muestra paywall). Verificar: `npx tsc --noEmit` limpio en apps/web.

## 3. Hub /academia

- [x] 3.1 En `apps/web/src/lib/academy-modules.ts`: campo opcional `flag` en `HubModule`, `flag: "academy_videos"` en el módulo videos y parámetro `flags` (requerido) en `visibleHubModules`; un módulo con `flag` se filtra cuando `flags[flag] !== true`. Verificar: test actualizado.
- [x] 3.2 En `academia/page.tsx` pasar `flags` de `useFeatures()` a `visibleHubModules`. Mientras el fetch resuelve el mapa es `{}` y la card no pinta (fail-closed, consistente con el nav). Verificar: tsc.

## 4. i18n

- [x] 4.1 Agregar `videos.disabled` en `apps/web/src/i18n/parts/academyExtras.json` (es-CL) y en los stubs `en/`, `fr/`, `pt-PT/`. Sin guiones largos ni dobles en el copy. Verificar: typecheck web.

## 5. Tests y docs

- [x] 5.1 `apps/web/src/lib/academy-modules.test.ts`: el helper pasa `flags` con `academy_videos: true` (conserva los escenarios de tier) y se agrega el escenario "flag OFF oculta videos aunque el tier sea PRO". Verificar: `pnpm --filter @omnidance/web test` verde.
- [x] 5.2 Actualizar `docs/qa-flows-inventory.md`: sección videos registra el flag `academy_videos` (OFF → páginas "desactivado", sin card del hub, sin ítem del sidebar; API sin cambio) y la lista de flags del seed lo incluye. Verificar: sección editada en el mismo cambio.

## 6. Pendiente del orquestador (fuera de este alcance)

- [ ] 6.1 `apps/web/src/components/layout/BottomNav.tsx`: agregar `flag: "academy_videos"` al ítem `/academia/videos` del sidebar del owner (~línea 630, dentro del grupo `navGroups.classes` o equivalente). El componente ya soporta `flag` por ítem (`city_guides` es el precedente). Lo edita otro agente.
- [ ] 6.2 Correr `pnpm db:seed` (idempotente) para crear la fila del flag en la base viva; sin la fila el módulo queda oculto (fail-closed).
