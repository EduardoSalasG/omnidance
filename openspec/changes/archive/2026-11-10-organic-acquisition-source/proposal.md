# Proposal: organic-acquisition-source

## Why

El CAC por actor (estrategia §7 item 5) solo mide el canal de
invitación (`Referral` INVITE + `data.channel` en el consume). Las
altas orgánicas — registro directo desde una landing sin invite —
no registran fuente: no se puede responder "¿de dónde vienen los
registros no invitados?" ni costear un canal.

## What Changes

- **Captura web**: un capture first-touch persiste en la primera
  landing visitada los `utm_source|medium|campaign|content|term`,
  el `document.referrer` externo y el path de entrada en
  `localStorage["omnidance:acq"]` (componente del layout
  (marketing)); el form de registro/magic-link lo adjunta al body.
- **Contrato API**: `AcquisitionDto` (`{utmSource?, utmMedium?,
  utmCampaign?, utmContent?, utmTerm?, referrer?, landingPath?}`,
  todo opcional) viaja en `POST /auth/register` y `POST
  /auth/magic-link` (claim del magic token y fila del OTP, igual que
  `role`/`consent`/`next`).
- **Persistencia**: `Person.acquisitionSource String?` (canal
  normalizado: `utm:<source>` | `ref:<host>` | `landing:<path>` |
  `direct`) + `Person.acquisitionDetail Json?` (capture crudo). Se
  escribe solo en el alta (`register`, `verify`, `otp/verify` con
  persona nueva); una cuenta existente nunca lo pisa. La
  normalización la hace el servidor (el cliente solo reporta).
- **Línea de vida**: `person.registered` lleva `data.acquisitionSource`
  además de `data.via`.
- **`AuthOtp.acquisition Json?`** para que el camino OTP tenga el
  mismo dato que el token JWT.
- Migración versionada (db:migrate), tests API + web, docs
  (architecture, qa-flows-inventory, estrategia §7.5).

## Impact

- Specs: nueva capability `auth/acquisition-source` (ADDED).
- Código: `prisma/schema.prisma` + migración,
  `auth/domain/{ports,auth.service}.ts`,
  `auth/infrastructure/{prisma-auth.repo,auth.controller}.ts`,
  `apps/web/src/lib/acquisition.ts` + `acquisition-capture.tsx`
  (nuevos), `(marketing)/layout.tsx`, `login-form.tsx`.
- Sin breaking changes: campos opcionales, columnas nullable.
