# Tasks — auth-email-otp

## 1. Datos

- [x] 1.1 Modelo `AuthOtp` en `apps/api/prisma/schema.prisma` + `pnpm
  db:migrate` (migración versionada, no db:push) — verifica: migración
  `20261102000000_auth_otp` aplicada vía `migrate deploy`, `prisma
  generate` OK

## 2. Dominio (TDD primero)

- [x] 2.1 Tests `auth.service.spec.ts`: createOtp invalida activos previos;
  verifyOtp éxito/expirado/consumido/5 intentos; hash nunca en claro —
  25 tests auth verdes
- [x] 2.2 `AuthService.createOtp`/`verifyOtp` + repo methods
  (`createOtp`, `consumeActives`, `findActiveOtp`, `bumpAttempts`,
  `consumeOtp`) en `ports.ts` + `prisma-auth.repo.ts`

## 3. Controller + email

- [x] 3.1 `POST /auth/otp/verify` (DTO `{email, code}`, `AUTH_THROTTLE`,
  401 uniforme, `{ok:true, isNew}`) — spec del controller actualizado
- [x] 3.2 `sendMagicLink` emite OTP y `magicLinkEmailHtml(link, code)`
  muestra el código destacado — el claim-path de `register` lo hereda

## 4. Front

- [x] 4.1 Login: paso "ingresa el código" post-envío (input 6 dígitos,
  `one-time-code`, submit a `/api/auth/otp/verify`, redirect por `isNew`)
  + keys i18n `es-CL`

## 5. Integración (orquestador)

- [x] 5.1 `openspec validate --changes` verde (4/4); typecheck api+web;
  tests auth 25/25; smoke E2E real: magic-link → código recuperado →
  `otp/verify` 200 + cookie + single-use 401
- [x] 5.2 `docs/openapi.json` + postman regenerados (280 paths);
  `docs/architecture.md` actualizado (módulo auth, consent, throttle)
