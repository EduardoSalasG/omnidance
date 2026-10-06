# academies/staff-roles — deltas

## ADDED Requirements

### Requirement: Colaboradores con capacidades granulares

`AcademyStaff { academyId, personId, canStudents, canPayments, canPlans,
canSchedule, canProfile, canTeam, canBilling }` SHALL representar a un
colaborador delegado de la academia. `@@unique([academyId, personId])`.
El owner de la academia (`Academy.ownerId`) SHALL tener todas las
capacidades implícitamente sin necesitar una fila staff. ADMIN de
plataforma (`admin.access`) SHALL pasar cualquier check de capacidad.

Las capacidades SHALL mapear a familias de endpoints:

- `students` — enrollments (alta, PATCH vigencia, listado de alumnos),
  listados de asistencia.
- `payments` — cola/aprobación/rechazo de `PaymentClaim`, CRUD de
  `AcademyPaymentMethod`, stream de comprobantes, payouts.
- `plans` — CRUD de `MembershipPlan`.
- `schedule` — CRUD de `ClassSeries`, `ClassSlot`, clases manuales,
  videos de clase.
- `profile` — `PATCH /academies/:id/settings` (perfil público).
- `team` — mantenedor de colaboradores e instructores (incl.
  `commissionPct`).
- `billing` — suscripción SaaS de la academia (subscribe/cancel/pago).

#### Scenario: staff con flag pasa, sin flag 403

- **GIVEN** staff con `canPayments: true` y `canSchedule: false`
- **WHEN** llama `POST /academies/:id/claims/:c/approve` THEN pasa
- **WHEN** llama `POST /academies/:id/series` THEN recibe 403

#### Scenario: instructor no gana capacidades

- **GIVEN** un `AcademyInstructor` sin fila `AcademyStaff`
- **WHEN** llama un endpoint de capacidad THEN recibe 403
- **WHEN** llama un endpoint `requireManage` (asistencia) THEN pasa

### Requirement: Resolución de acceso del viewer

`GET /academies/:id/access` SHALL responder a cualquier usuario con
sesión `{isOwner, isInstructor, isStaff, caps:{students,payments,plans,
schedule,profile,team,billing}}` — owner y ADMIN devuelven todas las
caps en true. La consola lo usa para ocultar secciones sin permiso.

#### Scenario: staff ve solo sus capacidades

- **WHEN** un staff con solo `canStudents` consulta `/access`
- **THEN** recibe `caps.students=true`, resto false, `isStaff=true`

### Requirement: Mantenedor de equipo

Bajo `/academies/:id/staff` (capacidad `team`):

- `GET` SHALL listar colaboradores con nombre/email y sus flags.
- `POST {email, caps...}` SHALL: normalizar el email; si existe Person
  crear/actualizar la fila staff; si no existe crear Person stub
  `{email, name}` (name = parte local del email si falta) + fila staff +
  enviar email de invitación con magic link (TTL largo, ≥72h). Re-enviar
  a un email ya staff SHALL actualizar flags sin duplicar.
- `PATCH /:personId {caps...}` SHALL actualizar flags.
- `DELETE /:personId` SHALL eliminar la fila (el staff pierde acceso a la
  consola pero conserva su cuenta).
- Un staff con `team` SHALL NOT poder eliminarse ni editarse a sí mismo
  (evita auto-bloqueo del último gestor) — 400 `cannot_modify_self`.
  `academy.ownerId` SHALL NOT ser objetivo de DELETE/PATCH (no es fila).

#### Scenario: invitar email nuevo

- **WHEN** owner hace POST staff con email inexistente y `canPayments`
- **THEN** se crea Person stub + AcademyStaff y se envía email con link
  de acceso de larga duración; al verificar el link la persona entra con
  su cuenta y ve la consola con `payments` habilitado

#### Scenario: quitar colaborador

- **WHEN** owner hace DELETE sobre un personId staff
- **THEN** la fila se elimina y sus llamadas a endpoints de capacidad
  responden 403 de inmediato

### Requirement: Auditoría de revisión de cobros

`PaymentClaim.reviewedBy` SHALL ser relación a `Person` (nullable).
`GET /academies/:id/claims` SHALL incluir en cada claim terminal
(APPROVED/REJECTED) `reviewedBy:{id,name}`, `reviewedAt` y `reviewNote`.
La consola de cobros SHALL mostrar quién revisó cada claim.

#### Scenario: dos revisores distintos

- **GIVEN** staff A aprueba claim1 y staff B rechaza claim2
- **WHEN** el owner lista la cola
- **THEN** claim1 muestra a A como reviewer y claim2 muestra a B

### Requirement: Magic token de larga duración para invitaciones

`AuthService.createMagicToken(email, consent?, ttlSeconds?)` SHALL
aceptar un TTL explícito (default = comportamiento actual ~15min). Los
emails de invitación (staff y futuros imports de alumnos) SHALL usar
TTL ≥72h; el endpoint `GET /auth/verify` no cambia.

#### Scenario: link de invitación no expira en 15min

- **WHEN** se genera el link de invitación de staff
- **THEN** el token verifica correctamente a las 48h
