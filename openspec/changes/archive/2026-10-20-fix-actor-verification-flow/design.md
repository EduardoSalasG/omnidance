# Design — fix-actor-verification-flow

## Decisiones

- **`profileChecks` compartido**: el checklist admin vive hoy como método
  privado de `AdminController`. Se extrae a
  `apps/api/src/common/role-checks.ts` (función pura) y lo consumen
  `AdminController` y `PeopleController` — misma verdad, sin duplicar.
- **`GET /me/role-checks`**: endpoint ligero en `PeopleController`
  (SessionGuard). Devuelve `{ role, checks, complete }[]` solo para
  PersonRole PENDING en `PENDING_USABLE_ROLES`. Conteos por `groupBy`
  (mismo patrón que `validationQueue`, sin N+1).
- **Verificación de email**: se reusa toda la maquinaria existente —
  `sendMagicLink(email, consent, role)` emite link+OTP y los endpoints
  `GET /auth/verify` / `POST /auth/otp/verify` ya estampan `verifiedAt`
  vía `upsertByEmail`. Lo nuevo es solo:
  - `POST /auth/register` llama `sendMagicLink` tras crear la cuenta
    (best-effort como el welcome — el alta nunca falla por correo).
  - `POST /auth/resend-verification` (SessionGuard, AUTH_THROTTLE):
    si `verifiedAt` ya está → `{ ok: true, alreadyVerified: true }`;
    si no → `sendMagicLink` y `{ ok: true }`.
- **Card UI** (`PendingRoleCard`, client component): lee `useMe()` —
  si hay PersonRole PENDING en `roleStates`, fetchea `/me/role-checks`
  y lista los checks `false` con link/CTA. `emailVerified` usa CTA
  inline: botón → `POST /auth/resend-verification` → input OTP de 6
  dígitos → `POST /auth/otp/verify` → `refresh()` de `/me`. Se monta en
  `/perfil` (junto a los badges de rol) y en `HomeHub` (arriba del
  contenido de la lente, cubre ACADEMY_OWNER y PRODUCER PENDING).
- **`cleanPhotoUrl`**: si el valor empieza por `/api/` se devuelve tal
  cual (path hosteado propio); si no, la validación URL externa actual.
- **Compose prod**: `volumes: - /mnt/omnidance/uploads:/app/uploads` +
  `UPLOADS_DIR=/app/uploads` en `environment` — versionado, ya no lo
  pisa el deploy (la VM ya usa esa ruta exacta).

## Riesgos

- Doble correo en register (welcome + acceso): aceptable y estándar; el
  correo de acceso se presenta como "verifica tu correo".
- `upsertByEmail` en verify también toca `isDemoAccount` — cuentas
  normales no se ven afectadas (guard `pendingProfileAt`).
- OTP verify emite sesión nueva sobre la ya existente: cookie se
  re-setea igual — sin efecto adverso.
