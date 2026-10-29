# notifications/admin-alerts Specification

## Purpose
TBD - created by archiving change admin-notify-on-register. Update Purpose after archive.

## Requirements

### Requirement: Aviso a admins de registro nuevo

Cuando nace una `Person` por un flujo iniciado por el usuario; alta
con password (`POST /auth/register`) o primer acceso por magic
link/OTP (`GET /auth/verify`, `POST /auth/otp/verify` sobre un email
sin cuenta); el sistema SHALL crear una notificación `OPERATIONAL`
de tipo `user.registered` para cada `PersonRole` con `role:"ADMIN"`
y `status:"APPROVED"`, con nombre y email del registrado. El envío
SHALL ser best-effort (`notifySafe`): un fallo del centro de
notificaciones nunca rompe ni demora el alta.

El sistema SHALL NOT notificar en: claim de cuenta pre-sembrada o
existente, ni en altas iniciadas por un admin (import de alumnos,
alta de staff, cuenta demo de lead, reactivación).

#### Scenario: Registro con password

- **WHEN** un usuario se registra con email+password y nace la Person
- **THEN** cada admin APPROVED recibe notificación `user.registered`
  con su nombre y email, visible en el centro de notificaciones

#### Scenario: Primer acceso por magic link

- **WHEN** un email sin cuenta verifica un magic link o código OTP y
  el upsert crea la Person
- **THEN** los admins APPROVED reciben la misma notificación
  `user.registered`

#### Scenario: Cuenta existente no notifica

- **WHEN** un magic link/OTP verifica un email que ya tiene cuenta
  (login o claim de pre-sembrada)
- **THEN** no se crea ninguna notificación `user.registered`

#### Scenario: Centro caído no bloquea el alta

- **WHEN** `notifySafe` falla para algún admin durante un registro
- **THEN** el registro completa igual (sesión emitida, welcome enviado)
