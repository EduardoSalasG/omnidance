# Proposal — multipais-phone

## Why

`Person.phoneCountryCode` existe en el schema desde multipais-foundation
pero **nada lo lee ni lo escribe**. La validación actual es un regex
genérico (`/^\+?[0-9]{8,15}$/`) que asume +56 en los flujos de puerta,
y `Person.phone` es `@unique` sin normalización — el mismo número
ingresado como `+56912345678` y `912345678` genera dos `Person`
distintas. Para operar fuera de Chile el teléfono debe normalizarse a
E.164 con país explícito en cada write path.

## What Changes

- **`libphonenumber-js`** como motor de validación/normalización (api +
  web, vía helper compartido en `@omnidance/shared`).
- **Helper único** `normalizePhone(raw, defaultCountry)` →
  `{ e164, countryCode }`: `+` inicial parsea E.164 (el país sale del
  número); sin `+` interpreta formato nacional con `defaultCountry`.
- **Storage canónico**: `Person.phone` = E.164 (`+…`, conserva el
  `@unique` y cierra el duplicado `+56…` vs `9…`),
  `Person.phoneCountryCode` = ISO-2 derivado.
- **Write paths normalizados**: `PATCH /me`, `POST /me/complete-profile`,
  `POST /checkins/door-sale` (cuenta ligera), `POST /leads`, import CSV
  de alumnos (`telefono`). Todos aceptan `phoneCountryCode` opcional
  como hint del país cuando el número viene en formato nacional.
- **UI**: `PhoneInput` compartido (selector de país + número nacional).
  Perfil/datos y completar-perfil muestran el selector; puerta y lead
  form asumen el país del contexto (venue → país del evento; lead → CL)
  con override por `+` — sin fricción nueva en el flujo de 5 segundos.
- **Migración**: backfill `phoneCountryCode='CL'` + normalización E.164
  de `phone` en filas existentes (todas son +56 implícitas).

## Capabilities

### New Capabilities

- `platform-multicountry`: regla global de normalización de teléfono
  (complementa los requirements de `multipais-foundation` y del change
  hermano `multipais-currency`).

### Modified Capabilities

- `people-profile`: `PATCH /me` valida y normaliza a E.164 por país;
  el 409 `phone_exists` sigue igual pero sobre el E.164.
- `checkins/door-sale`: la cuenta ligera resuelve el país por venue
  con override `+`; nunca duplica por variante de formato.
- `academies/bulk-import`: la columna `telefono` se normaliza a E.164
  con el país de la academia como default.

## Impact

- **Deps nuevas**: `libphonenumber-js` (shared + web; la api lo consume
  vía shared). ~140KB en bundle — aceptable, metadata completa.
- **API**: `people.controller`, `checkins.controller` +
  `prisma-checkins.repo`, `leads.controller`, `academy-import.service`.
- **Web**: `PhoneInput` nuevo en `components/ui` o `components/people`;
  superficies `/perfil/datos`, `/perfil/completar`, `/bienvenida`,
  door-sale del staff, `ProLeadForm`.
- **Schema**: sin columnas nuevas — solo migración de datos (backfill).
- **Fuera de scope**: login por teléfono/OTP-SMS, verificación de
  teléfono, cambio de `Academy.whatsapp` (ya es E.164 sin `+`).
