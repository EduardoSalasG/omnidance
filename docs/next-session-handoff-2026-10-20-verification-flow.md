# Handoff — 2026-10-20 (fix actor verification flow + uploads en prod)

**Rama**: `dev` · **Commit**: fix actor verification flow (sin push).
**Motivación**: reporte de prod — academia nueva "en revisión" sin poder
completar: foto rota, checklist admin pedía email verificado + datos del
actor, y el usuario no veía qué le faltaba.

## Qué quedó hecho

- **Deadlock `emailVerified` resuelto**: cuentas con password nacían sin
  `verifiedAt` y ningún flujo lo completaba (solo magic link/OTP lo
  estampan) → el checklist admin era imposible de aprobar. Ahora:
  - `POST /auth/register` envía el correo de acceso (link+OTP) además
    de la bienvenida — funciona como verificación de posesión.
  - `POST /auth/resend-verification` (SessionGuard + throttle auth):
    reenvía el correo si `verifiedAt` es null; idempotente.
  - `PendingRoleCard` (`components/people/`): con PersonRole PENDING de
    ACADEMY_OWNER/PRODUCER muestra el checklist (nombre real, email
    verificado, teléfono, datos del actor) con links por ítem; el email
    se verifica inline (resend → OTP). Montada en `/perfil` y `HomeHub`
    (lentes owner y productor).
  - `GET /me/role-checks` en PeopleController devuelve el checklist al
    dueño — `roleProfileChecks` extraído a `src/common/role-checks.ts`
    y reusado por `AdminController` (misma verdad, sin duplicar).
- **Foto**: `cleanPhotoUrl` acepta paths `/api/...` (el PATCH de
  settings rechazaba el `photoUrl` que el propio upload persistía —
  guardar perfil tras subir foto siempre 400).
- **Uploads en prod**: `apps/api/docker-compose.yml` ahora declara
  `volumes: /mnt/omnidance/uploads:/app/uploads` + `UPLOADS_DIR` — el
  workflow re-copia ese compose a la VM en cada deploy, así que el
  mount manual del usuario se pisaba; versionado ya no. `docs/ci-cd.md`
  actualizado con la ruta real.
- **OpenSpec**: `fix-actor-verification-flow` archivado — specs
  `auth/email-verification` (nueva), `rbac` (+checklist visible al
  actor), `academies/approval-gate` (photoUrl acepta /api/…).

## Verificación

- Specs vitest: auth.controller 14 ✓, people.controller 32 ✓,
  academies-photo-url 4 ✓ (todos RED→GREEN).
- `npx tsc --noEmit` limpio en api y web. ESLint de archivos tocados:
  0 errores (3 warnings pre-existentes en HomeHub).
- `openspec validate --changes` verde; archive aplicó deltas a specs.

## Pendiente / ojo prod

- **Regenerar docs API**: `node apps/api/scripts/export-api-docs.cjs`
  con API viva → `docs/openapi.json` + postman (2 endpoints nuevos:
  `/auth/resend-verification`, `/me/role-checks`). No se corrió aquí
  porque requiere stack levantado.
- **Cuenta del usuario en prod**: quedó con `verifiedAt` null — tras
  deployar, puede reenviarse el correo desde la card y verificar; o un
  admin le manda magic link. Su foto rota era archivo en capa del
  contenedor pre-mount → hay que **volver a subirla** (el bind mount ya
  persiste). Su `actorData` fallaba porque la academia no existía —
  ahora la card le muestra el link "Datos del actor" → `/academia`.
- **Deploy**: el próximo deploy a main llevará el compose con volumen —
  verificar que `/mnt/omnidance/uploads` existe en la VM (ya creado por
  el usuario) y que el `.env` no contradice `UPLOADS_DIR`.
- Suite completa `pnpm --filter @omnidance/api test` no corrida entera
  (solo los 3 specs tocados); correr antes del release.
