# Proposal; login-consent-on-create

## Why

El checkbox "acepto términos y condiciones" se exige en cada magic
link (modo `magic` de /login), así el usuario con cuenta existente lo
marca en CADA login. El consentimiento solo es legalmente necesario
cuando la acción crea la Person: magic link sobre email sin cuenta.
Hoy el backend no lo obliga; depende del checkbox del front.

## What Changes

- **Backend**: `POST /auth/magic-link` responde `consent_required`
  (400) cuando el email no tiene cuenta y `consent !== true` - no
  genera token ni OTP. Cuenta existente: procede igual con
  `consent: false`.
- **Frontend** (`login-form.tsx`): modo magic oculta el checkbox
  por defecto y no lo exige al submit; si la API responde
  `consent_required` revela el checkbox + mensaje y reintenta con
  `consent: true`. Modos password y register sin cambios.

## Fuera de scope

- `POST /auth/register` y `POST /auth/otp/verify`/`GET /auth/verify`:
  el gate al pedir el link cubre el alta; el token/OTP ya viaja con
  consent.
