# Tasks: organic-acquisition-source

- [x] 1. Schema + migración: `Person.acquisitionSource String?`,
  `Person.acquisitionDetail Json?`, `AuthOtp.acquisition Json?` →
  `pnpm db:migrate`
- [x] 2. API: `AcquisitionInput` + `resolveAcquisition()` (helper de
  normalización); `ports.ts` (upsertByEmail/createWithPassword/
  createOtp/AuthOtpRecord); `prisma-auth.repo.ts` (registerPerson
  escribe columnas + person.registered data); `auth.service.ts`
  (claim en token + fila OTP, verify lo devuelve);
  `auth.controller.ts` (`AcquisitionDto` en `ConsentField`,
  register/magic-link/verify/otpVerify cablean)
- [x] 3. Web: `lib/acquisition.ts` (capture first-touch +
  readAcquisition), `acquisition-capture.tsx` en layout (marketing),
  `login-form.tsx` adjunta `acquisition` en register y magic-link
- [x] 4. Tests: spec API (register con acq → columnas; verify nuevo
  con claim → columnas; existente no pisa; OTP path), test
  `lib/acquisition` (capture utm/referrer/direct, first-touch)
- [x] 5. Docs: `docs/architecture.md` (auth), `docs/qa-flows-inventory.md`
  (alta), `docs/estrategia-comercial-2026-10-22.md` §7 item 5
- [x] 6. Verificación: typecheck api+web, tests nuevos,
  `openspec validate --changes`
