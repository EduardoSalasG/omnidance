# Tasks - admin-user-delete

- [x] `DELETE /admin/users/:personId` en `admin.controller.ts`:
  guard self-delete (400), 404, transacción con las 9 FKs a Person,
  audit `USER_DELETE`.
- [x] e2e en `test/admin.e2e.spec.ts`: 401 sin sesión, 403 sin admin,
  400 self-delete, 404 fantasma, cascada real + email liberado.
- [x] `/admin/usuarios/[personId]`: card zona de peligro + confirm +
  redirect; keys `admin.users.delete.*`.
- [x] Verificación: `pnpm --filter @omnidance/api test`,
  `tsc --noEmit` web, i18n audit.
