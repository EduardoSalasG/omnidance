# Tasks; login-consent-on-create

- [x] 1. Backend: gate en `POST /auth/magic-link` - email sin cuenta
  y `consent !== true` → 400 `consent_required` (sin token/OTP);
  cuenta existente pasa igual.
- [x] 2. Spec `auth.controller.spec.ts`: existente+sin consent → 200;
  nuevo+sin consent → 400 consent_required; nuevo+consent → 200.
- [x] 3. Front `login-form.tsx`: magic sin checkbox inicial; al
  `consent_required` revela checkbox + reintento.
- [x] 4. docs/qa-flows-inventory.md (login/magic flow) si aplica.
