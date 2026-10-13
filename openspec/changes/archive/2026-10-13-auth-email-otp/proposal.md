## Why

Los usuarios que instalan la PWA quedan fuera del flujo magic-link: el correo
abre el navegador del sistema, la cookie de sesión cae en el browser y la app
instalada sigue deslogueada (en iOS los links nunca abren la home-screen app;
en Android depende de cómo se instaló). Un código OTP tipeado dentro de la app
resuelve el login post-instalación y el caso cross-device (pides acceso en PC,
lo usas en el teléfono).

## What Changes

- El email de acceso (`magicLinkEmailHtml`) muestra además un **código de 6
  dígitos** destacado; el link sigue funcionando igual (híbrido, no reemplazo).
- Nuevo endpoint `POST /auth/otp/verify {email, code}` que entrega sesión
  (`{ok:true}` + cookie `omnidance_session`) igual que `GET /auth/verify` pero
  sin redirect — lo consume la app desde su propia superficie.
- OTP con **single-use real y contador de intentos**: se persiste hasheado
  (`AuthOtp`: email, codeHash, expiresAt, attempts, consumedAt), TTL ~10 min,
  máx ~5 intentos, borrado/marcado al éxito. No JWT (un JWT no es revocable
  ni single-use).
- Login front gana el paso "ingresa el código" tras enviar el email, con la
  opción de abrir el link como alternativa.
- El `consent` del form viaja asociado al OTP igual que hoy viaja en el claim
  del magic token: al verificar el código se estampa en la Person.
- Rate limiting: reutiliza `AUTH_THROTTLE` en emisión y un contador de fallos
  por email+IP en verify (mismo patrón que `/auth/login`).

## Capabilities

### New Capabilities

- `auth/email-otp`: verificación de acceso por código OTP de un solo uso
  enviado por email, complementaria al magic link (emisión, verificación,
  expiración, intentos, consent, onboarding de cuenta nueva vía upsert).

### Modified Capabilities

- (ninguna — el magic link existente no cambia de contrato; `GET
  /auth/verify` sigue igual. `legal-consent` no se modifica: el consent se
  estampa al crear sesión, igual que hoy.)

## Impact

- API: `auth.controller.ts`, `auth.service.ts`, `emails.ts`,
  `prisma-auth.repo.ts`, `ports.ts`; nuevo modelo `AuthOtp` en
  `schema.prisma` + migración versionada.
- Web: flujo de login (`(marketing)/login` o el gate de sesión que lo
  invoque) + i18n `es-CL`.
- Emails: mismo canal Resend (~100/día gratis) — un OTP por envío, sin costo
  extra.
- Docs: regenerar `docs/openapi.json` + postman (nuevo endpoint);
  `docs/architecture.md` si describe el flujo de auth.
