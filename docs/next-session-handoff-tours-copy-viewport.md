# Handoff: onboarding-tours-pass (copy + viewport + cobertura)

Sesión 2026-11-09 noche. Commits en dev:

- `c1b97e8c` feat(onboarding): pase de copy y viewport en tours +
  cobertura admin/productor-eventos/academia-series.
- `pending` docs/specs del archive (este handoff + specs canónicas).

## Qué quedó hecho (change `2026-11-09-onboarding-tours-pass`, archivado)

- **Copy**: `tours.json` es-CL reescrito completo + espejos en/fr/pt-PT
  (277 keys, estructura idéntica verificada por script). Regla aplicada:
  el tour nombra lo que la pantalla muestra. Fuera: roster, card, chip,
  tabs, nav, checklist, matrícula, POS, digests, RBAC, insights,
  offline, corridas, evidencia, paginado, atribución, retrospectiva.
  Se conservan por ser labels reales de la UI: score, check-ins, jobs,
  triggers, consola, staff, lineup, link, tag, CRM, cooldowns, quórum,
  padrón, nómina, entidad, consultas, CSV/PDF, campana, QR, ticket,
  hora peak. Cero ` - ` como separador (regla de puntuación del repo).
- **Steps muertos removidos**: `crm.s5` (crm-actor, sin switcher de
  actor en la UI) y `academia-alumnos.s6` (import vive en
  /academia/configuracion/importar). crm re-numerado s1-s6.
- **Viewport**: `isAnchorVisible()` nuevo (rects + intersección con
  viewport; excluye la appbar oculta por translateY). `.omnidance-tour`
  con max-width/max-height en vw/dvh + overflow-y auto.
  `TourStep.align` nuevo; `align:"end"` en los 12 steps de borde
  derecho (appbar-bell ×9, nav-profile ×2, staff-counter).
- **Tours nuevos/montados**: `admin` en HomeHub lente ADMIN (anchor
  nuevo `admin-kpis` en el wrapper de KPIs agrupados; el anchor
  `admin-leads` ya existía), `productor-eventos` en /productor/eventos,
  `academia-series` en /academia/series. `TOUR_KEYS` = 29 keys.
- **Specs canónicas aplicadas al archivar**: admin/home-insights
  (tour admin), responsive-app-shell (MODIFIED: contención viewport +
  copy), events/producer-console (tour listado), academies/class-series
  (tour listado). `dj/console` se creó y se eliminó del change cuando
  el usuario descartó el scope DJ.

## Verificación citada

- tsc --noEmit web: limpio. eslint archivos tocados: 0 errores.
- vitest `anchor-visibility.test.ts`: 7/7 (happy-dom).
- i18n-audit: ALL_KEYS_OK; subagente verificó 277 leaf keys idénticas
  en los 4 locales (mismo orden).
- impeccable detect --json sobre los archivos UI tocados: [].
- openspec validate --changes: verde; archive con specs aplicadas.

## Pendiente / notas

- NO verificado en runtime real (browser): el tour admin en el home y
  los dos tours nuevos no se probaron visualmente; el smoke manual del
  task 5.4 quedó pendiente (appbar oculta + 320px + tour admin desktop).
- Paridad i18n: el check muestra drift PREEXISTENTE ajeno al change
  (academyPay.report.*, academy.levelsConfig.backToGlobalBody) entre
  es-CL y espejos; no se tocó en este change.
- `.openspec-archive.lock` stale reapareció otra vez (tercera vez);
  mismo fix: borrarlo y re-correr archive.
- El tour `locales` de /venue se mantiene (solo copy); el usuario dijo
  "venue no es relevante" para scope nuevo, no pidió removerlo.
- Consolas sin tour por diseño vigente: fichas, formularios y
  configuraciones (patrón: solo hubs y listados). /dj sin tour (usuario
  lo descartó). Roles sin tour de home: VENUE_MANAGER, STAFF, SUPPORT
  (tienen el de su consola), DJ.
- Sigue pendiente de handoffs anteriores: validar en prod params de
  seed + grant trial Producer Pro; flake residual dancer-eventos mobile.
