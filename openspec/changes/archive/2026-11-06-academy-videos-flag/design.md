# Design: academy-videos-flag

## Context

El sistema de flags ya existe de punta a punta (spec admin "Modelo de
flags de funcionalidad"): `FeatureFlagsService` con cache 30s +
auditoría, `GET /admin/feature-flags` + `PATCH` toggle,
`GET /features` público, `/admin/funcionalidades` y `useFeatures()` en
el front montado en el layout de `(app)`. Precedentes directos:
`academy_explore` (gate solo front, default ON) y `city_guides` /
`trip_planner` (estado "módulo desactivado" por página + API 404).

El módulo de videos tiene dos gates hoy: el tier (`AcademyTierGate`
client-side sobre `academy.tier`, feature `videos`, solo PRO) y la
cap `schedule` para escritura (API). El flag nuevo es un tercer gate,
externo a los dos: apaga la superficie completa.

## Goals / Non-Goals

**Goals:**
- Un flag `academy_videos` (default ON) operable desde
  `/admin/funcionalidades` sin deploy.
- Flag OFF → páginas "desactivado" (no paywall), sin card en el hub,
  sin ítem en el sidebar del owner.
- Composición correcta con el tier: flag primero, tier después.

**Non-Goals:**
- Gate server-side de `/academies/:id/videos*` (404): la superficie
  apagada no es frontera de seguridad - los videos ya viajan con
  máscara `locked` por asistencia/enrollment y la escritura exige cap
  `schedule` + canAdminister. Coherente con `academy_explore`, donde el
  gate también es solo de superficie.
- Reestructura del modelo de video (categoría clase/taller/
  coreografía, selects serie → horario → clase): backlog de diseño,
  anotado en proposal.md.
- BottomNav.tsx: lo edita otro agente en paralelo (ver tasks 6.1).

## Decisions

- **`FeatureFlagGate` compartido en vez de inline por página.** Las
  tres páginas del módulo necesitan el mismo bloqueo; `mi-viaje` y
  `ciudades` lo hacen inline porque son páginas únicas. Un gate chico
  (`flag` + copy `disabled` por prop + skeleton mientras resuelve)
  evita triplicar la lógica y queda disponible para futuras
  superficies apagables. Se monta dentro de `AcademyGate` y antes de
  `AcademyTierGate`: con flag OFF el usuario ve "desactivado", nunca
  un upsell de tier.
- **Default ON en el seed.** Videos ya está en producción dentro de
  PRO; default OFF apagaría la superficie al sembrar (rompe
  "sin cambio de comportamiento"). Quien quiera apagarlo lo togglea en
  admin. El upsert por key no pisa `enabled` al re-sembrar.
- **`flags` requerido en `visibleHubModules` y `flag` opcional por
  módulo.** Pasar el mapa explícito (en vez de leer el contexto dentro
  del lib) mantiene la función pura y testeable; el caller único
  (`academia/page.tsx`) ya tiene `useFeatures` en el árbol. Fail-
  closed: mientras el fetch de `/features` resuelve, el mapa es `{}` y
  la card no pinta (mismo criterio que el nav).
- **Fail-closed también cubre el seed pendiente**: hasta re-correr
  `pnpm db:seed` la fila no existe y `academy_videos` resuelve false.
  Es el comportamiento correcto del sistema, pero hay que avisarlo:
  tasks.md 6.2 documenta el paso manual para el orquestador.
