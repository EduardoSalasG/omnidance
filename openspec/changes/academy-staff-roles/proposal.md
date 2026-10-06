# academy-staff-roles

## Why

Dos necesidades del negocio:

1. **La academia necesita delegar**: hoy solo el owner (`Academy.ownerId`)
   administra cobros, alumnos, planes, horarios y perfil; el instructor solo
   ve detalle + asistencia (`requireManage` vs `requireAdminister`). El
   usuario pide un rol "administrativo" con **permisos parametrizables** —
   en la práctica 1-2 colaboradores con distintos alcances (ej: uno cobra,
   otro arma horarios).
2. **Auditoría de cobros**: `PaymentClaim.reviewedById/reviewedAt` ya se
   guardan pero no se exponen — cuando hay varias personas validando pagos
   el owner no puede ver quién aprobó/rechazó cada comprobante.

## What Changes

- `AcademyStaff` (nuevo): colaborador de la academia con capacidades
  granulares por flag — `canStudents` (alumnos/enrollments/asistencia),
  `canPayments` (claims + métodos de pago + payouts), `canPlans` (planes),
  `canSchedule` (series/slots/clases), `canProfile` (perfil público),
  `canTeam` (gestionar colaboradores), `canBilling` (suscripción SaaS de la
  academia). El owner siempre puede todo (implícito, no necesita fila).
- **Acceso por capacidad** (`AcademyAccess`): nueva
  `requireCapability(academyId, person, cap)` + `requireCapabilityWrite` —
  pasa si es owner, ADMIN, o staff con ese flag. Los ~45 call sites de
  `requireAdminister(Write)` se remapean a su capacidad: claims/métodos →
  `payments`; enrollments/alumnos/asistencia → `students`; planes → `plans`;
  series/slots/clases → `schedule`; settings/perfil → `profile`;
  instructores (commission) → `team`; billing de academia → `billing`;
  dashboard → `requireStaff` (cualquier flag u owner/ADMIN).
  `requireManage` (instructor) y `requireAdminister` no cambian su
  semántica (owner/ADMIN) — los endpoints que no se remapeen siguen
  owner-only.
- **Mantenedor de equipo**: `GET/POST/PATCH/DELETE /academies/:id/staff`
  gated por `team`. Agregar por email: si la Person no existe se crea
  stub `{email, name}` y se envía **email de invitación** con magic link
  (token con TTL extendido, ej. 7d — el token actual dura ~15min). Un
  staff con `team` no puede quitarse a sí mismo ni modificar al owner
  (el owner no es una fila staff).
- **`GET /academies/:id/access`**: resuelve el acceso del viewer
  `{isOwner, isStaff, caps}` para que la consola oculte secciones sin
  permiso (navegación honesta, no solo 403).
- **Auditoría de cobros**: `GET /academies/:id/claims` devuelve
  `reviewedBy {id, name}` + `reviewedAt` (relación `PaymentClaim.reviewedBy`
  → `Person` nueva en schema, sin migración de datos); la cola de
  `/academia/cobros` muestra quién revisó cada claim terminal.
- UI: nueva sección `/academia/equipo` (mantenedor con toggles por
  capacidad + invitación por email) y columna "Revisado por" en cobros.

## Non-goals

- No se cambia el RBAC global (`Role`/`Permission` de plataforma) — las
  capacidades son **por academia**, no roles de plataforma.
- El instructor sigue existiendo aparte (commissionPct, asistencia) — un
  staff no es instructor y viceversa.
- Sin transferencia de ownership ni multi-owner.

## Impact

- Schema: `AcademyStaff` nuevo + relación `PaymentClaim.reviewedBy` →
  `Person` (FK nullable, sin migración de datos).
- API: ~45 call sites remapeados a capacidades; 5 endpoints nuevos.
- Web: página `/academia/equipo` + columna en cobros + gating de nav.
- Emails: nueva plantilla de invitación; `createMagicToken` acepta TTL.
