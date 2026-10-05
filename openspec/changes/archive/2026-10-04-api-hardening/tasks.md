# Tasks — api-hardening

- [x] Deps: `helmet` + `@nestjs/throttler` (versión compatible Nest 10,
      pinned, `pnpm --filter @omnidance/api add`)
- [x] `helmet()` en `main.ts` antes de otros middleware
- [x] `ThrottlerModule` global: default ~300/60s por IP; `APP_GUARD`
      `ThrottlerGuard`; `@Throttle` estricto en magic-link/login/
      register (~5-10/60s); `@SkipThrottle` donde corresponda
- [x] Límites por env (`THROTTLE_GLOBAL_LIMIT`/`THROTTLE_AUTH_LIMIT`)
      con defaults seguros; en `NODE_ENV=test` límite alto para no
      romper e2e
- [x] Spec: 429 con retry info; health/docs exentos si aplica
- [x] Tests: spec del guard/decoradores (puede ser unit del módulo +
      verificación de wiring); `tsc` + suite verde
- [x] `docs/architecture.md`: sección seguridad/throttling
