## Why

El pipeline de aprobación de actores (ACADEMY_OWNER/PRODUCER) tiene un
deadlock en producción: una cuenta registrada con email+password nunca
verifica su correo (`verifiedAt` solo se estampa vía magic link/OTP), el
checklist admin exige `emailVerified` y rechaza con 409, y el usuario ve
solo "En revisión" sin saber qué completar. Además la foto hosteada se
rompe por dos motivos: el `photoUrl` relativo `/api/...` es rechazado por
`cleanPhotoUrl` al guardar el perfil, y el volumen de uploads no está
versionado en el compose de prod (se pierde en cada deploy).

## What Changes

- **Verificación de email para cuentas con password**: `POST
  /auth/register` emite además el correo de acceso (magic link + OTP)
  como verificación; nuevo `POST /auth/resend-verification`
  (SessionGuard + throttle auth) reenvía el correo cuando la persona ya
  tiene sesión y `verifiedAt` es null.
- **Checklist visible para el actor PENDING**: `GET /me/role-checks`
  devuelve por cada rol PENDING usable (ACADEMY_OWNER/PRODUCER) el mismo
  checklist que evalúa el admin (nombre, email verificado, teléfono,
  datos del actor); `profileChecks` se extrae a módulo compartido.
  Nueva card `PendingRoleCard` en `/perfil` y en el HomeHub con los
  ítems faltantes enlazados a su resolución (perfil/datos, consola del
  actor, y CTA "verificar correo" con flujo OTP inline).
- **photoUrl hosteado**: `cleanPhotoUrl` acepta paths `/api/...`
  (streams propios de uploads) además de URLs externas; subir foto ya
  no rompe el guardado del perfil de academia.
- **Infra**: `apps/api/docker-compose.yml` declara el bind mount
  `/mnt/omnidance/uploads:/app/uploads` + `UPLOADS_DIR` para que el
  deploy no pise el volumen configurado en la VM.

## Capabilities

### New Capabilities

- `auth/email-verification`: prueba de posesión del correo para cuentas
  creadas con password (emisión post-register, reenvío autenticado,
  verificación por link u OTP, prompt en-app para correos sin verificar).

### Modified Capabilities

- `rbac`: el actor con rol PENDING SHALL ver su propio checklist de
  validación (qué le falta para ser aprobado); mismo criterio que la
  cola admin; vía `GET /me/role-checks` + card en la app.
- `academies/approval-gate`: el requisito de `photoUrl` se amplía para
  aceptar paths hosteados `/api/...` (foto subida por upload) además de
  URLs externas.

## Impact

- `apps/api/src/auth/infrastructure/auth.controller.ts` (+spec), nuevo
  módulo compartido de checks de rol, `people.controller.ts`,
  `admin.controller.ts` (usa el helper extraído),
  `academies.controller.ts` (`cleanPhotoUrl` + spec).
- `apps/web`: nuevo componente `PendingRoleCard` + flujo OTP inline,
  montaje en `/perfil` y `HomeHub`; i18n en 4 locales.
- `apps/api/docker-compose.yml` + `docs/ci-cd.md` (volumen versionado,
  ruta real `/mnt/omnidance/uploads`).
- `docs/qa-flows-inventory.md` (flujos de verificación y checklist).
