# Change: admin-notify-on-register

## Why

Hoy el registro de usuarios es invisible para el equipo: una Person
nueva solo se detecta mirando la DB o las analíticas. El admin necesita
enterarse en el momento — mismo canal que ya usa `lead.new` (centro de
notificaciones in-app + push), sin email aparte ni panel nuevo.

## What Changes

- **`NotificationsModule` → `@Global()`**: patrón ya usado por
  `JobsModule`/`StorageModule` para servicios transversales. Permite
  inyectar `NotificationsService` en `AuthController` sin crear ciclo
  (`NotificationsModule` ya importa `AuthModule` por SessionGuard).
- **`AuthController`**: helper privado `notifyAdminsNewUser(person)` —
  busca `personRole {role:"ADMIN", status:"APPROVED"}` y manda
  `notifySafe` category `OPERATIONAL`, type `user.registered`, con
  nombre + email. Best-effort: un fallo nunca rompe el alta.
- Se dispara **solo cuando nace una cuenta real**:
  - `POST /auth/register` (alta con password).
  - `GET /auth/verify` y `POST /auth/otp/verify` cuando `!existed`
    (alta por magic link / OTP — el claim de cuenta pre-sembrada ya
    existe y no notifica).
- Altas iniciadas por admin (import de alumnos, staff, cuenta demo de
  lead, reactivación) NO notifican — no son registro del usuario.

## Out of scope

- Notificación por email al admin (el centro in-app + push basta).
- Altas bulk (imports) — ruido, quedan en auditoría como hoy.
