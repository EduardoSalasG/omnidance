# Handoff; admin console + fichas + snapshots (2026-10-19)

> Continúa de `next-session-handoff-2026-10-18-admin-billing.md`. Todo commiteado en `dev` (ver git log).

## Completado esta sesión

**Migración aplicada**: `20261108000000_academy_segment_snapshots` (vía `migrate deploy`; `migrate dev` exige TTY no disponible en Windows). Tabla `AcademySegmentSnapshot` viva; job `academies.segment_snapshots` diario 06:15 CL. `prisma generate` hecho.

**Cards admin** (`/admin/usuarios/[personId]` + `/admin/academias`):
- Scores: tag-row de clasificación → headline nombre↔score+pts → divider → evidence → footnote 🕐.
- Academias: link a ficha admin, grid 2 col, inscritos/activos/plan-checkin con DeltaText (verde/rojo), segmentos con % + delta semanal vs snapshot, facturación mes + delta CLP+%, chip de suscripción (Bloqueada/tier/Sin plan) en footnote.
- Filtros: search (fila propia mobile), toggle "En riesgo", select sort + botón dirección ↓/↑.

**Fichas admin nuevas**:
- `/admin/academias/[id]`; datos generales (expand tras 5), suscripción card→link, KPIs (8), equipo (instructores con acuerdo económico + staff con permisos), clases próximas (rail, expand 5), top alumnos (expand 5), planes (tipo+precio+límites+inscritos, link→ficha).
- `/admin/academias/[id]/planes/[planId]`; datos del plan + inscritos (link a usuario) + pagos del plan.
- `/admin/academias/[id]/clases/[classId]`; datos + reservas (status chips) + check-ins (links a usuario).
- `/admin/academias/[id]/suscripcion`; PlatformSubscription completa + estado academy + cobros PLATFORM_SUB + ingresos (revenue).

**Endpoints admin nuevos** (user-intel.controller): `academies/:id/detail`, `academies/:id/planes/:planId`, `academies/:id/clases/:classId`, `academies/:id/suscripcion` + helper privado `academyRevenue`.

**Home admin**: KPIs agrupados por categoría (Operación/Facturación/Suscripciones activas/Plataforma); `subsAcademy`/`subsProducer` = PlatformSubscription ACTIVE+CANCEL_PENDING por kind.

**Skills**: `ui-ux-principles` (general, §7 incl. contenedor `<main>` obligatorio) + hermanas `ui-cards` (arquetipos A/B), `ui-lists`, `ui-filters`. AGENTS.md apunta a la familia; "siempre que se desarrolle frontend".

## Pendiente

- `openspec/changes/admin-console-billing-nav` sin archivar (G2); falta QA + `openspec validate`.
- Behavior changes CRM (ActorPicker fuera) + `/admin` redirect; documentar en el change o change separado.
- `impeccable detect` no corrió (CLI no instalado).
- Tests no corridos esta sesión (`pnpm test`, e2e); solo typecheck + i18n audit + verificación en vivo de endpoints.
- Comparativa semanal de segmentos necesita que el job haya corrido ≥1 semana para mostrar deltas.
- QA visual pendiente de las fichas nuevas en mobile.
