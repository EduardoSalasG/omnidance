# Handoff; 2026-10-20 (fix actor verification flow + uploads en prod)

**Rama**: `dev` · **Commit**: fix actor verification flow (sin push).
**Motivación**: reporte de prod; academia nueva "en revisión" sin poder
completar: foto rota, checklist admin pedía email verificado + datos del
actor, y el usuario no veía qué le faltaba.

## Qué quedó hecho

- **Deadlock `emailVerified` resuelto**: cuentas con password nacían sin
  `verifiedAt` y ningún flujo lo completaba (solo magic link/OTP lo
  estampan) → el checklist admin era imposible de aprobar. Ahora:
  - `POST /auth/register` envía el correo de acceso (link+OTP) además
    de la bienvenida; funciona como verificación de posesión.
  - `POST /auth/resend-verification` (SessionGuard + throttle auth):
    reenvía el correo si `verifiedAt` es null; idempotente.
  - `PendingRoleCard` (`components/people/`): con PersonRole PENDING de
    ACADEMY_OWNER/PRODUCER muestra el checklist (nombre real, email
    verificado, teléfono, datos del actor) con links por ítem; el email
    se verifica inline (resend → OTP). Montada en `/perfil` y `HomeHub`
    (lentes owner y productor).
  - `GET /me/role-checks` en PeopleController devuelve el checklist al
    dueño; `roleProfileChecks` extraído a `src/common/role-checks.ts`
    y reusado por `AdminController` (misma verdad, sin duplicar).
- **Foto**: `cleanPhotoUrl` acepta paths `/api/...` (el PATCH de
  settings rechazaba el `photoUrl` que el propio upload persistía;
  guardar perfil tras subir foto siempre 400).
- **Uploads en prod**: `apps/api/docker-compose.yml` ahora declara
  `volumes: /mnt/omnidance/uploads:/app/uploads` + `UPLOADS_DIR`; el
  workflow re-copia ese compose a la VM en cada deploy, así que el
  mount manual del usuario se pisaba; versionado ya no. `docs/ci-cd.md`
  actualizado con la ruta real.
- **OpenSpec**: `fix-actor-verification-flow` archivado; specs
  `auth/email-verification` (nueva), `rbac` (+checklist visible al
  actor), `academies/approval-gate` (photoUrl acepta /api/…).

## Verificación

- Specs vitest: auth.controller 14 ✓, people.controller 32 ✓,
  academies-photo-url 4 ✓ (todos RED→GREEN).
- `npx tsc --noEmit` limpio en api y web. ESLint de archivos tocados:
  0 errores (3 warnings pre-existentes en HomeHub).
- `openspec validate --changes` verde; archive aplicó deltas a specs.

## Estado final (actualizado post-validación prod)

Releases deployadas: **v1.2.0** (feature principal), **v1.3.0**
(notificación al resolver rol + revalidación /me en foreground),
**v1.3.1** (error visible en upload), **v1.3.2** (bug folder duplicado
en photoUrl + rutas compat). Todo en `main` con tags, dev sincronizado.

- **Validado en prod por el usuario**: upload + visualización de foto OK
  tras v1.3.2. La ruta compat sirve los photoUrls ya guardados con el
  folder duplicado; no hay migración de datos necesaria (opcional:
  UPDATE de photoUrl a formato limpio, muy bajo valor).
- **Docs API**: openapi.json + postman regenerados desde prod (314
  paths) y commiteados a dev.
- **Cuenta del usuario**: rol aprobado por admin (funcionó), foto
  arreglada. Si quiere ver la notificación `role.approved` en vivo
  necesita una aprobación nueva (la suya fue pre-v1.3.0).
- **Brecha de cobertura**: no hay spec del notifySafe en approve/reject
  de admin.controller (controller grande sin spec propio).
- **Deuda leve**: swagger/postman ya OK; `qa-flows-inventory` no
  documenta el detalle del formato photoUrl (bugfix, no cambio de flujo).
