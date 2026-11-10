# Handoff: auditoría CTA de consolas (producer + admin) y cierre OpenSpec

Sesión 2026-11-10 (noche). Continuación del handoff
`invite-lens-cta-gating`: el owner pidió revisar "los mismos patrones"
en producer y luego "proceder" con admin/soporte.

## Trabajo completado

### 1. Change `producer-console-cta-dedup` (implementado + archivado)

Auditoría producer completa. Hallazgos y fixes:

- `academy-sales-section.tsx` (ficha evento, preventa academias):
  CTA `＋ Invitar` duplicado en header + empty state → empty = mensaje.
- `payment-methods-section.tsx` (`/productor/medios-pago`): "Agregar
  método" duplicado en header + empty state → idem.
- **Causa raíz**: spec `console-crud-flows` exigía "Estado vacío con
  CTA" (vieja) vs regla nueva de `academies/console-lists`. El delta
  MODIFIED ya archivado alinea la spec compartida: un solo CTA en
  header/sección, empty = mensaje, excepción superficies sin CTA
  propio (dashboard productor).
- Sin hallazgos en: gating por tier de CTAs (ningún alta producer es
  feature-gated; analytics/CRM ya paywallean bien), selector (no hay
  multi-productor), demás empty states.

### 2. Change `admin-console-crud-align` (implementado, SIN archivar)

Auditoría admin/soporte:

- `/admin/campanas`: el form crear/editar era inline en el listado →
  extraído a `components/admin/campaign-form.tsx` (verbatim) y movido
  a `/admin/campanas/nueva` (+`?edit=<id>` precarga `GET
  /admin/mail-campaigns/:id`). CTAs del listado → navegación;
  run/test/cancel quedan en cards (operación, no edición).
- `/admin/catalogos`: sección vacía renderizaba Card vacía → ahora
  mensaje (`adminCatalogs.empty` agregada a los 4 `messages/*.json`).
- `/admin/facturacion/promos`: `<Link><Button>` anidado → `Button
  href`.
- `/soporte`: read-only, limpio. Admin no gatea por tier ni tiene
  selector de actor → patrones 1 y 3 no aplican.

### 3. Archivos OpenSpec archivados (los 3 de la sesión)

`producer-console-cta-dedup`, `academy-console-cta-gating` e
`invite-academy-lens` → `archive/2026-11-10-*`; sus deltas ya están en
`openspec/specs/` (console-crud-flows, academies/console-lists,
academies/student-invites). **Atención**: `openspec archive` deja un
lock stale en `openspec/changes/archive/.openspec-archive.lock` si se
interrumpe; borrarlo si aparece el error "already being created".

## Verificación corrida

- `pnpm --filter @omnidance/web typecheck` → OK (los dos cambios).
- `openspec validate --changes` → verde en cada punto.
- `node apps/web/scripts/i18n-audit.cjs` → ALL_KEYS_OK.
- Commits: `fb4ff826` (producer), `e816556c` (admin + archivos).

## Pendientes

- **Archivar `admin-console-crud-align`** tras QA manual del flujo:
  crear campaña nueva, editar DRAFT vía `?edit=`, volver al listado
  con aviso; catálogo vacío muestra mensaje; CTA promos.
- QA manual pendiente del handoff anterior sigue vigente (paywall sin
  CTA en COBROS, flujo invite con lente verde).
- `admin-console-crud-align` queda como único change activo nuevo +
  `multipais-foundation` (10/13, sin tocar).
- Decisión abierta (fuera de alcance): si las acciones de operación
  de campañas (test/run/cancel) ameritan ficha `/admin/campanas/[id]`
  en vez de vivir en la card.
- Pendientes previos sin cambio: divergencias TierPrice dev vs spec,
  modelo del import, gap lente por push `academy.invite`.
