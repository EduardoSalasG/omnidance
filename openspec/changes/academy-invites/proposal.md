# academy-invites

## Why

Hoy la academia solo puede "invitar" gente creándole un enrollment
(stub + magic link acoplado al alta de alumno). El staff quiere
invitar a personas a registrarse en la plataforma sin inscribirlas:
la invitada se registra, busca la academia y se inscribe sola. Eso
convierte la invitación en canal de adquisición del dancer, no en
gestión de nómina.

## What Changes

- Nuevo `AcademyInvite` (academyId, email, nombre, invitedById,
  personId?, consumedAt, createdAt) con listado en la consola de la
  academia: invitados pendientes y registrados.
- `POST /academies/:id/invites` (cap students): email + nombre y
  apellido. Correo de invitación con magic link que tras el
  onboarding aterriza en el perfil de la academia invitante
  (`AuthOtp.next`).
- Correo ya registrado: se envía la invitación igual (magic link de
  login) y además notificación push al usuario existente.
- Al registrarse con el link: la invitación se marca consumida
  (`personId` + `consumedAt`), se crea `Referral` (source INVITE,
  referrer = quien invitó) y evento en `ActivityEvent`.
- Schema: `AcademyInvite` nuevo + `AuthOtp.next` (destino post-verify).

## Capabilities

### New Capabilities

- `academies/student-invites`: invitación de registro de la academia
  a personas sin enrollment, con seguimiento y atribución.

### Modified Capabilities

- `auth/email-otp`: el magic token/OTP puede llevar destino `next`
  respetado tras el verify (onboarding normal y luego a la página
  destino).

## Impact

- `apps/api`: `AcademyInvite` + endpoints create/list, `next` en
  magic token y verify (redirect post-onboarding), push al usuario
  existente, Referral + ActivityEvent al consumir.
- `apps/web`: form "Invitar" en `/academia/alumnos` + lista de
  invitados; i18n.
- `apps/api/prisma`: migración (`AcademyInvite`, `AuthOtp.next`).
- Docs: `qa-flows-inventory.md`, exports de API docs.
- Dependencia: `ActivityEvent` del change `trial-lifecycle-15d`
  (misma tanda; si se implementa primero este, emitir solo si la
  tabla existe).
