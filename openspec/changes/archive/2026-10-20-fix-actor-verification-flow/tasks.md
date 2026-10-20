# Tasks — fix-actor-verification-flow

- [x] 1. API: extraer `profileChecks` a `src/common/role-checks.ts` y usarlo en `AdminController` (mismo comportamiento)
- [x] 2. API: `GET /me/role-checks` en `PeopleController` — checks por PersonRole PENDING usable + spec test
- [x] 3. API: `POST /auth/resend-verification` (SessionGuard + throttle) + auto-envío del correo de acceso en `register` (best-effort) + specs
- [x] 4. API: `cleanPhotoUrl` acepta paths `/api/...` + spec
- [x] 5. Web: `PendingRoleCard` con links por check + flujo OTP inline (resend + verify + refresh); montar en `/perfil` y `HomeHub`
- [x] 6. i18n: keys nuevas en es-CL/en/fr/pt-PT
- [x] 7. Infra: bind mount uploads + `UPLOADS_DIR` en `apps/api/docker-compose.yml`; `docs/ci-cd.md` con la ruta real `/mnt/omnidance/uploads`
- [x] 8. Docs: `docs/qa-flows-inventory.md` (flujo verificación + checklist pendiente) + regenerar openapi/postman
- [x] 9. Verificación: `pnpm typecheck`, `pnpm --filter @omnidance/api test`, `pnpm lint`, `openspec validate --changes`
