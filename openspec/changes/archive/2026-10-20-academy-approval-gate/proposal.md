# Proposal; academy-approval-gate

## Why

Hoy la visibilidad pública de una academia depende solo del
`PersonRole` APPROVED del dueño: un owner ya validado crea academias
que salen al directorio al instante, sin control de calidad. Producto
quiere que toda academia cumpla un estándar antes de ser pública, que
el dueño vea qué le falta, y que la revisión sea **automática**; el
admin ve la info preprocesada y solo interviene como override, no como
paso obligatorio.

## What Changes

- **Estado por entidad**: `Academy.reviewStatus` (`RoleStatus`:
  PENDING/APPROVED/REJECTED) + nuevo `Academy.photoUrl`. Migración:
  academias existentes → APPROVED (grandfathered).
- **Checklist server-side compartido** (`academyChecks`): nombre,
  descripción, dirección, ≥1 contacto (instagram/whatsapp/website),
  foto (`photoUrl`), ≥1 `ClassSeries` activa, ≥1 `Class` futura no
  cancelada, ≥1 `MembershipPlan` activo, y owner con rol
  ACADEMY_OWNER APPROVED.
- **Auto-aprobación**: academia PENDING cuyo checklist evalúa completo
  se trata como pública (filtros la dejan pasar) y se promueve a
  APPROVED en el mismo request (persist best-effort). REJECTED nunca
  se auto-promueve; solo admin la restaura.
- **Filtro público por entidad**: `GET /academies`, `GET
  /academies/public`, `GET /academies/:id/profile` y
  `GET /classes/browse` solo exponen academias visibles. Cierra el
  leak donde `/clases` no filtraba por aprobación del dueño.
- **Admin = override, no gate manual**: `GET
  /admin/academy-review-queue` devuelve academias PENDING/REJECTED con
  el checklist ya evaluado por el servidor; `/admin/perfiles-por-validar`
  gana una segunda sección con esa cola. `POST .../approve` fuerza
  APPROVED aun con checklist incompleto; `POST .../reject` → REJECTED
  (oculta aunque esté completa).
- **Consola del owner**: `GET /academies/:id` incluye `reviewStatus` +
  `checks` evaluados; card de visibilidad en `/academia` muestra el
  estado y los ítems faltantes con links a la sección que los resuelve.
- **`photoUrl`** editable en `/academia/configuracion/perfil` (URL
  externa; nunca hosteada, igual que `Venue.logoUrl`).
- **Aprobación sticky**: editar una academia APPROVED no la re-pende.

## Capabilities

- **New**: `academies/approval-gate`.
- **Modified**: `academies/public-profile` (visibilidad filtrada por
  reviewStatus), `admin` (cola de academias + override).

## Impact

- Prisma: `reviewStatus` + `photoUrl` en `Academy` + migración con
  backfill APPROVED.
- API: `academies.controller` (create PENDING, directory/public/profile
  filtran, checks en `mine`/`:id`), `classes.controller` (browse),
  `admin.controller` (queue + approve/reject), settings PATCH acepta
  `photoUrl`.
- Web: sección nueva en `/admin/perfiles-por-validar`, card de
  visibilidad en `/academia`, campo foto en configuracion/perfil, i18n.
- Docs: `qa-flows-inventory`, `openapi.json`/postman regen, spec doc.
- Data: las 2 academias de prueba del usuario (muvet) → PENDING a mano
  para QA del flujo.

## Decisión del usuario

- El checklist exige también: foto, ≥1 plan de precios y ≥1 clase
  activa futura; además del set base propuesto.
- La aprobación es sticky: editar post-aprobación no re-revisa.
- Backfill: existentes → APPROVED; las 2 academias de prueba del
  usuario quedan PENDING para probar el flujo.
